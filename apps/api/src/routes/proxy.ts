import { Hono } from 'hono';
import { supabase } from '../services/supabase.js';

export const proxyRoutes = new Hono();

// ─── Pricing via LiteLLM ──────────────────────────────────────────────────────
// Fetched once at startup from the community-maintained pricing JSON.
// Falls back to LOCAL_PRICING if fetch fails or model isn't listed yet.

// Our model name → LiteLLM JSON key
const LITELLM_KEY: Record<string, string> = {
    'gpt-5.2-codex':          'gpt-5.2-codex',
    'gemini-3-flash-preview': 'gemini/gemini-3-flash-preview',
    'claude-sonnet-4-6':      'claude-sonnet-4-6',
};

// Local fallback in case a model isn't in LiteLLM yet (verified from official pricing pages)
const LOCAL_PRICING: Record<string, { input: number; output: number }> = {
    'gpt-5.2-codex':          { input: 0.00000175, output: 0.000014 },
    'gemini-3-flash-preview': { input: 0.0000005,  output: 0.000003 },
    'claude-sonnet-4-6':      { input: 0.000003,   output: 0.000015 },
};

const FALLBACK_PRICING = { input: 0.000001, output: 0.000002 };

type LiteLLMEntry = { input_cost_per_token?: number; output_cost_per_token?: number };
let litellmPricing: Record<string, LiteLLMEntry> = {};

fetch('https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json')
    .then(r => r.json())
    .then(data => { litellmPricing = data as Record<string, LiteLLMEntry>; console.log('[proxy] LiteLLM pricing loaded'); })
    .catch(() => console.warn('[proxy] LiteLLM pricing fetch failed — using local table'));

function computeCost(model: string | null, inputTokens: number, outputTokens: number): number {
    if (model) {
        // 1. Try LiteLLM (always up-to-date)
        const key = LITELLM_KEY[model] ?? model;
        const entry = litellmPricing[key];
        if (entry?.input_cost_per_token && entry?.output_cost_per_token) {
            return inputTokens * entry.input_cost_per_token + outputTokens * entry.output_cost_per_token;
        }
        // 2. Fall back to locally verified prices
        const local = LOCAL_PRICING[model];
        if (local) return inputTokens * local.input + outputTokens * local.output;
    }
    return inputTokens * FALLBACK_PRICING.input + outputTokens * FALLBACK_PRICING.output;
}

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

// ─── Auth helper: gateway_token → { userId, instanceId } ─────────────────────

async function resolveGatewayToken(authHeader: string | undefined, keyParam?: string, googApiKey?: string): Promise<{ userId: string; instanceId: string } | null> {
    let token: string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
    } else if (googApiKey) {
        token = googApiKey;
    } else if (keyParam) {
        token = keyParam;
    }
    if (!token) return null;

    const { data: instance, error } = await supabase
        .from('instances')
        .select('id, user_id')
        .eq('gateway_token', token)
        .single();

    if (error || !instance) return null;
    return { userId: instance.user_id, instanceId: instance.id };
}

async function getApiCredits(userId: string): Promise<number> {
    const { data, error } = await supabase
        .from('users')
        .select('api_credits')
        .eq('id', userId)
        .single();
    if (error || !data) return 0;
    return Number(data.api_credits) || 0;
}

async function deductAndLog(params: {
    userId: string;
    instanceId: string;
    provider: string;
    model: string | null;
    inputTokens: number;
    outputTokens: number;
}) {
    const { userId, instanceId, provider, model, inputTokens, outputTokens } = params;
    const cost = computeCost(model, inputTokens, outputTokens);

    // Deduct from api_credits (clamp to 0 — no negative credits)
    await supabase.rpc('deduct_api_credits', { p_user_id: userId, p_amount: cost });

    // Insert usage log row
    await supabase.from('usage_log').insert({
        user_id: userId,
        instance_id: instanceId || null,
        provider,
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost,
    });
}


// ─── OpenAI proxy ─────────────────────────────────────────────────────────────
// Handles: POST /api/proxy/openai/v1/*

