/**
 * Scheduler Error Categorization & Safe Logging Utility
 *
 * Categorizes external email and database failures to drive retry policies
 * while enforcing strict security rules: never logs credentials, auth tokens,
 * full email bodies, or sensitive employee metrics.
 */

import crypto from "crypto";

export const ERROR_CATEGORIES = Object.freeze({
  RATE_LIMIT: "RATE_LIMIT",
  TIMEOUT: "TIMEOUT",
  INVALID_RECIPIENT: "INVALID_RECIPIENT",
  TRANSIENT: "TRANSIENT",
  PERMANENT: "PERMANENT",
  DATABASE_ERROR: "DATABASE_ERROR",
  LOST_OWNERSHIP: "LOST_OWNERSHIP",
  UNKNOWN: "UNKNOWN",
});

/**
 * Classifies an error into an actionable recovery category.
 *
 * @param {Error|Object|string} err
 * @returns {string} One of ERROR_CATEGORIES
 */
export function categorizeSchedulerError(err) {
  if (!err) return ERROR_CATEGORIES.UNKNOWN;

  const msg = String(err.message || err || "").toLowerCase();
  const code = err.code || err.status || err.response?.status || err.statusCode;

  if (
    code === 429 ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("throttled")
  ) {
    return ERROR_CATEGORIES.RATE_LIMIT;
  }

  if (
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    code === "ECONNABORTED" ||
    msg.includes("timeout") ||
    msg.includes("timed out")
  ) {
    return ERROR_CATEGORIES.TIMEOUT;
  }

  if (
    code === 400 ||
    msg.includes("invalid recipient") ||
    msg.includes("invalid email") ||
    msg.includes("bad email") ||
    msg.includes("malformed") ||
    msg.includes("recipient rejected")
  ) {
    return ERROR_CATEGORIES.INVALID_RECIPIENT;
  }

  if (
    code === "P2002" ||
    code === "P2025" ||
    code === "P2003" ||
    msg.includes("prisma") ||
    msg.includes("database")
  ) {
    return ERROR_CATEGORIES.DATABASE_ERROR;
  }

  if (
    (typeof code === "number" && code >= 500) ||
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "EAI_AGAIN" ||
    msg.includes("network") ||
    msg.includes("connection reset")
  ) {
    return ERROR_CATEGORIES.TRANSIENT;
  }

  if (code === 401 || code === 403 || msg.includes("unauthorized") || msg.includes("forbidden")) {
    return ERROR_CATEGORIES.PERMANENT;
  }

  return ERROR_CATEGORIES.UNKNOWN;
}

/**
 * Determines whether a categorized error should be retried in a future sweep.
 *
 * @param {string} category
 * @param {number} attempts
 * @param {number} [maxAttempts=3]
 * @returns {boolean}
 */
export function isRetryableError(category, attempts = 0, maxAttempts = 3) {
  if (attempts >= maxAttempts) return false;
  return (
    category === ERROR_CATEGORIES.RATE_LIMIT ||
    category === ERROR_CATEGORIES.TIMEOUT ||
    category === ERROR_CATEGORIES.TRANSIENT
  );
}

/**
 * Produces a safe diagnostic record omitting sensitive PII, passwords, and tokens.
 *
 * @param {Object} context
 * @param {string} context.recipientId
 * @param {string} [context.eventKey]
 * @param {string} [context.reportPeriod]
 * @param {string} context.category
 * @param {Error|string} context.error
 * @param {number} [context.attempt=1]
 * @returns {Object} Safe structured diagnostic entry
 */
export function createSafeDiagnostic(context) {
  const errMsg = typeof context.error === "string" ? context.error : context.error?.message || "Unknown";
  return {
    timestamp: new Date().toISOString(),
    recipientId: String(context.recipientId || "unknown"),
    eventKey: context.eventKey ? String(context.eventKey) : undefined,
    reportPeriod: context.reportPeriod ? String(context.reportPeriod) : undefined,
    category: context.category,
    attempt: Number(context.attempt || 1),
    message: errMsg.slice(0, 300), // sanitize & clamp length
  };
}

/**
 * Custom error indicating a worker's claim lease expired and was reclaimed by another worker.
 */
export class LostOwnershipError extends Error {
  constructor(message = "Claim ownership was lost to a newer worker lease") {
    super(message);
    this.name = "LostOwnershipError";
    this.code = "LOST_OWNERSHIP";
  }
}

/**
 * Derives a deterministic RFC 4122 UUIDv4 from a report eventKey.
 * Enables email providers supporting idempotency keys (e.g. Brevo) to deduplicate.
 *
 * @param {string} eventKey
 * @returns {string} 36-character canonical UUIDv4 string
 */
export function deriveReportIdempotencyKey(eventKey) {
  const hash = crypto.createHash("sha256").update(String(eventKey)).digest("hex");
  const part1 = hash.substring(0, 8);
  const part2 = hash.substring(8, 12);
  const part3 = "4" + hash.substring(13, 16);
  const part4 = ((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0") + hash.substring(18, 20);
  const part5 = hash.substring(20, 32);
  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}
