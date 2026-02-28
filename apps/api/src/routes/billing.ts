import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../services/supabase.js';
import { createGatewayRpcClient } from '../services/gateway-rpc.js';

export const billingRoutes = new Hono();

// ─── Razorpay config ───────────────────────────────────────────────────────────

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID ?? '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';

const RAZORPAY_BASE_URL = 'https://api.razorpay.com/v1';

// Basic auth header for Razorpay REST API
function razorpayAuthHeader(): string {
    return 'Basic ' + Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
}

interface PlanConfig { planId: string; credits: number; planKey: string }
interface PackConfig { amount: number; credits: number }   // amount in paise (INR) or smallest currency unit

const PLANS: Record<string, PlanConfig> = {
    'Base': { planId: process.env.RAZORPAY_BASIC_PLAN_ID ?? '', credits: 20, planKey: 'basic' },
    'Guardian': { planId: process.env.RAZORPAY_GUARDIAN_PLAN_ID ?? '', credits: 35, planKey: 'guardian' },
    'Fortress': { planId: process.env.RAZORPAY_FORTRESS_PLAN_ID ?? '', credits: 50, planKey: 'fortress' },
};

// Credit pack amounts — stored in USD cents (Razorpay supports USD for international)
// If billing in INR, convert accordingly in your Razorpay dashboard plans.
const CREDIT_PACKS: Record<string, PackConfig> = {
    '5': { amount: 500, credits: 5 },
    '10': { amount: 1000, credits: 10 },
    '25': { amount: 2500, credits: 25 },
    '50': { amount: 5000, credits: 50 },
    '100': { amount: 10000, credits: 100 },
};

function getPlanByPlanId(planId: string): PlanConfig | null {
    return Object.values(PLANS).find(p => p.planId === planId) ?? null;
}


// ─── Razorpay API helpers ──────────────────────────────────────────────────────

/**
 * Create a Razorpay Subscription checkout link.
 * Returns a short_url that redirects the customer to Razorpay's hosted checkout.
 */
async function createRazorpaySubscription(
    planId: string,
    userId: string,
    userEmail: string,
): Promise<string> {
    // 1. Create subscription
    const subRes = await fetch(`${RAZORPAY_BASE_URL}/subscriptions`, {
        method: 'POST',
        headers: {
            'Authorization': razorpayAuthHeader(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            plan_id: planId,
            total_count: 120,         // 120 months = 10 years (effectively "until cancelled")
            quantity: 1,
            customer_notify: 1,
            notes: { user_id: userId, user_email: userEmail },
            // Notify Razorpay to send emails
            notify_info: { notify_phone: '', notify_email: userEmail },
        }),
    });

    if (!subRes.ok) {
        const err = await subRes.text();
        throw new Error(`Razorpay subscription error (${subRes.status}): ${err}`);
    }

    const sub = await subRes.json() as any;

    // 2. Return hosted checkout short_url
    const checkoutUrl = `https://rzp.io/l/${sub.short_url ?? sub.id}`;
    // Razorpay returns short_url directly on the subscription object
    return sub.short_url ?? checkoutUrl;
}

/**
 * Create a Razorpay Payment Link for one-time credit top-ups.
 */
