import { Router } from "express";
import { asyncHandler } from "../common/asyncHandler";
import { HealthController } from "../controllers/health.controller";

const router = Router();
const controller = new HealthController();

router.get("/", asyncHandler(controller.getStatus));
router.get("/db", asyncHandler(controller.getDatabaseStatus));

export default router;
