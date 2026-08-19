import { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "../config/database";
import {
  IPasswordResetRepository,
  PasswordResetOtp,
} from "../interfaces/password-reset-repository.interface";

interface PasswordResetOtpRow extends RowDataPacket {
  id: number;
  employee_id: number;
  otp_hash: string;
  expires_at: string;
  attempts: number;
  consumed: number;
  created_at: string;
}

function mapRow(row: PasswordResetOtpRow): PasswordResetOtp {
  return {
    id: row.id,
    employeeId: row.employee_id,
    otpHash: row.otp_hash,
    expiresAt: row.expires_at,
    attempts: row.attempts,
    consumed: Boolean(row.consumed),
    createdAt: row.created_at,
  };
}

export class PasswordResetRepository implements IPasswordResetRepository {
  async create(employeeId: number, otpHash: string, expiresInMinutes: number): Promise<PasswordResetOtp> {
    await pool.query("UPDATE password_reset_otps SET consumed = 1 WHERE employee_id = ? AND consumed = 0", [
      employeeId,
    ]);

    const [result] = await pool.query<ResultSetHeader>(
      "INSERT INTO password_reset_otps (employee_id, otp_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))",
      [employeeId, otpHash, expiresInMinutes],
    );

    const [rows] = await pool.query<PasswordResetOtpRow[]>(
      "SELECT * FROM password_reset_otps WHERE id = ?",
      [result.insertId],
    );
    if (!rows[0]) {
      throw new Error("Failed to load password reset code immediately after insert");
    }
    return mapRow(rows[0]);
  }

  async findLatestActive(employeeId: number): Promise<PasswordResetOtp | null> {
    const [rows] = await pool.query<PasswordResetOtpRow[]>(
      `SELECT * FROM password_reset_otps
       WHERE employee_id = ? AND consumed = 0 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [employeeId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async incrementAttempts(id: number): Promise<void> {
    await pool.query("UPDATE password_reset_otps SET attempts = attempts + 1 WHERE id = ?", [id]);
  }

  async markConsumed(id: number): Promise<void> {
    await pool.query("UPDATE password_reset_otps SET consumed = 1 WHERE id = ?", [id]);
  }
}
