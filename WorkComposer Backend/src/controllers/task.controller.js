import Task from "../models/task.model.js";
import User from "../models/user.model.js";
import Role from "../models/role.model.js";
import { getAvatarUrl } from "../utils/avatar.js";
import Integration from "../models/integration.model.js";
import Project from "../models/project.model.js";
import { refreshJiraToken } from "../utils/jiraToken.js";
import { refreshAsanaToken } from "../utils/asanaToken.js";
import { markAsanaSync } from "../utils/asanaSyncCache.js";
import {
  notifyTaskAssigned,
  notifyTaskEvents,
} from "../services/notification.service.js";
import {
  resolveEffectiveAuthContext,
  normalizeId,
} from "../security/effectiveAuthContext.js";
import axios from "axios";
import { runTransaction } from "../db/transaction.js";
import {
  auditTaskCreated,
  auditTaskUpdated,
  auditTaskDeleted,
  auditTaskRestored,
} from "../utils/auditService.js";

export const resolveTaskAuth = async (req) => {
  const callerOrgId = normalizeId(
    req.user?.organizationId || req.user?.organization?._id || req.user?.organization
  );
  const callerUserId = normalizeId(req.user?._id || req.user?.id);

  if (!callerOrgId || !callerUserId) {
    return {
      authenticated: false,
      authContext: null,
      callerOrgId: null,
      callerUserId: null,
      canManageTasks: false,
      effectiveRoleName: null,
    };
  }

  const callerRoleDoc = req.user?.roleRef
    ? await Role.findById(normalizeId(req.user.roleRef))
    : null;

  const authContext = resolveEffectiveAuthContext(req.user, callerRoleDoc);
  const canManageTasks =
    authContext.effectiveRoleName === "owner" ||
    authContext.effectivePermissions.has("manage_tasks");

  return {
    authenticated: true,
    authContext,
    callerOrgId,
    callerUserId,
    canManageTasks,
    effectiveRoleName: authContext.effectiveRoleName,
  };
};

const getTaskAccessScope = async (req, auth) => {
  const organizationId = auth.callerOrgId;
  const callerUserId = auth.callerUserId;
  const effectiveRole = auth.effectiveRoleName;

  // Owner and non-manager users with manage_tasks get organization-wide access.
  if (auth.canManageTasks && effectiveRole !== "manager") {
    return {
      organization: organizationId,
    };
  }

  // Manager: own tasks + tasks assigned to users they manage
  if (effectiveRole === "manager") {
    const managedUsers = await User.find(
      {
        organization: organizationId,
        manager: callerUserId,
      },
      "_id",
    );

    const userIds = [callerUserId, ...managedUsers.map((user) => normalizeId(user._id || user.id))];

    return {
      organization: organizationId,
      assignedTo: {
        $in: userIds,
      },
    };
  }

  // Normal user: only their own tasks
  return {
    organization: organizationId,
    assignedTo: callerUserId,
  };
};

