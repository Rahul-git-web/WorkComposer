import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/permission.middleware.js";
import {
  classifyApp,
  createAttendanceDetailedReport,
  createAttendanceOverviewReport,
  createProductivityReport,
  createProjectReport,
  createProjectUserReport,
  createUsageReport,
  deleteReport,
  downloadReport,
  generateUsageCSV,
  getProductivityReport,
  getReports,
  testCSV,
} from "../controllers/report.controller.js";

const router = express.Router();

router.post("/attendance-overview", protect, createAttendanceOverviewReport);
router.get("/", protect, getReports);

router.get("/test-csv", protect, testCSV);

router.post("/attendance-detailed", protect, createAttendanceDetailedReport);

router.post("/usage", protect, createUsageReport);

router.post("/usageCSV", protect, generateUsageCSV);

router.get("/productivity", protect, getProductivityReport);

router.post("/productivity", protect, createProductivityReport);

router.post("/project-user", protect, createProjectUserReport);

router.post("/project", protect, createProjectReport);

router.post("/classify-app", protect, requirePermission("manage_settings"), classifyApp);

router.get("/:id/download", protect, downloadReport);

router.delete("/:id", protect, deleteReport);

export default router;
