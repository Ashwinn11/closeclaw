/**
 * Gateway RPC Test Tool
 * 
 * Unified script for testing Gateway connectivity, config, and channels.
 * 
 * Usage:
 *   npx tsx infra/tests/gateway-test.ts health        — check health
 *   npx tsx infra/tests/gateway-test.ts config        — dump config
 *   npx tsx infra/tests/gateway-test.ts channels      — channels.status
 *   npx tsx infra/tests/gateway-test.ts add-telegram   — add Telegram channel
 *   npx tsx infra/tests/gateway-test.ts add-discord    — add Discord channel
 *   npx tsx infra/tests/gateway-test.ts add-slack      — add Slack channel
 *   npx tsx infra/tests/gateway-test.ts full           — run all checks
 */

import WebSocket from 'ws';

// ─── Configuration ───────────────────────────────────────────────────────────

const GATEWAY_IP = '100.116.66.86';
const GATEWAY_PORT = 18789;
const GATEWAY_TOKEN = 'REDACTED_GATEWAY_TOKEN_2';

const CHANNEL_TOKENS = {
    telegram: {
        botToken: '8503915225:AAH8MiCOAHSCUpk549OG9ZbLNLPNRtDiRRY',
    },
    discord: {
        token: 'REDACTED_DISCORD_TOKEN',
    },
    slack: {
        appToken: 'REDACTED_SLACK_APP_TOKEN',
        botToken: 'REDACTED_SLACK_BOT_TOKEN',
    },
};

// ─── WS Helper ───────────────────────────────────────────────────────────────

const url = `ws://${GATEWAY_IP}:${GATEWAY_PORT}`;

type Pending = Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;

function createConnection(): Promise<{ ws: WebSocket; rpc: (method: string, params?: Record<string, unknown>) => Promise<unknown>; close: () => void }> {
    let seq = 0;
    const pending: Pending = new Map();

    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url, {
            headers: { 'Origin': `http://${GATEWAY_IP}:${GATEWAY_PORT}` },
        });

        function rpc(method: string, params?: Record<string, unknown>): Promise<unknown> {
            const id = `r-${++seq}`;
            return new Promise((res, rej) => {
                pending.set(id, { resolve: res, reject: rej });
                ws.send(JSON.stringify({ type: 'req', id, method, params }));
                setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(`timeout: ${method}`)); } }, 15_000);
            });
        }

        ws.on('error', (e) => reject(e));

        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());

            // Challenge → authenticate
            if (msg.type === 'event' && msg.event === 'connect.challenge') {
                rpc('connect', {
                    minProtocol: 3, maxProtocol: 3,
                    client: { id: 'openclaw-control-ui', displayName: 'CloseClaw Test', version: '0.0.1', platform: 'linux', mode: 'ui' },
                    auth: { token: GATEWAY_TOKEN },
                    role: 'operator', scopes: ['operator.admin'], caps: [],
                }).then(() => {
                    resolve({ ws, rpc, close: () => ws.close() });
                }).catch(reject);
                return;
            }

            // RPC responses
            if (msg.type === 'res' && msg.id && pending.has(msg.id)) {
                const h = pending.get(msg.id)!;
                pending.delete(msg.id);
                msg.ok === false ? h.reject(new Error(msg.error?.message ?? 'RPC error')) : h.resolve(msg.payload);
            }
        });
    });
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function cmdHealth() {
    const gw = await createConnection();
    console.log('✅ Connected\n');

    const health = await gw.rpc('health') as Record<string, unknown>;
    console.log('━━━ Health ━━━');
    console.log('  ok:', (health as any).ok);
    console.log('  defaultAgentId:', (health as any).defaultAgentId);
    const ch = (health as any).channels ?? {};
    for (const [name, info] of Object.entries(ch)) {
        const i = info as any;
        console.log(`  channel ${name}: configured=${i.configured} running=${i.running} lastError=${i.lastError}`);
        if (i.probe?.bot) console.log(`    bot: @${i.probe.bot.username} (id: ${i.probe.bot.id})`);
    }
    gw.close();
}

async function cmdConfig() {
    const gw = await createConnection();
    console.log('✅ Connected\n');

    const config = await gw.rpc('config.get') as { config: Record<string, unknown>; hash: string };
    console.log('━━━ Config ━━━');
    console.log('  hash:', config.hash);
    console.log('  gateway:', JSON.stringify((config.config as any)?.gateway, null, 2));
    console.log('  session:', JSON.stringify((config.config as any)?.session, null, 2));
    console.log('  channels:', JSON.stringify((config.config as any)?.channels, null, 2));
    console.log('  agents.defaults.model:', JSON.stringify((config.config as any)?.agents?.defaults?.model, null, 2));
    gw.close();
}