// CREATE TASK
export const createTask = async (req, res) => {
  try {
    const auth = await resolveTaskAuth(req);
    if (!auth.authenticated) {
      return res.status(401).json({
        message: "Unauthorized: Missing authentication context",
      });
    }

    if (!auth.canManageTasks) {
      return res.status(403).json({
        message: "You do not have permission to create tasks.",
      });
    }

    // Tenant boundary: client-supplied organizationId or organization must match callerOrgId if provided
    if (
      (req.body?.organizationId && normalizeId(req.body.organizationId) !== auth.callerOrgId) ||
      (req.body?.organization && normalizeId(req.body.organization) !== auth.callerOrgId)
    ) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    const {
      title,
      description,
      priority,
      status,
      assignedTo,
      dueDate,
      project,
    } = req.body;

    const targetProjectId = normalizeId(project);
    const projectDoc = targetProjectId
      ? await Project.findOne({
          _id: targetProjectId,
          organization: auth.callerOrgId,
        })
      : null;

    if (!projectDoc) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    // Assignee validation & tenant boundary
    let assignedUser = null;
    let normalizedAssignedTo = null;
    if (assignedTo !== undefined && assignedTo !== null && assignedTo !== "") {
      const targetAssigneeId = Array.isArray(assignedTo)
        ? normalizeId(assignedTo[0])
        : normalizeId(assignedTo);

      if (targetAssigneeId) {
        assignedUser = await User.findOne({
          _id: targetAssigneeId,
          organization: auth.callerOrgId,
        }).select("_id firstName lastName manager asanaAccountId");

        if (!assignedUser) {
          return res.status(404).json({
            message: "Assigned user not found.",
          });
        }

        if (auth.effectiveRoleName === "manager") {
          const canAssign =
            assignedUser._id.toString() === auth.callerUserId ||
            assignedUser.manager?.toString() === auth.callerUserId;

          if (!canAssign) {
            return res.status(403).json({
              message:
                "Managers can only assign tasks to themselves or users they manage.",
            });
          }
        }

        normalizedAssignedTo = assignedUser._id;
      }
    }

    let provider = "local";
    let jiraIssueId = null;
    let jiraIssueKey = null;
    let asanaTaskId = null;

    if (projectDoc.provider === "jira") {
      const integration = await Integration.findOne({
        organization: auth.callerOrgId,
        provider: "jira",
        connected: true,
      });

      if (integration) {
        if (new Date() >= integration.expiresAt) {
          await refreshJiraToken(integration);
        }

        const { data } = await axios.post(
          `https://api.atlassian.com/ex/jira/${integration.cloudId}/rest/api/3/issue`,
          {
            fields: {
              project: {
                key: projectDoc.jiraProjectKey,
              },
              summary: title,
              description: {
                type: "doc",
                version: 1,
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: description || "",
                      },
                    ],
                  },
                ],
              },
              issuetype: {
                name: "Task",
              },
            },
          },
          {
            headers: {
              Authorization: `Bearer ${integration.accessToken}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          },
        );

        provider = "jira";
        jiraIssueId = data.id;
        jiraIssueKey = data.key;
      }
    }

    if (projectDoc.provider === "asana") {
      const integration = await Integration.findOne({
        organization: auth.callerOrgId,
        provider: "asana",
        connected: true,
      });

      if (!integration) {
        return res.status(400).json({
          message: "Asana is not connected",
        });
      }

      if (new Date() >= integration.expiresAt) {
        await refreshAsanaToken(integration);
      }

      let assignee = null;
      if (assignedUser?.asanaAccountId) {
        assignee = assignedUser.asanaAccountId;
      }

      const { data } = await axios.post(
        "https://app.asana.com/api/1.0/tasks",
        {
          data: {
            name: title,
            notes: description || "",
            projects: [projectDoc.asanaProjectId],
            due_on: dueDate
              ? new Date(dueDate).toISOString().split("T")[0]
              : undefined,
            assignee,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${integration.accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      provider = "asana";
      asanaTaskId = data.data.gid;
    }

    // STRICT SERVER-OWNED ATTRIBUTE DERIVATION
    const task = await Task.create({
      title,
      description,
      priority,
      status,
      assignedTo: normalizedAssignedTo,
      dueDate,
      project,

      provider,
      jiraIssueId,
      jiraIssueKey,
      asanaTaskId,

      assignedBy: auth.callerUserId,
      organization: auth.callerOrgId,
    });

    if (assignedUser) {
      await notifyTaskAssigned({
        taskId: task._id.toString(),
        organizationId: auth.callerOrgId,
        assignedToId: assignedUser._id,
        title: task.title,
        project: projectDoc.name,
        assignedTo: `${assignedUser.firstName} ${assignedUser.lastName}`,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate,
        createdBy: `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || "User",
      });
    }

    res.status(201).json(task);
  } catch (err) {
    console.error("CREATE TASK ERROR");
    console.error(err.response?.data || err);
    console.error(err.response?.status);

    return res.status(500).json({
      message: "Failed to create task",
      error: "Failed to create task",
    });
  }
};

