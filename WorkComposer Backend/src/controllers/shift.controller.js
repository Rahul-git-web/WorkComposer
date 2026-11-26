import TimeTrackingSettings from "../models/timeTrackingSettings.model.js";
import Role from "../models/role.model.js";
import { getIO } from "../socket/socket.js";
import { normalizeId, resolveEffectiveAuthContext } from "../security/effectiveAuthContext.js";
import { canAccessShiftSettings } from "../security/policyEvaluator.js";
import { DECISION_CODES } from "../security/policyTypes.js";

/**
 * Sanitizes the shift payload to strictly allow legitimate shift configuration fields.
 * Strips any authorization-sensitive or foreign fields (organizationId, userId, role, etc.).
 */
export function sanitizeShiftPayload(body = {}) {
  const allowed = {};

  if (typeof body.enabled === "boolean") {
    allowed.enabled = body.enabled;
  }

  if (typeof body.autoStartTracking === "boolean") {
    allowed.autoStartTracking = body.autoStartTracking;
  }

  if (typeof body.autoStopTracking === "boolean") {
    allowed.autoStopTracking = body.autoStopTracking;
  }

  if (typeof body.stopTrackingDuringBreaks === "boolean") {
    allowed.stopTrackingDuringBreaks = body.stopTrackingDuringBreaks;
  }

  if (Array.isArray(body.schedule)) {
    allowed.schedule = body.schedule.map((item) => ({
      day: String(item.day || ""),
      enabled: typeof item.enabled === "boolean" ? item.enabled : true,
      startTime: String(item.startTime || "09:00"),
      endTime: String(item.endTime || "18:00"),
      breaks: Array.isArray(item.breaks)
        ? item.breaks.map((b) => ({
            name: String(b.name || ""),
            startTime: String(b.startTime || ""),
            endTime: String(b.endTime || ""),
          }))
        : [],
    }));
  }

  return allowed;
}

export const getShiftSettings = async (req, res) => {
  try {
    const callerUserId = normalizeId(req.user?._id || req.user?.id);
    const callerOrgId = normalizeId(
      req.user?.organizationId || req.user?.organization?._id || req.user?.organization?.id || req.user?.organization
    );

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    // Tenant scoping & parameter spoofing check
    const requestedOrgId = req.query?.organizationId || req.body?.organizationId;
    if (requestedOrgId && normalizeId(requestedOrgId) !== callerOrgId) {
      return res.status(404).json({ message: "Shift settings not found." });
    }

    // Resolve caller EffectiveAuthContext authoritatively from primary DB
    const callerRoleDoc = req.user?.roleRef
      ? await Role.findById(normalizeId(req.user.roleRef))
      : null;
    const authContext = resolveEffectiveAuthContext(req.user, callerRoleDoc);

    const decision = canAccessShiftSettings(authContext, callerOrgId, "view");
    if (!decision.allowed) {
      const statusCode = decision.code === DECISION_CODES.TENANT_MISMATCH ? 404 : 403;
      return res.status(statusCode).json({ message: decision.reason });
    }

    const settings = await TimeTrackingSettings.findOneAndUpdate(
      {
        organization: callerOrgId,
      },
      {
        $setOnInsert: {
          organization: callerOrgId,
        },
      },
      {
        upsert: true,
        new: true,
      },
    );

    const shiftData = settings?.shift || {};
    if (!shiftData.schedule || shiftData.schedule.length === 0) {
      const defaultSchedule = [
        { day: "Monday", enabled: true, startTime: "09:00", endTime: "18:00", breaks: [] },
        { day: "Tuesday", enabled: true, startTime: "09:00", endTime: "18:00", breaks: [] },
        { day: "Wednesday", enabled: true, startTime: "09:00", endTime: "18:00", breaks: [] },
        { day: "Thursday", enabled: true, startTime: "09:00", endTime: "18:00", breaks: [] },
        { day: "Friday", enabled: true, startTime: "09:00", endTime: "18:00", breaks: [] },
        { day: "Saturday", enabled: false, startTime: "09:00", endTime: "18:00", breaks: [] },
        { day: "Sunday", enabled: false, startTime: "09:00", endTime: "18:00", breaks: [] },
      ];

      shiftData.schedule = defaultSchedule;
      await TimeTrackingSettings.findOneAndUpdate(
        { organization: callerOrgId },
        { $set: { "shift.schedule": defaultSchedule } }
      );
    }

    return res.status(200).json(shiftData);
  } catch (error) {
    console.error("GET SHIFT SETTINGS ERROR:", error);
    return res.status(500).json({
      message: "Failed to fetch shift settings.",
    });
  }
};

export const updateShiftSettings = async (req, res) => {
  try {
    const callerUserId = normalizeId(req.user?._id || req.user?.id);
    const callerOrgId = normalizeId(
      req.user?.organizationId || req.user?.organization?._id || req.user?.organization?.id || req.user?.organization
    );

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    // Tenant scoping & parameter spoofing check
    const requestedOrgId = req.query?.organizationId || req.body?.organizationId;
    if (requestedOrgId && normalizeId(requestedOrgId) !== callerOrgId) {
      return res.status(404).json({ message: "Shift settings not found." });
    }

    // Resolve caller EffectiveAuthContext authoritatively from primary DB
    const callerRoleDoc = req.user?.roleRef
      ? await Role.findById(normalizeId(req.user.roleRef))
      : null;
    const authContext = resolveEffectiveAuthContext(req.user, callerRoleDoc);

    const decision = canAccessShiftSettings(authContext, callerOrgId, "mutate");
    if (!decision.allowed) {
      const statusCode = decision.code === DECISION_CODES.TENANT_MISMATCH ? 404 : 403;
      return res.status(statusCode).json({ message: decision.reason });
    }

    // Whitelist and sanitize payload against mass assignment
    const sanitizedShift = sanitizeShiftPayload(req.body);

    const settings = await TimeTrackingSettings.findOneAndUpdate(
      {
        organization: callerOrgId,
      },
      {
        $set: {
          shift: sanitizedShift,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      },
    );

    try {
      getIO()
        ?.to(`organization:${callerOrgId}`)
        .emit("tracking-settings-updated", settings);
    } catch {}

    return res.status(200).json({
      message: "Shift settings updated successfully.",
      settings: settings.shift,
    });
  } catch (error) {
    console.error("UPDATE SHIFT SETTINGS ERROR:", error);
    return res.status(500).json({
      message: "Failed to update shift settings.",
    });
  }
};
