import rateLimit, { MemoryStore, ipKeyGenerator } from "express-rate-limit";

// Tracking list of stores so resetRateLimiters can reset all in-memory buckets deterministically
const registeredStores = [];

function createTrackedStore() {
  const store = new MemoryStore();
  registeredStores.push(store);
  return store;
}

// In-memory OTP failure counter map: userId -> consecutive failed attempts
const otpFailureMap = new Map();

/**
 * Increment and return consecutive failed OTP attempts for a user
 * @param {string} userId
 * @returns {number} current failed attempt count
 */
export const recordOtpFailure = (userId) => {
  if (!userId) return 0;
  const key = String(userId);
  const current = (otpFailureMap.get(key) || 0) + 1;
  otpFailureMap.set(key, current);
  return current;
};

/**
 * Reset consecutive failed OTP attempts for a user
 * @param {string} userId
 */
export const clearOtpFailures = (userId) => {
  if (!userId) return;
  const key = String(userId);
  otpFailureMap.delete(key);
};

/**
 * Get current consecutive failed OTP attempts for a user
 * @param {string} userId
 * @returns {number}
 */
export const getOtpFailures = (userId) => {
  if (!userId) return 0;
  return otpFailureMap.get(String(userId)) || 0;
};

/**
 * Deterministically resets all registered rate-limit stores and OTP failure maps.
 * Used for test isolation and clean state resets.
 */
export const resetRateLimiters = () => {
  for (const store of registeredStores) {
    if (typeof store.resetAll === "function") {
      store.resetAll();
    }
  }
  otpFailureMap.clear();
};

/**
 * Safely extracts and normalizes the client IP key using express-rate-limit ipKeyGenerator
 * @param {import("express").Request} req
 * @returns {string}
 */
export const getClientIpKey = (req) => {
  return ipKeyGenerator(req.ip || "127.0.0.1");
};

/**
 * Normalizes email by trimming whitespace and converting to lowercase
 * @param {unknown} val
 * @returns {string|null}
 */
export const normalizeEmail = (val) => {
  if (typeof val === "string" && val.trim().length > 0) {
    return val.toLowerCase().trim();
  }
  return null;
};

const defaultRateLimitHandler = (req, res, next, options) => {
  res.status(options.statusCode).json(options.message);
};

const defaultMessage = {
  message: "Too many requests. Please try again later.",
};

const baseOptions = {
  standardHeaders: "draft-7",
  legacyHeaders: false,
  statusCode: 429,
  message: defaultMessage,
  handler: defaultRateLimitHandler,
};

// 1. Global Auth Burst Limiter (Target: /api/auth/* — 100 requests / 15 minutes / IP)
export const authBurstLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 100,
  store: createTrackedStore(),
  keyGenerator: (req) => `burst:ip:${getClientIpKey(req)}`,
});

// 2. Login IP Limiter (Target: POST /api/auth/login — 20 failed attempts / 15 minutes / IP)
export const loginIpLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  store: createTrackedStore(),
  keyGenerator: (req) => `login:ip:${getClientIpKey(req)}`,
});

// 3. Login Identity Limiter (Target: POST /api/auth/login — 10 failed attempts / 15 minutes / normalized email)
export const loginIdentityLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  store: createTrackedStore(),
  keyGenerator: (req) => {
    const email = normalizeEmail(req.body?.email);
    if (email) return `login:id:${email}`;
    return `login:id:none:${getClientIpKey(req)}`;
  },
});

// 4. 2FA IP Limiter (Target: POST /api/auth/verify-two-factor — 20 failed attempts / 15 minutes / IP)
export const twoFactorIpLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  store: createTrackedStore(),
  keyGenerator: (req) => `2fa:ip:${getClientIpKey(req)}`,
});

// 5. 2FA Identity Limiter (Target: POST /api/auth/verify-two-factor — 10 failed attempts / 15 minutes / normalized email)
export const twoFactorIdentityLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  store: createTrackedStore(),
  keyGenerator: (req) => {
    const email = normalizeEmail(req.body?.email);
    if (email) return `2fa:id:${email}`;
    return `2fa:id:none:${getClientIpKey(req)}`;
  },
});

// 6. Forgot Password IP Limiter (Target: POST /api/auth/forgot-password — 15 requests / 1 hour / IP)
export const forgotPasswordIpLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 15,
  store: createTrackedStore(),
  keyGenerator: (req) => `forgot:ip:${getClientIpKey(req)}`,
});

// 7. Forgot Password Identity Limiter (Target: POST /api/auth/forgot-password — 5 requests / 1 hour / normalized email)
export const forgotPasswordIdentityLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  store: createTrackedStore(),
  keyGenerator: (req) => {
    const email = normalizeEmail(req.body?.email);
    if (email) return `forgot:id:${email}`;
    return `forgot:id:none:${getClientIpKey(req)}`;
  },
});

// 8. Resend Verification IP Limiter (Target: POST /api/auth/resend-verification — 15 requests / 1 hour / IP)
export const resendVerificationIpLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 15,
  store: createTrackedStore(),
  keyGenerator: (req) => `resend:ip:${getClientIpKey(req)}`,
});

// 9. Resend Verification Identity Limiter (Target: POST /api/auth/resend-verification — 5 requests / 1 hour / normalized email)
export const resendVerificationIdentityLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  store: createTrackedStore(),
  keyGenerator: (req) => {
    const email = normalizeEmail(req.body?.email);
    if (email) return `resend:id:${email}`;
    return `resend:id:none:${getClientIpKey(req)}`;
  },
});

// 10. Registration Limiter (Target: POST /api/auth/register — 15 requests / 1 hour / IP)
export const registerLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 15,
  store: createTrackedStore(),
  keyGenerator: (req) => `register:ip:${getClientIpKey(req)}`,
});

// 11. Password Reset Execution Limiter (Target: POST /api/auth/reset-password — 20 requests / 15 minutes / IP)
export const resetPasswordLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  store: createTrackedStore(),
  keyGenerator: (req) => `reset:ip:${getClientIpKey(req)}`,
});

// 12. Refresh Token Limiter (Target: POST /api/auth/refresh — 60 requests / 15 minutes / IP)
export const refreshLimiter = rateLimit({
  ...baseOptions,
  windowMs: 15 * 60 * 1000,
  limit: 60,
  store: createTrackedStore(),
  keyGenerator: (req) => `refresh:ip:${getClientIpKey(req)}`,
});

// 13. Email Request IP Limiter (Target: PUT /api/users/:id/email-request — 15 requests / 1 hour / caller IP)
export const emailRequestIpLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 15,
  store: createTrackedStore(),
  keyGenerator: (req) => `emailreq:ip:${getClientIpKey(req)}`,
});

// 14. Email Request Identity Limiter (Target: PUT /api/users/:id/email-request — 5 requests / 1 hour / target email)
export const emailRequestIdentityLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  store: createTrackedStore(),
  keyGenerator: (req) => {
    const email = normalizeEmail(req.body?.newEmail || req.body?.email);
    if (email) return `emailreq:id:${email}`;
    return `emailreq:id:none:${getClientIpKey(req)}`;
  },
});
