import { normalizeId } from "../security/effectiveAuthContext.js";
import { getReportUserIds } from "../utils/reportAccess.js";
import { userRepository } from "../db/repositories/user.repository.js";
import {
  resolveUserTimezone,
  getTodayInTimezone,
  getDateInTimezone,
} from "../utils/timezone.js";
import {
  generateTeamDayObservations,
  computePersonalHistoricalBaseline,
} from "../services/teamDayIntelligence.service.js";

/**
 * GET /api/intelligence/team-day
 *
 * Returns evidence-based intelligence observations for authorized team members.
 * Enforces strict tenant isolation, authorization boundaries, and bulk query performance.
 */
export const getTeamDayIntelligence = async (req, res) => {
  try {
    const callerOrgId = normalizeId(req.user.organizationId || req.user.organization);
    const timezone = resolveUserTimezone(req.user, req);

    let date = req.query.date;
    if (date) {
      if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
        date = date.trim();
      } else {
        const parsed = new Date(date);
        if (isNaN(parsed.getTime())) {
          return res.status(400).json({ message: "Invalid date format" });
        }
        date = getDateInTimezone(parsed, timezone);
      }
    } else {
      date = getTodayInTimezone(timezone);
    }

    // Authorization check
    const allowedUserIds = await getReportUserIds(req.user);
    if (allowedUserIds && allowedUserIds.length === 0) {
      return res.json({
        success: true,
        date,
        timezone,
        summary: {
          totalEvaluatedEmployees: 0,
          measuredCount: 0,
          partialCount: 0,
          unavailableCount: 0,
          interruptedCount: 0,
          totalObservations: 0,
          unusualActivityTotalMinutes: 0,
          unusualActivityStatus: "unavailable",
          unusualActivityCount: 0,
        },
        employeeObservations: {},
      });
    }

    // Resolve target users in caller's organization
    const filter = { organization: callerOrgId, isArchived: false };
    if (allowedUserIds) {
      filter._id = { $in: allowedUserIds, in: allowedUserIds };
    }

    if (req.query.users?.trim()) {
      const requested = req.query.users.split(",").map((id) => normalizeId(id)).filter(Boolean);
      if (allowedUserIds) {
        const allowedSet = new Set(allowedUserIds.map((id) => id.toString()));
        const permitted = requested.filter((id) => allowedSet.has(id));
        if (permitted.length === 0) {
          return res.json({
            success: true,
            date,
            timezone,
            summary: {
              totalEvaluatedEmployees: 0,
              unusualActivityTotalMinutes: 0,
              unusualActivityStatus: "unavailable",
            },
            employeeObservations: {},
          });
        }
        filter._id = { $in: permitted, in: permitted };
      } else {
        filter._id = { $in: requested, in: requested };
      }
    }

    const users = await userRepository.find(filter);
    const userIds = users.map((u) => normalizeId(u._id || u.id));

    const result = await generateTeamDayObservations({
      organizationId: callerOrgId,
      userIds,
      date,
      timezone,
    });

    return res.json(result);
  } catch (err) {
    console.error("GET TEAM DAY INTELLIGENCE ERROR:", err);
    return res.status(500).json({
      message: "Failed to evaluate team day intelligence",
      error: err.message,
    });
  }
};

/**
 * GET /api/intelligence/employee/:employeeId
 *
 * Returns detailed intelligence observations and personal historical baseline comparison
 * for a single authorized employee.
 */
export const getEmployeeIntelligenceDetails = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const callerOrgId = normalizeId(req.user.organizationId || req.user.organization);
    const targetUserId = normalizeId(employeeId);

    // Verify user exists within caller's organization (zero-disclosure on cross-tenant)
    const targetUser = await userRepository.findUserByIdAndOrganization(targetUserId, callerOrgId);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Authorization check
    const allowedUserIds = await getReportUserIds(req.user);
    if (
      allowedUserIds &&
      !allowedUserIds.some((id) => id.toString() === targetUserId.toString())
    ) {
      return res.status(403).json({ message: "Permission denied" });
    }

    const timezone = resolveUserTimezone(targetUser, req);

    let date = req.query.date;
    if (date) {
      if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
        date = date.trim();
      } else {
        const parsed = new Date(date);
        if (isNaN(parsed.getTime())) {
          return res.status(400).json({ message: "Invalid date format" });
        }
        date = getDateInTimezone(parsed, timezone);
      }
    } else {
      date = getTodayInTimezone(timezone);
    }

    // 1. Generate today's observations
    const teamDayResult = await generateTeamDayObservations({
      organizationId: callerOrgId,
      userIds: [targetUserId],
      date,
      timezone,
    });

    const userObs = teamDayResult.employeeObservations[targetUserId] || {
      employeeId: targetUserId,
      coveragePercent: 0,
      status: "UNAVAILABLE",
      unusualActivityMinutes: null,
      unusualActivityMeasured: false,
      unusualActivityCount: 0,
      bucketPatterns: {},
      observations: [],
    };

    // 2. Compute Personal Historical Baseline
    const historicalBaseline = await computePersonalHistoricalBaseline({
      employeeId: targetUserId,
      callerOrgId,
      targetDate: date,
      daysCount: 14,
      timezone,
    });

    return res.json({
      success: true,
      employeeId: targetUserId,
      name: `${targetUser.firstName} ${targetUser.lastName}`,
      date,
      timezone,
      intelligence: userObs,
      historicalBaseline,
    });
  } catch (err) {
    console.error("GET EMPLOYEE INTELLIGENCE DETAILS ERROR:", err);
    return res.status(500).json({
      message: "Failed to evaluate employee intelligence details",
      error: err.message,
    });
  }
};

export default {
  getTeamDayIntelligence,
  getEmployeeIntelligenceDetails,
};

