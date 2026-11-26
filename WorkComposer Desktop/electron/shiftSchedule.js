/**
 * WorkComposer Desktop — Shift Schedule Evaluation Module
 *
 * Provides timezone-aware shift and break evaluations for the Electron desktop client.
 * Operates on configured employee/organization reporting timezones, eliminating
 * host operating system timezone leakage.
 *
 * Enforces half-open intervals [startTime, endTime) and supports cross-midnight
 * overnight shifts spanning weekday transitions (e.g. Friday 22:00 -> Saturday 06:00).
 */

const DEFAULT_TIMEZONE = "Asia/Kolkata";
const FALLBACK_TIMEZONE = "UTC";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Validates whether candidate timezone is a valid IANA identifier.
 */
function isValidTimezone(tz) {
  if (typeof tz !== "string" || !tz.trim()) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizes timezone string with safe fallback.
 */
function resolveTimezone(tz) {
  if (isValidTimezone(tz)) {
    const trimmed = tz.trim();
    if (trimmed === "Asia/Calcutta") return "Asia/Kolkata";
    return trimmed;
  }
  return FALLBACK_TIMEZONE;
}

/**
 * Parses "HH:MM" into { hour, minute, minutes } where minutes is total minutes from 00:00.
 */
function parseTimeString(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return null;
  const parts = timeStr.trim().split(":");
  if (parts.length < 2) return null;
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return {
    hour,
    minute,
    minutes: hour * 60 + minute,
  };
}

/**
 * Extracts wall-clock date/time parts in the specified IANA timezone.
 */
function getLocalTimeParts(date = new Date(), timezone = FALLBACK_TIMEZONE) {
  const targetDate = date instanceof Date ? date : new Date(date);
  const tz = resolveTimezone(timezone);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(targetDate);
  const get = (type) => parts.find((p) => p.type === type)?.value;

  const weekday = get("weekday");
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const second = Number(get("second"));
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));

  return {
    weekday,
    hour,
    minute,
    second,
    minutes: hour * 60 + minute,
    year,
    month,
    day,
    timezone: tz,
  };
}

/**
 * Gets previous day of week name (e.g. "Monday" -> "Sunday").
 */
function getPreviousWeekday(weekday) {
  const idx = WEEKDAYS.indexOf(weekday);
  if (idx === -1) return "Sunday";
  return WEEKDAYS[(idx + 6) % 7];
}

/**
 * Resolves the currently active shift (or today's scheduled shift) in the given timezone.
 *
 * Prioritizes an overnight shift that started yesterday and is still active this morning.
 * If no continuation is active, returns today's scheduled shift.
 */
function getCurrentShift(schedule, now = new Date(), timezone = FALLBACK_TIMEZONE) {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    return null;
  }

  const local = getLocalTimeParts(now, timezone);
  const prevWeekday = getPreviousWeekday(local.weekday);

  // 1. Check if yesterday had an enabled overnight shift that is still active now
  const prevShift = schedule.find(
    (item) => item.day === prevWeekday && item.enabled
  );

  if (prevShift && prevShift.startTime && prevShift.endTime) {
    const prevStart = parseTimeString(prevShift.startTime);
    const prevEnd = parseTimeString(prevShift.endTime);

    if (prevStart && prevEnd && prevStart.minutes >= prevEnd.minutes) {
      // Overnight shift! In the morning after midnight, active if currentMinutes < endMinutes
      if (local.minutes < prevEnd.minutes) {
        return {
          ...prevShift,
          isOvernightContinuation: true,
          baseDay: prevWeekday,
        };
      }
    }
  }

  // 2. Return today's scheduled shift (if enabled)
  const todayShift = schedule.find(
    (item) => item.day === local.weekday && item.enabled
  );

  if (todayShift) {
    return {
      ...todayShift,
      isOvernightContinuation: false,
      baseDay: local.weekday,
    };
  }

  return null;
}

/**
 * Evaluates whether `now` falls strictly within the active scheduled shift.
 *
 * Interval rules:
 * - Half-open interval [startTime, endTime): inclusive of start, exclusive of end.
 * - Daytime shift (startTime < endTime):
 *     active if currentMinutes >= startMinutes && currentMinutes < endMinutes
 * - Overnight shift (startTime >= endTime):
 *     - If evaluated on start day: active if currentMinutes >= startMinutes
 *     - If evaluated on next day: active if currentMinutes < endMinutes
 *
 * @param {Array} schedule - Tracking settings shift schedule array
 * @param {Date|string|number} now - Evaluation instant
 * @param {string} timezone - Employee/organization reporting timezone
 * @returns {boolean} True if within shift
 */
