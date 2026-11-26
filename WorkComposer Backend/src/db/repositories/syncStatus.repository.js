import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

const VALID_DESKTOP_SYNC_STATUSES = new Set(["synced", "syncing", "offline"]);

const ALLOWED_FILTER_FIELDS = new Set(["user", "userId", "_id", "id"]);

const ALLOWED_UPDATE_FIELDS = new Set([
  "status",
  "lastSync",
  "pendingUploads",
]);

const ALLOWED_PASSTHROUGH_FIELDS = new Set([
  "_id",
  "id",
  "user",
  "userId",
  "createdAt",
  "updatedAt",
  "__v",
  "$set",
  "$setOnInsert",
  "save",
  "toObject",
  "toJSON",
  "isModified",
  "set",
  "markModified",
  "populate",
  "runValidators",
  "deleteOne",
]);

function extractAndValidateScalarId(raw, fieldName) {
  if (raw === null || raw === undefined) {
    throw new Error(`Invalid identifier in SyncStatusRepository for field: ${fieldName}`);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "[object Object]") {
      throw new Error(`Invalid identifier in SyncStatusRepository for field: ${fieldName}`);
    }
    return trimmed;
  }
  if (typeof raw === "number") {
    if (isNaN(raw)) {
      throw new Error(`Invalid identifier in SyncStatusRepository for field: ${fieldName}`);
    }
    return String(raw);
  }
  if (typeof raw === "boolean") {
    throw new Error(`Invalid identifier in SyncStatusRepository for field: ${fieldName}`);
  }
  if (typeof raw === "object") {
    if (typeof raw.toHexString === "function") {
      const hex = raw.toHexString();
      if (hex && typeof hex === "string" && hex.trim() && hex !== "[object Object]") {
        return hex.trim();
      }
    }
    if (raw._id !== undefined && raw._id !== null) {
      return extractAndValidateScalarId(raw._id, fieldName);
    }
    if (raw.id !== undefined && raw.id !== null) {
      return extractAndValidateScalarId(raw.id, fieldName);
    }
    if (typeof raw.toString === "function" && raw.constructor && raw.constructor.name === "ObjectId") {
      const str = raw.toString().trim();
      if (str && str !== "[object Object]") {
        return str;
      }
    }
    throw new Error(`Invalid identifier in SyncStatusRepository for field: ${fieldName}`);
  }
  throw new Error(`Invalid identifier in SyncStatusRepository for field: ${fieldName}`);
}

function isSameValue(valA, valB) {
  if (valA === valB) return true;
  if (valA === null || valB === null || valA === undefined || valB === undefined) return valA === valB;
  if (valA instanceof Date || valB instanceof Date) {
    const tA = new Date(valA).getTime();
    const tB = new Date(valB).getTime();
    return !isNaN(tA) && !isNaN(tB) && tA === tB;
  }
  if (typeof valA === "number" && typeof valB === "number") {
    return valA === valB;
  }
  const toId = (val) => {
    if (!val) return null;
    if (typeof val === "string") return val.trim();
    if (typeof val === "object") {
      if (val._id) return String(val._id).trim();
      if (val.id) return String(val.id).trim();
      if (typeof val.toHexString === "function") return val.toHexString().trim();
    }
    return null;
  };
  const idA = toId(valA);
  const idB = toId(valB);
  if (idA && idB) return idA === idB;
  if (typeof valA === "object" && typeof valB === "object") {
    return JSON.stringify(valA) === JSON.stringify(valB);
  }
  return String(valA) === String(valB);
}

function isUserUniqueConstraintError(err) {
  if (!err) return false;
  if (err.code === "P2002") {
    const target = err.meta?.target;
    if (Array.isArray(target)) {
      const matches = target.some(
        (t) =>
          t === "user_id" ||
          t === "userId" ||
          (typeof t === "string" &&
            (t.includes("user_id") ||
              t.includes("userId") ||
              t.includes("sync_statuses_user_id_key")))
      );
      if (matches) return true;
    } else if (typeof target === "string") {
      if (
        target.includes("user_id") ||
        target.includes("userId") ||
        target.includes("sync_statuses_user_id_key")
      ) {
        return true;
      }
    }
    if (typeof err.message === "string") {
      return (
        err.message.includes("user_id") ||
        err.message.includes("userId") ||
        err.message.includes("sync_statuses_user_id_key")
      );
    }
  }
  return false;
}

