<?php
/**
 * Notifications API for Chord-ID
 *
 * GET: Returns active (non-expired) notifications with read status for user
 * POST action=mark_read: Mark notification as read for user
 * POST action=mark_all_read: Mark all notifications as read for user
 * POST (with auth): Add new notification
 * DELETE (with auth): Remove notification
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Simple auth token (should be more secure in production)
define('API_AUTH_TOKEN', 'chord-id-notifications-secret-token');

// Storage files - notifications.json is in the parent directory (written by admin.php)
define('NOTIFICATIONS_FILE', dirname(__DIR__) . '/notifications.json');
define('READ_STATUS_FILE', __DIR__ . '/notifications_read_status.json');

/**
 * Load notifications from storage
 * Handles both formats: { "notifications": [...] } and plain array [...]
 */
function loadNotifications(): array {
    if (!file_exists(NOTIFICATIONS_FILE)) {
        return [];
    }

    $content = file_get_contents(NOTIFICATIONS_FILE);
    $data = json_decode($content, true);

    if (!is_array($data)) {
        return [];
    }

    // Handle { "notifications": [...] } format from admin.php
    $notifications = isset($data['notifications']) && is_array($data['notifications'])
        ? $data['notifications']
        : $data;

    // Normalize notifications - ensure they have createdAt field
    return array_map(function($n) {
        // If notification has 'timestamp' but not 'createdAt', convert it
        if (isset($n['timestamp']) && !isset($n['createdAt'])) {
            $n['createdAt'] = date('c', strtotime($n['timestamp']));
        }
        // Ensure type field exists
        if (!isset($n['type'])) {
            $n['type'] = 'info';
        }
        return $n;
    }, $notifications);
}

/**
 * Save notifications to storage
 */
function saveNotifications(array $notifications): bool {
    return file_put_contents(
        NOTIFICATIONS_FILE,
        json_encode($notifications, JSON_PRETTY_PRINT)
    ) !== false;
}

/**
 * Load read status from storage
 */
function loadReadStatus(): array {
    if (!file_exists(READ_STATUS_FILE)) {
        return [];
    }

    $content = file_get_contents(READ_STATUS_FILE);
    $data = json_decode($content, true);

    return is_array($data) ? $data : [];
}

/**
 * Save read status to storage
 */
function saveReadStatus(array $readStatus): bool {
    return file_put_contents(
        READ_STATUS_FILE,
        json_encode($readStatus, JSON_PRETTY_PRINT)
    ) !== false;
}

/**
 * Get visitor ID from request (query param, cookie, or POST body)
 */
function getVisitorId(): ?string {
    // Check query parameter first
    if (!empty($_GET['visitor_id'])) {
        return trim($_GET['visitor_id']);
    }

    // Check cookie
    if (!empty($_COOKIE['visitor_id'])) {
        return trim($_COOKIE['visitor_id']);
    }

    return null;
}

/**
 * Filter out expired notifications
 */
function filterActiveNotifications(array $notifications): array {
    $now = new DateTime();

    return array_values(array_filter($notifications, function($n) use ($now) {
        if (!isset($n['expiresAt'])) {
            return true;
        }

        try {
            $expiresAt = new DateTime($n['expiresAt']);
            return $expiresAt > $now;
        } catch (Exception $e) {
            return true;
        }
    }));
}

/**
 * Add read status to notifications for a specific visitor
 */
function addReadStatusToNotifications(array $notifications, string $visitorId): array {
    $readStatus = loadReadStatus();
    $visitorReadIds = isset($readStatus[$visitorId]) ? $readStatus[$visitorId] : [];

    return array_map(function($n) use ($visitorReadIds) {
        $n['isRead'] = in_array($n['id'], $visitorReadIds);
        return $n;
    }, $notifications);
}

/**
 * Count unread notifications for a visitor
 */
function countUnread(array $notifications, string $visitorId): int {
    $readStatus = loadReadStatus();
    $visitorReadIds = isset($readStatus[$visitorId]) ? $readStatus[$visitorId] : [];

    $unreadCount = 0;
    foreach ($notifications as $n) {
        if (!in_array($n['id'], $visitorReadIds)) {
            $unreadCount++;
        }
    }
    return $unreadCount;
}

/**
 * Mark a notification as read for a visitor
 */
function markAsRead(string $notificationId, string $visitorId): bool {
    $readStatus = loadReadStatus();

    if (!isset($readStatus[$visitorId])) {
        $readStatus[$visitorId] = [];
    }

    if (!in_array($notificationId, $readStatus[$visitorId])) {
        $readStatus[$visitorId][] = $notificationId;
    }

    return saveReadStatus($readStatus);
}

/**
 * Mark all notifications as read for a visitor
 */
function markAllAsRead(array $notifications, string $visitorId): bool {
    $readStatus = loadReadStatus();

    $allIds = array_map(function($n) { return $n['id']; }, $notifications);

    $readStatus[$visitorId] = $allIds;

    return saveReadStatus($readStatus);
}

/**
 * Clean up old read status entries (for notifications that no longer exist)
 */
function cleanupReadStatus(array $notifications): void {
    $readStatus = loadReadStatus();
    $validIds = array_map(function($n) { return $n['id']; }, $notifications);
    $changed = false;

    foreach ($readStatus as $visitorId => $readIds) {
        $filteredIds = array_values(array_filter($readIds, function($id) use ($validIds) {
            return in_array($id, $validIds);
        }));

        if (count($filteredIds) !== count($readIds)) {
            $readStatus[$visitorId] = $filteredIds;
            $changed = true;
        }

        // Remove empty entries
        if (empty($readStatus[$visitorId])) {
            unset($readStatus[$visitorId]);
            $changed = true;
        }
    }

    if ($changed) {
        saveReadStatus($readStatus);
    }
}

