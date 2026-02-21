import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function getAuthHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
        throw new Error('Not authenticated');
    }
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
    };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: { ...headers, ...options.headers },
    });

    const json = await res.json();
    if (!json.ok) {
        throw new Error(json.error || 'API request failed');
    }
    return json.data as T;
}

// ─── Channels ──────────────────────────────────────────────────────────────

export interface ChannelConnection {
    id: string;
    user_id: string;
    instance_id: string;
    channel: string;
    status: string;
    created_at: string;
}

export async function setupChannel(params: {
    channel: 'telegram' | 'discord' | 'slack';
    token: string;
    appToken?: string;
    plan: string;
    ownerUserId: string;
}): Promise<{ connection: ChannelConnection; message: string; devMode?: boolean }> {
    return request('/api/channels/setup', {
        method: 'POST',
        body: JSON.stringify(params),
    });
}

export async function listChannels(): Promise<ChannelConnection[]> {
    return request('/api/channels');
}

export async function disconnectChannel(connectionId: string): Promise<{ message: string }> {
    return request(`/api/channels/${connectionId}/disconnect`, { method: 'POST' });
}

export async function getGatewayProviderConfig(): Promise<Record<string, unknown>> {
    return request('/api/channels/gateway-config');
}

export async function verifyChannel(channel: string, token: string): Promise<{ name: string; username: string; id: string }> {
    return request('/api/channels/verify', {
        method: 'POST',
        body: JSON.stringify({ channel, token }),
    });
}

// ─── Instances ─────────────────────────────────────────────────────────────

export async function getMyInstance() {
    return request('/api/instances/mine');
}

// ─── Gateway WebSocket RPC ────────────────────────────────────────────────

let gatewayClient: any = null;

export function setGatewayClient(client: any) {
    gatewayClient = client;
}

function requireGateway() {
    if (!gatewayClient?.isConnected()) {
        throw new Error('Gateway not connected');
    }
    return gatewayClient;
}

export async function getCronJobs(): Promise<any[]> {
    const gw = requireGateway();
    const result = await gw.rpc('cron.list');
    return result.jobs || [];
}

export async function createCronJob(params: any): Promise<any> {
    const gw = requireGateway();
    return gw.rpc('cron.add', params);
}

export async function removeCronJob(id: string): Promise<any> {
    const gw = requireGateway();
    return gw.rpc('cron.remove', { id });
}

export async function getUsageStats(): Promise<{
    messagesThisMonth: number;
    tokensUsed: number;
    costThisMonth: number;
    apiCreditsLeft: number;
    uptime: string;
}> {
    const gw = requireGateway();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startDate = thirtyDaysAgo.toISOString().split('T')[0];

    const usage: any = await gw.rpc('sessions.usage', { startDate });

    // Normalize Gateway byModel shape: Gateway returns totals.input/output, dashboard reads totals.totalTokens
    const rawByModel: any[] = usage.aggregates?.byModel || [];
    const byModel = rawByModel.map((m: any) => ({
        model: m.model,
        provider: m.provider,
        totals: {
            totalTokens: Number(m.totals?.totalTokens ?? (m.totals?.input ?? 0) + (m.totals?.output ?? 0)),
            totalCost: Number(m.totals?.totalCost ?? 0),
        },
    }));

    // Map raw Gateway format to dashboard format
    return {
        messagesThisMonth: usage.totals?.totalMessages || usage.aggregates?.messages?.total || 0,
        tokensUsed: usage.totals?.totalTokens || 0,
        costThisMonth: usage.totals?.totalCost || 0,
        apiCreditsLeft: 0,
        uptime: usage.totals?.uptime || 'N/A',
        byModel,
    } as any;
}

// ─── Gateway Config ────────────────────────────────────────────────────────

export async function getGatewayConfig(): Promise<{ config: Record<string, unknown>; hash: string }> {
    const gw = requireGateway();
    return gw.rpc('config.get');
}

export async function patchGatewayConfig(patch: Record<string, unknown>): Promise<void> {
    const gw = requireGateway();
    const current = await gw.rpc('config.get') as { hash: string };
    await gw.rpc('config.patch', {
        raw: JSON.stringify(patch),
        baseHash: current.hash,
    });
}

// ─── Billing ───────────────────────────────────────────────────────────────

export async function getCredits(): Promise<{
    api_credits: number;
    plan: string;
    api_credits_cap: number;
    subscription_renews_at: string | null;
}> {
    return request('/api/billing/credits');
}

export async function createCheckout(planName: string): Promise<{ checkoutUrl: string }> {
    return request('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ planName }),
    });
}

export async function createTopup(pack: string): Promise<{ checkoutUrl: string }> {
    return request('/api/billing/topup', {
        method: 'POST',
        body: JSON.stringify({ pack }),
    });
}

export async function getBillingPortal(): Promise<{ portalUrl: string }> {
    return request('/api/billing/portal');
}

// ─── Auth ──────────────────────────────────────────────────────────────────

export async function getMe() {
    return request<{ id: string; email: string }>('/api/auth/me');
}
