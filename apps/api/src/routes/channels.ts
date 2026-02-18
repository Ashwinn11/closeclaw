import { Hono } from 'hono';

export const channelRoutes = new Hono();

// POST /api/channels/setup — Configure a channel on user's Gateway
channelRoutes.post('/setup', async (c) => {
    // TODO: receive { channel, token }, call config.patch via Gateway WS RPC
    // Sets dmPolicy: "open" + allowFrom: ["*"]
    const body = await c.req.json();
    const { channel, token: _token } = body as { channel: string; token: string };

    // TODO: connect to user's Gateway → config.patch
    return c.json({
        ok: true,
        data: { channel, status: 'configured', message: `${channel} enabled with dmPolicy: open` },
    });
});

// GET /api/channels/status — Get channel status from Gateway
channelRoutes.get('/status', async (c) => {
    // TODO: call channels.status via Gateway WS RPC
    return c.json({ ok: true, data: { channels: [] } });
});
