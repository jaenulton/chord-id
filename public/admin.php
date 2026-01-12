<?php
/**
 * Chord-ID Admin Panel
 * Manages news ticker, banner ads, push notifications, and polls
 */

// Set headers for JSON responses when needed
$isAjax = !empty($_SERVER['HTTP_X_REQUESTED_WITH']) &&
          strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest';

// Define file paths
$contentFile = __DIR__ . '/content.json';
$notificationsFile = __DIR__ . '/notifications.json';
$pollsFile = __DIR__ . '/polls.json';
$bannerHistoryFile = __DIR__ . '/banner_history.json';
$uploadsDir = __DIR__ . '/uploads';

// Ensure uploads directory exists
if (!is_dir($uploadsDir)) {
    mkdir($uploadsDir, 0755, true);
}

// Initialize banner history file if it doesn't exist
if (!file_exists($bannerHistoryFile)) {
    file_put_contents($bannerHistoryFile, json_encode([
        'banners' => []
    ], JSON_PRETTY_PRINT));
}

// Helper function to add banner to history
function addBannerToHistory($bannerPath, $bannerUrl, $bannerHistoryFile) {
    if (empty($bannerPath)) return;

    $history = json_decode(file_get_contents($bannerHistoryFile), true);

    // Check if this banner is already in history
    foreach ($history['banners'] as $banner) {
        if ($banner['image'] === $bannerPath) {
            return; // Already exists
        }
    }

    // Add new banner to beginning
    array_unshift($history['banners'], [
        'image' => $bannerPath,
        'url' => $bannerUrl,
        'added_at' => date('Y-m-d H:i:s')
    ]);

    // Keep only last 10 banners in history
    $history['banners'] = array_slice($history['banners'], 0, 10);

    file_put_contents($bannerHistoryFile, json_encode($history, JSON_PRETTY_PRINT));
}

// WebSocket server configuration
define('WS_BROADCAST_URL', 'http://localhost:8086');
define('WS_AUTH_SECRET', 'chord-id-ws-secret-2024');

/**
 * Notify WebSocket server to broadcast updates to all clients
 */
function notifyWebSocket(string $endpoint, array $data): bool {
    $url = WS_BROADCAST_URL . '/broadcast/' . $endpoint;

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($data),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . WS_AUTH_SECRET
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 2, // Don't block admin if WS server is down
        CURLOPT_CONNECTTIMEOUT => 1
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode === 200) {
        $result = json_decode($response, true);
        error_log("[WS] Notified {$result['clientsNotified']} clients via {$endpoint}");
        return true;
    }

    error_log("[WS] Failed to notify: HTTP {$httpCode}");
    return false;
}

// Initialize JSON files if they don't exist
if (!file_exists($contentFile)) {
    file_put_contents($contentFile, json_encode([
        'ticker' => 'Welcome to Chord-ID! Real-time MIDI chord identification.',
        'banner' => [
            'image' => '',
            'url' => ''
        ]
    ], JSON_PRETTY_PRINT));
}

if (!file_exists($notificationsFile)) {
    file_put_contents($notificationsFile, json_encode([
        'notifications' => []
    ], JSON_PRETTY_PRINT));
}

if (!file_exists($pollsFile)) {
    file_put_contents($pollsFile, json_encode([
        'polls' => []
    ], JSON_PRETTY_PRINT));
}

