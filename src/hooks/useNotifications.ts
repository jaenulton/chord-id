import { useEffect, useRef, useCallback } from 'react';
import { useNotificationContext } from '../context/NotificationContext';

interface ApiNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  createdAt: string;
  expiresAt?: string;
  duration?: number;
}

interface NotificationsResponse {
  notifications: ApiNotification[];
}

// Use absolute URL for Electron app (file:// protocol), relative for web
const isElectron = typeof window !== 'undefined' && window.location.protocol === 'file:';
const BASE_URL = isElectron ? 'https://chord-id.jaes.online' : '';
const API_ENDPOINTS = [
  `${BASE_URL}/api/notifications.php`,
  `${BASE_URL}/api/notifications.json`,
];

async function fetchNotifications(): Promise<ApiNotification[]> {
  for (const endpoint of API_ENDPOINTS) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        const data: NotificationsResponse = await response.json();
        return data.notifications || [];
      }
    } catch {
      // Try next endpoint
    }
  }
  return [];
}

function isNotificationValid(notification: ApiNotification): boolean {
  // Check if notification has expired
  if (notification.expiresAt) {
    const expiresAt = new Date(notification.expiresAt);
    if (expiresAt < new Date()) {
      return false;
    }
  }
  return true;
}

interface UseNotificationsOptions {
  pollInterval?: number; // in milliseconds, default: 30000 (30 seconds)
  enabled?: boolean;
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const { pollInterval = 30000, enabled = true } = options;
  const { showNotification, seenIds, markAsSeen } = useNotificationContext();
  const lastFetchRef = useRef<number>(0);
  const processedIdsRef = useRef<Set<string>>(new Set());

  const checkForNewNotifications = useCallback(async () => {
    try {
      const notifications = await fetchNotifications();
      const now = Date.now();

      // Filter valid, unseen notifications
      const newNotifications = notifications.filter(n => {
        // Skip if already processed in this session
        if (processedIdsRef.current.has(n.id)) {
          return false;
        }
        // Skip if already seen (persisted)
        if (seenIds.has(n.id)) {
          return false;
        }
        // Skip if expired
        if (!isNotificationValid(n)) {
          return false;
        }
        return true;
      });

      // Show new notifications
      for (const notification of newNotifications) {
        showNotification({
          title: notification.title,
          message: notification.message,
          type: notification.type,
          expiresAt: notification.expiresAt,
          duration: notification.duration,
        });

        // Mark as processed for this session
        processedIdsRef.current.add(notification.id);

        // Mark as seen in localStorage
        markAsSeen(notification.id);
      }

      lastFetchRef.current = now;
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  }, [showNotification, seenIds, markAsSeen]);

  useEffect(() => {
    if (!enabled) return;

    // Initial fetch
    checkForNewNotifications();

    // Set up polling interval
    const intervalId = setInterval(checkForNewNotifications, pollInterval);

    return () => {
      clearInterval(intervalId);
    };
  }, [enabled, pollInterval, checkForNewNotifications]);

  return {
    checkForNewNotifications,
  };
}
