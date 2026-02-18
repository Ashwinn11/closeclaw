/**
 * Add Telegram channel to Gateway via config.patch
 */

import WebSocket from 'ws';

const GATEWAY_IP = '100.116.66.86';
const GATEWAY_PORT = 18789;
const GATEWAY_TOKEN = 'REDACTED_GATEWAY_TOKEN_2';
const TELEGRAM_BOT_TOKEN = '8503915225:AAH8MiCOAHSCUpk549OG9ZbLNLPNRtDiRRY';

const url = `ws://${GATEWAY_IP}:${GATEWAY_PORT}`;
let seq = 0;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function rpc(ws: WebSocket, method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = `t-${++seq}`;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ type: 'req', id, method, params }));
        setTimeout(() => {
            if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout: ${method}`)); }
        }, 15_000);
    });
}

async function main() {
    console.log('🔌 Connecting to Gateway...\n');
    const ws = new WebSocket(url, {
        headers: { 'Origin': `http://${GATEWAY_IP}:${GATEWAY_PORT}` },
    });

    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'event' && msg.event === 'connect.challenge') {
            console.log('🔑 Challenge received, authenticating...');
            rpc(ws, 'connect', {
                minProtocol: 3, maxProtocol: 3,
                client: { id: 'openclaw-control-ui', displayName: 'CloseClaw Test', version: '0.0.1', platform: 'linux', mode: 'ui' },
                auth: { token: GATEWAY_TOKEN },
                role: 'operator', scopes: ['operator.admin'], caps: [],
            }).then(async () => {
                console.log('✅ Authenticated\n');
                await runTelegramSetup(ws);
            }).catch((e) => { console.error('❌ Auth failed:', (e as Error).message); process.exit(1); });
            return;
        }

        if (msg.type === 'res' && msg.id && pending.has(msg.id)) {
            const h = pending.get(msg.id)!; pending.delete(msg.id);
            msg.ok === false ? h.reject(new Error(msg.error?.message ?? 'error')) : h.resolve(msg.payload);
            return;
        }

        if (msg.type === 'event' && msg.event !== 'tick') {
            console.log(`📨 Event: ${msg.event}`, msg.payload ? JSON.stringify(msg.payload).slice(0, 200) : '');
        }
    });

    ws.on('open', () => console.log('🔗 WS open'));
    ws.on('error', (e) => { console.error('❌', e.message); process.exit(1); });
}

async function runTelegramSetup(ws: WebSocket) {
    // 1. Get current config to get hash
    console.log('━━━ Step 1: Get current config ━━━');
    const config = await rpc(ws, 'config.get') as { config: Record<string, unknown>; hash: string };
    console.log('  hash:', config.hash);
    console.log('  current channels:', JSON.stringify((config.config as any)?.channels, null, 2) ?? 'none');

    // 2. Patch: enable Telegram
    console.log('\n━━━ Step 2: Enable Telegram channel ━━━');
    const patchResult = await rpc(ws, 'config.patch', {
        raw: JSON.stringify({
            channels: {
                telegram: {
                    enabled: true,
                    botToken: TELEGRAM_BOT_TOKEN,
                    dmPolicy: 'open',
                    allowFrom: ['*'],
                },
            },
        }),
        baseHash: config.hash,
    });
    console.log('  ✅ Patch applied:', JSON.stringify(patchResult, null, 2).slice(0, 500));

    // Wait for restart — Gateway restarts after channel config changes
    console.log('\n⏳ Waiting for Gateway to restart (channel changes trigger restart)...');

    // Close and wait, then reconnect
    ws.close();
    await new Promise(r => setTimeout(r, 10_000));

    // 3. Reconnect and verify
    console.log('\n━━━ Step 3: Reconnect and verify ━━━');
    const ws2 = new WebSocket(url, {
        headers: { 'Origin': `http://${GATEWAY_IP}:${GATEWAY_PORT}` },
    });

    const pending2 = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
    let seq2 = 0;

    function rpc2(method: string, params?: Record<string, unknown>): Promise<unknown> {
        const id = `v-${++seq2}`;
        return new Promise((resolve, reject) => {
            pending2.set(id, { resolve, reject });
            ws2.send(JSON.stringify({ type: 'req', id, method, params }));
            setTimeout(() => { if (pending2.has(id)) { pending2.delete(id); reject(new Error(`timeout: ${method}`)); } }, 15_000);
        });
    }

    ws2.on('message', (data2) => {
        const msg2 = JSON.parse(data2.toString());

        if (msg2.type === 'event' && msg2.event === 'connect.challenge') {
            rpc2('connect', {
                minProtocol: 3, maxProtocol: 3,
                client: { id: 'openclaw-control-ui', displayName: 'CloseClaw Verify', version: '0.0.1', platform: 'linux', mode: 'ui' },
                auth: { token: GATEWAY_TOKEN },
                role: 'operator', scopes: ['operator.admin'], caps: [],
            }).then(async () => {
                console.log('✅ Reconnected\n');

                // Check channels.status
                console.log('━━━ Channels Status ━━━');
                const status = await rpc2('channels.status');
                console.log(JSON.stringify(status, null, 2));

                // Check config
                console.log('\n━━━ Config Channels ━━━');
                const config2 = await rpc2('config.get') as { config: Record<string, unknown> };
                console.log(JSON.stringify((config2.config as any)?.channels, null, 2));

                console.log('\n✅ Done!');
                ws2.close();
                setTimeout(() => process.exit(0), 500);
            }).catch((e) => { console.error('❌', (e as Error).message); process.exit(1); });
            return;
        }

        if (msg2.type === 'res' && msg2.id && pending2.has(msg2.id)) {
            const h = pending2.get(msg2.id)!; pending2.delete(msg2.id);
            msg2.ok === false ? h.reject(new Error(msg2.error?.message ?? 'error')) : h.resolve(msg2.payload);
        }
    });
}

main().catch(console.error);
