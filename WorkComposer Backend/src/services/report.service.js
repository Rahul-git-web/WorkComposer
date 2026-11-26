import {
  organizationRepository,
  taskRepository,
  userRepository,
  sessionRepository,
} from "../db/repositories/index.js";
import {
  getZonedDayRange,
  getTodayInTimezone,
  DEFAULT_TIMEZONE,
} from "../utils/timezone.js";

export const getDailySummary = async (organizationId, reportDate = null, customTimezone = null) => {
  let timezone = customTimezone;
  if (!timezone) {
    const org = await organizationRepository.findById(organizationId);
    timezone = org?.timezone || DEFAULT_TIMEZONE;
  }

  const today = reportDate || getTodayInTimezone(timezone);
  const { start, end } = getZonedDayRange(today, timezone);

  const tasksCreated = await taskRepository.count({
    organizationId,
    createdAt: {
      gte: start,
      lt: end,
    },
  });

  const tasksCompleted = await taskRepository.count({
    organizationId,
    status: "completed",
    updatedAt: {
      gte: start,
      lt: end,
    },
  });

  const users = await userRepository.find(
    {
      organization: organizationId,
    },
    { select: "_id firstName lastName" },
  );

  const userIds = (users || []).map((u) => u.id || u._id);
  const activeUserSet = new Set();
  const userDurationMap = new Map();

  let totalWorkSeconds = 0;
  let totalBreakSeconds = 0;

  if (userIds.length > 0) {
    const sessions = await sessionRepository.findOverlappingSessions({
      userIds,
      periodStart: start,
      periodEnd: end,
    });

    for (const session of sessions) {
      const sStart = new Date(session.startTime);
      const sEnd = session.endTime
        ? new Date(session.endTime)
        : (session.updatedAt ? new Date(session.updatedAt) : end);
      const clampedStart = Math.max(start.getTime(), sStart.getTime());
      const clampedEnd = Math.min(end.getTime(), sEnd.getTime());
      const duration = Math.max(0, Math.floor((clampedEnd - clampedStart) / 1000));

      const uId = String(session.userId || session.user);

      if (session.type === "work") {
        totalWorkSeconds += duration;
        if (duration > 0) {
          activeUserSet.add(uId);
          userDurationMap.set(uId, (userDurationMap.get(uId) || 0) + duration);
        }
      } else if (session.type === "break") {
        totalBreakSeconds += duration;
      }
    }
  }

  const breakHours = Math.floor(totalBreakSeconds / 3600);
  const breakMinutes = Math.floor((totalBreakSeconds % 3600) / 60);
  const totalBreakTime = `${breakHours}h ${breakMinutes}m`;

  const hours = Math.floor(totalWorkSeconds / 3600);
  const minutes = Math.floor((totalWorkSeconds % 3600) / 60);
  const totalWorkTime = `${hours}h ${minutes}m`;

  let topPerformerData = null;
  if (userDurationMap.size > 0) {
    let topUserId = null;
    let maxDuration = -1;

    for (const [uId, dur] of userDurationMap.entries()) {
      if (dur > maxDuration) {
        maxDuration = dur;
        topUserId = uId;
      }
    }

    if (topUserId) {
      const performer = (users || []).find((u) => String(u.id || u._id) === topUserId);
      if (performer) {
        topPerformerData = {
          name: `${performer.firstName} ${performer.lastName}`,
          workTime: `${Math.floor(maxDuration / 3600)}h ${Math.floor((maxDuration % 3600) / 60)}m`,
        };
      }
    }
  }

  return {
    date: today,
    tasksCreated,
    tasksCompleted,
    activeUsers: activeUserSet.size,
    totalWorkTime,
    totalBreakTime,
    topPerformer: topPerformerData,
  };
};

export const getWeeklySummary = async (organizationId, endDate = null, customTimezone = null) => {
  let timezone = customTimezone;
  if (!timezone) {
    const org = await organizationRepository.findById(organizationId);
    timezone = org?.timezone || DEFAULT_TIMEZONE;
  }

  const endStr = endDate || getTodayInTimezone(timezone);
  const [y, m, d] = endStr.split("-").map(Number);
  const startObj = new Date(Date.UTC(y, m - 1, d - 6));
  const startStr = startObj.toISOString().slice(0, 10);

  const periodStart = getZonedDayRange(startStr, timezone).start;
  const periodEnd = getZonedDayRange(endStr, timezone).end;

  const tasksCreated = await taskRepository.count({
    organizationId,
    createdAt: {
      gte: periodStart,
      lt: periodEnd,
    },
  });

  const tasksCompleted = await taskRepository.count({
    organizationId,
    status: "completed",
    updatedAt: {
      gte: periodStart,
      lt: periodEnd,
    },
  });

  const users = await userRepository.find(
    { organization: organizationId },
    { select: "_id firstName lastName" },
  );

  const userIds = (users || []).map((u) => u.id || u._id);
  const activeUserSet = new Set();
  const userDurationMap = new Map();

  let totalWorkSeconds = 0;
  let totalBreakSeconds = 0;

  if (userIds.length > 0) {
    const sessions = await sessionRepository.findOverlappingSessions({
      userIds,
      periodStart,
      periodEnd,
    });

    for (const session of sessions) {
      const sStart = new Date(session.startTime);
      const sEnd = session.endTime
        ? new Date(session.endTime)
        : (session.updatedAt ? new Date(session.updatedAt) : periodEnd);
      const clampedStart = Math.max(periodStart.getTime(), sStart.getTime());
      const clampedEnd = Math.min(periodEnd.getTime(), sEnd.getTime());
      const duration = Math.max(0, Math.floor((clampedEnd - clampedStart) / 1000));

      const uId = String(session.userId || session.user);

      if (session.type === "work") {
        totalWorkSeconds += duration;
        if (duration > 0) {
          activeUserSet.add(uId);
          userDurationMap.set(uId, (userDurationMap.get(uId) || 0) + duration);
        }
      } else if (session.type === "break") {
        totalBreakSeconds += duration;
      }
    }
  }

  const workHours = Math.floor(totalWorkSeconds / 3600);
  const workMinutes = Math.floor((totalWorkSeconds % 3600) / 60);
  const totalWorkTime = `${workHours}h ${workMinutes}m`;

  const breakHours = Math.floor(totalBreakSeconds / 3600);
  const breakMinutes = Math.floor((totalBreakSeconds % 3600) / 60);
  const totalBreakTime = `${breakHours}h ${breakMinutes}m`;

  let topPerformer = null;
  if (userDurationMap.size > 0) {
    let topUserId = null;
    let maxDuration = -1;

    for (const [uId, dur] of userDurationMap.entries()) {
      if (dur > maxDuration) {
        maxDuration = dur;
        topUserId = uId;
      }
    }

    if (topUserId) {
      const performer = (users || []).find((u) => String(u.id || u._id) === topUserId);
      topPerformer = {
        name: performer
          ? `${performer.firstName} ${performer.lastName}`
          : "Unknown User",
        workTime: `${Math.floor(maxDuration / 3600)}h ${Math.floor((maxDuration % 3600) / 60)}m`,
      };
    }
  }

  return {
    startDate: startStr,
    endDate: endStr,
    tasksCreated,
    tasksCompleted,
    activeUsers: activeUserSet.size,
    totalWorkTime,
    totalBreakTime,
    topPerformer,
  };
};
