import ApiKey from "../models/apiKey.model.js";
import User from "../models/user.model.js";
import Role from "../models/role.model.js";
import { hashApiKey } from "../utils/hashApiKey.js";
import {
  resolveEffectiveAuthContext,
  normalizeId,
} from "../security/effectiveAuthContext.js";
import { CONFLICT_STATES } from "../security/policyTypes.js";

export const apiKeyAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "API key is required.",
      });
    }

    const apiKey = authHeader.split(" ")[1];
    if (!apiKey) {
      return res.status(401).json({
        message: "API key is required.",
      });
    }

    const hashedKey = hashApiKey(apiKey);

    const key = await ApiKey.findOne({
      keyHash: hashedKey,
      isActive: true,
    }).populate("organization");

    if (!key) {
      return res.status(401).json({
        message: "Invalid API key.",
      });
    }

    // Check expiration if set
    if (key.expiresAt && new Date() >= new Date(key.expiresAt)) {
      return res.status(401).json({
        message: "API key has expired.",
      });
    }

    // Resolve API key owner user
    const ownerId = normalizeId(key.createdBy || key.createdById);
    if (!ownerId) {
      return res.status(401).json({
        message: "API key owner not found.",
      });
    }

    const user = await User.findById(ownerId)
      .select("-password")
      .populate("organization");

    if (!user) {
      return res.status(401).json({
        message: "API key owner not found.",
      });
    }

    // Archived user cannot authenticate
    if (user.isArchived) {
      return res.status(401).json({
        message: "Account is archived. Please contact your organization administrator.",
      });
    }

    // Verify tenant consistency: owner must belong to key's organization
    const keyOrgId = normalizeId(
      key.organization?._id || key.organizationId || key.organization
    );
    const userOrgId = normalizeId(
      user.organization?._id || user.organizationId || user.organization
    );

    if (!keyOrgId || !userOrgId || keyOrgId !== userOrgId) {
      return res.status(401).json({
        message: "Organization mismatch.",
      });
    }

    // Resolve role document and effective auth context
    const roleDoc = user.roleRef
      ? await Role.findById(normalizeId(user.roleRef))
      : null;

    const authContext = resolveEffectiveAuthContext(user, roleDoc);

    // Fail closed if role reference is invalid, missing for non-owner, or points to another tenant
    if (
      authContext.conflictState === CONFLICT_STATES.ROLE_DOC_MISSING ||
      authContext.conflictState === CONFLICT_STATES.CROSS_ORG_ROLE ||
      (authContext.conflictState === CONFLICT_STATES.ROLE_REF_MISSING && user.role !== "owner")
    ) {
      return res.status(401).json({
        message: "Invalid role reference.",
      });
    }

    // If role privilege mismatch degraded the user, reflect effective role
    if (authContext.isDegraded) {
      user.role = authContext.effectiveRoleName;
    }

    const orgDoc =
      user.organization && typeof user.organization === "object" && user.organization._id
        ? user.organization
        : { _id: keyOrgId, id: keyOrgId };

    // Establish authenticated context
    req.apiKey = key;
    req.organization = orgDoc;
    req.user = user;
    req.auth = authContext;
    req.authContext = authContext;

    // Asynchronously record lastUsedAt and lastUsedIp (throttled to at most once per 60s to prevent write amplification)
    const now = Date.now();
    const lastUsedTime = key.lastUsedAt ? new Date(key.lastUsedAt).getTime() : 0;
    if (!lastUsedTime || now - lastUsedTime > 60000) {
      key.lastUsedAt = new Date(now);
      const clientIp = req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress;
      ApiKey.findOneAndUpdate(
        { _id: key._id || key.id, organization: keyOrgId },
        {
          lastUsedAt: new Date(now),
          ...(clientIp ? { lastUsedIp: String(clientIp) } : {}),
        }
      ).catch((err) => {
        console.error("Failed to update API key lastUsedAt:", err?.message || err);
      });
    }

    next();
  } catch (error) {
    console.error(error);

    return res.status(401).json({
      message: "Invalid API key.",
    });
  }
};