import config, { getModelTier } from "./config.js";
import { executeTransaction, getPrismaModel } from "./postgres.js";
import { checkDocumentExistsInMongo } from "./mongo.js";
import { isValid24HexId } from "./id.js";
import logger from "./logger.js";

/**
 * Reference Status Classifications
 */
export const REFERENCE_STATUS = {
  VALID: "REFERENCE_VALID",
  PARENT_EXISTS_IN_MONGO: "REFERENCE_PARENT_EXISTS_IN_MONGO",
  PARENT_NOT_YET_MIGRATED: "REFERENCE_PARENT_NOT_YET_MIGRATED",
  PARENT_MISSING_IN_MONGO: "REFERENCE_PARENT_MISSING_IN_MONGO",
  EMPTY_NULLABLE: "REFERENCE_EMPTY_NULLABLE",
  INVALID_FORMAT: "REFERENCE_INVALID_FORMAT",
  SOURCE_RECORD_VALID_PARENT_MISSING: "SOURCE_RECORD_VALID_PARENT_MISSING",
  BLOCKED_REQUIRED_FK: "BLOCKED_REQUIRED_FK",
};

/**
 * Global Migrated/Known ID Registry per Model
 */
export const migratedIdRegistry = {
  Organization: new Set(),
  Role: new Set(),
  Team: new Set(),
  User: new Set(),
  Project: new Set(),
  Task: new Set(),
  Comment: new Set(),
  Session: new Set(),
  Attendance: new Set(),
  Timer: new Set(),
  ProjectTracking: new Set(),
  ManualTimeRequest: new Set(),
  Screenshot: new Set(),
  Activity: new Set(),
  AppUsage: new Set(),
  UsageLog: new Set(),
  Location: new Set(),
  Notification: new Set(),
  AuditLog: new Set(),
  ApiLog: new Set(),
  Report: new Set(),
  Invite: new Set(),
  SyncStatus: new Set(),
  EmailChange: new Set(),
  ApiKey: new Set(),
  TimeTrackingSettings: new Set(),
  BillingProfile: new Set(),
  Subscription: new Set(),
  PaymentMethod: new Set(),
  Invoice: new Set(),
  Integration: new Set(),
  AppClassification: new Set(),
  UserDevice: new Set(),
  UserRefreshToken: new Set(),
  ProjectUser: new Set(),
};

/**
 * Registries for reporting
 */
export const orphanRegistry = [];
export const idConflictRegistry = [];
export const deferredForwardReferences = [];

/**
 * Model Foreign Key Definitions with Schema-Accurate Nullability
 */
