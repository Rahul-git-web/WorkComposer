import mongoose from "mongoose";
import User from "../models/user.model.js";
import Team from "../models/team.model.js";
import Invite from "../models/invite.model.js";
import EmailChange from "../models/emailChange.model.js";
import Organization from "../models/organization.model.js";
import TimeTrackingSettings from "../models/timeTrackingSettings.model.js";
import { getIO } from "../socket/socket.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { Parser } from "json2csv";
import sendEmail from "../utils/sendEmail.js";
import inviteEmailTemplate from "../templates/inviteEmailTemplate.js";
import verifyEmailTemplate from "../templates/veifyEmailTemplate.js";
import { getAvatarUrl } from "../utils/avatar.js";
import {
  auditSettingsChanged,
  auditUserCreated,
  auditRoleChanged,
  auditUserArchived,
  auditUserRestored,
} from "../utils/auditService.js";
import Role from "../models/role.model.js";
import { isPostgres } from "../db/index.js";
import { getPrismaClient } from "../db/prisma.js";
import { runTransaction } from "../db/transaction.js";
import { inviteRepository } from "../db/repositories/invite.repository.js";
import { timerRepository } from "../db/repositories/timer.repository.js";
import {
  resolveEffectiveAuthContext,
  normalizeId,
} from "../security/effectiveAuthContext.js";
import {
  hasCapability,
  canAccessUserShiftSettings,
  canAssignManager,
  canAccessUserDevices,
  canArchiveUser,
  canUnarchiveUser,
  DECISION_CODES,
} from "../security/policyEvaluator.js";
import { ROLE_NAMES, CONFLICT_STATES } from "../security/policyTypes.js";
import { sendErrorResponse } from "../utils/sendErrorResponse.js";

export const getUsers = async (req, res) => {
  try {
    const currentUser = req.user;

    let users;

    //ROLE-BASED logic
    if (currentUser.role === "owner") {
      // OWNER = see all users in organization

      users = await User.find({
        organization: currentUser.organization,
      })
        .populate("team", "name")
        .populate("manager", "firstName lastName email")
        .select("-password");
    } else if (currentUser.role === "admin") {
      // ADMIN = all except owner
      users = await User.find({
        organization: currentUser.organization,
        role: { $ne: "owner" },
      })
        .populate("team", "name")
        .populate("manager", "firstName lastName email")
        .select("-password -refreshToken");
    } else if (currentUser.role === "manager") {
      // MANAGER = self + managed users

      users = await User.find({
        organization: currentUser.organization,
        $or: [{ _id: currentUser._id }, { manager: currentUser._id }],
      })
        .populate("team", "name")
        .populate("manager", "firstName lastName email")
        .select("-password -refreshToken");
    } else {
      //USER = only self
      users = await User.find({
        _id: currentUser._id,
      })
        .populate("team", "name")
        .populate("manager", "firstName lastName email")
        .select("-password -refreshToken");
    }

    const userWithStats = await Promise.all(
      users.map(async (user) => {
        if (user.role !== "manager") {
          return {
            ...user.toObject(),
            avatar: getAvatarUrl(user.avatar),
            managedUsersCount: 0,
            managedTeamsCount: 0,
          };
        }

        // USERS COUNT
        const managedUsers = await User.countDocuments({
          manager: user._id,
        });

        // TEAMS COUNT
        const managedTeams = await User.distinct("team", {
          manager: user._id,
          team: { $ne: null },
        });

        return {
          ...user.toObject(),
          avatar: getAvatarUrl(user.avatar),
          managedUsersCount: managedUsers,
          managedTeamsCount: managedTeams.length,
        };
      }),
    );

    res.status(200).json(userWithStats);
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to get users", 500);
  }
};

export const inviteUser = async (req, res) => {
  try {
    const { email, role, team } = req.body;

    // -----------------------------
    // 1. Validate required fields
    // -----------------------------
    if (!email || !role || !team) {
      return res.status(400).json({
        message: "Email, role and team are required",
      });
    }

    // -----------------------------
    // 2. Normalize email
    // -----------------------------
    const normalizedEmail = email.trim().toLowerCase();

    // -----------------------------
    // 3. Validate email format
    // -----------------------------
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        message: "Invalid email address",
      });
    }

    // -----------------------------
    // 4. Prevent self invitation
    // -----------------------------
    if (normalizedEmail === req.user.email.trim().toLowerCase()) {
      return res.status(400).json({
        message: "You cannot invite yourself",
      });
    }

    // -----------------------------
    // 5. Check existing user
    // -----------------------------
    const existingUser = await User.findOne({
      email: normalizedEmail,
      organization: req.user.organization,
    });

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    // -----------------------------
    // 6. Check existing active invite
    // -----------------------------
    const existingInvite = await Invite.findOne({
      email: normalizedEmail,
      organization: req.user.organization,
      isAccepted: false,
      expireAt: { $gt: new Date() },
    });

    if (existingInvite) {
      return res.status(400).json({
        message: "Invite already sent",
      });
    }

    // -----------------------------
    // 7. Validate role
    // -----------------------------
    const normalizedRole = role.trim().toLowerCase();

    const roleDoc = await Role.findOne({
      organization: req.user.organization,
      name: new RegExp(`^${normalizedRole}$`, "i"),
    });

    if (!roleDoc) {
      return res.status(400).json({
        message: `Role "${role}" not found for this organization`,
      });
    }

    // -----------------------------
    // 8. Validate team
    // -----------------------------
    const teamExists = await Team.findOne({
      _id: team,
      organization: req.user.organization,
    });

    if (!teamExists) {
      return res.status(400).json({
        message: "Invalid team",
      });
    }

    // -----------------------------
    // 8. Generate secure token
    // -----------------------------
    const rawToken = crypto.randomBytes(32).toString("hex");

    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    // -----------------------------
    // 9. Create invitation
    // -----------------------------
    const invite = await Invite.create({
      email: normalizedEmail,
      role: normalizedRole,
      team: teamExists._id,
      token: hashedToken,
      invitedBy: req.user._id,
      organization: req.user.organization,
      expireAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    });

    try {
      const organizationId =
        req.user.organization?._id || req.user.organization;

      const organizationDoc = await Organization.findById(organizationId)
        .select("name")
        .lean();

      if (!organizationDoc) {
        throw new Error("Organization not found");
      }
      // -----------------------------
      // 10. Generate invitation link
      // -----------------------------
      const inviteLink = `${process.env.CLIENT_URL}/accept-invite?token=${rawToken}`;

      // -----------------------------
      // 11. Generate email
      // -----------------------------
      const html = inviteEmailTemplate({
        inviteLink,
        organization: organizationDoc.name,
        role,
        team: teamExists.name,
      });

      // -----------------------------
      // 12. Send email
      // -----------------------------
      await sendEmail(normalizedEmail, "You're invited to WorkComposer", html);
    } catch (emailError) {
      // Email failed → remove the invitation
      await Invite.findByIdAndDelete(invite._id);

      console.error("INVITATION EMAIL FAILED:", emailError);

      return res.status(500).json({
        message: "Invitation could not be sent. Please try again.",
      });
    }

    // -----------------------------
    // 13. Success
    // -----------------------------
    return res.status(201).json({
      message: "Invitation sent successfully",
    });
  } catch (err) {
    console.error("INVITE USER ERROR:", err);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

export const createUser = async (req, res) => {
  try {
    const { firstName, lastName, email, password, role, team } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // EMAIL VALIDATION
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        message: "Invalid email",
      });
    }

    // EXISTING USER
    const existingUser = await User.findOne({
      email: normalizedEmail,
      organization: req.user.organization,
    });

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    // HASH PASSWORD
    const hashedPassword = await bcrypt.hash(password, 10);

    const normalizedRole = (role || "user").trim().toLowerCase();

    const roleDoc = await Role.findOne({
      organization: req.user.organization,
      name: new RegExp(`^${normalizedRole}$`, "i"),
    });

    if (!roleDoc) {
      return res.status(400).json({
        message: `Role "${role}" not found for this organization`,
      });
    }

    // Validate selected team
    let teamId = team;

    if (teamId) {
      const teamExists = await Team.findOne({
        _id: teamId,
        organization: req.user.organization,
      });

      if (!teamExists) {
        return res.status(400).json({
          message: "Invalid team",
        });
      }

      teamId = teamExists._id;
    } else {
      // Find the default team if no team is selected
      const defaultTeam = await Team.findOne({
        organization: req.user.organization,
        name: "Default team",
      });

      teamId = defaultTeam?._id || null;
    }

    // CREATE USER
    const user = await User.create({
      firstName,
      lastName,
      email: normalizedEmail,
      password: hashedPassword,
      role: normalizedRole,
      roleRef: roleDoc._id,
      team: teamId,
      organization: req.user.organization,
      isVerified: true,
    });

    await auditUserCreated({
      req,
      createdUser: user,
    });

    res.status(201).json({
      success: true,
      message: "User created successfully",
      user,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to create user",
    });
  }
};

