import axios from "axios";
import Integration from "../models/integration.model.js";
import User from "../models/user.model.js";
import { sendSlackMessage } from "../services/slack.service.js";
import { normalizeId } from "../security/effectiveAuthContext.js";
import {
  DesktopIntegrationOAuthError,
  createDesktopCompletionHandoff,
  createIntegrationOAuthContext,
  resolveDesktopCancelRedirect,
  verifyIntegrationCallbackState,
} from "../utils/desktopIntegrationOAuth.js";

export const connectSlack = async (req, res) => {
  try {
    const orgId = normalizeId(
      req.user?.organizationId || req.user?.organization?._id || req.user?.organization,
    );
    const userId = normalizeId(req.user?._id || req.user?.id);

    if (!orgId) {
      return res.status(400).json({
        message: "Organization required to connect Slack",
      });
    }

    const { state } = createIntegrationOAuthContext({
      req,
      res,
      organizationId: orgId,
      userId,
      provider: "slack",
    });

    const scopes = [
      "chat:write",
      "channels:read",
      "groups:read",
      "users:read",
      "team:read",
    ].join(",");

    const url =
      `https://slack.com/oauth/v2/authorize` +
      `?client_id=${process.env.SLACK_CLIENT_ID}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&redirect_uri=${encodeURIComponent(process.env.SLACK_REDIRECT_URI)}` +
      `&state=${encodeURIComponent(state)}`;

    return res.json({ url });
  } catch (err) {
    if (err instanceof DesktopIntegrationOAuthError) {
      return res.status(err.statusCode).json({
        message: err.message,
      });
    }

    console.error("[Slack] Failed to initiate connection:", err.message || "Unknown error");

    return res.status(500).json({
      message: "Failed to connect Slack",
    });
  }
};

export const slackCallback = async (req, res) => {
  let callbackContext = null;
  try {
    const { code, state, error } = req.query;
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    if (error) {
      const desktopCancelRedirect = resolveDesktopCancelRedirect({
        req,
        res,
        provider: "slack",
      });
      if (desktopCancelRedirect) {
        return res.redirect(desktopCancelRedirect);
      }
      return res.redirect(
        `${frontendUrl}/dashboard/settings/account/integrations/slack?status=cancelled`,
      );
    }

    if (!code || !state) {
      return res.status(400).json({
        message: "Missing code or state parameter",
      });
    }

    try {
      callbackContext = verifyIntegrationCallbackState({
        req,
        res,
        provider: "slack",
      });
    } catch (err) {
      console.error("[Slack] OAuth state verification failed:", err.message);
      if (err?.desktopErrorRedirectUrl) {
        return res.redirect(err.desktopErrorRedirectUrl);
      }
      return res.redirect(
        `${frontendUrl}/dashboard/settings/account/integrations/slack?status=error&error=invalid_state`,
      );
    }

    const organizationId = callbackContext.organizationId;
    const userId = callbackContext.userId;

    const params = new URLSearchParams();

    params.append("client_id", process.env.SLACK_CLIENT_ID);
    params.append("client_secret", process.env.SLACK_CLIENT_SECRET);
    params.append("code", code);
    params.append("redirect_uri", process.env.SLACK_REDIRECT_URI);

    const { data } = await axios.post(
      "https://slack.com/api/oauth.v2.access",
      params,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    if (!data.ok) {
      throw new Error(data.error);
    }

    const team = data.team;

    await Integration.findOneAndUpdate(
      {
        organization: organizationId,
        provider: "slack",
      },
      {
        connected: true,
        accessToken: data.access_token,
        workspaceId: team.id,
        workspaceName: team.name,
        userId: data.authed_user.id,
      },
      {
        upsert: true,
        new: true,
      },
    );

    await User.findByIdAndUpdate(userId, {
      slackUserId: data.authed_user.id,
    });

    if (callbackContext.isDesktop) {
      const { deepLinkUrl } = createDesktopCompletionHandoff({
        provider: "slack",
        status: "connected",
        organizationId,
        userId,
        desktopChallenge: callbackContext.desktopChallenge,
        workspaceName: team.name || "",
        message: "Slack connected successfully.",
      });
      return res.redirect(deepLinkUrl);
    }

    return res.redirect(
      `${process.env.FRONTEND_URL}/dashboard/settings/account/integrations/slack`,
    );
  } catch (err) {
    console.error("[Slack] Callback failed:", err.response?.data?.error || err.message || "Slack callback failed");

    if (callbackContext?.isDesktop) {
      const { deepLinkUrl } = createDesktopCompletionHandoff({
        provider: "slack",
        status: "error",
        error: "slack_auth_failed",
        message: "Failed to connect Slack. Please try again.",
        organizationId: callbackContext.organizationId,
        userId: callbackContext.userId,
        desktopChallenge: callbackContext.desktopChallenge,
      });
      return res.redirect(deepLinkUrl);
    }

    return res.status(500).json({
      message: "Slack callback failed",
      error: "Slack callback failed",
    });
  }
};

const resolveSlackOrgId = (req) =>
  normalizeId(
    req.user?.organizationId || req.user?.organization?._id || req.user?.organization,
  );

export const getSlackIntegration = async (req, res) => {
  try {
    const orgId = resolveSlackOrgId(req);
    if (!orgId) {
      return res.status(400).json({
        message: "Organization required to fetch Slack integration",
      });
    }

    const integration = await Integration.findOne({
      organization: orgId,
      provider: "slack",
    });

    return res.json(integration);
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Failed to fetch Slack integration",
    });
  }
};

