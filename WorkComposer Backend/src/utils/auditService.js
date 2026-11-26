import { logAudit } from "./logAudit.js";

const extractMeta = (req) => {
  const ipAddress = req?.ip || req?.headers?.["x-forwarded-for"] || "";
  const platform =
    req?.headers?.["sec-ch-ua-platform"]?.replace(/"/g, "") ||
    (req?.headers?.["user-agent"] ? "Web" : "Unknown Platform");
  return { ipAddress, platform };
};

// ==================== USERS & AUTH ====================

export const auditLogin = async ({
  req,
  user,
  loginMethod = "Email & Password",
  appVersion = "1.0.0",
}) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: user?.organization?._id || user?.organization,
    performedBy: user?._id || user?.id,
    category: "Users",
    activity: "User logged in",
    details: {
      loginMethod,
      appVersion,
    },
    ipAddress,
    platform,
  });
};

export const auditLogout = async ({ req, user, reason = "User initiated" }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: user?.organization?._id || user?.organization,
    performedBy: user?._id || user?.id,
    category: "Users",
    activity: "User logged out",
    details: {
      reason,
    },
    ipAddress,
    platform,
  });
};

export const auditFailedLogin = async ({ req, email, organization, reason = "Invalid credentials" }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: organization?._id || organization || null,
    performedBy: null,
    category: "Users",
    activity: "Failed login attempt",
    details: {
      email,
      reason,
    },
    ipAddress,
    platform,
  });
};

export const auditPasswordChanged = async ({ req, user, method = "User Settings" }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: user?.organization?._id || user?.organization || req?.user?.organization,
    performedBy: user?._id || user?.id || req?.user?._id,
    category: "Users",
    activity: `Password updated via ${method}`,
    details: {
      userId: user?._id || user?.id || req?.user?._id,
      email: user?.email || req?.user?.email,
      method,
    },
    ipAddress,
    platform,
  });
};

export const audit2FAVerified = async ({ req, user, method = "Authenticator App" }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: user?.organization?._id || user?.organization,
    performedBy: user?._id || user?.id,
    category: "Users",
    activity: "Two-factor authentication verified",
    details: {
      method,
      userId: user?._id || user?.id,
    },
    ipAddress,
    platform,
  });
};

export const auditUserCreated = async ({ req, createdUser }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Users",
    activity: `Created user ${createdUser.firstName} ${createdUser.lastName}`.trim(),
    details: {
      user: {
        id: createdUser._id || createdUser.id,
        name: `${createdUser.firstName} ${createdUser.lastName}`.trim(),
        email: createdUser.email,
        role: createdUser.role,
      },
    },
    ipAddress,
    platform,
  });
};

export const auditUserInvited = async ({ req, invitedEmail, role, teamId = null }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Users",
    activity: `Invited user ${invitedEmail}`,
    details: {
      email: invitedEmail,
      role,
      teamId,
    },
    ipAddress,
    platform,
  });
};

export const auditUserUpdated = async ({ req, user, changes = {} }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Users",
    activity: `Updated user ${user.firstName} ${user.lastName}`.trim(),
    details: {
      userId: user._id || user.id,
      email: user.email,
      changes,
    },
    ipAddress,
    platform,
  });
};

export const auditUserDeleted = async ({ req, user }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Users",
    activity: `Deleted user ${user.firstName} ${user.lastName}`.trim(),
    details: {
      userId: user._id || user.id,
      email: user.email,
      role: user.role,
    },
    ipAddress,
    platform,
  });
};

export const auditRoleChanged = async ({ req, user, previousRole, newRole }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Users",
    activity: `Changed role for ${user.firstName} ${user.lastName}`.trim(),
    details: {
      previousRole,
      newRole,
      user: {
        id: user._id || user.id,
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
      },
    },
    ipAddress,
    platform,
  });
};

export const auditUserArchived = async ({ req, user }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Users",
    activity: `Archived user ${user.firstName} ${user.lastName}`.trim(),
    details: {
      user: {
        id: user._id || user.id,
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        role: user.role,
      },
    },
    ipAddress,
    platform,
  });
};

export const auditUserRestored = async ({ req, user }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Users",
    activity: `Restored user ${user.firstName} ${user.lastName}`.trim(),
    details: {
      user: {
        id: user._id || user.id,
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        role: user.role,
      },
    },
    ipAddress,
    platform,
  });
};

