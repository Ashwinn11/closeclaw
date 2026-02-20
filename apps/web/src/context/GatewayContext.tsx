import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { getMyInstance, setGatewayClient } from '../lib/api';
import { createGatewayClient } from '../lib/gateway';
import type { GatewayClient } from '../lib/gateway';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface GatewayContextType {
  status: ConnectionStatus;
  client: GatewayClient | null;
  error: string | null;
  subscribe: (events: string[], handler: (event: string, payload: unknown) => void) => () => void;
  rpc: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  connect: () => void;
}

const GatewayContext = createContext<GatewayContextType | null>(null);

export const useGateway = () => {
  const ctx = useContext(GatewayContext);
  if (!ctx) throw new Error('useGateway must be used within GatewayProvider');
  return ctx;
};

export const GatewayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<GatewayClient | null>(null);
  const connectingRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const heartbeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mountedRef = useRef(true);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = undefined;
    }
  }, []);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
  }, []);

  const disconnectClient = useCallback(() => {
    clearHeartbeat();
    clearReconnectTimeout();
    connectingRef.current = false;
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    setGatewayClient(null);
    if (mountedRef.current) {
      setStatus('disconnected');
      setError(null);
    }
  }, [clearHeartbeat, clearReconnectTimeout]);

  const setupHeartbeat = useCallback(() => {
    clearHeartbeat();
    heartbeatTimeoutRef.current = setTimeout(() => {
      if (clientRef.current?.isConnected()) {
        clientRef.current
          .rpc('health')
          .then(() => {
            setupHeartbeat();
          })
          .catch((err) => {
            console.warn('[gateway] Health check failed:', err.message);
          });
      }
    }, 30_000);
  }, [clearHeartbeat]);

  // Single connect function that guards against duplicate calls
  const connectToGateway = useCallback(async () => {
    if (connectingRef.current) return;
    if (clientRef.current?.isConnected()) return;

    connectingRef.current = true;

    // Check for active instance
    try {
      const instance = await getMyInstance();
      if (!instance) {
        console.log('[gateway] No active instance, skipping WebSocket');
        connectingRef.current = false;
        return;
      }
    } catch {
      connectingRef.current = false;
      return;
    }

    if (!mountedRef.current) {
      connectingRef.current = false;
      return;
    }

    try {
      setStatus('connecting');
      setError(null);

      const client = createGatewayClient();
      clientRef.current = client;

      await client.connect();

      if (!mountedRef.current) {
        client.disconnect();
        connectingRef.current = false;
        return;
      }

      reconnectAttemptsRef.current = 0;
      setGatewayClient(client);
      setStatus('connected');
      console.log('[gateway] Connected successfully');

      setupHeartbeat();

      client.onEvent((event, payload) => {
        if (event === 'close' || event === 'proxy.disconnected') {
          console.log('[gateway] Connection closed, will attempt reconnect');
          setStatus('disconnected');
          setGatewayClient(null);
          clientRef.current = null;
          connectingRef.current = false;

          // Auto-reconnect with backoff
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30_000);
          reconnectAttemptsRef.current++;
          clearReconnectTimeout();
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) connectToGateway();
          }, delay);
        } else if (event === 'error') {
          console.error('[gateway] Connection error:', payload);
          setError((payload as { message?: string })?.message || 'Connection error');
        }
      });
    } catch (err) {
      const errorMsg = (err as Error).message;
      console.error('[gateway] Connection failed:', errorMsg);
      if (mountedRef.current) {
        setError(errorMsg);
        setStatus('error');
      }

      // Reconnect with backoff
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30_000);
      reconnectAttemptsRef.current++;
      clearReconnectTimeout();
      reconnectTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) connectToGateway();
      }, delay);
    } finally {
      connectingRef.current = false;
    }
  }, [setupHeartbeat, clearReconnectTimeout]);

  // Subscribe to events
  const subscribe = useCallback(
    (events: string[], handler: (event: string, payload: unknown) => void) => {
      if (!clientRef.current) {
        return () => {};
      }

      const unsubscribe = clientRef.current.onEvent((event, payload) => {
        if (events.includes(event)) {
          handler(event, payload);
        }
      });

      return unsubscribe;
    },
    []
  );

  // Make RPC calls
  const rpc = useCallback(
    async (method: string, params?: Record<string, unknown>): Promise<unknown> => {
      if (!clientRef.current?.isConnected()) {
        throw new Error('Gateway not connected');
      }
      return clientRef.current.rpc(method, params);
    },
    []
  );

  // Connect on auth, disconnect on logout - only depends on isAuthenticated
  useEffect(() => {
    mountedRef.current = true;

    if (isAuthenticated) {
      connectToGateway();
    } else {
      disconnectClient();
    }

    return () => {
      mountedRef.current = false;
      disconnectClient();
    };
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GatewayContext.Provider value={{ status, client: clientRef.current, error, subscribe, rpc, connect: connectToGateway }}>
      {children}
    </GatewayContext.Provider>
  );
};
