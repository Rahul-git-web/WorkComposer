import AppUsage from "../models/appUsage.model.js";
import User from "../models/user.model.js";
import Session from "../models/session.model.js";
import UsageLog from "../models/usageLog.model.js";
import AppClassification from "../models/appClassification.model.js";
import { getAvatarUrl } from "../utils/avatar.js";
import { getReportUserIds } from "../utils/reportAccess.js";
import {
  getUserTimezone,
  getDateRangeUTC,
  getTodayInTimezone,
} from "../utils/timezone.js";
import { sendErrorResponse } from "../utils/sendErrorResponse.js";
import { userRepository } from "../db/repositories/user.repository.js";
import { projectRepository } from "../db/repositories/project.repository.js";
import { taskRepository } from "../db/repositories/task.repository.js";
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

    const classification = await AppClassification.findOne({
      organization: req.user.organization,
      appName: normalizedAppName,
    });

    if (classification?.productivity === "blacklisted") {
      return res.json({
        success: true,
        skipped: true,
        reason: "blacklisted",
      });
    }

    if (classification) {
      const excludedUsers = (classification.excludedUsers || []).map((id) =>
        id.toString(),
      );

      if (excludedUsers.includes(req.user._id.toString())) {
        return res.json({
          success: true,
          skipped: true,
          reason: "excluded_user",
        });
      }

      const excludedTeams = (classification.excludedTeams || []).map((id) =>
        id.toString(),
      );

      if (req.user.team && excludedTeams.includes(req.user.team.toString())) {
        return res.json({
          success: true,
          skipped: true,
          reason: "excluded_team",
        });
      }
    }

    if (!normalizedAppName) {
      return res.status(400).json({
        message: "Application name is required",
      });
    }

    const user = await User.findById(req.user._id).select("reportTimezone");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const timezone = getUserTimezone(user);

    const date = getTodayInTimezone(timezone);

    const startTime = new Date();

    const endTime = new Date(startTime.getTime() + duration * 1000);

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
      usage.duration += duration;
      usage.windowTitle = windowTitle;

      await usage.save();
    } else {
      usage = await AppUsage.create({
        user: callerUserId,
        appName: normalizedAppName,
        windowTitle,
        duration,
        date,
      });
    }

    await UsageLog.create({
      user: callerUserId,

      project: resolvedProjectId || null,
      task: resolvedTaskId || null,

      appName,

      windowTitle,

      startTime,

      endTime,

      duration,

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
        const tz = getUserTimezone(user);
        const { start, end } = getDateRangeUTC(startDate, endDate, tz);
        userRanges.set(uid, { start, end });
        if (!globalMinStart || start < globalMinStart) globalMinStart = start;
        if (!globalMaxEnd || end > globalMaxEnd) globalMaxEnd = end;
      }
    }

    // 1. Bulk Sessions Query (replaces N per-user queries with 1 bulk query)
    let bulkSessions = [];
    if (userIds.length > 0) {
      const sessionQuery = {
        userId: { in: userIds },
      };
      if (globalMinStart && globalMaxEnd) {
        sessionQuery.startTime = {
          $gte: globalMinStart,
          $lte: globalMaxEnd,
        };
      }
      bulkSessions = await Session.find(sessionQuery);
    }

    const sessionsByUser = new Map();
    for (const s of bulkSessions) {
      const uid = normalizeId(s.userId || s.user);
      if (!sessionsByUser.has(uid)) sessionsByUser.set(uid, []);
      sessionsByUser.get(uid).push(s);
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

    const usageData = users.map((user) => {
      const userId = normalizeId(user._id || user.id);
      const range = userRanges.get(userId);

      const userAllSessions = sessionsByUser.get(userId) || [];
      let sessions = userAllSessions;
      if (range) {
        sessions = userAllSessions.filter((s) => {
          const st = new Date(s.startTime);
          return st >= range.start && st <= range.end;
        });
      }

      const workSeconds = sessions
        .filter((s) => s.type === "work")
        .reduce((sum, s) => sum + (s.duration || 0), 0);

      const breakSeconds = sessions
        .filter((s) => s.type === "break")
        .reduce((sum, s) => sum + (s.duration || 0), 0);

      const usages = usagesByUser.get(userId) || [];
      const appMap = {};

      usages.forEach((usage) => {
        if (!appMap[usage.appName]) {
          appMap[usage.appName] = 0;
        }

        appMap[usage.appName] += usage.duration;
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

    const timezone = getUserTimezone(targetUser);

    const query = {
      user: targetUserId,
    };

    if (startDate && endDate) {
      const { start, end } = getDateRangeUTC(startDate, endDate, timezone);

      query.startTime = {
        $gte: start,
        $lte: end,
      };
    }

    const logs = await UsageLog.find(query).sort({
      startTime: 1,
    });

    const groupedLogs = [];

    for (const log of logs) {
      const lastLog = groupedLogs[groupedLogs.length - 1];

      if (!lastLog) {
        groupedLogs.push({
          ...log.toObject(),
        });

        continue;
      }

      if (
        lastLog.appName === log.appName &&
        lastLog.windowTitle === log.windowTitle
      ) {
        lastLog.endTime = log.endTime;

        lastLog.duration += log.duration;
      } else {
        groupedLogs.push({
          ...log.toObject(),
        });
      }
    }

    return res.json(groupedLogs.reverse());
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to fetch usage details", 500);
  }
};
