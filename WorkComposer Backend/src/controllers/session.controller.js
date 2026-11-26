import {
  sessionRepository,
  taskRepository,
  projectTrackingRepository,
  activityRepository,
  screenshotRepository,
  timerRepository,
} from "../db/repositories/index.js";
import User from "../models/user.model.js";
import Screenshot from "../models/screenshot.model.js";
import Task from "../models/task.model.js";
import ProjectTracking from "../models/projectTracking.model.js";
import Activity from "../models/activity.model.js";
import { getAvatarUrl } from "../utils/avatar.js";
import { checkSessionOverlap } from "../utils/session.js";
import { auditSessionsPurged } from "../utils/auditService.js";
import {
  getUserTimezone,
  getDateRangeUTC,
  getTodayInTimezone,
  resolveUserTimezone,
  getDateInTimezone,
  getZonedDayRange,
  getZonedDateTime,
  calculateIntervalOverlap,
  isValidTimezone,
  normalizeTimezone,
} from "../utils/timezone.js";
import { getReportUserIds } from "../utils/reportAccess.js";
import Report from "../models/report.model.js";
import { generateTimeTrackingCSV } from "../services/reportExport.service.js";
import { runTransaction } from "../db/transaction.js";
import { normalizeId } from "../security/effectiveAuthContext.js";

const updateSessionScreenshotCount = async (session) => {
  const count = await Screenshot.countDocuments({
    userId: session.userId,
    capturedAt: {
      $gte: session.startTime,
      $lte: session.endTime,
    },
  });

  session.screenshots = count;

  await session.save();
};

const mergeSessionIntervals = (sessions) => {
  if (!sessions.length) return [];

  const intervals = sessions
    .filter((session) => session.startTime && session.endTime)
    .map((session) => ({
      start: new Date(session.startTime),
      end: new Date(session.endTime),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);

  if (!intervals.length) return [];

  const merged = [intervals[0]];

  for (let i = 1; i < intervals.length; i++) {
    const current = intervals[i];
    const previous = merged[merged.length - 1];

    if (current.start <= previous.end) {
      if (current.end > previous.end) {
        previous.end = current.end;
      }
    } else {
      merged.push(current);
    }
  }

  return merged;
};

//Create Session
export const createSession = async (req, res) => {
  try {
    const { startTime, endTime, duration, type } = req.body;

    if (!startTime || !endTime || !duration) {
      return res.status(400).json({
        message: "Missing required fields",
      });
    }

    const userId = req.user._id || req.user.id;
    const existingSession = await checkSessionOverlap(
      userId,
      startTime,
      endTime,
    );

    if (existingSession) {
      return res.status(400).json({
        message: "Time range overlaps with existing session",
      });
    }

    const timezone = resolveUserTimezone(req.user, req);
    const sessionDate = getDateInTimezone(startTime, timezone);

    const session = await sessionRepository.create({
      userId,
      startTime,
      endTime,
      duration,
      type,
      date: sessionDate,
    });

    res.status(201).json(session);
  } catch (err) {
    console.error("CREATE ERROR:", err);
    res.status(500).json({ message: "Failed to create session", error: "Failed to create session" });
  }
};

//Get Sessions By Date
export const getSessions = async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;
    const userId = req.user._id || req.user.id;

    let sessions;
    if (startDate && endDate) {
      const timezone = resolveUserTimezone(req.user, req);
      const startRange = getZonedDayRange(startDate, timezone);
      const endRange = getZonedDayRange(endDate, timezone);
      sessions = await sessionRepository.findOverlappingSessions({
        userId,
        periodStart: startRange.start,
        periodEnd: endRange.end,
      });
    } else if (date) {
      sessions = await sessionRepository.find({
        userId,
        date,
      });
    } else {
      sessions = await sessionRepository.find({
        userId,
      });
    }

    res.status(200).json(sessions);
  } catch (err) {
    console.error("GET SESSIONS ERROR:", err);
    res.status(500).json({
      message: "Failed to fetch sessions",
      error: "Failed to fetch sessions",
    });
  }
};

