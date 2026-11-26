import Comment from "../models/comment.model.js";
import Task from "../models/task.model.js";
import User from "../models/user.model.js";
import commentRepository from "../db/repositories/comment.repository.js";
import { createNotification } from "../services/notification.service.js";
import { normalizeId } from "../security/effectiveAuthContext.js";

export const addComment = async (req, res) => {
  try {
    const callerUserId = normalizeId(req.user?._id || req.user?.id);
    const callerOrgId = normalizeId(req.user?.organizationId || req.user?.organization);

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing authentication context",
      });
    }

    const { taskId } = req.params;
    const { content } = req.body || {};

    if (!content || typeof content !== "string" || !content.trim()) {
      return res.status(400).json({
        message: "Comment cannot be empty",
      });
    }

    const normalizedTaskId = normalizeId(taskId);
    if (!normalizedTaskId) {
      return res.status(400).json({
        message: "Task ID is required",
      });
    }

    // Tenant boundary: Task must belong to the caller's authorized organization
    const task = await Task.findOne({
      _id: normalizedTaskId,
      organization: callerOrgId,
      deleted: false,
    });

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    // Identity binding: comment author is strictly the authenticated caller
    const comment = await Comment.create({
      task: task._id,
      user: callerUserId,
      content: content.trim(),
      readBy: [callerUserId],
    });

    /*
     * Notification Recipient Derivation & Injection Prevention:
     * Recipients are derived solely from trusted server-side task relationships.
     * Client-supplied recipientId, userId, or organizationId in req.body are strictly ignored.
     * Recipient is verified to exist within the caller's authorized organization.
     */
    const recipientUserId = normalizeId(task.assignedTo?._id || task.assignedTo);
    if (recipientUserId && recipientUserId !== callerUserId) {
      const recipientUser = await User.findOne({
        _id: recipientUserId,
        organization: callerOrgId,
      });

      if (recipientUser) {
        await createNotification({
          recipientId: recipientUserId,
          organizationId: callerOrgId,
          type: "TASK_COMMENT",
          title: "New task comment",
          message: `${req.user.firstName || "User"} ${req.user.lastName || ""} commented on "${task.title}".`.trim(),
          entityType: "task",
          entityId: task._id.toString(),
          metadata: {
            commentId: comment._id.toString(),
            commenterId: callerUserId,
            commenterName: `${req.user.firstName || "User"} ${req.user.lastName || ""}`.trim(),
          },
        });
      }
    }

    const populatedComment = await Comment.findById(comment._id).populate(
      "user",
      "_id firstName lastName avatar",
    );

    return res.status(201).json(populatedComment);
  } catch (error) {
    console.error("ADD COMMENT ERROR:", error);

    return res.status(500).json({
      message: "Failed to add comment",
    });
  }
};

export const getComments = async (req, res) => {
  try {
    const callerUserId = normalizeId(req.user?._id || req.user?.id);
    const callerOrgId = normalizeId(req.user?.organizationId || req.user?.organization);

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing authentication context",
      });
    }

    const { taskId } = req.params;
    const normalizedTaskId = normalizeId(taskId);
    if (!normalizedTaskId) {
      return res.status(400).json({
        message: "Task ID is required",
      });
    }

    // Scoped query: task must belong to the caller's organization
    const task = await Task.findOne({
      _id: normalizedTaskId,
      organization: callerOrgId,
      deleted: false,
    });

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    const commentQuery = {
      task: task._id,
    };

    const { startDate, endDate, from, to, date, createdAt } = req.query || {};
    const rawStart = startDate || from;
    const rawEnd = endDate || to;

    if (rawStart || rawEnd) {
      const dateFilter = {};
      if (rawStart) {
        const parsedStart = new Date(rawStart);
        if (isNaN(parsedStart.getTime())) {
          return res.status(400).json({
            message: "Invalid startDate format",
          });
        }
        dateFilter.$gte = parsedStart;
      }
      if (rawEnd) {
        const parsedEnd = new Date(rawEnd);
        if (isNaN(parsedEnd.getTime())) {
          return res.status(400).json({
            message: "Invalid endDate format",
          });
        }
        dateFilter.$lte = parsedEnd;
      }
      if (dateFilter.$gte && dateFilter.$lte && dateFilter.$gte.getTime() > dateFilter.$lte.getTime()) {
        return res.status(400).json({
          message: "startDate cannot be after endDate",
        });
      }
      commentQuery.createdAt = dateFilter;
    } else if (date) {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          message: "Invalid date format",
        });
      }
      const startOfDay = new Date(parsedDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(parsedDate);
      endOfDay.setUTCHours(23, 59, 59, 999);
      commentQuery.createdAt = {
        $gte: startOfDay,
        $lte: endOfDay,
      };
    } else if (createdAt) {
      if (typeof createdAt === "string") {
        const parsed = new Date(createdAt);
        if (isNaN(parsed.getTime())) {
          return res.status(400).json({
            message: "Invalid createdAt format",
          });
        }
        commentQuery.createdAt = parsed;
      } else if (typeof createdAt === "object" && createdAt !== null) {
        const parsedRange = {};
        for (const [k, v] of Object.entries(createdAt)) {
          const parsed = new Date(v);
          if (isNaN(parsed.getTime())) {
            return res.status(400).json({
              message: `Invalid createdAt ${k} format`,
            });
          }
          parsedRange[k] = parsed;
        }
        commentQuery.createdAt = parsedRange;
      }
    }

    const comments = await Comment.find(commentQuery)
      .populate("user", "_id firstName lastName avatar")
      .sort({ createdAt: 1 });

    return res.status(200).json(comments);
  } catch (error) {
    console.error("GET COMMENTS ERROR:", error);

    return res.status(500).json({
      message: "Failed to fetch comments",
    });
  }
};

