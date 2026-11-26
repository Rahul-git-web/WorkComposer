import config from "./config.js";
import { getReadOnlyCollection, countSourceDocuments } from "./mongo.js";
import { getPrismaModel, countTargetRows } from "./postgres.js";
import { transformers } from "./normalize.js";
import logger from "./logger.js";

/**
 * Deep equality comparator for JSON structures
 */
function isDeepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b;
  }
  if (typeof a !== "object" || typeof b !== "object") {
    return a === b;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isDeepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!isDeepEqual(a[key], b[key])) return false;
  }
  return true;
}

/**
 * Validates Row Counts across all 35 models.
 * Calculates expected counts for normalized tables from embedded arrays.
 */
export async function validateRowCounts() {
  const results = [];

  for (const [modelName, collectionName] of Object.entries(config.modelMap)) {
    let expectedCount = 0;
    const actualPostgresCount = await countTargetRows(modelName);

    if (modelName === "UserDevice") {
      const col = getReadOnlyCollection("users");
      const pipeline = [
        { $unwind: "$devices" },
        { $count: "total" },
      ];
      const res = await col.aggregate(pipeline).toArray();
      expectedCount = res[0] ? res[0].total : 0;
    } else if (modelName === "UserRefreshToken") {
      const col = getReadOnlyCollection("users");
      const pipeline = [
        { $unwind: "$refreshTokens" },
        { $count: "total" },
      ];
      const res = await col.aggregate(pipeline).toArray();
      expectedCount = res[0] ? res[0].total : 0;
    } else if (modelName === "ProjectUser") {
      const col = getReadOnlyCollection("projects");
      const pipeline = [
        { $unwind: "$users" },
        { $group: { _id: { p: "$_id", u: "$users" } } },
        { $count: "total" },
      ];
      const res = await col.aggregate(pipeline).toArray();
      expectedCount = res[0] ? res[0].total : 0;
    } else {
      expectedCount = await countSourceDocuments(collectionName);
    }

    const difference = actualPostgresCount - expectedCount;
    const match = config.isDryRun ? true : difference === 0;

    results.push({
      model: modelName,
      collection: collectionName,
      sourceExpected: expectedCount,
      targetActual: actualPostgresCount,
      difference,
      match,
    });
  }

  return results;
}

/**
 * Random sample deep comparison between MongoDB and PostgreSQL
 * Samples up to MIGRATION_SAMPLE_SIZE documents per model and verifies fidelity.
 */
export async function sampleDeepComparison(modelsToSample = ["User", "Project", "Task", "Comment", "Invoice", "Role"]) {
  const sampleReport = {};

  for (const modelName of modelsToSample) {
    const collectionName = config.modelMap[modelName];
    if (!collectionName) continue;

    const col = getReadOnlyCollection(collectionName);
    const transformer = transformers[modelName];
    if (!transformer) continue;

    // Fetch random sample from Mongo
    const sampleDocs = await col
      .aggregate([{ $sample: { size: config.sampleSize } }])
      .toArray();

    let exact = 0;
    let normalized = 0;
    let unexpectedDifferences = 0;
    const fieldDiscrepancies = [];

    if (!config.isDryRun) {
      const delegate = getPrismaModel(modelName);

      for (const doc of sampleDocs) {
        const expected = transformer(doc);
        const actual = await delegate.findUnique({
          where: { id: expected.id },
        });

        if (!actual) {
          unexpectedDifferences++;
          fieldDiscrepancies.push({
            id: expected.id,
            error: "Record missing in PostgreSQL target",
          });
          continue;
        }

        let hasDiscrepancy = false;
        for (const [key, expVal] of Object.entries(expected)) {
          const actVal = actual[key];

          // Compare Dates
          if (expVal instanceof Date && actVal instanceof Date) {
            if (expVal.getTime() !== actVal.getTime()) {
              hasDiscrepancy = true;
              fieldDiscrepancies.push({
                id: expected.id,
                field: key,
                expected: expVal.toISOString(),
                actual: actVal.toISOString(),
              });
            }
          } else if (typeof expVal === "number" && typeof actVal === "number") {
            // Compare floats / numbers
            if (Math.abs(expVal - actVal) > 0.0001) {
              hasDiscrepancy = true;
              fieldDiscrepancies.push({
                id: expected.id,
                field: key,
                expected: expVal,
                actual: actVal,
              });
            }
          } else if (typeof expVal === "object" && typeof actVal === "object") {
            // Compare JSON / Arrays
            if (!isDeepEqual(expVal, actVal)) {
              hasDiscrepancy = true;
              fieldDiscrepancies.push({
                id: expected.id,
                field: key,
                expected: expVal,
                actual: actVal,
              });
            }
          } else if (expVal !== actVal) {
            hasDiscrepancy = true;
            fieldDiscrepancies.push({
              id: expected.id,
              field: key,
              expected: expVal,
              actual: actVal,
            });
          }
        }

        if (hasDiscrepancy) {
          unexpectedDifferences++;
        } else {
          exact++;
        }
      }
    } else {
      // In dry run: test that transformation completes without errors
      for (const doc of sampleDocs) {
        try {
          const transformed = transformer(doc);
          if (transformed && transformed.id) {
            exact++;
          }
        } catch {
          unexpectedDifferences++;
        }
      }
    }

    sampleReport[modelName] = {
      sampled: sampleDocs.length,
      exact,
      normalized,
      unexpectedDifferences,
      discrepancies: fieldDiscrepancies.slice(0, 5), // Keep top 5 samples
    };
  }

  return sampleReport;
}

/**
 * Complete Validation Suite
 */
export async function runFullValidation() {
  logger.info("Running migration validation suite...");
  const rowCounts = await validateRowCounts();
  const sampleComparison = await sampleDeepComparison();

  const totalDifferences = rowCounts.reduce((acc, r) => acc + Math.abs(r.difference), 0);
  const totalDiscrepancies = Object.values(sampleComparison).reduce(
    (acc, s) => acc + s.unexpectedDifferences,
    0
  );

  const status =
    totalDifferences === 0 && totalDiscrepancies === 0 ? "PASS" : "WARN";

  return {
    status,
    rowCounts,
    sampleComparison,
  };
}

export default {
  validateRowCounts,
  sampleDeepComparison,
  runFullValidation,
};
