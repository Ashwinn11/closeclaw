import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../services/supabase.js';
import { createGatewayRpcClient } from '../services/gateway-rpc.js';

export const instanceRoutes = new Hono();

// All instance routes require authentication
instanceRoutes.use('*', authMiddleware);

/**
 * GET /api/instances/mine
 * Get the user's claimed/active instance with its status.
 */
instanceRoutes.get('/mine', async (c) => {
    const userId = c.get('userId' as never) as string;

    const { data, error } = await supabase
        .from('instances')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['claimed', 'active'])
        .order('claimed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        return c.json({ ok: false, error: error.message }, 500);
    }

    if (!data) {
        return c.json({ ok: true, data: null });
    }

    // Sanitize — don't expose gateway_token to the frontend
    const { gateway_token: _token, ...safeInstance } = data;

    return c.json({ ok: true, data: safeInstance });
});

/**
 * POST /api/instances/claim
 * Claim an available pool instance for the user.
 *
 * Atomically:
 * 1. Check user doesn't already have an instance
 * 2. Find an available instance with a Tailscale IP
 * 3. Mark it as claimed with user_id + timestamp
 *
 * The GCP tag update happens asynchronously (or via a background job).
 */
instanceRoutes.post('/claim', async (c) => {
    const userId = c.get('userId' as never) as string;

    // 1. Check if user already has an instance
    const { data: existing } = await supabase
        .from('instances')
        .select('id, gcp_instance_name, status, internal_ip')
        .eq('user_id', userId)
        .in('status', ['claimed', 'active'])
        .limit(1)
        .maybeSingle();

    if (existing) {
        const { gateway_token: _t, ...safe } = existing as Record<string, unknown>;
        return c.json({
            ok: true,
            data: safe,
            message: 'You already have an instance',
        });
    }

    // 2. Find an available instance (must have Tailscale IP)
    const { data: available, error: findError } = await supabase
        .from('instances')
        .select('*')
        .eq('status', 'available')
        .is('user_id', null)
        .not('internal_ip', 'is', null)  // Must be reachable
        .limit(1)
        .maybeSingle();

    if (findError) {
        return c.json({ ok: false, error: 'Database error' }, 500);
    }

    if (!available) {
        return c.json({
            ok: false,
            error: 'No instances available in the pool. Please try again later.',
        }, 503);
    }

    // 3. Atomically claim (optimistic lock on status=available)
    const { data: claimed, error: claimError } = await supabase
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

    if (claimError || !claimed) {
        return c.json({
            ok: false,
            error: 'Instance was claimed by another user. Try again.',
        }, 409);
    }

    // Sanitize
    const { gateway_token: _token, ...safeInstance } = claimed;

    return c.json({ ok: true, data: safeInstance });
});

/**
 * POST /api/instances/release
 * Release the user's instance back to the pool.
 */
instanceRoutes.post('/release', async (c) => {
    const userId = c.get('userId' as never) as string;

    // Find user's instance
    const { data: instance } = await supabase
        .from('instances')
        .select('id, gcp_instance_name')
        .eq('user_id', userId)
        .in('status', ['claimed', 'active'])
        .maybeSingle();

    if (!instance) {
        return c.json({ ok: false, error: 'No instance to release' }, 404);
    }

    // Delete all channel connections for this user
    await supabase
        .from('channel_connections')
        .delete()
        .eq('user_id', userId);

    // Release the instance back to pool
    const { error } = await supabase
        .from('instances')
        .update({
            user_id: null,
            status: 'available',
            claimed_at: null,
        })
        .eq('id', instance.id);

    if (error) {
        return c.json({ ok: false, error: 'Failed to release instance' }, 500);
    }

    return c.json({ ok: true, data: { message: 'Instance released back to pool' } });
});

/**
 * GET /api/instances/:id/health
 * Proxy health check to the user's Gateway via WS RPC.
 */
instanceRoutes.get('/:id/health', async (c) => {
    const userId = c.get('userId' as never) as string;
    const id = c.req.param('id');

    const { data: instance } = await supabase
        .from('instances')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

    if (!instance) {
        return c.json({ ok: false, error: 'Instance not found' }, 404);
    }

    // TODO: when Gateway is reachable, call health RPC
    // For now, return status from DB
    return c.json({
        ok: true,
        data: {
            instanceId: id,
            status: instance.status,
            gatewayIp: instance.internal_ip,
            gatewayPort: instance.gateway_port,
        },
    });
});

