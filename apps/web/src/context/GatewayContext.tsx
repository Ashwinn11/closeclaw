import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { getMyInstance } from '../lib/api';
import { createGatewayClient } from '../lib/gateway';
import type { GatewayClient } from '../lib/gateway';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface GatewayContextType {
  status: ConnectionStatus;
  client: GatewayClient | null;
  error: string | null;
  subscribe: (events: string[], handler: (event: string, payload: unknown) => void) => () => void;
  rpc: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
}

const GatewayContext = createContext<GatewayContextType | null>(null);

export const useGateway = () => {
  const ctx = useContext(GatewayContext);
  if (!ctx) throw new Error('useGateway must be used within GatewayProvider');
  return ctx;
};

export const GatewayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<GatewayClient | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const heartbeatTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const hasInstanceRef = useRef(false);

  // Calculate exponential backoff delay
  const getBackoffDelay = (attempt: number): number => {
    const maxDelay = 30_000; // 30 seconds
    const delay = Math.min(1000 * Math.pow(2, attempt), maxDelay);
    return delay;
  };

  // Cleanup heartbeat timeout
  const clearHeartbeat = () => {
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = undefined;
    }
  };

  // Setup heartbeat to monitor connection health
  const setupHeartbeat = useCallback(() => {
    clearHeartbeat();
    heartbeatTimeoutRef.current = setTimeout(() => {
      if (clientRef.current?.isConnected()) {
        clientRef.current
          .rpc('health')
          .then(() => {
            // Health check passed, reschedule
            setupHeartbeat();
          })
          .catch((err) => {
            console.warn('[gateway] Health check failed:', err.message);
            // Reconnect on health check failure
            disconnect();
          });
      }
    }, 30_000); // Check every 30 seconds
  }, []);

  // Cleanup reconnect timeout
  const clearReconnectTimeout = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
  };

  // Connect to WebSocket
  const connect = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setStatus('disconnected');
      return;
    }

    // Check if user has an active instance
    try {
      const instance = await getMyInstance();
      if (!instance) {
        console.log('[gateway] No active instance found, skipping WebSocket connection');
        hasInstanceRef.current = false;
        setStatus('disconnected');
        return;
      }
      hasInstanceRef.current = true;
    } catch (err) {
      console.warn('[gateway] Failed to check instance:', (err as Error).message);
      hasInstanceRef.current = false;
      setStatus('disconnected');
      return;
    }

    if (clientRef.current?.isConnected()) {
      return;
    }

    try {
      setStatus('connecting');
      setError(null);

      if (!clientRef.current) {
        clientRef.current = createGatewayClient();
      }

      await clientRef.current.connect();

      reconnectAttemptsRef.current = 0;
      setStatus('connected');
      console.log('[gateway] Connected successfully');

      // Setup heartbeat
      setupHeartbeat();

      // Setup error handler for future disconnections
      clientRef.current.onEvent((event, payload) => {
        if (event === 'close' || event === 'proxy.disconnected') {
          console.log('[gateway] Connection closed, will attempt reconnect');
          disconnect();
        } else if (event === 'error') {
          console.error('[gateway] Connection error:', payload);
          setError((payload as { message?: string })?.message || 'Connection error');
          disconnect();
        }
      });
    } catch (err) {
      const errorMsg = (err as Error).message;
      console.error('[gateway] Connection failed:', errorMsg);
      setError(errorMsg);
      setStatus('error');

      // Schedule reconnect with exponential backoff
      const delay = getBackoffDelay(reconnectAttemptsRef.current);
      reconnectAttemptsRef.current++;
      console.log(`[gateway] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);

      clearReconnectTimeout();
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    }
  }, [isAuthenticated, user, setupHeartbeat]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    clearHeartbeat();
    clearReconnectTimeout();
    if (clientRef.current) {
      clientRef.current.disconnect();
    }
    setStatus('disconnected');
    setError(null);
  }, []);

  // Subscribe to events
  const subscribe = useCallback(
    (events: string[], handler: (event: string, payload: unknown) => void) => {
      if (!clientRef.current) {
        console.warn('[gateway] Cannot subscribe: client not initialized');
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

  // Make RPC calls with fallback
  const rpc = useCallback(
    async (method: string, params?: Record<string, unknown>): Promise<unknown> => {
      if (!clientRef.current?.isConnected()) {
        throw new Error('Gateway not connected');
      }
      return clientRef.current.rpc(method, params);
    },
    []
  );

  // Connect/disconnect on auth state change
  useEffect(() => {
    if (isAuthenticated) {
      connect();
    } else {
      disconnect();
    }
  }, [isAuthenticated, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return (
    <GatewayContext.Provider value={{ status, client: clientRef.current, error, subscribe, rpc }}>
      {children}
    </GatewayContext.Provider>
  );
};