export const acceptInvite = async (req, res) => {
  try {
    const { token, password, firstName, lastName } = req.body;

    if (!token || !password || !firstName || !lastName) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters",
      });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const invite = await Invite.findOne({
      token: hashedToken,
    });

    if (!invite) {
      return res.status(400).json({
        message: "Invalid invite",
      });
    }

    if (invite.isAccepted) {
      return res.status(400).json({
        message: "Invitation has already been used",
      });
    }

    if (invite.expireAt < new Date()) {
      return res.status(400).json({
        message: "Invitation has expired",
      });
    }

    const existingUser = await User.findOne({
      email: invite.email.toLowerCase(),
    });

    if (existingUser) {
      const freshInvite = await Invite.findById(invite._id || invite.id);
      if (freshInvite?.isAccepted) {
        return res.status(400).json({
          message: "Invitation has already been used",
        });
      }
      return res.status(400).json({
        message: "User already exists",
      });
    }

    const roleDoc = await Role.findOne({
      organization: invite.organization,
      name: new RegExp(`^${invite.role.trim()}$`, "i"),
    });

    if (!roleDoc) {
      return res.status(400).json({
        message: `Role "${invite.role}" not found for this organization`,
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const createdUser = await runTransaction(async (tx) => {
      // 1. Atomically claim/accept invite. Row-level update prevents concurrent double-acceptance.
      const updatedCount = await inviteRepository.acceptInviteIfUnused(invite._id || invite.id);
      if (updatedCount === 0) {
        const err = new Error("Invitation has already been used");
        err.statusCode = 400;
        throw err;
      }

      // 2. Re-verify user email uniqueness in ambient transaction
      const existingInTx = await User.findOne({
        email: invite.email.toLowerCase(),
      });
      if (existingInTx) {
        const err = new Error("User already exists");
        err.statusCode = 400;
        throw err;
      }

      // 3. Create the user
      const user = await User.create({
        email: invite.email.toLowerCase(),
        password: hashedPassword,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role: invite.role.toLowerCase(),
        roleRef: roleDoc._id,
        organization: invite.organization,
        team: invite.team,
        isVerified: true,
      });

      return user;
    });

    return res.status(201).json({
      message: "Account created successfully",
      user: {
        id: createdUser._id,
        email: createdUser.email,
        role: createdUser.role,
      },
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        message: err.message,
      });
    }

    if (
      err.code === "P2002" ||
      err.message?.includes("Unique constraint") ||
      (err.name === "MongoServerError" && err.code === 11000)
    ) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    console.error("ACCEPT INVITE ERROR:", err);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

export const getInviteDetails = async (req, res) => {
  try {
    const { token } = req.params;

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const invite = await Invite.findOne({
      token: hashedToken,
    }).populate("team", "name");

    if (!invite) {
      return res.status(400).json({
        message: "Invalid invite",
      });
    }

    if (invite.expireAt < new Date()) {
      return res.status(400).json({
        message: "Invite expired",
      });
    }

    if (invite.isAccepted) {
      return res.status(400).json({
        message: "Already used",
      });
    }

    res.json({
      email: invite.email,
      role: invite.role,
      team: invite.team?.name || "Team",
    });
  } catch (err) {
    console.error("GET INVITE DETAILS ERROR:", err);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// Pending invite
export const getInvites = async (req, res) => {
  try {
    const invites = await Invite.find({
      organization: req.user.organization,
      isAccepted: { $ne: true },
      expireAt: { $gt: new Date() },
    }).select("email role expireAt");

    res.json(invites);
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to get invites", 500);
  }
};

// Update user role
export const updateUserRole = async (req, res) => {
  try {
    const { role, roleRef } = req.body;
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({
        message: "Not authorized, no token",
      });
    }

    if (!role && !roleRef) {
      return res.status(400).json({
        message: "Role is required",
      });
    }

    // 1. Resolve trusted organization context
    const callerOrgId = normalizeId(
      req.user.organization?._id || req.user.organizationId || req.user.organization
    );
    if (!callerOrgId) {
      return res.status(403).json({
        message: "Access denied: Missing organization context.",
      });
    }

    // 2. Resolve caller's EffectiveAuthContext authoritatively from primary DB
    const callerRoleDoc = req.user.roleRef
      ? await Role.findById(normalizeId(req.user.roleRef))
      : null;
    const callerAuthContext = resolveEffectiveAuthContext(req.user, callerRoleDoc);

    // 3. Caller capability & role authority check: Must possess manage_users capability
    if (!hasCapability(callerAuthContext, "manage_users")) {
      return res.status(403).json({
        message: "Access denied: Requires manage_users capability.",
      });
    }

    if (
      callerAuthContext.effectiveRoleName !== ROLE_NAMES.OWNER &&
      callerAuthContext.effectiveRoleName !== ROLE_NAMES.ADMIN
    ) {
      return res.status(403).json({
        message: "Access denied: Insufficient role privilege.",
      });
    }

    // 4. Prevent self-modification / self-elevation
    const callerUserId = normalizeId(req.user._id || req.user.id);
    const targetUserId = normalizeId(id);
    if (callerUserId && targetUserId && callerUserId === targetUserId) {
      return res.status(403).json({
        message: "Self-modification prohibited: Users cannot modify their own role.",
      });
    }

    // 5. Tenant-scoped target user lookup
    const user = await User.findOne({
      _id: targetUserId,
      organization: callerOrgId,
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // 6. Owner protection: Existing owner cannot be modified
    if (user.role === ROLE_NAMES.OWNER) {
      return res.status(400).json({
        message: "Cannot change owner role",
      });
    }

    // 7. Admin modification protection: Only Owner can modify an existing Admin
    if (
      user.role === ROLE_NAMES.ADMIN &&
      callerAuthContext.effectiveRoleName !== ROLE_NAMES.OWNER
    ) {
      return res.status(403).json({
        message: "Only owner can modify admin roles",
      });
    }

    // 8. Resolve target Role document authoritatively
    let targetRoleDoc = null;

    if (roleRef) {
      const targetRoleId = normalizeId(roleRef);
      targetRoleDoc = await Role.findById(targetRoleId);

      if (!targetRoleDoc) {
        return res.status(400).json({
          message: "Role referenced by roleRef not found",
        });
      }

      const roleOrgId = normalizeId(
        targetRoleDoc.organization || targetRoleDoc.organizationId
      );
      if (!roleOrgId || roleOrgId !== callerOrgId) {
        return res.status(403).json({
          message:
            "Cross-tenant role assignment prohibited: Role belongs to another organization.",
        });
      }

      // If declared role string was also passed, verify compatibility
      if (
        role &&
        role.trim().toLowerCase() !== (targetRoleDoc.name || "").trim().toLowerCase()
      ) {
        return res.status(400).json({
          message:
            "Privilege mismatch: Declared role name does not match referenced role.",
        });
      }
    } else {
      const normalizedRole = role.trim().toLowerCase();

      targetRoleDoc = await Role.findOne({
        organization: callerOrgId,
        name: new RegExp(`^${normalizedRole}$`, "i"),
      });

      if (!targetRoleDoc) {
        return res.status(400).json({
          message: `Role "${role}" not found for this organization`,
        });
      }
    }

    const normalizedTargetRoleName = (targetRoleDoc.name || "").trim().toLowerCase();

    // 9. Owner role can NEVER be assigned via this endpoint
    if (normalizedTargetRoleName === ROLE_NAMES.OWNER) {
      return res.status(403).json({
        message: "Cannot assign owner role",
      });
    }

    // 10. Admin role can ONLY be assigned by Owner
    if (
      normalizedTargetRoleName === ROLE_NAMES.ADMIN &&
      callerAuthContext.effectiveRoleName !== ROLE_NAMES.OWNER
    ) {
      return res.status(403).json({
        message: "Admin cannot assign admin role",
      });
    }

    // 11. Privilege Delegation Invariant: Non-owner cannot delegate permissions they do not possess
    if (callerAuthContext.effectiveRoleName !== ROLE_NAMES.OWNER) {
      if (Array.isArray(targetRoleDoc.permissions)) {
        for (const perm of targetRoleDoc.permissions) {
          if (!hasCapability(callerAuthContext, perm)) {
            return res.status(403).json({
              message: `Delegation prohibited: Caller cannot grant capability "${perm}" because they do not possess it.`,
            });
          }
        }
      }

      if (
        targetRoleDoc.reportAccess === "all" &&
        callerAuthContext.effectiveReportAccess !== "all"
      ) {
        return res.status(403).json({
          message:
            "Delegation prohibited: Caller cannot grant organization-wide report access.",
        });
      }

      if (
        targetRoleDoc.screenshotAccess === "all" &&
        callerAuthContext.effectiveScreenshotAccess !== "all"
      ) {
        return res.status(403).json({
          message:
            "Delegation prohibited: Caller cannot grant organization-wide screenshot access.",
        });
      }
    }

    // 12. Save synchronized role & roleRef
    const previousRole = user.role;
    user.role = normalizedTargetRoleName;
    user.roleRef = targetRoleDoc._id;

    await user.save();

    await auditRoleChanged({
      req,
      user,
      previousRole,
      newRole: user.role,
    });

    return res.json({
      message: "Role updated successfully",
      user,
    });
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to update user role", 500);
  }
};

// Delete users
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;

    if (!id || id === "undefined") {
      return res.status(400).json({
        message: "Invalid user id",
      });
    }

    if (!email) {
      return res.status(400).json({
        message: "Email confirmation is required",
      });
    }

    const callerOrgId = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();
    if (!callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing organization context",
      });
    }

    // First check users collection within the caller's organization
    let user = await User.findOne({
      _id: id,
      organization: callerOrgId,
    });

    if (user) {
      if (user.role === "owner") {
        return res.status(400).json({
          message: "Cannot delete owner",
        });
      }

      // Verify email before deleting
      if (user.email.toLowerCase().trim() !== email.toLowerCase().trim()) {
        return res.status(400).json({
          message: "Email confirmation does not match",
        });
      }

      // ATOMIC USER DELETION (SEC20-F02)
      await runTransaction(async () => {
        await user.deleteOne();
      });

      return res.json({
        success: true,
        message: "User deleted successfully",
      });
    }

    // Check invites collection within the caller's organization
    const invite = await Invite.findOne({
      _id: id,
      organization: callerOrgId,
    });

    if (invite) {
      // Verify invite email before deleting
      if (invite.email?.toLowerCase().trim() !== email.toLowerCase().trim()) {
        return res.status(400).json({
          message: "Email confirmation does not match",
        });
      }

      // ATOMIC INVITE DELETION (SEC20-F02)
      await runTransaction(async () => {
        await invite.deleteOne();
      });

      return res.json({
        success: true,
        message: "Invite deleted successfully",
      });
    }

    return res.status(404).json({
      message: "User or invite not found",
    });
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to delete user", 500);
  }
};

// Resend Invite
export const resendInvite = async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        message: "Invite id is required",
      });
    }

    const invite = await Invite.findOne({
      _id: id,
      organization: req.user.organization,
      isAccepted: false,
    });

    if (!invite) {
      return res.status(404).json({
        message: "Invite not found",
      });
    }

    // Validate role still exists
    const roleDoc = await Role.findOne({
      organization: req.user.organization,
      name: new RegExp(`^${invite.role.trim()}$`, "i"),
    });

    if (!roleDoc) {
      return res.status(400).json({
        message: `Role "${invite.role}" no longer exists for this organization`,
      });
    }

    // Validate team
    const teamDoc = await Team.findOne({
      _id: invite.team,
      organization: req.user.organization,
    });

    if (!teamDoc) {
      return res.status(400).json({
        message: "Invite team no longer exists",
      });
    }

    // Get organization
    const organizationId = req.user.organization?._id || req.user.organization;

    const organizationDoc = await Organization.findById(organizationId)
      .select("name logo")
      .lean();

    if (!organizationDoc) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    // Generate new secure token
    const rawToken = crypto.randomBytes(32).toString("hex");

    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const newExpireAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

    // Temporarily keep old values until email succeeds
    const oldToken = invite.token;
    const oldExpireAt = invite.expireAt;

    invite.token = hashedToken;
    invite.expireAt = newExpireAt;

    await invite.save();

    try {
      const inviteLink = `${process.env.CLIENT_URL}/accept-invite?token=${rawToken}`;

      const html = inviteEmailTemplate({
        inviteLink,
        organization: organizationDoc.name,
        role: invite.role,
        team: teamDoc.name,
      });

      await sendEmail(invite.email, "You're invited to WorkComposer", html);
    } catch (emailError) {
      // Restore previous working invitation
      invite.token = oldToken;
      invite.expireAt = oldExpireAt;

      await invite.save();

      console.error("RESEND INVITATION EMAIL FAILED:", emailError);

      return res.status(500).json({
        message: "Invitation could not be resent. Please try again.",
      });
    }

    return res.status(200).json({
      message: "Invite resent successfully",
    });
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to resend invite", 500);
  }
};

