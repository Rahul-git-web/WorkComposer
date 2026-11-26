/**
 * WorkComposer RBAC - Policy Types & Constants
 * Provider-independent security contracts, enums, and decision codes.
 */

export const CANONICAL_CAPABILITIES = Object.freeze([
  'manage_billing',
  'manage_settings',
  'manage_users',
  'manage_projects',
  'manage_tasks',
]);

export const ACCESS_SCOPES = Object.freeze({
  NONE: 'none',
  OWN: 'own',
  MANAGED: 'managed',
  ALL: 'all',
});

export const ROLE_NAMES = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  MANAGER: 'manager',
  USER: 'user',
});

export const ROLE_RANKS = Object.freeze({
  [ROLE_NAMES.OWNER]: 4,
  [ROLE_NAMES.ADMIN]: 3,
  [ROLE_NAMES.MANAGER]: 2,
  [ROLE_NAMES.USER]: 1,
});

export const CONFLICT_STATES = Object.freeze({
  ALIGNED: 'ALIGNED',
  ROLE_REF_MISSING: 'ROLE_REF_MISSING',
  ROLE_DOC_MISSING: 'ROLE_DOC_MISSING',
  CROSS_ORG_ROLE: 'CROSS_ORG_ROLE',
  PRIVILEGE_MISMATCH: 'PRIVILEGE_MISMATCH',
});

export const DECISION_CODES = Object.freeze({
  ALLOWED: 'ALLOWED',
  DENIED: 'DENIED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  CAPABILITY_MISSING: 'CAPABILITY_MISSING',
  SCOPE_MISMATCH: 'SCOPE_MISMATCH',
  ROLE_CONFLICT: 'ROLE_CONFLICT',
  IMMUTABLE_ROLE: 'IMMUTABLE_ROLE',
  SELF_MODIFICATION_PROHIBITED: 'SELF_MODIFICATION_PROHIBITED',
  DELEGATION_PROHIBITED: 'DELEGATION_PROHIBITED',
});

export const EXECUTION_CONTEXT_TYPES = Object.freeze({
  REQUEST_TENANT: 'REQUEST_TENANT',
  SYSTEM_BACKGROUND: 'SYSTEM_BACKGROUND',
});

export const DIVERGENCE_TYPES = Object.freeze({
  MATCH: 'MATCH',
  SHADOW_DENY_AUTH_ALLOW: 'SHADOW_DENY_AUTH_ALLOW',
  SHADOW_ALLOW_AUTH_DENY: 'SHADOW_ALLOW_AUTH_DENY',
  SHADOW_ERROR: 'SHADOW_ERROR',
});

export const SHADOW_SEVERITY = Object.freeze({
  INFO: 'INFO',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
});

