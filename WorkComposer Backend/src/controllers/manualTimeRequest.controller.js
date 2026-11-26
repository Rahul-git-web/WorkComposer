import { checkSessionOverlap } from "../utils/session.js";
import sendEmail from "../utils/sendEmail.js";
import { generateTimeTrackingCSV } from "../services/reportExport.service.js";
import { createNotification } from "../services/notification.service.js";
import { resolveEffectiveAuthContext, normalizeId } from "../security/effectiveAuthContext.js";
import { canApproveManualTime, hasCapability } from "../security/policyEvaluator.js";
import { DECISION_CODES, ROLE_NAMES } from "../security/policyTypes.js";
import { manualTimeRequestRepository } from "../db/repositories/manualTimeRequest.repository.js";
import { sessionRepository } from "../db/repositories/session.repository.js";
import { timeTrackingSettingsRepository } from "../db/repositories/timeTrackingSettings.repository.js";
import { projectRepository } from "../db/repositories/project.repository.js";
import { taskRepository } from "../db/repositories/task.repository.js";
import { userRepository } from "../db/repositories/user.repository.js";
import { roleRepository } from "../db/repositories/role.repository.js";
import { reportRepository } from "../db/repositories/report.repository.js";
import { runTransaction } from "../db/transaction.js";
import { sendErrorResponse } from "../utils/sendErrorResponse.js";
import {
  resolveUserTimezone,
  getTodayInTimezone,
  getZonedDayRange,
  formatClockTime,
} from "../utils/timezone.js";
import { getIO } from "../socket/socket.js";
import {
  auditManualTimeRequested,
  auditManualTimeApproved,
  auditManualTimeRejected,
} from "../utils/auditService.js";

