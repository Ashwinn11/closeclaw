import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../services/supabase.js';

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

// POST /api/auth/delete — Delete user account
authRoutes.post('/delete', authMiddleware, async (c) => {
    const userId = c.get('userId' as never) as string;

    // Supabase Admin SDK guarantees cascading deletes for their ID
    const { error } = await supabase.auth.admin.deleteUser(userId);

    if (error) {
        console.error(`[Auth] Failed to delete user ${userId}:`, error.message);
        return c.json({ ok: false, error: 'Failed to delete account' }, 500);
    }

    return c.json({ ok: true, message: 'Account deleted' });
});
