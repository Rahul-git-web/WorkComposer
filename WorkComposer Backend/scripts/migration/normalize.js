import { to24HexId, deterministicId } from "./id.js";

/**
 * Statistics and warning trackers for normalizations
 */
export const normalizationStats = {
  emptyStringForeignKeys: {},
  monetaryNormalizations: 0,
  timestampNormalizations: 0,
  arrayNormalizations: 0,
};

/**
 * Safe FK normalizer: converts empty string "" to null for nullable foreign key fields.
 * Records metric for audit reports.
 */
export function normalizeForeignKey(val, fieldName) {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "") {
      normalizationStats.emptyStringForeignKeys[fieldName] =
        (normalizationStats.emptyStringForeignKeys[fieldName] || 0) + 1;
      return null;
    }
    return to24HexId(trimmed) || null;
  }
  if (val && typeof val.toString === "function") {
    const str = val.toString().trim();
    if (str === "") {
      normalizationStats.emptyStringForeignKeys[fieldName] =
        (normalizationStats.emptyStringForeignKeys[fieldName] || 0) + 1;
      return null;
    }
    return to24HexId(str) || null;
  }
  return null;
}

/**
 * Safe date normalizer: converts Mongo Dates / ISO strings to JavaScript Date objects.
 */
export function normalizeDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Monetary normalizer for Invoice.amount: rounds to exactly 2 decimal places.
 */
export function normalizeMonetaryAmount(val) {
  if (val === null || val === undefined) return 0.0;
  const num = Number(val);
  if (isNaN(num)) return 0.0;
  const rounded = parseFloat(num.toFixed(2));
  if (rounded !== num) {
    normalizationStats.monetaryNormalizations++;
  }
  return rounded;
}

/**
 * Safe string array normalizer.
 */
export function normalizeStringArray(arr) {
  if (!Array.isArray(arr)) return [];
  normalizationStats.arrayNormalizations++;
  return arr
    .map((item) => {
      if (item === null || item === undefined) return null;
      if (typeof item === "object" && item._id) return item._id.toString();
      return String(item).trim();
    })
    .filter(Boolean);
}

/**
 * Safe JSON deep cloner / preserver
 */
export function preserveJson(val) {
  if (val === null || val === undefined) return null;
  if (typeof val !== "object") return val;
  try {
    return JSON.parse(JSON.stringify(val));
  } catch {
    return val;
  }
}

/**
 * Model-Specific Document Transformers
 */
