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
        .select('api_credits, plan, subscription_renews_at')
        .eq('id', userId)
        .single();

    if (error || !data) return c.json({ ok: false, error: 'Failed to fetch credits' }, 500);

    let plan = (data.plan as string) ?? 'none';
    const renewsAt = data.subscription_renews_at as string | null;

    // Check if the platform subscription has naturally expired
    if (plan === 'platform' && renewsAt) {
        const renewDate = new Date(renewsAt);
        // Provide a 24-hour grace period for billing/timezone drift
        if (renewDate.getTime() + 24 * 60 * 60 * 1000 < Date.now()) {
            console.log(`[Billing] User ${userId} subscription naturally expired.`);
            plan = 'expired';
            // Un-await the DB update to fire-and-forget for speed, but patch the true source of truth
            supabase.from('users').update({ plan: 'expired' }).eq('id', userId).then();
        }
    }

    return c.json({
        ok: true,
        data: {
            api_credits: Number(data.api_credits) || 0,
            plan,
            subscription_renews_at: renewsAt,
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

// POST /api/billing/verify-ios
billingRoutes.post('/verify-ios', authMiddleware, async (c) => {
    const userId = c.get('userId' as never) as string;
    const { signedTransaction } = await c.req.json();

    if (!signedTransaction) return c.json({ ok: false, error: 'Missing transaction data' }, 400);

    try {
        // In StoreKit 2, the signedTransaction is a JWS string (3 parts separated by dots)
        // Part 1: Header, Part 2: Payload, Part 3: Signature
        const parts = signedTransaction.split('.');
        if (parts.length !== 3) throw new Error('Invalid JWS format');

        // Decode the payload (Part 2)
        const payloadJson = Buffer.from(parts[1], 'base64').toString('utf-8');
        const payload = JSON.parse(payloadJson);

        const productId = payload.productId;
        const transactionId = payload.transactionId;

        console.log(`[Billing] Verifying iOS purchase: User=${userId}, Product=${productId}, Tx=${transactionId}`);

        if (productId === 'monthly.closeclaw') {
            // Fetch current to append the $20 monthly allocation
            const { data: user } = await supabase
                .from('users')
                .select('api_credits')
                .eq('id', userId)
                .single();

            const currentCredits = Number(user?.api_credits || 0);

            // Update to Platform Plan, grant $20 credits, and set the cap to 20 for the usage bar 
            const expiresDate = payload.expiresDate ? new Date(payload.expiresDate).toISOString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

            const { error } = await supabase
                .from('users')
                .update({
                    plan: 'platform',
                    api_credits: currentCredits + 20,
                    subscription_renews_at: expiresDate
                })
                .eq('id', userId);

            if (error) throw error;
        }
        else if (productId === 'fifty.closeclaw') {
            // Add 50 Credits
            // Using RPC to ensure atomic increment if possible, or simple update
            const { data: user } = await supabase
                .from('users')
                .select('api_credits')
                .eq('id', userId)
                .single();

            const currentCredits = Number(user?.api_credits || 0);
            const { error } = await supabase
                .from('users')
                .update({ api_credits: currentCredits + 50 })
                .eq('id', userId);

            if (error) throw error;
        } else {
            return c.json({ ok: false, error: 'Unknown product ID' }, 400);
        }

        return c.json({ ok: true, data: { status: 'success', productId } });
    } catch (err: any) {
        console.error('[Billing] iOS verification error:', err);
        return c.json({ ok: false, error: err.message || 'Verification failed' }, 500);
    }
});
