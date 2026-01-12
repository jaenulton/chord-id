<?php
/**
 * Chord-ID User Tracking API
 *
 * Main tracking endpoint that handles:
 * - User creation/identification via visitor fingerprint
 * - Session management
 * - Event logging
 * - Page view tracking
 * - Poll status tracking
 */

require_once __DIR__ . '/db_config.php';

// CORS Headers
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Visitor-ID, X-Session-ID');
header('Access-Control-Max-Age: 86400');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Rate limiting configuration
define('RATE_LIMIT_WINDOW', 60);      // 60 seconds
define('RATE_LIMIT_MAX_REQUESTS', 100); // Max requests per window

/**
 * Simple in-memory rate limiter using IP
 * For production, use Redis or database-backed solution
 */
function checkRateLimit(): bool
{
    $ip = getClientIp();
    $cacheFile = sys_get_temp_dir() . '/chord_id_rate_' . md5($ip);

    $data = ['count' => 0, 'window_start' => time()];

    if (file_exists($cacheFile)) {
        $data = json_decode(file_get_contents($cacheFile), true) ?: $data;
    }

    // Reset window if expired
    if (time() - $data['window_start'] > RATE_LIMIT_WINDOW) {
        $data = ['count' => 1, 'window_start' => time()];
    } else {
        $data['count']++;
    }

    file_put_contents($cacheFile, json_encode($data));

    return $data['count'] <= RATE_LIMIT_MAX_REQUESTS;
}

/**
 * Get client IP address (handles proxies)
 */
