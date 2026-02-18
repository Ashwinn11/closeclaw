/**
 * Add Discord channel to Gateway via config.patch
 */
import WebSocket from 'ws';

const GATEWAY_IP = '100.116.66.86';
const GATEWAY_PORT = 18789;
const GATEWAY_TOKEN = 'REDACTED_GATEWAY_TOKEN_2';
const DISCORD_BOT_TOKEN = 'REDACTED_DISCORD_TOKEN';

const url = `ws://${GATEWAY_IP}:${GATEWAY_PORT}`;
let seq = 0;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function rpc(ws: WebSocket, method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = `d-${++seq}`;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ type: 'req', id, method, params }));
        setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout: ${method}`)); } }, 15_000);
    });
}

async function main() {
    console.log('🔌 Connecting to Gateway...\n');
    const ws = new WebSocket(url, { headers: { 'Origin': `http://${GATEWAY_IP}:${GATEWAY_PORT}` } });

    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'event' && msg.event === 'connect.challenge') {
            rpc(ws, 'connect', {
                minProtocol: 3, maxProtocol: 3,
                client: { id: 'openclaw-control-ui', displayName: 'CloseClaw Setup', version: '0.0.1', platform: 'linux', mode: 'ui' },
                auth: { token: GATEWAY_TOKEN }, role: 'operator', scopes: ['operator.admin'], caps: [],
            }).then(async () => {
                console.log('✅ Authenticated\n');

                // Get current config hash
                const config = await rpc(ws, 'config.get') as { config: Record<string, unknown>; hash: string };
                console.log('Current channels:', JSON.stringify((config.config as any)?.channels, null, 2));
                console.log('Hash:', config.hash);

                // Patch: add Discord (keep existing Telegram)
                console.log('\n━━━ Adding Discord channel ━━━');
                const patch = await rpc(ws, 'config.patch', {
                    raw: JSON.stringify({
                        channels: {
                            discord: {
                                enabled: true,
                                token: DISCORD_BOT_TOKEN,
                                dmPolicy: 'open',
                                allowFrom: ['*'],
                            },
                        },
                    }),
                    baseHash: config.hash,
                });
                console.log('✅ Patch applied:', JSON.stringify(patch, null, 2).slice(0, 500));

                // Gateway will restart — wait then reconnect to verify
                console.log('\n⏳ Waiting for Gateway restart (20s)...');
                ws.close();
                await new Promise(r => setTimeout(r, 20_000));

                // Reconnect and verify
                console.log('\n━━━ Reconnecting to verify ━━━');
                await verify();
            }).catch(e => { console.error('❌', (e as Error).message); process.exit(1); });
            return;
        }
        if (msg.type === 'res' && msg.id && pending.has(msg.id)) {
            const h = pending.get(msg.id)!; pending.delete(msg.id);
            msg.ok === false ? h.reject(new Error(msg.error?.message ?? 'error')) : h.resolve(msg.payload);
        }
        if (msg.type === 'event' && msg.event !== 'tick') {
            console.log(`📨 Event: ${msg.event}`);
        }
    });
    ws.on('error', (e) => { console.error('❌', e.message); process.exit(1); });
}

async function verify() {
    const pending2 = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
    let seq2 = 0;
    const ws2 = new WebSocket(url, { headers: { 'Origin': `http://${GATEWAY_IP}:${GATEWAY_PORT}` } });

    function rpc2(method: string, params?: Record<string, unknown>): Promise<unknown> {
        const id = `v-${++seq2}`;
        return new Promise((resolve, reject) => {
            pending2.set(id, { resolve, reject });
            ws2.send(JSON.stringify({ type: 'req', id, method, params }));
            setTimeout(() => { if (pending2.has(id)) { pending2.delete(id); reject(new Error(`timeout: ${method}`)); } }, 15_000);
        });
    }

    ws2.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'event' && msg.event === 'connect.challenge') {
            rpc2('connect', {
                minProtocol: 3, maxProtocol: 3,
                client: { id: 'openclaw-control-ui', displayName: 'Verify', version: '0.0.1', platform: 'linux', mode: 'ui' },
                auth: { token: GATEWAY_TOKEN }, role: 'operator', scopes: ['operator.admin'], caps: [],
            }).then(async () => {
                console.log('✅ Reconnected\n');

                const status = await rpc2('channels.status') as any;
                console.log('━━━ All Channels ━━━');
                for (const [ch, info] of Object.entries(status.channels || {})) {
                    const i = info as any;
                    console.log(`  ${ch}: configured=${i.configured} running=${i.running} mode=${i.mode} lastError=${i.lastError}`);
                }

                const config = await rpc2('config.get') as { config: Record<string, unknown> };
                console.log('\n━━━ Config Channels ━━━');
                console.log(JSON.stringify((config.config as any)?.channels, null, 2));

                console.log('\n✅ Done!');
                ws2.close();
                setTimeout(() => process.exit(0), 500);
            }).catch(e => { console.error('❌', (e as Error).message); process.exit(1); });
            return;
        }
        if (msg.type === 'res' && msg.id && pending2.has(msg.id)) {
            const h = pending2.get(msg.id)!; pending2.delete(msg.id);
            msg.ok === false ? h.reject(new Error(msg.error?.message ?? 'error')) : h.resolve(msg.payload);
        }
    });
    ws2.on('error', (e) => { console.error('❌ Reconnect error:', e.message); process.exit(1); });
}

main().catch(console.error);
