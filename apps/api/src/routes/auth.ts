import { Hono } from 'hono';

export const authRoutes = new Hono();

// POST /api/auth/callback — Supabase OAuth callback handler
authRoutes.post('/callback', async (c) => {
    // TODO: validate Supabase JWT, create/update user session
    return c.json({ ok: true, message: 'Auth callback stub' });
});

// GET /api/auth/me — Get current user from JWT
authRoutes.get('/me', async (c) => {
    // TODO: extract user from JWT
    return c.json({ ok: true, data: { id: 'stub', email: 'user@example.com' } });
});
