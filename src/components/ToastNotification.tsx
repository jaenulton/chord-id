import React, { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotificationContext, Notification, NotificationType } from '../context/NotificationContext';
import { Theme } from '../themes';

// Icons for different notification types
const icons: Record<NotificationType, React.ReactElement> = {
  info: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  success: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

// Colors for different notification types
const typeColors: Record<NotificationType, { bg: string; border: string; icon: string }> = {
  info: {
    bg: 'rgba(59, 130, 246, 0.15)',
    border: 'rgba(59, 130, 246, 0.4)',
    icon: '#3b82f6',
  },
  success: {
    bg: 'rgba(34, 197, 94, 0.15)',
    border: 'rgba(34, 197, 94, 0.4)',
    icon: '#22c55e',
  },
  warning: {
    bg: 'rgba(245, 158, 11, 0.15)',
    border: 'rgba(245, 158, 11, 0.4)',
    icon: '#f59e0b',
  },
  error: {
    bg: 'rgba(239, 68, 68, 0.15)',
    border: 'rgba(239, 68, 68, 0.4)',
    icon: '#ef4444',
  },
};

interface ToastItemProps {
  notification: Notification;
  onDismiss: (id: string) => void;
  theme: Theme;
}

function ToastItem({ notification, onDismiss, theme }: ToastItemProps) {
  const colors = typeColors[notification.type];

  // No auto-dismiss - notifications persist until manually closed

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 100, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 30,
      }}
      className="relative w-80 max-w-[calc(100vw-2rem)] rounded-xl overflow-hidden shadow-2xl"
      style={{
        background: `linear-gradient(135deg, ${theme.colors.surface} 0%, ${theme.colors.background} 100%)`,
        border: `1px solid ${colors.border}`,
        boxShadow: `0 10px 40px rgba(0, 0, 0, 0.5), 0 0 20px ${colors.border}`,
      }}
    >

      <div className="flex items-start gap-3 p-4">
        {/* Icon */}
        <div
          className="flex-shrink-0 p-1.5 rounded-lg"
          style={{ background: colors.bg, color: colors.icon }}
        >
          {icons[notification.type]}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4
            className="font-semibold text-sm leading-tight"
            style={{ color: theme.colors.text }}
          >
            {notification.title}
          </h4>
          <p
            className="mt-1 text-sm leading-relaxed"
            style={{ color: theme.colors.textMuted }}
          >
            {notification.message}
          </p>
        </div>

        {/* Close button */}
        <button
          onClick={() => onDismiss(notification.id)}
          className="flex-shrink-0 p-1 rounded-lg transition-colors hover:bg-white/10"
          style={{ color: theme.colors.textMuted }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}

interface ToastContainerProps {
  theme: Theme;
  position?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
  maxVisible?: number;
}

export function ToastContainer({
  theme,
  position = 'top-right',
  maxVisible = 5,
}: ToastContainerProps) {
  const { notifications, dismissNotification } = useNotificationContext();

  const handleDismiss = useCallback((id: string) => {
    dismissNotification(id);
  }, [dismissNotification]);

  // Get position styles
  const positionStyles: Record<string, string> = {
    'top-right': 'top-4 right-4',
    'bottom-right': 'bottom-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-left': 'bottom-4 left-4',
  };

  // Limit visible notifications
  const visibleNotifications = notifications.slice(-maxVisible);

  // Determine flex direction based on position
  const isBottom = position.startsWith('bottom');

  return (
    <div
      className={`fixed z-[100] pointer-events-none ${positionStyles[position]}`}
    >
      <div
        className={`flex gap-3 pointer-events-auto ${isBottom ? 'flex-col-reverse' : 'flex-col'}`}
      >
        <AnimatePresence mode="popLayout">
          {visibleNotifications.map(notification => (
            <ToastItem
              key={notification.id}
              notification={notification}
              onDismiss={handleDismiss}
              theme={theme}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Hook for programmatic notifications (convenience wrapper)
export function useToast() {
  const { showNotification, dismissNotification, clearAllNotifications } = useNotificationContext();

  return {
    info: (title: string, message: string, duration?: number) =>
      showNotification({ title, message, type: 'info', duration }),
    success: (title: string, message: string, duration?: number) =>
      showNotification({ title, message, type: 'success', duration }),
    warning: (title: string, message: string, duration?: number) =>
      showNotification({ title, message, type: 'warning', duration }),
    error: (title: string, message: string, duration?: number) =>
      showNotification({ title, message, type: 'error', duration }),
    show: showNotification,
    dismiss: dismissNotification,
    clearAll: clearAllNotifications,
  };
}
