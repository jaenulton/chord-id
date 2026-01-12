import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocketContext, WebSocketMessage } from '../context/WebSocketContext';

export interface MessageNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  createdAt: string;
  expiresAt?: string;
  isRead: boolean;
}

interface NotificationsApiResponse {
  notifications: MessageNotification[];
  unreadCount: number;
}

// Use absolute URL for Electron app (file:// protocol), relative for web
const isElectron = typeof window !== 'undefined' && window.location.protocol === 'file:';
const BASE_URL = isElectron ? 'https://chord-id.jaes.online' : '';
const API_ENDPOINT = `${BASE_URL}/api/notifications.php`;
const VISITOR_ID_KEY = 'chord-id-visitor-id';
const FALLBACK_POLL_INTERVAL = 120000; // Fallback poll every 2 minutes if WS disconnected

/**
 * Get or create a unique visitor ID for tracking read status
 */
function getVisitorId(): string {
  let visitorId = localStorage.getItem(VISITOR_ID_KEY);

  if (!visitorId) {
    // Generate a unique visitor ID
    visitorId = `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(VISITOR_ID_KEY, visitorId);
  }

  // Also set as cookie for backend access
  document.cookie = `visitor_id=${visitorId}; path=/; max-age=31536000; SameSite=Lax`;

  return visitorId;
}

/**
 * Fetch notifications from the API with read status
 */
async function fetchNotifications(visitorId: string): Promise<NotificationsApiResponse> {
  try {
    const response = await fetch(`${API_ENDPOINT}?visitor_id=${encodeURIComponent(visitorId)}`);

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = await response.json();

    return {
      notifications: data.notifications || [],
      unreadCount: data.unreadCount ?? data.notifications?.filter((n: MessageNotification) => !n.isRead).length ?? 0,
    };
  } catch (error) {
    console.error('Failed to fetch notifications:', error);
    return { notifications: [], unreadCount: 0 };
  }
}

/**
 * Mark a notification as read via the API
 */
async function markNotificationAsRead(notificationId: string, visitorId: string): Promise<boolean> {
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'mark_read',
        notification_id: notificationId,
        visitor_id: visitorId,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error('Failed to mark notification as read:', error);
    return false;
  }
}

/**
 * Mark all notifications as read via the API
 */
async function markAllNotificationsAsRead(visitorId: string): Promise<boolean> {
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'mark_all_read',
        visitor_id: visitorId,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error('Failed to mark all notifications as read:', error);
    return false;
  }
}

interface UseMessagesNotificationsOptions {
  pollInterval?: number; // Fallback polling interval in ms (default: 120000)
  enabled?: boolean;
}

export function useMessagesNotifications(options: UseMessagesNotificationsOptions = {}) {
  const { pollInterval = FALLBACK_POLL_INTERVAL, enabled = true } = options;

  const [notifications, setNotifications] = useState<MessageNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const visitorIdRef = useRef<string>(getVisitorId());
  const intervalRef = useRef<number | null>(null);

  // Get WebSocket context for real-time updates
  const { isConnected, subscribe } = useWebSocketContext();

  // Fetch notifications
  const refresh = useCallback(async () => {
    const result = await fetchNotifications(visitorIdRef.current);
    setNotifications(result.notifications);
    setUnreadCount(result.unreadCount);
    setIsLoading(false);
  }, []);

  // Mark single notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    // Optimistically update UI
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notificationId ? { ...n, isRead: true } : n
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    // Send to API
    const success = await markNotificationAsRead(notificationId, visitorIdRef.current);

    // If API call failed, revert (refresh to get actual state)
    if (!success) {
      await refresh();
    }
  }, [refresh]);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    // Optimistically update UI
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, isRead: true }))
    );
    setUnreadCount(0);

    // Send to API
    const success = await markAllNotificationsAsRead(visitorIdRef.current);

    // If API call failed, revert (refresh to get actual state)
    if (!success) {
      await refresh();
    }
  }, [refresh]);

  // Subscribe to WebSocket notification updates
  useEffect(() => {
    const unsubscribe = subscribe('notification', (message: WebSocketMessage) => {
      console.log('[Notifications] Received WebSocket notification:', message);

      const wsNotification = message.data as {
        notification?: {
          id: string;
          title: string;
          message: string;
          type?: 'info' | 'success' | 'warning' | 'error';
          createdAt: string;
        };
      };

      if (wsNotification?.notification) {
        const newNotification: MessageNotification = {
          id: wsNotification.notification.id,
          title: wsNotification.notification.title,
          message: wsNotification.notification.message,
          type: wsNotification.notification.type || 'info',
          createdAt: wsNotification.notification.createdAt,
          isRead: false,
        };

        // Add new notification to the beginning of the list
        setNotifications((prev) => {
          // Check if notification already exists
          if (prev.some(n => n.id === newNotification.id)) {
            return prev;
          }
          return [newNotification, ...prev];
        });
        setUnreadCount((prev) => prev + 1);

        console.log('[Notifications] Added new notification via WebSocket');
      }
    });

    return unsubscribe;
  }, [subscribe]);

  // Initial fetch and fallback polling setup
  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Initial fetch
    refresh();

    // Set up fallback polling (only when WebSocket is disconnected)
    intervalRef.current = window.setInterval(() => {
      if (!isConnected) {
        console.log('[Notifications] WebSocket disconnected, polling...');
        refresh();
      }
    }, pollInterval);

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, pollInterval, refresh, isConnected]);

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    refresh,
    isConnected,
  };
}
