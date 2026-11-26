import mongoose from "mongoose";
import Team from "../models/team.model.js";
import User from "../models/user.model.js";
import { runTransaction } from "../db/transaction.js";
import {
  auditTeamCreated,
  auditTeamUpdated,
  auditTeamDeleted,
} from "../utils/auditService.js";

export const createTeam = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({
        message: "Team name is required",
      });
    }

    const callerOrgId = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();
    if (!callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing organization context",
      });
    }

    const existingTeam = await Team.findOne({
      name: name.trim(),
      organization: callerOrgId,
    });

    if (existingTeam) {
      return res.status(400).json({
        message: "Team already exists",
      });
    }

    const team = await Team.create({
      name: name.trim(),
      description,
      organization: callerOrgId,
      createdBy: req.user._id || req.user.id,
    });

    await auditTeamCreated({ req, team });

    res.status(201).json({
      message: "Team created successfully",
      team,
    });
  } catch (err) {
    console.error("CREATE TEAM ERROR:", err);

    res.status(500).json({
      message: "Failed to create team",
      error: "Failed to create team",
    });
  }
};

export const getTeams = async (req, res) => {
  try {
    const organizationId = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();
    if (!organizationId) {
      return res.status(401).json({
        message: "Unauthorized: Missing organization context",
      });
    }

    const teams = await Team.find({
      organization: organizationId,
    }).sort({ createdAt: -1 });

    res.status(200).json(teams);
  } catch (err) {
    console.error("GET TEAMS ERROR:", err);

    res.status(500).json({
      message: "Failed to fetch teams",
      error: "Failed to fetch teams",
    });
  }
};

// Update Team
export const updateTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!id || typeof id !== "string" || !mongoose.Types.ObjectId.isValid(id.trim())) {
      return res.status(400).json({
        message: "Invalid team ID",
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        message: "Team name is required",
      });
    }

    const callerOrgId = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();
    if (!callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing organization context",
      });
    }

    const callerRole = (req.user?.role || "").toLowerCase();
    if (!["owner", "admin"].includes(callerRole)) {
      return res.status(403).json({
        message: "Access denied: Administrative privileges required",
      });
    }

    const team = await Team.findOne({
      _id: id.trim(),
      organization: callerOrgId,
    });

    if (!team) {
      return res.status(404).json({
        message: "Team not found",
      });
    }

    const trimmedName = name.trim();
    const existingNamedTeam = await Team.findOne({
      name: trimmedName,
      organization: callerOrgId,
    });
    if (
      existingNamedTeam &&
      (existingNamedTeam._id || existingNamedTeam.id).toString() !==
      (team._id || team.id).toString()
    ) {
      return res.status(400).json({
        message: "A team with this name already exists",
      });
    }

    team.name = trimmedName;

    await team.save();

    await auditTeamUpdated({ req, team, changes: { name: trimmedName } });

    res.status(200).json({
      message: "Team updated successfully",
      team,
    });
  } catch (err) {
    console.error("UPDATE TEAM ERROR:", err);

    res.status(500).json({
      message: "Failed to update team",
      error: "Failed to update team",
    });
  }
};

// Delete Team
export const deleteTeam = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== "string" || !mongoose.Types.ObjectId.isValid(id.trim())) {
      return res.status(400).json({
        message: "Invalid team ID",
      });
    }

    const callerOrgId = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();
    if (!callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing organization context",
      });
    }

    const callerRole = (req.user?.role || "").toLowerCase();
    if (!["owner", "admin"].includes(callerRole)) {
      return res.status(403).json({
        message: "Access denied: Administrative privileges required",
      });
    }

    const team = await Team.findOne({
      _id: id.trim(),
      organization: callerOrgId,
    });

    if (!team) {
      return res.status(404).json({
        message: "Team not found",
      });
    }

    if (team.name === "Default team") {
      return res.status(400).json({
        message: "Default team cannot be deleted",
      });
    }

    await runTransaction(async () => {
      const currentTeam = await Team.findOne({
        _id: team._id || team.id,
        organization: callerOrgId,
      });

      if (!currentTeam) {
        const notFound = new Error("Team not found");
        notFound.statusCode = 404;
        throw notFound;
      }

      // move users to default team within caller's organization
      const defaultTeam = await Team.findOne({
        name: "Default team",
        organization: callerOrgId,
      });
      const defaultTeamId = defaultTeam ? (defaultTeam._id || defaultTeam.id) : null;

      await User.updateMany(
        { team: currentTeam._id || currentTeam.id, organization: callerOrgId },
        {
          $set: {
            team: defaultTeamId,
          },
        },
      );

      if (currentTeam.name) {
        await User.updateMany(
          { team: currentTeam.name, organization: callerOrgId },
          {
            $set: {
              team: defaultTeamId,
            },
          },
        );
      }

      await Team.findByIdAndDelete(currentTeam._id || currentTeam.id);
    });

    await auditTeamDeleted({ req, team: { _id: team._id || team.id, name: team.name } });

    res.status(200).json({
      message: "Team deleted successfully",
    });
  } catch (err) {
    if (err.statusCode === 404 || err.name === "NotFoundError" || err.code === "P2025") {
      return res.status(404).json({
        message: "Team not found",
      });
    }
    if (err.statusCode === 400) {
      return res.status(400).json({
        message: err.message,
      });
    }
    console.error("DELETE TEAM ERROR:", err);

    res.status(500).json({
      message: "Failed to delete team",
      error: "Failed to delete team",
    });
  }
};
