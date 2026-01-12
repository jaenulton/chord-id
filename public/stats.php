<?php
/**
 * Chord-ID Analytics Dashboard Backend
 *
 * Comprehensive statistics API for tracking user behavior, sessions, events, and polls.
 * Password protected with the same system as admin.php.
 */

// Include database connection
require_once __DIR__ . '/api/db_connect.php';

// Set headers
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Check if this is an API request
$action = $_GET['action'] ?? null;

// If no action, serve the HTML page
if (!$action) {
    serveHtmlPage();
    exit;
}

// Process API requests
try {
    $response = processApiRequest($action);
    echo json_encode($response);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => DEBUG_MODE ? $e->getMessage() : 'An error occurred'
    ]);
}

/**
 * Process API requests based on action
 */
function processApiRequest(string $action): array {
    // Get date range filter
    $range = $_GET['range'] ?? 'all';
    $dateCondition = getDateCondition($range);

    switch ($action) {
        case 'get_overview':
            return getOverviewStats($dateCondition, $range);

        case 'get_users':
            return getUsersData($dateCondition);

        case 'get_sessions':
            return getSessionsData($dateCondition);

        case 'get_events':
            return getEventsData($dateCondition);

        case 'get_trends':
            return getTrendsData($dateCondition, $range);

        case 'get_polls':
            return getPollsData();

        case 'export_csv':
            return exportCsv($dateCondition);

        default:
            return ['success' => false, 'error' => 'Unknown action'];
    }
}

/**
 * Get SQL date condition based on range
 */
function getDateCondition(string $range): array {
    $now = date('Y-m-d H:i:s');

    switch ($range) {
        case 'today':
            return [
                'condition' => "DATE(created_at) = CURDATE()",
                'start' => date('Y-m-d 00:00:00'),
                'end' => $now
            ];
        case '7d':
            return [
                'condition' => "created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)",
                'start' => date('Y-m-d H:i:s', strtotime('-7 days')),
                'end' => $now
            ];
        case '30d':
            return [
                'condition' => "created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)",
                'start' => date('Y-m-d H:i:s', strtotime('-30 days')),
                'end' => $now
            ];
        case '90d':
            return [
                'condition' => "created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)",
                'start' => date('Y-m-d H:i:s', strtotime('-90 days')),
                'end' => $now
            ];
        case 'all':
        default:
            return [
                'condition' => "1=1",
                'start' => null,
                'end' => $now
            ];
    }
}

/**
 * Get comprehensive overview statistics
 */
