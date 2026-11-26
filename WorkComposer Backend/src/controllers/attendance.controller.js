import { attendanceRepository } from "../db/repositories/attendance.repository.js";
import { sessionRepository } from "../db/repositories/session.repository.js";
import { userRepository } from "../db/repositories/user.repository.js";
import { timerRepository } from "../db/repositories/timer.repository.js";
import { screenshotRepository } from "../db/repositories/screenshot.repository.js";
import { activityRepository } from "../db/repositories/activity.repository.js";
import Report from "../models/report.model.js";
import { getReportUserIds } from "../utils/reportAccess.js";
import { getAvatarUrl } from "../utils/avatar.js";
import {
  getUserTimezone,
  getDateRangeUTC,
  getDateInTimezone,
  getTodayInTimezone,
  resolveUserTimezone,
  getZonedDayRange,
  calculateIntervalOverlap,
  isValidTimezone,
  normalizeTimezone,
  FALLBACK_TIMEZONE,
} from "../utils/timezone.js";
import { generateDailyWorkReport } from "../services/dailyReport.service.js";
import { sendDailyWorkReportEmail } from "../services/dailyWorkReportEmail.service.js";
import { generateTeamDayObservations } from "../services/teamDayIntelligence.service.js";
import { normalizeId } from "../security/effectiveAuthContext.js";

const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return "0h 0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  return `${hours}h ${minutes}m`;
};

export const formatClockTime = (date, timezone) => {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;

  const tz = isValidTimezone(timezone) ? normalizeTimezone(timezone) : FALLBACK_TIMEZONE;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
};

