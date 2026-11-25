import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import User from "../models/user.model.js";
import Team from "../models/team.model.js";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/generateTokens.js";
import sendEmail from "../utils/sendEmail.js";

let sendEmailTransport = sendEmail;
export const setSendEmailTransportForTesting = (fn) => {
  sendEmailTransport = fn;
};
export const resetSendEmailTransportForTesting = () => {
  sendEmailTransport = sendEmail;
};
import verifyEmailTemplate from "../templates/veifyEmailTemplate.js";
import Organization from "../models/organization.model.js";
import {
  auditLogin,
  auditLogout,
  auditPasswordChanged,
  audit2FAVerified,
  auditFailedLogin,
} from "../utils/auditService.js";
import { createDefaultRoles } from "../utils/createDefaultRoles.js";
import Role from "../models/role.model.js";
import { getUserPermissions } from "../utils/getUserPermissions.js";
import twoFactorTemplate from "../templates/twoFactorTemplate.js";
import {
  getMicrosoftAuthUrl,
  getMicrosoftUser,
} from "../utils/microsoftOAuth.js";
import { getAppleAuthUrl, getAppleUser } from "../utils/appleOAuth.js";
import { userRepository } from "../db/repositories/user.repository.js";
import { isPostgres } from "../db/index.js";
import {
  recordOtpFailure,
  clearOtpFailures,
} from "../middleware/authRateLimit.middleware.js";
import { runTransaction } from "../db/transaction.js";
import { initializeDefaultProject } from "./project.controller.js";

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

const isProduction = process.env.NODE_ENV === "production";

const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/",
};

const csrfCookieOptions = {
  httpOnly: false,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/",
};

