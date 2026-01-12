import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';

// WebSocket server URL
const isElectron = typeof window !== 'undefined' && window.location.protocol === 'file:';
const WS_URL = isElectron
  ? 'wss://chord-id.jaes.online/ws'
  : (typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//chord-id.jaes.online/ws';

export interface WebSocketMessage {
  type: string;
  data?: unknown;
  action?: string;
  timestamp?: string;
  clientCount?: number;
}

export type MessageHandler = (message: WebSocketMessage) => void;

interface WebSocketContextValue {
  isConnected: boolean;
  clientCount: number;
  subscribe: (type: string, handler: MessageHandler) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

interface WebSocketProviderProps {
  children: ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [clientCount, setClientCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const subscribersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());

  const maxReconnectAttempts = 10;
  const reconnectInterval = 3000;

  // Subscribe to specific message types
  const subscribe = useCallback((type: string, handler: MessageHandler) => {
    if (!subscribersRef.current.has(type)) {
      subscribersRef.current.set(type, new Set());
    }
    subscribersRef.current.get(type)!.add(handler);

    // Return unsubscribe function
    return () => {
      subscribersRef.current.get(type)?.delete(handler);
    };
  }, []);

  // Handle incoming messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);

      // Update client count if provided
      if (message.clientCount !== undefined) {
        setClientCount(message.clientCount);
      }

      // Call type-specific subscribers
      const handlers = subscribersRef.current.get(message.type);
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(message);
          } catch (err) {
            console.error('[WS] Handler error:', err);
          }
        });
      }

      // Also call wildcard subscribers
      const wildcardHandlers = subscribersRef.current.get('*');
      if (wildcardHandlers) {
        wildcardHandlers.forEach(handler => {
          try {
            handler(message);
          } catch (err) {
            console.error('[WS] Wildcard handler error:', err);
          }
        });
      }

      console.log('[WS] Received:', message.type);
    } catch (error) {
      console.error('[WS] Failed to parse message:', error);
    }
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      console.log('[WS] Connecting to', WS_URL);
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('[WS] Connected');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected');
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          console.log(`[WS] Reconnecting in ${reconnectInterval}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
          reconnectTimeoutRef.current = window.setTimeout(connect, reconnectInterval);
        } else {
          console.log('[WS] Max reconnect attempts reached');
        }
      };

      ws.onerror = (error) => {
        console.error('[WS] Error:', error);
      };

      ws.onmessage = handleMessage;

      wsRef.current = ws;
    } catch (error) {
      console.error('[WS] Failed to connect:', error);
    }
  }, [handleMessage]);

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const value: WebSocketContextValue = {
    isConnected,
    clientCount,
    subscribe
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext(): WebSocketContextValue {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}
