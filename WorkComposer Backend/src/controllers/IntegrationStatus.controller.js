import { integrationRepository } from "../db/repositories/integration.repository.js";
import { normalizeId } from "../security/effectiveAuthContext.js";

const OAUTH_PROVIDERS = new Set(["jira", "asana", "slack"]);
const API_KEY_PROVIDERS = new Set(["bamboohr", "keka"]);

function hasNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Evaluates whether a persisted integration record represents an active,
 * locally valid connection without issuing external provider API calls.
 */
export function isIntegrationRecordConnected(item, provider, nowMs = Date.now()) {
  if (!item || typeof item !== "object") {
    return false;
  }

  if (item.connected !== true) {
    return false;
  }

  if (
    item.revokedAt ||
    item.isRevoked === true ||
    item.status === "revoked" ||
    item.status === "disconnected" ||
    item.status === "expired"
  ) {
    return false;
  }

  if (OAUTH_PROVIDERS.has(provider)) {
    if (!hasNonEmptyString(item.accessToken)) {
      return false;
    }

    // Expired OAuth access tokens without a refresh token are locally unusable.
    if (item.expiresAt !== null && item.expiresAt !== undefined) {
      const expiresAtMs = new Date(item.expiresAt).getTime();
      if (!Number.isNaN(expiresAtMs) && expiresAtMs <= nowMs) {
        if (!hasNonEmptyString(item.refreshToken)) {
          return false;
        }
      }
    }

    return true;
  }

  if (API_KEY_PROVIDERS.has(provider)) {
    return hasNonEmptyString(item.apiKey) && hasNonEmptyString(item.subdomain);
  }

  return hasNonEmptyString(item.accessToken) || hasNonEmptyString(item.apiKey);
}

export const getAllIntegrationStatuses = async (req, res) => {
  try {
    const orgId = normalizeId(
      req.user?.organizationId ||
      req.user?.organization?._id ||
      req.user?.organization
    );

    if (!orgId) {
      return res.status(400).json({ message: "Organization required" });
    }

    // Query authoritative organization integration records (PostgreSQL/Prisma via IntegrationRepository)
    const integrations = await integrationRepository.find(
      {
        organization: orgId,
      },
      { sort: { updatedAt: -1 } }
    );

    const statusMap = {
      jira: false,
      asana: false,
      slack: false,
      keka: false,
      bamboohr: false,
      storage: false,
    };

    const nowMs = Date.now();
    const seenProviders = new Set();

    for (const item of Array.isArray(integrations) ? integrations : []) {
      const provider =
        typeof item?.provider === "string"
          ? item.provider.trim().toLowerCase()
          : "";

      if (!provider || !(provider in statusMap) || seenProviders.has(provider)) {
        continue;
      }

      seenProviders.add(provider);
      statusMap[provider] = isIntegrationRecordConnected(item, provider, nowMs);
    }

    if (typeof res.setHeader === "function") {
      res.setHeader("Cache-Control", "no-store");
    }

    return res.json(statusMap);
  } catch (err) {
    console.error("[Integration Status Summary Error]:", err);
    return res.status(500).json({ message: "Failed to fetch integration statuses" });
  }
};