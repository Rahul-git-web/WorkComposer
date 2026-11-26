import { prisma } from "../config/prisma.js";
import { normalizeId } from "../security/effectiveAuthContext.js";
import {
  resolveUserTimezone,
  getZonedDayRange,
  getDateInTimezone,
  isValidTimezone,
  normalizeTimezone,
  FALLBACK_TIMEZONE,
} from "../utils/timezone.js";
import { formatInTimeZone } from "date-fns-tz";

/**
 * WORKCOMPOSER-123-G: Evidence-Based Team Day Intelligence Service
 *
 * Strictly follows the 10 Intelligence Principles:
 * 1. Measured, missing, and unavailable are distinct states.
 * 2. Missing telemetry is never interpreted as inactivity.
 * 3. Continuous event spans are never described as continuous physical interaction.
 * 4. Pauses are recognized as natural work (reading, planning, thinking, meetings).
 * 5. Repeated patterns are observations, not accusations or proof of automation.
 * 6. Never claims hardware macro / mouse jiggler detection from aggregate data.
 * 7. Strictly avoids negative employee misconduct classifications.
 * 8. All observations are explainable and traceable to source data.
 */

export const MEASUREMENT_STATUS = {
  MEASURED: "MEASURED",
  PARTIAL: "PARTIAL",
  UNAVAILABLE: "UNAVAILABLE",
  INTERRUPTED: "INTERRUPTED",
};

export const OBSERVATION_CATEGORIES = {
  CONTINUITY: "CONTINUITY",
  REPEATED_PATTERN: "REPEATED_PATTERN",
  SESSION_INTEGRITY: "SESSION_INTEGRITY",
  MEASUREMENT_INTEGRITY: "MEASUREMENT_INTEGRITY",
  HISTORICAL_COMPARISON: "HISTORICAL_COMPARISON",
};

export const DETECTION_RULES = {
  R_CONT_01: {
    id: "R-CONT-01",
    version: "1.1.0",
    name: "Activity Continuity Span Analysis",
    category: OBSERVATION_CATEGORIES.CONTINUITY,
  },
  R_PATT_01: {
    id: "R-PATT-01",
    version: "1.1.0",
    name: "Consecutive Identical Aggregate Counts",
    category: OBSERVATION_CATEGORIES.REPEATED_PATTERN,
  },
  R_SESS_01: {
    id: "R-SESS-01",
    version: "1.1.0",
    name: "Session Boundary & Telemetry Synchronization",
    category: OBSERVATION_CATEGORIES.SESSION_INTEGRITY,
  },
  R_MEAS_01: {
    id: "R-MEAS-01",
    version: "1.1.0",
    name: "Telemetry Coverage & Discontinuity Evaluation",
    category: OBSERVATION_CATEGORIES.MEASUREMENT_INTEGRITY,
  },
  R_HIST_01: {
    id: "R-HIST-01",
    version: "1.2.0",
    name: "Personal Historical Baseline Comparison",
    category: OBSERVATION_CATEGORIES.HISTORICAL_COMPARISON,
  },
};

/**
 * Extracts a normalized event timestamp (epoch ms) from an Activity record.
 * Prioritizes client-side monotonic-mapped telemetry timestamps before falling back to createdAt.
 */
export function getEventTimestamp(act) {
  if (!act) return NaN;
  const raw = act.eventTimestamp || act.telemetry?.firstObservedAt || act.telemetry?.measuredStart || act.createdAt;
  if (!raw) return NaN;
  const d = new Date(raw);
  return d.getTime();
}

/**
 * Resolves session identifier for an activity record, matching against active work sessions if unassigned.
 */
export function getSessionIdentifier(act, sessions = []) {
  if (!act) return null;
  if (act.sessionId) return normalizeId(act.sessionId);
  if (act.telemetry?.sessionId) return normalizeId(act.telemetry.sessionId);
  if (Array.isArray(sessions) && sessions.length > 0) {
    const actTime = getEventTimestamp(act);
    if (!isNaN(actTime)) {
      const match = sessions.find((s) => {
        const sStart = new Date(s.startTime).getTime();
        const sEnd = s.endTime ? new Date(s.endTime).getTime() : Infinity;
        return actTime >= sStart && actTime <= sEnd;
      });
      if (match) return normalizeId(match.id || match._id);
    }
  }
  return null;
}

/**
 * Evaluates activity continuity across 10-second intervals within a time range.
 */