export const getUserProfile = async (req, res) => {
  try {
    const currentUser = req.user;
    const targetUserId = req.params.id;

    let allowed = false;

    // Owner can view anyone in the organization
    if (currentUser.role === "owner") {
      allowed = true;
    }

    // Admin can view users in the organization
    else if (currentUser.role === "admin") {
      allowed = true;
    }

    // Manager can view self + users they manage
    else if (currentUser.role === "manager") {
      if (String(currentUser._id) === String(targetUserId)) {
        allowed = true;
      } else {
        const managedUser = await User.findOne({
          _id: targetUserId,
          organization: currentUser.organization,
          manager: currentUser._id,
        });

        allowed = !!managedUser;
      }
    }

    // Normal user can only view themselves
    else {
      allowed =
        String(currentUser._id) === String(targetUserId);
    }

    if (!allowed) {
      return res.status(403).json({
        message: "You do not have permission to view this profile.",
      });
    }

    const user = await User.findOne({
      _id: targetUserId,
      organization: currentUser.organization,
    })
      .populate("manager", "firstName lastName email")
      .populate("team", "name")
      .select(
        "-password -refreshToken -twoFactorCode -twoFactorExpires -verificationToken -verificationTokenExpire -resetToken -resetTokenExpire"
      );

    if (!user) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    const userObj = user.toObject ? user.toObject() : { ...user };

    // Explicit defense-in-depth sanitization of sensitive authentication and recovery secrets
    const SENSITIVE_FIELDS = [
      "password",
      "passwordHash",
      "refreshToken",
      "refreshTokens",
      "twoFactorCode",
      "twoFactorExpires",
      "verificationToken",
      "verificationTokenExpire",
      "resetToken",
      "resetTokenExpire",
    ];
    for (const secretField of SENSITIVE_FIELDS) {
      delete userObj[secretField];
    }

    // Normalize avatar URL using canonical backend helper
    userObj.avatar = getAvatarUrl(userObj.avatar) || "";

    // Resolve authoritative live tracking status
    let isTracking = false;
    try {
      const activeTimer = await timerRepository.findActiveTimerByUser(targetUserId);
      if (activeTimer) {
        const timerUserId =
          activeTimer.userId?.toString() ||
          activeTimer.user?.toString() ||
          activeTimer.user?.id?.toString() ||
          activeTimer.user?._id?.toString();

        if (timerUserId === targetUserId.toString() && activeTimer.status === "running") {
          isTracking = true;
        }
      }

      // If active timer was not found, check whether any registered device is online and actively tracking
      if (!isTracking && Array.isArray(userObj.devices)) {
        isTracking = userObj.devices.some(
          (d) => d.isOnline === true && d.isTracking === true
        );
      }
    } catch (timerErr) {
      console.error("Failed to resolve active timer in getUserProfile:", timerErr);
      isTracking = false;
    }

    userObj.isTracking = isTracking;
    userObj.trackingStatus = isTracking ? "Tracking" : "Not tracking";

    // Resolve latest device sync timestamp (Last Sync - distinct from work session time)
    const latestDevice = Array.isArray(userObj.devices) && userObj.devices.length > 0
      ? [...userObj.devices].sort(
          (a, b) =>
            new Date(b.lastSync || 0).getTime() -
            new Date(a.lastSync || 0).getTime()
        )[0]
      : null;

    userObj.lastSync = latestDevice?.lastSync || null;
    userObj.appVersion = latestDevice?.appVersion || "Unknown";

    return res.status(200).json(userObj);
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to get user profile", 500);
  }
};

// All Users with invites
export const getAllUsersWithInvites = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 5;

    const search = req.query.search || "";
    const role = req.query.role || "";
    const team = req.query.team || "";

    const skip = (page - 1) * limit;

    // USER QUERY
    const userQuery = {
      organization: req.user.organization,
    };

    // INVITE QUERY
    const inviteQuery = {
      organization: req.user.organization,
      isAccepted: { $ne: true },
      expireAt: { $gt: new Date() },
    };

    // SEARCH
    if (search) {
      userQuery.$or = [
        {
          firstName: {
            $regex: search,
            $options: "i",
          },
        },
        {
          lastName: {
            $regex: search,
            $options: "i",
          },
        },
        {
          email: {
            $regex: search,
            $options: "i",
          },
        },
      ];

      inviteQuery.email = {
        $regex: search,
        $options: "i",
      };
    }

    // ROLE FILTER
    if (role && role !== "All Roles") {
      userQuery.role = role.toLowerCase();

      inviteQuery.role = role.toLowerCase();
    }

    // TEAM FILTER
    if (team && team !== "All Teams") {
      const selectedTeam = await Team.findOne({
        organization: req.user.organization,
        name: team,
      });

      if (selectedTeam) {
        userQuery.team = selectedTeam._id;
        inviteQuery.team = selectedTeam._id;
      } else {
        userQuery.team = null;
        inviteQuery.team = null;
      }
    }

    // ACTIVE USERS
    const users = await User.find(userQuery)
      .populate("team", "name")
      .populate("manager", "firstName lastName email")
      .select("-password");

    // PENDING INVITES
    const invites = await Invite.find(inviteQuery).populate("team", "name");

    // BATCHED MANAGER STATS (avoids per-manager N+1 queries)
    const managerIds = users
      .filter((u) => u.role === "manager")
      .map((u) => String(u._id || u.id))
      .filter(Boolean);

    const managedUsersCountMap = new Map();
    const managedTeamsMap = new Map();

    if (managerIds.length > 0) {
      const subordinates = await User.find({
        organization: req.user.organization,
        manager: { $in: managerIds },
      }).select("manager team");

      for (const sub of subordinates) {
        const managerId = String(
          sub.manager?._id || sub.manager?.id || sub.manager || "",
        );
        if (!managerId) continue;

        managedUsersCountMap.set(
          managerId,
          (managedUsersCountMap.get(managerId) || 0) + 1,
        );

        const teamId = sub.team
          ? String(sub.team?._id || sub.team?.id || sub.team)
          : "";
        if (teamId) {
          if (!managedTeamsMap.has(managerId)) {
            managedTeamsMap.set(managerId, new Set());
          }
          managedTeamsMap.get(managerId).add(teamId);
        }
      }
    }

    // FORMAT USERS
    const formattedUsers = users.map((user) => {
      const uidStr = String(user._id || user.id);
      const isManager = user.role === "manager";
      const managedUsersCount = isManager
        ? managedUsersCountMap.get(uidStr) || 0
        : 0;
      const managedTeamsCount = isManager
        ? managedTeamsMap.get(uidStr)?.size || 0
        : 0;

      return {
        id: user._id,
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        avatar: getAvatarUrl(user.avatar),
        role: user.role,
        team: user.team?.name || "",
        manager: user.manager
          ? {
              _id: user.manager._id,
              firstName: user.manager.firstName,
              lastName: user.manager.lastName,
              email: user.manager.email,
            }
          : null,
        status: user.isArchived ? "archived" : "active",
        createdAt: user.createdAt,
        devices: user.devices || [],
        managedUsersCount,
        managedTeamsCount,
      };
    });

    // FORMAT INVITES
    const formattedInvites = invites.map((invite) => ({
      id: invite._id,
      _id: invite._id,
      email: invite.email,
      role: invite.role,
      team: (typeof invite.team === "object" ? invite.team?.name : invite.team) || "Default team",
      status: "invited",
      createdAt: invite.createdAt,
      expireAt: invite.expireAt,
    }));

    // MERGE
    const allUsers = [...formattedUsers, ...formattedInvites];

    // SORT LATEST FIRST
    allUsers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // PAGINATION
    const paginatedUsers = allUsers.slice(skip, skip + limit);

    res.json({
      users: paginatedUsers,
      totalUsers: allUsers.length,
      totalPages: Math.ceil(allUsers.length / limit),
      currentPage: page,
      currentUser: req.user,
    });
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to get users with invites", 500);
  }
};

