<?php
/**
 * Polls API Endpoint
 *
 * GET  /api/polls.php           - Get active polls with vote counts (excludes dismissed polls for user)
 * GET  /api/polls.php?id=X      - Get a specific poll
 * POST /api/polls.php           - Submit a vote or dismiss action
 *
 * POST body for voting:
 * {
 *   "poll_id": 1,
 *   "option_index": 0,
 *   "visitor_id": "uuid-string"
 * }
 *
 * POST body for dismissing:
 * {
 *   "poll_id": 1,
 *   "action": "dismiss",
 *   "visitor_id": "uuid-string"
 * }
 *
 * Database Schema:
 * - polls: id, question, options (JSON), vote_counts (JSON), is_active, expires_at, created_at
 * - poll_votes: id, poll_id, user_id, option_index, action ('voted'/'dismissed'), voted_at
 */

require_once __DIR__ . '/db_connect.php';

// Set JSON content type
header('Content-Type: application/json');

// Handle CORS
handleCors();

// Route request based on method
try {
    switch ($_SERVER['REQUEST_METHOD']) {
        case 'GET':
            handleGet();
            break;
        case 'POST':
            handlePost();
            break;
        case 'OPTIONS':
            // Preflight request - already handled by handleCors()
            http_response_code(204);
            exit;
        default:
            jsonError('Method not allowed', 405);
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
}

/**
 * Get visitor ID from request (query param or cookie)
 */
function getVisitorId(): ?string
{
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
 * GET handler - retrieve polls
 */
function handleGet(): void
{
    $pollId = isset($_GET['id']) ? (int)$_GET['id'] : null;
    $visitorId = getVisitorId();

    if ($pollId !== null) {
        // Get specific poll
        $poll = getPollWithCounts($pollId);
        if (!$poll) {
            jsonError('Poll not found', 404);
        }

        // Check user's vote/dismiss status
        if ($visitorId) {
            $userAction = getUserAction($pollId, $visitorId);
            $poll['user_voted'] = $userAction && $userAction['action'] === 'voted';
            $poll['user_vote_index'] = $userAction && $userAction['action'] === 'voted'
                ? (int)$userAction['option_index']
                : null;
            $poll['user_dismissed'] = $userAction && $userAction['action'] === 'dismissed';
        } else {
            $poll['user_voted'] = false;
            $poll['user_vote_index'] = null;
            $poll['user_dismissed'] = false;
        }

        jsonResponse($poll);
    } else {
        // Get all active polls, excluding dismissed ones for this user
        $polls = getActivePolls($visitorId);

        jsonResponse(['polls' => $polls]);
    }
}

/**
 * POST handler - submit a vote or dismiss action
 */
function handlePost(): void
{
    // Parse JSON body
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input) {
        jsonError('Invalid JSON body', 400);
    }

    // Validate required fields
    if (!isset($input['poll_id'])) {
        jsonError('Missing required field: poll_id', 400);
    }

    if (!isset($input['visitor_id']) || empty($input['visitor_id'])) {
        jsonError('Missing required field: visitor_id', 400);
    }

    $pollId = (int)$input['poll_id'];
    $visitorId = trim($input['visitor_id']);
    $action = isset($input['action']) ? $input['action'] : 'vote';

    // Validate poll exists and is active
    $poll = Database::fetchOne(
        'SELECT id, options, is_active, expires_at FROM polls WHERE id = ?',
        [$pollId]
    );

    if (!$poll) {
        jsonError('Poll not found', 404);
    }

    if (!$poll['is_active']) {
        jsonError('Poll is no longer active', 400);
    }

    if ($poll['expires_at'] && strtotime($poll['expires_at']) < time()) {
        jsonError('Poll has expired', 400);
    }

    // Handle dismiss action
    if ($action === 'dismiss') {
        return handleDismiss($pollId, $visitorId);
    }

    // Handle vote action
    if (!isset($input['option_index'])) {
        jsonError('Missing required field: option_index for voting', 400);
    }

    $optionIndex = (int)$input['option_index'];

    // Validate option index
    $options = json_decode($poll['options'], true);
    if ($optionIndex < 0 || $optionIndex >= count($options)) {
        jsonError('Invalid option index', 400);
    }

    // Check if user has already taken action on this poll
    $existingAction = getUserAction($pollId, $visitorId);

    if ($existingAction) {
        if ($existingAction['action'] === 'voted') {
            jsonError('You have already voted on this poll', 409);
        }
        if ($existingAction['action'] === 'dismissed') {
            // User previously dismissed, update to vote
            try {
                Database::execute(
                    'UPDATE poll_votes SET action = ?, option_index = ?, voted_at = NOW() WHERE poll_id = ? AND user_id = ?',
                    ['voted', $optionIndex, $pollId, $visitorId]
                );

                // Return updated poll with counts
                $updatedPoll = getPollWithCounts($pollId);
                $updatedPoll['user_voted'] = true;
                $updatedPoll['user_vote_index'] = $optionIndex;
                $updatedPoll['user_dismissed'] = false;

                jsonResponse([
                    'success' => true,
                    'message' => 'Vote recorded successfully',
                    'poll' => $updatedPoll
                ]);
            } catch (PDOException $e) {
                throw $e;
            }
        }
    }

    // Record the vote
    try {
        Database::insert(
            'INSERT INTO poll_votes (poll_id, user_id, option_index, action, voted_at) VALUES (?, ?, ?, ?, NOW())',
            [$pollId, $visitorId, $optionIndex, 'voted']
        );

        // Return updated poll with counts
        $updatedPoll = getPollWithCounts($pollId);
        $updatedPoll['user_voted'] = true;
        $updatedPoll['user_vote_index'] = $optionIndex;
        $updatedPoll['user_dismissed'] = false;

        jsonResponse([
            'success' => true,
            'message' => 'Vote recorded successfully',
            'poll' => $updatedPoll
        ]);

    } catch (PDOException $e) {
        // Duplicate vote (race condition)
        if ($e->getCode() == 23000) {
            jsonError('You have already voted on this poll', 409);
        }
        throw $e;
    }
}

/**
 * Handle dismiss action
 */
function handleDismiss(int $pollId, string $visitorId): void
{
    // Check if user has already taken action
    $existingAction = getUserAction($pollId, $visitorId);

    if ($existingAction) {
        if ($existingAction['action'] === 'dismissed') {
            jsonResponse([
                'success' => true,
                'message' => 'Poll already dismissed'
            ]);
        }
        // User has voted, don't allow dismiss (or optionally allow - depends on requirements)
        // For now, we'll allow dismissing after voting
        try {
            Database::execute(
                'UPDATE poll_votes SET action = ?, voted_at = NOW() WHERE poll_id = ? AND user_id = ?',
                ['dismissed', $pollId, $visitorId]
            );

            jsonResponse([
                'success' => true,
                'message' => 'Poll dismissed successfully'
            ]);
        } catch (PDOException $e) {
            throw $e;
        }
    }

    // Record the dismiss action
    try {
        Database::insert(
            'INSERT INTO poll_votes (poll_id, user_id, option_index, action, voted_at) VALUES (?, ?, NULL, ?, NOW())',
            [$pollId, $visitorId, 'dismissed']
        );

        jsonResponse([
            'success' => true,
            'message' => 'Poll dismissed successfully'
        ]);

    } catch (PDOException $e) {
        // Duplicate (race condition)
        if ($e->getCode() == 23000) {
            jsonResponse([
                'success' => true,
                'message' => 'Poll already dismissed'
            ]);
        }
        throw $e;
    }
}

/**
 * Get all active, non-expired polls with vote counts
 * Excludes polls the user has dismissed
 */
function getActivePolls(?string $visitorId): array
{
    // Base query for active polls
    $sql = 'SELECT id, question, options, created_at, expires_at, is_active
            FROM polls
            WHERE is_active = TRUE
              AND (expires_at IS NULL OR expires_at > NOW())';

    // If visitor ID provided, exclude dismissed polls
    if ($visitorId) {
        $sql .= ' AND id NOT IN (
            SELECT poll_id FROM poll_votes
            WHERE user_id = ? AND action = ?
        )';
        $polls = Database::fetchAll($sql . ' ORDER BY created_at DESC', [$visitorId, 'dismissed']);
    } else {
        $polls = Database::fetchAll($sql . ' ORDER BY created_at DESC');
    }

    // Add vote counts and user status to each poll
    foreach ($polls as &$poll) {
        $poll['options'] = json_decode($poll['options'], true);
        $poll['vote_counts'] = getVoteCounts($poll['id'], count($poll['options']));
        $poll['total_votes'] = array_sum($poll['vote_counts']);

        // Add user vote status
        if ($visitorId) {
            $userAction = getUserAction($poll['id'], $visitorId);
            $poll['user_voted'] = $userAction && $userAction['action'] === 'voted';
            $poll['user_vote_index'] = $userAction && $userAction['action'] === 'voted'
                ? (int)$userAction['option_index']
                : null;
        } else {
            $poll['user_voted'] = false;
            $poll['user_vote_index'] = null;
        }
    }

    return $polls;
}

