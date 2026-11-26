"use strict";

/**
 * WORKCOMPOSER-123-D: Client-Side Event Gap Measurement Foundation
 *
 * Privacy-conscious, monotonic timing tracker that measures event gaps and
 * continuous input activity BEFORE 10-second aggregation discards timing metadata.
 *
 * Strict Privacy Guarantees:
 * - NO typed text or keystroke values retained.
 * - NO raw keycodes retained.
 * - NO mouse coordinates or screen positions retained.
 * - NO full event histories or per-event logs retained.
 *
 * Monotonic Precision:
 * - Uses process.hrtime.bigint() for all elapsed duration and gap calculations.
 * - 100% immune to OS wall-clock adjustments, NTP shifts, and DST transitions.
 */

const crypto = require("crypto");

const DEFAULT_PAUSE_THRESHOLD_MS = 10000; // 10 seconds natural pause boundary
const DEFAULT_OFFLINE_QUEUE_LIMIT = 500;

class EventGapTracker {
  /**
   * @param {Object} [options]
   * @param {number} [options.pauseThresholdMs=10000] Natural pause threshold in milliseconds
   * @param {number} [options.offlineQueueLimit=500] Maximum offline telemetry payloads to retain
   * @param {Function} [options.nowProvider] Optional mock clock provider returning { mono: BigInt, wall: number }
   */
  constructor(options = {}) {
    this.pauseThresholdMs = typeof options.pauseThresholdMs === "number" && options.pauseThresholdMs > 0
      ? options.pauseThresholdMs
      : DEFAULT_PAUSE_THRESHOLD_MS;

    this.offlineQueueLimit = typeof options.offlineQueueLimit === "number" && options.offlineQueueLimit > 0
      ? options.offlineQueueLimit
      : DEFAULT_OFFLINE_QUEUE_LIMIT;

    this._nowProvider = typeof options.nowProvider === "function" ? options.nowProvider : null;

    // Tracking and power lifecycle state
    this.isTracking = false;
    this.isSuspended = false;
    this.sessionId = null;
    this.deviceId = null;

    // Continuous segment state (persists across 10s flush windows)
    this.lastEventMono = null; // BigInt (nanoseconds)
    this.lastEventWall = null; // number (ms)
    this.segmentStartMono = null;
    this.segmentLastMono = null;

    // Active 10-second measurement window state
    const now = this._getNow();
    this.windowStartMono = now.mono;
    this.windowStartWall = now.wall;
    this.firstObservedAt = null;
    this.lastObservedAt = null;
    this.totalEvents = 0;
    this.naturalGapsCount = 0;
    this.longestGapMs = 0;
    this.continuousDurationMs = 0;
    this.completeness = "complete"; // "complete" | "partial" | "interrupted"

    // Offline buffer
    this.offlineQueue = [];
  }

  /**
   * Internal helper to resolve current monotonic (BigInt ns) and wall-clock (ms) time.
   * @param {Object} [customNow]
   * @returns {{ mono: bigint, wall: number }}
   */
  _getNow(customNow) {
    if (customNow && typeof customNow.mono === "bigint" && typeof customNow.wall === "number") {
      return customNow;
    }
    if (this._nowProvider) {
      return this._nowProvider();
    }
    return {
      mono: process.hrtime.bigint(),
      wall: Date.now(),
    };
  }

  /**
   * Generates a stable unique summary ID scoped by timestamp and entropy.
   *
   * @param {{ wall: number }} now
   * @returns {string}
   */
  _generateSummaryId(now) {
    const uuid = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
    return `idem_${now.wall}_${uuid}`;
  }

