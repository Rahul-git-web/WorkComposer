import express from "express";
import { screenshotUploadGuard } from "../middleware/fileUploadGuard.middleware.js";
import { protect } from "../middleware/auth.middleware.js";
import { exportScreenshotsZip, getScreenshots, getUserScreenshots, uploadScreenshot } from "../controllers/screenshot.controller.js";

const router = express.Router();

router.post("/upload", protect, screenshotUploadGuard, uploadScreenshot);
router.get("/", protect, getScreenshots);
router.get("/export-zip", protect, exportScreenshotsZip);
router.get("/:userId", protect, getUserScreenshots);

export default router;
