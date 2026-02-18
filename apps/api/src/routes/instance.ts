import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../services/supabase.js';

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
