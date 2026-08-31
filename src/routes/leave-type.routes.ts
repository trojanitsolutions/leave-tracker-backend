import { Router } from "express";
import { asyncHandler } from "../common/asyncHandler";
import { LeaveTypeController } from "../controllers/leave-type.controller";
import { authenticate } from "../middleware/authenticate";
import { AuditRepository } from "../repositories/audit.repository";
import { LeaveTypeRepository } from "../repositories/leave-type.repository";
import { LeaveTypeService } from "../services/leave-type.service";

const router = Router();
const leaveTypeService = new LeaveTypeService(new LeaveTypeRepository(), new AuditRepository());
const controller = new LeaveTypeController(leaveTypeService);

router.use(authenticate);
router.get("/", asyncHandler(controller.list));

export default router;