export const createRequest = async (req, res) => {
  try {
    const callerUserId = normalizeId(req.user?._id || req.user?.id);
    const callerOrgId = normalizeId(
      req.user?.organization?._id || req.user?.organizationId || req.user?.organization
    );

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const { startTime, endTime, duration, date, type, reason, project, task } = req.body;

    const settings = await timeTrackingSettingsRepository.findOne({
      organization: callerOrgId,
    });

    const callerUser = await userRepository.findById(callerUserId);
    const effectiveManualTime = {
      ...(settings?.manualTime || {}),
      ...Object.fromEntries(
        Object.entries(callerUser?.manualTimeSettings || {}).filter(
          ([, value]) => value !== null && value !== undefined,
        ),
      ),
    };

    if (!effectiveManualTime.allowManualTime) {
      return res.status(403).json({
        message: "Manual time is disabled by your organization.",
      });
    }

    if (effectiveManualTime.requireProjectTask && !project) {
      return res.status(400).json({
        message: "A project is required for manual time.",
      });
    }

    if (project) {
      const proj = await projectRepository.findProjectByIdAndOrganization(project, callerOrgId);
      if (!proj) {
        return res.status(400).json({
          message: "Invalid project.",
        });
      }
    }

    if (task) {
      const tsk = await taskRepository.findOne({
        _id: normalizeId(task),
        organization: callerOrgId,
      });
      if (!tsk) {
        return res.status(400).json({
          message: "Invalid task.",
        });
      }
    }

    const timezone = resolveUserTimezone(req.user, req);
    const backdatingLimit = effectiveManualTime.backdatingLimit ?? 0;

    if (backdatingLimit > 0) {
      const todayStr = getTodayInTimezone(timezone);
      const [tY, tM, tD] = todayStr.split("-").map(Number);
      const earliestDateObj = new Date(Date.UTC(tY, tM - 1, tD - backdatingLimit));
      const earliestDateStr = earliestDateObj.toISOString().split("T")[0];
      const earliestAllowedInstant = getZonedDayRange(earliestDateStr, timezone).start;

      const requestedStartInstant = new Date(startTime);
      if (requestedStartInstant < earliestAllowedInstant) {
        return res.status(400).json({
          message: `Manual time can only be added up to ${backdatingLimit} day(s) in the past.`,
        });
      }
    }

    if (!reason?.trim()) {
      return res.status(400).json({
        message: "Reason is required.",
      });
    }

    const existingSession = await checkSessionOverlap(
      callerUserId,
      startTime,
      endTime,
    );

    if (existingSession) {
      return res.status(400).json({
        message: "This time overlaps with an existing work session.",
      });
    }

    const existingRequest = await manualTimeRequestRepository.findOne({
      requestedBy: callerUserId,
      status: "pending",
      startTime: {
        lt: new Date(endTime),
      },
      endTime: {
        gt: new Date(startTime),
      },
    });

    if (existingRequest) {
      return res.status(400).json({
        message: "You already have a pending manual time request for this time period.",
      });
    }

    const callerRoleDoc = req.user.roleRef
      ? await roleRepository.findById(normalizeId(req.user.roleRef))
      : null;
    const callerAuthContext = resolveEffectiveAuthContext(req.user, callerRoleDoc);

    const bypassApproval =
      callerAuthContext.effectiveRoleName === ROLE_NAMES.OWNER || !effectiveManualTime.requireApproval;

    if (bypassApproval) {
      const session = await sessionRepository.create({
        userId: callerUserId,
        project: project ? normalizeId(project) : null,
        task: task ? normalizeId(task) : null,
        startTime,
        endTime,
        duration,
        date,
        type,
        source: "manual",
      });

      const reportType = type === "work" ? "manual-work-time" : "manual-break-time";

      const report = await reportRepository.create({
        user: callerUserId,
        type: reportType,
        status: "processing",
        startDate: date,
        endDate: date,
      });

      const callerName = `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || "User";
      await generateTimeTrackingCSV(
        report._id || report.id,
        [
          {
            employee: callerName,
            date,
            startTime: formatClockTime(startTime, timezone),
            endTime: formatClockTime(endTime, timezone),
            duration: `${Math.floor(duration / 3600)}h ${Math.floor(
              (duration % 3600) / 60,
            )}m`,
            type,
            project: project || "",
            task: task || "",
            reason: reason.trim(),
          },
        ],
        reportType,
      );

      if (report.save) {
        await report.save();
      }

      await auditManualTimeRequested({ req, request: session });

      return res.status(201).json({
        message: "Manual time added successfully.",
        session,
      });
    }

    const reportType = type === "work" ? "manual-work-time" : "manual-break-time";

    const report = await reportRepository.create({
      user: callerUserId,
      type: reportType,
      status: "processing",
      startDate: date,
      endDate: date,
    });

    const request = await manualTimeRequestRepository.create({
      organization: callerOrgId,
      requestedBy: callerUserId,
      project: project ? normalizeId(project) : null,
      task: task ? normalizeId(task) : null,
      startTime,
      endTime,
      duration,
      date,
      type,
      reason: reason.trim(),
      report: report._id,
    });

    const managers = await userRepository.find({
      organizationId: callerOrgId,
    });

    const callerName = `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || "User";

    await Promise.all(
      managers
        .filter((manager) => manager._id.toString() !== callerUserId)
        .map((manager) =>
          createNotification({
            recipientId: manager._id.toString(),
            organizationId: callerOrgId,
            type: "MANUAL_TIME_REQUEST",
            title: "Manual time request",
            message: `${callerName} submitted a manual time request.`,
            entityType: "manual_time_request",
            entityId: request._id.toString(),
            metadata: {
              requestedBy: callerUserId,
              date: request.date,
              startTime: request.startTime,
              endTime: request.endTime,
              duration: request.duration,
              type: request.type,
            },
          }),
        ),
    );

    report.status = "processing";
    report.generatedAt = new Date();
    if (typeof report.save === "function") {
      await report.save();
    }

    await auditManualTimeRequested({ req, request });

    return res.status(201).json({
      message: "Manual time request submitted for approval.",
      request,
    });
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to create manual time request", 500);
  }
};

export const getRequests = async (req, res) => {
  try {
    const callerUserId = normalizeId(req.user?._id || req.user?.id);
    const callerOrgId = normalizeId(
      req.user?.organization?._id || req.user?.organizationId || req.user?.organization
    );

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const callerRoleDoc = req.user.roleRef
      ? await roleRepository.findById(normalizeId(req.user.roleRef))
      : null;
    const callerAuthContext = resolveEffectiveAuthContext(req.user, callerRoleDoc);

    const query = {
      organization: callerOrgId,
    };

    const effectiveRole = callerAuthContext.effectiveRoleName;
    const isOrgAdmin =
      effectiveRole === ROLE_NAMES.OWNER ||
      effectiveRole === ROLE_NAMES.ADMIN ||
      hasCapability(callerAuthContext, "manage_users");

    if (isOrgAdmin) {
      // Organization administrative view
    } else if (effectiveRole === ROLE_NAMES.MANAGER) {
      const managedUsers = await userRepository.find({
        organization: callerOrgId,
        manager: callerUserId,
        deleted: false,
      });

      const managedUserIds = managedUsers.map((user) => user._id || user.id);
      query.requestedBy = {
        $in: [...managedUserIds, callerUserId],
      };
    } else {
      query.requestedBy = callerUserId;
    }

    if (req.query.status) {
      query.status = req.query.status;
    }

    const requests = await manualTimeRequestRepository.find(query, {
      populate: [
        {
          path: "requestedBy",
          select: "firstName lastName email avatar role team",
        },
        {
          path: "approvedBy",
          select: "firstName lastName",
        },
      ],
      sort: {
        createdAt: -1,
      },
    });

    res.json(requests);
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to fetch manual time requests", 500);
  }
};

export const approveRequest = async (req, res) => {
  try {
    const callerUserId = normalizeId(req.user?._id || req.user?.id);
    const callerOrgId = normalizeId(
      req.user?.organization?._id || req.user?.organizationId || req.user?.organization
    );

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const requestId = req.params.id;
    const request = await manualTimeRequestRepository.findRequestByIdAndOrganization(
      requestId,
      callerOrgId
    );

    if (!request) {
      return res.status(404).json({
        message: "Request not found.",
      });
    }

    const requesterId = normalizeId(
      request.requestedById ||
      request.requestedBy?._id ||
      request.requestedBy?.id ||
      request.requestedBy
    );

    const requester = await userRepository.findOne({
      _id: requesterId,
      organization: callerOrgId,
    });

    if (!requester) {
      return res.status(404).json({
        message: "Requester not found.",
      });
    }

    const settings = await timeTrackingSettingsRepository.findOne({
      organization: callerOrgId,
    });

    const effectiveSettings = {
      ...(settings || {}),
      manualTime: {
        ...(settings?.manualTime || {}),
        ...Object.fromEntries(
          Object.entries(requester?.manualTimeSettings || {}).filter(
            ([, value]) => value !== null && value !== undefined,
          ),
        ),
      },
    };

    const callerRoleDoc = req.user.roleRef
      ? await roleRepository.findById(normalizeId(req.user.roleRef))
      : null;
    const callerAuthContext = resolveEffectiveAuthContext(req.user, callerRoleDoc);

    const decision = canApproveManualTime(callerAuthContext, request, requester, effectiveSettings);
    if (!decision.allowed) {
      if (decision.code === DECISION_CODES.TENANT_MISMATCH) {
        return res.status(404).json({ message: "Request not found." });
      }
      return res.status(403).json({
        message: decision.reason || "You are not allowed to approve requests.",
      });
    }

    if (request.status !== "pending") {
      return res.status(400).json({
        message: "Request has already been processed.",
      });
    }

    const existingSession = await checkSessionOverlap(
      requesterId,
      request.startTime,
      request.endTime,
    );

    if (existingSession) {
      return res.status(400).json({
        message: "This request overlaps with an existing session.",
        existingSession,
      });
    }

    const txResult = await runTransaction(async (tx) => {
      // Re-validate request status atomically inside transaction using updateStatusIfPending
      const updatedCount = await manualTimeRequestRepository.updateStatusIfPending(
        request.id || request._id,
        {
          status: "approved",
          approvedBy: callerUserId,
          approvedAt: new Date(),
        }
      );

      if (updatedCount === 0) {
        const err = new Error("Request has already been processed.");
        err.statusCode = 400;
        throw err;
      }

      // Re-verify session overlap in ambient transaction
      const overlap = await checkSessionOverlap(
        requesterId,
        request.startTime,
        request.endTime
      );

      if (overlap) {
        const err = new Error("This request overlaps with an existing session.");
        err.statusCode = 400;
        err.existingSession = overlap;
        throw err;
      }

      // 1. Create the session
      const session = await sessionRepository.create({
        userId: requesterId,
        project: request.projectId || request.project || null,
        task: request.taskId || request.task || null,
        startTime: request.startTime,
        endTime: request.endTime,
        duration: request.duration,
        type: request.type,
        date: request.date,
        source: "manual",
      });

      // 2. Associated report update in database
      const reportId = request.reportId || request.report;
      let reportDoc = null;
      if (reportId) {
        reportDoc = await reportRepository.findById(reportId);
        if (reportDoc) {
          reportDoc = await reportRepository.findByIdAndUpdate(reportId, {
            status: "done",
            fileUrl: `/uploads/reports/${reportDoc.type || "manual"}-${reportDoc._id || reportDoc.id}.csv`,
            generatedAt: new Date(),
          });
        }
      }

      return {
        session,
        report: reportDoc,
      };
    });

    // POST-COMMIT EXTERNAL SIDE EFFECTS:
    // 1. File CSV generation outside transaction
    if (txResult.report) {
      try {
        const requesterName = `${requester.firstName || ""} ${requester.lastName || ""}`.trim() || "User";
        const requesterTz = resolveUserTimezone(requester, req);
        await generateTimeTrackingCSV(
          txResult.report._id,
          [
            {
              employee: requesterName,
              date: request.date,
              startTime: formatClockTime(request.startTime, requesterTz),
              endTime: formatClockTime(request.endTime, requesterTz),
              duration: `${Math.floor(request.duration / 3600)}h ${Math.floor(
                (request.duration % 3600) / 60,
              )}m`,
              type: request.type,
              project: request.project?.name || request.project || "",
              task: request.task?.title || request.task || "",
              reason: request.reason || "",
            },
          ],
          txResult.report.type,
        );
      } catch (exportErr) {
        console.error("GENERATE CSV ERROR POST-COMMIT (approveRequest):", exportErr);
      }
    }

    // 2. Dispatch notifications outside transaction
    try {
      await createNotification({
        recipientId: requesterId,
        organizationId: callerOrgId,
        type: "MANUAL_TIME_APPROVED",
        title: "Manual time approved",
        message: `Your manual ${request.type} time request for ${request.date} was approved.`,
        entityType: "manual_time_request",
        entityId: String(request.id || request._id),
        metadata: {
          date: request.date,
          startTime: request.startTime,
          endTime: request.endTime,
          duration: request.duration,
          approvedBy: callerUserId,
        },
      });
    } catch (notifErr) {
      console.error("NOTIFICATION ERROR POST-COMMIT (approveRequest):", notifErr);
    }

    try {
      const io = getIO();
      if (io) {
        const targetUserId = normalizeId(
          request.requestedById ||
            request.requestedBy?._id ||
            request.requestedBy?.id ||
            request.requestedBy ||
            requesterId
        );
        io.to(`user:${targetUserId}`).emit("session:updated", {
          userId: targetUserId,
          type: "manual-time-approved",
        });
      }
    } catch (sockErr) {
      console.error("SOCKET EMIT ERROR (approveRequest):", sockErr);
    }

    await auditManualTimeApproved({ req, request, reviewer: req.user });

    return res.json({
      message: "Request approved successfully.",
      session: txResult.session,
    });
  } catch (err) {
    if (err.statusCode) {
      const responsePayload = { message: err.message };
      if (err.existingSession) {
        responsePayload.existingSession = err.existingSession;
      }
      return res.status(err.statusCode).json(responsePayload);
    }
    return sendErrorResponse(res, err, "Failed to approve manual time request", 500);
  }
};

export const rejectRequest = async (req, res) => {
  try {
    const callerUserId = normalizeId(req.user?._id || req.user?.id);
    const callerOrgId = normalizeId(
      req.user?.organization?._id || req.user?.organizationId || req.user?.organization
    );

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const { comment } = req.body || {};
    const requestId = req.params.id;

    const request = await manualTimeRequestRepository.findRequestByIdAndOrganization(
      requestId,
      callerOrgId
    );

    if (!request) {
      return res.status(404).json({
        message: "Request not found.",
      });
    }

    const requesterId = normalizeId(
      request.requestedById ||
      request.requestedBy?._id ||
      request.requestedBy?.id ||
      request.requestedBy
    );

    const requester = await userRepository.findOne({
      _id: requesterId,
      organization: callerOrgId,
    });

    if (!requester) {
      return res.status(404).json({
        message: "Requester not found.",
      });
    }

    const settings = await timeTrackingSettingsRepository.findOne({
      organization: callerOrgId,
    });

    const effectiveSettings = {
      ...(settings || {}),
      manualTime: {
        ...(settings?.manualTime || {}),
        ...Object.fromEntries(
          Object.entries(requester?.manualTimeSettings || {}).filter(
            ([, value]) => value !== null && value !== undefined,
          ),
        ),
      },
    };

    const callerRoleDoc = req.user.roleRef
      ? await roleRepository.findById(normalizeId(req.user.roleRef))
      : null;
    const callerAuthContext = resolveEffectiveAuthContext(req.user, callerRoleDoc);

    const decision = canApproveManualTime(callerAuthContext, request, requester, effectiveSettings);
    if (!decision.allowed) {
      if (decision.code === DECISION_CODES.TENANT_MISMATCH) {
        return res.status(404).json({ message: "Request not found." });
      }
      return res.status(403).json({
        message: decision.reason || "You are not allowed to approve requests.",
      });
    }

    if (request.status !== "pending") {
      return res.status(400).json({
        message: "Request has already been processed.",
      });
    }

    const managerComment = comment || "";

    const txResult = await runTransaction(async (tx) => {
      // 1. Atomic status transition: pending -> rejected
      const updatedCount = await manualTimeRequestRepository.updateStatusIfPending(
        request.id || request._id,
        {
          status: "rejected",
          managerComment,
          approvedBy: callerUserId,
          approvedAt: new Date(),
        }
      );

      if (updatedCount === 0) {
        const err = new Error("Request has already been processed.");
        err.statusCode = 400;
        throw err;
      }

      // 2. Associated report update in database
      const reportId = request.reportId || request.report;
      let reportDoc = null;
      if (reportId) {
        reportDoc = await reportRepository.findById(reportId);
        if (reportDoc) {
          reportDoc = await reportRepository.findByIdAndUpdate(reportId, {
            status: "failed",
          });
        }
      }

      return {
        report: reportDoc,
      };
    });

    // POST-COMMIT EXTERNAL SIDE EFFECTS:
    // 1. Dispatch notifications outside transaction
    try {
      await createNotification({
        recipientId: requesterId,
        organizationId: callerOrgId,
        type: "MANUAL_TIME_REJECTED",
        title: "Manual time rejected",
        message: `Your manual ${request.type} time request for ${request.date} was rejected.`,
        entityType: "manual_time_request",
        entityId: String(request.id || request._id),
        metadata: {
          date: request.date,
          startTime: request.startTime,
          endTime: request.endTime,
          duration: request.duration,
          comment: managerComment,
          rejectedBy: callerUserId,
        },
      });
    } catch (notifErr) {
      console.error("NOTIFICATION ERROR POST-COMMIT (rejectRequest):", notifErr);
    }

    // 2. Dispatch email outside transaction
    if (requester.email) {
      try {
        await sendEmail(
          requester.email,
          "Manual Time Request Rejected",
          `
        <h2>Manual Time Request Rejected</h2>
        <p>Hello ${requester.firstName || "User"},</p>
        <p>Your manual <strong>${request.type}</strong> request has been rejected.</p>
        <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td><strong>Date</strong></td>
            <td>${request.date}</td>
          </tr>
          <tr>
            <td><strong>Time</strong></td>
            <td>
              ${formatClockTime(request.startTime, resolveUserTimezone(requester, req))} - ${formatClockTime(request.endTime, resolveUserTimezone(requester, req))}
            </td>
          </tr>
          <tr>
            <td><strong>Reason from Manager</strong></td>
            <td>${managerComment}</td>
          </tr>
        </table>
        <p>If you believe this request was rejected by mistake, please contact your manager.</p>
        <br/>
        <p><strong>WorkComposer</strong></p>
      `,
        );
      } catch (mailErr) {
        console.error("Rejection email dispatch failed:", mailErr.message);
      }
    }

    await auditManualTimeRejected({ req, request, reason: managerComment, reviewer: req.user });

    return res.json({
      message: "Request rejected successfully.",
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    return sendErrorResponse(res, err, "Failed to reject manual time request", 500);
  }
};

export const getPendingCount = async (req, res) => {
  try {
    const callerUserId = normalizeId(req.user?._id || req.user?.id);
    const callerOrgId = normalizeId(
      req.user?.organization?._id || req.user?.organizationId || req.user?.organization
    );

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const callerRoleDoc = req.user.roleRef
      ? await roleRepository.findById(normalizeId(req.user.roleRef))
      : null;
    const callerAuthContext = resolveEffectiveAuthContext(req.user, callerRoleDoc);

    const query = {
      organization: callerOrgId,
      status: "pending",
    };

    const effectiveRole = callerAuthContext.effectiveRoleName;
    const isOrgAdmin =
      effectiveRole === ROLE_NAMES.OWNER ||
      effectiveRole === ROLE_NAMES.ADMIN ||
      hasCapability(callerAuthContext, "manage_users");

    if (isOrgAdmin) {
      // All pending in org
    } else if (effectiveRole === ROLE_NAMES.MANAGER) {
      const managedUsers = await userRepository.find({
        organization: callerOrgId,
        manager: callerUserId,
        deleted: false,
      });

      query.requestedBy = {
        $in: managedUsers.map((user) => user._id || user.id),
      };
    } else {
      query.requestedBy = callerUserId;
    }

    const count = await manualTimeRequestRepository.countDocuments(query);
    res.json({
      count,
    });
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to fetch pending requests count", 500);
  }
};
