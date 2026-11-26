/**
 * UI-22 Test Harness Router
 *
 * Dedicated, strictly isolated test-only routes.
 * SECURITY INVARIANTS:
 * 1. MUST NEVER be reachable in production (process.env.NODE_ENV === "production").
 * 2. MUST require process.env.ENABLE_TEST_HARNESS === "true" (fail closed).
 * 3. MUST restrict access to loopback IPs only (127.0.0.1, ::1).
 * 4. MUST require a shared secret header (x-test-harness-secret).
 * 5. On ANY authorization or environment mismatch, responds with generic 404
 *    to prevent endpoint enumeration.
 */

import express from "express";
import { resetRateLimiters } from "../middleware/authRateLimit.middleware.js";

const router = express.Router();

const isLoopbackIp = (ip) => {
  if (!ip) return false;
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip.endsWith("127.0.0.1")
  );
};

// Security Guard Middleware
router.use((req, res, next) => {
  // 1. Hard disable in production
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ message: "Resource not found", error: "Resource not found" });
  }

  // 2. Fail closed: requires explicit opt-in
  if (process.env.ENABLE_TEST_HARNESS !== "true") {
    return res.status(404).json({ message: "Resource not found", error: "Resource not found" });
  }

  // 3. Loopback only
  const clientIp = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress;
  if (!isLoopbackIp(clientIp)) {
    return res.status(404).json({ message: "Resource not found", error: "Resource not found" });
  }

  // 4. Test harness secret validation
  const expectedSecret = process.env.TEST_HARNESS_SECRET || "wc-smoke-test-secret-2026";
  const providedSecret = req.headers["x-test-harness-secret"];
  if (!providedSecret || providedSecret !== expectedSecret) {
    return res.status(404).json({ message: "Resource not found", error: "Resource not found" });
  }

  next();
});

/**
 * Resets in-memory express-rate-limit stores and OTP counters.
 * Used exclusively for deterministic test isolation.
 */
router.post("/reset-limiters", (req, res) => {
  resetRateLimiters();
  res.json({ success: true, reset: true });
});

/**
 * Diagnostic health check for test harness readiness
 */
router.get("/health", (req, res) => {
  res.json({ status: "ok", mode: "test-harness" });
});

export default router;
