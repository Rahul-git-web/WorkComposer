import Timer from "../models/timer.model.js";
import Role from "../models/role.model.js";
import { timerRepository } from "../db/repositories/timer.repository.js";
import { userRepository } from "../db/repositories/user.repository.js";
import { projectRepository } from "../db/repositories/project.repository.js";
import { taskRepository } from "../db/repositories/task.repository.js";
import { normalizeId, resolveEffectiveAuthContext } from "../security/effectiveAuthContext.js";
import { canMutateTimer } from "../security/policyEvaluator.js";
import { runTransaction } from "../db/transaction.js";
import { isDuplicateKeyError } from "../db/errors.js";

/**
 * GET /api/timers/active
 * Returns the authenticated user's currently active timer.
 * Rejects or isolates client-supplied userId to prevent cross-user leakage.
 */
export const getActiveTimer = async (req, res) => {
  try {
    const callerUserId = normalizeId(req.user._id || req.user.id);
    const callerOrgId = normalizeId(req.user.organizationId || req.user.organization);

    // Cross-user query protection: if client provides userId query param that doesn't match caller
    if (req.query.userId && normalizeId(req.query.userId) !== callerUserId) {
      const targetUserId = normalizeId(req.query.userId);
      const targetUser = await userRepository.findUserByIdAndOrganization(targetUserId, callerOrgId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      return res.status(403).json({
        message: "Access denied: Cannot access another user's active timer",
      });
    }

    const timer = await timerRepository.findActiveTimerByUser(callerUserId);
    return res.status(200).json(timer);
  } catch (err) {
    console.error("GET ACTIVE TIMER ERROR:", err);
    return res.status(500).json({
      message: "Failed to get active timer",
      error: "Failed to get active timer",
    });
  }
};

/**
 * GET /api/timers/active/:userId
 * Returns active timer for a user.
 * Self-service only: caller must match :userId.
 * Cross-user queries are denied (404 cross-tenant, 403 same-tenant).
 */
export const getActiveTimerByUser = async (req, res) => {
  try {
    const callerUserId = normalizeId(req.user._id || req.user.id);
    const callerOrgId = normalizeId(req.user.organizationId || req.user.organization);
    const targetUserId = normalizeId(req.params.userId);

    if (callerUserId !== targetUserId) {
      // Validate whether target user even exists in caller's organization
      const targetUser = await userRepository.findUserByIdAndOrganization(targetUserId, callerOrgId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      return res.status(403).json({
        message: "Access denied: Cannot access another user's active timer",
      });
    }

    const timer = await timerRepository.findActiveTimerByUser(callerUserId);
    return res.status(200).json(timer);
  } catch (err) {
    console.error("GET ACTIVE TIMER BY USER ERROR:", err);
    return res.status(500).json({
      message: "Failed to get active timer",
      error: "Failed to get active timer",
    });
  }
};

/**
 * POST /api/timers/start
 * Starts a timer for the authenticated caller.
 * Client-supplied body.userId cannot hijack timer ownership.
 */
export const startTimer = async (req, res) => {
  try {
    const callerUserId = normalizeId(req.user._id || req.user.id);
    const callerOrgId = normalizeId(req.user.organizationId || req.user.organization);

    // Identity protection: client cannot force creation of a timer for another user
    if (req.body.userId && normalizeId(req.body.userId) !== callerUserId) {
      return res.status(403).json({
        message: "Access denied: Cannot start timer for another user",
      });
    }

    // Authoritative effective authorization policy evaluation
    const roleDoc = req.user.roleRef ? await Role.findById(req.user.roleRef) : null;
    const authContext = resolveEffectiveAuthContext(req.user, roleDoc);
    const decision = canMutateTimer(
      authContext,
      { userId: callerUserId, organizationId: callerOrgId },
      "start"
    );
    if (!decision.allowed) {
      return res.status(403).json({ message: decision.reason });
    }

    // Tenant check for Project
    const projectId = req.body.projectId || req.body.project;
    if (projectId) {
      const proj = await projectRepository.findProjectByIdAndOrganization(projectId, callerOrgId);
      if (!proj) {
        return res.status(404).json({ message: "Project not found in organization" });
      }
    }

    // Tenant check for Task
    const taskId = req.body.taskId || req.body.task;
    if (taskId) {
      const task = await taskRepository.findOne({ _id: taskId, organization: callerOrgId });
      if (!task) {
        return res.status(404).json({ message: "Task not found in organization" });
      }
    }

    // Duplicate running timer prevention
    const existing = await timerRepository.findActiveTimerByUser(callerUserId);
    if (existing) {
      return res.status(400).json({
        message: "Timer already running",
      });
    }

    const newTimer = await timerRepository.create({
      user: callerUserId,
      project: projectId || null,
      task: taskId || null,
      startTime: new Date(),
      status: "running",
    });

    const populated = await timerRepository.findOne(
      { _id: newTimer._id },
      { populateProject: true, populateTask: true }
    );

    return res.status(200).json({
      message: "Timer started successfully",
      timer: populated,
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return res.status(400).json({
        message: "Timer already running",
      });
    }
    console.error("START TIMER ERROR:", err);
    return res.status(500).json({
      message: "Failed to start timer",
      error: "Failed to start timer",
    });
  }
};

/**
 * POST /api/timers/stop
 * POST /api/timers/:id/stop
 *
 * Stops the authenticated caller's active timer or specified timer.
 * Authenticates the caller, enforces ownership/tenant authorization, and atomically
 * transitions the Timer record to status "stopped", persisting endTime and duration.
 *
 * CONTRACT NOTE (MIG-REM-97J):
 * - This endpoint mutates the Timer row only; it is not a complete work-session recording API.
 * - Does NOT create Session or ProjectTracking records.
 * - Does NOT update user.breakStartTime.
 * - Does NOT emit Socket.IO real-time events or run daily warning checks.
 * - Downstream reports (attendance, daily/weekly summaries, project tracking) rely on Session
 *   and ProjectTracking records. Intervals stopped via this HTTP endpoint will not appear in
 *   those reports unless records are created through their respective domain APIs.
 * - The documented production desktop tracking workflow uses Socket.IO ("stopTimer") for the
 *   full tracking lifecycle. No production callers were found in the audited repository.
 * - Cross-user stop attempts are rejected (403 same-tenant, 404 cross-tenant).
 */
export const stopTimer = async (req, res) => {
  try {
    const callerUserId = normalizeId(req.user._id || req.user.id);
    const callerOrgId = normalizeId(req.user.organizationId || req.user.organization);

    const targetTimerId = req.params.id || req.body.timerId;

    let timer = null;

    if (targetTimerId) {
      // Look up specific timer by ID
      timer = await timerRepository.findById(targetTimerId);
      if (!timer) {
        return res.status(404).json({ message: "Timer not found" });
      }

      // Check ownership & tenant
      const timerOwnerId = normalizeId(timer.user || timer.userId);
      const targetUserInOrg = await userRepository.findUserByIdAndOrganization(timerOwnerId, callerOrgId);
      if (!targetUserInOrg) {
        // Cross-tenant timer reference -> 404 (zero information disclosure)
        return res.status(404).json({ message: "Timer not found" });
      }

      if (callerUserId !== timerOwnerId) {
        // Same-tenant cross-user stop attempt -> 403 Forbidden
        return res.status(403).json({
          message: "Access denied: You can only stop your own timer",
        });
      }
    } else {
      // Find caller's own running timer
      timer = await timerRepository.findActiveTimerByUser(callerUserId);
      if (!timer) {
        return res.status(404).json({ message: "No active running timer found" });
      }
    }

    if (timer.status === "stopped") {
      return res.status(400).json({ message: "Timer is already stopped" });
    }

    const roleDoc = req.user.roleRef ? await Role.findById(req.user.roleRef) : null;
    const authContext = resolveEffectiveAuthContext(req.user, roleDoc);
    const decision = canMutateTimer(
      authContext,
      {
        userId: normalizeId(timer.user || timer.userId),
        organizationId: callerOrgId,
      },
      "stop"
    );
    if (!decision.allowed) {
      return res.status(403).json({ message: decision.reason });
    }

    const endTime = new Date();
    const startTime = timer.startTime ? new Date(timer.startTime) : endTime;
    const duration = Math.max(0, Math.floor((endTime.getTime() - startTime.getTime()) / 1000));

    const timerOwnerId = normalizeId(timer.user || timer.userId);

    const stopResult = await runTransaction(async () => {
      const claim = await timerRepository.stopTimerIfRunning(
        timer._id,
        {
          endTime,
          duration,
          status: "stopped",
        },
        {
          userId: timerOwnerId,
          populateProject: true,
          populateTask: true,
        }
      );

      if (!claim || !claim.claimed || claim.count === 0) {
        return { claimed: false };
      }

      return { claimed: true, timer: claim.timer };
    });

    if (!stopResult || !stopResult.claimed) {
      return res.status(400).json({ message: "Timer is already stopped" });
    }

    return res.status(200).json({
      message: "Timer stopped successfully",
      timer: stopResult.timer,
    });
  } catch (err) {
    console.error("STOP TIMER ERROR:", err);
    return res.status(500).json({
      message: "Failed to stop timer",
      error: "Failed to stop timer",
    });
  }
};
