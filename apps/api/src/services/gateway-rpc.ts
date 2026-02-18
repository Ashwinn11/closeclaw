/**
 * Gateway WS RPC Client
 *
 * Connects to an OpenClaw Gateway instance via WebSocket and sends RPC calls.
 * Authentication uses token auth with role: "operator", scopes: ["operator.admin"].
 *
 * Token resolution on the Gateway side:
 *   gateway.auth.token (from openclaw.json) → OPENCLAW_GATEWAY_TOKEN (env var)
 */

import WebSocket from 'ws';
import type { GatewayRpcRequest, GatewayRpcMethod } from '@closeclaw/shared';

type GatewayConnection = {
    ws: WebSocket;
    pending: Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
    seq: number;
};

export function createGatewayRpcClient(tailscaleIp: string, port: number, token: string) {
    let conn: GatewayConnection | null = null;

    async function connect(): Promise<GatewayConnection> {
        if (conn?.ws.readyState === WebSocket.OPEN) return conn;

        return new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://${tailscaleIp}:${port}`);
            const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
            const connection: GatewayConnection = { ws, pending, seq: 0 };

            ws.on('open', () => {
                // Send connect handshake
                ws.send(JSON.stringify({
                    type: 'connect',
                    params: {
                        role: 'operator',
                        scopes: ['operator.admin'],
                        auth: { token },
                        client: { name: 'closeclaw-api', version: '0.0.1' },
                    },
                }));
            });

            ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data.toString());

                    // Handle connect response
                    if (msg.type === 'connected') {
                        conn = connection;
                        resolve(connection);
                        return;
                    }

                    // Handle RPC responses
                    if (msg.id && pending.has(msg.id)) {
                        const handler = pending.get(msg.id)!;
                        pending.delete(msg.id);
                        if (msg.error) {
                            handler.reject(new Error(msg.error.message ?? 'RPC error'));
                        } else {
                            handler.resolve(msg.result);
                        }
                    }
                } catch {
                    // ignore parse errors
                }
            });

            ws.on('error', (err) => {
                reject(err);
                conn = null;
            });

            ws.on('close', () => {
                conn = null;
                for (const [, handler] of pending) {
                    handler.reject(new Error('Connection closed'));
                }
                pending.clear();
            });

            // Timeout after 10s
            setTimeout(() => {
                if (ws.readyState !== WebSocket.OPEN) {
                    ws.terminate();
                    reject(new Error('Gateway connection timeout'));
                }
            }, 10_000);
        });
    }

    async function call(method: GatewayRpcMethod, params?: Record<string, unknown>): Promise<unknown> {
        const connection = await connect();
        const id = `rpc-${++connection.seq}`;

        return new Promise((resolve, reject) => {
            connection.pending.set(id, { resolve, reject });

            const request: GatewayRpcRequest = { id, method, params };
            connection.ws.send(JSON.stringify(request));

            // Timeout per-call
            setTimeout(() => {
                if (connection.pending.has(id)) {
                    connection.pending.delete(id);
                    reject(new Error(`RPC timeout: ${method}`));
                }
            }, 15_000);
        });
    }

    function disconnect() {
        if (conn) {
            conn.ws.close();
            conn = null;
        }
    }

    return { call, disconnect, connect };
}
