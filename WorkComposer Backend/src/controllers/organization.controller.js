import fs from "fs";
import cloudinary from "../config/cloudinary.js";
import Activity from "../models/activity.model.js";
import AppClassification from "../models/appClassification.model.js";
import AppUsage from "../models/appUsage.model.js";
import Attendance from "../models/attendance.model.js";
import EmailChange from "../models/emailChange.model.js";
import Invite from "../models/invite.model.js";
import Organization from "../models/organization.model.js";
import Project from "../models/project.model.js";
import ProjectTracking from "../models/projectTracking.model.js";
import Report from "../models/report.model.js";
import Screenshot from "../models/screenshot.model.js";
import Session from "../models/session.model.js";
import Task from "../models/task.model.js";
import Team from "../models/team.model.js";
import Timer from "../models/timer.model.js";
import UsageLog from "../models/usageLog.model.js";
import User from "../models/user.model.js";
import { getAvatarUrl } from "../utils/avatar.js";
import { getIO } from "../socket/socket.js";
import path from "path";
import { logAudit } from "../utils/logAudit.js";
import {
  auditOrgUpdated,
  auditOrgDeleted,
  audit2FASettingsUpdated,
  auditAppUpdateSettingsUpdated,
  auditEmailReportSettingsUpdated,
} from "../utils/auditService.js";
import { resolveEffectiveAuthContext, normalizeId } from "../security/effectiveAuthContext.js";
import { canAccessOrganizationNotifications } from "../security/policyEvaluator.js";
import { DECISION_CODES } from "../security/policyTypes.js";
import { runTransaction } from "../db/transaction.js";

const EMAIL_DAY_MAP = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

function normalizeDailyWeekDays(days) {
  if (!Array.isArray(days)) return days;
  const normalized = [];
  for (const d of days) {
    let val = null;
    if (typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6) {
      val = d;
    } else if (typeof d === "string") {
      const trimmed = d.trim().toLowerCase();
      if (/^[0-6]$/.test(trimmed)) {
        val = Number(trimmed);
      } else if (EMAIL_DAY_MAP[trimmed] !== undefined) {
        val = EMAIL_DAY_MAP[trimmed];
      }
    }
    if (val !== null && !normalized.includes(val)) {
      normalized.push(val);
    }
  }
  return normalized;
}

function getCallerOrgId(req) {
  return normalizeId(
    req.user?.organizationId ||
      req.user?.organization?._id ||
      req.user?.organization?.id ||
      req.user?.organization,
  );
}

function emitOrgEvent(orgId, event, payload) {
  if (!orgId) return;
  try {
    getIO()?.to(`organization:${orgId}`).emit(event, payload);
  } catch {}
}

export const getOrganization = async (req, res) => {
  try {
    const organization = await Organization.findById(req.user.organization);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    res.json({
      ...organization.toObject(),
      logo: getAvatarUrl(organization.logo),
    });
  } catch (err) {
    console.error("GET ORGANIZATION ERROR:", err);
    res.status(500).json({
      message: "Failed to get organization",
      error: "Failed to get organization",
    });
  }
};

export const uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "No image uploaded",
      });
    }

    const organization = await Organization.findById(req.user.organization);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    // Delete previous logo
    if (organization.logo) {
      const oldLogoPath = path.join(process.cwd(), organization.logo);

      if (fs.existsSync(oldLogoPath)) {
        fs.unlinkSync(oldLogoPath);
      }
    }

    organization.logo = req.file.path.replace(/\\/g, "/");

    await organization.save();

    const orgId = getCallerOrgId(req);
    emitOrgEvent(orgId, "organization-updated", {
      organizationId: orgId,
      logo: getAvatarUrl(organization.logo),
    });

    res.status(200).json({
      message: "Logo uploaded successfully",
      logo: `${process.env.BACKEND_URL}/${organization.logo}`,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to upload logo",
    });
  }
};