function getOverviewStats(array $dateCondition, string $range): array {
    $db = Database::getInstance();

    // ==========================================
    // USER METRICS
    // ==========================================

    // Total unique users (all time)
    $totalUsers = Database::fetchOne("SELECT COUNT(*) as count FROM users")['count'] ?? 0;

    // New users in range
    $newUsersQuery = "SELECT COUNT(*) as count FROM users WHERE " . str_replace('created_at', 'first_seen', $dateCondition['condition']);
    $newUsers = Database::fetchOne($newUsersQuery)['count'] ?? 0;

    // New users today
    $newUsersToday = Database::fetchOne("SELECT COUNT(*) as count FROM users WHERE DATE(first_seen) = CURDATE()")['count'] ?? 0;

    // New users this week
    $newUsersWeek = Database::fetchOne("SELECT COUNT(*) as count FROM users WHERE first_seen >= DATE_SUB(NOW(), INTERVAL 7 DAY)")['count'] ?? 0;

    // New users this month
    $newUsersMonth = Database::fetchOne("SELECT COUNT(*) as count FROM users WHERE first_seen >= DATE_SUB(NOW(), INTERVAL 30 DAY)")['count'] ?? 0;

    // Returning vs new users (users with total_visits > 1 are returning)
    $returningUsers = Database::fetchOne("SELECT COUNT(*) as count FROM users WHERE total_visits > 1")['count'] ?? 0;
    $newOnlyUsers = $totalUsers - $returningUsers;

    // Users by platform
    $usersByPlatform = Database::fetchAll("
        SELECT
            COALESCE(platform, 'Unknown') as platform,
            COUNT(*) as count
        FROM users
        GROUP BY platform
        ORDER BY count DESC
    ");

    // Users by browser (extract from user_agent)
    $usersByBrowser = Database::fetchAll("
        SELECT
            CASE
                WHEN user_agent LIKE '%Chrome%' AND user_agent NOT LIKE '%Edg%' THEN 'Chrome'
                WHEN user_agent LIKE '%Firefox%' THEN 'Firefox'
                WHEN user_agent LIKE '%Safari%' AND user_agent NOT LIKE '%Chrome%' THEN 'Safari'
                WHEN user_agent LIKE '%Edg%' THEN 'Edge'
                WHEN user_agent LIKE '%Opera%' OR user_agent LIKE '%OPR%' THEN 'Opera'
                ELSE 'Other'
            END as browser,
            COUNT(*) as count
        FROM users
        GROUP BY browser
        ORDER BY count DESC
    ");

    // Users by screen resolution
    $usersByResolution = Database::fetchAll("
        SELECT
            COALESCE(screen_resolution, 'Unknown') as resolution,
            COUNT(*) as count
        FROM users
        GROUP BY screen_resolution
        ORDER BY count DESC
        LIMIT 10
    ");

    // Users by timezone/region
    $usersByTimezone = Database::fetchAll("
        SELECT
            COALESCE(timezone, 'Unknown') as timezone,
            COUNT(*) as count
        FROM users
        GROUP BY timezone
        ORDER BY count DESC
        LIMIT 15
    ");

    // ==========================================
    // SESSION METRICS
    // ==========================================

    // Total sessions (all time)
    $totalSessions = Database::fetchOne("SELECT COUNT(*) as count FROM sessions")['count'] ?? 0;

    // Sessions in range
    $sessionsQuery = "SELECT COUNT(*) as count FROM sessions WHERE " . str_replace('created_at', 'started_at', $dateCondition['condition']);
    $sessionsInRange = Database::fetchOne($sessionsQuery)['count'] ?? 0;

    // Sessions today
    $sessionsToday = Database::fetchOne("SELECT COUNT(*) as count FROM sessions WHERE DATE(started_at) = CURDATE()")['count'] ?? 0;

    // Sessions this week
    $sessionsWeek = Database::fetchOne("SELECT COUNT(*) as count FROM sessions WHERE started_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)")['count'] ?? 0;

    // Sessions this month
    $sessionsMonth = Database::fetchOne("SELECT COUNT(*) as count FROM sessions WHERE started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)")['count'] ?? 0;

    // Average session duration
    $avgDuration = Database::fetchOne("
        SELECT AVG(duration_seconds) as avg_duration
        FROM sessions
        WHERE duration_seconds > 0 AND duration_seconds < 86400
    ")['avg_duration'] ?? 0;

    // Median session duration (approximation using percentile)
    $medianDuration = Database::fetchOne("
        SELECT duration_seconds as median
        FROM sessions
        WHERE duration_seconds > 0 AND duration_seconds < 86400
        ORDER BY duration_seconds
        LIMIT 1 OFFSET (
            SELECT FLOOR(COUNT(*) / 2) FROM sessions WHERE duration_seconds > 0 AND duration_seconds < 86400
        )
    ")['median'] ?? 0;

    // Bounce rate (sessions < 10 seconds)
    $bounceSessions = Database::fetchOne("
        SELECT COUNT(*) as count
        FROM sessions
        WHERE duration_seconds < 10 OR duration_seconds IS NULL
    ")['count'] ?? 0;
    $bounceRate = $totalSessions > 0 ? round(($bounceSessions / $totalSessions) * 100, 2) : 0;

    // Sessions by hour of day (for heatmap)
    $sessionsByHour = Database::fetchAll("
        SELECT
            HOUR(started_at) as hour,
            COUNT(*) as count
        FROM sessions
        GROUP BY HOUR(started_at)
        ORDER BY hour
    ");

    // Sessions by day of week
    $sessionsByDayOfWeek = Database::fetchAll("
        SELECT
            DAYOFWEEK(started_at) as day_num,
            DAYNAME(started_at) as day_name,
            COUNT(*) as count
        FROM sessions
        GROUP BY DAYOFWEEK(started_at), DAYNAME(started_at)
        ORDER BY day_num
    ");

    // ==========================================
    // ENGAGEMENT METRICS
    // ==========================================

    // Total events tracked
    $totalEvents = Database::fetchOne("SELECT COUNT(*) as count FROM events")['count'] ?? 0;

    // Events in range
    $eventsQuery = "SELECT COUNT(*) as count FROM events WHERE " . str_replace('created_at', 'timestamp', $dateCondition['condition']);
    $eventsInRange = Database::fetchOne($eventsQuery)['count'] ?? 0;

    // Events by type breakdown
    $eventsByType = Database::fetchAll("
        SELECT
            event_type,
            COUNT(*) as count
        FROM events
        GROUP BY event_type
        ORDER BY count DESC
    ");

    // Most used instruments (from events with instrument data)
    $mostUsedInstruments = Database::fetchAll("
        SELECT
            JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.instrument')) as instrument,
            COUNT(*) as count
        FROM events
        WHERE event_type = 'instrument_switch'
            AND JSON_EXTRACT(event_data, '$.instrument') IS NOT NULL
        GROUP BY instrument
        ORDER BY count DESC
        LIMIT 10
    ");

    // Most used themes
    $mostUsedThemes = Database::fetchAll("
        SELECT
            JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.theme')) as theme,
            COUNT(*) as count
        FROM events
        WHERE event_type = 'theme_change'
            AND JSON_EXTRACT(event_data, '$.theme') IS NOT NULL
        GROUP BY theme
        ORDER BY count DESC
        LIMIT 10
    ");

    // Chord detection count
    $chordDetectionCount = Database::fetchOne("
        SELECT COUNT(*) as count
        FROM events
        WHERE event_type = 'chord_detected'
    ")['count'] ?? 0;

    // Average chords per session
    $chordsPerSession = Database::fetchOne("
        SELECT AVG(chord_count) as avg_chords
        FROM (
            SELECT session_id, COUNT(*) as chord_count
            FROM events
            WHERE event_type = 'chord_detected'
            GROUP BY session_id
        ) as session_chords
    ")['avg_chords'] ?? 0;

    // Feature adoption rates (percentage of users who used each feature)
    $featureAdoption = Database::fetchAll("
        SELECT
            event_type as feature,
            COUNT(DISTINCT user_id) as users_count,
            ROUND((COUNT(DISTINCT user_id) / (SELECT COUNT(*) FROM users)) * 100, 2) as adoption_rate
        FROM events
        GROUP BY event_type
        ORDER BY users_count DESC
    ");

    // ==========================================
    // POLL METRICS
    // ==========================================

    // Total poll votes
    $totalPollVotes = Database::fetchOne("
        SELECT COUNT(*) as count
        FROM poll_votes
        WHERE action = 'voted'
    ")['count'] ?? 0;

    // Poll completion rate (voted vs total interactions)
    $totalPollInteractions = Database::fetchOne("SELECT COUNT(*) as count FROM poll_votes")['count'] ?? 0;
    $pollCompletionRate = $totalPollInteractions > 0
        ? round(($totalPollVotes / $totalPollInteractions) * 100, 2)
        : 0;

    // Dismiss rate
    $dismissedPolls = Database::fetchOne("
        SELECT COUNT(*) as count
        FROM poll_votes
        WHERE action = 'dismissed'
    ")['count'] ?? 0;
    $pollDismissRate = $totalPollInteractions > 0
        ? round(($dismissedPolls / $totalPollInteractions) * 100, 2)
        : 0;

    // Votes by poll
    $votesByPoll = Database::fetchAll("
        SELECT
            p.id,
            p.question,
            p.options,
            p.vote_counts,
            COUNT(pv.id) as total_interactions,
            SUM(CASE WHEN pv.action = 'voted' THEN 1 ELSE 0 END) as votes,
            SUM(CASE WHEN pv.action = 'dismissed' THEN 1 ELSE 0 END) as dismisses
        FROM polls p
        LEFT JOIN poll_votes pv ON p.id = pv.poll_id
        GROUP BY p.id
        ORDER BY p.created_at DESC
    ");

    // ==========================================
    // TIME METRICS
    // ==========================================

    // Total time on site (all users combined) - in seconds
    $totalTimeOnSite = Database::fetchOne("
        SELECT SUM(total_time_seconds) as total_time FROM users
    ")['total_time'] ?? 0;

    // Average time per user
    $avgTimePerUser = $totalUsers > 0 ? round($totalTimeOnSite / $totalUsers) : 0;

    // Time distribution buckets
    $timeDistribution = Database::fetchAll("
        SELECT
            CASE
                WHEN total_time_seconds < 60 THEN '<1 min'
                WHEN total_time_seconds < 300 THEN '1-5 min'
                WHEN total_time_seconds < 900 THEN '5-15 min'
                WHEN total_time_seconds < 1800 THEN '15-30 min'
                ELSE '30+ min'
            END as time_bucket,
            COUNT(*) as user_count
        FROM users
        GROUP BY time_bucket
        ORDER BY FIELD(time_bucket, '<1 min', '1-5 min', '5-15 min', '15-30 min', '30+ min')
    ");

    // Peak usage times (top 5 hours)
    $peakUsageTimes = Database::fetchAll("
        SELECT
            HOUR(started_at) as hour,
            COUNT(*) as session_count
        FROM sessions
        GROUP BY HOUR(started_at)
        ORDER BY session_count DESC
        LIMIT 5
    ");

    // Active users (users seen in last 24 hours)
    $activeUsers24h = Database::fetchOne("
        SELECT COUNT(*) as count FROM users WHERE last_seen >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    ")['count'] ?? 0;

    // Active users (users seen in last 7 days)
    $activeUsers7d = Database::fetchOne("
        SELECT COUNT(*) as count FROM users WHERE last_seen >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    ")['count'] ?? 0;

    return [
        'success' => true,
        'range' => $range,
        'generated_at' => date('Y-m-d H:i:s'),
        'data' => [
            'users' => [
                'total' => (int)$totalUsers,
                'new_today' => (int)$newUsersToday,
                'new_this_week' => (int)$newUsersWeek,
                'new_this_month' => (int)$newUsersMonth,
                'new_in_range' => (int)$newUsers,
                'returning' => (int)$returningUsers,
                'new_only' => (int)$newOnlyUsers,
                'returning_ratio' => $totalUsers > 0 ? round(($returningUsers / $totalUsers) * 100, 2) : 0,
                'active_24h' => (int)$activeUsers24h,
                'active_7d' => (int)$activeUsers7d,
                'by_platform' => $usersByPlatform,
                'by_browser' => $usersByBrowser,
                'by_resolution' => $usersByResolution,
                'by_timezone' => $usersByTimezone
            ],
            'sessions' => [
                'total' => (int)$totalSessions,
                'today' => (int)$sessionsToday,
                'this_week' => (int)$sessionsWeek,
                'this_month' => (int)$sessionsMonth,
                'in_range' => (int)$sessionsInRange,
                'avg_duration_seconds' => round($avgDuration),
                'avg_duration_formatted' => formatDuration($avgDuration),
                'median_duration_seconds' => round($medianDuration),
                'median_duration_formatted' => formatDuration($medianDuration),
                'bounce_rate' => $bounceRate,
                'bounce_sessions' => (int)$bounceSessions,
                'by_hour' => $sessionsByHour,
                'by_day_of_week' => $sessionsByDayOfWeek
            ],
            'engagement' => [
                'total_events' => (int)$totalEvents,
                'events_in_range' => (int)$eventsInRange,
                'by_type' => $eventsByType,
                'most_used_instruments' => $mostUsedInstruments,
                'most_used_themes' => $mostUsedThemes,
                'chord_detection_count' => (int)$chordDetectionCount,
                'avg_chords_per_session' => round($chordsPerSession, 2),
                'feature_adoption' => $featureAdoption
            ],
            'polls' => [
                'total_votes' => (int)$totalPollVotes,
                'total_interactions' => (int)$totalPollInteractions,
                'completion_rate' => $pollCompletionRate,
                'dismiss_rate' => $pollDismissRate,
                'dismissed_count' => (int)$dismissedPolls,
                'by_poll' => $votesByPoll
            ],
            'time' => [
                'total_time_seconds' => (int)$totalTimeOnSite,
                'total_time_formatted' => formatDuration($totalTimeOnSite),
                'avg_per_user_seconds' => (int)$avgTimePerUser,
                'avg_per_user_formatted' => formatDuration($avgTimePerUser),
                'distribution' => $timeDistribution,
                'peak_hours' => $peakUsageTimes
            ]
        ]
    ];
}

/**
 * Get paginated users data
 */
function getUsersData(array $dateCondition): array {
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = min(100, max(10, (int)($_GET['limit'] ?? 50)));
    $offset = ($page - 1) * $limit;
    $sortBy = $_GET['sort'] ?? 'last_seen';
    $sortOrder = strtoupper($_GET['order'] ?? 'DESC') === 'ASC' ? 'ASC' : 'DESC';

    // Validate sort column
    $allowedSorts = ['id', 'first_seen', 'last_seen', 'total_visits', 'total_time_seconds', 'platform'];
    if (!in_array($sortBy, $allowedSorts)) {
        $sortBy = 'last_seen';
    }

    // Get total count
    $totalCount = Database::fetchOne("SELECT COUNT(*) as count FROM users")['count'] ?? 0;

    // Get users
    $users = Database::fetchAll("
        SELECT
            u.id,
            u.visitor_id,
            u.first_seen,
            u.last_seen,
            u.total_visits,
            u.total_time_seconds,
            u.screen_resolution,
            u.timezone,
            u.language,
            u.platform,
            (SELECT COUNT(*) FROM sessions WHERE user_id = u.id) as session_count,
            (SELECT COUNT(*) FROM events WHERE user_id = u.id) as event_count
        FROM users u
        ORDER BY {$sortBy} {$sortOrder}
        LIMIT {$limit} OFFSET {$offset}
    ");

    return [
        'success' => true,
        'data' => [
            'users' => $users,
            'pagination' => [
                'page' => $page,
                'limit' => $limit,
                'total' => (int)$totalCount,
                'total_pages' => ceil($totalCount / $limit)
            ]
        ]
    ];
}

/**
 * Get paginated sessions data
 */
function getSessionsData(array $dateCondition): array {
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = min(100, max(10, (int)($_GET['limit'] ?? 50)));
    $offset = ($page - 1) * $limit;

    // Get total count
    $totalCount = Database::fetchOne("
        SELECT COUNT(*) as count FROM sessions WHERE " . str_replace('created_at', 'started_at', $dateCondition['condition'])
    )['count'] ?? 0;

    // Get sessions
    $condition = str_replace('created_at', 's.started_at', $dateCondition['condition']);
    $sessions = Database::fetchAll("
        SELECT
            s.id,
            s.session_id,
            s.started_at,
            s.ended_at,
            s.duration_seconds,
            s.entry_page,
            s.exit_page,
            s.page_views,
            s.referrer,
            u.visitor_id,
            u.platform,
            u.screen_resolution
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE {$condition}
        ORDER BY s.started_at DESC
        LIMIT {$limit} OFFSET {$offset}
    ");

    return [
        'success' => true,
        'data' => [
            'sessions' => $sessions,
            'pagination' => [
                'page' => $page,
                'limit' => $limit,
                'total' => (int)$totalCount,
                'total_pages' => ceil($totalCount / $limit)
            ]
        ]
    ];
}

/**
 * Get paginated events data
 */
function getEventsData(array $dateCondition): array {
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = min(100, max(10, (int)($_GET['limit'] ?? 50)));
    $offset = ($page - 1) * $limit;
    $eventType = $_GET['event_type'] ?? null;

    // Build condition
    $condition = str_replace('created_at', 'e.timestamp', $dateCondition['condition']);
    if ($eventType) {
        $condition .= " AND e.event_type = :event_type";
    }

    // Get total count
    $countSql = "SELECT COUNT(*) as count FROM events e WHERE " . $condition;
    $countParams = $eventType ? ['event_type' => $eventType] : [];

    // Have to execute manually for parameterized query
    $stmt = Database::getInstance()->prepare($countSql);
    $stmt->execute($countParams);
    $totalCount = $stmt->fetch()['count'] ?? 0;

    // Get events
    $sql = "
        SELECT
            e.id,
            e.event_type,
            e.event_data,
            e.timestamp,
            u.visitor_id,
            u.platform,
            s.session_id
        FROM events e
        JOIN users u ON e.user_id = u.id
        JOIN sessions s ON e.session_id = s.id
        WHERE {$condition}
        ORDER BY e.timestamp DESC
        LIMIT {$limit} OFFSET {$offset}
    ";

    $stmt = Database::getInstance()->prepare($sql);
    $stmt->execute($countParams);
    $events = $stmt->fetchAll();

    // Get event types for filter dropdown
    $eventTypes = Database::fetchAll("
        SELECT DISTINCT event_type, COUNT(*) as count
        FROM events
        GROUP BY event_type
        ORDER BY count DESC
    ");

    return [
        'success' => true,
        'data' => [
            'events' => $events,
            'event_types' => $eventTypes,
            'pagination' => [
                'page' => $page,
                'limit' => $limit,
                'total' => (int)$totalCount,
                'total_pages' => ceil($totalCount / $limit)
            ]
        ]
    ];
}

/**
 * Get time-series data for charts
 */
function getTrendsData(array $dateCondition, string $range): array {
    // Determine grouping based on range
    switch ($range) {
        case 'today':
            $groupBy = "DATE_FORMAT(started_at, '%Y-%m-%d %H:00:00')";
            $dateFormat = '%H:00';
            break;
        case '7d':
            $groupBy = "DATE(started_at)";
            $dateFormat = '%m/%d';
            break;
        case '30d':
        case '90d':
            $groupBy = "DATE(started_at)";
            $dateFormat = '%m/%d';
            break;
        case 'all':
        default:
            $groupBy = "DATE_FORMAT(started_at, '%Y-%m')";
            $dateFormat = '%Y-%m';
            break;
    }

    $condition = str_replace('created_at', 'started_at', $dateCondition['condition']);

    // Sessions over time
    $sessionsOverTime = Database::fetchAll("
        SELECT
            DATE_FORMAT(started_at, '{$dateFormat}') as label,
            {$groupBy} as date_group,
            COUNT(*) as sessions,
            COUNT(DISTINCT user_id) as unique_users,
            AVG(duration_seconds) as avg_duration
        FROM sessions
        WHERE {$condition}
        GROUP BY date_group, label
        ORDER BY date_group ASC
    ");

    // New users over time
    $conditionUsers = str_replace('created_at', 'first_seen', $dateCondition['condition']);
    $groupByUsers = str_replace('started_at', 'first_seen', $groupBy);
    $newUsersOverTime = Database::fetchAll("
        SELECT
            DATE_FORMAT(first_seen, '{$dateFormat}') as label,
            {$groupByUsers} as date_group,
            COUNT(*) as new_users
        FROM users
        WHERE {$conditionUsers}
        GROUP BY date_group, label
        ORDER BY date_group ASC
    ");

    // Events over time
    $conditionEvents = str_replace('created_at', 'timestamp', $dateCondition['condition']);
    $groupByEvents = str_replace('started_at', 'timestamp', $groupBy);
    $eventsOverTime = Database::fetchAll("
        SELECT
            DATE_FORMAT(timestamp, '{$dateFormat}') as label,
            {$groupByEvents} as date_group,
            COUNT(*) as events,
            COUNT(DISTINCT user_id) as active_users
        FROM events
        WHERE {$conditionEvents}
        GROUP BY date_group, label
        ORDER BY date_group ASC
    ");

    // Chord detections over time
    $chordDetectionsOverTime = Database::fetchAll("
        SELECT
            DATE_FORMAT(timestamp, '{$dateFormat}') as label,
            {$groupByEvents} as date_group,
            COUNT(*) as chord_detections
        FROM events
        WHERE event_type = 'chord_detected' AND {$conditionEvents}
        GROUP BY date_group, label
        ORDER BY date_group ASC
    ");

    return [
        'success' => true,
        'data' => [
            'sessions_over_time' => $sessionsOverTime,
            'new_users_over_time' => $newUsersOverTime,
            'events_over_time' => $eventsOverTime,
            'chord_detections_over_time' => $chordDetectionsOverTime
        ]
    ];
}

/**
 * Get detailed polls data
 */
function getPollsData(): array {
    $polls = Database::fetchAll("
        SELECT
            p.id,
            p.question,
            p.options,
            p.vote_counts,
            p.is_active,
            p.expires_at,
            p.created_at,
            COUNT(pv.id) as total_interactions,
            SUM(CASE WHEN pv.action = 'voted' THEN 1 ELSE 0 END) as total_votes,
            SUM(CASE WHEN pv.action = 'dismissed' THEN 1 ELSE 0 END) as total_dismisses
        FROM polls p
        LEFT JOIN poll_votes pv ON p.id = pv.poll_id
        GROUP BY p.id
        ORDER BY p.created_at DESC
    ");

    // Get vote distribution for each poll
    foreach ($polls as &$poll) {
        $voteDistribution = Database::fetchAll("
            SELECT
                option_index,
                COUNT(*) as vote_count
            FROM poll_votes
            WHERE poll_id = ? AND action = 'voted'
            GROUP BY option_index
            ORDER BY option_index
        ", [$poll['id']]);

        $poll['vote_distribution'] = $voteDistribution;

        // Parse JSON fields
        $poll['options'] = json_decode($poll['options'], true);
        $poll['vote_counts'] = json_decode($poll['vote_counts'], true);
    }

    return [
        'success' => true,
        'data' => [
            'polls' => $polls
        ]
    ];
}

/**
 * Export data as CSV
 */
function exportCsv(array $dateCondition): array {
    $exportType = $_GET['type'] ?? 'users';
    $filename = "chord-id-{$exportType}-" . date('Y-m-d') . ".csv";

    // Set headers for CSV download
    header('Content-Type: text/csv');
    header('Content-Disposition: attachment; filename="' . $filename . '"');

    $output = fopen('php://output', 'w');

    switch ($exportType) {
        case 'users':
            $users = Database::fetchAll("
                SELECT
                    id,
                    visitor_id,
                    first_seen,
                    last_seen,
                    total_visits,
                    total_time_seconds,
                    screen_resolution,
                    timezone,
                    language,
                    platform
                FROM users
                ORDER BY last_seen DESC
            ");

            // Header row
            fputcsv($output, ['ID', 'Visitor ID', 'First Seen', 'Last Seen', 'Total Visits', 'Total Time (sec)', 'Screen Resolution', 'Timezone', 'Language', 'Platform']);

            foreach ($users as $user) {
                fputcsv($output, array_values($user));
            }
            break;

        case 'sessions':
            $condition = str_replace('created_at', 'started_at', $dateCondition['condition']);
            $sessions = Database::fetchAll("
                SELECT
                    s.id,
                    s.session_id,
                    u.visitor_id,
                    s.started_at,
                    s.ended_at,
                    s.duration_seconds,
                    s.entry_page,
                    s.exit_page,
                    s.page_views,
                    s.referrer
                FROM sessions s
                JOIN users u ON s.user_id = u.id
                WHERE {$condition}
                ORDER BY s.started_at DESC
            ");

            fputcsv($output, ['ID', 'Session ID', 'Visitor ID', 'Started At', 'Ended At', 'Duration (sec)', 'Entry Page', 'Exit Page', 'Page Views', 'Referrer']);

            foreach ($sessions as $session) {
                fputcsv($output, array_values($session));
            }
            break;

        case 'events':
            $condition = str_replace('created_at', 'timestamp', $dateCondition['condition']);
            $events = Database::fetchAll("
                SELECT
                    e.id,
                    e.event_type,
                    e.event_data,
                    e.timestamp,
                    u.visitor_id,
                    s.session_id
                FROM events e
                JOIN users u ON e.user_id = u.id
                JOIN sessions s ON e.session_id = s.id
                WHERE {$condition}
                ORDER BY e.timestamp DESC
            ");

            fputcsv($output, ['ID', 'Event Type', 'Event Data', 'Timestamp', 'Visitor ID', 'Session ID']);

            foreach ($events as $event) {
                fputcsv($output, array_values($event));
            }
            break;
    }

    fclose($output);
    exit;
}

/**
 * Format duration in seconds to human readable format
 */
function formatDuration(float $seconds): string {
    if ($seconds < 60) {
        return round($seconds) . 's';
    } elseif ($seconds < 3600) {
        $minutes = floor($seconds / 60);
        $secs = round($seconds % 60);
        return $minutes . 'm ' . $secs . 's';
    } elseif ($seconds < 86400) {
        $hours = floor($seconds / 3600);
        $minutes = floor(($seconds % 3600) / 60);
        return $hours . 'h ' . $minutes . 'm';
    } else {
        $days = floor($seconds / 86400);
        $hours = floor(($seconds % 86400) / 3600);
        return $days . 'd ' . $hours . 'h';
    }
}

/**
 * Serve the HTML page - includes the full analytics dashboard
 */
function serveHtmlPage(): void {
    header('Content-Type: text/html; charset=UTF-8');
    // Serve the detailed frontend from stats-frontend.html
    $frontendFile = __DIR__ . '/stats-frontend.html';
    if (file_exists($frontendFile)) {
        readfile($frontendFile);
        return;
    }
    // Fallback if file doesn't exist
    ?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chord-ID Analytics</title>
    <style>
        :root {
            --primary: #3b82f6;
            --primary-glow: #60a5fa;
            --secondary: #8b5cf6;
            --accent: #22d3ee;
            --bg-dark: #0a0a0f;
            --bg-card: #12121a;
            --bg-input: #1a1a24;
            --text: #ffffff;
            --text-muted: #9ca3af;
            --border: #2d2d3a;
            --success: #22c55e;
            --danger: #ef4444;
            --warning: #f59e0b;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-dark);
            color: var(--text);
            min-height: 100vh;
            line-height: 1.6;
        }

        /* Login Overlay */
        #login-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: var(--bg-dark);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }

        .login-box {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 40px;
            width: 100%;
            max-width: 400px;
            text-align: center;
        }

        .login-box h1 {
            font-size: 28px;
            margin-bottom: 8px;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .login-box p {
            color: var(--text-muted);
            margin-bottom: 24px;
        }

        .login-box input {
            width: 100%;
            padding: 14px 16px;
            border: 1px solid var(--border);
            border-radius: 8px;
            background: var(--bg-input);
            color: var(--text);
            font-size: 16px;
            margin-bottom: 16px;
            text-align: center;
            letter-spacing: 4px;
        }

        .login-box input:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
        }

        .login-error {
            color: var(--danger);
            font-size: 14px;
            margin-bottom: 16px;
            display: none;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 12px 20px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: transform 0.15s, box-shadow 0.15s;
        }

        .btn:hover {
            transform: translateY(-1px);
        }

        .btn-primary {
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            color: white;
            box-shadow: 0 4px 14px rgba(59, 130, 246, 0.3);
        }

        .btn-primary:hover {
            box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
        }

        /* Main Container */
        #stats-container {
            display: none;
            padding: 24px;
            max-width: 1400px;
            margin: 0 auto;
        }

        .header {
            text-align: center;
            margin-bottom: 32px;
            padding-bottom: 24px;
            border-bottom: 1px solid var(--border);
        }

        .header h1 {
            font-size: 32px;
            margin-bottom: 8px;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .header p {
            color: var(--text-muted);
        }

        .loading {
            text-align: center;
            padding: 48px;
            color: var(--text-muted);
        }

        .loading::after {
            content: '';
            display: inline-block;
            width: 24px;
            height: 24px;
            border: 2px solid var(--border);
            border-top-color: var(--primary);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-left: 12px;
            vertical-align: middle;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .placeholder-message {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 48px;
            text-align: center;
            color: var(--text-muted);
        }

        .placeholder-message h2 {
            color: var(--text);
            margin-bottom: 16px;
        }
    </style>
</head>
<body>
    <!-- Login Overlay -->
    <div id="login-overlay">
        <div class="login-box">
            <h1>Chord-ID Analytics</h1>
            <p>Enter the admin password to view statistics</p>
            <input type="password" id="password-input" placeholder="Password" autofocus>
            <p class="login-error" id="login-error">Incorrect password. Please try again.</p>
            <button class="btn btn-primary" style="width: 100%;" onclick="checkPassword()">Login</button>
        </div>
    </div>

    <!-- Stats Container -->
    <div id="stats-container">
        <div class="header">
            <h1>Chord-ID Analytics</h1>
            <p>Comprehensive usage statistics and insights</p>
        </div>

        <div class="placeholder-message">
            <h2>Backend API Ready</h2>
            <p>The stats.php backend is operational. The frontend dashboard will be implemented by another agent.</p>
            <p style="margin-top: 16px;">
                <strong>Available API Endpoints:</strong><br>
                <code>?action=get_overview&range=7d</code><br>
                <code>?action=get_users&page=1&limit=50</code><br>
                <code>?action=get_sessions&range=30d</code><br>
                <code>?action=get_events&event_type=chord_detected</code><br>
                <code>?action=get_trends&range=30d</code><br>
                <code>?action=get_polls</code><br>
                <code>?action=export_csv&type=users</code>
            </p>
        </div>
    </div>

    <script>
        const ADMIN_PASSWORD = '32156';

        // Check if already authenticated
        function checkSession() {
            if (sessionStorage.getItem('chord-id-admin-auth') === 'true') {
                showStats();
            }
        }

        // Password check
        function checkPassword() {
            const input = document.getElementById('password-input');
            const error = document.getElementById('login-error');

            if (input.value === ADMIN_PASSWORD) {
                sessionStorage.setItem('chord-id-admin-auth', 'true');
                showStats();
            } else {
                error.style.display = 'block';
                input.value = '';
                input.focus();
            }
        }

        // Show stats panel
        function showStats() {
            document.getElementById('login-overlay').style.display = 'none';
            document.getElementById('stats-container').style.display = 'block';
        }

        // Handle Enter key on password input
        document.getElementById('password-input').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                checkPassword();
            }
        });

        // Initialize
        checkSession();
    </script>
</body>
</html>
    <?php
}