function issueSessionCookies(res, { accessToken, refreshToken }) {
  const csrfToken = crypto.randomBytes(32).toString("hex");

  res.cookie("csrfToken", csrfToken, {
    ...csrfCookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.cookie("refreshToken", refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.cookie("accessToken", accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000,
  });

  return csrfToken;
}

export const getCsrfToken = async (req, res) => {
  let token = req.cookies?.csrfToken;
  if (!token || typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
    token = crypto.randomBytes(32).toString("hex");
  }

  res.cookie("csrfToken", token, {
    ...csrfCookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.status(200).json({ csrfToken: token });
};

// Register Controller

export const registerUser = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      organization,
      password,
      googleId,
      microsoftId,
      appleId,
      avatar,
      client,
    } = req.body;

    if (client === "desktop") {
      return res.status(403).json({
        message: "Sign up is available only on the web version.",
      });
    }

    if (!firstName || !lastName || !email || !organization || !password) {
      return res.status(400).json({
        message: "All fields required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    const { user } = await runTransaction(async (tx) => {
      // Re-verify uniqueness inside ambient transaction
      const existingUserInTx = await User.findOne({
        email: normalizedEmail,
      });

      if (existingUserInTx) {
        const err = new Error("User already exists");
        err.statusCode = 400;
        throw err;
      }

      const organizationDoc = await Organization.create({
        name: organization,
      });

      await createDefaultRoles(organizationDoc._id);

      const ownerRole = await Role.findOne({
        organization: organizationDoc._id,
        name: "Owner",
      });

      const user = await User.create({
        firstName,
        lastName,
        email: normalizedEmail,
        organization: organizationDoc._id,
        password: hashedPassword,
        ...(googleId ? { googleId } : {}),
        ...(microsoftId ? { microsoftId } : {}),
        ...(appleId ? { appleId } : {}),
        avatar: avatar || "",
        role: "owner",
        roleRef: ownerRole?._id,
        isVerified: !!(googleId || microsoftId || appleId),
        ...(googleId || microsoftId || appleId
          ? {}
          : {
            verificationToken,
            verificationTokenExpire: Date.now() + 24 * 60 * 60 * 1000,
          }),
      });

      const defaultTeam = await Team.create({
        name: "Default team",
        description: "System default team",
        organization: organizationDoc._id,
        createdBy: user._id,
      });

      user.team = defaultTeam._id;
      await user.save();

      const { defaultProject } = await initializeDefaultProject({
        organizationId: organizationDoc._id,
        userId: user._id,
      });

      return { user, organizationDoc, defaultTeam, defaultProject };
    });

    // Verification Link (External side effect - strictly POST-COMMIT)
    if (!googleId && !microsoftId && !appleId) {
      try {
        const verifyUrl = `${process.env.BACKEND_URL}/api/auth/verify/${verificationToken}`;

        const html = verifyEmailTemplate({
          verifyUrl,
          firstName: user.firstName,
        });

        await sendEmailTransport(user.email, "Verify your email", html);
      } catch (emailErr) {
        console.error("EMAIL DELIVERY ERROR POST-COMMIT (registerUser):", emailErr);
      }
    }

    return res.status(201).json({
      message:
        googleId || microsoftId || appleId
          ? "Registration successful."
          : "Registration successful. Please verify your email.",
    });
  } catch (err) {
    if (
      err.code === "P2002" ||
      err.code === 11000 ||
      err.name === "MongoServerError" ||
      err.name === "DuplicateKeyError" ||
      err.message?.includes("Unique constraint") ||
      err.message?.includes("duplicate key")
    ) {
      const target = err.meta?.target || (err.keyValue ? Object.keys(err.keyValue) : []) || [];
      const isTargetName =
        (Array.isArray(target) && target.includes("name")) ||
        (typeof target === "string" && target.includes("name")) ||
        err.message?.includes("organizations_name_key") ||
        err.message?.includes("name");

      if (isTargetName) {
        return res.status(400).json({
          message: "Organization name already taken",
        });
      }

      return res.status(400).json({
        message: "User already exists",
      });
    }

    if (err.statusCode) {
      return res.status(err.statusCode).json({
        message: err.message,
      });
    }

    console.error("REGISTER USER ERROR:", err);
    return res.status(500).json({
      message: "Server error",
    });
  }
};

// Login Controller

export const loginUser = async (req, res) => {
  try {
    const { email, password, deviceId, client } = req.body;

    const isDesktop = client === "desktop";

    if (!email || !password) {
      return res.status(400).json({
        message: "All fields required",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(400).json({
        message: "Invalid email or password",
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        message: "Please verify your email first",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid email or password",
      });
    }

    if (user.isArchived) {
      return res.status(403).json({
        message: "Account is archived. Please contact your organization administrator.",
      });
    }

    const organization = await Organization.findById(user.organization);

    const twoFactorEnabled = organization?.twoFactor?.[user.role] || false;

    if (twoFactorEnabled) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      user.twoFactorCode = otp;
      user.twoFactorExpires = new Date(Date.now() + 10 * 60 * 1000);

      await user.save();
      clearOtpFailures(user._id?.toString() || user.id?.toString());

      const html = twoFactorTemplate({
        firstName: user.firstName,
        otp,
      });

      await sendEmail(user.email, "Your WorkComposer verification code", html);

      return res.status(200).json({
        requiresTwoFactor: true,
        email: user.email,
      });
    }

    const deviceInfo = {
      deviceId: deviceId || crypto.randomUUID(),

      ip: req.ip || req.headers["x-forwarded-for"] || "Unknown IP",

      location: "India",

      platform:
        req.headers["sec-ch-ua-platform"]?.replace(/"/g, "") ||
        "Unknown Platform",

      appVersion: "1.0.0",

      loginTime: new Date(),

      lastSync: new Date(),

      isOnline: true,
    };

    const existingDevice = user.devices.find(
      (device) => device.deviceId === deviceInfo.deviceId,
    );

    if (existingDevice) {
      existingDevice.ip = deviceInfo.ip;
      existingDevice.location = deviceInfo.location;
      existingDevice.platform = deviceInfo.platform;
      existingDevice.appVersion = deviceInfo.appVersion;
      existingDevice.lastSync = new Date();
      existingDevice.isOnline = true;
    } else {
      user.devices.push(deviceInfo);
    }

    const accessToken = generateAccessToken(user._id);

    const refreshToken = generateRefreshToken(user._id);

    const deviceIdForToken = deviceId || crypto.randomUUID();

    // Remove any existing token for this same device, then add the new one
    user.refreshTokens = user.refreshTokens.filter(
      (rt) => rt.deviceId !== deviceIdForToken,
    );

    user.refreshTokens.push({
      token: refreshToken,
      deviceId: deviceIdForToken,
    });

    await user.save();

    await auditLogin({
      req,
      user,
      appVersion: deviceInfo.appVersion,
    });

    const csrfToken = issueSessionCookies(res, { accessToken, refreshToken });

    const permissions = await getUserPermissions(user);

    const response = {
      message: "Login successful",
      user: {
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        permissions,
        manageUsers: user.role === 'owner' || permissions.includes('manage_users'),
      },
      csrfToken,
    };

    if (isDesktop) {
      response.accessToken = accessToken;
      response.refreshToken = refreshToken;
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
};

// Refresh Access Token

export const refreshAccessToken = async (req, res) => {
  try {
    const { client, refreshToken: bodyRefreshToken } = req.body || {};
    const isDesktop = client === "desktop";
    const oldRefreshToken = isDesktop
      ? bodyRefreshToken
      : req.cookies.refreshToken;

    if (!oldRefreshToken) {
      return res.status(401).json({ message: "Refresh token missing" });
    }

    const user = await User.findOne({ "refreshTokens.token": oldRefreshToken });

    if (!user) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    if (user.isArchived) {
      if (userRepository && typeof userRepository.removeRefreshToken === "function") {
        await userRepository.removeRefreshToken(oldRefreshToken);
      }
      if (!isPostgres()) {
        user.refreshTokens = (user.refreshTokens || []).filter(
          (rt) => rt.token !== oldRefreshToken,
        );
        await user.save();
      }

      res.clearCookie("accessToken", cookieOptions);
      res.clearCookie("refreshToken", cookieOptions);
      res.clearCookie("csrfToken", csrfCookieOptions);

      return res.status(401).json({
        message: "Account is archived. Please contact your organization administrator.",
      });
    }

    const tokenEntry = user.refreshTokens.find(
      (rt) => rt.token === oldRefreshToken,
    );

    const newAccessToken = generateAccessToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    if (
      userRepository &&
      typeof userRepository.rotateRefreshToken === "function"
    ) {
      await userRepository.rotateRefreshToken(
        user._id,
        oldRefreshToken,
        newRefreshToken,
      );
    } else {
      tokenEntry.token = newRefreshToken;
      await user.save();
    }

    const csrfToken = issueSessionCookies(res, {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });

    const response = { message: "Token refreshed", csrfToken };

    if (isDesktop) {
      response.accessToken = newAccessToken;
      response.refreshToken = newRefreshToken;
    }

    return res.json(response);
  } catch (err) {
    console.error("REFRESH ERROR:", err);

    // Genuine server-side failure — NOT an invalid-token case.
    // Returning 500 here (not 401) prevents the desktop app from
    // treating a transient backend error as a dead session.
    return res.status(500).json({ message: "Unable to refresh token" });
  }
};

export const logoutUser = async (req, res) => {
  try {
    const cookieToken =
      typeof req.cookies?.refreshToken === "string" &&
        req.cookies.refreshToken.trim().length > 0
        ? req.cookies.refreshToken.trim()
        : null;

    const bodyToken =
      typeof req.body?.refreshToken === "string" &&
        req.body.refreshToken.trim().length > 0
        ? req.body.refreshToken.trim()
        : null;

    const refreshToken = cookieToken || bodyToken;

    if (refreshToken) {
      if (
        userRepository &&
        typeof userRepository.removeRefreshToken === "function"
      ) {
        await userRepository.removeRefreshToken(refreshToken);
      }
      if (!isPostgres()) {
        try {
          await User.updateOne(
            { "refreshTokens.token": refreshToken },
            { $pull: { refreshTokens: { token: refreshToken } } },
          );
        } catch { }
      }
    }

    res.clearCookie("refreshToken", cookieOptions);
    res.clearCookie("accessToken", cookieOptions);
    res.clearCookie("csrfToken", csrfCookieOptions);

    res.json({
      message: "Logged out successfully",
    });
  } catch (err) {
    console.error("Logout error occurred");
    res.status(500).json({
      message: "Server error",
    });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired token",
        error: "Invalid or expired token",
      });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpire = undefined;

    await user.save();

    return res.redirect(
      `${process.env.FRONTEND_URL}/authenticate/login?verified=true`,
    );
  } catch (err) {
    console.error("VERIFY EMAIL ERROR:", err);

    return res.status(500).json({
      message: "Verification failed. Please try again or request a new link.",
      error: "Verification failed",
    });
  }
};

export const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        message: "User already verified",
      });
    }

    const verificationToken = crypto.randomBytes(32).toString("hex");

    user.verificationToken = verificationToken;
    user.verificationTokenExpire = Date.now() + 24 * 60 * 60 * 1000;

    await user.save();

    const verifyUrl = `${process.env.BACKEND_URL}/api/auth/verify/${verificationToken}`;

    const html = verifyEmailTemplate({
      verifyUrl,
      firstName: user.firstName,
    });

    await sendEmail(user.email, "Verify your email", html);

    res.json({
      message: "Verification email sent again",
    });
  } catch (err) {
    res.status(500).json({
      message: "Server error",
    });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        message: "User not found",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");

    user.resetToken = resetToken;
    user.resetTokenExpire = Date.now() + 15 * 60 * 1000;

    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/authenticate/reset-password?token=${resetToken}`;

    await sendEmail(
      user.email,
      "Reset Password",
      `<a href="${resetUrl}">Reset Password</a>`,
    );

    res.json({
      message: "Reset link sent to email",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
};

export const resetPassword = async (req, res) => {
  const { token, password } = req.body;

  const user = await User.findOne({
    resetToken: token,
    resetTokenExpire: { $gt: Date.now() },
  });

  if (!user) {
    return res.status(400).json({
      message: "Invalid or expired token",
    });
  }

  user.password = await bcrypt.hash(password, 10);
  user.resetToken = undefined;
  user.resetTokenExpire = undefined;

  await user.save();

  res.json({ message: "Password updated successfully" });
};

export const verifyTwoFactor = async (req, res) => {
  try {
    const { email, otp, deviceId, client } = req.body;

    const isDesktop = client === "desktop";

    if (!email || !otp) {
      return res.status(400).json({
        message: "Email and verification code are required",
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid verification request",
      });
    }

    if (user.isArchived) {
      return res.status(403).json({
        message: "Account is archived. Please contact your organization administrator.",
      });
    }

    if (!user.twoFactorExpires || user.twoFactorExpires < new Date() || !user.twoFactorCode) {
      return res.status(400).json({
        message: "Verification code has expired",
      });
    }

    if (user.twoFactorCode !== otp) {
      const failures = recordOtpFailure(user._id?.toString() || user.id?.toString());
      if (failures >= 5) {
        user.twoFactorCode = undefined;
        user.twoFactorExpires = undefined;
        await user.save();
        clearOtpFailures(user._id?.toString() || user.id?.toString());
        return res.status(400).json({
          message: "Too many failed attempts. Verification code has been invalidated.",
        });
      }
      return res.status(400).json({
        message: "Invalid verification code",
      });
    }

    // Clear OTP failure state on success
    clearOtpFailures(user._id?.toString() || user.id?.toString());

    // Clear OTP after successful verification
    user.twoFactorCode = undefined;
    user.twoFactorExpires = undefined;

    await user.save();

    const deviceInfo = {
      deviceId: deviceId || crypto.randomUUID(),

      ip: req.ip || req.headers["x-forwarded-for"] || "Unknown IP",

      location: "India",

      platform:
        req.headers["sec-ch-ua-platform"]?.replace(/"/g, "") ||
        "Unknown Platform",

      appVersion: "1.0.0",

      loginTime: new Date(),

      lastSync: new Date(),

      isOnline: true,
    };

    const existingDevice = user.devices.find(
      (device) => device.deviceId === deviceInfo.deviceId,
    );

    if (existingDevice) {
      existingDevice.ip = deviceInfo.ip;
      existingDevice.location = deviceInfo.location;
      existingDevice.platform = deviceInfo.platform;
      existingDevice.appVersion = deviceInfo.appVersion;
      existingDevice.lastSync = new Date();
      existingDevice.isOnline = true;
    } else {
      user.devices.push(deviceInfo);
    }

    const accessToken = generateAccessToken(user._id);

    const refreshToken = generateRefreshToken(user._id);

    const deviceIdForToken = deviceId || crypto.randomUUID();
    user.refreshTokens = user.refreshTokens.filter(
      (rt) => rt.deviceId !== deviceIdForToken,
    );
    user.refreshTokens.push({
      token: refreshToken,
      deviceId: deviceIdForToken,
    });

    await user.save();

    await auditLogin({
      req,
      user,
      appVersion: deviceInfo.appVersion,
    });

    const csrfToken = issueSessionCookies(res, { accessToken, refreshToken });

    const permissions = await getUserPermissions(user);

    const response = {
      message: "Login successful",
      user: {
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        permissions,
        manageUsers: user.role === 'owner' || permissions.includes('manage_users'),
      },
      csrfToken,
    };

    if (isDesktop) {
      response.accessToken = accessToken;
      response.refreshToken = refreshToken;
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

export const googleLogin = async (req, res) => {
  try {
    const client = req.query.client === "desktop" ? "desktop" : "web";

    const authUrl = googleClient.generateAuthUrl({
      access_type: "offline",
      scope: ["openid", "email", "profile"],
      prompt: "select_account",
      state: client, // "desktop" or "web"
    });

    return res.redirect(authUrl);
  } catch (err) {
    console.error("GOOGLE LOGIN ERROR:", err);

    return res.status(500).json({
      message: "Failed to start Google login",
    });
  }
};

export const googleCallback = async (req, res) => {
  try {
    const { code, state } = req.query;

    const isDesktop = state === "desktop";

    if (!code) {
      return res.status(400).send("Google authorization code missing");
    }

    // Exchange Google authorization code for tokens
    const { tokens } = await googleClient.getToken(code);

    // Verify Google's ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload?.email) {
      return res.status(400).send("Google account email not available");
    }

    const email = payload.email.toLowerCase().trim();
    const googleId = payload.sub;

    let user = await User.findOne({ email });

    // Create user if this Google account doesn't exist
    if (!user) {
      const googleSignupToken = jwt.sign(
        {
          googleId,
          email,
          firstName: payload.given_name || "",
          lastName:
            payload.family_name ||
            payload.name?.split(" ").slice(1).join(" ") ||
            "",
          avatar: payload.picture || "",
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "10m",
        },
      );

      const signupTarget = isDesktop
        ? `workcomposer://signup?google=true&token=${encodeURIComponent(googleSignupToken)}`
        : `${process.env.FRONTEND_URL}/authenticate/signup?google=true&token=${encodeURIComponent(googleSignupToken)}`;

      return res.redirect(signupTarget);
    }

    // Google accounts are already verified
    if (!user.isVerified) {
      user.isVerified = true;
      user.verificationToken = undefined;
      user.verificationTokenExpire = undefined;
    }

    if (!user.googleId) {
      user.googleId = googleId;
    }

    if (user.isArchived) {
      const errorTarget = isDesktop
        ? `workcomposer://login?error=account_archived`
        : `${process.env.FRONTEND_URL}/authenticate/login?error=account_archived`;
      return res.redirect(errorTarget);
    }

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    const deviceIdForToken = crypto.randomUUID();
    user.refreshTokens.push({
      token: refreshToken,
      deviceId: deviceIdForToken,
    });

    await user.save();

    if (isDesktop) {
      // No cookies — hand tokens to the Electron app via deep link
      return res.redirect(
        `workcomposer://auth?accessToken=${encodeURIComponent(
          accessToken,
        )}&refreshToken=${encodeURIComponent(refreshToken)}`,
      );
    }

    issueSessionCookies(res, { accessToken, refreshToken });

    return res.redirect(
      `${process.env.FRONTEND_URL}/dashboard/time-tracking/home`,
    );
  } catch (err) {
    console.error("GOOGLE AUTH ERROR:", err);

    return res.redirect(
      `${process.env.FRONTEND_URL}/authenticate/login?error=google_auth_failed`,
    );
  }
};