export const updateOrganization = async (req, res) => {
  try {
    const { name, timezone } = req.body;
    const orgId = getCallerOrgId(req);

    const organization = await Organization.findByIdAndUpdate(
      orgId,
      {
        name,
        timezone,
      },
      {
        new: true,
        runValidators: true,
      },
    );

    emitOrgEvent(orgId, "organization-updated", organization);
    emitOrgEvent(orgId, "tracking-settings-updated", {
      module: "organization",
      timezone: organization?.timezone,
      name: organization?.name,
    });

    res.status(200).json(organization);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to update organization",
    });
  }
};

export const deleteOrganization = async (req, res) => {
  if (req.user.role !== "owner") {
    return res.status(403).json({
      success: false,
      message: "Only organization owner can delete organization",
    });
  }

  const organizationId = req.user.organization;
  let screenshots = [];
  let usersWithAvatars = [];
  let organizationLogo = null;

  try {
    const orgFound = await runTransaction(async () => {
      // Fetch organization before deleting
      const organization = await Organization.findById(organizationId);

      if (!organization) {
        return false;
      }
      organizationLogo = organization.logo || null;

      // Fetch users (keep avatars for filesystem cleanup)
      usersWithAvatars = await User.find({
        organization: organizationId,
      }).select("_id avatar");

      const userIds = usersWithAvatars.map((user) => user._id);

      // Fetch screenshot publicIds before deleting
      screenshots = await Screenshot.find({
        user: { $in: userIds },
      }).select("publicId");

      // -----------------------
      // USER RELATED DATA
      // -----------------------

      await Activity.deleteMany({
        user: { $in: userIds },
      });

      await AppUsage.deleteMany({
        user: { $in: userIds },
      });

      await Screenshot.deleteMany({
        user: { $in: userIds },
      });

      await Timer.deleteMany({
        user: { $in: userIds },
      });

      await UsageLog.deleteMany({
        user: { $in: userIds },
      });

      await Report.deleteMany({
        user: { $in: userIds },
      });

      await ProjectTracking.deleteMany({
        user: { $in: userIds },
      });

      await EmailChange.deleteMany({
        user: { $in: userIds },
      });

      await Attendance.deleteMany({
        userId: { $in: userIds },
      });

      await Session.deleteMany({
        userId: { $in: userIds },
      });

      // -----------------------
      // ORGANIZATION DATA
      // -----------------------

      await Task.deleteMany({
        organization: organizationId,
      });

      await Project.deleteMany({
        organization: organizationId,
      });

      await Team.deleteMany({
        organization: organizationId,
      });

      await AppClassification.deleteMany({
        organization: organizationId,
      });

      await Invite.deleteMany({
        organization: organizationId,
      });

      // Clear refresh tokens
      await User.updateMany(
        {
          organization: organizationId,
        },
        {
          $set: {
            refreshToken: null,
          },
        },
      );

      // Delete users
      await User.deleteMany({
        organization: organizationId,
      });

      // Delete organization
      await Organization.findByIdAndDelete(organizationId);

      return true;
    });

    if (!orgFound) {
      return res.status(404).json({
        success: false,
        message: "Organization not found",
      });
    }

    // -----------------------
    // CLEANUP FILES (AFTER COMMIT)
    // -----------------------

    // Delete Cloudinary screenshots
    for (const shot of screenshots) {
      if (!shot.publicId) continue;

      try {
        await cloudinary.uploader.destroy(shot.publicId);
      } catch (err) {
        console.error(
          `Failed to delete Cloudinary screenshot: ${shot.publicId}`,
          err,
        );
      }
    }

    // Delete organization logo
    if (organizationLogo) {
      const logoPath = path.join(process.cwd(), organizationLogo);

      if (fs.existsSync(logoPath)) {
        try {
          fs.unlinkSync(logoPath);
        } catch (err) {
          console.error("Failed to delete organization logo file:", err);
        }
      }
    }

    // Delete user avatars
    for (const user of usersWithAvatars) {
      if (!user.avatar) continue;

      const avatarPath = path.join(process.cwd(), user.avatar);

      if (fs.existsSync(avatarPath)) {
        try {
          fs.unlinkSync(avatarPath);
        } catch (err) {
          console.error(`Failed to delete user avatar file: ${user.avatar}`, err);
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: "Organization deleted successfully.",
    });
  } catch (err) {
    console.error("DELETE ORGANIZATION ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to delete organization",
      error: "Failed to delete organization",
    });
  }
};

