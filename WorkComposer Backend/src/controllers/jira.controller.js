import crypto from "crypto";
import axios from "axios";
import Integration from "../models/integration.model.js";
import Project from "../models/project.model.js";
import Task from "../models/task.model.js";
import { refreshJiraToken } from "../utils/jiraToken.js";
import User from "../models/user.model.js";
import { normalizeId } from "../security/effectiveAuthContext.js";
import {
  DesktopIntegrationOAuthError,
  createDesktopCompletionHandoff,
  createIntegrationOAuthContext,
  resolveDesktopCancelRedirect,
  shouldReturnIntegrationJson,
  verifyIntegrationCallbackState,
} from "../utils/desktopIntegrationOAuth.js";

export const connectJira = async (req, res) => {
  try {
    const orgId = normalizeId(
      req.user?.organizationId || req.user?.organization?._id || req.user?.organization,
    );
    const userId = normalizeId(req.user?._id || req.user?.id);

    if (!orgId) {
      return res.status(400).json({
        message: "Organization required to connect Jira",
      });
    }

    const { state, codeChallenge, codeChallengeMethod } =
      createIntegrationOAuthContext({
        req,
        res,
        organizationId: orgId,
        userId,
        provider: "jira",
        usePkce: true,
      });

    const url =
      `https://auth.atlassian.com/authorize` +
      `?audience=api.atlassian.com` +
      `&client_id=${process.env.JIRA_CLIENT_ID}` +
      `&scope=offline_access read:jira-work write:jira-work read:jira-user` +
      `&redirect_uri=${encodeURIComponent(process.env.JIRA_REDIRECT_URI)}` +
      `&state=${encodeURIComponent(state)}` +
      `&response_type=code` +
      `&prompt=consent` +
      (codeChallenge && codeChallengeMethod
        ? `&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=${encodeURIComponent(codeChallengeMethod)}`
        : "");

    if (shouldReturnIntegrationJson(req)) {
      return res.json({ url });
    }

    return res.redirect(url);
  } catch (err) {
    if (err instanceof DesktopIntegrationOAuthError) {
      return res.status(err.statusCode).json({
        message: err.message,
      });
    }

    console.error("[Jira] Failed to initiate connection:", err.message || "Unknown error");

    res.status(500).json({
      message: "Failed to connect Jira",
    });
  }
};

export const jiraCallback = async (req, res) => {
  let callbackContext = null;
  try {
    const { code, state, error } = req.query;
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    if (error) {
      const desktopCancelRedirect = resolveDesktopCancelRedirect({
        req,
        res,
        provider: "jira",
      });
      if (desktopCancelRedirect) {
        return res.redirect(desktopCancelRedirect);
      }
      return res.redirect(
        `${frontendUrl}/dashboard/settings/account/integrations/jira?status=cancelled`,
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
        provider: "jira",
      });
    } catch (err) {
      console.error("[Jira] OAuth state verification failed:", err.message);
      if (err?.desktopErrorRedirectUrl) {
        return res.redirect(err.desktopErrorRedirectUrl);
      }
      return res.redirect(
        `${frontendUrl}/dashboard/settings/account/integrations/jira?status=error&error=invalid_state`,
      );
    }

    const organizationId = callbackContext.organizationId;
    const userId = callbackContext.userId;

    if (!organizationId) {
      return res.status(400).json({
        message: "Invalid state parameter",
      });
    }

    const tokenPayload = {
      grant_type: "authorization_code",
      client_id: process.env.JIRA_CLIENT_ID,
      client_secret: process.env.JIRA_CLIENT_SECRET,
      code,
      redirect_uri: process.env.JIRA_REDIRECT_URI,
    };
    if (callbackContext.codeVerifier) {
      tokenPayload.code_verifier = callbackContext.codeVerifier;
    }

    const { data } = await axios.post(
      "https://auth.atlassian.com/oauth/token",
      tokenPayload,
    );

    const { data: resources } = await axios.get(
      "https://api.atlassian.com/oauth/token/accessible-resources",
      {
        headers: {
          Authorization: `Bearer ${data.access_token}`,
          Accept: "application/json",
        },
      },
    );

    const { data: jiraUser } = await axios.get(
      `https://api.atlassian.com/ex/jira/${resources[0].id}/rest/api/3/myself`,
      {
        headers: {
          Authorization: `Bearer ${data.access_token}`,
          Accept: "application/json",
        },
      },
    );

    if (jiraUser?.emailAddress) {
      await User.findOneAndUpdate(
        {
          email: jiraUser.emailAddress,
        },
        {
          jiraAccountId: jiraUser.accountId,
        },
        {
          returnDocument: "after",
        },
      );
    }

    const expiresAt = new Date(Date.now() + data.expires_in * 1000);
    const workspaceName = resources[0]?.name || "";

    await Integration.findOneAndUpdate(
      {
        organization: organizationId,
        provider: "jira",
      },
      {
        connected: true,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt,
        cloudId: resources[0].id,
        siteUrl: resources[0].url,
        workspaceName,
      },
      {
        upsert: true,
        returnDocument: "after",
      },
    );

    if (callbackContext.isDesktop) {
      const { deepLinkUrl } = createDesktopCompletionHandoff({
        provider: "jira",
        status: "connected",
        organizationId,
        userId,
        desktopChallenge: callbackContext.desktopChallenge,
        workspaceName,
        message: "Jira connected successfully.",
      });
      return res.redirect(deepLinkUrl);
    }

    return res.redirect(
      `${process.env.FRONTEND_URL}/dashboard/settings/account/integrations/jira`,
    );
  } catch (err) {
    console.error(
      "[Jira] Connection failed:",
      err.response?.data?.message || err.message || "Failed to connect Jira",
    );

    if (callbackContext?.isDesktop) {
      const { deepLinkUrl } = createDesktopCompletionHandoff({
        provider: "jira",
        status: "error",
        error: "jira_auth_failed",
        message: "Failed to connect Jira. Please try again.",
        organizationId: callbackContext.organizationId,
        userId: callbackContext.userId,
        desktopChallenge: callbackContext.desktopChallenge,
      });
      return res.redirect(deepLinkUrl);
    }

    res.status(500).json({
      message: "Failed to connect Jira",
      error: "Failed to connect Jira",
    });
  }
};