function getClientIp(): string
{
    $headers = [
        'HTTP_CF_CONNECTING_IP',  // Cloudflare
        'HTTP_X_FORWARDED_FOR',
        'HTTP_X_REAL_IP',
        'REMOTE_ADDR'
    ];

    foreach ($headers as $header) {
        if (!empty($_SERVER[$header])) {
            $ips = explode(',', $_SERVER[$header]);
            $ip = trim($ips[0]);
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }
    }

    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

/**
 * Send JSON response
 */
function jsonResponse(array $data, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

/**
 * Send error response
 */
function errorResponse(string $message, int $statusCode = 400): void
{
    jsonResponse(['success' => false, 'error' => $message], $statusCode);
}

/**
 * Get or create a user based on visitor ID
 */
function getOrCreateUser(string $visitorId, array $metadata = []): array
{
    $db = getDB();

    // Check if user exists
    $stmt = $db->prepare('SELECT * FROM users WHERE visitor_id = ?');
    $stmt->execute([$visitorId]);
    $user = $stmt->fetch();

    if ($user) {
        // Update last seen and metadata
        $stmt = $db->prepare('
            UPDATE users
            SET last_seen_at = NOW(),
                visit_count = visit_count + 1,
                metadata = ?
            WHERE id = ?
        ');
        $stmt->execute([json_encode($metadata), $user['id']]);

        // Refresh user data
        $stmt = $db->prepare('SELECT * FROM users WHERE id = ?');
        $stmt->execute([$user['id']]);
        return $stmt->fetch();
    }

    // Create new user
    $ipHash = hash('sha256', getClientIp());

    $stmt = $db->prepare('
        INSERT INTO users (visitor_id, ip_hash, user_agent, metadata, first_seen_at, last_seen_at, visit_count)
        VALUES (?, ?, ?, ?, NOW(), NOW(), 1)
    ');
    $stmt->execute([
        $visitorId,
        $ipHash,
        $_SERVER['HTTP_USER_AGENT'] ?? '',
        json_encode($metadata)
    ]);

    $userId = $db->lastInsertId();

    $stmt = $db->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    return $stmt->fetch();
}

/**
 * Get or create a session for a user
 */
function getOrCreateSession(int $userId, string $sessionId): array
{
    $db = getDB();

    // Check if session exists
    $stmt = $db->prepare('SELECT * FROM sessions WHERE session_id = ? AND user_id = ?');
    $stmt->execute([$sessionId, $userId]);
    $session = $stmt->fetch();

    if ($session) {
        // Update last activity
        $stmt = $db->prepare('
            UPDATE sessions
            SET last_activity_at = NOW(),
                page_views = page_views + 1
            WHERE id = ?
        ');
        $stmt->execute([$session['id']]);

        $stmt = $db->prepare('SELECT * FROM sessions WHERE id = ?');
        $stmt->execute([$session['id']]);
        return $stmt->fetch();
    }

    // Create new session
    $stmt = $db->prepare('
        INSERT INTO sessions (session_id, user_id, ip_address, user_agent, referrer, started_at, last_activity_at, page_views)
        VALUES (?, ?, ?, ?, ?, NOW(), NOW(), 1)
    ');
    $stmt->execute([
        $sessionId,
        $userId,
        hash('sha256', getClientIp()),
        $_SERVER['HTTP_USER_AGENT'] ?? '',
        $_SERVER['HTTP_REFERER'] ?? null
    ]);

    $id = $db->lastInsertId();

    $stmt = $db->prepare('SELECT * FROM sessions WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch();
}

/**
 * Log an event for a user/session
 */
function logEvent(int $userId, int $sessionId, string $eventType, array $eventData = []): int
{
    $db = getDB();

    $stmt = $db->prepare('
        INSERT INTO events (user_id, session_id, event_type, event_data, created_at)
        VALUES (?, ?, ?, ?, NOW())
    ');
    $stmt->execute([
        $userId,
        $sessionId,
        $eventType,
        json_encode($eventData)
    ]);

    return (int) $db->lastInsertId();
}

/**
 * Log a page view
 */
function logPageView(int $userId, int $sessionId, string $pageName, array $metadata = []): int
{
    $db = getDB();

    $stmt = $db->prepare('
        INSERT INTO page_views (user_id, session_id, page_name, url, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
    ');
    $stmt->execute([
        $userId,
        $sessionId,
        $pageName,
        $metadata['url'] ?? null,
        json_encode($metadata)
    ]);

    return (int) $db->lastInsertId();
}

/**
 * Get user's poll status (voted, dismissed, or null)
 */
function getUserPollStatus(int $userId, string $pollId): ?array
{
    $db = getDB();

    $stmt = $db->prepare('
        SELECT action, option_index, created_at
        FROM poll_actions
        WHERE user_id = ? AND poll_id = ?
        ORDER BY created_at DESC
        LIMIT 1
    ');
    $stmt->execute([$userId, $pollId]);
    $result = $stmt->fetch();

    if (!$result) {
        return null;
    }

    return [
        'status' => $result['action'],  // 'voted' or 'dismissed'
        'option_index' => $result['option_index'],
        'timestamp' => $result['created_at']
    ];
}

/**
 * Mark a poll action (vote or dismiss)
 */
function markPollAction(int $userId, string $pollId, string $action, ?int $optionIndex = null): bool
{
    $db = getDB();

    // Check if already has an action
    $stmt = $db->prepare('SELECT id FROM poll_actions WHERE user_id = ? AND poll_id = ?');
    $stmt->execute([$userId, $pollId]);
    $existing = $stmt->fetch();

    if ($existing) {
        // Update existing action
        $stmt = $db->prepare('
            UPDATE poll_actions
            SET action = ?, option_index = ?, created_at = NOW()
            WHERE id = ?
        ');
        return $stmt->execute([$action, $optionIndex, $existing['id']]);
    }

    // Insert new action
    $stmt = $db->prepare('
        INSERT INTO poll_actions (user_id, poll_id, action, option_index, created_at)
        VALUES (?, ?, ?, ?, NOW())
    ');
    return $stmt->execute([$userId, $pollId, $action, $optionIndex]);
}

/**
 * Get all poll statuses for a user
 */
function getAllPollStatuses(int $userId): array
{
    $db = getDB();

    $stmt = $db->prepare('
        SELECT poll_id, action, option_index, created_at
        FROM poll_actions
        WHERE user_id = ?
    ');
    $stmt->execute([$userId]);

    $statuses = [];
    while ($row = $stmt->fetch()) {
        $statuses[$row['poll_id']] = [
            'status' => $row['action'],
            'option_index' => $row['option_index'],
            'timestamp' => $row['created_at']
        ];
    }

    return $statuses;
}

// ============================================================================
// Main Request Handler
// ============================================================================

// Check rate limit
if (!checkRateLimit()) {
    errorResponse('Rate limit exceeded. Please try again later.', 429);
}

// Only accept POST requests for tracking
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed. Use POST.', 405);
}

// Parse JSON body
$input = json_decode(file_get_contents('php://input'), true);

if (!$input) {
    errorResponse('Invalid JSON payload');
}

// Validate required fields
if (empty($input['visitor_id'])) {
    errorResponse('visitor_id is required');
}

if (empty($input['session_id'])) {
    errorResponse('session_id is required');
}

if (empty($input['action'])) {
    errorResponse('action is required');
}

try {
    $visitorId = $input['visitor_id'];
    $sessionId = $input['session_id'];
    $action = $input['action'];
    $metadata = $input['metadata'] ?? [];

    // Get or create user
    $user = getOrCreateUser($visitorId, $metadata);
    $userId = (int) $user['id'];

    // Get or create session
    $session = getOrCreateSession($userId, $sessionId);
    $sessionDbId = (int) $session['id'];

    $response = [
        'success' => true,
        'user_id' => $userId,
        'session_id' => $sessionDbId,
        'is_new_user' => $user['visit_count'] == 1
    ];

    // Handle different actions
    switch ($action) {
        case 'init':
            // Initial tracking call - just identify user
            $response['poll_statuses'] = getAllPollStatuses($userId);
            break;

        case 'page_view':
            $pageName = $input['page_name'] ?? 'unknown';
            $pageMetadata = $input['page_metadata'] ?? [];
            $pageViewId = logPageView($userId, $sessionDbId, $pageName, $pageMetadata);
            $response['page_view_id'] = $pageViewId;
            break;

        case 'event':
            $eventType = $input['event_type'] ?? 'generic';
            $eventData = $input['event_data'] ?? [];
            $eventId = logEvent($userId, $sessionDbId, $eventType, $eventData);
            $response['event_id'] = $eventId;
            break;

        case 'poll_vote':
            if (empty($input['poll_id'])) {
                errorResponse('poll_id is required for poll_vote action');
            }
            if (!isset($input['option_index'])) {
                errorResponse('option_index is required for poll_vote action');
            }
            markPollAction($userId, $input['poll_id'], 'voted', (int) $input['option_index']);
            $response['poll_status'] = getUserPollStatus($userId, $input['poll_id']);
            break;

        case 'poll_dismiss':
            if (empty($input['poll_id'])) {
                errorResponse('poll_id is required for poll_dismiss action');
            }
            markPollAction($userId, $input['poll_id'], 'dismissed', null);
            $response['poll_status'] = getUserPollStatus($userId, $input['poll_id']);
            break;

        case 'get_poll_status':
            if (empty($input['poll_id'])) {
                errorResponse('poll_id is required for get_poll_status action');
            }
            $response['poll_status'] = getUserPollStatus($userId, $input['poll_id']);
            break;

        case 'heartbeat':
            // Just update session activity (already done above)
            $response['message'] = 'heartbeat received';
            break;

        default:
            errorResponse('Unknown action: ' . $action);
    }

    jsonResponse($response);

} catch (PDOException $e) {
    error_log('Tracker DB Error: ' . $e->getMessage());
    errorResponse('Database error occurred', 500);
} catch (Exception $e) {
    error_log('Tracker Error: ' . $e->getMessage());
    errorResponse('An error occurred', 500);
}