export const FOREIGN_KEY_RULES = {
  User: [
    { field: "organizationId", targetModel: "Organization", targetCollection: "organizations", required: true },
    { field: "teamId", targetModel: "Team", targetCollection: "teams", required: false },
    { field: "reportTeamId", targetModel: "Team", targetCollection: "teams", required: false },
    { field: "roleRef", targetModel: "Role", targetCollection: "roles", required: false },
    { field: "managerId", targetModel: "User", targetCollection: "users", required: false },
  ],
  Team: [
    { field: "organizationId", targetModel: "Organization", targetCollection: "organizations", required: true },
    { field: "createdById", targetModel: "User", targetCollection: "users", required: false },
  ],
  Role: [
    { field: "organizationId", targetModel: "Organization", targetCollection: "organizations", required: true },
  ],
  Project: [
    { field: "organizationId", targetModel: "Organization", targetCollection: "organizations", required: true },
    { field: "createdById", targetModel: "User", targetCollection: "users", required: false },
  ],
  ProjectUser: [
    { field: "projectId", targetModel: "Project", targetCollection: "projects", required: true },
    { field: "userId", targetModel: "User", targetCollection: "users", required: true },
  ],
  Task: [
    { field: "organizationId", targetModel: "Organization", targetCollection: "organizations", required: true },
    { field: "projectId", targetModel: "Project", targetCollection: "projects", required: false },
    { field: "assignedToId", targetModel: "User", targetCollection: "users", required: false },
    { field: "assignedById", targetModel: "User", targetCollection: "users", required: false },
    { field: "deletedById", targetModel: "User", targetCollection: "users", required: false },
  ],
  Comment: [
    { field: "taskId", targetModel: "Task", targetCollection: "tasks", required: true },
    { field: "userId", targetModel: "User", targetCollection: "users", required: true },
  ],
  Session: [
    { field: "userId", targetModel: "User", targetCollection: "users", required: true },
    { field: "projectId", targetModel: "Project", targetCollection: "projects", required: false },
    { field: "taskId", targetModel: "Task", targetCollection: "tasks", required: false },
  ],
  Attendance: [
    { field: "userId", targetModel: "User", targetCollection: "users", required: true },
    { field: "organizationId", targetModel: "Organization", targetCollection: "organizations", required: true },
  ],
  Timer: [
    { field: "userId", targetModel: "User", targetCollection: "users", required: true },
    { field: "projectId", targetModel: "Project", targetCollection: "projects", required: false },
    { field: "taskId", targetModel: "Task", targetCollection: "tasks", required: false },
  ],
  Screenshot: [
    { field: "userId", targetModel: "User", targetCollection: "users", required: true },
    { field: "projectId", targetModel: "Project", targetCollection: "projects", required: false },
    { field: "taskId", targetModel: "Task", targetCollection: "tasks", required: false },
  ],
  Activity: [
    { field: "userId", targetModel: "User", targetCollection: "users", required: true },
    { field: "projectId", targetModel: "Project", targetCollection: "projects", required: false },
    { field: "taskId", targetModel: "Task", targetCollection: "tasks", required: false },
  ],
  AppUsage: [
    { field: "userId", targetModel: "User", targetCollection: "users", required: true },
  ],
  UsageLog: [
    { field: "userId", targetModel: "User", targetCollection: "users", required: true },
    { field: "projectId", targetModel: "Project", targetCollection: "projects", required: false },
    { field: "taskId", targetModel: "Task", targetCollection: "tasks", required: false },
  ],
  ProjectTracking: [
    { field: "userId", targetModel: "User", targetCollection: "users", required: true },
    { field: "projectId", targetModel: "Project", targetCollection: "projects", required: true },
    { field: "taskId", targetModel: "Task", targetCollection: "tasks", required: false },
  ],
  ManualTimeRequest: [
    { field: "organizationId", targetModel: "Organization", targetCollection: "organizations", required: true },
    { field: "requestedById", targetModel: "User", targetCollection: "users", required: true },
    { field: "projectId", targetModel: "Project", targetCollection: "projects", required: false },
    { field: "taskId", targetModel: "Task", targetCollection: "tasks", required: false },
    { field: "approvedById", targetModel: "User", targetCollection: "users", required: false },
    { field: "reportId", targetModel: "Report", targetCollection: "reports", required: false },
  ],
  Notification: [
    { field: "recipientId", targetModel: "User", targetCollection: "users", required: true },
    { field: "organizationId", targetModel: "Organization", targetCollection: "organizations", required: true },
  ],
  AuditLog: [
    { field: "organizationId", targetModel: "Organization", targetCollection: "organizations", required: true },
    { field: "performedById", targetModel: "User", targetCollection: "users", required: false },
  ],
  ApiKey: [
    { field: "organizationId", targetModel: "Organization", targetCollection: "organizations", required: true },
    { field: "createdById", targetModel: "User", targetCollection: "users", required: false },
  ],
  ApiLog: [
    { field: "organizationId", targetModel: "Organization", targetCollection: "organizations", required: true },
    { field: "apiKeyId", targetModel: "ApiKey", targetCollection: "apikeys", required: false },
  ],
  Report: [
    { field: "userId", targetModel: "User", targetCollection: "users", required: true },
  ],
  Invite: [
    { field: "organizationId", targetModel: "Organization", targetCollection: "organizations", required: true },
    { field: "teamId", targetModel: "Team", targetCollection: "teams", required: false },
    { field: "invitedById", targetModel: "User", targetCollection: "users", required: false },
  ],
  Location: [
    { field: "organizationId", targetModel: "Organization", targetCollection: "organizations", required: true },
    { field: "userId", targetModel: "User", targetCollection: "users", required: true },
  ],
  SyncStatus: [
    { field: "userId", targetModel: "User", targetCollection: "users", required: true },
  ],
  EmailChange: [
    { field: "userId", targetModel: "User", targetCollection: "users", required: true },
  ],
  UserDevice: [
    { field: "userId", targetModel: "User", targetCollection: "users", required: true },
  ],
  UserRefreshToken: [
    { field: "userId", targetModel: "User", targetCollection: "users", required: true },
  ],
  TimeTrackingSettings: [
    { field: "organizationId", targetModel: "Organization", targetCollection: "organizations", required: true },
  ],
  BillingProfile: [
    { field: "organizationId", targetModel: "Organization", targetCollection: "organizations", required: true },
  ],
  Subscription: [
    { field: "organizationId", targetModel: "Organization", targetCollection: "organizations", required: true },
  ],
  PaymentMethod: [
    { field: "organizationId", targetModel: "Organization", targetCollection: "organizations", required: true },
  ],
  Invoice: [
    { field: "organizationId", targetModel: "Organization", targetCollection: "organizations", required: true },
  ],
  Integration: [
    { field: "organizationId", targetModel: "Organization", targetCollection: "organizations", required: true },
  ],
  AppClassification: [
    { field: "organizationId", targetModel: "Organization", targetCollection: "organizations", required: true },
  ],
};

