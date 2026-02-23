import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../services/supabase.js';
import { createGatewayRpcClient } from '../services/gateway-rpc.js';

export const billingRoutes = new Hono();

// ─── Dodo Payments config ──────────────────────────────────────────────────────

const DODO_API_KEY = process.env.DODO_API_KEY ?? '';
const DODO_WEBHOOK_SECRET = process.env.DODO_WEBHOOK_SECRET ?? '';
const DODO_BASE_URL = process.env.DODO_BASE_URL ?? 'https://live.dodopayments.com';
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';

interface PlanConfig { productId: string; credits: number; planKey: string }
interface PackConfig { productId: string; credits: number }

const PLANS: Record<string, PlanConfig> = {
    'Base':     { productId: process.env.DODO_BASIC_PRODUCT_ID ?? '',      credits: 20, planKey: 'basic' },
    'Guardian': { productId: process.env.DODO_GUARDIAN_PRODUCT_ID ?? '',   credits: 35, planKey: 'guardian' },
    'Fortress': { productId: process.env.DODO_FORTRESS_PRODUCT_ID ?? '',   credits: 50, planKey: 'fortress' },
};

const CREDIT_PACKS: Record<string, PackConfig> = {
    '5':   { productId: process.env.DODO_CREDIT_5_PRODUCT_ID ?? '',   credits: 5 },
    '10':  { productId: process.env.DODO_CREDIT_10_PRODUCT_ID ?? '',  credits: 10 },
    '25':  { productId: process.env.DODO_CREDIT_25_PRODUCT_ID ?? '',  credits: 25 },
    '50':  { productId: process.env.DODO_CREDIT_50_PRODUCT_ID ?? '',  credits: 50 },
    '100': { productId: process.env.DODO_CREDIT_100_PRODUCT_ID ?? '', credits: 100 },
};

function getProductPlan(productId: string): PlanConfig | null {
    return Object.values(PLANS).find(p => p.productId === productId) ?? null;
}

function getProductPack(productId: string): PackConfig | null {
    return Object.values(CREDIT_PACKS).find(p => p.productId === productId) ?? null;
}

// ─── Dodo Payments API helpers ─────────────────────────────────────────────────

