/**
 * SEC-21 Safe Error Response and Diagnostic Logging Utility
 *
 * Requirements:
 * 1. Safe, client-facing error responses without leaking internal implementation details
 *    (no stack traces, no filesystem paths, no database/Prisma schemas, no upstream response bodies).
 * 2. Compatible response shape supporting both 'message' and 'error' keys.
 * 3. Preserve caller-specified HTTP status codes and domain messages.
 * 4. Redact sensitive secrets (passwords, tokens, API keys, authorization data) before logging.
 * 5. Respect res.headersSent to prevent duplicate responses.
 */

const SENSITIVE_PATTERNS = [
  // Bearer tokens & JWTs
  /(Bearer\s+)[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/gi,
  /(eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})/g,
  // Passwords, secrets, keys in JSON or key-value pairs
  /(["']?(?:password|token|secret|apiKey|keyHash|twoFactorCode|otp|refreshToken|accessToken)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi,
  // Stripe secret keys or webhook secrets
  /(whsec_[A-Za-z0-9]+|sk_test_[A-Za-z0-9]+|sk_live_[A-Za-z0-9]+)/g,
];

/**
 * Redacts sensitive tokens/passwords from error messages or objects before server-side logging.
 *
 * @param {any} err - The error to sanitize
 * @returns {string} Sanitized diagnostic string
 */
export function sanitizeErrorDetails(err) {
  if (!err) return "Unknown error";
  let str = "";
  if (typeof err === "string") {
    str = err;
  } else if (err instanceof Error) {
    str = `${err.name || "Error"}: ${err.message || ""}`;
    if (err.code) str += ` (Code: ${err.code})`;
  } else if (typeof err === "object") {
    try {
      str = JSON.stringify(err);
    } catch {
      str = String(err);
    }
  } else {
    str = String(err);
  }

  for (const pattern of SENSITIVE_PATTERNS) {
    str = str.replace(pattern, "$1[REDACTED]");
  }

  return str;
}

/**
 * Sends a sanitized error response to the HTTP client while logging diagnostic details server-side safely.
 *
 * @param {import("express").Response} res - Express response object
 * @param {any} err - Captured internal error (logged server-side only, never leaked)
 * @param {string} [publicMessage="Internal server error"] - Safe user-facing message
 * @param {number} [statusCode=500] - HTTP status code (defaults to 500)
 * @param {object} [extraFields={}] - Optional extra safe fields to include
 * @returns {import("express").Response|void}
 */
export function sendErrorResponse(
  res,
  err,
  publicMessage = "Internal server error",
  statusCode = 500,
  extraFields = {}
) {
  if (res.headersSent) {
    return;
  }

  // Safe server-side diagnostic logging (sanitized)
  if (err) {
    const sanitizedMsg = sanitizeErrorDetails(err);
    console.error(`[ErrorResponse ${statusCode}] ${sanitizedMsg}`);
  }

  // Provide both message and error keys for seamless client & test compatibility
  return res.status(statusCode).json({
    message: publicMessage,
    error: publicMessage,
    ...extraFields,
  });
}

export default sendErrorResponse;
