export interface PasswordResetOtp {
  id: number;
  employeeId: number;
  otpHash: string;
  expiresAt: string;
  attempts: number;
  consumed: boolean;
  createdAt: string;
}

export interface IPasswordResetRepository {
  /** Invalidates any prior unconsumed codes for this employee, then inserts the new one. */
  create(employeeId: number, otpHash: string, expiresInMinutes: number): Promise<PasswordResetOtp>;
  findLatestActive(employeeId: number): Promise<PasswordResetOtp | null>;
  incrementAttempts(id: number): Promise<void>;
  markConsumed(id: number): Promise<void>;
}
