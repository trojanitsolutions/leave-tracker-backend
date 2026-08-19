import bcrypt from "bcryptjs";
import { pool } from "../config/database";

const DEV_PASSWORD = "TrojanDemo123!";

interface SeedEmployee {
  employeeCode: string;
  fullName: string;
  email: string;
  department: string;
  role: "employee" | "manager" | "admin";
  joiningDate: string;
  annualEntitlementDays: number;
}

async function insertEmployee(employee: SeedEmployee, managerId: number | null, passwordHash: string) {
  const [result] = await pool.query(
    `INSERT INTO employees
       (employee_code, full_name, email, password_hash, department, role, manager_id, joining_date, annual_entitlement_days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      employee.employeeCode,
      employee.fullName,
      employee.email,
      passwordHash,
      employee.department,
      employee.role,
      managerId,
      employee.joiningDate,
      employee.annualEntitlementDays,
    ],
  );
  return (result as { insertId: number }).insertId;
}

async function seed(): Promise<void> {
  console.log("Wiping existing demo data...");
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  await pool.query("TRUNCATE TABLE notifications");
  await pool.query("TRUNCATE TABLE audit_log");
  await pool.query("TRUNCATE TABLE leave_cycles");
  await pool.query("TRUNCATE TABLE leave_extensions");
  await pool.query("TRUNCATE TABLE leave_requests");
  await pool.query("TRUNCATE TABLE employees");
  await pool.query("UPDATE company_settings SET default_annual_entitlement_days = 30, eligibility_months = 12, cycle_length_months = 12 WHERE id = 1");
  await pool.query("SET FOREIGN_KEY_CHECKS = 1");

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  const fatimaId = await insertEmployee(
    {
      employeeCode: "DOH-0102",
      fullName: "Fatima Al-Kuwari",
      email: "fatima.alkuwari@trojantech.qa",
      department: "Operations",
      role: "manager",
      joiningDate: "2022-03-01",
      annualEntitlementDays: 30,
    },
    null,
    passwordHash,
  );

  await insertEmployee(
    {
      employeeCode: "DOH-0009",
      fullName: "Layla Al-Emadi",
      email: "layla.alemadi@trojantech.qa",
      department: "Human Resources",
      role: "admin",
      joiningDate: "2021-06-15",
      annualEntitlementDays: 30,
    },
    null,
    passwordHash,
  );

  const ahmedId = await insertEmployee(
    {
      employeeCode: "DOH-0417",
      fullName: "Ahmed Al-Sulaiti",
      email: "a.alsulaiti@trojantech.qa",
      department: "Operations",
      role: "employee",
      joiningDate: "2024-01-01",
      annualEntitlementDays: 30,
    },
    fatimaId,
    passwordHash,
  );

  const [approvedLeave] = await pool.query(
    `INSERT INTO leave_requests
       (employee_id, manager_id, start_date, end_date, number_of_days, reason, status,
        expected_back_to_work_date, submitted_at, decided_at)
     VALUES (?, ?, '2026-08-01', '2026-08-20', 20, 'Family visit to Muscat.', 'approved',
             '2026-08-21', '2026-07-01 09:00:00', '2026-07-02 10:00:00')`,
    [ahmedId, fatimaId],
  );
  const approvedLeaveId = (approvedLeave as { insertId: number }).insertId;

  const [pendingLeave] = await pool.query(
    `INSERT INTO leave_requests
       (employee_id, manager_id, start_date, end_date, number_of_days, reason, status,
        expected_back_to_work_date, submitted_at)
     VALUES (?, ?, '2026-10-05', '2026-10-09', 5, 'Personal travel.', 'pending',
             '2026-10-10', '2026-08-10 09:00:00')`,
    [ahmedId, fatimaId],
  );
  const pendingLeaveId = (pendingLeave as { insertId: number }).insertId;

  await pool.query(
    `INSERT INTO audit_log (employee_id, performed_by_employee_id, action, leave_request_id, performed_at)
     VALUES (?, ?, 'leave_submitted', ?, '2026-07-01 09:00:00')`,
    [ahmedId, ahmedId, approvedLeaveId],
  );
  await pool.query(
    `INSERT INTO audit_log (employee_id, performed_by_employee_id, action, leave_request_id, performed_at)
     VALUES (?, ?, 'leave_approved', ?, '2026-07-02 10:00:00')`,
    [ahmedId, fatimaId, approvedLeaveId],
  );
  await pool.query(
    `INSERT INTO audit_log (employee_id, performed_by_employee_id, action, leave_request_id, performed_at)
     VALUES (?, ?, 'leave_submitted', ?, '2026-08-10 09:00:00')`,
    [ahmedId, ahmedId, pendingLeaveId],
  );

  console.log("Seeded 3 employees + 2 leave requests + audit trail.");
  console.log(`Demo login — any seeded email, password: ${DEV_PASSWORD}`);
  console.log("  a.alsulaiti@trojantech.qa (employee)");
  console.log("  fatima.alkuwari@trojantech.qa (manager)");
  console.log("  layla.alemadi@trojantech.qa (admin)");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
