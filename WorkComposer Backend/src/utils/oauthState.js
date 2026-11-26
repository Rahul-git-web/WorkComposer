import jwt from "jsonwebtoken";
import crypto from "crypto";
import { normalizeId } from "../security/effectiveAuthContext.js";

// In-memory store for single-use replay protection: nonce -> expiry timestamp (ms)
const consumedNonces = new Map();

export function pruneExpiredNonces() {
  const now = Date.now();
  for (const [nonce, expiresAt] of consumedNonces.entries()) {
    if (now >= expiresAt) {
      consumedNonces.delete(nonce);
    }
  }
}

export function getOAuthStateSecret() {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.JWT_SECRET;
  if (!secret || typeof secret !== "string" || !secret.trim()) {
    throw new Error("OAuth state signing secret is not configured");
  }
  return secret.trim();
}

export function getOAuthCookieName(provider) {
  if (!provider || typeof provider !== "string") {
    throw new Error("provider is required to get OAuth cookie name");
  }
  return `oauth_bind_${provider.toLowerCase().trim()}`;
}

export function getOAuthCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge: 10 * 60 * 1000,
  };
}

export function resolveCallerUserFromRequest(req) {
  if (!req) return null;
  if (req.user) {
    return req.user;
  }
  const token = req.headers?.authorization?.split(" ")[1] || req.cookies?.accessToken;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded?.userId) {
      return {
        _id: decoded.userId,
        id: decoded.userId,
        organizationId: decoded.organizationId || decoded.organization,
      };
    }
  } catch {
    return null;
  }
  return null;
}


/**
 * Generates a cryptographically signed, expiring, browser-bound OAuth state token.
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.userId
 * @param {string} params.provider e.g. "jira", "asana", "slack"
 * @param {number} [params.expiresInSeconds=600] 10 minutes default
 * @returns {{ stateToken: string, sessionBinding: string, toString: () => string }}
 */
export function generateOAuthState({ organizationId, userId, provider, expiresInSeconds = 600 }) {
  const orgId = normalizeId(organizationId);
  const uId = normalizeId(userId);

  if (!orgId) {
    throw new Error("organizationId is required to generate OAuth state");
  }
  if (!provider || typeof provider !== "string") {
    throw new Error("provider is required to generate OAuth state");
  }

  const secret = getOAuthStateSecret();
  const nonce = crypto.randomBytes(16).toString("hex");

  // Generate cryptographically random browser-session binding secret
  const sessionBinding = crypto.randomBytes(32).toString("hex");
  const bindHash = crypto.createHash("sha256").update(sessionBinding).digest("hex");

  const payload = {
    organization: orgId,
    user: uId || null,
    provider: provider.toLowerCase().trim(),
    nonce,
    bindHash,
  };

  const stateToken = jwt.sign(payload, secret, {
    algorithm: "HS256",
    expiresIn: expiresInSeconds,
  });

  return {
    stateToken,
    sessionBinding,
    toString() {
      return this.stateToken;
    },
  };
}

/**
 * Verifies, binds to browser session, and consumes a signed OAuth state token.
 *
 * @param {string|object} state
 * @param {object} [options]
 * @param {string} [options.expectedProvider] e.g. "jira"
 * @param {string} [options.expectedOrgId]
 * @param {string} [options.sessionBinding] Value of the browser httpOnly session cookie
 * @param {boolean} [options.requireSessionBinding=false]
 * @param {object} [options.callerUser] Active user session from callback request
 * @returns {{ organizationId: string, userId: string|null, provider: string }}
 */
export function verifyOAuthState(state, options = {}) {
  const rawState =
    typeof state === "object" && state !== null
      ? state.stateToken || String(state)
      : state;

  if (!rawState || typeof rawState !== "string" || !rawState.trim()) {
    throw new Error("Missing or empty OAuth state token");
  }

  const secret = getOAuthStateSecret();
  let decoded;

  try {
    decoded = jwt.verify(rawState.trim(), secret, { algorithms: ["HS256"] });
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      throw new Error("OAuth state token has expired");
    }
    throw new Error("Invalid or tampered OAuth state token");
  }

  if (!decoded || typeof decoded !== "object") {
    throw new Error("Invalid OAuth state payload");
  }

  // 1. Provider binding check
  if (options.expectedProvider) {
    const expected = options.expectedProvider.toLowerCase().trim();
    if (decoded.provider !== expected) {
      throw new Error(`OAuth state provider mismatch: expected ${expected}, got ${decoded.provider}`);
    }
  }

  const orgId = normalizeId(decoded.organization);
  if (!orgId) {
    throw new Error("OAuth state token is missing valid organization identity");
  }

  // 2. Organization initiation binding check
  if (options.expectedOrgId) {
    const expectedOrg = normalizeId(options.expectedOrgId);
    if (expectedOrg && expectedOrg !== orgId) {
      throw new Error("OAuth state token organization does not match expected organization");
    }
  }

  // 3. Cryptographic browser-session binding verification
  if (decoded.bindHash) {
    if (options.sessionBinding !== undefined) {
      if (!options.sessionBinding || typeof options.sessionBinding !== "string") {
        throw new Error("OAuth session binding mismatch or missing: callback must be completed from the initiating browser session");
      }
      const actualHash = crypto.createHash("sha256").update(options.sessionBinding.trim()).digest("hex");
      const bufExpected = Buffer.from(decoded.bindHash, "hex");
      const bufActual = Buffer.from(actualHash, "hex");
      if (bufExpected.length !== bufActual.length || !crypto.timingSafeEqual(bufExpected, bufActual)) {
        throw new Error("OAuth session binding mismatch: callback was not completed from the initiating browser session");
      }
    } else if (options.requireSessionBinding) {
      throw new Error("Missing OAuth session binding cookie: callback must be completed from the initiating browser session");
    }
  }

  // 4. Authenticated caller user and tenant binding
  if (options.callerUser) {
    const callerUserId = normalizeId(options.callerUser._id || options.callerUser.id);
    const callerOrgId = normalizeId(
      options.callerUser.organizationId ||
      options.callerUser.organization?._id ||
      options.callerUser.organization
    );

    if (decoded.user && (!callerUserId || callerUserId !== decoded.user)) {
      throw new Error("OAuth session user mismatch: initiating user does not match authenticated callback user");
    }

    if (decoded.organization && (!callerOrgId || callerOrgId !== decoded.organization)) {
      throw new Error("OAuth session organization mismatch: initiating organization does not match authenticated callback organization");
    }
  }

  // 5. Cryptographic nonce & replay check (atomic in JavaScript event loop)
  if (!decoded.nonce) {
    throw new Error("OAuth state token is missing cryptographic nonce");
  }

  pruneExpiredNonces();

  if (consumedNonces.has(decoded.nonce)) {
    throw new Error("OAuth state token has already been consumed (replay detected)");
  }

  // Mark nonce as consumed until token expiration
  const expMs = decoded.exp ? decoded.exp * 1000 : Date.now() + 600000;
  consumedNonces.set(decoded.nonce, expMs);

  return {
    organizationId: orgId,
    userId: normalizeId(decoded.user) || null,
    provider: decoded.provider,
  };
}

export function clearConsumedOAuthNoncesForTesting() {
  consumedNonces.clear();
}

export function getConsumedNoncesCountForTesting() {
  return consumedNonces.size;
}

export function isNonceConsumedForTesting(nonce) {
  return consumedNonces.has(nonce);
}

