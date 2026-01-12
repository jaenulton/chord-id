import { useEffect, useRef, useState, useCallback } from 'react';

// WebSocket server URL - use secure WebSocket in production
const isElectron = typeof window !== 'undefined' && window.location.protocol === 'file:';
const WS_URL = isElectron
  ? 'wss://chord-id.jaes.online/ws'
  : (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//chord-id.jaes.online/ws';

export interface WebSocketMessage {
  type: string;
  data?: unknown;
  action?: string;
  timestamp?: string;
  clientCount?: number;
}

export type MessageHandler = (message: WebSocketMessage) => void;

interface UseWebSocketOptions {
  onMessage?: MessageHandler;
  onConnect?: () => void;
  onDisconnect?: () => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  clientCount: number;
  lastMessage: WebSocketMessage | null;
  subscribe: (type: string, handler: MessageHandler) => () => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    onMessage,
    onConnect,
    onDisconnect,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [clientCount, setClientCount] = useState(0);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const subscribersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());

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
      setLastMessage(message);

      // Update client count if provided
      if (message.clientCount !== undefined) {
        setClientCount(message.clientCount);
      }

      // Call general message handler
      onMessage?.(message);

      // Call type-specific subscribers
      const handlers = subscribersRef.current.get(message.type);
      if (handlers) {
        handlers.forEach(handler => handler(message));
      }

      // Also call wildcard subscribers
      const wildcardHandlers = subscribersRef.current.get('*');
      if (wildcardHandlers) {
        wildcardHandlers.forEach(handler => handler(message));
      }

      console.log('[WS] Received:', message.type, message);
    } catch (error) {
      console.error('[WS] Failed to parse message:', error);
    }
  }, [onMessage]);

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
        onConnect?.();
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected');
        setIsConnected(false);
        wsRef.current = null;
        onDisconnect?.();

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
  }, [handleMessage, onConnect, onDisconnect, reconnectInterval, maxReconnectAttempts]);

  // Connect on mount, disconnect on unmount
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

  return {
    isConnected,
    clientCount,
    lastMessage,
    subscribe
  };
}
