import Project from "../models/project.model.js";
import Task from "../models/task.model.js";
import User from "../models/user.model.js";
import { hasPermission } from "../middleware/permission.middleware.js";
import { runTransaction } from "../db/transaction.js";
import {
  auditProjectCreated,
  auditProjectUpdated,
  auditProjectDeleted,
} from "../utils/auditService.js";

// CREATE PROJECT
export const createProject = async (req, res) => {
  try {
const canManageProjects = await hasPermission(
  req.user,
  "manage_projects"
);

if (!canManageProjects) {
  return res.status(403).json({
    message: "You do not have permission to create projects.",
  });
}

    const { name, teams, users } = req.body;

    const project = await Project.create({
      name,
      teams,
      users,
      organization: req.user.organization,
      createdBy: req.user._id,
    });

    res.status(201).json(project);
  } catch (err) {
    console.error("CREATE PROJECT ERROR:", err);

    res.status(500).json({
      message: "Failed to create project",
      error: "Failed to create project",
    });
  }
};

// GET PROJECTS
export const getProjects = async (req, res) => {
  try {
    const organizationId =
      req.user.organization?._id || req.user.organization;

    const canManageProjects = await hasPermission(
      req.user,
      "manage_projects",
    );

    /*
     * Build the project visibility query.
     *
     * Users with manage_projects can see every
     * project in the organization.
     */
    let query = {
      organization: organizationId,
    };

    if (!canManageProjects) {
      /*
       * Same visibility rule used by getTasks:
       *
       * - User sees their own tasks.
       * - Manager also sees tasks assigned to
       *   users they manage.
       */
      const managedUsers = await User.find(
        {
          organization: organizationId,
          manager: req.user._id,
        },
        "_id",
      );

      const visibleUserIds = [
        req.user._id,
        ...managedUsers.map((user) => user._id),
      ];

      /*
       * Find projects which contain tasks visible
       * to this user.
       */
      const visibleProjectIds = await Task.distinct(
        "project",
        {
          organization: organizationId,
          deleted: false,
          assignedTo: {
            $in: visibleUserIds,
          },
        },
      );

      /*
       * Only show projects that contain at least
       * one task the user is allowed to see.
       */
      query._id = {
        $in: visibleProjectIds.filter(Boolean),
      };
    }

    const projects = await Project.find(query)
      .populate(
        "users",
        "firstName lastName email",
      )
      .sort({ createdAt: -1 });

    const projectsWithTaskCount = await Promise.all(
      projects.map(async (project) => {
        const taskCount = await Task.countDocuments({
          organization: organizationId,
          project: project._id,
          deleted: false,
        });

        return {
          ...project.toObject(),
          taskCount,
        };
      }),
    );

    return res.status(200).json(projectsWithTaskCount);
  } catch (err) {
    console.error("GET PROJECTS ERROR:", err);

    return res.status(500).json({
      message: "Failed to fetch projects",
      error: "Failed to fetch projects",
    });
  }
};

// UPDATE PROJECT
export const updateProject = async (req, res) => {
  try {
    const canManageProjects = await hasPermission(req.user, "manage_projects");

    if (!canManageProjects) {
      return res.status(403).json({
        message: "You do not have permission to update projects.",
      });
    }

    const callerOrgId = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();
    if (!callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing organization context",
      });
    }

    const existingProject = await Project.findOne({
      _id: req.params.id,
      organization: callerOrgId,
    });

    if (!existingProject) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    // Strip client-supplied organization identifiers to prevent tenant migration
    const updatePayload = { ...req.body };
    delete updatePayload.organization;
    delete updatePayload.organizationId;

    const updatedProject = await Project.findByIdAndUpdate(
      existingProject._id,
      updatePayload,
      {
        new: true,
      },
    );

    res.status(200).json(updatedProject);
  } catch (err) {
    console.error("UPDATE PROJECT ERROR:", err);

    res.status(500).json({
      message: "Failed to update project",
      error: "Failed to update project",
    });
  }
};

// DELETE PROJECT
export const deleteProject = async (req, res) => {
  try {
    const canManageProjects = await hasPermission(req.user, "manage_projects");

    if (!canManageProjects) {
      return res.status(403).json({
        message: "You do not have permission to delete projects.",
      });
    }

    const callerOrgId = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();
    if (!callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing organization context",
      });
    }

    const project = await Project.findOne({
      _id: req.params.id,
      organization: callerOrgId,
    });

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    // DON'T DELETE DEFAULT PROJECT
    if (project.name === "Default Project") {
      return res.status(400).json({
        message: "Default Project cannot be deleted",
      });
    }

    // DELETE TASKS OF PROJECT
    await runTransaction(async () => {
      const currentProject = await Project.findOne({
        _id: project._id || project.id,
        organization: callerOrgId,
      });

      if (!currentProject) {
        const notFound = new Error("Project not found");
        notFound.statusCode = 404;
        throw notFound;
      }

      await Task.deleteMany({
        project: currentProject._id || currentProject.id,
        organization: callerOrgId,
      });

      await Project.findByIdAndDelete(currentProject._id || currentProject.id);
    });

    res.status(200).json({
      message: "Project deleted successfully",
    });
  } catch (err) {
    if (err.statusCode === 404 || err.name === "NotFoundError" || err.code === "P2025") {
      return res.status(404).json({
        message: "Project not found",
      });
    }
    if (err.statusCode === 400) {
      return res.status(400).json({
        message: err.message,
      });
    }
    console.error("DELETE PROJECT ERROR:", err);

    res.status(500).json({
      message: "Failed to delete project",
      error: "Failed to delete project",
    });
  }
};

/**
 * Explicit, authorized initialization and repair workflow for default project creation
 * and orphan-task adoption (SEC20-F04 remediation).
 *
 * Must be invoked explicitly by authorized administrative or tenant-setup
 * operations rather than implicitly as a read-endpoint side effect.
 *
 * Runs atomically inside runTransaction to guarantee that multi-step PostgreSQL writes
 * succeed or rollback completely.
 */
export const initializeDefaultProject = async ({ organizationId, userId }) => {
  if (!organizationId) {
    const err = new Error("Missing organizationId context for default project initialization");
    err.statusCode = 400;
    throw err;
  }

  return await runTransaction(async () => {
    let defaultProject = await Project.findOne({
      name: "Default Project",
      organization: organizationId,
    });

    if (!defaultProject) {
      defaultProject = await Project.create({
        name: "Default Project",
        organization: organizationId,
        createdBy: userId,
      });
    }

    const updateResult = await Task.updateMany(
      {
        organization: organizationId,
        $or: [
          { project: null },
          { project: { $exists: false } },
        ],
      },
      {
        project: defaultProject._id,
      },
    );

    return {
      defaultProject,
      adoptedTaskCount: updateResult?.modifiedCount ?? updateResult?.count ?? 0,
    };
  });
};