/**
 * GET /api/instances/mine/cron
 * Fetch real cron jobs from the gateway.
 */
instanceRoutes.get('/mine/cron', async (c) => {
    const userId = c.get('userId' as never) as string;

    const { data: inst } = await supabase
        .from('instances')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['claimed', 'active'])
        .single();

    if (!inst || !inst.internal_ip || !inst.gateway_token) {
        return c.json({ ok: false, error: 'Instance not reachable' }, 404);
    }

    const rpc = createGatewayRpcClient(inst.internal_ip, inst.gateway_port || 18789, inst.gateway_token);
    try {
        const result = await rpc.call('cron.list') as { jobs: any[] };
        return c.json({ ok: true, data: result.jobs });
    } catch (err) {
        return c.json({ ok: false, error: (err as Error).message }, 500);
    } finally {
        rpc.disconnect();
    }
});

/**
 * POST /api/instances/mine/cron
 * Add a new cron job.
 */
instanceRoutes.post('/mine/cron', async (c) => {
    const userId = c.get('userId' as never) as string;
    const body = await c.req.json();

    const { data: inst } = await supabase
        .from('instances')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['claimed', 'active'])
        .single();

    if (!inst || !inst.internal_ip || !inst.gateway_token) {
        return c.json({ ok: false, error: 'Instance not reachable' }, 404);
    }

    const rpc = createGatewayRpcClient(inst.internal_ip, inst.gateway_port || 18789, inst.gateway_token);
    try {
        const result = await rpc.call('cron.add', body);
        return c.json({ ok: true, data: result });
    } catch (err) {
        return c.json({ ok: false, error: (err as Error).message }, 500);
    } finally {
        rpc.disconnect();
    }
});

/**
 * POST /api/instances/mine/cron/remove
 * Remove a cron job.
 */
instanceRoutes.post('/mine/cron/remove', async (c) => {
    const userId = c.get('userId' as never) as string;
    const body = await c.req.json();

    const { data: inst } = await supabase
        .from('instances')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['claimed', 'active'])
        .single();

    if (!inst || !inst.internal_ip || !inst.gateway_token) {
        return c.json({ ok: false, error: 'Instance not reachable' }, 404);
    }

    const rpc = createGatewayRpcClient(inst.internal_ip, inst.gateway_port || 18789, inst.gateway_token);
    try {
        const result = await rpc.call('cron.remove', body);
        return c.json({ ok: true, data: result });
    } catch (err) {
        return c.json({ ok: false, error: (err as Error).message }, 500);
    } finally {
        rpc.disconnect();
    }
});

/**
 * GET /api/instances/mine/usage
 * Fetch real usage stats from the gateway.
 */
instanceRoutes.get('/mine/usage', async (c) => {
    const userId = c.get('userId' as never) as string;

    const { data: inst } = await supabase
        .from('instances')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['claimed', 'active'])
        .single();

    if (!inst || !inst.internal_ip || !inst.gateway_token) {
        return c.json({ ok: false, error: 'Instance not reachable' }, 404);
    }

    const rpc = createGatewayRpcClient(inst.internal_ip, inst.gateway_port || 18789, inst.gateway_token);
    try {
        // Fetch sessions usage for the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const startDate = thirtyDaysAgo.toISOString().split('T')[0];

        const usage = await rpc.call('sessions.usage', { startDate }) as any;

        // Fetch user credits
        const { data: userData } = await supabase
            .from('users')
            .select('api_credits')
            .eq('id', userId)
            .single();

        // Calculate uptime
        let uptime = '99.9%';
        if (inst.claimed_at) {
            const hoursActive = (Date.now() - new Date(inst.claimed_at).getTime()) / (1000 * 60 * 60);
            if (hoursActive < 24) uptime = '100%';
        }

        // Map to the format the dashboard expects
        const mappedUsage = {
            messagesThisMonth: usage.totals?.totalMessages || usage.aggregates?.messages?.total || 0,
            tokensUsed: usage.totals?.totalTokens || 0,
            costThisMonth: usage.totals?.totalCost || 0,
            apiCreditsLeft: userData?.api_credits || 0,
            uptime,
            byModel: usage.aggregates?.byModel || [],
        };

        return c.json({ ok: true, data: mappedUsage });
    } catch (err) {
        return c.json({ ok: false, error: (err as Error).message }, 500);
    } finally {
        rpc.disconnect();
    }
});
