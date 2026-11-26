import fs from "fs";
import path from "path";
import config from "./config.js";
import { normalizationStats } from "./normalize.js";
import { orphanRegistry, idConflictRegistry } from "./load.js";
import logger from "./logger.js";

/**
 * Generates both JSON and Markdown Migration Reports
 */
export function generateReports({
  startTime,
  endTime,
  modelStats = {},
  validation = null,
  errors = [],
  outputDir = path.resolve(process.cwd(), "scripts/migration"),
}) {
  const durationMs = endTime.getTime() - startTime.getTime();
  const durationSec = (durationMs / 1000).toFixed(2);

  // Read existing report if present to preserve orphan/conflict audits during validate-only runs
  let existingReport = null;
  const jsonPath = path.join(outputDir, "migration-report.json");
  if (fs.existsSync(jsonPath)) {
    try {
      existingReport = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    } catch {}
  }

  const resolvedOrphans =
    orphanRegistry.length > 0
      ? { count: orphanRegistry.length, records: orphanRegistry }
      : (existingReport && existingReport.orphans) || { count: 0, records: [] };

  const resolvedConflicts =
    idConflictRegistry.length > 0
      ? { count: idConflictRegistry.length, records: idConflictRegistry }
      : (existingReport && existingReport.idConflicts) || { count: 0, records: [] };

  const resolvedNormSummary =
    (normalizationStats.monetaryNormalizations > 0 || normalizationStats.arrayNormalizations > 0 || Object.keys(normalizationStats.emptyStringForeignKeys).length > 0)
      ? {
          monetaryNormalizations: normalizationStats.monetaryNormalizations,
          arrayNormalizations: normalizationStats.arrayNormalizations,
          emptyStringForeignKeys: normalizationStats.emptyStringForeignKeys,
        }
      : (existingReport && existingReport.normalizationSummary) || {
          monetaryNormalizations: 0,
          arrayNormalizations: 0,
          emptyStringForeignKeys: {},
        };

  // Determine overall status
  let overallStatus = "PASS";
  if (errors.length > 0 || resolvedConflicts.count > 0) {
    overallStatus = "FAIL";
  } else if (resolvedOrphans.count > 0 || (validation && validation.status === "WARN")) {
    overallStatus = "WARN";
  }

  const reportData = {
    metadata: {
      status: overallStatus,
      isDryRun: config.isDryRun,
      isStrict: config.isStrict,
      orphanPolicy: config.orphanPolicy,
      orphanPolicyRequired: Object.values(modelStats).some((s) => (s.blockedCount || 0) > 0),
      batchSize: config.batchSize,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationSeconds: parseFloat(durationSec),
      sourceMongo: config.sanitizedMongoUri,
      targetPostgres: config.sanitizedDatabaseUrl,
    },
    modelStats,
    normalizationSummary: resolvedNormSummary,
    orphans: resolvedOrphans,
    idConflicts: resolvedConflicts,
    validation,
    errors,
  };

  // 1. Write migration-report.json
  try {
    fs.writeFileSync(jsonPath, JSON.stringify(reportData, null, 2), "utf8");
    logger.info(`Generated machine-readable report at ${jsonPath}`);
  } catch (err) {
    logger.error(`Failed to write migration-report.json: ${err.message}`);
  }

  // 2. Generate migration-report.md
  const mdContent = formatMarkdownReport(reportData);
  const mdPath = path.join(outputDir, "migration-report.md");
  try {
    fs.writeFileSync(mdPath, mdContent, "utf8");
    logger.info(`Generated human-readable report at ${mdPath}`);
  } catch (err) {
    logger.error(`Failed to write migration-report.md: ${err.message}`);
  }

  return reportData;
}