/**
 * Asynchronously validates and classifies foreign keys for a row.
 * Distinguishes:
 * - REFERENCE_VALID (in migrated cache)
 * - REFERENCE_PARENT_EXISTS_IN_MONGO (in MongoDB, not yet in migrated cache)
 * - REFERENCE_PARENT_MISSING_IN_MONGO (not in MongoDB -> genuine orphan)
 * - REFERENCE_EMPTY_NULLABLE (empty string normalized to null)
 * - REFERENCE_INVALID_FORMAT
 */
export async function validateRowForeignKeys(modelName, row) {
  const rules = FOREIGN_KEY_RULES[modelName] || [];
  const classifications = [];

  for (const rule of rules) {
    const foreignVal = row[rule.field];

    // Empty or Null value
    if (foreignVal === null || foreignVal === undefined || foreignVal === "") {
      if (foreignVal === "") {
        if (!rule.required) {
          row[rule.field] = null;
          classifications.push({
            field: rule.field,
            status: REFERENCE_STATUS.EMPTY_NULLABLE,
            required: rule.required,
          });
        } else {
          classifications.push({
            field: rule.field,
            status: REFERENCE_STATUS.INVALID_FORMAT,
            required: rule.required,
            error: "Required foreign key is empty string",
          });
          if (config.isStrict) {
            throw new Error(`STRICT MODE FAILURE: Required foreign key '${rule.field}' in ${modelName} is empty string`);
          }
        }
      }
      continue;
    }

    // Invalid format check
    if (!isValid24HexId(foreignVal)) {
      classifications.push({
        field: rule.field,
        status: REFERENCE_STATUS.INVALID_FORMAT,
        value: foreignVal,
        required: rule.required,
      });
      if (rule.required && config.isStrict) {
        throw new Error(`STRICT MODE FAILURE: Invalid 24-hex format for '${rule.field}' in ${modelName}: ${foreignVal}`);
      }
      continue;
    }

    // 1. Check if already migrated
    const migratedSet = migratedIdRegistry[rule.targetModel];
    if (migratedSet && migratedSet.has(foreignVal)) {
      classifications.push({
        field: rule.field,
        status: REFERENCE_STATUS.VALID,
        targetModel: rule.targetModel,
        id: foreignVal,
        required: rule.required,
      });
      continue;
    }

    // 2. Check if parent exists in source MongoDB
    const existsInMongo = await checkDocumentExistsInMongo(rule.targetCollection, foreignVal);
    if (existsInMongo) {
      const targetTier = getModelTier(rule.targetModel);
      const currentTier = getModelTier(modelName);
      const isNotYetMigrated = targetTier > currentTier || (rule.targetModel === modelName && !migratedSet?.has(foreignVal));

      const status = isNotYetMigrated
        ? REFERENCE_STATUS.PARENT_NOT_YET_MIGRATED
        : REFERENCE_STATUS.PARENT_EXISTS_IN_MONGO;

      classifications.push({
        field: rule.field,
        status,
        targetModel: rule.targetModel,
        id: foreignVal,
        required: rule.required,
      });

      if (isNotYetMigrated) {
        if (!rule.required && !config.isDryRun) {
          deferredForwardReferences.push({
            model: modelName,
            id: row.id,
            field: rule.field,
            targetModel: rule.targetModel,
            targetId: foreignVal,
          });
          row[rule.field] = null;
        }
      } else {
        // Add to migratedIdRegistry so future records in the same or subsequent batches find it fast
        if (migratedSet) {
          migratedSet.add(foreignVal);
        }
      }
      continue;
    }

    // 3. Document does NOT exist in MongoDB -> Genuine Orphan!
    const isRequiredMissing = rule.required;
    const readiness = isRequiredMissing
      ? REFERENCE_STATUS.BLOCKED_REQUIRED_FK
      : "MIGRATABLE_NULLABLE_FK";

    const orphanRecord = {
      model: modelName,
      recordId: row.id || `${row.projectId}:${row.userId}`,
      field: rule.field,
      targetModel: rule.targetModel,
      targetCollection: rule.targetCollection,
      missingId: foreignVal,
      required: rule.required,
      status: REFERENCE_STATUS.PARENT_MISSING_IN_MONGO,
      recordStatus: REFERENCE_STATUS.SOURCE_RECORD_VALID_PARENT_MISSING,
      readiness,
      timestamp: new Date().toISOString(),
    };
    orphanRegistry.push(orphanRecord);

    classifications.push({
      field: rule.field,
      status: REFERENCE_STATUS.PARENT_MISSING_IN_MONGO,
      recordStatus: REFERENCE_STATUS.SOURCE_RECORD_VALID_PARENT_MISSING,
      readiness,
      targetModel: rule.targetModel,
      id: foreignVal,
      required: rule.required,
    });

    if (rule.required && config.isStrict) {
      throw new Error(
        `STRICT MODE FAILURE: Unresolved required foreign key '${rule.field}' in ${modelName} (missing in MongoDB ${rule.targetModel}: ${foreignVal})`
      );
    }

    // If nullable, nullify the dangling reference for Postgres FK integrity during real write
    if (!rule.required && !config.isDryRun) {
      row[rule.field] = null;
    }
  }

  return classifications;
}

