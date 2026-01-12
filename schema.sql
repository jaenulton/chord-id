-- Chord-ID Analytics Database Schema
-- Created: 2026-01-11

-- Create database
CREATE DATABASE IF NOT EXISTS chord_id CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE chord_id;

-- =====================================================
-- Table: users
-- Track unique visitors with fingerprint/cookie hash
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    visitor_id VARCHAR(64) NOT NULL UNIQUE COMMENT 'Hash from fingerprint/cookie',
    first_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    total_visits INT UNSIGNED NOT NULL DEFAULT 1,
    total_time_seconds INT UNSIGNED NOT NULL DEFAULT 0,
    user_agent TEXT,
    screen_resolution VARCHAR(20),
    timezone VARCHAR(50),
    language VARCHAR(10),
    platform VARCHAR(50),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_visitor_id (visitor_id),
    INDEX idx_last_seen (last_seen),
    INDEX idx_first_seen (first_seen)
) ENGINE=InnoDB;

-- =====================================================
-- Table: sessions
-- Track individual user sessions
-- =====================================================
CREATE TABLE IF NOT EXISTS sessions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    session_id VARCHAR(64) NOT NULL UNIQUE,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME NULL,
    duration_seconds INT UNSIGNED DEFAULT 0,
    entry_page VARCHAR(255),
    exit_page VARCHAR(255),
    page_views INT UNSIGNED NOT NULL DEFAULT 0,
    referrer TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session_id (session_id),
    INDEX idx_user_id (user_id),
    INDEX idx_started_at (started_at),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================
-- Table: page_views
-- Individual page/feature interactions
-- =====================================================
CREATE TABLE IF NOT EXISTS page_views (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    page_name VARCHAR(100) NOT NULL COMMENT 'e.g., main, settings, admin',
    feature_used VARCHAR(100) COMMENT 'e.g., instrument_change, theme_change, midi_connect',
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    time_on_page_seconds INT UNSIGNED DEFAULT 0,
    INDEX idx_session_id (session_id),
    INDEX idx_user_id (user_id),
    INDEX idx_page_name (page_name),
    INDEX idx_feature_used (feature_used),
    INDEX idx_timestamp (timestamp),
    CONSTRAINT fk_page_views_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_page_views_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================
-- Table: events
-- Track specific user interactions
-- =====================================================
CREATE TABLE IF NOT EXISTS events (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    session_id INT UNSIGNED NOT NULL,
    event_type VARCHAR(50) NOT NULL COMMENT 'chord_detected, instrument_switch, theme_change, poll_vote, etc.',
    event_data JSON COMMENT 'Additional event-specific data',
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_session_id (session_id),
    INDEX idx_event_type (event_type),
    INDEX idx_timestamp (timestamp),
    CONSTRAINT fk_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_events_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================
-- Table: polls
-- Polls stored in database
-- =====================================================
CREATE TABLE IF NOT EXISTS polls (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    question TEXT NOT NULL,
    options JSON NOT NULL COMMENT 'Array of option strings',
    vote_counts JSON NOT NULL DEFAULT ('[]') COMMENT 'Array of vote counts per option',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_is_active (is_active),
    INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB;

-- =====================================================
-- Table: poll_votes
-- Track who voted or dismissed polls
-- =====================================================
CREATE TABLE IF NOT EXISTS poll_votes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    poll_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    option_index INT NULL COMMENT 'Null if dismissed',
    action ENUM('voted', 'dismissed') NOT NULL,
    voted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_poll_user (poll_id, user_id),
    INDEX idx_poll_id (poll_id),
    INDEX idx_user_id (user_id),
    CONSTRAINT fk_poll_votes_poll FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_poll_votes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================
-- Table: notifications
-- Admin-created notifications
-- =====================================================
CREATE TABLE IF NOT EXISTS notifications (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('info', 'warning', 'success') NOT NULL DEFAULT 'info',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    priority INT NOT NULL DEFAULT 0 COMMENT 'Higher priority shown first',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_is_active (is_active),
    INDEX idx_priority (priority),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- =====================================================
-- Table: notification_reads
-- Track which users have read notifications
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_reads (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    notification_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_notification_user (notification_id, user_id),
    INDEX idx_notification_id (notification_id),
    INDEX idx_user_id (user_id),
    CONSTRAINT fk_notification_reads_notification FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_notification_reads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================
-- Initial sample data for testing (optional)
-- =====================================================

-- Sample notification
INSERT INTO notifications (title, message, type, is_active, priority) VALUES
('Welcome to Chord-ID', 'Thank you for using Chord-ID! We are continuously improving the app.', 'info', TRUE, 10);

-- Sample poll
INSERT INTO polls (question, options, vote_counts, is_active) VALUES
('What instrument do you play most?', '["Guitar", "Piano", "Ukulele", "Bass", "Other"]', '[0, 0, 0, 0, 0]', TRUE);
