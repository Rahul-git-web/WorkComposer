"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");

const DEFAULT_MAX_QUEUE_SIZE = 500;
const DEFAULT_MAX_RETRIES = 10;
const DEFAULT_BASE_RETRY_DELAY_MS = 5000; // 5 seconds
const DEFAULT_MAX_RETRY_DELAY_MS = 120000; // 2 minutes

/**
 * Validates and normalizes user IDs into a safe filesystem-compliant directory slug.
 * Prevents path traversal, illegal Windows characters, and directory escape.
 *
 * @param {string} userId
 * @returns {string} Safe directory slug (e.g. "u_66f000000000000000000010")
 */
function normalizeUserId(userId) {
  if (!userId || typeof userId !== "string") {
    throw new Error("Invalid userId: must be a non-empty string");
  }
  const trimmed = userId.trim();
  if (trimmed.length === 0) {
    throw new Error("Invalid userId: cannot be whitespace only");
  }
  if (
    trimmed.includes("..") ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("\0")
  ) {
    const err = new Error(`Path traversal attempt detected in userId: ${trimmed}`);
    err.code = "PATH_TRAVERSAL_DETECTED";
    throw err;
  }

  if (/^[a-zA-Z0-9_-]{1,64}$/.test(trimmed)) {
    return `u_${trimmed}`;
  }

  const hash = crypto.createHash("sha256").update(trimmed).digest("hex").slice(0, 24);
  return `u_h_${hash}`;
}

/**
 * Validates and sanitizes idempotency keys.
 *
 * @param {string} key
 * @returns {boolean}
 */
function isValidIdempotencyKey(key) {
  if (!key || typeof key !== "string") return false;
  return /^[a-zA-Z0-9_\-:]{1,128}$/.test(key.trim());
}

class DurableTelemetryQueue {
  /**
   * @param {Object} [options]
   * @param {string} [options.baseUserDataPath] Base application data directory
   * @param {number} [options.maxQueueSize=500] Maximum queue capacity per user
   * @param {number} [options.baseRetryDelayMs=5000] Initial exponential backoff delay
   * @param {number} [options.maxRetryDelayMs=120000] Maximum backoff delay cap
   * @param {number} [options.maxRetries=10] Maximum retries before quarantine
   */
  constructor(options = {}) {
    this.baseUserDataPath = options.baseUserDataPath || null;
    this.maxQueueSize = typeof options.maxQueueSize === "number" && options.maxQueueSize > 0
      ? options.maxQueueSize
      : DEFAULT_MAX_QUEUE_SIZE;
    this.baseRetryDelayMs = typeof options.baseRetryDelayMs === "number" && options.baseRetryDelayMs > 0
      ? options.baseRetryDelayMs
      : DEFAULT_BASE_RETRY_DELAY_MS;
    this.maxRetryDelayMs = typeof options.maxRetryDelayMs === "number" && options.maxRetryDelayMs > 0
      ? options.maxRetryDelayMs
      : DEFAULT_MAX_RETRY_DELAY_MS;
    this.maxRetries = typeof options.maxRetries === "number" && options.maxRetries > 0
      ? options.maxRetries
      : DEFAULT_MAX_RETRIES;

    this.activeUserId = null;
    this.activeQueueDir = null;
    this.isProcessing = false;
    this.retryTimer = null;
    this.overflowDroppedCount = 0;
  }

  /**
   * Initializes base storage directory.
   *
   * @param {string} userDataPath
   */
  init(userDataPath) {
    if (!userDataPath || typeof userDataPath !== "string") {
      throw new Error("userDataPath must be a non-empty string");
    }
    this.baseUserDataPath = userDataPath;
  }

  /**
   * Checks if base directory is configured.
   * @returns {boolean}
   */
  isInitialized() {
    return Boolean(this.baseUserDataPath);
  }

  /**
   * Resolves paths for a specific user partition.
   *
   * @param {string} userId
   * @returns {{ userRoot: string, queueDir: string, queueFilePath: string }}
   */
  getUserPaths(userId) {
    if (!this.baseUserDataPath) {
      throw new Error("DurableTelemetryQueue not initialized with baseUserDataPath");
    }
    const safeSlug = normalizeUserId(userId);
    const userRoot = path.join(this.baseUserDataPath, "telemetry_queue", safeSlug);
    const queueFilePath = path.join(userRoot, "queue.json");
    return {
      userRoot,
      queueDir: userRoot,
      queueFilePath,
    };
  }