async function createDodoCheckout(
    productId: string,
    userId: string,
    userEmail: string,
    returnUrl: string,
): Promise<string> {
    const res = await fetch(`${DODO_BASE_URL}/checkouts`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${DODO_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            product_cart: [{ product_id: productId, quantity: 1 }],
            customer: { email: userEmail },
            metadata: { user_id: userId },
            return_url: returnUrl,
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Dodo Payments error (${res.status}): ${err}`);
    }

    const json = await res.json() as any;
    return json.checkout_url as string;
}

// Standard Webhooks signature verification (https://www.standardwebhooks.com)
function verifyDodoWebhook(rawBody: string, webhookId: string, webhookTimestamp: string, webhookSignature: string): boolean {
    if (!DODO_WEBHOOK_SECRET || !webhookId || !webhookTimestamp || !webhookSignature) return false;

    const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
    // Secret may be prefixed with "whsec_" — strip it before base64-decoding
    const secretB64 = DODO_WEBHOOK_SECRET.startsWith('whsec_')
        ? DODO_WEBHOOK_SECRET.slice(6)
        : DODO_WEBHOOK_SECRET;
    const secretBytes = Buffer.from(secretB64, 'base64');

    const hmac = createHmac('sha256', secretBytes);
    hmac.update(signedContent);
    const digest = hmac.digest('base64');

    // Header may contain multiple signatures: "v1,sig1 v1,sig2"
    return webhookSignature.split(' ').some(s => {
        const [, sig] = s.split(',');
        if (!sig) return false;
        try {
            return timingSafeEqual(Buffer.from(digest), Buffer.from(sig));
        } catch {
            return false;
        }
    });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/billing/portal — Customer self-service portal URL
billingRoutes.get('/portal', authMiddleware, async (c) => {
    const userId = c.get('userId' as never) as string;
    const { data: user } = await supabase.from('users')
        .select('dodo_customer_id, plan').eq('id', userId).single();
    if (!user?.dodo_customer_id || user.plan === 'none' || user.plan === 'cancelled')
        return c.json({ ok: false, error: 'No active subscription' }, 404);

    const res = await fetch(
        `${DODO_BASE_URL}/customers/${user.dodo_customer_id}/customer-portal/session`,
        { method: 'POST', headers: { Authorization: `Bearer ${DODO_API_KEY}` } }
    );
    const json = await res.json() as any;
    const portalUrl = json.link;
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
        const checkoutUrl = await createDodoCheckout(plan.productId, userId, userEmail, redirectUrl);
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
        const checkoutUrl = await createDodoCheckout(creditPack.productId, userId, userEmail, redirectUrl);
        return c.json({ ok: true, data: { checkoutUrl } });
    } catch (err: any) {
        return c.json({ ok: false, error: err.message || 'Failed to create checkout' }, 500);
    }
});

// POST /api/billing/webhook — Dodo Payments webhook (no auth — verified by Standard Webhooks HMAC)
billingRoutes.post('/webhook', async (c) => {
    const webhookId        = c.req.header('webhook-id') ?? '';
    const webhookTimestamp = c.req.header('webhook-timestamp') ?? '';
    const webhookSignature = c.req.header('webhook-signature') ?? '';
    const rawBody = await c.req.text();

    if (!verifyDodoWebhook(rawBody, webhookId, webhookTimestamp, webhookSignature)) {
        console.error('[billing/webhook] Invalid signature');
        return c.json({ ok: false, error: 'Invalid signature' }, 401);
    }

    let event: any;
    try {
        event = JSON.parse(rawBody);
    } catch {
        return c.json({ ok: false, error: 'Invalid JSON' }, 400);
    }

    const eventType = event.type as string;
    const data = event.data ?? {};
    const userId = data.metadata?.user_id as string | undefined;

    console.log(`[billing/webhook] ${eventType} user=${userId ?? 'unknown'}`);

    // ── New subscription activated ──────────────────────────────────────────
    if (eventType === 'subscription.active') {
        if (!userId) return c.json({ ok: true });

        const productId = String(data.product_id ?? '');
        const planCfg = getProductPlan(productId);
        if (!planCfg) {
            console.warn(`[billing/webhook] Unknown product ${productId}`);
            return c.json({ ok: true });
        }

        const subscriptionId = String(data.subscription_id ?? '');
        const customerId = String(data.customer?.customer_id ?? '');

        await supabase.from('users').update({
            plan: planCfg.planKey,
            api_credits: planCfg.credits,
            api_credits_cap: planCfg.credits,
            dodo_subscription_id: subscriptionId,
            dodo_customer_id: customerId,
            subscription_renews_at: data.next_billing_date ?? null,
        }).eq('id', userId);

        console.log(`[billing/webhook] Subscription activated: user=${userId} plan=${planCfg.planKey} credits=${planCfg.credits}`);
    }

    // ── Subscription renewed (monthly billing cycle) ────────────────────────
    if (eventType === 'subscription.renewed') {
        if (!userId) return c.json({ ok: true });

        const productId = String(data.product_id ?? '');
        const planCfg = getProductPlan(productId);
        if (!planCfg) return c.json({ ok: true });

        // Reset credits to plan level (not additive — avoids hoarding)
        await supabase.from('users')
            .update({
                api_credits: planCfg.credits,
                api_credits_cap: planCfg.credits,
                subscription_renews_at: data.next_billing_date ?? null,
            })
            .eq('id', userId);

        console.log(`[billing/webhook] Subscription renewed: user=${userId} credits reset to ${planCfg.credits}`);
    }

    // ── Subscription cancelled ──────────────────────────────────────────────
    if (eventType === 'subscription.cancelled') {
        if (!userId) return c.json({ ok: true });

        // Keep remaining credits; just update plan status
        await supabase.from('users')
            .update({ plan: 'cancelled' })
            .eq('id', userId);

        console.log(`[billing/webhook] Subscription cancelled: user=${userId}`);
    }

    // ── One-time payment succeeded (credit top-ups) ─────────────────────────
    if (eventType === 'payment.succeeded') {
        if (!userId) return c.json({ ok: true });

        const productId = String(data.product_cart?.[0]?.product_id ?? '');
        const packCfg = getProductPack(productId);

        // Skip if not a recognised credit pack
        if (!packCfg) return c.json({ ok: true });

        await supabase.rpc('add_api_credits', { p_user_id: userId, p_amount: packCfg.credits });
        // Raise the cap to reflect the new higher balance
        await supabase.rpc('sync_credits_cap', { p_user_id: userId });

        console.log(`[billing/webhook] Credits topped up: user=${userId} +${packCfg.credits}`);
    }

    return c.json({ ok: true });
});
