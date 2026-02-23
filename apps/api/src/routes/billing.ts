import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../services/supabase.js';
import { createGatewayRpcClient } from '../services/gateway-rpc.js';

export const billingRoutes = new Hono();

// ─── LemonSqueezy config ──────────────────────────────────────────────────────

const LS_API_KEY = process.env.LEMONSQUEEZY_API_KEY ?? '';
const LS_WEBHOOK_SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? '';
const LS_STORE_ID = process.env.LEMONSQUEEZY_STORE_ID ?? '';
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';

interface PlanConfig { variantId: string; credits: number; planKey: string }
interface PackConfig { variantId: string; credits: number }

const PLANS: Record<string, PlanConfig> = {
    'Base': { variantId: process.env.LEMONSQUEEZY_BASIC_VARIANT_ID ?? '', credits: 20, planKey: 'basic' },
    'Guardian': { variantId: process.env.LEMONSQUEEZY_PRO_VARIANT_ID ?? '', credits: 35, planKey: 'guardian' },
    'Fortress': { variantId: process.env.LEMONSQUEEZY_ENTERPRISE_VARIANT_ID ?? '', credits: 50, planKey: 'fortress' },
};

const CREDIT_PACKS: Record<string, PackConfig> = {
    '5': { variantId: process.env.LEMONSQUEEZY_CREDIT_5_VARIANT_ID ?? '', credits: 5 },
    '10': { variantId: process.env.LEMONSQUEEZY_CREDIT_10_VARIANT_ID ?? '', credits: 10 },
    '25': { variantId: process.env.LEMONSQUEEZY_CREDIT_25_VARIANT_ID ?? '', credits: 25 },
    '50': { variantId: process.env.LEMONSQUEEZY_CREDIT_50_VARIANT_ID ?? '', credits: 50 },
    '100': { variantId: process.env.LEMONSQUEEZY_CREDIT_100_VARIANT_ID ?? '', credits: 100 },
};

function getVariantPlan(variantId: string): PlanConfig | null {
    return Object.values(PLANS).find(p => p.variantId === variantId) ?? null;
}

function getVariantPack(variantId: string): PackConfig | null {
    return Object.values(CREDIT_PACKS).find(p => p.variantId === variantId) ?? null;
}

// ─── LemonSqueezy API helper ──────────────────────────────────────────────────

async function createLSCheckout(
    variantId: string,
    userId: string,
    userEmail: string,
    redirectUrl: string,
): Promise<string> {
    const res = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${LS_API_KEY}`,
            'Content-Type': 'application/vnd.api+json',
            'Accept': 'application/vnd.api+json',
        },
        body: JSON.stringify({
            data: {
                type: 'checkouts',
                attributes: {
                    checkout_data: {
                        email: userEmail,
                        custom: { user_id: userId },
                    },
                    product_options: {
                        redirect_url: redirectUrl,
                    },
                },
                relationships: {
                    store: { data: { type: 'stores', id: String(LS_STORE_ID) } },
                    variant: { data: { type: 'variants', id: String(variantId) } },
                },
            },
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`LemonSqueezy error (${res.status}): ${err}`);
    }

    const json = await res.json() as any;
    return json.data.attributes.url as string;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/billing/portal — Customer self-service portal URL
billingRoutes.get('/portal', authMiddleware, async (c) => {
    const userId = c.get('userId' as never) as string;
    const { data: user } = await supabase.from('users')
        .select('ls_customer_id, plan').eq('id', userId).single();
    if (!user?.ls_customer_id || user.plan === 'none' || user.plan === 'cancelled')
        return c.json({ ok: false, error: 'No active subscription' }, 404);

    const res = await fetch(
        `https://api.lemonsqueezy.com/v1/customers/${user.ls_customer_id}`,
        { headers: { Authorization: `Bearer ${LS_API_KEY}`, Accept: 'application/vnd.api+json' } }
    );
    const json = await res.json() as any;
    const portalUrl = json.data?.attributes?.urls?.customer_portal;
    if (!portalUrl) return c.json({ ok: false, error: 'Portal unavailable' }, 500);
    return c.json({ ok: true, data: { portalUrl } });
});

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
// Calls sessions.usage on the user's gateway (ground truth) and deducts
// the delta vs what's already logged. Safe to call repeatedly — only charges new usage since last sync.
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
        // Session reset
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

// POST /api/billing/checkout — Create subscription checkout URL
billingRoutes.post('/checkout', authMiddleware, async (c) => {
    const userId = c.get('userId' as never) as string;
    const userEmail = (c.get('userEmail' as never) as string) ?? '';
    const { planName } = await c.req.json() as { planName: string };

    const plan = PLANS[planName];
    if (!plan) return c.json({ ok: false, error: 'Invalid plan' }, 400);

    try {
        const redirectUrl = `${APP_URL}/dashboard?cc_setup=resume`;
        const checkoutUrl = await createLSCheckout(plan.variantId, userId, userEmail, redirectUrl);
        return c.json({ ok: true, data: { checkoutUrl } });
    } catch (err: any) {
        return c.json({ ok: false, error: err.message || 'Failed to create checkout' }, 500);
    }
});

