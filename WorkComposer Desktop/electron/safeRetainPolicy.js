const fs = require("fs");
const path = require("path");

const DEFAULT_RETENTION_POLICY = Object.freeze({
  activeQueueMaxCount: 50,
  activeQueueMaxBytes: 50 * 1024 * 1024,
  deadLetterMaxCount: 50,
  deadLetterMaxBytes: 50 * 1024 * 1024,
  rescueMaxCount: 50,
  rescueMaxBytes: 50 * 1024 * 1024,
  archiveQuotaBytes: 50 * 1024 * 1024,
  diskReserveBytes: 500 * 1024 * 1024,
  throttleThresholdPercent: 80,
  pauseThresholdPercent: 100,
  enableAdaptiveBackpressure: false, // Pending DEC-10 approval
  enableEncryptedArchive: false,     // Pending DEC-11 approval
  userPartitioning: true,           // Priority 1
});

class SafeRetainPolicy {
  constructor(customConfig = {}) {
    this.config = {
      ...DEFAULT_RETENTION_POLICY,
      ...customConfig,
    };
  }

  get activeQueueMaxCount() {
    return this.config.activeQueueMaxCount;
  }

  get activeQueueMaxBytes() {
    return this.config.activeQueueMaxBytes;
  }

  get deadLetterMaxCount() {
    return this.config.deadLetterMaxCount;
  }

  get deadLetterMaxBytes() {
    return this.config.deadLetterMaxBytes;
  }

  get rescueMaxCount() {
    return this.config.rescueMaxCount;
  }

  get rescueMaxBytes() {
    return this.config.rescueMaxBytes;
  }

  get archiveQuotaBytes() {
    return this.config.archiveQuotaBytes;
  }

  get diskReserveBytes() {
    return this.config.diskReserveBytes;
  }

  get throttleThresholdPercent() {
    return this.config.throttleThresholdPercent;
  }

  get pauseThresholdPercent() {
    return this.config.pauseThresholdPercent;
  }

  get enableAdaptiveBackpressure() {
    return Boolean(this.config.enableAdaptiveBackpressure);
  }

  get enableEncryptedArchive() {
    return Boolean(this.config.enableEncryptedArchive);
  }

  get userPartitioning() {
    return Boolean(this.config.userPartitioning);
  }

  /**
   * Evaluates the current active queue load against backpressure thresholds.
   *
   * @param {number} activeCount Current number of items in active queue
   * @param {number} activeBytes Current total byte size of active queue
   * @returns {Object} Backpressure status and guidance
   */
  evaluateBackpressure(activeCount = 0, activeBytes = 0) {
    if (!this.enableAdaptiveBackpressure) {
      return {
        status: "NORMAL",
        backpressureLevel: 0,
        captureAllowed: true,
        requestedDelayMultiplier: 1.0,
        warning: null,
        usagePercent: Math.round((activeCount / this.activeQueueMaxCount) * 100),
      };
    }

    const countPercent = (activeCount / this.activeQueueMaxCount) * 100;
    const bytePercent = (activeBytes / this.activeQueueMaxBytes) * 100;
    const usagePercent = Math.round(Math.max(countPercent, bytePercent));

    if (usagePercent >= this.pauseThresholdPercent) {
      return {
        status: "PAUSE",
        backpressureLevel: 2,
        captureAllowed: false,
        requestedDelayMultiplier: Infinity,
        warning: "OFFLINE_BUFFER_FULL",
        usagePercent,
        activeCount,
        maxCount: this.activeQueueMaxCount,
      };
    }

    if (usagePercent >= this.throttleThresholdPercent) {
      return {
        status: "THROTTLE",
        backpressureLevel: 1,
        captureAllowed: true,
        requestedDelayMultiplier: 2.0,
        warning: "OFFLINE_BUFFER_FILLING",
        usagePercent,
        activeCount,
        maxCount: this.activeQueueMaxCount,
      };
    }

    return {
      status: "NORMAL",
      backpressureLevel: 0,
      captureAllowed: true,
      requestedDelayMultiplier: 1.0,
      warning: null,
      usagePercent,
      activeCount,
      maxCount: this.activeQueueMaxCount,
    };
  }

  /**
   * Logs a formal retention decision to the user's audit log.
   */
  logRetentionDecision(dir, decisionType, details = {}) {
    if (!dir) return;
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const logPath = path.join(dir, "retention_audit.log");
      const entry = {
        timestamp: new Date().toISOString(),
        decisionType,
        ...details,
      };
      fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
    } catch {}
  }
}

module.exports = {
  DEFAULT_RETENTION_POLICY,
  SafeRetainPolicy,
};
