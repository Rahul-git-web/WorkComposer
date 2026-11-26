import { getIO } from "../socket/socket.js";
import resolveTrackingSettings from "../utils/resolveTrackingSettings.js";
import { resolveUserTimezone } from "../utils/timezone.js";
import {
  organizationRepository,
  timeTrackingSettingsRepository,
  userRepository,
} from "../db/repositories/index.js";
import { auditTrackingSettingsUpdated } from "../utils/auditService.js";

export const getTimeTrackingSettings = async (req, res) => {
  try {
    const orgId = req.user.organization?._id || req.user.organization;
    let settings = await timeTrackingSettingsRepository.findOne({
      organization: orgId,
    });

    if (!settings) {
      settings = await timeTrackingSettingsRepository.create({
        organization: orgId,
      });
    }

    return res.status(200).json(settings);
  } catch (error) {
    console.error("getTimeTrackingSettings error:", error);

    return res.status(500).json({
      message: "Failed to fetch time tracking settings.",
    });
  }
};

export const updateTimeTrackingSettings = async (req, res) => {
  try {
    const orgId = req.user.organization?._id || req.user.organization;
    let settings = await timeTrackingSettingsRepository.findOne({
      organization: orgId,
    });

    if (settings) {
      settings = await timeTrackingSettingsRepository.updateById(
        settings.id || settings._id,
        req.body,
        { new: true }
      );
    } else {
      settings = await timeTrackingSettingsRepository.create({
        ...req.body,
        organization: orgId,
      });
    }

    const organizationId = req.user.organization._id || req.user.organization;

    getIO()
      .to(`organization:${organizationId}`)
      .emit("tracking-settings-updated", settings);

    await auditTrackingSettingsUpdated({
      req,
      changes: req.body,
    });

    return res.status(200).json({
      message: "Time tracking settings updated successfully.",
      settings,
    });
  } catch (error) {
    console.error("updateTimeTrackingSettings error:", error);

    return res.status(500).json({
      message: "Failed to update time tracking settings.",
    });
  }
};

export const getEffectiveTimeTrackingSettings = async (req, res) => {
  try {
    const orgId = req.user.organization?._id || req.user.organization;
    const organizationSettings = await timeTrackingSettingsRepository.findOne({
      organization: orgId,
    });

    const user = await userRepository.findById(req.user._id, {
      populateOrganization: true,
    });

    const organization =
      user?.organization && typeof user.organization === "object"
        ? user.organization
        : orgId
          ? await organizationRepository.findById(orgId)
          : null;

    const mergedOrganizationSettings = {
      ...(organizationSettings || {}),
      notifications:
        organization?.notifications ?? organizationSettings?.notifications,
    };

    const settings = resolveTrackingSettings(
      mergedOrganizationSettings,
      user,
      organization,
    );
    const timezone = resolveUserTimezone(user, req);

    settings.timezone = timezone;
    if (settings.shift) {
      settings.shift.timezone = timezone;
    }

    return res.status(200).json(settings);
  } catch (error) {
    console.error("getEffectiveTimeTrackingSettings error:", error);

    return res.status(500).json({
      message: "Failed to load effective settings.",
    });
  }
};
