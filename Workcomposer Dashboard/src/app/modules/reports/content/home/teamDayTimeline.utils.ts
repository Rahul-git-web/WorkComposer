/**
 * Utility functions for Team Day — Live Activity Timeline (WORKCOMPOSER-117)
 */

import { formatTimeInTimezone, formatDateForApi, normalizeTimezone, FALLBACK_TIMEZONE } from "../../../../../utils/appTimezone.ts";

export interface TimelineBucket {
  index: number;
  startMinutes: number; // minutes from midnight (e.g. 330 for 5:30 AM)
  endMinutes: number; // minutes from midnight (e.g. 360 for 6:00 AM)
  label: string; // e.g. "5:30 AM", "6:00 AM"
  isHourMark: boolean;
  hourLabel?: string | undefined; // e.g. "6 AM", "8", "10", "12 PM", "2", "4"
}

export type BucketActivityState =
  | "active-high"
  | "active-medium-high"
  | "active-medium"
  | "active-low"
  | "active-very-low"
  | "active-zero"
  | "active-work"
  | "unavailable"
  | "break"
  | "not-tracking"
  | "future";

export interface EmployeeTimelineCell {
  bucketIndex: number;
  state: BucketActivityState;
  workSeconds: number;
  breakSeconds: number;
  activityScore: number | null;
  unusualInput: boolean;
  pinnedException: boolean;
  timeRangeLabel: string;
  activityUnavailable?: boolean | undefined;
}

export type AnomalyDataState = "measured-zero" | "positive" | "unavailable";

export interface EmployeeTimelineData {
  id: string;
  name: string;
  email?: string | undefined;
  avatar?: string | undefined;
  team: string;
  isTracking: boolean;
  statusText: string; // e.g. "Code", "manage.eventcube.io", "off", "not started"
  workSeconds: number;
  breakSeconds: number;
  activityScore: number | null; // 0 - 100 when measured, null when unmeasured/unavailable
  activityMeasured?: boolean | undefined; // true if activity was measured (even if 0%)
  trackingStatusUnknown?: boolean | undefined; // true if tracking status is genuinely unknown
  historicalAvgActivity?: number | undefined; // baseline average if available
  unusualActivityMinutes?: number | null | undefined; // real unusual input minutes if present (null when unavailable)
  unusualActivityMeasured?: boolean | undefined; // true if anomaly data was confirmed measured (even if 0m)
  unusualActivityCount?: number | undefined; // real anomaly count if present
  activityDelta?: number | null | undefined; // delta vs historical baseline if available
  isPinnedException?: boolean | undefined; // true when employee has pinned anomaly or large drop
  cells: EmployeeTimelineCell[];
  hasStarted: boolean;
  isUnavailable?: boolean | undefined;
}

export interface TeamDaySummaryMetrics {
  avgWorkedSeconds: number;
  avgWorkedFormatted: string;
  activePercentage: number;
  topPerformer: {
    name: string;
    workedSeconds: number;
    workedFormatted: string;
  } | null;
  biggestDrop: {
    name: string;
    dropPoints: number;
    comparisonLabel?: string | undefined;
  } | null;
  totalEmployees: number;
  activeCount: number;
  unusualActivityMinutes: number | null;
  unusualActivityStatus: AnomalyDataState;
  unusualActivityFormatted: string;
}

/**
 * Format minutes from midnight to clock label e.g. 360 -> "6:00 AM"
 */
export function formatMinutesToClock(minutes: number): string {
  let h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/**
 * Generate aligned timeline buckets from start time (default 5:30 AM) to end time (default 6:00 PM or now + 2h)
 * Bucket duration default: 30 minutes
 */
export function generateTimelineBuckets(
  startMinutes = 330, // 5:30 AM
  endMinutes = 1080, // 6:00 PM
  stepMinutes = 30
): TimelineBucket[] {
  const buckets: TimelineBucket[] = [];
  let index = 0;

  for (let m = startMinutes; m < endMinutes; m += stepMinutes) {
    const isHourMark = m % 60 === 0;
    const hour = Math.floor(m / 60) % 24;
    let hourLabel: string | undefined = undefined;

    // Display labels matching screenshot: "6 AM", "8", "10", "12 PM", "2", "4"
    if (isHourMark && hour % 2 === 0) {
      if (hour === 0) hourLabel = "12 AM";
      else if (hour === 6) hourLabel = "6 AM";
      else if (hour === 12) hourLabel = "12 PM";
      else if (hour < 12) hourLabel = `${hour}`;
      else hourLabel = `${hour - 12}`;
    }

    buckets.push({
      index,
      startMinutes: m,
      endMinutes: m + stepMinutes,
      label: formatMinutesToClock(m),
      isHourMark,
      hourLabel,
    });
    index++;
  }

  return buckets;
}

/**
 * Formats seconds into compact "Xh Ym" or "0h 0m" format
 */
export function formatTimelineDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  if (h > 0) return `${h}h 00m`;
  return `0h ${m.toString().padStart(2, "0")}m`;
}

