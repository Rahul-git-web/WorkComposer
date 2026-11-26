import mongoose from "mongoose";
import config from "./config.js";
import { getReadOnlyCollection } from "./mongo.js";
import { transformers } from "./normalize.js";
import logger from "./logger.js";

/**
 * Converts a string ID to a MongoDB ObjectId for cursor query filtering if valid.
 */
function toMongoIdFilter(id) {
  if (!id) return null;
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return id;
  }
}

/**
 * Async generator yielding batches of normalized rows from MongoDB.
 * Uses cursor-based pagination sorted by _id ascending.
 *
 * @param {string} modelName - The target Prisma model name (e.g. 'User', 'Task', 'UserDevice')
 * @param {string|null} lastProcessedId - The resume checkpoint ID
 * @param {number} batchSize - Number of source records per batch
 */
export async function* extractBatches(modelName, lastProcessedId = null, batchSize = config.batchSize) {
  const collectionName = config.modelMap[modelName];
  if (!collectionName) {
    throw new Error(`No collection mapping found for model '${modelName}'`);
  }

  const collection = getReadOnlyCollection(collectionName);
  const filter = {};

  // For normalized subdocument models, only query source documents containing non-empty arrays
  if (modelName === "ProjectUser") {
    filter["users.0"] = { $exists: true };
  } else if (modelName === "UserDevice") {
    filter["devices.0"] = { $exists: true };
  } else if (modelName === "UserRefreshToken") {
    filter["refreshTokens.0"] = { $exists: true };
  }

  if (lastProcessedId) {
    const mongoId = toMongoIdFilter(lastProcessedId);
    filter._id = { $gt: mongoId };
    logger.debug(`Resuming extraction for ${modelName} from _id > ${lastProcessedId}`);
  }

  const cursor = collection
    .find(filter)
    .sort({ _id: 1 })
    .batchSize(batchSize);

  let sourceBuffer = [];
  let lastSourceId = lastProcessedId;

  for await (const doc of cursor) {
    sourceBuffer.push(doc);
    lastSourceId = doc._id ? doc._id.toString() : lastSourceId;

    if (sourceBuffer.length >= batchSize) {
      const rows = transformBatch(modelName, sourceBuffer);
      yield {
        model: modelName,
        sourceCount: sourceBuffer.length,
        rows,
        lastProcessedId: lastSourceId,
      };
      sourceBuffer = [];
    }
  }

  // Yield remaining records
  if (sourceBuffer.length > 0) {
    const rows = transformBatch(modelName, sourceBuffer);
    yield {
      model: modelName,
      sourceCount: sourceBuffer.length,
      rows,
      lastProcessedId: lastSourceId,
    };
  }
}

/**
 * Transforms a raw batch of MongoDB documents into target rows.
 * Handles both regular models and normalized subdocument tables (UserDevice, UserRefreshToken, ProjectUser).
 */
export function transformBatch(modelName, docs) {
  const transformer = transformers[modelName];
  if (!transformer) {
    throw new Error(`No transformer defined for model '${modelName}'`);
  }

  const rows = [];

  // Special normalization handling
  if (modelName === "UserDevice") {
    for (const userDoc of docs) {
      if (Array.isArray(userDoc.devices)) {
        for (let i = 0; i < userDoc.devices.length; i++) {
          const device = userDoc.devices[i];
          if (device) {
            rows.push(transformer(userDoc, device, i));
          }
        }
      }
    }
    return rows;
  }

  if (modelName === "UserRefreshToken") {
    for (const userDoc of docs) {
      if (Array.isArray(userDoc.refreshTokens)) {
        for (let i = 0; i < userDoc.refreshTokens.length; i++) {
          const token = userDoc.refreshTokens[i];
          if (token && token.token) {
            rows.push(transformer(userDoc, token, i));
          }
        }
      }
    }
    return rows;
  }

  if (modelName === "ProjectUser") {
    for (const projectDoc of docs) {
      if (Array.isArray(projectDoc.users)) {
        const seenUserIds = new Set();
        for (const userRef of projectDoc.users) {
          const row = transformer(projectDoc, userRef);
          if (row) {
            if (seenUserIds.has(row.userId)) {
              logger.warn(`Duplicate (projectId, userId) detected and reported: projectId=${row.projectId}, userId=${row.userId}`);
            } else {
              seenUserIds.add(row.userId);
              rows.push(row);
            }
          }
        }
      }
    }
    return rows;
  }

  // Standard 1-to-1 transformation
  for (const doc of docs) {
    try {
      const transformed = transformer(doc);
      if (transformed) {
        rows.push(transformed);
      }
    } catch (err) {
      logger.warn(`Failed to transform document in ${modelName} (_id: ${doc._id}): ${err.message}`);
    }
  }

  return rows;
}

export default {
  extractBatches,
};
