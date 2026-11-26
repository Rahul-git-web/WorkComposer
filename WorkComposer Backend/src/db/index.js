import path from "path";
import dotenv from "dotenv";

dotenv.config();

/**
 * Phase 5 — Database Provider Controller
 *
 * Governs active database provider switch between MongoDB (default) and PostgreSQL staging.
 * Enforces strict safety validation so PostgreSQL can only connect to local workcomposer_staging.
 */

const VALID_PROVIDERS = new Set(["mongo", "postgres"]);

/**
 * Parses connection URL safely without exposing passwords or tokens.
 */
export function parseDatabaseUrlSafely(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      protocol: parsed.protocol.replace(":", ""),
      host: parsed.hostname,
      port: parsed.port || "5432",
      database: parsed.pathname ? parsed.pathname.replace(/^\//, "") : "",
      user: parsed.username || "",
      isPostgres: parsed.protocol.startsWith("postgres"),
    };
  } catch {
    return null;
  }
}

let activeProviderOverride = null;

export function setProvider(provider) {
  if (provider === null || provider === undefined) {
    activeProviderOverride = null;
    return;
  }
  const clean = String(provider).toLowerCase().trim();
  if (!VALID_PROVIDERS.has(clean)) {
    throw new Error(
      `Invalid DATABASE_PROVIDER '${provider}'. Allowed values are 'mongo' or 'postgres'. Default is 'mongo'.`
    );
  }
  if (clean === "postgres") {
    validatePostgresSafety();
  }
  activeProviderOverride = clean;
}

export function getProvider() {
  const provider = (activeProviderOverride || process.env.DATABASE_PROVIDER || "mongo").toLowerCase().trim();
  if (!VALID_PROVIDERS.has(provider)) {
    throw new Error(
      `Invalid DATABASE_PROVIDER '${provider}'. Allowed values are 'mongo' or 'postgres'. Default is 'mongo'.`
    );
  }

  // If postgres requested, enforce strict local staging validation
  if (provider === "postgres") {
    validatePostgresSafety();
  }

  return provider;
}

/**
 * Enforces that PostgreSQL mode connects ONLY to local workcomposer_staging.
 * Production hosts, non-local hosts, and non-staging databases are rejected.
 */
export function validatePostgresSafety() {
  const dbUrl = process.env.DATABASE_URL || "";
  if (!dbUrl) {
    throw new Error("PostgreSQL connection rejected: DATABASE_URL is not configured.");
  }

  const parsed = parseDatabaseUrlSafely(dbUrl);
  if (!parsed || !parsed.isPostgres) {
    throw new Error("PostgreSQL connection rejected: DATABASE_URL is not a valid postgresql:// connection string.");
  }

  const isLocalHost =
    parsed.host === "localhost" ||
    parsed.host === "127.0.0.1" ||
    parsed.host === "::1";

  if (!isLocalHost) {
    throw new Error(
      `PostgreSQL connection rejected: Non-local host '${parsed.host}' detected. Phase 5 compatibility is strictly local-only.`
    );
  }

  const allowedDbs = [
    "workcomposer_staging",
    "workcomposer_dryrun",
    "workcomposer",
    "workcomposer_test",
  ];
  if (!allowedDbs.includes(parsed.database)) {
    throw new Error(
      `PostgreSQL connection rejected: Target database is '${parsed.database}'. Allowed local targets: ${allowedDbs.join(", ")}.`
    );
  }

  const lowerUrl = dbUrl.toLowerCase();
  if (lowerUrl.includes("prod") || lowerUrl.includes("live")) {
    throw new Error(
      "PostgreSQL connection rejected: Production-like keyword detected in connection string."
    );
  }

  return true;
}

export function isMongo() {
  return getProvider() === "mongo";
}

export function isPostgres() {
  return getProvider() === "postgres";
}

export default {
  getProvider,
  setProvider,
  isMongo,
  isPostgres,
  validatePostgresSafety,
  parseDatabaseUrlSafely,
};