/**
 * Extracts minutes from midnight for a given date in a specific timezone
 */
export function getMinutesFromMidnightInTimezone(date: Date, timezone = "UTC"): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    }).formatToParts(date);
    const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    return h * 60 + m;
  } catch {
    return date.getHours() * 60 + date.getMinutes();
  }
}

/**
 * Centralized utility mapping a valid activity score (0-100) to its visual intensity state.
 * Intensity bands:
 * - 80–100%: active-high (Dark green)
 * - 60–79%: active-medium-high (Medium-dark green)
 * - 40–59%: active-medium (Medium green)
 * - 20–39%: active-low (Light green)
 * - 1–19%: active-very-low (Very light green)
 * - 0% (measured): active-zero (Explicit zero-intensity visual)
 */
export function getActivityIntensityState(score: number): BucketActivityState {
  if (typeof score !== "number" || isNaN(score) || score < 0) return "unavailable";
  if (score >= 80) return "active-high";
  if (score >= 60) return "active-medium-high";
  if (score >= 40) return "active-medium";
  if (score >= 20) return "active-low";
  if (score > 0) return "active-very-low";
  return "active-zero";
}

export type IntervalActivityItem = {
  time?: string;
  startMinutes?: number;
  bucketIndex?: number;
  value: number | null;
  unusualInput?: boolean;
  unusual?: boolean;
  hasUnusualInput?: boolean;
};

export type IntervalActivitySource =
  | Array<IntervalActivityItem>
  | Record<string | number, number | null>
  | null;

function findIntervalActivityMatch(
  bucket: TimelineBucket,
  intervalActivity?: IntervalActivitySource
): IntervalActivityItem | undefined {
  if (!Array.isArray(intervalActivity)) return undefined;
  const bucketHour = Math.floor(bucket.startMinutes / 60);
  const bucketMin = bucket.startMinutes % 60;
  const timeKey1 = `${bucketHour}:${bucketMin === 0 ? "00" : bucketMin}`;
  const timeKey2 = `${String(bucketHour).padStart(2, "0")}:${bucketMin === 0 ? "00" : bucketMin}`;

  return intervalActivity.find((item) => {
    if (!item) return false;
    if (typeof item.bucketIndex === "number" && item.bucketIndex === bucket.index) return true;
    if (typeof item.startMinutes === "number" && item.startMinutes === bucket.startMinutes) return true;
    if (typeof item.time === "string") {
      const cleanTime = item.time.trim();
      return cleanTime === timeKey1 || cleanTime === timeKey2;
    }
    return false;
  });
}

/**
 * Resolves the interval-level activity score for a 30-minute bucket.
 * Never converts missing measurements to zero. Returns { score, hasMeasurement }.
 */
