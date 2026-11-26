import { fromZonedTime } from "date-fns-tz";
import {
  formatTimeInTimezone,
  formatDateForApi,
  isValidTimezone,
  normalizeTimezone,
  FALLBACK_TIMEZONE,
} from "./appTimezone.ts";

export interface AttendanceSession {
  startTime: string | Date;
  endTime?: string | Date | null;
  duration?: number;
  type: "work" | "break" | "not-tracked";
  [key: string]: any;
}

export interface TimelineSegment {
  left: number; // percentage 0 - 100
  width: number; // percentage 0 - 100
  type: "work" | "break" | "not-tracked";
  duration: number; // seconds within this day
  startTime: string; // ISO string of parent session start
  endTime?: string | null; // ISO string of parent session end
  segmentStart: string; // ISO string of segment start in UTC
  segmentEnd: string; // ISO string of segment end in UTC
  start: string; // Formatted clock time in employee timezone (e.g. "11:30 PM")
  end: string; // Formatted clock time in employee timezone (e.g. "12:00 AM")
  isActive?: boolean;
}

export interface DayBoundaries {
  dayStart: Date;
  dayEnd: Date;
  dayDurationMs: number;
  dateString: string;
  timezone: string;
}

/**
 * Computes exact UTC boundary instants for a given calendar day in a timezone.
 * Handles DST spring-forward (23h) and fall-back (25h) days accurately.
 */
export function getDayBoundariesInTimezone(
  targetDate: Date | string,
  timezone: string
): DayBoundaries {
  const tz = isValidTimezone(timezone) ? normalizeTimezone(timezone) : FALLBACK_TIMEZONE;

  let dateString: string;
  if (typeof targetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(targetDate.trim())) {
    dateString = targetDate.trim();
  } else {
    const d = new Date(targetDate);
    dateString = !isNaN(d.getTime()) ? formatDateForApi(d, tz) : formatDateForApi(new Date(), tz);
  }

  const [year, month, day] = dateString.split("-").map(Number) as [number, number, number];
  const nextDayUtc = new Date(Date.UTC(year, month - 1, day + 1));
  const nextDateString = nextDayUtc.toISOString().split("T")[0];

  const dayStart = fromZonedTime(`${dateString}T00:00:00.000`, tz);
  const dayEnd = fromZonedTime(`${nextDateString}T00:00:00.000`, tz);
  const dayDurationMs = dayEnd.getTime() - dayStart.getTime();

  return {
    dayStart,
    dayEnd,
    dayDurationMs: dayDurationMs > 0 ? dayDurationMs : 86400000,
    dateString,
    timezone: tz,
  };
}

/**
 * Clamps and slices sessions to their exact overlap within a single reporting calendar day.
 * Sessions crossing midnight are sliced to [dayStart, dayEnd), and active sessions
 * are safely bounded by evalNow.
 */
export function clampSessionsToDay(
  sessions: AttendanceSession[],
  targetDate: Date | string,
  timezone: string,
  evalNow: Date = new Date()
): (AttendanceSession & { oStartMs: number; oEndMs: number; isActive: boolean })[] {
  const { dayStart, dayEnd, timezone: tz } = getDayBoundariesInTimezone(targetDate, timezone);
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayEnd.getTime();

  const results: (AttendanceSession & { oStartMs: number; oEndMs: number; isActive: boolean })[] = [];

  for (const session of sessions || []) {
    if (!session || !session.startTime) continue;
    const sStart = new Date(session.startTime);
    if (isNaN(sStart.getTime())) continue;

    let sEnd: Date;
    let isActive = false;

    if (session.endTime) {
      sEnd = new Date(session.endTime);
      if (isNaN(sEnd.getTime())) {
        sEnd = evalNow && !isNaN(evalNow.getTime()) && evalNow > sStart ? evalNow : sStart;
        isActive = true;
      } else if (sEnd < sStart) {
        sEnd = sStart;
      }
    } else {
      isActive = true;
      const now = evalNow && !isNaN(evalNow.getTime()) ? evalNow : new Date();
      sEnd = now > sStart ? now : sStart;
    }

    const oStartMs = Math.max(sStart.getTime(), dayStartMs);
    const oEndMs = Math.min(sEnd.getTime(), dayEndMs);

    if (oEndMs <= oStartMs) {
      // No overlap with this day
      continue;
    }

    const durationSeconds = Math.floor((oEndMs - oStartMs) / 1000);

    results.push({
      ...session,
      startTime: new Date(oStartMs).toISOString(),
      endTime: isActive && sEnd.getTime() > dayEndMs ? null : new Date(oEndMs).toISOString(),
      duration: durationSeconds,
      oStartMs,
      oEndMs,
      isActive,
    });
  }

  return results.sort((a, b) => a.oStartMs - b.oStartMs);
}

