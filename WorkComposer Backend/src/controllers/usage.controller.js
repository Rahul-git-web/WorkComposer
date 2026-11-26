import AppUsage from "../models/appUsage.model.js";
import User from "../models/user.model.js";
import Session from "../models/session.model.js";
import UsageLog from "../models/usageLog.model.js";
import AppClassification from "../models/appClassification.model.js";
import { getAvatarUrl } from "../utils/avatar.js";
import { getReportUserIds } from "../utils/reportAccess.js";
import {
  getUserTimezone,
  resolveUserTimezone,
  getZonedDayRange,
  getDateRangeUTC,
  getTodayInTimezone,
  calculateIntervalOverlap,
} from "../utils/timezone.js";
import { sendErrorResponse } from "../utils/sendErrorResponse.js";
import { userRepository } from "../db/repositories/user.repository.js";
import { projectRepository } from "../db/repositories/project.repository.js";
import { taskRepository } from "../db/repositories/task.repository.js";
import { sessionRepository } from "../db/repositories/session.repository.js";
import { timerRepository } from "../db/repositories/timer.repository.js";
import { timeTrackingSettingsRepository } from "../db/repositories/timeTrackingSettings.repository.js";
import resolveTrackingSettings from "../utils/resolveTrackingSettings.js";
import { normalizeId } from "../security/effectiveAuthContext.js";

const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return "0h 0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  return `${hours}h ${minutes}m`;
};

export const getTopApps = async (req, res) => {
  try {
    const { userId } = req.params;
    const callerOrgId = normalizeId(req.user.organizationId || req.user.organization);
    const targetUserId = normalizeId(userId);

    const allowedUserIds = await getReportUserIds(req.user);

    if (allowedUserIds && allowedUserIds.length === 0) {
      return res.status(403).json({
        message: "Permission denied",
      });
    }

    if (
      allowedUserIds &&
      !allowedUserIds.some((id) => id.toString() === targetUserId.toString())
    ) {
      return res.status(403).json({
        message: "Permission denied",
      });
    }

    const targetUser = await userRepository.findUserByIdAndOrganization(targetUserId, callerOrgId);
    if (!targetUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const { date } = req.query;

    const usages = await AppUsage.find({
      user: targetUserId,
      date,
    });

    const COLORS = ["#36A2EB", "#64B8D1", "#4BC0C0", "#5B9BD5", "#FFCE56"];

    const apps = usages
      .map((usage, index) => ({
        name: usage.appName,
        value: usage.duration,
        duration: usage.duration,
        color: COLORS[index % COLORS.length],
      }))
      .sort((a, b) => b.duration - a.duration);

    res.json(apps);
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to fetch top apps", 500);
  }
};

export const trackAppUsage = async (req, res) => {
  try {
    const callerOrgId = normalizeId(req.user?.organizationId || req.user?.organization);
    const callerUserId = normalizeId(req.user?._id || req.user?.id);
    if (callerOrgId && callerUserId) {
      const [orgSettings, callerUser] = await Promise.all([
        timeTrackingSettingsRepository.findOne({ organization: callerOrgId }),
        userRepository.findById(callerUserId),
      ]);
      const effective = resolveTrackingSettings(orgSettings, callerUser || req.user);
      if (effective?.tracking?.applicationTracking === false) {
        return res.json({
          success: true,
          skipped: true,
          reason: "application_tracking_disabled",
        });
      }
    }

    const { appName, windowTitle, duration, project, task } = req.body;

    const normalizedAppName = appName?.trim().toLowerCase();
    if (!normalizedAppName) {
      return res.status(400).json({
        message: "Application name is required",
      });
    }

    const parsedDuration = Number(duration);
    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
      return res.status(400).json({
        message: "Valid positive duration is required",
      });
    }
    const boundedDuration = Math.min(Math.round(parsedDuration), 3600);

    const classification = callerOrgId
      ? await AppClassification.findOne({
          organization: callerOrgId,
          appName: normalizedAppName,
        })
      : null;

    if (classification?.productivity === "blacklisted") {
      return res.json({
        success: true,
        skipped: true,
        reason: "blacklisted",
      });
    }

    if (classification) {
      const excludedUsers = (classification.excludedUsers || [])
        .map((id) => normalizeId(id))
        .filter(Boolean);

      if (excludedUsers.includes(callerUserId)) {
        return res.json({
          success: true,
          skipped: true,
          reason: "excluded_user",
        });
      }

      const excludedTeams = (classification.excludedTeams || [])
        .map((id) => normalizeId(id))
        .filter(Boolean);
      const userTeamId = normalizeId(req.user.team?._id || req.user.team?.id || req.user.team);

      if (userTeamId && excludedTeams.includes(userTeamId)) {
        return res.json({
          success: true,
          skipped: true,
          reason: "excluded_team",
        });
      }
    }

    const user = await User.findById(callerUserId).select("reportTimezone organization");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const timezone = resolveUserTimezone(user, req);

    const date = getTodayInTimezone(timezone);

    const startTime = new Date();

    const endTime = new Date(startTime.getTime() + boundedDuration * 1000);

    let resolvedProjectId = null;
    if (project) {
      const proj = await projectRepository.findProjectByIdAndOrganization(project, callerOrgId);
      if (proj) {
        resolvedProjectId = normalizeId(proj._id || proj.id);
      }
    }

    let resolvedTaskId = null;
    if (task) {
      const t = await taskRepository.findOne({ _id: task, organization: callerOrgId });
      if (t) {
        resolvedTaskId = normalizeId(t._id || t.id);
      }
    }

    let usage = await AppUsage.findOne({
      user: callerUserId,
      appName: normalizedAppName,
      date,
    });

    if (usage) {
      usage.duration += boundedDuration;
      usage.windowTitle = windowTitle;

      await usage.save();
    } else {
      usage = await AppUsage.create({
        user: callerUserId,
        appName: normalizedAppName,
        windowTitle,
        duration: boundedDuration,
        date,
      });
    }

    await UsageLog.create({
      user: callerUserId,

      project: resolvedProjectId || null,
      task: resolvedTaskId || null,

      appName: appName.trim(),

      windowTitle,

      startTime,

      endTime,

      duration: boundedDuration,

      date,
    });

    res.json({
      success: true,
    });
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to track app usage", 500);
  }
};

