import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../services/supabase.js';
import { createGatewayRpcClient } from '../services/gateway-rpc.js';


export const channelRoutes = new Hono();

// All channel routes require authentication
channelRoutes.use('*', authMiddleware);

/**
 * POST /api/channels/setup
 * 
 * Full channel setup flow:
 * 1. Check if user has an instance (or claim one)
 * 2. Build the channel config patch based on channel type
 * 3. Connect to Gateway via WS RPC
 * 4. Call config.patch to enable the channel
 * 5. Store the channel connection in DB
 * 
 * In dev mode (no GCP infra): skips instance claiming and Gateway RPC,
 * saves the connection directly to DB as active.
 */
channelRoutes.post('/setup', async (c) => {
    const userId = c.get('userId' as never) as string;
    const body = await c.req.json();
    const { channel, token, appToken, plan } = body as {
        channel: 'telegram' | 'discord' | 'slack';
        token: string;
        appToken?: string;
        plan: string;
    };

    // Validate
    if (!channel || !token || !plan) {
        return c.json({ ok: false, error: 'Missing required fields: channel, token, plan' }, 400);
    }

    if (channel === 'slack' && !appToken) {
        return c.json({ ok: false, error: 'Slack requires both bot token and app token' }, 400);
    }

    // ─── Dev Mode: Skip infra, save directly to DB ──────────────────────────

    // Check if there are any instances in the pool
    const { count } = await supabase
        .from('instances')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'available');

    const hasInfra = (count ?? 0) > 0;

    if (!hasInfra) {
        // No infrastructure available — save channel connection directly (dev mode)
        console.log(`[dev] No instances in pool — saving ${channel} connection directly for user ${userId}`);

        // Check for duplicate
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
                status: 'active', // Mark active so dashboard shows it
            })
            .select()
            .single();

        if (connErr) {
            return c.json({ ok: false, error: connErr.message }, 500);
        }

        // Update user plan
        await supabase
            .from('users')
            .update({ plan: plan.toLowerCase() })
            .eq('id', userId);

        return c.json({
            ok: true,
            data: {
                connection,
                message: `${channel} channel saved (dev mode — no Gateway RPC). Will connect when infrastructure is provisioned.`,
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

    switch (channel) {
        case 'telegram':
            channelPatch = {
                telegram: { enabled: true, botToken: token, dmPolicy: 'open', allowFrom: ['*'] },
            };
            break;
        case 'discord':
            channelPatch = {
                discord: { enabled: true, token, dmPolicy: 'open', allowFrom: ['*'], dm: { enabled: true } },
            };
            break;
        case 'slack':
            channelPatch = {
                slack: { enabled: true, botToken: token, appToken: appToken!, dmPolicy: 'open', allowFrom: ['*'], dm: { enabled: true } },
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
        await rpc.call('config.patch', { channels: channelPatch });

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
            data: { connection, message: `${channel} channel enabled with dmPolicy: open` },
        });
    } catch (err) {
        const { data: connection } = await supabase
            .from('channel_connections')
            .insert({ user_id: userId, instance_id: inst.id as string, channel, status: 'pending' })
            .select()
            .single();

        return c.json({
            ok: true,
            data: {
                connection,
                message: 'Gateway unreachable. Channel saved and will be configured when instance comes online.',
                gatewayError: (err as Error).message,
            },
        });
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
            await rpc.call('config.patch', {
                channels: { [connection.channel]: { enabled: false } },
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
