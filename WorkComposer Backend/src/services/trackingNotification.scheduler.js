import cron from "node-cron";

import {
  userRepository,
  organizationRepository,
  timeTrackingSettingsRepository,
  sessionRepository,
  notificationRepository,
} from "../db/repositories/index.js";
import resolveTrackingSettings from "../utils/resolveTrackingSettings.js";
import { createNotification } from "./notification.service.js";
import {
  resolveUserTimezone,
  getTodayInTimezone,
  getZonedDayRange,
  calculateIntervalOverlap,
} from "../utils/timezone.js";

const SHIFT_ENDING_WARNING_MINUTES = 15;
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const getTimeParts = (time) => {
  if (!time || typeof time !== "string") {
    return null;
  }

  const [hours, minutes] = time.split(":").map(Number);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return {
    hours,
    minutes,
  };
};

const getMinutesFromTime = (time) => {
  const parts = getTimeParts(time);

  if (!parts) {
    return null;
  }

  return parts.hours * 60 + parts.minutes;
};

const getLocalDateTime = (timezone) => {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const get = (type) => parts.find((part) => part.type === type)?.value;

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: get("weekday"),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
};

const getLocalMinutes = (timezone) => {
  const local = getLocalDateTime(timezone);

  return local.hour * 60 + local.minute;
};

const isSameEventAlreadyCreated = async ({
  userId,
  organizationId,
  type,
  eventKey,
}) => {
  const existing = await notificationRepository.findOne({
    recipient: userId,
    organization: organizationId,
    type,
    "metadata.eventKey": eventKey,
  });

  return Boolean(existing);
};

const sendTrackingNotification = async ({
  user,
  organizationId,
  type,
  title,
  message,
  eventKey,
  metadata = {},
  notifications = {},
}) => {
  const preferenceMap = {
    SHIFT_STARTED: "shiftStarted",
    SHIFT_ENDING_SOON: "shiftEndingSoon",
    BREAK_STARTED: "breakStarted",
    BREAK_ENDED: "breakEnded",
    DAILY_TARGET_REACHED: "dailyTargetReached",
    OVERTIME_STARTED: "overtimeStarted",
  };

  const preferenceKey = preferenceMap[type];

  if (preferenceKey && notifications[preferenceKey] === false) {
    return;
  }

  const userId = String(user._id || user.id);

  const alreadyCreated = await isSameEventAlreadyCreated({
    userId,
    organizationId,
    type,
    eventKey,
  });

  if (alreadyCreated) {
    return;
  }

  await createNotification({
    recipientId: userId,
    organizationId,
    type,
    title,
    message,
    entityType: "tracking",
    metadata: {
      ...metadata,
      eventKey,
    },
  });
};

const getEffectiveShift = (schedule, timezone) => {
  const local = getLocalDateTime(timezone);
  const localMinutes = local.hour * 60 + local.minute;
  const today = getTodayInTimezone(timezone);

  // Check yesterday's shift first for overnight continuation
  const todayIdx = WEEKDAYS.indexOf(local.weekday);
  const yesterdayWeekday = WEEKDAYS[(todayIdx + 6) % 7];
  const yesterdayShift = schedule.find(
    (item) => item.day === yesterdayWeekday && item.enabled !== false,
  );

  if (yesterdayShift) {
    const yStart = getMinutesFromTime(yesterdayShift.startTime);
    const yEnd = getMinutesFromTime(yesterdayShift.endTime);
    if (yStart !== null && yEnd !== null && yStart >= yEnd) {
      if (localMinutes < yEnd) {
        const [year, month, day] = today.split("-").map(Number);
        const yDate = new Date(Date.UTC(year, month - 1, day - 1));
        const yesterdayDateStr = yDate.toISOString().split("T")[0];
        return {
          today: yesterdayDateStr,
          shift: yesterdayShift,
          isOvernightContinuation: true,
        };
      }
    }
  }

  const todayShift = schedule.find(
    (item) => item.day === local.weekday && item.enabled !== false,
  );

  return {
    today,
    shift: todayShift,
    isOvernightContinuation: false,
  };
};

const calculateDurationMinutes = (startMinutes, endMinutes) => {
  let duration = endMinutes - startMinutes;

  if (duration < 0) {
    duration += 24 * 60;
  }

  return duration;
};

