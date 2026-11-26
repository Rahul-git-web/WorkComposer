import TimeTrackingSettings from "../models/timeTrackingSettings.model.js";
import Organization from "../models/organization.model.js";
import { getIO } from "../socket/socket.js";
import { normalizeId } from "../security/effectiveAuthContext.js";

export const getScreenCaptureSettings = async (req, res) => {
  try {
    const settings = await TimeTrackingSettings.findOneAndUpdate(
      {
        organization: req.user.organization,
      },
      {
        $setOnInsert: {
          organization: req.user.organization,
        },
      },
      {
        upsert: true,
        new: true,
      },
    );

    return res.status(200).json(settings.screenCapture);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch screen capture settings.",
    });
  }
};

export const updateScreenCaptureSettings = async (req, res) => {
  try {
    const orgId = normalizeId(
      req.user.organization?._id || req.user.organizationId || req.user.organization
    );
    const settings = await TimeTrackingSettings.findOneAndUpdate(
      {
        organization: orgId,
      },
      {
        $set: {
          screenCapture: req.body,
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
        ?.to(`organization:${orgId}`)
        .emit("tracking-settings-updated", settings);
    } catch {}

    return res.status(200).json({
      message: "Screen capture settings updated successfully.",
      screenCapture: settings.screenCapture,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to update screen capture settings.",
    });
  }
};
