import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../services/supabase.js';
import { createGatewayRpcClient } from '../services/gateway-rpc.js';
import fetch from 'node-fetch';
import { Agent } from 'node:https';

const ipv4Agent = new Agent({ family: 4 });


export const channelRoutes = new Hono();

/**
 * In dev mode (no GCP infra): skips instance claiming and Gateway RPC,
 * saves the connection directly to DB as active.
 */

/**
 * POST /api/channels/verify
 * Backend proxy for bot token verification (bypasses CORS)
 */
channelRoutes.post('/verify', async (c) => {
    try {
        const body = await c.req.json();
        const { channel, token } = body as { channel: string, token: string };

        console.log(`[verify] Verifying ${channel}...`);

        if (channel === 'telegram') {
            const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { agent: ipv4Agent });
            const data = await res.json() as any;
            if (res.ok && data.ok) {
                return c.json({
                    ok: true,
                    data: {
                        name: data.result.first_name,
                        username: `@${data.result.username}`,
                        id: String(data.result.id)
                    }
                });
            }
            return c.json({ ok: false, error: data.description || 'Telegram verification failed' }, 401);
        } else if (channel === 'discord') {
            const res = await fetch('https://discord.com/api/v10/users/@me', {
                headers: { Authorization: `Bot ${token}` },
                agent: ipv4Agent
            });
            const data = await res.json() as any;
            if (res.ok) {
                return c.json({
                    ok: true,
                    data: {
                        name: data.username,
                        username: `@${data.username}`,
                        id: data.id
                    }
                });
            }
            return c.json({ ok: false, error: data.message || 'Discord verification failed' }, 401);
        } else if (channel === 'slack') {
            const res = await fetch('https://slack.com/api/auth.test', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                agent: ipv4Agent
            });
            const data = await res.json() as any;
            console.log('[verify] Slack auth.test response:', data);

            if (res.ok && data.ok) {
                return c.json({
                    ok: true,
                    data: {
                        name: data.user || data.app_name || data.bot_id || 'Slack Bot',
                        username: data.team ? `Workspace: ${data.team}` : 'Slack Application',
                        id: data.user_id || data.bot_id || data.app_id || 'N/A'
                    }
                });
            }
            return c.json({ ok: false, error: data.error || 'Slack verification failed' }, 401);
        }
        return c.json({ ok: false, error: 'Unsupported channel for verification' }, 400);
    } catch (err) {
        console.error('[verify] Internal error:', err);
        return c.json({ ok: false, error: (err as Error).message || 'Verification service unreachable' }, 500);
    }
});

// All other channel routes require authentication
channelRoutes.use('*', authMiddleware);