function isWithinCurrentShift(schedule, now = new Date(), timezone = FALLBACK_TIMEZONE) {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    return false;
  }

  const local = getLocalTimeParts(now, timezone);
  const prevWeekday = getPreviousWeekday(local.weekday);

  // 1. Check yesterday's overnight shift continuation
  const prevShift = schedule.find(
    (item) => item.day === prevWeekday && item.enabled
  );

  if (prevShift && prevShift.startTime && prevShift.endTime) {
    const prevStart = parseTimeString(prevShift.startTime);
    const prevEnd = parseTimeString(prevShift.endTime);

    if (prevStart && prevEnd && prevStart.minutes >= prevEnd.minutes) {
      // Half-open: [00:00, prevEnd.minutes)
      if (local.minutes < prevEnd.minutes) {
        return true;
      }
    }
  }

  // 2. Check today's shift
  const todayShift = schedule.find(
    (item) => item.day === local.weekday && item.enabled
  );

  if (!todayShift || !todayShift.startTime || !todayShift.endTime) {
    return false;
  }

  const todayStart = parseTimeString(todayShift.startTime);
  const todayEnd = parseTimeString(todayShift.endTime);

  if (!todayStart || !todayEnd) {
    return false;
  }

  if (todayStart.minutes < todayEnd.minutes) {
    // Normal daytime shift: [todayStart.minutes, todayEnd.minutes)
    return local.minutes >= todayStart.minutes && local.minutes < todayEnd.minutes;
  } else {
    // Overnight shift starting today: [todayStart.minutes, 24:00)
    return local.minutes >= todayStart.minutes;
  }
}

/**
 * Evaluates whether `now` falls strictly within a scheduled break during the active shift.
 *
 * Supports breaks during normal shifts and breaks during overnight shifts.
 * Half-open interval [breakStart, breakEnd).
 *
 * @param {Array} schedule - Tracking settings shift schedule array
 * @param {Date|string|number} now - Evaluation instant
 * @param {string} timezone - Employee/organization reporting timezone
 * @returns {boolean} True if within scheduled break
 */
function isWithinScheduledBreak(schedule, now = new Date(), timezone = FALLBACK_TIMEZONE) {
  const activeShift = getCurrentShift(schedule, now, timezone);
  if (!activeShift || !Array.isArray(activeShift.breaks) || activeShift.breaks.length === 0) {
    return false;
  }

  const local = getLocalTimeParts(now, timezone);
  const isContinuation = Boolean(activeShift.isOvernightContinuation);

  for (const breakItem of activeShift.breaks) {
    if (!breakItem.startTime || !breakItem.endTime) continue;
    const bStart = parseTimeString(breakItem.startTime);
    const bEnd = parseTimeString(breakItem.endTime);
    if (!bStart || !bEnd) continue;

    if (!isContinuation) {
      // Evaluated on shift's start day
      if (bStart.minutes < bEnd.minutes) {
        // Break contained on day 1
        if (local.minutes >= bStart.minutes && local.minutes < bEnd.minutes) {
          return true;
        }
      } else {
        // Break itself crosses midnight
        if (local.minutes >= bStart.minutes) {
          return true;
        }
      }
    } else {
      // Evaluated on continuation day (morning after midnight)
      if (bStart.minutes >= bEnd.minutes) {
        // Break started before midnight, ends this morning: [00:00, bEnd.minutes)
        if (local.minutes < bEnd.minutes) {
          return true;
        }
      } else {
        // Break is scheduled in the morning (e.g. 03:00 - 03:30)
        // Ensure break is part of overnight morning shift
        const shiftEnd = parseTimeString(activeShift.endTime);
        if (shiftEnd && bEnd.minutes <= shiftEnd.minutes) {
          if (local.minutes >= bStart.minutes && local.minutes < bEnd.minutes) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

module.exports = {
  DEFAULT_TIMEZONE,
  FALLBACK_TIMEZONE,
  WEEKDAYS,
  isValidTimezone,
  resolveTimezone,
  parseTimeString,
  getLocalTimeParts,
  getPreviousWeekday,
  getCurrentShift,
  isWithinCurrentShift,
  isWithinScheduledBreak,
};
