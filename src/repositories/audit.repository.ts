import { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../config/database";
import {
  AuditLogFilter,
  CreateAuditLogInput,
  IAuditRepository,
} from "../interfaces/audit-repository.interface";
import { AuditLogEntry } from "../types/entities";

interface AuditLogRow extends RowDataPacket {
  id: number;
  employee_id: number;
  performed_by_employee_id: number;
  action: string;
  leave_request_id: number | null;
  extension_id: number | null;
  details: Record<string, unknown> | null;
  performed_at: string;
}

function mapRow(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    employeeId: row.employee_id,
    performedByEmployeeId: row.performed_by_employee_id,
    action: row.action,
    leaveRequestId: row.leave_request_id,
    extensionId: row.extension_id,
    details: row.details,
    performedAt: row.performed_at,
  };
}

export class AuditRepository implements IAuditRepository {
  async findByEmployeeId(employeeId: number): Promise<AuditLogEntry[]> {
    const [rows] = await pool.query<AuditLogRow[]>(
      "SELECT * FROM audit_log WHERE employee_id = ? ORDER BY performed_at DESC",
      [employeeId],
    );
    return rows.map(mapRow);
  }

  async findAll(filter: AuditLogFilter = {}): Promise<AuditLogEntry[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filter.employeeId !== undefined) {
      clauses.push("employee_id = ?");
      params.push(filter.employeeId);
    }
    if (filter.leaveRequestId !== undefined) {
      clauses.push("leave_request_id = ?");
      params.push(filter.leaveRequestId);
    }
    if (filter.extensionId !== undefined) {
      clauses.push("extension_id = ?");
      params.push(filter.extensionId);
    }
    if (filter.from) {
      clauses.push("performed_at >= ?");
      params.push(filter.from);
    }
    if (filter.to) {
      clauses.push("performed_at <= ?");
      params.push(filter.to);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rows] = await pool.query<AuditLogRow[]>(
      `SELECT * FROM audit_log ${where} ORDER BY performed_at DESC`,
      params,
    );
    return rows.map(mapRow);
  }

  async record(entry: CreateAuditLogInput): Promise<AuditLogEntry> {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO audit_log
         (employee_id, performed_by_employee_id, action, leave_request_id, extension_id, details, performed_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        entry.employeeId,
        entry.performedByEmployeeId,
        entry.action,
        entry.leaveRequestId ?? null,
        entry.extensionId ?? null,
        entry.details ? JSON.stringify(entry.details) : null,
      ],
    );

    const [rows] = await pool.query<AuditLogRow[]>("SELECT * FROM audit_log WHERE id = ?", [
      result.insertId,
    ]);
    return mapRow(rows[0]);
  }
}