export const getUsageData = async (req, res) => {
  try {
    const { startDate, endDate, sortBy = "name", order = "asc" } = req.query;

    const callerOrgId = normalizeId(req.user.organizationId || req.user.organization);
    const userQuery = {
      organization: callerOrgId,
    };

    const allowedUserIds = await getReportUserIds(req.user);

    if (allowedUserIds && allowedUserIds.length === 0) {
      return res.json([]);
    }

    if (allowedUserIds) {
      userQuery._id = {
        $in: allowedUserIds,
      };
    }

    if (req.query.users?.trim()) {
      const requestedIds = req.query.users.split(",").map((id) => normalizeId(id)).filter(Boolean);
      if (allowedUserIds) {
        const allowedSet = new Set(allowedUserIds.map((id) => id.toString()));
        const permitted = requestedIds.filter((id) => allowedSet.has(id));
        if (permitted.length === 0) {
          return res.json([]);
        }
        userQuery._id = {
          $in: permitted,
        };
      } else {
        userQuery._id = {
          $in: requestedIds,
        };
      }
    }

    if (req.query.teams?.trim()) {
      userQuery.team = {
        $in: req.query.teams.split(",").filter(Boolean),
      };
    }

    const users = await User.find(userQuery);

    const userIds = users.map((u) => normalizeId(u._id || u.id)).filter(Boolean);

    let globalMinStart = null;
    let globalMaxEnd = null;
    const userRanges = new Map();

    if (startDate && endDate) {
      for (const user of users) {
        const uid = normalizeId(user._id || user.id);
        const tz = resolveUserTimezone(user, req);
        const start = getZonedDayRange(startDate, tz).start;
        const end = getZonedDayRange(endDate, tz).end;
        userRanges.set(uid, { start, end });
        if (!globalMinStart || start < globalMinStart) globalMinStart = start;
        if (!globalMaxEnd || end > globalMaxEnd) globalMaxEnd = end;
      }
    }

    // 1. Bulk Overlapping Sessions Query (replaces N per-user queries with 1 bulk query)
    let bulkSessions = [];
    if (userIds.length > 0) {
      if (globalMinStart && globalMaxEnd) {
        bulkSessions = await sessionRepository.findOverlappingSessions({
          userIds,
          periodStart: globalMinStart,
          periodEnd: globalMaxEnd,
        });
      } else {
        bulkSessions = await sessionRepository.find({
          userId: { in: userIds },
        });
      }
    }

    const sessionsByUser = new Map();
    for (const s of bulkSessions) {
      const uid = normalizeId(s.userId || s.user);
      if (!sessionsByUser.has(uid)) sessionsByUser.set(uid, []);
      sessionsByUser.get(uid).push(s);
    }

    // 1b. Bulk Active Timers Query (so running sessions contribute live Work Time)
    let bulkTimers = [];
    if (userIds.length > 0) {
      bulkTimers = await timerRepository.find({
        user: { in: userIds },
        status: "running",
      });
    }

    const activeTimerByUser = new Map();
    for (const t of bulkTimers) {
      const uid = normalizeId(t.userId || t.user);
      if (!activeTimerByUser.has(uid)) activeTimerByUser.set(uid, t);
    }

    // 2. Bulk AppUsage Query (replaces N per-user queries with 1 bulk query)
    let bulkUsages = [];
    if (userIds.length > 0) {
      const usageQuery = {
        user: { in: userIds },
      };
      if (startDate && endDate) {
        usageQuery.date = {
          $gte: startDate,
          $lte: endDate,
        };
      }
      bulkUsages = await AppUsage.find(usageQuery);
    }

    const usagesByUser = new Map();
    for (const u of bulkUsages) {
      const uid = normalizeId(u.user || u.userId);
      if (!usagesByUser.has(uid)) usagesByUser.set(uid, []);
      usagesByUser.get(uid).push(u);
    }

    const classifications = callerOrgId
      ? await AppClassification.find({ organization: callerOrgId })
      : [];
    const classificationMap = new Map();
    for (const item of classifications) {
      const key = item.appName?.trim().toLowerCase();
      if (key) {
        classificationMap.set(key, item);
      }
    }

    const evalNow = new Date();

    const usageData = users.map((user) => {
      const userId = normalizeId(user._id || user.id);
      const userTeamId = normalizeId(user.team?._id || user.team?.id || user.team);
      const range = userRanges.get(userId);

      const userAllSessions = sessionsByUser.get(userId) || [];
      let sessions;
      if (range) {
        sessions = userAllSessions.filter((s) => {
          const sStart = new Date(s.startTime);
          const sEnd = s.endTime ? new Date(s.endTime) : null;
          return sStart < range.end && (!sEnd || sEnd > range.start);
        });
      } else {
        sessions = [...userAllSessions];
      }

      const activeTimer = activeTimerByUser.get(userId);
      if (activeTimer?.startTime && !sessions.some((s) => !s.endTime)) {
        const timerStart = new Date(activeTimer.startTime);
        if (!range || timerStart < range.end) {
          sessions.push({
            userId,
            startTime: timerStart,
            endTime: null,
            type: "work",
          });
        }
      }

      let workSeconds = 0;
      let breakSeconds = 0;

      if (range) {
        for (const s of sessions) {
          const { overlapSeconds } = calculateIntervalOverlap(
            s,
            range.start,
            range.end,
            evalNow
          );
          if (s.type === "work") {
            workSeconds += overlapSeconds;
          } else if (s.type === "break") {
            breakSeconds += overlapSeconds;
          }
        }
      } else {
        workSeconds = sessions
          .filter((s) => s.type === "work")
          .reduce((sum, s) => sum + (s.duration || 0), 0);

        breakSeconds = sessions
          .filter((s) => s.type === "break")
          .reduce((sum, s) => sum + (s.duration || 0), 0);
      }

      const usages = usagesByUser.get(userId) || [];
      const appMap = {};

      usages.forEach((usage) => {
        const normalizedName = (usage.appName || "").trim().toLowerCase();
        if (!normalizedName) return;

        const classification = classificationMap.get(normalizedName);
        if (classification?.productivity === "blacklisted") {
          return;
        }
        if (classification) {
          const excludedUsers = (classification.excludedUsers || [])
            .map((id) => normalizeId(id))
            .filter(Boolean);
          if (excludedUsers.includes(userId)) {
            return;
          }
          const excludedTeams = (classification.excludedTeams || [])
            .map((id) => normalizeId(id))
            .filter(Boolean);
          if (userTeamId && excludedTeams.includes(userTeamId)) {
            return;
          }
        }

        if (!appMap[normalizedName]) {
          appMap[normalizedName] = 0;
        }

        appMap[normalizedName] += Number(usage.duration) || 0;
      });

      const apps = Object.entries(appMap)
        .map(([name, duration]) => ({
          name,
          duration,
        }))
        .sort((a, b) => b.duration - a.duration);

      return {
        _id: user._id,

        firstName: user.firstName,

        lastName: user.lastName,

        avatar: getAvatarUrl(user.avatar),

        team: user.team || "Default team",

        name: `${user.firstName} ${user.lastName}`,

        workSeconds,
        breakSeconds,

        workTime: formatTime(workSeconds),
        breakTime: formatTime(breakSeconds),

        apps,
      };
    });

    usageData.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "team": {
          const teamA = typeof a.team === "object" ? (a.team?.name || "") : (a.team || "");
          const teamB = typeof b.team === "object" ? (b.team?.name || "") : (b.team || "");
          comparison = teamA.localeCompare(teamB);
          break;
        }

        case "workTime":
          comparison = a.workSeconds - b.workSeconds;
          break;

        case "breakTime":
          comparison = a.breakSeconds - b.breakSeconds;
          break;

        default:
          comparison = (a.name || "").localeCompare(b.name || "");
      }

      return order === "asc" ? comparison : -comparison;
    });

    return res.json(usageData);
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to fetch usage data", 500);
  }
};