async function cmdChannels() {
    const gw = await createConnection();
    console.log('✅ Connected\n');

    const status = await gw.rpc('channels.status') as any;
    console.log('━━━ Channels Status ━━━');
    console.log('  order:', status.channelOrder?.join(', ') || '(none)');
    for (const [name, info] of Object.entries(status.channels || {})) {
        const i = info as any;
        console.log(`\n  ${status.channelLabels?.[name] || name}:`);
        console.log(`    configured: ${i.configured}`);
        console.log(`    running: ${i.running}`);
        console.log(`    mode: ${i.mode || 'n/a'}`);
        console.log(`    tokenSource: ${i.tokenSource}`);
        console.log(`    lastError: ${i.lastError || 'none'}`);
        if (i.lastStartAt) console.log(`    lastStart: ${new Date(i.lastStartAt).toISOString()}`);
    }
    gw.close();
}

async function addChannel(channelName: string, channelConfig: Record<string, unknown>) {
    console.log(`\n━━━ Adding ${channelName} channel ━━━\n`);

    const gw = await createConnection();
    console.log('✅ Connected');

    // Get hash
    const config = await gw.rpc('config.get') as { config: Record<string, unknown>; hash: string };
    console.log('  current hash:', config.hash);

    const existingChannels = (config.config as any)?.channels || {};
    if (existingChannels[channelName]?.enabled) {
        console.log(`  ⚠️  ${channelName} already enabled, patching anyway...`);
    }

    // Patch
    const patch = await gw.rpc('config.patch', {
        raw: JSON.stringify({
            channels: {
                [channelName]: {
                    enabled: true,
                    dmPolicy: 'open',
                    allowFrom: ['*'],
                    ...channelConfig,
                },
            },
        }),
        baseHash: config.hash,
    });
    console.log('  ✅ Patch applied');

    // Gateway restarts after channel changes
    console.log('  ⏳ Waiting for Gateway restart (20s)...');
    gw.close();
    await new Promise(r => setTimeout(r, 20_000));

    // Reconnect and verify
    const gw2 = await createConnection();
    console.log('  ✅ Reconnected');

    const status = await gw2.rpc('channels.status') as any;
    const ch = status.channels?.[channelName];
    if (ch) {
        console.log(`\n  ${channelName}:`);
        console.log(`    configured: ${ch.configured}`);
        console.log(`    running: ${ch.running}`);
        console.log(`    mode: ${ch.mode || 'n/a'}`);
        console.log(`    lastError: ${ch.lastError || 'none'}`);
    } else {
        console.log(`  ❌ ${channelName} not found in channels.status`);
    }

    // Show all channels summary
    console.log('\n  All channels:');
    for (const [n, info] of Object.entries(status.channels || {})) {
        const i = info as any;
        console.log(`    ${n}: running=${i.running} error=${i.lastError || 'none'}`);
    }

    gw2.close();
    console.log(`\n✅ ${channelName} setup complete!`);
}

async function cmdFull() {
    console.log('═══════════════════════════════════════');
    console.log('  Full Gateway Test Suite');
    console.log('═══════════════════════════════════════\n');

    await cmdHealth();
    console.log('');
    await cmdConfig();
    console.log('');
    await cmdChannels();
    console.log('\n✅ All checks passed!');
}

// ─── Main ────────────────────────────────────────────────────────────────────

const command = process.argv[2] || 'full';

const commands: Record<string, () => Promise<void>> = {
    'health': cmdHealth,
    'config': cmdConfig,
    'channels': cmdChannels,
    'add-telegram': () => addChannel('telegram', CHANNEL_TOKENS.telegram),
    'add-discord': () => addChannel('discord', CHANNEL_TOKENS.discord),
    'add-slack': () => addChannel('slack', CHANNEL_TOKENS.slack),
    'full': cmdFull,
};

if (!commands[command]) {
    console.error(`Unknown command: ${command}`);
    console.error(`Available: ${Object.keys(commands).join(', ')}`);
    process.exit(1);
}

commands[command]()
    .then(() => { setTimeout(() => process.exit(0), 500); })
    .catch((e) => { console.error('❌', e.message); process.exit(1); });
