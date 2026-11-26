import {
  integrationRepository,
  organizationRepository,
  userRepository,
  notificationRepository,
} from "../db/repositories/index.js";
import sendEmail from "../utils/sendEmail.js";
import taskAssignedEmailTemplate from "../templates/taskAssignedEmailTemplate.js";
import { sendSlackMessage } from "./slack.service.js";
import {
  buildTaskAssignedMessage,
  buildTaskUpdatedMessage,
  buildTaskReassignedMessage,
  buildTaskCompletedMessage,
  buildDailySummaryMessage,
  buildWeeklySummaryMessage,
} from "./slackMessages.js";
import { getDailySummary, getWeeklySummary } from "./report.service.js";
import { getIO } from "../socket/socket.js";
import { normalizeId } from "../security/effectiveAuthContext.js";

const sendSlackNotification = async (
  organizationId,
  notificationType,
  fallbackText,
  blocks,
) => {
  const integration = await integrationRepository.findOne({
    organization: organizationId,
    provider: "slack",
    connected: true,
  });

  if (!integration?.slackChannelId) {
    return;
  }

  if (
    integration.notifications &&
    integration.notifications[notificationType] === false
  ) {
    return;
  }

  await sendSlackMessage(
    organizationId,
    integration.slackChannelId,
    fallbackText,
    blocks,
  );
};

export const notifyTaskAssigned = async ({
  organizationId,
  assignedTo,
  assignedToId,
  title,
  project,
  priority,
  status,
  dueDate,
  createdBy,
  taskId,
}) => {
  try {
    const blocks = buildTaskAssignedMessage({
      taskId,
      title,
      project,
      assignedTo,
      priority,
      status,
      dueDate,
      createdBy,
    });

    await sendSlackNotification(
      organizationId,
      "taskAssigned",
      "New Task Assigned",
      blocks,
    );

    if (assignedToId) {
      await createNotification({
        recipientId: assignedToId,
        organizationId,
        type: "TASK_ASSIGNED",
        title: "Task assigned",
        message: `You were assigned "${title}".`,
        entityType: "task",
        entityId: taskId,
        metadata: {
          project,
          priority,
          status,
          dueDate,
        },
      });
    }

    const organization = await organizationRepository.findById(organizationId);

    if (organization?.taskManagement?.notifyTaskAssignedEmail === false) {
      return;
    }

    const assignedUser = assignedToId
      ? await userRepository.findById(assignedToId)
      : null;

    if (!assignedUser) {
      console.info("USER NOT FOUND");
      return;
    }

    const assignedUserOrgId = normalizeId(assignedUser.organization?._id || assignedUser.organization);
    if (assignedUserOrgId && assignedUserOrgId !== normalizeId(organizationId)) {
      console.warn("Cross-tenant task assignment email suppressed.");
      return;
    }

    const html = taskAssignedEmailTemplate({
      firstName: assignedUser.firstName,
      title,
      project,
      priority,
      status,
      dueDate,
      createdBy,
      taskId,
    });

    await sendEmail(assignedUser.email, "New Task Assigned", html);
  } catch (err) {
    console.error("Notification Error:", err.message);
  }
};

export const notifyTaskUpdated = async ({
  organizationId,
  recipientId,
  taskId,
  title,
  changes,
  updatedBy,
}) => {
  try {
    const blocks = buildTaskUpdatedMessage({
      title,
      updatedBy,
      changes,
    });

    await sendSlackNotification(
      organizationId,
      "taskUpdated",
      "Task Updated",
      blocks,
    );

    if (recipientId) {
      await createNotification({
        recipientId,
        organizationId,
        type: "TASK_UPDATED",
        title: "Task updated",
        message: `"${title}" was updated.`,
        entityType: "task",
        entityId: taskId,
        metadata: {
          changes,
          updatedBy,
        },
      });
    }
  } catch (err) {
    console.error("Notification Error:", err.message);
  }
};

