import mongoose from "mongoose";
import config from "./config.js";
import logger from "./logger.js";

let mongoConnection = null;

const FORBIDDEN_WRITE_METHODS = new Set([
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "findByIdAndUpdate",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
  "findByIdAndDelete",
  "bulkWrite",
  "insert",
  "insertOne",
  "insertMany",
  "replaceOne",
  "drop",
  "dropCollection",
  "dropDatabase",
  "save",
]);

/**
 * Proxies a native MongoDB collection to guarantee 100% read-only operations.
 */
function createReadOnlyCollectionProxy(collection) {
  return new Proxy(collection, {
    get(target, prop) {
      if (FORBIDDEN_WRITE_METHODS.has(prop)) {
        throw new Error(
          `WRITE OPERATION BLOCKED: Method '${prop}' is strictly forbidden on source MongoDB during migration!`
        );
      }
      const val = target[prop];
      if (typeof val === "function") {
        return val.bind(target);
      }
      return val;
    },
  });
}

/**
 * Initializes read-only MongoDB connection.
 */
export async function connectMongo() {
  if (mongoConnection && mongoConnection.readyState === 1) {
    return mongoConnection;
  }

  if (!config.mongoUri) {
    throw new Error(
      "Missing MongoDB connection URI. Please ensure MONGO_URI or MONGODB_URI is defined."
    );
  }

  logger.info(`Connecting to MongoDB (Read-Only) at ${config.sanitizedMongoUri}...`);

  // Create isolated connection to avoid altering application's active mongoose default connection
  mongoConnection = await mongoose.createConnection(config.mongoUri, {
    readPreference: "secondaryPreferred",
    autoIndex: false, // Prevent index modifications on source
  }).asPromise();

  logger.info("Connected to MongoDB source successfully.");
  return mongoConnection;
}

/**
 * Closes the isolated MongoDB connection.
 */
export async function disconnectMongo() {
  if (mongoConnection) {
    await mongoConnection.close();
    mongoConnection = null;
    logger.info("Disconnected from MongoDB source.");
  }
}

/**
 * Returns a read-only wrapped native collection.
 */
export function getReadOnlyCollection(collectionName) {
  if (!mongoConnection || mongoConnection.readyState !== 1) {
    throw new Error("MongoDB connection is not established. Call connectMongo() first.");
  }
  const rawCollection = mongoConnection.db.collection(collectionName);
  return createReadOnlyCollectionProxy(rawCollection);
}

/**
 * Counts documents matching a query in a collection.
 */
export async function countSourceDocuments(collectionName, filter = {}) {
  const col = getReadOnlyCollection(collectionName);
  return col.countDocuments(filter);
}

/**
 * Creates a streamable/cursor-based query iterator.
 */
export function createSourceCursor(collectionName, filter = {}, sort = { _id: 1 }, batchSize = config.batchSize) {
  const col = getReadOnlyCollection(collectionName);
  return col.find(filter).sort(sort).batchSize(batchSize);
}

/**
 * In-memory LRU-style cache for MongoDB document existence checks.
 */
const mongoExistenceCache = new Map();

/**
 * Checks whether a document exists in MongoDB by collection and ID.
 * Results are cached in memory to avoid repeated roundtrips.
 */
export async function checkDocumentExistsInMongo(collectionName, id) {
  if (!id) return false;
  const strId = id.toString().trim();
  const cacheKey = `${collectionName}:${strId}`;
  if (mongoExistenceCache.has(cacheKey)) {
    return mongoExistenceCache.get(cacheKey);
  }

  if (!mongoConnection || mongoConnection.readyState !== 1) {
    return false;
  }

  try {
    const col = getReadOnlyCollection(collectionName);
    let mongoId;
    try {
      mongoId = new mongoose.Types.ObjectId(strId);
    } catch {
      mongoId = strId;
    }
    const count = await col.countDocuments({ _id: mongoId }, { limit: 1 });
    const exists = count > 0;
    mongoExistenceCache.set(cacheKey, exists);
    return exists;
  } catch (err) {
    logger.warn(`Error checking existence in MongoDB for ${collectionName}:${strId}: ${err.message}`);
    return false;
  }
}

export function clearMongoExistenceCache() {
  mongoExistenceCache.clear();
}

/**
 * Returns database name.
 */
export function getMongoDatabaseName() {
  return mongoConnection && mongoConnection.db ? mongoConnection.db.databaseName : "unknown";
}

export default {
  connectMongo,
  disconnectMongo,
  getReadOnlyCollection,
  countSourceDocuments,
  createSourceCursor,
  checkDocumentExistsInMongo,
  clearMongoExistenceCache,
  getMongoDatabaseName,
};
