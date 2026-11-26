import cloudinary from "../config/cloudinary.js";
import Screenshot from "../models/screenshot.model.js";
import fs from "fs";
import archiver from "archiver";
import axios from "axios";
import { getAvatarUrl } from "../utils/avatar.js";
import User from "../models/user.model.js";
import Role from "../models/role.model.js";
import {
  getUserTimezone,
  resolveUserTimezone,
  getZonedDayRange,
  getDateRangeUTC,
} from "../utils/timezone.js";
import { userRepository } from "../db/repositories/user.repository.js";
import { screenshotRepository } from "../db/repositories/screenshot.repository.js";
import { resolveEffectiveAuthContext, normalizeId } from "../security/effectiveAuthContext.js";
import { canViewScreenshot } from "../security/policyEvaluator.js";
import { ACCESS_SCOPES } from "../security/policyTypes.js";
import { projectRepository } from "../db/repositories/project.repository.js";
import { taskRepository } from "../db/repositories/task.repository.js";
import { timeTrackingSettingsRepository } from "../db/repositories/timeTrackingSettings.repository.js";
import resolveTrackingSettings from "../utils/resolveTrackingSettings.js";

// UPLOAD SCREENSHOTS
export const uploadScreenshot = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "No image uploaded",
      });
    }

    const callerOrgId = normalizeId(req.user.organizationId || req.user.organization);
    const callerUserId = normalizeId(req.user._id || req.user.id);

    if (callerOrgId && callerUserId) {
      const [orgSettings, callerUser] = await Promise.all([
        timeTrackingSettingsRepository.findOne({ organization: callerOrgId }),
        userRepository.findById(callerUserId),
      ]);
      const effective = resolveTrackingSettings(orgSettings, callerUser || req.user);
      if (effective?.screenCapture?.enabled === false) {
        try {
          if (req.file.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
        } catch {}
        return res.status(200).json({
          success: true,
          skipped: true,
          reason: "screen_capture_disabled",
        });
      }
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "workcomposer/screenshots",
    });

    let resolvedProjectId = null;
    if (req.body.project) {
      const proj = await projectRepository.findProjectByIdAndOrganization(req.body.project, callerOrgId);
      if (proj) {
        resolvedProjectId = normalizeId(proj._id || proj.id);
      }
    }

    let resolvedTaskId = null;
    if (req.body.task) {
      const t = await taskRepository.findOne({ _id: req.body.task, organization: callerOrgId });
      if (t) {
        resolvedTaskId = normalizeId(t._id || t.id);
      }
    }

    const screenshot = await screenshotRepository.create({
      userId: callerUserId,
      user: callerUserId,
      projectId: resolvedProjectId || null,
      project: resolvedProjectId || null,
      taskId: resolvedTaskId || null,
      task: resolvedTaskId || null,
      imageUrl: result.secure_url,
      publicId: result.public_id,
      appName: req.body.appName || "",
      windowTitle: req.body.windowTitle || "",
      keyPresses: Number(req.body.keyPresses || 0),
      mouseClicks: Number(req.body.mouseClicks || 0),
      mouseMoves: Number(req.body.mouseMoves || 0),
      activityScore: Number(req.body.activityScore || 0),
      capturedAt: req.body.capturedAt && !isNaN(new Date(req.body.capturedAt).getTime())
        ? new Date(req.body.capturedAt)
        : new Date(),
    });

    fs.unlinkSync(req.file.path);

    res.status(201).json({
      success: true,
      screenshot,
    });
  } catch (err) {
    console.error("UPLOAD SCREENSHOT ERROR:", err);

    res.status(500).json({
      message: "Failed to upload screenshot",
      error: "Failed to upload screenshot",
    });
  }
};

