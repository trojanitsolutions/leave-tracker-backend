import bcrypt from "bcryptjs";
import { pool } from "../config/database";

/**
 * Manager accounts are never created through the Employees screen — per the requirements,
 * a manager is provisioned the same deliberate, out-of-band way as the first admin account.
 * Admin's only manager-related job afterward is assigning this person as someone's
 * reporting manager from the Employees screen; nothing else about them is admin-editable there.
 */
async function createManager(): Promise<void> {
  const [employeeCode, fullName, email, password, department] = process.argv.slice(2);

  if (!employeeCode || !fullName || !email || !password) {
    console.error(
      "Usage: npm run create-manager -- <employeeCode> <fullName> <email> <password> [department]",
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const [existing] = await pool.query("SELECT id FROM employees WHERE email = ?", [email]);
  if ((existing as unknown[]).length > 0) {
    console.error(`An employee with email ${email} already exists.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const joiningDate = new Date().toISOString().slice(0, 10);

  await pool.query(
    `INSERT INTO employees
       (employee_code, full_name, email, password_hash, department, role, manager_id, joining_date, annual_entitlement_days)
     VALUES (?, ?, ?, ?, ?, 'manager', NULL, ?, 30)`,
    [employeeCode, fullName, email, passwordHash, department ?? null, joiningDate],
  );

  console.log(`Manager account created: ${fullName} <${email}>`);
  console.log("Assign them as a reporting manager from the Employees screen — that's the only admin action needed.");
}

createManager()
  .catch((err) => {
    console.error("Failed to create manager:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