/**
 * Calculates timeline segments for a single day, guaranteeing:
 * 1. Non-negative width: all segments have width >= 0.
 * 2. Finite CSS dimensions: no NaN or Infinity.
 * 3. Bounded within 0% - 100% of the day.
 * 4. Cross-midnight sessions correctly partition into Day 1 (up to 24:00) and Day 2 (from 00:00).
 * 5. Active sessions bounded by evaluation instant.
 * 6. Preserves "not-tracked" gaps between sessions for interactive tooltips.
 */
export function getTimelineSegmentsForDay(
  sessions: AttendanceSession[],
  targetDate: Date | string,
  timezone: string,
  options: { evalNow?: Date; includeGaps?: boolean } = {}
): TimelineSegment[] {
  const { dayStart, dayDurationMs, timezone: tz } = getDayBoundariesInTimezone(targetDate, timezone);
  const dayStartMs = dayStart.getTime();

  const clamped = clampSessionsToDay(sessions, targetDate, tz, options.evalNow);
  if (!clamped.length) {
    return [];
  }

  const rawSegments: TimelineSegment[] = [];

  for (const item of clamped) {
    const oStartMs = item.oStartMs;
    const oEndMs = item.oEndMs;
    const durationMs = Math.max(0, oEndMs - oStartMs);

    const leftRaw = ((oStartMs - dayStartMs) / dayDurationMs) * 100;
    const widthRaw = (durationMs / dayDurationMs) * 100;

    const safeLeft = Math.max(0, Math.min(100, isFinite(leftRaw) ? leftRaw : 0));
    const safeWidth = Math.max(0, Math.min(100 - safeLeft, isFinite(widthRaw) ? widthRaw : 0));

    rawSegments.push({
      left: safeLeft,
      width: safeWidth,
      type: item.type,
      duration: Math.floor(durationMs / 1000),
      startTime: typeof item.startTime === "string" ? item.startTime : new Date(item.startTime).toISOString(),
      endTime: item.endTime ? (typeof item.endTime === "string" ? item.endTime : new Date(item.endTime).toISOString()) : null,
      segmentStart: new Date(oStartMs).toISOString(),
      segmentEnd: new Date(oEndMs).toISOString(),
      start: formatTimeInTimezone(new Date(oStartMs), tz),
      end: formatTimeInTimezone(new Date(oEndMs), tz),
      isActive: item.isActive,
    });
  }

  if (options.includeGaps === false) {
    return rawSegments;
  }

  // Interleave "not-tracked" segments in chronological gaps between tracked sessions
  const finalTimeline: TimelineSegment[] = [];

  for (let i = 0; i < rawSegments.length; i++) {
    const current = rawSegments[i];
    if (!current) continue;
    finalTimeline.push(current);

    const next = rawSegments[i + 1];
    if (next) {
      const currentEndMs = new Date(current.segmentEnd).getTime();
      const nextStartMs = new Date(next.segmentStart).getTime();
      const gapMs = nextStartMs - currentEndMs;

      // If there is an un-tracked gap of at least 1 minute (60,000 ms)
      if (gapMs >= 60000) {
        const gapLeftRaw = ((currentEndMs - dayStartMs) / dayDurationMs) * 100;
        const gapWidthRaw = (gapMs / dayDurationMs) * 100;

        const safeGapLeft = Math.max(0, Math.min(100, isFinite(gapLeftRaw) ? gapLeftRaw : 0));
        const safeGapWidth = Math.max(0, Math.min(100 - safeGapLeft, isFinite(gapWidthRaw) ? gapWidthRaw : 0));

        finalTimeline.push({
          type: "not-tracked",
          left: safeGapLeft,
          width: safeGapWidth,
          duration: Math.floor(gapMs / 1000),
          startTime: current.segmentEnd,
          endTime: next.segmentStart,
          segmentStart: current.segmentEnd,
          segmentEnd: next.segmentStart,
          start: formatTimeInTimezone(new Date(currentEndMs), tz),
          end: formatTimeInTimezone(new Date(nextStartMs), tz),
        });
      }
    }
  }

  return finalTimeline;
}