export const getGoogleSignupInfo = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        message: "Google signup token is required",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    return res.json({
      googleId: decoded.googleId,
      email: decoded.email,
      firstName: decoded.firstName,
      lastName: decoded.lastName,
      avatar: decoded.avatar,
    });
  } catch (err) {
    console.error("GOOGLE SIGNUP TOKEN ERROR:", err.message);

    return res.status(401).json({
      message: "Invalid or expired Google signup token",
    });
  }
};

export const microsoftLogin = async (req, res) => {
  try {
    const client = req.query.client === "desktop" ? "desktop" : "web";

    const authUrl = getMicrosoftAuthUrl(client);

    return res.redirect(authUrl);
  } catch (err) {
    console.error("MICROSOFT LOGIN ERROR:", err);

    return res.status(500).json({
      message: "Failed to start Microsoft login",
    });
  }
};

export const microsoftCallback = async (req, res) => {
  try {
    const { code, state } = req.query;

    const isDesktop = state === "desktop";

    if (!code) {
      return res.status(400).send("Microsoft authorization code missing");
    }

    const profile = await getMicrosoftUser(code);

    if (!profile?.email) {
      return res.status(400).send("Microsoft account email not available");
    }

    const email = profile.email.toLowerCase().trim();
    const microsoftId = profile.id;

    let user = await User.findOne({ email });

    // Create user if this Microsoft account doesn't exist
    if (!user) {
      const microsoftSignupToken = jwt.sign(
        {
          microsoftId,
          email,
          firstName: profile.given_name || "",
          lastName: profile.family_name || "",
          avatar: "",
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "10m",
        },
      );

      const signupTarget = isDesktop
        ? `workcomposer://signup?microsoft=true&token=${encodeURIComponent(microsoftSignupToken)}`
        : `${process.env.FRONTEND_URL}/authenticate/signup?microsoft=true&token=${encodeURIComponent(microsoftSignupToken)}`;

      return res.redirect(signupTarget);
    }

    // Microsoft accounts are already verified
    if (!user.isVerified) {
      user.isVerified = true;
      user.verificationToken = undefined;
      user.verificationTokenExpire = undefined;
    }

    if (!user.microsoftId) {
      user.microsoftId = microsoftId;
    }

    if (user.isArchived) {
      const errorTarget = isDesktop
        ? `workcomposer://login?error=account_archived`
        : `${process.env.FRONTEND_URL}/authenticate/login?error=account_archived`;
      return res.redirect(errorTarget);
    }

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    const deviceIdForToken = crypto.randomUUID();
    user.refreshTokens.push({
      token: refreshToken,
      deviceId: deviceIdForToken,
    });

    await user.save();

    if (isDesktop) {
      return res.redirect(
        `workcomposer://auth?accessToken=${encodeURIComponent(
          accessToken,
        )}&refreshToken=${encodeURIComponent(refreshToken)}`,
      );
    }

    issueSessionCookies(res, { accessToken, refreshToken });

    return res.redirect(
      `${process.env.FRONTEND_URL}/dashboard/time-tracking/home`,
    );
  } catch (err) {
    console.error("MICROSOFT AUTH ERROR:", err);

    return res.redirect(
      `${process.env.FRONTEND_URL}/authenticate/login?error=microsoft_auth_failed`,
    );
  }
};

