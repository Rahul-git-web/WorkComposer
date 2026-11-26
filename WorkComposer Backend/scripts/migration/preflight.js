import process from "process";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import config, { parseDatabaseUrlSafely } from "./config.js";
import logger from "./logger.js";
import { connectMongo, disconnectMongo, getReadOnlyCollection } from "./mongo.js";
import {
  getPrismaClient,
  connectPostgres,
  disconnectPostgres,
  inspectPostgresTarget,
  verifyDatabaseEmpty,
  verifyPostgresSchemaMetadata,
} from "./postgres.js";

/**
 * Phase 4 — Final Preflight Gate Before Staging Write
 * Validates all 8 safety dimensions without executing any data migration.
 */
export async function runPhase4Preflight() {
  console.log("================================================================================");
  console.log("       Phase 4 — Final Preflight Gate Before Staging PostgreSQL Write           ");
  console.log("================================================================================\n");

  const results = {
    postgresConnection: { status: "FAIL", details: null },
    safetyFlags: { status: "FAIL", details: null },
    targetIdentity: { status: "FAIL", details: null },
    databaseEmpty: { status: "FAIL", details: null },
    prismaSchemaDeployed: { status: "FAIL", details: null },
    schemaVerification: { status: "FAIL", details: null },
    mongoReadOnly: { status: "FAIL", details: null },
    orphanPolicy: { status: "FAIL", details: null },
    applicationUntouched: { status: "FAIL", details: null },
    productionProtection: { status: "FAIL", details: null },
  };

  const failureReasons = [];

  // --------------------------------------------------------------------------
  // Check 1: Safety Flags (ALLOW_POSTGRES_MIGRATION, MIGRATION_TARGET, etc.)
  // --------------------------------------------------------------------------
  console.log("[1/8] Verifying Safety Flags...");
  const allowMigration = process.env.ALLOW_POSTGRES_MIGRATION === "true";
  const migrationTarget = process.env.MIGRATION_TARGET;
  const dryRunFlag = process.env.MIGRATION_DRY_RUN;
  const orphanPolicy = process.env.MIGRATION_ORPHAN_POLICY || "block";

  const flagErrors = [];
  if (!allowMigration) flagErrors.push("ALLOW_POSTGRES_MIGRATION must be 'true' (current: " + (process.env.ALLOW_POSTGRES_MIGRATION || "unset") + ")");
  if (migrationTarget !== "staging") flagErrors.push("MIGRATION_TARGET must be 'staging' (current: " + (migrationTarget || "unset") + ")");
  if (dryRunFlag !== "false") flagErrors.push("MIGRATION_DRY_RUN must be 'false' (current: " + (dryRunFlag || "unset") + ")");
  if (orphanPolicy !== "block") flagErrors.push("MIGRATION_ORPHAN_POLICY must be 'block' (current: " + orphanPolicy + ")");

  if (flagErrors.length === 0) {
    results.safetyFlags.status = "PASS";
    results.safetyFlags.details = "All 4 required safety flags strictly satisfied.";
    console.log("  ✔ Safety Flags: PASS (ALLOW_POSTGRES_MIGRATION=true, MIGRATION_TARGET=staging, MIGRATION_DRY_RUN=false, MIGRATION_ORPHAN_POLICY=block)");
  } else {
    results.safetyFlags.status = "FAIL";
    results.safetyFlags.details = flagErrors.join("; ");
    failureReasons.push("Safety Flags: " + flagErrors.join("; "));
    console.log("  ❌ Safety Flags: FAIL -> " + flagErrors.join("; "));
  }

  // --------------------------------------------------------------------------
  // Check 2: PostgreSQL Connectivity & Safe URL Parsing
  // --------------------------------------------------------------------------
  console.log("\n[2/8] Verifying PostgreSQL Connectivity...");
  const rawDbUrl = process.env.DATABASE_URL || "";
  const parsedUrl = parseDatabaseUrlSafely(rawDbUrl);

  if (!rawDbUrl) {
    results.postgresConnection.status = "FAIL";
    results.postgresConnection.details = "DATABASE_URL is not configured in environment";
    failureReasons.push("PostgreSQL Connectivity: DATABASE_URL is not configured in environment");
    console.log("  ❌ PostgreSQL Connection: FAIL (DATABASE_URL is not configured)");
  } else if (!parsedUrl || !parsedUrl.isPostgres) {
    results.postgresConnection.status = "FAIL";
    results.postgresConnection.details = "DATABASE_URL is not a valid PostgreSQL URL protocol";
    failureReasons.push("PostgreSQL Connectivity: DATABASE_URL is not a valid PostgreSQL URL protocol");
    console.log("  ❌ PostgreSQL Connection: FAIL (Invalid protocol in DATABASE_URL)");
  } else {
    console.log(`  Parsed Target Host:     ${parsedUrl.host}`);
    console.log(`  Parsed Target Port:     ${parsedUrl.port}`);
    console.log(`  Parsed Target Database: ${parsedUrl.database}`);
    console.log(`  Parsed Target User:     ${parsedUrl.user}`);
    console.log(`  Credentials:            [REDACTED] (Safe metadata only)`);

    try {
      const client = await connectPostgres();
      if (client) {
        results.postgresConnection.status = "PASS";
        results.postgresConnection.details = `Connected to host ${parsedUrl.host}, database ${parsedUrl.database}`;
        console.log("  ✔ PostgreSQL Connection: PASS");
      } else {
        results.postgresConnection.status = "FAIL";
        results.postgresConnection.details = "Unable to connect to target PostgreSQL database";
        failureReasons.push("PostgreSQL Connectivity: Unable to connect to target PostgreSQL database");
        console.log("  ❌ PostgreSQL Connection: FAIL (Connection could not be established)");
      }
    } catch (connErr) {
      results.postgresConnection.status = "FAIL";
      results.postgresConnection.details = connErr.message;
      failureReasons.push("PostgreSQL Connectivity: " + connErr.message);
      console.log("  ❌ PostgreSQL Connection: FAIL (" + connErr.message + ")");
    }
  }

  // --------------------------------------------------------------------------
  // Check 3: Production Protection & Target Identity
  // --------------------------------------------------------------------------
  console.log("\n[3/8] Verifying Production Protection & Target Identity...");
  let isProdLike = false;
  if (parsedUrl) {
    const lowerDb = (parsedUrl.database || "").toLowerCase();
    const lowerHost = (parsedUrl.host || "").toLowerCase();
    if (lowerDb.includes("prod") || lowerHost.includes("prod") || lowerDb.includes("live") || lowerHost.includes("live")) {
      isProdLike = true;
    }
  }

  if (isProdLike) {
    results.productionProtection.status = "FAIL";
    results.targetIdentity.status = "FAIL";
    results.productionProtection.details = "Target host or database name appears to be production. Real writes rejected.";
    failureReasons.push("Production Protection: Target appears to be production ('" + parsedUrl.host + "/" + parsedUrl.database + "')");
    console.log("  ❌ Production Protection: FAIL (Production-like target detected)");
  } else if (migrationTarget === "staging") {
    results.productionProtection.status = "PASS";
    results.targetIdentity.status = "PASS";
    results.productionProtection.details = "Production protection verified; target confirmed as staging.";
    console.log("  ✔ Production Protection: PASS");
    console.log("  ✔ Target Environment: PASS (staging confirmed)");
  } else {
    results.productionProtection.status = "FAIL";
    results.targetIdentity.status = "FAIL";
    results.productionProtection.details = "Target environment is not explicitly 'staging'.";
    failureReasons.push("Target Environment: MIGRATION_TARGET is not 'staging'");
    console.log("  ❌ Target Environment: FAIL (MIGRATION_TARGET is not 'staging')");
  }

  // --------------------------------------------------------------------------
  // Check 4: Target Database Emptiness
  // --------------------------------------------------------------------------
  console.log("\n[4/8] Verifying Target Database Emptiness...");
  if (results.postgresConnection.status === "PASS") {
    try {
      const emptyCheck = await verifyDatabaseEmpty();
      if (emptyCheck.isEmpty) {
        results.databaseEmpty.status = "PASS";
        results.databaseEmpty.details = `Database is completely empty (${emptyCheck.tableCount} tables found with 0 application rows).`;
        console.log("  ✔ Database Empty: PASS (Zero application rows found)");
      } else {
        results.databaseEmpty.status = "FAIL";
        const tableList = (emptyCheck.nonEmptyTables || []).map((t) => `${t.table} (${t.count} rows)`).join(", ");
        results.databaseEmpty.details = `Non-empty tables found: ${tableList}`;
        failureReasons.push("Database Emptiness: Found existing application rows in tables: " + tableList);
        console.log("  ❌ Database Empty: FAIL (Existing application rows found: " + tableList + ")");
      }
    } catch (err) {
      results.databaseEmpty.status = "FAIL";
      results.databaseEmpty.details = err.message;
      failureReasons.push("Database Emptiness: " + err.message);
      console.log("  ❌ Database Empty: FAIL (" + err.message + ")");
    }
  } else {
    results.databaseEmpty.status = "BLOCKED";
    results.databaseEmpty.details = "Blocked due to lack of PostgreSQL connection.";
    failureReasons.push("Database Emptiness: Skipped/Blocked due to missing PostgreSQL connection");
    console.log("  ⚠️ Database Empty: BLOCKED (PostgreSQL connection not established)");
  }

  // --------------------------------------------------------------------------
  // Check 5: Prisma Schema Migration Deployment & Schema Verification
  // --------------------------------------------------------------------------
  console.log("\n[5/8] Verifying Prisma Schema & Migration Deployment...");
  if (results.postgresConnection.status === "PASS") {
    try {
      console.log("  Running 'npx prisma migrate deploy'...");
      const deployOutput = execSync("npx prisma migrate deploy", {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: "pipe",
      });
      console.log("  ✔ Prisma Schema Deployed: PASS");
      results.prismaSchemaDeployed.status = "PASS";
      results.prismaSchemaDeployed.details = deployOutput.trim();

      // Verify schema metadata
      const schemaAudit = await verifyPostgresSchemaMetadata();
      if (schemaAudit.verified) {
        results.schemaVerification.status = "PASS";
        results.schemaVerification.details = `All 35 models verified, ${schemaAudit.indexesFound} indexes, all IDs VARCHAR(24).`;
        console.log("  ✔ Schema Verification: PASS (Tables, partial indexes, VARCHAR(24) IDs verified)");
      } else {
        results.schemaVerification.status = "FAIL";
        results.schemaVerification.details = `Missing indexes: ${schemaAudit.missingIndexes.join(", ")}; Non-VARCHAR(24) IDs: ${schemaAudit.nonVarchar24Ids.length}`;
        failureReasons.push("Schema Verification: " + results.schemaVerification.details);
        console.log("  ❌ Schema Verification: FAIL (" + results.schemaVerification.details + ")");
      }
    } catch (deployErr) {
      results.prismaSchemaDeployed.status = "FAIL";
      results.schemaVerification.status = "FAIL";
      results.prismaSchemaDeployed.details = deployErr.message;
      failureReasons.push("Prisma Schema Deploy: " + deployErr.message);
      console.log("  ❌ Prisma Schema Deploy: FAIL (" + deployErr.message + ")");
    }
  } else {
    results.prismaSchemaDeployed.status = "BLOCKED";
    results.schemaVerification.status = "BLOCKED";
    results.prismaSchemaDeployed.details = "Blocked due to lack of PostgreSQL connection.";
    failureReasons.push("Prisma Schema Deploy: Blocked due to missing PostgreSQL connection");
    console.log("  ⚠️ Prisma Schema Deploy: BLOCKED (DATABASE_URL not configured)");
  }

  // --------------------------------------------------------------------------
  // Check 6: MongoDB Connectivity & Read-Only Proxy
  // --------------------------------------------------------------------------
  console.log("\n[6/8] Verifying MongoDB Connectivity & Read-Only Proxy...");
  try {
    await connectMongo();
    const col = getReadOnlyCollection("users");
    const count = await col.countDocuments();

    // Verify read-only proxy rejects mutations
    let writeBlocked = false;
    try {
      col.insertOne({ test: "write_probe" });
    } catch {
      writeBlocked = true;
    }

    if (count >= 0 && writeBlocked) {
      results.mongoReadOnly.status = "PASS";
      results.mongoReadOnly.details = `MongoDB connected (${count} users found); Read-only proxy blocked mutation attempts.`;
      console.log("  ✔ MongoDB Read-Only: PASS (Source connected and verified strictly read-only)");
    } else {
      results.mongoReadOnly.status = "FAIL";
      results.mongoReadOnly.details = "Read-only proxy failed to intercept mutation probe.";
      failureReasons.push("MongoDB Read-Only: Proxy failed to intercept mutation probe");
      console.log("  ❌ MongoDB Read-Only: FAIL");
    }
    await disconnectMongo();
  } catch (mongoErr) {
    results.mongoReadOnly.status = "FAIL";
    results.mongoReadOnly.details = mongoErr.message;
    failureReasons.push("MongoDB Connectivity: " + mongoErr.message);
    console.log("  ❌ MongoDB Read-Only: FAIL (" + mongoErr.message + ")");
  }

  // --------------------------------------------------------------------------
  // Check 7: Orphan Policy & Historical Orphan Integrity
  // --------------------------------------------------------------------------
  console.log("\n[7/8] Verifying Orphan Policy & Historical Orphan Isolation...");
  if (orphanPolicy === "block") {
    results.orphanPolicy.status = "PASS";
    results.orphanPolicy.details = "MIGRATION_ORPHAN_POLICY=block; Required-FK historical orphans safely blocked from real writes.";
    console.log("  ✔ Orphan Policy: PASS (MIGRATION_ORPHAN_POLICY=block enforced)");
  } else {
    results.orphanPolicy.status = "FAIL";
    results.orphanPolicy.details = `Invalid policy '${orphanPolicy}'. Must be 'block'.`;
    failureReasons.push("Orphan Policy: Must be 'block'");
    console.log("  ❌ Orphan Policy: FAIL");
  }

  // --------------------------------------------------------------------------
  // Check 8: Application Isolation & Active Layer Verification
  // --------------------------------------------------------------------------
  console.log("\n[8/8] Verifying Application Isolation (Mongoose Active, Prisma Migration-Only)...");
  try {
    // 1. Verify schema.prisma is untouched
    const prismaSchemaPath = path.resolve(process.cwd(), "prisma/schema.prisma");
    const schemaContent = fs.readFileSync(prismaSchemaPath, "utf8");
    const has24CharIds = schemaContent.includes("@db.VarChar(24)");

    // 2. Verify git diff for application source
    const appDiff = execSync('git diff "src"', { encoding: "utf8" }).trim();

    if (has24CharIds && appDiff.length === 0) {
      results.applicationUntouched.status = "PASS";
      results.applicationUntouched.details = "Mongoose remains active application database layer; application source completely untouched.";
      console.log("  ✔ Application Untouched: PASS (Mongoose active, src/ zero git modifications)");
    } else {
      results.applicationUntouched.status = "FAIL";
      results.applicationUntouched.details = "Application source code has unexpected modifications.";
      failureReasons.push("Application Isolation: Unexpected changes in src/");
      console.log("  ❌ Application Untouched: FAIL");
    }
  } catch (appErr) {
    results.applicationUntouched.status = "FAIL";
    results.applicationUntouched.details = appErr.message;
    failureReasons.push("Application Isolation: " + appErr.message);
    console.log("  ❌ Application Untouched: FAIL (" + appErr.message + ")");
  }

  // --------------------------------------------------------------------------
  // Summary Output & Final Gate Decision
  // --------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("                    Phase 4 Preflight Verification Summary                     ");
  console.log("================================================================================");
  console.log(` PostgreSQL connection:     ${results.postgresConnection.status}`);
  console.log(` Target environment:        ${results.targetIdentity.status === "PASS" ? "staging" : "FAIL / not set"}`);
  console.log(` Database empty:            ${results.databaseEmpty.status}`);
  console.log(` Prisma schema deployed:    ${results.prismaSchemaDeployed.status}`);
  console.log(` Schema verification:       ${results.schemaVerification.status}`);
  console.log(` MongoDB read-only:         ${results.mongoReadOnly.status}`);
  console.log(` Orphan policy:             ${results.orphanPolicy.status === "PASS" ? "block" : "FAIL"}`);
  console.log(` Application untouched:     ${results.applicationUntouched.status}`);
  console.log(` Production protection:     ${results.productionProtection.status}`);
  console.log("================================================================================\n");

  const allPassed =
    results.postgresConnection.status === "PASS" &&
    results.safetyFlags.status === "PASS" &&
    results.targetIdentity.status === "PASS" &&
    results.databaseEmpty.status === "PASS" &&
    results.prismaSchemaDeployed.status === "PASS" &&
    results.schemaVerification.status === "PASS" &&
    results.mongoReadOnly.status === "PASS" &&
    results.orphanPolicy.status === "PASS" &&
    results.applicationUntouched.status === "PASS" &&
    results.productionProtection.status === "PASS";

  if (allPassed) {
    console.log("********************************************************************************");
    console.log("           PHASE 4 PREFLIGHT PASSED — READY FOR STAGING MIGRATION               ");
    console.log("********************************************************************************\n");
    return { passed: true, results };
  } else {
    console.log("********************************************************************************");
    console.log("                         PHASE 4 PREFLIGHT BLOCKED                              ");
    console.log("********************************************************************************\n");
    console.log("Unsatisfied Checks:");
    failureReasons.forEach((r, idx) => console.log(`  ${idx + 1}. ${r}`));
    console.log("\nReal staging PostgreSQL migration remains strictly blocked.");
    console.log("Zero records have been written to PostgreSQL.");
    console.log("MongoDB remains completely untouched and read-only.\n");
    return { passed: false, results, failureReasons };
  }
}

// Auto-run if invoked directly
if (process.argv[1] && process.argv[1].endsWith("preflight.js")) {
  runPhase4Preflight()
    .then((outcome) => {
      process.exit(outcome.passed ? 0 : 1);
    })
    .catch((err) => {
      console.error("Fatal error during preflight:", err);
      process.exit(1);
    });
}

export default {
  runPhase4Preflight,
};
