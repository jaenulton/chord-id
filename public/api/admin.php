<?php
/**
 * Admin API Endpoint for Poll Management
 *
 * Authentication:
 * POST /api/admin.php?action=login   - Login (sets session)
 * POST /api/admin.php?action=logout  - Logout
 *
 * Poll Management (requires authentication):
 * GET  /api/admin.php?action=polls        - List all polls (including inactive)
 * POST /api/admin.php?action=create       - Create a new poll
 * POST /api/admin.php?action=update       - Update a poll
 * POST /api/admin.php?action=delete       - Delete a poll
 * POST /api/admin.php?action=toggle       - Toggle poll active status
 *
 * Request bodies (JSON):
 *
 * Login:
 * { "username": "admin", "password": "secret" }
 *
 * Create poll:
 * { "question": "...", "options": ["A", "B", "C"], "expires_at": "2024-12-31 23:59:59" }
 *
 * Update poll:
 * { "id": 1, "question": "...", "options": ["A", "B"], "expires_at": null }
 *
 * Delete/Toggle poll:
 * { "id": 1 }
 */

require_once __DIR__ . '/db_connect.php';

// Start session for admin authentication
session_name(ADMIN_SESSION_NAME);
session_set_cookie_params([
    'lifetime' => ADMIN_SESSION_LIFETIME,
    'path' => '/',
    'secure' => !DEBUG_MODE,
    'httponly' => true,
    'samesite' => 'Lax'
]);
session_start();

// Set JSON content type
header('Content-Type: application/json');

// Handle CORS
handleCors();

// Get the action
$action = $_GET['action'] ?? '';

try {
    switch ($action) {
        case 'login':
            handleLogin();
            break;
        case 'logout':
            handleLogout();
            break;
        case 'polls':
            requireAuth();
            handleGetPolls();
            break;
        case 'create':
            requireAuth();
            handleCreatePoll();
            break;
        case 'update':
            requireAuth();
            handleUpdatePoll();
            break;
        case 'delete':
            requireAuth();
            handleDeletePoll();
            break;
        case 'toggle':
            requireAuth();
            handleTogglePoll();
            break;
        case 'check':
            // Check if user is authenticated
            jsonResponse(['authenticated' => isAuthenticated()]);
            break;
        default:
            jsonError('Invalid action', 400);
    }
} catch (Exception $e) {
    jsonError(DEBUG_MODE ? $e->getMessage() : 'Server error', 500);
}

/**
 * Handle CORS headers for cross-origin requests
 */
