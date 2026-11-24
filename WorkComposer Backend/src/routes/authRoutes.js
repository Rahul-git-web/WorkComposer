import express from "express";
import User from "../models/user.model.js";
import {
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  verifyTwoFactor,
  googleCallback,
  googleLogin,
  getGoogleSignupInfo,
  microsoftLogin,
  microsoftCallback,
  getMicrosoftSignupInfo,
  getCsrfToken,
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { getUserPermissions } from "../utils/getUserPermissions.js";
import { resolveEffectiveAuthContext } from "../security/effectiveAuthContext.js";
import Role from "../models/role.model.js";
import {
  authBurstLimiter,
  loginIpLimiter,
  loginIdentityLimiter,
  twoFactorIpLimiter,
  twoFactorIdentityLimiter,
  forgotPasswordIpLimiter,
  forgotPasswordIdentityLimiter,
  resendVerificationIpLimiter,
  resendVerificationIdentityLimiter,
  registerLimiter,
  resetPasswordLimiter,
  refreshLimiter,
} from "../middleware/authRateLimit.middleware.js";

const router = express.Router();

router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

router.use(authBurstLimiter);

router.get("/csrf", getCsrfToken);

router.post("/register", registerLimiter, registerUser);

router.post("/login", loginIpLimiter, loginIdentityLimiter, loginUser);

router.get("/google", googleLogin);

router.get("/google/callback", googleCallback);

router.get("/google-signup-info", getGoogleSignupInfo);

router.get("/microsoft", microsoftLogin);

router.get("/microsoft/callback", microsoftCallback);

router.get("/microsoft-signup-info", getMicrosoftSignupInfo);

router.post("/refresh", refreshLimiter, refreshAccessToken);

router.post("/logout", logoutUser);

router.get("/verify/:token", verifyEmail);

router.post("/resend-verification", resendVerificationIpLimiter, resendVerificationIdentityLimiter, resendVerification);

router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate("organization", "name timezone")
      .populate("reportTeam")
      .select("-password -refreshToken");

    const userObj = user.toObject();

    const roleDoc = user.roleRef
      ? await Role.findById(user.roleRef)
      : null;

    const authContext = resolveEffectiveAuthContext(user, roleDoc);
    const permissions = Array.from(authContext.effectivePermissions);

    userObj.permissions = permissions;
    userObj.manageUsers = permissions.includes("manage_users") || user.role === "owner";
    userObj.reportAccess = authContext.effectiveReportAccess;
    userObj.screenshotAccess = authContext.effectiveScreenshotAccess;

    if (
      userObj.avatar &&
      !userObj.avatar.startsWith("http://") &&
      !userObj.avatar.startsWith("https://")
    ) {
      userObj.avatar = `${process.env.BACKEND_URL}/${userObj.avatar}`;
    }

    res.json(userObj);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to load user",
    });
  }
});

router.post("/forgot-password", forgotPasswordIpLimiter, forgotPasswordIdentityLimiter, forgotPassword);

router.post("/reset-password", resetPasswordLimiter, resetPassword);

router.post("/verify-two-factor", twoFactorIpLimiter, twoFactorIdentityLimiter, verifyTwoFactor);

export default router;