// GET SCREENSHOTS
export const getScreenshots = async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.query;

    const callerOrgId = normalizeId(req.user.organizationId || req.user.organization);
    const callerUserId = normalizeId(req.user._id || req.user.id);

    if (!callerOrgId || !callerUserId) {
      return res.status(401).json({
        message: "Not authorized",
      });
    }

    const callerRoleDoc = req.user.roleRef ? await Role.findById(req.user.roleRef) : null;
    const authContext = resolveEffectiveAuthContext(req.user, callerRoleDoc);
    const screenshotAccess = authContext.effectiveScreenshotAccess || ACCESS_SCOPES.NONE;

    if (screenshotAccess === ACCESS_SCOPES.NONE || screenshotAccess === "none") {
      return res.status(403).json({
        message: "Permission denied",
      });
    }

    let allowedUserIds = [];

    if (screenshotAccess === ACCESS_SCOPES.OWN || screenshotAccess === "own") {
      allowedUserIds = [callerUserId];
    } else if (screenshotAccess === ACCESS_SCOPES.MANAGED || screenshotAccess === "managed") {
      const managedUsers = await userRepository.find({
        organizationId: callerOrgId,
        managerId: callerUserId,
      });

      const managedIds = managedUsers.map((u) => normalizeId(u._id || u.id)).filter(Boolean);
      allowedUserIds = [callerUserId, ...managedIds];
    } else if (screenshotAccess === ACCESS_SCOPES.ALL || screenshotAccess === "all") {
      const orgUsers = await userRepository.find({
        organizationId: callerOrgId,
      });

      allowedUserIds = orgUsers.map((u) => normalizeId(u._id || u.id)).filter(Boolean);
    }

    const query = {};
    let targetTimezone;

    // Narrowing by client-supplied userId (filters can only narrow, never widen)
    if (userId) {
      const targetId = normalizeId(userId);
      const allowedSet = new Set(allowedUserIds.map((id) => id.toString()));
      if (!allowedSet.has(targetId)) {
        return res.status(403).json({
          message: "Permission denied",
        });
      }
      query.userId = targetId;

      const targetUser = await userRepository.findUserByIdAndOrganization(targetId, callerOrgId);
      targetTimezone = resolveUserTimezone(targetUser, req);
    } else {
      query.userId = { in: allowedUserIds };
      targetTimezone = resolveUserTimezone(req.user, req);
    }

    if (startDate && endDate) {
      const startRange = getZonedDayRange(startDate, targetTimezone).start;
      const endRange = getZonedDayRange(endDate, targetTimezone).end;
      query.capturedAt = {
        gte: startRange,
        lt: endRange,
      };
    }

    const screenshots = await screenshotRepository.find(query, {
      populate: "user",
      sort: { capturedAt: "desc" },
    });

    const formattedScreenshots = screenshots.map((shot) => {
      const baseObj = typeof shot.toObject === "function" ? shot.toObject() : { ...shot };
      return {
        ...baseObj,
        user: shot.user
          ? {
              ...(typeof shot.user.toObject === "function" ? shot.user.toObject() : shot.user),
              avatar: getAvatarUrl(shot.user.avatar),
            }
          : null,
      };
    });

    res.status(200).json({
      success: true,
      screenshots: formattedScreenshots,
    });
  } catch (err) {
    console.error("GET SCREENSHOTS ERROR:", err);
    res.status(500).json({
      message: "Failed to fetch screenshots",
      error: "Failed to fetch screenshots",
    });
  }
};