export const getTwoFactorSettings = async (req, res) => {
  try {
    const organization = await Organization.findById(req.user.organization);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    res.status(200).json(organization.twoFactor);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to fetch two factor settings",
    });
  }
};

export const updateTwoFactorSettings = async (req, res) => {
  try {
    const { role, enabled } = req.body;

    const allowedRoles = ["owner", "admin", "manager", "user"];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        message: "Invalid role",
      });
    }

    const organization = await Organization.findById(req.user.organization);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    organization.twoFactor[role] = enabled;

    await organization.save();

    const orgId = getCallerOrgId(req);
    emitOrgEvent(orgId, "organization-updated", {
      organizationId: orgId,
      twoFactor: organization.twoFactor,
    });

    res.status(200).json({
      message: "Two factor settings updated successfully",
      twoFactor: organization.twoFactor,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to update two factor settings",
    });
  }
};

export const getAppUpdateSettings = async (req, res) => {
  try {
    const organization = await Organization.findById(req.user.organization);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    if (!organization.appUpdates) {
      organization.appUpdates = {
        automaticUpdates: true,
        forceUpdates: false,
        desktopReleaseEmails: false,
      };

      await organization.save();

      // await logAudit({
      //   organization: req.user.organization,
      //   performedBy: req.user._id,
      //   category: "Settings",
      //   activity: `Updated ${setting}`,
      //   details: {
      //     setting,
      //     enabled,
      //   },
      //   ipAddress: req.ip,
      //   platform: req.headers["user-agent"],
      // });
    }

    return res.status(200).json(organization.appUpdates);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to fetch app update settings",
    });
  }
};

export const updateAppUpdateSettings = async (req, res) => {
  try {
    const { setting, enabled } = req.body;

    const allowedSettings = [
      "automaticUpdates",
      "forceUpdates",
      "desktopReleaseEmails",
    ];

    if (!allowedSettings.includes(setting)) {
      return res.status(400).json({
        message: "Invalid setting",
      });
    }

    const organization = await Organization.findById(req.user.organization);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    if (!organization.appUpdates) {
      organization.appUpdates = {
        automaticUpdates: true,
        forceUpdates: false,
        desktopReleaseEmails: false,
      };
    }

    organization.appUpdates[setting] = enabled;

    await organization.save();

    const orgId = getCallerOrgId(req);
    emitOrgEvent(orgId, "organization-updated", {
      organizationId: orgId,
      appUpdates: organization.appUpdates,
    });
    emitOrgEvent(orgId, "tracking-settings-updated", {
      module: "appUpdate",
      appUpdates: organization.appUpdates,
    });

    res.status(200).json({
      message: "App update settings updated successfully",
      appUpdates: organization.appUpdates,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to update app update settings",
    });
  }
};

export const getEmailReportSettings = async (req, res) => {
  try {
    const organization = await Organization.findById(req.user.organization);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    if (!organization.emailReports) {
      organization.emailReports = {
        weeklyTrackingReports: false,
        dailyTrackingReports: false,

        dailyWarningEmails: false,
        dailyBasedOnShift: true,
        dailyMinimumTime: {
          hours: 4,
          minutes: 0,
        },
        dailyWeekDays: [1, 2, 3, 4, 5],

        weeklyWarningEmails: false,
        weeklyBasedOnShift: true,
        weeklyMinimumTime: {
          hours: 4,
          minutes: 0,
        },

        idlePercentageEnabled: false,
        idlePercentage: 30,
      };

      await organization.save();
    } else if (
      Array.isArray(organization.emailReports.dailyWeekDays) &&
      organization.emailReports.dailyWeekDays.some((d) => typeof d === "string")
    ) {
      organization.emailReports.dailyWeekDays = normalizeDailyWeekDays(
        organization.emailReports.dailyWeekDays,
      );
      await organization.save();
    }

    return res.status(200).json(organization.emailReports);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to fetch email report settings",
    });
  }
};