// Handle API requests
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $isAjax) {
    header('Content-Type: application/json');

    $action = $_POST['action'] ?? '';

    switch ($action) {
        case 'update_ticker':
            $content = json_decode(file_get_contents($contentFile), true);
            $content['ticker'] = $_POST['ticker'] ?? '';
            file_put_contents($contentFile, json_encode($content, JSON_PRETTY_PRINT));
            // Notify WebSocket clients
            notifyWebSocket('content', [
                'ticker' => $content['ticker'],
                'banner' => $content['banner']
            ]);
            echo json_encode(['success' => true, 'message' => 'Ticker updated successfully']);
            exit;

        case 'update_banner':
            $content = json_decode(file_get_contents($contentFile), true);
            $content['banner']['url'] = $_POST['banner_url'] ?? '';

            // Handle image upload
            if (!empty($_FILES['banner_image']['name'])) {
                $allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
                $fileType = $_FILES['banner_image']['type'];

                if (in_array($fileType, $allowedTypes)) {
                    $ext = pathinfo($_FILES['banner_image']['name'], PATHINFO_EXTENSION);
                    $filename = 'banner_' . time() . '.' . $ext;
                    $targetPath = $uploadsDir . '/' . $filename;

                    if (move_uploaded_file($_FILES['banner_image']['tmp_name'], $targetPath)) {
                        // Save current banner to history before replacing (don't delete)
                        if (!empty($content['banner']['image'])) {
                            addBannerToHistory($content['banner']['image'], $content['banner']['url'] ?? '', $bannerHistoryFile);
                        }
                        $content['banner']['image'] = 'uploads/' . $filename;
                    } else {
                        echo json_encode(['success' => false, 'message' => 'Failed to upload image']);
                        exit;
                    }
                } else {
                    echo json_encode(['success' => false, 'message' => 'Invalid file type. Only JPG, PNG, and GIF allowed.']);
                    exit;
                }
            }

            file_put_contents($contentFile, json_encode($content, JSON_PRETTY_PRINT));
            // Notify WebSocket clients
            notifyWebSocket('content', [
                'ticker' => $content['ticker'],
                'banner' => $content['banner']
            ]);
            echo json_encode(['success' => true, 'message' => 'Banner updated successfully']);
            exit;

        case 'use_previous_banner':
            $bannerImage = $_POST['banner_image'] ?? '';
            $bannerUrl = $_POST['banner_url'] ?? '';

            if (empty($bannerImage) || !file_exists(__DIR__ . '/' . $bannerImage)) {
                echo json_encode(['success' => false, 'message' => 'Banner image not found']);
                exit;
            }

            $content = json_decode(file_get_contents($contentFile), true);

            // Save current banner to history before replacing
            if (!empty($content['banner']['image']) && $content['banner']['image'] !== $bannerImage) {
                addBannerToHistory($content['banner']['image'], $content['banner']['url'] ?? '', $bannerHistoryFile);
            }

            $content['banner']['image'] = $bannerImage;
            $content['banner']['url'] = $bannerUrl;

            file_put_contents($contentFile, json_encode($content, JSON_PRETTY_PRINT));
            // Notify WebSocket clients
            notifyWebSocket('content', [
                'ticker' => $content['ticker'],
                'banner' => $content['banner']
            ]);
            echo json_encode(['success' => true, 'message' => 'Previous banner applied successfully']);
            exit;

        case 'send_notification':
            $notifications = json_decode(file_get_contents($notificationsFile), true);
            $newNotification = [
                'id' => uniqid('notif_', true),
                'title' => $_POST['notification_title'] ?? '',
                'message' => $_POST['notification_message'] ?? '',
                'type' => $_POST['notification_type'] ?? 'info',
                'createdAt' => date('c'), // ISO 8601 format for frontend compatibility
                'active' => true
            ];
            array_unshift($notifications['notifications'], $newNotification);
            // Keep only last 50 notifications
            $notifications['notifications'] = array_slice($notifications['notifications'], 0, 50);
            file_put_contents($notificationsFile, json_encode($notifications, JSON_PRETTY_PRINT));
            // Notify WebSocket clients immediately
            notifyWebSocket('notification', [
                'notification' => $newNotification
            ]);
            echo json_encode(['success' => true, 'message' => 'Notification sent successfully']);
            exit;

        case 'delete_notification':
            $notifications = json_decode(file_get_contents($notificationsFile), true);
            $idToDelete = $_POST['notification_id'] ?? '';
            $notifications['notifications'] = array_filter($notifications['notifications'], function($n) use ($idToDelete) {
                return $n['id'] !== $idToDelete;
            });
            $notifications['notifications'] = array_values($notifications['notifications']);
            file_put_contents($notificationsFile, json_encode($notifications, JSON_PRETTY_PRINT));
            echo json_encode(['success' => true, 'message' => 'Notification deleted']);
            exit;

        case 'create_poll':
            $polls = json_decode(file_get_contents($pollsFile), true);
            $options = $_POST['poll_options'] ?? [];
            $optionTexts = [];
            foreach ($options as $option) {
                if (trim($option) !== '') {
                    $optionTexts[] = trim($option);
                }
            }

            if (count($optionTexts) < 2) {
                echo json_encode(['success' => false, 'message' => 'Poll needs at least 2 options']);
                exit;
            }

            // Get max ID from existing polls
            $maxId = 0;
            foreach ($polls['polls'] as $p) {
                if (is_numeric($p['id']) && $p['id'] > $maxId) {
                    $maxId = $p['id'];
                }
            }

            $newPoll = [
                'id' => $maxId + 1,
                'question' => $_POST['poll_question'] ?? '',
                'options' => $optionTexts,
                'vote_counts' => array_fill(0, count($optionTexts), 0),
                'total_votes' => 0,
                'user_voted' => false,
                'user_vote_index' => null,
                'expires_at' => date('Y-m-d\TH:i:s\Z', strtotime('+30 days')),
                'is_active' => true
            ];
            array_unshift($polls['polls'], $newPoll);
            file_put_contents($pollsFile, json_encode($polls, JSON_PRETTY_PRINT));
            // Notify WebSocket clients
            notifyWebSocket('poll', ['poll' => $newPoll, 'action' => 'created']);
            echo json_encode(['success' => true, 'message' => 'Poll created successfully']);
            exit;

        case 'delete_poll':
            $polls = json_decode(file_get_contents($pollsFile), true);
            $idToDelete = $_POST['poll_id'] ?? '';
            $polls['polls'] = array_filter($polls['polls'], function($p) use ($idToDelete) {
                return $p['id'] != $idToDelete;
            });
            $polls['polls'] = array_values($polls['polls']);
            file_put_contents($pollsFile, json_encode($polls, JSON_PRETTY_PRINT));
            // Notify WebSocket clients
            notifyWebSocket('poll', ['poll' => ['id' => $idToDelete], 'action' => 'deleted']);
            echo json_encode(['success' => true, 'message' => 'Poll deleted']);
            exit;

        case 'toggle_poll':
            $polls = json_decode(file_get_contents($pollsFile), true);
            $pollId = $_POST['poll_id'] ?? '';
            $updatedPoll = null;
            foreach ($polls['polls'] as &$poll) {
                if ($poll['id'] == $pollId) {
                    $poll['is_active'] = !($poll['is_active'] ?? false);
                    $updatedPoll = $poll;
                    break;
                }
            }
            file_put_contents($pollsFile, json_encode($polls, JSON_PRETTY_PRINT));
            // Notify WebSocket clients
            if ($updatedPoll) {
                notifyWebSocket('poll', ['poll' => $updatedPoll, 'action' => 'updated']);
            }
            echo json_encode(['success' => true, 'message' => 'Poll status updated']);
            exit;
    }

    echo json_encode(['success' => false, 'message' => 'Unknown action']);
    exit;
}

