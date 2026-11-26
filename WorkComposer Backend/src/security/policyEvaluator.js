/**
 * WorkComposer RBAC - Policy Evaluator Engine
 * 
 * Centralized, deterministic evaluation of capabilities, resource access,
 * scoping rules, and tenant invariants.
 */

import {
  CANONICAL_CAPABILITIES,
  ACCESS_SCOPES,
  ROLE_NAMES,
  DECISION_CODES,
  CONFLICT_STATES,
} from './policyTypes.js';
import { normalizeId } from './effectiveAuthContext.js';

export { DECISION_CODES, ROLE_NAMES, CONFLICT_STATES, normalizeId };

/**
 * Extracts a deduplicated Set of assigned manager IDs from a user record or summary.
 * Supports multi-manager `managers[]` / `managerLinks[]` as well as legacy `manager` / `managerId`.
 *
 * @param {Object} user
 * @returns {Set<string>}
 */
export function extractManagerIds(user) {
  const ids = new Set();
  if (!user || typeof user !== 'object') {
    return ids;
  }

  const addId = (val) => {
    if (!val) return;
    const idStr = normalizeId(val?._id || val?.id || val);
    if (idStr) {
      ids.add(idStr);
    }
  };

  if (Array.isArray(user.managers)) {
    for (const m of user.managers) {
      addId(m);
    }
  }
  if (Array.isArray(user.managerLinks)) {
    for (const link of user.managerLinks) {
      addId(link?.managerId || link?.manager);
    }
  }
  addId(user.manager);
  addId(user.managerId);

  return ids;
}

/**
 * Creates a structured Policy Decision object.
 *
 * @param {boolean} allowed
 * @param {string} code - Member of DECISION_CODES
 * @param {string} reason
 * @param {Object} [context]
 * @returns {Object} PolicyDecision
 */
