/**
 * WorkComposer RBAC - Shadow Route Classifier & Policy Mapping Catalog
 * 
 * Maps incoming HTTP method and path patterns to canonical capabilities
 * and specialized policy evaluators for Phase 3B observation.
 */

export const ROUTE_POLICY_TYPES = Object.freeze({
  PUBLIC: 'PUBLIC',
  CAPABILITY: 'CAPABILITY',
  REPORT: 'REPORT',
  SCREENSHOT: 'SCREENSHOT',
  PROJECT: 'PROJECT',
  ROLE: 'ROLE',
  TIMER: 'TIMER',
  AUTHENTICATED_BASIC: 'AUTHENTICATED_BASIC',
});

/**
 * Classifies an incoming request into a route policy target.
 *
 * @param {string} method - HTTP method ('GET', 'POST', etc.)
 * @param {string} path - Request path (e.g. '/api/users/invite')
 * @returns {Object} RouteTarget { policyType, requiredCapability, description }
 */
export function classifyRequest(method, path = '') {
  const normMethod = (method || 'GET').toUpperCase();
  const normPath = (path || '').toLowerCase().split('?')[0];

  // 1. PUBLIC ROUTES
  if (
    normPath === '/api/auth/login' ||
    normPath === '/api/auth/register' ||
    normPath === '/api/auth/verify-email' ||
    normPath === '/api/auth/forgot-password' ||
    normPath === '/api/auth/reset-password' ||
    normPath === '/api/users/accept-invite' ||
    normPath.startsWith('/api/stripe/webhook') ||
    normPath === '/health'
  ) {
    return {
      policyType: ROUTE_POLICY_TYPES.PUBLIC,
      requiredCapability: null,
      description: 'Public or unauthenticated endpoint',
    };
  }

  // 2. BILLING & SUBSCRIPTION
  if (normPath.startsWith('/api/billing') || normPath.startsWith('/api/subscription')) {
    return {
      policyType: ROUTE_POLICY_TYPES.CAPABILITY,
      requiredCapability: 'manage_billing',
      description: 'Billing and subscription management',
    };
  }

  // 3. SETTINGS & INTEGRATIONS & API KEYS & SHIFTS & APP CLASSIFICATIONS
  if (
    normPath.startsWith('/api/settings') ||
    normPath.startsWith('/api/time-tracking/settings') ||
    normPath.startsWith('/api/integrations') ||
    normPath.startsWith('/api/api-keys') ||
    normPath.startsWith('/api/api-logs') ||
    normPath.startsWith('/api/app-classifications') ||
    normPath.startsWith('/api/shift') ||
    normPath.startsWith('/api/organization')
  ) {
    // Read-only settings can be viewed by managers/users depending on context,
    // mutations strictly require manage_settings
    if (normMethod !== 'GET' || normPath.startsWith('/api/api-keys')) {
      return {
        policyType: ROUTE_POLICY_TYPES.CAPABILITY,
        requiredCapability: 'manage_settings',
        description: 'System or tracking configuration mutation',
      };
    }
    return {
      policyType: ROUTE_POLICY_TYPES.AUTHENTICATED_BASIC,
      requiredCapability: null,
      description: 'Read-only organization settings',
    };
  }

  // 4. ROLES
  if (normPath.startsWith('/api/roles')) {
    if (normMethod === 'POST' || normMethod === 'PUT' || normMethod === 'PATCH' || normMethod === 'DELETE') {
      return {
        policyType: ROUTE_POLICY_TYPES.ROLE,
        requiredCapability: 'manage_settings',
        description: 'Role modification or deletion',
      };
    }
    return {
      policyType: ROUTE_POLICY_TYPES.CAPABILITY,
      requiredCapability: 'manage_settings',
      description: 'Role definition inspection',
    };
  }

  // 5. USERS & TEAMS
  if (normPath.startsWith('/api/teams')) {
    if (normMethod !== 'GET') {
      return {
        policyType: ROUTE_POLICY_TYPES.CAPABILITY,
        requiredCapability: 'manage_users',
        description: 'Team structure mutation',
      };
    }
    return {
      policyType: ROUTE_POLICY_TYPES.AUTHENTICATED_BASIC,
      requiredCapability: null,
      description: 'Team list inspection',
    };
  }

  if (normPath.startsWith('/api/users')) {
    if (normPath.includes('/profile') || normPath.includes('/password') || normPath === '/api/users/me') {
      return {
        policyType: ROUTE_POLICY_TYPES.AUTHENTICATED_BASIC,
        requiredCapability: null,
        description: 'Self-service user profile',
      };
    }
    if (normMethod === 'POST' || normMethod === 'PUT' || normMethod === 'PATCH' || normMethod === 'DELETE') {
      return {
        policyType: ROUTE_POLICY_TYPES.CAPABILITY,
        requiredCapability: 'manage_users',
        description: 'User administrative mutation',
      };
    }
    return {
      policyType: ROUTE_POLICY_TYPES.CAPABILITY,
      requiredCapability: 'manage_users',
      description: 'Organization users directory',
    };
  }

  // 6. PROJECTS
  if (normPath.startsWith('/api/projects')) {
    if (normMethod === 'POST') {
      return {
        policyType: ROUTE_POLICY_TYPES.PROJECT,
        action: 'create',
        requiredCapability: 'manage_projects',
        description: 'Project creation',
      };
    }
    if (normMethod === 'PUT' || normMethod === 'PATCH') {
      return {
        policyType: ROUTE_POLICY_TYPES.PROJECT,
        action: 'update',
        requiredCapability: 'manage_projects',
        description: 'Project update',
      };
    }
    if (normMethod === 'DELETE') {
      return {
        policyType: ROUTE_POLICY_TYPES.PROJECT,
        action: 'delete',
        requiredCapability: 'manage_projects',
        description: 'Project deletion',
      };
    }
    return {
      policyType: ROUTE_POLICY_TYPES.PROJECT,
      action: 'view',
      requiredCapability: null,
      description: 'Project viewing',
    };
  }

  // 7. TASKS
  if (normPath.startsWith('/api/tasks')) {
    if (normMethod !== 'GET') {
      return {
        policyType: ROUTE_POLICY_TYPES.CAPABILITY,
        requiredCapability: 'manage_tasks',
        description: 'Task assignment and mutation',
      };
    }
    return {
      policyType: ROUTE_POLICY_TYPES.AUTHENTICATED_BASIC,
      requiredCapability: null,
      description: 'Task viewing',
    };
  }

  // 8. REPORTS
  if (normPath.startsWith('/api/reports')) {
    return {
      policyType: ROUTE_POLICY_TYPES.REPORT,
      requiredCapability: null,
      description: 'Productivity or attendance report access',
    };
  }

  // 9. SCREENSHOTS
  if (normPath.startsWith('/api/screenshots')) {
    if (normMethod === 'GET') {
      return {
        policyType: ROUTE_POLICY_TYPES.SCREENSHOT,
        requiredCapability: null,
        description: 'Screenshot viewing',
      };
    }
    return {
      policyType: ROUTE_POLICY_TYPES.AUTHENTICATED_BASIC,
      requiredCapability: null,
      description: 'Screenshot capture/upload',
    };
  }

  // 10. TIMERS
  if (normPath.startsWith('/api/timers')) {
    if (normPath.includes('/start')) {
      return {
        policyType: ROUTE_POLICY_TYPES.TIMER,
        action: 'start',
        requiredCapability: null,
        description: 'Start tracking timer',
      };
    }
    if (normPath.includes('/stop')) {
      return {
        policyType: ROUTE_POLICY_TYPES.TIMER,
        action: 'stop',
        requiredCapability: null,
        description: 'Stop tracking timer',
      };
    }
    return {
      policyType: ROUTE_POLICY_TYPES.AUTHENTICATED_BASIC,
      requiredCapability: null,
      description: 'Active timer query',
    };
  }

  // DEFAULT FALLBACK: Basic authenticated request
  return {
    policyType: ROUTE_POLICY_TYPES.AUTHENTICATED_BASIC,
    requiredCapability: null,
    description: 'Standard authenticated endpoint',
  };
}
