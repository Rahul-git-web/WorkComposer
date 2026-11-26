/**
 * WorkComposer RBAC - Tenant Context & Execution Context Partitioning
 * 
 * Enforces explicit separation between Request/Tenant Context and System/Background Context.
 * Eliminates ambient bypass flags (such as systemMode=true) to prevent unauthorized tenant escape.
 */

import crypto from 'crypto';
import { EXECUTION_CONTEXT_TYPES } from './policyTypes.js';
import { normalizeId } from './effectiveAuthContext.js';

export class TenantIsolationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'TenantIsolationError';
    this.code = 'TENANT_MISMATCH';
    this.details = details;
  }
}

/**
 * Creates a Request / Tenant Context representing an authenticated user
 * executing an HTTP, WebSocket, or Desktop request within a specific tenant boundary.
 *
 * @param {Object} params
 * @param {Object} params.authenticatedUser - User object
 * @param {string} params.organizationId - Target tenant ID (mandatory)
 * @param {Object} params.effectiveAuthContext - Computed EffectiveAuthContext
 * @param {string} [params.requestSource='WEB'] - 'WEB' | 'DESKTOP' | 'SOCKET' | 'API'
 * @returns {Object} TenantContext
 */
export function createTenantContext({
  authenticatedUser,
  organizationId,
  effectiveAuthContext,
  requestSource = 'WEB',
}) {
  const normOrgId = normalizeId(organizationId);

  if (!normOrgId || typeof normOrgId !== 'string') {
    throw new TenantIsolationError(
      'Cannot establish TenantContext: organizationId is missing or invalid.',
      { organizationId }
    );
  }

  if (!authenticatedUser || typeof authenticatedUser !== 'object') {
    throw new TenantIsolationError(
      'Cannot establish TenantContext: authenticatedUser is missing.',
      { authenticatedUser }
    );
  }

  if (!effectiveAuthContext || typeof effectiveAuthContext !== 'object') {
    throw new TenantIsolationError(
      'Cannot establish TenantContext: effectiveAuthContext is missing.',
      { effectiveAuthContext }
    );
  }

  const userId = normalizeId(authenticatedUser._id || authenticatedUser.id);

  return Object.freeze({
    contextType: EXECUTION_CONTEXT_TYPES.REQUEST_TENANT,
    userId,
    organizationId: normOrgId,
    effectiveAuthContext,
    requestSource,
    createdAt: new Date().toISOString(),

    /**
     * Checks if a target resource's organization ID matches this tenant context.
     * @param {string|Object} targetOrgId
     * @returns {boolean}
     */
    isTenant(targetOrgId) {
      const normalizedTarget = normalizeId(targetOrgId);
      return Boolean(normalizedTarget && normalizedTarget === normOrgId);
    },

    /**
     * Asserts that a target resource belongs to this tenant; throws TenantIsolationError on mismatch.
     * @param {string|Object} targetOrgId
     * @param {string} [resourceName='Resource']
     */
    assertTenant(targetOrgId, resourceName = 'Resource') {
      const normalizedTarget = normalizeId(targetOrgId);
      if (!normalizedTarget || normalizedTarget !== normOrgId) {
        throw new TenantIsolationError(
          `Tenant Isolation Violation: ${resourceName} belongs to organization "${normalizedTarget}", but active context is organization "${normOrgId}".`,
          {
            expectedOrg: normOrgId,
            actualOrg: normalizedTarget,
            resourceName,
          }
        );
      }
    },

    /**
     * Security invariant: Tenant contexts NEVER permit bypassing tenant checks.
     * @returns {false}
     */
    canBypassTenant() {
      return false;
    },
  });
}

/**
 * Creates a System / Background Context for trusted internal system operations
 * (cron daemons, maintenance workers, background sync jobs).
 *
 * @param {Object} params
 * @param {string} params.systemJobName - Identifier of the background job (e.g. 'EMAIL_REPORTS_CRON')
 * @param {string} [params.initiatedBy='SCHEDULER'] - 'SCHEDULER' | 'MIGRATION' | 'MAINTENANCE'
 * @param {string} [params.auditTraceId] - UUID for audit trail
 * @param {string|null} [params.organizationId=null] - Scoped organization if processing single tenant
 * @returns {Object} SystemContext
 */
export function createSystemContext({
  systemJobName,
  initiatedBy = 'SCHEDULER',
  auditTraceId = null,
  organizationId = null,
}) {
  if (!systemJobName || typeof systemJobName !== 'string' || !systemJobName.trim()) {
    throw new TypeError('createSystemContext requires a valid, non-empty systemJobName.');
  }

  const validInitiators = ['SCHEDULER', 'MIGRATION', 'MAINTENANCE'];
  if (!validInitiators.includes(initiatedBy)) {
    throw new TypeError(
      `createSystemContext: initiatedBy must be one of [${validInitiators.join(', ')}], received "${initiatedBy}".`
    );
  }

  const normOrgId = organizationId ? normalizeId(organizationId) : null;
  const traceId = auditTraceId || crypto.randomUUID();

  return Object.freeze({
    contextType: EXECUTION_CONTEXT_TYPES.SYSTEM_BACKGROUND,
    systemJobName: systemJobName.trim(),
    initiatedBy,
    auditTraceId: traceId,
    organizationId: normOrgId,
    isSystemPrivilege: true,
    createdAt: new Date().toISOString(),

    isTenant(targetOrgId) {
      if (!normOrgId) return true; // Global background job across all tenants
      return normalizeId(targetOrgId) === normOrgId;
    },

    canBypassTenant() {
      return true;
    },
  });
}