proxyRoutes.all('/openai/*', async (c) => {
    const auth = await resolveGatewayToken(c.req.header('Authorization'));
    if (!auth) return c.json({ ok: false, error: 'Invalid gateway token' }, 401);

    const credits = await getApiCredits(auth.userId);
    if (credits <= 0) {
        return c.json(creditsExhaustedOpenAI(), 200);
    }

    // Build upstream URL: strip /api/proxy/openai prefix, forward the rest
    const url = new URL(c.req.url);
    const upstreamPath = url.pathname.replace(/^\/api\/proxy\/openai/, '');
    const upstreamUrl = `https://api.openai.com${upstreamPath}${url.search}`;

    const openaiKey = process.env.OPENAI_API_KEY ?? '';

    // Forward request with real API key
    const reqBody = c.req.raw.body;
    const upstreamReq = new Request(upstreamUrl, {
        method: c.req.method,
        headers: {
            'Content-Type': c.req.header('Content-Type') || 'application/json',
            'Authorization': `Bearer ${openaiKey}`,
        },
        body: reqBody,
        // @ts-ignore — duplex needed for streaming request bodies in Node
        duplex: 'half',
    });

    const upstream = await fetch(upstreamReq);

    // Parse model from request body for cost computation (best-effort)
    let model: string | null = null;
    let inputTokens = 0;
    let outputTokens = 0;

    const contentType = upstream.headers.get('Content-Type') || '';
    const isStream = contentType.includes('text/event-stream');

    if (isStream) {
        // Stream SSE back to client, capture the final [DONE] chunk for usage
        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
        const writer = writable.getWriter();
        const decoder = new TextDecoder();
        let buffer = '';

        const reader = upstream.body!.getReader();
        (async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    writer.write(value);

                    // Parse SSE chunks for usage in final chunk
                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';
                    for (const line of lines) {
                        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
                        try {
                            const chunk = JSON.parse(line.slice(6));
                            if (chunk.model) model = chunk.model;
                            if (chunk.usage) {
                                inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
                                outputTokens = chunk.usage.completion_tokens ?? outputTokens;
                            }
                        } catch { /* ignore parse errors */ }
                    }
                }
            } finally {
                writer.close();
            }
            // Deduct after stream completes
            if (inputTokens > 0 || outputTokens > 0) {
                deductAndLog({ userId: auth.userId, instanceId: auth.instanceId, provider: 'openai', model, inputTokens, outputTokens }).catch(console.error);
            }
        })();

        return new Response(readable, {
            status: upstream.status,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
            },
        });
    } else {
        // Non-streaming: parse JSON response for usage
        const body = await upstream.text();
        try {
            const json = JSON.parse(body);
            model = json.model ?? null;
            inputTokens = json.usage?.prompt_tokens ?? 0;
            outputTokens = json.usage?.completion_tokens ?? 0;
        } catch { /* ignore */ }

        if (inputTokens > 0 || outputTokens > 0) {
            deductAndLog({ userId: auth.userId, instanceId: auth.instanceId, provider: 'openai', model, inputTokens, outputTokens }).catch(console.error);
        }

        return new Response(body, {
            status: upstream.status,
            headers: { 'Content-Type': contentType || 'application/json' },
        });
    }
});

// ─── Anthropic proxy ──────────────────────────────────────────────────────────
// Handles: POST /api/proxy/anthropic/*

