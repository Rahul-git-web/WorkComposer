import { fromZonedTime } from "date-fns-tz";

export const DEFAULT_TIMEZONE = "Asia/Kolkata";
export const FALLBACK_TIMEZONE = "UTC";
export const BROWSER_TIMEZONE_SETTING = "Browser timezone";

const LEGACY_ALIASES: Record<string, string> = Object.freeze({
  "Asia/Calcutta": "Asia/Kolkata",
});

/**
 * Validates whether a candidate string is a valid IANA timezone identifier.
 */
export function isValidTimezone(timezone: unknown): boolean {
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
}

/**
 * Normalizes an IANA timezone identifier, mapping legacy aliases.
 */
export function normalizeTimezone(timezone: string): string {
  if (typeof timezone !== "string") {
    return FALLBACK_TIMEZONE;
  }
  const trimmed = timezone.trim();
  if (LEGACY_ALIASES[trimmed]) {
    return LEGACY_ALIASES[trimmed];
  }
  return trimmed;
}

/**
 * Safely resolves the browser's current IANA timezone in client/SSR environments.
 */
export function getBrowserTimezone(): string {
  if (typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function") {
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (resolved && isValidTimezone(resolved)) {
        return normalizeTimezone(resolved);
      }
    } catch {
      // Fall back safely if Intl is unavailable or restricted
    }
  }
  return isValidTimezone(DEFAULT_TIMEZONE) ? DEFAULT_TIMEZONE : FALLBACK_TIMEZONE;
}

/**
 * Centrally and safely resolves any timezone input into a guaranteed valid IANA timezone identifier.
 *
 * Precedence & Fallback Rules:
 * 1. If candidate is the setting label "Browser timezone" (case-insensitive, trimmed),
 *    resolves to the browser's actual IANA timezone via Intl.DateTimeFormat().resolvedOptions().timeZone.
 * 2. If candidate is a valid explicit IANA timezone identifier, normalizes legacy aliases and returns it intact.
 * 3. If candidate is missing, null, undefined, empty, or an invalid identifier:
 *    a) Resolves to the browser's actual validated timezone.
 *    b) If unavailable, falls back to DEFAULT_TIMEZONE ("Asia/Kolkata") if valid.
 *    c) Falls back to FALLBACK_TIMEZONE ("UTC").
 *
 * Invariant: RangeError is NEVER thrown when constructing Intl.DateTimeFormat with the returned string.
 */
export function resolveSafeTimezone(timezone?: unknown): string {
  if (typeof timezone === "string") {
    const trimmed = timezone.trim();
    if (trimmed.toLowerCase() === BROWSER_TIMEZONE_SETTING.toLowerCase()) {
      return getBrowserTimezone();
    }
    if (isValidTimezone(trimmed)) {
      return normalizeTimezone(trimmed);
    }
  }

  // Fallback policy: browser timezone -> DEFAULT_TIMEZONE -> FALLBACK_TIMEZONE ("UTC")
  const browserTz = getBrowserTimezone();
  if (browserTz && isValidTimezone(browserTz)) {
    return browserTz;
  }
  if (isValidTimezone(DEFAULT_TIMEZONE)) {
    return DEFAULT_TIMEZONE;
  }
  return FALLBACK_TIMEZONE;
}

export function getAppTimezone(
  reportTimezone?: string | null
): string {
  return resolveSafeTimezone(reportTimezone);
}

export function createDateInTimezone(
  year: number,
  month: number,
  day: number,
  timezone?: string | null
): Date {
  const safeTz = resolveSafeTimezone(timezone);
  const dateString = `${year}-${String(month + 1).padStart(2, "0")}-${String(
    day
  ).padStart(2, "0")}T00:00:00`;

  return fromZonedTime(dateString, safeTz);
}

export function formatDateForApi(
  date: Date,
  timezone?: string | null
): string {
  const safeTz = resolveSafeTimezone(timezone);
  const validDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(validDate);
}

export function getTodayInTimezone(
  timezone?: string | null
): string {
  return formatDateForApi(new Date(), timezone);
}

/**
 * Get the year/month(0-indexed)/day of a Date, as seen in a given timezone.
 */
export function getDatePartsInTimezone(
  date: Date,
  timezone?: string | null
): { year: number; month: number; day: number } {
  const safeTz = resolveSafeTimezone(timezone);
  const validDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(validDate);

  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value) - 1,
    day: Number(parts.find((p) => p.type === "day")?.value),
  };
}

/**
 * Get the hour(0-23)/minute of a Date, as seen in a given timezone.
 */
export function getTimePartsInTimezone(
  date: Date,
  timezone?: string | null
): { hour: number; minute: number } {
  const safeTz = resolveSafeTimezone(timezone);
  const validDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(validDate);

  return {
    hour: Number(parts.find((p) => p.type === "hour")?.value) % 24,
    minute: Number(parts.find((p) => p.type === "minute")?.value),
  };
}

/**
 * Format just the time portion (e.g. "02:45 PM") of a Date in a given timezone.
 */
export function formatTimeInTimezone(
  date: Date,
  timezone?: string | null
): string {
  const safeTz = resolveSafeTimezone(timezone);
  const validDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  return new Intl.DateTimeFormat("en-US", {
    timeZone: safeTz,
    hour: "2-digit",
    minute: "2-digit",
  }).format(validDate);
}

/**
 * Build a real Date from wall-clock year/month/day/hour/minute values,
 * interpreting them as being in `timezone` (not the browser's local timezone).
 */
export function createDateTimeInTimezone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone?: string | null
): Date {
  const safeTz = resolveSafeTimezone(timezone);
  const dateString = `${year}-${String(month + 1).padStart(2, "0")}-${String(
    day
  ).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(
    minute
  ).padStart(2, "0")}:00`;

  return fromZonedTime(dateString, safeTz);
}

/**
 * Add (or subtract) whole calendar days to a Date, where "calendar day"
 * is determined by the given timezone (avoids DST / UTC-shift off-by-one bugs).
 */
export function addDaysInTimezone(
  date: Date,
  days: number,
  timezone?: string | null
): Date {
  const safeTz = resolveSafeTimezone(timezone);
  const { year, month, day } = getDatePartsInTimezone(date, safeTz);

  const utcDate = new Date(Date.UTC(year, month, day));
  utcDate.setUTCDate(utcDate.getUTCDate() + days);

  return createDateInTimezone(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth(),
    utcDate.getUTCDate(),
    safeTz
  );
}

/**
 * True if two Dates fall on the same calendar day in the given timezone.
 */
export function isSameDayInTimezone(
  a: Date,
  b: Date,
  timezone?: string | null
): boolean {
  const safeTz = resolveSafeTimezone(timezone);
  const partsA = getDatePartsInTimezone(a, safeTz);
  const partsB = getDatePartsInTimezone(b, safeTz);

  return (
    partsA.year === partsB.year &&
    partsA.month === partsB.month &&
    partsA.day === partsB.day
  );
}
