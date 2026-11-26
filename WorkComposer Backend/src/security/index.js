/**
 * WorkComposer RBAC - Security Foundation Entrypoint
 * 
 * Re-exports the isolated policy engine components:
 * - Policy types & constants
 * - Effective Authorization Context resolver
 * - Tenant context & execution contexts
 * - Policy evaluator functions
 */

export * from './policyTypes.js';
export * from './effectiveAuthContext.js';
export * from './tenantContext.js';
export * from './policyEvaluator.js';
export * from './shadowRouteMap.js';
export * from './shadowCollector.js';
export * from './shadowAuthorizer.js';
export * from './shadowMiddleware.js';