// DELETE SESSIONS IN RANGE
export const deleteSessionsInRange = async (req, res) => {
  try {
    if (req.user.role !== "owner" && req.user.role !== "admin") {
      return res.status(403).json({
        error: "You don't have permission to remove tracked time.",
      });
    }

    const { startTime, endTime } = req.body;

    const start = new Date(startTime);
    const end = new Date(endTime);

    //  Validation
    if (!startTime || !endTime) {
      return res.status(400).json({ error: "Start and End time required" });
    }

    if (isNaN(start) || isNaN(end)) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    if (start >= end) {
      return res.status(400).json({ error: "Invalid time range" });
    }

    const txResult = await runTransaction(async (tx) => {
      // Find ALL overlapping sessions
      const sessions = await sessionRepository.findOverlappingSessions({
        userId: req.user._id || req.user.id,
        periodStart: start,
        periodEnd: end,
      });

      const timezone = resolveUserTimezone(req.user, req);
      const reportRows = sessions.map((session) => ({
        employee: `${req.user.firstName} ${req.user.lastName}`,
        date:
          session.date || (session.startTime ? getDateInTimezone(session.startTime, timezone) : ""),
        startTime: new Date(session.startTime).toLocaleTimeString("en-US", {
          timeZone: timezone,
          hour: "2-digit",
          minute: "2-digit",
        }),
        endTime: new Date(session.endTime).toLocaleTimeString("en-US", {
          timeZone: timezone,
          hour: "2-digit",
          minute: "2-digit",
        }),
        duration: `${Math.floor((session.duration || 0) / 3600)}h ${Math.floor(
          ((session.duration || 0) % 3600) / 60,
        )}m`,
        type: session.type,
        project: "",
        task: "",
        reason: "Removed tracked time",
      }));

      let workTime = 0;
      let breakTime = 0;
      let deletedCount = 0;
      let modifiedCount = 0;
      let screenshots = 0;

      for (const s of sessions) {
        const sStart = new Date(s.startTime);
        const sEnd = new Date(s.endTime);

        // Overlap calculation
        const overlapStart = new Date(Math.max(sStart, start));
        const overlapEnd = new Date(Math.min(sEnd, end));

        const overlapSeconds = Math.max(
          0,
          Math.floor((overlapEnd - overlapStart) / 1000),
        );

        if (s.type === "work") workTime += overlapSeconds;
        if (s.type === "break") breakTime += overlapSeconds;

        screenshots += s.screenshots || 0;

        // -----------------------------
        // CASE 1: Fully inside → delete
        // -----------------------------
        if (sStart >= start && sEnd <= end) {
          await sessionRepository.deleteOne({ _id: s._id || s.id });
          deletedCount++;
        }

        // -----------------------------
        // CASE 2: Cut right side
        // -----------------------------
        else if (sStart < start && sEnd > start && sEnd <= end) {
          s.endTime = start;
          s.duration = Math.floor((start - sStart) / 1000);

          await sessionRepository.findByIdAndUpdate(s._id || s.id, {
            endTime: start,
            duration: s.duration,
          });

          await updateSessionScreenshotCount(s);

          modifiedCount++;
        }

        // -----------------------------
        // CASE 3: Cut left side
        // -----------------------------
        else if (sStart >= start && sStart < end && sEnd > end) {
          s.startTime = end;
          s.duration = Math.floor((sEnd - end) / 1000);

          await sessionRepository.findByIdAndUpdate(s._id || s.id, {
            startTime: end,
            duration: s.duration,
          });

          await updateSessionScreenshotCount(s);

          modifiedCount++;
        }

        // -----------------------------
        // CASE 4: Split into two
        // -----------------------------
        else if (sStart < start && sEnd > end) {
          const firstPart = {
            userId: s.userId,
            startTime: sStart,
            endTime: start,
            duration: Math.floor((start - sStart) / 1000),
            type: s.type,
            team: s.team,
            source: s.source,
            date: getDateInTimezone(sStart, timezone),
          };

          const secondPart = {
            userId: s.userId,
            startTime: end,
            endTime: sEnd,
            duration: Math.floor((sEnd - end) / 1000),
            type: s.type,
            team: s.team,
            source: s.source,
            date: getDateInTimezone(end, timezone),
          };

          await sessionRepository.deleteOne({ _id: s._id || s.id });

          const newFirstSession = await sessionRepository.create(firstPart);
          const newSecondSession = await sessionRepository.create(secondPart);

          await updateSessionScreenshotCount(newFirstSession);
          await updateSessionScreenshotCount(newSecondSession);

          deletedCount++;
        }
      }

      await Screenshot.deleteMany({
        user: req.user._id,
        capturedAt: {
          $gte: start,
          $lte: end,
        },
      });

      const report = await Report.create([
        {
          user: req.user._id,
          type: "removed-time",
          status: "processing",
          startDate: start.toISOString().split("T")[0],
          endDate: end.toISOString().split("T")[0],
        },
      ]);

      const createdReport = Array.isArray(report) ? report[0] : report;

      return {
        reportId: createdReport?._id || createdReport?.id,
        reportRows,
        deletedCount,
        modifiedCount,
        workTime,
        breakTime,
        screenshots,
      };
    });

    // POST-COMMIT EXTERNAL SIDE EFFECTS:
    // Generate CSV export and update report outside and after transaction commit
    let fileUrl = "";
    if (txResult.reportId) {
      try {
        const generatedReport = await generateTimeTrackingCSV(
          txResult.reportId,
          txResult.reportRows,
          "removed-time",
        );
        fileUrl = generatedReport?.fileUrl || "";

        await Report.findByIdAndUpdate(txResult.reportId, {
          status: "done",
          fileUrl,
          generatedAt: new Date(),
        });
      } catch (exportErr) {
        console.error("GENERATE CSV ERROR POST-COMMIT:", exportErr);
        await Report.findByIdAndUpdate(txResult.reportId, {
          status: "failed",
        }).catch(() => {});
      }
    }

    return res.json({
      message: "Deleted successfully",
      deletedCount: txResult.deletedCount,
      modifiedCount: txResult.modifiedCount,
      workTime: txResult.workTime,
      breakTime: txResult.breakTime,
      screenshots: txResult.screenshots,
      report: {
        type: "removed-time",
        fileUrl,
        reportId: txResult.reportId,
      },
    });
  } catch (err) {
    console.error("DELETE SESSIONS IN RANGE ERROR:", err);
    return res.status(500).json({
      message: "Failed to delete sessions in range",
      error: "Failed to delete sessions in range",
    });
  }
};

// PREVIEW SESSIONS IN RANGE
export const previewSessionsInRange = async (req, res) => {
  try {
    const { startTime, endTime } = req.query;

    // Validation
    if (!startTime || !endTime) {
      return res.status(400).json({
        error: "Start time and end time are required",
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start) || isNaN(end)) {
      return res.status(400).json({
        error: "Invalid date format",
      });
    }

    if (start >= end) {
      return res.status(400).json({
        error: "Start time must be before end time",
      });
    }

    // Same logic as delete (IMPORTANT)
    const sessions = await sessionRepository.findOverlappingSessions({
      userId: req.user._id || req.user.id,
      periodStart: start,
      periodEnd: end,
    });

    let workTime = 0;
    let breakTime = 0;
    let screenshots = 0;

    sessions.forEach((s) => {
      const sStart = new Date(s.startTime);
      const sEnd = new Date(s.endTime);

      const overlapStart = new Date(Math.max(sStart, start));
      const overlapEnd = new Date(Math.min(sEnd, end));

      const overlapSeconds = Math.max(
        0,
        Math.floor((overlapEnd - overlapStart) / 1000),
      );

      if (s.type === "work") workTime += overlapSeconds;
      if (s.type === "break") breakTime += overlapSeconds;

      screenshots += s.screenshots || 0;
    });

    return res.status(200).json({
      workTime,
      breakTime,
      screenshots,
      sessionsCount: sessions.length,
    });
  } catch (err) {
    console.error("PREVIEW SESSIONS IN RANGE ERROR:", err);
    return res.status(500).json({
      message: "Failed to preview sessions in range",
      error: "Failed to preview sessions in range",
    });
  }
};

const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return "00:00";
  const h = String(Math.floor(seconds / 3600)).padStart(2, "0");

  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");

  return `${h}:${m}`;
};