export const auditManagerAssigned = async ({ req, targetUser, managerUser = null, managerUsers = null }) => {
  const { ipAddress, platform } = extractMeta(req);
  const rawList = Array.isArray(managerUsers)
    ? managerUsers
    : Array.isArray(managerUser)
    ? managerUser
    : managerUser
    ? [managerUser]
    : [];
  const formattedManagers = rawList.filter(Boolean).map((m) => ({
    id: m._id || m.id,
    name: `${m.firstName || ""} ${m.lastName || ""}`.trim(),
  }));

  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Users",
    activity: `Assigned manager${formattedManagers.length > 1 ? "s" : ""} for ${targetUser.firstName} ${targetUser.lastName}`.trim(),
    details: {
      targetUser: {
        id: targetUser._id || targetUser.id,
        name: `${targetUser.firstName} ${targetUser.lastName}`.trim(),
      },
      manager: formattedManagers[0] || null,
      managers: formattedManagers,
    },
    ipAddress,
    platform,
  });
};

// ==================== TEAMS ====================

export const auditTeamCreated = async ({ req, team }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Teams",
    activity: `Created team ${team.name}`,
    details: {
      teamId: team._id || team.id,
      name: team.name,
      description: team.description || "",
    },
    ipAddress,
    platform,
  });
};

export const auditTeamUpdated = async ({ req, team, changes = {} }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Teams",
    activity: `Updated team ${team.name}`,
    details: {
      teamId: team._id || team.id,
      name: team.name,
      changes,
    },
    ipAddress,
    platform,
  });
};

export const auditTeamDeleted = async ({ req, team }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Teams",
    activity: `Deleted team ${team.name}`,
    details: {
      teamId: team._id || team.id,
      name: team.name,
    },
    ipAddress,
    platform,
  });
};

// ==================== ROLES ====================

export const auditRoleUpdated = async ({ req, role, changes = {} }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Roles",
    activity: `Updated permissions for role ${role.name || role.role}`,
    details: {
      roleId: role._id || role.id,
      roleName: role.name || role.role,
      changes,
    },
    ipAddress,
    platform,
  });
};

// ==================== ORGANIZATION ====================

export const auditOrgUpdated = async ({ req, organization, changes = {} }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: organization?._id || organization?.id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Organization",
    activity: "Updated organization profile",
    details: {
      changes,
    },
    ipAddress,
    platform,
  });
};

export const auditOrgDeleted = async ({ req, organization }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: organization?._id || organization?.id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Organization",
    activity: "Initiated organization deletion",
    details: {
      organizationId: organization?._id || organization?.id || req?.user?.organization,
    },
    ipAddress,
    platform,
  });
};

// ==================== SETTINGS & COMPLIANCE ====================

export const auditSettingsChanged = async ({
  req,
  setting,
  previousValue,
  newValue,
  affectedUser,
}) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Settings",
    activity: `Updated ${setting} for ${affectedUser.firstName} ${affectedUser.lastName}`.trim(),
    details: {
      setting,
      previousValue,
      newValue,
      affectedUser: {
        id: affectedUser._id || affectedUser.id,
        name: `${affectedUser.firstName} ${affectedUser.lastName}`.trim(),
        email: affectedUser.email,
      },
    },
    ipAddress,
    platform,
  });
};

export const auditTrackingSettingsUpdated = async ({ req, changes = {} }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Settings",
    activity: "Updated time tracking settings",
    details: {
      changes,
    },
    ipAddress,
    platform,
  });
};

export const audit2FASettingsUpdated = async ({ req, settings = {} }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Settings",
    activity: "Updated two-factor authentication enforcement policy",
    details: {
      settings,
    },
    ipAddress,
    platform,
  });
};

export const auditAppUpdateSettingsUpdated = async ({ req, settings = {} }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Settings",
    activity: "Updated desktop application update settings",
    details: {
      settings,
    },
    ipAddress,
    platform,
  });
};

export const auditEmailReportSettingsUpdated = async ({ req, settings = {} }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Settings",
    activity: "Updated email report settings",
    details: {
      settings,
    },
    ipAddress,
    platform,
  });
};

// ==================== PROJECTS & TASKS ====================

export const auditProjectCreated = async ({ req, project }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Projects",
    activity: `Created project ${project.name}`,
    details: {
      projectId: project._id || project.id,
      name: project.name,
      billable: project.billable,
    },
    ipAddress,
    platform,
  });
};

export const auditProjectUpdated = async ({ req, project, changes = {} }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Projects",
    activity: `Updated project ${project.name}`,
    details: {
      projectId: project._id || project.id,
      name: project.name,
      changes,
    },
    ipAddress,
    platform,
  });
};

export const auditProjectDeleted = async ({ req, project }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Projects",
    activity: `Deleted project ${project.name}`,
    details: {
      projectId: project._id || project.id,
      name: project.name,
    },
    ipAddress,
    platform,
  });
};

export const auditTaskCreated = async ({ req, task }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Tasks",
    activity: `Created task ${task.name}`,
    details: {
      taskId: task._id || task.id,
      name: task.name,
      projectId: task.project || task.projectId,
    },
    ipAddress,
    platform,
  });
};