async function createRazorpayPaymentLink(
    amount: number,   // in smallest currency unit (paise for INR, cents for USD)
    currency: string,
    userId: string,
    userEmail: string,
    credits: number,
): Promise<string> {
    const res = await fetch(`${RAZORPAY_BASE_URL}/payment_links`, {
        method: 'POST',
        headers: {
            'Authorization': razorpayAuthHeader(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            amount,
            currency,
            description: `CloseClaw Credit Top-up — ${credits} credits`,
            customer: { email: userEmail },
            notes: { user_id: userId, credits: String(credits), type: 'topup' },
            callback_url: `${APP_URL}/dashboard?cc_topup=success`,
            callback_method: 'get',
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Razorpay payment link error (${res.status}): ${err}`);
    }

    const json = await res.json() as any;
    return json.short_url as string;
}

/**
 * Verify Razorpay webhook signature.
 * Razorpay signs with HMAC-SHA256 using the webhook secret.
 */
function verifyRazorpayWebhook(rawBody: string, signature: string): boolean {
    if (!RAZORPAY_WEBHOOK_SECRET || !signature) return false;
    const hmac = createHmac('sha256', RAZORPAY_WEBHOOK_SECRET);
    hmac.update(rawBody);
    const digest = hmac.digest('hex');
    try {
        return timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(signature, 'hex'));
    } catch {
        return false;
    }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/billing/portal — Customer self-service portal URL
// Razorpay doesn't have a hosted billing portal like Stripe/Dodo.
// We redirect the customer to their subscription management page on Razorpay.
billingRoutes.get('/portal', authMiddleware, async (c) => {
    const userId = c.get('userId' as never) as string;
    const { data: user } = await supabase.from('users')
        .select('razorpay_subscription_id, plan').eq('id', userId).single();
    if (!user?.razorpay_subscription_id || user.plan === 'none' || user.plan === 'cancelled')
        return c.json({ ok: false, error: 'No active subscription' }, 404);

    // Razorpay doesn't have a self-service portal URL — return a support email fallback
    // or deep-link to their subscription page if you have the sub ID
    const portalUrl = `mailto:support@closeclaw.in?subject=Manage%20Subscription&body=My%20subscription%20ID%3A%20${user.razorpay_subscription_id}`;
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

// POST /api/billing/checkout — Create subscription checkout URL
billingRoutes.post('/checkout', authMiddleware, async (c) => {
    const userId = c.get('userId' as never) as string;
    const userEmail = (c.get('userEmail' as never) as string) ?? '';
    const { planName } = await c.req.json() as { planName: string };

    const plan = PLANS[planName];
    if (!plan) return c.json({ ok: false, error: 'Invalid plan' }, 400);
    if (!plan.planId) return c.json({ ok: false, error: 'Plan not configured' }, 500);

    try {
        const checkoutUrl = await createRazorpaySubscription(plan.planId, userId, userEmail);
        return c.json({ ok: true, data: { checkoutUrl } });
    } catch (err: any) {
        return c.json({ ok: false, error: err.message || 'Failed to create checkout' }, 500);
    }
});

// POST /api/billing/topup — Create credit top-up payment link
billingRoutes.post('/topup', authMiddleware, async (c) => {
    const userId = c.get('userId' as never) as string;
    const userEmail = (c.get('userEmail' as never) as string) ?? '';
    const { pack } = await c.req.json() as { pack: string };

    const creditPack = CREDIT_PACKS[pack];
    if (!creditPack) return c.json({ ok: false, error: 'Invalid credit pack' }, 400);

    try {
        // Currency: USD (cents). Change to 'INR' and multiply by ~83 if billing in INR.
        const checkoutUrl = await createRazorpayPaymentLink(
            creditPack.amount,
            'USD',
            userId,
            userEmail,
            creditPack.credits,
        );
        return c.json({ ok: true, data: { checkoutUrl } });
    } catch (err: any) {
        return c.json({ ok: false, error: err.message || 'Failed to create top-up link' }, 500);
    }
});

// POST /api/billing/webhook — Razorpay webhook (HMAC-SHA256 verified)
billingRoutes.post('/webhook', async (c) => {
    const signature = c.req.header('x-razorpay-signature') ?? '';
    const rawBody = await c.req.text();

    if (!verifyRazorpayWebhook(rawBody, signature)) {
        console.error('[billing/webhook] Invalid Razorpay signature');
        return c.json({ ok: false, error: 'Invalid signature' }, 401);
    }

    let event: any;
    try {
        event = JSON.parse(rawBody);
    } catch {
        return c.json({ ok: false, error: 'Invalid JSON' }, 400);
    }

    const eventType = event.event as string;
    const payload = event.payload ?? {};

    console.log(`[billing/webhook] ${eventType}`);

    // ── Subscription activated ──────────────────────────────────────────────
    // Fired when a subscription's first payment succeeds.
    if (eventType === 'subscription.activated') {
        const sub = payload.subscription?.entity ?? {};
        const planId = String(sub.plan_id ?? '');
        const subId = String(sub.id ?? '');
        const userId = String(sub.notes?.user_id ?? '');
        const renewsAt = sub.current_end ? new Date(sub.current_end * 1000).toISOString() : null;

        if (!userId) return c.json({ ok: true });

        const planCfg = getPlanByPlanId(planId);
        if (!planCfg) {
            console.warn(`[billing/webhook] Unknown plan_id: ${planId}`);
            return c.json({ ok: true });
        }

        await supabase.from('users').update({
            plan: planCfg.planKey,
            api_credits: planCfg.credits,
            api_credits_cap: planCfg.credits,
            razorpay_subscription_id: subId,
            subscription_renews_at: renewsAt,
        }).eq('id', userId);

        console.log(`[billing/webhook] Subscription activated: user=${userId} plan=${planCfg.planKey}`);
    }

    // ── Subscription charged (renewal) ─────────────────────────────────────
    // Fired every billing cycle after the first.
    if (eventType === 'subscription.charged') {
        const sub = payload.subscription?.entity ?? {};
        const planId = String(sub.plan_id ?? '');
        const userId = String(sub.notes?.user_id ?? '');
        const renewsAt = sub.current_end ? new Date(sub.current_end * 1000).toISOString() : null;

        if (!userId) return c.json({ ok: true });

        const planCfg = getPlanByPlanId(planId);
        if (!planCfg) return c.json({ ok: true });

        await supabase.from('users').update({
            api_credits: planCfg.credits,
            api_credits_cap: planCfg.credits,
            subscription_renews_at: renewsAt,
        }).eq('id', userId);

        console.log(`[billing/webhook] Subscription renewed: user=${userId} credits reset to ${planCfg.credits}`);
    }

    // ── Subscription cancelled ─────────────────────────────────────────────
    if (eventType === 'subscription.cancelled') {
        const sub = payload.subscription?.entity ?? {};
        const userId = String(sub.notes?.user_id ?? '');

        if (!userId) return c.json({ ok: true });

        await supabase.from('users')
            .update({ plan: 'cancelled' })
            .eq('id', userId);

        console.log(`[billing/webhook] Subscription cancelled: user=${userId}`);
    }

    // ── Payment captured (one-time credit top-ups) ─────────────────────────
    if (eventType === 'payment.captured') {
        const payment = payload.payment?.entity ?? {};
        const userId = String(payment.notes?.user_id ?? '');
        const credits = Number(payment.notes?.credits ?? 0);
        const type = String(payment.notes?.type ?? '');

        if (!userId || type !== 'topup' || credits <= 0) return c.json({ ok: true });

        await supabase.rpc('add_api_credits', { p_user_id: userId, p_amount: credits });
        await supabase.rpc('sync_credits_cap', { p_user_id: userId });

        console.log(`[billing/webhook] Credits topped up: user=${userId} +${credits}`);
    }

    return c.json({ ok: true });
});