export const jiraWebhook = async (req, res) => {
  try {
    // 1. Resolve shared secret from headers or query string
    const secret =
      req.headers["x-atlassian-webhook-secret"] ||
      req.headers["x-jira-secret"] ||
      req.headers["x-webhook-secret"] ||
      req.query?.secret;

    if (!secret || typeof secret !== "string") {
      return res.status(401).json({
        message: "Missing Jira webhook secret",
      });
    }

    // Redact secret from req.query to prevent downstream leakage or accidental logging
    if (req.query?.secret) {
      delete req.query.secret;
    }

    // 2. Identify integration
    const integrationId =
      req.query?.integrationId ||
      req.params?.integrationId ||
      req.headers["x-integration-id"];

    let candidateIntegration = null;

    if (integrationId) {
      try {
        candidateIntegration = await Integration.findOne({
          _id: integrationId,
          provider: "jira",
          connected: true,
        });
      } catch {
        candidateIntegration = null;
      }
    } else {
      const candidates = await Integration.find({
        provider: "jira",
        connected: true,
      });

      for (const cand of candidates || []) {
        const storedSecret = cand.clientSecret || process.env.JIRA_WEBHOOK_SECRET;
        if (storedSecret && typeof storedSecret === "string") {
          try {
            const bufStored = Buffer.from(storedSecret, "utf8");
            const bufGiven = Buffer.from(secret, "utf8");
            if (bufStored.length === bufGiven.length && crypto.timingSafeEqual(bufStored, bufGiven)) {
              candidateIntegration = cand;
              break;
            }
          } catch {
            // comparison failure
          }
        }
      }
    }

    if (!candidateIntegration) {
      return res.status(401).json({
        message: "Invalid Jira webhook authentication",
      });
    }

    // Timing-safe secret verification for direct integrationId match
    const expectedSecret = candidateIntegration.clientSecret || process.env.JIRA_WEBHOOK_SECRET;
    if (!expectedSecret || typeof expectedSecret !== "string") {
      return res.status(401).json({
        message: "Jira integration webhook secret not configured",
      });
    }

    try {
      const bufExpected = Buffer.from(expectedSecret, "utf8");
      const bufGiven = Buffer.from(secret, "utf8");
      if (bufExpected.length !== bufGiven.length || !crypto.timingSafeEqual(bufExpected, bufGiven)) {
        return res.status(401).json({
          message: "Invalid Jira webhook secret",
        });
      }
    } catch {
      return res.status(401).json({
        message: "Invalid Jira webhook secret",
      });
    }

    // 3. Derive tenant identity exclusively from authenticated integration
    const authenticatedOrgId = normalizeId(
      candidateIntegration.organization || candidateIntegration.organizationId,
    );

    // 4. Validate payload
    const body = req.body;
    if (!body || typeof body !== "object") {
      return res.status(400).json({
        message: "Malformed Jira webhook payload",
      });
    }

    const eventType = body.webhookEvent || body.event || body.eventType;
    const issue = body.issue;

    if (!issue || !issue.id) {
      return res.status(200).json({ received: true });
    }

    // 5. Enforce strict tenant boundary during issue processing
    if (eventType === "jira:issue_deleted") {
      await Task.findOneAndDelete({
        provider: "jira",
        jiraIssueId: String(issue.id),
        organization: authenticatedOrgId,
      });
      return res.status(200).json({ received: true, action: "deleted" });
    }

    if (eventType === "jira:issue_created" || eventType === "jira:issue_updated") {
      const projectKey = issue.fields?.project?.key || body.project?.key;
      let project = null;
      if (projectKey) {
        project = await Project.findOne({
          jiraProjectKey: projectKey,
          organization: authenticatedOrgId,
        });
      }

      let status = "todo";
      const statusName = (issue.fields?.status?.name || "").toLowerCase();
      if (statusName.includes("progress")) {
        status = "in-progress";
      } else if (statusName.includes("done") || statusName.includes("complete")) {
        status = "completed";
      }

      let assignedUser = null;
      if (issue.fields?.assignee?.accountId) {
        assignedUser = await User.findOne({
          jiraAccountId: issue.fields.assignee.accountId,
          organization: authenticatedOrgId,
        });
      }

      const existingTask = await Task.findOne({
        jiraIssueId: String(issue.id),
        organization: authenticatedOrgId,
      });

      const taskPayload = {
        title: issue.fields?.summary || issue.key || "Jira Issue",
        description: "",
        status,
        priority: issue.fields?.priority?.name?.toLowerCase() || "medium",
        jiraIssueId: String(issue.id),
        jiraIssueKey: issue.key,
        provider: "jira",
        organization: authenticatedOrgId,
        assignedTo: assignedUser?._id,
      };

      if (project) {
        taskPayload.project = project._id;
        taskPayload.assignedBy = project.createdBy;
      }

      if (existingTask) {
        await Task.findOneAndUpdate(
          {
            jiraIssueId: String(issue.id),
            organization: authenticatedOrgId,
          },
          { $set: taskPayload },
          { new: true },
        );
      } else if (project) {
        await Task.create(taskPayload);
      }
    }

    return res.status(200).json({
      received: true,
    });
  } catch (err) {
    console.error("JIRA WEBHOOK ERROR:", err);
    return res.status(500).json({
      message: "Internal webhook processing error",
    });
  }
};