export const getUnreadCommentCount = async (req, res) => {
  try {
    const callerUserId = normalizeId(req.user?._id || req.user?.id);
    const callerOrgId = normalizeId(req.user?.organizationId || req.user?.organization);

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing authentication context",
      });
    }

    const { taskId } = req.params;
    const normalizedTaskId = normalizeId(taskId);
    if (!normalizedTaskId) {
      return res.status(400).json({
        message: "Task ID is required",
      });
    }

    // Scoped query: verify task belongs to caller organization before counting
    const task = await Task.findOne({
      _id: normalizedTaskId,
      organization: callerOrgId,
      deleted: false,
    });

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    const count = await Comment.countDocuments({
      task: task._id,
      user: { $ne: callerUserId },
      $or: [
        { readBy: { $exists: false } },
        { readBy: { $nin: [callerUserId] } },
      ],
    });

    return res.status(200).json({
      count,
    });
  } catch (error) {
    console.error("GET UNREAD COMMENT COUNT ERROR:", error);

    return res.status(500).json({
      message: "Failed to fetch unread comment count",
    });
  }
};

export const markCommentsAsRead = async (req, res) => {
  try {
    const callerUserId = normalizeId(req.user?._id || req.user?.id);
    const callerOrgId = normalizeId(req.user?.organizationId || req.user?.organization);

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing authentication context",
      });
    }

    const { taskId } = req.params;
    const normalizedTaskId = normalizeId(taskId);
    if (!normalizedTaskId) {
      return res.status(400).json({
        message: "Task ID is required",
      });
    }

    // Scoped query: task must belong to caller organization
    const task = await Task.findOne({
      _id: normalizedTaskId,
      organization: callerOrgId,
      deleted: false,
    });

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    if (commentRepository && typeof commentRepository.markCommentsAsRead === "function") {
      await commentRepository.markCommentsAsRead(task._id, callerUserId);
    } else {
      await Comment.updateMany(
        {
          task: task._id,
          readBy: { $nin: [callerUserId] },
        },
        {
          $addToSet: {
            readBy: callerUserId,
          },
        },
      );
    }

    return res.status(200).json({
      message: "Comments marked as read",
    });
  } catch (error) {
    console.error("MARK COMMENTS AS READ ERROR:", error);

    return res.status(500).json({
      message: "Failed to mark comments as read",
    });
  }
};

export const updateComment = async (req, res) => {
  try {
    const callerUserId = normalizeId(req.user?._id || req.user?.id);
    const callerOrgId = normalizeId(req.user?.organizationId || req.user?.organization);

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing authentication context",
      });
    }

    const { commentId } = req.params;
    const { content } = req.body || {};

    if (!content || typeof content !== "string" || !content.trim()) {
      return res.status(400).json({
        message: "Comment cannot be empty",
      });
    }

    const normalizedCommentId = normalizeId(commentId);
    if (!normalizedCommentId) {
      return res.status(400).json({
        message: "Comment ID is required",
      });
    }

    const comment = await Comment.findById(normalizedCommentId);

    if (!comment) {
      return res.status(404).json({
        message: "Comment not found",
      });
    }

    // Scoped query: parent task must belong to caller's organization
    const task = await Task.findOne({
      _id: normalizeId(comment.task?._id || comment.task),
      organization: callerOrgId,
      deleted: false,
    });

    if (!task) {
      return res.status(404).json({
        message: "Comment not found",
      });
    }

    // Ownership check: Users can only edit their own comments
    const commentAuthorId = normalizeId(comment.user?._id || comment.user);
    if (commentAuthorId !== callerUserId) {
      return res.status(403).json({
        message: "You can only edit your own comments",
      });
    }

    comment.content = content.trim();
    comment.edited = true;

    await comment.save();

    const updatedComment = await Comment.findById(comment._id).populate(
      "user",
      "_id firstName lastName avatar",
    );

    return res.status(200).json(updatedComment);
  } catch (error) {
    console.error("UPDATE COMMENT ERROR:", error);

    return res.status(500).json({
      message: "Failed to update comment",
    });
  }
};

export const deleteComment = async (req, res) => {
  try {
    const callerUserId = normalizeId(req.user?._id || req.user?.id);
    const callerOrgId = normalizeId(req.user?.organizationId || req.user?.organization);

    if (!callerUserId || !callerOrgId) {
      return res.status(401).json({
        message: "Unauthorized: Missing authentication context",
      });
    }

    const { commentId } = req.params;
    const normalizedCommentId = normalizeId(commentId);
    if (!normalizedCommentId) {
      return res.status(400).json({
        message: "Comment ID is required",
      });
    }

    const comment = await Comment.findById(normalizedCommentId);

    if (!comment) {
      return res.status(404).json({
        message: "Comment not found",
      });
    }

    // Scoped query: parent task must belong to caller's organization
    const task = await Task.findOne({
      _id: normalizeId(comment.task?._id || comment.task),
      organization: callerOrgId,
      deleted: false,
    });

    if (!task) {
      return res.status(404).json({
        message: "Comment not found",
      });
    }

    const commentAuthorId = normalizeId(comment.user?._id || comment.user);
    const isAuthor = commentAuthorId === callerUserId;
    const isOrgAdmin = req.user.role === "owner" || req.user.role === "admin";

    // Authors and organization admins/owners can delete comments
    if (!isAuthor && !isOrgAdmin) {
      return res.status(403).json({
        message: "You can only delete your own comments",
      });
    }

    await Comment.findByIdAndDelete(comment._id);

    return res.status(200).json({
      message: "Comment deleted successfully",
    });
  } catch (error) {
    console.error("DELETE COMMENT ERROR:", error);

    return res.status(500).json({
      message: "Failed to delete comment",
    });
  }
};