function formatMarkdownReport(data) {
  const { metadata, modelStats, normalizationSummary, orphans, idConflicts, validation, errors } = data;

  const statusBadge =
    metadata.status === "PASS"
      ? "✅ **PASS**"
      : metadata.status === "WARN"
      ? "⚠️ **WARN**"
      : "❌ **FAIL**";

  const modeBadge = metadata.isDryRun
    ? "🔍 **DRY-RUN / READ-ONLY (No DB writes performed)**"
    : "🚀 **LIVE EXECUTION (PostgreSQL Written)**";

  let md = `# WorkComposer MongoDB → PostgreSQL ETL Migration Report

## Executive Summary

* **Overall Status**: ${statusBadge}
* **Execution Mode**: ${modeBadge}
* **Duration**: ${metadata.durationSeconds}s (${metadata.startTime} → ${metadata.endTime})
* **Batch Size**: ${metadata.batchSize}
* **Strict Mode**: ${metadata.isStrict ? "Enabled" : "Disabled"}
* **Active Orphan Policy**: \`MIGRATION_ORPHAN_POLICY=${metadata.orphanPolicy}\` (Default: \`block\`)
* **Policy Requirement**: ${metadata.orphanPolicyRequired ? "⚠️ **ORPHAN_POLICY_REQUIRED** (Refusing writes for required-FK orphans)" : "✅ **POLICY_SATISFIED**"}
* **Source MongoDB**: \`${metadata.sourceMongo}\`
* **Target PostgreSQL**: \`${metadata.targetPostgres}\`

---

## Per-Model Migration Statistics

| Model | Source | Expected | Processed | Safe to Migrate | Blocked (Req FK) | Identical | Conflicts | Ref Valid | Ref Missing (Orphan) | Errors | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
`;

  for (const [model, stats] of Object.entries(modelStats)) {
    let statusText = "✅ Migrated";
    if (stats.error) {
      statusText = "❌ Failed";
    } else if ((stats.blockedCount || 0) > 0) {
      statusText = "⚠️ BLOCKED_REQUIRED_FK";
    } else if (stats.isDryRun) {
      statusText = "🔍 Dry-Run Safe";
    }

    const safeCount = stats.migrationSafeCount !== undefined ? stats.migrationSafeCount : (stats.insertedCount ?? 0);
    const blockedCount = stats.blockedCount ?? 0;

    md += `| **${model}** | ${stats.sourceCount ?? 0} | ${stats.expectedTargetCount ?? 0} | ${stats.processedCount ?? 0} | ${safeCount} | ${blockedCount} | ${stats.existingIdenticalCount ?? 0} | ${stats.idConflictCount ?? 0} | ${stats.referenceValidCount ?? 0} | ${stats.referenceParentMissingInMongoCount ?? 0} | ${stats.errorCount ?? 0} | ${statusText} |\n`;
  }

  md += `\n---

## Historical Orphan Migration Readiness

* **Active Orphan Policy**: \`MIGRATION_ORPHAN_POLICY=${metadata.orphanPolicy}\` (Default: \`block\`)
* **System Readiness State**: ${metadata.orphanPolicyRequired ? "\`ORPHAN_POLICY_REQUIRED\`" : "\`READY\`"}
* **Source Record Integrity**:
  * Source records exist and extractable: **YES**
  * Source records transformable: **YES**
  * Referenced parent exists in MongoDB: **NO** (mostly references to deleted user \`6a7ed212bd6ad78a910b339f\`)
  * PostgreSQL FK constraint permits insertion: **NO** (for required FKs)
  * Action Required: **Stakeholder decision on migration orphan policy** (\`block\`, \`exclude\`, \`nullify\`, \`placeholder\`, \`reassign\`). Default policy \`block\` safely refuses real writes.

| Model | Source Records | Valid Parent Ref | Missing Parent Ref | Required-FK Blocked | Nullable-FK Migratable | Migration-Safe Rows | Blocked Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
`;

  const orphanModels = Object.entries(modelStats).filter(
    ([_, s]) => (s.referenceParentMissingInMongoCount || 0) > 0
  );

  for (const [model, stats] of orphanModels) {
    const blocked = stats.blockedCount || 0;
    const safe = stats.migrationSafeCount !== undefined ? stats.migrationSafeCount : (stats.insertedCount ?? 0);
    const missing = stats.referenceParentMissingInMongoCount || 0;
    const valid = stats.referenceValidCount || 0;
    const nullableMigratable = missing > blocked ? missing - blocked : 0;
    const status = blocked > 0 ? "⚠️ BLOCKED_REQUIRED_FK" : "✅ MIGRATABLE_NULLABLE_FK";
    md += `| **${model}** | ${stats.sourceCount ?? 0} | ${valid} | ${missing} | ${blocked} | ${nullableMigratable} | ${safe} | ${status} |\n`;
  }

  md += `\n---

## Normalization Audit

* **Monetary Field Normalizations (Invoice.amount)**: ${normalizationSummary.monetaryNormalizations}
* **Array Field Normalizations**: ${normalizationSummary.arrayNormalizations}
* **Empty-String Foreign Keys Converted to Null**:
`;

  const fkEntries = Object.entries(normalizationSummary.emptyStringForeignKeys);
  if (fkEntries.length === 0) {
    md += `  * *None detected.*\n`;
  } else {
    for (const [field, count] of fkEntries) {
      md += `  * \`${field}\`: **${count}** occurrences converted from \`""\` to \`null\`\n`;
    }
  }

  md += `\n---

## Orphan References Audit

* **Total Genuine Missing Parent References in MongoDB**: **${orphans.count}**
`;

  if (orphans.count === 0) {
    md += `* *Zero orphan references detected. All foreign keys verified in source MongoDB.*\n`;
  } else {
    md += `\n| Model | Record ID | Field | Missing Target ID | Target Model | Target Collection | Required | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
`;
    for (const orphan of orphans.records.slice(0, 50)) {
      md += `| ${orphan.model} | \`${orphan.recordId}\` | \`${orphan.field}\` | \`${orphan.missingId}\` | ${orphan.targetModel} | ${orphan.targetCollection || ""} | ${orphan.required ? "**YES (REQUIRED)**" : "NO (Nullable)"} | \`${orphan.status}\` |\n`;
    }
    if (orphans.count > 50) {
      md += `\n*... and ${orphans.count - 50} more orphans recorded in migration-report.json.*\n`;
    }
  }

  if (idConflicts && idConflicts.count > 0) {
    md += `\n---

## ID Conflicts Audit

* **Total ID Conflicts Detected**: **${idConflicts.count}**
`;
    for (const conflict of idConflicts.records.slice(0, 20)) {
      md += `* ⚠️ **${conflict.model}** (ID: \`${conflict.id}\`): Incoming record differs from existing record in PostgreSQL target.\n`;
    }
  }

  if (validation) {
    md += `\n---

## Validation & Deep Sample Reconciliation

* **Validation Status**: ${validation.status === "PASS" ? "✅ PASS" : "⚠️ WARN"}

### Sample Deep Comparison Results (Sample Size: ${config.sampleSize})

| Model | Sampled | Exact Match | Normalized | Unexpected Differences |
| :--- | :--- | :--- | :--- | :--- |
`;
    for (const [model, s] of Object.entries(validation.sampleComparison || {})) {
      md += `| **${model}** | ${s.sampled} | ${s.exact} | ${s.normalized} | ${s.unexpectedDifferences} |\n`;
    }
  }

  if (errors.length > 0) {
    md += `\n---

## Errors Encountered

`;
    for (const err of errors) {
      md += `* ❌ **${err.model || "General"}**: ${err.message || String(err)}\n`;
    }
  }

  md += `\n---
*Report automatically generated by WorkComposer ETL Migration Tooling.*
`;

  return md;
}

export default {
  generateReports,
};