/**
 * Resolves whether to return the post-update document (true) or pre-update document (false).
 * Precedence:
 * 1. options.returnDocument: "after" -> true, "before" -> false
 * 2. options.new: true -> true, false -> false
 * 3. options.returnOriginal: false -> true, true -> false
 * 4. Default: false (return pre-update document, matching native Mongoose findOneAndUpdate)
 */
function resolveReturnUpdated(options = {}) {
  if (!options || typeof options !== "object") return false;
  if (options.returnDocument === "after") return true;
  if (options.returnDocument === "before") return false;
  if (options.new !== undefined) return Boolean(options.new);
  if (options.returnOriginal !== undefined) return !options.returnOriginal;
  return false;
}

export class SyncStatusRepository extends BaseRepository {
  constructor() {
    super("SyncStatus");
  }

  formatSyncStatus(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    if (serialized.id && !serialized._id) serialized._id = String(serialized.id);
    if (serialized._id && !serialized.id) serialized.id = String(serialized._id);
    serialized.user = serialized.user || serialized.userId;
    delete serialized.userId;
    return serialized;
  }

  buildWhere(filter = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("SyncStatusRepository query requires a valid filter object");
    }

    const where = {};
    for (const key of Object.keys(filter)) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in SyncStatusRepository: ${key}`);
      }
      if (!ALLOWED_FILTER_FIELDS.has(key)) {
        throw new Error(`Unsupported filter field in SyncStatusRepository: ${key}`);
      }
    }

    let filterUserId = null;
    if (filter.user !== undefined) {
      filterUserId = extractAndValidateScalarId(filter.user, "user");
    }
    if (filter.userId !== undefined) {
      const uId = extractAndValidateScalarId(filter.userId, "userId");
      if (filterUserId && filterUserId !== uId) {
        throw new Error("Conflicting user filters in SyncStatusRepository");
      }
      filterUserId = uId;
    }

    let filterId = null;
    if (filter._id !== undefined) {
      filterId = extractAndValidateScalarId(filter._id, "_id");
    }
    if (filter.id !== undefined) {
      const idVal = extractAndValidateScalarId(filter.id, "id");
      if (filterId && filterId !== idVal) {
        throw new Error("Conflicting id filters in SyncStatusRepository");
      }
      filterId = idVal;
    }

    if (!filterUserId && !filterId) {
      throw new Error("SyncStatusRepository query requires a scoped filter object");
    }

    if (filterUserId) where.userId = filterUserId;
    if (filterId) where.id = filterId;

    return where;
  }

  async findById(id) {
    if (isPostgres()) {
      try {
        const idStr = extractAndValidateScalarId(id, "id");
        const doc = await this.delegate.findUnique({ where: { id: idStr } });
        return doc ? this.formatSyncStatus(doc) : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    const idStr = this.toIdString(id);
    const doc = await this.mongooseModel.findById(idStr);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findOne(filter = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const doc = await this.delegate.findFirst({ where });
        return doc ? this.formatSyncStatus(doc) : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOne(filter);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findOneAndUpdate(filter, update, options = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("SyncStatusRepository.findOneAndUpdate requires a valid filter object");
    }

    if (!update || typeof update !== "object" || Array.isArray(update)) {
      throw new Error("SyncStatusRepository.findOneAndUpdate requires a valid update object");
    }

    if (isPostgres()) {
      try {
        const filterKeys = Object.keys(filter);
        if (filterKeys.length === 0) {
          throw new Error("SyncStatusRepository.findOneAndUpdate requires a scoped filter object");
        }

        for (const key of filterKeys) {
          if (key.startsWith("$")) {
            throw new Error(`Unsupported filter operator in SyncStatusRepository: ${key}`);
          }
          if (!ALLOWED_FILTER_FIELDS.has(key)) {
            throw new Error(`Unsupported filter field in SyncStatusRepository: ${key}`);
          }
        }

        let filterUserId = null;
        if (filter.user !== undefined) {
          filterUserId = extractAndValidateScalarId(filter.user, "user");
        }
        if (filter.userId !== undefined) {
          const uId = extractAndValidateScalarId(filter.userId, "userId");
          if (filterUserId && filterUserId !== uId) {
            throw new Error("Conflicting user filters in SyncStatusRepository");
          }
          filterUserId = uId;
        }

        let filterId = null;
        if (filter._id !== undefined) {
          filterId = extractAndValidateScalarId(filter._id, "_id");
        }
        if (filter.id !== undefined) {
          const idVal = extractAndValidateScalarId(filter.id, "id");
          if (filterId && filterId !== idVal) {
            throw new Error("Conflicting id filters in SyncStatusRepository");
          }
          filterId = idVal;
        }

        if (!filterUserId) {
          throw new Error("SyncStatusRepository.findOneAndUpdate requires a valid user identifier");
        }

        const where = {
          userId: filterUserId,
        };
        if (filterId) {
          where.id = filterId;
        }

        // Validate update operators
        for (const key of Object.keys(update)) {
          if (key.startsWith("$") && key !== "$set" && key !== "$setOnInsert") {
            throw new Error(`Unsupported update operator in SyncStatusRepository: ${key}`);
          }
        }

        if (update.$set !== undefined) {
          if (!update.$set || typeof update.$set !== "object" || Array.isArray(update.$set)) {
            throw new Error("Invalid $set envelope in SyncStatusRepository.findOneAndUpdate");
          }
          for (const key of Object.keys(update.$set)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in SyncStatusRepository: ${key}`);
            }
          }
        }

        if (update.$setOnInsert !== undefined) {
          if (!update.$setOnInsert || typeof update.$setOnInsert !== "object" || Array.isArray(update.$setOnInsert)) {
            throw new Error("Invalid $setOnInsert envelope in SyncStatusRepository.findOneAndUpdate");
          }
          for (const key of Object.keys(update.$setOnInsert)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in SyncStatusRepository: ${key}`);
            }
          }
        }

        const directFields = { ...update };
        delete directFields.$set;
        delete directFields.$setOnInsert;
        const setFields = update.$set || {};
        const setOnInsertFields = update.$setOnInsert || {};

        for (const key of Object.keys(setFields)) {
          if (directFields[key] !== undefined) {
            if (!isSameValue(directFields[key], setFields[key])) {
              throw new Error(`Conflicting update values for field '${key}' between direct payload and $set envelope`);
            }
          }
        }

        const rawPayload = { ...directFields, ...setFields };

        // Validate allowed update fields
        for (const key of Object.keys(rawPayload)) {
          if (typeof rawPayload[key] === "function") {
            continue;
          }
          if (!ALLOWED_UPDATE_FIELDS.has(key) && !ALLOWED_PASSTHROUGH_FIELDS.has(key)) {
            throw new Error(`Unsupported update field in SyncStatusRepository: ${key}`);
          }
        }

        // Validate alias conflicts in rawPayload
        if (rawPayload._id !== undefined && rawPayload.id !== undefined) {
          const idA = extractAndValidateScalarId(rawPayload._id, "_id");
          const idB = extractAndValidateScalarId(rawPayload.id, "id");
          if (idA !== idB) {
            throw new Error("Conflicting update values for '_id' and 'id' in SyncStatusRepository");
          }
        }
        if (rawPayload.user !== undefined && rawPayload.userId !== undefined) {
          const uA = extractAndValidateScalarId(rawPayload.user, "user");
          const uB = extractAndValidateScalarId(rawPayload.userId, "userId");
          if (uA !== uB) {
            throw new Error("Conflicting update values for 'user' and 'userId' in SyncStatusRepository");
          }
        }

        // Validate alias conflicts in $setOnInsert
        if (setOnInsertFields.user !== undefined && setOnInsertFields.userId !== undefined) {
          const uA = extractAndValidateScalarId(setOnInsertFields.user, "user");
          const uB = extractAndValidateScalarId(setOnInsertFields.userId, "userId");
          if (uA !== uB) {
            throw new Error("Conflicting $setOnInsert values for 'user' and 'userId' in SyncStatusRepository");
          }
        }
        const insertUser = setOnInsertFields.user ?? setOnInsertFields.userId;
        if (insertUser !== undefined && filterUserId) {
          const insertUserId = extractAndValidateScalarId(insertUser, "user");
          if (insertUserId !== filterUserId) {
            throw new Error("Cannot reassign user: $setOnInsert user does not match filter");
          }
        }

        if (rawPayload.user !== undefined && filterUserId) {
          const updateUserId = extractAndValidateScalarId(rawPayload.user, "user");
          if (updateUserId !== filterUserId) {
            throw new Error("Cannot update immutable field: userId");
          }
        }
        if (rawPayload.userId !== undefined && filterUserId) {
          const updateUserId = extractAndValidateScalarId(rawPayload.userId, "userId");
          if (updateUserId !== filterUserId) {
            throw new Error("Cannot update immutable field: userId");
          }
        }

        const returnUpdated = resolveReturnUpdated(options);

        const existing = await this.delegate.findFirst({ where });

        if (existing) {
          if (rawPayload._id !== undefined) {
            const idVal = extractAndValidateScalarId(rawPayload._id, "_id");
            if (idVal !== existing.id) {
              throw new Error("Cannot update immutable field: _id");
            }
          }
          if (rawPayload.id !== undefined) {
            const idVal = extractAndValidateScalarId(rawPayload.id, "id");
            if (idVal !== existing.id) {
              throw new Error("Cannot update immutable field: id");
            }
          }
          if (rawPayload.user !== undefined) {
            const userVal = extractAndValidateScalarId(rawPayload.user, "user");
            if (userVal !== existing.userId) {
              throw new Error("Cannot update immutable field: userId");
            }
          }
          if (rawPayload.userId !== undefined) {
            const userVal = extractAndValidateScalarId(rawPayload.userId, "userId");
            if (userVal !== existing.userId) {
              throw new Error("Cannot update immutable field: userId");
            }
          }
          if (rawPayload.createdAt !== undefined) {
            const existingCreated = existing.createdAt instanceof Date ? existing.createdAt.getTime() : new Date(existing.createdAt).getTime();
            const payloadCreated = rawPayload.createdAt instanceof Date ? rawPayload.createdAt.getTime() : new Date(rawPayload.createdAt).getTime();
            if (isNaN(payloadCreated) || payloadCreated !== existingCreated) {
              throw new Error("Cannot update immutable field: createdAt");
            }
          }

          const updateData = {};
          if (rawPayload.status !== undefined) {
            if (typeof rawPayload.status !== "string" || !VALID_DESKTOP_SYNC_STATUSES.has(rawPayload.status.trim())) {
              throw new Error(`Invalid status in SyncStatusRepository update: ${rawPayload.status}`);
            }
            updateData.status = rawPayload.status.trim();
          }

          if (rawPayload.lastSync !== undefined) {
            if (rawPayload.lastSync === null) {
              throw new Error("Invalid lastSync in SyncStatusRepository update: cannot be null");
            }
            const d = rawPayload.lastSync instanceof Date ? rawPayload.lastSync : new Date(rawPayload.lastSync);
            if (isNaN(d.getTime())) {
              throw new Error("Invalid lastSync in SyncStatusRepository update");
            }
            updateData.lastSync = d;
          }

          if (rawPayload.pendingUploads !== undefined) {
            if (rawPayload.pendingUploads === null) {
              throw new Error("Invalid pendingUploads in SyncStatusRepository update: cannot be null");
            }
            const num = Number(rawPayload.pendingUploads);
            if (isNaN(num) || !Number.isInteger(num) || num < 0) {
              throw new Error("Invalid pendingUploads in SyncStatusRepository update");
            }
            updateData.pendingUploads = num;
          }

          if (Object.keys(updateData).length > 0) {
            const updated = await this.delegate.update({
              where: { id: existing.id },
              data: updateData,
            });
            return returnUpdated ? this.formatSyncStatus(updated) : this.formatSyncStatus(existing);
          }

          return this.formatSyncStatus(existing);
        } else if (options && options.upsert) {
          const targetUserId = filterUserId || (rawPayload.userId ? extractAndValidateScalarId(rawPayload.userId, "userId") : null) || (rawPayload.user ? extractAndValidateScalarId(rawPayload.user, "user") : null);
          if (!targetUserId) {
            throw new Error("Cannot upsert SyncStatus without valid user identifier");
          }

          const updateData = {};
          if (rawPayload.status !== undefined) {
            if (typeof rawPayload.status !== "string" || !VALID_DESKTOP_SYNC_STATUSES.has(rawPayload.status.trim())) {
              throw new Error(`Invalid status in SyncStatusRepository update: ${rawPayload.status}`);
            }
            updateData.status = rawPayload.status.trim();
          }
          if (rawPayload.lastSync !== undefined) {
            if (rawPayload.lastSync === null) {
              throw new Error("Invalid lastSync in SyncStatusRepository update: cannot be null");
            }
            const d = rawPayload.lastSync instanceof Date ? rawPayload.lastSync : new Date(rawPayload.lastSync);
            if (isNaN(d.getTime())) {
              throw new Error("Invalid lastSync in SyncStatusRepository update");
            }
            updateData.lastSync = d;
          }
          if (rawPayload.pendingUploads !== undefined) {
            if (rawPayload.pendingUploads === null) {
              throw new Error("Invalid pendingUploads in SyncStatusRepository update: cannot be null");
            }
            const num = Number(rawPayload.pendingUploads);
            if (isNaN(num) || !Number.isInteger(num) || num < 0) {
              throw new Error("Invalid pendingUploads in SyncStatusRepository update");
            }
            updateData.pendingUploads = num;
          }

          // Validate $setOnInsert fields if present
          if (setOnInsertFields.status !== undefined) {
            if (typeof setOnInsertFields.status !== "string" || !VALID_DESKTOP_SYNC_STATUSES.has(setOnInsertFields.status.trim())) {
              throw new Error(`Invalid status in SyncStatusRepository $setOnInsert: ${setOnInsertFields.status}`);
            }
          }
          if (setOnInsertFields.lastSync !== undefined && setOnInsertFields.lastSync !== null) {
            const d = setOnInsertFields.lastSync instanceof Date ? setOnInsertFields.lastSync : new Date(setOnInsertFields.lastSync);
            if (isNaN(d.getTime())) {
              throw new Error("Invalid lastSync in SyncStatusRepository $setOnInsert");
            }
          }
          if (setOnInsertFields.pendingUploads !== undefined && setOnInsertFields.pendingUploads !== null) {
            const num = Number(setOnInsertFields.pendingUploads);
            if (isNaN(num) || !Number.isInteger(num) || num < 0) {
              throw new Error("Invalid pendingUploads in SyncStatusRepository $setOnInsert");
            }
          }

          const newId = (rawPayload._id || rawPayload.id || setOnInsertFields._id || setOnInsertFields.id || filterId)
            ? extractAndValidateScalarId(rawPayload._id || rawPayload.id || setOnInsertFields._id || setOnInsertFields.id || filterId, "id")
            : generateId();

          const createData = {
            id: newId,
            userId: targetUserId,
            status: updateData.status || setOnInsertFields.status || "synced",
            lastSync: updateData.lastSync || (setOnInsertFields.lastSync ? new Date(setOnInsertFields.lastSync) : new Date()),
            pendingUploads: updateData.pendingUploads !== undefined ? updateData.pendingUploads : (setOnInsertFields.pendingUploads !== undefined ? Number(setOnInsertFields.pendingUploads) : 0),
          };

          try {
            const created = await this.delegate.create({ data: createData });
            return returnUpdated ? this.formatSyncStatus(created) : null;
          } catch (createErr) {
            if (isUserUniqueConstraintError(createErr)) {
              const concurrentExisting = await this.delegate.findFirst({
                where: { userId: targetUserId },
              });
              if (concurrentExisting) {
                if (Object.keys(updateData).length > 0) {
                  const updated = await this.delegate.update({
                    where: { id: concurrentExisting.id },
                    data: updateData,
                  });
                  return returnUpdated
                    ? this.formatSyncStatus(updated)
                    : this.formatSyncStatus(concurrentExisting);
                }
                return this.formatSyncStatus(concurrentExisting);
              }
            }
            throw createErr;
          }
        }

        return null;
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOneAndUpdate(filter, update, options);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async create(data) {
    if (isPostgres()) {
      try {
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          throw new Error("SyncStatusRepository.create requires a valid data object");
        }

        const userId = extractAndValidateScalarId(data.user ?? data.userId, "user");
        const newId = data._id || data.id ? extractAndValidateScalarId(data._id || data.id, "id") : generateId();

        let status = "synced";
        if (data.status !== undefined) {
          if (typeof data.status !== "string" || !VALID_DESKTOP_SYNC_STATUSES.has(data.status.trim())) {
            throw new Error(`Invalid status in SyncStatusRepository create: ${data.status}`);
          }
          status = data.status.trim();
        }

        let lastSync = new Date();
        if (data.lastSync !== undefined) {
          if (data.lastSync === null) {
            throw new Error("Invalid lastSync in SyncStatusRepository create: cannot be null");
          }
          const d = data.lastSync instanceof Date ? data.lastSync : new Date(data.lastSync);
          if (isNaN(d.getTime())) {
            throw new Error("Invalid lastSync in SyncStatusRepository create");
          }
          lastSync = d;
        }

        let pendingUploads = 0;
        if (data.pendingUploads !== undefined) {
          if (data.pendingUploads === null) {
            throw new Error("Invalid pendingUploads in SyncStatusRepository create: cannot be null");
          }
          const num = Number(data.pendingUploads);
          if (isNaN(num) || !Number.isInteger(num) || num < 0) {
            throw new Error("Invalid pendingUploads in SyncStatusRepository create");
          }
          pendingUploads = num;
        }

        const createData = {
          id: newId,
          userId,
          status,
          lastSync,
          pendingUploads,
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatSyncStatus(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.create(data);
    return this.serialize(doc.toObject ? doc.toObject() : doc);
  }
}

export const syncStatusRepository = new SyncStatusRepository();
export default syncStatusRepository;