export const getUsageDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const callerOrgId = normalizeId(req.user.organizationId || req.user.organization);
    const targetUserId = normalizeId(userId);

    const allowedUserIds = await getReportUserIds(req.user);

    if (allowedUserIds && allowedUserIds.length === 0) {
      return res.status(403).json({
        message: "Permission denied",
      });
    }

    if (
      allowedUserIds &&
      !allowedUserIds.some((id) => id.toString() === targetUserId.toString())
    ) {
      return res.status(403).json({
        message: "Permission denied",
      });
    }

    const targetUser = await userRepository.findUserByIdAndOrganization(targetUserId, callerOrgId);
    if (!targetUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const { startDate, endDate } = req.query;

    const timezone = resolveUserTimezone(targetUser, req);

    const query = {
      user: targetUserId,
    };

    if (startDate && endDate) {
      const start = getZonedDayRange(startDate, timezone).start;
      const end = getZonedDayRange(endDate, timezone).end;

      query.startTime = {
        $lt: end,
      };
      query.endTime = {
        $gt: start,
      };
    }

    const logs = await UsageLog.find(query).sort({
      startTime: 1,
    });

    const groupedLogs = [];

    for (const log of logs) {
      const plainLog = typeof log.toObject === "function" ? log.toObject() : { ...log };
      const lastLog = groupedLogs[groupedLogs.length - 1];

      if (!lastLog) {
        groupedLogs.push(plainLog);
        continue;
      }

      const sameApp =
        (lastLog.appName || "").trim().toLowerCase() ===
        (plainLog.appName || "").trim().toLowerCase();
      const sameTitle =
        (lastLog.windowTitle || "").trim() ===
        (plainLog.windowTitle || "").trim();
      const gapMs = Math.abs(
        new Date(plainLog.startTime).getTime() -
          new Date(lastLog.endTime).getTime()
      );

      if (sameApp && sameTitle && gapMs <= 60 * 1000) {
        lastLog.endTime = plainLog.endTime;
        lastLog.duration = (Number(lastLog.duration) || 0) + (Number(plainLog.duration) || 0);
      } else {
        groupedLogs.push(plainLog);
      }
    }

    return res.json(groupedLogs.reverse());
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to fetch usage details", 500);
  }
};
