/**
 * WorkComposer - Canonical Report Access & Scope Resolution Helper
 *
 * Implements deterministic authorization resolution aligned with backend
 * security policy in WorkComposer Backend/src/security/effectiveAuthContext.js
 * and WorkComposer Backend/src/utils/reportAccess.js.
 *
 * Core Security Invariants:
 * 1. "Never automatically elevate privilege because of a role mismatch."
 * 2. Do not grant team access solely because role === "owner" or role === "admin".
 * 3. An explicit reportAccess scope takes precedence over declared role.
 *
 * Access Mapping:
 * - "all"     -> Team Report (organization-wide scope)
 * - "managed" -> Team Report (direct subordinates scope)
 * - "own"     -> My Report (strictly caller self)
 * - "none"    -> My Report label (access strictly denied at API layer)
 * - undefined -> Defaults to Team Report ONLY for unconfigured owner; all others default to personal/none.
 */

export type UserReportScopeContext = {
  role?: string;
  reportAccess?: "none" | "own" | "managed" | "all" | string;
  permissions?: string[];
  manageUsers?: boolean;
};

/**
 * Returns true if the user's effective report access authorizes team-level visibility ("all" or "managed").
 * Returns false if the user is scoped to personal reports ("own" or "none").
 *
 * @param user User context object from DashboardContext
 */
export function isTeamReportAccess(
  user?: UserReportScopeContext | null
): boolean {
  if (!user) return false;

  // If reportAccess is explicitly set, follow it strictly.
  // Explicit "own" or "none" must NEVER be elevated even if role === "owner" or "admin".
  if (typeof user.reportAccess === "string" && user.reportAccess.trim() !== "") {
    const scope = user.reportAccess.trim().toLowerCase();
    return scope === "all" || scope === "managed";
  }

  // Fallback ONLY when reportAccess is not populated:
  // In canonical RBAC, only owner has unconfigured baseline fallback to all.
  // Role 'admin' or 'user' without explicit reportAccess falls back to least privilege (false).
  return user.role === "owner";
}

/**
 * Resolves the user-facing navigation/overview label ("Team Report" vs "My Report").
 */
export function resolveOverviewNavLabel(
  user?: UserReportScopeContext | null
): "Team Report" | "My Report" {
  return isTeamReportAccess(user) ? "Team Report" : "My Report";
}

/**
 * Resolves display label for effective report access scope.
 */
export function getReportAccessLabel(
  user?: UserReportScopeContext | null
): string {
  if (user?.reportAccess) {
    return user.reportAccess;
  }
  return user?.role === "owner" ? "all (owner fallback)" : "own (default)";
}

/**
 * Determines whether a user is authorized to access Team Home (view switcher and team dashboard).
 *
 * Authorization Rule:
 * 1. Owner (user.role === "owner") ALWAYS has unrestricted access to Team Home.
 * 2. Any other role (Admin, Manager, Employee) MUST possess the "manage_users" / "manageUsers" permission.
 *    Fails closed if permissions are missing, undefined, or empty.
 *
 * @param user User context object from DashboardContext
 */
export function canAccessTeamHome(
  user?: UserReportScopeContext | null
): boolean {
  if (!user) return false;

  // 1. Owner always has unrestricted access
  if (user.role === "owner") {
    return true;
  }

  // 2. Explicit boolean flag if present: fail-closed immediately if manageUsers is explicitly disabled
  if (user.manageUsers === false) {
    return false;
  }
  if (user.manageUsers === true) {
    return true;
  }

  // 3. Canonical permissions array check (manage_users or manageUsers)
  if (Array.isArray(user.permissions)) {
    return (
      user.permissions.includes("manage_users") ||
      user.permissions.includes("manageUsers")
    );
  }

  // Fail-closed for all other cases
  return false;
}


