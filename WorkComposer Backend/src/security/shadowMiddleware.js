/**
 * WorkComposer RBAC - Shadow Authorization Middleware & Interceptors
 * 
 * Non-blocking, observe-only middleware that hooks into Express request/response lifecycle
 * to compare authoritative authorization outcomes with shadow policy evaluations.
 * 
 * CONTRACT:
 * - Authoritative authorization logic is 100% untouched and authoritative.
 * - Shadow evaluation runs asynchronously in the background.
 * - Client response is never delayed or modified.
 */

import { evaluateShadow } from './shadowAuthorizer.js';
import { defaultShadowCollector } from './shadowCollector.js';
import { hasPermission } from '../middleware/permission.middleware.js';

/**
 * Creates an Express middleware that non-invasively observes completed requests
 * and evaluates the shadow security policy against the final response status.
 *
 * @param {Object} [options]
 * @param {Function} [options.roleLoader] - Loader for role document
 * @param {Object} [options.collector] - Diagnostics collector
 * @param {boolean} [options.enabled=true] - Toggle shadow observation
 * @returns {Function} Express middleware
 */
export function createShadowAuthMiddleware(options = {}) {
  const isEnabled = options.enabled !== undefined
    ? options.enabled
    : process.env.SHADOW_AUTH_ENABLED === 'true';
  const collector = options.collector || defaultShadowCollector;

  return (req, res, next) => {
    if (!isEnabled) {
      return next();
    }

    // Hook into response completion
    res.on('finish', () => {
      // Execute asynchronously on the next tick so client response is never held
      setImmediate(async () => {
        try {
          const statusCode = res.statusCode;
          const allowed = statusCode >= 200 && statusCode < 400;

          await evaluateShadow(
            req,
            {
              allowed,
              statusCode,
              source: 'RESPONSE_FINISH',
            },
            {
              roleLoader: options.roleLoader,
              collector,
            }
          );
        } catch (err) {
          // Absolute safety: ignore any error during shadow observation
          if (process.env.DEBUG_SHADOW_AUTH === 'true') {
            console.error('[ShadowAuthMiddleware] Error:', err);
          }
        }
      });
    });

    next();
  };
}

/**
 * Shadow wrapper for authorizeRoles middleware.
 * Authoritative behavior: allowedRoles check determines request passage.
 * Shadow behavior: evaluates shadow policy in observe-only mode.
 */
export function shadowAuthorizeRoles(...allowedRoles) {
  return async (req, res, next) => {
    const isAuthAllowed = Boolean(req.user && allowedRoles.includes(req.user.role));

    // Non-blocking shadow evaluation (only when shadow auth is enabled)
    if (process.env.SHADOW_AUTH_ENABLED === 'true') {
      setImmediate(async () => {
        try {
          await evaluateShadow(
            req,
            {
              allowed: isAuthAllowed,
              statusCode: isAuthAllowed ? 200 : 403,
              source: 'AUTHORIZE_ROLES',
            }
          );
        } catch {}
      });
    }

    // Authoritative execution remains 100% authoritative:
    if (!isAuthAllowed) {
      return res.status(403).json({
        message: 'Access denied',
      });
    }

    next();
  };
}

/**
 * Shadow wrapper for requirePermission middleware.
 * Authoritative behavior: existing hasPermission determines request passage.
 * Shadow behavior: evaluates shadow policy in observe-only mode.
 */
export function shadowRequirePermission(permission) {
  return async (req, res, next) => {
    let isAuthAllowed = false;

    try {
      isAuthAllowed = await hasPermission(req.user, permission);
    } catch {
      isAuthAllowed = false;
    }

    // Non-blocking shadow evaluation (only when shadow auth is enabled)
    if (process.env.SHADOW_AUTH_ENABLED === 'true') {
      setImmediate(async () => {
        try {
          await evaluateShadow(
            req,
            {
              allowed: isAuthAllowed,
              statusCode: isAuthAllowed ? 200 : 403,
              source: 'REQUIRE_PERMISSION',
            }
          );
        } catch {}
      });
    }

    // Authoritative execution remains 100% authoritative:
    if (!isAuthAllowed) {
      return res.status(403).json({
        message: 'Permission denied',
      });
    }

    next();
  };
}
