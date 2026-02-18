/**
 * Test script — verify Gateway WS RPC from local machine via Tailscale.
 * 
 * Usage: npx tsx infra/test-gateway.ts
 */

import WebSocket from 'ws';

const GATEWAY_IP = '100.116.66.86';
const GATEWAY_PORT = 18789;
const GATEWAY_TOKEN = 'REDACTED_GATEWAY_TOKEN_2';

const url = `ws://${GATEWAY_IP}:${GATEWAY_PORT}`;
let seq = 0;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function sendRequest(ws: WebSocket, method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = `test-${++seq}`;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ type: 'req', id, method, params }));
        setTimeout(() => {
            if (pending.has(id)) {
                pending.delete(id);
                reject(new Error(`RPC timeout: ${method}`));
            }
        }, 15_000);
    });
}

async function main() {
    console.log(`\n🔌 Connecting to Gateway at ${url}...\n`);

    const ws = new WebSocket(url, {
        headers: {
            'Origin': `http://${GATEWAY_IP}:${GATEWAY_PORT}`,
        },
    });

    ws.on('error', (err) => {
        console.error('❌ Connection error:', err.message);
        process.exit(1);
    });

    let authenticated = false;

    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());

        // Handle challenge — Gateway sends this first, then we send connect
        if (msg.type === 'event' && msg.event === 'connect.challenge') {
            const nonce = msg.payload?.nonce;
            console.log('🔑 Got challenge nonce:', nonce);
            console.log('   Sending connect request with token auth...\n');

            // Send connect as an RPC request (method: "connect")
            sendRequest(ws, 'connect', {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                    id: 'openclaw-control-ui',
                    displayName: 'CloseClaw Proxy',
                    version: '0.0.1',
                    platform: 'linux',
                    mode: 'ui',
                },
                auth: { token: GATEWAY_TOKEN },
                role: 'operator',
                scopes: ['operator.admin'],
                caps: [],
            }).then((result) => {
                authenticated = true;
                console.log('✅ Authenticated!');
                console.log('   Response:', JSON.stringify(result, null, 2));
                runTests(ws);
            }).catch((err) => {
                console.error('❌ Auth failed:', err.message);
                ws.close();
                process.exit(1);
            });
            return;
        }

        // Handle RPC responses (ok/error frames)
        if (msg.id && pending.has(msg.id)) {
            const handler = pending.get(msg.id)!;
            pending.delete(msg.id);
            if (msg.ok === false) {
                handler.reject(new Error(msg.error?.message ?? JSON.stringify(msg)));
            } else {
                handler.resolve(msg.payload ?? msg);
            }
            return;
        }

        // Other events
        if (msg.type === 'event') {
            // Silence tick events
            if (msg.event !== 'tick') {
                console.log('📨 Event:', msg.event);
            }
        }
    });

    ws.on('open', () => {
        console.log('🔗 WS connected, waiting for challenge...');
    });

    ws.on('close', (code) => {
        if (!authenticated) {
            console.error(`❌ Disconnected before auth (code ${code})`);
            process.exit(1);
        }
    });
}

async function runTests(ws: WebSocket) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Running Gateway RPC Tests');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Test 1: health
    console.log('Test 1: health');
    try {
        const health = await sendRequest(ws, 'health');
        console.log('  ✅', JSON.stringify(health, null, 2).slice(0, 300));
    } catch (e) { console.error('  ❌', (e as Error).message); }

    // Test 2: config.get
    console.log('\nTest 2: config.get');
    let configHash = '';
    try {
        const config = await sendRequest(ws, 'config.get') as { config: unknown; hash: string };
        configHash = config.hash;
        console.log('  ✅ hash:', config.hash);
        console.log('  config gateway:', JSON.stringify((config.config as any)?.gateway, null, 2));
        console.log('  config session:', JSON.stringify((config.config as any)?.session, null, 2));
        console.log('  config channels:', JSON.stringify((config.config as any)?.channels, null, 2));
    } catch (e) { console.error('  ❌', (e as Error).message); }

    // Test 3: channels.status
    console.log('\nTest 3: channels.status');
    try {
        const status = await sendRequest(ws, 'channels.status');
        console.log('  ✅', JSON.stringify(status, null, 2));
    } catch (e) { console.error('  ❌', (e as Error).message); }

    // Test 4: config.patch — enable Telegram with dummy token
    console.log('\nTest 4: config.patch (enable Telegram with test token)');
    try {
        const patch = await sendRequest(ws, 'config.patch', {
            raw: JSON.stringify({
                channels: {
                    telegram: {
                        enabled: true,
                        botToken: 'TEST_TOKEN_12345:ABCDEF',
                        dmPolicy: 'open',
                        allowFrom: ['*'],
                    },
                },
            }),
            baseHash: configHash,
        });
        console.log('  ✅ patch result:', JSON.stringify(patch, null, 2).slice(0, 300));
    } catch (e) { console.error('  ❌', (e as Error).message); }

    // Test 5: verify config after patch
    console.log('\nTest 5: config.get (verify Telegram enabled)');
    try {
        const config2 = await sendRequest(ws, 'config.get') as { config: Record<string, unknown>; hash: string };
        configHash = config2.hash;
        const channels = (config2.config as any)?.channels;
        console.log('  ✅ channels:', JSON.stringify(channels, null, 2));
    } catch (e) { console.error('  ❌', (e as Error).message); }

    // Test 6: clean up — disable Telegram
    console.log('\nTest 6: config.patch (disable Telegram, clean up)');
    try {
        await sendRequest(ws, 'config.patch', {
            raw: JSON.stringify({
                channels: {
                    telegram: { enabled: false },
                },
            }),
            baseHash: configHash,
        });
        console.log('  ✅ Telegram disabled');
    } catch (e) { console.error('  ❌', (e as Error).message); }

    // Final verify
    console.log('\nTest 7: config.get (final verify)');
    try {
        const config3 = await sendRequest(ws, 'config.get') as { config: Record<string, unknown>; hash: string };
        const channels = (config3.config as any)?.channels;
        console.log('  ✅ channels:', JSON.stringify(channels, null, 2));
    } catch (e) { console.error('  ❌', (e as Error).message); }

    console.log('\n━━━ All tests complete ━━━\n');
    ws.close();
    setTimeout(() => process.exit(0), 1000);
}

main().catch(console.error);
