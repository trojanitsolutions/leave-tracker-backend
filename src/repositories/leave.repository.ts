import { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../config/database";
import {
  CreateLeaveRequestInput,
  ILeaveRepository,
  LeaveRequestFilter,
} from "../interfaces/leave-repository.interface";
import { LeaveDecisionStatus, LeaveRequest } from "../types/entities";

interface LeaveRequestRow extends RowDataPacket {
  id: number;
  employee_id: number;
  manager_id: number;
  start_date: string;
  end_date: string;
  number_of_days: number;
  reason: string | null;
  attachment_name: string | null;
  status: LeaveDecisionStatus;
  expected_back_to_work_date: string;
  actual_back_to_work_date: string | null;
  submitted_at: string;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: LeaveRequestRow): LeaveRequest {
  return {
    id: row.id,
    employeeId: row.employee_id,
    managerId: row.manager_id,
    startDate: row.start_date,
    endDate: row.end_date,
    numberOfDays: row.number_of_days,
    reason: row.reason,
    attachmentUrl: row.attachment_name,
    status: row.status,
    expectedBackToWorkDate: row.expected_back_to_work_date,
    actualBackToWorkDate: row.actual_back_to_work_date,
    submittedAt: row.submitted_at,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class LeaveRepository implements ILeaveRepository {
  async findById(id: number): Promise<LeaveRequest | null> {
    const [rows] = await pool.query<LeaveRequestRow[]>(
      "SELECT * FROM leave_requests WHERE id = ?",
      [id],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async findByEmployeeId(employeeId: number): Promise<LeaveRequest[]> {
    const [rows] = await pool.query<LeaveRequestRow[]>(
      "SELECT * FROM leave_requests WHERE employee_id = ? ORDER BY start_date DESC",
      [employeeId],
    );
    return rows.map(mapRow);
  }

  async findPendingByManagerId(managerId: number): Promise<LeaveRequest[]> {
    const [rows] = await pool.query<LeaveRequestRow[]>(
      "SELECT * FROM leave_requests WHERE manager_id = ? AND status = 'pending' ORDER BY submitted_at ASC",
      [managerId],
    );
    return rows.map(mapRow);
  }

  async findAll(filter: LeaveRequestFilter = {}): Promise<LeaveRequest[]> {
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
    if (filter.status) {
      clauses.push("status = ?");
      params.push(filter.status);
    }
    if (filter.from) {
      clauses.push("end_date >= ?");
      params.push(filter.from);
    }
    if (filter.to) {
      clauses.push("start_date <= ?");
      params.push(filter.to);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rows] = await pool.query<LeaveRequestRow[]>(
      `SELECT * FROM leave_requests ${where} ORDER BY start_date DESC`,
      params,
    );
    return rows.map(mapRow);
  }

  async findOverlapping(employeeId: number, startDate: string, endDate: string): Promise<LeaveRequest[]> {
    const [rows] = await pool.query<LeaveRequestRow[]>(
      `SELECT * FROM leave_requests
       WHERE employee_id = ?
         AND status IN ('pending', 'approved')
         AND start_date <= ?
         AND end_date >= ?`,
      [employeeId, endDate, startDate],
    );
    return rows.map(mapRow);
  }

  async create(data: CreateLeaveRequestInput): Promise<LeaveRequest> {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO leave_requests
         (employee_id, manager_id, start_date, end_date, number_of_days, reason, attachment_name,
          expected_back_to_work_date, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        data.employeeId,
        data.managerId,
        data.startDate,
        data.endDate,
        data.numberOfDays,
        data.reason,
        data.attachmentUrl,
        data.expectedBackToWorkDate,
      ],
    );

    const created = await this.findById(result.insertId);
    if (!created) {
      throw new Error("Failed to load leave request immediately after insert");
    }
    return created;
  }

  async updateStatus(id: number, status: LeaveDecisionStatus): Promise<LeaveRequest> {
    const decidedAtClause = status === "pending" ? "decided_at = NULL" : "decided_at = NOW()";
    await pool.query(`UPDATE leave_requests SET status = ?, ${decidedAtClause} WHERE id = ?`, [
      status,
      id,
    ]);
    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Leave request ${id} not found after status update`);
    }
    return updated;
  }

  async updateFields(
    id: number,
    data: {
      startDate?: string;
      endDate?: string;
      numberOfDays?: number;
      reason?: string | null;
      status?: LeaveDecisionStatus;
    },
  ): Promise<LeaveRequest> {
    const columns: Record<string, unknown> = {
      start_date: data.startDate,
      end_date: data.endDate,
      number_of_days: data.numberOfDays,
      reason: data.reason,
      status: data.status,
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
      await pool.query(`UPDATE leave_requests SET ${setClauses.join(", ")} WHERE id = ?`, params);
    }

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Leave request ${id} not found after correction`);
    }
    return updated;
  }

  async recordActualBackToWork(id: number, actualBackToWorkDate: string | null): Promise<LeaveRequest> {
    await pool.query("UPDATE leave_requests SET actual_back_to_work_date = ? WHERE id = ?", [
      actualBackToWorkDate,
      id,
    ]);
    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Leave request ${id} not found after recording back-to-work date`);
    }
    return updated;
  }

  async updateExpectedBackToWork(id: number, expectedBackToWorkDate: string): Promise<LeaveRequest> {
    await pool.query("UPDATE leave_requests SET expected_back_to_work_date = ? WHERE id = ?", [
      expectedBackToWorkDate,
      id,
    ]);
    const updated = await this.findById(id);
    if (!updated) {
      throw new Error(`Leave request ${id} not found after updating expected back-to-work date`);
    }
    return updated;
  }

  async delete(id: number): Promise<void> {
    await pool.query("DELETE FROM leave_requests WHERE id = ?", [id]);
  }
}
