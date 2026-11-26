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

    const timezone = resolveUserTimezone(targetUser, req);

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
      { sort: { capturedAt: "desc" } }
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

    const classifications = callerOrgId
      ? await AppClassification.find({
          organization: callerOrgId,
        })
      : [];

    const classificationMap = {};

    classifications.forEach((item) => {
      const key = item.appName?.trim().toLowerCase();
      if (key) {
        classificationMap[key] = item;
      }
    });

    const targetUserTeamId = normalizeId(
      targetUser.team?._id || targetUser.team?.id || targetUser.team
    );

    let productiveMs = 0;
    let neutralMs = 0;
    let unproductiveMs = 0;

    for (const log of usageLogs) {
      const appKey = log.appName?.trim().toLowerCase();
      const classification = appKey ? classificationMap[appKey] : null;
      const productivity = classification?.productivity || "neutral";

      if (productivity === "blacklisted") {
        continue;
      }

      if (classification) {
        const excludedUsers = (classification.excludedUsers || [])
          .map((id) => normalizeId(id))
          .filter(Boolean);
        if (excludedUsers.includes(targetUserId)) {
          continue;
        }

        const excludedTeams = (classification.excludedTeams || [])
          .map((id) => normalizeId(id))
          .filter(Boolean);
        if (targetUserTeamId && excludedTeams.includes(targetUserTeamId)) {
          continue;
        }
      }

      const logStartMs = new Date(log.startTime).getTime();
      const logEndMs = new Date(log.endTime).getTime();
      if (isNaN(logStartMs) || isNaN(logEndMs)) {
        continue;
      }

      const overlapStartMs = Math.max(logStartMs, start.getTime());
      const overlapEndMs = Math.min(logEndMs, end.getTime());
      const overlapMs = Math.max(0, overlapEndMs - overlapStartMs);

      if (overlapMs <= 0) {
        continue;
      }

      if (productivity === "productive") {
        productiveMs += overlapMs;
      } else if (productivity === "unproductive") {
        unproductiveMs += overlapMs;
      } else {
        neutralMs += overlapMs;
      }
    }

    const totalTrackedMs = productiveMs + neutralMs + unproductiveMs;

    let productivePercent = 0;
    let neutralPercent = 0;
    let unproductivePercent = 0;

    if (totalTrackedMs > 0) {
      const percentEntries = [
        { key: "productive", raw: (productiveMs / totalTrackedMs) * 100 },
        { key: "neutral", raw: (neutralMs / totalTrackedMs) * 100 },
        { key: "unproductive", raw: (unproductiveMs / totalTrackedMs) * 100 },
      ].map((entry) => ({
        ...entry,
        floor: Math.floor(entry.raw),
        remainder: entry.raw - Math.floor(entry.raw),
      }));

      let remainingPercent =
        100 - percentEntries.reduce((sum, entry) => sum + entry.floor, 0);
      const sortedByRemainder = [...percentEntries].sort(
        (a, b) => b.remainder - a.remainder
      );

      for (const entry of sortedByRemainder) {
        if (remainingPercent <= 0) break;
        entry.floor += 1;
        remainingPercent -= 1;
      }

      productivePercent = percentEntries[0].floor;
      neutralPercent = percentEntries[1].floor;
      unproductivePercent = percentEntries[2].floor;
    }

    const startMs = start.getTime();
    const endMs = end.getTime();

    const bucketMs = 60 * 1000;
    const anchorMs = Math.floor(startMs / bucketMs) * bucketMs;
    const maxBuckets = 1440;
    const rawLastIdx = Math.max(0, Math.floor((endMs - anchorMs) / bucketMs));
    const numBuckets = Math.max(1, Math.min(rawLastIdx + 1, maxBuckets));

    const buckets = Array.from({ length: numBuckets }, () => ({
      shotSum: 0,
      shotCount: 0,
      attributedShotSum: 0,
      attributedShotCount: 0,
      totalActions: 0,
      eventCount: 0,
    }));

    const shotsAsc = [...screenshots]
      .filter((shot) => shot?.capturedAt && !isNaN(new Date(shot.capturedAt).getTime()))
      .sort(
        (a, b) =>
          new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
      );

    const MAX_SHOT_INTERVAL_MS = 15 * 60 * 1000;

    shotsAsc.forEach((shot, i) => {
      const shotMs = new Date(shot.capturedAt).getTime();
      const idx = Math.floor((shotMs - anchorMs) / bucketMs);
      const score = Math.min(100, Math.max(0, Number(shot.activityScore) || 0));

      if (idx >= 0 && idx < numBuckets) {
        buckets[idx].shotSum += score;
        buckets[idx].shotCount += 1;
      }

      const prevShotMs =
        i === 0 ? startMs : new Date(shotsAsc[i - 1].capturedAt).getTime();
      const intervalStartMs = Math.max(
        startMs,
        prevShotMs,
        shotMs - MAX_SHOT_INTERVAL_MS
      );
      const intervalEndMs = Math.min(endMs, shotMs);

      if (intervalEndMs >= intervalStartMs) {
        const startIdx = Math.max(
          0,
          Math.floor((intervalStartMs - anchorMs) / bucketMs)
        );
        const endIdx = Math.min(
          numBuckets - 1,
          Math.floor((intervalEndMs - anchorMs) / bucketMs)
        );
        for (let bIdx = startIdx; bIdx <= endIdx; bIdx++) {
          buckets[bIdx].attributedShotSum += score;
          buckets[bIdx].attributedShotCount += 1;
        }
      }
    });

    activitiesInRange.forEach((activity) => {
      const actTime =
        activity.eventTimestamp ||
        activity.telemetry?.firstObservedAt ||
        activity.telemetry?.measuredStart ||
        activity.createdAt;
      if (!actTime) return;
      const actMs = new Date(actTime).getTime();
      if (isNaN(actMs)) return;
      const idx = Math.floor((actMs - anchorMs) / bucketMs);
      if (idx < 0 || idx >= numBuckets) return;
      const actions =
        (activity.keyPresses || 0) +
        (activity.mouseClicks || 0) +
        (activity.mouseMoves || 0);
      buckets[idx].totalActions += actions;
      buckets[idx].eventCount += 1;
    });

    const formatBucketLabel = (bucketStartMs) => {
      const dateObj = new Date(bucketStartMs);
      return new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(dateObj);
    };

    const evaluatedBuckets = buckets.map((bucket, idx) => {
      const bucketStartMs = anchorMs + idx * bucketMs;
      let value = 0;

      if (bucket.shotCount > 0) {
        value = Math.min(
          100,
          Math.max(0, Math.round(bucket.shotSum / bucket.shotCount))
        );
      } else if (bucket.eventCount > 0) {
        value =
          bucket.totalActions > 0
            ? Math.min(100, Math.round((bucket.totalActions / 50) * 100))
            : 0;
      } else if (bucket.attributedShotCount > 0) {
        value = Math.min(
          100,
          Math.max(
            0,
            Math.round(bucket.attributedShotSum / bucket.attributedShotCount)
          )
        );
      }

      return {
        time: formatBucketLabel(bucketStartMs),
        timestamp: new Date(bucketStartMs).toISOString(),
        value,
        totalActions: bucket.totalActions,
      };
    });

    let activityScore = 0;
    if (screenshots.length > 0) {
      const totalShotScore = screenshots.reduce(
        (sum, shot) => sum + Math.min(100, Math.max(0, Number(shot.activityScore) || 0)),
        0
      );
      activityScore = Math.min(
        100,
        Math.max(0, Math.round(totalShotScore / screenshots.length))
      );
    } else {
      const activeBuckets = evaluatedBuckets.filter(
        (b) => b.value > 0 || b.totalActions > 0
      );
      activityScore =
        activeBuckets.length > 0
          ? Math.min(
              100,
              Math.max(
                0,
                Math.round(
                  activeBuckets.reduce((sum, b) => sum + b.value, 0) /
                    activeBuckets.length
                )
              )
            )
          : 0;
    }

    const idleTime = Math.max(0, Math.min(100, 100 - activityScore));

    const chartData = evaluatedBuckets.map(({ time, timestamp, value }) => ({
      time,
      timestamp,
      value,
    }));

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
      timezone,
    });
  } catch (err) {
    console.error("GET SESSION DETAILS ERROR:", err);

    res.status(500).json({
      message: "Failed to get session details",
      error: "Failed to get session details",
    });
  }
};