export const getAttendanceData = async (req, res) => {
  try {
    const { startDate, endDate, sortBy = "name", order = "asc" } = req.query;

    const allowedUserIds = await getReportUserIds(req.user);

    if (allowedUserIds && allowedUserIds.length === 0) {
      return res.json([]);
    }

    const callerOrgId = normalizeId(req.user.organizationId || req.user.organization);
    const userQuery = {
      organization: callerOrgId,
    };

    if (allowedUserIds) {
      userQuery._id = {
        $in: allowedUserIds,
        in: allowedUserIds,
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
          in: permitted,
        };
      } else {
        userQuery._id = {
          $in: requestedIds,
          in: requestedIds,
        };
      }
    }

    if (req.query.teams?.trim()) {
      userQuery.team = {
        in: req.query.teams.split(",").filter(Boolean),
      };
    }

    const users = await userRepository.find(userQuery, {
      populate: [
        { path: "manager", select: "firstName lastName email" },
        { path: "managers", select: "firstName lastName email" },
        { path: "team", select: "name" },
      ],
    });

    const userIds = users.map((u) => normalizeId(u._id || u.id)).filter(Boolean);

    // Compute timezone bounds per user and overall bounding range for bulk fetching
    let globalMinStart = null;
    let globalMaxEnd = null;
    const userRanges = new Map();

    if (startDate && endDate) {
      for (const user of users) {
        const uid = normalizeId(user._id || user.id);
        const tz = resolveUserTimezone(user, req);
        const startRange = getZonedDayRange(startDate, tz);
        const endRange = getZonedDayRange(endDate, tz);
        userRanges.set(uid, {
          timezone: tz,
          periodStart: startRange.start,
          periodEnd: endRange.end,
        });
        if (!globalMinStart || startRange.start < globalMinStart) globalMinStart = startRange.start;
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

    // 3. Bulk Screenshots Query for single-day activity buckets (replaces N queries with 1 bulk query)
    let bulkScreenshots = [];
    if (userIds.length > 0 && startDate && endDate && startDate === endDate && globalMinStart && globalMaxEnd) {
      try {
        bulkScreenshots = await screenshotRepository.find({
          userId: { in: userIds },
          capturedAt: {
            gte: globalMinStart,
            lt: globalMaxEnd,
          },
        });
      } catch (bucketErr) {
        // Gracefully ignore screenshot lookup errors to avoid blocking attendance
      }
    }

    const screenshotsByUser = new Map();
    for (const shot of bulkScreenshots) {
      const uid = normalizeId(shot.userId || shot.user);
      if (!screenshotsByUser.has(uid)) screenshotsByUser.set(uid, []);
      screenshotsByUser.get(uid).push(shot);
    }

    // 3b. Bulk Activity Records Query for single-day activity buckets & input telemetry (single bulk query)
    let bulkActivities = [];
    if (userIds.length > 0 && startDate && endDate && startDate === endDate && globalMinStart && globalMaxEnd) {
      try {
        bulkActivities = await activityRepository.find({
          userId: { $in: userIds },
          OR: [
            {
              eventTimestamp: {
                gte: globalMinStart,
                lt: globalMaxEnd,
              },
            },
            {
              eventTimestamp: null,
              createdAt: {
                gte: globalMinStart,
                lt: globalMaxEnd,
              },
            },
          ],
        });
      } catch (actErr) {
        // Gracefully ignore activity lookup errors to avoid blocking attendance
      }
    }

    const activitiesByUser = new Map();
    for (const act of bulkActivities) {
      const uid = normalizeId(act.userId || act.user);
      if (!activitiesByUser.has(uid)) activitiesByUser.set(uid, []);
      activitiesByUser.get(uid).push(act);
    }

    // 4. Bulk Team Day Intelligence Observations (for single-day queries)
    let intelligenceByUser = new Map();
    if (userIds.length > 0 && startDate && endDate && startDate === endDate) {
      try {
        const intelResult = await generateTeamDayObservations({
          organizationId: callerOrgId,
          userIds,
          date: startDate,
          timezone: req.user?.reportTimezone || "Asia/Kolkata",
        });
        if (intelResult?.employeeObservations) {
          for (const [uid, obs] of Object.entries(intelResult.employeeObservations)) {
            intelligenceByUser.set(uid, obs);
          }
        }
      } catch (intelErr) {
        // Gracefully ignore intelligence lookup errors to prevent blocking attendance
      }
    }

    const attendance = users.map((user) => {
      const userTargetId = normalizeId(user._id || user.id);
      const range = userRanges.get(userTargetId);
      const timezone = range?.timezone || resolveUserTimezone(user, req);
      const periodStart = range?.periodStart || null;
      const periodEnd = range?.periodEnd || null;

      const userAllSessions = sessionsByUser.get(userTargetId) || [];
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

      const activeTimer = activeTimerByUser.get(userTargetId);
      if (activeTimer?.startTime && !sessions.some((s) => !s.endTime)) {
        const timerStart = new Date(activeTimer.startTime);
        if (!periodStart || !periodEnd || timerStart < periodEnd) {
          sessions.push({
            userId: userTargetId,
            startTime: timerStart,
            endTime: null,
            type: "work",
          });
        }
      }

        const sortedSessions = [...sessions].sort(
          (a, b) => new Date(a.startTime) - new Date(b.startTime),
        );

        const evalNow = new Date();

        let workSeconds = 0;
        let breakSeconds = 0;

        if (periodStart && periodEnd) {
          for (const s of sessions) {
            const { overlapSeconds } = calculateIntervalOverlap(
              s,
              periodStart,
              periodEnd,
              evalNow,
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

        const dailyData = {};

        if (startDate && endDate) {
          const startParts = startDate.split("-").map(Number);
          const endParts = endDate.split("-").map(Number);

          let currentDate = new Date(
            Date.UTC(startParts[0], startParts[1] - 1, startParts[2]),
          );

          const finalDate = new Date(
            Date.UTC(endParts[0], endParts[1] - 1, endParts[2]),
          );

          while (currentDate <= finalDate) {
            const dateKey = currentDate.toISOString().split("T")[0];

            dailyData[dateKey] = {
              date: dateKey,
              workSeconds: 0,
              breakSeconds: 0,
              sessions: [],
            };

            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
          }

          for (const [dateKey, dayObj] of Object.entries(dailyData)) {
            const dayRange = getZonedDayRange(dateKey, timezone);
            const dayStart = dayRange.start;
            const dayEnd = dayRange.end;

            for (const session of sessions) {
              const { overlapSeconds, isContained } = calculateIntervalOverlap(
                session,
                dayStart,
                dayEnd,
                evalNow,
              );

              if (isContained || overlapSeconds > 0) {
                if (session.type === "work") {
                  dayObj.workSeconds += overlapSeconds;
                } else if (session.type === "break") {
                  dayObj.breakSeconds += overlapSeconds;
                }
                dayObj.sessions.push(session);
              }
            }
          }
        } else {
          sessions.forEach((session) => {
            const date =
              session.date ||
              (session.startTime
                ? getDateInTimezone(session.startTime, timezone)
                : "");

            if (!dailyData[date]) {
              dailyData[date] = {
                date,
                workSeconds: 0,
                breakSeconds: 0,
                sessions: [],
              };
            }

            const dur = session.duration || 0;
            if (session.type === "work") {
              dailyData[date].workSeconds += dur;
            }

            if (session.type === "break") {
              dailyData[date].breakSeconds += dur;
            }

            dailyData[date].sessions.push(session);
          });
        }

        const dailyDataArray = Object.values(dailyData).map((day) => ({
          date: day.date,
          workTime: formatTime(day.workSeconds),
          breakTime: formatTime(day.breakSeconds),
          sessions: day.sessions,
        }));

        const firstSession = sortedSessions[0];
        const lastSession = sortedSessions[sortedSessions.length - 1];

        const firstPunchTime = firstSession
          ? formatClockTime(
              periodStart && new Date(firstSession.startTime) < periodStart
                ? periodStart
                : firstSession.startTime,
              timezone,
            )
          : null;

        const lastPunchTime = lastSession
          ? lastSession.endTime
            ? formatClockTime(
                periodEnd && new Date(lastSession.endTime) > periodEnd
                  ? periodEnd
                  : lastSession.endTime,
                timezone,
              )
            : null
          : null;

        let activityBuckets = undefined;
        let userActivityScore = null;
        if (startDate && endDate && startDate === endDate && periodStart && periodEnd) {
          try {
            const userScreenshots = (screenshotsByUser.get(userTargetId) || []).filter((shot) => {
              if (!shot.capturedAt) return false;
              const dateObj = new Date(shot.capturedAt);
              return !isNaN(dateObj.getTime()) && dateObj >= periodStart && dateObj < periodEnd;
            });

            const userActivities = (activitiesByUser.get(userTargetId) || []).filter((act) => {
              const actTime = act.eventTimestamp || act.telemetry?.firstObservedAt || act.telemetry?.measuredStart || act.createdAt;
              if (!actTime) return false;
              const dateObj = new Date(actTime);
              return !isNaN(dateObj.getTime()) && dateObj >= periodStart && dateObj < periodEnd;
            });

            const screenshotBucketMap = {};
            userScreenshots.forEach((shot) => {
              if (!shot.capturedAt) return;
              const dateObj = new Date(shot.capturedAt);
              if (isNaN(dateObj.getTime())) return;
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
              const bucketKey = `${hour}:${minute < 30 ? "00" : "30"}`;
              if (!screenshotBucketMap[bucketKey]) {
                screenshotBucketMap[bucketKey] = { total: 0, count: 0 };
              }
              screenshotBucketMap[bucketKey].total += Number(shot.activityScore) || 0;
              screenshotBucketMap[bucketKey].count += 1;
            });

            const activityEventsByBucket = {};
            userActivities.forEach((act) => {
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
              const bucketKey = `${hour}:${minute < 30 ? "00" : "30"}`;
              if (!activityEventsByBucket[bucketKey]) {
                activityEventsByBucket[bucketKey] = { totalActions: 0, eventCount: 0 };
              }
              const actions = (act.keyPresses || 0) + (act.mouseClicks || 0) + (act.mouseMoves || 0);
              activityEventsByBucket[bucketKey].totalActions += actions;
              activityEventsByBucket[bucketKey].eventCount += 1;
            });

            const allBucketTimes = new Set([
              ...Object.keys(activityEventsByBucket),
              ...Object.keys(screenshotBucketMap),
            ]);

            if (allBucketTimes.size > 0) {
              activityBuckets = Array.from(allBucketTimes)
                .map((time) => {
                  let value = 0;
                  if (screenshotBucketMap[time]) {
                    const data = screenshotBucketMap[time];
                    value = Math.round(data.total / data.count);
                  } else if (activityEventsByBucket[time]) {
                    const data = activityEventsByBucket[time];
                    const avgActionsPerEvent = data.totalActions / (data.eventCount || 1);
                    const score = Math.min(Math.round((avgActionsPerEvent / 30) * 100), 100);
                    value = Math.max(score, data.totalActions > 0 ? 10 : 0);
                  }
                  return { time, value };
                })
                .sort((a, b) => {
                  const [ah, am] = a.time.split(":").map(Number);
                  const [bh, bm] = b.time.split(":").map(Number);
                  return ah * 60 + am - (bh * 60 + bm);
                });

              const activeBuckets = activityBuckets.filter((item) => item.value > 0);
              if (activeBuckets.length > 0) {
                const averageScore =
                  activeBuckets.reduce((sum, item) => sum + item.value, 0) /
                  activeBuckets.length;
                userActivityScore = Math.round(averageScore);
              } else {
                userActivityScore = 0;
              }
            }
          } catch (bucketErr) {
            // Gracefully ignore telemetry lookup errors to avoid blocking attendance
          }
        }

        const userIntel = intelligenceByUser.get(userTargetId);
        const unusualActivityMinutes = userIntel?.unusualActivityMinutes ?? null;
        const unusualActivityMeasured = userIntel?.unusualActivityMeasured ?? false;
        const unusualActivityCount = userIntel?.unusualActivityCount;
        const bucketPatterns = userIntel?.bucketPatterns || {};

        if (Array.isArray(activityBuckets)) {
          activityBuckets.forEach((b) => {
            if (bucketPatterns[b.time]?.unusualInput) {
              b.unusualInput = true;
            }
          });
        }

        return {
          id: userTargetId,
          _id: user._id || userTargetId,
          activityBuckets,
          activityScore: userActivityScore,
          unusualActivityMinutes,
          unusualActivityMeasured,
          unusualActivityCount,

          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          avatar: getAvatarUrl(user.avatar),

          managers: Array.isArray(user.managers)
            ? user.managers
                .filter((m) => m && typeof m === "object")
                .map((m) => ({
                  _id: normalizeId(m._id || m.id),
                  id: normalizeId(m._id || m.id),
                  firstName: m.firstName,
                  lastName: m.lastName,
                  email: m.email,
                }))
            : [],

          manager: user.manager
            ? {
                _id: normalizeId(user.manager._id || user.manager.id),
                id: normalizeId(user.manager._id || user.manager.id),
                firstName: user.manager.firstName,
                lastName: user.manager.lastName,
                email: user.manager.email,
              }
            : null,

          isTracking: user.devices?.some((device) => device.isOnline) ?? false,

          team: user.team || "Default team",

          name: `${user.firstName} ${user.lastName}`,

          workSeconds,

          breakSeconds,

          workTime: formatTime(workSeconds),

          breakTime: formatTime(breakSeconds),

          startTime: firstPunchTime,

          finishTime: lastPunchTime,

          sessionsCount: sessions.length,

          sessions,

          dailyData: dailyDataArray,

          timezone,
        };
      });

    attendance.sort((a, b) => {
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
          break;
      }

      return order === "asc" ? comparison : -comparison;
    });

    return res.json(attendance);
  } catch (error) {
    console.error("GET ATTENDANCE DATA ERROR:", error);
    res.status(500).json({
      message: "Failed to get attendance data",
      error: "Failed to get attendance data",
    });
  }
};

export const getUserAttendanceSummary = async (req, res) => {
  try {
    const { userId } = req.params;
    const callerOrgId = normalizeId(req.user.organizationId || req.user.organization);
    const callerUserId = normalizeId(req.user._id || req.user.id);
    const targetUserId = normalizeId(userId);

    // Subordinate access gating: enforce reportAccess boundaries when inspecting other users
    if (targetUserId.toString() !== callerUserId.toString()) {
      const allowedUserIds = await getReportUserIds(req.user);

      if (
        allowedUserIds &&
        !allowedUserIds.some((id) => id.toString() === targetUserId.toString())
      ) {
        return res.status(403).json({
          message: "Permission denied",
        });
      }
    }

    const user = await userRepository.findUserByIdAndOrganization(targetUserId, callerOrgId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const timezone = resolveUserTimezone(user, req);
    const today = getTodayInTimezone(timezone);

    const { start, end } = getZonedDayRange(today, timezone);

    const sessions = await sessionRepository.findOverlappingSessions({
      userId: targetUserId,
      periodStart: start,
      periodEnd: end,
    });

    const evalNow = new Date();
    let workSeconds = 0;
    let breakSeconds = 0;

    for (const s of sessions) {
      const { overlapSeconds } = calculateIntervalOverlap(
        s,
        start,
        end,
        evalNow,
      );
      if (s.type === "work") {
        workSeconds += overlapSeconds;
      } else if (s.type === "break") {
        breakSeconds += overlapSeconds;
      }
    }

    res.json({
      workSeconds,
      breakSeconds,
      workTime: formatTime(workSeconds),
      breakTime: formatTime(breakSeconds),
    });
  } catch (err) {
    console.error("GET USER ATTENDANCE SUMMARY ERROR:", err);

    res.status(500).json({
      message: "Failed to get attendance summary",
      error: "Failed to get attendance summary",
    });
  }
};

export const finishAttendance = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;

    const user = await userRepository.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const timezone = resolveUserTimezone(user, req);

    const now = new Date();
    const today = getTodayInTimezone(timezone);

    const { start, end } = getZonedDayRange(today, timezone);

    const sessions = await sessionRepository.findOverlappingSessions({
      userId,
      periodStart: start,
      periodEnd: end,
    });

    let workSeconds = 0;
    let breakSeconds = 0;

    for (const session of sessions) {
      const { overlapSeconds } = calculateIntervalOverlap(
        session,
        start,
        end,
        now,
      );
      if (session.type === "work") {
        workSeconds += overlapSeconds;
      } else if (session.type === "break") {
        breakSeconds += overlapSeconds;
      }
    }

    const firstSession = [...sessions].sort(
      (a, b) => new Date(a.startTime) - new Date(b.startTime),
    )[0];

    const attendance = await attendanceRepository.findOneAndUpdate(
      {
        user: userId,
        date: {
          gte: start,
          lt: end,
        },
      },
      {
        $set: {
          user: userId,
          organization: req.user.organization,
          date: firstSession?.startTime || now,
          workTime: workSeconds,
          breakTime: breakSeconds,
          startTime: firstSession?.startTime || null,
          finishTime: now,
        },
      },
      {
        new: true,
        upsert: true,
      },
    );

    const reportRecord = await Report.create({
      user: userId,
      type: "daily-work",
      status: "done",
      generatedAt: now,
      startDate: today,
      endDate: today,
    });

    const report = await generateDailyWorkReport(userId);

    // Send the report by email.
    // Email failure must not fail Finish Day.
    await sendDailyWorkReportEmail({
      user,
      report,
    });

    return res.json({
      success: true,
      message: "Workday finished successfully",
      attendance,
      report,
      reportRecord,
    });
  } catch (err) {
    console.error("FINISH ATTENDANCE ERROR:", err);

    return res.status(500).json({
      message: "Failed to finish workday",
      error: "Failed to finish workday",
    });
  }
};

export const getDailyWorkReport = async (req, res) => {
  try {
    const userId = req.user._id;
    const { date } = req.query;

    const report = await generateDailyWorkReport(userId, date || null);

    return res.json({
      success: true,
      report,
    });
  } catch (err) {
    console.error("GET DAILY WORK REPORT ERROR:", err);

    return res.status(500).json({
      message: "Failed to get daily work report",
      error: "Failed to get daily work report",
    });
  }
};
