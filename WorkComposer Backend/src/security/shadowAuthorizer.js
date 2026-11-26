/**
 * WorkComposer RBAC - Shadow Authorization Evaluator
 * 
 * Executes non-blocking, observe-only policy evaluations in parallel with
 * the existing authoritative authorization system.
 * 
 * CORE CONTRACT:
 * - Existing authorization remains authoritative.
 * - Shadow evaluation is diagnostic only.
 * - Never blocks or modifies client responses.
 * - Entirely fail-safe (errors caught and recorded as diagnostic events).
 */

import crypto from 'crypto';
import {
  DIVERGENCE_TYPES,
  SHADOW_SEVERITY,
  DECISION_CODES,
  CONFLICT_STATES,
} from './policyTypes.js';
import { resolveEffectiveAuthContext, normalizeId } from './effectiveAuthContext.js';
import {
  hasCapability,
  canViewReport,
  canViewScreenshot,
  canManageRole,
  canAccessProject,
  canMutateTimer,
  createDecision,
} from './policyEvaluator.js';
import { classifyRequest, ROUTE_POLICY_TYPES } from './shadowRouteMap.js';
import { defaultShadowCollector } from './shadowCollector.js';

// High-performance in-memory cache for resolved Role documents in shadow mode (TTL: 60s)
const roleCache = new Map();
const ROLE_CACHE_TTL_MS = 60 * 1000;

export function getCachedRole(roleId) {
  if (!roleId) return null;
  const entry = roleCache.get(roleId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > ROLE_CACHE_TTL_MS) {
    roleCache.delete(roleId);
    return null;
  }
  return entry.roleDoc;
}

export function setCachedRole(roleId, roleDoc) {
  if (!roleId || !roleDoc) return;
  roleCache.set(roleId, {
    roleDoc,
    cachedAt: Date.now(),
  });
}

export function clearRoleCache() {
  roleCache.clear();
}

/**
 * Evaluates the new security policy against an incoming request and compares
 * the result to the authoritative decision.
 *
 * @param {Object} req - Express request object (must contain req.user if authenticated)
 * @param {Object} authoritativeDecision - { allowed: boolean, statusCode?: number, source?: string }
 * @param {Object} [options]
 * @param {Object} [options.roleDoc] - Pre-fetched Role document (optional)
 * @param {Function} [options.roleLoader] - Async/Sync loader `(roleId) => roleDoc`
 * @param {Object} [options.targetEntity] - Target resource being accessed/mutated (optional)
 * @param {Object} [options.collector] - Diagnostics collector (defaults to defaultShadowCollector)
 * @returns {Promise<Object>} ShadowDiagnostic record
 */
