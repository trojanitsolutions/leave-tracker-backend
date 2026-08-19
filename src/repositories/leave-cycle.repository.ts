import { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../config/database";
import {
  CreateLeaveCycleInput,
  ILeaveCycleRepository,
  LeaveCycle,
  LeaveCycleGeneratedReason,
} from "../interfaces/leave-cycle-repository.interface";

interface LeaveCycleRow extends RowDataPacket {
  id: number;
  employee_id: number;
  cycle_start: string;
  cycle_end: string;
  entitlement_days: number;
  generated_reason: LeaveCycleGeneratedReason;
  source_leave_request_id: number | null;
  created_at: string;
}

function mapRow(row: LeaveCycleRow): LeaveCycle {
  return {
    id: row.id,
    employeeId: row.employee_id,
    cycleStart: row.cycle_start,
    cycleEnd: row.cycle_end,
    entitlementDays: row.entitlement_days,
    generatedReason: row.generated_reason,
    sourceLeaveRequestId: row.source_leave_request_id,
    createdAt: row.created_at,
  };
}

export class LeaveCycleRepository implements ILeaveCycleRepository {
  async findByEmployeeId(employeeId: number): Promise<LeaveCycle[]> {
    const [rows] = await pool.query<LeaveCycleRow[]>(
      "SELECT * FROM leave_cycles WHERE employee_id = ? ORDER BY cycle_start DESC",
      [employeeId],
    );
    return rows.map(mapRow);
  }

  async findByEmployeeAndStart(employeeId: number, cycleStart: string): Promise<LeaveCycle | null> {
    const [rows] = await pool.query<LeaveCycleRow[]>(
      "SELECT * FROM leave_cycles WHERE employee_id = ? AND cycle_start = ?",
      [employeeId, cycleStart],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async create(data: CreateLeaveCycleInput): Promise<LeaveCycle> {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO leave_cycles
         (employee_id, cycle_start, cycle_end, entitlement_days, generated_reason, source_leave_request_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.employeeId,
        data.cycleStart,
        data.cycleEnd,
        data.entitlementDays,
        data.generatedReason,
        data.sourceLeaveRequestId,
      ],
    );

    const [rows] = await pool.query<LeaveCycleRow[]>("SELECT * FROM leave_cycles WHERE id = ?", [
      result.insertId,
    ]);
    if (!rows[0]) {
      throw new Error("Failed to load leave cycle immediately after insert");
    }
    return mapRow(rows[0]);
  }

  async deleteBySourceLeaveRequestId(employeeId: number, leaveRequestId: number): Promise<void> {
    await pool.query("DELETE FROM leave_cycles WHERE employee_id = ? AND source_leave_request_id = ?", [
      employeeId,
      leaveRequestId,
    ]);
  }
}
