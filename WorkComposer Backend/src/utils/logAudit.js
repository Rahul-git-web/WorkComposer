import AuditLog from "../models/auditLog.model.js";

const SENSITIVE_KEY_REGEX = /password|token|secret|authorization|cookie|cvv|cardnumber|apikey/i;

export const sanitizeAuditDetails = (val, seen = new WeakSet()) => {
  if (val === null || val === undefined) {
    return val;
  }

  if (typeof val === "string") {
    // Mask potential API keys or tokens embedded in strings
    if (val.startsWith("wc_live_") || val.startsWith("wc_test_")) {
      return val.length > 12
        ? `${val.slice(0, 8)}...${val.slice(-4)}`
        : "[REDACTED_KEY]";
    }
    return val;
  }

  if (typeof val !== "object") {
    return val;
  }

  if (val instanceof Date) {
    return val.toISOString();
  }

  if (seen.has(val)) {
    return "[CIRCULAR]";
  }
  seen.add(val);

  if (Array.isArray(val)) {
    return val.map((item) => sanitizeAuditDetails(item, seen));
  }

  const clean = {};
  for (const [k, v] of Object.entries(val)) {
    if (SENSITIVE_KEY_REGEX.test(k)) {
      clean[k] = "[REDACTED]";
    } else {
      clean[k] = sanitizeAuditDetails(v, seen);
    }
  }

  return clean;
};

export const normalizeIp = (ip = "") => {
  if (!ip) return "";
  if (ip === "::1") return "127.0.0.1";
  if (ip.startsWith("::ffff:")) {
    return ip.replace("::ffff:", "");
  }
  return ip;
};

export const logAudit = async ({
  organization,
  performedBy = null,
  category,
  activity,
  details = {},
  ipAddress = "",
  platform = "",
}) => {
  try {
    const orgId = organization?._id || organization?.id || organization;
    const userId = performedBy?._id || performedBy?.id || performedBy || null;

    if (!orgId) {
      console.warn("Audit Log Warning: Missing organization for activity:", activity);
      return;
    }

    const sanitizedDetails = sanitizeAuditDetails(details);
    const resolvedIp = normalizeIp(ipAddress);
    const resolvedPlatform = platform || "Web";

    await AuditLog.create({
      organization: orgId,
      performedBy: userId,
      category,
      activity,
      details: sanitizedDetails,
      ipAddress: resolvedIp,
      platform: resolvedPlatform,
    });
  } catch (err) {
    console.error("Audit Log Error:", err);
  }
};