const calculateExpectedWorkSeconds = (shift) => {
  const startMinutes = getMinutesFromTime(shift.startTime);
  const endMinutes = getMinutesFromTime(shift.endTime);

  if (startMinutes === null || endMinutes === null) {
    return 0;
  }

  const shiftMinutes = calculateDurationMinutes(startMinutes, endMinutes);

  const breakMinutes = (shift.breaks || []).reduce((total, breakItem) => {
    const breakStart = getMinutesFromTime(breakItem.startTime);
    const breakEnd = getMinutesFromTime(breakItem.endTime);

    if (breakStart === null || breakEnd === null) {
      return total;
    }

    return total + calculateDurationMinutes(breakStart, breakEnd);
  }, 0);

  return Math.max(0, shiftMinutes - breakMinutes) * 60;
};

const getWorkedSecondsForDate = async (userId, targetDate, timezone) => {
  const { start: periodStart, end: periodEnd } = getZonedDayRange(targetDate, timezone);

  const sessions = await sessionRepository.findOverlappingSessions({
    userId,
    periodStart,
    periodEnd,
    type: "work",
  });

  return (sessions || []).reduce((total, session) => {
    const { overlapSeconds } = calculateIntervalOverlap(session, periodStart, periodEnd);
    return total + overlapSeconds;
  }, 0);
};

const processUserTrackingNotifications = async (user, organizationSettings) => {
  const orgId = String(
    user.organization?.id || user.organization?._id || user.organization || user.organizationId || "",
  );
  if (!orgId) {
    return;
  }

  const organization = {
    ...organizationSettings,
  };

  const settings = resolveTrackingSettings(organization, user);
  const notifications = settings.notifications || {};

  if (!settings.shift?.enabled || !Array.isArray(settings.shift?.schedule)) {
    return;
  }

  const timezone = resolveUserTimezone(user);
  const { today, shift } = getEffectiveShift(settings.shift.schedule, timezone);

  if (!shift) {
    return;
  }

  const localMinutes = getLocalMinutes(timezone);
  const shiftStartMinutes = getMinutesFromTime(shift.startTime);
  const shiftEndMinutes = getMinutesFromTime(shift.endTime);

  if (shiftStartMinutes === null || shiftEndMinutes === null) {
    return;
  }

  const shiftDurationMinutes = calculateDurationMinutes(
    shiftStartMinutes,
    shiftEndMinutes,
  );

  /*
   * SHIFT STARTED
   */
  if (localMinutes === shiftStartMinutes) {
    await sendTrackingNotification({
      user,
      organizationId: orgId,
      notifications,
      type: "SHIFT_STARTED",
      title: "Shift started",
      message: "Your scheduled shift has started.",
      eventKey: `shift-started:${today}`,
      metadata: {
        date: today,
        startTime: shift.startTime,
        endTime: shift.endTime,
      },
    });
  }

  /*
   * SHIFT ENDING SOON
   */
  if (shiftDurationMinutes >= SHIFT_ENDING_WARNING_MINUTES) {
    const minutesUntilEnd = calculateDurationMinutes(
      localMinutes,
      shiftEndMinutes,
    );

    const isInsideShift =
      shiftStartMinutes < shiftEndMinutes
        ? localMinutes >= shiftStartMinutes && localMinutes < shiftEndMinutes
        : localMinutes >= shiftStartMinutes || localMinutes < shiftEndMinutes;

    if (isInsideShift && minutesUntilEnd === SHIFT_ENDING_WARNING_MINUTES) {
      await sendTrackingNotification({
        user,
        organizationId: orgId,
        notifications,
        type: "SHIFT_ENDING_SOON",
        title: "Shift ending soon",
        message: `Your scheduled shift ends in ${SHIFT_ENDING_WARNING_MINUTES} minutes.`,
        eventKey: `shift-ending-soon:${today}`,
        metadata: {
          date: today,
          endTime: shift.endTime,
          minutesRemaining: SHIFT_ENDING_WARNING_MINUTES,
        },
      });
    }
  }

  /*
   * BREAK START / END
   */
  for (const breakItem of shift.breaks || []) {
    const breakStart = getMinutesFromTime(breakItem.startTime);
    const breakEnd = getMinutesFromTime(breakItem.endTime);

    if (breakStart === null || breakEnd === null) {
      continue;
    }

    const breakName = breakItem.name?.trim() || "Scheduled break";

    if (localMinutes === breakStart) {
      await sendTrackingNotification({
        user,
        organizationId: orgId,
        notifications,
        type: "BREAK_STARTED",
        title: "Scheduled break started",
        message: `${breakName} has started.`,
        eventKey: `break-started:${today}:${breakItem.startTime}`,
        metadata: {
          date: today,
          name: breakName,
          startTime: breakItem.startTime,
          endTime: breakItem.endTime,
        },
      });
    }

    if (localMinutes === breakEnd) {
      await sendTrackingNotification({
        user,
        organizationId: orgId,
        notifications,
        type: "BREAK_ENDED",
        title: "Scheduled break ended",
        message: `${breakName} has ended. Tracking can resume.`,
        eventKey: `break-ended:${today}:${breakItem.endTime}`,
        metadata: {
          date: today,
          name: breakName,
          startTime: breakItem.startTime,
          endTime: breakItem.endTime,
        },
      });
    }
  }

  /*
   * DAILY TARGET
   */
  const expectedWorkSeconds = calculateExpectedWorkSeconds(shift);

  if (expectedWorkSeconds > 0) {
    const userId = String(user._id || user.id);
    const workedSeconds = await getWorkedSecondsForDate(userId, today, timezone);

    if (workedSeconds >= expectedWorkSeconds) {
      await sendTrackingNotification({
        user,
        organizationId: orgId,
        notifications,
        type: "DAILY_TARGET_REACHED",
        title: "Daily target reached",
        message: "You've reached your scheduled work target for today.",
        eventKey: `daily-target-reached:${today}`,
        metadata: {
          date: today,
          workedSeconds,
          expectedWorkSeconds,
        },
      });
    }
  }

  /*
   * OVERTIME
   */
  const isInsideShift =
    shiftStartMinutes < shiftEndMinutes
      ? localMinutes >= shiftStartMinutes && localMinutes < shiftEndMinutes
      : localMinutes >= shiftStartMinutes || localMinutes < shiftEndMinutes;

  const shiftHasEnded =
    shiftStartMinutes < shiftEndMinutes
      ? localMinutes > shiftEndMinutes
      : localMinutes > shiftEndMinutes && localMinutes < shiftStartMinutes;

  if (!isInsideShift && shiftHasEnded) {
    const userId = String(user._id || user.id);
    const workedSeconds = await getWorkedSecondsForDate(userId, today, timezone);

    await sendTrackingNotification({
      user,
      organizationId: orgId,
      notifications,
      title: "Overtime started",
      message: "You've exceeded your scheduled working hours.",
      eventKey: `overtime-started:${today}`,
      metadata: {
        date: today,
        scheduledEndTime: shift.endTime,
        workedSeconds,
        expectedWorkSeconds,
      },
    });
  }
};

