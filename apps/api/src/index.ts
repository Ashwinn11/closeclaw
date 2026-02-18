import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRoutes } from './routes/auth.js';
import { instanceRoutes } from './routes/instance.js';
import { channelRoutes } from './routes/channels.js';
import { billingRoutes } from './routes/billing.js';

const app = new Hono();

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use('*', logger());
app.use('*', cors({
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
    credentials: true,
}));

// ─── Routes ──────────────────────────────────────────────────────────────────

app.route('/api/auth', authRoutes);
app.route('/api/instances', instanceRoutes);
app.route('/api/channels', channelRoutes);
app.route('/api/billing', billingRoutes);

// ─── Health ──────────────────────────────────────────────────────────────────

app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }));

// ─── Start ───────────────────────────────────────────────────────────────────

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
    console.log(`🦀 CloseClaw API listening on http://localhost:${info.port}`);
});

export default app;