/**
 * Check authorization
 */
function isAuthorized(): bool {
    $headers = getallheaders();
    $authHeader = $headers['Authorization'] ?? '';

    if (preg_match('/Bearer\s+(.+)/', $authHeader, $matches)) {
        return $matches[1] === API_AUTH_TOKEN;
    }

    return false;
}

/**
 * Generate unique ID
 */
function generateId(): string {
    return uniqid('notif_', true);
}

// Route handling
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':
            // Return active notifications with read status
            $notifications = loadNotifications();
            $activeNotifications = filterActiveNotifications($notifications);

            // Clean up old read status entries periodically
            cleanupReadStatus($activeNotifications);

            $visitorId = getVisitorId();

            if ($visitorId) {
                // Add read status for this visitor
                $notificationsWithStatus = addReadStatusToNotifications($activeNotifications, $visitorId);
                $unreadCount = countUnread($activeNotifications, $visitorId);

                echo json_encode([
                    'notifications' => $notificationsWithStatus,
                    'unreadCount' => $unreadCount
                ]);
            } else {
                // No visitor ID - all notifications are "unread"
                $notificationsWithStatus = array_map(function($n) {
                    $n['isRead'] = false;
                    return $n;
                }, $activeNotifications);

                echo json_encode([
                    'notifications' => $notificationsWithStatus,
                    'unreadCount' => count($activeNotifications)
                ]);
            }
            break;

        case 'POST':
            $input = json_decode(file_get_contents('php://input'), true);

            // Check if this is a mark_read action
            if (isset($input['action'])) {
                $action = $input['action'];
                $visitorId = $input['visitor_id'] ?? getVisitorId();

                if (!$visitorId) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Visitor ID is required']);
                    exit;
                }

                if ($action === 'mark_read') {
                    $notificationId = $input['notification_id'] ?? null;

                    if (!$notificationId) {
                        http_response_code(400);
                        echo json_encode(['error' => 'Notification ID is required']);
                        exit;
                    }

                    $success = markAsRead($notificationId, $visitorId);

                    echo json_encode([
                        'success' => $success,
                        'message' => $success ? 'Notification marked as read' : 'Failed to mark as read'
                    ]);
                    exit;
                }

                if ($action === 'mark_all_read') {
                    $notifications = loadNotifications();
                    $activeNotifications = filterActiveNotifications($notifications);
                    $success = markAllAsRead($activeNotifications, $visitorId);

                    echo json_encode([
                        'success' => $success,
                        'message' => $success ? 'All notifications marked as read' : 'Failed to mark all as read'
                    ]);
                    exit;
                }

                http_response_code(400);
                echo json_encode(['error' => 'Unknown action']);
                exit;
            }

            // Add new notification (requires auth)
            if (!isAuthorized()) {
                http_response_code(401);
                echo json_encode(['error' => 'Unauthorized']);
                exit;
            }

            if (!$input) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid JSON body']);
                exit;
            }

            // Validate required fields
            if (empty($input['title']) || empty($input['message'])) {
                http_response_code(400);
                echo json_encode(['error' => 'Title and message are required']);
                exit;
            }

            // Create new notification
            $notification = [
                'id' => $input['id'] ?? generateId(),
                'title' => trim($input['title']),
                'message' => trim($input['message']),
                'type' => in_array($input['type'] ?? '', ['info', 'success', 'warning', 'error'])
                    ? $input['type']
                    : 'info',
                'createdAt' => (new DateTime())->format(DateTime::ATOM),
            ];

            // Optional expiration
            if (!empty($input['expiresAt'])) {
                $notification['expiresAt'] = $input['expiresAt'];
            } elseif (!empty($input['expireInHours'])) {
                $expireDate = new DateTime();
                $expireDate->modify('+' . intval($input['expireInHours']) . ' hours');
                $notification['expiresAt'] = $expireDate->format(DateTime::ATOM);
            }

            // Optional duration
            if (!empty($input['duration'])) {
                $notification['duration'] = intval($input['duration']);
            }

            // Add to storage
            $notifications = loadNotifications();
            $notifications[] = $notification;
            saveNotifications($notifications);

            http_response_code(201);
            echo json_encode([
                'success' => true,
                'notification' => $notification
            ]);
            break;

        case 'DELETE':
            // Delete notification (requires auth)
            if (!isAuthorized()) {
                http_response_code(401);
                echo json_encode(['error' => 'Unauthorized']);
                exit;
            }

            $input = json_decode(file_get_contents('php://input'), true);
            $id = $input['id'] ?? $_GET['id'] ?? null;

            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'Notification ID is required']);
                exit;
            }

            $notifications = loadNotifications();
            $initialCount = count($notifications);

            $notifications = array_values(array_filter($notifications, function($n) use ($id) {
                return $n['id'] !== $id;
            }));

            if (count($notifications) === $initialCount) {
                http_response_code(404);
                echo json_encode(['error' => 'Notification not found']);
                exit;
            }

            saveNotifications($notifications);

            // Clean up read status for this notification
            cleanupReadStatus($notifications);

            echo json_encode([
                'success' => true,
                'message' => 'Notification deleted'
            ]);
            break;

        default:
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Internal server error']);
}
