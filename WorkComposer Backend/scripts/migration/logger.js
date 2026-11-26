/**
 * Structured Logger for ETL Data Migration
 * Automatically masks credentials, tokens, and sensitive data.
 */

const SENSITIVE_KEYS = new Set([
  "password",
  "twofactorcode",
  "two_factor_code",
  "token",
  "refreshtoken",
  "refresh_token",
  "accesstoken",
  "access_token",
  "apikey",
  "api_key",
  "keyhash",
  "key_hash",
  "clientsecret",
  "client_secret",
  "stripesecret",
  "stripe_secret",
  "stripecustomerid",
  "stripesubscriptionid",
  "verificationtoken",
  "resettoken",
]);

/**
 * Deeply redacts sensitive keys in objects/arrays before logging
 */
export function sanitizeLogData(data) {
  if (data === null || data === undefined) return data;
  if (typeof data === "string") {
    // Redact Bearer tokens or long JWT strings if present in text
    return data.replace(/(Bearer\s+)[A-Za-z0-9\-_.]+/gi, "$1[REDACTED]");
  }
  if (typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item));
  }

  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    const lower = key.toLowerCase().replace(/[-_]/g, "");
    if (SENSITIVE_KEYS.has(lower) || SENSITIVE_KEYS.has(key.toLowerCase())) {
      clean[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      clean[key] = sanitizeLogData(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

function formatTimestamp() {
  return new Date().toISOString();
}

export const logger = {
  info(message, meta = null) {
    const timestamp = formatTimestamp();
    if (meta) {
      console.log(`[${timestamp}] [INFO]  ${message}`, JSON.stringify(sanitizeLogData(meta)));
    } else {
      console.log(`[${timestamp}] [INFO]  ${message}`);
    }
  },

  warn(message, meta = null) {
    const timestamp = formatTimestamp();
    if (meta) {
      console.warn(`[${timestamp}] [WARN]  ${message}`, JSON.stringify(sanitizeLogData(meta)));
    } else {
      console.warn(`[${timestamp}] [WARN]  ${message}`);
    }
  },

  error(message, error = null) {
    const timestamp = formatTimestamp();
    if (error && error.stack) {
      console.error(`[${timestamp}] [ERROR] ${message} - ${error.message}\n${error.stack}`);
    } else if (error) {
      console.error(`[${timestamp}] [ERROR] ${message}`, JSON.stringify(sanitizeLogData(error)));
    } else {
      console.error(`[${timestamp}] [ERROR] ${message}`);
    }
  },

  debug(message, meta = null) {
    if (process.env.DEBUG || process.env.MIGRATION_DEBUG === "true") {
      const timestamp = formatTimestamp();
      if (meta) {
        console.log(`[${timestamp}] [DEBUG] ${message}`, JSON.stringify(sanitizeLogData(meta)));
      } else {
        console.log(`[${timestamp}] [DEBUG] ${message}`);
      }
    }
  },

  /**
   * Standard batch completion log formatter
   */
  batch(model, batchNumber, stats) {
    const {
      source = 0,
      inserted = 0,
      normalized = 0,
      orphans = 0,
      durationMs = 0,
      isDryRun = false,
    } = stats;
    const durationSec = (durationMs / 1000).toFixed(2);
    const modeTag = isDryRun ? " [DRY-RUN]" : "";
    console.log(
      `[${formatTimestamp()}] [${model}]${modeTag} batch=${batchNumber} source=${source} inserted=${inserted} normalized=${normalized} orphans=${orphans} duration=${durationSec}s`
    );
  },
};

export default logger;
