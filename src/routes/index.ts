import { Router } from "express";
import adminRoutes from "./admin.routes";
import authRoutes from "./auth.routes";
import employeeRoutes from "./employee.routes";
import extensionRoutes from "./extension.routes";
import healthRoutes from "./health.routes";
import leaveRoutes from "./leave.routes";
import leaveTypeRoutes from "./leave-type.routes";
import notificationRoutes from "./notification.routes";
import uploadRoutes from "./upload.routes";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/leave-requests", leaveRoutes);
router.use("/admin", adminRoutes);
router.use("/employees", employeeRoutes);
router.use("/extensions", extensionRoutes);
router.use("/notifications", notificationRoutes);
router.use("/leave-types", leaveTypeRoutes);
router.use("/uploads", uploadRoutes);

export default router;
