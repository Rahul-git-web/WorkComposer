import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

const ALLOWED_METADATA_PATHS = new Set([
  "eventKey",
  "date",
  "commentId",
  "taskId",
  "requestedBy",
  "approvedBy",
  "rejectedBy",
]);

const ALLOWED_NOTIFICATION_FILTER_FIELDS = new Set([
  "_id",
  "id",
  "recipient",
  "recipientId",
  "organization",
  "organizationId",
  "type",
  "title",
  "entityType",
  "entityId",
  "read",
  "readAt",
  "createdAt",
  "metadata",
]);

const ALLOWED_NOTIFICATION_UPDATE_FIELDS = new Set([
  "read",
  "readAt",
  "title",
  "message",
  "type",
  "entityType",
  "entityId",
  "metadata",
]);

const ALLOWED_NOTIFICATION_PASSTHROUGH_FIELDS = new Set([
  "_id",
  "id",
  "recipient",
  "recipientId",
  "organization",
  "organizationId",
  "createdAt",
  "updatedAt",
  "__v",
  "$set",
  "isNew",
  "_isNew",
  "save",
  "toObject",
  "toJSON",
  "isModified",
  "deleteOne",
]);

const ALLOWED_DATE_OPERATORS = new Set([
  "$gte",
  "$lte",
  "$gt",
  "$lt",
  "gte",
  "lte",
  "gt",
  "lt",
]);

const isSameValue = (valA, valB) => {
  if (valA === valB) return true;
  if (valA === null || valA === undefined || valB === null || valB === undefined) {
    return valA === valB;
  }
  if (valA instanceof Date || valB instanceof Date) {
    const tA = new Date(valA).getTime();
    const tB = new Date(valB).getTime();
    return !isNaN(tA) && !isNaN(tB) && tA === tB;
  }
  if (typeof valA === "object" || typeof valB === "object") {
    try {
      return JSON.stringify(valA) === JSON.stringify(valB);
    } catch {
      return false;
    }
  }
  return false;
};

export class NotificationRepository extends BaseRepository {
  constructor() {
    super("Notification");
  }

