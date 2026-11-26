
import ProjectTracking from "../models/projectTracking.model.js";
import Project from "../models/project.model.js";
import Task from "../models/task.model.js";
import User from "../models/user.model.js";
import { getAvatarUrl } from "../utils/avatar.js";
import { hasPermission } from "../middleware/permission.middleware.js";

export const trackProject = async (req, res) => {
  try {
    const { projectId, taskId, startTime, endTime, duration } = req.body || {};

    const organizationId =
      req.user?.organization?._id ||
      req.user?.organizationId ||
      req.user?.organization;

    if (!req.user || !organizationId) {
      return res.status(401).json({
        message: "Unauthorized: Missing organization context",
      });
    }

    const callerUserId = req.user?._id || req.user?.id;
    if (!callerUserId) {
      return res.status(401).json({
        message: "Unauthorized: Missing user identity",
      });
    }

    const cleanTaskId = typeof taskId === "string" ? taskId.trim() : "";
    const cleanProjectId = typeof projectId === "string" ? projectId.trim() : "";

    // Validate malformed taskId if supplied
    if (taskId !== undefined && taskId !== null && (!cleanTaskId || cleanTaskId === "[object Object]")) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    // Validate malformed projectId if supplied
    if (projectId !== undefined && projectId !== null && (!cleanProjectId || cleanProjectId === "[object Object]")) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    let finalTaskId = null;
    let finalProjectId = cleanProjectId || null;

    // If this is task tracking, verify task assignment and tenant ownership.
    if (cleanTaskId) {
      let task;
      try {
        task = await Task.findOne({
          _id: cleanTaskId,
          organization: organizationId,
          deleted: false,
        }).select("assignedTo project");
      } catch (findErr) {
        if (
          findErr.name === "CastError" ||
          (findErr.message && findErr.message.includes("Invalid identifier"))
        ) {
          return res.status(404).json({
            message: "Task not found",
          });
        }
        throw findErr;
      }

      if (!task) {
        return res.status(404).json({
          message: "Task not found",
        });
      }

      // Only the assigned user can track the task.
      const assignedToId = task.assignedTo?._id || task.assignedTo;
      if (
        !assignedToId ||
        assignedToId.toString() !== callerUserId.toString()
      ) {
        return res.status(403).json({
          message: "You can only track tasks assigned to you.",
        });
      }

      const taskProjectId = (task.project?._id || task.project)?.toString();

      // Make sure the task belongs to the requested project.
      if (cleanProjectId && taskProjectId && taskProjectId !== cleanProjectId) {
        return res.status(400).json({
          message: "Task does not belong to this project.",
        });
      }

      finalTaskId = task._id || task.id || cleanTaskId;
      if (!finalProjectId && taskProjectId) {
        finalProjectId = taskProjectId;
      }
    } else if (cleanProjectId) {
      // When taskId is omitted but projectId is supplied, verify project ownership
      let project;
      try {
        project = await Project.findOne({
          _id: cleanProjectId,
          organization: organizationId,
        });
      } catch (findErr) {
        if (
          findErr.name === "CastError" ||
          (findErr.message && findErr.message.includes("Invalid identifier"))
        ) {
          return res.status(404).json({
            message: "Project not found",
          });
        }
        throw findErr;
      }

      if (!project) {
        return res.status(404).json({
          message: "Project not found",
        });
      }

      finalProjectId = project._id || project.id || cleanProjectId;
    } else {
      return res.status(400).json({
        message: "Project or task is required to track time.",
      });
    }

    const date = new Date(startTime).toISOString().split("T")[0];

    const tracking = await ProjectTracking.create({
      user: callerUserId,
      project: finalProjectId,
      task: finalTaskId,
      startTime,
      endTime,
      duration,
      date,
    });

    res.status(201).json({
      success: true,
      tracking,
    });
  } catch (err) {
    console.error("TRACK PROJECT ERROR:", err);

    res.status(500).json({
      message: "Failed to track project",
      error: "Failed to track project",
    });
  }
};