export function analyzeActivityContinuity({ activities = [], sessions = [], periodStart, periodEnd }) {
  if (!periodStart || !periodEnd || activities.length === 0) {
    return {
      status: MEASUREMENT_STATUS.UNAVAILABLE,
      totalObservedEvents: 0,
      continuousSpanSeconds: 0,
      longestGapSeconds: 0,
      naturalGapsCount: 0,
      interruptedSegmentsCount: 0,
      coveragePercent: 0,
      usableTelemetryRatio: 0,
      observation: null,
    };
  }

  // Sort activities chronologically by canonical event timestamp
  const sorted = [...activities]
    .filter((a) => a && !isNaN(getEventTimestamp(a)))
    .sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b));

  if (sorted.length === 0) {
    return {
      status: MEASUREMENT_STATUS.UNAVAILABLE,
      totalObservedEvents: 0,
      continuousSpanSeconds: 0,
      longestGapSeconds: 0,
      naturalGapsCount: 0,
      interruptedSegmentsCount: 0,
      coveragePercent: 0,
      usableTelemetryRatio: 0,
      observation: null,
    };
  }

  // Deduplicate exact duplicate flushes (same idempotencyKey or identical timestamp + counts)
  const uniqueActivities = [];
  const seenActKeys = new Set();
  for (const act of sorted) {
    const actTime = getEventTimestamp(act);
    const key = act.idempotencyKey || `${actTime}_${act.userId || act.user || ""}_${act.keyPresses}_${act.mouseClicks}_${act.mouseMoves}`;
    if (!seenActKeys.has(key)) {
      seenActKeys.add(key);
      uniqueActivities.push(act);
    }
  }

  let totalEvents = 0;
  let activeIntervals = 0;
  let naturalGapsCount = 0;
  let longestGapMs = 0;
  let currentContinuousSpanMs = 0;
  let maxContinuousSpanMs = 0;
  let interruptedSegments = 0;

  for (let i = 0; i < uniqueActivities.length; i++) {
    const act = uniqueActivities[i];
    const eventCount = (Number(act.keyPresses) || 0) + (Number(act.mouseClicks) || 0) + (Number(act.mouseMoves) || 0);
    totalEvents += eventCount;

    if (eventCount > 0) {
      activeIntervals++;
    }

    // Inspect client-side telemetry if available
    if (act.telemetry && typeof act.telemetry === "object") {
      if (act.telemetry.naturalGapsCount) naturalGapsCount += act.telemetry.naturalGapsCount;
      if (act.telemetry.longestGapMs && act.telemetry.longestGapMs > longestGapMs) {
        longestGapMs = act.telemetry.longestGapMs;
      }
      if (act.telemetry.continuousDurationMs && act.telemetry.continuousDurationMs > maxContinuousSpanMs) {
        maxContinuousSpanMs = act.telemetry.continuousDurationMs;
      }
      if (act.telemetry.completeness === "interrupted") {
        interruptedSegments++;
      }
    }

    if (i > 0) {
      const prevAct = uniqueActivities[i - 1];
      const prevTime = getEventTimestamp(prevAct);
      const currTime = getEventTimestamp(act);
      const deltaMs = Math.max(0, currTime - prevTime);

      if (deltaMs > longestGapMs) {
        longestGapMs = deltaMs;
      }

      // If gap exceeds 12 seconds (10s threshold + 2s jitter tolerance)
      if (deltaMs >= 12000) {
        naturalGapsCount++;
        currentContinuousSpanMs = 0; // Segment terminates
        if (deltaMs >= 120000) {
          // Gap > 2 minutes during tracked day indicates pause/sleep
          interruptedSegments++;
        }
      } else {
        // Continuous sequence
        currentContinuousSpanMs += deltaMs;
        if (currentContinuousSpanMs > maxContinuousSpanMs) {
          maxContinuousSpanMs = currentContinuousSpanMs;
        }
      }
    }
  }

  // Calculate session coverage
  const totalTrackedSeconds = sessions
    .filter((s) => s.type === "work")
    .reduce((acc, s) => {
      const start = Math.max(new Date(s.startTime).getTime(), periodStart.getTime());
      const end = s.endTime
        ? Math.min(new Date(s.endTime).getTime(), periodEnd.getTime())
        : Math.min(Date.now(), periodEnd.getTime());
      return acc + Math.max(0, Math.floor((end - start) / 1000));
    }, 0);

  // Calculate session coverage using the interval coverage engine (replaces legacy point multiplier)
  const workSessions = sessions.filter((s) => s.type === "work");
  const breakSessions = sessions.filter((s) => s.type === "break");

  const coverageResult = calculateIntervalCoverage({
    activities: uniqueActivities,
    workSessions,
    breakSessions,
    windowStart: periodStart,
    windowEnd: periodEnd,
  });

  const observedIntervalSeconds = Math.round(coverageResult.observedDurationMs / 1000);
  const coveragePercent = totalTrackedSeconds > 0
    ? Math.min(100, Math.round((observedIntervalSeconds / totalTrackedSeconds) * 100))
    : (observedIntervalSeconds > 0 ? 100 : 0);

  let status = MEASUREMENT_STATUS.MEASURED;
  if (totalTrackedSeconds === 0 && uniqueActivities.length === 0) {
    status = MEASUREMENT_STATUS.UNAVAILABLE;
  } else if (interruptedSegments > 0) {
    status = MEASUREMENT_STATUS.INTERRUPTED;
  } else if (coveragePercent < 50) {
    status = MEASUREMENT_STATUS.PARTIAL;
  }

  let observation = null;
  const continuousSpanSeconds = Math.round(maxContinuousSpanMs / 1000);
  const longestGapSeconds = Math.round(longestGapMs / 1000);

  if (status !== MEASUREMENT_STATUS.UNAVAILABLE) {
    observation = {
      ruleId: DETECTION_RULES.R_CONT_01.id,
      ruleVersion: DETECTION_RULES.R_CONT_01.version,
      category: OBSERVATION_CATEGORIES.CONTINUITY,
      type: "CONTINUOUS_SPAN_OBSERVATION",
      status,
      evidence: {
        totalObservedEvents: totalEvents,
        activeIntervalsCount: activeIntervals,
        totalIntervalsCount: uniqueActivities.length,
        continuousSpanSeconds,
        longestGapSeconds,
        naturalGapsCount,
        interruptedSegmentsCount: interruptedSegments,
        coveragePercent,
      },
      explanation: `Activity continuity evaluated across ${uniqueActivities.length} intervals (${coveragePercent}% coverage). Longest continuous span was ${Math.round(continuousSpanSeconds / 60)} minutes with ${naturalGapsCount} natural pauses observed.`,
      limitations: "Continuous event spans do not imply unbroken physical interaction; legitimate tasks like reading, designing, and coding naturally contain pauses.",
    };
  }

  return {
    status,
    totalObservedEvents: totalEvents,
    continuousSpanSeconds,
    longestGapSeconds,
    naturalGapsCount,
    interruptedSegmentsCount: interruptedSegments,
    coveragePercent,
    usableTelemetryRatio: coveragePercent / 100,
    observation,
  };
}

/**
 * Detects repeated aggregate patterns across consecutive intervals with strict temporal continuity.
 * Minimum sample size: at least 6 consecutive intervals (1 full minute) of identical non-zero input counts.
 * Maximum allowable gap between adjacent intervals: 15,000ms (10s collection cadence + 5s network jitter tolerance).
 */
export function detectRepeatedPatterns({
  activities = [],
  sessions = [],
  minConsecutiveIntervals = 6,
  maxIntervalGapMs = 15000,
  windowStart = null,
  windowEnd = null,
}) {
  if (!Array.isArray(activities) || activities.length < minConsecutiveIntervals) {
    return {
      patternsFound: 0,
      totalPatternMinutes: 0,
      observations: [],
      bucketPatterns: {},
    };
  }

  const wStartTime = windowStart ? new Date(windowStart).getTime() : -Infinity;
  const wEndTime = windowEnd ? new Date(windowEnd).getTime() : Infinity;

  // 1. Filter valid activities within observation window and with valid dates
  const validActs = activities.filter((act) => {
    if (!act) return false;
    const t = getEventTimestamp(act);
    return !isNaN(t) && t >= wStartTime && t <= wEndTime;
  });

  if (validActs.length < minConsecutiveIntervals) {
    return {
      patternsFound: 0,
      totalPatternMinutes: 0,
      observations: [],
      bucketPatterns: {},
    };
  }

  // 2. Sort chronologically by canonical event timestamp
  validActs.sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b));

  // 3. Deduplicate exact duplicate flushes (same idempotencyKey or identical timestamp + counts)
  const deduplicated = [];
  const seenFlushes = new Set();
  for (const act of validActs) {
    const t = getEventTimestamp(act);
    const key = act.idempotencyKey || `${t}_${act.userId || act.user || ""}_${act.keyPresses}_${act.mouseClicks}_${act.mouseMoves}`;
    if (!seenFlushes.has(key)) {
      seenFlushes.add(key);
      deduplicated.push(act);
    }
  }

  const observations = [];
  const bucketPatterns = {};
  const recordedStreaks = [];
  let currentStreak = [];

  for (let i = 0; i < deduplicated.length; i++) {
    const act = deduplicated[i];
    const keyPresses = Number(act.keyPresses) || 0;
    const mouseClicks = Number(act.mouseClicks) || 0;
    const mouseMoves = Number(act.mouseMoves) || 0;
    const totalEvents = keyPresses + mouseClicks + mouseMoves;
    const actTime = getEventTimestamp(act);
    const actSessionId = getSessionIdentifier(act, sessions);
    const actUserId = normalizeId(act.userId || act.user);
    const isInterrupted = act.telemetry?.completeness === "interrupted";

    // Condition A: Interrupted interval immediately breaks any active streak
    if (isInterrupted) {
      if (currentStreak.length >= minConsecutiveIntervals) {
        recordedStreaks.push([...currentStreak]);
      }
      currentStreak = [];
      continue;
    }

    // Condition B: Zero-activity interval (measured zero) breaks sequence
    if (totalEvents === 0) {
      if (currentStreak.length >= minConsecutiveIntervals) {
        recordedStreaks.push([...currentStreak]);
      }
      currentStreak = [];
      continue;
    }

    if (currentStreak.length === 0) {
      currentStreak.push(act);
    } else {
      const prev = currentStreak[currentStreak.length - 1];
      const prevTime = getEventTimestamp(prev);
      const deltaMs = actTime - prevTime;
      const prevSessionId = getSessionIdentifier(prev, sessions);
      const prevUserId = normalizeId(prev.userId || prev.user);
      const prevKeys = Number(prev.keyPresses) || 0;
      const prevClicks = Number(prev.mouseClicks) || 0;
      const prevMoves = Number(prev.mouseMoves) || 0;

      // Condition C: User mismatch breaks sequence
      const userMismatch = actUserId && prevUserId && actUserId !== prevUserId;

      // Condition D: Session boundary mismatch breaks sequence
      const sessionMismatch = actSessionId && prevSessionId && actSessionId !== prevSessionId;

      // Condition E: Temporal gap check
      // deltaMs <= 0 means duplicate or non-increasing timestamp (ignored/breaks)
      // deltaMs > maxIntervalGapMs means missing interval or pause (> 15s)
      const temporalGapExceeded = deltaMs <= 0 || deltaMs > maxIntervalGapMs;

      // Condition F: Count equality
      const countsMatch = keyPresses === prevKeys && mouseClicks === prevClicks && mouseMoves === prevMoves;

      if (!userMismatch && !sessionMismatch && !temporalGapExceeded && countsMatch) {
        currentStreak.push(act);
      } else {
        if (currentStreak.length >= minConsecutiveIntervals) {
          recordedStreaks.push([...currentStreak]);
        }
        currentStreak = [act];
      }
    }
  }

  if (currentStreak.length >= minConsecutiveIntervals) {
    recordedStreaks.push([...currentStreak]);
  }

  let totalPatternSeconds = 0;

  recordedStreaks.forEach((streak) => {
    const first = streak[0];
    const last = streak[streak.length - 1];
    const sampleKeys = Number(first.keyPresses) || 0;
    const sampleClicks = Number(first.mouseClicks) || 0;
    const sampleMoves = Number(first.mouseMoves) || 0;
    const totalEventsPerInterval = sampleKeys + sampleClicks + sampleMoves;

    const streakDurationSeconds = streak.length * 10;
    totalPatternSeconds += streakDurationSeconds;
    const streakDurationMinutes = Math.round(streakDurationSeconds / 60);

    const firstTime = getEventTimestamp(first);
    const lastTime = getEventTimestamp(last);
    const windowStart = new Date(firstTime);
    const windowEnd = new Date(lastTime);

    // Map to half-hour bucket
    const bucketHour = windowStart.getUTCHours();
    const bucketMin = windowStart.getUTCMinutes() < 30 ? "00" : "30";
    const bucketKey = `${bucketHour}:${bucketMin}`;

    if (!bucketPatterns[bucketKey]) {
      bucketPatterns[bucketKey] = {
        unusualInput: true,
        patternCount: 0,
        patternMinutes: 0,
      };
    }
    bucketPatterns[bucketKey].patternCount++;
    bucketPatterns[bucketKey].patternMinutes += streakDurationMinutes;

    observations.push({
      ruleId: DETECTION_RULES.R_PATT_01.id,
      ruleVersion: DETECTION_RULES.R_PATT_01.version,
      category: OBSERVATION_CATEGORIES.REPEATED_PATTERN,
      type: "REPEATED_AGGREGATE_COUNTS",
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      status: MEASUREMENT_STATUS.MEASURED,
      evidence: {
        consecutiveIntervalsCount: streak.length,
        durationSeconds: streakDurationSeconds,
        durationMinutes: streakDurationMinutes,
        patternKeyCount: sampleKeys,
        patternClickCount: sampleClicks,
        patternMoveCount: sampleMoves,
        totalEventsPerInterval,
        maxPermittedGapMs: maxIntervalGapMs,
        maxObservedGapMs: Math.max(...streak.slice(1).map((s, idx) => getEventTimestamp(s) - getEventTimestamp(streak[idx]))),
      },
      explanation: `Repeated aggregate pattern observed: ${streak.length} consecutive 10-second intervals with identical input counts (${sampleKeys} keys, ${sampleClicks} clicks, ${sampleMoves} moves).`,
      limitations: "Represents an aggregate numerical observation only. Cannot distinguish human rhythmic work from test automation or external hardware devices.",
    });
  });

  return {
    patternsFound: recordedStreaks.length,
    totalPatternMinutes: Math.round(totalPatternSeconds / 60),
    observations,
    bucketPatterns,
  };
}

