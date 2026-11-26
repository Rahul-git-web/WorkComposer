/**
 * SEC-19 Security Headers Middleware
 * Defense-in-depth HTTP security hardening
 * 
 * Sets conservative, compatibility-first security headers across all backend responses.
 */

export const securityHeaders = (req, res, next) => {
  // 1. Prevent MIME-type sniffing on JSON, CSV, and file responses (SEC19-03)
  res.setHeader("X-Content-Type-Options", "nosniff");

  // 2. Clickjacking protection: disallow framing of backend API and file responses
  res.setHeader("X-Frame-Options", "DENY");

  // 3. Referrer Policy: preserve origin, strip path/query on cross-origin
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // 4. DNS prefetch control
  res.setHeader("X-DNS-Prefetch-Control", "off");

  // 5. Origin-Agent-Cluster
  res.setHeader("Origin-Agent-Cluster", "?1");

  // 6. Permissions Policy: restrict unused device APIs (camera, microphone)
  res.setHeader("Permissions-Policy", "camera=(), microphone=()");

  // 7. Strict-Transport-Security: production HTTPS only (never localhost/dev)
  const isProduction = process.env.NODE_ENV === "production";
  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  if (isProduction && isHttps) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
  }

  // 8. Cross-Origin-Resource-Policy: allow cross-origin display of uploaded resources
  if (req.path && req.path.startsWith("/uploads")) {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  }

  next();
};