// Handle GET requests for JSON data
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['fetch'])) {
    header('Content-Type: application/json');

    switch ($_GET['fetch']) {
        case 'content':
            echo file_get_contents($contentFile);
            exit;
        case 'notifications':
            echo file_get_contents($notificationsFile);
            exit;
        case 'polls':
            echo file_get_contents($pollsFile);
            exit;
    }
}

// Load current data for display
$content = json_decode(file_get_contents($contentFile), true);
$notifications = json_decode(file_get_contents($notificationsFile), true);
$polls = json_decode(file_get_contents($pollsFile), true);
$bannerHistory = json_decode(file_get_contents($bannerHistoryFile), true);

// Get only past banners (not the current one) for display, limit to 3
$pastBanners = array_filter($bannerHistory['banners'] ?? [], function($banner) use ($content) {
    return $banner['image'] !== ($content['banner']['image'] ?? '');
});
$pastBanners = array_slice(array_values($pastBanners), 0, 3);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chord-ID Admin Panel</title>
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

        /* Main Container */
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 24px;
            display: none;
        }

        /* Header */
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

        /* Grid Layout */
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 24px;
        }

        @media (max-width: 480px) {
            .grid {
                grid-template-columns: 1fr;
            }
        }

        /* Cards */
        .card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 24px;
        }

        .card-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 20px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--border);
        }

        .card-icon {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
        }

        .card-icon.ticker { background: linear-gradient(135deg, var(--primary), var(--accent)); }
        .card-icon.banner { background: linear-gradient(135deg, var(--secondary), var(--primary)); }
        .card-icon.notification { background: linear-gradient(135deg, var(--warning), var(--danger)); }
        .card-icon.poll { background: linear-gradient(135deg, var(--success), var(--accent)); }

        .card-title {
            font-size: 18px;
            font-weight: 600;
        }

        /* Form Elements */
        .form-group {
            margin-bottom: 16px;
        }

        .form-group label {
            display: block;
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 8px;
            color: var(--text-muted);
        }

        input[type="text"],
        input[type="url"],
        textarea {
            width: 100%;
            padding: 12px 14px;
            border: 1px solid var(--border);
            border-radius: 8px;
            background: var(--bg-input);
            color: var(--text);
            font-size: 14px;
            transition: border-color 0.2s, box-shadow 0.2s;
        }

        input:focus,
        textarea:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
        }

        textarea {
            min-height: 100px;
            resize: vertical;
            font-family: inherit;
        }

        input[type="file"] {
            width: 100%;
            padding: 12px;
            border: 2px dashed var(--border);
            border-radius: 8px;
            background: var(--bg-input);
            color: var(--text-muted);
            cursor: pointer;
            transition: border-color 0.2s;
        }

        input[type="file"]:hover {
            border-color: var(--primary);
        }

        /* Buttons */
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

        .btn:active {
            transform: translateY(0);
        }

        .btn-primary {
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            color: white;
            box-shadow: 0 4px 14px rgba(59, 130, 246, 0.3);
        }

        .btn-primary:hover {
            box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
        }

        .btn-success {
            background: linear-gradient(135deg, var(--success), #16a34a);
            color: white;
        }

        .btn-danger {
            background: var(--danger);
            color: white;
            padding: 8px 12px;
            font-size: 12px;
        }

        .btn-secondary {
            background: var(--bg-input);
            color: var(--text);
            border: 1px solid var(--border);
        }

        .btn-sm {
            padding: 6px 12px;
            font-size: 12px;
        }

        .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }

        /* Poll Options */
        .poll-options {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .poll-option-row {
            display: flex;
            gap: 8px;
        }

        .poll-option-row input {
            flex: 1;
        }

        .add-option-btn {
            margin-top: 8px;
        }

        /* Results List */
        .results-list {
            margin-top: 16px;
            max-height: 300px;
            overflow-y: auto;
        }

        .result-item {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            padding: 12px;
            background: var(--bg-input);
            border-radius: 8px;
            margin-bottom: 8px;
        }

        .result-item:last-child {
            margin-bottom: 0;
        }

        .result-content {
            flex: 1;
            min-width: 0;
        }

        .result-title {
            font-weight: 500;
            margin-bottom: 4px;
        }

        .result-meta {
            font-size: 12px;
            color: var(--text-muted);
        }

        .result-message {
            font-size: 13px;
            color: var(--text-muted);
            margin-top: 4px;
        }

        /* Poll Results */
        .poll-item {
            margin-bottom: 16px;
            padding: 16px;
            background: var(--bg-input);
            border-radius: 8px;
        }

        .poll-question {
            font-weight: 500;
            margin-bottom: 12px;
        }

        .poll-option {
            margin-bottom: 8px;
        }

        .poll-option-bar {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .poll-option-text {
            flex: 1;
            font-size: 13px;
        }

        .poll-option-progress {
            flex: 2;
            height: 8px;
            background: var(--border);
            border-radius: 4px;
            overflow: hidden;
        }

        .poll-option-fill {
            height: 100%;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            border-radius: 4px;
            transition: width 0.3s;
        }

        .poll-option-votes {
            font-size: 12px;
            color: var(--text-muted);
            min-width: 50px;
            text-align: right;
        }

        .poll-actions {
            display: flex;
            gap: 8px;
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid var(--border);
        }

        .poll-status {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 11px;
            padding: 4px 8px;
            border-radius: 4px;
            margin-left: auto;
        }

        .poll-status.active {
            background: rgba(34, 197, 94, 0.2);
            color: var(--success);
        }

        .poll-status.inactive {
            background: rgba(239, 68, 68, 0.2);
            color: var(--danger);
        }

        /* Banner Preview */
        .banner-preview {
            margin-top: 12px;
            padding: 12px;
            background: var(--bg-input);
            border-radius: 8px;
        }

        .banner-preview img {
            max-width: 100%;
            max-height: 150px;
            border-radius: 8px;
        }

        .banner-preview-label {
            font-size: 12px;
            color: var(--text-muted);
            margin-bottom: 8px;
        }

        /* Toast Notifications */
        .toast-container {
            position: fixed;
            top: 24px;
            right: 24px;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .toast {
            padding: 14px 20px;
            border-radius: 8px;
            color: white;
            font-size: 14px;
            animation: slideIn 0.3s ease;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .toast.success {
            background: var(--success);
        }

        .toast.error {
            background: var(--danger);
        }

        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        /* Empty State */
        .empty-state {
            text-align: center;
            padding: 24px;
            color: var(--text-muted);
        }

        /* Full Width Card */
        .card-full {
            grid-column: 1 / -1;
        }

        /* Scrollbar */
        ::-webkit-scrollbar {
            width: 8px;
        }

        ::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.05);
        }

        ::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.2);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.3);
        }
    </style>
