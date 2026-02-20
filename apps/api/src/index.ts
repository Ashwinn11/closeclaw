import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRoutes } from './routes/auth.js';
import { instanceRoutes } from './routes/instance.js';
import { channelRoutes } from './routes/channels.js';
import { billingRoutes } from './routes/billing.js';
import { proxyRoutes } from './routes/proxy.js';
import { attachWsProxy } from './ws/proxy.js';

const app = new Hono();

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use('*', logger());
app.use('*', cors({
    origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:3000',
        'https://closeclaw.in',
        'https://www.closeclaw.in',
    ],
    credentials: true,
}));

// ─── Routes ──────────────────────────────────────────────────────────────────

app.route('/api/auth', authRoutes);
app.route('/api/instances', instanceRoutes);
app.route('/api/channels', channelRoutes);
app.route('/api/billing', billingRoutes);
// Proxy routes authenticate via gateway_token, not Supabase JWT
app.route('/api/proxy', proxyRoutes);

// ─── Health ──────────────────────────────────────────────────────────────────

app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }));

// ─── Start ───────────────────────────────────────────────────────────────────

const port = Number(process.env.PORT ?? 3001);

const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`🦀 CloseClaw API listening on http://localhost:${info.port}`);
});

// Attach WebSocket proxy to the HTTP server
// Frontend connects to ws://localhost:3001/ws?token=<jwt>
attachWsProxy(server as unknown as import('node:http').Server);

export default app;