channelRoutes.post('/setup', async (c) => {
    const userId = c.get('userId' as never) as string;
    const body = await c.req.json();
    const { channel, token, appToken, plan, ownerUserId } = body as {
        channel: 'telegram' | 'discord' | 'slack';
        token: string;
        appToken?: string;
        plan: string;
        ownerUserId: string;
    };

    // Validate
    if (!channel || !token || !plan) {
        return c.json({ ok: false, error: 'Missing required fields: channel, token, plan' }, 400);
    }
    if (!ownerUserId?.trim()) {
        return c.json({ ok: false, error: 'Missing ownerUserId — required to restrict bot access to owner only' }, 400);
    }

    if (channel === 'slack' && !appToken) {
        return c.json({ ok: false, error: 'Slack requires both bot token and app token' }, 400);
    }

    // ─── Dev Mode: Skip infra, save directly to DB ──────────────────────────

    // ─── Infra Detection ─────────────────────────────────────────────────────

    // Check if user already has an instance (claimed or active)
    const { data: userInstance } = await supabase
        .from('instances')
        .select('id')
        .eq('user_id', userId)
        .in('status', ['claimed', 'active'])
        .maybeSingle();

    // Check if there are any available instances in the pool
    const { count: availableCount } = await supabase
        .from('instances')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'available');

    const hasInfra = !!userInstance || (availableCount ?? 0) > 0;

    if (!hasInfra) {
        // No infrastructure available anywhere — save channel connection directly (dev mode)
        console.log(`[dev] No instances available or claimed — saving ${channel} connection directly for user ${userId}`);

        // ... (rest of the dev mode logic remains same)
        const { data: existing } = await supabase
            .from('channel_connections')
            .select('id')
            .eq('user_id', userId)
            .eq('channel', channel)
            .in('status', ['active', 'pending'])
            .maybeSingle();

        if (existing) {
            return c.json({ ok: false, error: `${channel} is already connected` }, 409);
        }

        const { data: connection, error: connErr } = await supabase
            .from('channel_connections')
            .insert({
                user_id: userId,
                instance_id: null,
                channel,
                status: 'active',
            })
            .select()
            .single();

        if (connErr) return c.json({ ok: false, error: connErr.message }, 500);

        await supabase.from('users').update({ plan: plan.toLowerCase() }).eq('id', userId);

        return c.json({
            ok: true,
            data: {
                connection,
                message: `${channel} channel saved (dev mode — no Gateway RPC).`,
                devMode: true,
            },
        });
    }

    // ─── Production: Full instance + Gateway flow ────────────────────────────

    let instance: Record<string, unknown> | null = null;

    // Check for existing instance
    const { data: existingInst } = await supabase
        .from('instances')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['claimed', 'active'])
        .limit(1)
        .maybeSingle();

    if (existingInst) {
        instance = existingInst;
    } else {
        // Claim from pool
        const { data: available } = await supabase
            .from('instances')
            .select('*')
            .eq('status', 'available')
            .is('user_id', null)
            .limit(1)
            .maybeSingle();

        if (!available) {
            return c.json({ ok: false, error: 'No instances available. Please try again later.' }, 503);
        }

        const { data: claimed, error: claimErr } = await supabase
            .from('instances')
            .update({
                user_id: userId,
                status: 'claimed',
                claimed_at: new Date().toISOString(),
            })
            .eq('id', available.id)
            .eq('status', 'available')
            .select()
            .single();

        if (claimErr || !claimed) {
            return c.json({ ok: false, error: 'Failed to claim instance' }, 500);
        }

        instance = claimed;
    }

    const inst = instance!;

    // Build channel config patch
    type ChannelConfig = Record<string, unknown>;
    let channelPatch: Record<string, ChannelConfig>;

    const ownerAllowFrom = [ownerUserId.trim()];

    switch (channel) {
        case 'telegram':
            channelPatch = {
                telegram: { enabled: true, botToken: token, dmPolicy: 'allowlist', allowFrom: ownerAllowFrom },
            };
            break;
        case 'discord':
            channelPatch = {
                discord: { enabled: true, token, dmPolicy: 'allowlist', allowFrom: ownerAllowFrom, dm: { enabled: true } },
            };
            break;
        case 'slack':
            channelPatch = {
                slack: { enabled: true, botToken: token, appToken: appToken!, dmPolicy: 'allowlist', allowFrom: ownerAllowFrom, dm: { enabled: true } },
            };
            break;
        default:
            return c.json({ ok: false, error: `Unsupported channel: ${channel}` }, 400);
    }

    // Connect to Gateway and patch config
    const tailscaleIp = inst.internal_ip as string;
    const gatewayPort = (inst.gateway_port as number) || 18789;
    const gatewayToken = inst.gateway_token as string;

    if (!tailscaleIp || !gatewayToken) {
        const { data: connection } = await supabase
            .from('channel_connections')
            .insert({ user_id: userId, instance_id: inst.id as string, channel, status: 'pending' })
            .select()
            .single();

        return c.json({
            ok: true,
            data: { connection, message: 'Instance not yet provisioned. Channel will be configured when ready.' },
        });
    }

    const rpc = createGatewayRpcClient(tailscaleIp, gatewayPort, gatewayToken);

    try {
        // 1. Get current config hash (required for patch)
        const config = await rpc.call('config.get') as { hash: string };
        const baseHash = config.hash;

        // 2. Build the full config patch (channels + agents + session)
        const fullPatch = {
            channels: channelPatch,
            agents: {
                defaults: {
                    model: {
                        primary: "google/gemini-3-pro-preview",
                        fallbacks: ["anthropic/claude-sonnet-4-6", "openai/gpt-5.2-codex"],
                    },
                    models: {
                        "google/gemini-3-pro-preview": { alias: "Gemini" },
                        "anthropic/claude-sonnet-4-6": { alias: "Sonnet" },
                        "openai/gpt-5.2-codex": { alias: "Codex" },
                    },
                },
            },
            session: {
                dmScope: "main"
            }
        };

        // 3. Patch config using the Gateway protocol
        await rpc.call('config.patch', {
            raw: JSON.stringify(fullPatch),
            baseHash
        });

        await supabase.from('instances').update({ status: 'active' }).eq('id', inst.id as string);

        const { data: connection, error: connErr } = await supabase
            .from('channel_connections')
            .insert({ user_id: userId, instance_id: inst.id as string, channel, status: 'active' })
            .select()
            .single();

        if (connErr) {
            return c.json({ ok: false, error: 'Channel configured but failed to save record' }, 500);
        }

        await supabase.from('users').update({ plan: plan.toLowerCase() }).eq('id', userId);

        return c.json({
            ok: true,
            data: { connection, message: `${channel} channel enabled successfully` },
        });
    } catch (err) {
        console.error('[setup] Gateway RPC failed:', err);
        return c.json({
            ok: false,
            error: `Gateway configuration failed: ${(err as Error).message}`,
        }, 500);
    } finally {
        rpc.disconnect();
    }
});

// GET /api/channels — List user's channel connections
channelRoutes.get('/', async (c) => {
    const userId = c.get('userId' as never) as string;

    const { data, error } = await supabase
        .from('channel_connections')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        return c.json({ ok: false, error: error.message }, 500);
    }

    return c.json({ ok: true, data: data || [] });
});

// POST /api/channels/:id/disconnect — Disconnect a channel
channelRoutes.post('/:id/disconnect', async (c) => {
    const userId = c.get('userId' as never) as string;
    const connectionId = c.req.param('id');

    // Find the connection and verify ownership
    const { data: connection } = await supabase
        .from('channel_connections')
        .select('*, instances(*)')
        .eq('id', connectionId)
        .eq('user_id', userId)
        .single();

    if (!connection) {
        return c.json({ ok: false, error: 'Channel connection not found' }, 404);
    }

    // If instance is active, try to disable channel via Gateway RPC
    const inst = connection.instances as Record<string, unknown> | null;
    if (inst && inst.internal_ip && inst.gateway_token) {
        const rpc = createGatewayRpcClient(
            inst.internal_ip as string,
            (inst.gateway_port as number) || 18789,
            inst.gateway_token as string,
        );
        try {
            const config = await rpc.call('config.get') as { hash: string };
            await rpc.call('config.patch', {
                raw: JSON.stringify({
                    channels: { [connection.channel]: null },
                    plugins: { entries: { [connection.channel]: null } }
                }),
                baseHash: config.hash
            });
        } catch {
            // Best-effort
        } finally {
            rpc.disconnect();
        }
    }

    // Update status in DB
    const { error } = await supabase
        .from('channel_connections')
        .delete()
        .eq('id', connectionId);

    if (error) {
        return c.json({ ok: false, error: 'Failed to disconnect channel' }, 500);
    }

    return c.json({ ok: true, data: { message: `${connection.channel} disconnected` } });
});


