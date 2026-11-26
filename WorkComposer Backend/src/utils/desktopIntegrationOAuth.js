import crypto from "crypto";
import { normalizeId } from "../security/effectiveAuthContext.js";
import {
  generateOAuthState,
  getOAuthCookieName,
  getOAuthCookieOptions,
  resolveCallerUserFromRequest,
  verifyOAuthState,
} from "./oauthState.js";

export const SUPPORTED_OAUTH_INTEGRATION_PROVIDERS = new Set([
  "jira",
  "asana",
  "slack",
]);

const DESKTOP_CHALLENGE_REGEX = /^[A-Za-z0-9_-]{32,128}$/;
const DESKTOP_PENDING_TTL_MS = 10 * 60 * 1000;
const DESKTOP_COMPLETION_TTL_MS = 2 * 60 * 1000;
const MAX_STORE_ENTRIES = 10000;

/**
 * In-memory stores for desktop integration OAuth handshakes and single-use completion codes.
 * Entries are keyed by SHA-256 digests so raw secrets never serve as map keys.
 */
const pendingDesktopStates = new Map();
const desktopCompletionHandoffs = new Map();

export class DesktopIntegrationOAuthError extends Error {
  constructor(message, statusCode = 400, code = "DESKTOP_OAUTH_ERROR") {
    super(message);
    this.name = "DesktopIntegrationOAuthError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function sha256Base64Url(value) {
  return crypto.createHash("sha256").update(String(value)).digest("base64url");
}

function timingSafeEqualString(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function pruneExpiredMapEntries(store, now = Date.now()) {
  for (const [key, entry] of store.entries()) {
    if (!entry || entry.expiresAt <= now) {
      store.delete(key);
    }
  }
  while (store.size >= MAX_STORE_ENTRIES) {
    const oldestKey = store.keys().next().value;
    if (!oldestKey) break;
    store.delete(oldestKey);
  }
}

export function isDesktopIntegrationClient(req) {
  return req?.query?.client === "desktop";
}

export function shouldReturnIntegrationJson(req) {
  return isDesktopIntegrationClient(req) || req?.query?.mode === "json";
}

export function validateDesktopChallenge(challenge) {
  if (typeof challenge !== "string" || !DESKTOP_CHALLENGE_REGEX.test(challenge.trim())) {
    throw new DesktopIntegrationOAuthError(
      "Invalid or missing desktop OAuth challenge",
      400,
      "INVALID_DESKTOP_CHALLENGE",
    );
  }
  return challenge.trim();
}

/**
 * Creates a cryptographically bound OAuth state for either web cookies or desktop PoP challenge.
 */
export function createIntegrationOAuthContext({
  req,
  res,
  organizationId,
  userId,
  provider,
  usePkce = false,
}) {
  if (!SUPPORTED_OAUTH_INTEGRATION_PROVIDERS.has(provider)) {
    throw new DesktopIntegrationOAuthError("Unsupported OAuth integration provider", 400);
  }

  const isDesktop = isDesktopIntegrationClient(req);
  const desktopChallenge = isDesktop
    ? validateDesktopChallenge(req?.query?.desktopChallenge)
    : null;

  const state = generateOAuthState({
    organizationId,
    userId,
    provider,
  });

  if (isDesktop) {
    const now = Date.now();
    pruneExpiredMapEntries(pendingDesktopStates, now);

    let codeVerifier = null;
    let codeChallenge = null;
    if (usePkce) {
      codeVerifier = crypto.randomBytes(32).toString("base64url");
      codeChallenge = sha256Base64Url(codeVerifier);
    }

    const stateHash = sha256Base64Url(state.stateToken || String(state));
    pendingDesktopStates.set(stateHash, {
      provider,
      organizationId: String(organizationId),
      userId: userId ? String(userId) : "",
      sessionBinding: state.sessionBinding,
      desktopChallenge,
      codeVerifier,
      expiresAt: now + DESKTOP_PENDING_TTL_MS,
    });

    return {
      isDesktop: true,
      state,
      desktopChallenge,
      codeChallenge,
      codeChallengeMethod: usePkce ? "S256" : null,
    };
  }

  const cookieName = getOAuthCookieName(provider);
  if (typeof res?.cookie === "function") {
    res.cookie(cookieName, state.sessionBinding, getOAuthCookieOptions());
  }

  return {
    isDesktop: false,
    state,
    desktopChallenge: null,
    codeChallenge: null,
    codeChallengeMethod: null,
  };
}

export function buildDesktopIntegrationDeepLink({
  provider,
  status,
  challenge,
  code,
  error = null,
}) {
  const params = new URLSearchParams({
    provider: String(provider),
    status: String(status),
    challenge: String(challenge),
    code: String(code),
  });
  if (error) {
    params.set("error", String(error));
  }
  return `workcomposer://integrations/callback?${params.toString()}`;
}

export function createDesktopCompletionHandoff({
  provider,
  status,
  error = null,
  message = null,
  organizationId,
  userId,
  desktopChallenge,
  workspaceName = "",
}) {
  if (!SUPPORTED_OAUTH_INTEGRATION_PROVIDERS.has(provider)) {
    throw new DesktopIntegrationOAuthError("Unsupported OAuth integration provider", 400);
  }
  if (!["connected", "cancelled", "error"].includes(status)) {
    throw new DesktopIntegrationOAuthError("Invalid desktop OAuth callback status", 400);
  }

  const now = Date.now();
  pruneExpiredMapEntries(desktopCompletionHandoffs, now);

  const completionCode = crypto.randomBytes(32).toString("base64url");
  const codeHash = sha256Base64Url(completionCode);

  desktopCompletionHandoffs.set(codeHash, {
    provider,
    status,
    error: error || null,
    message: message || null,
    organizationId: String(organizationId),
    userId: userId ? String(userId) : "",
    desktopChallenge,
    workspaceName: workspaceName || "",
    expiresAt: now + DESKTOP_COMPLETION_TTL_MS,
  });

  return {
    completionCode,
    deepLinkUrl: buildDesktopIntegrationDeepLink({
      provider,
      status,
      challenge: desktopChallenge,
      code: completionCode,
      error,
    }),
  };
}

/**
 * Verifies provider callback state for desktop flows (without browser cookies) or web flows (strict cookie binding).
 */
export function verifyIntegrationCallbackState({ req, res, provider }) {
  const state = req?.query?.state;
  const cookieName = getOAuthCookieName(provider);
  const cookieBinding = req?.cookies?.[cookieName];

  if (typeof res?.clearCookie === "function" && req?.cookies?.[cookieName]) {
    res.clearCookie(cookieName, { path: "/" });
  }

  if (typeof state === "string" && state.length > 0) {
    const stateHash = sha256Base64Url(state);
    const desktopEntry = pendingDesktopStates.get(stateHash);

    if (desktopEntry) {
      pendingDesktopStates.delete(stateHash);

      if (desktopEntry.expiresAt <= Date.now()) {
        if (desktopEntry.provider === provider) {
          const { deepLinkUrl } = createDesktopCompletionHandoff({
            provider,
            status: "error",
            error: "invalid_state",
            message: "Authorization session expired. Please try again.",
            organizationId: desktopEntry.organizationId,
            userId: desktopEntry.userId,
            desktopChallenge: desktopEntry.desktopChallenge,
          });
          const err = new DesktopIntegrationOAuthError(
            "Desktop OAuth state expired",
            400,
            "DESKTOP_STATE_EXPIRED",
          );
          err.desktopErrorRedirectUrl = deepLinkUrl;
          throw err;
        }
        throw new Error("OAuth state provider mismatch");
      }

      const oauthContext = verifyOAuthState(state, {
        expectedProvider: provider,
        expectedOrgId: desktopEntry.organizationId,
        sessionBinding: desktopEntry.sessionBinding,
        requireSessionBinding: true,
        callerUser: desktopEntry.userId
          ? { _id: desktopEntry.userId, organization: desktopEntry.organizationId }
          : null,
      });

      return {
        isDesktop: true,
        oauthContext,
        organizationId: oauthContext.organizationId,
        userId: oauthContext.userId,
        codeVerifier: desktopEntry.codeVerifier || null,
        desktopChallenge: desktopEntry.desktopChallenge,
      };
    }
  }

  const callerUser = resolveCallerUserFromRequest(req);
  const oauthContext = verifyOAuthState(state, {
    expectedProvider: provider,
    sessionBinding: cookieBinding,
    requireSessionBinding: Boolean(req?.cookies && typeof req.cookies === "object"),
    callerUser,
  });

  return {
    isDesktop: false,
    oauthContext,
    organizationId: oauthContext.organizationId,
    userId: oauthContext.userId,
    codeVerifier: null,
    desktopChallenge: null,
  };
}

/**
 * Resolves user-cancelled provider redirects (`?error=access_denied&state=...`) for desktop vs web.
 */
export function resolveDesktopCancelRedirect({ req, res, provider }) {
  const state = req?.query?.state;
  const cookieName = getOAuthCookieName(provider);
  if (typeof res?.clearCookie === "function" && req?.cookies?.[cookieName]) {
    res.clearCookie(cookieName, { path: "/" });
  }

  if (typeof state !== "string" || !state) {
    return null;
  }

  const stateHash = sha256Base64Url(state);
  const desktopEntry = pendingDesktopStates.get(stateHash);
  if (!desktopEntry) {
    return null;
  }

  pendingDesktopStates.delete(stateHash);

  try {
    verifyOAuthState(state, {
      expectedProvider: provider,
      expectedOrgId: desktopEntry.organizationId,
      sessionBinding: desktopEntry.sessionBinding,
      requireSessionBinding: true,
      callerUser: desktopEntry.userId
        ? { _id: desktopEntry.userId, organization: desktopEntry.organizationId }
        : null,
    });
  } catch {
    return null;
  }

  const { deepLinkUrl } = createDesktopCompletionHandoff({
    provider,
    status: "cancelled",
    message: `${provider.charAt(0).toUpperCase() + provider.slice(1)} connection was cancelled.`,
    organizationId: desktopEntry.organizationId,
    userId: desktopEntry.userId,
    desktopChallenge: desktopEntry.desktopChallenge,
  });

  return deepLinkUrl;
}

/**
 * Authenticated desktop completion endpoint verifying Proof-of-Possession (`desktopVerifier`) and caller identity.
 */
export const completeDesktopIntegrationOAuth = async (req, res) => {
  try {
    const provider = String(req.params?.provider || req.body?.provider || "")
      .trim()
      .toLowerCase();

    if (!SUPPORTED_OAUTH_INTEGRATION_PROVIDERS.has(provider)) {
      return res.status(400).json({
        message: "Unsupported integration provider",
      });
    }

    const { completionCode, desktopVerifier } = req.body || {};
    if (
      typeof completionCode !== "string" ||
      !completionCode.trim() ||
      typeof desktopVerifier !== "string" ||
      !desktopVerifier.trim()
    ) {
      return res.status(400).json({
        message: "Completion code and desktop verifier are required",
      });
    }

    const codeHash = sha256Base64Url(completionCode.trim());
    const handoff = desktopCompletionHandoffs.get(codeHash);

    if (!handoff) {
      return res.status(400).json({
        message: "Invalid or already consumed OAuth completion code",
      });
    }

    // Consume atomically on lookup to guarantee single-use and prevent brute-force retries.
    desktopCompletionHandoffs.delete(codeHash);

    if (handoff.expiresAt <= Date.now()) {
      return res.status(410).json({
        message: "OAuth completion code expired",
      });
    }

    if (handoff.provider !== provider) {
      return res.status(403).json({
        message: "OAuth completion provider mismatch",
      });
    }

    const callerOrgId = normalizeId(
      req.user?.organizationId || req.user?.organization?._id || req.user?.organization,
    );
    const callerUserId = normalizeId(req.user?._id || req.user?.id);

    if (!callerOrgId || callerOrgId !== String(handoff.organizationId)) {
      return res.status(403).json({
        message: "OAuth completion organization mismatch",
      });
    }

    if (handoff.userId && callerUserId !== String(handoff.userId)) {
      return res.status(403).json({
        message: "OAuth completion user mismatch",
      });
    }

    const computedChallenge = sha256Base64Url(desktopVerifier.trim());
    if (!timingSafeEqualString(computedChallenge, handoff.desktopChallenge)) {
      return res.status(403).json({
        message: "Desktop OAuth verifier mismatch",
      });
    }

    return res.json({
      provider: handoff.provider,
      status: handoff.status,
      connected: handoff.status === "connected",
      workspaceName: handoff.workspaceName || "",
      error: handoff.error || null,
      message: handoff.message || null,
    });
  } catch (err) {
    console.error("[Desktop OAuth] Complete verification failed:", err.message);
    return res.status(500).json({
      message: "Failed to complete desktop integration OAuth",
    });
  }
};

export function clearDesktopIntegrationOAuthForTesting() {
  pendingDesktopStates.clear();
  desktopCompletionHandoffs.clear();
}

export function getDesktopOAuthCountsForTesting() {
  return {
    pendingCount: pendingDesktopStates.size,
    completionCount: desktopCompletionHandoffs.size,
  };
}