export function resolveBucketActivityScore(
  bucket: TimelineBucket,
  intervalActivity?: IntervalActivitySource,
  overlappingSessions?: any[]
): { score: number | null; hasMeasurement: boolean } {
  // 1. Array format: [{ time: "9:00", value: 92 }, { startMinutes: 540, value: 92 }, ...]
  if (Array.isArray(intervalActivity)) {
    const match = findIntervalActivityMatch(bucket, intervalActivity);

    if (match) {
      if (typeof match.value === "number" && !isNaN(match.value)) {
        return {
          score: Math.min(100, Math.max(0, Math.round(match.value))),
          hasMeasurement: true,
        };
      }
      return { score: null, hasMeasurement: false };
    }
  }

  // 2. Dictionary / Record format: { "9:00": 92 } or { 0: 92 }
  if (intervalActivity && typeof intervalActivity === "object" && !Array.isArray(intervalActivity)) {
    const bucketHour = Math.floor(bucket.startMinutes / 60);
    const bucketMin = bucket.startMinutes % 60;
    const timeKey1 = `${bucketHour}:${bucketMin === 0 ? "00" : bucketMin}`;
    const timeKey2 = `${String(bucketHour).padStart(2, "0")}:${bucketMin === 0 ? "00" : bucketMin}`;

    const rawVal =
      intervalActivity[bucket.index] ??
      intervalActivity[bucket.startMinutes] ??
      intervalActivity[timeKey1] ??
      intervalActivity[timeKey2];

    if (typeof rawVal === "number" && !isNaN(rawVal)) {
      return {
        score: Math.min(100, Math.max(0, Math.round(rawVal))),
        hasMeasurement: true,
      };
    }
    if (rawVal === null) {
      return { score: null, hasMeasurement: false };
    }
  }

  // 3. Overlapping session-level activity score
  if (Array.isArray(overlappingSessions)) {
    const sessionWithScore = overlappingSessions.find(
      (s) => s && typeof s.activityScore === "number" && !isNaN(s.activityScore)
    );
    if (sessionWithScore) {
      return {
        score: Math.min(100, Math.max(0, Math.round(sessionWithScore.activityScore))),
        hasMeasurement: true,
      };
    }
  }

  return { score: null, hasMeasurement: false };
}

/**
 * Parses user sessions and attributes them into aligned timeline buckets.
 * In Activity mode, computes independent color intensity per 30-minute bucket.
 */
export function buildEmployeeTimelineCells(
  sessions: any[] = [],
  buckets: TimelineBucket[],
  currentMinutesNow: number,
  userActivityScore: number | null = null,
  timezone = "UTC",
  mode: "worked" | "activity" = "worked",
  isToday = true,
  hasActivityData = true,
  intervalActivity?: IntervalActivitySource
): EmployeeTimelineCell[] {
  return buckets.map((bucket) => {
    // If bucket is entirely in the future (only for today)
    if (isToday && bucket.startMinutes >= currentMinutesNow) {
      return {
        bucketIndex: bucket.index,
        state: "future",
        workSeconds: 0,
        breakSeconds: 0,
        activityScore: null,
        unusualInput: false,
        pinnedException: false,
        timeRangeLabel: `${bucket.label} – ${formatMinutesToClock(bucket.endMinutes)}`,
      };
    }

    let bucketWorkSecs = 0;
    let bucketBreakSecs = 0;
    const overlappingWorkSessions: any[] = [];

    // Evaluate overlap with each session
    for (const session of sessions) {
      if (!session || !session.startTime) continue;
      const startD = new Date(session.startTime);
      if (isNaN(startD.getTime())) continue;

      const endD = session.endTime ? new Date(session.endTime) : new Date();
      const sessionStartM = getMinutesFromMidnightInTimezone(startD, timezone);
      const sessionEndM = getMinutesFromMidnightInTimezone(endD, timezone);

      // Check overlap with [bucket.startMinutes, bucket.endMinutes)
      const overlapStart = Math.max(bucket.startMinutes, sessionStartM);
      const overlapEnd = Math.min(bucket.endMinutes, sessionEndM);

      if (overlapEnd > overlapStart) {
        const overlapSeconds = (overlapEnd - overlapStart) * 60;
        if (session.type === "break") {
          bucketBreakSecs += overlapSeconds;
        } else {
          bucketWorkSecs += overlapSeconds;
          overlappingWorkSessions.push(session);
        }
      }
    }

    let state: BucketActivityState = "not-tracking";
    let cellActivityScore: number | null = null;

    if (bucketBreakSecs > bucketWorkSecs) {
      state = "break";
      cellActivityScore = null;
    } else if (bucketWorkSecs > 0) {
      if (mode === "activity") {
        // Resolve interval-level activity measurement
        const interval = resolveBucketActivityScore(bucket, intervalActivity, overlappingWorkSessions);

        if (interval.hasMeasurement && typeof interval.score === "number") {
          // Use centralized intensity band mapping
          state = getActivityIntensityState(interval.score);
          cellActivityScore = interval.score;
        } else if (intervalActivity !== undefined && intervalActivity !== null) {
          // An intervalActivity set was provided, but this bucket had no measurement
          state = "unavailable";
          cellActivityScore = null;
        } else if (!hasActivityData || userActivityScore === null) {
          // No activity data exists for this employee
          state = "unavailable";
          cellActivityScore = null;
        } else {
          // Backward compatibility fallback for legacy tests passing only a scalar userActivityScore
          state = getActivityIntensityState(userActivityScore);
          cellActivityScore = userActivityScore;
        }
      } else {
        // Worked Time mode: determines work fullness and intensity
        const fullness = bucketWorkSecs / ((bucket.endMinutes - bucket.startMinutes) * 60);
        if (fullness >= 0.7) {
          state = "active-high";
        } else if (fullness >= 0.4) {
          state = "active-medium";
        } else {
          state = "active-low";
        }
        // In Worked Time mode, use bucket-level interval activity if measured; otherwise null (do not attach user-wide 0%)
        const interval = resolveBucketActivityScore(bucket, intervalActivity, overlappingWorkSessions);
        if (interval.hasMeasurement && typeof interval.score === "number") {
          cellActivityScore = interval.score;
        } else {
          cellActivityScore = null;
        }
      }
    }

    const intervalMatch =
      bucketWorkSecs > 0 && state !== "break"
        ? findIntervalActivityMatch(bucket, intervalActivity)
        : undefined;
    const hasBucketUnusualInput = Boolean(
      intervalMatch &&
        (intervalMatch.unusualInput ||
          intervalMatch.unusual ||
          intervalMatch.hasUnusualInput)
    );

    return {
      bucketIndex: bucket.index,
      state,
      workSeconds: bucketWorkSecs,
      breakSeconds: bucketBreakSecs,
      activityScore: cellActivityScore,
      unusualInput: hasBucketUnusualInput,
      pinnedException: hasBucketUnusualInput,
      timeRangeLabel: `${bucket.label} – ${formatMinutesToClock(bucket.endMinutes)}`,
      activityUnavailable: state === "unavailable",
    };
  });
}

