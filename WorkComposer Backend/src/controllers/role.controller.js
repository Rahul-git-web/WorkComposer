import Role from "../models/role.model.js";
import User from "../models/user.model.js";
import { getIO } from "../socket/socket.js";
import {
  resolveEffectiveAuthContext,
  normalizeId,
} from "../security/effectiveAuthContext.js";
import { canManageRole } from "../security/policyEvaluator.js";
import { auditRoleUpdated } from "../utils/auditService.js";

export const getRoles = async (req, res) => {
  try {
    const roles = await Role.find({
      organization: req.user.organization,
      name: { $ne: "owner" },
    }).lean();

    const rolesWithCounts = await Promise.all(
      roles.map(async (role) => {
        const userCount = await User.countDocuments({
          organization: req.user.organization,
          roleRef: role._id,
        });

        const permissionCount =
          role.permissions.length +
          (role.reportAccess !== "none" ? 1 : 0) +
          (role.screenshotAccess !== "none" ? 1 : 0);

        return {
          ...role,
          userCount,
          permissionCount,
        };
      }),
    );

    res.json(rolesWithCounts);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to fetch roles",
    });
  }
};

export const updateRole = async (req, res) => {
  try {
    const { id } = req.params;

    const { permissions, reportAccess, screenshotAccess } = req.body;

    if (!req.user) {
      return res.status(401).json({
        message: "Not authorized, no token",
      });
    }

    const callerOrgId = normalizeId(
      req.user.organization?._id || req.user.organizationId || req.user.organization
    );
    if (!callerOrgId) {
      return res.status(403).json({
        message: "Access denied: Missing organization context.",
      });
    }

    const role = await Role.findOne({
      _id: id,
      organization: callerOrgId,
    });

    if (!role) {
      return res.status(404).json({
        message: "Role not found",
      });
    }

    // Resolve caller EffectiveAuthContext authoritatively from primary DB
    const callerRoleDoc = req.user.roleRef
      ? await Role.findById(normalizeId(req.user.roleRef))
      : null;
    const authContext = resolveEffectiveAuthContext(req.user, callerRoleDoc);

    const decision = canManageRole(authContext, role, permissions);
    if (!decision.allowed) {
      return res.status(403).json({
        message: decision.reason,
      });
    }

    if (permissions !== undefined) role.permissions = permissions;
    if (reportAccess !== undefined) role.reportAccess = reportAccess;
    if (screenshotAccess !== undefined) role.screenshotAccess = screenshotAccess;

    await role.save();

    await auditRoleUpdated({
      req,
      role,
      changes: { permissions, reportAccess, screenshotAccess },
    });

    try {
      getIO()
        ?.to(`organization:${callerOrgId}`)
        .emit("roles-updated", {
          roleId: normalizeId(role._id || role.id),
          role,
        });
    } catch {}

    res.json({
      message: "Role updated successfully",
      role,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to update role",
    });
  }
};

export const getRoleById = async (req, res) => {
  try {
    const role = await Role.findOne({
      _id: req.params.id,
      organization: req.user.organization,
    }).lean();

    if (!role) {
      return res.status(404).json({
        message: "Role not found",
      });
    }

    if (role.name.toLowerCase() === "owner") {
      return res.status(404).json({
        message: "Role not found",
      });
    }

    const userCount = await User.countDocuments({
      organization: req.user.organization,
      roleRef: role._id,
    });

    const permissionCount =
      role.permissions.length +
      (role.reportAccess !== "none" ? 1 : 0) +
      (role.screenshotAccess !== "none" ? 1 : 0);

    res.json({
      ...role,
      userCount,
      permissionCount,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Server error",
    });
  }
};