const calculateMergedDuration = (sessions) => {
  if (!sessions || !sessions.length) return 0;

  const intervals = sessions
    .filter((s) => s.startTime)
    .map((s) => {
      const start = new Date(s.startTime).getTime();
      const end = s.endTime ? new Date(s.endTime).getTime() : Date.now();
      return { start, end: Math.max(start, end) };
    })
    .filter((interval) => !isNaN(interval.start) && !isNaN(interval.end))
    .sort((a, b) => a.start - b.start);

  if (!intervals.length) return 0;

  const merged = [];

  let current = intervals[0];

  for (let i = 1; i < intervals.length; i++) {
    const next = intervals[i];

    if (next.start <= current.end) {
      current.end = Math.max(current.end, next.end);
    } else {
      merged.push(current);
      current = next;
    }
  }

  merged.push(current);

  return merged.reduce(
    (total, interval) =>
      total + Math.floor((interval.end - interval.start) / 1000),
    0,
  );
};

const shiftCalendarDate = (dateStr, deltaDays) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().split("T")[0];
};

const enumerateCalendarDates = (startDateStr, endDateStr, maxDays = 366) => {
  const dates = [];
  let cur = startDateStr;
  while (cur <= endDateStr && dates.length < maxDays) {
    dates.push(cur);
    cur = shiftCalendarDate(cur, 1);
  }
  return dates;
};

const formatShortDayLabel = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(dt);
};

/**
 * Computes canonical 30-minute bucketed activity telemetry for a user across [rangeStart, rangeEnd),
 * preserving screenshot precedence per bucket with actions/30 fallback.
 * Returns null score when no telemetry exists in the window.
 */
const computeRangeActivitySummary = ({
  screenshots,
  activities,
  sessions,
  timezone,
  startDate,
  endDate,
  rangeStart,
  rangeEnd,
  evalNow,
  includeTrend = false,
}) => {
  const periodShots = screenshots.filter((shot) => {
    if (!shot.capturedAt) return false;
    const d = new Date(shot.capturedAt);
    return !isNaN(d.getTime()) && d >= rangeStart && d < rangeEnd;
  });

  const periodActs = activities.filter((act) => {
    const t =
      act.eventTimestamp ||
      act.telemetry?.firstObservedAt ||
      act.telemetry?.measuredStart ||
      act.createdAt;
    if (!t) return false;
    const d = new Date(t);
    return !isNaN(d.getTime()) && d >= rangeStart && d < rangeEnd;
  });

  // Key buckets by `${dateStr}|${halfHourKey}` so multi-day periods never merge distinct days
  const bucketMap = new Map();
  const actEventsByBucket = new Map();

  for (const shot of periodShots) {
    const dateStr = getDateInTimezone(shot.capturedAt, timezone);
    const halfHour = getHalfHourBucketKey(shot.capturedAt, timezone);
    const key = `${dateStr}|${halfHour}`;
    const entry = bucketMap.get(key) || {
      dateStr,
      halfHour,
      total: 0,
      count: 0,
      hasScreenshot: true,
    };
    entry.total += Number(shot.activityScore) || 0;
    entry.count += 1;
    entry.hasScreenshot = true;
    bucketMap.set(key, entry);
  }

  for (const act of periodActs) {
    const actTime =
      act.eventTimestamp ||
      act.telemetry?.firstObservedAt ||
      act.telemetry?.measuredStart ||
      act.createdAt;
    const dateStr = getDateInTimezone(actTime, timezone);
    const halfHour = getHalfHourBucketKey(actTime, timezone);
    const key = `${dateStr}|${halfHour}`;
    const entry = actEventsByBucket.get(key) || {
      dateStr,
      halfHour,
      totalActions: 0,
      eventCount: 0,
    };
    entry.totalActions +=
      (act.keyPresses || 0) + (act.mouseClicks || 0) + (act.mouseMoves || 0);
    entry.eventCount += 1;
    actEventsByBucket.set(key, entry);
  }

  for (const [key, data] of actEventsByBucket.entries()) {
    const existing = bucketMap.get(key);
    if (!existing) {
      const avgActions = data.totalActions / (data.eventCount || 1);
      const rawScore = Math.min(Math.round((avgActions / 30) * 100), 100);
      bucketMap.set(key, {
        dateStr: data.dateStr,
        halfHour: data.halfHour,
        total: Math.max(rawScore, data.totalActions > 0 ? 10 : 0),
        count: 1,
        hasScreenshot: false,
      });
    }
  }

  let activeCount = 0;
  let activeSum = 0;
  const resolvedByKey = new Map();
  const dailyAccumulator = new Map();

  for (const [key, bucket] of bucketMap.entries()) {
    const val = bucket.count > 0 ? Math.round(bucket.total / bucket.count) : 0;
    resolvedByKey.set(key, val);
    if (val > 0) {
      activeSum += val;
      activeCount += 1;
      const dayStats = dailyAccumulator.get(bucket.dateStr) || { sum: 0, count: 0 };
      dayStats.sum += val;
      dayStats.count += 1;
      dailyAccumulator.set(bucket.dateStr, dayStats);
    }
  }

  let activityScore = null;
  if (bucketMap.size > 0) {
    activityScore = activeCount > 0 ? Math.round(activeSum / activeCount) : 0;
  }

  let activityBuckets = [];
  if (includeTrend && startDate && endDate) {
    const workSessions = (sessions || []).filter((s) => s.type === "work");

    if (startDate === endDate) {
      for (let hour = 0; hour < 24; hour++) {
        for (const minute of [0, 30]) {
          const hh = String(hour).padStart(2, "0");
          const mm = minute === 0 ? "00" : "30";
          const halfHourKey = `${hour}:${mm}`;
          const label = `${hh}:${mm}`;
          const fullKey = `${startDate}|${halfHourKey}`;
          const val = resolvedByKey.get(fullKey) ?? 0;

          const slotStart = getZonedDateTime(`${startDate}T${hh}:${mm}:00.000`, timezone);
          const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
          const hasWorkOverlap = workSessions.some((s) => {
            const { overlapSeconds } = calculateIntervalOverlap(
              s,
              slotStart,
              slotEnd,
              evalNow
            );
            return overlapSeconds > 0;
          });

          activityBuckets.push({
            key: label,
            label,
            value: val,
            tracked: hasWorkOverlap || val > 0 || bucketMap.has(fullKey),
          });
        }
      }
    } else {
      const dates = enumerateCalendarDates(startDate, endDate);
      activityBuckets = dates.map((d) => {
        const dayRange = getZonedDayRange(d, timezone);
        const dayStats = dailyAccumulator.get(d);
        const val =
          dayStats && dayStats.count > 0
            ? Math.round(dayStats.sum / dayStats.count)
            : 0;
        const hasWorkOverlap = workSessions.some((s) => {
          const { overlapSeconds } = calculateIntervalOverlap(
            s,
            dayRange.start,
            dayRange.end,
            evalNow
          );
          return overlapSeconds > 0;
        });

        return {
          key: d,
          label: formatShortDayLabel(d),
          value: val,
          tracked: hasWorkOverlap || val > 0,
        };
      });
    }
  }

  return { activityScore, activityBuckets };
};