export const disconnectSlack = async (req, res) => {
  try {
    const orgId = resolveSlackOrgId(req);
    if (!orgId) {
      return res.status(400).json({
        message: "Organization required to disconnect Slack",
      });
    }

    await Integration.findOneAndUpdate(
      {
        organization: orgId,
        provider: "slack",
      },
      {
        connected: false,
        accessToken: null,
        workspaceId: null,
        workspaceName: null,
        userId: null,
      },
    );

    return res.json({
      message: "Slack disconnected successfully",
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Failed to disconnect Slack",
    });
  }
};

export const getSlackChannels = async (req, res) => {
  try {
    const orgId = resolveSlackOrgId(req);
    if (!orgId) {
      return res.status(400).json({
        message: "Organization required to fetch Slack channels",
      });
    }

    const integration = await Integration.findOne({
      organization: orgId,
      provider: "slack",
      connected: true,
    });

    if (!integration) {
      return res.status(400).json({
        message: "Slack is not connected",
      });
    }

    const { data } = await axios.get(
      "https://slack.com/api/conversations.list",
      {
        headers: {
          Authorization: `Bearer ${integration.accessToken}`,
        },
        params: {
          types: "public_channel,private_channel",
          exclude_archived: true,
          limit: 1000,
        },
      },
    );

    if (!data.ok) {
      console.error("SLACK API ERROR:", data.error);
      return res.status(400).json({
        message: "Failed to fetch Slack channels",
        error: "Failed to fetch Slack channels",
      });
    }

    const channels = data.channels.map((channel) => ({
      id: channel.id,
      name: channel.name,
      isPrivate: channel.is_private,
    }));

    return res.status(200).json(channels);
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Failed to fetch Slack channels",
    });
  }
};

export const saveSlackChannel = async (req, res) => {
  try {
    const { channelId, channelName } = req.body;
    const orgId = resolveSlackOrgId(req);
    if (!orgId) {
      return res.status(400).json({
        message: "Organization required to save Slack channel",
      });
    }

    const integration = await Integration.findOne({
      organization: orgId,
      provider: "slack",
      connected: true,
    });

    if (!integration) {
      return res.status(400).json({
        message: "Slack is not connected",
      });
    }

    integration.slackChannelId = channelId;
    integration.slackChannelName = channelName;

    await integration.save();

    return res.status(200).json({
      message: "Slack channel saved successfully.",
      integration,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Failed to save Slack channel.",
    });
  }
};

export const sendTestSlackMessage = async (req, res) => {
  try {
    const orgId = resolveSlackOrgId(req);
    if (!orgId) {
      return res.status(400).json({
        message: "Organization required to send test message",
      });
    }

    const integration = await Integration.findOne({
      organization: orgId,
      provider: "slack",
      connected: true,
    });

    if (!integration) {
      return res.status(400).json({
        message: "Slack is not connected.",
      });
    }

    if (!integration.slackChannelId) {
      return res.status(400).json({
        message: "Please select a Slack notification channel first.",
      });
    }

    await sendSlackMessage(
      orgId,
      integration.slackChannelId,
      "WorkComposer Slack integration is working successfully!",
    );

    return res.status(200).json({
      message: "Test message sent successfully.",
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Failed to send test message.",
    });
  }
};

export const updateSlackNotifications = async (req, res) => {
  try {
    const orgId = resolveSlackOrgId(req);
    if (!orgId) {
      return res.status(400).json({
        message: "Organization required to update Slack notifications",
      });
    }

    const integration = await Integration.findOne({
      organization: orgId,
      provider: "slack",
    });

    if (!integration) {
      return res.status(404).json({
        message: "Slack integration not found",
      });
    }

    integration.notifications = {
      ...integration.notifications,
      ...req.body,
    };

    await integration.save();

    res.json({
      success: true,
      notifications: integration.notifications,
    });
  } catch (err) {
    console.error("UPDATE SLACK NOTIFICATIONS ERROR:", err);

    res.status(500).json({
      message: "Failed to update Slack notifications",
      error: "Failed to update Slack notifications",
    });
  }
};

export const handleSlackInteraction = async (req, res) => {
  try {
    const payload = JSON.parse(req.body.payload);

    const action = payload.actions?.[0];

    if (!action) {
      return res.sendStatus(200);
    }

    if (action.action_id === "open_task") {
      const taskId = action.value;

      return res.json({
        response_action: "open_link",
        url: `${process.env.FRONTEND_URL}/dashboard/task-management?task=${taskId}`,
      });
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
};