//Bulk Users invites
export const bulkInvitesUsers = async (req, res) => {
  try {
    const { emails, role, team } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({
        message: "Emails are required",
      });
    }

    if (!role) {
      return res.status(400).json({
        message: "Role is required",
      });
    }

    if (!team) {
      return res.status(400).json({
        message: "Team is required",
      });
    }

    // Validate team belongs to current organization
    const selectedTeam = await Team.findOne({
      _id: team,
      organization: req.user.organization,
    });

    if (!selectedTeam) {
      return res.status(400).json({
        message: "Invalid team",
      });
    }

    // Validate role belongs to current organization
    const normalizedRole = role.trim().toLowerCase();

    const roleDoc = await Role.findOne({
      organization: req.user.organization,
      name: new RegExp(`^${normalizedRole}$`, "i"),
    });

    if (!roleDoc) {
      return res.status(400).json({
        message: `Role "${role}" not found for this organization`,
      });
    }

    // Load organization information for email
    const organizationId = req.user.organization?._id || req.user.organization;

    const organizationDoc = await Organization.findById(organizationId)
      .select("name logo")
      .lean();

    if (!organizationDoc) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    const success = [];
    const failed = [];

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const normalizedEmails = [
      ...new Set(
        emails.map((email) => email.trim().toLowerCase()).filter(Boolean),
      ),
    ];

    for (const email of normalizedEmails) {
      try {
        // -----------------------------
        // Email validation
        // -----------------------------
        if (!emailRegex.test(email)) {
          failed.push({
            email,
            reason: "Invalid email",
          });

          continue;
        }

        // -----------------------------
        // Prevent self invitation
        // -----------------------------
        if (email === req.user.email.toLowerCase().trim()) {
          failed.push({
            email,
            reason: "You cannot invite yourself",
          });

          continue;
        }

        // -----------------------------
        // Existing user
        // -----------------------------
        const existingUser = await User.findOne({
          email,
          organization: req.user.organization,
        });

        if (existingUser) {
          failed.push({
            email,
            reason: "User already exists",
          });

          continue;
        }

        // -----------------------------
        // Existing active invitation
        // -----------------------------
        const existingInvite = await Invite.findOne({
          email,
          organization: req.user.organization,
          isAccepted: false,
          expireAt: { $gt: new Date() },
        });

        if (existingInvite) {
          failed.push({
            email,
            reason: "Invite already sent",
          });

          continue;
        }

        // -----------------------------
        // Generate secure token
        // -----------------------------
        const rawToken = crypto.randomBytes(32).toString("hex");

        const hashedToken = crypto
          .createHash("sha256")
          .update(rawToken)
          .digest("hex");

        // -----------------------------
        // Create invitation
        // -----------------------------
        const invite = await Invite.create({
          email,
          role: normalizedRole,
          team: selectedTeam._id,
          token: hashedToken,
          invitedBy: req.user._id,
          organization: req.user.organization,
          expireAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        });

        try {
          // -----------------------------
          // Generate invitation URL
          // -----------------------------
          const inviteLink = `${process.env.CLIENT_URL}/accept-invite?token=${rawToken}`;

          // -----------------------------
          // Generate email
          // -----------------------------
          const html = inviteEmailTemplate({
            inviteLink,
            organization: organizationDoc.name,
            role: normalizedRole,
            team: selectedTeam.name,
          });

          // -----------------------------
          // Send invitation email
          // -----------------------------
          await sendEmail(email, "You're invited to WorkComposer", html);

          success.push(email);
        } catch (emailError) {
          console.error(`INVITATION EMAIL FAILED FOR ${email}:`, emailError);

          // Don't leave a dead invitation
          // if the email wasn't actually sent.
          await Invite.findByIdAndDelete(invite._id);

          failed.push({
            email,
            reason: "Failed to send invitation email",
          });
        }
      } catch (err) {
        console.error(`BULK INVITE FAILED FOR ${email}:`, err);

        failed.push({
          email,
          reason: "Something went wrong",
        });
      }
    }

    return res.status(200).json({
      success,
      failed,
    });
  } catch (err) {
    console.error("BULK INVITE ERROR:", err);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

//Update Users
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;

    const { firstName, lastName, team } = req.body;

    const callerOrgId = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();
    if (!callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing organization context",
      });
    }

    const callerUserId = (req.user?._id || req.user?.id)?.toString();
    const isSelf = callerUserId && callerUserId === id.toString();
    const callerRole = (req.user?.role || "").toLowerCase();
    const isOrgAdmin = ["owner", "admin"].includes(callerRole);

    if (!isSelf && !isOrgAdmin) {
      return res.status(403).json({
        message: "You do not have permission to update another user's profile",
      });
    }

    if (team !== undefined && !isOrgAdmin) {
      return res.status(403).json({
        message: "Only organization administrators can reassign teams",
      });
    }

    const user = await User.findOne({
      _id: id,
      organization: callerOrgId,
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Explicit credential boundary: reject password mutation through generic user update
    if (req.body.password !== undefined && req.body.password !== null) {
      if (typeof req.body.password !== "string" || req.body.password.trim() !== "") {
        return res.status(400).json({
          message: "Password mutation is not permitted through generic user profile update. Use dedicated password change endpoint.",
        });
      }
    }

    if (firstName !== undefined) {
      user.firstName = firstName;
    }

    if (lastName !== undefined) {
      user.lastName = lastName;
    }

    if (team !== undefined) {
      let teamDoc = null;
      const trimmedTeam = typeof team === "string" ? team.trim() : (team?.toString ? team.toString().trim() : "");

      if (!trimmedTeam) {
        return res.status(400).json({
          message: "Invalid team",
        });
      }

      if (mongoose.Types.ObjectId.isValid(trimmedTeam)) {
        teamDoc = await Team.findOne({
          _id: trimmedTeam,
          organization: user.organization,
        });
      }

      if (!teamDoc) {
        const matchingTeams = await Team.find({
          name: trimmedTeam,
          organization: user.organization,
        });

        if (matchingTeams.length > 1) {
          return res.status(400).json({
            message: "Ambiguous team name: Multiple teams found with this name. Please specify by team ID.",
          });
        }
        if (matchingTeams.length === 1) {
          teamDoc = matchingTeams[0];
        }
      }

      if (!teamDoc) {
        return res.status(400).json({
          message: "Invalid team",
        });
      }

      user.team = teamDoc._id || teamDoc.id;
    }

    await user.save();

    let teamName = "";
    if (user.team) {
      if (typeof user.team === "object" && user.team.name) {
        teamName = user.team.name;
      } else {
        const currentTeamDoc = await Team.findById(user.team);
        if (currentTeamDoc) {
          teamName = currentTeamDoc.name || "";
        }
      }
    }

    const sanitizedUser = user.toObject ? user.toObject() : { ...user };
    delete sanitizedUser.password;
    delete sanitizedUser.passwordHash;
    if (teamName) {
      sanitizedUser.team = teamName;
    }

    res.json({
      success: true,
      user: sanitizedUser,
    });
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to update profile", 500);
  }
};

// Update Users Email
export const updateUserEmail = async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: id },
    });

    if (existingUser) {
      return res.status(400).json({
        message: "Email already exists",
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    user.email = normalizedEmail;

    await user.save();

    res.json({
      message: "Email updated successfully",
      user,
    });
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to update email", 500);
  }
};

// Email Change Request
export const requestEmailChange = async (req, res) => {
  try {
    const callerUserId = normalizeId(req.user?._id || req.user?.id);
    const callerOrgId = normalizeId(req.user?.organizationId || req.user?.organization);
    const targetUserId = normalizeId(req.params.id);

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing authentication context",
      });
    }

    if (!targetUserId) {
      return res.status(400).json({
        message: "Target user ID is required",
      });
    }

    const isSelf = callerUserId === targetUserId;

    // Cross-user modification authorization check: only organization admins/owners can initiate for other users
    if (!isSelf) {
      const isOrgAdmin = req.user.role === "owner" || req.user.role === "admin";
      if (!isOrgAdmin) {
        return res.status(403).json({
          message: "You do not have permission to change another user's email",
        });
      }
    }

    // Target user must belong to caller's authoritative organization
    const targetUser = await User.findOne({
      _id: targetUserId,
      organization: callerOrgId,
    });

    if (!targetUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Privilege boundary: Admins cannot change the email of the organization Owner
    if (!isSelf && targetUser.role === "owner" && req.user.role !== "owner") {
      return res.status(403).json({
        message: "Only the organization owner can change their own email",
      });
    }

    const { newEmail } = req.body || {};

    if (!newEmail || typeof newEmail !== "string" || !newEmail.trim()) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizedEmail = newEmail.toLowerCase().trim();

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        message: "Invalid email format",
      });
    }

    if (normalizedEmail === targetUser.email.toLowerCase().trim()) {
      return res.status(400).json({
        message: "New email must be different from current email",
      });
    }

    // Check existing email across the platform
    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(400).json({
        message: "Email already exists",
      });
    }

    // Generate high-entropy token and its SHA-256 hash
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    // Invalidate any previous pending email-change requests for this user
    await EmailChange.deleteMany({
      user: targetUser._id,
    });

    // Save pending request with hashed token and 24-hour expiration
    await EmailChange.create({
      user: targetUser._id,
      newEmail: normalizedEmail,
      token: hashedToken,
      expireAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    });

    // Construct verification link delivered exclusively via email
    const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:3000";
    const verifyUrl = `${clientUrl}/verify-email-change/${rawToken}`;
    const html = verifyEmailTemplate({
      verifyUrl,
      firstName: targetUser.firstName || "User",
    });

    try {
      await sendEmail(normalizedEmail, "Verify your new email address", html);
    } catch (emailErr) {
      console.error("Failed to send verification email:", emailErr?.message || emailErr);
      // Clean up pending token if delivery fails to avoid leaving an un-delivered token
      await EmailChange.deleteMany({ user: targetUser._id });
      return res.status(500).json({
        message: "Failed to send verification email. Please try again later.",
      });
    }

    // Security invariant: Never return raw token, verification link, or sensitive identity in response
    return res.status(200).json({
      message: "Verification email sent successfully",
    });
  } catch (err) {
    console.error("REQUEST EMAIL CHANGE ERROR:", err);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

// Verify Email Change
export const verifyEmailChange = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token || typeof token !== "string" || !token.trim()) {
      return res.status(400).json({
        message: "Invalid or expired verification link",
      });
    }

    const hashedToken = crypto.createHash("sha256").update(token.trim()).digest("hex");

    const emailChange = await EmailChange.findOne({
      token: hashedToken,
    });

    if (!emailChange) {
      return res.status(400).json({
        message: "Invalid or expired verification link",
      });
    }

    if (!emailChange.expireAt || new Date(emailChange.expireAt) < new Date()) {
      await EmailChange.deleteOne({ _id: emailChange._id });
      return res.status(400).json({
        message: "Invalid or expired verification link",
      });
    }

    const user = await User.findById(emailChange.user);

    if (!user) {
      await EmailChange.deleteOne({ _id: emailChange._id });
      return res.status(404).json({
        message: "User not found",
      });
    }

    const normalizedNewEmail = emailChange.newEmail.toLowerCase().trim();

    // Verify email is not already taken by another account before applying
    const existingUser = await User.findOne({
      email: normalizedNewEmail,
      _id: { $ne: user._id },
    });

    if (existingUser) {
      await EmailChange.deleteOne({ _id: emailChange._id });
      return res.status(400).json({
        message: "Email already exists",
      });
    }

    // Atomically apply the email change and consume the verification token
    user.email = normalizedNewEmail;
    await user.save();

    // Immediate token consumption prevents replay attacks
    await EmailChange.deleteOne({ _id: emailChange._id });

    return res.status(200).json({
      message: "Email updated successfully",
    });
  } catch (err) {
    console.error("VERIFY EMAIL CHANGE ERROR:", err);

    return res.status(500).json({
      message: "Failed to verify email change",
    });
  }
};