// GET USER SCREENSHOT
export const getUserScreenshots = async (req, res) => {
  try {
    const { userId } = req.params;
    const { date } = req.query;

    const callerOrgId = normalizeId(req.user.organizationId || req.user.organization);
    const callerUserId = normalizeId(req.user._id || req.user.id);
    const targetUserId = normalizeId(userId);

    if (!callerOrgId || !callerUserId || !targetUserId) {
      return res.status(400).json({
        message: "Invalid user identifier",
      });
    }

    const callerRoleDoc = req.user.roleRef ? await Role.findById(req.user.roleRef) : null;
    const authContext = resolveEffectiveAuthContext(req.user, callerRoleDoc);
    const screenshotAccess = authContext.effectiveScreenshotAccess || ACCESS_SCOPES.NONE;

    if (screenshotAccess === ACCESS_SCOPES.NONE || screenshotAccess === "none") {
      return res.status(403).json({
        message: "Permission denied",
      });
    }

    // Tenant boundary: Target user must exist strictly within caller's organization
    const targetUser = await userRepository.findUserByIdAndOrganization(targetUserId, callerOrgId);
    if (!targetUser) {
      // 404 Not Found: zero existence disclosure across tenant boundary
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Policy Decision
    const decision = canViewScreenshot(authContext, targetUser);
    if (!decision.allowed) {
      return res.status(403).json({
        message: "Permission denied",
      });
    }

    let query = {
      userId: targetUserId,
    };

    if (date) {
      const timezone = resolveUserTimezone(targetUser, req);
      const { start, end } = getZonedDayRange(date, timezone);
      query.capturedAt = {
        gte: start,
        lt: end,
      };
    }

    const screenshots = await screenshotRepository.find(query, {
      sort: { capturedAt: "desc" },
      limit: 3,
    });

    res.status(200).json({
      success: true,
      screenshots,
    });
  } catch (err) {
    console.error("GET USER SCREENSHOTS ERROR:", err);
    res.status(500).json({
      message: "Failed to fetch user screenshots",
      error: "Failed to fetch user screenshots",
    });
  }
};

// EXPORT ZIP
export const exportScreenshotsZip = async (req, res) => {
  try {
    const { startDate, endDate, userIds } = req.query;

    const callerOrgId = normalizeId(req.user.organizationId || req.user.organization);
    const callerUserId = normalizeId(req.user._id || req.user.id);

    if (!callerOrgId || !callerUserId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const callerRoleDoc = req.user.roleRef ? await Role.findById(req.user.roleRef) : null;
    const authContext = resolveEffectiveAuthContext(req.user, callerRoleDoc);
    const screenshotAccess = authContext.effectiveScreenshotAccess || ACCESS_SCOPES.NONE;

    if (screenshotAccess === ACCESS_SCOPES.NONE || screenshotAccess === "none") {
      return res.status(403).json({
        message: "Permission denied",
      });
    }

    let allowedUserIds = [];

    if (screenshotAccess === ACCESS_SCOPES.OWN || screenshotAccess === "own") {
      allowedUserIds = [callerUserId];
    } else if (screenshotAccess === ACCESS_SCOPES.MANAGED || screenshotAccess === "managed") {
      const managedUsers = await userRepository.find({
        organizationId: callerOrgId,
        managerId: callerUserId,
      });
      const managedIds = managedUsers.map((u) => normalizeId(u._id || u.id)).filter(Boolean);
      allowedUserIds = [callerUserId, ...managedIds];
    } else if (screenshotAccess === ACCESS_SCOPES.ALL || screenshotAccess === "all") {
      const orgUsers = await userRepository.find({
        organizationId: callerOrgId,
      });
      allowedUserIds = orgUsers.map((u) => normalizeId(u._id || u.id)).filter(Boolean);
    }

    let targetUserIds = allowedUserIds;

    /*
     * Apply explicitly selected users (narrowing only).
     */
    if (userIds) {
      const requestedUserIds = userIds
        .split(",")
        .map((id) => normalizeId(id))
        .filter(Boolean);

      if (requestedUserIds.length > 0) {
        const allowedSet = new Set(allowedUserIds.map((id) => id.toString()));
        const permittedSelectedIds = requestedUserIds.filter((id) =>
          allowedSet.has(id),
        );

        if (permittedSelectedIds.length === 0) {
          return res.status(403).json({
            message:
              "You do not have permission to export screenshots for the selected users.",
          });
        }

        targetUserIds = permittedSelectedIds;
      }
    }

    let exportTimezone = resolveUserTimezone(req.user, req);
    if (targetUserIds.length === 1) {
      const singleUser = await userRepository.findUserByIdAndOrganization(targetUserIds[0], callerOrgId);
      if (singleUser) {
        exportTimezone = resolveUserTimezone(singleUser, req);
      }
    }

    const query = {
      userId: { in: targetUserIds },
    };

    if (startDate && endDate) {
      const startRange = getZonedDayRange(startDate, exportTimezone).start;
      const endRange = getZonedDayRange(endDate, exportTimezone).end;
      query.capturedAt = {
        gte: startRange,
        lt: endRange,
      };
    }

    const screenshots = await screenshotRepository.find(query, {
      populate: "user",
      sort: { capturedAt: "asc" },
    });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=screenshots.zip",
    );

    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    archive.on("error", (err) => {
      console.error("ARCHIVE ERROR:", err);
      if (!res.headersSent) {
        res.status(500).end();
      } else {
        res.end();
      }
    });

    archive.pipe(res);

    for (const shot of screenshots) {
      try {
        if (!shot.imageUrl) {
          continue;
        }

        const response = await axios.get(shot.imageUrl, {
          responseType: "stream",
        });

        const firstName = shot.user?.firstName || "Unknown";
        const lastName = shot.user?.lastName || "User";

        const fileName = `${firstName}_${lastName}/${shot._id || shot.id}.png`;

        archive.append(response.data, {
          name: fileName,
        });
      } catch (err) {
        if (err.response?.status === 404) {
          console.warn("SCREENSHOT NO LONGER EXISTS:", shot._id || shot.id);
        } else {
          console.error(
            "FAILED SCREENSHOT:",
            shot._id || shot.id,
            err.response?.status,
            err.message,
          );
        }
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error("SCREENSHOT ZIP EXPORT ERROR:", err);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Export failed",
      });
    }
    res.end();
  }
};
