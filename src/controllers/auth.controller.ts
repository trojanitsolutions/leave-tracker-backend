import { CookieOptions, Request, Response } from "express";
import { ApiError } from "../common/ApiError";
import { sendSuccess } from "../common/ApiResponse";
import { env } from "../config/env";
import { AuthService } from "../services/auth.service";

const isProduction = env.nodeEnv === "production";

const ACCESS_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  maxAge: env.auth.accessCookieMaxAgeMs,
  path: "/",
};

const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  maxAge: env.auth.refreshCookieMaxAgeMs,
  path: env.auth.refreshCookiePath,
};

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  login = async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      throw ApiError.badRequest("Email and password are required.");
    }

    const { accessToken, refreshToken, employee } = await this.authService.login(email, password);
    res.cookie(env.auth.accessCookieName, accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie(env.auth.refreshCookieName, refreshToken, REFRESH_COOKIE_OPTIONS);
    sendSuccess(res, { employee });
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const refreshToken = req.cookies?.[env.auth.refreshCookieName];
    if (!refreshToken) {
      throw ApiError.unauthorized("Not signed in");
    }

    const { accessToken, employee } = await this.authService.refresh(refreshToken);
    res.cookie(env.auth.accessCookieName, accessToken, ACCESS_COOKIE_OPTIONS);
    sendSuccess(res, { employee });
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    const refreshToken = req.cookies?.[env.auth.refreshCookieName];
    await this.authService.logout(refreshToken);
    res.clearCookie(env.auth.accessCookieName, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.nodeEnv === "production",
      path: "/",
    });
    res.clearCookie(env.auth.refreshCookieName, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.nodeEnv === "production",
      path: env.auth.refreshCookiePath,
    });
    sendSuccess(res, { signedOut: true });
  };

  me = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw ApiError.unauthorized();
    const employee = await this.authService.getProfile(req.user.employeeId);
    sendSuccess(res, { employee });
  };

  changePassword = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw ApiError.unauthorized();
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!currentPassword || !newPassword) {
      throw ApiError.badRequest("Current password and new password are required.");
    }
    await this.authService.changePassword(req.user.employeeId, currentPassword, newPassword);
    sendSuccess(res, { success: true });
  };

  forgotPassword = async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body as { email?: string };
    if (!email) {
      throw ApiError.badRequest("Email is required.");
    }
    await this.authService.forgotPassword(email);
    sendSuccess(res, { sent: true });
  };

  verifyResetOtp = async (req: Request, res: Response): Promise<void> => {
    const { email, otp } = req.body as { email?: string; otp?: string };
    if (!email || !otp) {
      throw ApiError.badRequest("Email and code are required.");
    }
    const resetToken = await this.authService.verifyResetOtp(email, otp);
    sendSuccess(res, { resetToken });
  };

  resetPassword = async (req: Request, res: Response): Promise<void> => {
    const { resetToken, newPassword } = req.body as { resetToken?: string; newPassword?: string };
    if (!resetToken || !newPassword) {
      throw ApiError.badRequest("Reset token and new password are required.");
    }
    await this.authService.resetPassword(resetToken, newPassword);
    sendSuccess(res, { success: true });
  };
}