/**
 * Evaluates session integrity and data-quality conditions.
 * Categorizes telemetry silence as TELEMETRY_NOT_OBSERVED with status INTERRUPTED.
 */
export function evaluateSessionIntegrity({ sessions = [], activities = [], periodStart, periodEnd }) {
  const observations = [];
  const workSessions = sessions.filter((s) => s.type === "work");

  if (workSessions.length === 0) {
    return { status: MEASUREMENT_STATUS.UNAVAILABLE, observations };
  }

  // Check for work sessions >= 5 minutes with zero telemetry records
  workSessions.forEach((s) => {
    const sStart = new Date(s.startTime);
    const sEnd = s.endTime ? new Date(s.endTime) : (periodEnd || new Date());
    const durationMins = (sEnd.getTime() - sStart.getTime()) / 60000;

    if (durationMins >= 5) {
      const sessionActivities = activities.filter((a) => {
        const aTime = getEventTimestamp(a);
        return !isNaN(aTime) && aTime >= sStart.getTime() && aTime <= sEnd.getTime();
      });

      if (sessionActivities.length === 0) {
        observations.push({
          ruleId: DETECTION_RULES.R_SESS_01.id,
          ruleVersion: DETECTION_RULES.R_SESS_01.version,
          category: OBSERVATION_CATEGORIES.SESSION_INTEGRITY,
          type: "TELEMETRY_NOT_OBSERVED",
          windowStart: sStart.toISOString(),
          windowEnd: sEnd.toISOString(),
          status: MEASUREMENT_STATUS.INTERRUPTED,
          evidence: {
            sessionDurationMinutes: Math.round(durationMins),
            recordedActivitiesCount: 0,
            possibleCauses: [
              "client_offline_buffering",
              "system_sleep_without_clockout",
              "web_dashboard_tracking_without_agent",
              "delayed_network_delivery",
              "agent_stopped",
            ],
            causeDetermination: "unknown",
          },
          explanation: `Work session of ${Math.round(durationMins)} minutes contains zero received activity telemetry records.`,
          limitations: "Cause of telemetry silence cannot be determined from backend records alone (could reflect client offline buffering, application sleep, web-only time tracking, or stopped agent); does not establish employee presence, absence, or activity level.",
        });
      }
    }
  });

  return {
    status: observations.length > 0 ? MEASUREMENT_STATUS.INTERRUPTED : MEASUREMENT_STATUS.MEASURED,
    observations,
  };
}

/**
 * Evaluates measurement integrity and telemetry coverage.
 */
export function evaluateMeasurementIntegrity({ activities = [], expectedIntervals = 0, deduplicatedCount = null }) {
  const observations = [];

  const actualIntervals = deduplicatedCount !== null ? deduplicatedCount : (
    new Set(activities.map((a) => a.idempotencyKey || `${getEventTimestamp(a)}_${a.userId || a.user || ""}_${a.keyPresses}_${a.mouseClicks}_${a.mouseMoves}`)).size
  );

  if (expectedIntervals <= 0 && actualIntervals === 0) {
    return { status: MEASUREMENT_STATUS.UNAVAILABLE, coveragePercent: 0, observations };
  }

  const coveragePercent = expectedIntervals > 0 ? Math.min(100, Math.round((actualIntervals / expectedIntervals) * 100)) : 100;

  if (coveragePercent < 50 && actualIntervals > 0) {
    observations.push({
      ruleId: DETECTION_RULES.R_MEAS_01.id,
      ruleVersion: DETECTION_RULES.R_MEAS_01.version,
      category: OBSERVATION_CATEGORIES.MEASUREMENT_INTEGRITY,
      type: "LOW_TELEMETRY_COVERAGE",
      status: MEASUREMENT_STATUS.PARTIAL,
      evidence: {
        expectedIntervals,
        actualIntervals,
        coveragePercent,
      },
      explanation: `Telemetry coverage incomplete: received ${actualIntervals} of ${expectedIntervals} expected intervals (${coveragePercent}%).`,
      limitations: "Measures transport completeness and client reporting uptime; does not indicate employee productivity or work performance.",
    });
  }

  let status = MEASUREMENT_STATUS.MEASURED;
  if (expectedIntervals <= 0 && actualIntervals === 0) {
    status = MEASUREMENT_STATUS.UNAVAILABLE;
  } else if (coveragePercent < 50) {
    status = MEASUREMENT_STATUS.PARTIAL;
  } else if (coveragePercent < 70) {
    status = MEASUREMENT_STATUS.PARTIAL;
  }

  return {
    status,
    coveragePercent,
    observations,
  };
}