// GET TASK
export const getTasks = async (req, res) => {
  try {
    const auth = await resolveTaskAuth(req);
    if (!auth.authenticated) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const scope = await getTaskAccessScope(req, auth);
    const query = {
      ...scope,
      deleted: false,
    };

    const tasks = await Task.find(query)
      .populate("assignedTo", "firstName lastName email avatar")
      .populate("project", "_id name")
      .sort({ createdAt: -1 });

    const formattedTasks = tasks.map((task) => {
      const obj = task.toObject ? task.toObject() : { ...task };

      if (obj.assignedTo) {
        obj.assignedTo.avatar = getAvatarUrl(obj.assignedTo.avatar);
      }

      return obj;
    });

    res.status(200).json(formattedTasks);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to fetch tasks",
      error: "Failed to fetch tasks",
    });
  }
};

// GET RECENTLY DELETED TASKS
export const getRecentlyDeletedTasks = async (req, res) => {
  try {
    const auth = await resolveTaskAuth(req);
    if (!auth.authenticated) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const scope = await getTaskAccessScope(req, auth);

    const tasks = await Task.find({
      ...scope,
      deleted: true,
    })
      .populate("assignedTo", "firstName lastName email avatar")
      .populate("project", "_id name")
      .populate("deletedBy", "firstName lastName")
      .sort({ deletedAt: -1 });

    const formattedTasks = tasks.map((task) => {
      const obj = task.toObject ? task.toObject() : { ...task };

      if (obj.assignedTo) {
        obj.assignedTo.avatar = getAvatarUrl(obj.assignedTo.avatar);
      }

      return obj;
    });

    return res.status(200).json(formattedTasks);
  } catch (err) {
    console.error("GET RECENTLY DELETED TASKS ERROR:", err);

    return res.status(500).json({
      message: "Failed to fetch deleted tasks",
      error: "Failed to fetch deleted tasks",
    });
  }
};

// RESTORE DELETED TASK
export const restoreTask = async (req, res) => {
  try {
    const auth = await resolveTaskAuth(req);
    if (!auth.authenticated) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!auth.canManageTasks) {
      return res.status(403).json({
        message: "You do not have permission to restore tasks.",
      });
    }

    const scope = await getTaskAccessScope(req, auth);

    const task = await Task.findOne({
      _id: req.params.id,
      ...scope,
      deleted: true,
    });

    if (!task) {
      return res.status(404).json({
        message: "Deleted task not found.",
      });
    }

    task.deleted = false;
    task.deletedAt = null;
    task.deletedBy = null;

    await task.save();

    return res.status(200).json({
      message: "Task restored successfully.",
      task,
    });
  } catch (err) {
    console.error("RESTORE TASK ERROR:", err);

    return res.status(500).json({
      message: "Failed to restore task",
      error: "Failed to restore task",
    });
  }
};

export const permanentlyDeleteTask = async (req, res) => {
  try {
    const auth = await resolveTaskAuth(req);
    if (!auth.authenticated) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!auth.canManageTasks) {
      return res.status(403).json({
        message: "You do not have permission to permanently delete tasks.",
      });
    }

    const scope = await getTaskAccessScope(req, auth);

    const task = await Task.findOne({
      _id: req.params.id,
      ...scope,
      deleted: true,
    });

    if (!task) {
      return res.status(404).json({
        message: "Deleted task not found.",
      });
    }

    await Task.deleteOne({
      _id: task._id,
    });

    return res.status(200).json({
      message: "Task permanently deleted.",
    });
  } catch (err) {
    console.error("PERMANENT DELETE TASK ERROR:", err);

    return res.status(500).json({
      message: "Failed to delete task",
      error: "Failed to delete task",
    });
  }
};

