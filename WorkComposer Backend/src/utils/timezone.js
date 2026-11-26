import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const DEFAULT_TIMEZONE = "Asia/Kolkata";
export const FALLBACK_TIMEZONE = "UTC";
export const BROWSER_TIMEZONE_SETTING = "Browser timezone";

// Known legacy aliases mapped to standard IANA identifiers
const LEGACY_ALIASES = Object.freeze({
  "Asia/Calcutta": "Asia/Kolkata",
});

// Diagnostic storage for safe inspection during tests / monitoring
const recentDiagnostics = [];
const MAX_DIAGNOSTICS = 100;

/**
 * Validates whether a candidate string is a valid IANA timezone identifier.
 *
 * @param {unknown} timezone - Candidate timezone string
 * @returns {boolean} True if timezone is a valid IANA identifier
 */
export const isValidTimezone = (timezone) => {
  if (typeof timezone !== "string") {
    return false;
  }
  const trimmed = timezone.trim();
  if (!trimmed) {
    return false;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
};

/**
 * Normalizes an IANA timezone identifier, mapping legacy aliases
 * (e.g. 'Asia/Calcutta' -> 'Asia/Kolkata').
 *
 * @param {string} timezone
 * @returns {string} Normalized timezone or original trimmed string
 */
export const normalizeTimezone = (timezone) => {
  if (typeof timezone !== "string") {
    return FALLBACK_TIMEZONE;
  }
  const trimmed = timezone.trim();
  if (LEGACY_ALIASES[trimmed]) {
    return LEGACY_ALIASES[trimmed];
  }
  return trimmed;
};

/**
 * Records a safe diagnostic when fallback resolution occurs.
 * Never logs authentication tokens, passwords, or sensitive PII.
 *
 * @param {string} message - Diagnostic summary
 * @param {Object} [meta] - Non-sensitive metadata (userId, rawValue, reason)
 */
export const recordTimezoneDiagnostic = (message, meta = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    message,
    meta: {
      userId: meta.userId ? String(meta.userId) : undefined,
      timezone: meta.timezone ? String(meta.timezone) : undefined,
      fallbackTo: meta.fallbackTo ? String(meta.fallbackTo) : undefined,
      reason: meta.reason ? String(meta.reason) : undefined,
    },
  };

  if (recentDiagnostics.length >= MAX_DIAGNOSTICS) {
    recentDiagnostics.shift();
  }
  recentDiagnostics.push(entry);

  if (process.env.NODE_ENV !== "test" || process.env.DEBUG_TIMEZONE) {
    console.debug(`[TimezoneResolver] ${message}`, entry.meta);
  }
};

/**
 * Retrieve recent diagnostics (useful for automated test verification).
 *
 * @returns {Array<Object>}
 */
export const getTimezoneDiagnostics = () => {
  return [...recentDiagnostics];
};

/**
 * Clear diagnostics buffer (useful for test isolation).
 */
export const clearTimezoneDiagnostics = () => {
  recentDiagnostics.length = 0;
};

/**
 * Canonical backend timezone resolution with strict precedence:
 *
 * 1. If User.reportTimezone contains a valid explicit IANA timezone, use it.
 * 2. If it is 'Browser timezone', use the authenticated request's validated X-Client-Timezone header.
 * 3. If the header is missing or invalid, use the documented organization timezone fallback, if valid.
 * 4. Otherwise use UTC.
 *
 * Safety Invariants:
 * - Request headers NEVER override an explicitly selected user timezone.
 * - Arbitrary timezone strings are NEVER trusted without validation.
 * - An invalid explicit user setting is NOT silently converted to an unrelated timezone;
 *   a diagnostic is recorded and it falls back to organization timezone if valid, else UTC.
 *
 * @param {Object} user - User document or auth object
 * @param {Object|string} [request] - Express request object, header string, or options
 * @returns {string} Validated IANA timezone
 */