export async function evaluateShadow(req, authoritativeDecision, options = {}) {
  const collector = options?.collector || defaultShadowCollector;
  let requestId = 'unknown';
  let method = 'GET';
  let path = '/';

  try {
    requestId = req?.id || req?.headers?.['x-request-id'] || crypto.randomUUID();
    method = (req?.method || 'GET').toUpperCase();
    path = req?.originalUrl || req?.path || '/';

    const user = req?.user || null;
    const classification = classifyRequest(method, path);

    // 1. Unauthenticated or Public Requests
    if (classification.policyType === ROUTE_POLICY_TYPES.PUBLIC) {
      const publicDecision = createDecision(true, DECISION_CODES.ALLOWED, 'Public endpoint.');
      return recordComparison({
        requestId,
        method,
        path,
        classification,
        user,
        authContext: null,
        authoritative: authoritativeDecision,
        shadow: publicDecision,
        collector,
      });
    }

    if (!user) {
      const unauthDecision = createDecision(false, DECISION_CODES.UNAUTHENTICATED, 'Missing authenticated user.');
      return recordComparison({
        requestId,
        method,
        path,
        classification,
        user: null,
        authContext: null,
        authoritative: authoritativeDecision,
        shadow: unauthDecision,
        collector,
      });
    }

    // 2. Resolve Role Document (from option, cache, or roleLoader)
    const roleRefId = normalizeId(user.roleRef);
    let roleDoc = options.roleDoc || null;

    if (!roleDoc && roleRefId) {
      roleDoc = getCachedRole(roleRefId);

      if (!roleDoc && typeof options.roleLoader === 'function') {
        try {
          roleDoc = await options.roleLoader(roleRefId);
          if (roleDoc) {
            setCachedRole(roleRefId, roleDoc);
          }
        } catch {
          // Loader failure in shadow mode degrades gracefully to null roleDoc
          roleDoc = null;
        }
      }
    }

    // 3. Resolve Effective Authorization Context
    const authContext = resolveEffectiveAuthContext(user, roleDoc);

    // 4. Evaluate Policy Based on Route Classification
    let shadowDecision;

    switch (classification.policyType) {
      case ROUTE_POLICY_TYPES.CAPABILITY: {
        const allowed = hasCapability(authContext, classification.requiredCapability);
        shadowDecision = createDecision(
          allowed,
          allowed ? DECISION_CODES.ALLOWED : DECISION_CODES.CAPABILITY_MISSING,
          allowed
            ? `Granted capability: ${classification.requiredCapability}.`
            : `Missing required capability: ${classification.requiredCapability}.`
        );
        break;
      }

      case ROUTE_POLICY_TYPES.REPORT: {
        const targetUser = options.targetEntity || {
          _id: req?.params?.userId || user._id || user.id,
          organizationId: user.organizationId || user.organization,
          managerId: user.managerId || user.manager,
        };
        shadowDecision = canViewReport(authContext, targetUser);
        break;
      }

      case ROUTE_POLICY_TYPES.SCREENSHOT: {
        const screenshotOwner = options.targetEntity || {
          _id: req?.params?.userId || req?.query?.userId || user._id || user.id,
          organizationId: user.organizationId || user.organization,
          managerId: user.managerId || user.manager,
        };
        shadowDecision = canViewScreenshot(authContext, screenshotOwner);
        break;
      }

      case ROUTE_POLICY_TYPES.ROLE: {
        const targetRole = options.targetEntity || {
          _id: req?.params?.id || req?.params?.roleId,
          organizationId: user.organizationId || user.organization,
          name: req?.body?.name || '',
        };
        shadowDecision = canManageRole(authContext, targetRole, req?.body?.permissions || []);
        break;
      }

      case ROUTE_POLICY_TYPES.PROJECT: {
        const targetProject = options.targetEntity || {
          _id: req?.params?.id || req?.params?.projectId,
          organizationId: user.organizationId || user.organization,
          name: req?.body?.name || '',
        };
        shadowDecision = canAccessProject(
          authContext,
          targetProject,
          classification.action || 'view',
          []
        );
        break;
      }

      case ROUTE_POLICY_TYPES.TIMER: {
        const targetTimer = options.targetEntity || {
          _id: req?.params?.id || req?.body?.timerId,
          userId: req?.body?.userId || user._id || user.id,
          organizationId: user.organizationId || user.organization,
        };
        shadowDecision = canMutateTimer(authContext, targetTimer, classification.action || 'stop');
        break;
      }

      case ROUTE_POLICY_TYPES.AUTHENTICATED_BASIC:
      default: {
        // Enforce basic tenant presence and cross-tenant barrier
        if (authContext.conflictState === CONFLICT_STATES.CROSS_ORG_ROLE) {
          shadowDecision = createDecision(
            false,
            DECISION_CODES.TENANT_MISMATCH,
            'Cross-tenant role reference detected on basic authenticated route.'
          );
        } else {
          shadowDecision = createDecision(
            true,
            DECISION_CODES.ALLOWED,
            'Authenticated request within valid tenant.'
          );
        }
        break;
      }
    }

    // 5. Compare Authoritative Result vs Shadow Result
    return recordComparison({
      requestId,
      method,
      path,
      classification,
      user,
      authContext,
      authoritative: authoritativeDecision,
      shadow: shadowDecision,
      collector,
    });

  } catch (err) {
    // FAIL-SAFE: Shadow authorization errors MUST NEVER crash or block the request
    const errorDiagnostic = Object.freeze({
      timestamp: new Date().toISOString(),
      requestId,
      method,
      path,
      classification: { policyType: 'UNKNOWN', description: 'Evaluation failed' },
      principal: {
        userId: normalizeId(req?.user?._id || req?.user?.id),
        organizationId: normalizeId(req?.user?.organizationId || req?.user?.organization),
        declaredRole: req?.user?.role,
        roleRefId: normalizeId(req?.user?.roleRef),
      },
      effectiveContext: null,
      authoritative: {
        allowed: Boolean(authoritativeDecision?.allowed),
        statusCode: authoritativeDecision?.statusCode || (authoritativeDecision?.allowed ? 200 : 403),
        source: authoritativeDecision?.source || 'UNKNOWN',
      },
      shadow: {
        allowed: false,
        code: 'SHADOW_ERROR',
        reason: `Shadow evaluation error: ${err.message}`,
      },
      comparison: {
        divergence: DIVERGENCE_TYPES.SHADOW_ERROR,
        severity: SHADOW_SEVERITY.LOW,
        mismatchDescription: `Internal shadow evaluation error: ${err.message}`,
      },
    });

    collector.record(errorDiagnostic);
    return errorDiagnostic;
  }
}