function handleCors(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

    if (in_array($origin, ALLOWED_ORIGINS)) {
        header("Access-Control-Allow-Origin: $origin");
        header('Access-Control-Allow-Credentials: true');
    }

    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Max-Age: 86400');

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

/**
 * Check if user is authenticated
 */
function isAuthenticated(): bool
{
    return isset($_SESSION['admin_id']) && isset($_SESSION['admin_user']);
}

/**
 * Require authentication for protected endpoints
 */
function requireAuth(): void
{
    if (!isAuthenticated()) {
        jsonError('Unauthorized', 401);
    }
}

/**
 * Handle admin login
 */
function handleLogin(): void
{
    $input = json_decode(file_get_contents('php://input'), true);

    if (!isset($input['username']) || !isset($input['password'])) {
        jsonError('Username and password required', 400);
    }

    $user = Database::fetchOne(
        'SELECT id, username, password_hash FROM admin_users WHERE username = ?',
        [$input['username']]
    );

    if (!$user || !password_verify($input['password'], $user['password_hash'])) {
        // Log failed attempt
        sleep(1); // Rate limiting
        jsonError('Invalid credentials', 401);
    }

    // Update last login
    Database::execute(
        'UPDATE admin_users SET last_login = NOW() WHERE id = ?',
        [$user['id']]
    );

    // Set session
    $_SESSION['admin_id'] = $user['id'];
    $_SESSION['admin_user'] = $user['username'];

    jsonResponse([
        'success' => true,
        'message' => 'Login successful',
        'user' => $user['username']
    ]);
}

/**
 * Handle admin logout
 */
function handleLogout(): void
{
    session_destroy();
    jsonResponse(['success' => true, 'message' => 'Logged out']);
}

/**
 * Get all polls (including inactive) for admin view
 */
function handleGetPolls(): void
{
    $polls = Database::fetchAll(
        'SELECT p.id, p.question, p.options, p.created_at, p.expires_at, p.is_active,
                COUNT(pr.id) as total_votes
         FROM polls p
         LEFT JOIN poll_responses pr ON p.id = pr.poll_id
         GROUP BY p.id
         ORDER BY p.created_at DESC'
    );

    foreach ($polls as &$poll) {
        $poll['options'] = json_decode($poll['options'], true);
        $poll['vote_counts'] = getVoteCounts($poll['id'], count($poll['options']));
        $poll['total_votes'] = (int)$poll['total_votes'];
        $poll['is_active'] = (bool)$poll['is_active'];
        $poll['is_expired'] = $poll['expires_at'] && strtotime($poll['expires_at']) < time();
    }

    jsonResponse(['polls' => $polls]);
}

/**
 * Create a new poll
 */
function handleCreatePoll(): void
{
    $input = json_decode(file_get_contents('php://input'), true);

    // Validate required fields
    if (!isset($input['question']) || !isset($input['options'])) {
        jsonError('Question and options are required', 400);
    }

    $question = trim($input['question']);
    $options = $input['options'];
    $expiresAt = $input['expires_at'] ?? null;

    // Validate question
    if (strlen($question) < 5 || strlen($question) > 500) {
        jsonError('Question must be between 5 and 500 characters', 400);
    }

    // Validate options
    if (!is_array($options) || count($options) < 2 || count($options) > 10) {
        jsonError('Must have between 2 and 10 options', 400);
    }

    foreach ($options as $option) {
        if (!is_string($option) || strlen(trim($option)) < 1) {
            jsonError('All options must be non-empty strings', 400);
        }
    }

    // Clean options
    $options = array_map('trim', $options);

    // Validate expires_at if provided
    if ($expiresAt !== null) {
        $timestamp = strtotime($expiresAt);
        if (!$timestamp || $timestamp <= time()) {
            jsonError('Expiration date must be in the future', 400);
        }
        $expiresAt = date('Y-m-d H:i:s', $timestamp);
    }

    // Insert poll
    $pollId = Database::insert(
        'INSERT INTO polls (question, options, expires_at) VALUES (?, ?, ?)',
        [$question, json_encode($options, JSON_UNESCAPED_UNICODE), $expiresAt]
    );

    jsonResponse([
        'success' => true,
        'message' => 'Poll created successfully',
        'poll_id' => $pollId
    ]);
}

/**
 * Update an existing poll
 */
function handleUpdatePoll(): void
{
    $input = json_decode(file_get_contents('php://input'), true);

    if (!isset($input['id'])) {
        jsonError('Poll ID is required', 400);
    }

    $pollId = (int)$input['id'];

    // Check poll exists
    $poll = Database::fetchOne('SELECT id FROM polls WHERE id = ?', [$pollId]);
    if (!$poll) {
        jsonError('Poll not found', 404);
    }

    // Build update query dynamically
    $updates = [];
    $params = [];

    if (isset($input['question'])) {
        $question = trim($input['question']);
        if (strlen($question) < 5 || strlen($question) > 500) {
            jsonError('Question must be between 5 and 500 characters', 400);
        }
        $updates[] = 'question = ?';
        $params[] = $question;
    }

    if (isset($input['options'])) {
        $options = $input['options'];
        if (!is_array($options) || count($options) < 2 || count($options) > 10) {
            jsonError('Must have between 2 and 10 options', 400);
        }
        $options = array_map('trim', $options);
        $updates[] = 'options = ?';
        $params[] = json_encode($options, JSON_UNESCAPED_UNICODE);
    }

    if (array_key_exists('expires_at', $input)) {
        if ($input['expires_at'] === null) {
            $updates[] = 'expires_at = NULL';
        } else {
            $timestamp = strtotime($input['expires_at']);
            if (!$timestamp) {
                jsonError('Invalid expiration date format', 400);
            }
            $updates[] = 'expires_at = ?';
            $params[] = date('Y-m-d H:i:s', $timestamp);
        }
    }

    if (isset($input['is_active'])) {
        $updates[] = 'is_active = ?';
        $params[] = $input['is_active'] ? 1 : 0;
    }

    if (empty($updates)) {
        jsonError('No fields to update', 400);
    }

    $params[] = $pollId;
    $sql = 'UPDATE polls SET ' . implode(', ', $updates) . ' WHERE id = ?';

    Database::execute($sql, $params);

    jsonResponse([
        'success' => true,
        'message' => 'Poll updated successfully'
    ]);
}

/**
 * Delete a poll and all its responses
 */
function handleDeletePoll(): void
{
    $input = json_decode(file_get_contents('php://input'), true);

    if (!isset($input['id'])) {
        jsonError('Poll ID is required', 400);
    }

    $pollId = (int)$input['id'];

    // Check poll exists
    $poll = Database::fetchOne('SELECT id FROM polls WHERE id = ?', [$pollId]);
    if (!$poll) {
        jsonError('Poll not found', 404);
    }

    // Delete poll (responses will cascade)
    Database::execute('DELETE FROM polls WHERE id = ?', [$pollId]);

    jsonResponse([
        'success' => true,
        'message' => 'Poll deleted successfully'
    ]);
}

/**
 * Toggle poll active status
 */
function handleTogglePoll(): void
{
    $input = json_decode(file_get_contents('php://input'), true);

    if (!isset($input['id'])) {
        jsonError('Poll ID is required', 400);
    }

    $pollId = (int)$input['id'];

    // Toggle is_active
    Database::execute(
        'UPDATE polls SET is_active = NOT is_active WHERE id = ?',
        [$pollId]
    );

    // Get new status
    $poll = Database::fetchOne('SELECT is_active FROM polls WHERE id = ?', [$pollId]);

    if (!$poll) {
        jsonError('Poll not found', 404);
    }

    jsonResponse([
        'success' => true,
        'message' => 'Poll ' . ($poll['is_active'] ? 'activated' : 'deactivated'),
        'is_active' => (bool)$poll['is_active']
    ]);
}

/**
 * Get vote counts for each option in a poll
 */
function getVoteCounts(int $pollId, int $optionCount): array
{
    $counts = array_fill(0, $optionCount, 0);

    $results = Database::fetchAll(
        'SELECT option_index, COUNT(*) as count
         FROM poll_responses
         WHERE poll_id = ?
         GROUP BY option_index',
        [$pollId]
    );

    foreach ($results as $row) {
        if ($row['option_index'] < $optionCount) {
            $counts[$row['option_index']] = (int)$row['count'];
        }
    }

    return $counts;
}

/**
 * Send a JSON response
 */
function jsonResponse(array $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Send a JSON error response
 */
function jsonError(string $message, int $code = 400): void
{
    jsonResponse(['error' => $message], $code);
}
