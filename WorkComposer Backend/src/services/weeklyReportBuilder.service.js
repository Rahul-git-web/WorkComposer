import {
  sessionRepository,
  screenshotRepository,
  appUsageRepository,
  usageLogRepository,
  projectRepository,
  taskRepository,
  userRepository,
} from "../db/repositories/index.js";
import { getZonedDayRange, resolveUserTimezone } from "../utils/timezone.js";

export const buildWeeklyReport = async (userId, startDate, endDate, options = {}) => {
  let user = options.user;
  if (!user) {
    user = await userRepository.findById(userId, { populateOrganization: true });
  }

  const timezone = options.timezone || resolveUserTimezone(user);
  const periodStart = getZonedDayRange(startDate, timezone).start;
  const periodEnd = getZonedDayRange(endDate, timezone).end;

  const sessions = await sessionRepository.findOverlappingSessions({
    userId,
    periodStart,
    periodEnd,
  });

  let workedSeconds = 0;
  let breakSeconds = 0;
  let firstStartTime = null;
  let lastStopTime = null;
  const presentDates = new Set();

  for (const session of sessions) {
    const sStart = new Date(session.startTime);
    const sEnd = session.endTime
      ? new Date(session.endTime)
      : (session.updatedAt ? new Date(session.updatedAt) : periodEnd);
    const clampedStart = Math.max(periodStart.getTime(), sStart.getTime());
    const clampedEnd = Math.min(periodEnd.getTime(), sEnd.getTime());
    const duration = Math.max(0, Math.floor((clampedEnd - clampedStart) / 1000));

    if (session.type === "work") {
      workedSeconds += duration;
      if (duration > 0 && session.date) {
        presentDates.add(session.date);
      }
      if (!firstStartTime || sStart < new Date(firstStartTime)) {
        firstStartTime = session.startTime;
      }
      if (session.endTime && (!lastStopTime || new Date(session.endTime) > new Date(lastStopTime))) {
        lastStopTime = session.endTime;
      }
    } else if (session.type === "break") {
      breakSeconds += duration;
    }
  }

  const presentDays = presentDates.size;
  const attendance = `${presentDays} day${presentDays !== 1 ? "s" : ""}`;

  const screenshots = await screenshotRepository.find({
    userId,
    capturedAt: { gte: periodStart, lt: periodEnd },
  });

  const screenshotsCount = screenshots.length;
  let productivity = 0;
  if (screenshotsCount > 0) {
    const totalScore = screenshots.reduce(
      (sum, shot) => sum + (shot.activityScore || 0),
      0,
    );
    productivity = Math.round(totalScore / screenshotsCount);
  }

  const idleSeconds = Math.round(
    workedSeconds * ((100 - productivity) / 100),
  );

  const activeMinutes = Math.round(
    (workedSeconds - idleSeconds) / 60,
  );

  let appUsage = [];
  try {
    appUsage = await appUsageRepository.find({
      userId,
    });
  } catch {}

  const appMap = new Map();
  for (const app of appUsage || []) {
    if (app.date >= startDate && app.date <= endDate) {
      if (!appMap.has(app.appName)) {
        appMap.set(app.appName, 0);
      }
      appMap.set(app.appName, appMap.get(app.appName) + (app.duration || 0));
    }
  }

  const appsUsed = [...appMap.entries()]
    .map(([appName, duration]) => ({
      appName,
      duration,
    }))
    .sort((a, b) => b.duration - a.duration);

  let usageLogs = [];
  try {
    usageLogs = await usageLogRepository.find({
      userId,
      startTime: { gte: periodStart, lt: periodEnd },
    });
  } catch {}

  const urlsVisited = [
    ...new Set((usageLogs || []).map((log) => log.url).filter(Boolean)),
  ];

  let projects = [];
  try {
    projects = await projectRepository.find({
      members: userId,
    });
  } catch {}

  const reportProjects = (projects || []).map((project) => ({
    id: project.id || project._id,
    name: project.name,
  }));

  let tasks = [];
  try {
    tasks = await taskRepository.find({
      assignedTo: userId,
    });
  } catch {}

  const tasksSummary = {
    local: (tasks || []).filter(
      (task) => !task.jiraTaskId && !task.asanaTaskId,
    ).length,
    jira: (tasks || []).filter((task) => task.jiraTaskId).length,
    asana: (tasks || []).filter((task) => task.asanaTaskId).length,
  };
  tasksSummary.total =
    tasksSummary.local + tasksSummary.jira + tasksSummary.asana;

  return {
    attendance,
    workedSeconds,
    breakSeconds,
    idleSeconds,
    productivity,
    screenshots: screenshotsCount,
    appsUsed,
    urlsVisited,
    projects: reportProjects,
    tasks: tasksSummary,
    firstStartTime,
    lastStopTime,
    activeMinutes,
    timeline: [],
    reportUrl: `/dashboard/reports/tracking?user=${userId}&start=${startDate}&end=${endDate}`,
  };
};
