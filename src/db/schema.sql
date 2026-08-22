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
  -- Bumped on logout / password change to invalidate every outstanding refresh
  -- token for that employee at once, without storing individual tokens.
  token_version INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_employees_manager FOREIGN KEY (manager_id) REFERENCES employees (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leave_types (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL UNIQUE,
  is_paid TINYINT(1) NOT NULL DEFAULT 1,
  requires_eligibility TINYINT(1) NOT NULL DEFAULT 1,
  -- True only for the built-in Unpaid Extension type: must be requested as an
  -- extension of an existing approved leave, never a standalone application.
  is_child_type TINYINT(1) NOT NULL DEFAULT 0,
  default_entitlement_days INT UNSIGNED NULL,
  -- True only for the two built-in types (annual, unpaid_extension) — admin UI
  -- locks every config field except name/sort_order on these rows.
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_leave_type_entitlement CHECK (is_paid = 1 OR default_entitlement_days IS NULL),
  CONSTRAINT chk_leave_type_child_unpaid CHECK (is_child_type = 0 OR is_paid = 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

INSERT IGNORE INTO leave_types
  (id, code, name, is_paid, requires_eligibility, is_child_type, default_entitlement_days, is_system, is_active, sort_order)
VALUES
  (1, 'annual', 'Annual Leave', 1, 1, 0, NULL, 1, 1, 1),
  (2, 'unpaid_extension', 'Unpaid Extension', 0, 0, 1, NULL, 1, 1, 2);

-- Per-employee entitlement override for any paid leave type EXCEPT 'annual', which
-- keeps using employees.annual_entitlement_days — an intentional, permanent asymmetry.
CREATE TABLE IF NOT EXISTS employee_leave_entitlements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id INT UNSIGNED NOT NULL,
  leave_type_id INT UNSIGNED NOT NULL,
  entitlement_days INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ele_employee FOREIGN KEY (employee_id) REFERENCES employees (id),
  CONSTRAINT fk_ele_leave_type FOREIGN KEY (leave_type_id) REFERENCES leave_types (id),
  UNIQUE KEY uq_ele_employee_type (employee_id, leave_type_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leave_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id INT UNSIGNED NOT NULL,
  manager_id INT UNSIGNED NOT NULL,
  leave_type_id INT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  number_of_days INT UNSIGNED NOT NULL,
  reason TEXT NULL,
  attachment_name VARCHAR(255) NULL,
  attachment_url VARCHAR(500) NULL,
  status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  expected_back_to_work_date DATE NOT NULL,
  actual_back_to_work_date DATE NULL,
  submitted_at DATETIME NOT NULL,
  decided_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_leave_employee FOREIGN KEY (employee_id) REFERENCES employees (id),
  CONSTRAINT fk_leave_manager FOREIGN KEY (manager_id) REFERENCES employees (id),
  CONSTRAINT fk_leave_type FOREIGN KEY (leave_type_id) REFERENCES leave_types (id),
  INDEX idx_leave_employee (employee_id),
  INDEX idx_leave_manager (manager_id),
  INDEX idx_leave_dates (start_date, end_date),
  INDEX idx_leave_type (leave_type_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leave_extensions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  leave_request_id INT UNSIGNED NOT NULL,
  employee_id INT UNSIGNED NOT NULL,
  manager_id INT UNSIGNED NOT NULL,
  leave_type_id INT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  number_of_days INT UNSIGNED NOT NULL,
  reason TEXT NULL,
  attachment_name VARCHAR(255) NULL,
  attachment_url VARCHAR(500) NULL,
  status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  submitted_at DATETIME NOT NULL,
  decided_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ext_leave_request FOREIGN KEY (leave_request_id) REFERENCES leave_requests (id),
  CONSTRAINT fk_ext_employee FOREIGN KEY (employee_id) REFERENCES employees (id),
  CONSTRAINT fk_ext_manager FOREIGN KEY (manager_id) REFERENCES employees (id),
  CONSTRAINT fk_ext_leave_type FOREIGN KEY (leave_type_id) REFERENCES leave_types (id),
  INDEX idx_ext_employee (employee_id),
  INDEX idx_ext_manager (manager_id),
  INDEX idx_ext_leave_request (leave_request_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  default_annual_entitlement_days INT UNSIGNED NOT NULL DEFAULT 30,
  eligibility_months INT UNSIGNED NOT NULL DEFAULT 12,
  cycle_length_months INT UNSIGNED NOT NULL DEFAULT 12,
  -- Admin dashboard alert thresholds — previously hardcoded, now tunable per company.
  back_to_work_watchlist_days INT UNSIGNED NOT NULL DEFAULT 10,
  approaching_eligibility_days INT UNSIGNED NOT NULL DEFAULT 60,
  pending_approval_alert_days INT UNSIGNED NOT NULL DEFAULT 3,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_settings_single_row CHECK (id = 1)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

INSERT IGNORE INTO company_settings (id) VALUES (1);

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
