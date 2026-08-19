import bcrypt from "bcryptjs";
import { pool } from "../config/database";

async function createAdmin(): Promise<void> {
  const [employeeCode, fullName, email, password] = process.argv.slice(2);

  if (!employeeCode || !fullName || !email || !password) {
    console.error("Usage: npm run create-admin -- <employeeCode> <fullName> <email> <password>");
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
     VALUES (?, ?, ?, ?, NULL, 'admin', NULL, ?, 30)`,
    [employeeCode, fullName, email, passwordHash, joiningDate],
  );

  console.log(`Admin account created: ${fullName} <${email}>`);
  console.log("Sign in with this email and the password you provided, then create the rest of your team from the Employees screen.");
}

createAdmin()
  .catch((err) => {
    console.error("Failed to create admin:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