export const getOverviewData = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const allowedUserIds = await getReportUserIds(req.user);

    if (allowedUserIds && allowedUserIds.length === 0) {
      return res.json([]);
    }

    const orgId = normalizeId(
      req.user?.organizationId ||
      req.user?.organization?._id ||
      req.user?.organization
    );

    if (!orgId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const userQuery = {
      organization: orgId,
    };

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
        userQuery._id = { $in: permitted };
      } else {
        userQuery._id = { $in: requestedIds };
      }
    }

    if (req.query.teams?.trim()) {
      userQuery.team = {
        $in: req.query.teams.split(",").filter(Boolean),
      };
    }

    const users = await User.find(userQuery)
      .populate("manager", "firstName lastName email")
      .populate("team", "name")
      .select("-password");

    const userIds = users.map((u) => normalizeId(u._id || u.id)).filter(Boolean);

    // Compute timezone bounds per user and overall bounding range for bulk fetching
    let globalMinStart = null;
    let baselineGlobalMinStart = null;
    let globalMaxEnd = null;
    const userRanges = new Map();
    const queryTimezone =
      typeof req.query?.timezone === "string" && isValidTimezone(req.query.timezone)
        ? normalizeTimezone(req.query.timezone)
        : null;

    if (startDate && endDate) {
      const rangeDays = Math.max(1, enumerateCalendarDates(startDate, endDate).length);
      const baselineDays = startDate === endDate ? 7 : rangeDays;
      const baselineStartDate = shiftCalendarDate(startDate, -baselineDays);

      for (const user of users) {
        const uid = normalizeId(user._id || user.id);
        let tz = getUserTimezone(user, req);
        if (
          queryTimezone &&
          (!user?.reportTimezone || user.reportTimezone === "Browser timezone") &&
          !req.headers?.["x-client-timezone"] &&
          !req.headers?.["X-Client-Timezone"]
        ) {
          tz = queryTimezone;
        }
        const startRange = getZonedDayRange(startDate, tz);
        const endRange = getZonedDayRange(endDate, tz);
        const baselineStartRange = getZonedDayRange(baselineStartDate, tz);

        userRanges.set(uid, {
          timezone: tz,
          periodStart: startRange.start,
          periodEnd: endRange.end,
          baselineStart: baselineStartRange.start,
        });
        if (!globalMinStart || startRange.start < globalMinStart) globalMinStart = startRange.start;
        if (!baselineGlobalMinStart || baselineStartRange.start < baselineGlobalMinStart) {
          baselineGlobalMinStart = baselineStartRange.start;
        }
        if (!globalMaxEnd || endRange.end > globalMaxEnd) globalMaxEnd = endRange.end;
      }
    }

    // 1. Bulk Sessions Query (replaces N per-user queries with 1 bulk query)
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

    // 2. Bulk Active Timers Query (replaces N per-user queries with 1 bulk query)
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

    // 3. Bulk Telemetry Queries (Screenshots & Activities across [baselineGlobalMinStart, globalMaxEnd])
    let bulkScreenshots = [];
    let bulkActivities = [];
    const telemetryQueryStart = baselineGlobalMinStart || globalMinStart;
    if (userIds.length > 0 && telemetryQueryStart && globalMaxEnd) {
      try {
        const [shots, acts] = await Promise.all([
          screenshotRepository.find({
            userId: { in: userIds },
            capturedAt: {
              gte: telemetryQueryStart,
              lt: globalMaxEnd,
            },
          }),
          activityRepository.find({
            userId: { $in: userIds },
            OR: [
              {
                eventTimestamp: {
                  gte: telemetryQueryStart,
                  lt: globalMaxEnd,
                },
              },
              {
                eventTimestamp: null,
                createdAt: {
                  gte: telemetryQueryStart,
                  lt: globalMaxEnd,
                },
              },
            ],
          }),
        ]);
        bulkScreenshots = Array.isArray(shots) ? shots : [];
        bulkActivities = Array.isArray(acts) ? acts : [];
      } catch {
        bulkScreenshots = [];
        bulkActivities = [];
      }
    }

    const screenshotsByUser = new Map();
    for (const shot of bulkScreenshots) {
      const uid = normalizeId(shot.userId || shot.user);
      if (!screenshotsByUser.has(uid)) screenshotsByUser.set(uid, []);
      screenshotsByUser.get(uid).push(shot);
    }

    const activitiesByUser = new Map();
    for (const act of bulkActivities) {
      const uid = normalizeId(act.userId || act.user);
      if (!activitiesByUser.has(uid)) activitiesByUser.set(uid, []);
      activitiesByUser.get(uid).push(act);
    }

    const evalNow = new Date();

    const overview = users.map((user) => {
      const userId = normalizeId(user._id || user.id);
      const range = userRanges.get(userId);
      const timezone = range?.timezone || getUserTimezone(user, req);
      const periodStart = range?.periodStart || null;
      const periodEnd = range?.periodEnd || null;
      const baselineStart = range?.baselineStart || null;

      const userAllSessions = sessionsByUser.get(userId) || [];
      let sessions;
      if (periodStart && periodEnd) {
        sessions = userAllSessions.filter((s) => {
          const sStart = new Date(s.startTime);
          const sEnd = s.endTime ? new Date(s.endTime) : null;
          return sStart < periodEnd && (!sEnd || sEnd > periodStart);
        });
      } else {
        sessions = [...userAllSessions];
      }

      const activeTimer = activeTimerByUser.get(userId);
      if (activeTimer?.startTime && !sessions.some((s) => !s.endTime)) {
        const timerStart = new Date(activeTimer.startTime);
        if (!periodStart || !periodEnd || timerStart < periodEnd) {
          sessions.push({
            userId,
            startTime: timerStart,
            endTime: null,
            type: "work",
          });
        }
      }

        const workSeconds = periodStart && periodEnd
          ? calculateMergedClippedDuration(
              sessions,
              "work",
              periodStart,
              periodEnd,
              evalNow
            )
          : calculateMergedDuration(
              sessions.filter((s) => s.type === "work")
            );

        const breakSeconds = periodStart && periodEnd
          ? calculateMergedClippedDuration(
              sessions,
              "break",
              periodStart,
              periodEnd,
              evalNow
            )
          : calculateMergedDuration(
              sessions.filter((s) => s.type === "break")
            );

        const lastSession = sessions.length > 0
          ? [...sessions].sort(
              (a, b) =>
                new Date(b.endTime || b.startTime || 0) -
                new Date(a.endTime || a.startTime || 0)
            )[0]
          : null;

        const isTrackingNow =
          user.devices?.some(
            (device) => device.isOnline === true && device.isTracking === true,
          ) ||
          sessions.some((s) => s.type === "work" && !s.endTime) ||
          Boolean(activeTimer?.startTime);

        const isOnline = Boolean(
          user.devices?.some((device) => device.isOnline === true) || isTrackingNow
        );

        const userShots = screenshotsByUser.get(userId) || [];
        const userActs = activitiesByUser.get(userId) || [];

        let activityScore = null;
        let activityDelta = null;
        let activityBuckets = [];

        if (periodStart && periodEnd && startDate && endDate) {
          const currentTelemetry = computeRangeActivitySummary({
            screenshots: userShots,
            activities: userActs,
            sessions,
            timezone,
            startDate,
            endDate,
            rangeStart: periodStart,
            rangeEnd: periodEnd,
            evalNow,
            includeTrend: true,
          });
          activityScore = currentTelemetry.activityScore;
          activityBuckets = currentTelemetry.activityBuckets;

          if (activityScore !== null && baselineStart) {
            const baselineTelemetry = computeRangeActivitySummary({
              screenshots: userShots,
              activities: userActs,
              sessions: [],
              timezone,
              startDate: null,
              endDate: null,
              rangeStart: baselineStart,
              rangeEnd: periodStart,
              evalNow,
              includeTrend: false,
            });
            if (baselineTelemetry.activityScore !== null) {
              activityDelta = activityScore - baselineTelemetry.activityScore;
            }
          }
        }

        // Resolve canonical ISO lastSyncAt across devices, telemetry, and sessions
        const syncCandidates = [];
        if (Array.isArray(user.devices)) {
          for (const d of user.devices) {
            if (d?.lastSync) syncCandidates.push(new Date(d.lastSync).getTime());
          }
        }
        for (const act of userActs) {
          const t = act.eventTimestamp || act.createdAt;
          if (t) syncCandidates.push(new Date(t).getTime());
        }
        for (const shot of userShots) {
          if (shot?.capturedAt) syncCandidates.push(new Date(shot.capturedAt).getTime());
        }
        if (lastSession) {
          const t = lastSession.endTime || lastSession.startTime;
          if (t) syncCandidates.push(new Date(t).getTime());
        }
        if (activeTimer?.startTime) {
          syncCandidates.push(new Date(activeTimer.startTime).getTime());
        }
        const validSyncMs = syncCandidates.filter(
          (ms) => Number.isFinite(ms) && ms > 0 && ms <= evalNow.getTime() + 60000
        );
        const lastSyncAt =
          validSyncMs.length > 0 ? new Date(Math.max(...validSyncMs)).toISOString() : null;

        return {
          id: userId,
          date: startDate,
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,

          avatar: getAvatarUrl(user.avatar),

          manager: user.manager
            ? {
                _id: normalizeId(user.manager._id || user.manager.id),
                firstName: user.manager.firstName,
                lastName: user.manager.lastName,
                email: user.manager.email,
              }
            : null,

          team: user.team || "Default team",

          workTime: formatTime(workSeconds),

          breakTime: formatTime(breakSeconds),

          status: isTrackingNow ? "Tracking running" : "Tracking stopped",

          lastSync: lastSession
            ? new Date(lastSession.endTime || lastSession.startTime).toLocaleString()
            : "--",

          lastSyncAt,
          isOnline,
          activityScore,
          activityDelta,
          activityBuckets,
        };
      });

    res.json(overview);
  } catch (err) {
    console.error("GET OVERVIEW ERROR:", err);

    res.status(500).json({
      message: "Failed to fetch overview data",
      error: "Failed to fetch overview data",
    });
  }
};

