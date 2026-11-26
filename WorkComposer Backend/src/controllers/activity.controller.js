import Session from "../models/session.model.js";
import Screenshot from "../models/screenshot.model.js";
import Activity from "../models/activity.model.js";
import UsageLog from "../models/usageLog.model.js";
import AppClassification from "../models/appClassification.model.js";
import { getReportUserIds } from "../utils/reportAccess.js";
import { userRepository } from "../db/repositories/user.repository.js";
import { projectRepository } from "../db/repositories/project.repository.js";
import { taskRepository } from "../db/repositories/task.repository.js";
import { screenshotRepository } from "../db/repositories/screenshot.repository.js";
import { activityRepository } from "../db/repositories/activity.repository.js";
import { normalizeId } from "../security/effectiveAuthContext.js";
import { isDuplicateKeyError } from "../db/errors.js";
import {
  resolveUserTimezone,
  getZonedDayRange,
  getTodayInTimezone,
  getDateInTimezone,
} from "../utils/timezone.js";

export const getActivity = async (req, res) => {
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

    const timezone = resolveUserTimezone(targetUser, req);
    const { date } = req.query;

    let dateString;
    if (date) {
      if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
        dateString = date.trim();
      } else {
        const parsed = new Date(date);
        if (isNaN(parsed.getTime())) {
          return res.status(400).json({
            message: "Invalid date format",
          });
        }
        dateString = getDateInTimezone(parsed, timezone);
      }
    } else {
      dateString = getTodayInTimezone(timezone);
    }

    const { start, end } = getZonedDayRange(dateString, timezone);

    const screenshots = await screenshotRepository.find(
      {
        userId: targetUserId,
        capturedAt: {
          gte: start,
          lt: end,
        },
      },
      { sort: { capturedAt: "asc" } }
    );

    const rawActivities = await activityRepository.find(
      {
        userId: targetUserId,
        OR: [
          {
            eventTimestamp: {
              gte: start,
              lt: end,
            },
          },
          {
            eventTimestamp: null,
            createdAt: {
              gte: start,
              lt: end,
            },
          },
        ],
      },
      { sort: [{ eventTimestamp: "asc" }, { createdAt: "asc" }] }
    );

    const buckets = {};

    screenshots.forEach((shot) => {
      const dateObj = new Date(shot.capturedAt);

      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        minute: "numeric",
        hourCycle: "h23",
      }).formatToParts(dateObj);

      const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
      const minutePart = parts.find((p) => p.type === "minute")?.value ?? "0";

      const hour = parseInt(hourPart, 10);
      const minute = parseInt(minutePart, 10);
      const bucketMinute = minute < 30 ? "00" : "30";
      const bucketKey = `${hour}:${bucketMinute}`;

      if (!buckets[bucketKey]) {
        buckets[bucketKey] = {
          total: 0,
          count: 0,
          workTime: 0,
          hasScreenshot: true,
        };
      }

      buckets[bucketKey].total += shot.activityScore || 0;
      buckets[bucketKey].count += 1;
      buckets[bucketKey].workTime += 5;
      buckets[bucketKey].hasScreenshot = true;
    });

    const activityEventsByBucket = {};
    rawActivities.forEach((act) => {
      const actTime = act.eventTimestamp || act.telemetry?.firstObservedAt || act.telemetry?.measuredStart || act.createdAt;
      const dateObj = new Date(actTime);
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        minute: "numeric",
        hourCycle: "h23",
      }).formatToParts(dateObj);

      const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
      const minutePart = parts.find((p) => p.type === "minute")?.value ?? "0";

      const hour = parseInt(hourPart, 10);
      const minute = parseInt(minutePart, 10);
      const bucketMinute = minute < 30 ? "00" : "30";
      const bucketKey = `${hour}:${bucketMinute}`;

      if (!activityEventsByBucket[bucketKey]) {
        activityEventsByBucket[bucketKey] = {
          totalActions: 0,
          eventCount: 0,
        };
      }
      const actions = (act.keyPresses || 0) + (act.mouseClicks || 0) + (act.mouseMoves || 0);
      activityEventsByBucket[bucketKey].totalActions += actions;
      activityEventsByBucket[bucketKey].eventCount += 1;
    });

    Object.entries(activityEventsByBucket).forEach(([bucketKey, data]) => {
      if (!buckets[bucketKey]) {
        buckets[bucketKey] = {
          total: 0,
          count: 0,
          workTime: 0,
        };
      }
      if (!buckets[bucketKey].hasScreenshot) {
        const avgActionsPerEvent = data.totalActions / (data.eventCount || 1);
        const score = Math.min(Math.round((avgActionsPerEvent / 30) * 100), 100);
        buckets[bucketKey].total = Math.max(score, data.totalActions > 0 ? 10 : 0);
        buckets[bucketKey].count = 1;
        buckets[bucketKey].workTime = Math.min(Math.max(Math.round((data.eventCount * 10) / 60), 1), 30);
      }
    });

    const activity = [];

    for (let hour = 0; hour < 24; hour++) {
      for (let minute of [0, 30]) {
        const bucketKey = `${hour}:${minute === 0 ? "00" : "30"}`;

        const bucket = buckets[bucketKey];

        let avgScore = 0;

        if (bucket) {
          avgScore = Math.round(bucket.total / bucket.count);
        }

        let color = "#22C55E";

        if (avgScore < 40) {
          color = "#EF4444";
        } else if (avgScore < 70) {
          color = "#F59E0B";
        }

        activity.push({
          time: bucketKey,
          value: avgScore,
          workTime: bucket?.workTime || 0,
          color: "#6366F1",
        });
      }
    }

    const activeBuckets = activity.filter((item) => item.value > 0);

    const averageScore =
      activeBuckets.reduce((sum, item) => sum + item.value, 0) /
      (activeBuckets.length || 1);

    const activityScore = Math.round(averageScore);

    const idleTime = 100 - activityScore;

    return res.json({
      activity,
      activityScore,
      idleTime,
    });
  } catch (err) {
    console.error("GET ACTIVITY ERROR:", err);

    res.status(500).json({
      message: "Failed to get activity",
      error: "Failed to get activity",
    });
  }
};

