import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../services/supabase.js';
import { createGatewayRpcClient } from '../services/gateway-rpc.js';

export const billingRoutes = new Hono();

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/billing/credits
billingRoutes.get('/credits', authMiddleware, async (c) => {
    const userId = c.get('userId' as never) as string;

    const { data, error } = await supabase
        .from('users')
        .select('api_credits, plan, api_credits_cap, subscription_renews_at')
        .eq('id', userId)
        .single();

    if (error || !data) return c.json({ ok: false, error: 'Failed to fetch credits' }, 500);

    return c.json({
        ok: true,
        data: {
            api_credits: Number(data.api_credits) || 0,
            plan: (data.plan as string) ?? 'none',
            api_credits_cap: Number(data.api_credits_cap) || 0,
            subscription_renews_at: (data.subscription_renews_at as string) ?? null,
        },
    });
});

// POST /api/billing/sync-usage
billingRoutes.post('/sync-usage', authMiddleware, async (c) => {
    const userId = c.get('userId' as never) as string;

    const { data: inst } = await supabase
        .from('instances')
        .select('id, internal_ip, gateway_port, gateway_token, last_usage_cost, last_usage_tokens')
        .eq('user_id', userId)
        .in('status', ['claimed', 'active'])
        .maybeSingle();

    if (!inst?.internal_ip || !inst?.gateway_token) {
        return c.json({ ok: true, data: { synced: false, reason: 'no instance' } });
    }

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const startDate = since.toISOString().split('T')[0];

    const rpc = createGatewayRpcClient(inst.internal_ip as string, (inst.gateway_port as number) || 18789, inst.gateway_token as string);
    let currentCost = 0;
    let currentTokens = 0;

    try {
        const usage = await rpc.call('sessions.usage', { startDate }) as any;
        currentCost = Number(usage?.totals?.totalCost ?? 0);
        currentTokens = Number(usage?.totals?.totalTokens ?? 0);
    } catch {
        return c.json({ ok: true, data: { synced: false, reason: 'gateway unreachable' } });
    } finally {
        rpc.disconnect();
    }

    if (currentCost < 0.000001) {
        return c.json({ ok: true, data: { synced: false, delta: 0 } });
    }

    const lastCost = Number(inst.last_usage_cost ?? 0);
    let delta: number;
    if (currentCost >= lastCost) {
        delta = currentCost - lastCost;
    } else {
        delta = currentCost;
    }

    await supabase
        .from('instances')
        .update({ last_usage_cost: currentCost, last_usage_tokens: currentTokens, last_usage_synced_at: new Date().toISOString() })
        .eq('id', inst.id as string);

    if (delta < 0.000001) {
        return c.json({ ok: true, data: { synced: false, delta: 0 } });
    }

    await supabase.rpc('deduct_api_credits', { p_user_id: userId, p_amount: delta });

    return c.json({ ok: true, data: { synced: true, delta, currentCost, lastCost } });
});