/**
 * Get a specific poll with vote counts
 */
function getPollWithCounts(int $pollId): ?array
{
    $poll = Database::fetchOne(
        'SELECT id, question, options, created_at, expires_at, is_active FROM polls WHERE id = ?',
        [$pollId]
    );

    if (!$poll) {
        return null;
    }

    $poll['options'] = json_decode($poll['options'], true);
    $poll['vote_counts'] = getVoteCounts($pollId, count($poll['options']));
    $poll['total_votes'] = array_sum($poll['vote_counts']);

    return $poll;
}

/**
 * Get vote counts for each option in a poll
 * Only counts 'voted' actions, not 'dismissed'
 */
function getVoteCounts(int $pollId, int $optionCount): array
{
    $counts = array_fill(0, $optionCount, 0);

    $results = Database::fetchAll(
        'SELECT option_index, COUNT(*) as count
         FROM poll_votes
         WHERE poll_id = ? AND action = ?
         GROUP BY option_index',
        [$pollId, 'voted']
    );

    foreach ($results as $row) {
        if ($row['option_index'] !== null && $row['option_index'] < $optionCount) {
            $counts[$row['option_index']] = (int)$row['count'];
        }
    }

    return $counts;
}

/**
 * Get the user's action on a poll (voted or dismissed)
 */
function getUserAction(int $pollId, string $visitorId): ?array
{
    return Database::fetchOne(
        'SELECT option_index, action FROM poll_votes WHERE poll_id = ? AND user_id = ?',
        [$pollId, $visitorId]
    );
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