export const getActivityTimeline = async (req, res) => {
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

    const sessions = await Session.find({
      userId,
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    const timelineMap = {};

    sessions.forEach((session) => {
      const day = session.date;

      if (!timelineMap[day]) {
        timelineMap[day] = {
          workSeconds: 0,
          breakSeconds: 0,
        };
      }

      if (session.type === "break") {
        timelineMap[day].breakSeconds += session.duration || 0;
      } else {
        timelineMap[day].workSeconds += session.duration || 0;
      }
    });

    const formatTime = (seconds) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);

      return `${h}h ${m}m`;
    };

    const timeline = [];

    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      const dateKey = current.toISOString().split("T")[0];

      const dayData = timelineMap[dateKey] || {
        workSeconds: 0,
        breakSeconds: 0,
      };

      timeline.push({
        date: current.toLocaleDateString("en-US", {
          month: "short",
          day: "2-digit",
          year: "numeric",
        }),
        workTime: formatTime(dayData.workSeconds),
        breakTime: formatTime(dayData.breakSeconds),
      });

      current.setDate(current.getDate() + 1);
    }

    return res.json(timeline);
  } catch (err) {
    console.error("GET ACTIVITY TIMELINE ERROR:", err);

    res.status(500).json({
      message: "Failed to get activity timeline",
      error: "Failed to get activity timeline",
    });
  }
};

