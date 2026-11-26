import AppClassification from "../models/appClassification.model.js";
import { getIO } from "../socket/socket.js";
import { normalizeId } from "../security/effectiveAuthContext.js";
import { sendErrorResponse } from "../utils/sendErrorResponse.js";
import {
  VALID_PRODUCTIVITY_LEVELS,
  isAppClassificationCompoundUniqueError,
} from "../db/repositories/appClassification.repository.js";

export { VALID_PRODUCTIVITY_LEVELS };

export function isDuplicateAppClassificationError(err) {
  if (!err) return false;

  if (isAppClassificationCompoundUniqueError(err)) {
    return true;
  }

  // MongoDB duplicate key error (code 11000)
  if (err.code === 11000 || err.code === "11000") {
    if (err.keyPattern) {
      if (err.keyPattern._id && Object.keys(err.keyPattern).length === 1) {
        return false;
      }
      if (err.keyPattern.appName || (err.keyPattern.organization && err.keyPattern.appName)) {
        return true;
      }
    }
    const msg = String(err.message || "");
    if (msg.includes("index: _id_") && !msg.includes("appName")) {
      return false;
    }
    if (msg.includes("organization_1_appName_1") || msg.includes("appName") || msg.includes("app_name")) {
      return true;
    }
    return false;
  }

  return false;
}

export const getAppClassifications = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 10, 1);
    const skip = (page - 1) * limit;

    const search = (req.query.search || "").trim();
    const category = req.query.category || "all";

    const filter = {
      organization: req.user.organization,
    };

    if (search) {
      filter.appName = {
        $regex: search,
        $options: "i",
      };
    }

    if (category !== "all") {
      filter.productivity = category;
    }

    const [applications, total] = await Promise.all([
      AppClassification.find(filter)
        .sort({ appName: 1 })
        .skip(skip)
        .limit(limit),

      AppClassification.countDocuments(filter),
    ]);

    res.json({
      applications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to get app classifications", 500);
  }
};

export const createAppClassification = async (req, res) => {
  try {
    const {
      appName,
      productivity,
      preventBreakMode,
      disableIdleCalculation,
      excludedTeams,
      excludedUsers,
    } = req.body;

    const organization = req.user?.organization || req.user?.organizationId;
    if (!organization) {
      return res.status(401).json({
        message: "Unauthorized: Missing organization context",
      });
    }

    if (!appName || typeof appName !== "string" || !appName.trim()) {
      return res.status(400).json({
        message: "Application name is required",
      });
    }

    const trimmedAppName = appName.trim();
    const normalizedAppName = trimmedAppName.toLowerCase();

    let targetProductivity = "neutral";
    if (productivity !== undefined && productivity !== null && productivity !== "") {
      if (typeof productivity !== "string") {
        return res.status(400).json({
          message: "Invalid productivity level",
        });
      }
      const normalizedProd = productivity.trim().toLowerCase();
      if (!VALID_PRODUCTIVITY_LEVELS.has(normalizedProd)) {
        return res.status(400).json({
          message: `Invalid productivity level: ${productivity}`,
        });
      }
      targetProductivity = normalizedProd;
    }

    const existing = await AppClassification.findOne({
      organization,
      appName: normalizedAppName,
    });

    if (existing) {
      if (existing.productivity === targetProductivity) {
        return res.status(409).json({
          message: `${trimmedAppName} is already classified as ${targetProductivity}.`,
        });
      }

      const previous = existing.productivity;

      const orgId = normalizeId(
        req.user.organization?._id || req.user.organizationId || req.user.organization
      );
      const updated = await AppClassification.findOneAndUpdate(
        {
          _id: existing._id || existing.id,
          organization: orgId,
        },
        {
          productivity: targetProductivity,
          preventBreakMode: preventBreakMode !== undefined ? Boolean(preventBreakMode) : false,
          disableIdleCalculation: disableIdleCalculation !== undefined ? Boolean(disableIdleCalculation) : false,
          excludedTeams: Array.isArray(excludedTeams) ? excludedTeams : [],
          excludedUsers: Array.isArray(excludedUsers) ? excludedUsers : [],
        },
        { new: true }
      );

      try {
        getIO()?.to(`organization:${orgId}`).emit("tracking-settings-updated", {
          module: "appClassification",
          classification: updated || existing,
        });
      } catch {}

      return res.json({
        updated: true,
        message: `${trimmedAppName} moved from ${previous} to ${targetProductivity}.`,
        classification: updated || existing,
      });
    }

    try {
      const classification = await AppClassification.create({
        organization,
        appName: normalizedAppName,
        productivity: targetProductivity,
        preventBreakMode: Boolean(preventBreakMode),
        disableIdleCalculation: Boolean(disableIdleCalculation),
        excludedTeams: Array.isArray(excludedTeams) ? excludedTeams : [],
        excludedUsers: Array.isArray(excludedUsers) ? excludedUsers : [],
      });

      const orgId = normalizeId(
        req.user.organization?._id || req.user.organizationId || req.user.organization
      );
      try {
        getIO()?.to(`organization:${orgId}`).emit("tracking-settings-updated", {
          module: "appClassification",
          classification,
        });
      } catch {}

      return res.status(201).json(classification);
    } catch (createErr) {
      if (isDuplicateAppClassificationError(createErr)) {
        const concurrent = await AppClassification.findOne({
          organization,
          appName: normalizedAppName,
        });

        if (concurrent) {
          if (concurrent.productivity === targetProductivity) {
            return res.status(409).json({
              message: `${trimmedAppName} is already classified as ${targetProductivity}.`,
            });
          }

          const previous = concurrent.productivity;

          const updated = await AppClassification.findOneAndUpdate(
            {
              _id: concurrent._id || concurrent.id,
              organization,
            },
            {
              productivity: targetProductivity,
              preventBreakMode: preventBreakMode !== undefined ? Boolean(preventBreakMode) : false,
              disableIdleCalculation: disableIdleCalculation !== undefined ? Boolean(disableIdleCalculation) : false,
              excludedTeams: Array.isArray(excludedTeams) ? excludedTeams : [],
              excludedUsers: Array.isArray(excludedUsers) ? excludedUsers : [],
            },
            { new: true }
          );

          const orgId = normalizeId(
            req.user.organization?._id || req.user.organizationId || req.user.organization
          );
          try {
            getIO()?.to(`organization:${orgId}`).emit("tracking-settings-updated", {
              module: "appClassification",
              classification: updated || concurrent,
            });
          } catch {}

          return res.json({
            updated: true,
            message: `${trimmedAppName} moved from ${previous} to ${targetProductivity}.`,
            classification: updated || concurrent,
          });
        }
      }

      // Do not swallow unrelated Prisma errors, primary-key collisions, or database errors
      throw createErr;
    }
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to create app classification", 500);
  }
};

