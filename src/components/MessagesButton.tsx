import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Theme } from '../themes';
import { useMessagesNotifications, MessageNotification } from '../hooks/useMessagesNotifications';
import './MessagesButton.css';

// Icons for different notification types
const typeIcons: Record<string, React.ReactElement> = {
  info: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  success: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  warning: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  error: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

// Colors for different notification types
const typeColors: Record<string, { bg: string; border: string; icon: string }> = {
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

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface NotificationItemProps {
  notification: MessageNotification;
  theme: Theme;
  onMarkAsRead: (id: string) => void;
}

function NotificationItem({ notification, theme, onMarkAsRead }: NotificationItemProps) {
  const colors = typeColors[notification.type] || typeColors.info;
  const icon = typeIcons[notification.type] || typeIcons.info;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`messages-notification-item ${notification.isRead ? 'read' : 'unread'}`}
      style={{
        background: notification.isRead
          ? `${theme.colors.surface}80`
          : `linear-gradient(135deg, ${colors.bg} 0%, ${theme.colors.surface} 100%)`,
        borderLeft: `3px solid ${notification.isRead ? theme.colors.textMuted : colors.icon}`,
      }}
      onClick={() => !notification.isRead && onMarkAsRead(notification.id)}
    >
      <div
        className="messages-notification-icon"
        style={{
          background: colors.bg,
          color: colors.icon
        }}
      >
        {icon}
      </div>
      <div className="messages-notification-content">
        <div className="messages-notification-header">
          <h4
            className="messages-notification-title"
            style={{
              color: notification.isRead ? theme.colors.textMuted : theme.colors.text
            }}
          >
            {notification.title}
          </h4>
          {!notification.isRead && (
            <span
              className="messages-unread-dot"
              style={{ background: colors.icon }}
            />
          )}
        </div>
        <p
          className="messages-notification-message"
          style={{ color: theme.colors.textMuted }}
        >
          {notification.message}
        </p>
        <span
          className="messages-notification-time"
          style={{ color: theme.colors.textMuted }}
        >
          {formatTimeAgo(notification.createdAt)}
        </span>
      </div>
    </motion.div>
  );
}

interface MessagesButtonProps {
  theme: Theme;
}

export function MessagesButton({ theme }: MessagesButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    isLoading
  } = useMessagesNotifications({ pollInterval: 60000 });

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        buttonRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleMarkAsRead = (id: string) => {
    markAsRead(id);
  };

  const handleMarkAllAsRead = () => {
    markAllAsRead();
  };

  return (
    <div className="messages-button-container">
      {/* Bell Button */}
      <motion.button
        ref={buttonRef}
        onClick={handleToggle}
        className="messages-button glass"
        style={{
          borderColor: `${theme.colors.primary}30`,
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        {/* Bell Icon */}
        <svg
          className="messages-bell-icon"
          fill="none"
          stroke={theme.colors.primary}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Unread Count Badge */}
        {unreadCount > 0 && (
          <motion.span
            className="messages-badge"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </motion.span>
        )}
      </motion.button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={dropdownRef}
            className="messages-dropdown"
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            style={{
              background: `linear-gradient(180deg, ${theme.colors.surface} 0%, ${theme.colors.background} 100%)`,
              border: `1px solid ${theme.colors.primary}30`,
              boxShadow: `0 20px 50px rgba(0, 0, 0, 0.5), 0 0 30px ${theme.colors.primaryGlow}20`,
            }}
          >
            {/* Header */}
            <div
              className="messages-dropdown-header"
              style={{ borderBottom: `1px solid ${theme.colors.primary}20` }}
            >
              <h3 style={{ color: theme.colors.text }}>Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="messages-mark-all-read"
                  style={{ color: theme.colors.primary }}
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Notifications List */}
            <div className="messages-dropdown-content">
              {isLoading && notifications.length === 0 ? (
                <div
                  className="messages-empty-state"
                  style={{ color: theme.colors.textMuted }}
                >
                  <div className="messages-loading-spinner" style={{ borderColor: `${theme.colors.primary}30`, borderTopColor: theme.colors.primary }} />
                  Loading...
                </div>
              ) : notifications.length === 0 ? (
                <div
                  className="messages-empty-state"
                  style={{ color: theme.colors.textMuted }}
                >
                  <svg className="w-12 h-12 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  No notifications yet
                </div>
              ) : (
                <div className="messages-notification-list">
                  <AnimatePresence>
                    {notifications.map((notification) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        theme={theme}
                        onMarkAsRead={handleMarkAsRead}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div
                className="messages-dropdown-footer"
                style={{
                  borderTop: `1px solid ${theme.colors.primary}20`,
                  color: theme.colors.textMuted
                }}
              >
                {unreadCount > 0
                  ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
                  : 'All caught up!'
                }
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
