// CloseClaw shared types — used by both @closeclaw/web and @closeclaw/api

// ─── Instance ────────────────────────────────────────────────────────────────

export type InstanceStatus = 'pool-available' | 'claiming' | 'provisioning' | 'running' | 'stopped' | 'error';

export type Instance = {
    id: string;
    userId: string | null;
    gcpInstanceName: string;
    internalIp: string;
    gatewayPort: number;
    status: InstanceStatus;
    createdAt: string;
    claimedAt: string | null;
};

// ─── Channels ────────────────────────────────────────────────────────────────

export type ChannelType = 'telegram' | 'discord' | 'slack' | 'whatsapp';

export type ChannelConnection = {
    id: string;
    instanceId: string;
    channel: ChannelType;
    status: 'active' | 'inactive' | 'error';
    configuredAt: string;
};

// ─── Gateway RPC ─────────────────────────────────────────────────────────────

export type GatewayRpcMethod =
    | 'config.get'
    | 'config.patch'
    | 'channels.status'
    | 'cron.list'
    | 'cron.add'
    | 'cron.remove'
    | 'sessions.usage'
    | 'health';

export type GatewayRpcRequest = {
    id: string;
    method: GatewayRpcMethod;
    params?: Record<string, unknown>;
};

export type GatewayRpcResponse = {
    id: string;
    result?: unknown;
    error?: { message: string; code?: number };
};

// ─── API Responses ───────────────────────────────────────────────────────────

export type ApiResponse<T = unknown> = {
    ok: true;
    data: T;
} | {
    ok: false;
    error: string;
};
