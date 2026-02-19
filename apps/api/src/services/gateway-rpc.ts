/**
 * Gateway WS RPC Client (Backend)
 *
 * Connects to an OpenClaw Gateway instance via WebSocket and sends RPC calls.
 * Uses the correct Gateway protocol (v3) with challenge-response auth.
 *
 * Protocol:
 *   - Gateway sends { type: "event", event: "connect.challenge", payload: { nonce } }
 *   - Client sends  { type: "req", id, method: "connect", params: { ... } }
 *   - Gateway replies { type: "res", id, ok: true, payload: { type: "hello-ok", ... } }
 *   - Client sends  { type: "req", id, method: "config.patch", params: { ... } }
 *   - Gateway replies { type: "res", id, ok: true/false, payload/error }
 */

import WebSocket from 'ws';
import type { GatewayRpcMethod } from '@closeclaw/shared';

type GatewayConnection = {
    ws: WebSocket;
    pending: Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
    seq: number;
    authenticated: boolean;
};

export function createGatewayRpcClient(tailscaleIp: string, port: number, token: string) {
    let conn: GatewayConnection | null = null;

    async function connect(): Promise<GatewayConnection> {
        if (conn?.ws.readyState === WebSocket.OPEN && conn.authenticated) return conn;

        return new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://${tailscaleIp}:${port}`, {
                headers: {
                    'Origin': `http://${tailscaleIp}:${port}`,
                },
            });
            const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
            const connection: GatewayConnection = { ws, pending, seq: 0, authenticated: false };

            ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data.toString());

                    // Handle challenge → send connect request
                    if (msg.type === 'event' && msg.event === 'connect.challenge') {
                        ws.send(JSON.stringify({
                            type: 'req',
                            id: 'rpc-connect',
                            method: 'connect',
                            params: {
                                minProtocol: 3,
                                maxProtocol: 3,
                                client: {
                                    id: 'gateway-client',
                                    displayName: 'CloseClaw API',
                                    version: '0.0.1',
                                    platform: 'linux',
                                    mode: 'backend',
                                },
                                auth: { token },
                                role: 'operator',
                                scopes: ['operator.admin'],
                                caps: [],
                            },
                        }));
                        return;
                    }

                    // Handle connect response (hello-ok)
                    if (msg.type === 'res' && msg.id === 'rpc-connect') {
                        if (msg.ok) {
                            connection.authenticated = true;
                            conn = connection;
                            resolve(connection);
                        } else {
                            reject(new Error(`Gateway auth failed: ${msg.error?.message ?? 'unknown'}`));
                            ws.close();
                        }
                        return;
                    }

                    // Handle RPC responses
                    if (msg.type === 'res' && msg.id && pending.has(msg.id)) {
                        const handler = pending.get(msg.id)!;
                        pending.delete(msg.id);
                        if (msg.ok === false) {
                            handler.reject(new Error(msg.error?.message ?? 'RPC error'));
                        } else {
                            handler.resolve(msg.payload);
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

            // Timeout
            setTimeout(() => {
                if (!connection.authenticated) {
                    ws.terminate();
                    reject(new Error('Gateway connection timeout'));
                }
            }, 15_000);
        });
    }

    async function call(method: GatewayRpcMethod, params?: Record<string, unknown>): Promise<unknown> {
        const connection = await connect();
        const id = `rpc-${++connection.seq}`;

        return new Promise((resolve, reject) => {
            connection.pending.set(id, { resolve, reject });

            // Gateway protocol: type must be "req"
            connection.ws.send(JSON.stringify({ type: 'req', id, method, params }));

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