/**
 * Merges overlapping intervals of the specified session type and computes the
 * cumulative duration in seconds clipped to [periodStart, periodEnd).
 *
 * Active sessions (null/undefined endTime) use evalNow as the upper bound.
 *
 * @param {Array} sessions
 * @param {string} type - 'work' or 'break'
 * @param {Date} periodStart
 * @param {Date} periodEnd
 * @param {Date} evalNow
 * @returns {number} Non-overlapping clipped duration in integer seconds
 */
const calculateMergedClippedDuration = (
  sessions,
  type,
  periodStart,
  periodEnd,
  evalNow = new Date()
) => {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return 0;
  }

  const matchingSessions = sessions.filter((s) => s && s.type === type);
  if (matchingSessions.length === 0) {
    return 0;
  }

  const intervals = [];

  for (const session of matchingSessions) {
    const overlap = calculateIntervalOverlap(
      session,
      periodStart,
      periodEnd,
      evalNow
    );

    if (
      overlap &&
      overlap.overlapSeconds > 0 &&
      overlap.overlapStart &&
      overlap.overlapEnd
    ) {
      intervals.push({
        start: overlap.overlapStart.getTime(),
        end: overlap.overlapEnd.getTime(),
      });
    }
  }

  if (intervals.length === 0) {
    return 0;
  }

  intervals.sort((a, b) => a.start - b.start || a.end - b.end);

  const merged = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const current = intervals[i];
    const last = merged[merged.length - 1];

    if (current.start <= last.end) {
      if (current.end > last.end) {
        last.end = current.end;
      }
    } else {
      merged.push(current);
    }
  }

  let totalSeconds = 0;
  for (const interval of merged) {
    totalSeconds += Math.floor((interval.end - interval.start) / 1000);
  }

  return totalSeconds;
};

