#!/usr/bin/env node
import process from "process";
import fs from "fs";
import path from "path";
import config, { MIGRATION_TIERS } from "./config.js";
import logger from "./logger.js";
import checkpoint from "./checkpoint.js";
import { connectMongo, disconnectMongo, getReadOnlyCollection, countSourceDocuments } from "./mongo.js";
import { connectPostgres, disconnectPostgres, verifyDatabaseEmpty, inspectPostgresTarget } from "./postgres.js";
import { extractBatches } from "./extract.js";
import {
  loadBatch,
  populateMigratedIdRegistryFromDb,
  resolveDeferredForwardReferences,
} from "./load.js";
import { transformers } from "./normalize.js";
import { runFullValidation } from "./validate.js";
import { generateReports } from "./report.js";
import { runPhase4Reconciliation } from "./reconcile.js";

/**
 * CLI Argument Parser
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    all: false,
    model: null,
    tier: null,
    dryRun: config.isDryRun,
    validateOnly: false,
    resetCheckpoint: false,
    strict: config.isStrict,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--all") options.all = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--validate") options.validateOnly = true;
    else if (arg === "--reset-checkpoint") options.resetCheckpoint = true;
    else if (arg === "--strict") options.strict = true;
    else if (arg === "--model" && args[i + 1]) {
      options.model = args[++i];
    } else if (arg === "--tier" && args[i + 1]) {
      options.tier = parseInt(args[++i], 10);
    } else if (arg === "--batch-size" && args[i + 1]) {
      config.batchSize = parseInt(args[++i], 10);
    } else if (arg === "--sample-size" && args[i + 1]) {
      config.sampleSize = parseInt(args[++i], 10);
    }
  }

  // If dryRun specified via CLI, override config
  if (options.dryRun) {
    config.isDryRun = true;
  }
  if (options.strict) {
    config.isStrict = true;
  }

  return options;
}

/**
 * Displays Migration Startup Banner
 */
function printBanner() {
  console.log("================================================================================");
  console.log("             WorkComposer MongoDB → PostgreSQL ETL Migration Tool              ");
  console.log("================================================================================");
  console.log(` Mode:               ${config.isDryRun ? "🔍 DRY-RUN / READ-ONLY (No DB writes)" : "🚀 LIVE WRITE"}`);
  console.log(` Batch Size:         ${config.batchSize}`);
  console.log(` Strict Mode:        ${config.isStrict ? "Enabled (Halt on orphan FK)" : "Disabled (Log & Nullify FK)"}`);
  console.log(` Source MongoDB:     ${config.sanitizedMongoUri}`);
  console.log(` Target PostgreSQL:  ${config.sanitizedDatabaseUrl}`);
  console.log("================================================================================\n");
}

export async function getExpectedTargetCount(modelName) {
  const collectionName = config.modelMap[modelName];
  if (!collectionName) return 0;
  try {
    if (modelName === "UserDevice") {
      const col = getReadOnlyCollection("users");
      const pipeline = [{ $unwind: "$devices" }, { $count: "total" }];
      const res = await col.aggregate(pipeline).toArray();
      return res[0] ? res[0].total : 0;
    } else if (modelName === "UserRefreshToken") {
      const col = getReadOnlyCollection("users");
      const pipeline = [{ $unwind: "$refreshTokens" }, { $count: "total" }];
      const res = await col.aggregate(pipeline).toArray();
      return res[0] ? res[0].total : 0;
    } else if (modelName === "ProjectUser") {
      const col = getReadOnlyCollection("projects");
      const projects = await col.find({ "users.0": { $exists: true } }).toArray();
      let total = 0;
      for (const p of projects) {
        if (Array.isArray(p.users)) {
          const seen = new Set();
          for (const u of p.users) {
            const row = transformers.ProjectUser(p, u);
            if (row && !seen.has(row.userId)) {
              seen.add(row.userId);
              total++;
            }
          }
        }
      }
      return total;
    }
    return await countSourceDocuments(collectionName);
  } catch {
    return 0;
  }
}

/**
 * Migrates a single model in cursor-extracted batches
 */