  /**
   * Records the occurrence of an input event.
   * Only records timing; never inspects or persists key codes, coordinates, or content.
   *
   * @param {string} eventType - "click", "keydown", or "mousemove"
   * @param {Object} [customNow] - Optional mock clock for testing
   */
  recordEvent(eventType, customNow) {
    if (!this.isTracking || this.isSuspended) {
      return;
    }

    const now = this._getNow(customNow);

    // Clock discontinuity check: if system wall clock stepped backwards
    if (this.lastEventWall !== null && now.wall < this.lastEventWall) {
      this.completeness = "interrupted";
    }

    this.totalEvents++;
    if (this.firstObservedAt === null) {
      this.firstObservedAt = now.wall;
    }
    this.lastObservedAt = now.wall;

    if (this.lastEventMono !== null) {
      const gapNs = now.mono - this.lastEventMono;
      const gapMs = Number(gapNs) / 1e6;

      if (gapMs > this.longestGapMs) {
        this.longestGapMs = gapMs;
      }

      if (gapMs >= this.pauseThresholdMs) {
        // Natural pause: at least 10 seconds of silence observed
        this.naturalGapsCount++;

        // Previous continuous segment terminated at lastEventMono.
        // A new continuous segment begins at the current event.
        this.segmentStartMono = now.mono;
        this.segmentLastMono = now.mono;
      } else {
        // Continuous input: event occurred within the 10-second threshold
        this.continuousDurationMs += gapMs;
        this.segmentLastMono = now.mono;
      }
    } else {
      // First event of this session/tracking run
      this.segmentStartMono = now.mono;
      this.segmentLastMono = now.mono;
    }

    this.lastEventMono = now.mono;
    this.lastEventWall = now.wall;
  }

  /**
   * Flushes the current 10-second measurement window summary and resets window accumulators.
   * Monotonic cross-window continuity state (lastEventMono) is preserved across flushes.
   *
   * @param {Object} [customNow] - Optional mock clock for testing
   * @returns {Object} Compact telemetry summary
   */
  flush(customNow) {
    const now = this._getNow(customNow);

    // Evaluate idle gap at the flush boundary
    if (this.totalEvents === 0) {
      if (this.lastEventMono !== null) {
        const idleSinceLastEventMs = Number(now.mono - this.lastEventMono) / 1e6;
        if (idleSinceLastEventMs >= this.pauseThresholdMs) {
          if (idleSinceLastEventMs > this.longestGapMs) {
            this.longestGapMs = idleSinceLastEventMs;
          }
          // Check if the threshold transition (becoming >= 10s) occurred within this window
          const idleAtWindowStartMs = Number(this.windowStartMono - this.lastEventMono) / 1e6;
          if (idleAtWindowStartMs < this.pauseThresholdMs) {
            this.naturalGapsCount++;
          }
        }
      } else {
        // No events have occurred since tracking started
        const windowDurationMs = Number(now.mono - this.windowStartMono) / 1e6;
        this.longestGapMs = windowDurationMs;
        if (windowDurationMs >= this.pauseThresholdMs) {
          this.naturalGapsCount++;
        }
      }
    } else {
      // Events occurred in this window: evaluate trailing silence from last event to window boundary
      if (this.lastEventMono !== null) {
        const trailingIdleMs = Number(now.mono - this.lastEventMono) / 1e6;
        if (trailingIdleMs > this.longestGapMs) {
          this.longestGapMs = trailingIdleMs;
        }
      }
    }

    // Check for wall-clock discontinuity vs monotonic elapsed
    const monoElapsedMs = Number(now.mono - this.windowStartMono) / 1e6;
    const wallElapsedMs = now.wall - this.windowStartWall;
    if (wallElapsedMs < 0 || Math.abs(wallElapsedMs - monoElapsedMs) > 2000) {
      this.completeness = "interrupted";
    }

    const summary = {
      summaryId: this._generateSummaryId(now),
      measuredStart: new Date(this.windowStartWall).toISOString(),
      measuredEnd: new Date(now.wall).toISOString(),
      firstObservedAt: this.firstObservedAt !== null ? new Date(this.firstObservedAt).toISOString() : null,
      lastObservedAt: this.lastObservedAt !== null ? new Date(this.lastObservedAt).toISOString() : null,
      totalEvents: this.totalEvents,
      naturalGapsCount: this.naturalGapsCount,
      longestGapMs: Math.round(this.longestGapMs * 100) / 100,
      continuousDurationMs: Math.round(this.continuousDurationMs * 100) / 100,
      completeness: this.completeness,
      sessionId: this.sessionId,
      deviceId: this.deviceId,
    };

    // Reset window accumulator for next interval
    this.windowStartMono = now.mono;
    this.windowStartWall = now.wall;
    this.firstObservedAt = null;
    this.lastObservedAt = null;
    this.totalEvents = 0;
    this.naturalGapsCount = 0;
    this.longestGapMs = 0;
    this.continuousDurationMs = 0;
    this.completeness = this.isTracking && !this.isSuspended ? "complete" : "partial";

    return summary;
  }