// UPDATE TASK
export const updateTask = async (req, res) => {
  try {
    const auth = await resolveTaskAuth(req);
    if (!auth.authenticated) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!auth.canManageTasks) {
      return res.status(403).json({
        message: "You do not have permission to update tasks.",
      });
    }

    // Tenant boundary: client-supplied organizationId or organization must match callerOrgId if provided
    if (
      (req.body?.organizationId && normalizeId(req.body.organizationId) !== auth.callerOrgId) ||
      (req.body?.organization && normalizeId(req.body.organization) !== auth.callerOrgId)
    ) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    const scope = await getTaskAccessScope(req, auth);
    const taskQuery = {
      _id: req.params.id,
      ...scope,
    };

    const task = await Task.findOne(taskQuery);

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    const previousTask = {
      title: task.title,
      description: task.description,
      dueDate: task.dueDate,
      assignedTo: task.assignedTo?.toString(),
      status: task.status,
    };

    // Relationship validation for assignee
    let newAssignedUser = null;
    let shouldUpdateAssignedTo = false;
    let resolvedNewAssignedTo = task.assignedTo;

    if (Object.prototype.hasOwnProperty.call(req.body, "assignedTo")) {
      shouldUpdateAssignedTo = true;
      const rawAssignedTo = req.body.assignedTo;
      const targetAssigneeId = Array.isArray(rawAssignedTo)
        ? normalizeId(rawAssignedTo[0])
        : normalizeId(rawAssignedTo);

      if (targetAssigneeId) {
        newAssignedUser = await User.findOne({
          _id: targetAssigneeId,
          organization: auth.callerOrgId,
        }).select("_id firstName lastName manager asanaAccountId jiraAccountId");

        if (!newAssignedUser) {
          return res.status(404).json({
            message: "Assigned user not found.",
          });
        }

        if (auth.effectiveRoleName === "manager") {
          const canAssign =
            newAssignedUser._id.toString() === auth.callerUserId ||
            newAssignedUser.manager?.toString() === auth.callerUserId;

          if (!canAssign) {
            return res.status(403).json({
              message:
                "Managers can only assign tasks to themselves or users they manage.",
            });
          }
        }

        resolvedNewAssignedTo = newAssignedUser._id;
      } else {
        resolvedNewAssignedTo = null;
      }
    }

    // EXPLICIT FIELD ALLOWLIST — SEC-11 IMMUNITY TO MASS ASSIGNMENT
    if (req.body.title !== undefined) {
      task.title = req.body.title;
    }
    if (req.body.description !== undefined) {
      task.description = req.body.description;
    }
    if (req.body.status !== undefined) {
      task.status = req.body.status;
    }
    if (req.body.priority !== undefined) {
      task.priority = req.body.priority;
    }
    if (req.body.dueDate !== undefined) {
      task.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
    }
    if (shouldUpdateAssignedTo) {
      task.assignedTo = resolvedNewAssignedTo;
    }
    if (req.body.project !== undefined) {
      if (req.body.project) {
        const targetProjectId = normalizeId(req.body.project);
        const projDoc = targetProjectId
          ? await Project.findOne({
              _id: targetProjectId,
              organization: auth.callerOrgId,
            })
          : null;
        if (!projDoc) {
          return res.status(404).json({ message: "Project not found" });
        }
        task.project = projDoc._id;
      } else {
        task.project = null;
      }
    }

    await task.save();

    const previousAssignedUser = previousTask.assignedTo
      ? await User.findById(previousTask.assignedTo)
      : null;

    if (!newAssignedUser && task.assignedTo) {
      newAssignedUser = await User.findById(task.assignedTo);
    }

    const project = task.project
      ? await Project.findById(task.project).select("name")
      : null;

    const changes = [];

    if (previousTask.title !== task.title) {
      changes.push({
        field: "Title",
        oldValue: previousTask.title,
        newValue: task.title,
      });
    }

    if (previousTask.description !== task.description) {
      changes.push({
        field: "Description",
        oldValue: previousTask.description || "Empty",
        newValue: task.description || "Empty",
      });
    }

    if (previousTask.status !== task.status) {
      changes.push({
        field: "Status",
        oldValue: previousTask.status,
        newValue: task.status,
      });
    }

    if (String(previousTask.dueDate || "") !== String(task.dueDate || "")) {
      changes.push({
        field: "Due Date",
        oldValue: previousTask.dueDate
          ? new Date(previousTask.dueDate).toLocaleDateString()
          : "Not set",
        newValue: task.dueDate
          ? new Date(task.dueDate).toLocaleDateString()
          : "Not set",
      });
    }

    await notifyTaskEvents({
      previousTask,
      task,
      changes,
      previousAssignedUser,
      newAssignedUser,
      updatedBy: req.user,
    });

    if (
      previousTask.assignedTo !== task.assignedTo?.toString() &&
      newAssignedUser
    ) {
      await notifyTaskAssigned({
        taskId: task._id,
        organizationId: task.organization,
        assignedToId: newAssignedUser._id,
        title: task.title,
        project: project?.name || "",
        assignedTo: `${newAssignedUser.firstName} ${newAssignedUser.lastName}`,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate,
        createdBy: `${req.user.firstName} ${req.user.lastName}`,
      });
    }

    if (task.provider === "jira") {
      const integration = await Integration.findOne({
        organization: task.organization,
        provider: "jira",
        connected: true,
      });

      if (integration) {
        if (new Date() >= integration.expiresAt) {
          await refreshJiraToken(integration);
        }

        await axios.put(
          `https://api.atlassian.com/ex/jira/${integration.cloudId}/rest/api/3/issue/${task.jiraIssueKey}`,
          {
            fields: {
              summary: task.title,
              description: {
                type: "doc",
                version: 1,
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: task.description || "",
                      },
                    ],
                  },
                ],
              },
            },
          },
          {
            headers: {
              Authorization: `Bearer ${integration.accessToken}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          },
        );

        const assignedUser = await User.findById(task.assignedTo);

        if (assignedUser?.jiraAccountId) {
          await axios.put(
            `https://api.atlassian.com/ex/jira/${integration.cloudId}/rest/api/3/issue/${task.jiraIssueKey}/assignee`,
            {
              accountId: assignedUser.jiraAccountId,
            },
            {
              headers: {
                Authorization: `Bearer ${integration.accessToken}`,
                Accept: "application/json",
                "Content-Type": "application/json",
              },
            },
          );
        }

        try {
          const { data: transitions } = await axios.get(
            `https://api.atlassian.com/ex/jira/${integration.cloudId}/rest/api/3/issue/${task.jiraIssueKey}/transitions`,
            {
              headers: {
                Authorization: `Bearer ${integration.accessToken}`,
                Accept: "application/json",
              },
            },
          );

          let transitionName = "To Do";

          if (task.status === "in-progress") {
            transitionName = "In Progress";
          }

          if (task.status === "completed") {
            transitionName = "Done";
          }

          const transition = transitions.transitions.find(
            (t) => t.name === transitionName,
          );

          if (transition) {
            await axios.post(
              `https://api.atlassian.com/ex/jira/${integration.cloudId}/rest/api/3/issue/${task.jiraIssueKey}/transitions`,
              {
                transition: {
                  id: transition.id,
                },
              },
              {
                headers: {
                  Authorization: `Bearer ${integration.accessToken}`,
                  Accept: "application/json",
                  "Content-Type": "application/json",
                },
              },
            );
          }
        } catch (err) {
          console.error(
            "Failed to update Jira transition:",
            err.response?.data || err.message,
          );
        }
      }
    }

    if (task.provider === "asana") {
      const integration = await Integration.findOne({
        organization: task.organization,
        provider: "asana",
        connected: true,
      });

      if (!integration) {
        return res.status(400).json({
          message: "Asana is not connected",
        });
      }

      if (!task.asanaTaskId) {
        return res.status(400).json({
          message: "Asana task ID is missing",
        });
      }

      if (new Date() >= integration.expiresAt) {
        await refreshAsanaToken(integration);
      }

      const assignedUser = task.assignedTo
        ? await User.findById(task.assignedTo)
        : null;

      markAsanaSync(task._id.toString());

      const updateData = {};

      if (previousTask.title !== task.title) {
        updateData.name = task.title;
      }

      if (previousTask.description !== task.description) {
        updateData.notes = task.description || "";
      }

      if (String(previousTask.dueDate || "") !== String(task.dueDate || "")) {
        updateData.due_on = task.dueDate
          ? new Date(task.dueDate).toISOString().split("T")[0]
          : null;
      }

      if (previousTask.status !== task.status) {
        updateData.completed = task.status === "completed";
      }

      if (previousTask.assignedTo !== task.assignedTo?.toString()) {
        updateData.assignee = assignedUser?.asanaAccountId || null;
      }

      if (Object.keys(updateData).length > 0) {
        await axios.put(
          `https://app.asana.com/api/1.0/tasks/${task.asanaTaskId}`,
          {
            data: updateData,
          },
          {
            headers: {
              Authorization: `Bearer ${integration.accessToken}`,
              "Content-Type": "application/json",
            },
          },
        );
      } else {
      }

      if (assignedUser?.asanaAccountId) {
      } else {
      }
    }

    res.status(200).json(task);
  } catch (err) {
    console.error("UPDATE TASK ERROR:", err);
    res.status(500).json({
      message: "Failed to update task",
      error: "Failed to update task",
    });
  }
};