/**
 * Builds, compares, and records a structured ShadowDiagnostic.
 */
function recordComparison({
  requestId,
  method,
  path,
  classification,
  user,
  authContext,
  authoritative,
  shadow,
  collector,
}) {
  const authAllowed = Boolean(authoritative?.allowed);
  const shadowAllowed = Boolean(shadow?.allowed);

  let divergence = DIVERGENCE_TYPES.MATCH;
  let severity = SHADOW_SEVERITY.INFO;
  let mismatchDescription = 'Authoritative and Shadow decisions agree.';

  if (authAllowed && !shadowAllowed) {
    divergence = DIVERGENCE_TYPES.SHADOW_DENY_AUTH_ALLOW;

    // Determine security risk severity
    if (
      authContext?.conflictState === CONFLICT_STATES.PRIVILEGE_MISMATCH ||
      authContext?.conflictState === CONFLICT_STATES.CROSS_ORG_ROLE ||
      shadow.code === DECISION_CODES.IMMUTABLE_ROLE ||
      shadow.code === DECISION_CODES.SELF_MODIFICATION_PROHIBITED
    ) {
      severity = SHADOW_SEVERITY.CRITICAL;
      mismatchDescription = `CRITICAL PRIVILEGE ESCALATION GAP: Legacy system allowed request, but new policy strictly denies with "${shadow.code}" (${shadow.reason}).`;
    } else if (
      shadow.code === DECISION_CODES.CAPABILITY_MISSING ||
      shadow.code === DECISION_CODES.SCOPE_MISMATCH ||
      shadow.code === DECISION_CODES.TENANT_MISMATCH
    ) {
      severity = SHADOW_SEVERITY.HIGH;
      mismatchDescription = `POLICY GAP: Legacy system allowed request, but new policy requires capability/scope "${shadow.code}" (${shadow.reason}).`;
    } else {
      severity = SHADOW_SEVERITY.MEDIUM;
      mismatchDescription = `Authoritative allowed, shadow denied: ${shadow.reason}`;
    }
  } else if (!authAllowed && shadowAllowed) {
    divergence = DIVERGENCE_TYPES.SHADOW_ALLOW_AUTH_DENY;
    severity = SHADOW_SEVERITY.LOW;
    mismatchDescription = `Authoritative denied (${authoritative.statusCode || 403}), but shadow policy evaluated allowed: ${shadow.reason}`;
  }

  const diagnostic = Object.freeze({
    timestamp: new Date().toISOString(),
    requestId,
    method,
    path,
    classification: Object.freeze({ ...classification }),
    principal: user ? Object.freeze({
      userId: normalizeId(user._id || user.id),
      organizationId: normalizeId(user.organizationId || user.organization),
      declaredRole: user.role,
      roleRefId: normalizeId(user.roleRef),
    }) : null,
    effectiveContext: authContext ? Object.freeze({
      effectiveRole: authContext.effectiveRoleName,
      conflictState: authContext.conflictState,
      effectivePermissions: Object.freeze([...authContext.effectivePermissions]),
      effectiveReportAccess: authContext.effectiveReportAccess,
      effectiveScreenshotAccess: authContext.effectiveScreenshotAccess,
      isDegraded: authContext.isDegraded,
      mismatchReason: authContext.mismatchReason,
    }) : null,
    authoritative: Object.freeze({
      allowed: authAllowed,
      statusCode: authoritative?.statusCode || (authAllowed ? 200 : 403),
      source: authoritative?.source || 'UNKNOWN',
    }),
    shadow: Object.freeze({
      allowed: shadowAllowed,
      code: shadow.code,
      reason: shadow.reason,
    }),
    comparison: Object.freeze({
      divergence,
      severity,
      mismatchDescription,
    }),
  });

  collector.record(diagnostic);
  return diagnostic;
}
