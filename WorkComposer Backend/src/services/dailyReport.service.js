import {
  activityRepository,
  appClassificationRepository,
  appUsageRepository,
  attendanceRepository,
  manualTimeRequestRepository,
  projectTrackingRepository,
  screenshotRepository,
  sessionRepository,
  taskRepository,
  timeTrackingSettingsRepository,
  userRepository,
} from "../db/repositories/index.js";
import { normalizeId } from "../security/effectiveAuthContext.js";
import { resolveAppBaseUrl, sanitizeHttpUrl } from "../utils/emailSanitizer.js";
import {
  calculateIntervalOverlap,
  getTodayInTimezone,
  getZonedDayRange,
  resolveUserTimezone,
} from "../utils/timezone.js";

const formatTime = (seconds = 0) => {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);

  return `${hours}h ${minutes}m`;
};

const formatClockTime = (date, timezone) => {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  });
};

const sumMergedSessionSeconds = (sessions, type, start, end, evalNow) => {
  const intervals = [];
  for (const s of sessions || []) {
    if (!s || s.type !== type) continue;
    const { overlapSeconds, overlapStart, overlapEnd } = calculateIntervalOverlap(
      s,
      start,
      end,
      evalNow,
    );
    if (overlapSeconds > 0 && overlapStart && overlapEnd) {
      intervals.push({
        start: overlapStart.getTime(),
        end: overlapEnd.getTime(),
      });
    }
  }

  if (intervals.length === 0) return 0;

  intervals.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const curr = intervals[i];
    const prev = merged[merged.length - 1];
    if (curr.start <= prev.end) {
      if (curr.end > prev.end) prev.end = curr.end;
    } else {
      merged.push(curr);
    }
  }

  let totalSeconds = 0;
  for (const interval of merged) {
    totalSeconds += Math.floor((interval.end - interval.start) / 1000);
  }
  return totalSeconds;
};

const parseClockMinutes = (hhmm) => {
  if (!hhmm || typeof hhmm !== "string" || !hhmm.includes(":")) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

const computeShiftSummary = ({ user, timeTrackingSettings, today, timezone, workSeconds }) => {
  const schedule =
    user?.shiftSettings?.schedule ??
    timeTrackingSettings?.shift?.schedule ??
    [];

  const [y, m, d] = today.split("-").map(Number);
  const noonUtc = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  }).format(noonUtc);

  const dayShift = Array.isArray(schedule)
    ? schedule.find((entry) => entry?.day === weekday)
    : null;

  if (!dayShift || !dayShift.enabled) {
    return {
      hasShift: false,
      day: weekday,
      scheduledStart: null,
      scheduledEnd: null,
      expectedSeconds: 0,
      expectedTime: "0h 0m",
      deltaSeconds: 0,
      varianceSeconds: 0,
      overtimeSeconds: 0,
      overtimeTime: "0h 0m",
      varianceTime: "0h 0m",
      status: "unscheduled",
    };
  }

  const startMin = parseClockMinutes(dayShift.startTime) ?? 0;
  let endMin = parseClockMinutes(dayShift.endTime) ?? startMin;
  if (endMin <= startMin) endMin += 24 * 60;

  let breakSeconds = 0;
  for (const brk of dayShift.breaks || []) {
    const bs = parseClockMinutes(brk?.startTime);
    let be = parseClockMinutes(brk?.endTime);
    if (bs !== null && be !== null) {
      if (be <= bs) be += 24 * 60;
      breakSeconds += Math.max(0, (be - bs) * 60);
    }
  }

  const expectedSeconds = Math.max(0, (endMin - startMin) * 60 - breakSeconds);
  const deltaSeconds = workSeconds - expectedSeconds;
  const overtimeSeconds = Math.max(0, deltaSeconds);

  let status = "on-track";
  if (expectedSeconds > 0) {
    if (deltaSeconds >= 300) status = "overtime";
    else if (deltaSeconds < -300) status = "undertime";
  }

  const absDelta = Math.abs(deltaSeconds);
  const variancePrefix = deltaSeconds > 0 ? "+" : deltaSeconds < 0 ? "-" : "";

  return {
    hasShift: true,
    day: weekday,
    scheduledStart: dayShift.startTime || null,
    scheduledEnd: dayShift.endTime || null,
    expectedSeconds,
    expectedTime: formatTime(expectedSeconds),
    deltaSeconds,
    varianceSeconds: deltaSeconds,
    overtimeSeconds,
    overtimeTime: formatTime(overtimeSeconds),
    varianceTime: `${variancePrefix}${formatTime(absDelta)}`,
    status,
  };
};

