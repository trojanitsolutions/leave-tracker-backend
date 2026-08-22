import { Router } from "express";
import { asyncHandler } from "../common/asyncHandler";
import { AdminController } from "../controllers/admin.controller";
import { LeaveTypeController } from "../controllers/leave-type.controller";
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
import { LeaveTypeService } from "../services/leave-type.service";

const router = Router();
const auditRepository = new AuditRepository();
const leaveService = new LeaveService(
  new EmployeeRepository(),
  new LeaveRepository(),
  auditRepository,
  new ExtensionRepository(),
  new SettingsRepository(),
  new LeaveCycleRepository(),
  new NotificationRepository(),
  new LeaveTypeRepository(),
);
const controller = new AdminController(leaveService);
const leaveTypeService = new LeaveTypeService(new LeaveTypeRepository(), auditRepository);
const leaveTypeController = new LeaveTypeController(leaveTypeService);

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
router.post("/leave-types", asyncHandler(leaveTypeController.create));
router.patch("/leave-types/:id", asyncHandler(leaveTypeController.update));
router.post("/leave-types/:id/deactivate", asyncHandler(leaveTypeController.deactivate));
router.post("/leave-types/:id/reactivate", asyncHandler(leaveTypeController.reactivate));
router.delete("/leave-types/:id", asyncHandler(leaveTypeController.remove));

export default router;
