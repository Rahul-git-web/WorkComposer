/**
 * WorkComposer RBAC - Effective Authorization Context Resolver
 * 
 * Provider-independent, deterministic resolution of user identity, declared role,
 * and referenced Role document across all conflict and synchronization scenarios.
 * 
 * CORE SECURITY INVARIANT:
 * "Never automatically elevate privilege because of a role mismatch."
 */

import {
  ROLE_NAMES,
  ROLE_RANKS,
  CONFLICT_STATES,
  ACCESS_SCOPES,
  CANONICAL_CAPABILITIES,
} from './policyTypes.js';

/**
 * Normalizes an entity ID or reference object to a string ID.
 * Supports string, ObjectId, or populated document with _id or id.
 */
export const normalizeId = (entity) => {
  if (!entity) return null;
  if (typeof entity === 'string') return entity.trim();
  if (entity._id) return entity._id.toString();
  if (entity.id) return entity.id.toString();
  if (typeof entity.toString === 'function') return entity.toString();
  return null;
};

/**
 * Resolves the Effective Authorization Context for a user given their
 * declared enum role and (optionally) their referenced Role document.
 *
 * @param {Object} user - User record (must have at least id/role/organizationId)
 * @param {Object|null} roleDoc - Role document referenced by user.roleRef
 * @returns {Object} EffectiveAuthContext
 */