proxyRoutes.all('/anthropic/*', async (c) => {
    const auth = await resolveGatewayToken(c.req.header('Authorization'));
    if (!auth) return c.json({ ok: false, error: 'Invalid gateway token' }, 401);

    const credits = await getApiCredits(auth.userId);
    if (credits <= 0) {
        return c.json(creditsExhaustedAnthropic(), 200);
    }

    const url = new URL(c.req.url);
    const upstreamPath = url.pathname.replace(/^\/api\/proxy\/anthropic/, '');
    const upstreamUrl = `https://api.anthropic.com${upstreamPath}${url.search}`;

    const anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';

    const upstreamReq = new Request(upstreamUrl, {
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

    let model: string | null = null;
    let inputTokens = 0;
    let outputTokens = 0;

    if (isStream) {
        const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
        const writer = writable.getWriter();
        const decoder = new TextDecoder();
        let buffer = '';

        const reader = upstream.body!.getReader();
        (async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    writer.write(value);

                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';
                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        try {
                            const event = JSON.parse(line.slice(6));
                            // message_start contains input_tokens
                            if (event.type === 'message_start' && event.message?.usage) {
                                inputTokens = event.message.usage.input_tokens ?? 0;
                                model = event.message.model ?? null;
                            }
                            // message_delta contains output_tokens
                            if (event.type === 'message_delta' && event.usage) {
                                outputTokens = event.usage.output_tokens ?? 0;
                            }
                        } catch { /* ignore */ }
                    }
                }
            } finally {
                writer.close();
            }
            if (inputTokens > 0 || outputTokens > 0) {
                deductAndLog({ userId: auth.userId, instanceId: auth.instanceId, provider: 'anthropic', model, inputTokens, outputTokens }).catch(console.error);
            }
        })();

        return new Response(readable, {
            status: upstream.status,
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
            },
        });
    } else {
        const body = await upstream.text();
        try {
            const json = JSON.parse(body);
            model = json.model ?? null;
            inputTokens = json.usage?.input_tokens ?? 0;
            outputTokens = json.usage?.output_tokens ?? 0;
        } catch { /* ignore */ }

        if (inputTokens > 0 || outputTokens > 0) {
            deductAndLog({ userId: auth.userId, instanceId: auth.instanceId, provider: 'anthropic', model, inputTokens, outputTokens }).catch(console.error);
        }

        return new Response(body, {
            status: upstream.status,
            headers: { 'Content-Type': contentType || 'application/json' },
        });
    }
});

// ─── Google proxy ─────────────────────────────────────────────────────────────
// Handles: POST /api/proxy/google/*

proxyRoutes.all('/google/*', async (c) => {
    const url = new URL(c.req.url);
    const auth = await resolveGatewayToken(
        c.req.header('Authorization'),
        url.searchParams.get('key') ?? undefined,
        c.req.header('x-goog-api-key') ?? undefined,
    );
    if (!auth) return c.json({ ok: false, error: 'Invalid gateway token' }, 401);

    const credits = await getApiCredits(auth.userId);
    if (credits <= 0) {
        return c.json(creditsExhaustedGoogle(), 200);
    }

    const upstreamPath = url.pathname.replace(/^\/api\/proxy\/google/, '');

    // Google uses ?key= query param — strip the gateway token key, inject real API key
    const googleKey = process.env.GEMINI_API_KEY ?? '';
    const params = new URLSearchParams(url.search);
    params.delete('key');
    const remaining = params.toString();
    const upstreamSearch = remaining ? `?${remaining}&key=${googleKey}` : `?key=${googleKey}`;
    const upstreamUrl = `https://generativelanguage.googleapis.com${upstreamPath}${upstreamSearch}`;

    const upstreamReq = new Request(upstreamUrl, {
        method: c.req.method,
        headers: {
            'Content-Type': c.req.header('Content-Type') || 'application/json',
        },
        body: c.req.raw.body,
        // @ts-ignore
        duplex: 'half',
    });

    const upstream = await fetch(upstreamReq);
    const contentType = upstream.headers.get('Content-Type') || '';

    // Google streaming uses newline-delimited JSON, not SSE
    // But the response may still be chunked; we accumulate and parse on finish
    let model: string | null = null;
    let inputTokens = 0;
    let outputTokens = 0;

    // Detect streaming: Google uses chunked newline-delimited JSON for streaming
    const isStream = c.req.header('Accept') === 'text/event-stream' ||
        upstreamPath.includes(':streamGenerateContent');

    if (isStream) {
        return new Response(upstream.body, {
            status: upstream.status,
            headers: {
                'Content-Type': contentType || 'application/json',
                'X-Accel-Buffering': 'no',
            },
        });
    } else {
        const body = await upstream.text();
        try {
            const json = JSON.parse(body);
            model = json.modelVersion ?? null;
            inputTokens = json.usageMetadata?.promptTokenCount ?? 0;
            outputTokens = json.usageMetadata?.candidatesTokenCount ?? 0;
        } catch { /* ignore */ }

        if (inputTokens > 0 || outputTokens > 0) {
            deductAndLog({ userId: auth.userId, instanceId: auth.instanceId, provider: 'google', model, inputTokens, outputTokens }).catch(console.error);
        }

        return new Response(body, {
            status: upstream.status,
            headers: { 'Content-Type': contentType || 'application/json' },
        });
    }
});