// POST /api/billing/topup — Create credit top-up checkout URL
billingRoutes.post('/topup', authMiddleware, async (c) => {
    const userId = c.get('userId' as never) as string;
    const userEmail = (c.get('userEmail' as never) as string) ?? '';
    const { pack } = await c.req.json() as { pack: string };

    const creditPack = CREDIT_PACKS[pack];
    if (!creditPack) return c.json({ ok: false, error: 'Invalid credit pack' }, 400);

    try {
        const redirectUrl = `${APP_URL}/dashboard?cc_topup=success`;
        const checkoutUrl = await createLSCheckout(creditPack.variantId, userId, userEmail, redirectUrl);
        return c.json({ ok: true, data: { checkoutUrl } });
    } catch (err: any) {
        return c.json({ ok: false, error: err.message || 'Failed to create checkout' }, 500);
    }
});

// POST /api/billing/webhook — LemonSqueezy webhook (no auth — verified by HMAC)
billingRoutes.post('/webhook', async (c) => {
    const signature = c.req.header('x-signature') ?? '';
    const rawBody = await c.req.text();

    // Verify HMAC-SHA256
    const hmac = createHmac('sha256', LS_WEBHOOK_SECRET);
    hmac.update(rawBody);
    const digest = hmac.digest('hex');

    const sigValid = LS_WEBHOOK_SECRET &&
        signature.length > 0 &&
        digest.length === signature.length &&
        timingSafeEqual(Buffer.from(digest), Buffer.from(signature));

    if (!sigValid) {
        console.error('[billing/webhook] Invalid signature');
        return c.json({ ok: false, error: 'Invalid signature' }, 401);
    }

    let event: any;
    try {
        event = JSON.parse(rawBody);
    } catch {
        return c.json({ ok: false, error: 'Invalid JSON' }, 400);
    }

    const eventName = event.meta?.event_name as string;
    const userId = event.meta?.custom_data?.user_id as string | undefined;
    const attrs = event.data?.attributes ?? {};

    console.log(`[billing/webhook] ${eventName} user=${userId ?? 'unknown'}`);

    // ── New subscription purchased ──────────────────────────────────────────
    if (eventName === 'subscription_created') {
        if (!userId) return c.json({ ok: true });

        const variantId = String(attrs.variant_id ?? '');
        const planCfg = getVariantPlan(variantId);
        if (!planCfg) {
            console.warn(`[billing/webhook] Unknown variant ${variantId}`);
            return c.json({ ok: true });
        }

        const lsSubscriptionId = String(event.data?.id ?? '');
        const lsCustomerId = String(attrs.customer_id ?? '');

        await supabase.from('users').update({
            plan: planCfg.planKey,
            api_credits: planCfg.credits,
            api_credits_cap: planCfg.credits,
            ls_subscription_id: lsSubscriptionId,
            ls_customer_id: lsCustomerId,
            subscription_renews_at: attrs.renews_at ?? null,
        }).eq('id', userId);

        console.log(`[billing/webhook] Subscription created: user=${userId} plan=${planCfg.planKey} credits=${planCfg.credits}`);
    }

    // ── Subscription renewed (monthly billing cycle) ────────────────────────
    if (eventName === 'subscription_payment_success') {
        if (!userId) return c.json({ ok: true });

        const variantId = String(attrs.variant_id ?? '');
        const planCfg = getVariantPlan(variantId);
        if (!planCfg) return c.json({ ok: true });

        // Reset credits to plan level (not additive — avoids hoarding)
        await supabase.from('users')
            .update({
                api_credits: planCfg.credits,
                api_credits_cap: planCfg.credits,
                subscription_renews_at: attrs.renews_at ?? null,
            })
            .eq('id', userId);

        console.log(`[billing/webhook] Subscription renewed: user=${userId} credits reset to ${planCfg.credits}`);
    }

    // ── Subscription cancelled ──────────────────────────────────────────────
    if (eventName === 'subscription_cancelled') {
        if (!userId) return c.json({ ok: true });

        // Keep remaining credits; just update plan status
        await supabase.from('users')
            .update({ plan: 'cancelled' })
            .eq('id', userId);

        console.log(`[billing/webhook] Subscription cancelled: user=${userId}`);
    }

    // ── Order created (credit top-ups are one-time orders) ──────────────────
    if (eventName === 'order_created') {
        if (!userId) return c.json({ ok: true });

        const status = attrs.status as string;
        if (status !== 'paid') return c.json({ ok: true });

        const variantId = String(attrs.first_order_item?.variant_id ?? '');
        const packCfg = getVariantPack(variantId);

        // Skip if not a credit pack (e.g. the initial subscription order also fires this)
        if (!packCfg) return c.json({ ok: true });

        await supabase.rpc('add_api_credits', { p_user_id: userId, p_amount: packCfg.credits });
        // Raise the cap to reflect the new higher balance
        await supabase.rpc('sync_credits_cap', { p_user_id: userId });

        console.log(`[billing/webhook] Credits topped up: user=${userId} +${packCfg.credits}`);
    }

    return c.json({ ok: true });
});