async function migrateModel(modelName) {
  logger.info(`Starting migration for model: ${modelName}`);
  const modelCheckpoint = checkpoint.startModel(modelName);
  const expectedTargetCount = await getExpectedTargetCount(modelName);

  if (modelCheckpoint.status === "completed") {
    logger.info(`Model ${modelName} is already marked completed in checkpoint. Skipping.`);
    return {
      model: modelName,
      sourceCount: modelCheckpoint.recordsProcessed || expectedTargetCount,
      expectedTargetCount,
      processedCount: modelCheckpoint.recordsProcessed || expectedTargetCount,
      insertedCount: modelCheckpoint.recordsInserted || 0,
      existingIdenticalCount: 0,
      idConflictCount: 0,
      normalizedCount: modelCheckpoint.recordsNormalized || 0,
      referenceValidCount: 0,
      referenceEmptyNullableCount: 0,
      referenceParentNotYetMigratedCount: 0,
      referenceParentExistsInMongoCount: 0,
      referenceParentMissingInMongoCount: modelCheckpoint.orphanCount || 0,
      referenceInvalidFormatCount: 0,
      orphanCount: modelCheckpoint.orphanCount || 0,
      errorCount: (modelCheckpoint.errors || []).length,
      isDryRun: config.isDryRun,
    };
  }

  let batchNum = 0;
  let totalSource = 0;
  let totalProcessed = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalMigrationSafe = 0;
  let totalBlocked = 0;
  let totalExistingIdentical = 0;
  let totalIdConflicts = 0;
  let totalNormalized = 0;
  let totalRefValid = 0;
  let totalRefEmptyNullable = 0;
  let totalRefParentNotYetMigrated = 0;
  let totalRefParentExistsInMongo = 0;
  let totalRefParentMissingInMongo = 0;
  let totalRefInvalidFormat = 0;
  let totalOrphans = 0;
  let totalErrors = 0;

  const resumeId = modelCheckpoint.lastProcessedId;

  try {
    for await (const batch of extractBatches(modelName, resumeId, config.batchSize)) {
      batchNum++;
      const startTime = Date.now();

      const loadResult = await loadBatch(modelName, batch.rows);
      const durationMs = Date.now() - startTime;

      totalSource += batch.sourceCount;
      totalProcessed += batch.rows.length;
      totalInserted += loadResult.inserted;
      totalSkipped += loadResult.skipped;
      totalMigrationSafe += loadResult.migrationSafeCount || 0;
      totalBlocked += loadResult.blockedCount || 0;
      totalExistingIdentical += loadResult.existingIdentical || 0;
      totalIdConflicts += loadResult.idConflicts || 0;
      totalNormalized += loadResult.referenceEmptyNullable || 0;
      totalRefValid += loadResult.referenceValid || 0;
      totalRefEmptyNullable += loadResult.referenceEmptyNullable || 0;
      totalRefParentNotYetMigrated += loadResult.referenceParentNotYetMigrated || 0;
      totalRefParentExistsInMongo += loadResult.referenceParentExistsInMongo || 0;
      totalRefParentMissingInMongo += loadResult.referenceParentMissingInMongo || 0;
      totalRefInvalidFormat += loadResult.referenceInvalidFormat || 0;
      totalOrphans += loadResult.orphans || 0;

      // Update checkpoint after every batch
      checkpoint.updateModelCheckpoint(modelName, {
        lastProcessedId: batch.lastProcessedId,
        processed: batch.sourceCount,
        inserted: loadResult.inserted,
        skipped: loadResult.skipped,
        orphans: loadResult.orphans,
      });

      logger.batch(modelName, batchNum, {
        source: batch.sourceCount,
        inserted: loadResult.inserted,
        normalized: loadResult.referenceEmptyNullable || 0,
        orphans: loadResult.orphans,
        durationMs,
        isDryRun: config.isDryRun,
      });
    }

    checkpoint.markModelCompleted(modelName, {
      processed: totalSource,
      inserted: totalInserted,
    });

    logger.info(`Completed migration for model ${modelName}: ${totalInserted} records inserted/verified.`);

    let statusText = "MIGRATED";
    if (totalBlocked > 0) {
      statusText = "BLOCKED_REQUIRED_FK";
    } else if (config.isDryRun) {
      statusText = "DRY_RUN_SAFE";
    }

    return {
      model: modelName,
      sourceCount: totalSource,
      expectedTargetCount,
      processedCount: totalProcessed,
      insertedCount: totalInserted,
      migrationSafeCount: totalMigrationSafe,
      blockedCount: totalBlocked,
      existingIdenticalCount: totalExistingIdentical,
      idConflictCount: totalIdConflicts,
      normalizedCount: totalNormalized,
      referenceValidCount: totalRefValid,
      referenceEmptyNullableCount: totalRefEmptyNullable,
      referenceParentNotYetMigratedCount: totalRefParentNotYetMigrated,
      referenceParentExistsInMongoCount: totalRefParentExistsInMongo,
      referenceParentMissingInMongoCount: totalRefParentMissingInMongo,
      referenceInvalidFormatCount: totalRefInvalidFormat,
      orphanCount: totalOrphans,
      errorCount: totalErrors,
      isDryRun: config.isDryRun,
      status: statusText,
    };
  } catch (err) {
    checkpoint.markModelFailed(modelName, err);
    logger.error(`Migration failed for model ${modelName}`, err);
    throw err;
  }
}

/**
 * Main Migration Orchestrator
 */