export const auditTaskUpdated = async ({ req, task, changes = {} }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Tasks",
    activity: `Updated task ${task.name}`,
    details: {
      taskId: task._id || task.id,
      name: task.name,
      changes,
    },
    ipAddress,
    platform,
  });
};

export const auditTaskDeleted = async ({ req, task, permanent = false }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Tasks",
    activity: permanent ? `Permanently deleted task ${task.name}` : `Deleted task ${task.name}`,
    details: {
      taskId: task._id || task.id,
      name: task.name,
      permanent,
    },
    ipAddress,
    platform,
  });
};

export const auditTaskRestored = async ({ req, task }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Tasks",
    activity: `Restored task ${task.name}`,
    details: {
      taskId: task._id || task.id,
      name: task.name,
    },
    ipAddress,
    platform,
  });
};

// ==================== MANUAL TIME ====================

export const auditManualTimeRequested = async ({ req, request }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Settings",
    activity: "Requested manual time entry",
    details: {
      requestId: request._id || request.id,
      date: request.date,
      duration: request.duration,
      reason: request.reason,
    },
    ipAddress,
    platform,
  });
};

export const auditManualTimeApproved = async ({ req, request, reviewer }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: reviewer?._id || reviewer?.id || req?.user?._id,
    category: "Settings",
    activity: "Approved manual time request",
    details: {
      requestId: request._id || request.id,
      requestedBy: request.requestedBy || request.userId,
      date: request.date,
      duration: request.duration,
    },
    ipAddress,
    platform,
  });
};

export const auditManualTimeRejected = async ({ req, request, reason = "", reviewer }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: reviewer?._id || reviewer?.id || req?.user?._id,
    category: "Settings",
    activity: "Rejected manual time request",
    details: {
      requestId: request._id || request.id,
      requestedBy: request.requestedBy || request.userId,
      date: request.date,
      reason,
    },
    ipAddress,
    platform,
  });
};

// ==================== DEVICES & SESSIONS ====================

export const auditDeviceRegistered = async ({ req, user, device }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: user?.organization?._id || user?.organization || req?.user?.organization,
    performedBy: user?._id || user?.id || req?.user?._id,
    category: "Devices",
    activity: `Registered desktop device: ${device.deviceName || device.id || "Desktop Client"}`,
    details: {
      deviceId: device.deviceId || device.id,
      deviceName: device.deviceName,
      platform: device.platform || platform,
    },
    ipAddress,
    platform,
  });
};

export const auditDeviceRevoked = async ({ req, user, device }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: user?.organization?._id || user?.organization || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Devices",
    activity: `Revoked desktop device session: ${device.deviceName || device.id || "Desktop Client"}`,
    details: {
      deviceId: device.deviceId || device.id,
      deviceName: device.deviceName,
      targetUserId: user?._id || user?.id,
    },
    ipAddress,
    platform,
  });
};

export const auditSessionsPurged = async ({ req, startDate, endDate, deletedCount = 0 }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Desktop App",
    activity: `Deleted ${deletedCount} tracking sessions in range`,
    details: {
      startDate,
      endDate,
      deletedCount,
    },
    ipAddress,
    platform,
  });
};

// ==================== API KEYS & BILLING ====================

export const auditApiKeyGenerated = async ({ req, apiKey }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Settings",
    activity: `Generated API key ${apiKey.name || "API Key"}`,
    details: {
      keyId: apiKey._id || apiKey.id,
      name: apiKey.name,
      maskedKey: apiKey.key ? `${apiKey.key.slice(0, 8)}...${apiKey.key.slice(-4)}` : undefined,
    },
    ipAddress,
    platform,
  });
};

export const auditApiKeyDeleted = async ({ req, apiKey }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Settings",
    activity: `Deleted API key ${apiKey.name || "API Key"}`,
    details: {
      keyId: apiKey._id || apiKey.id,
      name: apiKey.name,
    },
    ipAddress,
    platform,
  });
};

export const auditBillingProfileUpdated = async ({ req, changes = {} }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Billing",
    activity: "Updated billing profile",
    details: {
      changes,
    },
    ipAddress,
    platform,
  });
};

export const auditPlanChanged = async ({ req, previousPlan, newPlan, interval }) => {
  const { ipAddress, platform } = extractMeta(req);
  await logAudit({
    organization: req?.user?.organization?._id || req?.user?.organization,
    performedBy: req?.user?._id || req?.user?.id,
    category: "Billing",
    activity: `Changed plan to ${newPlan}`,
    details: {
      previousPlan,
      newPlan,
      interval,
    },
    ipAddress,
    platform,
  });
};
