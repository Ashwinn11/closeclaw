import { Hono } from 'hono';
import { supabase } from '../services/supabase.js';
import { createGatewayRpcClient } from '../services/gateway-rpc.js';

export const proxyRoutes = new Hono();

// ─── Synthetic "credits exhausted" responses ─────────────────────────────────

const EXHAUSTED_MSG = '⚠️ Your API Credits have been exhausted. Top up at closeclaw.in/billing.';

function creditsExhaustedOpenAI() {
    return {
        id: 'cc-exhausted',
        object: 'chat.completion',
        choices: [{
            index: 0,
            message: { role: 'assistant', content: EXHAUSTED_MSG },
            finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
}

function creditsExhaustedOpenAIResponses() {
    return {
        id: 'resp_cc_exhausted',
        object: 'response',
        status: 'completed',
        output: [{
            type: 'message',
            id: 'msg_cc_exhausted',
            role: 'assistant',
            content: [{ type: 'output_text', text: EXHAUSTED_MSG }],
        }],
        usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    };
}

function creditsExhaustedAnthropic() {
    return {
        id: 'cc-exhausted',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: EXHAUSTED_MSG }],
        model: 'unknown',
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 0 },
    };
}

function creditsExhaustedGoogle() {
    return {
        candidates: [{
            content: { role: 'model', parts: [{ text: EXHAUSTED_MSG }] },
            finishReason: 'STOP',
            index: 0,
        }],
        usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 },
    };
}

// ─── Billing markup ───────────────────────────────────────────────────────────

const USAGE_FLOOR = 0.001;          // $0.001 minimum charge per request (markup is in gateway-config model costs)

// ─── Auth + credits caches ────────────────────────────────────────────────────
// gateway_token never changes — cache forever
// api_credits has a short TTL to stay responsive to deductions

type InstanceAuth = {
    userId: string;
    instanceId: string;
    internalIp: string;
    gatewayPort: number;
    gatewayToken: string;
};

const authCache = new Map<string, InstanceAuth>();
const creditsCache = new Map<string, { credits: number; expiresAt: number }>();
const CREDITS_CACHE_TTL = 3000; // 3 seconds

async function resolveGatewayToken(
    authHeader: string | undefined,
    keyParam?: string,
    googApiKey?: string,
): Promise<InstanceAuth | null> {
    let token: string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
    } else if (googApiKey) {
        token = googApiKey;
    } else if (keyParam) {
        token = keyParam;
    }
    if (!token) return null;

    const cached = authCache.get(token);
    if (cached) return cached;

    const { data: instance, error } = await supabase
        .from('instances')
        .select('id, user_id, internal_ip, gateway_port, gateway_token')
        .eq('gateway_token', token)
        .single();

    if (error || !instance) return null;

    const auth: InstanceAuth = {
        userId: instance.user_id,
        instanceId: instance.id,
        internalIp: instance.internal_ip,
        gatewayPort: instance.gateway_port || 18789,
        gatewayToken: token,
    };
    authCache.set(token, auth);
    return auth;
}

async function getApiCredits(userId: string): Promise<number> {
    const cached = creditsCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.credits;

    const { data, error } = await supabase
        .from('users')
        .select('api_credits')
        .eq('id', userId)
        .single();

    const credits = (!error && data) ? Number(data.api_credits) || 0 : 0;
    creditsCache.set(userId, { credits, expiresAt: Date.now() + CREDITS_CACHE_TTL });
    return credits;
}

// ─── Sessions.usage sync ──────────────────────────────────────────────────────
// Called fire-and-forget after each proxied call.
// OpenClaw calculates cost natively via models.providers.<provider>.models[].cost
// (set in gateway-config endpoint in channels.ts). sessions.usage returns accurate totalCost.
//
// Session reset detection via token snapshot:
//   - currentTokens >= lastTokens → normal, delta = currentCost - lastCost
//   - currentTokens < lastTokens  → reset (Gateway restarted), delta = currentCost

const syncInFlight = new Set<string>();

