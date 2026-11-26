import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  getTeamDayIntelligence,
  getEmployeeIntelligenceDetails,
} from "../controllers/intelligence.controller.js";

const router = express.Router();

router.use(protect);

router.get("/team-day", getTeamDayIntelligence);
router.get("/employee/:employeeId", getEmployeeIntelligenceDetails);

export default router;

