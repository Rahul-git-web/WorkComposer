import crypto from "crypto";
import axios from "axios";
import Integration from "../models/integration.model.js";
import User from "../models/user.model.js";
import Project from "../models/project.model.js";
import Task from "../models/task.model.js";
import { refreshAsanaToken } from "../utils/asanaToken.js";
import { isAsanaSyncing } from "../utils/asanaSyncCache.js";
import { normalizeId } from "../security/effectiveAuthContext.js";
import {
  DesktopIntegrationOAuthError,
  createDesktopCompletionHandoff,
  createIntegrationOAuthContext,
  resolveDesktopCancelRedirect,
  verifyIntegrationCallbackState,
} from "../utils/desktopIntegrationOAuth.js";

function verifyAsanaSignature(signature, secret, payload) {
  if (!signature || !secret || typeof signature !== "string") return false;
  try {
    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    const expectedBuf = Buffer.from(expectedSig, "utf8");
    const actualBuf = Buffer.from(signature, "utf8");

    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

export const connectAsana = async (req, res) => {
  try {
    const orgId = normalizeId(
      req.user?.organizationId || req.user?.organization?._id || req.user?.organization,
    );
    const userId = normalizeId(req.user?._id || req.user?.id);

    if (!orgId) {
      return res.status(400).json({
        message: "Organization required to connect Asana",
      });
    }

    const { state } = createIntegrationOAuthContext({
      req,
      res,
      organizationId: orgId,
      userId,
      provider: "asana",
    });

    const url =
      `https://app.asana.com/-/oauth_authorize` +
      `?client_id=${process.env.ASANA_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(process.env.ASANA_REDIRECT_URI)}` +
      `&response_type=code` +
      `&state=${encodeURIComponent(state)}`;

    return res.json({ url });
  } catch (err) {
    if (err instanceof DesktopIntegrationOAuthError) {
      return res.status(err.statusCode).json({
        message: err.message,
      });
    }

    console.error("[Asana] Failed to initiate connection:", err.message || "Unknown error");

    return res.status(500).json({
      message: "Failed to connect Asana",
    });
  }
};

export const asanaCallback = async (req, res) => {
  let callbackContext = null;
  try {
    const { code, state, error } = req.query;
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    if (error) {
      const desktopCancelRedirect = resolveDesktopCancelRedirect({
        req,
        res,
        provider: "asana",
      });
      if (desktopCancelRedirect) {
        return res.redirect(desktopCancelRedirect);
      }
      return res.redirect(
        `${frontendUrl}/dashboard/settings/account/integrations/asana?status=cancelled`,
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
        provider: "asana",
      });
    } catch (err) {
      console.error("[Asana] OAuth state verification failed:", err.message);
      if (err?.desktopErrorRedirectUrl) {
        return res.redirect(err.desktopErrorRedirectUrl);
      }
      return res.redirect(
        `${frontendUrl}/dashboard/settings/account/integrations/asana?status=error&error=invalid_state`,
      );
    }

    const organizationId = callbackContext.organizationId;
    const userId = callbackContext.userId;

    const params = new URLSearchParams();

    params.append("grant_type", "authorization_code");
    params.append("client_id", process.env.ASANA_CLIENT_ID);
    params.append("client_secret", process.env.ASANA_CLIENT_SECRET);
    params.append("redirect_uri", process.env.ASANA_REDIRECT_URI);
    params.append("code", code);

    const response = await axios.post(
      "https://app.asana.com/-/oauth_token",
      params,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    const { data: asanaUser } = await axios.get(
      "https://app.asana.com/api/1.0/users/me",
      {
        headers: {
          Authorization: `Bearer ${response.data.access_token}`,
        },
      },
    );

    const expiresAt = new Date(Date.now() + response.data.expires_in * 1000);
    const workspaceName = asanaUser.data.workspaces?.[0]?.name || "";

    await Integration.findOneAndUpdate(
      {
        organization: organizationId,
        provider: "asana",
      },
      {
        connected: true,
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresAt,
        accountId: asanaUser.data.gid,
        email: asanaUser.data.email,
        workspaceId: asanaUser.data.workspaces?.[0]?.gid || "",
        workspaceName,
      },
      {
        upsert: true,
        new: true,
      },
    );

    await User.findByIdAndUpdate(userId, {
      asanaAccountId: asanaUser.data.gid,
    });

    if (callbackContext.isDesktop) {
      const { deepLinkUrl } = createDesktopCompletionHandoff({
        provider: "asana",
        status: "connected",
        organizationId,
        userId,
        desktopChallenge: callbackContext.desktopChallenge,
        workspaceName,
        message: "Asana connected successfully.",
      });
      return res.redirect(deepLinkUrl);
    }

    return res.redirect(
      `${process.env.FRONTEND_URL}/dashboard/settings/account/integrations/asana`,
    );
  } catch (error) {
    console.error("[Asana] Callback failed:", error.response?.data?.message || error.message || "Asana callback failed");

    if (callbackContext?.isDesktop) {
      const { deepLinkUrl } = createDesktopCompletionHandoff({
        provider: "asana",
        status: "error",
        error: "asana_auth_failed",
        message: "Failed to connect Asana. Please try again.",
        organizationId: callbackContext.organizationId,
        userId: callbackContext.userId,
        desktopChallenge: callbackContext.desktopChallenge,
      });
      return res.redirect(deepLinkUrl);
    }

    return res.status(500).json({
      message: "Asana callback failed",
      error: "Asana callback failed",
    });
  }
};

export const asanaWebhook = async (req, res) => {
  try {
    // 1. Handshake evaluation
    const hookSecret = req.headers["x-hook-secret"];

    if (hookSecret) {
      if (typeof hookSecret !== "string" || hookSecret.trim().length === 0) {
        return res.status(400).json({
          message: "Invalid Asana hook secret header",
        });
      }

      const integrationId =
        req.query.integrationId ||
        req.params?.integrationId ||
        req.headers["x-integration-id"];

      let integration = null;
      if (integrationId) {
        try {
          integration = await Integration.findOne({
            _id: integrationId,
            provider: "asana",
          });
        } catch {
          integration = null;
        }
      } else {
        integration = await Integration.findOne({
          provider: "asana",
          connected: true,
        });
      }

      // If integration ID was provided but not found, or no connected integration found, fail closed
      if (!integration) {
        return res.status(401).json({
          message: "Unknown or invalid integration",
        });
      }

      await Integration.findOneAndUpdate(
        { _id: integration._id || integration.id },
        { clientSecret: hookSecret },
      );

      return res.set("X-Hook-Secret", hookSecret).status(200).send();
    }

    // 2. Normal signed event delivery authentication
    const signature = req.headers["x-hook-signature"];

    if (!signature || typeof signature !== "string") {
      return res.status(401).json({
        message: "Missing Asana webhook signature",
      });
    }

    // Determine raw payload for HMAC calculation
    const rawPayload =
      typeof req.rawBody === "string"
        ? req.rawBody
        : typeof req.body === "string"
          ? req.body
          : JSON.stringify(req.body || {});

    // Resolve trusted integration via signature verification
    const queryIntegrationId =
      req.query.integrationId ||
      req.params?.integrationId ||
      req.headers["x-integration-id"];
    let authenticatedIntegration = null;

    if (queryIntegrationId) {
      let candidate = null;
      try {
        candidate = await Integration.findOne({
          _id: queryIntegrationId,
          provider: "asana",
          connected: true,
        });
      } catch {
        candidate = null;
      }

      if (candidate?.clientSecret) {
        if (verifyAsanaSignature(signature, candidate.clientSecret, rawPayload)) {
          authenticatedIntegration = candidate;
        }
      }
    } else {
      // Search all connected Asana integrations with a stored secret
      let candidates = [];
      try {
        candidates = await Integration.find({
          provider: "asana",
          connected: true,
        });
      } catch {
        candidates = [];
      }

      for (const candidate of candidates || []) {
        if (!candidate.clientSecret) continue;

        if (verifyAsanaSignature(signature, candidate.clientSecret, rawPayload)) {
          authenticatedIntegration = candidate;
          break;
        }
      }
    }

    if (!authenticatedIntegration) {
      return res.status(401).json({
        message: "Invalid Asana webhook signature",
      });
    }

    // 3. Payload validation
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({
        message: "Malformed webhook payload: body must be an object",
      });
    }

    const { events } = req.body;

    if (events !== undefined && !Array.isArray(events)) {
      return res.status(400).json({
        message: "Malformed webhook payload: events must be an array",
      });
    }

    if (!events || events.length === 0) {
      return res.sendStatus(200);
    }

    // 4. Derive tenant identity exclusively from authenticated integration
    const authenticatedOrgId = normalizeId(
      authenticatedIntegration.organization ||
      authenticatedIntegration.organizationId,
    );

    // 5. Process events within strict tenant boundary
    for (const event of events) {
      if (!event || typeof event !== "object") continue;
      if (
        event.resource?.resource_type !== "task" ||
        !["changed", "deleted"].includes(event.action)
      ) {
        continue;
      }
      const taskGid = event.resource.gid;
      if (!taskGid) continue;

      if (event.action === "deleted") {
        await Task.findOneAndDelete({
          provider: "asana",
          asanaTaskId: taskGid,
          organization: authenticatedOrgId,
        });

        continue;
      }

      // Action === "changed"
      // Resolve resource in tenant FIRST
      const task = await Task.findOne({
        provider: "asana",
        asanaTaskId: taskGid,
        organization: authenticatedOrgId,
      });

      if (!task) {
        continue;
      }

      const taskIdStr = (task._id || task.id)?.toString();
      if (taskIdStr && isAsanaSyncing(taskIdStr)) {
        return res.sendStatus(200);
      }

      if (
        authenticatedIntegration.expiresAt &&
        new Date() >= new Date(authenticatedIntegration.expiresAt)
      ) {
        await refreshAsanaToken(authenticatedIntegration);
      }

      let asanaTask;
      try {
        const { data } = await axios.get(
          `https://app.asana.com/api/1.0/tasks/${taskGid}`,
          {
            headers: {
              Authorization: `Bearer ${authenticatedIntegration.accessToken}`,
            },
          },
        );

        asanaTask = data.data;
      } catch (error) {
        console.error(
          "Failed to fetch Asana task:",
          taskGid,
          error.response?.data || error.message,
        );

        continue;
      }

      if (!asanaTask) continue;

      task.title = asanaTask.name;
      task.description = asanaTask.notes;
      task.dueDate = asanaTask.due_on ? new Date(asanaTask.due_on) : null;
      task.status = asanaTask.completed ? "completed" : "todo";

      await task.save();
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Asana webhook error:", err.message);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

export const getAsanaIntegration = async (req, res) => {
  try {
    const orgId = normalizeId(
      req.user?.organizationId || req.user?.organization?._id || req.user?.organization,
    );
    if (!orgId) {
      return res.status(400).json({
        message: "Organization required to fetch Asana integration",
      });
    }

    const integration = await Integration.findOne({
      organization: orgId,
      provider: "asana",
    });

    if (integration) {
      const sanitized =
        typeof integration.toObject === "function"
          ? integration.toObject()
          : { ...integration };
      delete sanitized.clientSecret;
      return res.json(sanitized);
    }

    return res.json(integration);
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Failed to fetch Asana integration",
    });
  }
};

export const disconnectAsana = async (req, res) => {
  try {
    const orgId = normalizeId(
      req.user?.organizationId || req.user?.organization?._id || req.user?.organization,
    );
    if (!orgId) {
      return res.status(400).json({
        message: "Organization required to disconnect Asana",
      });
    }

    await Integration.findOneAndUpdate(
      {
        organization: orgId,
        provider: "asana",
      },
      {
        connected: false,
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        accountId: null,
        email: null,
        workspaceName: null,
        clientSecret: null,
      },
    );

    return res.json({
      message: "Asana disconnected successfully",
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Failed to disconnect Asana",
    });
  }
};

export const getAsanaWorkspaces = async (req, res) => {
  try {
    const integration = await Integration.findOne({
      organization: req.user.organization._id,
      provider: "asana",
      connected: true,
    });

    if (!integration) {
      return res.status(400).json({
        message: "Asana is not connected",
      });
    }

    if (new Date() >= integration.expiresAt) {
      await refreshAsanaToken(integration);
    }

    const { data } = await axios.get(
      "https://app.asana.com/api/1.0/workspaces",
      {
        headers: {
          Authorization: `Bearer ${integration.accessToken}`,
        },
      },
    );

    return res.json(data.data);
  } catch (err) {
    console.error(err.response?.data || err.message);

    return res.status(500).json({
      message: "Failed to fetch workspaces",
    });
  }
};

export const getAsanaProjects = async (req, res) => {
  try {
    const integration = await Integration.findOne({
      organization: req.user.organization._id,
      provider: "asana",
      connected: true,
    });

    if (!integration) {
      return res.status(400).json({
        message: "Asana is not connected",
      });
    }

    if (new Date() >= integration.expiresAt) {
      await refreshAsanaToken(integration);
    }

    const { workspace } = req.params;

    const { data } = await axios.get(
      `https://app.asana.com/api/1.0/workspaces/${workspace}/projects`,
      {
        headers: {
          Authorization: `Bearer ${integration.accessToken}`,
        },
      },
    );

    return res.json(data.data);
  } catch (err) {
    console.error(err.response?.data || err.message);

    return res.status(500).json({
      message: "Failed to fetch projects",
    });
  }
};

export const importAsanaProjects = async (req, res) => {
  try {
    const integration = await Integration.findOne({
      organization: req.user.organization._id,
      provider: "asana",
      connected: true,
    });

    if (!integration) {
      return res.status(400).json({
        message: "Asana is not connected",
      });
    }

    if (new Date() >= integration.expiresAt) {
      await refreshAsanaToken(integration);
    }

    const { workspace } = req.params;

    const { data } = await axios.get("https://app.asana.com/api/1.0/projects", {
      headers: {
        Authorization: `Bearer ${integration.accessToken}`,
      },
      params: {
        workspace,
      },
    });

    const importedProjects = [];

    for (const asanaProject of data.data) {
      const exists = await Project.findOne({
        organization: req.user.organization,
        provider: "asana",
        asanaProjectId: asanaProject.gid,
      });

      if (exists) {
        continue;
      }

      const project = await Project.create({
        name: asanaProject.name,
        provider: "asana",
        asanaProjectId: asanaProject.gid,
        organization: req.user.organization,
        createdBy: req.user._id,
      });

      // Register webhook for this project
      try {
        const { data: webhook } = await axios.post(
          "https://app.asana.com/api/1.0/webhooks",
          {
            data: {
              resource: asanaProject.gid,
              target: `${process.env.BACKEND_URL}/api/integrations/asana/webhook?integrationId=${integration._id}`,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${integration.accessToken}`,
              "Content-Type": "application/json",
            },
          },
        );

        project.asanaWebhookId = webhook.data.gid;
        await project.save();
      } catch (err) {
        console.error(
          `Failed to create webhook for ${project.name}`,
          err.response?.data || err.message,
        );
      }

      importedProjects.push(project);
    }

    return res.json({
      message:
        importedProjects.length > 0
          ? `${importedProjects.length} project${importedProjects.length > 1 ? "s" : ""} imported successfully.`
          : "All Asana projects are already imported.",
      importedCount: importedProjects.length,
      projects: importedProjects,
    });
  } catch (err) {
    console.error(err.response?.data || err.message);

    return res.status(500).json({
      message: "Failed to import projects",
    });
  }
};
