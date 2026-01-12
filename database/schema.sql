-- =========================================================
-- Chord-ID Polls Database Schema
-- Database: u883233744_chordid
-- =========================================================
--
-- Setup Instructions:
-- 1. Log into Hostinger MySQL (hPanel -> Databases -> MySQL Databases)
-- 2. Create a new database named: u883233744_chordid
-- 3. Create a database user with full privileges
-- 4. Import this schema using phpMyAdmin or MySQL CLI
--
-- =========================================================

-- Polls table: stores poll questions and options
CREATE TABLE IF NOT EXISTS polls (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question VARCHAR(500) NOT NULL,
    options JSON NOT NULL COMMENT 'Array of option strings, e.g., ["Option A", "Option B", "Option C"]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL COMMENT 'NULL means no expiration',
    is_active BOOLEAN DEFAULT TRUE,

    INDEX idx_active_expires (is_active, expires_at),
    INDEX idx_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Poll responses table: stores individual votes
CREATE TABLE IF NOT EXISTS poll_responses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    poll_id INT NOT NULL,
    option_index INT NOT NULL COMMENT 'Zero-based index into the options array',
    ip_hash VARCHAR(64) NOT NULL COMMENT 'SHA-256 hash of IP for privacy-preserving duplicate prevention',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
    UNIQUE KEY unique_vote (poll_id, ip_hash) COMMENT 'One vote per IP per poll',
    INDEX idx_poll_option (poll_id, option_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Admin users table (optional - for securing admin panel)
CREATE TABLE IF NOT EXISTS admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL COMMENT 'bcrypt hashed password',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================
-- Sample Data (optional - remove before production)
-- =========================================================

-- Insert a sample poll
-- INSERT INTO polls (question, options, expires_at) VALUES (
--     'What key signature do you play in most often?',
--     '["C Major", "G Major", "D Major", "A Minor", "Other"]',
--     DATE_ADD(NOW(), INTERVAL 7 DAY)
-- );

-- Insert a default admin user (password: admin123 - CHANGE THIS!)
-- INSERT INTO admin_users (username, password_hash) VALUES (
--     'admin',
--     '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'
-- );
