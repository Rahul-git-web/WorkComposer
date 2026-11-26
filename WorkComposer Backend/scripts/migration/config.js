import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Ensure environment variables are loaded from the backend root .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnvPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: rootEnvPath });

/**
 * Migration Safety & Configuration Controller
 */
const rawMongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || "";
const rawDatabaseUrl = process.env.DATABASE_URL || "";

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

/**
 * Phase 4 Safety Gate Validator
 * Requires all four explicit environment variables for real PostgreSQL writes:
 * 1. ALLOW_POSTGRES_MIGRATION=true
 * 2. MIGRATION_TARGET=staging
 * 3. MIGRATION_DRY_RUN=false
 * 4. MIGRATION_ORPHAN_POLICY=block
 */
export function verifyPhase4SafetyGates() {
  const allowMigration = process.env.ALLOW_POSTGRES_MIGRATION === "true";
  const migrationTarget = process.env.MIGRATION_TARGET;
  const dryRunFlag = process.env.MIGRATION_DRY_RUN;
  const orphanPolicy = process.env.MIGRATION_ORPHAN_POLICY || "block";
  const dbUrl = process.env.DATABASE_URL || "";

  const errors = [];
  const parsedUrl = parseDatabaseUrlSafely(dbUrl);

  if (!allowMigration) {
    errors.push("ALLOW_POSTGRES_MIGRATION must be explicitly set to 'true'");
  }
  if (migrationTarget !== "staging" && migrationTarget !== "production") {
    errors.push(`MIGRATION_TARGET must be explicitly set to 'staging' or 'production' (current: '${migrationTarget || "not set"}')`);
  }
  if (dryRunFlag !== "false") {
    errors.push(`MIGRATION_DRY_RUN must be explicitly set to 'false' (current: '${dryRunFlag || "not set"}')`);
  }
  if (orphanPolicy !== "block") {
    errors.push(`MIGRATION_ORPHAN_POLICY must be set to 'block' (current: '${orphanPolicy}')`);
  }
  if (!dbUrl) {
    errors.push("DATABASE_URL is not set in environment");
  } else if (!parsedUrl || !parsedUrl.isPostgres) {
    errors.push("DATABASE_URL is not a valid PostgreSQL connection string");
  } else if (migrationTarget === "staging") {
    const lowerDb = parsedUrl.database.toLowerCase();
    const lowerHost = parsedUrl.host.toLowerCase();
    if (lowerDb.includes("prod") || lowerHost.includes("prod") || lowerDb.includes("live") || lowerHost.includes("live")) {
      errors.push(`Production-like target detected ('${parsedUrl.host}/${parsedUrl.database}'). Production PostgreSQL is strictly forbidden when MIGRATION_TARGET=staging.`);
    }
  }

  return {
    isSatisfied: errors.length === 0,
    errors,
    parsedUrl,
  };
}

const safetyGates = verifyPhase4SafetyGates();
const isDryRun = !safetyGates.isSatisfied;

// Batch size validation (default 5000, supports 1000, 5000, 10000, etc.)
const parsedBatchSize = parseInt(process.env.MIGRATION_BATCH_SIZE, 10);
const batchSize =
  !isNaN(parsedBatchSize) && parsedBatchSize > 0 ? parsedBatchSize : 5000;

// Strict mode: aborts batch on unresolved required FK
const isStrict = process.env.MIGRATION_STRICT === "true";

// Random sample size for deep validation comparison
const parsedSampleSize = parseInt(process.env.MIGRATION_SAMPLE_SIZE, 10);
const sampleSize =
  !isNaN(parsedSampleSize) && parsedSampleSize > 0 ? parsedSampleSize : 100;

// Checkpoint file path
const checkpointFile =
  process.env.MIGRATION_CHECKPOINT_FILE ||
  path.resolve(__dirname, "checkpoint.json");

// Orphan Policy: default is 'block' (refuse real writes on records with missing required parents)
const orphanPolicy = process.env.MIGRATION_ORPHAN_POLICY || "block";

/**
 * Masks sensitive connection strings (removes passwords and auth tokens)
 */