export const updateEmailReportSettings = async (req, res) => {
  try {
    const { setting, value } = req.body;

    const allowedSettings = [
      "weeklyTrackingReports",
      "dailyTrackingReports",

      "dailyWarningEmails",
      "dailyBasedOnShift",
      "dailyMinimumTime",
      "dailyWeekDays",

      "weeklyWarningEmails",
      "weeklyBasedOnShift",
      "weeklyMinimumTime",

      "idlePercentageEnabled",
      "idlePercentage",
    ];

    if (!allowedSettings.includes(setting)) {
      return res.status(400).json({
        message: "Invalid setting",
      });
    }

    const organization = await Organization.findById(req.user.organization);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    if (!organization.emailReports) {
      organization.emailReports = {
        weeklyTrackingReports: false,
        dailyTrackingReports: false,
        dailyWarningEmails: false,
        weeklyWarningEmails: false,
        idlePercentageEnabled: false,
        idlePercentage: 30,
      };
    }

    organization.emailReports[setting] =
      setting === "dailyWeekDays" ? normalizeDailyWeekDays(value) : value;

    await organization.save();

    const orgId = getCallerOrgId(req);
    emitOrgEvent(orgId, "organization-updated", {
      organizationId: orgId,
      emailReports: organization.emailReports,
    });
    emitOrgEvent(orgId, "tracking-settings-updated", {
      module: "emailReports",
      emailReports: organization.emailReports,
    });

    return res.status(200).json({
      message: "Email report settings updated successfully",
      emailReports: organization.emailReports,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Failed to update email report settings",
    });
  }
};

export const getTaskManagementSettings = async (req, res) => {
  try {
    const organization = await Organization.findById(req.user.organization);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    if (!organization.taskManagement) {
      organization.taskManagement = {
        notifyTaskAssignedEmail: true,
      };

      await organization.save();
    }

    return res.status(200).json(organization.taskManagement);
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Failed to fetch task management settings",
    });
  }
};

export const updateTaskManagementSettings = async (req, res) => {
  try {
    const { setting, value } = req.body;

    const allowedSettings = ["notifyTaskAssignedEmail"];

    if (!allowedSettings.includes(setting)) {
      return res.status(400).json({
        message: "Invalid setting",
      });
    }

    const organization = await Organization.findById(req.user.organization);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    if (!organization.taskManagement) {
      organization.taskManagement = {
        notifyTaskAssignedEmail: true,
      };
    }

    organization.taskManagement[setting] = value;

    await organization.save();

    const orgId = getCallerOrgId(req);
    emitOrgEvent(orgId, "organization-updated", {
      organizationId: orgId,
      taskManagement: organization.taskManagement,
    });

    return res.status(200).json({
      message: "Task management settings updated successfully",
      taskManagement: organization.taskManagement,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Failed to update task management settings",
    });
  }
};

export const getOrganizationNotifications = async (req, res) => {
  try {
    const callerOrgId = normalizeId(req.user?.organizationId || req.user?.organization?._id || req.user?.organization?.id || req.user?.organization);
    const explicitTargetOrgId = req.params?.organizationId || req.query?.organizationId || req.body?.organizationId;
    const targetOrgId = explicitTargetOrgId ? normalizeId(explicitTargetOrgId) : callerOrgId;

    let roleDoc = null;
    if (req.user?.roleRef) {
      try {
        const { prisma } = await import("../config/prisma.js");
        roleDoc = await prisma.role.findUnique({ where: { id: req.user.roleRef } });
      } catch (e) {
        // Fallback
      }
    }

    const authContext = resolveEffectiveAuthContext(req.user, roleDoc);
    const decision = canAccessOrganizationNotifications(authContext, targetOrgId, "view");

    if (!decision.allowed) {
      if (decision.code === DECISION_CODES.TENANT_MISMATCH) {
        return res.status(404).json({ message: "Organization not found." });
      }
      return res.status(403).json({ message: `Forbidden: ${decision.message}` });
    }

    const organization = await Organization.findById(callerOrgId);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found.",
      });
    }

    return res.status(200).json({
      notifications: organization.notifications,
    });
  } catch (error) {
    console.error(
      "GET ORGANIZATION NOTIFICATIONS ERROR:",
      error,
    );

    return res.status(500).json({
      message: "Failed to load notification settings.",
    });
  }
};