// DELETE TASK
export const deleteTask = async (req, res) => {
  try {
    const auth = await resolveTaskAuth(req);
    if (!auth.authenticated) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!auth.canManageTasks) {
      return res.status(403).json({
        message: "You do not have permission to delete tasks.",
      });
    }

    const scope = await getTaskAccessScope(req, auth);
    const taskQuery = {
      _id: req.params.id,
      ...scope,
    };

    const task = await Task.findOne(taskQuery);

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    if (task.provider === "jira") {
      const integration = await Integration.findOne({
        organization: task.organization,
        provider: "jira",
        connected: true,
      });

      if (!integration) {
        return res.status(400).json({
          message: "Jira is not connected",
        });
      }

      if (!task.jiraIssueKey) {
        return res.status(400).json({
          message: "Jira issue key is missing",
        });
      }

      if (new Date() >= integration.expiresAt) {
        await refreshJiraToken(integration);
      }

      await axios.delete(
        `https://api.atlassian.com/ex/jira/${integration.cloudId}/rest/api/3/issue/${task.jiraIssueKey}`,
        {
          headers: {
            Authorization: `Bearer ${integration.accessToken}`,
            Accept: "application/json",
          },
        },
      );
    }

    if (task.provider === "asana") {
      const integration = await Integration.findOne({
        organization: task.organization,
        provider: "asana",
        connected: true,
      });

      if (!integration) {
        return res.status(400).json({
          message: "Asana is not connected",
        });
      }

      if (!task.asanaTaskId) {
        return res.status(400).json({
          message: "Asana task ID is missing",
        });
      }

      if (new Date() >= integration.expiresAt) {
        await refreshAsanaToken(integration);
      }

      await axios.delete(
        `https://app.asana.com/api/1.0/tasks/${task.asanaTaskId}`,
        {
          headers: {
            Authorization: `Bearer ${integration.accessToken}`,
          },
        },
      );
    }

    task.deleted = true;
    task.deletedAt = new Date();
    task.deletedBy = auth.callerUserId;

    await task.save();

    return res.status(200).json({
      message: "Task moved to Recently Deleted",
    });
  } catch (err) {
    console.error("DELETE TASK ERROR:", err);
    res.status(500).json({
      message: "Failed to delete task",
      error: "Failed to delete task",
    });
  }
};