export const transformers = {
  Organization(doc) {
    return {
      id: to24HexId(doc._id),
      name: doc.name || "",
      ownerId: normalizeForeignKey(doc.owner, "Organization.ownerId"),
      logo: doc.logo || "",
      timezone: doc.timezone || "Asia/Kolkata",
      twoFactor: preserveJson(doc.twoFactor),
      appUpdates: preserveJson(doc.appUpdates),
      emailReports: preserveJson(doc.emailReports),
      taskManagement: preserveJson(doc.taskManagement),
      notifications: preserveJson(doc.notifications),
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  Role(doc) {
    return {
      id: to24HexId(doc._id),
      organizationId: normalizeForeignKey(doc.organization, "Role.organizationId"),
      name: doc.name || "",
      description: doc.description || "",
      permissions: normalizeStringArray(doc.permissions),
      reportAccess: doc.reportAccess || "none",
      screenshotAccess: doc.screenshotAccess || "none",
      isSystem: Boolean(doc.isSystem),
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  Team(doc) {
    return {
      id: to24HexId(doc._id),
      name: doc.name || "",
      description: doc.description || "",
      organizationId: normalizeForeignKey(doc.organization, "Team.organizationId"),
      createdById: normalizeForeignKey(doc.createdBy, "Team.createdById"),
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  User(doc) {
    return {
      id: to24HexId(doc._id),
      firstName: doc.firstName || "",
      lastName: doc.lastName || "",
      email: doc.email ? doc.email.toLowerCase().trim() : "",
      twoFactorCode: doc.twoFactorCode || null,
      twoFactorExpires: normalizeDate(doc.twoFactorExpires),
      jiraAccountId: doc.jiraAccountId || null,
      asanaAccountId: doc.asanaAccountId || null,
      bambooHREmployeeId: doc.bambooHREmployeeId || null,
      slackUserId: doc.slackUserId || null,
      avatar: doc.avatar || "",
      organizationId: normalizeForeignKey(doc.organization, "User.organizationId"),
      role: doc.role || "user",
      reportTimezone: doc.reportTimezone || "Browser timezone",
      roleRef: normalizeForeignKey(doc.roleRef, "User.roleRef"),
      teamId: normalizeForeignKey(doc.team, "User.teamId"),
      reportTeamId: normalizeForeignKey(doc.reportTeam, "User.reportTeamId"),
      managerId: normalizeForeignKey(doc.manager, "User.managerId"),
      weeklyReport: doc.weeklyReport !== undefined ? Boolean(doc.weeklyReport) : true,
      dailyReport: doc.dailyReport !== undefined ? Boolean(doc.dailyReport) : false,
      breakStartTime: normalizeDate(doc.breakStartTime),
      password: doc.password || null,
      googleId: doc.googleId && doc.googleId.trim() ? doc.googleId.trim() : null,
      microsoftId: doc.microsoftId && doc.microsoftId.trim() ? doc.microsoftId.trim() : null,
      appleId: doc.appleId && doc.appleId.trim() ? doc.appleId.trim() : null,
      authProvider: doc.authProvider || "local",
      isVerified: Boolean(doc.isVerified),
      isArchived: Boolean(doc.isArchived),
      verificationToken: doc.verificationToken || null,
      verificationTokenExpire: normalizeDate(doc.verificationTokenExpire),
      resetToken: doc.resetToken || null,
      resetTokenExpire: normalizeDate(doc.resetTokenExpire),
      lastDailyWarningEmail: normalizeDate(doc.lastDailyWarningEmail),
      lastWeeklyWarningEmail: normalizeDate(doc.lastWeeklyWarningEmail),
      workSpaceId: normalizeForeignKey(doc.workSpaceId, "User.workSpaceId"),
      appUpdateSettings: preserveJson(doc.appUpdateSettings),
      trackingSettings: preserveJson(doc.trackingSettings),
      screenCaptureSettings: preserveJson(doc.screenCaptureSettings),
      manualTimeSettings: preserveJson(doc.manualTimeSettings),
      shiftSettings: preserveJson(doc.shiftSettings),
      notificationSettings: preserveJson(doc.notificationSettings),
      emailReportSettings: preserveJson(doc.emailReportSettings),
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  UserDevice(userDoc, deviceSubdoc, index) {
    const userId = to24HexId(userDoc._id);
    const rawDeviceId = deviceSubdoc.deviceId || `dev_${index}`;
    // Preserve existing _id if present, else compute deterministic 24-hex ID
    const id = deviceSubdoc._id
      ? to24HexId(deviceSubdoc._id)
      : deterministicId(`user_device:${userId}:${rawDeviceId}`);

    return {
      id,
      userId,
      deviceId: rawDeviceId,
      ip: deviceSubdoc.ip || null,
      location: deviceSubdoc.location || null,
      platform: deviceSubdoc.platform || null,
      appVersion: deviceSubdoc.appVersion || null,
      hostname: deviceSubdoc.hostname || null,
      loginTime: normalizeDate(deviceSubdoc.loginTime) || new Date(),
      lastSync: normalizeDate(deviceSubdoc.lastSync) || new Date(),
      isOnline: Boolean(deviceSubdoc.isOnline),
      isTracking: Boolean(deviceSubdoc.isTracking),
      createdAt: normalizeDate(deviceSubdoc.loginTime) || normalizeDate(userDoc.createdAt) || new Date(),
    };
  },

  UserRefreshToken(userDoc, tokenSubdoc, index) {
    const userId = to24HexId(userDoc._id);
    const token = tokenSubdoc.token || `token_${index}`;
    const id = tokenSubdoc._id
      ? to24HexId(tokenSubdoc._id)
      : deterministicId(`user_token:${userId}:${token}`);

    return {
      id,
      userId,
      token,
      deviceId: tokenSubdoc.deviceId || null,
      createdAt: normalizeDate(tokenSubdoc.createdAt) || new Date(),
    };
  },

  TimeTrackingSettings(doc) {
    return {
      id: to24HexId(doc._id),
      organizationId: normalizeForeignKey(doc.organization, "TimeTrackingSettings.organizationId"),
      tracking: preserveJson(doc.trackingSettings || doc.tracking),
      screenCapture: preserveJson(doc.screenCaptureSettings || doc.screenCapture),
      manualTime: preserveJson(doc.manualTimeSettings || doc.manualTime),
      shift: preserveJson(doc.shiftSettings || doc.shift),
      productivity: preserveJson(doc.productivitySettings || doc.productivity),
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  BillingProfile(doc) {
    return {
      id: to24HexId(doc._id),
      organizationId: normalizeForeignKey(doc.organization, "BillingProfile.organizationId"),
      companyName: doc.companyName || "",
      contactName: doc.contactName || "",
      email: doc.email || "",
      address: doc.address || "",
      city: doc.city || "",
      state: doc.state || "",
      postalCode: doc.postalCode || "",
      country: doc.country || "",
      taxId: doc.taxId || "",
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  Subscription(doc) {
    return {
      id: to24HexId(doc._id),
      organizationId: normalizeForeignKey(doc.organization, "Subscription.organizationId"),
      plan: doc.plan || "standard",
      billingCycle: doc.billingCycle || "monthly",
      status: doc.status || "trial",
      stripeCustomerId: doc.stripeCustomerId || "",
      stripeSubscriptionId: doc.stripeSubscriptionId || "",
      stripePriceId: doc.stripePriceId || "",
      quantity: typeof doc.quantity === "number" ? doc.quantity : 1,
      startsAt: normalizeDate(doc.startsAt) || new Date(),
      expiresAt: normalizeDate(doc.expiresAt),
      trialEndsAt: normalizeDate(doc.trialEndsAt),
      cancelledAt: normalizeDate(doc.cancelledAt),
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  PaymentMethod(doc) {
    return {
      id: to24HexId(doc._id),
      organizationId: normalizeForeignKey(doc.organization, "PaymentMethod.organizationId"),
      brand: doc.brand || "",
      last4: doc.last4 || "",
      expiryMonth: typeof doc.expiryMonth === "number" ? doc.expiryMonth : null,
      expiryYear: typeof doc.expiryYear === "number" ? doc.expiryYear : null,
      cardholderName: doc.cardholderName || "",
      isDefault: doc.isDefault !== undefined ? Boolean(doc.isDefault) : true,
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  Invoice(doc) {
    return {
      id: to24HexId(doc._id),
      organizationId: normalizeForeignKey(doc.organization, "Invoice.organizationId"),
      invoiceNumber: doc.invoiceNumber || `INV-${to24HexId(doc._id)}`,
      amount: normalizeMonetaryAmount(doc.amount),
      currency: doc.currency || "USD",
      status: doc.status || "pending",
      billingPeriodStart: normalizeDate(doc.billingPeriodStart),
      billingPeriodEnd: normalizeDate(doc.billingPeriodEnd),
      issuedAt: normalizeDate(doc.issuedAt) || new Date(),
      paidAt: normalizeDate(doc.paidAt),
      pdfUrl: doc.pdfUrl || "",
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  ApiKey(doc) {
    return {
      id: to24HexId(doc._id),
      organizationId: normalizeForeignKey(doc.organization, "ApiKey.organizationId"),
      name: doc.name || "",
      keyHash: doc.keyHash || "",
      keyPreview: doc.keyPreview || "",
      createdById: normalizeForeignKey(doc.createdBy, "ApiKey.createdById"),
      isActive: doc.isActive !== undefined ? Boolean(doc.isActive) : true,
      lastUsedAt: normalizeDate(doc.lastUsedAt),
      lastUsedIp: doc.lastUsedIp || null,
      revokedAt: normalizeDate(doc.revokedAt),
      expiresAt: normalizeDate(doc.expiresAt),
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  Integration(doc) {
    return {
      id: to24HexId(doc._id),
      organizationId: normalizeForeignKey(doc.organization, "Integration.organizationId"),
      provider: doc.provider || "slack",
      apiKey: doc.apiKey || null,
      subdomain: doc.subdomain || null,
      connected: Boolean(doc.connected),
      accessToken: doc.accessToken || null,
      refreshToken: doc.refreshToken || null,
      expiresAt: normalizeDate(doc.expiresAt),
      cloudId: doc.cloudId || null,
      clientSecret: doc.clientSecret || null,
      siteUrl: doc.siteUrl || null,
      workspaceName: doc.workspaceName || null,
      accountId: doc.accountId || null,
      workspaceId: doc.workspaceId || null,
      slackChannelId: doc.slackChannelId || null,
      slackChannelName: doc.slackChannelName || null,
      notifications: preserveJson(doc.notifications),
      lastDailySummarySent: normalizeDate(doc.lastDailySummarySent),
      lastWeeklySummarySent: normalizeDate(doc.lastWeeklySummarySent),
      userId: doc.userId || null,
      email: doc.email || null,
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  AppClassification(doc) {
    return {
      id: to24HexId(doc._id),
      organizationId: normalizeForeignKey(doc.organization, "AppClassification.organizationId"),
      appName: doc.appName || "",
      productivity: doc.productivity || "neutral",
      preventBreakMode: Boolean(doc.preventBreakMode),
      disableIdleCalculation: Boolean(doc.disableIdleCalculation),
      excludedTeams: normalizeStringArray(doc.excludedTeams),
      excludedUsers: normalizeStringArray(doc.excludedUsers),
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  Project(doc) {
    return {
      id: to24HexId(doc._id),
      name: doc.name || "",
      jiraProjectId: doc.jiraProjectId || null,
      jiraProjectKey: doc.jiraProjectKey || null,
      asanaProjectId: doc.asanaProjectId || null,
      asanaWebhookId: doc.asanaWebhookId || null,
      provider: doc.provider || "workcomposer",
      teams: normalizeStringArray(doc.teams),
      organizationId: normalizeForeignKey(doc.organization, "Project.organizationId"),
      createdById: normalizeForeignKey(doc.createdBy, "Project.createdById"),
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  ProjectUser(projectDoc, userRef) {
    const projectId = to24HexId(projectDoc._id);
    const userId = to24HexId(userRef && userRef._id ? userRef._id : userRef);
    if (!projectId || !userId) return null;

    return {
      projectId,
      userId,
      createdAt: normalizeDate(projectDoc.createdAt) || new Date(),
    };
  },

  Task(doc) {
    let status = doc.status || "todo";
    if (status === "in-progress") status = "in_progress";

    return {
      id: to24HexId(doc._id),
      title: doc.title || "",
      description: doc.description || null,
      status,
      priority: doc.priority || "medium",
      projectId: normalizeForeignKey(doc.project, "Task.projectId"),
      jiraIssueId: doc.jiraIssueId || null,
      jiraIssueKey: doc.jiraIssueKey || null,
      asanaTaskId: doc.asanaTaskId || null,
      provider: doc.provider || "local",
      assignedToId: normalizeForeignKey(doc.assignedTo, "Task.assignedToId"),
      assignedById: normalizeForeignKey(doc.assignedBy, "Task.assignedById"),
      dueDate: normalizeDate(doc.dueDate),
      organizationId: normalizeForeignKey(doc.organization, "Task.organizationId"),
      deleted: Boolean(doc.deleted),
      deletedAt: normalizeDate(doc.deletedAt),
      deletedById: normalizeForeignKey(doc.deletedBy, "Task.deletedById"),
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  Comment(doc) {
    return {
      id: to24HexId(doc._id),
      taskId: normalizeForeignKey(doc.task, "Comment.taskId"),
      userId: normalizeForeignKey(doc.user, "Comment.userId"),
      content: doc.content || "",
      edited: Boolean(doc.edited),
      readBy: normalizeStringArray(doc.readBy),
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  Session(doc) {
    return {
      id: to24HexId(doc._id),
      userId: normalizeForeignKey(doc.userId || doc.user, "Session.userId"),
      projectId: normalizeForeignKey(doc.projectId || doc.project, "Session.projectId"),
      taskId: normalizeForeignKey(doc.taskId || doc.task, "Session.taskId"),
      startTime: normalizeDate(doc.startTime),
      endTime: normalizeDate(doc.endTime),
      duration: typeof doc.duration === "number" ? doc.duration : null,
      screenshots: typeof doc.screenshots === "number" ? doc.screenshots : null,
      date: doc.date || null,
      team: doc.team || "Default team",
      type: doc.type || "work",
      source: doc.source || "tracking",
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  Attendance(doc) {
    return {
      id: to24HexId(doc._id),
      userId: normalizeForeignKey(doc.userId || doc.user, "Attendance.userId"),
      organizationId: normalizeForeignKey(doc.organizationId || doc.organization, "Attendance.organizationId"),
      date: normalizeDate(doc.date) || new Date(),
      workTime: typeof doc.workTime === "number" ? doc.workTime : 0,
      breakTime: typeof doc.breakTime === "number" ? doc.breakTime : 0,
      startTime: normalizeDate(doc.startTime),
      finishTime: normalizeDate(doc.finishTime),
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  Timer(doc) {
    return {
      id: to24HexId(doc._id),
      userId: normalizeForeignKey(doc.userId || doc.user, "Timer.userId"),
      projectId: normalizeForeignKey(doc.projectId || doc.project, "Timer.projectId"),
      taskId: normalizeForeignKey(doc.taskId || doc.task, "Timer.taskId"),
      startTime: normalizeDate(doc.startTime),
      endTime: normalizeDate(doc.endTime),
      duration: typeof doc.duration === "number" ? doc.duration : 0,
      status: doc.status || "stopped",
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  ProjectTracking(doc) {
    return {
      id: to24HexId(doc._id),
      userId: normalizeForeignKey(doc.userId || doc.user, "ProjectTracking.userId"),
      projectId: normalizeForeignKey(doc.projectId || doc.project, "ProjectTracking.projectId"),
      taskId: normalizeForeignKey(doc.taskId || doc.task, "ProjectTracking.taskId"),
      startTime: normalizeDate(doc.startTime) || new Date(),
      endTime: normalizeDate(doc.endTime) || new Date(),
      duration: typeof doc.duration === "number" ? doc.duration : 0,
      date: doc.date || "",
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  ManualTimeRequest(doc) {
    return {
      id: to24HexId(doc._id),
      organizationId: normalizeForeignKey(doc.organizationId || doc.organization, "ManualTimeRequest.organizationId"),
      requestedById: normalizeForeignKey(doc.requestedById || doc.requestedBy, "ManualTimeRequest.requestedById"),
      projectId: normalizeForeignKey(doc.projectId || doc.project, "ManualTimeRequest.projectId"),
      taskId: normalizeForeignKey(doc.taskId || doc.task, "ManualTimeRequest.taskId"),
      type: doc.type || "work",
      startTime: normalizeDate(doc.startTime) || new Date(),
      endTime: normalizeDate(doc.endTime) || new Date(),
      duration: typeof doc.duration === "number" ? doc.duration : 0,
      date: doc.date || "",
      reason: doc.reason || "",
      status: doc.status || "pending",
      managerComment: doc.managerComment || "",
      approvedById: normalizeForeignKey(doc.approvedById || doc.approvedBy, "ManualTimeRequest.approvedById"),
      approvedAt: normalizeDate(doc.approvedAt),
      reportId: normalizeForeignKey(doc.reportId || doc.report, "ManualTimeRequest.reportId"),
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  Screenshot(doc) {
    return {
      id: to24HexId(doc._id),
      userId: normalizeForeignKey(doc.userId || doc.user, "Screenshot.userId"),
      projectId: normalizeForeignKey(doc.projectId || doc.project, "Screenshot.projectId"),
      taskId: normalizeForeignKey(doc.taskId || doc.task, "Screenshot.taskId"),
      imageUrl: doc.imageUrl || "",
      publicId: doc.publicId || "",
      capturedAt: normalizeDate(doc.capturedAt) || new Date(),
      appName: doc.appName || "",
      windowTitle: doc.windowTitle || "",
      keyPresses: typeof doc.keyPresses === "number" ? doc.keyPresses : 0,
      mouseClicks: typeof doc.mouseClicks === "number" ? doc.mouseClicks : 0,
      mouseMoves: typeof doc.mouseMoves === "number" ? doc.mouseMoves : 0,
      activityScore: typeof doc.activityScore === "number" ? doc.activityScore : 0,
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  Activity(doc) {
    return {
      id: to24HexId(doc._id),
      userId: normalizeForeignKey(doc.userId || doc.user, "Activity.userId"),
      projectId: normalizeForeignKey(doc.projectId || doc.project, "Activity.projectId"),
      taskId: normalizeForeignKey(doc.taskId || doc.task, "Activity.taskId"),
      date: doc.date || "",
      keyPresses: typeof doc.keyPresses === "number" ? doc.keyPresses : 0,
      mouseClicks: typeof doc.mouseClicks === "number" ? doc.mouseClicks : 0,
      mouseMoves: typeof doc.mouseMoves === "number" ? doc.mouseMoves : 0,
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  AppUsage(doc) {
    return {
      id: to24HexId(doc._id),
      userId: normalizeForeignKey(doc.userId || doc.user, "AppUsage.userId"),
      appName: doc.appName || "",
      windowTitle: doc.windowTitle || "",
      duration: typeof doc.duration === "number" ? doc.duration : 0,
      date: doc.date || "",
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  UsageLog(doc) {
    return {
      id: to24HexId(doc._id),
      userId: normalizeForeignKey(doc.userId || doc.user, "UsageLog.userId"),
      projectId: normalizeForeignKey(doc.projectId || doc.project, "UsageLog.projectId"),
      taskId: normalizeForeignKey(doc.taskId || doc.task, "UsageLog.taskId"),
      appName: doc.appName || "",
      windowTitle: doc.windowTitle || "",
      startTime: normalizeDate(doc.startTime) || new Date(),
      endTime: normalizeDate(doc.endTime) || new Date(),
      duration: typeof doc.duration === "number" ? doc.duration : 0,
      date: doc.date || "",
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  Location(doc) {
    return {
      id: to24HexId(doc._id),
      organizationId: normalizeForeignKey(doc.organizationId || doc.organization, "Location.organizationId"),
      userId: normalizeForeignKey(doc.userId || doc.user, "Location.userId"),
      latitude: typeof doc.latitude === "number" ? doc.latitude : 0,
      longitude: typeof doc.longitude === "number" ? doc.longitude : 0,
      accuracy: typeof doc.accuracy === "number" ? doc.accuracy : null,
      country: doc.country || "",
      state: doc.state || "",
      city: doc.city || "",
      postalCode: doc.postalCode || "",
      address: doc.address || "",
      ipAddress: doc.ipAddress || "",
      recordedAt: normalizeDate(doc.recordedAt) || new Date(),
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  Notification(doc) {
    return {
      id: to24HexId(doc._id),
      recipientId: normalizeForeignKey(doc.recipient, "Notification.recipientId"),
      organizationId: normalizeForeignKey(doc.organization, "Notification.organizationId"),
      type: doc.type || "system",
      title: doc.title || "",
      message: doc.message || "",
      entityType: doc.entityType || null,
      entityId: normalizeForeignKey(doc.entityId, "Notification.entityId"),
      metadata: preserveJson(doc.metadata),
      read: Boolean(doc.read),
      readAt: normalizeDate(doc.readAt),
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  AuditLog(doc) {
    let category = doc.category || "Settings";
    if (category === "Desktop App") category = "Desktop_App";
    if (category === "HR Leave Types") category = "HR_Leave_Types";

    return {
      id: to24HexId(doc._id),
      organizationId: normalizeForeignKey(doc.organization, "AuditLog.organizationId"),
      performedById: normalizeForeignKey(doc.performedBy, "AuditLog.performedById"),
      category,
      activity: doc.activity || "",
      details: preserveJson(doc.details),
      ipAddress: doc.ipAddress || "",
      platform: doc.platform || "",
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  ApiLog(doc) {
    return {
      id: to24HexId(doc._id),
      organizationId: normalizeForeignKey(doc.organization, "ApiLog.organizationId"),
      apiKeyId: normalizeForeignKey(doc.apiKey, "ApiLog.apiKeyId"),
      endpoint: doc.endpoint || "",
      method: doc.method || "GET",
      statusCode: typeof doc.statusCode === "number" ? doc.statusCode : 200,
      ipAddress: doc.ipAddress || null,
      userAgent: doc.userAgent || null,
      responseTime: typeof doc.responseTime === "number" ? doc.responseTime : 0,
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  Report(doc) {
    let type = doc.type ? String(doc.type).replace(/-/g, "_") : "productivity";

    return {
      id: to24HexId(doc._id),
      userId: normalizeForeignKey(doc.userId || doc.user, "Report.userId"),
      type,
      status: doc.status || "processing",
      fileUrl: doc.fileUrl || "",
      generatedAt: normalizeDate(doc.generatedAt),
      startDate: doc.startDate || "",
      endDate: doc.endDate || "",
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  Invite(doc) {
    return {
      id: to24HexId(doc._id),
      email: doc.email ? doc.email.toLowerCase().trim() : "",
      role: doc.role || "user",
      teamId: normalizeForeignKey(doc.teamId || doc.team, "Invite.teamId"),
      token: doc.token || `inv_${to24HexId(doc._id)}`,
      expireAt: normalizeDate(doc.expireAt) || new Date(),
      invitedById: normalizeForeignKey(doc.invitedById || doc.invitedBy, "Invite.invitedById"),
      organizationId: normalizeForeignKey(doc.organizationId || doc.organization, "Invite.organizationId"),
      isAccepted: Boolean(doc.isAccepted),
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  SyncStatus(doc) {
    return {
      id: to24HexId(doc._id),
      userId: normalizeForeignKey(doc.userId || doc.user, "SyncStatus.userId"),
      status: doc.status || "synced",
      lastSync: normalizeDate(doc.lastSync) || new Date(),
      pendingUploads: typeof doc.pendingUploads === "number" ? doc.pendingUploads : 0,
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },

  EmailChange(doc) {
    return {
      id: to24HexId(doc._id),
      userId: normalizeForeignKey(doc.userId || doc.user, "EmailChange.userId"),
      newEmail: doc.newEmail ? doc.newEmail.toLowerCase().trim() : "",
      token: doc.token || `emc_${to24HexId(doc._id)}`,
      expireAt: normalizeDate(doc.expireAt) || new Date(),
      createdAt: normalizeDate(doc.createdAt) || new Date(),
      updatedAt: normalizeDate(doc.updatedAt) || new Date(),
    };
  },
};

export default {
  transformers,
  normalizationStats,
  normalizeForeignKey,
  normalizeDate,
  normalizeMonetaryAmount,
  normalizeStringArray,
  preserveJson,
};
