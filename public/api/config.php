<?php
/**
 * Chord-ID API Configuration
 *
 * IMPORTANT: Update these values with your actual database credentials.
 * For security, consider moving this file outside the web root in production,
 * or use environment variables.
 */

// Database Configuration
define('DB_HOST', 'localhost');           // Usually 'localhost' on Hostinger
define('DB_NAME', 'u883233744_chordid');  // Your database name
define('DB_USER', 'u883233744_chordid');  // Your database username
define('DB_PASS', 'YOUR_PASSWORD_HERE');  // Your database password

// Application Configuration
define('SITE_URL', 'https://chord-id.jaes.online');

// CORS Configuration - allowed origins for API requests
define('ALLOWED_ORIGINS', [
    'https://chord-id.jaes.online',
    'http://localhost:5173',   // Vite dev server
    'http://localhost:3000',
]);

// Security Configuration
define('IP_SALT', 'change-this-to-a-random-string-for-ip-hashing');

// Admin Configuration
define('ADMIN_SESSION_NAME', 'chord_id_admin');
define('ADMIN_SESSION_LIFETIME', 86400); // 24 hours

// Debug Mode (disable in production!)
define('DEBUG_MODE', false);

// Error Reporting
if (DEBUG_MODE) {
    error_reporting(E_ALL);
    ini_set('display_errors', 1);
} else {
    error_reporting(0);
    ini_set('display_errors', 0);
}
