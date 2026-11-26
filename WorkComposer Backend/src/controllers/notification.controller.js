import Notification from "../models/notification.model.js";
import Organization from "../models/organization.model.js";
import { normalizeId } from "../security/effectiveAuthContext.js";

export const getNotifications = async (req, res) => {
    try {
        const callerUserId = normalizeId(req.user?._id || req.user?.id);
        const callerOrgId = normalizeId(
            req.user?.organization?._id ||
            req.user?.organizationId ||
            req.user?.organization?.id ||
            req.user?.organization
        );

        if (!callerUserId || !callerOrgId) {
            return res.status(401).json({
                message: "Unauthorized: Missing authentication or organization context.",
            });
        }

        const requestedOrgId = normalizeId(
            req.query?.organizationId ||
            req.query?.organization ||
            req.body?.organizationId ||
            req.body?.organization
        );
        if (requestedOrgId && requestedOrgId !== callerOrgId) {
            return res.status(403).json({
                message: "Forbidden: Cross-tenant notification access denied.",
            });
        }

        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(
            Math.max(Number(req.query.limit) || 20, 1),
            50
        );

        const skip = (page - 1) * limit;

        const baseFilter = {
            recipient: callerUserId,
            organization: callerOrgId,
        };

        const [notifications, total, unreadCount] =
            await Promise.all([
                Notification.find(baseFilter)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),

                Notification.countDocuments(baseFilter),

                Notification.countDocuments({
                    ...baseFilter,
                    read: false,
                }),
            ]);

        res.json({
            notifications,
            unreadCount,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("GET NOTIFICATIONS ERROR:", error);

        res.status(500).json({
            message: "Failed to load notifications.",
        });
    }
};

export const getUnreadNotificationCount = async (req, res) => {
    try {
        const callerUserId = normalizeId(req.user?._id || req.user?.id);
        const callerOrgId = normalizeId(
            req.user?.organization?._id ||
            req.user?.organizationId ||
            req.user?.organization?.id ||
            req.user?.organization
        );

        if (!callerUserId || !callerOrgId) {
            return res.status(401).json({
                message: "Unauthorized: Missing authentication or organization context.",
            });
        }

        const requestedOrgId = normalizeId(
            req.query?.organizationId ||
            req.query?.organization ||
            req.body?.organizationId ||
            req.body?.organization
        );
        if (requestedOrgId && requestedOrgId !== callerOrgId) {
            return res.status(403).json({
                message: "Forbidden: Cross-tenant notification access denied.",
            });
        }

        const unreadCount = await Notification.countDocuments({
            recipient: callerUserId,
            organization: callerOrgId,
            read: false,
        });

        res.json({
            unreadCount,
        });
    } catch (error) {
        console.error(
            "GET UNREAD NOTIFICATION COUNT ERROR:",
            error
        );

        res.status(500).json({
            message: "Failed to load unread notification count.",
        });
    }
};

export const markNotificationAsRead = async (req, res) => {
    try {
        const callerUserId = normalizeId(req.user?._id || req.user?.id);
        const callerOrgId = normalizeId(
            req.user?.organization?._id ||
            req.user?.organizationId ||
            req.user?.organization?.id ||
            req.user?.organization
        );

        if (!callerUserId || !callerOrgId) {
            return res.status(401).json({
                message: "Unauthorized: Missing authentication or organization context.",
            });
        }

        const requestedOrgId = normalizeId(
            req.query?.organizationId ||
            req.query?.organization ||
            req.body?.organizationId ||
            req.body?.organization
        );
        if (requestedOrgId && requestedOrgId !== callerOrgId) {
            return res.status(403).json({
                message: "Forbidden: Cross-tenant notification access denied.",
            });
        }

        const notificationId = normalizeId(req.params.id);
        if (!notificationId) {
            return res.status(400).json({
                message: "Notification ID is required.",
            });
        }

        const notification =
            await Notification.findOneAndUpdate(
                {
                    _id: notificationId,
                    recipient: callerUserId,
                    organization: callerOrgId,
                },
                {
                    $set: {
                        read: true,
                        readAt: new Date(),
                    },
                },
                {
                    new: true,
                }
            );

        if (!notification) {
            return res.status(404).json({
                message: "Notification not found.",
            });
        }

        res.json(notification);
    } catch (error) {
        console.error(
            "MARK NOTIFICATION READ ERROR:",
            error
        );

        res.status(500).json({
            message: "Failed to mark notification as read.",
        });
    }
};

export const deleteNotification = async (req, res) => {
    try {
        const callerUserId = normalizeId(req.user?._id || req.user?.id);
        const callerOrgId = normalizeId(
            req.user?.organization?._id ||
            req.user?.organizationId ||
            req.user?.organization?.id ||
            req.user?.organization
        );

        if (!callerUserId || !callerOrgId) {
            return res.status(401).json({
                message: "Unauthorized: Missing authentication or organization context.",
            });
        }

        const requestedOrgId = normalizeId(
            req.query?.organizationId ||
            req.query?.organization ||
            req.body?.organizationId ||
            req.body?.organization
        );
        if (requestedOrgId && requestedOrgId !== callerOrgId) {
            return res.status(403).json({
                message: "Forbidden: Cross-tenant notification access denied.",
            });
        }

        const notificationId = normalizeId(req.params.id);
        if (!notificationId) {
            return res.status(400).json({
                message: "Notification ID is required.",
            });
        }

        const notification = await Notification.findOneAndDelete({
            _id: notificationId,
            recipient: callerUserId,
            organization: callerOrgId,
        });

        if (!notification) {
            return res.status(404).json({
                message: "Notification not found.",
            });
        }

        res.json({
            message: "Notification deleted successfully.",
        });
    } catch (error) {
        console.error("DELETE NOTIFICATION ERROR:", error);

        res.status(500).json({
            message: "Failed to delete notification.",
        });
    }
};

export const markAllNotificationsAsRead = async (req, res) => {
    try {
        const callerUserId = normalizeId(req.user?._id || req.user?.id);
        const callerOrgId = normalizeId(
            req.user?.organization?._id ||
            req.user?.organizationId ||
            req.user?.organization?.id ||
            req.user?.organization
        );

        if (!callerUserId || !callerOrgId) {
            return res.status(401).json({
                message: "Unauthorized: Missing authentication or organization context.",
            });
        }

        const requestedOrgId = normalizeId(
            req.query?.organizationId ||
            req.query?.organization ||
            req.body?.organizationId ||
            req.body?.organization
        );
        if (requestedOrgId && requestedOrgId !== callerOrgId) {
            return res.status(403).json({
                message: "Forbidden: Cross-tenant notification access denied.",
            });
        }

        await Notification.updateMany(
            {
                recipient: callerUserId,
                organization: callerOrgId,
                read: false,
            },
            {
                $set: {
                    read: true,
                    readAt: new Date(),
                },
            }
        );

        res.json({
            message: "All notifications marked as read.",
        });
    } catch (error) {
        console.error(
            "MARK ALL NOTIFICATIONS READ ERROR:",
            error
        );

        res.status(500).json({
            message: "Failed to mark notifications as read.",
        });
    }
};
export { updateOrganizationNotifications } from "./organization.controller.js";