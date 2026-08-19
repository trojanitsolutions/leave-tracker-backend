import bcrypt from "bcryptjs";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../config/database";
import {
  CreateEmployeeInput,
  EmployeeAuthState,
  EmployeeFilter,
  EmployeeWithCredentials,
  IEmployeeRepository,
  UpdateEmployeeInput,
} from "../interfaces/employee-repository.interface";
import { Employee, UserRole } from "../types/entities";

interface EmployeeRow extends RowDataPacket {
  id: number;
  employee_code: string;
  full_name: string;
  email: string;
  password_hash: string;
  department: string | null;
  role: UserRole;
  manager_id: number | null;
  joining_date: string;
  annual_entitlement_days: number;
  is_active: number;
  token_version: number;
  created_at: string;
  updated_at: string;
}

function mapRow(row: EmployeeRow): Employee {
  return {
    id: row.id,
    employeeCode: row.employee_code,
    fullName: row.full_name,
    email: row.email,
    department: row.department,
    role: row.role,
    managerId: row.manager_id,
    joiningDate: row.joining_date,
    annualEntitlementDays: row.annual_entitlement_days,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class EmployeeRepository implements IEmployeeRepository {
  async findById(id: number): Promise<Employee | null> {
    const [rows] = await pool.query<EmployeeRow[]>("SELECT * FROM employees WHERE id = ?", [id]);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<Employee | null> {
    const [rows] = await pool.query<EmployeeRow[]>("SELECT * FROM employees WHERE email = ?", [
      email,
    ]);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async findByEmailWithCredentials(email: string): Promise<EmployeeWithCredentials | null> {
    const [rows] = await pool.query<EmployeeRow[]>("SELECT * FROM employees WHERE email = ?", [
      email,
    ]);
    if (!rows[0]) return null;
    return { ...mapRow(rows[0]), passwordHash: rows[0].password_hash, tokenVersion: rows[0].token_version };
  }

  async findByIdWithCredentials(id: number): Promise<EmployeeWithCredentials | null> {
    const [rows] = await pool.query<EmployeeRow[]>("SELECT * FROM employees WHERE id = ?", [id]);
    if (!rows[0]) return null;
    return { ...mapRow(rows[0]), passwordHash: rows[0].password_hash, tokenVersion: rows[0].token_version };
  }

  async findAuthState(id: number): Promise<EmployeeAuthState | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, role, is_active, token_version FROM employees WHERE id = ?",
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      role: row.role,
      isActive: Boolean(row.is_active),
      tokenVersion: row.token_version,
    };
  }

  async incrementTokenVersion(id: number): Promise<void> {
    await pool.query("UPDATE employees SET token_version = token_version + 1 WHERE id = ?", [id]);
  }

  async findByManagerId(managerId: number): Promise<Employee[]> {
    const [rows] = await pool.query<EmployeeRow[]>(
      "SELECT * FROM employees WHERE manager_id = ? AND is_active = 1 ORDER BY full_name",
      [managerId],
    );
    return rows.map(mapRow);
  }

  async findAll(filter: EmployeeFilter = {}): Promise<Employee[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filter.department) {
      clauses.push("department = ?");
      params.push(filter.department);
    }
    if (filter.managerId !== undefined) {
      clauses.push("manager_id = ?");
      params.push(filter.managerId);
    }
    if (filter.role) {
      clauses.push("role = ?");
      params.push(filter.role);
    }
    if (filter.isActive !== undefined) {
      clauses.push("is_active = ?");
      params.push(filter.isActive ? 1 : 0);
    }
    if (filter.search) {
      clauses.push("(full_name LIKE ? OR email LIKE ? OR employee_code LIKE ?)");
      params.push(`%${filter.search}%`, `%${filter.search}%`, `%${filter.search}%`);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rows] = await pool.query<EmployeeRow[]>(
      `SELECT * FROM employees ${where} ORDER BY full_name`,
      params,
    );
    return rows.map(mapRow);
  }

  async create(data: CreateEmployeeInput): Promise<Employee> {
    const passwordHash = await bcrypt.hash(data.password, 10);

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO employees
         (employee_code, full_name, email, password_hash, department, role, manager_id, joining_date, annual_entitlement_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.employeeCode,
        data.fullName,
        data.email,
        passwordHash,
        data.department,
        data.role,
        data.managerId,
        data.joiningDate,
        data.annualEntitlementDays,
      ],
    );

    const created = await this.findById(result.insertId);
    if (!created) {
      throw new Error("Failed to load employee immediately after insert");
    }
    return created;
  }

  async update(id: number, data: UpdateEmployeeInput): Promise<Employee> {
    const columns: Record<string, unknown> = {
      employee_code: data.employeeCode,
      full_name: data.fullName,
      email: data.email,
      department: data.department,
      role: data.role,
      manager_id: data.managerId,
      joining_date: data.joiningDate,
      annual_entitlement_days: data.annualEntitlementDays,
      is_active: data.isActive === undefined ? undefined : data.isActive ? 1 : 0,
    };

    const setClauses: string[] = [];
    const params: unknown[] = [];
    for (const [column, value] of Object.entries(columns)) {
      if (value !== undefined) {
        setClauses.push(`${column} = ?`);
        params.push(value);
      }
    }

    if (setClauses.length > 0) {
      params.push(id);
      await pool.query(`UPDATE employees SET ${setClauses.join(", ")} WHERE id = ?`, params);
    }

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Employee ${id} not found after update`);
    }
    return updated;
  }

  async updatePassword(id: number, passwordHash: string): Promise<void> {
    await pool.query("UPDATE employees SET password_hash = ? WHERE id = ?", [passwordHash, id]);
  }

  async delete(id: number): Promise<void> {
    await pool.query("UPDATE employees SET is_active = 0 WHERE id = ?", [id]);
  }
}
