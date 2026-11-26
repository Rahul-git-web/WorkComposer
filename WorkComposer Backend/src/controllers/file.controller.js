import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import Report from "../models/report.model.js";
import User from "../models/user.model.js";
import Organization from "../models/organization.model.js";
import { getReportAccess } from "../utils/reportAccess.js";
import { isPostgres } from "../db/index.js";
import { getPrismaClient } from "../db/prisma.js";
import { normalizeId } from "../security/effectiveAuthContext.js";

/**
 * Safely extracts route parameter value whether received as an array (wildcard) or string.
 */
export function extractParam(param) {
  if (Array.isArray(param)) return param.join("/");
  if (typeof param === "string") return param;
  return "";
}

/**
 * Extracts and verifies the authenticated user from the request.
 * Supports:
 * 1. Pre-populated req.user
 * 2. Authorization Bearer header
 * 3. Cookie accessToken
 * 4. Query string token (?token=...)
 */
export async function authenticateFileRequest(req) {
  if (req.user && (req.user._id || req.user.id)) {
    return req.user;
  }

  const authHeader = req.headers?.authorization;
  const token =
    (authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null) ||
    req.cookies?.accessToken ||
    req.query?.token;

  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded?.userId) return null;

    if (isPostgres()) {
      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { organization: true, customRole: true },
      });
      return user || null;
    }

    const user = await User.findById(decoded.userId).populate("organization");
    return user || null;
  } catch (err) {
    return null;
  }
}

/**
 * Validates against path traversal vectors (relative, absolute, Windows, and URL-encoded).
 */
export function isPathTraversalAttempt(req, requestedFile = "") {
  const rawUrl = req.originalUrl || req.url || "";
  try {
    const decodedUrl = decodeURIComponent(rawUrl);
    if (
      decodedUrl.includes("..") ||
      decodedUrl.includes("%2e%2e") ||
      decodedUrl.includes("\0") ||
      /(\.\.[/\\]|[/\\]\.\.)/.test(decodedUrl)
    ) {
      return true;
    }
  } catch {
    return true; // Malformed URI encoding is suspicious
  }

  const str = String(requestedFile);
  try {
    const decodedStr = decodeURIComponent(str);
    if (
      decodedStr.includes("..") ||
      decodedStr.includes("\0") ||
      path.isAbsolute(decodedStr) ||
      /^[a-zA-Z]:/.test(decodedStr)
    ) {
      return true;
    }
  } catch {
    return true;
  }

  if (
    str.includes("..") ||
    str.includes("\0") ||
    path.isAbsolute(str) ||
    /^[a-zA-Z]:/.test(str)
  ) {
    return true;
  }

  return false;
}

/**
 * Guard middleware returning 400 Bad Request on detected path traversal attempt.
 */
export const pathTraversalGuard = (req, res, next) => {
  if (isPathTraversalAttempt(req)) {
    return res.status(400).json({ message: "Invalid file path" });
  }
  next();
};

/**
 * Serves private CSV reports from uploads/reports.
 * Enforces:
 * - Path traversal safety
 * - Authentication (401 on missing/invalid token)
 * - Tenant isolation (404 zero disclosure on cross-tenant requests)
 * - Resource authorization (403 on permission mismatch within same tenant)
 */