//Archive user
export const archiveUser = async (req, res) => {
  try {
    const callerUserId = (req.user?.id || req.user?._id)?.toString();
    const callerOrgId = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();
    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing authentication context",
      });
    }

    // Tenant boundary: client-supplied organizationId in query or body must match callerOrgId if provided
    if (
      (req.query.organizationId && req.query.organizationId.toString() !== callerOrgId) ||
      (req.body?.organizationId && req.body.organizationId.toString() !== callerOrgId)
    ) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const { id: targetUserId } = req.params;
    if (!targetUserId) {
      return res.status(400).json({
        message: "Target user ID is required",
      });
    }

    // Tenant-scoped target lookup: NEVER disclose cross-tenant users
    const user = await User.findOne({
      _id: targetUserId,
      organization: callerOrgId,
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Resolve authoritative EffectiveAuthContext
    let callerRoleDoc = null;
    if (req.user.roleRef) {
      callerRoleDoc = await Role.findById(req.user.roleRef).lean();
    }
    const authContext = resolveEffectiveAuthContext(req.user, callerRoleDoc);

    // Evaluate authorization policy BEFORE performing any mutation or side-effects
    const decision = canArchiveUser(authContext, user);
    if (!decision.allowed) {
      if (decision.code === DECISION_CODES.TENANT_MISMATCH) {
        return res.status(404).json({
          message: "User not found",
        });
      }
      if (decision.code === DECISION_CODES.IMMUTABLE_ROLE) {
        return res.status(400).json({
          message: "Owner cannot be archived",
        });
      }
      if (decision.code === DECISION_CODES.SELF_MODIFICATION_PROHIBITED) {
        return res.status(400).json({
          message: "Users cannot archive themselves",
        });
      }
      return res.status(403).json({
        message: decision.reason,
        code: decision.code,
      });
    }

    // Idempotency: If user is already archived, safely return 200 without duplicate side effects
    if (user.isArchived) {
      return res.status(200).json({
        success: true,
        message: "User is already archived",
        user,
      });
    }

    user.isArchived = true;
    await user.save();

    await auditUserArchived({
      req,
      user,
    });

    return res.status(200).json({
      success: true,
      message: "User archived successfully",
      user,
    });
  } catch (err) {
    console.error("ARCHIVE USER ERROR:", err);
    return res.status(500).json({
      message: "Server error",
    });
  }
};

//Unarchive User
export const unarchiveUser = async (req, res) => {
  try {
    const callerUserId = (req.user?.id || req.user?._id)?.toString();
    const callerOrgId = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();
    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing authentication context",
      });
    }

    // Tenant boundary: client-supplied organizationId in query or body must match callerOrgId if provided
    if (
      (req.query.organizationId && req.query.organizationId.toString() !== callerOrgId) ||
      (req.body?.organizationId && req.body.organizationId.toString() !== callerOrgId)
    ) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const { id: targetUserId } = req.params;
    if (!targetUserId) {
      return res.status(400).json({
        message: "Target user ID is required",
      });
    }

    // Tenant-scoped target lookup: NEVER disclose cross-tenant users
    const user = await User.findOne({
      _id: targetUserId,
      organization: callerOrgId,
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Resolve authoritative EffectiveAuthContext
    let callerRoleDoc = null;
    if (req.user.roleRef) {
      callerRoleDoc = await Role.findById(req.user.roleRef).lean();
    }
    const authContext = resolveEffectiveAuthContext(req.user, callerRoleDoc);

    // Evaluate authorization policy BEFORE performing any mutation or side-effects
    const decision = canUnarchiveUser(authContext, user);
    if (!decision.allowed) {
      if (decision.code === DECISION_CODES.TENANT_MISMATCH) {
        return res.status(404).json({
          message: "User not found",
        });
      }
      if (decision.code === DECISION_CODES.IMMUTABLE_ROLE) {
        return res.status(400).json({
          message: "Owner cannot be unarchived",
        });
      }
      if (decision.code === DECISION_CODES.SELF_MODIFICATION_PROHIBITED) {
        return res.status(400).json({
          message: "Users cannot unarchive themselves",
        });
      }
      return res.status(403).json({
        message: decision.reason,
        code: decision.code,
      });
    }

    // Idempotency: If user is already active, safely return 200 without duplicate side effects
    if (!user.isArchived) {
      return res.status(200).json({
        success: true,
        message: "User is already active",
        user,
      });
    }

    user.isArchived = false;
    await user.save();

    await auditUserRestored({
      req,
      user,
    });

    return res.status(200).json({
      success: true,
      message: "User unarchived successfully",
      user,
    });
  } catch (err) {
    console.error("UNARCHIVE USER ERROR:", err);
    return res.status(500).json({
      message: "Server error",
    });
  }
};

// Update Invite Role
export const updateInviteRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!req.user) {
      return res.status(401).json({
        message: "Not authorized, no token",
      });
    }

    if (!role) {
      return res.status(400).json({
        message: "Role is required",
      });
    }

    const callerOrgId = normalizeId(
      req.user.organization?._id || req.user.organizationId || req.user.organization
    );
    if (!callerOrgId) {
      return res.status(403).json({
        message: "Access denied: Missing organization context.",
      });
    }

    // Resolve caller EffectiveAuthContext
    const callerRoleDoc = req.user.roleRef
      ? await Role.findById(normalizeId(req.user.roleRef))
      : null;
    const callerAuthContext = resolveEffectiveAuthContext(req.user, callerRoleDoc);

    if (!hasCapability(callerAuthContext, "manage_users")) {
      return res.status(403).json({
        message: "Access denied: Requires manage_users capability.",
      });
    }

    if (
      callerAuthContext.effectiveRoleName !== ROLE_NAMES.OWNER &&
      callerAuthContext.effectiveRoleName !== ROLE_NAMES.ADMIN
    ) {
      return res.status(403).json({
        message: "Access denied: Insufficient role privilege.",
      });
    }

    const normalizedRole = role.trim().toLowerCase();

    // Owner role can NEVER be assigned to an invite
    if (normalizedRole === ROLE_NAMES.OWNER) {
      return res.status(403).json({
        message: "Cannot assign owner role",
      });
    }

    // Admin role can only be assigned by Owner
    if (
      normalizedRole === ROLE_NAMES.ADMIN &&
      callerAuthContext.effectiveRoleName !== ROLE_NAMES.OWNER
    ) {
      return res.status(403).json({
        message: "Admin cannot assign admin role",
      });
    }

    const invite = await Invite.findOne({
      _id: id,
      organization: callerOrgId,
      isAccepted: false,
    });

    if (!invite) {
      return res.status(404).json({
        message: "Invite not found",
      });
    }

    const roleDoc = await Role.findOne({
      organization: callerOrgId,
      name: new RegExp(`^${normalizedRole}$`, "i"),
    });

    if (!roleDoc) {
      return res.status(400).json({
        message: `Role "${role}" not found for this organization`,
      });
    }

    // Privilege Delegation Invariant: Non-owner cannot delegate permissions they do not possess
    if (callerAuthContext.effectiveRoleName !== ROLE_NAMES.OWNER) {
      if (Array.isArray(roleDoc.permissions)) {
        for (const perm of roleDoc.permissions) {
          if (!hasCapability(callerAuthContext, perm)) {
            return res.status(403).json({
              message: `Delegation prohibited: Caller cannot grant capability "${perm}" because they do not possess it.`,
            });
          }
        }
      }

      if (
        roleDoc.reportAccess === "all" &&
        callerAuthContext.effectiveReportAccess !== "all"
      ) {
        return res.status(403).json({
          message:
            "Delegation prohibited: Caller cannot grant organization-wide report access.",
        });
      }

      if (
        roleDoc.screenshotAccess === "all" &&
        callerAuthContext.effectiveScreenshotAccess !== "all"
      ) {
        return res.status(403).json({
          message:
            "Delegation prohibited: Caller cannot grant organization-wide screenshot access.",
        });
      }
    }

    invite.role = normalizedRole;

    await invite.save();

    return res.status(200).json({
      message: "Invite role updated successfully",
      invite,
    });
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to update invite role", 500);
  }
};