export const updateOrganizationNotifications = async (req, res) => {
  try {
    const callerOrgId = normalizeId(req.user?.organizationId || req.user?.organization?._id || req.user?.organization?.id || req.user?.organization);
    const explicitTargetOrgId = req.params?.organizationId || req.query?.organizationId || req.body?.organizationId;
    const targetOrgId = explicitTargetOrgId ? normalizeId(explicitTargetOrgId) : callerOrgId;

    let roleDoc = null;
    if (req.user?.roleRef) {
      try {
        const { prisma } = await import("../config/prisma.js");
        roleDoc = await prisma.role.findUnique({ where: { id: req.user.roleRef } });
      } catch (e) {
        // Fallback
      }
    }

    const authContext = resolveEffectiveAuthContext(req.user, roleDoc);
    const decision = canAccessOrganizationNotifications(authContext, targetOrgId, "mutate");

    if (!decision.allowed) {
      if (decision.code === DECISION_CODES.TENANT_MISMATCH) {
        return res.status(404).json({ message: "Organization not found." });
      }
      return res.status(403).json({ message: `Forbidden: ${decision.message}` });
    }

    const rawNotifications = (req.body && typeof req.body.notifications === "object" && req.body.notifications !== null)
      ? req.body.notifications
      : req.body;

    if (!rawNotifications || typeof rawNotifications !== "object") {
      return res.status(400).json({
        message: "Invalid notification settings.",
      });
    }

    const allowedKeys = [
      "shiftStarted",
      "shiftEndingSoon",
      "breakStarted",
      "breakEnded",
      "dailyTargetReached",
      "overtimeStarted",
    ];

    const sanitizedUpdates = {};
    for (const key of allowedKeys) {
      if (typeof rawNotifications[key] === "boolean") {
        sanitizedUpdates[key] = rawNotifications[key];
      }
    }

    if (Object.keys(sanitizedUpdates).length === 0) {
      return res.status(400).json({
        message: "Invalid notification settings.",
      });
    }

    const organization = await Organization.findById(callerOrgId);
    if (!organization) {
      return res.status(404).json({
        message: "Organization not found.",
      });
    }

    const currentNotifications = organization.notifications || {
      shiftStarted: true,
      shiftEndingSoon: true,
      breakStarted: true,
      breakEnded: true,
      dailyTargetReached: true,
      overtimeStarted: true,
    };

    const updatedNotifications = {
      ...currentNotifications,
      ...sanitizedUpdates,
    };

    const updatedOrg = await Organization.findByIdAndUpdate(
      callerOrgId,
      { notifications: updatedNotifications },
      {
        new: true,
        runValidators: true,
      },
    );

    const savedNotifications = updatedOrg?.notifications || updatedNotifications;
    emitOrgEvent(callerOrgId, "organization-updated", {
      organizationId: callerOrgId,
      notifications: savedNotifications,
    });
    emitOrgEvent(callerOrgId, "tracking-settings-updated", {
      module: "notifications",
      notifications: savedNotifications,
    });

    return res.status(200).json({
      message: "Notification settings updated.",
      notifications: updatedOrg?.notifications || updatedNotifications,
    });
  } catch (error) {
    console.error(
      "UPDATE ORGANIZATION NOTIFICATIONS ERROR:",
      error,
    );

    return res.status(500).json({
      message: "Failed to update notification settings.",
    });
  }
};