export const generateDailyWorkReport = async (
  userId,
  reportDate = null,
  options = {},
) => {
  const normalizedUserId = normalizeId(userId);
  const user = await userRepository.findById(normalizedUserId, {
    populateOrganization: true,
  });

  if (!user) {
    throw new Error("User not found");
  }

  const timezone = options.timezone || resolveUserTimezone(user);
  const now = new Date();
  const today = reportDate || getTodayInTimezone(timezone, now);
  const { start, end } = getZonedDayRange(today, timezone);
  const orgId = normalizeId(
    user.organization?.id ||
      user.organization?._id ||
      user.organization ||
      user.organizationId,
  );

  // Parallel reads across verified repositories for the target user/day
  const [
    attendance,
    sessions,
    activitiesByTimestamp,
    activitiesByDate,
    screenshots,
    trackingRecords,
    appUsages,
    classifications,
    manualRequests,
    timeTrackingSettings,
    assignedTasks,
  ] = await Promise.all([
    attendanceRepository
      .findOne({ user: normalizedUserId, date: { gte: start, lt: end } })
      .catch(() => null),
    sessionRepository
      .findOverlappingSessions({ userId: normalizedUserId, periodStart: start, periodEnd: end })
      .catch(() => []),
    activityRepository
      .find({ user: normalizedUserId, eventTimestamp: { gte: start, lt: end } })
      .catch(() => []),
    activityRepository
      .find({ user: normalizedUserId, date: today })
      .catch(() => []),
    screenshotRepository
      .find({ user: normalizedUserId, capturedAt: { gte: start, lt: end } })
      .catch(() => []),
    projectTrackingRepository
      .find(
        { user: normalizedUserId, date: today },
        { populateProject: true, populateTask: true },
      )
      .catch(() => []),
    appUsageRepository
      .find({ user: normalizedUserId, date: today })
      .catch(() => []),
    orgId
      ? appClassificationRepository.find({ organization: orgId }).catch(() => [])
      : Promise.resolve([]),
    manualTimeRequestRepository
      .find({ requestedBy: normalizedUserId, date: today })
      .catch(() => []),
    orgId
      ? timeTrackingSettingsRepository.findOne({ organization: orgId }).catch(() => null)
      : Promise.resolve(null),
    taskRepository
      .find({ assignedTo: normalizedUserId })
      .catch(() => []),
  ]);

  // -----------------------------------------
  // SESSIONS & ATTENDANCE SUMMARY
  // -----------------------------------------
  const sortedSessions = [...(sessions || [])].sort(
    (a, b) => new Date(a.startTime) - new Date(b.startTime),
  );
  const evalNow = options.finishTime ? new Date(options.finishTime) : now;

  const workSeconds =
    typeof options.workSeconds === "number"
      ? options.workSeconds
      : sumMergedSessionSeconds(sortedSessions, "work", start, end, evalNow);
  const breakSeconds =
    typeof options.breakSeconds === "number"
      ? options.breakSeconds
      : sumMergedSessionSeconds(sortedSessions, "break", start, end, evalNow);

  const firstSession = sortedSessions[0] || null;
  const lastSession =
    sortedSessions.length > 0 ? sortedSessions[sortedSessions.length - 1] : null;

  const rawStartTime =
    options.startTime || attendance?.startTime || firstSession?.startTime || null;
  const rawFinishTime =
    options.finishTime || attendance?.finishTime || lastSession?.endTime || null;

  const totalSpanSeconds =
    rawStartTime && rawFinishTime
      ? Math.max(
          0,
          Math.floor(
            (new Date(rawFinishTime).getTime() - new Date(rawStartTime).getTime()) /
              1000,
          ),
        )
      : 0;

  // -----------------------------------------
  // ACTIVITY & SCREENSHOTS
  // -----------------------------------------
  const activityMap = new Map();
  for (const act of [...(activitiesByTimestamp || []), ...(activitiesByDate || [])]) {
    const id = String(act?._id || act?.id || Math.random());
    if (!activityMap.has(id)) {
      activityMap.set(id, act);
    }
  }
  const activities = Array.from(activityMap.values());

  const keyPresses = activities.reduce((sum, act) => sum + (Number(act.keyPresses) || 0), 0);
  const mouseClicks = activities.reduce((sum, act) => sum + (Number(act.mouseClicks) || 0), 0);
  const mouseMoves = activities.reduce((sum, act) => sum + (Number(act.mouseMoves) || 0), 0);

  const screenshotCount = (screenshots || []).length;
  let activityScore = 0;
  if (screenshotCount > 0) {
    activityScore = Math.round(
      screenshots.reduce((sum, s) => sum + (Number(s.activityScore) || 0), 0) /
        screenshotCount,
    );
  } else if (activities.length > 0 && workSeconds > 0) {
    const activeBuckets = activities.filter(
      (a) => (a.keyPresses || 0) + (a.mouseClicks || 0) + (a.mouseMoves || 0) > 0,
    ).length;
    const workedMinutes = Math.max(1, Math.round(workSeconds / 60));
    activityScore = Math.min(100, Math.round((activeBuckets / workedMinutes) * 100));
  }

  const idleSeconds =
    workSeconds > 0
      ? Math.max(0, Math.round(workSeconds * ((100 - activityScore) / 100)))
      : 0;
  const activeSeconds = Math.max(0, workSeconds - idleSeconds);

  // -----------------------------------------
  // SHIFT TARGET & ADHERENCE
  // -----------------------------------------
  const shift = computeShiftSummary({
    user,
    timeTrackingSettings,
    today,
    timezone,
    workSeconds,
  });

  // -----------------------------------------
  // MANUAL TIME REQUESTS
  // -----------------------------------------
  let approvedManualWorkSeconds = 0;
  let approvedManualBreakSeconds = 0;
  let pendingManualCount = 0;
  let rejectedManualCount = 0;

  const formattedRequests = (manualRequests || []).map((reqItem) => {
    const dur = Math.max(0, Math.round(Number(reqItem.duration) || 0));
    if (reqItem.status === "approved") {
      if (reqItem.type === "break") approvedManualBreakSeconds += dur;
      else approvedManualWorkSeconds += dur;
    } else if (reqItem.status === "pending") {
      pendingManualCount++;
    } else if (reqItem.status === "rejected") {
      rejectedManualCount++;
    }

    return {
      id: reqItem.id || reqItem._id,
      type: reqItem.type || "work",
      status: reqItem.status || "pending",
      duration: dur,
      time: formatTime(dur),
      reason: reqItem.reason || "",
    };
  });

  const approvedManualTotalSeconds =
    approvedManualWorkSeconds + approvedManualBreakSeconds;

  // -----------------------------------------
  // PROJECT & TASK ROLLUPS
  // -----------------------------------------
  const taskPairMap = new Map();
  const projectRollupMap = new Map();
  let totalProjectTrackedSeconds = 0;

  for (const record of trackingRecords || []) {
    const projId = record.project?._id?.toString() || record.project?.id?.toString() || "no-project";
    const taskId = record.task?._id?.toString() || record.task?.id?.toString() || "no-task";
    const dur = Math.max(0, Math.round(Number(record.duration) || 0));
    const pairKey = `${projId}-${taskId}`;

    if (!taskPairMap.has(pairKey)) {
      taskPairMap.set(pairKey, {
        project: record.project
          ? {
              _id: record.project._id || record.project.id,
              name: record.project.name || "Untitled Project",
            }
          : null,
        task: record.task
          ? {
              _id: record.task._id || record.task.id,
              title: record.task.title || "Untitled Task",
              status: record.task.status || "todo",
              priority: record.task.priority || "medium",
            }
          : null,
        duration: 0,
      });
    }
    taskPairMap.get(pairKey).duration += dur;

    if (!projectRollupMap.has(projId)) {
      projectRollupMap.set(projId, {
        id: projId,
        name: record.project?.name || "No Project",
        duration: 0,
        taskIds: new Set(),
      });
    }
    const rollup = projectRollupMap.get(projId);
    rollup.duration += dur;
    if (taskId !== "no-task") {
      rollup.taskIds.add(taskId);
    }
    totalProjectTrackedSeconds += dur;
  }

  const taskSummary = Array.from(taskPairMap.values())
    .map((item) => ({
      ...item,
      time: formatTime(item.duration),
    }))
    .sort((a, b) => b.duration - a.duration);

  const projectsSummary = Array.from(projectRollupMap.values())
    .map((proj) => ({
      id: proj.id,
      name: proj.name,
      duration: proj.duration,
      time: formatTime(proj.duration),
      percentage:
        totalProjectTrackedSeconds > 0
          ? Math.round((proj.duration / totalProjectTrackedSeconds) * 100)
          : 0,
      taskCount: proj.taskIds.size,
    }))
    .sort((a, b) => b.duration - a.duration);

  const completedTodayCount = (assignedTasks || []).filter((t) => {
    if (t.status !== "completed" || !t.updatedAt) return false;
    const upd = new Date(t.updatedAt);
    return upd >= start && upd < end;
  }).length;

  // -----------------------------------------
  // APPS & PRODUCTIVITY CATEGORIZATION
  // -----------------------------------------
  const classificationLookup = new Map();
  for (const item of classifications || []) {
    const key = String(item.appName || "").trim().toLowerCase();
    if (key) {
      classificationLookup.set(key, item.productivity || "neutral");
    }
  }

  const appAggMap = new Map();
  let productiveSeconds = 0;
  let neutralSeconds = 0;
  let unproductiveSeconds = 0;

  for (const usage of appUsages || []) {
    const rawName = String(usage.appName || "").trim();
    if (!rawName) continue;
    const key = rawName.toLowerCase();
    const dur = Math.max(0, Math.round(Number(usage.duration) || 0));
    const category = classificationLookup.get(key) || "neutral";

    if (category === "productive") productiveSeconds += dur;
    else if (category === "unproductive") unproductiveSeconds += dur;
    else neutralSeconds += dur;

    if (!appAggMap.has(key)) {
      appAggMap.set(key, {
        appName: rawName,
        duration: 0,
        classification: category,
      });
    }
    appAggMap.get(key).duration += dur;
  }

  const totalUsageSeconds = productiveSeconds + neutralSeconds + unproductiveSeconds;
  const appsUsed = Array.from(appAggMap.values())
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 10)
    .map((app) => ({
      ...app,
      time: formatTime(app.duration),
      percentage:
        totalUsageSeconds > 0
          ? Math.round((app.duration / totalUsageSeconds) * 100)
          : 0,
    }));

  const productivityScore =
    totalUsageSeconds > 0
      ? Math.round((productiveSeconds / totalUsageSeconds) * 100)
      : 0;

  const baseAppUrl = resolveAppBaseUrl();
  const reportUrl = sanitizeHttpUrl(
    `${baseAppUrl}/dashboard/time-tracking/overview`,
    "",
  );

  // -----------------------------------------
  // FINAL REPORT PAYLOAD (Backward Compatible + Enriched)
  // -----------------------------------------
  return {
    date: today,
    timezone,
    reportUrl,
    isFinished: Boolean(attendance?.finishTime || options.finishTime),

    user: {
      id: user._id || user.id,
      name: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
      email: user.email,
    },

    summary: {
      startTime: formatClockTime(rawStartTime, timezone),
      finishTime: formatClockTime(rawFinishTime, timezone),
      workSeconds,
      breakSeconds,
      activeSeconds,
      idleSeconds,
      totalSpanSeconds,
      manualApprovedSeconds: approvedManualTotalSeconds,
      workTime: formatTime(workSeconds),
      breakTime: formatTime(breakSeconds),
      activeTime: formatTime(activeSeconds),
      idleTime: formatTime(idleSeconds),
      totalSpanTime: formatTime(totalSpanSeconds),
      manualApprovedTime: formatTime(approvedManualTotalSeconds),
      sessionsCount: sortedSessions.length,
    },

    shift,

    activity: {
      keyPresses,
      mouseClicks,
      mouseMoves,
      screenshotCount,
      activityScore,
    },

    productivity: {
      score: productivityScore,
      productiveSeconds,
      neutralSeconds,
      unproductiveSeconds,
      totalUsageSeconds,
      productiveTime: formatTime(productiveSeconds),
      neutralTime: formatTime(neutralSeconds),
      unproductiveTime: formatTime(unproductiveSeconds),
    },

    manualTime: {
      approvedSeconds: approvedManualTotalSeconds,
      approvedWorkSeconds: approvedManualWorkSeconds,
      approvedBreakSeconds: approvedManualBreakSeconds,
      approvedTime: formatTime(approvedManualTotalSeconds),
      pendingCount: pendingManualCount,
      rejectedCount: rejectedManualCount,
      requests: formattedRequests,
    },

    projects: projectsSummary,
    tasks: taskSummary,
    taskStats: {
      trackedCount: taskSummary.length,
      completedTodayCount,
    },
    appsUsed,

    sessions: sortedSessions.map((session) => {
      const { overlapSeconds } = calculateIntervalOverlap(
        session,
        start,
        end,
        evalNow,
      );
      return {
        id: session._id || session.id,
        type: session.type,
        startTime: formatClockTime(session.startTime, timezone),
        endTime: formatClockTime(session.endTime || (session.endTime ? session.endTime : null), timezone),
        duration: overlapSeconds,
        time: formatTime(overlapSeconds),
      };
    }),
  };
};