// User devices
export const getUserDevices = async (req, res) => {
  try {
    const callerUserId = (req.user?.id || req.user?._id)?.toString();
    const callerOrgId = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing authentication context",
      });
    }

    // Tenant boundary: client-supplied organizationId must match callerOrgId if provided
    if (
      (req.query.organizationId && req.query.organizationId.toString() !== callerOrgId) ||
      (req.body?.organizationId && req.body?.organizationId.toString() !== callerOrgId)
    ) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const targetUserId = req.params.id;
    if (!targetUserId) {
      return res.status(400).json({
        message: "Target user ID is required",
      });
    }

    // Tenant boundary: Target user must exist within the caller's organization
    const targetUser = await User.findOne({
      _id: targetUserId,
      organization: callerOrgId,
    });

    if (!targetUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Resolve authoritative EffectiveAuthContext
    let callerRoleDoc = null;
    if (req.user.roleRef) {
      callerRoleDoc = await Role.findById(req.user.roleRef).lean();
    }
    const authContext = resolveEffectiveAuthContext(req.user, callerRoleDoc);

    // Evaluate authorization policy
    const decision = canAccessUserDevices(authContext, targetUser, "read");
    if (!decision.allowed) {
      if (decision.code === DECISION_CODES.TENANT_MISMATCH) {
        return res.status(404).json({
          message: "User not found",
        });
      }
      return res.status(403).json({
        message: decision.reason || "Unauthorized: Access to user devices is forbidden",
      });
    }

    const latestDevice = [...(targetUser.devices || [])].sort((a, b) => {
      const aTime = a.lastSync ? new Date(a.lastSync).getTime() : 0;
      const bTime = b.lastSync ? new Date(b.lastSync).getTime() : 0;
      return bTime - aTime;
    })[0];

    // Sanitize device metadata: never expose secrets, tokens, or credential material
    const sanitizedDevice = latestDevice
      ? {
          deviceId: latestDevice.deviceId,
          ip: latestDevice.ip || "Unknown IP",
          location: latestDevice.location || "Unknown",
          platform: latestDevice.platform || "Unknown",
          appVersion: latestDevice.appVersion || "Unknown",
          hostname: latestDevice.hostname || "",
          loginTime: latestDevice.loginTime,
          lastSync: latestDevice.lastSync,
          isOnline: Boolean(latestDevice.isOnline),
          isTracking: Boolean(latestDevice.isTracking),
        }
      : null;

    return res.status(200).json({
      email: targetUser.email,
      devices: sanitizedDevice ? [sanitizedDevice] : [],
    });
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to get user devices", 500);
  }
};

export const registerUserDevice = async (req, res) => {
  try {
    const { deviceId, platform, appVersion, hostname } = req.body;

    if (!deviceId) {
      return res.status(400).json({
        message: "Device ID is required",
      });
    }

    const callerUserId = (req.user?.id || req.user?._id)?.toString();
    const callerOrgId = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing authentication context",
      });
    }

    const user = await User.findOne({
      _id: callerUserId,
      organization: callerOrgId,
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (!user.devices) {
      user.devices = [];
    }

    const existingDevice = user.devices.find(
      (device) => device.deviceId === deviceId,
    );

    if (existingDevice) {
      existingDevice.platform = platform || existingDevice.platform;
      existingDevice.appVersion = appVersion || existingDevice.appVersion;
      existingDevice.hostname = hostname || existingDevice.hostname;
      existingDevice.ip = req.ip || existingDevice.ip;
      existingDevice.lastSync = new Date();
      existingDevice.isOnline = true;
    } else {
      user.devices.push({
        deviceId,
        ip: req.ip || "Unknown IP",
        location: "Unknown",
        platform: platform || "Unknown",
        appVersion: appVersion || "Unknown",
        hostname: hostname || "",
        loginTime: new Date(),
        lastSync: new Date(),
        isOnline: true,
      });
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: existingDevice
        ? "Device updated successfully"
        : "Device registered successfully",
    });
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to register device", 500);
  }
};

export const logoutUserDevice = async (req, res) => {
  try {
    const callerUserId = (req.user?.id || req.user?._id)?.toString();
    const callerOrgId = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing authentication context",
      });
    }

    // Tenant boundary: client-supplied organizationId must match callerOrgId if provided
    if (
      (req.query.organizationId && req.query.organizationId.toString() !== callerOrgId) ||
      (req.body?.organizationId && req.body?.organizationId.toString() !== callerOrgId)
    ) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const { id: targetUserId, deviceId } = req.params;

    if (!targetUserId) {
      return res.status(400).json({
        message: "Target user ID is required",
      });
    }

    if (!deviceId) {
      return res.status(400).json({
        message: "Device ID is required",
      });
    }

    // Tenant boundary: Target user must exist within caller's organization
    const targetUser = await User.findOne({
      _id: targetUserId,
      organization: callerOrgId,
    });

    if (!targetUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Resolve authoritative EffectiveAuthContext
    let callerRoleDoc = null;
    if (req.user.roleRef) {
      callerRoleDoc = await Role.findById(req.user.roleRef).lean();
    }
    const authContext = resolveEffectiveAuthContext(req.user, callerRoleDoc);

    // Evaluate authorization policy BEFORE checking device existence or modifying state
    const decision = canAccessUserDevices(authContext, targetUser, "logout");
    if (!decision.allowed) {
      if (decision.code === DECISION_CODES.TENANT_MISMATCH) {
        return res.status(404).json({
          message: "User not found",
        });
      }
      return res.status(403).json({
        message: decision.reason || "Unauthorized: Device logout is forbidden",
      });
    }

    // Lookup device on the authorized target user
    const device = (targetUser.devices || []).find((d) => d.deviceId === deviceId);

    if (!device) {
      return res.status(404).json({
        message: "Device not found",
      });
    }

    // Execute state mutation: mark device offline & revoke refresh tokens
    device.isOnline = false;
    device.lastSync = new Date();

    // Revoke refresh token for this device
    targetUser.refreshTokens = (targetUser.refreshTokens || []).filter(
      (rt) => rt.deviceId !== deviceId,
    );

    await targetUser.save();

    // Postgres persistence synchronization
    if (isPostgres()) {
      try {
        const prisma = getPrismaClient();
        await prisma.userRefreshToken.deleteMany({
          where: { userId: targetUserId, deviceId },
        });
        await prisma.userDevice.updateMany({
          where: { userId: targetUserId, deviceId },
          data: { isOnline: false, lastSync: new Date() },
        });
      } catch (dbErr) {
        console.error("Device logout postgres sync error:", dbErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Device signed out successfully",
    });
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to sign out device", 500);
  }
};

export const checkUserDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const callerUserId = (req.user?.id || req.user?._id)?.toString();
    const callerOrgId = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing authentication context",
      });
    }

    const user = await User.findOne({
      _id: callerUserId,
      organization: callerOrgId,
    }).select("devices");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const device = (user.devices || []).find((device) => device.deviceId === deviceId);

    if (!device) {
      return res.status(404).json({
        authorized: false,
        message: "Device not found",
      });
    }

    return res.json({
      authorized: device.isOnline === true,
      isOnline: device.isOnline === true,
    });
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to check device status", 500);
  }
};

export const updateUserDeviceTracking = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { isTracking } = req.body;

    if (typeof isTracking !== "boolean") {
      return res.status(400).json({
        message: "isTracking must be a boolean",
      });
    }

    const callerUserId = (req.user?.id || req.user?._id)?.toString();
    const callerOrgId = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing authentication context",
      });
    }

    const user = await User.findOne({
      _id: callerUserId,
      organization: callerOrgId,
    }).select("devices");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const device = (user.devices || []).find((device) => device.deviceId === deviceId);

    if (!device) {
      return res.status(404).json({
        message: "Device not found",
      });
    }

    device.isTracking = isTracking;
    device.lastSync = new Date();

    await user.save();

    return res.json({
      success: true,
      isTracking: device.isTracking,
    });
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to update device tracking", 500);
  }
};

// Manager Controller
export const assignManager = async (req, res) => {
  try {
    const callerUserId = (req.user?.id || req.user?._id)?.toString();
    const callerOrgId = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing authentication context",
      });
    }

    // Tenant boundary: client-supplied organizationId must match callerOrgId if provided
    if (
      (req.query.organizationId && req.query.organizationId.toString() !== callerOrgId) ||
      (req.body.organizationId && req.body.organizationId.toString() !== callerOrgId)
    ) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Resolve authoritative EffectiveAuthContext
    let callerRoleDoc = null;
    if (req.user.roleRef) {
      callerRoleDoc = await Role.findById(req.user.roleRef).lean();
    }
    const authContext = resolveEffectiveAuthContext(req.user, callerRoleDoc);

    const { userIds, teams, managerId, manager } = req.body;

    // Detect mode: Single Target Assignment vs Bulk Manager Assignment
    const hasSingleManagerField = managerId !== undefined || manager !== undefined;
    const hasBulkFields = userIds !== undefined || teams !== undefined;

    if (hasSingleManagerField && hasBulkFields) {
      return res.status(400).json({
        message: "Invalid payload: Cannot mix single manager assignment with bulk user assignments",
      });
    }

    if (!hasSingleManagerField && !hasBulkFields) {
      return res.status(400).json({
        message: "Missing managerId or userIds in request body",
      });
    }

    if (hasSingleManagerField) {
      // -------------------------------------------------------------
      // 1. SINGLE TARGET USER ASSIGNMENT MODE
      // URL :id represents the target user
      // -------------------------------------------------------------
      const targetUserId = req.params.id;

      const targetUser = await User.findOne({
        _id: targetUserId,
        organization: callerOrgId,
      });

      if (!targetUser) {
        return res.status(404).json({
          message: "User not found",
        });
      }

      const rawManagerId = managerId !== undefined ? managerId : manager;
      let requestedManager = null;

      if (rawManagerId !== null && rawManagerId !== "" && rawManagerId !== "none" && rawManagerId !== undefined) {
        if (typeof rawManagerId !== "string" && typeof rawManagerId !== "object") {
          return res.status(400).json({
            message: "Invalid managerId",
          });
        }

        const managerIdStr = normalizeId(rawManagerId);

        // Self-assignment check
        if (managerIdStr === normalizeId(targetUser._id)) {
          return res.status(400).json({
            message: "A user cannot be their own manager",
          });
        }

        requestedManager = await User.findOne({
          _id: managerIdStr,
          organization: callerOrgId,
        });

        if (!requestedManager) {
          return res.status(404).json({
            message: "Manager not found",
          });
        }

        if (requestedManager.isArchived) {
          return res.status(400).json({
            message: "Cannot assign an archived user as manager",
          });
        }

        // Circular hierarchy check: ensure proposed manager doesn't report to targetUser
        let cur = requestedManager;
        let depth = 0;
        while (cur && (cur.manager || cur.managerId) && depth < 20) {
          const upManagerId = normalizeId(cur.manager?._id || cur.manager?.id || cur.manager || cur.managerId);
          if (upManagerId === normalizeId(targetUser._id)) {
            return res.status(400).json({
              message: "Circular manager assignment is not allowed",
            });
          }
          cur = await User.findOne({ _id: upManagerId, organization: callerOrgId });
          depth++;
        }
      }

      // Authorize via policyEvaluator
      const decision = canAssignManager(authContext, targetUser, requestedManager);
      if (!decision.allowed) {
        if (decision.code === DECISION_CODES.TENANT_MISMATCH) {
          return res.status(404).json({
            message: "User not found",
          });
        }
        return res.status(403).json({
          message: decision.reason,
          code: decision.code,
        });
      }

      // Business invariant: Organization owner cannot be assigned a manager
      if (targetUser.role === "owner" && requestedManager !== null) {
        return res.status(400).json({
          message: "Cannot assign a manager to the organization owner",
        });
      }

      // Mutate strictly manager field
      const newManagerId = requestedManager ? requestedManager._id : null;
      targetUser.manager = newManagerId;
      targetUser.managerId = newManagerId;
      await targetUser.save();

      return res.status(200).json({
        message: "Manager updated successfully",
      });
    } else {
      // -------------------------------------------------------------
      // 2. BULK MANAGER ASSIGNMENT MODE
      // URL :id represents the manager
      // -------------------------------------------------------------
      const managerUser = await User.findOne({
        _id: req.params.id,
        organization: callerOrgId,
      });

      if (!managerUser) {
        return res.status(404).json({
          message: "Manager not found",
        });
      }

      if (managerUser.isArchived) {
        return res.status(400).json({
          message: "Cannot assign an archived user as manager",
        });
      }

      // Authorize caller to assign managers
      const decision = canAssignManager(authContext, managerUser, null);
      if (!decision.allowed) {
        return res.status(403).json({
          message: decision.reason,
          code: decision.code,
        });
      }

      if (userIds !== undefined && !Array.isArray(userIds)) {
        return res.status(400).json({
          message: "userIds must be an array",
        });
      }

      if (teams !== undefined && !Array.isArray(teams)) {
        return res.status(400).json({
          message: "teams must be an array",
        });
      }

      const assignedUserIds = new Set(
        (Array.isArray(userIds) ? userIds : [])
          .map((id) => (id ? id.toString() : null))
          .filter((id) => id && id !== managerUser._id.toString())
      );

      // TEAM USERS
      if (Array.isArray(teams) && teams.length > 0) {
        const teamDocs = await Team.find({
          organization: callerOrgId,
          name: { $in: teams },
        }).select("_id");

        const teamIds = teamDocs.map((team) => team._id);

        const teamUsers = await User.find({
          organization: callerOrgId,
          team: { $in: teamIds },
        }).select("_id");

        teamUsers.forEach((u) => {
          if (u._id.toString() !== managerUser._id.toString()) {
            assignedUserIds.add(u._id.toString());
          }
        });
      }

      // VALIDATE USERS WITHIN CALLER ORG
      const validUsers = await User.find({
        organization: callerOrgId,
        _id: {
          $in: [...assignedUserIds],
          $ne: managerUser._id,
        },
      }).select("_id");

      const validUserIds = validUsers.map((u) => u._id.toString());

      // ATOMIC BULK REASSIGNMENT (SEC20-F01)
      await runTransaction(async () => {
        // REMOVE OLD USERS
        await User.updateMany(
          {
            manager: managerUser._id,
            organization: callerOrgId,
            _id: { $nin: validUserIds },
          },
          {
            $unset: {
              manager: "",
            },
          },
        );

        // ASSIGN NEW USERS
        await User.updateMany(
          {
            organization: callerOrgId,
            _id: { $in: validUserIds },
          },
          {
            $set: {
              manager: managerUser._id,
            },
          },
        );
      });

      return res.status(200).json({
        message: "Manager updated successfully",
      });
    }
  } catch (err) {
    console.error("ASSIGN MANAGER ERROR:", err);

    return res.status(500).json({
      message: "Failed to assign manager",
    });
  }
};