/**
 * Calculates current time position percentage for the vertical blue indicator marker
 */
export function calculateCurrentTimeMarkerPosition(
  currentMinutes: number,
  startMinutes: number,
  endMinutes: number
): { positionPercent: number; isVisible: boolean; formattedTime: string } {
  const formattedTime = formatMinutesToClock(currentMinutes);
  if (currentMinutes < startMinutes) {
    return { positionPercent: 0, isVisible: false, formattedTime };
  }
  if (currentMinutes > endMinutes) {
    return { positionPercent: 100, isVisible: false, formattedTime };
  }

  const range = endMinutes - startMinutes;
  const positionPercent = range <= 0 ? 100 : Math.min(100, Math.max(0, ((currentMinutes - startMinutes) / range) * 100));

  return {
    positionPercent,
    isVisible: true,
    formattedTime,
  };
}

/**
 * Calculates summary metrics matching the screenshot format:
 * "Team avg 3h 07m · 60% active · Top: Satyam Gupta 6h 05m · Biggest drop: Ritvick maini −83 pts vs their avg"
 */
export function calculateTeamDaySummaryMetrics(
  employees: EmployeeTimelineData[]
): TeamDaySummaryMetrics {
  const totalEmployees = employees.length;
  if (totalEmployees === 0) {
    return {
      avgWorkedSeconds: 0,
      avgWorkedFormatted: "0h 00m",
      activePercentage: 0,
      topPerformer: null,
      biggestDrop: null,
      totalEmployees: 0,
      activeCount: 0,
      unusualActivityMinutes: null,
      unusualActivityStatus: "unavailable",
      unusualActivityFormatted: "—",
    };
  }

  let totalWorkSeconds = 0;
  let activeCount = 0;
  let confirmedTrackingStatusCount = 0;
  let completeRosterRecordsCount = 0;
  let topEmp: EmployeeTimelineData | null = null;

  employees.forEach((emp) => {
    const isStatusUnknown = emp.trackingStatusUnknown === true || emp.isUnavailable === true;
    if (!isStatusUnknown) {
      confirmedTrackingStatusCount++;
    }

    const isRecordIncomplete = emp.isUnavailable === true || emp.trackingStatusUnknown === true;
    if (!isRecordIncomplete) {
      totalWorkSeconds += emp.workSeconds;
      completeRosterRecordsCount++;
    }

    // Count currently tracking employees (not-started employees are not active)
    if (emp.isTracking && !isStatusUnknown) {
      activeCount++;
    }
    if (!topEmp || emp.workSeconds > topEmp.workSeconds) {
      topEmp = emp;
    }
  });

  // 1. Average worked time across complete roster records
  // (Retain authorized-member denominator when data for entire roster is complete;
  // when records are missing/incomplete, denominator is confirmed complete records to avoid silently treating missing as zero)
  const avgWorkedDenominator = completeRosterRecordsCount > 0 ? completeRosterRecordsCount : totalEmployees;
  const avgWorkedSeconds = Math.round(totalWorkSeconds / avgWorkedDenominator);

  // 2. Active percentage: (currently tracking employees / authorized employees with confirmed tracking status) * 100
  const activePercentage = confirmedTrackingStatusCount > 0
    ? Math.round((activeCount / confirmedTrackingStatusCount) * 100)
    : 0;

  // 3. Top performer
  const topPerformer = topEmp && (topEmp as EmployeeTimelineData).workSeconds > 0
    ? {
        name: (topEmp as EmployeeTimelineData).name,
        workedSeconds: (topEmp as EmployeeTimelineData).workSeconds,
        workedFormatted: formatTimelineDuration((topEmp as EmployeeTimelineData).workSeconds),
      }
    : null;

  // 4. Calculate biggest drop vs their historical baseline average ("vs their avg")
  let biggestDropUser: EmployeeTimelineData | null = null;
  let maxDrop = 0;
  let comparisonLabel = "their avg";

  const hasHistoricalBaseline = employees.some(
    (e) => typeof e.historicalAvgActivity === "number" || typeof (e as any).baselineActivity === "number"
  );

  if (hasHistoricalBaseline) {
    employees.forEach((emp) => {
      if (emp.hasStarted && emp.workSeconds > 0 && typeof emp.activityScore === "number") {
        const baseline = emp.historicalAvgActivity ?? (emp as any).baselineActivity;
        if (typeof baseline === "number") {
          const drop = baseline - emp.activityScore;
          if (drop > maxDrop) {
            maxDrop = drop;
            biggestDropUser = emp;
            comparisonLabel = "their avg";
          }
        }
      }
    });
  } else {
    // Fallback: Compute against average activity score of contributors
    let scoredSum = 0;
    let scoredCount = 0;
    employees.forEach((emp) => {
      if (typeof emp.activityScore === "number" && emp.activityScore > 0) {
        scoredSum += emp.activityScore;
        scoredCount++;
      }
    });
    const avgScore = scoredCount > 0 ? Math.round(scoredSum / scoredCount) : 0;
    employees.forEach((emp) => {
      if (emp.hasStarted && emp.workSeconds > 0 && typeof emp.activityScore === "number") {
        const drop = avgScore - emp.activityScore;
        if (drop > maxDrop) {
          maxDrop = drop;
          biggestDropUser = emp;
          comparisonLabel = "their avg";
        }
      }
    });
  }

  const biggestDrop = biggestDropUser && maxDrop > 0
    ? {
        name: (biggestDropUser as EmployeeTimelineData).name,
        dropPoints: Math.round(maxDrop),
        comparisonLabel,
      }
    : null;

  // 5. Calculate team-level unusual activity metrics
  let totalUnusualMinutes = 0;
  let anyAnomalyMeasured = false;

  employees.forEach((emp) => {
    if (
      emp.unusualActivityMeasured === true &&
      typeof emp.unusualActivityMinutes === "number" &&
      !isNaN(emp.unusualActivityMinutes)
    ) {
      anyAnomalyMeasured = true;
      totalUnusualMinutes += emp.unusualActivityMinutes;
    }
  });

  let unusualActivityStatus: AnomalyDataState = "unavailable";
  let unusualActivityMinutes: number | null = null;
  let unusualActivityFormatted = "—";

  if (anyAnomalyMeasured) {
    unusualActivityMinutes = totalUnusualMinutes;
    if (totalUnusualMinutes > 0) {
      unusualActivityStatus = "positive";
      unusualActivityFormatted = `${totalUnusualMinutes}m`;
    } else {
      unusualActivityStatus = "measured-zero";
      unusualActivityFormatted = "0m";
    }
  }

  return {
    avgWorkedSeconds,
    avgWorkedFormatted: formatTimelineDuration(avgWorkedSeconds),
    activePercentage,
    topPerformer,
    biggestDrop,
    totalEmployees,
    activeCount,
    unusualActivityMinutes,
    unusualActivityStatus,
    unusualActivityFormatted,
  };
}
