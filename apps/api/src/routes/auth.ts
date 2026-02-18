import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';

export const authRoutes = new Hono();

// GET /api/auth/me — Get current user from JWT
authRoutes.get('/me', authMiddleware, async (c) => {
    const userId = c.get('userId' as never) as string;
    const userEmail = c.get('userEmail' as never) as string;

    return c.json({
        ok: true,
        data: {
            id: userId,
            email: userEmail,
        },
    });
});

// POST /api/auth/logout — Server-side sign out
authRoutes.post('/logout', authMiddleware, async (c) => {
    return c.json({ ok: true, message: 'Logged out' });
});
