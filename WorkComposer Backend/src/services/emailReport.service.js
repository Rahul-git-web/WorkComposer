import {
  userRepository,
  organizationRepository,
  timeTrackingSettingsRepository,
  sessionRepository,
} from "../db/repositories/index.js";
import sendEmail from "../utils/sendEmail.js";
import dailyWarningEmailTemplate from "../templates/dailyWarningEmailTemplate.js";
import weeklyWarningEmailTemplate from "../templates/weeklyWarningEmailTemplate.js";
import {
  resolveUserTimezone,
  getTodayInTimezone,
  getDateInTimezone,
  getZonedDayRange,
  calculateIntervalOverlap,
} from "../utils/timezone.js";

const DAY_MAP = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

export const checkDailyWarning = async (userId) => {
  try {
    const user = await userRepository.findById(userId, { populateOrganization: true });

    if (!user) {
      return;
    }

    const orgId = user.organization?.id || user.organization?._id || user.organization || user.organizationId;
    const organization = user.organization?.id
      ? user.organization
      : orgId
        ? await organizationRepository.findById(orgId)
        : null;

    if (!organization) {
      return;
    }

    const emailReportSettings = {
      ...(organization.emailReports || {}),
      ...Object.fromEntries(
        Object.entries(user.emailReportSettings || {}).filter(
          ([, value]) => value !== null && value !== undefined,
        ),
      ),
    };

    if (!emailReportSettings.dailyWarningEmails) {
      return;
    }

    const timezone = resolveUserTimezone(user);
    const todayDate = getTodayInTimezone(timezone);

    const now = new Date();
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
    }).format(now);
    const currentDay = DAY_MAP[weekday] ?? 0;

    if (
      Array.isArray(emailReportSettings.dailyWeekDays) &&
      emailReportSettings.dailyWeekDays.length > 0 &&
      !emailReportSettings.dailyWeekDays.includes(currentDay)
    ) {
      return;
    }

    const timeTrackingSettings = await timeTrackingSettingsRepository.findOne({
      organization: orgId,
    });

    if (!timeTrackingSettings) {
      return;
    }

    const shiftSchedule =
      user.shiftSettings?.schedule ?? timeTrackingSettings.shift?.schedule;

    const todayShift = shiftSchedule?.find((shift) => shift.day === weekday);

    if (!todayShift || !todayShift.enabled) {
      return;
    }

    const [startHour, startMinute] = todayShift.startTime.split(":").map(Number);
    const [endHour, endMinute] = todayShift.endTime.split(":").map(Number);

    const startMinutes = startHour * 60 + startMinute;
    let endMinutes = endHour * 60 + endMinute;
    if (endMinutes <= startMinutes) {
      endMinutes += 24 * 60; // Overnight shift
    }

    let expectedWorkSeconds = 0;

    if (emailReportSettings.dailyBasedOnShift) {
      let shiftSeconds = (endMinutes - startMinutes) * 60;

      const breakSeconds = (todayShift.breaks || []).reduce(
        (total, breakItem) => {
          const [breakStartHour, breakStartMinute] = breakItem.startTime
            .split(":")
            .map(Number);

          const [breakEndHour, breakEndMinute] = breakItem.endTime
            .split(":")
            .map(Number);

          const breakStart = breakStartHour * 60 + breakStartMinute;
          let breakEnd = breakEndHour * 60 + breakEndMinute;
          if (breakEnd <= breakStart) {
            breakEnd += 24 * 60;
          }

          return total + (breakEnd - breakStart) * 60;
        },
        0,
      );

      expectedWorkSeconds = Math.max(0, shiftSeconds - breakSeconds);
    } else {
      expectedWorkSeconds =
        (emailReportSettings.dailyMinimumTime?.hours || 0) * 3600 +
        (emailReportSettings.dailyMinimumTime?.minutes || 0) * 60;
    }

    const { start: periodStart, end: periodEnd } = getZonedDayRange(todayDate, timezone);

    const workSessions = await sessionRepository.findOverlappingSessions({
      userId,
      periodStart,
      periodEnd,
      type: "work",
    });

    const workedSeconds = (workSessions || []).reduce((total, session) => {
      const { overlapSeconds } = calculateIntervalOverlap(session, periodStart, periodEnd);
      return total + overlapSeconds;
    }, 0);

    if (workedSeconds >= expectedWorkSeconds) {
      return;
    }

    if (user.lastDailyWarningEmail) {
      const lastSentDate = getDateInTimezone(user.lastDailyWarningEmail, timezone);
      if (lastSentDate === todayDate) {
        return;
      }
    }

    const formatDuration = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);

      return `${hours}h ${minutes}m`;
    };

    const html = dailyWarningEmailTemplate({
      firstName: user.firstName,
      workedTime: formatDuration(workedSeconds),
      expectedTime: formatDuration(expectedWorkSeconds),
    });

    await sendEmail(user.email, "Daily Work Time Warning", html);

    await userRepository.findByIdAndUpdate(userId, {
      lastDailyWarningEmail: new Date(),
    });
  } catch (error) {
    console.error("Error checking daily warning:", error);
  }
};