  formatNotification(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc.toObject ? doc.toObject() : doc);
    if (!serialized.id && serialized._id) serialized.id = String(serialized._id);
    if (!serialized._id && serialized.id) serialized._id = String(serialized.id);
    serialized.recipient = serialized.recipient || serialized.recipientId;
    delete serialized.recipientId;
    serialized.organization = serialized.organization || serialized.organizationId;
    delete serialized.organizationId;
    return serialized;
  }

  _processMetadataValue(pathName, val) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid metadata value in NotificationRepository filter for field: ${pathName}`);
    }

    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
      return {
        path: [pathName],
        equals: val,
      };
    }

    if (typeof val === "object" && !Array.isArray(val)) {
      const keys = Object.keys(val);
      if (keys.length === 0) {
        throw new Error("Invalid metadata filter in NotificationRepository: empty object");
      }

      if (val.$eq !== undefined) {
        if (val.$eq === null || val.$eq === undefined) {
          throw new Error(`Invalid metadata value in NotificationRepository filter for field: ${pathName}`);
        }
        return {
          path: [pathName],
          equals: val.$eq,
        };
      }

      for (const op of keys) {
        if (op.startsWith("$")) {
          throw new Error(`Unsupported filter operator in NotificationRepository metadata filter: ${op}`);
        }
      }
    }

    throw new Error(`Invalid metadata value in NotificationRepository filter for field: ${pathName}`);
  }

  _validateScalarId(val, fieldName) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in NotificationRepository filter for field: ${fieldName}`);
    }

    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) {
        throw new Error(`Invalid identifier in NotificationRepository filter for field: ${fieldName}`);
      }
      return trimmed;
    }

    if (typeof val === "object") {
      const candidate = val._id || val.id;
      if (candidate && typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
      if (candidate && typeof candidate.toString === "function") {
        const str = candidate.toString().trim();
        if (str && str !== "[object Object]") {
          return str;
        }
      }

      if (typeof val.toHexString === "function") {
        const hex = val.toHexString().trim();
        if (hex) return hex;
      }
      if (typeof val.toString === "function") {
        const str = val.toString().trim();
        if (str && str !== "[object Object]") {
          return str;
        }
      }

      throw new Error(`Invalid identifier object in NotificationRepository filter: ${fieldName}`);
    }

    throw new Error(`Invalid identifier in NotificationRepository filter for field: ${fieldName}`);
  }

  _processIdFilter(val, fieldName) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in NotificationRepository filter for field: ${fieldName}`);
    }

    if (Array.isArray(val)) {
      if (val.length === 0) return { in: [] };
      return { in: val.map((item) => this._validateScalarId(item, fieldName)) };
    }

    if (typeof val === "object") {
      if (val.$in !== undefined) {
        if (!Array.isArray(val.$in)) {
          throw new Error(`Invalid array in NotificationRepository filter: ${fieldName}`);
        }
        if (val.$in.length === 0) return { in: [] };
        return { in: val.$in.map((item) => this._validateScalarId(item, fieldName)) };
      }
      if (val.in !== undefined) {
        if (!Array.isArray(val.in)) {
          throw new Error(`Invalid array in NotificationRepository filter: ${fieldName}`);
        }
        if (val.in.length === 0) return { in: [] };
        return { in: val.in.map((item) => this._validateScalarId(item, fieldName)) };
      }

      for (const k of Object.keys(val)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in NotificationRepository: ${k}`);
        }
      }

      return this._validateScalarId(val, fieldName);
    }

    return this._validateScalarId(val, fieldName);
  }

  _processDateFilter(raw, fieldName) {
    if (raw === null || raw === undefined) {
      throw new Error(`Invalid date value in NotificationRepository filter: ${fieldName}`);
    }

    if (raw instanceof Date) {
      if (isNaN(raw.getTime())) {
        throw new Error(`Invalid date value in NotificationRepository filter: ${fieldName}`);
      }
      return raw;
    }

    if (typeof raw === "string" || typeof raw === "number") {
      const d = new Date(raw);
      if (isNaN(d.getTime())) {
        throw new Error(`Invalid date value in NotificationRepository filter: ${fieldName}`);
      }
      return d;
    }

    if (typeof raw === "object" && !Array.isArray(raw)) {
      const keys = Object.keys(raw);
      if (keys.length === 0) {
        throw new Error(`Invalid date range in NotificationRepository filter: ${fieldName} cannot be an empty object`);
      }

      for (const op of keys) {
        if (!ALLOWED_DATE_OPERATORS.has(op)) {
          if (op.startsWith("$")) {
            throw new Error(`Unsupported filter operator in NotificationRepository: ${op}`);
          }
          throw new Error(`Unsupported date range operator in NotificationRepository: ${op}`);
        }
      }

      const dateCond = {};
      const parseDate = (val, op) => {
        if (val === null || val === undefined || (typeof val === "string" && !val.trim())) {
          throw new Error(`Invalid date value for operator ${op} in NotificationRepository filter: ${fieldName}`);
        }
        const parsed = val instanceof Date ? val : new Date(val);
        if (isNaN(parsed.getTime())) {
          throw new Error(`Invalid date value for operator ${op} in NotificationRepository filter: ${fieldName}`);
        }
        return parsed;
      };

      if (raw.$gte !== undefined) dateCond.gte = parseDate(raw.$gte, "$gte");
      if (raw.gte !== undefined) dateCond.gte = parseDate(raw.gte, "gte");
      if (raw.$gt !== undefined) dateCond.gt = parseDate(raw.$gt, "$gt");
      if (raw.gt !== undefined) dateCond.gt = parseDate(raw.gt, "gt");
      if (raw.$lte !== undefined) dateCond.lte = parseDate(raw.$lte, "$lte");
      if (raw.lte !== undefined) dateCond.lte = parseDate(raw.lte, "lte");
      if (raw.$lt !== undefined) dateCond.lt = parseDate(raw.$lt, "$lt");
      if (raw.lt !== undefined) dateCond.lt = parseDate(raw.lt, "lt");

      const lowerBound = dateCond.gte || dateCond.gt;
      const upperBound = dateCond.lte || dateCond.lt;
      if (lowerBound && upperBound && lowerBound.getTime() > upperBound.getTime()) {
        throw new Error(`Invalid date range in NotificationRepository filter: lower bound cannot be after upper bound in ${fieldName}`);
      }

      return dateCond;
    }

    throw new Error(`Invalid date value in NotificationRepository filter: ${fieldName}`);
  }

  _normalizeUpdatePayload(update) {
    if (!update || typeof update !== "object" || Array.isArray(update)) {
      throw new Error("Invalid update payload in NotificationRepository");
    }

    for (const op of Object.keys(update)) {
      if (op.startsWith("$") && op !== "$set") {
        throw new Error(`Unsupported update operator in NotificationRepository: ${op}`);
      }
    }

    const rawPayload = {};
    const directKeys = Object.keys(update).filter((k) => k !== "$set");

    if (update.$set) {
      if (typeof update.$set !== "object" || Array.isArray(update.$set) || update.$set === null) {
        throw new Error("Invalid $set payload in NotificationRepository");
      }
      for (const [k, v] of Object.entries(update.$set)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported update operator in NotificationRepository $set: ${k}`);
        }
        if (directKeys.includes(k) && !isSameValue(update[k], v)) {
          throw new Error(`Conflicting update values for field '${k}' in NotificationRepository`);
        }
        rawPayload[k] = v;
      }
    }

    for (const k of directKeys) {
      if (!(k in rawPayload)) {
        rawPayload[k] = update[k];
      }
    }

    for (const k of Object.keys(rawPayload)) {
      if (k.startsWith("$")) {
        throw new Error(`Unsupported update operator in NotificationRepository: ${k}`);
      }
      if (!ALLOWED_NOTIFICATION_UPDATE_FIELDS.has(k) && !ALLOWED_NOTIFICATION_PASSTHROUGH_FIELDS.has(k)) {
        throw new Error(`Unsupported update field in NotificationRepository: ${k}`);
      }
    }

    return rawPayload;
  }

  buildWhere(filter = {}) {
    const where = {};
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("Invalid filter object in NotificationRepository");
    }

    for (const k of Object.keys(filter)) {
      if (k.startsWith("$")) {
        throw new Error(`Unsupported filter operator in NotificationRepository: ${k}`);
      }
      if (k.startsWith("metadata.")) {
        continue;
      }
      if (k.includes(".")) {
        throw new Error(`Unsupported filter field in NotificationRepository: ${k}`);
      }
      if (!ALLOWED_NOTIFICATION_FILTER_FIELDS.has(k)) {
        throw new Error(`Unsupported filter field in NotificationRepository: ${k}`);
      }
    }

    if (filter._id !== undefined && filter.id !== undefined) {
      const parsed1 = this._processIdFilter(filter._id, "_id");
      const parsed2 = this._processIdFilter(filter.id, "id");
      if (!isSameValue(parsed1, parsed2)) {
        throw new Error("Conflicting _id and id in NotificationRepository filter");
      }
      where.id = parsed1;
    } else if (filter._id !== undefined) {
      where.id = this._processIdFilter(filter._id, "_id");
    } else if (filter.id !== undefined) {
      where.id = this._processIdFilter(filter.id, "id");
    }

    if (filter.recipient !== undefined && filter.recipientId !== undefined) {
      const parsed1 = this._processIdFilter(filter.recipient, "recipient");
      const parsed2 = this._processIdFilter(filter.recipientId, "recipientId");
      if (!isSameValue(parsed1, parsed2)) {
        throw new Error("Conflicting recipient and recipientId in NotificationRepository filter");
      }
      where.recipientId = parsed1;
    } else if (filter.recipient !== undefined) {
      where.recipientId = this._processIdFilter(filter.recipient, "recipient");
    } else if (filter.recipientId !== undefined) {
      where.recipientId = this._processIdFilter(filter.recipientId, "recipientId");
    }

    if (filter.organization !== undefined && filter.organizationId !== undefined) {
      const parsed1 = this._processIdFilter(filter.organization, "organization");
      const parsed2 = this._processIdFilter(filter.organizationId, "organizationId");
      if (!isSameValue(parsed1, parsed2)) {
        throw new Error("Conflicting organization and organizationId in NotificationRepository filter");
      }
      where.organizationId = parsed1;
    } else if (filter.organization !== undefined) {
      where.organizationId = this._processIdFilter(filter.organization, "organization");
    } else if (filter.organizationId !== undefined) {
      where.organizationId = this._processIdFilter(filter.organizationId, "organizationId");
    }

    if (filter.type !== undefined) {
      if (typeof filter.type === "string") {
        where.type = filter.type;
      } else if (Array.isArray(filter.type)) {
        where.type = filter.type.length === 0 ? { in: [] } : { in: filter.type };
      } else if (typeof filter.type === "object" && filter.type !== null) {
        if (filter.type.$in !== undefined) {
          if (!Array.isArray(filter.type.$in)) throw new Error("Invalid array in NotificationRepository filter: type");
          where.type = filter.type.$in.length === 0 ? { in: [] } : { in: filter.type.$in };
        } else if (filter.type.in !== undefined) {
          if (!Array.isArray(filter.type.in)) throw new Error("Invalid array in NotificationRepository filter: type");
          where.type = filter.type.in.length === 0 ? { in: [] } : { in: filter.type.in };
        } else {
          for (const k of Object.keys(filter.type)) {
            if (k.startsWith("$")) throw new Error(`Unsupported filter operator in NotificationRepository: ${k}`);
          }
          where.type = filter.type;
        }
      } else {
        where.type = filter.type;
      }
    }

    if (filter.title !== undefined) {
      where.title = String(filter.title);
    }

    if (filter.entityType !== undefined) {
      where.entityType = filter.entityType === null ? null : String(filter.entityType);
    }

    if (filter.entityId !== undefined) {
      where.entityId = filter.entityId === null ? null : this._processIdFilter(filter.entityId, "entityId");
    }

    if (filter.read !== undefined) {
      where.read = Boolean(filter.read);
    }

    if (filter.createdAt !== undefined) {
      where.createdAt = this._processDateFilter(filter.createdAt, "createdAt");
    }

    if (filter.readAt !== undefined) {
      where.readAt = filter.readAt === null ? null : this._processDateFilter(filter.readAt, "readAt");
    }

    for (const k of Object.keys(filter)) {
      if (k.startsWith("metadata.")) {
        const subPath = k.slice("metadata.".length);
        if (!ALLOWED_METADATA_PATHS.has(subPath)) {
          throw new Error(`Unsupported metadata field in NotificationRepository filter: ${subPath}`);
        }
        where.metadata = this._processMetadataValue(subPath, filter[k]);
      }
    }

    if (filter.metadata !== undefined) {
      if (typeof filter.metadata !== "object" || filter.metadata === null || Array.isArray(filter.metadata)) {
        throw new Error("Invalid metadata filter in NotificationRepository: metadata must be an object");
      }
      const metaKeys = Object.keys(filter.metadata);
      if (metaKeys.length === 0) {
        throw new Error("Invalid metadata filter in NotificationRepository: empty object");
      }
      for (const subPath of metaKeys) {
        if (!ALLOWED_METADATA_PATHS.has(subPath)) {
          throw new Error(`Unsupported metadata field in NotificationRepository filter: ${subPath}`);
        }
        where.metadata = this._processMetadataValue(subPath, filter.metadata[subPath]);
      }
    }

    return where;
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const queryOptions = { where };

        if (options.sort) {
          const [sortField, sortDir] = Object.entries(options.sort)[0] || ["createdAt", -1];
          const mappedField = sortField === "_id" ? "id" : sortField === "recipient" ? "recipientId" : sortField === "organization" ? "organizationId" : sortField;
          queryOptions.orderBy = { [mappedField]: sortDir === -1 || sortDir === "desc" ? "desc" : "asc" };
        } else {
          queryOptions.orderBy = { createdAt: "desc" };
        }
        if (options.skip !== undefined && options.skip !== null) queryOptions.skip = Number(options.skip);
        if (options.limit !== undefined && options.limit !== null) queryOptions.take = Number(options.limit);

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => this.formatNotification(d));
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.find(filter);
    if (options.sort) query = query.sort(options.sort);
    if (options.skip !== undefined && options.skip !== null) query = query.skip(Number(options.skip));
    if (options.limit !== undefined && options.limit !== null) query = query.limit(Number(options.limit));
    const docs = await query;
    return docs.map((d) => this.formatNotification(d));
  }

  async findById(id, options = {}) {
    const idStr = this.toIdString(id);
    if (!idStr || typeof idStr !== "string" || !idStr.trim() || idStr === "[object Object]") {
      return null;
    }

    if (isPostgres()) {
      try {
        const doc = await this.delegate.findUnique({
          where: { id: idStr },
        });
        return this.formatNotification(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findById(idStr);
    return doc ? this.formatNotification(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findOne(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const queryOptions = { where };
        if (options.sort) {
          const [sortField, sortDir] = Object.entries(options.sort)[0] || ["createdAt", -1];
          const mappedField = sortField === "_id" ? "id" : sortField === "recipient" ? "recipientId" : sortField === "organization" ? "organizationId" : sortField;
          queryOptions.orderBy = { [mappedField]: sortDir === -1 || sortDir === "desc" ? "desc" : "asc" };
        }
        const doc = await this.delegate.findFirst(queryOptions);
        return this.formatNotification(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.findOne(filter);
    if (options.sort) query = query.sort(options.sort);
    const doc = await query;
    return doc ? this.formatNotification(doc.toObject ? doc.toObject() : doc) : null;
  }

  async countDocuments(filter = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        return this.delegate.count({ where });
      } catch (err) {
        this.handleError(err);
      }
    }

    return this.mongooseModel.countDocuments(filter);
  }

  async exists(filter = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const doc = await this.delegate.findFirst({ where, select: { id: true } });
        return doc ? { _id: doc.id } : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    return this.mongooseModel.exists(filter);
  }

  async create(data) {
    if (!data || typeof data !== "object") {
      throw new Error("NotificationRepository.create requires a valid data object");
    }

    if (Array.isArray(data)) {
      if (isPostgres()) {
        const created = [];
        for (const item of data) {
          created.push(await this.create(item));
        }
        return created;
      }
      const docs = await this.mongooseModel.create(data);
      return docs.map((d) => this.formatNotification(d));
    }

    if (isPostgres()) {
      try {
        if (data.recipient && data.recipientId && this.toIdString(data.recipient) !== this.toIdString(data.recipientId)) {
          throw new Error("Conflicting recipient and recipientId in NotificationRepository create");
        }
        if (data.organization && data.organizationId && this.toIdString(data.organization) !== this.toIdString(data.organizationId)) {
          throw new Error("Conflicting organization and organizationId in NotificationRepository create");
        }

        const recipientId = this._validateScalarId(data.recipient || data.recipientId, "recipient");
        const organizationId = this._validateScalarId(data.organization || data.organizationId, "organization");
        const newId = data._id ? this.toIdString(data._id) : generateId();

        const createData = {
          id: newId,
          recipientId,
          organizationId,
          type: data.type || "system",
          title: data.title || "",
          message: data.message || "",
          entityType: data.entityType || null,
          entityId: data.entityId ? this.toIdString(data.entityId) : null,
          metadata: data.metadata || {},
          read: Boolean(data.read),
          readAt: data.readAt ? new Date(data.readAt) : null,
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatNotification(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.create(data);
    return this.formatNotification(doc);
  }

  async findOneAndUpdate(filter, update, options = {}) {
    if (isPostgres()) {
      try {
        const rawPayload = this._normalizeUpdatePayload(update);

        let existing = options._existing || null;
        if (!existing) {
          const filterKeys = Object.keys(filter);
          if (filterKeys.length === 1 && (filter._id || filter.id)) {
            const targetId = this.toIdString(filter._id || filter.id);
            existing = await this.findById(targetId);
          } else {
            existing = await this.findOne(filter);
          }
        }

        if (!existing) {
          return null;
        }

        const existingId = this.toIdString(existing.id || existing._id);
        const existingRecipientId = this.toIdString(existing.recipient || existing.recipientId);
        const existingOrgId = this.toIdString(existing.organization || existing.organizationId);

        if (rawPayload._id !== undefined && this.toIdString(rawPayload._id) !== existingId) {
          throw new Error("Cannot update immutable field: _id");
        }
        if (rawPayload.id !== undefined && this.toIdString(rawPayload.id) !== existingId) {
          throw new Error("Cannot update immutable field: id");
        }
        if (rawPayload.recipient !== undefined && this.toIdString(rawPayload.recipient) !== existingRecipientId) {
          throw new Error("Cannot update immutable field: recipient");
        }
        if (rawPayload.recipientId !== undefined && this.toIdString(rawPayload.recipientId) !== existingRecipientId) {
          throw new Error("Cannot update immutable field: recipientId");
        }
        if (rawPayload.organization !== undefined && this.toIdString(rawPayload.organization) !== existingOrgId) {
          throw new Error("Cannot update immutable field: organization");
        }
        if (rawPayload.organizationId !== undefined && this.toIdString(rawPayload.organizationId) !== existingOrgId) {
          throw new Error("Cannot update immutable field: organizationId");
        }
        if (rawPayload.createdAt !== undefined) {
          const existingCreated = existing.createdAt instanceof Date ? existing.createdAt.getTime() : new Date(existing.createdAt).getTime();
          const payloadCreated = rawPayload.createdAt instanceof Date ? rawPayload.createdAt.getTime() : new Date(rawPayload.createdAt).getTime();
          if (isNaN(payloadCreated) || payloadCreated !== existingCreated) {
            throw new Error("Cannot update immutable field: createdAt");
          }
        }

        const patch = {};

        if (rawPayload.read !== undefined) {
          const newRead = Boolean(rawPayload.read);
          if (newRead !== Boolean(existing.read)) {
            patch.read = newRead;
          }
        }

        if (rawPayload.readAt !== undefined) {
          const newDate = rawPayload.readAt ? new Date(rawPayload.readAt) : null;
          if (newDate && isNaN(newDate.getTime())) {
            throw new Error("Invalid readAt date in NotificationRepository update");
          }
          const existingDate = existing.readAt ? new Date(existing.readAt) : null;
          const bothNull = !newDate && !existingDate;
          const sameTime = newDate && existingDate && newDate.getTime() === existingDate.getTime();
          if (!bothNull && !sameTime) {
            patch.readAt = newDate;
          }
        }

        if (rawPayload.title !== undefined) {
          const newTitle = String(rawPayload.title).trim();
          if (newTitle !== (existing.title || "").trim()) {
            patch.title = newTitle;
          }
        }

        if (rawPayload.message !== undefined) {
          const newMessage = String(rawPayload.message).trim();
          if (newMessage !== (existing.message || "").trim()) {
            patch.message = newMessage;
          }
        }

        if (rawPayload.type !== undefined) {
          const newType = String(rawPayload.type).trim();
          if (newType !== (existing.type || "").trim()) {
            patch.type = newType;
          }
        }

        if (rawPayload.entityType !== undefined) {
          const newEntityType = rawPayload.entityType === null ? null : String(rawPayload.entityType).trim();
          if (newEntityType !== (existing.entityType || null)) {
            patch.entityType = newEntityType;
          }
        }

        if (rawPayload.entityId !== undefined) {
          const newEntityId = rawPayload.entityId === null ? null : this.toIdString(rawPayload.entityId);
          const existingEntityId = existing.entityId ? this.toIdString(existing.entityId) : null;
          if (newEntityId !== existingEntityId) {
            patch.entityId = newEntityId;
          }
        }

        if (rawPayload.metadata !== undefined) {
          if (typeof rawPayload.metadata !== "object" || rawPayload.metadata === null || Array.isArray(rawPayload.metadata)) {
            throw new Error("Invalid metadata in NotificationRepository update");
          }
          if (!isSameValue(rawPayload.metadata, existing.metadata || {})) {
            patch.metadata = rawPayload.metadata;
          }
        }

        if (Object.keys(patch).length === 0) {
          if (options._meta) options._meta.modified = false;
          return existing;
        }

        const updatedDoc = await this.delegate.update({
          where: { id: existingId },
          data: patch,
        });

        if (options._meta) options._meta.modified = true;

        const returnOriginal = options.new === false || options.returnDocument === "before";
        if (returnOriginal) {
          return existing;
        }

        return this.formatNotification(updatedDoc);
      } catch (err) {
        if (err && err.code === "P2025") {
          return null;
        }
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOneAndUpdate(filter, update, options);
    return doc ? this.formatNotification(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findByIdAndUpdate(id, update, options = { new: true }) {
    const idStr = this.toIdString(id);
    if (!idStr || typeof idStr !== "string" || !idStr.trim() || idStr === "[object Object]") {
      if (isPostgres()) {
        throw new Error("Invalid identifier in NotificationRepository.findByIdAndUpdate");
      }
      return null;
    }

    if (isPostgres()) {
      return this.findOneAndUpdate({ _id: idStr }, update, options);
    }

    const doc = await this.mongooseModel.findByIdAndUpdate(id, update, options);
    return doc ? this.formatNotification(doc.toObject ? doc.toObject() : doc) : null;
  }

  async updateById(id, update, options = { new: true }) {
    return this.findByIdAndUpdate(id, update, options);
  }

  async updateOne(filter, update, options = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("NotificationRepository.updateOne requires a valid filter object");
    }
    if (!update || typeof update !== "object" || Array.isArray(update)) {
      throw new Error("NotificationRepository.updateOne requires a valid update object");
    }

    if (isPostgres()) {
      try {
        const filterKeys = Object.keys(filter);
        let existing = null;
        if (filterKeys.length === 1 && (filter._id || filter.id)) {
          const targetId = this.toIdString(filter._id || filter.id);
          existing = await this.findById(targetId);
        } else {
          existing = await this.findOne(filter);
        }

        if (!existing) {
          return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
        }

        const meta = {};
        const updated = await this.findOneAndUpdate(filter, update, {
          ...options,
          _existing: existing,
          _meta: meta,
          new: true,
        });

        if (!updated) {
          return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
        }

        return {
          acknowledged: true,
          matchedCount: 1,
          modifiedCount: meta.modified ? 1 : 0,
        };
      } catch (err) {
        this.handleError(err);
      }
    }

    return await this.mongooseModel.updateOne(filter, update, options);
  }

  async updateMany(filter, update, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const rawPayload = this._normalizeUpdatePayload(update);

        if (rawPayload._id !== undefined) throw new Error("Cannot update immutable field: _id");
        if (rawPayload.id !== undefined) throw new Error("Cannot update immutable field: id");
        if (rawPayload.recipient !== undefined) throw new Error("Cannot update immutable field: recipient");
        if (rawPayload.recipientId !== undefined) throw new Error("Cannot update immutable field: recipientId");
        if (rawPayload.organization !== undefined) throw new Error("Cannot update immutable field: organization");
        if (rawPayload.organizationId !== undefined) throw new Error("Cannot update immutable field: organizationId");
        if (rawPayload.createdAt !== undefined) throw new Error("Cannot update immutable field: createdAt");

        const dataToUpdate = {};
        if (rawPayload.read !== undefined) dataToUpdate.read = Boolean(rawPayload.read);
        if (rawPayload.readAt !== undefined) {
          const newDate = rawPayload.readAt ? new Date(rawPayload.readAt) : null;
          if (newDate && isNaN(newDate.getTime())) {
            throw new Error("Invalid readAt date in NotificationRepository update");
          }
          dataToUpdate.readAt = newDate;
        }
        if (rawPayload.title !== undefined) dataToUpdate.title = String(rawPayload.title).trim();
        if (rawPayload.message !== undefined) dataToUpdate.message = String(rawPayload.message).trim();
        if (rawPayload.type !== undefined) dataToUpdate.type = String(rawPayload.type).trim();
        if (rawPayload.entityType !== undefined) {
          dataToUpdate.entityType = rawPayload.entityType === null ? null : String(rawPayload.entityType).trim();
        }
        if (rawPayload.entityId !== undefined) {
          dataToUpdate.entityId = rawPayload.entityId === null ? null : this.toIdString(rawPayload.entityId);
        }
        if (rawPayload.metadata !== undefined) {
          if (typeof rawPayload.metadata !== "object" || rawPayload.metadata === null || Array.isArray(rawPayload.metadata)) {
            throw new Error("Invalid metadata in NotificationRepository update");
          }
          dataToUpdate.metadata = rawPayload.metadata;
        }

        const res = await this.delegate.updateMany({
          where,
          data: dataToUpdate,
        });
        return { acknowledged: true, modifiedCount: res.count };
      } catch (err) {
        this.handleError(err);
      }
    }

    return this.mongooseModel.updateMany(filter, update, options);
  }

  async deleteMany(filter = {}, options = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("NotificationRepository.deleteMany requires a valid filter object");
    }

    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        if (Object.keys(where).length === 0) {
          throw new Error("Bulk deletion requires a valid scoped filter in NotificationRepository.deleteMany");
        }

        const res = await this.delegate.deleteMany({ where });
        return { acknowledged: true, deletedCount: res.count };
      } catch (err) {
        this.handleError(err);
      }
    }

    return await this.mongooseModel.deleteMany(filter, options);
  }

  async deleteOne(filter, options = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("NotificationRepository.deleteOne requires a valid filter object");
    }

    if (isPostgres()) {
      try {
        const doc = await this.findOne(filter);
        if (!doc) return { acknowledged: true, deletedCount: 0 };

        await this.delegate.delete({ where: { id: doc.id } });
        return { acknowledged: true, deletedCount: 1 };
      } catch (err) {
        if (err && err.code === "P2025") {
          return { acknowledged: true, deletedCount: 0 };
        }
        this.handleError(err);
      }
    }

    return await this.mongooseModel.deleteOne(filter);
  }

  async findByIdAndDelete(id, options = {}) {
    const idStr = this.toIdString(id);
    if (!idStr || typeof idStr !== "string" || !idStr.trim() || idStr === "[object Object]") {
      return null;
    }

    if (isPostgres()) {
      try {
        const existing = await this.delegate.findUnique({ where: { id: idStr } });
        if (!existing) return null;
        const doc = await this.delegate.delete({
          where: { id: idStr },
        });
        return doc ? this.formatNotification(doc) : null;
      } catch (err) {
        if (err && err.code === "P2025") {
          return null;
        }
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findByIdAndDelete(idStr, options);
    return doc ? this.formatNotification(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findOneAndDelete(filter, options = {}) {
    if (isPostgres()) {
      try {
        const existing = await this.findOne(filter);
        if (!existing) return null;
        const doc = await this.delegate.delete({
          where: { id: existing.id },
        });
        return doc ? this.formatNotification(doc) : null;
      } catch (err) {
        if (err && err.code === "P2025") {
          return null;
        }
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOneAndDelete(filter, options);
    return doc ? this.formatNotification(doc.toObject ? doc.toObject() : doc) : null;
  }

  async deleteById(id, options = {}) {
    return this.findByIdAndDelete(id, options);
  }
}

export const notificationRepository = new NotificationRepository();
export default notificationRepository;