async function syncSessionsUsage(auth: InstanceAuth): Promise<void> {
    if (syncInFlight.has(auth.instanceId)) return;
    syncInFlight.add(auth.instanceId);

    try {
        const since = new Date();
        since.setDate(since.getDate() - 30);
        const startDate = since.toISOString().split('T')[0];

        const rpc = createGatewayRpcClient(auth.internalIp, auth.gatewayPort, auth.gatewayToken);
        let currentCost = 0;
        let currentTokens = 0;

        try {
            const usage = await rpc.call('sessions.usage', { startDate }) as any;
            currentCost = Number(usage?.totals?.totalCost ?? 0);
            currentTokens = Number(usage?.totals?.totalTokens ?? 0);
    
        } finally {
            rpc.disconnect();
        }

        if (currentTokens < 1) return;

        const { data: inst } = await supabase
            .from('instances')
            .select('last_usage_cost, last_usage_tokens')
            .eq('id', auth.instanceId)
            .single();

        const lastTokens = Number(inst?.last_usage_tokens ?? 0);
        const lastCost = Number(inst?.last_usage_cost ?? 0);

        let delta: number;
        if (currentTokens >= lastTokens) {
            delta = currentCost - lastCost;
        } else {
            // Session reset — charge full current cost
            delta = currentCost;
            console.log(`[proxy/sync] session reset instance=${auth.instanceId} lastTokens=${lastTokens} currentTokens=${currentTokens}`);
        }

        await supabase
            .from('instances')
            .update({
                last_usage_cost: currentCost,
                last_usage_tokens: currentTokens,
                last_usage_synced_at: new Date().toISOString(),
            })
            .eq('id', auth.instanceId);

        if (delta < 0.000001) return;

        // Apply floor — markup is already baked into gateway-config model costs
        const charged = Math.max(delta, USAGE_FLOOR);

        // Invalidate credits cache so next request sees updated balance
        creditsCache.delete(auth.userId);
        await supabase.rpc('deduct_api_credits', { p_user_id: auth.userId, p_amount: charged });

        console.log(`[proxy/sync] user=${auth.userId} raw=$${delta.toFixed(6)} charged=$${charged.toFixed(6)} current=$${currentCost.toFixed(6)} last=$${lastCost.toFixed(6)}`);
    } catch (err) {
        console.warn('[proxy/sync] sessions.usage sync failed:', err);
    } finally {
        syncInFlight.delete(auth.instanceId);
    }
}

// ─── OpenAI proxy ─────────────────────────────────────────────────────────────
// Handles both Chat Completions (/v1/chat/completions) and Responses API (/v1/responses).
// Responses API is used by gpt-5.2-codex (api: "openai-responses" in gateway-config).

proxyRoutes.all('/openai/*', async (c) => {
    const auth = await resolveGatewayToken(c.req.header('Authorization'));
    if (!auth) return c.json({ ok: false, error: 'Invalid gateway token' }, 401);

    // Read body to detect stream flag and Responses API path
    const bodyText = await c.req.text();
    let parsedBody: any = {};
    try { parsedBody = JSON.parse(bodyText); } catch { /* ignore */ }

    const url = new URL(c.req.url);
    const upstreamPath = url.pathname.replace(/^\/api\/proxy\/openai/, '');
    const isResponsesApi = upstreamPath.startsWith('/v1/responses');

    const credits = await getApiCredits(auth.userId);
    if (credits <= 0) {
        const isStreaming = parsedBody.stream === true || (c.req.header('Accept') ?? '').includes('text/event-stream');

        if (isResponsesApi) {
            // Responses API SSE uses named events — standard data:[DONE] format won't work
            const itemId = 'msg_cc_exhausted';
            const response = creditsExhaustedOpenAIResponses();
            if (isStreaming) {
                const events = [
                    `event: response.created\ndata: ${JSON.stringify({ type: 'response.created', response: { ...response, status: 'in_progress', output: [] } })}`,
                    `event: response.output_item.added\ndata: ${JSON.stringify({ type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: itemId, status: 'in_progress', role: 'assistant', content: [] } })}`,
                    `event: response.content_part.added\ndata: ${JSON.stringify({ type: 'response.content_part.added', item_id: itemId, output_index: 0, content_index: 0, part: { type: 'output_text', text: '' } })}`,
                    `event: response.output_text.delta\ndata: ${JSON.stringify({ type: 'response.output_text.delta', item_id: itemId, output_index: 0, content_index: 0, delta: EXHAUSTED_MSG })}`,
                    `event: response.output_text.done\ndata: ${JSON.stringify({ type: 'response.output_text.done', item_id: itemId, output_index: 0, content_index: 0, text: EXHAUSTED_MSG })}`,
                    `event: response.output_item.done\ndata: ${JSON.stringify({ type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: itemId, status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: EXHAUSTED_MSG }] } })}`,
                    `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response })}`,
                ].join('\n\n') + '\n\n';
                return new Response(events, { status: 200, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
            }
            return c.json(response, 200);
        }

        const exhausted = creditsExhaustedOpenAI();
        if (isStreaming) {
            const sseBody = `data: ${JSON.stringify(exhausted)}\n\ndata: [DONE]\n\n`;
            return new Response(sseBody, { status: 200, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
        }
        return c.json(exhausted, 200);
    }

    const openaiKey = process.env.OPENAI_API_KEY ?? '';

    // Responses API requires store:true for previous_response_id to work across turns
    let forwardBody = bodyText;
    if (isResponsesApi && parsedBody && typeof parsedBody === 'object') {
        forwardBody = JSON.stringify({ ...parsedBody, store: true });
    }

    const upstreamReq = new Request(`https://api.openai.com${upstreamPath}${url.search}`, {
        method: c.req.method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: forwardBody,
    });

    const upstream = await fetch(upstreamReq);
    const contentType = upstream.headers.get('Content-Type') || '';
    const isStream = contentType.includes('text/event-stream');

    if (isStream) {
        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
        const writer = writable.getWriter();
        const reader = upstream.body!.getReader();
        (async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    writer.write(value);
                }
            } finally {
                writer.close();
            }
            syncSessionsUsage(auth).catch(console.error);
        })();
        return new Response(readable, {
            status: upstream.status,
            headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
        });
    } else {
        const body = await upstream.text();
        syncSessionsUsage(auth).catch(console.error);
        return new Response(body, {
            status: upstream.status,
            headers: { 'Content-Type': contentType || 'application/json' },
        });
    }
});

// ─── Anthropic proxy ──────────────────────────────────────────────────────────

proxyRoutes.all('/anthropic/*', async (c) => {
    const auth = await resolveGatewayToken(c.req.header('Authorization'));
    if (!auth) return c.json({ ok: false, error: 'Invalid gateway token' }, 401);

    const credits = await getApiCredits(auth.userId);
    if (credits <= 0) {
        const wantsSSE = (c.req.header('Accept') ?? '').includes('text/event-stream');
        if (wantsSSE) {
            const msg = { ...creditsExhaustedAnthropic(), content: [] };
            const sseBody = [
                `event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: msg })}`,
                `event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}`,
                `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: EXHAUSTED_MSG } })}`,
                `event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}`,
                `event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 0 } })}`,
                `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}`,
            ].join('\n\n') + '\n\n';
            return new Response(sseBody, { status: 200, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
        }
        return c.json(creditsExhaustedAnthropic(), 200);
    }

    const url = new URL(c.req.url);
    const upstreamPath = url.pathname.replace(/^\/api\/proxy\/anthropic/, '');
    const anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';

    const upstreamReq = new Request(`https://api.anthropic.com${upstreamPath}${url.search}`, {
        method: c.req.method,
        headers: {
            'Content-Type': c.req.header('Content-Type') || 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': c.req.header('anthropic-version') || '2023-06-01',
        },
        body: c.req.raw.body,
        // @ts-ignore
        duplex: 'half',
    });

    const upstream = await fetch(upstreamReq);
    const contentType = upstream.headers.get('Content-Type') || '';
    const isStream = contentType.includes('text/event-stream');

    if (isStream) {
        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
        const writer = writable.getWriter();
        const reader = upstream.body!.getReader();
        (async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    writer.write(value);
                }
            } finally {
                writer.close();
            }
            syncSessionsUsage(auth).catch(console.error);
        })();
        return new Response(readable, {
            status: upstream.status,
            headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
        });
    } else {
        const body = await upstream.text();
        syncSessionsUsage(auth).catch(console.error);
        return new Response(body, {
            status: upstream.status,
            headers: { 'Content-Type': contentType || 'application/json' },
        });
    }
});

