/**
 * Gateway WS Client — Frontend connection to user's Gateway via WS proxy
 *
 * The WS proxy on the backend handles:
 *   - Supabase JWT auth
 *   - Instance lookup
 *   - Gateway connect handshake (challenge, protocol v3, operator auth)
 *
 * This client just needs to:
 *   1. Connect to ws://api/ws?token=jwt
 *   2. Wait for proxy-ready event
 *   3. Send/receive Gateway protocol frames:
 *      - Request:  { type: "req", id, method, params }
 *      - Response: { type: "res", id, ok, payload?, error? }
 *      - Event:    { type: "event", event, payload?, seq? }
 *
 * Usage:
 *   const gw = createGatewayClient();
 *   await gw.connect();
 *   const health = await gw.rpc('health');
 *   const config = await gw.rpc('config.get');
 *   await gw.rpc('config.patch', { raw: JSON.stringify({...}), baseHash: '...' });
 */

import { supabase } from './supabase';

type GatewayEventHandler = (event: string, payload: unknown) => void;

interface PendingRpc {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
}

export interface GatewayClient {
    connect: () => Promise<void>;
    disconnect: () => void;
    rpc: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
    onEvent: (handler: GatewayEventHandler) => () => void;
    isConnected: () => boolean;
}

export function createGatewayClient(): GatewayClient {
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const WS_URL = API_URL.replace(/^http/, 'ws');

    let ws: WebSocket | null = null;
    let seq = 0;
    let connected = false;
    let ready = false;
    const pending = new Map<string, PendingRpc>();
    const eventHandlers = new Set<GatewayEventHandler>();

    async function connect(): Promise<void> {
        if (ws && ready) return;

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
            throw new Error('Not authenticated');
        }

        return new Promise((resolve, reject) => {
            ws = new WebSocket(`${WS_URL}/ws?token=${session.access_token}`);

            ws.onopen = () => {
                connected = true;
                console.log('[gateway] WS connected to proxy, waiting for Gateway auth...');
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);

                    // Proxy-ready event: Gateway auth complete
                    if (msg.type === 'proxy-ready') {
                        ready = true;
                        console.log('[gateway] ✅ Gateway ready');
                        resolve();
                        return;
                    }

                    // Gateway RPC responses (type: "res")
                    if (msg.type === 'res' && msg.id && pending.has(msg.id)) {
                        const handler = pending.get(msg.id)!;
                        pending.delete(msg.id);
                        clearTimeout(handler.timeout);
                        if (msg.ok === false) {
                            handler.reject(new Error(msg.error?.message ?? 'RPC error'));
                        } else {
                            handler.resolve(msg.payload);
                        }
                        return;
                    }

                    // Gateway events (type: "event")
                    if (msg.type === 'event') {
                        // Handle errors from proxy
                        if (msg.event === 'error') {
                            console.error('[gateway] Error:', msg.payload);
                            if (!ready) {
                                reject(new Error(msg.payload?.message || 'Connection failed'));
                            }
                        }

                        // Handle proxy disconnect
                        if (msg.event === 'proxy.disconnected') {
                            console.warn('[gateway] Proxy disconnected:', msg.payload);
                            ready = false;
                        }

                        // Forward all events to handlers
                        eventHandlers.forEach(h => {
                            try { h(msg.event, msg.payload); } catch { /* ignore */ }
                        });
                        return;
                    }
                } catch {
                    // ignore parse errors
                }
            };

            ws.onerror = () => {
                if (!ready) {
                    reject(new Error('WebSocket connection failed'));
                }
            };

            ws.onclose = () => {
                connected = false;
                ready = false;
                ws = null;
                for (const [id, handler] of pending) {
                    clearTimeout(handler.timeout);
                    handler.reject(new Error('Connection closed'));
                    pending.delete(id);
                }
                eventHandlers.forEach(h => {
                    try { h('close', null); } catch { /* ignore */ }
                });
            };

            // Timeout for initial connection + auth
            setTimeout(() => {
                if (!ready) {
                    ws?.close();
                    reject(new Error('Gateway connection timeout'));
                }
            }, 20_000);
        });
    }

    function disconnect() {
        if (ws) {
            ws.close();
            ws = null;
            connected = false;
            ready = false;
        }
    }

    async function rpc(method: string, params?: Record<string, unknown>): Promise<unknown> {
        if (!ws || !ready) {
            throw new Error('Not connected to Gateway');
        }

        const id = `rpc-${++seq}`;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                pending.delete(id);
                reject(new Error(`RPC timeout: ${method}`));
            }, 15_000);

            pending.set(id, { resolve, reject, timeout });
            // Gateway protocol: type must be "req"
            ws!.send(JSON.stringify({ type: 'req', id, method, params }));
        });
    }

    function onEvent(handler: GatewayEventHandler): () => void {
        eventHandlers.add(handler);
        return () => eventHandlers.delete(handler);
    }

    function isConnected() {
        return connected && ready;
    }

    return { connect, disconnect, rpc, onEvent, isConnected };
}