export const serveReportFile = async (req, res) => {
  try {
    const rawParam = extractParam(req.params.filename || req.params[0]);

    if (isPathTraversalAttempt(req, rawParam)) {
      return res.status(400).json({ message: "Invalid file path" });
    }

    const fileName = path.basename(rawParam);
    const reportsDir = path.resolve(process.cwd(), "uploads", "reports");
    const filePath = path.resolve(reportsDir, fileName);

    if (!filePath.startsWith(reportsDir)) {
      return res.status(400).json({ message: "Invalid file path" });
    }

    // 1. Authentication check
    const user = await authenticateFileRequest(req);
    if (!user) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    const callerUserId = normalizeId(user._id || user.id);
    const callerOrgId = normalizeId(
      user.organizationId || user.organization?._id || user.organization?.id || user.organization
    );

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({ message: "Not authorized" });
    }

    // 2. Extract reportId: format is [type]-[reportId].csv
    const match = fileName.match(/^([a-zA-Z0-9_-]+)-([a-fA-F0-9]{24})\.csv$/i);
    if (!match) {
      return res.status(404).json({ message: "File not found" });
    }

    const reportId = match[2];
    let reportOwner = null;
    let reportOrgId = null;

    if (isPostgres()) {
      const prisma = getPrismaClient();
      const report = await prisma.report.findUnique({
        where: { id: reportId },
        include: {
          user: {
            select: {
              id: true,
              organizationId: true,
              managerId: true,
            },
          },
        },
      });
      if (!report || !report.user) {
        return res.status(404).json({ message: "File not found" });
      }
      reportOwner = report.user;
      reportOrgId = normalizeId(report.user.organizationId);
    } else {
      const report = await Report.findById(reportId);
      if (!report) {
        return res.status(404).json({ message: "File not found" });
      }

      reportOwner = await User.findById(report.user || report.userId);
      if (!reportOwner) {
        return res.status(404).json({ message: "File not found" });
      }

      reportOrgId = normalizeId(
        reportOwner.organizationId || reportOwner.organization?._id || reportOwner.organization?.id || reportOwner.organization
      );
    }

    // 3. Tenant Isolation: 404 zero existence disclosure
    if (!reportOrgId || callerOrgId !== reportOrgId) {
      return res.status(404).json({ message: "File not found" });
    }

    // 4. Resource / Capability Authorization
    const reportOwnerUserId = normalizeId(reportOwner._id || reportOwner.id);
    let allowed = false;

    if (user.role === "owner" || user.role === "admin") {
      allowed = true;
    } else if (callerUserId === reportOwnerUserId) {
      allowed = true;
    } else {
      const reportAccess = await getReportAccess(user);
      if (reportAccess === "all") {
        allowed = true;
      } else if (reportAccess === "managed") {
        if (reportOwner.managerId && normalizeId(reportOwner.managerId) === callerUserId) {
          allowed = true;
        }
      }
    }

    if (!allowed) {
      return res.status(403).json({
        message: "You are not authorized to access this report",
      });
    }

    // 5. File existence on disk
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "File not found" });
    }

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.sendFile(filePath);
  } catch (err) {
    console.error("SERVE REPORT ERROR:", err);
    return res.status(500).json({ message: "Failed to serve report file", error: "Failed to serve report file" });
  }
};

/**
 * Serves user avatars from uploads/avatars.
 * Enforces authentication and same-tenant verification.
 */
export const serveAvatarFile = async (req, res) => {
  try {
    const rawParam = extractParam(req.params.filename || req.params[0]);

    if (isPathTraversalAttempt(req, rawParam)) {
      return res.status(400).json({ message: "Invalid file path" });
    }

    const fileName = path.basename(rawParam);
    const avatarsDir = path.resolve(process.cwd(), "uploads", "avatars");
    const filePath = path.resolve(avatarsDir, fileName);

    if (!filePath.startsWith(avatarsDir)) {
      return res.status(400).json({ message: "Invalid file path" });
    }

    // Authentication check
    const user = await authenticateFileRequest(req);
    if (!user) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    const callerOrgId = normalizeId(
      user.organizationId || user.organization?._id || user.organization?.id || user.organization
    );

    // Extract target userId: ${userId}-${timestamp}.${ext}
    const match = fileName.match(/^([a-fA-F0-9]{24})-/);
    if (!match) {
      return res.status(404).json({ message: "File not found" });
    }

    const targetUserId = match[1];
    let targetOrgId = null;

    if (isPostgres()) {
      const prisma = getPrismaClient();
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { organizationId: true },
      });
      if (!targetUser) {
        return res.status(404).json({ message: "File not found" });
      }
      targetOrgId = normalizeId(targetUser.organizationId);
    } else {
      const targetUser = await User.findById(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "File not found" });
      }
      targetOrgId = normalizeId(
        targetUser.organizationId || targetUser.organization?._id || targetUser.organization?.id || targetUser.organization
      );
    }

    // Tenant isolation: 404 zero disclosure
    if (!targetOrgId || callerOrgId !== targetOrgId) {
      return res.status(404).json({ message: "File not found" });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "File not found" });
    }

    return res.sendFile(filePath);
  } catch (err) {
    console.error("SERVE AVATAR ERROR:", err);
    return res.status(500).json({ message: "Failed to serve avatar file", error: "Failed to serve avatar file" });
  }
};

