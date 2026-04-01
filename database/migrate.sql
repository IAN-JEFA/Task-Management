-- Task Manager Database Migration

CREATE DATABASE IF NOT EXISTS taskmanager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE taskmanager;

CREATE TABLE IF NOT EXISTS tasks (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    due_date DATE NOT NULL,
    priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
    status ENUM('pending', 'in_progress', 'done') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_title_due_date (title, due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional: seed some sample tasks
INSERT INTO tasks (title, due_date, priority, status) VALUES
    ('Design homepage mockup', CURDATE(), 'high', 'pending'),
    ('Set up CI/CD pipeline', DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'high', 'in_progress'),
    ('Write unit tests', DATE_ADD(CURDATE(), INTERVAL 2 DAY), 'medium', 'pending'),
    ('Update documentation', DATE_ADD(CURDATE(), INTERVAL 3 DAY), 'low', 'pending'),
    ('Code review session', DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'medium', 'done');
