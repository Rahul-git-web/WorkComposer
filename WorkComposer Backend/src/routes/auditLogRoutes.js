import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/permission.middleware.js";
import { getAuditLogs } from "../controllers/auditLog.controller.js";

const router = express.Router();

router.get("/", protect, requirePermission("manage_settings"), getAuditLogs);

export default router;