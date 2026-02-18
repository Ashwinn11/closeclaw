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
}): Promise<{ connection: ChannelConnection; message: string }> {
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

// ─── Instances ─────────────────────────────────────────────────────────────

export async function getMyInstance() {
    return request('/api/instances/mine');
}

// ─── Auth ──────────────────────────────────────────────────────────────────

export async function getMe() {
    return request<{ id: string; email: string }>('/api/auth/me');
}
