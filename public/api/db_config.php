<?php
/**
 * Database Configuration for Chord-ID Tracking System
 *
 * This file provides a simple database connection function.
 * For production, update DB_PASS with your actual password.
 */

define('DB_HOST', 'localhost');
define('DB_NAME', 'chord_id');
define('DB_USER', 'root');
define('DB_PASS', '');  // Update with your database password

/**
 * Get PDO database connection (singleton pattern)
 *
 * @return PDO Database connection instance
 * @throws PDOException If connection fails
 */
function getDB(): PDO
{
    static $pdo = null;

    if ($pdo === null) {
        $dsn = sprintf(
            'mysql:host=%s;dbname=%s;charset=utf8mb4',
            DB_HOST,
            DB_NAME
        );

        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];

        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    }

    return $pdo;
}
