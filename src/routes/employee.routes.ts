import { Router } from "express";
import { asyncHandler } from "../common/asyncHandler";
import { EmployeeController } from "../controllers/employee.controller";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { AuditRepository } from "../repositories/audit.repository";
import { EmployeeRepository } from "../repositories/employee.repository";
import { ExtensionRepository } from "../repositories/extension.repository";
import { LeaveCycleRepository } from "../repositories/leave-cycle.repository";
import { NotificationRepository } from "../repositories/notification.repository";
import { LeaveRepository } from "../repositories/leave.repository";
import { SettingsRepository } from "../repositories/settings.repository";
import { EmployeeService } from "../services/employee.service";
import { LeaveService } from "../services/leave.service";

const router = Router();
const employeeRepository = new EmployeeRepository();
const auditRepository = new AuditRepository();
const employeeService = new EmployeeService(employeeRepository, auditRepository);
const leaveService = new LeaveService(
  employeeRepository,
  new LeaveRepository(),
  auditRepository,
  new ExtensionRepository(),
  new SettingsRepository(),
  new LeaveCycleRepository(),
  new NotificationRepository(),
);
const controller = new EmployeeController(employeeService, leaveService);

router.use(authenticate, authorize("admin"));
router.get("/", asyncHandler(controller.list));
router.get("/:id", asyncHandler(controller.get));
router.post("/", asyncHandler(controller.create));
router.patch("/:id", asyncHandler(controller.update));

export default router;
