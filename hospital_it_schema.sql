-- ============================================================
-- Hospital IT Management System - MySQL Database Schema
-- Run this script in MySQL Workbench to create the database
-- ============================================================

-- Create the database
CREATE DATABASE IF NOT EXISTS hospital_it_management
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE hospital_it_management;

-- ============================================================
-- Table: departments
-- (Created first since users references departments)
-- ============================================================
CREATE TABLE IF NOT EXISTS departments (
  id                        VARCHAR(36)   NOT NULL,
  name                      VARCHAR(255)  NOT NULL,
  description               TEXT,
  assigned_it_sub_boss_id   VARCHAR(36)   DEFAULT NULL,
  assigned_it_sub_boss_name VARCHAR(255)  DEFAULT NULL,
  created_at                DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                VARCHAR(36)   NOT NULL,
  full_name         VARCHAR(255)  NOT NULL,
  email             VARCHAR(255)  NOT NULL,
  password          VARCHAR(255)  NOT NULL,
  role              ENUM('IT_HEAD','IT_SUB_BOSS','NSS_IT','INDUSTRIAL_ATTACHMENT','MEDICAL_STAFF') NOT NULL,
  status            ENUM('pending','active','frozen','rejected') NOT NULL DEFAULT 'pending',
  department_id     VARCHAR(36)   DEFAULT NULL,
  department_name   VARCHAR(255)  DEFAULT NULL,
  `rank`            VARCHAR(100)  DEFAULT NULL,
  staff_type        ENUM('Doctor','Nurse','Pharmacist','Lab Technician','Radiologist','Administrative Staff','Other') DEFAULT NULL,
  supervisor_id     VARCHAR(36)   DEFAULT NULL,
  supervisor_name   VARCHAR(255)  DEFAULT NULL,
  login_attempts    INT           NOT NULL DEFAULT 0,
  profile_picture   TEXT          DEFAULT NULL,
  phone             VARCHAR(20)   DEFAULT NULL,
  employee_id       VARCHAR(50)   DEFAULT NULL,
  security_question VARCHAR(255)  DEFAULT NULL,
  security_answer   VARCHAR(255)  DEFAULT NULL,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_users_email (email),
  KEY idx_users_role (role),
  KEY idx_users_status (status),
  KEY idx_users_department (department_id),
  KEY idx_users_supervisor (supervisor_id),

  CONSTRAINT fk_users_department
    FOREIGN KEY (department_id) REFERENCES departments(id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT fk_users_supervisor
    FOREIGN KEY (supervisor_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add foreign key from departments back to users (for assigned IT sub-boss)
ALTER TABLE departments
  ADD CONSTRAINT fk_departments_it_sub_boss
    FOREIGN KEY (assigned_it_sub_boss_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- Table: notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id                          VARCHAR(36)   NOT NULL,
  type                        ENUM('distress','system','approval','rating') NOT NULL,
  title                       VARCHAR(255)  NOT NULL,
  message                     TEXT          NOT NULL,
  from_user_id                VARCHAR(36)   DEFAULT NULL,
  from_user_name              VARCHAR(255)  DEFAULT NULL,
  from_department_id          VARCHAR(36)   DEFAULT NULL,
  from_department_name        VARCHAR(255)  DEFAULT NULL,
  to_user_id                  VARCHAR(36)   DEFAULT NULL,
  assigned_it_sub_boss_id     VARCHAR(36)   DEFAULT NULL,
  assigned_it_personnel_id    VARCHAR(36)   DEFAULT NULL,
  assigned_it_personnel_name  VARCHAR(255)  DEFAULT NULL,
  status                      ENUM('pending','in_progress','resolved','rated') NOT NULL DEFAULT 'pending',
  rating                      INT           DEFAULT NULL,
  rating_comment              TEXT          DEFAULT NULL,
  created_at                  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_notifications_type (type),
  KEY idx_notifications_status (status),
  KEY idx_notifications_from_user (from_user_id),
  KEY idx_notifications_to_user (to_user_id),

  CONSTRAINT fk_notifications_from_user
    FOREIGN KEY (from_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT fk_notifications_to_user
    FOREIGN KEY (to_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT chk_rating_range CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- Seed Data: Default IT Head User
-- ============================================================
INSERT INTO users (id, full_name, email, password, role, status, login_attempts, `rank`, phone, employee_id, created_at, updated_at)
VALUES (
  'it-head-default',
  'Main IT Head',
  'ithead@hospital.com',
  'Admin@1234',
  'IT_HEAD',
  'active',
  0,
  'Chief IT Officer',
  '+233000000000',
  'EMP-IT-HEAD-001',
  NOW(),
  NOW()
);

-- ============================================================
-- Seed Data: Default Departments
-- ============================================================
INSERT INTO departments (id, name, description, created_at) VALUES
  (UUID(), 'Emergency',   'Emergency & Trauma unit',        NOW()),
  (UUID(), 'Cardiology',  'Heart & Cardiovascular unit',    NOW()),
  (UUID(), 'Pediatrics',  'Children\'s health unit',        NOW()),
  (UUID(), 'Radiology',   'Imaging & Diagnostics unit',     NOW()),
  (UUID(), 'Pharmacy',    'Medication & Dispensary unit',    NOW()),
  (UUID(), 'ICU',         'Intensive Care Unit',            NOW()),
  (UUID(), 'Maternity',   'Maternity & Obstetrics unit',    NOW()),
  (UUID(), 'Surgery',     'Surgical operations unit',       NOW());

-- ============================================================
-- Done! You should now see 3 tables in the hospital_it_management database:
--   1. users         (1 default IT Head)
--   2. departments   (8 default departments)
--   3. notifications (empty)
-- ============================================================