export const getTodaySummary = async (req, res) => {
  try {
    const userId = normalizeId(req.user?._id || req.user?.id);
    if (!userId) {
      return res.status(401).json({
        message: "Not authorized",
      });
    }

    const evalNow = new Date();
    const timezone = resolveUserTimezone(req.user, req);
    const todayDate = getTodayInTimezone(timezone, evalNow);
    const { start: periodStart, end: periodEnd } = getZonedDayRange(
      todayDate,
      timezone
    );

    const sessions = await sessionRepository.findOverlappingSessions({
      userId,
      periodStart,
      periodEnd,
    });

    const activeTimer = await timerRepository.findActiveTimerByUser(userId);
    if (activeTimer?.startTime && !sessions.some((s) => !s.endTime)) {
      sessions.push({
        userId,
        startTime: new Date(activeTimer.startTime),
        endTime: null,
        type: "work",
      });
    }

    const workSeconds = calculateMergedClippedDuration(
      sessions,
      "work",
      periodStart,
      periodEnd,
      evalNow
    );

    const breakSeconds = calculateMergedClippedDuration(
      sessions,
      "break",
      periodStart,
      periodEnd,
      evalNow
    );

    return res.json({
      workSeconds,
      breakSeconds,
    });
  } catch (err) {
    console.error("GET TODAY SUMMARY ERROR:", err);

    return res.status(500).json({
      message: "Failed to fetch today summary",
      error: "Failed to fetch today summary",
    });
  }
};

export const getWorkTimeStats = async (req, res) => {
  try {
    const userId = normalizeId(req.user?._id || req.user?.id);
    if (!userId) {
      return res.status(401).json({
        message: "Not authorized",
      });
    }

    const evalNow = new Date();
    const timezone = resolveUserTimezone(req.user, req);

    // Today's calendar date in user's timezone
    const todayDate = getTodayInTimezone(timezone, evalNow);
    const { start: todayStart, end: todayEnd } = getZonedDayRange(
      todayDate,
      timezone
    );

    // Week starts Sunday
    const weekDate = new Date(`${todayDate}T00:00:00Z`);
    weekDate.setUTCDate(weekDate.getUTCDate() - weekDate.getUTCDay());

    const weekStartDate = `${weekDate.getUTCFullYear()}-${String(
      weekDate.getUTCMonth() + 1
    ).padStart(2, "0")}-${String(weekDate.getUTCDate()).padStart(2, "0")}`;

    const { start: weekStart } = getZonedDayRange(weekStartDate, timezone);

    // First day of current month
    const monthStartDate = `${todayDate.slice(0, 7)}-01`;
    const { start: monthStart } = getZonedDayRange(monthStartDate, timezone);

    // Overall query range for sessions
    const periodStart = weekStart < monthStart ? weekStart : monthStart;
    const periodEnd = todayEnd;

    const sessions = await sessionRepository.findOverlappingSessions({
      userId,
      periodStart,
      periodEnd,
      type: "work",
    });

    const activeTimer = await timerRepository.findActiveTimerByUser(userId);
    if (activeTimer?.startTime && !sessions.some((s) => !s.endTime)) {
      sessions.push({
        userId,
        startTime: new Date(activeTimer.startTime),
        endTime: null,
        type: "work",
      });
    }

    const todaySeconds = calculateMergedClippedDuration(
      sessions,
      "work",
      todayStart,
      todayEnd,
      evalNow
    );

    const weekSeconds = calculateMergedClippedDuration(
      sessions,
      "work",
      weekStart,
      todayEnd,
      evalNow
    );

    const monthSeconds = calculateMergedClippedDuration(
      sessions,
      "work",
      monthStart,
      todayEnd,
      evalNow
    );

    // Calculate average work time per worked day from month start to today
    let workedDays = 0;
    let averageDayTotal = 0;

    const monthStartYear = parseInt(todayDate.slice(0, 4), 10);
    const monthStartMonth = parseInt(todayDate.slice(5, 7), 10);
    const todayDayNumber = parseInt(todayDate.slice(8, 10), 10);

    for (let dayNum = 1; dayNum <= todayDayNumber; dayNum++) {
      const dayDateStr = `${monthStartYear}-${String(monthStartMonth).padStart(
        2,
        "0"
      )}-${String(dayNum).padStart(2, "0")}`;

      const dayRange = getZonedDayRange(dayDateStr, timezone);
      const daySeconds = calculateMergedClippedDuration(
        sessions,
        "work",
        dayRange.start,
        dayRange.end,
        evalNow
      );

      if (daySeconds > 0) {
        workedDays++;
        averageDayTotal += daySeconds;
      }
    }

    const avgDaySeconds =
      workedDays > 0 ? Math.floor(averageDayTotal / workedDays) : 0;

    return res.json({
      todaySeconds,
      weekSeconds,
      monthSeconds,
      avgDaySeconds,
    });
  } catch (err) {
    console.error("GET WORK TIME STATS ERROR:", err);

    return res.status(500).json({
      message: "Failed to fetch work time stats",
      error: "Failed to fetch work time stats",
    });
  }
};

export const getTodayChartData = async (req, res) => {
  try {
    const userId = normalizeId(req.user?._id || req.user?.id);
    if (!userId) {
      return res.status(401).json({
        message: "Not authorized",
      });
    }

    const evalNow = new Date();
    const timezone = resolveUserTimezone(req.user, req);

    const todayDate = getTodayInTimezone(timezone, evalNow);
    const { start: todayStart, end: todayEnd } = getZonedDayRange(
      todayDate,
      timezone
    );

    const sessions = await sessionRepository.findOverlappingSessions({
      userId,
      periodStart: todayStart,
      periodEnd: todayEnd,
    });

    const activeTimer = await timerRepository.findActiveTimerByUser(userId);
    if (activeTimer?.startTime && !sessions.some((s) => !s.endTime)) {
      sessions.push({
        userId,
        startTime: new Date(activeTimer.startTime),
        endTime: null,
        type: "work",
      });
    }

    const hours = [];

    // Calculate tomorrow's date string for the 23:00 -> 24:00 (00:00 next day) boundary
    const nextDayObj = new Date(`${todayDate}T12:00:00Z`);
    nextDayObj.setUTCDate(nextDayObj.getUTCDate() + 1);
    const nextDayDate = `${nextDayObj.getUTCFullYear()}-${String(
      nextDayObj.getUTCMonth() + 1
    ).padStart(2, "0")}-${String(nextDayObj.getUTCDate()).padStart(2, "0")}`;

    for (let i = 0; i < 24; i++) {
      const hourNum = i % 12 || 12;
      const period = i < 12 ? "AM" : "PM";

      const wallStart = `${todayDate} ${String(i).padStart(2, "0")}:00:00`;
      const wallEnd =
        i === 23
          ? `${nextDayDate} 00:00:00`
          : `${todayDate} ${String(i + 1).padStart(2, "0")}:00:00`;

      const hourStart = getZonedDateTime(wallStart, timezone);
      const hourEnd = getZonedDateTime(wallEnd, timezone);

      const workSeconds = calculateMergedClippedDuration(
        sessions,
        "work",
        hourStart,
        hourEnd,
        evalNow
      );

      const breakSeconds = calculateMergedClippedDuration(
        sessions,
        "break",
        hourStart,
        hourEnd,
        evalNow
      );

      hours.push({
        time: `${hourNum} ${period}`,
        work: Number((workSeconds / 3600).toFixed(2)),
        break: Number((breakSeconds / 3600).toFixed(2)),
      });
    }

    return res.json(hours);
  } catch (err) {
    console.error("GET TODAY CHART ERROR:", err);

    return res.status(500).json({
      message: "Failed to fetch chart data",
      error: "Failed to fetch chart data",
    });
  }
};