export const resolveUserTimezone = (user, request = null) => {
  const explicitTz = user?.reportTimezone ? String(user.reportTimezone).trim() : null;
  const userId = user?._id || user?.id || "anonymous";

  // 1. Explicit user preference check
  if (explicitTz && explicitTz !== BROWSER_TIMEZONE_SETTING) {
    if (isValidTimezone(explicitTz)) {
      return normalizeTimezone(explicitTz);
    }

    // Explicit setting is invalid: record diagnostic and fall back (header cannot override)
    recordTimezoneDiagnostic("Invalid explicit reportTimezone encountered", {
      userId,
      timezone: explicitTz,
      fallbackTo: user?.organization?.timezone || FALLBACK_TIMEZONE,
      reason: "EXPLICIT_SETTING_INVALID",
    });

    if (user?.organization?.timezone && isValidTimezone(user.organization.timezone)) {
      return normalizeTimezone(user.organization.timezone);
    }
    return FALLBACK_TIMEZONE;
  }

  // 2. 'Browser timezone': resolve from validated X-Client-Timezone header
  let rawHeader = null;
  if (typeof request === "string") {
    rawHeader = request;
  } else if (request && typeof request === "object") {
    rawHeader =
      request.headers?.["x-client-timezone"] ||
      request.headers?.["X-Client-Timezone"] ||
      request.handshake?.headers?.["x-client-timezone"] ||
      request.handshake?.headers?.["X-Client-Timezone"] ||
      request.handshake?.auth?.timezone ||
      request.auth?.timezone ||
      (typeof request.get === "function" ? request.get("x-client-timezone") : null);
  }

  if (rawHeader && typeof rawHeader === "string") {
    const trimmedHeader = rawHeader.trim();
    if (isValidTimezone(trimmedHeader)) {
      return normalizeTimezone(trimmedHeader);
    }

    recordTimezoneDiagnostic("Invalid X-Client-Timezone header received", {
      userId,
      timezone: trimmedHeader,
      fallbackTo: user?.organization?.timezone || FALLBACK_TIMEZONE,
      reason: "CLIENT_HEADER_INVALID",
    });
  } else {
    recordTimezoneDiagnostic("Missing X-Client-Timezone header for 'Browser timezone' user", {
      userId,
      fallbackTo: user?.organization?.timezone || FALLBACK_TIMEZONE,
      reason: "CLIENT_HEADER_MISSING",
    });
  }

  // 3. Documented organization timezone fallback
  if (user?.organization?.timezone && isValidTimezone(user.organization.timezone)) {
    return normalizeTimezone(user.organization.timezone);
  }

  // 4. Ultimate UTC fallback
  return FALLBACK_TIMEZONE;
};

/**
 * Backward-compatible wrapper for existing callers.
 * If user has explicit timezone, returns it.
 * If user has 'Browser timezone' and request is provided, resolves from header.
 * If user has 'Browser timezone' and no request provided, defaults to DEFAULT_TIMEZONE
 * ("Asia/Kolkata") for legacy backward compatibility.
 *
 * @param {Object} user
 * @param {Object} [request]
 * @returns {string}
 */
export const getUserTimezone = (user, request = null) => {
  if (request) {
    return resolveUserTimezone(user, request);
  }

  if (user?.reportTimezone && user.reportTimezone !== BROWSER_TIMEZONE_SETTING) {
    if (isValidTimezone(user.reportTimezone)) {
      return normalizeTimezone(user.reportTimezone);
    }
  }

  return DEFAULT_TIMEZONE;
};

/**
 * Convert a calendar date (YYYY-MM-DD)
 * in the user's timezone into the UTC start instant.
 *
 * Example:
 * 2026-08-12 + America/New_York
 * becomes the UTC instant representing
 * midnight on Aug 12 in New York.
 */
export const getStartOfDayUTC = (dateString, timezone) => {
  const tz = isValidTimezone(timezone) ? normalizeTimezone(timezone) : FALLBACK_TIMEZONE;
  return fromZonedTime(`${dateString}T00:00:00`, tz);
};

/**
 * Convert a calendar date (YYYY-MM-DD)
 * in the user's timezone into the UTC end instant (23:59:59.999).
 */
export const getEndOfDayUTC = (dateString, timezone) => {
  const tz = isValidTimezone(timezone) ? normalizeTimezone(timezone) : FALLBACK_TIMEZONE;
  return fromZonedTime(`${dateString}T23:59:59.999`, tz);
};

/**
 * Convert a UTC Date into a calendar date (YYYY-MM-DD)
 * in the user's timezone.
 */
export const getDateInTimezone = (date, timezone) => {
  const tz = isValidTimezone(timezone) ? normalizeTimezone(timezone) : FALLBACK_TIMEZONE;
  return formatInTimeZone(new Date(date), tz, "yyyy-MM-dd");
};

/**
 * Get today's calendar date (YYYY-MM-DD) in the user's timezone.
 */
export const getTodayInTimezone = (timezone, now = new Date()) => {
  const tz = isValidTimezone(timezone) ? normalizeTimezone(timezone) : FALLBACK_TIMEZONE;
  return formatInTimeZone(new Date(now), tz, "yyyy-MM-dd");
};

/**
 * Legacy range helper returning start of day and end of day inclusive.
 */
export const getDateRangeUTC = (startDate, endDate, timezone) => {
  const tz = isValidTimezone(timezone) ? normalizeTimezone(timezone) : FALLBACK_TIMEZONE;
  return {
    start: getStartOfDayUTC(startDate, tz),
    end: getEndOfDayUTC(endDate, tz),
  };
};

