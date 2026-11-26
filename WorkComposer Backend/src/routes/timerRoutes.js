import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  getActiveTimer,
  getActiveTimerByUser,
  startTimer,
  stopTimer,
} from "../controllers/timer.controller.js";

const router = express.Router();

// Require authentication for all timer operations
router.use(protect);

// Active timer query
router.get("/active", getActiveTimer);
router.get("/active/:userId", getActiveTimerByUser);

// Timer mutation lifecycle
router.post("/start", startTimer);
router.post("/stop", stopTimer);
router.post("/:id/stop", stopTimer);

export default router;