export const getLast30DaysChart = async (req, res) => {
  try {
    const userId = normalizeId(req.user?._id || req.user?.id);
    if (!userId) {
      return res.status(401).json({
        message: "Not authorized",
      });
    }

    const evalNow = new Date();
    const timezone = resolveUserTimezone(req.user, req);

    const todayDate = getTodayInTimezone(timezone, evalNow);

    // Build the 30 consecutive calendar day strings ending on todayDate
    const dateStrings = [];
    const baseDate = new Date(`${todayDate}T12:00:00Z`);

    for (let i = 29; i >= 0; i--) {
      const d = new Date(baseDate);
      d.setUTCDate(d.getUTCDate() - i);
      const dateStr = `${d.getUTCFullYear()}-${String(
        d.getUTCMonth() + 1
      ).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      dateStrings.push(dateStr);
    }

    const { start: periodStart } = getZonedDayRange(dateStrings[0], timezone);
    const { end: periodEnd } = getZonedDayRange(todayDate, timezone);

    const sessions = await sessionRepository.findOverlappingSessions({
      userId,
      periodStart,
      periodEnd,
    });

    const activeTimer = await timerRepository.findActiveTimerByUser(userId);
    if (activeTimer?.startTime && !sessions.some((s) => !s.endTime)) {
      sessions.push({
        userId,
        startTime: new Date(activeTimer.startTime),
        endTime: null,
        type: "work",
      });
    }

    const days = dateStrings.map((dateStr) => {
      const { start: dayStart, end: dayEnd } = getZonedDayRange(
        dateStr,
        timezone
      );

      const workSeconds = calculateMergedClippedDuration(
        sessions,
        "work",
        dayStart,
        dayEnd,
        evalNow
      );

      const breakSeconds = calculateMergedClippedDuration(
        sessions,
        "break",
        dayStart,
        dayEnd,
        evalNow
      );

      const dayLabel = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        month: "short",
        day: "2-digit",
      }).format(dayStart);

      return {
        day: dayLabel,
        work: Number((workSeconds / 3600).toFixed(2)),
        break: Number((breakSeconds / 3600).toFixed(2)),
      };
    });

    return res.json(days);
  } catch (err) {
    console.error("GET 30 DAYS CHART ERROR:", err);

    return res.status(500).json({
      message: "Failed to fetch 30 days chart",
      error: "Failed to fetch 30 days chart",
    });
  }
};

/**
 * Resolves a timestamp to a 30-minute bucket key ("H:00" or "H:30") in the target timezone.
 */
const getHalfHourBucketKey = (dateValue, timezone) => {
  const dateObj = new Date(dateValue);
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
  return `${hour}:${minute < 30 ? "00" : "30"}`;
};

/**
 * Computes the canonical 30-minute bucketed activity percentage matching /api/activity/:userId
 * and /api/attendance (screenshots take precedence per bucket; fallback uses actions / 30).
 */
const computeBucketedActivityPercent = (screenshots, rawActivities, timezone) => {
  const buckets = {};

  screenshots.forEach((shot) => {
    const bucketKey = getHalfHourBucketKey(shot.capturedAt, timezone);
    if (!buckets[bucketKey]) {
      buckets[bucketKey] = {
        total: 0,
        count: 0,
        hasScreenshot: true,
      };
    }
    buckets[bucketKey].total += shot.activityScore || 0;
    buckets[bucketKey].count += 1;
    buckets[bucketKey].hasScreenshot = true;
  });

  const activityEventsByBucket = {};
  rawActivities.forEach((act) => {
    const actTime =
      act.eventTimestamp ||
      act.telemetry?.firstObservedAt ||
      act.telemetry?.measuredStart ||
      act.createdAt;
    const bucketKey = getHalfHourBucketKey(actTime, timezone);
    if (!activityEventsByBucket[bucketKey]) {
      activityEventsByBucket[bucketKey] = {
        totalActions: 0,
        eventCount: 0,
      };
    }
    const actions =
      (act.keyPresses || 0) + (act.mouseClicks || 0) + (act.mouseMoves || 0);
    activityEventsByBucket[bucketKey].totalActions += actions;
    activityEventsByBucket[bucketKey].eventCount += 1;
  });

  Object.entries(activityEventsByBucket).forEach(([bucketKey, data]) => {
    if (!buckets[bucketKey]) {
      buckets[bucketKey] = {
        total: 0,
        count: 0,
      };
    }
    if (!buckets[bucketKey].hasScreenshot) {
      const avgActionsPerEvent = data.totalActions / (data.eventCount || 1);
      const score = Math.min(Math.round((avgActionsPerEvent / 30) * 100), 100);
      buckets[bucketKey].total = Math.max(score, data.totalActions > 0 ? 10 : 0);
      buckets[bucketKey].count = 1;
    }
  });

  let activeBucketCount = 0;
  let activeBucketSum = 0;

  for (let hour = 0; hour < 24; hour++) {
    for (const minute of [0, 30]) {
      const bucketKey = `${hour}:${minute === 0 ? "00" : "30"}`;
      const bucket = buckets[bucketKey];
      const avgScore =
        bucket && bucket.count > 0 ? Math.round(bucket.total / bucket.count) : 0;
      if (avgScore > 0) {
        activeBucketSum += avgScore;
        activeBucketCount += 1;
      }
    }
  }

  return activeBucketCount > 0
    ? Math.round(activeBucketSum / activeBucketCount)
    : 0;
};

export const getTodayTaskSummary = async (req, res) => {
  try {
    const userId = normalizeId(req.user?._id || req.user?.id);
    if (!userId) {
      return res.status(401).json({
        message: "Not authorized",
      });
    }

    const orgId = normalizeId(
      req.user?.organizationId ||
        req.user?.organization?._id ||
        req.user?.organization
    );

    const evalNow = new Date();
    const timezone = resolveUserTimezone(req.user, req);

    const todayDate = getTodayInTimezone(timezone, evalNow);
    const { start: todayStart, end: todayEnd } = getZonedDayRange(
      todayDate,
      timezone
    );

    // 1. Tasks assigned to the user
    let assignedTasks = 0;
    try {
      assignedTasks = await taskRepository.countDocuments({
        assignedTo: userId,
        organization: orgId,
      });
    } catch {
      assignedTasks = 0;
    }

    // 2. Task tracking for today
    let taskTracking = [];
    try {
      taskTracking = await projectTrackingRepository.find({
        user: userId,
        date: todayDate,
        task: { $ne: null },
      });
    } catch {
      taskTracking = [];
    }

    // 3. Distinct tasks worked on today
    const workedTaskIds = new Set(
      taskTracking
        .map(
          (tracking) =>
            tracking.task?.toString?.() ||
            String(tracking.task || tracking.taskId || "")
        )
        .filter(Boolean)
    );

    // Query sessions overlapping today
    const todaySessions = await sessionRepository.findOverlappingSessions({
      userId,
      periodStart: todayStart,
      periodEnd: todayEnd,
    });

    const activeTimer = await timerRepository.findActiveTimerByUser(userId);
    const timerUserId = normalizeId(
      activeTimer?.user?._id ||
        activeTimer?.user?.id ||
        activeTimer?.user ||
        activeTimer?.userId
    );
    const isTimerUserMatch = Boolean(
      activeTimer && timerUserId && timerUserId === userId
    );
    const isTimerRunning =
      Boolean(activeTimer?.startTime) &&
      activeTimer?.status === "running" &&
      isTimerUserMatch;

    const rawActiveTaskId = normalizeId(
      activeTimer?.task?._id ||
        activeTimer?.task?.id ||
        activeTimer?.task ||
        activeTimer?.taskId
    );

    let activeTaskId = null;
    if (rawActiveTaskId && orgId) {
      const inlineTaskOrgId = normalizeId(
        activeTimer?.task?.organizationId || activeTimer?.task?.organization
      );
      if (inlineTaskOrgId) {
        if (inlineTaskOrgId === orgId) {
          activeTaskId = rawActiveTaskId;
        }
      } else {
        try {
          const verifiedTask = await taskRepository.findOne({
            _id: rawActiveTaskId,
            organization: orgId,
          });
          if (verifiedTask) {
            const verifiedOrgId = normalizeId(
              verifiedTask.organizationId || verifiedTask.organization
            );
            if (verifiedOrgId === orgId) {
              activeTaskId = rawActiveTaskId;
            }
          }
        } catch {
          activeTaskId = null;
        }
      }
    }

    if (isTimerRunning && !todaySessions.some((s) => !s.endTime)) {
      if (activeTaskId) {
        workedTaskIds.add(String(activeTaskId));
      }
      todaySessions.push({
        userId,
        startTime: new Date(activeTimer.startTime),
        endTime: null,
        type: "work",
        taskId: activeTaskId,
      });
    }

    todaySessions.forEach((s) => {
      if (s.taskId) workedTaskIds.add(String(s.taskId));
    });

    // 4. Total time spent specifically on tasks (completed + active task timer)
    const taskIntervals = [...taskTracking];
    if (isTimerRunning && activeTaskId) {
      const timerStart = new Date(activeTimer.startTime);
      if (timerStart < todayEnd && evalNow > todayStart) {
        const clippedStart = timerStart < todayStart ? todayStart : timerStart;
        const clippedEnd = evalNow > todayEnd ? todayEnd : evalNow;
        if (clippedEnd > clippedStart) {
          taskIntervals.push({
            startTime: clippedStart,
            endTime: clippedEnd,
            taskId: activeTaskId,
          });
        }
      }
    }

    const taskWorkSeconds = calculateMergedDuration(taskIntervals);

    // 5. Break time today
    const breakSeconds = calculateMergedClippedDuration(
      todaySessions,
      "break",
      todayStart,
      todayEnd,
      evalNow
    );

    // 6. Overall activity for today (canonical 30-min bucketed score matching /api/activity/:userId)
    const requestedActivityDate =
      typeof req.query?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date.trim())
        ? req.query.date.trim()
        : todayDate;
    const { start: activityStart, end: activityEnd } =
      requestedActivityDate === todayDate
        ? { start: todayStart, end: todayEnd }
        : getZonedDayRange(requestedActivityDate, timezone);

    let screenshots = [];
    let rawActivities = [];
    try {
      [screenshots, rawActivities] = await Promise.all([
        screenshotRepository.find(
          {
            userId,
            capturedAt: {
              gte: activityStart,
              lt: activityEnd,
            },
          },
          { sort: { capturedAt: "asc" } }
        ),
        activityRepository.find(
          {
            userId,
            OR: [
              {
                eventTimestamp: {
                  gte: activityStart,
                  lt: activityEnd,
                },
              },
              {
                eventTimestamp: null,
                createdAt: {
                  gte: activityStart,
                  lt: activityEnd,
                },
              },
            ],
          },
          { sort: [{ eventTimestamp: "asc" }, { createdAt: "asc" }] }
        ),
      ]);
    } catch {
      screenshots = [];
      rawActivities = [];
    }

    const activityPercent = computeBucketedActivityPercent(
      screenshots,
      rawActivities,
      timezone
    );

    return res.json({
      assignedTasks,
      workedTasks: workedTaskIds.size,
      taskWorkSeconds,
      breakSeconds,
      activityPercent,
    });
  } catch (err) {
    console.error("GET TODAY TASK SUMMARY ERROR:", err);

    return res.status(500).json({
      message: "Failed to fetch today task summary",
      error: "Failed to fetch today task summary",
    });
  }
};