export const trackActivity = async (req, res) => {
  try {
    const { keyPresses, mouseClicks, mouseMoves, project, task, telemetry, idempotencyKey, eventTimestamp } = req.body;
    const callerOrgId = normalizeId(req.user.organizationId || req.user.organization);
    const callerUserId = normalizeId(req.user._id || req.user.id);

    const rawIdempotencyKey = idempotencyKey || telemetry?.summaryId || telemetry?.idempotencyKey || null;
    let validatedIdempotencyKey = null;
    if (rawIdempotencyKey !== null && rawIdempotencyKey !== undefined) {
      if (typeof rawIdempotencyKey !== "string" || !/^[a-zA-Z0-9_\-:]{1,128}$/.test(rawIdempotencyKey.trim())) {
        return res.status(400).json({
          message: "Invalid idempotencyKey format",
        });
      }
      validatedIdempotencyKey = rawIdempotencyKey.trim();
    }

    const rawEventTime = eventTimestamp || telemetry?.firstObservedAt || telemetry?.measuredStart || null;
    let validatedEventTimestamp = null;
    if (rawEventTime !== null && rawEventTime !== undefined) {
      if (typeof rawEventTime !== "string" && typeof rawEventTime !== "number" && !(rawEventTime instanceof Date)) {
        return res.status(400).json({
          message: "Invalid eventTimestamp format",
        });
      }
      const parsed = new Date(rawEventTime);
      const timeMs = parsed.getTime();
      if (isNaN(timeMs)) {
        return res.status(400).json({
          message: "Invalid eventTimestamp format",
        });
      }
      const minPlausible = new Date("2020-01-01T00:00:00.000Z").getTime();
      if (timeMs < minPlausible) {
        return res.status(400).json({
          message: "eventTimestamp is out of plausible range",
        });
      }
      const maxFuture = Date.now() + 10 * 60 * 1000; // 10 minutes clock drift tolerance
      if (timeMs > maxFuture) {
        return res.status(400).json({
          message: "eventTimestamp cannot be in the future",
        });
      }
      validatedEventTimestamp = parsed;
    }

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

    let validatedTelemetry = null;
    if (telemetry && typeof telemetry === "object") {
      validatedTelemetry = {
        summaryId: validatedIdempotencyKey || (typeof telemetry.summaryId === "string" ? telemetry.summaryId : null),
        measuredStart: typeof telemetry.measuredStart === "string" ? telemetry.measuredStart : null,
        measuredEnd: typeof telemetry.measuredEnd === "string" ? telemetry.measuredEnd : null,
        firstObservedAt: typeof telemetry.firstObservedAt === "string" ? telemetry.firstObservedAt : null,
        lastObservedAt: typeof telemetry.lastObservedAt === "string" ? telemetry.lastObservedAt : null,
        totalEvents: typeof telemetry.totalEvents === "number" ? Math.max(0, telemetry.totalEvents) : 0,
        naturalGapsCount: typeof telemetry.naturalGapsCount === "number" ? Math.max(0, telemetry.naturalGapsCount) : 0,
        longestGapMs: typeof telemetry.longestGapMs === "number" ? Math.max(0, telemetry.longestGapMs) : 0,
        continuousDurationMs: typeof telemetry.continuousDurationMs === "number" ? Math.max(0, telemetry.continuousDurationMs) : 0,
        completeness: typeof telemetry.completeness === "string" ? telemetry.completeness : "unknown",
        sessionId: telemetry.sessionId ? normalizeId(telemetry.sessionId) : null,
        deviceId: telemetry.deviceId ? String(telemetry.deviceId).slice(0, 100) : null,
      };
    }

    // 1. Idempotency Check: if key provided, check for existing record before insert
    if (validatedIdempotencyKey) {
      const existing = await activityRepository.findOne({ idempotencyKey: validatedIdempotencyKey });
      if (existing) {
        const existingOwnerId = normalizeId(existing.user || existing.userId);
        if (existingOwnerId !== callerUserId) {
          return res.status(403).json({
            message: "Permission denied: idempotencyKey belongs to another user",
          });
        }
        const responsePayload = {
          success: true,
          activity: existing,
          duplicate: true,
        };
        if (validatedTelemetry) {
          responsePayload.telemetry = validatedTelemetry;
        }
        return res.status(200).json(responsePayload);
      }
    }

    const date = (validatedEventTimestamp || new Date()).toISOString().split("T")[0];

    let activity;
    try {
      activity = await Activity.create({
        user: callerUserId,
        project: resolvedProjectId || null,
        task: resolvedTaskId || null,
        date,
        keyPresses: Number(keyPresses || 0),
        mouseClicks: Number(mouseClicks || 0),
        mouseMoves: Number(mouseMoves || 0),
        idempotencyKey: validatedIdempotencyKey || null,
        eventTimestamp: validatedEventTimestamp || undefined,
        telemetry: validatedTelemetry || undefined,
      });
    } catch (createErr) {
      // 2. Handle simultaneous race condition: catch unique constraint error
      if (validatedIdempotencyKey && isDuplicateKeyError(createErr)) {
        const existing = await activityRepository.findOne({ idempotencyKey: validatedIdempotencyKey });
        if (existing) {
          const existingOwnerId = normalizeId(existing.user || existing.userId);
          if (existingOwnerId !== callerUserId) {
            return res.status(403).json({
              message: "Permission denied: idempotencyKey belongs to another user",
            });
          }
          const responsePayload = {
            success: true,
            activity: existing,
            duplicate: true,
          };
          if (validatedTelemetry) {
            responsePayload.telemetry = validatedTelemetry;
          }
          return res.status(200).json(responsePayload);
        }
      }
      throw createErr;
    }

    const responsePayload = {
      success: true,
      activity,
    };
    if (validatedTelemetry) {
      responsePayload.telemetry = validatedTelemetry;
    }

    res.json(responsePayload);
  } catch (err) {
    console.error("TRACK ACTIVITY ERROR:", err);

    res.status(500).json({
      message: "Failed to track activity",
      error: "Failed to track activity",
    });
  }
};