export const getMicrosoftSignupInfo = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        message: "Microsoft signup token is required",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    return res.json({
      microsoftId: decoded.microsoftId,
      email: decoded.email,
      firstName: decoded.firstName,
      lastName: decoded.lastName,
      avatar: decoded.avatar,
    });
  } catch (err) {
    console.error("MICROSOFT SIGNUP TOKEN ERROR:", err.message);

    return res.status(401).json({
      message: "Invalid or expired Microsoft signup token",
    });
  }
};

export const appleLogin = async (req, res) => {
  try {
    const client = req.query.client === "desktop" ? "desktop" : "web";

    const authUrl = getAppleAuthUrl(client);

    return res.redirect(authUrl);
  } catch (err) {
    console.error("APPLE LOGIN ERROR:", err);

    return res.status(500).json({
      message: "Failed to start Apple login",
    });
  }
};

export const appleCallback = async (req, res) => {
  try {
    const { code, user, state } = req.body;

    const isDesktop = state === "desktop";

    if (!code) {
      return res.status(400).send("Apple authorization code missing");
    }

    const applePayload = await getAppleUser(code);

    if (!applePayload?.id) {
      return res.status(400).send("Apple account not available");
    }

    const appleId = applePayload.id;
    const email = applePayload.email.toLowerCase().trim();

    // Apple only ever sends the name once, on first authorization,
    // as a JSON string in req.body.user - never in the id_token.
    let firstName = "";
    let lastName = "";

    if (user) {
      try {
        const parsedUser = JSON.parse(user);

        firstName = parsedUser?.name?.firstName || "";
        lastName = parsedUser?.name?.lastName || "";
      } catch (parseErr) {
        console.error("APPLE NAME PARSE ERROR:", parseErr.message);
      }
    }

    let existingUser = email
      ? await User.findOne({ email })
      : await User.findOne({ appleId });

    // Create user if this Apple account doesn't exist
    if (!existingUser) {
      const appleSignupToken = jwt.sign(
        {
          appleId,
          email,
          firstName,
          lastName,
          avatar: "",
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "10m",
        },
      );

      const signupTarget = isDesktop
        ? `workcomposer://signup?apple=true&token=${encodeURIComponent(appleSignupToken)}`
        : `${process.env.FRONTEND_URL}/authenticate/signup?apple=true&token=${encodeURIComponent(appleSignupToken)}`;

      return res.redirect(signupTarget);
    }

    // Apple accounts are already verified
    if (!existingUser.isVerified) {
      existingUser.isVerified = true;
      existingUser.verificationToken = undefined;
      existingUser.verificationTokenExpire = undefined;
    }

    if (!existingUser.appleId) {
      existingUser.appleId = appleId;
    }

    if (existingUser.isArchived) {
      const errorTarget = isDesktop
        ? `workcomposer://login?error=account_archived`
        : `${process.env.FRONTEND_URL}/authenticate/login?error=account_archived`;
      return res.redirect(errorTarget);
    }

    const accessToken = generateAccessToken(existingUser._id);
    const refreshToken = generateRefreshToken(existingUser._id);

    const deviceIdForToken = crypto.randomUUID();
    existingUser.refreshTokens.push({
      token: refreshToken,
      deviceId: deviceIdForToken,
    });

    await existingUser.save();

    if (isDesktop) {
      return res.redirect(
        `workcomposer://auth?accessToken=${encodeURIComponent(
          accessToken,
        )}&refreshToken=${encodeURIComponent(refreshToken)}`,
      );
    }

    issueSessionCookies(res, { accessToken, refreshToken });

    return res.redirect(
      `${process.env.FRONTEND_URL}/dashboard/time-tracking/home`,
    );
  } catch (err) {
    console.error("APPLE AUTH ERROR:", err);

    return res.redirect(
      `${process.env.FRONTEND_URL}/authenticate/login?error=apple_auth_failed`,
    );
  }
};

export const getAppleSignupInfo = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        message: "Apple signup token is required",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    return res.json({
      appleId: decoded.appleId,
      email: decoded.email,
      firstName: decoded.firstName,
      lastName: decoded.lastName,
      avatar: decoded.avatar,
    });
  } catch (err) {
    console.error("APPLE SIGNUP TOKEN ERROR:", err.message);

    return res.status(401).json({
      message: "Invalid or expired Apple signup token",
    });
  }
};
