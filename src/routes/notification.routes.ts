import { Router } from "express";
import { asyncHandler } from "../common/asyncHandler";
import { NotificationController } from "../controllers/notification.controller";
import { authenticate } from "../middleware/authenticate";
import { AuditRepository } from "../repositories/audit.repository";
import { EmployeeRepository } from "../repositories/employee.repository";
import { ExtensionRepository } from "../repositories/extension.repository";
import { LeaveCycleRepository } from "../repositories/leave-cycle.repository";
import { LeaveRepository } from "../repositories/leave.repository";
import { NotificationRepository } from "../repositories/notification.repository";
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
const controller = new NotificationController(leaveService);

router.use(authenticate);
router.get("/", asyncHandler(controller.list));
router.get("/unread-count", asyncHandler(controller.unreadCount));
router.post("/:id/read", asyncHandler(controller.markRead));
router.post("/read-all", asyncHandler(controller.markAllRead));
router.delete("/:id", asyncHandler(controller.dismiss));

export default router;
