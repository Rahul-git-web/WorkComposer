import { Server } from "socket.io";
import { sessionRepository } from "../db/repositories/session.repository.js";
import User from "../models/user.model.js";
import Role from "../models/role.model.js";
import ProjectTracking from "../models/projectTracking.model.js";
import { updateSyncStatus } from "../utils/updateSyncStatus.js";
import jwt from "jsonwebtoken";
import cookie from "cookie";
import { checkDailyWarning } from "../services/emailReport.service.js";
import { timerRepository } from "../db/repositories/timer.repository.js";
import { userRepository } from "../db/repositories/user.repository.js";
import { projectRepository } from "../db/repositories/project.repository.js";
import { taskRepository } from "../db/repositories/task.repository.js";
import { normalizeId, resolveEffectiveAuthContext } from "../security/effectiveAuthContext.js";
import { canMutateTimer } from "../security/policyEvaluator.js";
import { runTransaction } from "../db/transaction.js";
import { isDuplicateKeyError } from "../db/errors.js";
import { resolveUserTimezone, getDateInTimezone } from "../utils/timezone.js";

let io;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: [
        process.env.FRONTEND_URL,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ].filter(Boolean),
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  // Strict Authoritative Socket.IO Authentication Middleware
  io.use(async (socket, next) => {
    try {
      let token = socket.handshake.auth?.token;

      if (!token) {
        const cookieHeader = socket.handshake.headers.cookie;
        if (cookieHeader) {
          const cookies = cookie.parse(cookieHeader);
          token = cookies.accessToken;
        }
      }

      if (!token && socket.handshake.headers?.authorization) {
        const authHeader = socket.handshake.headers.authorization;
        if (authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }

      if (!token) {
        return next(new Error("Unauthorized"));
      }

      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (err) {
        if (err.name === "TokenExpiredError") {
          return next(new Error("TOKEN_EXPIRED"));
        }
        return next(new Error("Unauthorized"));
      }

      if (!decoded?.userId) {
        return next(new Error("Invalid token"));
      }

      const userId = normalizeId(decoded.userId);
      if (!userId) {
        return next(new Error("Invalid token"));
      }

      const user = await userRepository.findById(userId);
      if (!user) {
        return next(new Error("User not found"));
      }

      const orgId = normalizeId(user.organizationId || user.organization);
      if (!orgId) {
        return next(new Error("User organization missing"));
      }

      // Resolve caller EffectiveAuthContext authoritatively from authoritative DB
      const callerRoleDoc = user.roleRef ? await Role.findById(user.roleRef) : null;
      const authContext = resolveEffectiveAuthContext(user, callerRoleDoc);

      if (!authContext || !authContext.userId || !authContext.organizationId) {
        return next(new Error("Unauthorized: Invalid authorization context"));
      }

      // Establish trusted, authoritative context on socket
      socket.user = user;
      socket.userId = userId;
      socket.organizationId = orgId;
      socket.authContext = authContext;

      next();
    } catch (err) {
      console.error("SOCKET AUTH ERROR:", err.message);
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    console.info("Socket connected:", socket.id, "User:", socket.userId, "Org:", socket.organizationId);

    // Auto-join authenticated user room and organization room
    socket.join(`user:${socket.userId}`);
    socket.join(`organization:${socket.organizationId}`);

    // JOIN ORGANIZATION (Strict Tenant Boundary)
    socket.on("joinOrganization", (requestedOrgId, ack) => {
      const targetOrgId = normalizeId(requestedOrgId);

      // Sockets may ONLY join their own authoritative organization room
      if (!targetOrgId || targetOrgId !== socket.organizationId) {
        if (typeof ack === "function") {
          return ack({ status: "error", message: "Access denied" });
        }
        return socket.emit("organizationError", "Access denied");
      }

      socket.join(`organization:${socket.organizationId}`);
      if (typeof ack === "function") {
        return ack({ status: "success" });
      }
    });

    // THEME PREFERENCE SYNCHRONIZATION
    socket.on("updateThemePreference", (data) => {
      const themeMode = data?.themeMode;
      if (
        themeMode === "system" ||
        themeMode === "light" ||
        themeMode === "dark"
      ) {
        if (socket.userId) {
          socket
            .to(`user:${socket.userId}`)
            .emit("themePreferenceUpdated", { themeMode });
        }
      }
    });

    // START TIMER
    socket.on("startTimer", async (data, ack) => {
      try {
        const callerUserId = socket.userId;
        const callerOrgId = socket.organizationId;

        // Identity invariant: Client data.userId cannot override authenticated identity
        if (data?.userId && normalizeId(data.userId) !== callerUserId) {
          const errMsg = "Access denied: Cannot start timer for another user";
          socket.emit("timerError", errMsg);
          if (typeof ack === "function") ack({ error: errMsg });
          return;
        }

        // Authoritative policy evaluation
        const decision = canMutateTimer(
          socket.authContext,
          { userId: callerUserId, organizationId: callerOrgId },
          "start"
        );
        if (!decision.allowed) {
          socket.emit("timerError", decision.reason);
          if (typeof ack === "function") ack({ error: decision.reason });
          return;
        }

        // Duplicate running timer prevention
        const existing = await timerRepository.findActiveTimerByUser(callerUserId);
        if (existing) {
          const errMsg = "Timer already running";
          socket.emit("timerError", errMsg);
          if (typeof ack === "function") ack({ error: errMsg });
          return;
        }

        // Tenant-scoped Project validation
        const projectId = data?.projectId || data?.project;
        let proj = null;
        if (projectId) {
          proj = await projectRepository.findProjectByIdAndOrganization(projectId, callerOrgId);
          if (!proj) {
            const errMsg = "Project not found in organization";
            socket.emit("timerError", errMsg);
            if (typeof ack === "function") ack({ error: errMsg });
            return;
          }
        }

        // Tenant-scoped Task validation with soft-deleted exclusion
        const taskId = data?.taskId || data?.task;
        let task = null;
        if (taskId) {
          task = await taskRepository.findOne({ _id: taskId, organization: callerOrgId, deleted: false });
          if (!task) {
            const errMsg = "Task not found in organization";
            socket.emit("timerError", errMsg);
            if (typeof ack === "function") ack({ error: errMsg });
            return;
          }

          // Enforce task assignment authorization: caller can only track tasks assigned to them
          const assignedToId = normalizeId(task.assignedTo?._id || task.assignedTo);
          if (!assignedToId || assignedToId !== callerUserId) {
            const errMsg = "You can only track tasks assigned to you.";
            socket.emit("timerError", errMsg);
            if (typeof ack === "function") ack({ error: errMsg });
            return;
          }
        }

        // Validate project/task relationship and derive project from task if omitted
        let resolvedProjectId = proj ? normalizeId(proj._id || proj.id) : null;
        if (task) {
          const taskProjId = normalizeId(task.project?._id || task.project || task.projectId);
          if (resolvedProjectId && taskProjId && taskProjId !== resolvedProjectId) {
            const errMsg = "Invalid project/task relationship";
            socket.emit("timerError", errMsg);
            if (typeof ack === "function") ack({ error: errMsg });
            return;
          }
          if (!resolvedProjectId && taskProjId) {
            const derivedProj = await projectRepository.findProjectByIdAndOrganization(taskProjId, callerOrgId);
            if (!derivedProj) {
              const errMsg = "Project not found in organization";
              socket.emit("timerError", errMsg);
              if (typeof ack === "function") ack({ error: errMsg });
              return;
            }
            resolvedProjectId = normalizeId(derivedProj._id || derivedProj.id);
          }
        }

        // Handle break if applicable
        const freshUser = await userRepository.findById(callerUserId);
        if (freshUser?.breakStartTime) {
          const breakStart = new Date(freshUser.breakStartTime);
          const breakEnd = new Date();

          if (breakStart.toDateString() === breakEnd.toDateString()) {
            const breakDuration = Math.max(0, Math.floor((breakEnd - breakStart) / 1000));
            const timezone = resolveUserTimezone(freshUser || socket.user, socket);
            const sessionDate = getDateInTimezone(breakStart, timezone);

            await sessionRepository.create({
              userId: callerUserId,
              startTime: breakStart,
              endTime: breakEnd,
              duration: breakDuration,
              type: "break",
              date: sessionDate,
            });

            await updateSyncStatus(callerUserId);
          } else {
            console.info("Ignoring overnight break");
          }

          await userRepository.findByIdAndUpdate(callerUserId, { breakStartTime: null });
        }

        // Authoritative timer creation for authenticated caller
        const createdTimer = await timerRepository.create({
          user: callerUserId,
          project: resolvedProjectId || null,
          task: taskId || null,
          startTime: new Date(),
          status: "running",
        });

        const timer = await timerRepository.findOne(
          { _id: createdTimer._id },
          { populateProject: true, populateTask: true }
        );

        socket.emit("timerStarted", timer);
        io.to(`user:${callerUserId}`).emit("tracking:started", timer);
        if (typeof ack === "function") ack({ success: true, timer });
      } catch (err) {
        if (isDuplicateKeyError(err)) {
          const errMsg = "Timer already running";
          socket.emit("timerError", errMsg);
          if (typeof ack === "function") ack({ error: errMsg });
          return;
        }
        console.error("SOCKET startTimer ERROR:", err.message);
        socket.emit("timerError", "Internal error starting timer");
        if (typeof ack === "function") ack({ error: "Internal error starting timer" });
      }
    });

    // SWITCH TASK
    socket.on("switchTask", async (data, ack) => {
      try {
        const callerUserId = socket.userId;
        const callerOrgId = socket.organizationId;

        // Identity invariant: Client data.userId cannot override authenticated identity
        if (data?.userId && normalizeId(data.userId) !== callerUserId) {
          const errMsg = "Access denied: Cannot switch task for another user";
          socket.emit("timerError", errMsg);
          if (typeof ack === "function") ack({ error: errMsg });
          return;
        }

        // Authoritative policy evaluation
        const decision = canMutateTimer(
          socket.authContext,
          { userId: callerUserId, organizationId: callerOrgId },
          "stop"
        );
        if (!decision.allowed) {
          socket.emit("timerError", decision.reason);
          if (typeof ack === "function") ack({ error: decision.reason });
          return;
        }

        // Tenant check for target project
        const projectId = data?.projectId || data?.project;
        let proj = null;
        if (projectId) {
          proj = await projectRepository.findProjectByIdAndOrganization(projectId, callerOrgId);
          if (!proj) {
            const errMsg = "Project not found in organization";
            socket.emit("timerError", errMsg);
            if (typeof ack === "function") ack({ error: errMsg });
            return;
          }
        }

        // Tenant check for target task
        const taskId = data?.taskId || data?.task;
        let task = null;
        if (taskId) {
          task = await taskRepository.findOne({ _id: taskId, organization: callerOrgId, deleted: false });
          if (!task) {
            const errMsg = "Task not found in organization";
            socket.emit("timerError", errMsg);
            if (typeof ack === "function") ack({ error: errMsg });
            return;
          }

          // Enforce task assignment authorization: caller can only track tasks assigned to them
          const assignedToId = normalizeId(task.assignedTo?._id || task.assignedTo);
          if (!assignedToId || assignedToId !== callerUserId) {
            const errMsg = "You can only track tasks assigned to you.";
            socket.emit("timerError", errMsg);
            if (typeof ack === "function") ack({ error: errMsg });
            return;
          }
        }

        // Validate project/task relationship and derive project from task if omitted
        let resolvedProjectId = proj ? normalizeId(proj._id || proj.id) : null;
        if (task) {
          const taskProjId = normalizeId(task.project?._id || task.project || task.projectId);
          if (resolvedProjectId && taskProjId && taskProjId !== resolvedProjectId) {
            const errMsg = "Invalid project/task relationship";
            socket.emit("timerError", errMsg);
            if (typeof ack === "function") ack({ error: errMsg });
            return;
          }
          if (!resolvedProjectId && taskProjId) {
            const derivedProj = await projectRepository.findProjectByIdAndOrganization(taskProjId, callerOrgId);
            if (!derivedProj) {
              const errMsg = "Project not found in organization";
              socket.emit("timerError", errMsg);
              if (typeof ack === "function") ack({ error: errMsg });
              return;
            }
            resolvedProjectId = normalizeId(derivedProj._id || derivedProj.id);
          }
        }

        // Find caller's active running timer (strictly scoped to caller)
        const runningTimer = await timerRepository.findActiveTimerByUser(callerUserId);
        if (!runningTimer) {
          const errMsg = "No active running timer found";
          socket.emit("timerError", errMsg);
          if (typeof ack === "function") ack({ error: errMsg });
          return;
        }

        const endTime = new Date();
        const startTime = runningTimer.startTime ? new Date(runningTimer.startTime) : endTime;
        const duration = Math.max(0, Math.floor((endTime.getTime() - startTime.getTime()) / 1000));

        const switchResult = await runTransaction(async () => {
          // Atomically claim stop transition for current running timer
          const claim = await timerRepository.stopTimerIfRunning(
            runningTimer._id,
            {
              endTime,
              duration,
              status: "stopped",
            },
            {
              userId: callerUserId,
              populateProject: true,
              populateTask: true,
            }
          );

          if (!claim || !claim.claimed || claim.count === 0) {
            return { claimed: false };
          }

          const claimedTimer = claim.timer || runningTimer;
          const claimedStartTime = claimedTimer.startTime ? new Date(claimedTimer.startTime) : startTime;

          const timezone = resolveUserTimezone(socket.user, socket);
          const sessionDate = getDateInTimezone(claimedStartTime, timezone);

          // Save work session
          await sessionRepository.create({
            userId: callerUserId,
            startTime: claimedStartTime,
            endTime,
            duration,
            type: "work",
            date: sessionDate,
          });

          // Authoritatively derive previous interval's tracking project and task from freshly claimed timer
          const trackingProjectCandidate =
            claim.timer && (Object.prototype.hasOwnProperty.call(claim.timer, "project") || Object.prototype.hasOwnProperty.call(claim.timer, "projectId"))
              ? (claim.timer.project !== undefined ? claim.timer.project : claim.timer.projectId)
              : (runningTimer.project ?? runningTimer.projectId);

          const trackingTaskCandidate =
            claim.timer && (Object.prototype.hasOwnProperty.call(claim.timer, "task") || Object.prototype.hasOwnProperty.call(claim.timer, "taskId"))
              ? (claim.timer.task !== undefined ? claim.timer.task : claim.timer.taskId)
              : (runningTimer.task ?? runningTimer.taskId);

          const trackingProjectId = normalizeId(trackingProjectCandidate);
          const trackingTaskId = normalizeId(trackingTaskCandidate);

          // Save project tracking only for task timers
          if (trackingProjectId && trackingTaskId) {
            await ProjectTracking.create({
              user: callerUserId,
              project: trackingProjectId,
              task: trackingTaskId,
              startTime: claimedStartTime,
              endTime,
              duration,
              date: claimedStartTime.toISOString().split("T")[0],
            });
          }

          // Start new running timer for caller
          const createdTimer = await timerRepository.create({
            user: callerUserId,
            project: resolvedProjectId || null,
            task: taskId || null,
            startTime: new Date(),
            status: "running",
          });

          const newTimer = await timerRepository.findOne(
            { _id: createdTimer._id },
            { populateProject: true, populateTask: true }
          );

          return { claimed: true, newTimer };
        });

        if (!switchResult || !switchResult.claimed) {
          const errMsg = "Active timer is no longer running";
          socket.emit("timerError", errMsg);
          if (typeof ack === "function") ack({ error: errMsg });
          return;
        }

        socket.emit("timerStarted", switchResult.newTimer);
        io.to(`user:${callerUserId}`).emit("tracking:started", switchResult.newTimer);
        if (typeof ack === "function") ack({ success: true, timer: switchResult.newTimer });
      } catch (err) {
        if (isDuplicateKeyError(err)) {
          const errMsg = "Timer already running";
          socket.emit("timerError", errMsg);
          if (typeof ack === "function") ack({ error: errMsg });
          return;
        }
        console.error("SOCKET switchTask ERROR:", err.message);
        socket.emit("timerError", "Internal error switching task");
        if (typeof ack === "function") ack({ error: "Internal error switching task" });
      }
    });

    // STOP TIMER
    socket.on("stopTimer", async (data, ack) => {
      try {
        const callerUserId = socket.userId;
        const callerOrgId = socket.organizationId;

        // Identity invariant: Client data.userId cannot override authenticated identity
        if (data?.userId && normalizeId(data.userId) !== callerUserId) {
          const errMsg = "Access denied: Cannot stop timer for another user";
          socket.emit("timerError", errMsg);
          if (typeof ack === "function") ack({ error: errMsg });
          return;
        }

        let timer;
        if (data?.timerId) {
          const targetTimerId = normalizeId(data.timerId);
          // Look up timer strictly scoped to caller
          timer = await timerRepository.findTimerByIdAndUser(targetTimerId, callerUserId);
          if (!timer) {
            // Check if timer exists globally (e.g. belongs to another user) to return explicit denial
            const existsGlobally = await timerRepository.findById(targetTimerId);
            if (existsGlobally) {
              const errMsg = "Access denied: You can only stop your own timer";
              socket.emit("timerError", errMsg);
              if (typeof ack === "function") ack({ error: errMsg });
              return;
            }
            const errMsg = "Timer not found";
            socket.emit("timerError", errMsg);
            if (typeof ack === "function") ack({ error: errMsg });
            return;
          }
        } else {
          // Find caller's own running timer
          timer = await timerRepository.findActiveTimerByUser(callerUserId);
          if (!timer) {
            if (data?.clearBreak && data?.isBreak === false) {
              const breakEnd = new Date();
              const freshUser = await userRepository.findById(callerUserId);
              if (freshUser?.breakStartTime) {
                const breakStart = new Date(freshUser.breakStartTime);
                if (breakStart.toDateString() === breakEnd.toDateString()) {
                  const breakDuration = Math.max(0, Math.floor((breakEnd - breakStart) / 1000));
                  const timezone = resolveUserTimezone(freshUser || socket.user, socket);
                  const sessionDate = getDateInTimezone(breakStart, timezone);

                  await sessionRepository.create({
                    userId: callerUserId,
                    startTime: breakStart,
                    endTime: breakEnd,
                    duration: breakDuration,
                    type: "break",
                    date: sessionDate,
                  });

                  await updateSyncStatus(callerUserId);
                }
                await userRepository.findByIdAndUpdate(callerUserId, {
                  breakStartTime: null,
                });
              }

              const clearedPayload = { isBreak: false, status: "stopped" };
              socket.emit("timerStopped", clearedPayload);
              io.to(`user:${callerUserId}`).emit("tracking:stopped", clearedPayload);
              if (typeof ack === "function") ack({ success: true, timer: null, isBreak: false });
              return;
            }

            const errMsg = "No active running timer found";
            socket.emit("timerError", errMsg);
            if (typeof ack === "function") ack({ error: errMsg });
            return;
          }
        }

        if (timer.status === "stopped") {
          const errMsg = "Timer is already stopped";
          socket.emit("timerError", errMsg);
          if (typeof ack === "function") ack({ error: errMsg });
          return;
        }

        // Authoritative policy evaluation
        const decision = canMutateTimer(
          socket.authContext,
          {
            userId: normalizeId(timer.user || timer.userId),
            organizationId: callerOrgId,
          },
          "stop"
        );
        if (!decision.allowed) {
          socket.emit("timerError", decision.reason);
          if (typeof ack === "function") ack({ error: decision.reason });
          return;
        }

        const endTime = new Date();
        const startTime = timer.startTime ? new Date(timer.startTime) : endTime;
        const duration = Math.max(0, Math.floor((endTime.getTime() - startTime.getTime()) / 1000));

        const stopResult = await runTransaction(async () => {
          // Atomically claim the transition from 'running' to 'stopped'
          const claim = await timerRepository.stopTimerIfRunning(
            timer._id,
            {
              endTime,
              duration,
              status: "stopped",
            },
            {
              userId: callerUserId,
              populateProject: true,
              populateTask: true,
            }
          );

          if (!claim || !claim.claimed || claim.count === 0) {
            return { claimed: false };
          }

          const claimedTimer = claim.timer || timer;
          const claimedStartTime = claimedTimer.startTime ? new Date(claimedTimer.startTime) : startTime;

          const timezone = resolveUserTimezone(socket.user, socket);
          const sessionDate = getDateInTimezone(claimedStartTime, timezone);

          // Save work session inside transaction
          await sessionRepository.create({
            userId: callerUserId,
            startTime: claimedStartTime,
            endTime,
            duration,
            type: "work",
            date: sessionDate,
          });

          // Authoritatively derive tracking project and task from freshly claimed timer state
          const trackingProjectCandidate =
            claim.timer && (Object.prototype.hasOwnProperty.call(claim.timer, "project") || Object.prototype.hasOwnProperty.call(claim.timer, "projectId"))
              ? (claim.timer.project !== undefined ? claim.timer.project : claim.timer.projectId)
              : (timer.project ?? timer.projectId);

          const trackingTaskCandidate =
            claim.timer && (Object.prototype.hasOwnProperty.call(claim.timer, "task") || Object.prototype.hasOwnProperty.call(claim.timer, "taskId"))
              ? (claim.timer.task !== undefined ? claim.timer.task : claim.timer.taskId)
              : (timer.task ?? timer.taskId);

          const trackingProjectId = normalizeId(trackingProjectCandidate);
          const trackingTaskId = normalizeId(trackingTaskCandidate);

          // Save project tracking only for task timers inside transaction
          if (trackingProjectId && trackingTaskId) {
            await ProjectTracking.create({
              user: callerUserId,
              project: trackingProjectId,
              task: trackingTaskId,
              startTime: claimedStartTime,
              endTime,
              duration,
              date: claimedStartTime.toISOString().split("T")[0],
            });
          }

          const isBreakStop = data?.isBreak === true;

          await userRepository.findByIdAndUpdate(callerUserId, {
            breakStartTime: isBreakStop ? endTime : null,
          });

          return { claimed: true, timer: claimedTimer, isBreak: isBreakStop };
        });

        if (!stopResult || !stopResult.claimed) {
          const errMsg = "Timer is already stopped";
          socket.emit("timerError", errMsg);
          if (typeof ack === "function") ack({ error: errMsg });
          return;
        }

        // Post-commit side effects executed safely outside the transaction
        await checkDailyWarning(callerUserId);
        await updateSyncStatus(callerUserId);

        const resultTimer = {
          ...stopResult.timer,
          isBreak: Boolean(stopResult.isBreak),
        };
        socket.emit("timerStopped", resultTimer);
        io.to(`user:${callerUserId}`).emit("tracking:stopped", resultTimer);
        if (typeof ack === "function") ack({ success: true, timer: resultTimer, isBreak: Boolean(stopResult.isBreak) });
      } catch (err) {
        console.error("SOCKET stopTimer ERROR:", err.message);
        socket.emit("timerError", "Internal error stopping timer");
        if (typeof ack === "function") ack({ error: "Internal error stopping timer" });
      }
    });

    socket.on("disconnect", (reason) => {
      console.info("Socket disconnected:", socket.id, "reason:", reason);
      // Clean up socket instance context
      socket.user = null;
      socket.authContext = null;
      socket.userId = null;
      socket.organizationId = null;
    });
  });

  return io;
};

export const getIO = () => io;

export const closeSocket = async () => {
  if (io) {
    await new Promise((resolve) => io.close(resolve));
    io = null;
  }
};
