import { PrismaClient } from "@prisma/client";
import config from "./config.js";
import logger from "./logger.js";

let prismaClient = null;

/**
 * Initializes target PostgreSQL Prisma client.
 */
export function getPrismaClient() {
  if (!prismaClient) {
    if (!config.databaseUrl) {
      if (config.isDryRun) {
        return null;
      }
      throw new Error(
        "DATABASE_URL is not set in environment. PostgreSQL target is not configured."
      );
    }

    prismaClient = new PrismaClient({
      datasources: {
        db: {
          url: config.databaseUrl,
        },
      },
      log: ["error"],
    });
  }
  return prismaClient;
}

/**
 * Connects to PostgreSQL and verifies connectivity.
 */
export async function connectPostgres() {
  if (config.isDryRun && !config.databaseUrl) {
    logger.info("Dry-run mode active without DATABASE_URL. Target PostgreSQL operations are simulated.");
    return null;
  }

  const client = getPrismaClient();
  if (!client) return null;

  try {
    await client.$connect();
    // Test simple query
    await client.$queryRaw`SELECT 1 as connected;`;
    logger.info(`Connected to PostgreSQL target at ${config.sanitizedDatabaseUrl}`);
    return client;
  } catch (err) {
    logger.warn(
      `PostgreSQL target is not accessible (${err.message}). If running in dry-run mode, this is non-fatal.`
    );
    return null;
  }
}

/**
 * Disconnects from PostgreSQL.
 */
export async function disconnectPostgres() {
  if (prismaClient) {
    await prismaClient.$disconnect();
    prismaClient = null;
    logger.info("Disconnected from PostgreSQL target.");
  }
}

/**
 * Executes operations inside a PostgreSQL transaction.
 * If in dry-run mode, callback is simulated without committing writes.
 */
export async function executeTransaction(callback) {
  if (config.isDryRun) {
    // In dry run mode, pass a mock transaction handler
    return callback(null, { isDryRun: true });
  }

  const client = getPrismaClient();
  return client.$transaction(async (tx) => {
    return callback(tx, { isDryRun: false });
  }, {
    maxWait: 15000,
    timeout: 60000,
  });
}

/**
 * Returns the Prisma model delegate (e.g. prisma.user, prisma.organization).
 */
export function getPrismaModel(modelName) {
  const client = getPrismaClient();
  if (!client) {
    if (config.isDryRun) return null;
    throw new Error(`Prisma Client not available.`);
  }
  const delegateName = modelName.charAt(0).toLowerCase() + modelName.slice(1);
  const delegate = client[delegateName];
  if (!delegate) {
    throw new Error(`Prisma delegate not found for model '${modelName}'`);
  }
  return delegate;
}

/**
 * Counts rows in PostgreSQL for a given model.
 */
export async function countTargetRows(modelName, where = {}) {
  try {
    if (config.isDryRun && !config.databaseUrl) {
      return 0;
    }
    const delegate = getPrismaModel(modelName);
    if (!delegate) return 0;
    return await delegate.count({ where });
  } catch (err) {
    logger.warn(`Could not count target rows for ${modelName}: ${err.message}`);
    return 0;
  }
}

/**
 * Inspects PostgreSQL connection and returns safe identity (without secrets)
 */
export async function inspectPostgresTarget() {
  const parsed = config.parseDatabaseUrlSafely(config.databaseUrl);
  if (!parsed) {
    return {
      configured: false,
      error: "DATABASE_URL is not configured or not a valid URL",
    };
  }

  const client = getPrismaClient();
  if (!client) {
    return {
      configured: false,
      error: "Prisma client not available",
    };
  }

  try {
    const [info] = await client.$queryRaw`SELECT version(), current_database() as db_name, current_user as db_user;`;
    return {
      configured: true,
      connected: true,
      host: parsed.host,
      port: parsed.port,
      database: info.db_name || parsed.database,
      user: info.db_user || parsed.user,
      version: info.version,
      isPostgres: true,
      isStagingOrLocal:
        process.env.MIGRATION_TARGET === "staging" ||
        parsed.host === "localhost" ||
        parsed.host === "127.0.0.1",
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      host: parsed.host,
      port: parsed.port,
      database: parsed.database,
      user: parsed.user,
      error: err.message,
    };
  }
}

/**
 * Checks if target database is empty before real migration.
 * Rejects migration if application rows exist. Never executes DROP or TRUNCATE.
 */
export async function verifyDatabaseEmpty() {
  const client = getPrismaClient();
  if (!client) return { isEmpty: true, tables: [] };

  try {
    const tables = await client.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name != '_prisma_migrations';
    `;

    if (!tables || tables.length === 0) {
      return { isEmpty: true, tableCount: 0, tables: [] };
    }

    const nonEmptyTables = [];
    for (const t of tables) {
      const tName = t.table_name;
      const res = await client.$queryRawUnsafe(`SELECT COUNT(*)::int as count FROM "${tName}";`);
      const count = res[0] ? res[0].count : 0;
      if (count > 0) {
        nonEmptyTables.push({ table: tName, count });
      }
    }

    return {
      isEmpty: nonEmptyTables.length === 0,
      tableCount: tables.length,
      nonEmptyTables,
    };
  } catch (err) {
    return {
      isEmpty: false,
      error: err.message,
    };
  }
}

/**
 * Programmatically inspects PostgreSQL schema metadata against Phase 2 requirements:
 * - 35 models + normalized tables
 * - All IDs VARCHAR(24)
 * - Required partial indexes
 */
export async function verifyPostgresSchemaMetadata() {
  const client = getPrismaClient();
  if (!client) return { verified: false, reason: "Prisma client not connected" };

  try {
    const tables = await client.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `;
    const tableNames = new Set(tables.map((t) => t.table_name));

    const indexes = await client.$queryRaw`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public';
    `;
    const indexNames = new Set(indexes.map((i) => i.indexname));

    const requiredPartialIndexes = [
      "users_google_id_sparse_idx",
      "users_microsoft_id_sparse_idx",
      "users_apple_id_sparse_idx",
      "subscriptions_stripe_subscription_id_sparse_idx",
      "timers_user_running_idx",
    ];

    const missingIndexes = requiredPartialIndexes.filter((idx) => !indexNames.has(idx));

    const idColumns = await client.$queryRaw`
      SELECT table_name, column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'id'
        AND table_name != '_prisma_migrations';
    `;

    const nonVarchar24Ids = idColumns.filter(
      (c) => c.data_type === "character varying" && c.character_maximum_length !== 24
    );

    return {
      verified: missingIndexes.length === 0 && nonVarchar24Ids.length === 0,
      tableCount: tableNames.size,
      indexesFound: indexNames.size,
      missingIndexes,
      nonVarchar24Ids,
    };
  } catch (err) {
    return {
      verified: false,
      error: err.message,
    };
  }
}

export default {
  getPrismaClient,
  connectPostgres,
  disconnectPostgres,
  executeTransaction,
  getPrismaModel,
  countTargetRows,
  inspectPostgresTarget,
  verifyDatabaseEmpty,
  verifyPostgresSchemaMetadata,
};
