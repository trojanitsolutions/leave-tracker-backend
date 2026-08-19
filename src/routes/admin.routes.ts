import { Router } from "express";
import { asyncHandler } from "../common/asyncHandler";
import { AdminController } from "../controllers/admin.controller";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { AuditRepository } from "../repositories/audit.repository";
import { EmployeeRepository } from "../repositories/employee.repository";
import { ExtensionRepository } from "../repositories/extension.repository";
import { LeaveCycleRepository } from "../repositories/leave-cycle.repository";
import { NotificationRepository } from "../repositories/notification.repository";
import { LeaveRepository } from "../repositories/leave.repository";
import { SettingsRepository } from "../repositories/settings.repository";
import { LeaveService } from "../services/leave.service";

const router = Router();
const leaveService = new LeaveService(
  new EmployeeRepository(),
  new LeaveRepository(),
  new AuditRepository(),
  new ExtensionRepository(),
  new SettingsRepository(),
  new LeaveCycleRepository(),
  new NotificationRepository(),
);
const controller = new AdminController(leaveService);

router.use(authenticate, authorize("admin"));
router.get("/overview", asyncHandler(controller.overview));
router.get("/audit-history", asyncHandler(controller.auditHistory));
router.get("/settings", asyncHandler(controller.getSettings));
router.patch("/settings", asyncHandler(controller.updateSettings));
router.get("/leave-records", asyncHandler(controller.listLeaveRecords));
router.patch("/leave-records/:id", asyncHandler(controller.correctLeaveRecord));
router.post("/leave-records/:id/back-to-work", asyncHandler(controller.recordBackToWork));
router.get("/calendar", asyncHandler(controller.calendar));
router.get("/reports", asyncHandler(controller.reports));

export default router;
