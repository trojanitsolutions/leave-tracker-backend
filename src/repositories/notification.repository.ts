import { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../config/database";
import {
  CreateNotificationInput,
  INotificationRepository,
  Notification,
} from "../interfaces/notification-repository.interface";

interface NotificationRow extends RowDataPacket {
  id: number;
  employee_id: number;
  action: string;
  message: string;
  leave_request_id: number | null;
  extension_id: number | null;
  is_read: number;
  created_at: string;
}

function mapRow(row: NotificationRow): Notification {
  return {
    id: row.id,
    employeeId: row.employee_id,
    action: row.action,
    message: row.message,
    leaveRequestId: row.leave_request_id,
    extensionId: row.extension_id,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
  };
}

const DEFAULT_LIMIT = 50;

export class NotificationRepository implements INotificationRepository {
  async findByEmployeeId(employeeId: number, limit: number = DEFAULT_LIMIT): Promise<Notification[]> {
    const [rows] = await pool.query<NotificationRow[]>(
      "SELECT * FROM notifications WHERE employee_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
      [employeeId, limit],
    );
    return rows.map(mapRow);
  }

  async countUnread(employeeId: number): Promise<number> {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS count FROM notifications WHERE employee_id = ? AND is_read = 0",
      [employeeId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async create(data: CreateNotificationInput): Promise<Notification> {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO notifications (employee_id, action, message, leave_request_id, extension_id, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [
        data.employeeId,
        data.action,
        data.message,
        data.leaveRequestId ?? null,
        data.extensionId ?? null,
      ],
    );
    const [rows] = await pool.query<NotificationRow[]>("SELECT * FROM notifications WHERE id = ?", [
      result.insertId,
    ]);
    if (!rows[0]) {
      throw new Error("Failed to load notification immediately after insert");
    }
    return mapRow(rows[0]);
  }

  async markRead(id: number, employeeId: number): Promise<Notification | null> {
    await pool.query("UPDATE notifications SET is_read = 1 WHERE id = ? AND employee_id = ?", [
      id,
      employeeId,
    ]);
    const [rows] = await pool.query<NotificationRow[]>(
      "SELECT * FROM notifications WHERE id = ? AND employee_id = ?",
      [id, employeeId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async markAllRead(employeeId: number): Promise<void> {
    await pool.query("UPDATE notifications SET is_read = 1 WHERE employee_id = ? AND is_read = 0", [
      employeeId,
    ]);
  }

  async delete(id: number, employeeId: number): Promise<void> {
    await pool.query("DELETE FROM notifications WHERE id = ? AND employee_id = ?", [id, employeeId]);
  }
}