</head>
<body>
    <!-- Login Overlay -->
    <div id="login-overlay">
        <div class="login-box">
            <h1>Chord-ID Admin</h1>
            <p>Enter the admin password to continue</p>
            <input type="password" id="password-input" placeholder="Password" autofocus>
            <p class="login-error" id="login-error">Incorrect password. Please try again.</p>
            <button class="btn btn-primary" style="width: 100%;" onclick="checkPassword()">Login</button>
        </div>
    </div>

    <!-- Main Admin Container -->
    <div class="container" id="admin-container">
        <div class="header">
            <h1>Chord-ID Admin Panel</h1>
            <p>Manage content, notifications, and polls</p>
            <a href="stats.php" class="btn btn-secondary" style="margin-top: 16px; display: inline-flex; gap: 8px; text-decoration: none;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 20V10"></path>
                    <path d="M12 20V4"></path>
                    <path d="M6 20v-6"></path>
                </svg>
                View Stats
            </a>
        </div>

        <div class="grid">
            <!-- News Ticker Card -->
            <div class="card">
                <div class="card-header">
                    <div class="card-icon ticker">&#128240;</div>
                    <h2 class="card-title">News Ticker</h2>
                </div>
                <form id="ticker-form">
                    <div class="form-group">
                        <label for="ticker-text">Ticker Text</label>
                        <input type="text" id="ticker-text" name="ticker"
                               value="<?php echo htmlspecialchars($content['ticker'] ?? ''); ?>"
                               placeholder="Enter scrolling ticker text...">
                    </div>
                    <button type="submit" class="btn btn-primary">Update Ticker</button>
                </form>
            </div>

            <!-- Banner Ad Card -->
            <div class="card">
                <div class="card-header">
                    <div class="card-icon banner">&#128444;</div>
                    <h2 class="card-title">Banner Ad</h2>
                </div>

                <?php if (!empty($content['banner']['image'])): ?>
                <div class="banner-preview" style="margin-bottom: 20px;">
                    <div class="banner-preview-label">Current Banner:</div>
                    <img src="<?php echo htmlspecialchars($content['banner']['image']); ?>" alt="Current banner" style="max-height: 100px;">
                    <?php if (!empty($content['banner']['url'])): ?>
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px; word-break: break-all;">
                        Links to: <?php echo htmlspecialchars($content['banner']['url']); ?>
                    </div>
                    <?php endif; ?>
                </div>
                <?php endif; ?>

                <form id="banner-form" enctype="multipart/form-data">
                    <div class="form-group">
                        <label for="banner-image">Upload New Banner (JPG, PNG, GIF)</label>
                        <input type="file" id="banner-image" name="banner_image" accept="image/jpeg,image/png,image/gif">
                    </div>
                    <div class="form-group">
                        <label for="banner-url">Link URL</label>
                        <input type="url" id="banner-url" name="banner_url"
                               value="<?php echo htmlspecialchars($content['banner']['url'] ?? ''); ?>"
                               placeholder="https://example.com">
                    </div>
                    <button type="submit" class="btn btn-primary">Update Banner</button>
                </form>

                <?php if (!empty($pastBanners)): ?>
                <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border);">
                    <div style="font-size: 14px; font-weight: 500; margin-bottom: 12px; color: var(--text-muted);">Previous Banners</div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
                        <?php foreach ($pastBanners as $banner): ?>
                        <div class="banner-history-item" style="background: var(--bg-input); border-radius: 8px; padding: 8px; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s;"
                             onclick="usePreviousBanner('<?php echo htmlspecialchars($banner['image']); ?>', '<?php echo htmlspecialchars($banner['url'] ?? ''); ?>')"
                             onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(59,130,246,0.3)';"
                             onmouseout="this.style.transform=''; this.style.boxShadow='';">
                            <img src="<?php echo htmlspecialchars($banner['image']); ?>" alt="Previous banner"
                                 style="width: 100%; height: 50px; object-fit: cover; border-radius: 4px;">
                            <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px; text-align: center;">
                                Click to use
                            </div>
                        </div>
                        <?php endforeach; ?>
                    </div>
                </div>
                <?php endif; ?>
            </div>

            <!-- Push Notification Card -->
            <div class="card">
                <div class="card-header">
                    <div class="card-icon notification">&#128276;</div>
                    <h2 class="card-title">Push Notifications</h2>
                </div>
                <form id="notification-form">
                    <div class="form-group">
                        <label for="notification-title">Title</label>
                        <input type="text" id="notification-title" name="notification_title"
                               placeholder="Notification title...">
                    </div>
                    <div class="form-group">
                        <label for="notification-message">Message</label>
                        <textarea id="notification-message" name="notification_message"
                                  placeholder="Enter notification message..."></textarea>
                    </div>
                    <div class="form-group">
                        <label for="notification-type">Type</label>
                        <select id="notification-type" name="notification_type" style="width: 100%; padding: 12px 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-input); color: var(--text); font-size: 14px;">
                            <option value="info">Info (Blue)</option>
                            <option value="success">Success (Green)</option>
                            <option value="warning">Warning (Yellow)</option>
                            <option value="error">Error (Red)</option>
                        </select>
                    </div>
                    <button type="submit" class="btn btn-success">Send Now</button>
                </form>

                <div class="results-list" id="notifications-list">
                    <?php if (empty($notifications['notifications'])): ?>
                        <div class="empty-state">No notifications sent yet</div>
                    <?php else: ?>
                        <?php foreach ($notifications['notifications'] as $notification): ?>
                        <div class="result-item" data-id="<?php echo $notification['id']; ?>">
                            <div class="result-content">
                                <div class="result-title"><?php echo htmlspecialchars($notification['title']); ?></div>
                                <div class="result-message"><?php echo htmlspecialchars($notification['message']); ?></div>
                                <div class="result-meta"><?php echo $notification['timestamp']; ?></div>
                            </div>
                            <button class="btn btn-danger btn-sm" onclick="deleteNotification('<?php echo $notification['id']; ?>')">Delete</button>
                        </div>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </div>
            </div>

            <!-- Polls Card -->
            <div class="card">
                <div class="card-header">
                    <div class="card-icon poll">&#128202;</div>
                    <h2 class="card-title">Polls</h2>
                </div>
                <form id="poll-form">
                    <div class="form-group">
                        <label for="poll-question">Question</label>
                        <input type="text" id="poll-question" name="poll_question"
                               placeholder="Enter your poll question...">
                    </div>
                    <div class="form-group">
                        <label>Options</label>
                        <div class="poll-options" id="poll-options">
                            <div class="poll-option-row">
                                <input type="text" name="poll_options[]" placeholder="Option 1">
                                <button type="button" class="btn btn-danger btn-sm" onclick="removeOption(this)">X</button>
                            </div>
                            <div class="poll-option-row">
                                <input type="text" name="poll_options[]" placeholder="Option 2">
                                <button type="button" class="btn btn-danger btn-sm" onclick="removeOption(this)">X</button>
                            </div>
                        </div>
                        <button type="button" class="btn btn-secondary add-option-btn" onclick="addOption()">+ Add Option</button>
                    </div>
                    <button type="submit" class="btn btn-primary">Create Poll</button>
                </form>
            </div>

            <!-- Poll Results Card -->
            <div class="card card-full">
                <div class="card-header">
                    <div class="card-icon poll">&#128200;</div>
                    <h2 class="card-title">Poll Results</h2>
                </div>
                <div id="polls-list">
                    <?php if (empty($polls['polls'])): ?>
                        <div class="empty-state">No polls created yet</div>
                    <?php else: ?>
                        <?php foreach ($polls['polls'] as $poll): ?>
                        <div class="poll-item" data-id="<?php echo $poll['id']; ?>">
                            <div class="poll-question"><?php echo htmlspecialchars($poll['question']); ?></div>
                            <?php
                            $voteCounts = $poll['vote_counts'] ?? [];
                            $totalVotes = array_sum($voteCounts);
                            foreach ($poll['options'] as $idx => $optionText):
                                $votes = $voteCounts[$idx] ?? 0;
                                $percentage = $totalVotes > 0 ? round(($votes / $totalVotes) * 100) : 0;
                            ?>
                            <div class="poll-option">
                                <div class="poll-option-bar">
                                    <span class="poll-option-text"><?php echo htmlspecialchars($optionText); ?></span>
                                    <div class="poll-option-progress">
                                        <div class="poll-option-fill" style="width: <?php echo $percentage; ?>%"></div>
                                    </div>
                                    <span class="poll-option-votes"><?php echo $votes; ?> votes</span>
                                </div>
                            </div>
                            <?php endforeach; ?>
                            <div class="poll-actions">
                                <button class="btn btn-secondary btn-sm" onclick="togglePoll('<?php echo $poll['id']; ?>')">
                                    <?php echo ($poll['is_active'] ?? false) ? 'Deactivate' : 'Activate'; ?>
                                </button>
                                <button class="btn btn-danger btn-sm" onclick="deletePoll('<?php echo $poll['id']; ?>')">Delete</button>
                                <span class="poll-status <?php echo ($poll['is_active'] ?? false) ? 'active' : 'inactive'; ?>">
                                    <?php echo ($poll['is_active'] ?? false) ? 'Active' : 'Inactive'; ?>
                                </span>
                            </div>
                        </div>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </div>

    <!-- Toast Container -->
    <div class="toast-container" id="toast-container"></div>

    <script>
        const ADMIN_PASSWORD = '32156';

        // Check if already authenticated
        function checkSession() {
            if (sessionStorage.getItem('chord-id-admin-auth') === 'true') {
                showAdmin();
            }
        }

        // Password check
        function checkPassword() {
            const input = document.getElementById('password-input');
            const error = document.getElementById('login-error');

            if (input.value === ADMIN_PASSWORD) {
                sessionStorage.setItem('chord-id-admin-auth', 'true');
                showAdmin();
            } else {
                error.style.display = 'block';
                input.value = '';
                input.focus();
            }
        }

        // Show admin panel
        function showAdmin() {
            document.getElementById('login-overlay').style.display = 'none';
            document.getElementById('admin-container').style.display = 'block';
        }

        // Handle Enter key on password input
        document.getElementById('password-input').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                checkPassword();
            }
        });

        // Toast notification
        function showToast(message, type = 'success') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.textContent = message;
            container.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        // AJAX helper
        async function sendRequest(formData) {
            try {
                const response = await fetch('admin.php', {
                    method: 'POST',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: formData
                });
                return await response.json();
            } catch (error) {
                return { success: false, message: 'Request failed: ' + error.message };
            }
        }

        // Ticker form
        document.getElementById('ticker-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData();
            formData.append('action', 'update_ticker');
            formData.append('ticker', document.getElementById('ticker-text').value);

            const result = await sendRequest(formData);
            showToast(result.message, result.success ? 'success' : 'error');
        });

        // Banner form
        document.getElementById('banner-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            formData.append('action', 'update_banner');

            const result = await sendRequest(formData);
            showToast(result.message, result.success ? 'success' : 'error');

            if (result.success) {
                setTimeout(() => location.reload(), 1000);
            }
        });

        // Notification form
        document.getElementById('notification-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData();
            formData.append('action', 'send_notification');
            formData.append('notification_title', document.getElementById('notification-title').value);
            formData.append('notification_message', document.getElementById('notification-message').value);
            formData.append('notification_type', document.getElementById('notification-type').value);

            const result = await sendRequest(formData);
            showToast(result.message, result.success ? 'success' : 'error');

            if (result.success) {
                document.getElementById('notification-title').value = '';
                document.getElementById('notification-message').value = '';
                document.getElementById('notification-type').value = 'info';
                setTimeout(() => location.reload(), 1000);
            }
        });

        // Delete notification
        async function deleteNotification(id) {
            if (!confirm('Are you sure you want to delete this notification?')) return;

            const formData = new FormData();
            formData.append('action', 'delete_notification');
            formData.append('notification_id', id);

            const result = await sendRequest(formData);
            showToast(result.message, result.success ? 'success' : 'error');

            if (result.success) {
                document.querySelector(`.result-item[data-id="${id}"]`).remove();
            }
        }

        // Poll options management
        let optionCount = 2;

        function addOption() {
            optionCount++;
            const container = document.getElementById('poll-options');
            const row = document.createElement('div');
            row.className = 'poll-option-row';
            row.innerHTML = `
                <input type="text" name="poll_options[]" placeholder="Option ${optionCount}">
                <button type="button" class="btn btn-danger btn-sm" onclick="removeOption(this)">X</button>
            `;
            container.appendChild(row);
        }

        function removeOption(btn) {
            const container = document.getElementById('poll-options');
            if (container.children.length > 2) {
                btn.parentElement.remove();
            } else {
                showToast('Poll needs at least 2 options', 'error');
            }
        }

        // Poll form
        document.getElementById('poll-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            formData.append('action', 'create_poll');

            const result = await sendRequest(formData);
            showToast(result.message, result.success ? 'success' : 'error');

            if (result.success) {
                document.getElementById('poll-question').value = '';
                const options = document.querySelectorAll('#poll-options input');
                options.forEach(input => input.value = '');
                setTimeout(() => location.reload(), 1000);
            }
        });

        // Toggle poll
        async function togglePoll(id) {
            const formData = new FormData();
            formData.append('action', 'toggle_poll');
            formData.append('poll_id', id);

            const result = await sendRequest(formData);
            showToast(result.message, result.success ? 'success' : 'error');

            if (result.success) {
                setTimeout(() => location.reload(), 500);
            }
        }

        // Use previous banner
        async function usePreviousBanner(imagePath, linkUrl) {
            if (!confirm('Use this banner as the current banner?')) return;

            const formData = new FormData();
            formData.append('action', 'use_previous_banner');
            formData.append('banner_image', imagePath);
            formData.append('banner_url', linkUrl);

            const result = await sendRequest(formData);
            showToast(result.message, result.success ? 'success' : 'error');

            if (result.success) {
                setTimeout(() => location.reload(), 500);
            }
        }

        // Delete poll
        async function deletePoll(id) {
            if (!confirm('Are you sure you want to delete this poll?')) return;

            const formData = new FormData();
            formData.append('action', 'delete_poll');
            formData.append('poll_id', id);

            const result = await sendRequest(formData);
            showToast(result.message, result.success ? 'success' : 'error');

            if (result.success) {
                document.querySelector(`.poll-item[data-id="${id}"]`).remove();
            }
        }

        // Initialize
        checkSession();
    </script>
</body>
</html>
