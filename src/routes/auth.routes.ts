import { Router } from "express";
import { asyncHandler } from "../common/asyncHandler";
import { AuthController } from "../controllers/auth.controller";
import { authenticate } from "../middleware/authenticate";
import { EmployeeRepository } from "../repositories/employee.repository";
import { PasswordResetRepository } from "../repositories/password-reset.repository";
import { AuthService } from "../services/auth.service";

const router = Router();
const authService = new AuthService(new EmployeeRepository(), new PasswordResetRepository());
const controller = new AuthController(authService);

router.post("/login", asyncHandler(controller.login));
router.post("/logout", asyncHandler(controller.logout));
router.post("/refresh", asyncHandler(controller.refresh));
router.get("/me", authenticate, asyncHandler(controller.me));
router.post("/change-password", authenticate, asyncHandler(controller.changePassword));
router.post("/forgot-password", asyncHandler(controller.forgotPassword));
router.post("/verify-reset-otp", asyncHandler(controller.verifyResetOtp));
router.post("/reset-password", asyncHandler(controller.resetPassword));

export default router;