// Manager Assignment Controller
export const getManagerAssignments = async (req, res) => {
  try {
    const callerOrgId = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();
    if (!callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing organization context",
      });
    }

    const manager = await User.findOne({
      _id: req.params.id,
      organization: callerOrgId,
    });

    if (!manager) {
      return res.status(404).json({
        message: "Manager not found",
      });
    }

    // Users assigned to this manager
    const users = await User.find({
      organization: callerOrgId,
      manager: manager._id,
    })
      .populate("team", "name")
      .select("_id team");

    const userIds = users.map((u) => u._id);

    const teams = [...new Set(users.map((u) => u.team?.name).filter(Boolean))];

    res.json({
      userIds,
      teams,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to fetch manager assignments",
    });
  }
};

// Users CSV
export const exportUsersCsv = async (req, res) => {
  try {
    const users = await User.find({
      organization: req.user.organization,
    }).select("-password");

    const formattedUsers = users.map((user) => ({
      "First Name": user.firstName || "",
      "Last Name": user.lastName || "",
      Email: user.email || "",
      Role: user.role || "",
      Team: user.team || "Default team",
      Status: user.isArchived ? "Archived" : "Active",
    }));

    const parser = new Parser();

    const csv = parser.parse(data);

    const hierarchyCsv = parser.parse(formattedUsers);

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.header("Content-Type", "text/csv");

    res.attachment("users.csv");

    return res.send(hierarchyCsv);
  } catch (err) {
    return sendErrorResponse(res, err, "Failed to export hierarchy", 500);
  }
};

// Hierarchy (Users) CSV
export const exportUsersHierarchy = async (req, res) => {
  try {
    const users = await User.find({
      organization: req.user.organization,
    })
      .populate("manager", "firstName lastName email")
      .select("firstName lastName email team manager");

    const data = users.map((user) => ({
      "User Name": `${user.firstName || ""} ${user.lastName || ""}`.trim(),

      "User Email": user.email,

      Team: user.team || "Default team",

      "Manager Name": user.manager
        ? `${user.manager.firstName || ""} ${user.manager.lastName || ""}`.trim()
        : "-",

      "Manager Email": user.manager?.email || "-",
    }));

    const parser = new Parser();

    const csv = parser.parse(data);

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.header("Content-Type", "text/csv");

    res.attachment("hierarchy-users.csv");

    return res.send(csv);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Export failed",
    });
  }
};

// Hierarchy (Managers) CSV
export const exportManagersHierarchy = async (req, res) => {
  try {
    const managers = await User.find({
      organization: req.user.organization,
      role: "manager",
    }).select("firstName lastName email team");

    const data = await Promise.all(
      managers.map(async (manager) => {
        const managedUsers = await User.countDocuments({
          manager: manager._id,
        });

        return {
          "Manager Name":
            `${manager.firstName || ""} ${manager.lastName || ""}`.trim(),

          "Manager Email": manager.email,

          Team: manager.team || "Default team",

          "Managed Users": managedUsers,
        };
      }),
    );

    const parser = new Parser();

    const managersCsv = parser.parse(data);

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.header("Content-Type", "text/csv");

    res.attachment("hierarchy-managers.csv");

    return res.send(managersCsv);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Export failed",
    });
  }
};