export const updateAppClassification = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      appName,
      productivity,
      preventBreakMode,
      disableIdleCalculation,
      excludedTeams,
      excludedUsers,
    } = req.body;

    const orgId = normalizeId(
      req.user.organization?._id || req.user.organizationId || req.user.organization
    );

    const classification = await AppClassification.findOne({
      _id: id,
      organization: orgId,
    });

    if (!classification) {
      return res.status(404).json({
        message: "Application not found",
      });
    }

    if (appName) {
      classification.appName = appName.trim();
    }

    if (productivity) {
      classification.productivity = productivity;
    }

    if (preventBreakMode !== undefined) {
      classification.preventBreakMode = preventBreakMode;
    }

    if (disableIdleCalculation !== undefined) {
      classification.disableIdleCalculation = disableIdleCalculation;
    }

    if (excludedTeams !== undefined) {
      classification.excludedTeams = excludedTeams;
    }

    if (excludedUsers !== undefined) {
      classification.excludedUsers = excludedUsers;
    }

    await classification.save();

    try {
      getIO()?.to(`organization:${orgId}`).emit("tracking-settings-updated", {
        module: "appClassification",
        classification,
      });
    } catch {}

    res.json(classification);
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to update app classification", 500);
  }
};

export const deleteAppClassification = async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = normalizeId(
      req.user.organization?._id || req.user.organizationId || req.user.organization
    );

    const classification = await AppClassification.findOneAndDelete({
      _id: id,
      organization: orgId,
    });

    if (!classification) {
      return res.status(404).json({
        message: "Application not found",
      });
    }

    try {
      getIO()?.to(`organization:${orgId}`).emit("tracking-settings-updated", {
        module: "appClassification",
        deletedId: id,
      });
    } catch {}

    res.json({
      success: true,
      message: "Application deleted successfully",
    });
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to delete app classification", 500);
  }
};

export const getClassificationStats = async (req, res) => {
  try {
    const classifications = await AppClassification.find({
      organization: req.user.organization,
    });

    const stats = {
      productive: 0,
      neutral: 0,
      unproductive: 0,
      blacklisted: 0,
      total: classifications.length,
    };

    classifications.forEach((item) => {
      if (item.productivity === "productive") {
        stats.productive++;
      } else if (item.productivity === "neutral") {
        stats.neutral++;
      } else if (item.productivity === "unproductive") {
        stats.unproductive++;
      }
    });

    res.json(stats);
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to get classification statistics", 500);
  }
};

export const checkBreakMode = async (req, res) => {
  try {
    const normalizedAppName = req.query.appName?.trim().toLowerCase();

    const config = await AppClassification.findOne({
      organization: req.user.organization,
      appName: normalizedAppName,
    });

    if (!config) {
      return res.json({
        preventBreakMode: false,
        disableIdleCalculation: false,
      });
    }

    const callerUserId = normalizeId(req.user?._id || req.user?.id);
    const callerTeamId = normalizeId(
      req.user?.teamId || req.user?.team?._id || req.user?.team?.id || req.user?.team
    );
    const excludedUsers = (config.excludedUsers || []).map((id) => String(id));
    const excludedTeams = (config.excludedTeams || []).map((id) => String(id));

    if (
      (callerUserId && excludedUsers.includes(callerUserId)) ||
      (callerTeamId && excludedTeams.includes(callerTeamId))
    ) {
      return res.json({
        preventBreakMode: false,
        disableIdleCalculation: false,
      });
    }

    return res.json({
      preventBreakMode: config.preventBreakMode || false,
      disableIdleCalculation: config.disableIdleCalculation || false,
    });
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to check app configuration", 500);
  }
};