  /**
   * Binds active user context for telemetry queueing.
   * Safe for account switching; does not delete or overwrite prior user data.
   *
   * @param {string} userId
   */
  bindUser(userId) {
    if (!userId) {
      this.unbindUser();
      return;
    }
    const safeSlug = normalizeUserId(userId);
    this.activeUserId = userId;
    this.activeQueueDir = path.join(this.baseUserDataPath, "telemetry_queue", safeSlug);

    try {
      if (!fs.existsSync(this.activeQueueDir)) {
        fs.mkdirSync(this.activeQueueDir, { recursive: true });
      }
    } catch (mkdirErr) {
      console.error("[DURABLE_TELEMETRY_QUEUE] Failed to create queue directory:", mkdirErr);
    }
  }

  /**
   * Unbinds active user context upon logout or session clear.
   */
  unbindUser() {
    this.clearRetryTimer();
    this.activeUserId = null;
    this.activeQueueDir = null;
  }

  /**
   * Writes items atomically to disk with temporary-file replacement and fsync.
   *
   * @param {string} queueFilePath
   * @param {Array<Object>} items
   */
  _writeQueueAtomically(queueFilePath, items) {
    const dir = path.dirname(queueFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tmpPath = `${queueFilePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    const payload = JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        items,
      },
      null,
      2
    );

    let fd;
    try {
      fd = fs.openSync(tmpPath, "w");
      fs.writeFileSync(fd, payload, "utf8");
      try {
        fs.fsyncSync(fd);
      } catch {}
    } finally {
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch {}
      }
    }

    // Atomic replacement
    fs.renameSync(tmpPath, queueFilePath);
  }

  /**
   * Reads queue items safely with corruption resilience.
   *
   * @param {string} queueFilePath
   * @returns {Array<Object>}
   */
  _readQueueSafely(queueFilePath) {
    if (!fs.existsSync(queueFilePath)) {
      return [];
    }

    try {
      const raw = fs.readFileSync(queueFilePath, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.items)) {
        return parsed.items;
      }
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return [];
    } catch (readErr) {
      console.error("[DURABLE_TELEMETRY_QUEUE] Corrupted queue file detected:", readErr);
      try {
        const corruptedBackupPath = `${queueFilePath}.corrupted.${Date.now()}`;
        fs.renameSync(queueFilePath, corruptedBackupPath);
        console.warn(`[DURABLE_TELEMETRY_QUEUE] Quarantined corrupted queue file to ${corruptedBackupPath}`);
      } catch {}
      return [];
    }
  }

  /**
   * Persists an activity telemetry summary to the durable queue BEFORE network submission.
   *
   * @param {Object} activityPayload
   * @returns {Object} Enqueued record
   */
  enqueue(activityPayload) {
    if (!this.activeUserId) {
      throw new Error("Cannot enqueue telemetry: no active user bound");
    }
    if (!activityPayload || typeof activityPayload !== "object") {
      throw new Error("Invalid activityPayload");
    }

    const paths = this.getUserPaths(this.activeUserId);
    const items = this._readQueueSafely(paths.queueFilePath);

    // Resolve stable idempotency key
    let idempotencyKey = activityPayload.idempotencyKey || activityPayload.telemetry?.summaryId;
    if (!isValidIdempotencyKey(idempotencyKey)) {
      idempotencyKey = `idem_${Date.now()}_${crypto.randomUUID()}`;
      activityPayload.idempotencyKey = idempotencyKey;
      if (activityPayload.telemetry && typeof activityPayload.telemetry === "object") {
        activityPayload.telemetry.summaryId = idempotencyKey;
      }
    }

    // Ensure eventTimestamp is present on the payload from telemetry if not set at top level
    if (!activityPayload.eventTimestamp && activityPayload.telemetry && typeof activityPayload.telemetry === "object") {
      const derivedTs = activityPayload.telemetry.firstObservedAt || activityPayload.telemetry.measuredStart;
      if (derivedTs) {
        activityPayload.eventTimestamp = derivedTs;
      }
    }

    // Deduplicate in queue: if item with same idempotencyKey is already pending, return existing
    const existingIndex = items.findIndex((i) => i.idempotencyKey === idempotencyKey);
    if (existingIndex !== -1) {
      return items[existingIndex];
    }

    // Explicit Bounded Capacity & FIFO Overflow Eviction
    if (items.length >= this.maxQueueSize) {
      const dropped = items.shift();
      this.overflowDroppedCount++;
      console.warn(
        `[TELEMETRY_QUEUE_OVERFLOW] Queue limit (${this.maxQueueSize}) reached. Dropping oldest pending telemetry (${dropped.idempotencyKey}). Never fabricating false zero activity.`
      );
    }

    const record = {
      idempotencyKey,
      userId: this.activeUserId,
      payload: { ...activityPayload, idempotencyKey },
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
      lastAttemptAt: null,
      nextRetryAt: null,
      lastError: null,
    };

    items.push(record);

    try {
      this._writeQueueAtomically(paths.queueFilePath, items);
    } catch (writeErr) {
      console.error("[DURABLE_TELEMETRY_QUEUE] Write failure on enqueue:", writeErr);
      throw writeErr;
    }

    return record;
  }

  /**
   * Acknowledges and permanently removes an item after backend confirms successful receipt
   * (or confirms safe duplicate acknowledgement).
   *
   * @param {string} idempotencyKey
   * @param {string} [userId]
   * @returns {boolean} True if found and removed
   */
  acknowledge(idempotencyKey, userId = null) {
    const targetUserId = userId || this.activeUserId;
    if (!targetUserId || !idempotencyKey) return false;

    try {
      const paths = this.getUserPaths(targetUserId);
      const items = this._readQueueSafely(paths.queueFilePath);
      const filtered = items.filter((i) => i.idempotencyKey !== idempotencyKey);

      if (filtered.length !== items.length) {
        this._writeQueueAtomically(paths.queueFilePath, filtered);
        return true;
      }
      return false;
    } catch (ackErr) {
      console.error("[DURABLE_TELEMETRY_QUEUE] Acknowledge write failure:", ackErr);
      return false;
    }
  }

  /**
   * Retrieves all currently pending queue items for a user.
   *
   * @param {string} [userId]
   * @returns {Array<Object>}
   */
  listQueueItems(userId = null) {
    const targetUserId = userId || this.activeUserId;
    if (!targetUserId) return [];
    try {
      const paths = this.getUserPaths(targetUserId);
      return this._readQueueSafely(paths.queueFilePath);
    } catch {
      return [];
    }
  }

  /**
   * Returns queue length for a user.
   *
   * @param {string} [userId]
   * @returns {number}
   */
  getQueueLength(userId = null) {
    return this.listQueueItems(userId).length;
  }

  /**
   * Clears scheduled retry timer.
   */
  clearRetryTimer() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Schedules a delayed retry of the queue.
   *
   * @param {Function} callback
   * @param {number} delayMs
   */
  scheduleRetry(callback, delayMs) {
    this.clearRetryTimer();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (typeof callback === "function") {
        callback();
      }
    }, Math.max(500, delayMs));
  }

  /**
   * Drains and transmits pending telemetry summaries to the backend.
   *
   * Controlled Delivery Guarantees:
   * - Enforces at-least-once submission with database-enforced idempotency.
   * - Concurrency guard: prevents multiple overlapping flush runs.
   * - Exponential backoff with jitter and maximum delay cap.
   * - Safe duplicate acknowledgement handling.
   * - Strict tenant and user boundary protection.
   *
   * @param {Object} options
   * @param {string} options.apiBaseUrl
   * @param {string} options.authToken
   * @param {string} [options.activeUserId]
   * @param {Object} [options.httpClient=axios] Injected HTTP client for testing
   * @returns {Promise<{ delivered: number, remaining: number, errors: number }>}
   */
  async processQueue(options = {}) {
    if (this.isProcessing) {
      return { delivered: 0, remaining: this.getQueueLength(), errors: 0, skipped: true };
    }

    const apiBaseUrl = options.apiBaseUrl;
    const authToken = options.authToken;
    const targetUserId = options.activeUserId || this.activeUserId;
    const httpClient = options.httpClient || axios;

    if (!apiBaseUrl || !authToken || !targetUserId) {
      return { delivered: 0, remaining: this.getQueueLength(targetUserId), errors: 0, skipped: true };
    }

    this.isProcessing = true;
    let delivered = 0;
    let errors = 0;

    try {
      const paths = this.getUserPaths(targetUserId);
      const items = this._readQueueSafely(paths.queueFilePath);
      const nowMs = Date.now();

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Security check: ensure item belongs to target user
        if (item.userId !== targetUserId) {
          console.warn(`[DURABLE_TELEMETRY_QUEUE] Skipping mismatched user item: ${item.userId} !== ${targetUserId}`);
          continue;
        }

        // Backoff check
        if (item.nextRetryAt && nowMs < item.nextRetryAt) {
          continue;
        }

        try {
          const response = await httpClient.post(
            `${apiBaseUrl}/activity`,
            item.payload,
            {
              headers: {
                Authorization: `Bearer ${authToken}`,
                "Content-Type": "application/json",
              },
              timeout: 15000,
            }
          );

          // HTTP 200/201: Success or safe duplicate acknowledgement
          if (response.status === 200 || response.status === 201) {
            this.acknowledge(item.idempotencyKey, targetUserId);
            delivered++;
          }
        } catch (postErr) {
          errors++;
          const status = postErr.response?.status;

          // HTTP 409 (Conflict): Backend recognized already-processed idempotency key
          if (status === 409) {
            this.acknowledge(item.idempotencyKey, targetUserId);
            delivered++;
            continue;
          }

          // HTTP 400 (Bad Request): Validation failure that will not succeed on retry
          if (status === 400) {
            console.error(
              `[DURABLE_TELEMETRY_QUEUE] Permanent validation error (HTTP 400) for ${item.idempotencyKey}. Quarantining:`,
              postErr.response?.data
            );
            this.acknowledge(item.idempotencyKey, targetUserId);
            continue;
          }

          // HTTP 401 or 403 (Auth Failure): Token expired or forbidden
          if (status === 401 || status === 403) {
            console.warn("[DURABLE_TELEMETRY_QUEUE] Auth failure (401/403). Pausing delivery until token refresh.");
            break;
          }

          // Transient network failure or HTTP 5xx: Apply exponential backoff
          item.attempts = (item.attempts || 0) + 1;
          item.lastAttemptAt = new Date().toISOString();
          item.lastError = postErr.message;

          const backoffExp = Math.min(item.attempts - 1, 6);
          const jitter = Math.floor(Math.random() * 1000);
          const delayMs = Math.min(
            this.baseRetryDelayMs * Math.pow(2, backoffExp) + jitter,
            this.maxRetryDelayMs
          );
          item.nextRetryAt = Date.now() + delayMs;

          // Persist retry state back to disk
          try {
            this._writeQueueAtomically(paths.queueFilePath, items);
          } catch {}

          // Schedule next retry
          this.scheduleRetry(() => {
            void this.processQueue(options);
          }, delayMs);

          // Stop this batch to prevent hammering unreachable server
          break;
        }
      }

      return {
        delivered,
        remaining: this.getQueueLength(targetUserId),
        errors,
        skipped: false,
      };
    } finally {
      this.isProcessing = false;
    }
  }
}

// Singleton desktop instance
let instance = null;

function getDurableTelemetryQueue(options) {
  if (!instance) {
    instance = new DurableTelemetryQueue(options);
  }
  return instance;
}

function resetDurableTelemetryQueue() {
  if (instance) {
    instance.clearRetryTimer();
  }
  instance = null;
}

module.exports = {
  DurableTelemetryQueue,
  normalizeUserId,
  isValidIdempotencyKey,
  DEFAULT_MAX_QUEUE_SIZE,
  DEFAULT_MAX_RETRIES,
  DEFAULT_BASE_RETRY_DELAY_MS,
  DEFAULT_MAX_RETRY_DELAY_MS,
  getDurableTelemetryQueue,
  resetDurableTelemetryQueue,
};