export const getProjectTracking = async (req, res) => {
  try {
    const { startDate, endDate, sortBy = "name", order = "asc" } = req.query;

    const organizationId =
      req.user?.organization?._id ||
      req.user?.organizationId ||
      req.user?.organization;

    if (!req.user || !organizationId) {
      return res.status(401).json({
        message: "Unauthorized: Missing organization context",
      });
    }

    const canManageProjects = await hasPermission(req.user, "manage_projects");

    const projectQuery = {
      organization: organizationId,
    };

    if (!canManageProjects) {
      const accessConditions = [
        {
          users: req.user._id,
        },
      ];

      if (req.user.team) {
        accessConditions.push({
          teams: req.user.team,
        });
      }

      projectQuery.$or = accessConditions;
    }

    if (req.query.teams?.trim()) {
      projectQuery.teams = {
        $in: req.query.teams.split(",").filter(Boolean),
      };
    }

    if (req.query.users?.trim()) {
      projectQuery.users = {
        $in: req.query.users.split(",").filter(Boolean),
      };
    }

    const projects = await Project.find(projectQuery).populate(
      "users",
      "firstName lastName email",
    );

    const data = await Promise.all(
      projects.map(async (project) => {
        const query = {
          project: project._id,
        };

        if (!canManageProjects) {
          query.user = req.user._id;
        }

        if (canManageProjects && req.query.users?.trim()) {
          query.user = {
            $in: req.query.users.split(",").filter(Boolean),
          };
        }

        if (startDate && endDate) {
          query.date = {
            $gte: startDate,
            $lte: endDate,
          };
        }

        const records = await ProjectTracking.find(query)
          .populate("user", "firstName lastName email")
          .populate("task", "title");

        records.forEach((r) => { });

        const taskMap = new Map();

        for (const record of records) {
          if (!record.task || !record.user) continue;

          const taskId = record.task._id || record.task.id;
          const userId = record.user._id || record.user.id;
          const key = `${taskId}-${userId}`;

          if (!taskMap.has(key)) {
            taskMap.set(key, {
              _id: key,
              task: record.task,
              user: record.user,
              duration: 0,
            });
          }

          taskMap.get(key).duration += record.duration || 0;
        }

        const taskRecords = Array.from(taskMap.values());

        const totalSeconds = records.reduce(
          (sum, item) => sum + (item.duration || 0),
          0,
        );

        return {
          _id: project._id,

          name: project.name,

          users: (project.users || []).filter(Boolean),

          totalSeconds,

          records: taskRecords,
        };
      }),
    );

    const filteredData = data.filter((project) => project.records.length > 0);

    filteredData.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "duration":
          comparison = a.totalSeconds - b.totalSeconds;
          break;

        default:
          comparison = a.name.localeCompare(b.name);
          break;
      }

      return order === "asc" ? comparison : -comparison;
    });

    res.json(filteredData);
  } catch (err) {
    console.error("GET PROJECT TRACKING ERROR:", err);

    res.status(500).json({
      message: "Failed to get project tracking",
      error: "Failed to get project tracking",
    });
  }
};

export const getTaskDetails = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { startDate, endDate } = req.query;

    const organizationId =
      req.user?.organization?._id ||
      req.user?.organizationId ||
      req.user?.organization;

    if (!req.user || !organizationId) {
      return res.status(401).json({
        message: "Unauthorized: Missing organization context",
      });
    }

    if (
      !taskId ||
      typeof taskId !== "string" ||
      !taskId.trim() ||
      taskId.trim() === "[object Object]"
    ) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    const cleanTaskId = taskId.trim();

    let task;
    try {
      task = await Task.findOne({
        _id: cleanTaskId,
        organization: organizationId,
        deleted: false,
      });
    } catch (findErr) {
      if (
        findErr.name === "CastError" ||
        (findErr.message && findErr.message.includes("Invalid identifier"))
      ) {
        return res.status(404).json({
          message: "Task not found",
        });
      }
      throw findErr;
    }

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    const canManageProjects = await hasPermission(req.user, "manage_projects");

    const query = {
      task: task._id || task.id || cleanTaskId,
    };

    if (!canManageProjects) {
      query.user = req.user._id || req.user.id;
    }

    if (startDate && endDate) {
      query.date = {
        $gte: startDate,
        $lte: endDate,
      };
    }

    const records = await ProjectTracking.find(query).populate(
      "user",
      "firstName lastName avatar email",
    );

    const userMap = new Map();

    for (const record of records) {
      const key = (record.user?._id || record.user?.id || record.user)?.toString();

      if (!userMap.has(key)) {
        userMap.set(key, {
          user: {
            ...(record.user?.toObject ? record.user.toObject() : record.user),
            avatar: getAvatarUrl(record.user?.avatar),
          },
          duration: 0,
        });
      }

      userMap.get(key).duration += record.duration || 0;
    }

    res.json(Array.from(userMap.values()));
  } catch (err) {
    console.error("GET TASK DETAILS ERROR:", err);

    res.status(500).json({
      message: "Failed to get task details",
      error: "Failed to get task details",
    });
  }
};
