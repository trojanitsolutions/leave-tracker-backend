import { Router } from "express";
import { asyncHandler } from "../common/asyncHandler";
import { LeaveController } from "../controllers/leave.controller";
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
const controller = new LeaveController(leaveService);

router.use(authenticate);
router.get("/me", asyncHandler(controller.overview));
router.get("/history", asyncHandler(controller.history));
router.get("/cycles", asyncHandler(controller.cycles));
router.post("/precheck", asyncHandler(controller.precheck));
router.post("/", asyncHandler(controller.apply));

router.get("/manager/queue", authorize("manager"), asyncHandler(controller.managerQueue));
router.get("/manager/overview", authorize("manager"), asyncHandler(controller.managerOverview));
router.get("/manager/history", authorize("manager"), asyncHandler(controller.teamHistory));
router.get("/manager/calendar", authorize("manager"), asyncHandler(controller.teamCalendar));
router.post("/:id/approve", authorize("manager"), asyncHandler(controller.approve));
router.post("/:id/reject", authorize("manager"), asyncHandler(controller.reject));
router.post("/:id/undo", authorize("manager"), asyncHandler(controller.undo));

export default router;