export function createDecision(allowed, code, reason, context = null) {
  return Object.freeze({
    allowed: Boolean(allowed),
    code,
    reason,
    context: context ? Object.freeze({ ...context }) : null,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Checks whether the given EffectiveAuthContext holds a specific canonical capability.
 *
 * @param {Object} authContext - EffectiveAuthContext
 * @param {string} capability - One of CANONICAL_CAPABILITIES
 * @returns {boolean}
 */
export function hasCapability(authContext, capability) {
  if (!authContext || typeof authContext !== 'object') {
    return false;
  }

  if (!CANONICAL_CAPABILITIES.includes(capability)) {
    return false;
  }

  // Organization Owner possesses all 5 canonical capabilities within their tenant
  if (authContext.effectiveRoleName === ROLE_NAMES.OWNER) {
    return true;
  }

  if (authContext.effectivePermissions instanceof Set) {
    return authContext.effectivePermissions.has(capability);
  }

  return false;
}

/**
 * Evaluates whether an authenticated user can view report data for a target user.
 *
 * @param {Object} authContext - EffectiveAuthContext of caller
 * @param {Object} targetUser - Target user entity or summary ({ id, organizationId, managerId })
 * @returns {Object} PolicyDecision
 */
export function canViewReport(authContext, targetUser) {
  if (!authContext || !authContext.userId) {
    return createDecision(false, DECISION_CODES.UNAUTHENTICATED, 'Missing or unauthenticated context.');
  }

  if (!targetUser) {
    return createDecision(false, DECISION_CODES.DENIED, 'Target user is required.');
  }

  const callerOrgId = normalizeId(authContext.organizationId);
  const targetOrgId = normalizeId(targetUser.organizationId || targetUser.organization);
  const callerUserId = normalizeId(authContext.userId);
  const targetUserId = normalizeId(targetUser._id || targetUser.id);
  const targetManagerIds = extractManagerIds(targetUser);

  // STRICT TENANT BOUNDARY: Cross-tenant report access is unconditionally forbidden
  if (!callerOrgId || !targetOrgId || callerOrgId !== targetOrgId) {
    return createDecision(
      false,
      DECISION_CODES.TENANT_MISMATCH,
      `Cross-tenant report access denied. Caller org: "${callerOrgId}", target org: "${targetOrgId}".`
    );
  }

  const accessLevel = authContext.effectiveReportAccess || ACCESS_SCOPES.NONE;

  // SCOPE: 'none' -> Completely denied
  if (accessLevel === ACCESS_SCOPES.NONE) {
    return createDecision(
      false,
      DECISION_CODES.SCOPE_MISMATCH,
      'Caller role has reportAccess: "none". Access denied.'
    );
  }

  // SCOPE: 'all' -> Allowed for any user within the same organization
  if (accessLevel === ACCESS_SCOPES.ALL) {
    return createDecision(
      true,
      DECISION_CODES.ALLOWED,
      'Allowed: Caller possesses organization-wide report access.'
    );
  }

  // SCOPE: 'managed' -> Allowed if target is self OR target reports to caller
  if (accessLevel === ACCESS_SCOPES.MANAGED) {
    const isSelf = callerUserId === targetUserId;
    const isDirectSubordinate = Boolean(callerUserId && targetManagerIds.has(callerUserId));

    if (isSelf || isDirectSubordinate) {
      return createDecision(
        true,
        DECISION_CODES.ALLOWED,
        isSelf
          ? 'Allowed: Viewing own report under managed scope.'
          : 'Allowed: Viewing subordinate report under managed scope.'
      );
    }

    return createDecision(
      false,
      DECISION_CODES.SCOPE_MISMATCH,
      'Denied: Target user is neither the caller nor a direct subordinate.'
    );
  }

  // SCOPE: 'own' -> Allowed strictly if target is self
  if (accessLevel === ACCESS_SCOPES.OWN) {
    if (callerUserId === targetUserId) {
      return createDecision(
        true,
        DECISION_CODES.ALLOWED,
        'Allowed: Viewing own report.'
      );
    }

    return createDecision(
      false,
      DECISION_CODES.SCOPE_MISMATCH,
      'Denied: Caller possesses own-report access only.'
    );
  }

  return createDecision(false, DECISION_CODES.DENIED, `Unknown report access scope: "${accessLevel}".`);
}

/**
 * Evaluates whether an authenticated user can view screenshots for a target user.
 *
 * @param {Object} authContext - EffectiveAuthContext of caller
 * @param {Object} screenshotOwner - User who owns the screenshot ({ id, organizationId, managerId })
 * @returns {Object} PolicyDecision
 */
export function canViewScreenshot(authContext, screenshotOwner) {
  if (!authContext || !authContext.userId) {
    return createDecision(false, DECISION_CODES.UNAUTHENTICATED, 'Missing or unauthenticated context.');
  }

  if (!screenshotOwner) {
    return createDecision(false, DECISION_CODES.DENIED, 'Screenshot owner is required.');
  }

  const callerOrgId = normalizeId(authContext.organizationId);
  const targetOrgId = normalizeId(screenshotOwner.organizationId || screenshotOwner.organization);
  const callerUserId = normalizeId(authContext.userId);
  const targetUserId = normalizeId(screenshotOwner._id || screenshotOwner.id);
  const targetManagerIds = extractManagerIds(screenshotOwner);

  // STRICT TENANT BOUNDARY: Cross-tenant screenshot access is unconditionally forbidden
  if (!callerOrgId || !targetOrgId || callerOrgId !== targetOrgId) {
    return createDecision(
      false,
      DECISION_CODES.TENANT_MISMATCH,
      `Cross-tenant screenshot access denied. Caller org: "${callerOrgId}", target org: "${targetOrgId}".`
    );
  }

  const accessLevel = authContext.effectiveScreenshotAccess || ACCESS_SCOPES.NONE;

  // SCOPE: 'none' -> Completely denied
  if (accessLevel === ACCESS_SCOPES.NONE) {
    return createDecision(
      false,
      DECISION_CODES.SCOPE_MISMATCH,
      'Caller role has screenshotAccess: "none". Access denied.'
    );
  }

  // SCOPE: 'all' -> Allowed for any user within the same organization
  if (accessLevel === ACCESS_SCOPES.ALL) {
    return createDecision(
      true,
      DECISION_CODES.ALLOWED,
      'Allowed: Caller possesses organization-wide screenshot access.'
    );
  }

  // SCOPE: 'managed' -> Allowed if target is self OR target reports to caller
  if (accessLevel === ACCESS_SCOPES.MANAGED) {
    const isSelf = callerUserId === targetUserId;
    const isDirectSubordinate = Boolean(callerUserId && targetManagerIds.has(callerUserId));

    if (isSelf || isDirectSubordinate) {
      return createDecision(
        true,
        DECISION_CODES.ALLOWED,
        isSelf
          ? 'Allowed: Viewing own screenshots under managed scope.'
          : 'Allowed: Viewing subordinate screenshots under managed scope.'
      );
    }

    return createDecision(
      false,
      DECISION_CODES.SCOPE_MISMATCH,
      'Denied: Target user is neither the caller nor a direct subordinate.'
    );
  }

  // SCOPE: 'own' -> Allowed strictly if target is self
  if (accessLevel === ACCESS_SCOPES.OWN) {
    if (callerUserId === targetUserId) {
      return createDecision(
        true,
        DECISION_CODES.ALLOWED,
        'Allowed: Viewing own screenshots.'
      );
    }

    return createDecision(
      false,
      DECISION_CODES.SCOPE_MISMATCH,
      'Denied: Caller possesses own-screenshot access only.'
    );
  }

  return createDecision(false, DECISION_CODES.DENIED, `Unknown screenshot access scope: "${accessLevel}".`);
}

/**
 * Evaluates whether an authenticated user can modify or mutate a target Role document.
 * Enforces delegation invariants:
 * - Target role must belong to caller's organization.
 * - Owner role is immutable.
 * - Caller cannot modify their own assigned role.
 * - Caller must possess manage_settings capability.
 * - Caller cannot delegate permissions they do not possess.
 *
 * @param {Object} authContext - EffectiveAuthContext of caller
 * @param {Object} targetRole - Role document being modified
 * @param {string[]} [newPermissions=[]] - Requested new permissions to assign
 * @returns {Object} PolicyDecision
 */
export function canManageRole(authContext, targetRole, newPermissions = []) {
  if (!authContext || !authContext.userId) {
    return createDecision(false, DECISION_CODES.UNAUTHENTICATED, 'Missing or unauthenticated context.');
  }

  if (!targetRole) {
    return createDecision(false, DECISION_CODES.DENIED, 'Target role is required.');
  }

  const callerOrgId = normalizeId(authContext.organizationId);
  const roleOrgId = normalizeId(targetRole.organizationId || targetRole.organization);

  // Tenant Boundary
  if (!callerOrgId || !roleOrgId || callerOrgId !== roleOrgId) {
    return createDecision(
      false,
      DECISION_CODES.TENANT_MISMATCH,
      'Cross-tenant role modification denied.'
    );
  }

  // Owner Role Immutability
  const roleName = (targetRole.name || '').toString().trim().toLowerCase();
  if (roleName === ROLE_NAMES.OWNER) {
    return createDecision(
      false,
      DECISION_CODES.IMMUTABLE_ROLE,
      'Owner role is immutable and cannot be modified.'
    );
  }

  // Prevent Self-Role Elevation
  const targetRoleId = normalizeId(targetRole._id || targetRole.id);
  const callerRoleId = normalizeId(authContext.roleRefId);
  if (targetRoleId && callerRoleId && targetRoleId === callerRoleId) {
    return createDecision(
      false,
      DECISION_CODES.SELF_MODIFICATION_PROHIBITED,
      'Users cannot modify the permissions or access levels of their own assigned role.'
    );
  }

  // Capability Check: Must have manage_settings or be Owner
  if (!hasCapability(authContext, 'manage_settings')) {
    return createDecision(
      false,
      DECISION_CODES.CAPABILITY_MISSING,
      'Missing required capability: manage_settings.'
    );
  }

  // Privilege Delegation Invariant: Caller cannot delegate permissions they do not possess
  if (authContext.effectiveRoleName !== ROLE_NAMES.OWNER && Array.isArray(newPermissions)) {
    for (const perm of newPermissions) {
      if (!hasCapability(authContext, perm)) {
        return createDecision(
          false,
          DECISION_CODES.DELEGATION_PROHIBITED,
          `Cannot delegate capability "${perm}" because caller does not possess it.`
        );
      }
    }
  }

  return createDecision(true, DECISION_CODES.ALLOWED, 'Allowed: Role modification permitted.');
}

/**
 * Evaluates whether an authenticated user can perform an action on a Project entity.
 *
 * @param {Object} authContext - EffectiveAuthContext
 * @param {Object} project - Project entity
 * @param {'view'|'create'|'update'|'delete'} action
 * @param {string[]} [assignedTaskProjectIds=[]] - Project IDs where user has assigned tasks
 * @returns {Object} PolicyDecision
 */
export function canAccessProject(authContext, project, action = 'view', assignedTaskProjectIds = []) {
  if (!authContext || !authContext.userId) {
    return createDecision(false, DECISION_CODES.UNAUTHENTICATED, 'Missing or unauthenticated context.');
  }

  if (action === 'create') {
    if (!hasCapability(authContext, 'manage_projects')) {
      return createDecision(false, DECISION_CODES.CAPABILITY_MISSING, 'Missing capability: manage_projects.');
    }
    return createDecision(true, DECISION_CODES.ALLOWED, 'Allowed: Project creation permitted.');
  }

  if (!project) {
    return createDecision(false, DECISION_CODES.DENIED, 'Target project is required.');
  }

  const callerOrgId = normalizeId(authContext.organizationId);
  const projectOrgId = normalizeId(project.organizationId || project.organization);

  // Tenant Boundary
  if (!callerOrgId || !projectOrgId || callerOrgId !== projectOrgId) {
    return createDecision(false, DECISION_CODES.TENANT_MISMATCH, 'Cross-tenant project access denied.');
  }

  // Mutations (update/delete)
  if (action === 'update' || action === 'delete') {
    if (!hasCapability(authContext, 'manage_projects')) {
      return createDecision(false, DECISION_CODES.CAPABILITY_MISSING, 'Missing capability: manage_projects.');
    }

    if (action === 'delete' && project.name === 'Default Project') {
      return createDecision(false, DECISION_CODES.DENIED, 'The organization Default Project cannot be deleted.');
    }

    return createDecision(true, DECISION_CODES.ALLOWED, `Allowed: Project ${action} permitted.`);
  }

  // View Action: Allowed if user has manage_projects OR has assigned tasks in the project
  if (hasCapability(authContext, 'manage_projects')) {
    return createDecision(true, DECISION_CODES.ALLOWED, 'Allowed: Organization-wide project view.');
  }

  const projectId = normalizeId(project._id || project.id);
  const isAssigned = Array.isArray(assignedTaskProjectIds) && assignedTaskProjectIds.some(id => normalizeId(id) === projectId);

  if (isAssigned) {
    return createDecision(true, DECISION_CODES.ALLOWED, 'Allowed: Viewing project containing assigned tasks.');
  }

  return createDecision(false, DECISION_CODES.SCOPE_MISMATCH, 'Denied: User has no assigned tasks in this project.');
}

/**
 * Evaluates whether an authenticated user can mutate a Timer entity.
 *
 * @param {Object} authContext - EffectiveAuthContext
 * @param {Object} timer - Timer entity ({ userId, organizationId })
 * @param {'start'|'stop'} action
 * @returns {Object} PolicyDecision
 */
export function canMutateTimer(authContext, timer, action = 'stop') {
  if (!authContext || !authContext.userId) {
    return createDecision(false, DECISION_CODES.UNAUTHENTICATED, 'Missing or unauthenticated context.');
  }

  if (!timer) {
    return createDecision(false, DECISION_CODES.DENIED, 'Timer entity is required.');
  }

  const callerOrgId = normalizeId(authContext.organizationId);
  const timerOrgId = normalizeId(timer.organizationId || timer.organization);

  // Strict Tenant Boundary: Cross-tenant timer access/mutation is unconditionally forbidden
  if (callerOrgId && timerOrgId && callerOrgId !== timerOrgId) {
    return createDecision(
      false,
      DECISION_CODES.TENANT_MISMATCH,
      `Cross-tenant timer mutation denied. Caller org: "${callerOrgId}", timer org: "${timerOrgId}".`
    );
  }

  const callerUserId = normalizeId(authContext.userId);
  const timerUserId = normalizeId(timer.userId || timer.user);

  // Ownership invariant: A user can only start or stop their own timer
  if (callerUserId !== timerUserId) {
    return createDecision(
      false,
      DECISION_CODES.SCOPE_MISMATCH,
      `Users can only ${action} their own timers. Caller: "${callerUserId}", Timer user: "${timerUserId}".`
    );
  }

  return createDecision(true, DECISION_CODES.ALLOWED, `Allowed: Timer ${action} permitted.`);
}

/**
 * Evaluates whether an authenticated caller can approve or reject a ManualTimeRequest.
 *
 * @param {Object} authContext - EffectiveAuthContext of caller
 * @param {Object} manualTimeRequest - ManualTimeRequest entity ({ id, organizationId, requestedById })
 * @param {Object} targetRequester - User who submitted the request ({ id, organizationId, managerId })
 * @param {Object} [settings] - TimeTrackingSettings of organization
 * @returns {Object} PolicyDecision
 */
export function canApproveManualTime(authContext, manualTimeRequest, targetRequester, settings = null) {
  if (!authContext || !authContext.userId) {
    return createDecision(false, DECISION_CODES.UNAUTHENTICATED, 'Missing or unauthenticated context.');
  }

  if (!manualTimeRequest) {
    return createDecision(false, DECISION_CODES.DENIED, 'Manual time request is required.');
  }

  const callerOrgId = normalizeId(authContext.organizationId);
  const requestOrgId = normalizeId(manualTimeRequest.organizationId || manualTimeRequest.organization);
  const callerUserId = normalizeId(authContext.userId);
  const requesterId = normalizeId(
    manualTimeRequest.requestedById ||
    manualTimeRequest.requestedBy?._id ||
    manualTimeRequest.requestedBy?.id ||
    manualTimeRequest.requestedBy
  );

  // STRICT TENANT BOUNDARY: Cross-tenant manual time approval is unconditionally forbidden
  if (!callerOrgId || !requestOrgId || callerOrgId !== requestOrgId) {
    return createDecision(
      false,
      DECISION_CODES.TENANT_MISMATCH,
      `Cross-tenant manual time request approval denied. Caller org: "${callerOrgId}", request org: "${requestOrgId}".`
    );
  }

  if (targetRequester) {
    const requesterOrgId = normalizeId(targetRequester.organizationId || targetRequester.organization);
    if (requesterOrgId && requesterOrgId !== callerOrgId) {
      return createDecision(
        false,
        DECISION_CODES.TENANT_MISMATCH,
        `Requester belongs to a different organization: "${requesterOrgId}".`
      );
    }
  }

  // SELF-APPROVAL PROHIBITION: A requester cannot approve their own manual time request
  if (callerUserId && requesterId && callerUserId === requesterId) {
    return createDecision(
      false,
      DECISION_CODES.SELF_MODIFICATION_PROHIBITED,
      'You cannot approve your own manual time request.'
    );
  }

  // ROLE / ROLE-REF SPLIT BRAIN & DEGRADED STATES:
  // Fail closed on cross-tenant roleRef, missing role document, or privilege inversion
  if (authContext.conflictState === CONFLICT_STATES.CROSS_ORG_ROLE) {
    return createDecision(
      false,
      DECISION_CODES.ROLE_CONFLICT,
      'Cross-tenant role reference cannot grant approval authority.'
    );
  }

  if (authContext.conflictState === CONFLICT_STATES.ROLE_DOC_MISSING) {
    return createDecision(
      false,
      DECISION_CODES.ROLE_CONFLICT,
      'Dangling role reference fails closed.'
    );
  }

  const effectiveRole = (authContext.effectiveRoleName || '').toLowerCase();

  // 1. OWNER: Full organizational authority
  if (effectiveRole === ROLE_NAMES.OWNER) {
    return createDecision(true, DECISION_CODES.ALLOWED, 'Allowed: Organization owner approval permitted.');
  }

  // 2. ADMIN or custom role possessing manage_users capability:
  if (effectiveRole === ROLE_NAMES.ADMIN || hasCapability(authContext, 'manage_users')) {
    return createDecision(true, DECISION_CODES.ALLOWED, 'Allowed: Administrative manual time approval permitted.');
  }

  // 3. MANAGER:
  if (effectiveRole === ROLE_NAMES.MANAGER) {
    // Check organizational setting for manager approval
    const managerApprovalAllowed = settings?.manualTime?.managerApproval !== false;
    if (!managerApprovalAllowed) {
      return createDecision(
        false,
        DECISION_CODES.SCOPE_MISMATCH,
        'Managers are not allowed to approve manual time requests.'
      );
    }

    // Check manager-subordinate relationship across all assigned managers
    const requesterManagerIds = extractManagerIds(targetRequester);

    if (!callerUserId || !requesterManagerIds.has(callerUserId)) {
      return createDecision(
        false,
        DECISION_CODES.SCOPE_MISMATCH,
        'You can only approve requests from users you manage.'
      );
    }

    return createDecision(true, DECISION_CODES.ALLOWED, 'Allowed: Manager approval for managed subordinate permitted.');
  }

  // 4. All other roles (standard users, or custom roles lacking manage_users)
  return createDecision(
    false,
    DECISION_CODES.CAPABILITY_MISSING,
    'You are not allowed to approve requests.'
  );
}

/**
 * Evaluates whether an authenticated user can access (view or mutate) organization Shift Settings.
 *
 * @param {Object} authContext - EffectiveAuthContext of caller
 * @param {string} targetOrgId - Target organization ID
 * @param {'view'|'mutate'} [action='view'] - Requested operation
 * @returns {Object} PolicyDecision
 */
export function canAccessShiftSettings(authContext, targetOrgId, action = 'view') {
  if (!authContext || !authContext.userId) {
    return createDecision(false, DECISION_CODES.UNAUTHENTICATED, 'Missing or unauthenticated context.');
  }

  const callerOrgId = normalizeId(authContext.organizationId);
  const normalizedTargetOrgId = normalizeId(targetOrgId);

  // STRICT TENANT BOUNDARY: Cross-tenant shift settings access is strictly forbidden
  if (!callerOrgId || !normalizedTargetOrgId || callerOrgId !== normalizedTargetOrgId) {
    return createDecision(
      false,
      DECISION_CODES.TENANT_MISMATCH,
      'Cross-tenant shift settings access denied.'
    );
  }

  // FAIL-CLOSED CHECKS on degraded or conflicting role state
  if (authContext.conflictState === CONFLICT_STATES.ROLE_DOC_ORGANIZATION_MISMATCH) {
    return createDecision(
      false,
      DECISION_CODES.CROSS_TENANT_ROLE_REF,
      'Cross-tenant role reference strictly prohibited.'
    );
  }

  if (authContext.conflictState === CONFLICT_STATES.PRIVILEGE_INVERSION) {
    return createDecision(
      false,
      DECISION_CODES.PRIVILEGE_INVERSION,
      'Privilege-inversion detected: caller role state fails closed.'
    );
  }

  if (authContext.conflictState === CONFLICT_STATES.ROLE_DOC_MISSING) {
    return createDecision(
      false,
      DECISION_CODES.ROLE_CONFLICT,
      'Dangling role reference fails closed.'
    );
  }

  // ACTION: 'view' (READ)
  if (action === 'view') {
    return createDecision(true, DECISION_CODES.ALLOWED, 'Allowed: Shift settings read permitted within tenant.');
  }

  // ACTION: 'mutate' (UPDATE / DELETE / CREATE)
  // 1. Organization Owner possesses full authority
  if (authContext.effectiveRoleName === ROLE_NAMES.OWNER) {
    return createDecision(true, DECISION_CODES.ALLOWED, 'Allowed: Organization owner shift settings mutation permitted.');
  }

  // 2. Administrative or Custom Role must possess canonical capability: manage_settings
  if (hasCapability(authContext, 'manage_settings')) {
    return createDecision(true, DECISION_CODES.ALLOWED, 'Allowed: Shift settings mutation permitted via manage_settings capability.');
  }

  return createDecision(
    false,
    DECISION_CODES.CAPABILITY_MISSING,
    'Missing required capability: manage_settings.'
  );
}

/**
 * Evaluates whether an authenticated user can access organization notification settings.
 *
 * @param {Object} authContext - EffectiveAuthContext
 * @param {string} targetOrganizationId - Target Organization ID
 * @param {'view'|'mutate'} action - Action being performed
 * @returns {Object} PolicyDecision
 */
export function canAccessOrganizationNotifications(authContext, targetOrganizationId, action = 'view') {
  if (!authContext || !authContext.userId) {
    return createDecision(false, DECISION_CODES.UNAUTHENTICATED, 'Missing or unauthenticated context.');
  }

  const callerOrgId = normalizeId(authContext.organizationId);
  const targetOrgId = targetOrganizationId ? normalizeId(targetOrganizationId) : null;

  // Strict Tenant Boundary: Cross-tenant notification settings access/mutation is strictly forbidden
  if (targetOrgId && callerOrgId !== targetOrgId) {
    return createDecision(
      false,
      DECISION_CODES.TENANT_MISMATCH,
      'Cross-tenant organization notification access denied.'
    );
  }

  // FAIL-CLOSED CHECKS on degraded or conflicting role state
  if (authContext.conflictState === CONFLICT_STATES.ROLE_DOC_ORGANIZATION_MISMATCH) {
    return createDecision(
      false,
      DECISION_CODES.CROSS_TENANT_ROLE_REF,
      'Cross-tenant role reference strictly prohibited.'
    );
  }

  if (authContext.conflictState === CONFLICT_STATES.PRIVILEGE_INVERSION) {
    return createDecision(
      false,
      DECISION_CODES.PRIVILEGE_INVERSION,
      'Privilege-inversion detected: caller role state fails closed.'
    );
  }

  if (authContext.conflictState === CONFLICT_STATES.ROLE_DOC_MISSING) {
    return createDecision(
      false,
      DECISION_CODES.ROLE_CONFLICT,
      'Dangling role reference fails closed.'
    );
  }

  // 1. Organization Owner possesses full authority
  if (authContext.effectiveRoleName === ROLE_NAMES.OWNER) {
    return createDecision(true, DECISION_CODES.ALLOWED, 'Allowed: Organization owner notification settings access permitted.');
  }

  // 2. Administrative or Custom Role must possess canonical capability: manage_settings
  if (hasCapability(authContext, 'manage_settings')) {
    return createDecision(true, DECISION_CODES.ALLOWED, 'Allowed: Notification settings access permitted via manage_settings capability.');
  }

  return createDecision(
    false,
    DECISION_CODES.CAPABILITY_MISSING,
    'Missing required capability: manage_settings.'
  );
}

/**
 * Evaluates whether an authenticated user can access or mutate a target user's Shift Settings.
 *
 * Security Invariants & Rules:
 * 1. Must be authenticated with a valid context.
 * 2. Strict tenant boundary: caller and target user must belong to the exact same organization.
 * 3. Fail closed on conflict states (cross-tenant roleRef, privilege inversion, dangling roleRef).
 * 4. Owner: full organizational authority over all users within their organization.
 * 5. Admin or custom role with canonical capability (manage_settings or manage_users):
 *    administrative authority over all users within their organization.
 * 6. Manager: authorized strictly for direct subordinates (target.managerId === caller.id).
 *    Managers cannot modify unrelated users or themselves without administrative capability.
 * 7. Standard User (and unprivileged roles):
 *    Denied. Shift schedules are administrative controls assigned by management.
 *    Self-service and peer modification are strictly prohibited.
 *
 * @param {Object} authContext - EffectiveAuthContext of caller
 * @param {Object} targetUser - Target user entity ({ id, organizationId, managerId })
 * @param {'view'|'mutate'} [action='mutate']
 * @returns {Object} PolicyDecision
 */
export function canAccessUserShiftSettings(authContext, targetUser, action = 'mutate') {
  if (!authContext || !authContext.userId) {
    return createDecision(false, DECISION_CODES.UNAUTHENTICATED, 'Missing or unauthenticated context.');
  }

  if (!targetUser) {
    return createDecision(false, DECISION_CODES.DENIED, 'Target user is required.');
  }

  const callerOrgId = normalizeId(authContext.organizationId);
  const targetOrgId = normalizeId(targetUser.organizationId || targetUser.organization);
  const callerUserId = normalizeId(authContext.userId);
  const targetUserId = normalizeId(targetUser._id || targetUser.id);
  const targetManagerIds = extractManagerIds(targetUser);

  // STRICT TENANT BOUNDARY: Cross-tenant user shift settings access is strictly forbidden
  if (!callerOrgId || !targetOrgId || callerOrgId !== targetOrgId) {
    return createDecision(
      false,
      DECISION_CODES.TENANT_MISMATCH,
      'Cross-tenant user shift settings access denied.'
    );
  }

  // FAIL-CLOSED CHECKS on degraded or conflicting role state
  if (
    authContext.conflictState === CONFLICT_STATES.CROSS_ORG_ROLE ||
    authContext.conflictState === 'ROLE_DOC_ORGANIZATION_MISMATCH'
  ) {
    return createDecision(
      false,
      DECISION_CODES.ROLE_CONFLICT,
      'Cross-tenant role reference strictly prohibited.'
    );
  }

  if (authContext.conflictState === CONFLICT_STATES.ROLE_DOC_MISSING) {
    return createDecision(
      false,
      DECISION_CODES.ROLE_CONFLICT,
      'Dangling role reference fails closed.'
    );
  }

  if (
    authContext.conflictState === 'PRIVILEGE_INVERSION' ||
    (authContext.conflictState === CONFLICT_STATES.PRIVILEGE_MISMATCH &&
      !hasCapability(authContext, 'manage_settings') &&
      !hasCapability(authContext, 'manage_users'))
  ) {
    return createDecision(
      false,
      DECISION_CODES.ROLE_CONFLICT,
      'Privilege-inversion detected: caller role state fails closed.'
    );
  }

  const effectiveRole = (authContext.effectiveRoleName || '').toLowerCase();

  // 1. Organization Owner possesses full authority
  if (effectiveRole === ROLE_NAMES.OWNER) {
    return createDecision(true, DECISION_CODES.ALLOWED, 'Allowed: Organization owner user shift settings mutation permitted.');
  }

  // 2. Administrative Caller: Aligned Admin OR Custom Role possessing manage_settings or manage_users
  if (
    effectiveRole === ROLE_NAMES.ADMIN ||
    hasCapability(authContext, 'manage_settings') ||
    hasCapability(authContext, 'manage_users')
  ) {
    return createDecision(true, DECISION_CODES.ALLOWED, 'Allowed: Administrative user shift settings mutation permitted.');
  }

  // 3. Manager: Permitted strictly for direct subordinates within the same organization
  if (effectiveRole === ROLE_NAMES.MANAGER) {
    if (callerUserId && targetManagerIds.has(callerUserId)) {
      return createDecision(true, DECISION_CODES.ALLOWED, 'Allowed: Manager user shift settings mutation for direct subordinate permitted.');
    }

    if (callerUserId === targetUserId) {
      return createDecision(
        false,
        DECISION_CODES.SCOPE_MISMATCH,
        'Managers cannot modify their own shift settings without administrative capability.'
      );
    }

    return createDecision(
      false,
      DECISION_CODES.SCOPE_MISMATCH,
      'Managers can only modify shift settings for their direct subordinates.'
    );
  }

  // 4. Standard User / Unprivileged Roles:
  if (callerUserId === targetUserId) {
    return createDecision(
      false,
      DECISION_CODES.SELF_MODIFICATION_PROHIBITED,
      'Users cannot modify their own shift settings; shift schedules must be configured by an administrator or direct manager.'
    );
  }

  return createDecision(
    false,
    DECISION_CODES.CAPABILITY_MISSING,
    'Missing required capability to modify user shift settings.'
  );
}

/**
 * Evaluates whether an authenticated user can assign or mutate manager relationships.
 *
 * @param {Object} authContext - EffectiveAuthContext of caller
 * @param {Object} targetUser - Target user entity or summary ({ id, organizationId })
 * @param {Object|Array<Object>|null} requestedManagers - Candidate manager(s) ({ id, organizationId }) or null
 * @param {Map<string, Iterable<string>>|Object|null} [managerGraph=null] - Optional adjacency map (userId -> managerIds) for cycle checks
 * @returns {Object} PolicyDecision
 */
export function canAssignManager(authContext, targetUser, requestedManagers = null, managerGraph = null) {
  if (!authContext || !authContext.userId) {
    return createDecision(false, DECISION_CODES.UNAUTHENTICATED, 'Missing or unauthenticated context.');
  }

  if (!targetUser) {
    return createDecision(false, DECISION_CODES.DENIED, 'Target user is required.');
  }

  const callerOrgId = normalizeId(authContext.organizationId);
  const targetOrgId = normalizeId(targetUser.organizationId || targetUser.organization);
  const targetUserId = normalizeId(targetUser._id || targetUser.id);

  // STRICT TENANT BOUNDARY: Cross-tenant manager assignment is strictly forbidden
  if (!callerOrgId || !targetOrgId || callerOrgId !== targetOrgId) {
    return createDecision(
      false,
      DECISION_CODES.TENANT_MISMATCH,
      'Cross-tenant manager assignment denied.'
    );
  }

  const candidateList = Array.isArray(requestedManagers)
    ? requestedManagers.filter(Boolean)
    : (requestedManagers ? [requestedManagers] : []);

  // Cross-tenant, self-assignment & multi-manager cycle validation
  const candidateIds = [];
  for (const candidate of candidateList) {
    const managerOrgId = normalizeId(candidate.organizationId || candidate.organization);
    if (!managerOrgId || managerOrgId !== callerOrgId) {
      return createDecision(
        false,
        DECISION_CODES.TENANT_MISMATCH,
        'Cross-tenant manager selection denied.'
      );
    }

    const candidateId = normalizeId(candidate._id || candidate.id || candidate);
    if (targetUserId && candidateId && candidateId === targetUserId) {
      return createDecision(
        false,
        DECISION_CODES.DENIED,
        'A user cannot be their own manager.'
      );
    }
    if (candidateId) {
      candidateIds.push(candidateId);
    }
  }

  if (managerGraph && targetUserId && candidateIds.length > 0) {
    const visited = new Set();
    const queue = [...candidateIds];
    while (queue.length > 0) {
      const currId = queue.shift();
      if (!currId || visited.has(currId)) continue;
      if (currId === targetUserId) {
        return createDecision(
          false,
          DECISION_CODES.DENIED,
          'Circular manager assignment is not allowed.'
        );
      }
      visited.add(currId);
      const upstream = managerGraph instanceof Map
        ? managerGraph.get(currId)
        : managerGraph[currId];
      if (upstream) {
        for (const upId of upstream) {
          const normUp = normalizeId(upId);
          if (normUp && !visited.has(normUp)) {
            queue.push(normUp);
          }
        }
      }
    }
  }

  // FAIL-CLOSED CHECKS on degraded or conflicting role state
  if (
    authContext.conflictState === CONFLICT_STATES.CROSS_ORG_ROLE ||
    authContext.conflictState === 'ROLE_DOC_ORGANIZATION_MISMATCH'
  ) {
    return createDecision(
      false,
      DECISION_CODES.ROLE_CONFLICT,
      'Cross-tenant role reference strictly prohibited.'
    );
  }

  if (authContext.conflictState === CONFLICT_STATES.ROLE_DOC_MISSING) {
    return createDecision(
      false,
      DECISION_CODES.ROLE_CONFLICT,
      'Dangling role reference fails closed.'
    );
  }

  if (
    authContext.conflictState === 'PRIVILEGE_INVERSION' ||
    (authContext.conflictState === CONFLICT_STATES.PRIVILEGE_MISMATCH &&
      !hasCapability(authContext, 'manage_users'))
  ) {
    return createDecision(
      false,
      DECISION_CODES.ROLE_CONFLICT,
      'Privilege-inversion detected: caller role state fails closed.'
    );
  }

  const effectiveRole = (authContext.effectiveRoleName || '').toLowerCase();

  // 1. Organization Owner possesses full authority
  if (effectiveRole === ROLE_NAMES.OWNER) {
    return createDecision(true, DECISION_CODES.ALLOWED, 'Allowed: Organization owner manager assignment permitted.');
  }

  // 2. Administrative Caller: Aligned Admin OR Custom Role possessing manage_users
  if (
    effectiveRole === ROLE_NAMES.ADMIN ||
    hasCapability(authContext, 'manage_users')
  ) {
    return createDecision(true, DECISION_CODES.ALLOWED, 'Allowed: Administrative manager assignment permitted.');
  }

  // 3. Manager / User / Other roles lack authority to restructure reporting hierarchy
  return createDecision(
    false,
    DECISION_CODES.CAPABILITY_MISSING,
    'Missing required capability manage_users to assign or modify managers.'
  );
}

/**
 * Evaluates whether an authenticated user can view or manage devices of a target user.
 *
 * @param {Object} authContext - EffectiveAuthContext of caller
 * @param {Object} targetUser - Target user entity or summary ({ id, organizationId })
 * @param {string} [action='read'] - Action being evaluated ('read' | 'logout' | 'manage')
 * @returns {Object} PolicyDecision
 */
export function canAccessUserDevices(authContext, targetUser, action = 'read') {
  if (!authContext || !authContext.userId) {
    return createDecision(false, DECISION_CODES.UNAUTHENTICATED, 'Missing or unauthenticated context.');
  }

  if (!targetUser) {
    return createDecision(false, DECISION_CODES.DENIED, 'Target user is required.');
  }

  const callerOrgId = normalizeId(authContext.organizationId);
  const targetOrgId = normalizeId(targetUser.organizationId || targetUser.organization);
  const callerUserId = normalizeId(authContext.userId);
  const targetUserId = normalizeId(targetUser._id || targetUser.id);

  // STRICT TENANT BOUNDARY: Cross-tenant device access is strictly forbidden
  if (!callerOrgId || !targetOrgId || callerOrgId !== targetOrgId) {
    return createDecision(
      false,
      DECISION_CODES.TENANT_MISMATCH,
      'Cross-tenant user device access denied.'
    );
  }

  // FAIL-CLOSED CHECKS on degraded or conflicting role state
  if (
    authContext.conflictState === CONFLICT_STATES.CROSS_ORG_ROLE ||
    authContext.conflictState === 'ROLE_DOC_ORGANIZATION_MISMATCH'
  ) {
    return createDecision(
      false,
      DECISION_CODES.ROLE_CONFLICT,
      'Cross-tenant role reference strictly prohibited.'
    );
  }

  if (authContext.conflictState === CONFLICT_STATES.ROLE_DOC_MISSING) {
    return createDecision(
      false,
      DECISION_CODES.ROLE_CONFLICT,
      'Dangling role reference fails closed.'
    );
  }

  if (
    authContext.conflictState === 'PRIVILEGE_INVERSION' ||
    (authContext.conflictState === CONFLICT_STATES.PRIVILEGE_MISMATCH &&
      !hasCapability(authContext, 'manage_users'))
  ) {
    return createDecision(
      false,
      DECISION_CODES.ROLE_CONFLICT,
      'Privilege-inversion detected: caller role state fails closed.'
    );
  }

  // 1. Self-Service Access: User accessing their own devices is always permitted
  if (callerUserId === targetUserId) {
    return createDecision(
      true,
      DECISION_CODES.ALLOWED,
      'Allowed: User access to own devices permitted.'
    );
  }

  const effectiveRole = (authContext.effectiveRoleName || '').toLowerCase();

  // 2. Organization Owner possesses full authority
  if (effectiveRole === ROLE_NAMES.OWNER) {
    return createDecision(
      true,
      DECISION_CODES.ALLOWED,
      'Allowed: Organization owner user device access permitted.'
    );
  }

  // 3. Administrative Caller: Aligned Admin OR Custom Role possessing manage_users
  if (
    effectiveRole === ROLE_NAMES.ADMIN ||
    hasCapability(authContext, 'manage_users')
  ) {
    return createDecision(
      true,
      DECISION_CODES.ALLOWED,
      'Allowed: Administrative user device access permitted.'
    );
  }

  // 4. Standard User / Manager / Other unprivileged callers: Denied access to peer/subordinate devices
  return createDecision(
    false,
    DECISION_CODES.CAPABILITY_MISSING,
    'Missing required capability manage_users to access another user\'s devices.'
  );
}

/**
 * Evaluates whether an authenticated user can archive a target user.
 *
 * @param {Object} authContext - EffectiveAuthContext of caller
 * @param {Object} targetUser - Target user entity or summary ({ id, organizationId, role })
 * @returns {Object} PolicyDecision
 */
export function canArchiveUser(authContext, targetUser) {
  if (!authContext || !authContext.userId) {
    return createDecision(false, DECISION_CODES.UNAUTHENTICATED, 'Missing or unauthenticated context.');
  }

  if (!targetUser) {
    return createDecision(false, DECISION_CODES.DENIED, 'Target user is required.');
  }

  const callerOrgId = normalizeId(authContext.organizationId);
  const targetOrgId = normalizeId(targetUser.organizationId || targetUser.organization);
  const callerUserId = normalizeId(authContext.userId);
  const targetUserId = normalizeId(targetUser._id || targetUser.id);

  // STRICT TENANT BOUNDARY: Cross-tenant user archival is strictly forbidden
  if (!callerOrgId || !targetOrgId || callerOrgId !== targetOrgId) {
    return createDecision(
      false,
      DECISION_CODES.TENANT_MISMATCH,
      'Cross-tenant user archival denied.'
    );
  }

  // FAIL-CLOSED CHECKS on degraded or conflicting role state
  if (
    authContext.conflictState === CONFLICT_STATES.CROSS_ORG_ROLE ||
    authContext.conflictState === 'ROLE_DOC_ORGANIZATION_MISMATCH'
  ) {
    return createDecision(
      false,
      DECISION_CODES.ROLE_CONFLICT,
      'Cross-tenant role reference strictly prohibited.'
    );
  }

  if (authContext.conflictState === CONFLICT_STATES.ROLE_DOC_MISSING) {
    return createDecision(
      false,
      DECISION_CODES.ROLE_CONFLICT,
      'Dangling role reference fails closed.'
    );
  }

  if (
    authContext.conflictState === 'PRIVILEGE_INVERSION' ||
    (authContext.conflictState === CONFLICT_STATES.PRIVILEGE_MISMATCH &&
      !hasCapability(authContext, 'manage_users'))
  ) {
    return createDecision(
      false,
      DECISION_CODES.ROLE_CONFLICT,
      'Privilege-inversion detected: caller role state fails closed.'
    );
  }

  // Target Owner cannot be archived under any circumstances (Owner Protection Invariant)
  const targetRole = (targetUser.role || '').toLowerCase();
  if (targetRole === ROLE_NAMES.OWNER) {
    return createDecision(
      false,
      DECISION_CODES.IMMUTABLE_ROLE,
      'Organization owner cannot be archived.'
    );
  }

  // Self-Archival Protection: Users cannot archive themselves
  if (callerUserId === targetUserId) {
    return createDecision(
      false,
      DECISION_CODES.SELF_MODIFICATION_PROHIBITED,
      'Users cannot archive themselves.'
    );
  }

  const effectiveRole = (authContext.effectiveRoleName || '').toLowerCase();

  // 1. Organization Owner possesses full authority
  if (effectiveRole === ROLE_NAMES.OWNER) {
    return createDecision(
      true,
      DECISION_CODES.ALLOWED,
      'Allowed: Organization owner user archival permitted.'
    );
  }

  // 2. Administrative Caller: Aligned Admin OR Custom Role possessing manage_users
  if (
    effectiveRole === ROLE_NAMES.ADMIN ||
    hasCapability(authContext, 'manage_users')
  ) {
    return createDecision(
      true,
      DECISION_CODES.ALLOWED,
      'Allowed: Administrative user archival permitted.'
    );
  }

  // 3. Manager / User / Other unprivileged callers: Denied
  return createDecision(
    false,
    DECISION_CODES.CAPABILITY_MISSING,
    'Missing required capability manage_users to archive users.'
  );
}

/**
 * Evaluates whether an authenticated user can unarchive a target user.
 *
 * @param {Object} authContext - EffectiveAuthContext of caller
 * @param {Object} targetUser - Target user entity or summary ({ id, organizationId, role })
 * @returns {Object} PolicyDecision
 */
export function canUnarchiveUser(authContext, targetUser) {
  if (!authContext || !authContext.userId) {
    return createDecision(false, DECISION_CODES.UNAUTHENTICATED, 'Missing or unauthenticated context.');
  }

  if (!targetUser) {
    return createDecision(false, DECISION_CODES.DENIED, 'Target user is required.');
  }

  const callerOrgId = normalizeId(authContext.organizationId);
  const targetOrgId = normalizeId(targetUser.organizationId || targetUser.organization);
  const callerUserId = normalizeId(authContext.userId);
  const targetUserId = normalizeId(targetUser._id || targetUser.id);

  // STRICT TENANT BOUNDARY: Cross-tenant user unarchival is strictly forbidden
  if (!callerOrgId || !targetOrgId || callerOrgId !== targetOrgId) {
    return createDecision(
      false,
      DECISION_CODES.TENANT_MISMATCH,
      'Cross-tenant user unarchival denied.'
    );
  }

  // FAIL-CLOSED CHECKS on degraded or conflicting role state
  if (
    authContext.conflictState === CONFLICT_STATES.CROSS_ORG_ROLE ||
    authContext.conflictState === 'ROLE_DOC_ORGANIZATION_MISMATCH'
  ) {
    return createDecision(
      false,
      DECISION_CODES.ROLE_CONFLICT,
      'Cross-tenant role reference strictly prohibited.'
    );
  }

  if (authContext.conflictState === CONFLICT_STATES.ROLE_DOC_MISSING) {
    return createDecision(
      false,
      DECISION_CODES.ROLE_CONFLICT,
      'Dangling role reference fails closed.'
    );
  }

  if (
    authContext.conflictState === 'PRIVILEGE_INVERSION' ||
    (authContext.conflictState === CONFLICT_STATES.PRIVILEGE_MISMATCH &&
      !hasCapability(authContext, 'manage_users'))
  ) {
    return createDecision(
      false,
      DECISION_CODES.ROLE_CONFLICT,
      'Privilege-inversion detected: caller role state fails closed.'
    );
  }

  // Owner cannot be unarchived
  const targetRole = (targetUser.role || '').toLowerCase();
  if (targetRole === ROLE_NAMES.OWNER) {
    return createDecision(
      false,
      DECISION_CODES.IMMUTABLE_ROLE,
      'Organization owner cannot be unarchived.'
    );
  }

  // Self-unarchival: Users cannot unarchive themselves
  if (callerUserId === targetUserId) {
    return createDecision(
      false,
      DECISION_CODES.SELF_MODIFICATION_PROHIBITED,
      'Users cannot unarchive themselves.'
    );
  }

  const effectiveRole = (authContext.effectiveRoleName || '').toLowerCase();

  // 1. Organization Owner possesses full authority
  if (effectiveRole === ROLE_NAMES.OWNER) {
    return createDecision(
      true,
      DECISION_CODES.ALLOWED,
      'Allowed: Organization owner user unarchival permitted.'
    );
  }

  // 2. Administrative Caller: Aligned Admin OR Custom Role possessing manage_users
  if (
    effectiveRole === ROLE_NAMES.ADMIN ||
    hasCapability(authContext, 'manage_users')
  ) {
    return createDecision(
      true,
      DECISION_CODES.ALLOWED,
      'Allowed: Administrative user unarchival permitted.'
    );
  }

  // 3. Manager / User / Other unprivileged callers: Denied
  return createDecision(
    false,
    DECISION_CODES.CAPABILITY_MISSING,
    'Missing required capability manage_users to unarchive users.'
  );
}