export function sanitizeConnectionUrl(url) {
  if (!url) return "NOT_CONFIGURED";
  try {
    return url.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@");
  } catch {
    return "***";
  }
}

/**
 * Approved 8-Tier Migration Dependency Graph
 */
export const MIGRATION_TIERS = [
  {
    tier: 1,
    name: "Root",
    models: ["Organization"],
  },
  {
    tier: 2,
    name: "RBAC & Groups",
    models: ["Role", "Team"],
  },
  {
    tier: 3,
    name: "Identity & Normalized Devices/Tokens",
    models: ["User", "UserDevice", "UserRefreshToken"],
  },
  {
    tier: 4,
    name: "Tenant Settings, Billing & Integrations",
    models: [
      "TimeTrackingSettings",
      "BillingProfile",
      "Subscription",
      "PaymentMethod",
      "Invoice",
      "ApiKey",
      "Integration",
      "AppClassification",
    ],
  },
  {
    tier: 5,
    name: "Work Management & Project Users",
    models: ["Project", "ProjectUser", "Task", "Comment"],
  },
  {
    tier: 6,
    name: "Tracking & Attendance",
    models: [
      "Session",
      "Attendance",
      "Timer",
      "ProjectTracking",
      "ManualTimeRequest",
    ],
  },
  {
    tier: 7,
    name: "High-Volume Telemetry",
    models: ["Screenshot", "Activity", "AppUsage", "UsageLog", "Location"],
  },
  {
    tier: 8,
    name: "Logs & System Records",
    models: [
      "Notification",
      "AuditLog",
      "ApiLog",
      "Report",
      "Invite",
      "SyncStatus",
      "EmailChange",
    ],
  },
];

/**
 * Returns tier index (1 to 8) for a given model
 */
export function getModelTier(modelName) {
  for (const tierObj of MIGRATION_TIERS) {
    if (tierObj.models.includes(modelName)) {
      return tierObj.tier;
    }
  }
  return 999;
}

/**
 * Mapping between Prisma Model Name and MongoDB Collection Name
 */
export const MODEL_TO_COLLECTION_MAP = {
  Organization: "organizations",
  Role: "roles",
  Team: "teams",
  User: "users",
  UserDevice: "users", // Normalized from User.devices
  UserRefreshToken: "users", // Normalized from User.refreshTokens
  TimeTrackingSettings: "timetrackingsettings",
  BillingProfile: "billingprofiles",
  Subscription: "subscriptions",
  PaymentMethod: "paymentmethods",
  Invoice: "invoices",
  ApiKey: "apikeys",
  Integration: "integrations",
  AppClassification: "appclassifications",
  Project: "projects",
  ProjectUser: "projects", // Normalized from Project.users
  Task: "tasks",
  Comment: "comments",
  Session: "sessions",
  Attendance: "attendances",
  Timer: "timers",
  ProjectTracking: "projecttrackings",
  ManualTimeRequest: "manualtimerequests",
  Screenshot: "screenshots",
  Activity: "activities",
  AppUsage: "appusages",
  UsageLog: "usagelogs",
  Location: "locations",
  Notification: "notifications",
  AuditLog: "auditlogs",
  ApiLog: "apilogs",
  Report: "reports",
  Invite: "invites",
  SyncStatus: "syncstatuses",
  EmailChange: "emailchanges",
};

export const config = {
  mongoUri: rawMongoUri,
  sanitizedMongoUri: sanitizeConnectionUrl(rawMongoUri),
  databaseUrl: rawDatabaseUrl,
  sanitizedDatabaseUrl: sanitizeConnectionUrl(rawDatabaseUrl),
  safetyGates,
  allowPostgresMigration: safetyGates.isSatisfied,
  isDryRun,
  batchSize,
  isStrict,
  sampleSize,
  checkpointFile,
  orphanPolicy,
  tiers: MIGRATION_TIERS,
  modelMap: MODEL_TO_COLLECTION_MAP,
  verifyPhase4SafetyGates,
  parseDatabaseUrlSafely,
};

export default config;
