const ALLOWED_REPORT_DELETE_FIELDS = new Set([
  "user",
  "userId",
  "_id",
  "id",
  "type",
  "status",
  "createdAt",
]);

const ALLOWED_REPORT_FILTER_FIELDS = new Set([
  "_id",
  "id",
  "user",
  "userId",
  "type",
  "status",
  "createdAt",
  "startDate",
  "endDate",
  "fileUrl",
]);

const ALLOWED_REPORT_UPDATE_FIELDS = new Set([
  "status",
  "fileUrl",
  "generatedAt",
  "startDate",
  "endDate",
  "type",
]);

const ALLOWED_REPORT_PASSTHROUGH_FIELDS = new Set([
  "_id",
  "id",
  "user",
  "userId",
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

const VALID_REPORT_TYPES = new Set([
  "attendance_overview",
  "attendance-overview",
  "attendance_detailed",
  "attendance-detailed",
  "productivity",
  "usage",
  "project_user",
  "project-user",
  "project",
  "manual_work_time",
  "manual-work-time",
  "manual_break_time",
  "manual-break-time",
  "removed_time",
  "removed-time",
  "daily_work",
  "daily-work",
]);

const VALID_REPORT_STATUSES = new Set([
  "processing",
  "done",
  "failed",
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

import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

export class ReportRepository extends BaseRepository {
  constructor() {
    super("Report");
  }

  formatReport(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    serialized.user = serialized.user || serialized.userId;
    delete serialized.userId;
    if (serialized.type) {
      serialized.type = String(serialized.type).replace(/_/g, "-");
    }
    return serialized;
  }

  normalizeType(type) {
    if (!type) return "productivity";
    return String(type).replace(/-/g, "_");
  }

  buildWhere(filter = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("ReportRepository filter must be a valid object");
    }

    const where = {};

    for (const key of Object.keys(filter)) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in ReportRepository: ${key}`);
      }
      if (!ALLOWED_REPORT_FILTER_FIELDS.has(key)) {
        throw new Error(`Unsupported filter field in ReportRepository: ${key}`);
      }
    }

    if (filter._id !== undefined && filter.id !== undefined) {
      const idA = this.toIdString(filter._id);
      const idB = this.toIdString(filter.id);
      if (idA && idB && idA !== idB) {
        throw new Error("Conflicting identifier filters in ReportRepository: _id and id");
      }
    }
    if (filter.user !== undefined && filter.userId !== undefined) {
      const uA = this.toIdString(filter.user);
      const uB = this.toIdString(filter.userId);
      if (uA && uB && uA !== uB) {
        throw new Error("Conflicting user filters in ReportRepository: user and userId");
      }
    }

    if (filter._id !== undefined) {
      where.id = this._processIdFilter(filter._id, "_id");
    } else if (filter.id !== undefined) {
      where.id = this._processIdFilter(filter.id, "id");
    }

    if (filter.user !== undefined) {
      where.userId = this._processIdFilter(filter.user, "user");
    } else if (filter.userId !== undefined) {
      where.userId = this._processIdFilter(filter.userId, "userId");
    }

    if (filter.type !== undefined) {
      where.type = this._processTypeFilter(filter.type);
    }

    if (filter.status !== undefined) {
      where.status = this._processStatusFilter(filter.status);
    }

    if (filter.createdAt !== undefined) {
      where.createdAt = this._processCreatedAtFilter(filter.createdAt);
    }

    if (filter.startDate !== undefined) {
      if (typeof filter.startDate === "string") {
        where.startDate = filter.startDate;
      } else {
        throw new Error("Invalid startDate in ReportRepository filter");
      }
    }

    if (filter.endDate !== undefined) {
      if (typeof filter.endDate === "string") {
        where.endDate = filter.endDate;
      } else {
        throw new Error("Invalid endDate in ReportRepository filter");
      }
    }

    if (filter.fileUrl !== undefined) {
      if (typeof filter.fileUrl === "string") {
        where.fileUrl = filter.fileUrl;
      } else {
        throw new Error("Invalid fileUrl in ReportRepository filter");
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
          queryOptions.orderBy = { [sortField]: sortDir === -1 || sortDir === "desc" ? "desc" : "asc" };
        } else {
          queryOptions.orderBy = { createdAt: "desc" };
        }
        if (options.skip) queryOptions.skip = options.skip;
        if (options.limit) queryOptions.take = options.limit;

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => this.formatReport(d));
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.find(filter);
    if (options.sort) query = query.sort(options.sort);
    if (options.skip) query = query.skip(options.skip);
    if (options.limit) query = query.limit(options.limit);
    const docs = await query;
    return docs.map((d) => this.formatReport(d.toObject ? d.toObject() : d));
  }

  async findById(id) {
    const idStr = this.toIdString(id);
    if (!idStr || typeof idStr !== "string" || !idStr.trim() || idStr === "[object Object]") {
      return null;
    }

    if (isPostgres()) {
      try {
        const doc = await this.delegate.findUnique({
          where: { id: idStr },
        });
        return doc ? this.formatReport(doc) : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findById(idStr);
    return doc ? this.formatReport(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findOne(filter = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const doc = await this.delegate.findFirst({ where });
        return doc ? this.formatReport(doc) : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOne(filter);
    return doc ? this.formatReport(doc.toObject ? doc.toObject() : doc) : null;
  }

  async countDocuments(filter = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        return await this.delegate.count({ where });
      } catch (err) {
        this.handleError(err);
      }
    }

    return await this.mongooseModel.countDocuments(filter);
  }

  async findByIdAndDelete(id) {
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
        return doc ? this.formatReport(doc) : null;
      } catch (err) {
        if (err && err.code === "P2025") {
          return null;
        }
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findByIdAndDelete(idStr);
    return doc ? this.formatReport(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findOneAndDelete(filter) {
    if (isPostgres()) {
      try {
        const existing = await this.findOne(filter);
        if (!existing) return null;
        const doc = await this.delegate.delete({
          where: { id: existing.id },
        });
        return doc ? this.formatReport(doc) : null;
      } catch (err) {
        if (err && err.code === "P2025") {
          return null;
        }
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOneAndDelete(filter);
    return doc ? this.formatReport(doc.toObject ? doc.toObject() : doc) : null;
  }

  async deleteById(id) {
    return this.findByIdAndDelete(id);
  }

  async deleteOne(filter) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("ReportRepository.deleteOne requires a valid filter object");
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

  async create(data) {
    if (!data || typeof data !== "object") {
      throw new Error("ReportRepository.create requires a valid data object");
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
      const arr = Array.isArray(docs) ? docs : [docs];
      return arr.map((d) => this.formatReport(d.toObject ? d.toObject() : d));
    }

    if (isPostgres()) {
      try {
        const rawUser = data.user !== undefined ? data.user : data.userId;
        const userId = this.toIdString(rawUser);
        if (!userId || typeof userId !== "string" || !userId.trim() || userId === "[object Object]") {
          throw new Error("ReportRepository.create requires a valid user identifier");
        }

        const newId = data._id ? this.toIdString(data._id) : (data.id ? this.toIdString(data.id) : generateId());

        const rawType = data.type;
        if (!rawType || typeof rawType !== "string" || !VALID_REPORT_TYPES.has(rawType.trim())) {
          throw new Error(`Invalid report type in ReportRepository.create: ${rawType}`);
        }
        const normalizedType = this.normalizeType(rawType.trim());

        let status = "processing";
        if (data.status !== undefined) {
          if (typeof data.status !== "string" || !VALID_REPORT_STATUSES.has(data.status.trim())) {
            throw new Error(`Invalid report status in ReportRepository.create: ${data.status}`);
          }
          status = data.status.trim();
        }

        let generatedAt = null;
        if (data.generatedAt) {
          const parsed = new Date(data.generatedAt);
          if (isNaN(parsed.getTime())) {
            throw new Error("Invalid generatedAt date in ReportRepository.create");
          }
          generatedAt = parsed;
        }

        const createData = {
          id: newId,
          userId,
          type: normalizedType,
          status,
          fileUrl: typeof data.fileUrl === "string" ? data.fileUrl : "",
          generatedAt,
          startDate: typeof data.startDate === "string" ? data.startDate : "",
          endDate: typeof data.endDate === "string" ? data.endDate : "",
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatReport(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.create(data);
    return this.formatReport(doc.toObject ? doc.toObject() : doc);
  }

  async findOneAndUpdate(filter, update, options = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("ReportRepository.findOneAndUpdate requires a valid filter object");
    }
    if (!update || typeof update !== "object" || Array.isArray(update)) {
      throw new Error("ReportRepository.findOneAndUpdate requires a valid update object");
    }

    if (isPostgres()) {
      try {
        for (const key of Object.keys(update)) {
          if (key.startsWith("$") && key !== "$set") {
            throw new Error(`Unsupported update operator in ReportRepository: ${key}`);
          }
        }

        if (update.$set !== undefined) {
          if (!update.$set || typeof update.$set !== "object" || Array.isArray(update.$set)) {
            throw new Error("Invalid $set envelope in ReportRepository.findOneAndUpdate");
          }
          for (const key of Object.keys(update.$set)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in ReportRepository: ${key}`);
            }
          }
        }

        const directFields = { ...update };
        delete directFields.$set;
        const setFields = update.$set || {};

        for (const key of Object.keys(setFields)) {
          if (directFields[key] !== undefined) {
            if (!isSameValue(directFields[key], setFields[key])) {
              throw new Error(`Conflicting update values for field '${key}' between direct payload and $set envelope`);
            }
          }
        }

        const rawPayload = { ...directFields, ...setFields };

        for (const key of Object.keys(rawPayload)) {
          if (typeof rawPayload[key] === "function") continue;
          if (!ALLOWED_REPORT_UPDATE_FIELDS.has(key) && !ALLOWED_REPORT_PASSTHROUGH_FIELDS.has(key)) {
            throw new Error(`Unsupported update field in ReportRepository: ${key}`);
          }
        }

        if (rawPayload._id !== undefined && rawPayload.id !== undefined) {
          if (this.toIdString(rawPayload._id) !== this.toIdString(rawPayload.id)) {
            throw new Error("Conflicting update values for '_id' and 'id' in ReportRepository");
          }
        }
        if (rawPayload.user !== undefined && rawPayload.userId !== undefined) {
          if (this.toIdString(rawPayload.user) !== this.toIdString(rawPayload.userId)) {
            throw new Error("Conflicting update values for 'user' and 'userId' in ReportRepository");
          }
        }

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
        const existingUserId = this.toIdString(existing.user || existing.userId);

        if (rawPayload._id !== undefined && this.toIdString(rawPayload._id) !== existingId) {
          throw new Error("Cannot update immutable field: _id");
        }
        if (rawPayload.id !== undefined && this.toIdString(rawPayload.id) !== existingId) {
          throw new Error("Cannot update immutable field: id");
        }
        if (rawPayload.user !== undefined && this.toIdString(rawPayload.user) !== existingUserId) {
          throw new Error("Cannot update immutable field: user");
        }
        if (rawPayload.userId !== undefined && this.toIdString(rawPayload.userId) !== existingUserId) {
          throw new Error("Cannot update immutable field: userId");
        }
        if (rawPayload.createdAt !== undefined) {
          const existingCreated = existing.createdAt instanceof Date ? existing.createdAt.getTime() : new Date(existing.createdAt).getTime();
          const payloadCreated = rawPayload.createdAt instanceof Date ? rawPayload.createdAt.getTime() : new Date(rawPayload.createdAt).getTime();
          if (isNaN(payloadCreated) || payloadCreated !== existingCreated) {
            throw new Error("Cannot update immutable field: createdAt");
          }
        }

        const patch = {};
        if (rawPayload.status !== undefined) {
          if (typeof rawPayload.status !== "string" || !VALID_REPORT_STATUSES.has(rawPayload.status.trim())) {
            throw new Error(`Invalid report status in ReportRepository update: ${rawPayload.status}`);
          }
          const newStatus = rawPayload.status.trim();
          if (newStatus !== existing.status) {
            patch.status = newStatus;
          }
        }
        if (rawPayload.fileUrl !== undefined) {
          const newFileUrl = typeof rawPayload.fileUrl === "string" ? rawPayload.fileUrl : "";
          if (newFileUrl !== (existing.fileUrl || "")) {
            patch.fileUrl = newFileUrl;
          }
        }
        if (rawPayload.generatedAt !== undefined) {
          const newDate = rawPayload.generatedAt ? new Date(rawPayload.generatedAt) : null;
          if (newDate && isNaN(newDate.getTime())) {
            throw new Error("Invalid generatedAt date in ReportRepository update");
          }
          const existingDate = existing.generatedAt ? new Date(existing.generatedAt) : null;
          const bothNull = !newDate && !existingDate;
          const sameTime = newDate && existingDate && newDate.getTime() === existingDate.getTime();
          if (!bothNull && !sameTime) {
            patch.generatedAt = newDate;
          }
        }
        if (rawPayload.startDate !== undefined) {
          const newStartDate = typeof rawPayload.startDate === "string" ? rawPayload.startDate : "";
          if (newStartDate !== (existing.startDate || "")) {
            patch.startDate = newStartDate;
          }
        }
        if (rawPayload.endDate !== undefined) {
          const newEndDate = typeof rawPayload.endDate === "string" ? rawPayload.endDate : "";
          if (newEndDate !== (existing.endDate || "")) {
            patch.endDate = newEndDate;
          }
        }
        if (rawPayload.type !== undefined) {
          if (typeof rawPayload.type !== "string" || !VALID_REPORT_TYPES.has(rawPayload.type.trim())) {
            throw new Error(`Invalid report type in ReportRepository update: ${rawPayload.type}`);
          }
          const normalized = this.normalizeType(rawPayload.type.trim());
          const existingNormalized = this.normalizeType(existing.type);
          if (normalized !== existingNormalized) {
            patch.type = normalized;
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

        return this.formatReport(updatedDoc);
      } catch (err) {
        if (err && err.code === "P2025") {
          return null;
        }
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOneAndUpdate(filter, update, options);
    return doc ? this.formatReport(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findByIdAndUpdate(id, update, options = { new: true }) {
    const idStr = this.toIdString(id);
    if (!idStr || typeof idStr !== "string" || !idStr.trim() || idStr === "[object Object]") {
      if (isPostgres()) {
        throw new Error("Invalid identifier in ReportRepository.findByIdAndUpdate");
      }
      return null;
    }

    if (isPostgres()) {
      return this.findOneAndUpdate({ _id: idStr }, update, options);
    }

    const doc = await this.mongooseModel.findByIdAndUpdate(id, update, options);
    return doc ? this.formatReport(doc.toObject ? doc.toObject() : doc) : null;
  }

  async updateById(id, update, options = { new: true }) {
    return this.findByIdAndUpdate(id, update, options);
  }

  async updateOne(filter, update, options = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("ReportRepository.updateOne requires a valid filter object");
    }
    if (!update || typeof update !== "object" || Array.isArray(update)) {
      throw new Error("ReportRepository.updateOne requires a valid update object");
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

  _validateScalarId(val, fieldName) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in ReportRepository filter for field: ${fieldName}`);
    }

    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) {
        throw new Error(`Invalid identifier in ReportRepository filter for field: ${fieldName}`);
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

      throw new Error(`Invalid identifier object in ReportRepository filter: ${fieldName}`);
    }

    throw new Error(`Invalid identifier in ReportRepository filter for field: ${fieldName}`);
  }

  _processIdFilter(val, fieldName) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in ReportRepository filter for field: ${fieldName}`);
    }

    if (Array.isArray(val)) {
      if (val.length === 0) return { in: [] };
      return { in: val.map((item) => this._validateScalarId(item, fieldName)) };
    }

    if (typeof val === "object") {
      if (val.$in !== undefined) {
        if (!Array.isArray(val.$in)) {
          throw new Error(`Invalid array in ReportRepository filter: ${fieldName}`);
        }
        if (val.$in.length === 0) return { in: [] };
        return { in: val.$in.map((item) => this._validateScalarId(item, fieldName)) };
      }
      if (val.in !== undefined) {
        if (!Array.isArray(val.in)) {
          throw new Error(`Invalid array in ReportRepository filter: ${fieldName}`);
        }
        if (val.in.length === 0) return { in: [] };
        return { in: val.in.map((item) => this._validateScalarId(item, fieldName)) };
      }

      for (const k of Object.keys(val)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in ReportRepository: ${k}`);
        }
      }

      return this._validateScalarId(val, fieldName);
    }

    return this._validateScalarId(val, fieldName);
  }

  _processTypeFilter(raw) {
    if (raw === null || raw === undefined) {
      throw new Error("Invalid report type in ReportRepository filter: type");
    }

    const validateSingleType = (t) => {
      if (typeof t !== "string" || !t.trim()) {
        throw new Error("Invalid report type in ReportRepository filter: type");
      }
      const trimmed = t.trim();
      if (!VALID_REPORT_TYPES.has(trimmed)) {
        throw new Error(`Invalid report type in ReportRepository filter: ${trimmed}`);
      }
      return trimmed.replace(/-/g, "_");
    };

    if (typeof raw === "string") {
      return validateSingleType(raw);
    }

    if (Array.isArray(raw)) {
      if (raw.length === 0) return { in: [] };
      return { in: raw.map(validateSingleType) };
    }

    if (typeof raw === "object") {
      if (raw.$in !== undefined) {
        if (!Array.isArray(raw.$in)) throw new Error("Invalid array in ReportRepository filter: type");
        if (raw.$in.length === 0) return { in: [] };
        return { in: raw.$in.map(validateSingleType) };
      }
      if (raw.in !== undefined) {
        if (!Array.isArray(raw.in)) throw new Error("Invalid array in ReportRepository filter: type");
        if (raw.in.length === 0) return { in: [] };
        return { in: raw.in.map(validateSingleType) };
      }

      for (const k of Object.keys(raw)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in ReportRepository: ${k}`);
        }
      }
    }

    throw new Error("Invalid report type in ReportRepository filter: type");
  }

  _processStatusFilter(raw) {
    if (raw === null || raw === undefined) {
      throw new Error("Invalid report status in ReportRepository filter: status");
    }

    const validateSingleStatus = (s) => {
      if (typeof s !== "string" || !s.trim()) {
        throw new Error("Invalid report status in ReportRepository filter: status");
      }
      const trimmed = s.trim();
      if (!VALID_REPORT_STATUSES.has(trimmed)) {
        throw new Error(`Invalid report status in ReportRepository filter: ${trimmed}`);
      }
      return trimmed;
    };

    if (typeof raw === "string") {
      return validateSingleStatus(raw);
    }

    if (Array.isArray(raw)) {
      if (raw.length === 0) return { in: [] };
      return { in: raw.map(validateSingleStatus) };
    }

    if (typeof raw === "object") {
      if (raw.$in !== undefined) {
        if (!Array.isArray(raw.$in)) throw new Error("Invalid array in ReportRepository filter: status");
        if (raw.$in.length === 0) return { in: [] };
        return { in: raw.$in.map(validateSingleStatus) };
      }
      if (raw.in !== undefined) {
        if (!Array.isArray(raw.in)) throw new Error("Invalid array in ReportRepository filter: status");
        if (raw.in.length === 0) return { in: [] };
        return { in: raw.in.map(validateSingleStatus) };
      }

      for (const k of Object.keys(raw)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in ReportRepository: ${k}`);
        }
      }
    }

    throw new Error("Invalid report status in ReportRepository filter: status");
  }

  _processCreatedAtFilter(raw) {
    if (raw === null || raw === undefined) {
      throw new Error("Invalid date value in ReportRepository filter: createdAt");
    }

    if (raw instanceof Date) {
      if (isNaN(raw.getTime())) {
        throw new Error("Invalid date value in ReportRepository filter: createdAt");
      }
      return raw;
    }

    if (typeof raw === "string" || typeof raw === "number") {
      const d = new Date(raw);
      if (isNaN(d.getTime())) {
        throw new Error("Invalid date value in ReportRepository filter: createdAt");
      }
      return d;
    }

    if (typeof raw === "object" && !Array.isArray(raw)) {
      const keys = Object.keys(raw);
      if (keys.length === 0) {
        throw new Error("Invalid date range in ReportRepository filter: createdAt cannot be an empty object");
      }

      for (const op of keys) {
        if (!ALLOWED_DATE_OPERATORS.has(op)) {
          if (op.startsWith("$")) {
            throw new Error(`Unsupported filter operator in ReportRepository: ${op}`);
          }
          throw new Error(`Unsupported date range operator in ReportRepository: ${op}`);
        }
      }

      const dateCond = {};
      const parseDate = (val, op) => {
        if (val === null || val === undefined || (typeof val === "string" && !val.trim())) {
          throw new Error(`Invalid date value for operator ${op} in ReportRepository filter: createdAt`);
        }
        const parsed = val instanceof Date ? val : new Date(val);
        if (isNaN(parsed.getTime())) {
          throw new Error(`Invalid date value for operator ${op} in ReportRepository filter: createdAt`);
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
        throw new Error("Invalid date range in ReportRepository filter: lower bound cannot be after upper bound in createdAt");
      }

      return dateCond;
    }

    throw new Error("Invalid date value in ReportRepository filter: createdAt");
  }

  buildDeleteWhere(filter = {}) {
    const where = {};

    for (const key of Object.keys(filter || {})) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in ReportRepository: ${key}`);
      }
      if (!ALLOWED_REPORT_DELETE_FIELDS.has(key)) {
        throw new Error(`Unsupported filter field in ReportRepository: ${key}`);
      }

      const val = filter[key];

      switch (key) {
        case "_id":
        case "id":
          where.id = this._processIdFilter(val, key);
          break;

        case "user":
        case "userId":
          where.userId = this._processIdFilter(val, key);
          break;

        case "type":
          where.type = this._processTypeFilter(val);
          break;

        case "status":
          where.status = this._processStatusFilter(val);
          break;

        case "createdAt":
          where.createdAt = this._processCreatedAtFilter(val);
          break;
      }
    }

    return where;
  }

  async deleteMany(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("ReportRepository.deleteMany requires a valid filter object");
        }

        const where = this.buildDeleteWhere(filter);
        if (Object.keys(where).length === 0) {
          throw new Error("Bulk deletion requires a valid scoped filter in ReportRepository.deleteMany");
        }

        const res = await this.delegate.deleteMany({ where });
        return { deletedCount: res.count };
      } catch (err) {
        this.handleError(err);
      }
    }

    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("ReportRepository.deleteMany requires a valid filter object");
    }
    return await this.mongooseModel.deleteMany(filter, options);
  }
}

export const reportRepository = new ReportRepository();
export default reportRepository;
