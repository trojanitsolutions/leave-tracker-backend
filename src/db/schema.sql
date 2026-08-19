-- Trojan Technologies Leave Tracker — core schema.
-- Only what the Apply-for-leave flow needs. Extensions and full audit
-- coverage land alongside their own business-logic passes.

CREATE TABLE IF NOT EXISTS employees (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_code VARCHAR(20) NOT NULL UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  department VARCHAR(100) NULL,
  role ENUM('employee', 'manager', 'admin') NOT NULL DEFAULT 'employee',
  manager_id INT UNSIGNED NULL,
  joining_date DATE NOT NULL,
  annual_entitlement_days INT UNSIGNED NOT NULL DEFAULT 30,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_employees_manager FOREIGN KEY (manager_id) REFERENCES employees (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Bumped on logout / password change to invalidate every outstanding refresh
-- token for that employee at once, without storing individual tokens.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS token_version INT UNSIGNED NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS leave_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id INT UNSIGNED NOT NULL,
  manager_id INT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  number_of_days INT UNSIGNED NOT NULL,
  reason TEXT NULL,
  attachment_name VARCHAR(255) NULL,
  status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  expected_back_to_work_date DATE NOT NULL,
  actual_back_to_work_date DATE NULL,
  submitted_at DATETIME NOT NULL,
  decided_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_leave_employee FOREIGN KEY (employee_id) REFERENCES employees (id),
  CONSTRAINT fk_leave_manager FOREIGN KEY (manager_id) REFERENCES employees (id),
  INDEX idx_leave_employee (employee_id),
  INDEX idx_leave_manager (manager_id),
  INDEX idx_leave_dates (start_date, end_date)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leave_extensions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  leave_request_id INT UNSIGNED NOT NULL,
  employee_id INT UNSIGNED NOT NULL,
  manager_id INT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  number_of_days INT UNSIGNED NOT NULL,
  reason TEXT NULL,
  attachment_name VARCHAR(255) NULL,
  status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  submitted_at DATETIME NOT NULL,
  decided_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ext_leave_request FOREIGN KEY (leave_request_id) REFERENCES leave_requests (id),
  CONSTRAINT fk_ext_employee FOREIGN KEY (employee_id) REFERENCES employees (id),
  CONSTRAINT fk_ext_manager FOREIGN KEY (manager_id) REFERENCES employees (id),
  INDEX idx_ext_employee (employee_id),
  INDEX idx_ext_manager (manager_id),
  INDEX idx_ext_leave_request (leave_request_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  default_annual_entitlement_days INT UNSIGNED NOT NULL DEFAULT 30,
  eligibility_months INT UNSIGNED NOT NULL DEFAULT 12,
  cycle_length_months INT UNSIGNED NOT NULL DEFAULT 12,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_settings_single_row CHECK (id = 1)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

INSERT IGNORE INTO company_settings (id) VALUES (1);

-- Admin dashboard alert thresholds — previously hardcoded, now tunable per company.
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS back_to_work_watchlist_days INT UNSIGNED NOT NULL DEFAULT 10;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS approaching_eligibility_days INT UNSIGNED NOT NULL DEFAULT 60;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS pending_approval_alert_days INT UNSIGNED NOT NULL DEFAULT 3;

CREATE TABLE IF NOT EXISTS leave_cycles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id INT UNSIGNED NOT NULL,
  cycle_start DATE NOT NULL,
  cycle_end DATE NOT NULL,
  entitlement_days INT UNSIGNED NOT NULL,
  generated_reason ENUM('initial', 'renewal') NOT NULL,
  source_leave_request_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cycle_employee FOREIGN KEY (employee_id) REFERENCES employees (id),
  CONSTRAINT fk_cycle_leave_request FOREIGN KEY (source_leave_request_id) REFERENCES leave_requests (id),
  UNIQUE KEY uq_cycle_employee_start (employee_id, cycle_start),
  INDEX idx_cycle_employee (employee_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id INT UNSIGNED NOT NULL,
  action VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  leave_request_id INT UNSIGNED NULL,
  extension_id INT UNSIGNED NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_notification_employee FOREIGN KEY (employee_id) REFERENCES employees (id),
  CONSTRAINT fk_notification_leave_request FOREIGN KEY (leave_request_id) REFERENCES leave_requests (id),
  CONSTRAINT fk_notification_extension FOREIGN KEY (extension_id) REFERENCES leave_extensions (id),
  INDEX idx_notification_employee (employee_id, is_read)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_otps (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id INT UNSIGNED NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  consumed TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_password_reset_employee FOREIGN KEY (employee_id) REFERENCES employees (id),
  INDEX idx_password_reset_employee (employee_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_log (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id INT UNSIGNED NOT NULL,
  performed_by_employee_id INT UNSIGNED NOT NULL,
  action VARCHAR(100) NOT NULL,
  leave_request_id INT UNSIGNED NULL,
  extension_id INT UNSIGNED NULL,
  details JSON NULL,
  performed_at DATETIME NOT NULL,
  CONSTRAINT fk_audit_employee FOREIGN KEY (employee_id) REFERENCES employees (id),
  CONSTRAINT fk_audit_performed_by FOREIGN KEY (performed_by_employee_id) REFERENCES employees (id),
  CONSTRAINT fk_audit_leave_request FOREIGN KEY (leave_request_id) REFERENCES leave_requests (id),
  INDEX idx_audit_employee (employee_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