  /**
   * Lifecycle Hook: Tracking Started or Resumed.
   * Initializes a clean session state and prevents joining separate sessions.
   *
   * @param {Object} [sessionInfo]
   * @param {string} [sessionInfo.sessionId]
   * @param {string} [sessionInfo.deviceId]
   * @param {Object} [customNow]
   */
  onStartTracking(sessionInfo = {}, customNow) {
    const now = this._getNow(customNow);

    this.isTracking = true;
    this.isSuspended = false;
    this.sessionId = sessionInfo.sessionId || null;
    this.deviceId = sessionInfo.deviceId || null;

    // Reset continuous segment state: separate sessions must never be combined
    this.lastEventMono = null;
    this.lastEventWall = null;
    this.segmentStartMono = null;
    this.segmentLastMono = null;

    this.windowStartMono = now.mono;
    this.windowStartWall = now.wall;
    this.firstObservedAt = null;
    this.lastObservedAt = null;
    this.totalEvents = 0;
    this.naturalGapsCount = 0;
    this.longestGapMs = 0;
    this.continuousDurationMs = 0;
    this.completeness = "partial"; // Initial startup window is marked partial
  }

  /**
   * Lifecycle Hook: Tracking Stopped or Paused.
   * Terminates active continuous segment and marks window as partial.
   *
   * @param {Object} [customNow]
   */
  onStopTracking(customNow) {
    this.isTracking = false;
    this.lastEventMono = null;
    this.lastEventWall = null;
    this.segmentStartMono = null;
    this.segmentLastMono = null;
    this.completeness = "partial";
  }

  /**
   * Lifecycle Hook: OS Suspend (Sleep / Hibernation).
   * Explicitly breaks continuous-activity segments. Unknown sleep time is not work.
   *
   * @param {Object} [customNow]
   */
  onSuspend(customNow) {
    this.isSuspended = true;
    this.lastEventMono = null;
    this.lastEventWall = null;
    this.segmentStartMono = null;
    this.segmentLastMono = null;
    this.completeness = "interrupted";
  }

  /**
   * Lifecycle Hook: OS Resume from Sleep.
   * Post-sleep activity begins a new segment.
   *
   * @param {Object} [customNow]
   */
  onResume(customNow) {
    const now = this._getNow(customNow);

    this.isSuspended = false;
    this.lastEventMono = null;
    this.lastEventWall = null;
    this.segmentStartMono = null;
    this.segmentLastMono = null;
    this.windowStartMono = now.mono;
    this.windowStartWall = now.wall;
    this.completeness = "interrupted";
  }

  /**
   * Buffers an undelivered telemetry summary during network disconnection.
   * Preserves historical timestamps rather than fabricating current timestamps.
   *
   * @param {Object} payload
   */
  queueOffline(payload) {
    if (!payload || typeof payload !== "object") return;
    if (this.offlineQueue.length >= this.offlineQueueLimit) {
      this.offlineQueue.shift(); // FIFO drop oldest on buffer overflow
    }
    this.offlineQueue.push(payload);
  }

  /**
   * Drains buffered offline telemetry summaries on reconnection.
   * @returns {Array<Object>}
   */
  drainOfflineQueue() {
    const items = [...this.offlineQueue];
    this.offlineQueue = [];
    return items;
  }
}

// Singleton desktop instance
let instance = null;

function getEventGapTracker(options) {
  if (!instance) {
    instance = new EventGapTracker(options);
  }
  return instance;
}

function resetEventGapTracker() {
  instance = null;
}

module.exports = {
  EventGapTracker,
  DEFAULT_PAUSE_THRESHOLD_MS,
  DEFAULT_OFFLINE_QUEUE_LIMIT,
  getEventGapTracker,
  resetEventGapTracker,
};

