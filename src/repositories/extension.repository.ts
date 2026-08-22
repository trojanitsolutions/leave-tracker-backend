import { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../config/database";
import {
  CreateLeaveExtensionInput,
  ExtensionFilter,
  IExtensionRepository,
} from "../interfaces/extension-repository.interface";
import { LeaveDecisionStatus, LeaveExtension } from "../types/entities";

interface LeaveExtensionRow extends RowDataPacket {
  id: number;
  leave_request_id: number;
  employee_id: number;
  manager_id: number;
  leave_type_id: number;
  start_date: string;
  end_date: string;
  number_of_days: number;
  reason: string | null;
  attachment_name: string | null;
  attachment_url: string | null;
  status: LeaveDecisionStatus;
  submitted_at: string;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: LeaveExtensionRow): LeaveExtension {
  return {
    id: row.id,
    leaveRequestId: row.leave_request_id,
    employeeId: row.employee_id,
    managerId: row.manager_id,
    leaveTypeId: row.leave_type_id,
    startDate: row.start_date,
    endDate: row.end_date,
    numberOfDays: row.number_of_days,
    reason: row.reason,
    attachmentName: row.attachment_name,
    attachmentUrl: row.attachment_url,
    status: row.status,
    submittedAt: row.submitted_at,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ExtensionRepository implements IExtensionRepository {
  async findById(id: number): Promise<LeaveExtension | null> {
    const [rows] = await pool.query<LeaveExtensionRow[]>(
      "SELECT * FROM leave_extensions WHERE id = ?",
      [id],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async findByLeaveRequestId(leaveRequestId: number): Promise<LeaveExtension[]> {
    const [rows] = await pool.query<LeaveExtensionRow[]>(
      "SELECT * FROM leave_extensions WHERE leave_request_id = ? ORDER BY start_date DESC",
      [leaveRequestId],
    );
    return rows.map(mapRow);
  }

  async findByEmployeeId(employeeId: number): Promise<LeaveExtension[]> {
    const [rows] = await pool.query<LeaveExtensionRow[]>(
      "SELECT * FROM leave_extensions WHERE employee_id = ? ORDER BY start_date DESC",
      [employeeId],
    );
    return rows.map(mapRow);
  }

  async findPendingByManagerId(managerId: number): Promise<LeaveExtension[]> {
    const [rows] = await pool.query<LeaveExtensionRow[]>(
      "SELECT * FROM leave_extensions WHERE manager_id = ? AND status = 'pending' ORDER BY submitted_at ASC",
      [managerId],
    );
    return rows.map(mapRow);
  }

  async findAll(filter: ExtensionFilter = {}): Promise<LeaveExtension[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filter.employeeId !== undefined) {
      clauses.push("employee_id = ?");
      params.push(filter.employeeId);
    }
    if (filter.managerId !== undefined) {
      clauses.push("manager_id = ?");
      params.push(filter.managerId);
    }
    if (filter.leaveRequestId !== undefined) {
      clauses.push("leave_request_id = ?");
      params.push(filter.leaveRequestId);
    }
    if (filter.status) {
      clauses.push("status = ?");
      params.push(filter.status);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rows] = await pool.query<LeaveExtensionRow[]>(
      `SELECT * FROM leave_extensions ${where} ORDER BY start_date DESC`,
      params,
    );
    return rows.map(mapRow);
  }

  async create(data: CreateLeaveExtensionInput): Promise<LeaveExtension> {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO leave_extensions
         (leave_request_id, employee_id, manager_id, leave_type_id, start_date, end_date, number_of_days, reason, attachment_name, attachment_url, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        data.leaveRequestId,
        data.employeeId,
        data.managerId,
        data.leaveTypeId,
        data.startDate,
        data.endDate,
        data.numberOfDays,
        data.reason,
        data.attachmentName,
        data.attachmentUrl,
      ],
    );

    const created = await this.findById(result.insertId);
    if (!created) {
      throw new Error("Failed to load leave extension immediately after insert");
    }
    return created;
  }

  async updateStatus(id: number, status: LeaveDecisionStatus): Promise<LeaveExtension> {
    const decidedAtClause = status === "pending" ? "decided_at = NULL" : "decided_at = NOW()";
    await pool.query(`UPDATE leave_extensions SET status = ?, ${decidedAtClause} WHERE id = ?`, [
      status,
      id,
    ]);
    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Leave extension ${id} not found after status update`);
    }
    return updated;
  }

  async delete(id: number): Promise<void> {
    await pool.query("DELETE FROM leave_extensions WHERE id = ?", [id]);
  }
}