// Devices CSV
export const exportDevices = async (req, res) => {
  try {
    const callerUserId = (req.user?.id || req.user?._id)?.toString();
    const callerOrgId = (req.user?.organization?._id || req.user?.organizationId || req.user?.organization)?.toString();

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing authentication context",
      });
    }

    // Resolve authoritative EffectiveAuthContext
    let callerRoleDoc = null;
    if (req.user.roleRef) {
      callerRoleDoc = await Role.findById(req.user.roleRef).lean();
    }
    const authContext = resolveEffectiveAuthContext(req.user, callerRoleDoc);

    // Fail-closed checks on degraded or conflicting role state
    if (
      authContext.conflictState === CONFLICT_STATES.CROSS_ORG_ROLE ||
      authContext.conflictState === 'ROLE_DOC_ORGANIZATION_MISMATCH' ||
      authContext.conflictState === CONFLICT_STATES.ROLE_DOC_MISSING ||
      authContext.conflictState === 'PRIVILEGE_INVERSION' ||
      (authContext.conflictState === CONFLICT_STATES.PRIVILEGE_MISMATCH &&
        !hasCapability(authContext, 'manage_users'))
    ) {
      return res.status(403).json({
        message: "Forbidden: Corrupted or conflicted role state",
      });
    }

    const effectiveRole = (authContext.effectiveRoleName || '').toLowerCase();
    const isAuthorized =
      effectiveRole === ROLE_NAMES.OWNER ||
      effectiveRole === ROLE_NAMES.ADMIN ||
      hasCapability(authContext, 'manage_users');

    if (!isAuthorized) {
      return res.status(403).json({
        message: "Forbidden: Missing required capability to export devices",
      });
    }

    const users = await User.find({
      organization: callerOrgId,
    }).select("firstName lastName email devices");

    const data = [];

    users.forEach((user) => {
      if (!user.devices || user.devices.length === 0) {
        data.push({
          "User Name": `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          "User Email": user.email,
          Device: "-",
          OS: "-",
          Browser: "-",
          "Last Active": "-",
        });
      } else {
        user.devices.forEach((device) => {
          data.push({
            "User Name":
              `${user.firstName || ""} ${user.lastName || ""}`.trim(),
            "User Email": user.email,
            Device: device.deviceName || device.hostname || "-",
            OS: device.os || device.platform || "-",
            Browser: device.browser || "-",
            "Last Active": device.lastActive
              ? new Date(device.lastActive).toLocaleString()
              : device.lastSync
                ? new Date(device.lastSync).toLocaleString()
                : "-",
          });
        });
      }
    });

    const parser = new Parser();
    const devicesCsv = parser.parse(data);

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.header("Content-Type", "text/csv");
    res.attachment("devices.csv");
    return res.send(devicesCsv);
  } catch (err) {
    console.error("EXPORT DEVICES ERROR:", err);
    return res.status(500).json({
      message: "Export failed",
    });
  }
};

// Import Users
export const importUsers = async (req, res) => {
  try {
    const { users } = req.body;

    if (!users || !Array.isArray(users)) {
      return res.status(400).json({
        message: "Users array is required",
      });
    }

    const success = [];
    const failed = [];

    const validRoles = ["user", "manager", "admin"];

    for (const row of users) {
      try {
        const email = row.email?.trim().toLowerCase();

        const role = row.role?.trim().toLowerCase() || "user";

        let team = row.team?.trim() || "Default team";

        // EMAIL REQUIRED
        if (!email) {
          failed.push({
            email: "Missing email",
            reason: "Email required",
          });

          continue;
        }

        // VALID EMAIL
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) {
          failed.push({
            email,
            reason: "Invalid email",
          });

          continue;
        }

        // VALID ROLE
        if (!validRoles.includes(role)) {
          failed.push({
            email,
            reason: "Invalid role",
          });

          continue;
        }

        // EXISTING USER
        const existingUser = await User.findOne({ email });

        if (existingUser) {
          failed.push({
            email,
            reason: "User already exists",
          });

          continue;
        }

        // EXISTING INVITE
        const existingInvite = await Invite.findOne({
          email,
          isAccepted: false,
        });

        if (existingInvite) {
          failed.push({
            email,
            reason: "Already invited",
          });

          continue;
        }

        // TOKEN
        const rawToken = crypto.randomBytes(32).toString("hex");

        const hashedToken = crypto
          .createHash("sha256")
          .update(rawToken)
          .digest("hex");

        // CREATE INVITE
        await Invite.create({
          email,
          role,
          team,
          token: hashedToken,
          invitedBy: req.user._id,
          organization: req.user.organization,
          expireAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        });

        success.push(email);
      } catch (err) {
        failed.push({
          email: row.email || "Unknown",
          reason: "Import failed",
        });
      }
    }

    return res.status(200).json({
      message: "Import completed",
      imported: success.length,
      failedCount: failed.length,
      success,
      failed,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Import failed",
    });
  }
};

// Export Users
export const exportUsers = async (req, res) => {
  try {
    const users = await User.find({
      organization: req.user.organization,
    })
      .populate("manager", "email")
      .select("_id firstName lastName email team manager");

    const formattedUsers = users.map((user) => ({
      ID: user._id,

      "First Name": user.firstName || "",

      "Last Name": user.lastName || "",

      Email: user.email || "",

      "Team Name": user.team || "Default team",

      "Direct Managers": user.manager?.email || "",

      Password: "",

      "External ID": "",
    }));

    const parser = new Parser();

    const csv = parser.parse(formattedUsers);

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.header("Content-Type", "text/csv");

    res.attachment("users.csv");

    return res.send(csv);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Export failed",
    });
  }
};

const isEqual = (a, b) => {
  return JSON.stringify(a) === JSON.stringify(b);
};

export const updateUserSetting = async (req, res) => {
  try {
    const callerUserId = normalizeId(req.user?._id || req.user?.id);
    const callerOrgId = normalizeId(
      req.user?.organizationId || req.user?.organization?._id || req.user?.organization?.id || req.user?.organization
    );

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({
        message: "Not authorized",
      });
    }

    const callerRoleDoc = req.user?.roleRef
      ? await Role.findById(normalizeId(req.user.roleRef))
      : null;
    const authContext = resolveEffectiveAuthContext(req.user, callerRoleDoc);

    const canConfigure =
      authContext.effectiveRoleName === ROLE_NAMES.OWNER ||
      authContext.effectiveRoleName === ROLE_NAMES.ADMIN ||
      hasCapability(authContext, "manage_settings") ||
      hasCapability(authContext, "manage_users");

    if (!canConfigure) {
      return res.status(403).json({
        message: "Permission denied",
      });
    }

    const { id } = req.params;
    const { module, setting, value } = req.body;

    const moduleSettings = {
      appUpdate: ["automaticUpdates", "forceUpdates"],

      tracking: [
        "trackingMode",
        "startTrackingOnBoot",
        "allowWorkAwayFromComputer",
        "pauseTrackingWhenInactive",
        "inactivityMinutes",
        "continueTrackingDuringSleep",
        "sleepBreakHours",
        "sleepBreakMinutes",
        "displayBackToWorkReminder",
        "stopTrackingWithoutInternet",
        "statusBarVisibility",
        "applicationTracking",
        "ipTracking",
      ],

      screenCapture: ["enabled", "screenshotFrequency", "blurScreenshots"],

      manualTime: [
        "allowManualTime",
        "requireApproval",
        "managerApproval",
        "backdatingLimit",
        "requireProjectTask",
      ],

      shift: ["autoStartTracking", "autoStopTracking", "schedule"],

      emailReports: [
        "weeklyTrackingReports",
        "dailyTrackingReports",

        "dailyWarningEmails",
        "dailyBasedOnShift",
        "dailyMinimumTime",
        "dailyWeekDays",

        "weeklyWarningEmails",
        "weeklyBasedOnShift",
        "weeklyMinimumTime",

        "idlePercentageEnabled",
        "idlePercentage",
      ],

      notifications: [
        "shiftStarted",
        "shiftEndingSoon",
        "breakStarted",
        "breakEnded",
        "dailyTargetReached",
        "overtimeStarted",
      ],
    };

    if (!moduleSettings[module] || !moduleSettings[module].includes(setting)) {
      return res.status(400).json({
        message: "Invalid setting",
      });
    }

    const userSettingFields = {
      appUpdate: "appUpdateSettings",
      tracking: "trackingSettings",
      screenCapture: "screenCaptureSettings",
      manualTime: "manualTimeSettings",
      shift: "shiftSettings",
      emailReports: "emailReportSettings",
      notifications: "notificationSettings",
    };

    const user = await User.findOne({
      _id: id,
      organization: callerOrgId,
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }
    const userField = userSettingFields[module];

    if (!user[userField]) {
      user[userField] = {};
    }

    // If user selected the same value as the organization,
    // remove the override and inherit the organization setting.

    const organizationFields = {
      appUpdate: "appUpdates",
      tracking: "tracking",
      screenCapture: "screenCapture",
      manualTime: "manualTime",
      shift: "shift",
      emailReports: "emailReports",
      notifications: "notifications",
    };

    const timeTrackingModules = new Set([
      "tracking",
      "screenCapture",
      "manualTime",
      "shift",
    ]);

    const organization = await Organization.findById(callerOrgId);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    const organizationField = organizationFields[module];

    if (!organizationField) {
      return res.status(400).json({
        message: "Invalid module",
      });
    }

    let organizationValue;
    if (timeTrackingModules.has(module)) {
      const timeTrackingSettings = await TimeTrackingSettings.findOne({
        organization: callerOrgId,
      });
      organizationValue = timeTrackingSettings?.[organizationField]?.[setting];
    } else {
      organizationValue = organization[organizationField]?.[setting];
    }

    const previousValue =
      user[userField]?.[setting] === null ||
      user[userField]?.[setting] === undefined
        ? organizationValue
        : user[userField][setting];

    if (isEqual(value, organizationValue)) {
      user[userField][setting] = null;
    } else {
      user[userField][setting] = value;
    }
    await user.save();

    await auditSettingsChanged({
      req,
      setting,
      previousValue,
      newValue: value,
      affectedUser: user,
    });

    const targetUserId = normalizeId(user._id || user.id);
    try {
      getIO()
        ?.to(`user:${targetUserId}`)
        .emit("tracking-settings-updated", {
          userId: targetUserId,
          module,
          setting,
          settings: user[userField],
        });
    } catch {}

    res.status(200).json({
      message: "User setting updated successfully",
      settings: {
        [module]: user[userField],
      },
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to update user setting",
    });
  }
};

export const updateUserShiftSettings = async (req, res) => {
  try {
    const callerUserId = normalizeId(req.user?._id || req.user?.id);
    const callerOrgId = normalizeId(
      req.user?.organizationId || req.user?.organization?._id || req.user?.organization?.id || req.user?.organization
    );

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({
        message: "Not authorized",
      });
    }

    // Client-controlled ID spoofing prevention
    const requestedOrgId = req.query?.organizationId || req.body?.organizationId;
    if (requestedOrgId && normalizeId(requestedOrgId) !== callerOrgId) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Tenant-scoped target user lookup (404 zero disclosure for non-existent or cross-tenant users)
    const targetUserId = req.params.id;
    const user = await User.findOne({
      _id: targetUserId,
      organization: callerOrgId,
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Resolve caller EffectiveAuthContext authoritatively from primary DB
    const callerRoleDoc = req.user?.roleRef
      ? await Role.findById(normalizeId(req.user.roleRef))
      : null;
    const authContext = resolveEffectiveAuthContext(req.user, callerRoleDoc);

    // Evaluate function-level authorization policy
    const decision = canAccessUserShiftSettings(authContext, user, "mutate");
    if (!decision.allowed) {
      const statusCode = decision.code === DECISION_CODES.TENANT_MISMATCH ? 404 : 403;
      return res.status(statusCode).json({
        message: decision.reason,
      });
    }

    // Whitelist and validate shift settings payload against mass assignment
    const { autoStartTracking, autoStopTracking, schedule } = req.body;

    if (autoStartTracking !== undefined && typeof autoStartTracking !== "boolean" && autoStartTracking !== null) {
      return res.status(400).json({
        message: "Invalid autoStartTracking value. Must be boolean or null.",
      });
    }

    if (autoStopTracking !== undefined && typeof autoStopTracking !== "boolean" && autoStopTracking !== null) {
      return res.status(400).json({
        message: "Invalid autoStopTracking value. Must be boolean or null.",
      });
    }

    if (schedule !== undefined && schedule !== null && !Array.isArray(schedule)) {
      return res.status(400).json({
        message: "Invalid schedule format. Schedule must be an array or null.",
      });
    }

    if (!user.shiftSettings) {
      user.shiftSettings = {};
    }

    if (autoStartTracking !== undefined) {
      user.shiftSettings.autoStartTracking = autoStartTracking;
    }

    if (autoStopTracking !== undefined) {
      user.shiftSettings.autoStopTracking = autoStopTracking;
    }

    if (schedule !== undefined) {
      if (schedule === null) {
        if (typeof user.set === "function") {
          user.set("shiftSettings.schedule", undefined);
        }
        if (typeof user.markModified === "function") {
          user.markModified("shiftSettings");
        }
        user.shiftSettings.schedule = null;
      } else {
        user.shiftSettings.schedule = schedule;
      }
    }

    await user.save();

    const updatedTargetId = normalizeId(user._id || user.id);
    try {
      getIO()
        ?.to(`user:${updatedTargetId}`)
        .emit("tracking-settings-updated", {
          userId: updatedTargetId,
          module: "shift",
          shiftSettings: user.shiftSettings,
        });
    } catch {}

    return res.status(200).json({
      message: "User shift settings updated successfully",
      shiftSettings: user.shiftSettings,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};
