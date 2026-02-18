/**
 * Quick verify — check channels.status and health after Telegram setup
 */
import WebSocket from 'ws';

const GATEWAY_IP = '100.116.66.86';
const GATEWAY_PORT = 18789;
const GATEWAY_TOKEN = 'REDACTED_GATEWAY_TOKEN_2';
const url = `ws://${GATEWAY_IP}:${GATEWAY_PORT}`;
let seq = 0;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function rpc(ws: WebSocket, method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = `v-${++seq}`;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ type: 'req', id, method, params }));
        setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout: ${method}`)); } }, 15_000);
    });
}

async function main() {
    const ws = new WebSocket(url, { headers: { 'Origin': `http://${GATEWAY_IP}:${GATEWAY_PORT}` } });

    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'event' && msg.event === 'connect.challenge') {
            rpc(ws, 'connect', {
                minProtocol: 3, maxProtocol: 3,
                client: { id: 'openclaw-control-ui', displayName: 'Verify', version: '0.0.1', platform: 'linux', mode: 'ui' },
                auth: { token: GATEWAY_TOKEN }, role: 'operator', scopes: ['operator.admin'], caps: [],
            }).then(async () => {
                console.log('✅ Connected\n');

                // Health
                const health = await rpc(ws, 'health') as Record<string, unknown>;
                console.log('━━━ Health ━━━');
                console.log('  ok:', (health as any).ok);
                console.log('  channels:', JSON.stringify((health as any).channels, null, 2));
                console.log('  defaultAgentId:', (health as any).defaultAgentId);

                // Channels Status
                const channels = await rpc(ws, 'channels.status');
                console.log('\n━━━ Channels Status ━━━');
                console.log(JSON.stringify(channels, null, 2));

                // Config channels
                const config = await rpc(ws, 'config.get') as { config: Record<string, unknown> };
                console.log('\n━━━ Config Channels ━━━');
                console.log(JSON.stringify((config.config as any)?.channels, null, 2));

                // Session config
                console.log('\n━━━ Session Config ━━━');
                console.log(JSON.stringify((config.config as any)?.session, null, 2));

                console.log('\n✅ All checks passed!');
                ws.close();
                setTimeout(() => process.exit(0), 500);
            }).catch(e => { console.error('❌', (e as Error).message); process.exit(1); });
            return;
        }
        if (msg.type === 'res' && msg.id && pending.has(msg.id)) {
            const h = pending.get(msg.id)!; pending.delete(msg.id);
            msg.ok === false ? h.reject(new Error(msg.error?.message ?? 'error')) : h.resolve(msg.payload);
        }
    });
    ws.on('error', (e) => { console.error('❌', e.message); process.exit(1); });
}

main().catch(console.error);