// ─── Google proxy ─────────────────────────────────────────────────────────────

proxyRoutes.all('/google/*', async (c) => {
    const url = new URL(c.req.url);
    const auth = await resolveGatewayToken(
        c.req.header('Authorization'),
        url.searchParams.get('key') ?? undefined,
        c.req.header('x-goog-api-key') ?? undefined,
    );
    if (!auth) return c.json({ ok: false, error: 'Invalid gateway token' }, 401);

    const upstreamPath = url.pathname.replace(/^\/api\/proxy\/google/, '');
    const isStreamReq = upstreamPath.includes(':streamGenerateContent') ||
        (c.req.header('Accept') ?? '').includes('text/event-stream');

    const credits = await getApiCredits(auth.userId);
    if (credits <= 0) {
        if (isStreamReq) {
            const sseBody = `data: ${JSON.stringify(creditsExhaustedGoogle())}\n\n`;
            return new Response(sseBody, { status: 200, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
        }
        return c.json(creditsExhaustedGoogle(), 200);
    }

    const googleKey = process.env.GEMINI_API_KEY ?? '';
    const params = new URLSearchParams(url.search);
    params.delete('key');
    const remaining = params.toString();
    const upstreamSearch = remaining ? `?${remaining}&key=${googleKey}` : `?key=${googleKey}`;

    const upstreamReq = new Request(`https://generativelanguage.googleapis.com${upstreamPath}${upstreamSearch}`, {
        method: c.req.method,
        headers: { 'Content-Type': c.req.header('Content-Type') || 'application/json' },
        body: c.req.raw.body,
        // @ts-ignore
        duplex: 'half',
    });

    const upstream = await fetch(upstreamReq);
    const contentType = upstream.headers.get('Content-Type') || '';

    if (isStreamReq) {
        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
        const writer = writable.getWriter();
        const reader = upstream.body!.getReader();
        (async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    writer.write(value);
                }
            } finally {
                writer.close();
            }
            syncSessionsUsage(auth).catch(console.error);
        })();
        return new Response(readable, {
            status: upstream.status,
            headers: { 'Content-Type': contentType || 'application/json', 'X-Accel-Buffering': 'no' },
        });
    } else {
        const body = await upstream.text();
        syncSessionsUsage(auth).catch(console.error);
        return new Response(body, {
            status: upstream.status,
            headers: { 'Content-Type': contentType || 'application/json' },
        });
    }
});