export const disconnectJira = async (req, res) => {
  try {
    const orgId = normalizeId(
      req.user?.organizationId || req.user?.organization?._id || req.user?.organization,
    );

    await Integration.findOneAndUpdate(
      {
        organization: orgId,
        provider: "jira",
      },
      {
        connected: false,
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        cloudId: null,
        siteUrl: null,
        workspaceName: null,
        clientSecret: null,
      },
    );

    return res.json({
      message: "Jira disconnected successfully",
    });
  } catch (err) {
    console.error("[Jira] Failed to disconnect:", err);
    return res.status(500).json({
      message: "Failed to disconnect Jira",
    });
  }
};

export const getJiraProjects = async (req, res) => {
  try {
    const integration = await Integration.findOne({
      organization: req.user.organization,
      provider: "jira",
      connected: true,
    });

    if (!integration) {
      return res.status(404).json({
        message: "Jira is not connected",
      });
    }

    const { data } = await axios.get(
      `https://api.atlassian.com/ex/jira/${integration.cloudId}/rest/api/3/project`,
      {
        headers: {
          Authorization: `Bearer ${integration.accessToken}`,
          Accept: "application/json",
        },
      },
    );

    return res.json(data);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to fetch Jira projects",
    });
  }
};

export const getJiraStatus = async (req, res) => {
  try {
    const orgId = normalizeId(
      req.user?.organizationId || req.user?.organization?._id || req.user?.organization,
    );

    if (!orgId) {
      return res.status(400).json({
        message: "Organization required to get Jira status",
      });
    }

    const integration = await Integration.findOne({
      organization: orgId,
      provider: "jira",
    });

    if (!integration) {
      return res.json({
        connected: false,
      });
    }

    return res.json({
      connected: Boolean(integration.connected),
      workspaceName: integration.workspaceName || "",
      siteUrl: integration.siteUrl || "",
      cloudId: integration.cloudId || "",
      provider: integration.provider,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to get Jira status",
    });
  }
};

