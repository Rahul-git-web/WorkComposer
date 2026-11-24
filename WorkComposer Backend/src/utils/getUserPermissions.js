import Role from "../models/role.model.js";
import { ALL_PERMISSIONS } from "./permissions.js";
import { resolveEffectiveAuthContext } from "../security/effectiveAuthContext.js";

export const getUserPermissions = async (user) => {
  if (!user) return [];

  // Owner always has every canonical permission
  if (user?.role === "owner") {
    return [...ALL_PERMISSIONS];
  }

  // No role assigned
  if (!user.roleRef) {
    return [];
  }

  const role = await Role.findById(user.roleRef);

  if (!role) {
    return [];
  }

  const authContext = resolveEffectiveAuthContext(user, role);
  return Array.from(authContext.effectivePermissions);
};
