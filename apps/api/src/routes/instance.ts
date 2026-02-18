import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../services/supabase.js';

export const instanceRoutes = new Hono();

// All instance routes require authentication
instanceRoutes.use('*', authMiddleware);

// GET /api/instances/mine — Get user's claimed instance
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

    return c.json({ ok: true, data });
});

// POST /api/instances/claim — Claim an available pool instance
instanceRoutes.post('/claim', async (c) => {
    const userId = c.get('userId' as never) as string;

    // Check if user already has a claimed instance
    const { data: existing } = await supabase
        .from('instances')
        .select('id')
        .eq('user_id', userId)
        .in('status', ['claimed', 'active'])
        .limit(1)
        .maybeSingle();

    if (existing) {
        return c.json({ ok: false, error: 'You already have an active instance' }, 409);
    }

    // Find an available instance from the pool
    const { data: available, error: findError } = await supabase
        .from('instances')
        .select('*')
        .eq('status', 'available')
        .is('user_id', null)
        .limit(1)
        .maybeSingle();

    if (findError || !available) {
        return c.json({ ok: false, error: 'No instances available. Please try again later.' }, 503);
    }

    // Claim it
    const { data: claimed, error: claimError } = await supabase
        .from('instances')
        .update({
            user_id: userId,
            status: 'claimed',
            claimed_at: new Date().toISOString(),
        })
        .eq('id', available.id)
        .eq('status', 'available')  // Optimistic lock
        .select()
        .single();

    if (claimError || !claimed) {
        return c.json({ ok: false, error: 'Failed to claim instance — may have been taken. Try again.' }, 409);
    }

    return c.json({ ok: true, data: claimed });
});

// GET /api/instances/:id/health — Proxy health check to Gateway
instanceRoutes.get('/:id/health', async (c) => {
    const userId = c.get('userId' as never) as string;
    const id = c.req.param('id');

    // Verify ownership
    const { data: instance } = await supabase
        .from('instances')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

    if (!instance) {
        return c.json({ ok: false, error: 'Instance not found' }, 404);
    }

    // TODO: connect to Gateway via WS RPC, call `health`
    // For now, return mock health based on instance status
    return c.json({
        ok: true,
        data: {
            instanceId: id,
            status: instance.status,
            gateway: instance.status === 'active' ? 'healthy' : 'unknown',
        },
    });
});