export const getSessionDetails = async (req, res) => {
  try {
    const { userId, startTime, endTime } = req.query;

    if (!userId || !startTime || !endTime) {
      return res.status(400).json({
        message: "Missing required params",
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      return res.status(400).json({
        message: "Invalid time range",
      });
    }

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

    const durationSeconds = Math.max(0, Math.floor((end - start) / 1000));
    const hours = Math.floor(durationSeconds / 3600);
    const minutes = Math.floor((durationSeconds % 3600) / 60);
    const workTime = `${hours}h ${minutes}m`;

    const activitiesInRange = await activityRepository.find(
      {
        user: targetUserId,
        OR: [
          {
            eventTimestamp: {
              gte: start,
              lte: end,
            },
          },
          {
            eventTimestamp: null,
            createdAt: {
              gte: start,
              lte: end,
            },
          },
        ],
      },
      { sort: [{ eventTimestamp: "asc" }, { createdAt: "asc" }] }
    );

    const screenshots = await screenshotRepository.find(
      {
        userId: targetUserId,
        capturedAt: {
          gte: start,
          lte: end,
        },
      },
      { sort: { capturedAt: "asc" } }
    );

    const usageLogs = await UsageLog.find({
      user: targetUserId,
      startTime: {
        $lt: end,
      },
      endTime: {
        $gt: start,
      },
    });

    const classifications = await AppClassification.find({
      organization: req.user.organization,
    });

    const classificationMap = {};

    classifications.forEach((item) => {
      classificationMap[item.appName] = item.productivity;
    });

    let productiveSeconds = 0;
    let neutralSeconds = 0;
    let unproductiveSeconds = 0;

    for (const log of usageLogs) {
      const overlapStart = new Date(Math.max(new Date(log.startTime), start));

      const overlapEnd = new Date(Math.min(new Date(log.endTime), end));

      const overlapSeconds = Math.max(
        0,
        Math.floor((overlapEnd - overlapStart) / 1000),
      );

      const productivity = classificationMap[log.appName] || "neutral";

      if (productivity === "productive") {
        productiveSeconds += overlapSeconds;
      } else if (productivity === "unproductive") {
        unproductiveSeconds += overlapSeconds;
      } else {
        neutralSeconds += overlapSeconds;
      }
    }

    const totalTracked =
      productiveSeconds + neutralSeconds + unproductiveSeconds;

    const productivePercent =
      totalTracked > 0
        ? Math.round((productiveSeconds / totalTracked) * 100)
        : 0;

    const neutralPercent =
      totalTracked > 0 ? Math.round((neutralSeconds / totalTracked) * 100) : 0;

    const unproductivePercent =
      totalTracked > 0
        ? Math.round((unproductiveSeconds / totalTracked) * 100)
        : 0;

    const totalActions = activitiesInRange.reduce(
      (sum, activity) =>
        sum +
        (activity.keyPresses || 0) +
        (activity.mouseClicks || 0) +
        (activity.mouseMoves || 0),
      0,
    );

    const averageActions =
      activitiesInRange.length > 0
        ? totalActions / activitiesInRange.length
        : 0;

    const activityScore = Math.min(
      Math.round((averageActions / 50) * 100),
      100,
    );

    const idleTime = 100 - activityScore;

    const grouped = {};

    activitiesInRange.forEach((activity) => {
      const actTime = activity.eventTimestamp || activity.telemetry?.firstObservedAt || activity.telemetry?.measuredStart || activity.createdAt;
      const date = new Date(actTime);

      const time = `${String(date.getHours()).padStart(2, "0")}:${String(
        date.getMinutes(),
      ).padStart(2, "0")}`;

      const actions =
        (activity.keyPresses || 0) +
        (activity.mouseClicks || 0) +
        (activity.mouseMoves || 0);

      const score = Math.min(Math.round((actions / 50) * 100), 100);

      if (!grouped[time]) {
        grouped[time] = {
          total: 0,
          count: 0,
        };
      }

      grouped[time].total += score;
      grouped[time].count += 1;
    });

    const chartData = [];

    const current = new Date(start);
    const maxBuckets = 1440;
    let bucketCount = 0;

    while (current <= end && bucketCount < maxBuckets) {
      const key = `${String(current.getHours()).padStart(2, "0")}:${String(
        current.getMinutes(),
      ).padStart(2, "0")}`;

      const bucket = grouped[key];

      chartData.push({
        time: key,
        value: bucket ? Math.round(bucket.total / bucket.count) : 0,
      });

      current.setMinutes(current.getMinutes() + 1);
      bucketCount++;
    }

    return res.json({
      success: true,

      activityScore,

      idleTime,

      productivePercent,
      neutralPercent,
      unproductivePercent,

      chartData,

      screenshots,

      startTime,
      endTime,
      workTime,
    });
  } catch (err) {
    console.error("GET SESSION DETAILS ERROR:", err);

    res.status(500).json({
      message: "Failed to get session details",
      error: "Failed to get session details",
    });
  }
};