/**
 * Deep equality comparator for detecting data conflicts on existing rows
 */
export function isRowDataIdentical(existingRow, newRow) {
  if (!existingRow || !newRow) return false;
  for (const key of Object.keys(newRow)) {
    if (key === "updatedAt" || key === "createdAt") continue; // Exclude timestamp drift
    const valA = existingRow[key];
    const valB = newRow[key];
    if (valA === valB) continue;
    if (valA instanceof Date && valB instanceof Date) {
      if (valA.getTime() === valB.getTime()) continue;
      return false;
    }
    if (typeof valA === "number" && typeof valB === "number") {
      if (Math.abs(valA - valB) < 0.001) continue;
      return false;
    }
    if (typeof valA === "object" && typeof valB === "object" && valA !== null && valB !== null) {
      if (JSON.stringify(valA) === JSON.stringify(valB)) continue;
      return false;
    }
    if (String(valA) === String(valB)) continue;
    return false;
  }
  return true;
}

/**
 * Loads a batch into PostgreSQL with full idempotency, conflict detection, and reference auditing.
 */
export async function loadBatch(modelName, rows) {
  if (!rows || rows.length === 0) {
    return {
      inserted: 0,
      skipped: 0,
      existingIdentical: 0,
      idConflicts: 0,
      referenceValid: 0,
      referenceEmptyNullable: 0,
      referenceParentNotYetMigrated: 0,
      referenceParentExistsInMongo: 0,
      referenceParentMissingInMongo: 0,
      referenceInvalidFormat: 0,
      orphans: 0,
      isDryRun: config.isDryRun,
    };
  }

  let refValid = 0;
  let refEmptyNullable = 0;
  let refParentNotYetMigrated = 0;
  let refParentExists = 0;
  let refParentMissing = 0;
  let refInvalid = 0;
  let migrationSafeCount = 0;
  let blockedCount = 0;

  // Validate FKs for all rows
  for (const row of rows) {
    const classifications = await validateRowForeignKeys(modelName, row);
    let rowBlocked = false;

    for (const c of classifications) {
      if (c.status === REFERENCE_STATUS.VALID) refValid++;
      else if (c.status === REFERENCE_STATUS.EMPTY_NULLABLE) refEmptyNullable++;
      else if (c.status === REFERENCE_STATUS.PARENT_NOT_YET_MIGRATED) refParentNotYetMigrated++;
      else if (c.status === REFERENCE_STATUS.PARENT_EXISTS_IN_MONGO) refParentExists++;
      else if (c.status === REFERENCE_STATUS.PARENT_MISSING_IN_MONGO) {
        refParentMissing++;
        if (c.required) {
          rowBlocked = true;
        }
      } else if (c.status === REFERENCE_STATUS.INVALID_FORMAT) {
        refInvalid++;
        if (c.required) {
          rowBlocked = true;
        }
      }
    }

    if (rowBlocked) {
      blockedCount++;
      row._isBlocked = true;
      row._migrationStatus = REFERENCE_STATUS.BLOCKED_REQUIRED_FK;
    } else {
      migrationSafeCount++;
      row._isBlocked = false;
      row._migrationStatus = "MIGRATION_SAFE";
    }
  }

  // Dry-run mode: do not write to PostgreSQL
  if (config.isDryRun) {
    if (migratedIdRegistry[modelName]) {
      for (const row of rows) {
        if (!row._isBlocked) {
          if (row.id) migratedIdRegistry[modelName].add(row.id);
          else if (row.projectId && row.userId) {
            migratedIdRegistry[modelName].add(`${row.projectId}:${row.userId}`);
          }
        }
      }
    }
    return {
      inserted: migrationSafeCount,
      skipped: blockedCount,
      migrationSafeCount,
      blockedCount,
      existingIdentical: 0,
      idConflicts: 0,
      referenceValid: refValid,
      referenceEmptyNullable: refEmptyNullable,
      referenceParentNotYetMigrated: refParentNotYetMigrated,
      referenceParentExistsInMongo: refParentExists,
      referenceParentMissingInMongo: refParentMissing,
      referenceInvalidFormat: refInvalid,
      orphans: refParentMissing,
      isDryRun: true,
    };
  }

  // Live Write Mode with Conflict Detection and Orphan Policy
  if (blockedCount > 0 && config.orphanPolicy === "block") {
    logger.warn(
      `ORPHAN_POLICY_REQUIRED: Refusing to write ${blockedCount} records in ${modelName} with missing required parents under MIGRATION_ORPHAN_POLICY=block`
    );
  }
  return executeTransaction(async (tx) => {
    const delegateName = modelName.charAt(0).toLowerCase() + modelName.slice(1);
    const delegate = tx[delegateName];

    let inserted = 0;
    let existingIdentical = 0;
    let idConflicts = 0;

    // Check existing target rows to detect conflicts
    const rowIds = rows.map((r) => r.id).filter(Boolean);
    let existingMap = new Map();

    if (rowIds.length > 0 && modelName !== "ProjectUser") {
      const existingRows = await delegate.findMany({
        where: { id: { in: rowIds } },
      });
      for (const er of existingRows) {
        existingMap.set(er.id, er);
      }
    }

    const rowsToInsert = [];

    for (const row of rows) {
      if (row._isBlocked && config.orphanPolicy === "block") {
        continue;
      }
      const { _isBlocked, _migrationStatus, ...cleanRow } = row;
      const existing = existingMap.get(cleanRow.id);
      if (existing) {
        if (isRowDataIdentical(existing, cleanRow)) {
          existingIdentical++;
        } else {
          idConflicts++;
          idConflictRegistry.push({
            model: modelName,
            id: cleanRow.id,
            existing,
            incoming: cleanRow,
            timestamp: new Date().toISOString(),
          });
          logger.warn(`ID Conflict in ${modelName} for record ${cleanRow.id}`);
        }
      } else {
        rowsToInsert.push(cleanRow);
      }
    }

    if (rowsToInsert.length > 0) {
      try {
        const result = await delegate.createMany({
          data: rowsToInsert,
          skipDuplicates: true,
        });
        inserted = result.count;
      } catch (err) {
        logger.warn(`createMany failed on ${modelName} (${err.message}). Attempting row-by-row fallback.`);
        for (const row of rowsToInsert) {
          try {
            if (modelName === "ProjectUser") {
              await delegate.upsert({
                where: {
                  projectId_userId: {
                    projectId: row.projectId,
                    userId: row.userId,
                  },
                },
                create: row,
                update: {},
              });
            } else {
              await delegate.upsert({
                where: { id: row.id },
                create: row,
                update: {},
              });
            }
            inserted++;
          } catch (innerErr) {
            logger.error(`Upsert failed on ${modelName} ${row.id}: ${innerErr.message}`);
          }
        }
      }
    }

    // Cache migrated IDs
    if (migratedIdRegistry[modelName]) {
      for (const row of rows) {
        if (!row._isBlocked) {
          if (row.id) migratedIdRegistry[modelName].add(row.id);
          else if (row.projectId && row.userId) {
            migratedIdRegistry[modelName].add(`${row.projectId}:${row.userId}`);
          }
        }
      }
    }

    const skipped = rows.length - inserted;

    return {
      inserted,
      skipped,
      migrationSafeCount,
      blockedCount,
      existingIdentical,
      idConflicts,
      referenceValid: refValid,
      referenceEmptyNullable: refEmptyNullable,
      referenceParentNotYetMigrated: refParentNotYetMigrated,
      referenceParentExistsInMongo: refParentExists,
      referenceParentMissingInMongo: refParentMissing,
      referenceInvalidFormat: refInvalid,
      orphans: refParentMissing,
      isDryRun: false,
    };
  });
}