export function resolveEffectiveAuthContext(user, roleDoc = null) {
  if (!user || typeof user !== 'object') {
    throw new TypeError('resolveEffectiveAuthContext requires a valid user object');
  }

  const userId = normalizeId(user._id || user.id);
  const userOrgId = normalizeId(user.organizationId || user.organization);
  const declaredRole = (user.role || ROLE_NAMES.USER).toString().trim().toLowerCase();
  const roleRefId = normalizeId(user.roleRef);

  // Default baseline state
  let effectiveRoleName = ROLE_NAMES.USER;
  let effectivePermissions = new Set();
  let effectiveReportAccess = ACCESS_SCOPES.NONE;
  let effectiveScreenshotAccess = ACCESS_SCOPES.NONE;
  let conflictState = CONFLICT_STATES.ALIGNED;
  let isDegraded = false;
  let mismatchReason = null;

  // SCENARIO 2: roleRef is completely missing / null
  if (!roleRefId) {
    conflictState = CONFLICT_STATES.ROLE_REF_MISSING;
    isDegraded = true;
    mismatchReason = 'User record has no roleRef foreign key reference.';

    if (declaredRole === ROLE_NAMES.OWNER) {
      // Owner fallback within organization: retains owner role identity, but no custom permissions
      effectiveRoleName = ROLE_NAMES.OWNER;
      effectivePermissions = new Set(CANONICAL_CAPABILITIES);
      effectiveReportAccess = ACCESS_SCOPES.ALL;
      effectiveScreenshotAccess = ACCESS_SCOPES.ALL;
    } else {
      // All other roles without roleRef fallback to restrictive user
      effectiveRoleName = ROLE_NAMES.USER;
      effectivePermissions = new Set();
      effectiveReportAccess = declaredRole === ROLE_NAMES.USER ? ACCESS_SCOPES.OWN : ACCESS_SCOPES.NONE;
      effectiveScreenshotAccess = declaredRole === ROLE_NAMES.USER ? ACCESS_SCOPES.OWN : ACCESS_SCOPES.NONE;
    }

    return Object.freeze({
      userId,
      organizationId: userOrgId,
      declaredRole,
      roleRefId: null,
      referencedRole: null,
      conflictState,
      effectiveRoleName,
      effectivePermissions,
      effectiveReportAccess,
      effectiveScreenshotAccess,
      isDegraded,
      mismatchReason,
    });
  }

  // SCENARIO 3: roleRef exists, but referenced Role document does not exist in DB
  if (!roleDoc) {
    conflictState = CONFLICT_STATES.ROLE_DOC_MISSING;
    isDegraded = true;
    mismatchReason = `Role document for roleRef "${roleRefId}" could not be found.`;

    // Strictly fail closed: lowest privilege
    return Object.freeze({
      userId,
      organizationId: userOrgId,
      declaredRole,
      roleRefId,
      referencedRole: null,
      conflictState,
      effectiveRoleName: ROLE_NAMES.USER,
      effectivePermissions: new Set(),
      effectiveReportAccess: ACCESS_SCOPES.NONE,
      effectiveScreenshotAccess: ACCESS_SCOPES.NONE,
      isDegraded: true,
      mismatchReason,
    });
  }

  // Parse referenced role attributes
  const roleDocOrgId = normalizeId(roleDoc.organizationId || roleDoc.organization);
  const roleDocName = (roleDoc.name || '').toString().trim().toLowerCase();
  const roleDocPerms = Array.isArray(roleDoc.permissions) ? roleDoc.permissions : [];
  const roleDocReport = (roleDoc.reportAccess || ACCESS_SCOPES.NONE).toString().trim().toLowerCase();
  const roleDocScreen = (roleDoc.screenshotAccess || ACCESS_SCOPES.NONE).toString().trim().toLowerCase();

  const referencedRoleMeta = Object.freeze({
    id: normalizeId(roleDoc._id || roleDoc.id),
    name: roleDoc.name,
    organizationId: roleDocOrgId,
    permissions: Object.freeze([...roleDocPerms]),
    reportAccess: roleDocReport,
    screenshotAccess: roleDocScreen,
  });

  // SCENARIO 6: Cross-Tenant Role Document
  if (userOrgId && roleDocOrgId && userOrgId !== roleDocOrgId) {
    conflictState = CONFLICT_STATES.CROSS_ORG_ROLE;
    isDegraded = true;
    mismatchReason = `Referenced role belongs to organization "${roleDocOrgId}", but user belongs to "${userOrgId}".`;

    return Object.freeze({
      userId,
      organizationId: userOrgId,
      declaredRole,
      roleRefId,
      referencedRole: referencedRoleMeta,
      conflictState,
      effectiveRoleName: ROLE_NAMES.USER,
      effectivePermissions: new Set(),
      effectiveReportAccess: ACCESS_SCOPES.NONE,
      effectiveScreenshotAccess: ACCESS_SCOPES.NONE,
      isDegraded: true,
      mismatchReason,
    });
  }

  // SCENARIO 1: Aligned Roles (declared role matches referenced role name)
  if (declaredRole === roleDocName) {
    conflictState = CONFLICT_STATES.ALIGNED;
    effectiveRoleName = declaredRole;
    isDegraded = false;

    if (effectiveRoleName === ROLE_NAMES.OWNER) {
      effectivePermissions = new Set(CANONICAL_CAPABILITIES);
      effectiveReportAccess = ACCESS_SCOPES.ALL;
      effectiveScreenshotAccess = ACCESS_SCOPES.ALL;
    } else {
      effectivePermissions = new Set(roleDocPerms);
      effectiveReportAccess = roleDocReport;
      effectiveScreenshotAccess = roleDocScreen;
    }

    return Object.freeze({
      userId,
      organizationId: userOrgId,
      declaredRole,
      roleRefId,
      referencedRole: referencedRoleMeta,
      conflictState,
      effectiveRoleName,
      effectivePermissions,
      effectiveReportAccess,
      effectiveScreenshotAccess,
      isDegraded,
      mismatchReason: null,
    });
  }

  // SCENARIOS 4 & 5: Privilege Mismatch (declaredRole !== roleDocName)
  conflictState = CONFLICT_STATES.PRIVILEGE_MISMATCH;
  isDegraded = true;

  const declaredRank = ROLE_RANKS[declaredRole] || 1;
  const docRank = ROLE_RANKS[roleDocName] || 1;

  if (declaredRank < docRank) {
    // SUB-CASE 4A: declared role is lower privilege, referenced role is higher privilege
    // E.g., User.role = 'user', Role.name = 'Owner' or 'Admin'
    // MANDATORY RULE: NEVER AUTOMATICALLY ELEVATE PRIVILEGE
    effectiveRoleName = declaredRole; // Fail closed to lower role ('user')
    effectivePermissions = new Set();  // Zero administrative permissions!
    effectiveReportAccess = ACCESS_SCOPES.NONE;
    effectiveScreenshotAccess = ACCESS_SCOPES.NONE;
    mismatchReason = `Privilege elevation blocked: declared role is "${declaredRole}" but roleRef is "${roleDocName}". Fails closed to least privilege.`;
  } else if (declaredRank > docRank) {
    // SUB-CASE 4B: declared role is higher privilege, referenced role is lower privilege
    // E.g., User.role = 'admin', Role.name = 'User' (or role has empty permissions)
    // MANDATORY RULE: DO NOT TRUST ENUM OVERRIDE
    effectiveRoleName = roleDocName;  // Restrict to lower referenced role
    effectivePermissions = new Set(roleDocPerms); // Use actual assigned permissions
    effectiveReportAccess = roleDocReport;
    effectiveScreenshotAccess = roleDocScreen;
    mismatchReason = `Enum override blocked: declared role is "${declaredRole}" but roleRef points to "${roleDocName}". Restricting to referenced role bounds.`;
  } else {
    // Disagreeing role names of identical rank (unrecognized mapping)
    effectiveRoleName = ROLE_NAMES.USER;
    effectivePermissions = new Set();
    effectiveReportAccess = ACCESS_SCOPES.NONE;
    effectiveScreenshotAccess = ACCESS_SCOPES.NONE;
    mismatchReason = `Unrecognized role divergence: "${declaredRole}" vs "${roleDocName}". Fails closed.`;
  }

  return Object.freeze({
    userId,
    organizationId: userOrgId,
    declaredRole,
    roleRefId,
    referencedRole: referencedRoleMeta,
    conflictState,
    effectiveRoleName,
    effectivePermissions,
    effectiveReportAccess,
    effectiveScreenshotAccess,
    isDegraded,
    mismatchReason,
  });
}
