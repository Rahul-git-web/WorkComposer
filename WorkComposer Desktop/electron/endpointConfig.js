"use strict";

const { URL } = require("url");

const DEFAULT_DEV_API_URL = "http://localhost:5000/api";
const DEFAULT_DEV_WEB_APP_URL = "http://localhost:3000";

const DEFAULT_PROD_API_URL = "https://api.workcomposer.com/api";
const DEFAULT_PROD_WEB_APP_URL = "https://app.workcomposer.com";

class EndpointConfigurationError extends Error {
  constructor(message, code = "CONFIG_ERROR") {
    super(message);
    this.name = "EndpointConfigurationError";
    this.code = code;
  }
}

/**
 * Validates and normalizes an HTTP/HTTPS URL.
 * Rejects non-HTTP schemes (e.g. javascript:, file:, data:).
 * Enforces HTTPS in production mode or when requireHttps is true.
 */
function validateUrl(rawUrl, options = {}) {
  const {
    requireHttps = false,
    allowLocalhost = false,
    context = "endpoint",
  } = options;

  if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) {
    throw new EndpointConfigurationError(
      `Invalid ${context}: URL string is required`,
      "INVALID_URL_EMPTY"
    );
  }

  const trimmed = rawUrl.trim();
  let parsed;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new EndpointConfigurationError(
      `Invalid ${context}: malformed URL "${trimmed}"`,
      "MALFORMED_URL"
    );
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    throw new EndpointConfigurationError(
      `Invalid ${context}: unsupported scheme "${protocol}". Only http: and https: are permitted`,
      "UNSUPPORTED_SCHEME"
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1";

  if (requireHttps) {
    if (isLocal && !allowLocalhost) {
      throw new EndpointConfigurationError(
        `Invalid ${context}: localhost is forbidden in production configuration ("${trimmed}")`,
        "LOCALHOST_FORBIDDEN"
      );
    }

    if (protocol !== "https:" && (!isLocal || !allowLocalhost)) {
      throw new EndpointConfigurationError(
        `Invalid ${context}: production endpoints must use https: scheme ("${trimmed}")`,
        "HTTPS_REQUIRED"
      );
    }
  }

  // Strip trailing slash for consistency so string concatenations (e.g. `${webAppUrl}/desktop`) remain clean
  let normalized = parsed.toString();
  if (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Resolves API and Web App endpoints based on runtime environment.
 * Development explicitly permits localhost with fallbacks.
 * Packaged production enforces valid HTTPS endpoints and rejects localhost.
 */
function resolveEndpoints(options = {}) {
  const {
    isPackaged = false,
    env = process.env,
    config = {},
  } = options;

  const isProduction =
    isPackaged ||
    env.NODE_ENV === "production" ||
    config.forceProduction === true;

  if (!isProduction) {
    // Development mode resolution
    const rawApi =
      env.WORKCOMPOSER_API_URL ||
      env.NEXT_PUBLIC_API_URL ||
      config.apiUrl ||
      DEFAULT_DEV_API_URL;

    const rawWebApp =
      env.WORKCOMPOSER_WEB_APP_URL ||
      env.WORKCOMPOSER_APP_URL ||
      env.NEXT_PUBLIC_APP_URL ||
      env.WEB_APP_URL ||
      config.webAppUrl ||
      DEFAULT_DEV_WEB_APP_URL;

    const apiUrl = validateUrl(rawApi, {
      requireHttps: false,
      allowLocalhost: true,
      context: "Development API_BASE_URL",
    });

    const webAppUrl = validateUrl(rawWebApp, {
      requireHttps: false,
      allowLocalhost: true,
      context: "Development WEB_APP_URL",
    });

    const parsedApi = new URL(apiUrl);
    return {
      apiUrl,
      webAppUrl,
      apiHost: parsedApi.hostname,
      apiPort: parsedApi.port ? parseInt(parsedApi.port, 10) : (parsedApi.protocol === "https:" ? 443 : 80),
      isProduction: false,
    };
  }

  // Packaged Production mode resolution
  const rawApi =
    env.WORKCOMPOSER_API_URL ||
    env.NEXT_PUBLIC_API_URL ||
    config.apiUrl ||
    (config.allowDefaultProdUrls !== false ? DEFAULT_PROD_API_URL : null);

  const rawWebApp =
    env.WORKCOMPOSER_WEB_APP_URL ||
    env.WORKCOMPOSER_APP_URL ||
    env.NEXT_PUBLIC_APP_URL ||
    env.WEB_APP_URL ||
    config.webAppUrl ||
    (config.allowDefaultProdUrls !== false ? DEFAULT_PROD_WEB_APP_URL : null);

  if (!rawApi) {
    throw new EndpointConfigurationError(
      "Missing production API endpoint configuration (WORKCOMPOSER_API_URL or NEXT_PUBLIC_API_URL required in production)",
      "MISSING_PRODUCTION_API"
    );
  }

  if (!rawWebApp) {
    throw new EndpointConfigurationError(
      "Missing production Web App endpoint configuration (WORKCOMPOSER_WEB_APP_URL required in production)",
      "MISSING_PRODUCTION_WEB_APP"
    );
  }

  const apiUrl = validateUrl(rawApi, {
    requireHttps: true,
    allowLocalhost: false,
    context: "Production API_BASE_URL",
  });

  const webAppUrl = validateUrl(rawWebApp, {
    requireHttps: true,
    allowLocalhost: false,
    context: "Production WEB_APP_URL",
  });

  const parsedApi = new URL(apiUrl);
  return {
    apiUrl,
    webAppUrl,
    apiHost: parsedApi.hostname,
    apiPort: parsedApi.port ? parseInt(parsedApi.port, 10) : 443,
    isProduction: true,
  };
}

/**
 * Validates and sanitizes a custom protocol deep link (workcomposer://auth?...).
 */
function validateDeepLink(deepLinkUrl) {
  if (!deepLinkUrl || typeof deepLinkUrl !== "string") {
    return { valid: false, reason: "EMPTY_URL" };
  }

  let parsed;
  try {
    parsed = new URL(deepLinkUrl);
  } catch {
    return { valid: false, reason: "MALFORMED_URL" };
  }

  if (parsed.protocol.toLowerCase() !== "workcomposer:") {
    return { valid: false, reason: "INVALID_PROTOCOL" };
  }

  const host = parsed.hostname.toLowerCase();

  if (host === "auth") {
    const accessToken = parsed.searchParams.get("accessToken");
    const refreshToken = parsed.searchParams.get("refreshToken");

    if (!accessToken || !refreshToken) {
      return { valid: false, reason: "MISSING_TOKENS" };
    }

    return {
      valid: true,
      type: "auth",
      accessToken,
      refreshToken,
    };
  }

  if (host === "login") {
    const requiresTwoFactor = parsed.searchParams.get("requiresTwoFactor") === "true";
    const email = parsed.searchParams.get("email") || "";
    const error = parsed.searchParams.get("error") || "";

    if (!requiresTwoFactor && !error) {
      return { valid: false, reason: "INVALID_LOGIN_DEEP_LINK" };
    }

    return {
      valid: true,
      type: "login",
      requiresTwoFactor,
      email,
      error,
    };
  }

  if (host === "signup") {
    const token = parsed.searchParams.get("token");
    const provider = parsed.searchParams.get("google") === "true"
      ? "google"
      : parsed.searchParams.get("microsoft") === "true"
        ? "microsoft"
        : parsed.searchParams.get("apple") === "true"
          ? "apple"
          : "";

    if (!token || !provider) {
      return { valid: false, reason: "MISSING_SIGNUP_PARAMS" };
    }

    return {
      valid: true,
      type: "signup",
      provider,
      token,
    };
  }

  return { valid: false, reason: "NON_AUTH_HOST" };
}

const SUPPORTED_INTEGRATION_PROVIDERS = new Set(["jira", "asana", "slack"]);
const ALLOWED_INTEGRATION_AUTHORIZE_HOSTS = {
  jira: new Set(["auth.atlassian.com"]),
  asana: new Set(["app.asana.com"]),
  slack: new Set(["slack.com"]),
};
const DESKTOP_CHALLENGE_REGEX = /^[A-Za-z0-9_-]{32,128}$/;
const DESKTOP_CODE_REGEX = /^[A-Za-z0-9_-]{16,256}$/;
const FORBIDDEN_DEEP_LINK_SECRET_PARAMS = [
  "accessToken",
  "refreshToken",
  "clientSecret",
  "client_secret",
  "token",
];

/**
 * Validates that a backend-returned third-party OAuth authorize URL targets an expected HTTPS provider host.
 */
function validateIntegrationAuthorizeUrl(authorizeUrl, provider) {
  if (!SUPPORTED_INTEGRATION_PROVIDERS.has(provider)) {
    return { valid: false, reason: "UNSUPPORTED_PROVIDER" };
  }
  if (!authorizeUrl || typeof authorizeUrl !== "string") {
    return { valid: false, reason: "EMPTY_URL" };
  }

  let parsed;
  try {
    parsed = new URL(authorizeUrl);
  } catch {
    return { valid: false, reason: "MALFORMED_URL" };
  }

  if (parsed.protocol.toLowerCase() !== "https:") {
    return { valid: false, reason: "HTTPS_REQUIRED" };
  }
  if (parsed.username || parsed.password) {
    return { valid: false, reason: "CREDENTIALS_IN_URL_FORBIDDEN" };
  }

  const allowedHosts = ALLOWED_INTEGRATION_AUTHORIZE_HOSTS[provider];
  if (!allowedHosts || !allowedHosts.has(parsed.hostname.toLowerCase())) {
    return { valid: false, reason: "UNTRUSTED_AUTHORIZE_HOST" };
  }

  return { valid: true, url: parsed.toString() };
}

/**
 * Validates a workcomposer://integrations/callback?... desktop OAuth return link.
 */
function validateIntegrationCallbackDeepLink(deepLinkUrl) {
  if (!deepLinkUrl || typeof deepLinkUrl !== "string") {
    return { valid: false, reason: "EMPTY_URL" };
  }

  let parsed;
  try {
    parsed = new URL(deepLinkUrl);
  } catch {
    return { valid: false, reason: "MALFORMED_URL" };
  }

  if (parsed.protocol.toLowerCase() !== "workcomposer:") {
    return { valid: false, reason: "INVALID_PROTOCOL" };
  }

  const normalizedPath = (parsed.pathname || "").replace(/\/+$/, "");
  if (parsed.hostname.toLowerCase() !== "integrations" || normalizedPath !== "/callback") {
    return { valid: false, reason: "INVALID_INTEGRATION_CALLBACK_TARGET" };
  }

  for (const forbidden of FORBIDDEN_DEEP_LINK_SECRET_PARAMS) {
    if (parsed.searchParams.has(forbidden)) {
      return { valid: false, reason: "FORBIDDEN_SECRET_PARAM" };
    }
  }

  const provider = String(parsed.searchParams.get("provider") || "").toLowerCase();
  if (!SUPPORTED_INTEGRATION_PROVIDERS.has(provider)) {
    return { valid: false, reason: "UNSUPPORTED_PROVIDER" };
  }

  const status = String(parsed.searchParams.get("status") || "").toLowerCase();
  if (!["connected", "cancelled", "error"].includes(status)) {
    return { valid: false, reason: "INVALID_STATUS" };
  }

  const challenge = parsed.searchParams.get("challenge") || "";
  if (!DESKTOP_CHALLENGE_REGEX.test(challenge)) {
    return { valid: false, reason: "INVALID_CHALLENGE" };
  }

  const code = parsed.searchParams.get("code") || "";
  if (!DESKTOP_CODE_REGEX.test(code)) {
    return { valid: false, reason: "INVALID_COMPLETION_CODE" };
  }

  return {
    valid: true,
    type: "integration-oauth",
    provider,
    status,
    challenge,
    code,
    error: parsed.searchParams.get("error") || null,
  };
}

function isIntegrationCallbackDeepLink(deepLinkUrl) {
  if (!deepLinkUrl || typeof deepLinkUrl !== "string") return false;
  try {
    const parsed = new URL(deepLinkUrl);
    return (
      parsed.protocol.toLowerCase() === "workcomposer:" &&
      parsed.hostname.toLowerCase() === "integrations"
    );
  } catch {
    return false;
  }
}

module.exports = {
  DEFAULT_DEV_API_URL,
  DEFAULT_DEV_WEB_APP_URL,
  DEFAULT_PROD_API_URL,
  DEFAULT_PROD_WEB_APP_URL,
  SUPPORTED_INTEGRATION_PROVIDERS,
  EndpointConfigurationError,
  validateUrl,
  resolveEndpoints,
  validateDeepLink,
  validateIntegrationAuthorizeUrl,
  validateIntegrationCallbackDeepLink,
  isIntegrationCallbackDeepLink,
};