// SELECTED DELETE TASK
export const deleteMultipleTasks = async (req, res) => {
  try {
    const auth = await resolveTaskAuth(req);
    if (!auth.authenticated) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!auth.canManageTasks || !["owner", "admin"].includes(auth.effectiveRoleName)) {
      return res.status(403).json({
        message: "You do not have permission to delete tasks.",
      });
    }

    const { taskIds } = req.body;
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        message: "taskIds must be a non-empty array",
      });
    }

    const scope = await getTaskAccessScope(req, auth);

    const tasks = await Task.find({
      _id: { $in: taskIds },
      ...scope,
    });

    if (tasks.length === 0) {
      return res.status(200).json({
        message: "Tasks moved to Recently Deleted",
      });
    }

    // 1. Authoritative local soft-delete committed FIRST in atomic transaction (SEC20-F03)
    await runTransaction(async () => {
      await Task.updateMany(
        {
          _id: {
            $in: tasks.map((task) => task._id),
          },
          ...scope,
        },
        {
          $set: {
            deleted: true,
            deletedAt: new Date(),
            deletedBy: auth.callerUserId,
          },
        },
      );
    });

    // 2. Post-commit remote provider synchronization (Jira / Asana)
    const syncErrors = [];

    for (const task of tasks) {
      if (task.provider === "jira") {
        try {
          const integration = await Integration.findOne({
            organization: task.organization,
            provider: "jira",
            connected: true,
          });

          if (integration && task.jiraIssueKey) {
            if (new Date() >= integration.expiresAt) {
              await refreshJiraToken(integration);
            }

            await axios.delete(
              `https://api.atlassian.com/ex/jira/${integration.cloudId}/rest/api/3/issue/${task.jiraIssueKey}`,
              {
                headers: {
                  Authorization: `Bearer ${integration.accessToken}`,
                  Accept: "application/json",
                },
              },
            );
          }
        } catch (error) {
          console.error(
            `Failed to delete Jira issue for task ${task._id}: [status ${error.response?.status || "network_error"}] ${error.message}`,
          );
          syncErrors.push({
            taskId: (task._id || task.id)?.toString(),
            provider: "jira",
            issueKey: task.jiraIssueKey,
            error: "Failed to delete remote Jira issue",
          });
        }
      }

      if (task.provider === "asana") {
        try {
          const integration = await Integration.findOne({
            organization: task.organization,
            provider: "asana",
            connected: true,
          });

          if (integration && task.asanaTaskId) {
            if (new Date() >= integration.expiresAt) {
              await refreshAsanaToken(integration);
            }

            await axios.delete(
              `https://app.asana.com/api/1.0/tasks/${task.asanaTaskId}`,
              {
                headers: {
                  Authorization: `Bearer ${integration.accessToken}`,
                },
              },
            );
          }
        } catch (error) {
          console.error(
            `Failed to delete Asana task for task ${task._id}: [status ${error.response?.status || "network_error"}] ${error.message}`,
          );
          syncErrors.push({
            taskId: (task._id || task.id)?.toString(),
            provider: "asana",
            externalId: task.asanaTaskId,
            error: "Failed to delete remote Asana task",
          });
        }
      }
    }

    if (syncErrors.length > 0) {
      return res.status(200).json({
        message: "Tasks moved to Recently Deleted",
        warning: "Some external tasks could not be deleted from provider",
        syncErrors,
      });
    }

    return res.status(200).json({
      message: "Tasks moved to Recently Deleted",
    });
  } catch (err) {
    console.error("DELETE MULTIPLE TASKS ERROR:", err);

    return res.status(500).json({
      message: "Failed to delete tasks",
      error: "Failed to delete tasks",
    });
  }
};