export const startTrackingNotificationScheduler = () => {
  cron.schedule("* * * * *", async () => {
    try {
      const users = await userRepository.find({
        isVerified: true,
      });

      if (!users.length) {
        return;
      }

      const orgUsers = users.filter((u) => u.organization || u.organizationId);
      const organizationIds = [
        ...new Set(
          orgUsers.map((u) =>
            String(u.organization?.id || u.organization?._id || u.organization || u.organizationId),
          ),
        ),
      ];

      if (!organizationIds.length) {
        return;
      }

      const [organizations, timeTrackingSettings] = await Promise.all([
        organizationRepository.find({
          id: { in: organizationIds },
        }),
        timeTrackingSettingsRepository.find({
          organization: { $in: organizationIds },
        }),
      ]);

      const organizationMap = new Map(
        organizations.map((org) => [String(org._id || org.id), org]),
      );

      const timeTrackingSettingsMap = new Map(
        timeTrackingSettings.map((settings) => [
          String(settings.organization || settings.organizationId),
          settings,
        ]),
      );

      for (const user of orgUsers) {
        try {
          const orgId = String(
            user.organization?.id || user.organization?._id || user.organization || user.organizationId,
          );

          const organization = organizationMap.get(orgId);
          const settings = timeTrackingSettingsMap.get(orgId);

          if (!organization || !settings) {
            continue;
          }

          await processUserTrackingNotifications(user, {
            ...organization,
            ...settings,
          });
        } catch (error) {
          console.error(
            "TRACKING NOTIFICATION USER ERROR:",
            user._id || user.id,
            error.message,
          );
        }
      }
    } catch (error) {
      console.error("TRACKING NOTIFICATION SCHEDULER ERROR:", error);
    }
  });

  console.info("Tracking notification scheduler started.");
};
