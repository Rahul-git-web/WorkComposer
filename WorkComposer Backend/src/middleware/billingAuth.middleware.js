/**
 * WorkComposer RBAC — Billing Authorization Middleware
 * 
 * Enforces server-side authorization for all user-initiated billing operations
 * using the Phase 3A Effective Authorization Context and canonical capability:
 * 'manage_billing'.
 * 
 * CONTRACT:
 * 1. Must run AFTER protect middleware (req.user must be authenticated).
 * 2. Resolves caller's verified organization context.
 * 3. Resolves deterministic EffectiveAuthContext (handles roleRef, dangling references,
 *    cross-tenant roles, and privilege inversions by failing closed).
 * 4. Strictly requires canonical 'manage_billing' capability.
 * 5. Fails closed (403) on any missing capability or evaluation error.
 */

import Role from "../models/role.model.js";
import {
  resolveEffectiveAuthContext,
  normalizeId,
} from "../security/effectiveAuthContext.js";
import { hasCapability } from "../security/policyEvaluator.js";

/**
 * Loads the authoritative Role document for a user from the primary database model.
 * 
 * SECURITY CONTRACT (Phase 3C.2.1):
 * Authoritative authorization MUST query the authoritative data store (Role.findById)
 * and MUST NOT query, rely on, or populate the non-authoritative shadow role cache.
 *
 * @param {Object} user
 * @returns {Promise<Object|null>}
 */
export async function loadRoleDocForUser(user) {
  if (!user || !user.roleRef) {
    return null;
  }
  const roleId = normalizeId(user.roleRef);
  if (!roleId) return null;

  try {
    return await Role.findById(roleId);
  } catch {
    return null;
  }
}

/**
 * Express middleware that enforces the 'manage_billing' capability.
 */
export const requireBillingAccess = async (req, res, next) => {
  try {
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

    const roleDoc = await loadRoleDocForUser(req.user);
    const authContext = resolveEffectiveAuthContext(req.user, roleDoc);

    // Attach effective authorization context for downstream observability
    req.authContext = authContext;

    const allowed = hasCapability(authContext, "manage_billing");

    if (!allowed) {
      return res.status(403).json({
        message: "Access denied: Requires manage_billing capability.",
      });
    }

    next();
  } catch (err) {
    console.error("[requireBillingAccess] Error evaluating billing authorization:", err);
    return res.status(403).json({
      message: "Access denied: Billing authorization failed.",
    });
  }
};

export default requireBillingAccess;
