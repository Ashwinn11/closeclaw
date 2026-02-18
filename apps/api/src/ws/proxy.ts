/**
 * WebSocket Proxy — Pipes frontend WS connections to the user's Gateway
 *
 * Flow:
 *   1. Frontend opens WS to /ws?token=<supabase-jwt>
 *   2. Backend validates JWT, looks up user's claimed instance
 *   3. Backend opens WS to Gateway at ws://<tailscale-ip>:18789
 *   4. Gateway sends connect.challenge; backend replies with connect request
 *   5. Gateway replies with hello-ok; proxy starts piping messages
 *
 * Protocol details (discovered from OpenClaw source):
 *   - Request frame: { type: "req", id, method, params }
 *   - Response frame: { type: "res", id, ok, payload?, error? }
 *   - Event frame: { type: "event", event, payload? }
 *   - Client ID must be one of GATEWAY_CLIENT_IDS (e.g. "openclaw-control-ui")
 *   - Client mode must be one of GATEWAY_CLIENT_MODES (e.g. "ui")
 *   - Protocol version is 3
 *   - Origin header must match request host for control-ui connections
 *   - controlUi.dangerouslyDisableDeviceAuth + allowInsecureAuth must be true
 *     in Gateway config for token-only auth (no device keypair)
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import { supabase } from '../services/supabase.js';

const supabaseAdmin = supabase;

interface ProxyConnection {
    userId: string;
    clientWs: WebSocket;
    gatewayWs: WebSocket | null;
    instanceId: string;
    authenticated: boolean;
}

const activeConnections = new Map<string, ProxyConnection>();

export function attachWsProxy(server: HttpServer) {
    const wss = new WebSocketServer({ noServer: true });

    // Handle HTTP upgrade requests
    server.on('upgrade', async (request, socket, head) => {
        const url = new URL(request.url ?? '', `http://${request.headers.host}`);

        if (url.pathname !== '/ws') {
            socket.destroy();
            return;
        }

        const token = url.searchParams.get('token') ??
            request.headers.authorization?.replace('Bearer ', '') ?? '';

        if (!token) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

        const { data: instance } = await supabaseAdmin
            .from('instances')
            .select('*')
            .eq('user_id', user.id)
            .in('status', ['claimed', 'active'])
            .maybeSingle();

        if (!instance || !instance.internal_ip || !instance.gateway_token) {
            socket.write('HTTP/1.1 503 Service Unavailable\r\nContent-Type: text/plain\r\n\r\nNo active instance\r\n');
            socket.destroy();
            return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request, {
                userId: user.id,
                instance,
            });
        });
    });

    wss.on('connection', (clientWs: WebSocket, _request: unknown, ctx: { userId: string; instance: Record<string, unknown> }) => {
        const { userId, instance } = ctx;
        const gatewayIp = instance.internal_ip as string;
        const gatewayPort = (instance.gateway_port as number) || 18789;
        const gatewayUrl = `ws://${gatewayIp}:${gatewayPort}`;
        const gatewayToken = instance.gateway_token as string;

        console.log(`[ws-proxy] User ${userId.slice(0, 8)} connecting to Gateway at ${gatewayUrl}`);

        // Close existing connection for this user
        const existing = activeConnections.get(userId);
        if (existing) {
            existing.clientWs.close();
            existing.gatewayWs?.close();
            activeConnections.delete(userId);
        }

        // Connect to Gateway with Origin header matching the host
        const gatewayWs = new WebSocket(gatewayUrl, {
            headers: {
                'Origin': `http://${gatewayIp}:${gatewayPort}`,
            },
        });

        const conn: ProxyConnection = {
            userId,
            clientWs,
            gatewayWs,
            instanceId: instance.id as string,
            authenticated: false,
        };

        activeConnections.set(userId, conn);

        // ─── Gateway connection lifecycle ────────────────────────────────────

        gatewayWs.on('open', () => {
            console.log(`[ws-proxy] Gateway WS open for user ${userId.slice(0, 8)}, waiting for challenge...`);
        });

        gatewayWs.on('message', (data) => {
            const raw = data.toString();
            let msg: Record<string, unknown>;
            try {
                msg = JSON.parse(raw);
            } catch {
                // Forward raw data
                if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data);
                return;
            }

            // ── Before auth: handle Gateway handshake ──

            if (!conn.authenticated) {
                // Challenge → send connect request
                if (msg.type === 'event' && msg.event === 'connect.challenge') {
                    console.log(`[ws-proxy] Got challenge for user ${userId.slice(0, 8)}, sending connect...`);
                    gatewayWs.send(JSON.stringify({
                        type: 'req',
                        id: 'proxy-connect',
                        method: 'connect',
                        params: {
                            minProtocol: 3,
                            maxProtocol: 3,
                            client: {
                                id: 'openclaw-control-ui',
                                displayName: 'CloseClaw Proxy',
                                version: '0.0.1',
                                platform: 'linux',
                                mode: 'ui',
                            },
                            auth: { token: gatewayToken },
                            role: 'operator',
                            scopes: ['operator.admin'],
                            caps: [],
                        },
                    }));
                    return;
                }

                // hello-ok response → auth complete
                if (msg.type === 'res' && msg.id === 'proxy-connect') {
                    if (msg.ok) {
                        conn.authenticated = true;
                        console.log(`[ws-proxy] ✅ Authenticated with Gateway for user ${userId.slice(0, 8)}`);
                        // Forward hello-ok to client so they know the connection is live
                        if (clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(JSON.stringify({
                                type: 'proxy-ready',
                                gatewayVersion: (msg.payload as Record<string, unknown>)?.server,
                            }));
                        }
                    } else {
                        console.error(`[ws-proxy] ❌ Gateway auth failed for user ${userId.slice(0, 8)}:`, msg.error);
                        clientWs.send(JSON.stringify({
                            type: 'event',
                            event: 'error',
                            payload: { message: 'Gateway authentication failed', code: 403 },
                        }));
                        clientWs.close();
                        gatewayWs.close();
                        activeConnections.delete(userId);
                    }
                    return;
                }

                // Ignore other messages before auth
                return;
            }

            // ── After auth: pipe everything ──

            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(data);
            }
        });

        gatewayWs.on('error', (err) => {
            console.error(`[ws-proxy] Gateway WS error for user ${userId.slice(0, 8)}:`, err.message);
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({
                    type: 'event',
                    event: 'error',
                    payload: { message: 'Gateway connection error', code: 502 },
                }));
            }
        });

        gatewayWs.on('close', (code) => {
            console.log(`[ws-proxy] Gateway disconnected for user ${userId.slice(0, 8)} (${code})`);
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({
                    type: 'event',
                    event: 'proxy.disconnected',
                    payload: { reason: 'Gateway connection closed', code },
                }));
                clientWs.close();
            }
            activeConnections.delete(userId);
        });

        // ─── Client connection lifecycle ─────────────────────────────────────

        clientWs.on('message', (data) => {
            if (!conn.authenticated) {
                clientWs.send(JSON.stringify({
                    type: 'event',
                    event: 'error',
                    payload: { message: 'Gateway not authenticated yet', code: 503 },
                }));
                return;
            }
            if (gatewayWs.readyState === WebSocket.OPEN) {
                gatewayWs.send(data);
            } else {
                clientWs.send(JSON.stringify({
                    type: 'event',
                    event: 'error',
                    payload: { message: 'Gateway not connected', code: 503 },
                }));
            }
        });

        clientWs.on('close', () => {
            console.log(`[ws-proxy] Client disconnected: user ${userId.slice(0, 8)}`);
            gatewayWs.close();
            activeConnections.delete(userId);
        });

        clientWs.on('error', (err) => {
            console.error(`[ws-proxy] Client WS error:`, err.message);
            gatewayWs.close();
            activeConnections.delete(userId);
        });

        // ─── Connection timeout ──────────────────────────────────────────────

        setTimeout(() => {
            if (!conn.authenticated) {
                console.error(`[ws-proxy] Gateway auth timeout for user ${userId.slice(0, 8)}`);
                clientWs.send(JSON.stringify({
                    type: 'event',
                    event: 'error',
                    payload: { message: 'Gateway connection timeout', code: 504 },
                }));
                clientWs.close();
                gatewayWs.terminate();
                activeConnections.delete(userId);
            }
        }, 15_000);
    });

    console.log('[ws-proxy] WebSocket proxy attached');
    return wss;
}
