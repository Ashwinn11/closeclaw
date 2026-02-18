import { Hono } from 'hono';

export const billingRoutes = new Hono();

// POST /api/billing/checkout — Mock billing checkout
billingRoutes.post('/checkout', async (c) => {
    const body = await c.req.json();
    const { plan } = body as { plan: string };

    // Mock: always succeeds
    return c.json({
        ok: true,
        data: { plan, status: 'active', message: 'Mock checkout successful' },
    });
});

// GET /api/billing/status — Get billing status
billingRoutes.get('/status', async (c) => {
    return c.json({ ok: true, data: { plan: 'free', status: 'active' } });
});
