import type { Context, Next } from 'hono';
import { supabase } from '../services/supabase.js';

/**
 * JWT auth middleware — validates Supabase access token from Authorization header.
 * Sets `c.set('userId', ...)` on success.
 */
export async function authMiddleware(c: Context, next: Next) {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ ok: false, error: 'Missing authorization' }, 401);
    }

    const token = authHeader.slice(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
        return c.json({ ok: false, error: 'Invalid token' }, 401);
    }

    c.set('userId', user.id);
    c.set('userEmail', user.email);
    await next();
}