/**
 * Serves designated public assets from uploads/public.
 */
export const servePublicFile = async (req, res) => {
  try {
    const rawParam = extractParam(req.params.filename || req.params[0]);

    if (isPathTraversalAttempt(req, rawParam)) {
      return res.status(400).json({ message: "Invalid file path" });
    }

    const fileName = path.basename(rawParam);
    const publicDir = path.resolve(process.cwd(), "uploads", "public");
    const filePath = path.resolve(publicDir, fileName);

    if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath)) {
      return res.status(404).json({ message: "File not found" });
    }

    return res.sendFile(filePath);
  } catch (err) {
    console.error("SERVE PUBLIC FILE ERROR:", err);
    return res.status(500).json({ message: "Failed to serve public file", error: "Failed to serve public file" });
  }
};

/**
 * Serves files directly in uploads/:filename (root of uploads).
 * Checks if file is a registered public organization logo.
 * If not a public logo, enforces authentication and tenant verification.
 */
export const serveRootUploadFile = async (req, res) => {
  try {
    const rawParam = extractParam(req.params.filename || req.params[0]);

    if (isPathTraversalAttempt(req, rawParam)) {
      return res.status(400).json({ message: "Invalid file path" });
    }

    const fileName = path.basename(rawParam);
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    const filePath = path.resolve(uploadsDir, fileName);

    if (!filePath.startsWith(uploadsDir) || !fs.existsSync(filePath)) {
      return res.status(404).json({ message: "File not found" });
    }

    // 1. Check if this is an organization logo (public by design)
    let isOrgLogo = false;
    if (isPostgres()) {
      const prisma = getPrismaClient();
      const orgWithLogo = await prisma.organization.findFirst({
        where: { logo: { contains: fileName } },
        select: { id: true },
      });
      isOrgLogo = Boolean(orgWithLogo);
    } else {
      const orgWithLogo = await Organization.findOne({
        logo: { $regex: fileName },
      });
      isOrgLogo = Boolean(orgWithLogo);
    }

    if (isOrgLogo) {
      return res.sendFile(filePath);
    }

    // 2. Not a logo -> Private upload. Require authentication.
    const user = await authenticateFileRequest(req);
    if (!user) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    const callerOrgId = normalizeId(
      user.organizationId || user.organization?._id || user.organization?.id || user.organization
    );

    // 3. If file name contains an organization ID or user ID, verify tenant boundary
    const hexMatch = fileName.match(/([a-fA-F0-9]{24})/);
    if (hexMatch) {
      const candidateId = hexMatch[1];
      if (isPostgres()) {
        const prisma = getPrismaClient();
        const candOrg = await prisma.organization.findUnique({
          where: { id: candidateId },
          select: { id: true },
        });
        if (candOrg && candOrg.id !== callerOrgId) {
          return res.status(404).json({ message: "File not found" });
        }

        const candUser = await prisma.user.findUnique({
          where: { id: candidateId },
          select: { organizationId: true },
        });
        if (candUser && candUser.organizationId !== callerOrgId) {
          return res.status(404).json({ message: "File not found" });
        }
      } else {
        const candOrg = await Organization.findById(candidateId);
        if (candOrg && candOrg._id.toString() !== callerOrgId) {
          return res.status(404).json({ message: "File not found" });
        }

        const candUser = await User.findById(candidateId);
        if (candUser && normalizeId(candUser.organization) !== callerOrgId) {
          return res.status(404).json({ message: "File not found" });
        }
      }
    }

    return res.sendFile(filePath);
  } catch (err) {
    console.error("SERVE ROOT UPLOAD ERROR:", err);
    return res.status(500).json({ message: "Failed to serve file", error: "Failed to serve file" });
  }
};
