import express from "express";
import {
  getShiftSettings,
  updateShiftSettings,
} from "../controllers/shift.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/permission.middleware.js";

const router = express.Router();

router.get("/settings", protect, getShiftSettings);

router.put(
  "/settings",
  protect,
  requirePermission("manage_settings"),
  updateShiftSettings
);

export default router;
