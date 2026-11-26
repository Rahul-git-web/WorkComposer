import crypto from "crypto";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Constant-time comparison between two string secrets.
 * Handles missing, malformed, empty, or mismatched-length inputs safely without throwing.
 */
function safeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  if (!a || !b) {
    return false;
  }
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * SEC-15 CSRF Protection Middleware
 *
 * Enforces CSRF token validation on state-changing requests for browser-cookie-authenticated sessions.
 *
 * Rules:
 * 1. Safe methods (GET, HEAD, OPTIONS) bypass CSRF.
 * 2. Authorization: Bearer <token> (desktop Electron / API clients) bypasses CSRF.
 * 3. Desktop client parameter (e.g. client === "desktop" without cookies) bypasses CSRF.
 * 4. Webhook endpoints without cookies bypass CSRF.
 * 5. Requests using cookie authentication (accessToken, refreshToken, or existing csrfToken cookie)
 *    must provide a valid X-CSRF-Token header matching the csrfToken cookie.
 * 6. Missing Origin does not bypass CSRF.
 * 7. Invalid or missing CSRF tokens fail closed with 403 Forbidden before controller execution.
 */
export const csrfProtection = (req, res, next) => {
  // 1. Safe methods bypass CSRF
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  // 2. Desktop / API client using Bearer token authentication
  const authHeader = req.headers.authorization;
  if (
    typeof authHeader === "string" &&
    authHeader.startsWith("Bearer ") &&
    authHeader.slice(7).trim().length > 0
  ) {
    return next();
  }

  // 3. Desktop auth requests (client === "desktop" without session cookies)
  const isDesktopClient = req.body && req.body.client === "desktop";
  const hasSessionCookies = Boolean(
    req.cookies && (req.cookies.accessToken || req.cookies.refreshToken)
  );

  if (isDesktopClient && !hasSessionCookies) {
    return next();
  }

  // 4. Webhook bypass for specific signature-based webhooks if no session cookies
  if (!hasSessionCookies && req.path.startsWith("/api/stripe/webhook")) {
    return next();
  }
  if (!hasSessionCookies && req.headers["x-hook-signature"]) {
    return next();
  }

  // 5. Determine whether request is cookie-authenticated or part of a browser session
  const hasCsrfCookie = Boolean(req.cookies && req.cookies.csrfToken);
  const isCookieAuthenticated = hasSessionCookies || hasCsrfCookie;

  // If this is an unauthenticated state-changing request (e.g. initial public login, register, password reset)
  // that sends no cookies, allow it through to auth controller
  if (!isCookieAuthenticated) {
    return next();
  }

  // 6. Cookie-authenticated state-changing request: require valid CSRF token
  const cookieToken = req.cookies?.csrfToken;
  const headerToken = req.headers["x-csrf-token"] || req.headers["x-xsrf-token"];

  if (!cookieToken || !headerToken) {
    return res.status(403).json({
      message: "CSRF token missing or invalid",
    });
  }

  if (!safeCompare(cookieToken, headerToken)) {
    return res.status(403).json({
      message: "CSRF token missing or invalid",
    });
  }

  return next();
};
