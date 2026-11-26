import Role from "../models/role.model.js";
import User from "../models/user.model.js";
import { resolveEffectiveAuthContext, normalizeId } from "../security/effectiveAuthContext.js";
import { ACCESS_SCOPES } from "../security/policyTypes.js";

let _testHooks = null;

export const setReportAccessTestHooks = (hooks) => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("setReportAccessTestHooks is disabled in production environment");
  }
  _testHooks = hooks;
};

export const getReportAccess = async (user) => {
  if (process.env.NODE_ENV !== "production" && _testHooks?.getReportAccess) {
    return _testHooks.getReportAccess(user);
  }

  if (!user) {
    return ACCESS_SCOPES.NONE;
  }

  const roleDoc = user.roleRef ? await Role.findById(user.roleRef) : null;
  const authContext = resolveEffectiveAuthContext(user, roleDoc);

  return authContext.effectiveReportAccess || ACCESS_SCOPES.NONE;
};

export const getReportUserIds = async (user) => {
  if (!user) {
    return [];
  }

  const callerOrgId = normalizeId(user.organizationId || user.organization);
  const callerUserId = normalizeId(user._id || user.id);

  if (!callerOrgId || !callerUserId) {
    return [];
  }

  const reportAccess = await getReportAccess(user);

  // 'none': completely deny report access to other users, return empty list of permitted users
  // Security invariant: 'none' cannot gain access through test hooks or caller-supplied IDs
  if (reportAccess === ACCESS_SCOPES.NONE || reportAccess === "none") {
    return [];
  }

  if (process.env.NODE_ENV !== "production" && _testHooks?.getReportUserIds) {
    return _testHooks.getReportUserIds(user);
  }

  // 'own': permitted only for caller self
  if (reportAccess === ACCESS_SCOPES.OWN || reportAccess === "own") {
    return [callerUserId];
  }

  // 'managed': permitted for caller self + direct subordinates strictly within caller organization
  if (reportAccess === ACCESS_SCOPES.MANAGED || reportAccess === "managed") {
    const managedUsers = await User.find({
      organization: callerOrgId,
      manager: callerUserId,
    }).select("_id");

    const managedIds = managedUsers.map((m) => normalizeId(m._id || m.id)).filter(Boolean);
    return [callerUserId, ...managedIds];
  }

  // 'all': permitted for all users in caller organization (signaled by null)
  if (reportAccess === ACCESS_SCOPES.ALL || reportAccess === "all") {
    return null;
  }

  // Unknown access scope: fail closed
  return [];
};