/**
 * Constructs local midnight boundaries in the specified IANA timezone
 * and returns the corresponding UTC instants.
 *
 * Supports half-open intervals [start, end) where end is midnight of the subsequent local day,
 * and inclusive intervals [start, endInclusive] where endInclusive is 23:59:59.999.
 *
 * @param {string|Date} date - Calendar date 'YYYY-MM-DD' or Date object
 * @param {string} timezone - Validated IANA timezone
 * @param {Object} [options]
 * @param {boolean} [options.inclusive=false] - If true, end represents 23:59:59.999
 * @returns {{ start: Date, end: Date, endInclusive: Date, timezone: string, date: string }}
 */
export const getZonedDayRange = (date, timezone, options = {}) => {
  const tz = isValidTimezone(timezone) ? normalizeTimezone(timezone) : FALLBACK_TIMEZONE;
  let dateString;
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    dateString = date.trim();
  } else {
    dateString = formatInTimeZone(new Date(date), tz, "yyyy-MM-dd");
  }

  const start = fromZonedTime(`${dateString}T00:00:00.000`, tz);
  const endInclusive = fromZonedTime(`${dateString}T23:59:59.999`, tz);

  // Compute start of next calendar day for half-open [start, end)
  const [year, month, day] = dateString.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const nextDateString = nextDay.toISOString().split("T")[0];
  const nextStart = fromZonedTime(`${nextDateString}T00:00:00.000`, tz);

  return {
    start,
    end: options.inclusive ? endInclusive : nextStart,
    endInclusive,
    timezone: tz,
    date: dateString,
  };
};

/**
 * Converts a date or wall-clock string into zoned representations in the specified timezone,
 * or converts local wall-clock components into an absolute UTC Date.
 *
 * @param {Date|string|number} date - UTC Date, timestamp, or naive wall-clock string
 * @param {string} timezone - Validated IANA timezone
 * @returns {Date} UTC Date or zoned representation
 */
export const getZonedDateTime = (date, timezone) => {
  const tz = isValidTimezone(timezone) ? normalizeTimezone(timezone) : FALLBACK_TIMEZONE;
  if (typeof date === "string" && !date.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(date)) {
    // Naive local wall-clock string -> convert to absolute UTC instant
    return fromZonedTime(date, tz);
  }
  return toZonedTime(new Date(date), tz);
};

/**
 * Calculates the overlap duration in seconds between a session interval
 * and a target reporting period interval [periodStart, periodEnd).
 *
 * Handles active sessions safely with a controlled evaluation instant (evalNow).
 * Completed sessions use their actual endTime.
 * Active sessions (null or undefined endTime) use evalNow (evalNow >= startTime).
 * A session never contributes time beyond the period boundaries or beyond evalNow.
 *
 * @param {Object} session - { startTime, endTime, duration }
 * @param {Date|null} periodStart - Interval start instant (inclusive)
 * @param {Date|null} periodEnd - Interval end instant (exclusive)
 * @param {Date} [evalNow] - Evaluation instant for active sessions (defaults to new Date())
 * @returns {{ overlapSeconds: number, overlapStart: Date, overlapEnd: Date, isContained: boolean }}
 */
export const calculateIntervalOverlap = (
  session,
  periodStart = null,
  periodEnd = null,
  evalNow = new Date()
) => {
  if (!session || !session.startTime) {
    return { overlapSeconds: 0, overlapStart: null, overlapEnd: null, isContained: false };
  }

  const sStart = new Date(session.startTime);
  const pStart = periodStart ? new Date(periodStart) : null;
  const pEnd = periodEnd ? new Date(periodEnd) : null;

  // Active sessions use a controlled effective end instant bounded by evalNow
  let sEnd;
  if (session.endTime) {
    sEnd = new Date(session.endTime);
    if (sEnd < sStart) sEnd = sStart;
  } else {
    const nowInstant = evalNow ? new Date(evalNow) : new Date();
    sEnd = nowInstant < sStart ? sStart : nowInstant;
  }

  const oStart = pStart && sStart < pStart ? pStart : sStart;
  const oEnd = pEnd && sEnd > pEnd ? pEnd : sEnd;

  const overlapMs = Math.max(0, oEnd.getTime() - oStart.getTime());
  const overlapSeconds = Math.floor(overlapMs / 1000);

  // A session is contained/relevant if it overlaps duration-wise or its start instant falls within [pStart, pEnd)
  const isContained =
    overlapSeconds > 0 ||
    (Boolean(pStart && pEnd) && sStart >= pStart && sStart < pEnd);

  return {
    overlapSeconds,
    overlapStart: oStart,
    overlapEnd: oEnd,
    isContained,
  };
};

/**
 * Formats a Date or timestamp as a 2-digit clock time string (e.g. "09:30 AM")
 * in the specified IANA timezone.
 *
 * @param {Date|string|number} date
 * @param {string} timezone
 * @returns {string|null}
 */
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