export const syncJiraProjects = async (req, res) => {
  try {
    const integration = await Integration.findOne({
      organization: req.user.organization,
      provider: "jira",
      connected: true,
    });

    if (!integration) {
      return res.status(404).json({
        message: "Jira is not connected",
      });
    }

    if (new Date() >= integration.expiresAt) {
      await refreshJiraToken(integration);
    }

    const accessToken = integration.accessToken;

    const { data: jiraProjects } = await axios.get(
      `https://api.atlassian.com/ex/jira/${integration.cloudId}/rest/api/3/project`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
    );

    for (const jiraProject of jiraProjects) {
      const existingProject = await Project.findOne({
        organization: req.user.organization,
        name: jiraProject.name,
      });

      if (existingProject) {
        continue;
      }

      await Project.create({
        name: jiraProject.name,

        jiraProjectId: jiraProject.id,
        jiraProjectKey: jiraProject.key,
        provider: "jira",

        organization: req.user.organization,
        createdBy: req.user._id,

        teams: [],
        users: [],
      });
    }

    return res.json({
      message: "Projects synced successfully",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Failed to sync Jira projects",
    });
  }
};

const syncProjectIssues = async (project) => {
  // Find Jira integration
  const integration = await Integration.findOne({
    organization: project.organization,
    provider: "jira",
    connected: true,
  });

  if (!integration) {
    throw new Error("Jira is not connected");
  }

  if (new Date() >= integration.expiresAt) {
    await refreshJiraToken(integration);
  }

  // Fetch Jira issues
  const { data: issues } = await axios.get(
    `https://api.atlassian.com/ex/jira/${integration.cloudId}/rest/api/3/search/jql`,
    {
      headers: {
        Authorization: `Bearer ${integration.accessToken}`,
        Accept: "application/json",
      },
      params: {
        jql: `project= "${project.jiraProjectKey}"`,
        maxResults: 100,
        fields: "summary,status,assignee,priority,issuetype",
      },
    },
  );

  for (const issue of issues.issues) {
    let status = "todo";

    if (issue.fields.status.name.toLowerCase().includes("progress")) {
      status = "in-progress";
    }

    if (
      issue.fields.status.name.toLowerCase().includes("done") ||
      issue.fields.status.name.toLowerCase().includes("complete")
    ) {
      status = "completed";
    }

    let assignedUser = null;

    if (issue.fields.assignee?.accountId) {
      assignedUser = await User.findOne({
        jiraAccountId: issue.fields.assignee.accountId,
        organization: project.organization,
      });

      if (
        assignedUser &&
        assignedUser.jiraAccountId !== issue.fields.assignee.accountId
      ) {
        const orgUsers = await User.find({ organization: project.organization });
        assignedUser =
          orgUsers.find(
            (u) => u.jiraAccountId === issue.fields.assignee.accountId
          ) || null;
      }
    }

    const existingTask = await Task.findOne({
      jiraIssueId: issue.id,
      organization: project.organization,
    });

    if (existingTask) {
      const changed =
        existingTask.title !== issue.fields.summary ||
        existingTask.status !== status ||
        existingTask.priority !==
          (issue.fields.priority?.name?.toLowerCase() || "medium") ||
        String(existingTask.assignedTo || "") !==
          String(assignedUser?._id || "");

      if (!changed) {
        continue;
      }
    }

    const taskPayload = {
      title: issue.fields.summary,
      description: "",

      status,

      priority: issue.fields.priority?.name?.toLowerCase() || "medium",

      jiraIssueId: issue.id,
      jiraIssueKey: issue.key,
      provider: "jira",

      project: project._id,
      organization: project.organization,
      assignedTo: assignedUser?._id,
      assignedBy: project.createdBy,
    };

    if (existingTask) {
      await Task.findOneAndUpdate(
        {
          jiraIssueId: issue.id,
          organization: project.organization,
        },
        taskPayload,
        {
          upsert: true,
          returnDocument: "after",
        },
      );
    } else {
      await Task.create(taskPayload);
    }
  }
};

export const syncAllJiraProjects = async () => {
  const projects = await Project.find({
    provider: "jira",
  });

  for (const project of projects) {
    await syncProjectIssues(project);
  }
};

export const syncJiraIssues = async (req, res) => {
  try {
    const { projectId } = req.params;

    const orgId = normalizeId(
      req.user?.organizationId || req.user?.organization?._id || req.user?.organization
    );

    const targetProjectId = normalizeId(projectId);
    const project = (targetProjectId && orgId)
      ? await Project.findOne({
          _id: targetProjectId,
          organization: orgId,
        })
      : null;

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    await syncProjectIssues(project);

    return res.json({
      message: "Project synced successfully",
    });
  } catch (err) {
    console.error(
      "[Jira] Failed to sync issues:",
      err.response?.data || err.message,
    );

    return res.status(500).json({
      message: "Failed to sync issues",
      error: "Failed to sync issues",
    });
  }
};