export const notifyTaskReassigned = async ({
  organizationId,
  recipientId,
  taskId,
  title,
  previousAssignee,
  newAssignee,
  reassignedBy,
}) => {
  try {
    const blocks = buildTaskReassignedMessage({
      title,
      previousAssignee,
      newAssignee,
      reassignedBy,
    });

    await sendSlackNotification(
      organizationId,
      "taskReassigned",
      "Task Reassigned",
      blocks,
    );

    if (recipientId) {
      await createNotification({
        recipientId,
        organizationId,
        type: "TASK_REASSIGNED",
        title: "Task reassigned",
        message: `"${title}" was assigned to you.`,
        entityType: "task",
        entityId: taskId,
        metadata: {
          previousAssignee,
          newAssignee,
          reassignedBy,
        },
      });
    }
  } catch (err) {
    console.error("Notification Error:", err.message);
  }
};

export const notifyTaskCompleted = async ({
  organizationId,
  recipientId,
  taskId,
  title,
  completedBy,
}) => {
  try {
    const blocks = buildTaskCompletedMessage({
      title,
      completedBy,
      completedAt: new Date().toLocaleString(),
    });

    await sendSlackNotification(
      organizationId,
      "taskCompleted",
      "Task Completed",
      blocks,
    );

    if (recipientId) {
      await createNotification({
        recipientId,
        organizationId,
        type: "TASK_COMPLETED",
        title: "Task completed",
        message: `"${title}" was completed.`,
        entityType: "task",
        entityId: taskId,
        metadata: {
          completedBy,
        },
      });
    }
  } catch (err) {
    console.error("Notification Error:", err.message);
  }
};

export const notifyTaskEvents = async ({
  previousTask,
  task,
  changes,
  previousAssignedUser,
  newAssignedUser,
  updatedBy,
}) => {
  const isReassigned =
    previousTask.assignedTo !== task.assignedTo?.toString();

  const isCompleted =
    previousTask.status !== "completed" &&
    task.status === "completed";

  if (
    changes.length > 0 &&
    !isReassigned &&
    !isCompleted &&
    task.assignedTo
  ) {
    await notifyTaskUpdated({
      organizationId: task.organization,
      recipientId: task.assignedTo.toString(),
      taskId: task._id,
      title: task.title,
      changes,
      updatedBy: `${updatedBy.firstName} ${updatedBy.lastName}`,
    });
  }

  if (isReassigned) {
    await notifyTaskReassigned({
      organizationId: task.organization,
      recipientId: newAssignedUser?._id?.toString(),
      taskId: task._id,
      title: task.title,
      previousAssignee: previousAssignedUser
        ? `${previousAssignedUser.firstName} ${previousAssignedUser.lastName}`
        : null,
      newAssignee: newAssignedUser
        ? `${newAssignedUser.firstName} ${newAssignedUser.lastName}`
        : null,
      reassignedBy: `${updatedBy.firstName} ${updatedBy.lastName}`,
    });
  }

  if (isCompleted && task.assignedTo) {
    await notifyTaskCompleted({
      organizationId: task.organization,
      recipientId: task.assignedTo.toString(),
      taskId: task._id,
      title: task.title,
      completedBy: `${updatedBy.firstName} ${updatedBy.lastName}`,
    });
  }
};

export const notifyDailySummary = async (organizationId) => {
  try {
    const summary = await getDailySummary(organizationId);

    const blocks = buildDailySummaryMessage({
      date: summary.date,
      ...summary,
    });

    await sendSlackNotification(
      organizationId,
      "dailySummary",
      "Daily Work Summary",
      blocks,
    );
  } catch (err) {
    console.error("Daily Summary Notification Error:", err.message);
  }
};

export const notifyWeeklySummary = async (organizationId) => {
  const summary = await getWeeklySummary(organizationId);

  const blocks = buildWeeklySummaryMessage({
    startDate: summary.startDate,
    endDate: summary.endDate,
    ...summary,
  });

  await sendSlackNotification(
    organizationId,
    "weeklySummary",
    "Weekly Work Summary",
    blocks,
  );
};

export const createNotification = async ({
  recipientId,
  organizationId,
  type,
  title,
  message,
  entityType = null,
  entityId = null,
  metadata = {},
}) => {
  try {
    const notification = await notificationRepository.create({
      recipient: recipientId,
      organization: organizationId,
      type,
      title,
      message,
      entityType,
      entityId,
      metadata,
    });

    const io = getIO();

    if (io) {
      io.to(`user:${recipientId}`).emit("notification:new", notification);
    }

    return notification;
  } catch (error) {
    console.error("CREATE NOTIFICATION ERROR:", error);

    return null;
  }
};
