import express from "express";

import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  updateOrganizationNotifications,
} from "../controllers/notification.controller.js";

import { protect } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/permission.middleware.js";

const router = express.Router();

router.get("/", protect, getNotifications);

router.get("/unread-count", protect, getUnreadNotificationCount);

router.patch("/:id/read", protect, markNotificationAsRead);

router.delete("/:id", protect, deleteNotification);

router.patch("/read-all", protect, markAllNotificationsAsRead);

router.put(
  "/notifications",
  protect,
  requirePermission("manage_settings"),
  updateOrganizationNotifications,
);

router.patch(
  "/notifications",
  protect,
  requirePermission("manage_settings"),
  updateOrganizationNotifications,
);

export default router;