async function main() {
  const options = parseArgs();
  printBanner();

  if (options.resetCheckpoint) {
    checkpoint.reset();
  }

  const startTime = new Date();
  const modelStats = {};
  const errors = [];

  // Setup graceful shutdown handling
  let isShuttingDown = false;
  const handleSignal = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.warn(`Received ${signal}. Saving checkpoint and shutting down gracefully...`);
    checkpoint.save();
    await disconnectMongo();
    await disconnectPostgres();
    process.exit(130);
  };
  process.on("SIGINT", () => handleSignal("SIGINT"));
  process.on("SIGTERM", () => handleSignal("SIGTERM"));

  try {
    // 1. Establish connections
    await connectMongo();
    await connectPostgres();

    // Safety verification before live writes
    if (!config.isDryRun) {
      const safety = config.verifyPhase4SafetyGates();
      if (!safety.isSatisfied) {
        logger.error("================================================================================");
        logger.error("                 PHASE 4 SAFETY GATE FAILURE — REAL WRITES ABORTED              ");
        logger.error("================================================================================");
        for (const err of safety.errors) {
          logger.error(`  ❌ ${err}`);
        }
        logger.error("================================================================================");
        throw new Error(`ABORT: Phase 4 safety gate failure. Refusing PostgreSQL writes: ${safety.errors.join("; ")}`);
      }

      const emptyCheck = await verifyDatabaseEmpty();
      if (!emptyCheck.isEmpty) {
        logger.info(
          `Target PostgreSQL database contains ${emptyCheck.nonEmptyTables.length} tables with existing records. Proceeding with idempotent migration.`
        );
      }
    }

    // 2. If validate-only requested
    if (options.validateOnly) {
      const validation = await runFullValidation();
      const reportJsonPath = path.join(process.cwd(), "scripts", "migration", "migration-report.json");
      let preservedModelStats = modelStats;
      if (fs.existsSync(reportJsonPath)) {
        try {
          const prevReport = JSON.parse(fs.readFileSync(reportJsonPath, "utf8"));
          if (prevReport && prevReport.modelStats && Object.keys(prevReport.modelStats).length > 0) {
            preservedModelStats = prevReport.modelStats;
          }
        } catch {}
      }
      generateReports({
        startTime,
        endTime: new Date(),
        modelStats: preservedModelStats,
        validation,
        errors,
      });
      await runPhase4Reconciliation({ startTime });
      logger.info(`Validation completed with status: ${validation.status}`);
      return;
    }

    // 3. Determine models to migrate
    let modelsToMigrate = [];

    if (options.model) {
      if (!config.modelMap[options.model]) {
        throw new Error(`Unknown model: '${options.model}'. Available models: ${Object.keys(config.modelMap).join(", ")}`);
      }
      modelsToMigrate = [options.model];
    } else if (options.tier) {
      const targetTier = MIGRATION_TIERS.find((t) => t.tier === options.tier);
      if (!targetTier) {
        throw new Error(`Invalid tier: '${options.tier}'. Available tiers: 1 to 8.`);
      }
      modelsToMigrate = targetTier.models;
    } else if (options.all) {
      for (const tier of MIGRATION_TIERS) {
        modelsToMigrate.push(...tier.models);
      }
    } else {
      logger.warn("No execution target specified. Run with '--all', '--tier <N>', '--model <Name>', or '--validate'.");
      logger.info("Defaulting to dry-run validation check across collections.");
      options.validateOnly = true;
      const validation = await runFullValidation();
      generateReports({
        startTime,
        endTime: new Date(),
        modelStats,
        validation,
        errors,
      });
      return;
    }

    logger.info(`Planned models to process (${modelsToMigrate.length}): ${modelsToMigrate.join(", ")}`);

    // 4. Pre-populate known migrated IDs from PostgreSQL to guarantee FK resolution
    await populateMigratedIdRegistryFromDb();

    // 5. Process models in order
    for (const modelName of modelsToMigrate) {
      try {
        const stats = await migrateModel(modelName);
        modelStats[modelName] = stats;
      } catch (err) {
        errors.push({ model: modelName, message: err.message });
        if (config.isStrict) {
          logger.error(`Stopping migration due to failure in strict mode on model ${modelName}`);
          break;
        }
      }
    }

    // 6. Resolve deferred forward foreign key references (e.g. Team.createdById -> User)
    await resolveDeferredForwardReferences();

    // 7. Run validation suite
    const validation = await runFullValidation();

    // 6. Generate final reports
    const endTime = new Date();
    generateReports({
      startTime,
      endTime,
      modelStats,
      validation,
      errors,
    });

    // 7. Generate Phase 4 Reconciliation & Orphan Ledger
    await runPhase4Reconciliation({ startTime });

    logger.info("================================================================================");
    logger.info("                    ETL Migration Run Completed Successfully                    ");
    logger.info("================================================================================");
  } catch (fatalErr) {
    logger.error("Fatal error during ETL migration", fatalErr);
    errors.push({ model: "System", message: fatalErr.message });
    generateReports({
      startTime,
      endTime: new Date(),
      modelStats,
      errors,
    });
    process.exit(1);
  } finally {
    await disconnectMongo();
    await disconnectPostgres();
  }
}

// Auto-run if executed from CLI
if (process.argv[1] && process.argv[1].endsWith("migrate.js")) {
  main().catch((err) => {
    console.error("Unhandled error in migrate.js:", err);
    process.exit(1);
  });
}

export default {
  main,
  migrateModel,
};
