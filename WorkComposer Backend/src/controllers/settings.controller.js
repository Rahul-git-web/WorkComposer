import bcrypt from "bcryptjs";
import User from "../models/user.model.js";
import path from "path";
import fs from "fs";
import cloudinary from "../config/cloudinary.js";
import { getPrismaClient } from "../db/prisma.js";
import { isPostgres } from "../db/index.js";
import { isValidTimezone, BROWSER_TIMEZONE_SETTING } from "../utils/timezone.js";
import { getIO } from "../socket/socket.js";
import { auditPasswordChanged } from "../utils/auditService.js";

export const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        firstName,
        lastName,
      },
      {
        new: true,
        runValidators: true,
      },
    ).select("-password -refreshToken");

    res.status(200).json(user);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Failed to update profile",
    });
  }
};

export const changePassword = async (req, res) => {
  try {
    const callerUserId = (req.user?._id || req.user?.id)?.toString();
    if (!callerUserId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const currentPassword = req.body.currentPassword || req.body.oldPassword;
    const { newPassword, confirmPassword, signOutAllDevices } = req.body;

    if (!currentPassword) {
      return res.status(400).json({
        message: "Current password is required",
      });
    }

    if (!newPassword) {
      return res.status(400).json({
        message: "New password is required",
      });
    }

    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      return res.status(400).json({
        message: "Passwords do not match",
      });
    }

    if (typeof newPassword !== "string" || newPassword.trim() === "") {
      return res.status(400).json({
        message: "New password cannot be empty",
      });
    }

    // Authoritative direct user lookup
    const user = await User.findById(callerUserId);
    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Verify current password against authoritative hash
    if (user.password) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({
          message: "Current password is incorrect",
        });
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updateData = {
      password: hashedPassword,
    };

    if (signOutAllDevices) {
      updateData.refreshTokens = [];
      updateData.devices = [];
      if (isPostgres()) {
        try {
          const prisma = getPrismaClient();
          await prisma.userRefreshToken.deleteMany({
            where: { userId: callerUserId },
          });
          await prisma.userDevice.deleteMany({
            where: { userId: callerUserId },
          });
        } catch (cleanupErr) {
          console.error("Device/session cleanup error:", cleanupErr.message);
        }
      }
    }

    await User.findByIdAndUpdate(callerUserId, updateData);

    return res.status(200).json({
      message: "Password updated successfully",
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Failed to update password",
    });
  }
};

export const updatePreferences = async (req, res) => {
  try {
    const { weeklyReport, dailyReport, reportTeam, reportTimezone } = req.body;

    if (
      reportTimezone !== undefined &&
      reportTimezone !== null &&
      reportTimezone !== BROWSER_TIMEZONE_SETTING &&
      !isValidTimezone(reportTimezone)
    ) {
      return res.status(400).json({
        message:
          "Invalid timezone specified. Must be 'Browser timezone' or a valid IANA timezone identifier.",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        weeklyReport,
        dailyReport,
        reportTeam,
        reportTimezone,
      },
      {
        new: true,
        runValidators: true,
      },
    )
      .populate("reportTeam")
      .select("-password -refreshToken");

    res.status(200).json(user);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to update preferences",
    });
  }
};

export const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "No image uploaded",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      // Remove temporary uploaded file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      return res.status(404).json({
        message: "User not found",
      });
    }

    // Upload avatar to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "workcomposer/avatars",
      resource_type: "image",
    });

    // Remove temporary local file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    // Save permanent Cloudinary URL
    user.avatar = result.secure_url;

    await user.save();

    res.status(200).json({
      message: "Avatar updated successfully",
      avatar: result.secure_url,
    });
  } catch (err) {
    console.error("AVATAR UPLOAD ERROR:", err);

    // Clean up temporary file if upload/save fails
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      message: "Failed to upload avatar",
    });
  }
};

const THEME_PREFERENCES_PATH = path.join(
  process.cwd(),
  "src",
  "config",
  "userThemePreferences.json"
);

function loadThemePreferences() {
  try {
    if (fs.existsSync(THEME_PREFERENCES_PATH)) {
      const raw = fs.readFileSync(THEME_PREFERENCES_PATH, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("Error reading theme preferences:", err.message);
  }
  return {};
}

function saveThemePreferences(prefs) {
  try {
    const dir = path.dirname(THEME_PREFERENCES_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      THEME_PREFERENCES_PATH,
      JSON.stringify(prefs, null, 2),
      "utf-8"
    );
  } catch (err) {
    console.error("Error saving theme preferences:", err.message);
  }
}

export const getThemePreference = async (req, res) => {
  try {
    const userId = (req.user?._id || req.user?.id)?.toString();
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const prefs = loadThemePreferences();
    const themeMode = prefs[userId] || "system";
    return res.status(200).json({ themeMode });
  } catch (error) {
    console.error("Failed to get theme preference:", error);
    return res.status(500).json({ message: "Failed to get theme preference" });
  }
};

export const updateThemePreference = async (req, res) => {
  try {
    const userId = (req.user?._id || req.user?.id)?.toString();
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { themeMode } = req.body;
    if (
      themeMode !== "system" &&
      themeMode !== "light" &&
      themeMode !== "dark"
    ) {
      return res.status(400).json({
        message: "Invalid theme mode. Must be system, light, or dark",
      });
    }

    const prefs = loadThemePreferences();
    prefs[userId] = themeMode;
    saveThemePreferences(prefs);

    // Broadcast across socket for active clients in user room
    try {
      const io = getIO();
      if (io) {
        io.to(`user:${userId}`).emit("themePreferenceUpdated", { themeMode });
      }
    } catch (socketErr) {
      console.error(
        "Failed to broadcast theme update over socket:",
        socketErr.message
      );
    }

    return res.status(200).json({ themeMode });
  } catch (error) {
    console.error("Failed to update theme preference:", error);
    return res
      .status(500)
      .json({ message: "Failed to update theme preference" });
  }
};