export const HISTORICAL_BASELINE_CONFIG = {
  MIN_ELIGIBLE_DURATION_SECONDS: 10800, // 3 hours
  MIN_TELEMETRY_COVERAGE_RATIO: 0.50, // 50.0%
  MIN_QUALIFYING_DAYS_PROVISIONAL: 3,
  MIN_QUALIFYING_DAYS_ESTABLISHED: 5,
};

/**
 * Merges overlapping or contiguous work session intervals within a day boundary.
 * Prevents overlapping sessions from inflating total tracked duration.
 * Rejects invalid, zero-duration, or inverted sessions.
 */
export function mergeSessionIntervals(sessions = [], dayStart, dayEnd) {
  if (!Array.isArray(sessions) || sessions.length === 0 || !dayStart || !dayEnd) {
    return { mergedIntervals: [], totalTrackedSeconds: 0 };
  }

  const dStartTime = dayStart instanceof Date ? dayStart.getTime() : new Date(dayStart).getTime();
  const dEndTime = dayEnd instanceof Date ? dayEnd.getTime() : new Date(dayEnd).getTime();

  if (isNaN(dStartTime) || isNaN(dEndTime) || dStartTime >= dEndTime) {
    return { mergedIntervals: [], totalTrackedSeconds: 0 };
  }

  const intervals = [];
  for (const s of sessions) {
    if (!s || (s.type && s.type !== "work")) continue; // Only work sessions
    if (!s.startTime && !s.start_time) continue;

    const rawStart = new Date(s.startTime || s.start_time).getTime();
    const rawEnd = s.endTime || s.end_time
      ? new Date(s.endTime || s.end_time).getTime()
      : Math.min(Date.now(), dEndTime);

    if (isNaN(rawStart) || isNaN(rawEnd) || rawStart >= rawEnd) {
      continue; // Discard invalid, inverted, or zero-duration sessions
    }

    const boundedStart = Math.max(rawStart, dStartTime);
    const boundedEnd = Math.min(rawEnd, dEndTime);

    if (boundedStart < boundedEnd) {
      intervals.push({ start: boundedStart, end: boundedEnd });
    }
  }

  if (intervals.length === 0) {
    return { mergedIntervals: [], totalTrackedSeconds: 0 };
  }

  // Sort chronologically by start
  intervals.sort((a, b) => a.start - b.start);

  // Merge overlapping or contiguous intervals
  const mergedIntervals = [];
  for (const cur of intervals) {
    if (mergedIntervals.length === 0) {
      mergedIntervals.push({ start: cur.start, end: cur.end });
    } else {
      const last = mergedIntervals[mergedIntervals.length - 1];
      if (cur.start <= last.end) {
        last.end = Math.max(last.end, cur.end);
      } else {
        mergedIntervals.push({ start: cur.start, end: cur.end });
      }
    }
  }

  const totalTrackedSeconds = mergedIntervals.reduce(
    (acc, inv) => acc + Math.floor((inv.end - inv.start) / 1000),
    0
  );

  return { mergedIntervals, totalTrackedSeconds };
}

/**
 * WORKCOMPOSER-123-J: Interval-Based Telemetry Coverage Engine
 */

/**
 * Extracts a normalized [start, end) interval in epoch milliseconds from an Activity record.
 * Authoritative: requires client-side measured telemetry window [measuredStart, measuredEnd).
 * Never synthesizes nominal duration for point-only records lacking measured boundaries.
 */
export function extractActivityInterval(act) {
  if (!act) return null;

  // 1. Authoritative telemetry measurement window
  if (act.telemetry && typeof act.telemetry === "object" && act.telemetry.measuredStart && act.telemetry.measuredEnd) {
    const s = new Date(act.telemetry.measuredStart).getTime();
    const e = new Date(act.telemetry.measuredEnd).getTime();
    if (isNaN(s) || isNaN(e) || e <= s) {
      return null; // Explicitly invalid or inverted interval: reject
    }

    const events =
      (typeof act.telemetry?.totalEvents === "number" ? act.telemetry.totalEvents : 0) ||
      ((Number(act.keyPresses) || 0) + (Number(act.mouseClicks) || 0) + (Number(act.mouseMoves) || 0));
    const isDelayed = Boolean(
      act.createdAt && act.eventTimestamp &&
      (new Date(act.createdAt).getTime() - new Date(act.eventTimestamp).getTime() > 60000)
    );

    return {
      start: s,
      end: e,
      durationMs: e - s,
      events,
      source: "TELEMETRY_MEASURED",
      isDelayed,
      idempotencyKey: act.idempotencyKey || null,
      userId: act.userId || act.user || null,
      rawActivity: act,
    };
  }

  // Point-only record: no measured interval boundaries. Never synthesize nominal coverage.
  return null;
}

/**
 * Clips a temporal interval [interval.start, interval.end) to the designated evaluation window [windowStart, windowEnd).
 * Returns null if the interval is completely disjoint from the window.
 */
export function clipInterval(interval, windowStart, windowEnd) {
  if (!interval || typeof interval.start !== "number" || typeof interval.end !== "number") {
    return null;
  }
  const wStart = typeof windowStart === "number" ? windowStart : new Date(windowStart).getTime();
  const wEnd = typeof windowEnd === "number" ? windowEnd : new Date(windowEnd).getTime();

  if (isNaN(wStart) || isNaN(wEnd) || wEnd <= wStart) {
    return null;
  }

  const clippedStart = Math.max(interval.start, wStart);
  const clippedEnd = Math.min(interval.end, wEnd);

  if (clippedEnd <= clippedStart) {
    return null;
  }

  return {
    ...interval,
    start: clippedStart,
    end: clippedEnd,
    durationMs: clippedEnd - clippedStart,
  };
}

/**
 * Merges an array of overlapping or adjacent intervals into a canonical array of disjoint intervals.
 * Guarantees that no millisecond is counted more than once (prevents double-counting).
 * Runs in O(N log N) time complexity.
 */
