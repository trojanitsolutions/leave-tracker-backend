import { Router } from "express";
import { asyncHandler } from "../common/asyncHandler";
import { ExtensionController } from "../controllers/extension.controller";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { AuditRepository } from "../repositories/audit.repository";
import { EmployeeRepository } from "../repositories/employee.repository";
import { ExtensionRepository } from "../repositories/extension.repository";
import { LeaveCycleRepository } from "../repositories/leave-cycle.repository";
import { LeaveTypeRepository } from "../repositories/leave-type.repository";
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
  new LeaveTypeRepository(),
);
const controller = new ExtensionController(leaveService);

router.use(authenticate);
router.post("/precheck", asyncHandler(controller.precheck));
router.post("/", asyncHandler(controller.apply));
router.post("/:id/approve", authorize("manager"), asyncHandler(controller.approve));
router.post("/:id/reject", authorize("manager"), asyncHandler(controller.reject));
router.post("/:id/undo", authorize("manager"), asyncHandler(controller.undo));

export default router;
