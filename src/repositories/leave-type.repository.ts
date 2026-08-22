import { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../config/database";
import {
  CreateLeaveTypeInput,
  ILeaveTypeRepository,
  UpdateLeaveTypeInput,
} from "../interfaces/leave-type-repository.interface";
import { LeaveType } from "../types/entities";

interface LeaveTypeRow extends RowDataPacket {
  id: number;
  code: string;
  name: string;
  is_paid: number;
  requires_eligibility: number;
  is_child_type: number;
  default_entitlement_days: number | null;
  is_system: number;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function mapRow(row: LeaveTypeRow): LeaveType {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isPaid: Boolean(row.is_paid),
    requiresEligibility: Boolean(row.requires_eligibility),
    isChildType: Boolean(row.is_child_type),
    defaultEntitlementDays: row.default_entitlement_days,
    isSystem: Boolean(row.is_system),
    isActive: Boolean(row.is_active),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${base || "leave_type"}_${Date.now().toString(36)}`;
}

export class LeaveTypeRepository implements ILeaveTypeRepository {
  async findAll(): Promise<LeaveType[]> {
    const [rows] = await pool.query<LeaveTypeRow[]>("SELECT * FROM leave_types ORDER BY sort_order, id");
    return rows.map(mapRow);
  }

  async findById(id: number): Promise<LeaveType | null> {
    const [rows] = await pool.query<LeaveTypeRow[]>("SELECT * FROM leave_types WHERE id = ?", [id]);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async findByCode(code: string): Promise<LeaveType | null> {
    const [rows] = await pool.query<LeaveTypeRow[]>("SELECT * FROM leave_types WHERE code = ?", [code]);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async create(data: CreateLeaveTypeInput): Promise<LeaveType> {
    const [maxRows] = await pool.query<RowDataPacket[]>(
      "SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM leave_types",
    );
    const sortOrder = data.sortOrder ?? Number(maxRows[0].max_sort) + 1;

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO leave_types
         (code, name, is_paid, requires_eligibility, is_child_type, default_entitlement_days, is_system, is_active, sort_order)
       VALUES (?, ?, ?, ?, 0, ?, 0, 1, ?)`,
      [
        slugify(data.name),
        data.name,
        data.isPaid ? 1 : 0,
        data.requiresEligibility ? 1 : 0,
        data.isPaid ? data.defaultEntitlementDays : null,
        sortOrder,
      ],
    );

    const created = await this.findById(result.insertId);
    if (!created) {
      throw new Error("Failed to load leave type immediately after insert");
    }
    return created;
  }

  async update(id: number, data: UpdateLeaveTypeInput): Promise<LeaveType> {
    const columns: Record<string, unknown> = {
      name: data.name,
      is_paid: data.isPaid === undefined ? undefined : data.isPaid ? 1 : 0,
      requires_eligibility:
        data.requiresEligibility === undefined ? undefined : data.requiresEligibility ? 1 : 0,
      default_entitlement_days: data.defaultEntitlementDays,
      sort_order: data.sortOrder,
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
      await pool.query(`UPDATE leave_types SET ${setClauses.join(", ")} WHERE id = ?`, params);
    }

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Leave type ${id} not found after update`);
    }
    return updated;
  }

  async setActive(id: number, isActive: boolean): Promise<LeaveType> {
    await pool.query("UPDATE leave_types SET is_active = ? WHERE id = ?", [isActive ? 1 : 0, id]);
    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Leave type ${id} not found after setActive`);
    }
    return updated;
  }

  async getEmployeeEntitlementOverride(employeeId: number, leaveTypeId: number): Promise<number | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT entitlement_days FROM employee_leave_entitlements WHERE employee_id = ? AND leave_type_id = ?",
      [employeeId, leaveTypeId],
    );
    return rows[0] ? Number(rows[0].entitlement_days) : null;
  }

  async countUsage(leaveTypeId: number): Promise<number> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM leave_requests WHERE leave_type_id = ?) +
         (SELECT COUNT(*) FROM leave_extensions WHERE leave_type_id = ?) +
         (SELECT COUNT(*) FROM employee_leave_entitlements WHERE leave_type_id = ?) AS usage_count`,
      [leaveTypeId, leaveTypeId, leaveTypeId],
    );
    return Number(rows[0].usage_count);
  }

  async delete(id: number): Promise<void> {
    await pool.query("DELETE FROM leave_types WHERE id = ?", [id]);
  }
}
