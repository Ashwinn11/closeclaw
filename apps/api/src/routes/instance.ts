import { Hono } from 'hono';

export const instanceRoutes = new Hono();

// GET /api/instances/mine — Get user's claimed instance
instanceRoutes.get('/mine', async (c) => {
    // TODO: look up instance by authenticated user ID
    return c.json({ ok: true, data: null });
});

// POST /api/instances/claim — Claim an available pool instance
instanceRoutes.post('/claim', async (c) => {
    // TODO: find pool-available instance, tag as claimed, return details
    return c.json({ ok: true, data: { id: 'stub-instance', status: 'claiming' } });
});

// GET /api/instances/:id/health — Proxy health check to Gateway
instanceRoutes.get('/:id/health', async (c) => {
    const id = c.req.param('id');
    // TODO: connect to Gateway via WS RPC, call `health`
    return c.json({ ok: true, data: { instanceId: id, gateway: 'healthy' } });
});
