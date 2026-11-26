import AuditLog from "../models/auditLog.model.js";
import { getAvatarUrl } from "../utils/avatar.js";

export const getAuditLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      user,
      category,
      startDate,
      endDate,
    } = req.query;

    const orgId = req.user?.organization?._id || req.user?.organization?.id || req.user?.organization;

    const query = {
      organization: orgId,
    };

    // Filter by user
    if (user && user !== "all") {
      query.performedBy = user;
    }

    // Filter by category
    if (category && category !== "all") {
      query.category = category;
    }

    // Filter by date range
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const total = await AuditLog.countDocuments(query);

    const rawLogs = await AuditLog.find(query)
      .populate("performedBy", "firstName lastName avatar email")
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    // Normalize user avatars and serialize for frontend consistency
    const logs = (rawLogs || []).map((log) => {
      const doc = log?.toObject ? log.toObject() : { ...log };
      if (doc.performedBy && typeof doc.performedBy === "object") {
        doc.performedBy.avatar = getAvatarUrl(doc.performedBy.avatar) || "";
      }
      return doc;
    });

    res.status(200).json({
      logs,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)) || 1,
    });
  } catch (err) {
    console.error("Audit log controller error:", err);

    res.status(500).json({
      message: "Failed to fetch audit logs",
    });
  }
};