/**
 * Pre-populates migratedIdRegistry from existing PostgreSQL rows to support safe resumption
 */
export async function populateMigratedIdRegistryFromDb() {
  const client = (await import("./postgres.js")).getPrismaClient();
  if (!client) return;
  for (const modelName of Object.keys(migratedIdRegistry)) {
    try {
      const delegateName = modelName.charAt(0).toLowerCase() + modelName.slice(1);
      const delegate = client[delegateName];
      if (!delegate) continue;
      if (modelName === "ProjectUser") {
        const existing = await delegate.findMany({ select: { projectId: true, userId: true } });
        for (const r of existing) {
          migratedIdRegistry[modelName].add(`${r.projectId}:${r.userId}`);
        }
      } else {
        const existing = await delegate.findMany({ select: { id: true } });
        for (const r of existing) {
          migratedIdRegistry[modelName].add(r.id);
        }
      }
    } catch {}
  }
}

/**
 * Resolves deferred forward foreign key references after target models are migrated
 */
export async function resolveDeferredForwardReferences() {
  if (config.isDryRun || deferredForwardReferences.length === 0) return 0;
  const client = (await import("./postgres.js")).getPrismaClient();
  if (!client) return 0;
  let resolved = 0;
  logger.info(`Resolving ${deferredForwardReferences.length} deferred forward foreign key references...`);
  for (const ref of deferredForwardReferences) {
    try {
      const targetDelegateName = ref.targetModel.charAt(0).toLowerCase() + ref.targetModel.slice(1);
      const targetDelegate = client[targetDelegateName];
      if (!targetDelegate) continue;
      const parent = await targetDelegate.findUnique({ where: { id: ref.targetId }, select: { id: true } });
      if (parent) {
        const delegateName = ref.model.charAt(0).toLowerCase() + ref.model.slice(1);
        const delegate = client[delegateName];
        if (delegate) {
          await delegate.update({
            where: { id: ref.id },
            data: { [ref.field]: ref.targetId },
          });
          resolved++;
        }
      }
    } catch (err) {
      logger.warn(`Could not resolve deferred forward reference ${ref.model}.${ref.id}.${ref.field}: ${err.message}`);
    }
  }
  logger.info(`Successfully resolved ${resolved} deferred forward foreign key references.`);
  return resolved;
}

export default {
  loadBatch,
  validateRowForeignKeys,
  isRowDataIdentical,
  migratedIdRegistry,
  orphanRegistry,
  idConflictRegistry,
  deferredForwardReferences,
  populateMigratedIdRegistryFromDb,
  resolveDeferredForwardReferences,
  REFERENCE_STATUS,
  FOREIGN_KEY_RULES,
};