export function mergeDisjointIntervals(intervals = []) {
  if (!Array.isArray(intervals) || intervals.length === 0) {
    return [];
  }

  const valid = intervals
    .filter((inv) => inv && typeof inv.start === "number" && typeof inv.end === "number" && inv.end > inv.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (valid.length === 0) return [];

  const merged = [];
  for (const inv of valid) {
    if (merged.length === 0) {
      merged.push({ ...inv });
    } else {
      const last = merged[merged.length - 1];
      if (inv.start <= last.end) {
        // Overlap or exact adjacency: merge into contiguous span
        last.end = Math.max(last.end, inv.end);
        last.durationMs = last.end - last.start;
        if (typeof inv.events === "number") {
          last.events = (last.events || 0) + inv.events;
        }
        if (inv.isDelayed) {
          last.isDelayed = true;
        }
      } else {
        merged.push({ ...inv });
      }
    }
  }

  return merged;
}

/**
 * Subtracts a list of intervals from a target interval, returning an array of residual disjoint intervals.
 */
export function subtractIntervals(target, toSubtract = []) {
  if (!target || target.end <= target.start) return [];
  if (!Array.isArray(toSubtract) || toSubtract.length === 0) {
    return [{ ...target, durationMs: target.end - target.start }];
  }

  let currentSpans = [{ start: target.start, end: target.end }];

  for (const sub of toSubtract) {
    if (!sub || sub.end <= target.start || sub.start >= target.end) {
      continue;
    }

    const nextSpans = [];
    for (const span of currentSpans) {
      if (sub.end <= span.start || sub.start >= span.end) {
        nextSpans.push(span);
      } else {
        if (sub.start > span.start) {
          nextSpans.push({ start: span.start, end: sub.start });
        }
        if (sub.end < span.end) {
          nextSpans.push({ start: sub.end, end: span.end });
        }
      }
    }
    currentSpans = nextSpans;
  }

  return currentSpans.map((s) => ({
    ...s,
    durationMs: s.end - s.start,
  }));
}

/**
 * High-level interval coverage evaluator across an explicit evaluation window [windowStart, windowEnd).
 * Strictly partitions the window into:
 * windowDuration = observedDuration + explicitIdleDuration + unknownDuration
 */
export function calculateIntervalCoverage({
  activities = [],
  workSessions = [],
  breakSessions = [],
  windowStart,
  windowEnd,
}) {
  const wStart = typeof windowStart === "number" ? windowStart : new Date(windowStart).getTime();
  const wEnd = typeof windowEnd === "number" ? windowEnd : new Date(windowEnd).getTime();

  if (isNaN(wStart) || isNaN(wEnd) || wEnd <= wStart) {
    return {
      windowStart: null,
      windowEnd: null,
      windowDurationMs: 0,
      observedDurationMs: 0,
      observedActiveDurationMs: 0,
      observedSilentDurationMs: 0,
      explicitIdleDurationMs: 0,
      unknownDurationMs: 0,
      coverageRatio: 0,
      coveragePercent: 0,
      accountedRatio: 0,
      accountedPercent: 0,
      intervals: { observed: [], explicitIdle: [], unknown: [] },
      diagnostics: { totalRawActivities: 0, validIntervalsCount: 0, mergedObservedCount: 0, delayedActivitiesCount: 0, approximateLegacyCount: 0, invalidDiscardedCount: 0 },
    };
  }

  const windowDurationMs = wEnd - wStart;

  // 1. Extract and clip raw activity intervals (distinguishing active from silent)
  const rawActiveIntervals = [];
  const rawSilentIntervals = [];
  let delayedActivitiesCount = 0;
  let pointOnlyCount = 0;
  let invalidDiscardedCount = 0;

  for (const act of activities) {
    if (!act) continue;
    const inv = extractActivityInterval(act);
    if (!inv) {
      const t = getEventTimestamp(act);
      if (!isNaN(t)) {
        pointOnlyCount++;
      } else {
        invalidDiscardedCount++;
      }
      continue;
    }
    const clipped = clipInterval(inv, wStart, wEnd);
    if (!clipped) {
      continue;
    }
    if (clipped.isDelayed) delayedActivitiesCount++;
    if ((clipped.events || 0) > 0) {
      rawActiveIntervals.push(clipped);
    } else {
      rawSilentIntervals.push(clipped);
    }
  }

  // 2. Disjoint union of active and silent intervals
  const mergedActive = mergeDisjointIntervals(rawActiveIntervals);
  const mergedSilent = mergeDisjointIntervals(rawSilentIntervals);

  // 3. Explicit idle intervals from break sessions
  const rawBreaks = [];
  for (const s of breakSessions) {
    if (!s || (s.type && s.type !== "break")) continue;
    const bStart = new Date(s.startTime || s.start_time).getTime();
    const bEnd = s.endTime || s.end_time ? new Date(s.endTime || s.end_time).getTime() : wEnd;
    if (isNaN(bStart) || isNaN(bEnd) || bEnd <= bStart) continue;
    const clipped = clipInterval({ start: bStart, end: bEnd, durationMs: bEnd - bStart }, wStart, wEnd);
    if (clipped) rawBreaks.push(clipped);
  }
  const mergedBreaks = mergeDisjointIntervals(rawBreaks);

  // 4. Precedence algebra (Remediation C):
  // Active telemetry takes strict precedence over break sessions (evidence of resumed work)
  const finalIdle = [];
  for (const mb of mergedBreaks) {
    const residual = subtractIntervals(mb, mergedActive);
    finalIdle.push(...residual);
  }
  const mergedFinalIdle = mergeDisjointIntervals(finalIdle);
  const explicitIdleDurationMs = mergedFinalIdle.reduce((acc, inv) => acc + inv.durationMs, 0);

  // Break sessions take precedence over silent telemetry (passive/background monitoring does not interrupt an authorized break)
  const activeAndBreakSpans = mergeDisjointIntervals([...mergedActive, ...mergedFinalIdle]);
  const effectiveSilent = [];
  for (const ms of mergedSilent) {
    const residual = subtractIntervals(ms, activeAndBreakSpans);
    effectiveSilent.push(...residual);
  }
  const mergedEffectiveSilent = mergeDisjointIntervals(effectiveSilent);

  // Total observed intervals: Active + Effective Silent (disjoint from each other and from Final Idle)
  const mergedObserved = mergeDisjointIntervals([...mergedActive, ...mergedEffectiveSilent]);
  const observedDurationMs = mergedObserved.reduce((acc, inv) => acc + inv.durationMs, 0);
  const observedActiveDurationMs = mergedActive.reduce((acc, inv) => acc + inv.durationMs, 0);
  const observedSilentDurationMs = mergedEffectiveSilent.reduce((acc, inv) => acc + inv.durationMs, 0);

  // 5. Unknown duration and disjoint gap intervals
  const knownSpans = mergeDisjointIntervals([...mergedObserved, ...mergedFinalIdle]);
  const unknownIntervals = subtractIntervals({ start: wStart, end: wEnd, durationMs: windowDurationMs }, knownSpans);
  const unknownDurationMs = unknownIntervals.reduce((acc, inv) => acc + inv.durationMs, 0);

  // 6. Ratios and percentages
  const coverageRatio = windowDurationMs > 0 ? (observedDurationMs / windowDurationMs) : 0;
  const coveragePercent = Math.round(coverageRatio * 10000) / 100;
  const accountedRatio = windowDurationMs > 0 ? ((observedDurationMs + explicitIdleDurationMs) / windowDurationMs) : 0;
  const accountedPercent = Math.round(accountedRatio * 10000) / 100;

  return {
    windowStart: new Date(wStart).toISOString(),
    windowEnd: new Date(wEnd).toISOString(),
    windowDurationMs,
    observedDurationMs,
    observedActiveDurationMs,
    observedSilentDurationMs,
    explicitIdleDurationMs,
    unknownDurationMs,
    coverageRatio,
    coveragePercent,
    accountedRatio,
    accountedPercent,
    intervals: {
      observed: mergedObserved,
      explicitIdle: mergedFinalIdle,
      unknown: unknownIntervals,
    },
    diagnostics: {
      totalRawActivities: activities.length,
      validIntervalsCount: rawActiveIntervals.length + rawSilentIntervals.length,
      mergedObservedCount: mergedObserved.length,
      delayedActivitiesCount,
      approximateLegacyCount: 0,
      pointOnlyCount,
      invalidDiscardedCount,
    },
  };
}

/**
 * Calculates telemetry coverage over merged work sessions on a specific day.
 * Replaces naive uniqueActivities.length * 10 heuristic with rigorous interval-based coverage.
 * Deduplicates activity flushes and clips intervals to work sessions.
 */
export function calculateDayTelemetryCoverage(activities = [], mergedIntervals = [], totalTrackedSeconds = 0, options = {}) {
  if (totalTrackedSeconds <= 0 || !Array.isArray(activities) || activities.length === 0 || !Array.isArray(mergedIntervals) || mergedIntervals.length === 0) {
    return {
      uniqueActivities: [],
      observedSeconds: 0,
      totalTrackedSeconds: Math.max(0, totalTrackedSeconds),
      coverageRatio: 0,
      coveragePercent: 0,
      observedDurationMs: 0,
      explicitIdleDurationMs: 0,
      unknownDurationMs: Math.max(0, totalTrackedSeconds * 1000),
      observedIntervalsCount: 0,
      delayedActivitiesCount: 0,
      approximateLegacyCount: 0,
      pointOnlyActivitiesCount: 0,
    };
  }

  // 1. Extract valid activity intervals
  const rawClippedActive = [];
  const rawClippedSilent = [];
  const uniqueActivities = [];
  const seenKeys = new Set();
  let delayedActivitiesCount = 0;
  let pointOnlyActivitiesCount = 0;

  for (const act of activities) {
    if (!act) continue;
    const inv = extractActivityInterval(act);
    const actTime = getEventTimestamp(act);

    // Check if activity overlaps any of the merged work session intervals
    const overlapsAnySession = mergedIntervals.some((s) => {
      if (inv) {
        return inv.start < s.end && inv.end > s.start;
      }
      return !isNaN(actTime) && actTime >= s.start && actTime < s.end;
    });
    if (!overlapsAnySession) continue;

    // Deduplicate activities for uniqueActivities array return compatibility
    const key = act.idempotencyKey || `${inv ? inv.start : actTime}_${act.userId || act.user || ""}_${act.keyPresses}_${act.mouseClicks}_${act.mouseMoves}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueActivities.push(act);
    }

    if (!inv) {
      pointOnlyActivitiesCount++;
      continue; // Point-only: NO synthetic observed duration!
    }

    if (inv.isDelayed) delayedActivitiesCount++;

    // 2. Clip interval to each overlapping work session
    for (const session of mergedIntervals) {
      const clipped = clipInterval(inv, session.start, session.end);
      if (clipped) {
        if ((clipped.events || 0) > 0) {
          rawClippedActive.push(clipped);
        } else {
          rawClippedSilent.push(clipped);
        }
      }
    }
  }

  // 3. Merge overlapping and adjacent clipped intervals into disjoint spans
  const mergedActive = mergeDisjointIntervals(rawClippedActive);
  const mergedSilent = mergeDisjointIntervals(rawClippedSilent);

  // 4. Handle break sessions with corrected precedence (Remediation C)
  let finalIdleSpans = [];
  if (Array.isArray(options.breakSessions) && options.breakSessions.length > 0) {
    const rawBreaks = [];
    for (const b of options.breakSessions) {
      const bStart = new Date(b.startTime || b.start_time).getTime();
      const bEnd = new Date(b.endTime || b.end_time).getTime();
      if (!isNaN(bStart) && !isNaN(bEnd) && bEnd > bStart) {
        for (const session of mergedIntervals) {
          const clipped = clipInterval({ start: bStart, end: bEnd, durationMs: bEnd - bStart }, session.start, session.end);
          if (clipped) rawBreaks.push(clipped);
        }
      }
    }
    const mergedBreaks = mergeDisjointIntervals(rawBreaks);
    for (const mb of mergedBreaks) {
      const residual = subtractIntervals(mb, mergedActive);
      finalIdleSpans.push(...residual);
    }
    finalIdleSpans = mergeDisjointIntervals(finalIdleSpans);
  }

  // Break sessions override silent telemetry: subtract active + idle from silent
  const activeAndIdle = mergeDisjointIntervals([...mergedActive, ...finalIdleSpans]);
  const effectiveSilent = [];
  for (const ms of mergedSilent) {
    const residual = subtractIntervals(ms, activeAndIdle);
    effectiveSilent.push(...residual);
  }
  const mergedEffectiveSilent = mergeDisjointIntervals(effectiveSilent);

  // Total observed intervals: Active + Effective Silent
  const mergedObserved = mergeDisjointIntervals([...mergedActive, ...mergedEffectiveSilent]);

  // 5. Durations and ratios
  const observedDurationMs = mergedObserved.reduce((acc, inv) => acc + (inv.end - inv.start), 0);
  const explicitIdleDurationMs = finalIdleSpans.reduce((acc, inv) => acc + (inv.end - inv.start), 0);
  const observedSeconds = Math.min(totalTrackedSeconds, Math.round(observedDurationMs / 1000));
  const coverageRatio = totalTrackedSeconds > 0 ? (observedSeconds / totalTrackedSeconds) : 0;
  const coveragePercent = Math.round(coverageRatio * 10000) / 100;

  const unknownDurationMs = Math.max(0, (totalTrackedSeconds * 1000) - (observedDurationMs + explicitIdleDurationMs));

  return {
    uniqueActivities,
    observedSeconds,
    totalTrackedSeconds,
    coverageRatio,
    coveragePercent,
    // Extended interval metrics
    observedDurationMs,
    explicitIdleDurationMs,
    unknownDurationMs,
    observedIntervalsCount: mergedObserved.length,
    delayedActivitiesCount,
    approximateLegacyCount: 0,
    pointOnlyActivitiesCount,
  };
}

/**
 * Evaluates whether a historical day meets the data-driven qualification requirements:
 * 1. Minimum tracked duration: >= 10,800 seconds (3 hours)
 * 2. Minimum telemetry coverage: >= 50.0%
 */
export function evaluateHistoricalDayEligibility({
  sessions = [],
  activities = [],
  screenshots = [],
  dayStart,
  dayEnd,
}) {
  const { mergedIntervals, totalTrackedSeconds } = mergeSessionIntervals(sessions, dayStart, dayEnd);

  // Condition A: Minimum tracked duration >= 10,800 seconds
  if (totalTrackedSeconds < HISTORICAL_BASELINE_CONFIG.MIN_ELIGIBLE_DURATION_SECONDS) {
    return {
      isEligible: false,
      reason: "INSUFFICIENT_DURATION",
      totalTrackedSeconds,
      coveragePercent: 0,
      coverageRatio: 0,
      avgActivity: 0,
      disclaimer: `Tracked work duration (${totalTrackedSeconds}s) is below minimum requirement (10,800s / 3h).`,
    };
  }

  // Condition B: Minimum telemetry coverage >= 50.0%
  const { uniqueActivities, observedSeconds, coverageRatio, coveragePercent } =
    calculateDayTelemetryCoverage(activities, mergedIntervals, totalTrackedSeconds);

  if (coverageRatio < HISTORICAL_BASELINE_CONFIG.MIN_TELEMETRY_COVERAGE_RATIO) {
    return {
      isEligible: false,
      reason: "INSUFFICIENT_COVERAGE",
      totalTrackedSeconds,
      coveragePercent,
      coverageRatio,
      avgActivity: 0,
      disclaimer: `Telemetry coverage (${coveragePercent}%) is below minimum requirement (50.0%).`,
    };
  }

  // Day qualifies! Compute daily average activity score (0-100)
  let avgActivity = 0;
  if (Array.isArray(screenshots) && screenshots.length > 0) {
    const scoreSum = screenshots.reduce((sum, s) => sum + (Number(s.activityScore) || 0), 0);
    avgActivity = scoreSum / screenshots.length;
  } else if (uniqueActivities.length > 0) {
    const actionScoreSum = uniqueActivities.reduce((sum, a) => {
      const actions = (Number(a.keyPresses) || 0) + (Number(a.mouseClicks) || 0) + (Number(a.mouseMoves) || 0);
      return sum + Math.min(100, Math.round((actions / 50) * 100));
    }, 0);
    avgActivity = actionScoreSum / uniqueActivities.length;
  }

  return {
    isEligible: true,
    totalTrackedSeconds,
    coveragePercent,
    coverageRatio,
    avgActivity,
    uniqueActivitiesCount: uniqueActivities.length,
    screenshotsCount: Array.isArray(screenshots) ? screenshots.length : 0,
  };
}

/**
 * Computes the employee's personal historical baseline strictly against their own prior qualifying days.
 * Excludes the target day. Distinguishes PROVISIONAL (3-4 days) from ESTABLISHED (>= 5 days) baselines.
 * Uses duration-weighted mean and median to prevent unrepresentative short days from distorting the baseline.
 */
export async function computePersonalHistoricalBaseline({
  employeeId,
  callerOrgId,
  targetDate,
  daysCount = 14,
  timezone = "UTC",
}) {
  if (!employeeId || !callerOrgId || !targetDate) {
    return {
      status: MEASUREMENT_STATUS.UNAVAILABLE,
      historicalAvgActivity: null,
      medianActivity: null,
      validDaysCount: 0,
      baselineConfidence: "UNAVAILABLE",
      baselineRange: null,
      explanation: "Historical comparison unavailable: missing parameters.",
      limitations: "Requires valid employee, organization, and date parameters.",
    };
  }

  try {
    const tz = isValidTimezone(timezone) ? normalizeTimezone(timezone) : FALLBACK_TIMEZONE;

    // Resolve target day local range. Target day is strictly excluded.
    const targetRange = getZonedDayRange(targetDate, tz);
    const windowEnd = targetRange.start; // Local midnight of target day (as UTC Date)

    // Avoid future dates: clamp windowEnd to now
    const clampedEnd = new Date(Math.min(windowEnd.getTime(), Date.now()));

    // Target start: targetRange.start minus daysCount days
    const windowStart = new Date(windowEnd);
    windowStart.setUTCDate(windowStart.getUTCDate() - daysCount);

    // 1. Bulk query: Sessions
    const historicalSessions = await prisma.session.findMany({
      where: {
        userId: employeeId,
        type: "work",
        startTime: { lt: clampedEnd },
        OR: [
          { endTime: null },
          { endTime: { gt: windowStart } },
        ],
      },
      orderBy: { startTime: "asc" },
    });

    // 2. Bulk query: Activities
    const historicalActivities = await prisma.activity.findMany({
      where: {
        userId: employeeId,
        OR: [
          {
            eventTimestamp: {
              gte: windowStart,
              lt: clampedEnd,
            },
          },
          {
            eventTimestamp: null,
            createdAt: {
              gte: windowStart,
              lt: clampedEnd,
            },
          },
        ],
      },
      orderBy: [
        { eventTimestamp: "asc" },
        { createdAt: "asc" },
      ],
    });

    // 3. Bulk query: Screenshots (for activity score when available)
    const historicalScreenshots = await prisma.screenshot.findMany({
      where: {
        userId: employeeId,
        capturedAt: { gte: windowStart, lt: clampedEnd },
      },
      select: {
        capturedAt: true,
        activityScore: true,
      },
      orderBy: { capturedAt: "asc" },
    });

    // Evaluate each historical day within the window
    const qualifyingDays = [];

    for (let d = 1; d <= daysCount; d++) {
      const refDate = new Date(windowEnd.getTime() - d * 86400000);
      const dayDateStr = formatInTimeZone(refDate, tz, "yyyy-MM-dd");
      const { start: dayStart, end: dayEnd } = getZonedDayRange(dayDateStr, tz);

      // Skip if dayStart >= windowEnd (target day and future days excluded)
      if (dayStart.getTime() >= windowEnd.getTime()) continue;

      // Filter data for this day
      const daySessions = historicalSessions.filter((s) => {
        const sStart = new Date(s.startTime).getTime();
        const sEnd = s.endTime ? new Date(s.endTime).getTime() : Infinity;
        return sStart < dayEnd.getTime() && sEnd > dayStart.getTime();
      });

      const dayActivities = historicalActivities.filter((a) => {
        const t = getEventTimestamp(a);
        return !isNaN(t) && t >= dayStart.getTime() && t < dayEnd.getTime();
      });

      const dayScreenshots = historicalScreenshots.filter((s) => {
        const t = new Date(s.capturedAt).getTime();
        return !isNaN(t) && t >= dayStart.getTime() && t < dayEnd.getTime();
      });

      const evalResult = evaluateHistoricalDayEligibility({
        sessions: daySessions,
        activities: dayActivities,
        screenshots: dayScreenshots,
        dayStart,
        dayEnd,
      });

      if (evalResult.isEligible) {
        qualifyingDays.push({
          day: dayDateStr,
          duration: evalResult.totalTrackedSeconds,
          coveragePercent: evalResult.coveragePercent,
          avg: evalResult.avgActivity,
        });
      }
    }

    if (qualifyingDays.length < HISTORICAL_BASELINE_CONFIG.MIN_QUALIFYING_DAYS_PROVISIONAL) {
      return {
        status: MEASUREMENT_STATUS.UNAVAILABLE,
        historicalAvgActivity: null,
        medianActivity: null,
        validDaysCount: qualifyingDays.length,
        baselineConfidence: "UNAVAILABLE",
        baselineRange: null,
        explanation: `Historical comparison unavailable: minimum 3 valid baseline days required (found ${qualifyingDays.length}).`,
        limitations: "A minimum of 3 valid historical working days (>= 3 hours tracked work and >= 50% telemetry coverage per day) is required to compute a baseline.",
        qualifyingDays: [],
      };
    }

    // Compute robust central tendencies
    const sortedDailyAvgs = qualifyingDays.map((d) => d.avg).sort((a, b) => a - b);
    const mid = Math.floor(sortedDailyAvgs.length / 2);
    const median = sortedDailyAvgs.length % 2 !== 0
      ? sortedDailyAvgs[mid]
      : (sortedDailyAvgs[mid - 1] + sortedDailyAvgs[mid]) / 2;

    const totalWeightedScore = qualifyingDays.reduce((acc, d) => acc + (d.avg * d.duration), 0);
    const totalValidDuration = qualifyingDays.reduce((acc, d) => acc + d.duration, 0);
    const weightedMean = totalValidDuration > 0 ? (totalWeightedScore / totalValidDuration) : median;

    const unweightedMean = sortedDailyAvgs.reduce((acc, b) => acc + b, 0) / sortedDailyAvgs.length;
    const variance = sortedDailyAvgs.reduce((acc, val) => acc + Math.pow(val - unweightedMean, 2), 0) / sortedDailyAvgs.length;
    const stdDev = Math.sqrt(variance);

    const roundedMean = Math.round(weightedMean);
    const roundedMedian = Math.round(median);
    const minRange = Math.max(0, Math.round(weightedMean - stdDev));
    const maxRange = Math.min(100, Math.round(weightedMean + stdDev));

    const baselineConfidence = qualifyingDays.length >= HISTORICAL_BASELINE_CONFIG.MIN_QUALIFYING_DAYS_ESTABLISHED
      ? "ESTABLISHED"
      : "PROVISIONAL";

    const confidenceLabel = baselineConfidence === "PROVISIONAL"
      ? `provisional baseline (derived from ${qualifyingDays.length} valid days: median ${roundedMedian}%, weighted average ${roundedMean}%). Requires >= 5 days for an established baseline.`
      : `established baseline from ${qualifyingDays.length} valid days (median ${roundedMedian}%, weighted average ${roundedMean}%).`;

    return {
      status: MEASUREMENT_STATUS.MEASURED,
      historicalAvgActivity: roundedMean,
      medianActivity: roundedMedian,
      validDaysCount: qualifyingDays.length,
      baselineConfidence,
      baselineRange: {
        min: minRange,
        max: maxRange,
        stdDev: Math.round(stdDev * 10) / 10,
      },
      explanation: `Personal historical comparison: ${confidenceLabel} Standard range is ${minRange}%–${maxRange}%.`,
      limitations: "Historical baseline reflects past recorded activity score distribution for this employee only. Provisional baselines (3–4 days) exhibit higher statistical variance. Day-to-day workflow differences naturally produce variations outside the standard range.",
      qualifyingDays: qualifyingDays.map((d) => ({
        day: d.day,
        trackedDurationSeconds: d.duration,
        coveragePercent: d.coveragePercent,
        avgActivity: Math.round(d.avg),
      })),
    };
  } catch (err) {
    console.error("COMPUTE PERSONAL HISTORICAL BASELINE ERROR:", err);
    return {
      status: MEASUREMENT_STATUS.UNAVAILABLE,
      historicalAvgActivity: null,
      medianActivity: null,
      validDaysCount: 0,
      baselineConfidence: "UNAVAILABLE",
      baselineRange: null,
      explanation: "Historical comparison unavailable due to data processing error.",
      limitations: "An unexpected error occurred while processing historical baseline records.",
    };
  }
}

/**
 * Bulk Intelligence Engine for Team Day.
 * Executes single bulk database queries for all requested users, avoiding N+1 performance penalties.
 */
export async function generateTeamDayObservations({ organizationId, userIds = [], date, timezone }) {
  if (!organizationId || !date || userIds.length === 0) {
    return {
      success: false,
      summary: {
        totalEvaluatedEmployees: 0,
        unusualActivityTotalMinutes: 0,
        unusualActivityStatus: "unavailable",
      },
      employeeObservations: {},
    };
  }

  const { start: dayStart, end: dayEnd } = getZonedDayRange(date, timezone);

  // 1. Single Bulk Query: Sessions
  const allSessions = await prisma.session.findMany({
    where: {
      userId: { in: userIds },
      startTime: { lt: dayEnd },
      OR: [
        { endTime: null },
        { endTime: { gt: dayStart } },
      ],
    },
    orderBy: { startTime: "asc" },
  });

  // 2. Single Bulk Query: Activities
  const allActivities = await prisma.activity.findMany({
    where: {
      userId: { in: userIds },
      OR: [
        {
          eventTimestamp: {
            gte: dayStart,
            lt: dayEnd,
          },
        },
        {
          eventTimestamp: null,
          createdAt: {
            gte: dayStart,
            lt: dayEnd,
          },
        },
      ],
    },
    orderBy: [
      { eventTimestamp: "asc" },
      { createdAt: "asc" },
    ],
  });

  // Group by userId in memory
  const sessionsByUser = new Map();
  allSessions.forEach((s) => {
    const uid = normalizeId(s.userId);
    if (!sessionsByUser.has(uid)) sessionsByUser.set(uid, []);
    sessionsByUser.get(uid).push(s);
  });

  const activitiesByUser = new Map();
  allActivities.forEach((a) => {
    const uid = normalizeId(a.userId);
    if (!activitiesByUser.has(uid)) activitiesByUser.set(uid, []);
    activitiesByUser.get(uid).push(a);
  });

  const employeeObservations = {};
  let totalEvaluated = 0;
  let measuredCount = 0;
  let partialCount = 0;
  let unavailableCount = 0;
  let interruptedCount = 0;
  let totalUnusualMinutes = 0;
  let totalUnusualObservations = 0;

  for (const uid of userIds) {
    totalEvaluated++;
    const userSessions = sessionsByUser.get(uid) || [];
    const userActivities = activitiesByUser.get(uid) || [];

    // Analyze Continuity
    const continuity = analyzeActivityContinuity({
      activities: userActivities,
      sessions: userSessions,
      periodStart: dayStart,
      periodEnd: dayEnd,
    });

    // Detect Repeated Aggregate Patterns with strict temporal continuity and session boundaries
    const patterns = detectRepeatedPatterns({
      activities: userActivities,
      sessions: userSessions,
      minConsecutiveIntervals: 6, // 1 full minute
      maxIntervalGapMs: 15000,
      windowStart: dayStart,
      windowEnd: dayEnd,
    });

    // Evaluate Session Integrity
    const sessionIntegrity = evaluateSessionIntegrity({
      sessions: userSessions,
      activities: userActivities,
      periodStart: dayStart,
      periodEnd: dayEnd,
    });

    // Evaluate Measurement Integrity
    const totalExpectedIntervals = Math.round(continuity.coveragePercent > 0 ? (userActivities.length / (continuity.coveragePercent / 100)) : 0);
    const measurementIntegrity = evaluateMeasurementIntegrity({
      activities: userActivities,
      expectedIntervals: totalExpectedIntervals,
    });

    // Compile observations
    const userObsList = [];
    if (continuity.observation) userObsList.push(continuity.observation);
    patterns.observations.forEach((o) => userObsList.push(o));
    sessionIntegrity.observations.forEach((o) => userObsList.push(o));
    measurementIntegrity.observations.forEach((o) => userObsList.push(o));

    // Determine overall employee intelligence status
    let overallStatus = MEASUREMENT_STATUS.MEASURED;
    if (userSessions.length === 0 && userActivities.length === 0) {
      overallStatus = MEASUREMENT_STATUS.UNAVAILABLE;
      unavailableCount++;
    } else if (continuity.status === MEASUREMENT_STATUS.INTERRUPTED || sessionIntegrity.status === MEASUREMENT_STATUS.INTERRUPTED) {
      overallStatus = MEASUREMENT_STATUS.INTERRUPTED;
      interruptedCount++;
    } else if (continuity.status === MEASUREMENT_STATUS.PARTIAL || measurementIntegrity.status === MEASUREMENT_STATUS.PARTIAL) {
      overallStatus = MEASUREMENT_STATUS.PARTIAL;
      partialCount++;
    } else {
      measuredCount++;
    }

    const unusualActivityMins = patterns.totalPatternMinutes;
    if (unusualActivityMins > 0) {
      totalUnusualMinutes += unusualActivityMins;
      totalUnusualObservations += patterns.patternsFound;
    }

    const isMeasured = overallStatus !== MEASUREMENT_STATUS.UNAVAILABLE;

    employeeObservations[uid] = {
      employeeId: uid,
      coveragePercent: continuity.coveragePercent,
      status: overallStatus,
      unusualActivityMinutes: isMeasured ? unusualActivityMins : null,
      unusualActivityMeasured: isMeasured,
      unusualActivityCount: patterns.patternsFound,
      bucketPatterns: patterns.bucketPatterns,
      observations: userObsList,
    };
  }

  // Determine aggregate unusual activity status
  let unusualActivityStatus = "unavailable";
  if (measuredCount > 0 || partialCount > 0 || interruptedCount > 0) {
    unusualActivityStatus = totalUnusualMinutes > 0 ? "positive" : "measured-zero";
  }

  return {
    success: true,
    date,
    timezone,
    summary: {
      totalEvaluatedEmployees: totalEvaluated,
      measuredCount,
      partialCount,
      unavailableCount,
      interruptedCount,
      totalObservations: Object.values(employeeObservations).reduce((acc, e) => acc + e.observations.length, 0),
      unusualActivityTotalMinutes: totalUnusualMinutes,
      unusualActivityStatus,
      unusualActivityCount: totalUnusualObservations,
    },
    employeeObservations,
  };
}

export default {
  MEASUREMENT_STATUS,
  OBSERVATION_CATEGORIES,
  DETECTION_RULES,
  getEventTimestamp,
  getSessionIdentifier,
  analyzeActivityContinuity,
  detectRepeatedPatterns,
  evaluateSessionIntegrity,
  evaluateMeasurementIntegrity,
  HISTORICAL_BASELINE_CONFIG,
  mergeSessionIntervals,
  extractActivityInterval,
  clipInterval,
  mergeDisjointIntervals,
  subtractIntervals,
  calculateIntervalCoverage,
  calculateDayTelemetryCoverage,
  evaluateHistoricalDayEligibility,
  computePersonalHistoricalBaseline,
  generateTeamDayObservations,
};

