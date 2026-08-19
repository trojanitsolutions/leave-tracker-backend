import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { ApiError } from "../common/ApiError";
import { signAccessToken, signRefreshToken, signResetToken, verifyToken } from "../common/jwt";
import { sendPasswordResetOtpEmail } from "../common/mailer";
import { IEmployeeRepository } from "../interfaces/employee-repository.interface";
import { IPasswordResetRepository } from "../interfaces/password-reset-repository.interface";
import { Employee } from "../types/entities";

const MIN_PASSWORD_LENGTH = 8;
const OTP_EXPIRES_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;

export class AuthService {
  constructor(
    private readonly employeeRepository: IEmployeeRepository,
    private readonly passwordResetRepository: IPasswordResetRepository,
  ) {}

  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string; employee: Employee }> {
    const employee = await this.employeeRepository.findByEmailWithCredentials(email);
    if (!employee || !employee.isActive) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    const passwordMatches = await bcrypt.compare(password, employee.passwordHash);
    if (!passwordMatches) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    const basePayload = {
      employeeId: employee.id,
      email: employee.email,
      role: employee.role,
      tokenVersion: employee.tokenVersion,
    };
    const accessToken = signAccessToken(basePayload);
    const refreshToken = signRefreshToken(basePayload);

    const { passwordHash: _passwordHash, tokenVersion: _tokenVersion, ...safeEmployee } = employee;
    return { accessToken, refreshToken, employee: safeEmployee };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; employee: Employee }> {
    let payload;
    try {
      payload = verifyToken(refreshToken, "refresh");
    } catch {
      throw ApiError.unauthorized("Session expired — please sign in again");
    }

    const authState = await this.employeeRepository.findAuthState(payload.employeeId);
    if (!authState || !authState.isActive || authState.tokenVersion !== payload.tokenVersion) {
      throw ApiError.unauthorized("Session expired — please sign in again");
    }

    const employee = await this.employeeRepository.findById(payload.employeeId);
    if (!employee) {
      throw ApiError.unauthorized("Session expired — please sign in again");
    }

    const accessToken = signAccessToken({
      employeeId: employee.id,
      email: employee.email,
      role: employee.role,
      tokenVersion: authState.tokenVersion,
    });

    return { accessToken, employee };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    try {
      const payload = verifyToken(refreshToken, "refresh");
      await this.employeeRepository.incrementTokenVersion(payload.employeeId);
    } catch {
    }
  }

  async getProfile(employeeId: number): Promise<Employee> {
    const employee = await this.employeeRepository.findById(employeeId);
    if (!employee) {
      throw ApiError.notFound("Employee not found");
    }
    return employee;
  }

  async changePassword(employeeId: number, currentPassword: string, newPassword: string): Promise<void> {
    const employee = await this.employeeRepository.findByIdWithCredentials(employeeId);
    if (!employee) {
      throw ApiError.notFound("Employee not found");
    }

    const currentMatches = await bcrypt.compare(currentPassword, employee.passwordHash);
    if (!currentMatches) {
      throw ApiError.badRequest("Your current password is incorrect.");
    }
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw ApiError.badRequest(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await this.employeeRepository.updatePassword(employeeId, newHash);
    await this.employeeRepository.incrementTokenVersion(employeeId);
  }

  async forgotPassword(email: string): Promise<void> {
    const employee = await this.employeeRepository.findByEmail(email);
    if (!employee || !employee.isActive) {
      return;
    }

    const otp = String(randomInt(100000, 1000000));
    const otpHash = await bcrypt.hash(otp, 10);
    await this.passwordResetRepository.create(employee.id, otpHash, OTP_EXPIRES_MINUTES);
    await sendPasswordResetOtpEmail(employee.email, employee.fullName, otp, OTP_EXPIRES_MINUTES);
  }

  async verifyResetOtp(email: string, otp: string): Promise<string> {
    const invalid = () => ApiError.badRequest("That code is invalid or has expired.");

    const employee = await this.employeeRepository.findByEmail(email);
    if (!employee) {
      throw invalid();
    }

    const record = await this.passwordResetRepository.findLatestActive(employee.id);
    if (!record || record.attempts >= MAX_OTP_ATTEMPTS) {
      throw invalid();
    }

    const matches = await bcrypt.compare(otp, record.otpHash);
    if (!matches) {
      await this.passwordResetRepository.incrementAttempts(record.id);
      throw invalid();
    }

    await this.passwordResetRepository.markConsumed(record.id);
    return signResetToken({
      employeeId: employee.id,
      email: employee.email,
      role: employee.role,
      tokenVersion: 0,
    });
  }

  async resetPassword(resetToken: string, newPassword: string): Promise<void> {
    let payload;
    try {
      payload = verifyToken(resetToken, "reset");
    } catch {
      throw ApiError.unauthorized("That reset session has expired — please request a new code.");
    }

    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw ApiError.badRequest(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await this.employeeRepository.updatePassword(payload.employeeId, newHash);
    await this.employeeRepository.incrementTokenVersion(payload.employeeId);
  }
}