export const checkWeeklyWarning = async (userId) => {
  try {
    const user = await userRepository.findById(userId, { populateOrganization: true });

    if (!user) {
      return;
    }

    const orgId = user.organization?.id || user.organization?._id || user.organization || user.organizationId;
    const organization = user.organization?.id
      ? user.organization
      : orgId
        ? await organizationRepository.findById(orgId)
        : null;

    if (!organization) {
      return;
    }

    const emailReportSettings = {
      ...(organization.emailReports || {}),
      ...Object.fromEntries(
        Object.entries(user.emailReportSettings || {}).filter(
          ([, value]) => value !== null && value !== undefined,
        ),
      ),
    };

    if (!emailReportSettings?.weeklyWarningEmails) {
      return;
    }

    const timeTrackingSettings = await timeTrackingSettingsRepository.findOne({
      organization: orgId,
    });

    if (!timeTrackingSettings) {
      return;
    }

    const shiftSchedule =
      user.shiftSettings?.schedule ?? timeTrackingSettings.shift?.schedule;

    let expectedWorkSeconds = 0;

    if (emailReportSettings.weeklyBasedOnShift) {
      for (const shift of shiftSchedule || []) {
        if (!shift.enabled) continue;

        const [startHour, startMinute] = shift.startTime.split(":").map(Number);
        const [endHour, endMinute] = shift.endTime.split(":").map(Number);

        const startMinutes = startHour * 60 + startMinute;
        let endMinutes = endHour * 60 + endMinute;
        if (endMinutes <= startMinutes) {
          endMinutes += 24 * 60;
        }

        let shiftSeconds = (endMinutes - startMinutes) * 60;

        const breakSeconds = (shift.breaks || []).reduce((total, breakItem) => {
          const [breakStartHour, breakStartMinute] = breakItem.startTime
            .split(":")
            .map(Number);

          const [breakEndHour, breakEndMinute] = breakItem.endTime
            .split(":")
            .map(Number);

          const breakStart = breakStartHour * 60 + breakStartMinute;
          let breakEnd = breakEndHour * 60 + breakEndMinute;
          if (breakEnd <= breakStart) {
            breakEnd += 24 * 60;
          }

          return total + (breakEnd - breakStart) * 60;
        }, 0);

        shiftSeconds = Math.max(0, shiftSeconds - breakSeconds);
        expectedWorkSeconds += shiftSeconds;
      }
    } else {
      expectedWorkSeconds =
        (emailReportSettings.weeklyMinimumTime?.hours || 0) * 3600 +
        (emailReportSettings.weeklyMinimumTime?.minutes || 0) * 60;
    }

    const timezone = resolveUserTimezone(user);
    const todayDate = getTodayInTimezone(timezone);
    const [year, month, day] = todayDate.split("-").map(Number);
    const calendarUtc = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = calendarUtc.getUTCDay(); // 0 = Sunday, 1 = Monday...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const mondayUtc = new Date(calendarUtc);
    mondayUtc.setUTCDate(calendarUtc.getUTCDate() + diffToMonday);

    const sundayUtc = new Date(mondayUtc);
    sundayUtc.setUTCDate(mondayUtc.getUTCDate() + 6);

    const mondayDate = mondayUtc.toISOString().split("T")[0];
    const sundayDate = sundayUtc.toISOString().split("T")[0];

    const periodStart = getZonedDayRange(mondayDate, timezone).start;
    const periodEnd = getZonedDayRange(sundayDate, timezone).end;

    const workSessions = await sessionRepository.findOverlappingSessions({
      userId,
      periodStart,
      periodEnd,
      type: "work",
    });

    const workedSeconds = (workSessions || []).reduce((total, session) => {
      const { overlapSeconds } = calculateIntervalOverlap(session, periodStart, periodEnd);
      return total + overlapSeconds;
    }, 0);

    if (workedSeconds >= expectedWorkSeconds) {
      return;
    }

    if (
      user.lastWeeklyWarningEmail &&
      new Date(user.lastWeeklyWarningEmail) >= periodStart
    ) {
      return;
    }

    const formatDuration = (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);

      return `${hours}h ${minutes}m`;
    };

    const html = weeklyWarningEmailTemplate({
      firstName: user.firstName,
      workedTime: formatDuration(workedSeconds),
      expectedTime: formatDuration(expectedWorkSeconds),
    });

    await sendEmail(user.email, "Weekly Work Time Warning", html);

    await userRepository.findByIdAndUpdate(userId, {
      lastWeeklyWarningEmail: new Date(),
    });
  } catch (error) {
    console.error("Error checking weekly warning:", error);
  }
};
