const ALLOWED_SESSION_DELETE_FIELDS = new Set([
  "userId",
  "user",
  "_id",
  "id",
  "projectId",
  "project",
  "taskId",
  "task",
  "startTime",
  "endTime",
  "type",
  "date",
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

const ALLOWED_SESSION_TYPES = new Set(["work", "break"]);

const ALLOWED_SESSION_UPDATE_FIELDS = new Set([
  "startTime",
  "endTime",
  "duration",
  "type",
  "source",
  "screenshots",
  "team",
  "date",
  "project",
  "projectId",
  "task",
  "taskId",
]);

const ALLOWED_SESSION_PASSTHROUGH_FIELDS = new Set([
  "_id",
  "id",
  "userId",
  "user",
  "organization",
  "organizationId",
  "createdAt",
  "updatedAt",
  "__v",
  "isNew",
  "_isNew",
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
    if (typeof val === "string") return val;
    if (typeof val === "object") {
      if (val._id) return String(val._id);
      if (val.id) return String(val.id);
      if (typeof val.toHexString === "function") return val.toHexString();
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

function isSessionFieldUnchanged(key, newVal, existing) {
  if (!existing) return false;
  let existingVal;
  if (key === "projectId") {
    existingVal = existing.projectId ?? (typeof existing.project === "string" ? existing.project : existing.project?._id || existing.project?.id || null);
  } else if (key === "taskId") {
    existingVal = existing.taskId ?? (typeof existing.task === "string" ? existing.task : existing.task?._id || existing.task?.id || null);
  } else if (key === "screenshots") {
    existingVal = existing.screenshots ?? 0;
  } else {
    existingVal = existing[key];
  }

  return isSameValue(newVal, existingVal);
}

import { BaseRepository } from "./base.repository.js";
import { isMongo, isPostgres } from "../index.js";
import { getAmbientTransaction } from "../transaction.js";
import { generateId } from "../../utils/idGenerator.js";
import { DEFAULT_TIMEZONE, FALLBACK_TIMEZONE, getDateInTimezone } from "../../utils/timezone.js";

export class SessionRepository extends BaseRepository {
  constructor() {
    super("Session");
  }

  hasPopulate(name, options = {}) {
    if (!options) return false;
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    if (options[`populate${cap}`]) return true;
    if (!options.populate) return false;
    if (typeof options.populate === "string") {
      const parts = options.populate.split(/\s+/).filter(Boolean);
      return parts.includes(name);
    }
    if (Array.isArray(options.populate)) {
      return options.populate.some((p) => (typeof p === "string" ? p === name : p?.path === name));
    }
    if (typeof options.populate === "object" && options.populate !== null) {
      return options.populate.path === name;
    }
    return false;
  }

  buildInclude(options = {}) {
    const include = {};
    if (this.hasPopulate("project", options)) {
      include.project = true;
    }
    if (this.hasPopulate("task", options)) {
      include.task = true;
    }
    return Object.keys(include).length > 0 ? include : undefined;
  }

  applyRelationProjection(item, selectStr) {
    if (!item || typeof item !== "object" || !selectStr || typeof selectStr !== "string") return item;
    const fields = selectStr.trim().split(/\s+/).filter(Boolean);
    if (fields.length === 0) return item;
    const isExclusion = fields.some((f) => f.startsWith("-"));

    if (isExclusion) {
      const excluded = fields.filter((f) => f.startsWith("-")).map((f) => f.slice(1));
      for (const key of excluded) {
        delete item[key];
      }
    } else {
      const included = new Set(fields.filter((f) => !f.startsWith("-")));
      included.add("_id");
      included.add("id");
      for (const key of Object.keys(item)) {
        if (!included.has(key) && typeof item[key] !== "function") {
          delete item[key];
        }
      }
    }
    return item;
  }

  applyPopulateProjections(doc, options = {}) {
    if (!doc || typeof doc !== "object" || !options || !options.populate) return doc;
    const popList = Array.isArray(options.populate)
      ? options.populate
      : typeof options.populate === "object"
      ? [options.populate]
      : [];

    for (const pop of popList) {
      if (pop && pop.path && pop.select && typeof pop.select === "string") {
        if (pop.path === "project" && doc.project && typeof doc.project === "object") {
          this.applyRelationProjection(doc.project, pop.select);
        }
        if (pop.path === "task" && doc.task && typeof doc.task === "object") {
          this.applyRelationProjection(doc.task, pop.select);
        }
      }
    }
    return doc;
  }

  formatSession(doc, options = {}) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    serialized.userId = serialized.userId || serialized.user;
    delete serialized.user;

    // Project relation handling
    if (doc.project && typeof doc.project === "object") {
      serialized.project = this.serialize(doc.project);
    } else if (doc.project === null) {
      serialized.project = null;
    } else if (serialized.project) {
      serialized.project = serialized.project;
    } else if (serialized.projectId) {
      serialized.project = serialized.projectId;
    } else {
      delete serialized.project;
    }
    delete serialized.projectId;

    // Task relation handling
    if (doc.task && typeof doc.task === "object") {
      serialized.task = this.serialize(doc.task);
    } else if (doc.task === null) {
      serialized.task = null;
    } else if (serialized.task) {
      serialized.task = serialized.task;
    } else if (serialized.taskId) {
      serialized.task = serialized.taskId;
    } else {
      delete serialized.task;
    }
    delete serialized.taskId;

    if (serialized.screenshots === 0 || serialized.screenshots === null) {
      delete serialized.screenshots;
    }

    if (options && options.populate) {
      this.applyPopulateProjections(serialized, options);
    }

    return serialized;
  }

  async findById(id, options = {}) {
    const idStr = this.toIdString(id);
    if (!idStr) return null;

    if (isPostgres()) {
      try {
        const include = this.buildInclude(options);
        const doc = await this.delegate.findUnique({
          where: { id: idStr },
          ...(include ? { include } : {}),
        });
        return this.formatSession(doc, options);
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.findById(idStr);
    if (this.hasPopulate("project", options)) query = query.populate("project");
    if (this.hasPopulate("task", options)) query = query.populate("task");
    const doc = await query;
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findOne(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhereClause(filter);
        const include = this.buildInclude(options);
        const doc = await this.delegate.findFirst({
          where,
          ...(include ? { include } : {}),
        });
        return this.formatSession(doc, options);
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.findOne(filter);
    if (this.hasPopulate("project", options)) query = query.populate("project");
    if (this.hasPopulate("task", options)) query = query.populate("task");
    const doc = await query;
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhereClause(filter);
        const queryOptions = { where };

        const include = this.buildInclude(options);
        if (include) queryOptions.include = include;

        if (options.sort) {
          const [sortField, sortDir] = Object.entries(options.sort)[0] || ["startTime", 1];
          queryOptions.orderBy = { [sortField]: sortDir === -1 || sortDir === "desc" ? "desc" : "asc" };
        } else {
          queryOptions.orderBy = { startTime: "asc" };
        }

        if (options.limit) queryOptions.take = options.limit;
        if (options.skip) queryOptions.skip = options.skip;

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => this.formatSession(d, options));
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.find(filter);
    if (this.hasPopulate("project", options)) query = query.populate("project");
    if (this.hasPopulate("task", options)) query = query.populate("task");
    if (options.sort) query = query.sort(options.sort);
    if (options.skip) query = query.skip(options.skip);
    if (options.limit) query = query.limit(options.limit);
    const docs = await query;
    return docs.map((d) => this.serialize(d.toObject ? d.toObject() : d));
  }

  async distinct(field, filter = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhereClause(filter);
        const prismaField = field === "user" || field === "userId"
          ? "userId"
          : field === "project"
          ? "projectId"
          : field === "task"
          ? "taskId"
          : field;
        const prisma = this.prisma;

        const docs = await prisma.session.findMany({
          where,
          select: { [prismaField]: true },
          distinct: [prismaField],
        });

        return docs.map((d) => d[prismaField]).filter(Boolean);
      } catch (err) {
        this.handleError(err);
      }
    }

    return await this.mongooseModel.distinct(field, filter);
  }

  async create(data, options = {}) {
    if (Array.isArray(data)) {
      const results = [];
      for (const item of data) {
        results.push(await this.create(item, options));
      }
      return results;
    }

    if (isPostgres()) {
      try {
        if (!data || typeof data !== "object") {
          throw new Error("SessionRepository.create requires a valid data object");
        }
        if (data.user !== undefined && data.userId !== undefined) {
          if (this.toIdString(data.user) !== this.toIdString(data.userId)) {
            throw new Error("Conflicting values for 'user' and 'userId' in SessionRepository.create");
          }
        }
        if (data.project !== undefined && data.projectId !== undefined) {
          if (this.toIdString(data.project) !== this.toIdString(data.projectId)) {
            throw new Error("Conflicting values for 'project' and 'projectId' in SessionRepository.create");
          }
        }
        if (data.task !== undefined && data.taskId !== undefined) {
          if (this.toIdString(data.task) !== this.toIdString(data.taskId)) {
            throw new Error("Conflicting values for 'task' and 'taskId' in SessionRepository.create");
          }
        }
        const userId = this.toIdString(data.user || data.userId);
        if (!userId) {
          throw new Error("Cannot create Session without valid userId");
        }
        const projectId = this.toIdString(data.project || data.projectId);
        const taskId = this.toIdString(data.task || data.taskId);
        const newId = data._id ? this.toIdString(data._id) : generateId();

        const tz = data.timezone || options.timezone || DEFAULT_TIMEZONE;
        const derivedDate = data.date || (data.startTime ? getDateInTimezone(data.startTime, tz) : null);

        const createData = {
          id: newId,
          userId,
          projectId: projectId || null,
          taskId: taskId || null,
          startTime: data.startTime ? new Date(data.startTime) : new Date(),
          endTime: data.endTime ? new Date(data.endTime) : null,
          duration: data.duration !== undefined ? Number(data.duration) : 0,
          type: data.type || "work",
          source: data.source === "manual" ? "manual" : "tracking",
          date: derivedDate,
          team: data.team || "Default team",
          screenshots: typeof data.screenshots === "number" ? data.screenshots : 0,
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatSession(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const session = (options && options.session) || (isMongo() && typeof getAmbientTransaction === "function" ? getAmbientTransaction() : null);
    if (session) {
      const res = await this.mongooseModel.create([data], { session });
      const doc = Array.isArray(res) ? res[0] : res;
      return this.serialize(doc.toObject ? doc.toObject() : doc);
    }

    const doc = await this.mongooseModel.create(data);
    return this.serialize(doc.toObject ? doc.toObject() : doc);
  }

  _buildSessionPatch(rawPayload, existing = null) {
    const patch = {};

    if (rawPayload.startTime !== undefined) {
      if (rawPayload.startTime === null) {
        throw new Error("Invalid date value in SessionRepository update: startTime cannot be null");
      }
      const d = rawPayload.startTime instanceof Date ? rawPayload.startTime : new Date(rawPayload.startTime);
      if (isNaN(d.getTime())) {
        throw new Error("Invalid date value in SessionRepository update: startTime");
      }
      patch.startTime = d;
    }

    if (rawPayload.endTime !== undefined) {
      if (rawPayload.endTime === null) {
        patch.endTime = null;
      } else {
        const d = rawPayload.endTime instanceof Date ? rawPayload.endTime : new Date(rawPayload.endTime);
        if (isNaN(d.getTime())) {
          throw new Error("Invalid date value in SessionRepository update: endTime");
        }
        patch.endTime = d;
      }
    }

    if (rawPayload.duration !== undefined) {
      const num = Number(rawPayload.duration);
      if (isNaN(num) || num < 0) {
        throw new Error("Invalid duration in SessionRepository update");
      }
      patch.duration = num;
    }

    if (rawPayload.type !== undefined) {
      if (typeof rawPayload.type !== "string" || !ALLOWED_SESSION_TYPES.has(rawPayload.type.trim())) {
        throw new Error(`Invalid type in SessionRepository update: ${rawPayload.type}`);
      }
      patch.type = rawPayload.type.trim();
    }

    if (rawPayload.source !== undefined) {
      if (typeof rawPayload.source !== "string" || !["tracking", "manual"].includes(rawPayload.source.trim())) {
        throw new Error(`Invalid source in SessionRepository update: ${rawPayload.source}`);
      }
      patch.source = rawPayload.source.trim();
    }

    if (rawPayload.screenshots !== undefined) {
      if (rawPayload.screenshots === null) {
        patch.screenshots = 0;
      } else {
        const s = Number(rawPayload.screenshots);
        if (isNaN(s) || s < 0) {
          throw new Error("Invalid screenshots count in SessionRepository update");
        }
        patch.screenshots = Math.floor(s);
      }
    }

    if (rawPayload.team !== undefined) {
      patch.team = rawPayload.team === null ? "Default team" : String(rawPayload.team).trim() || "Default team";
    }

    if (rawPayload.date !== undefined) {
      patch.date = rawPayload.date === null ? null : String(rawPayload.date).trim();
    }

    if (rawPayload.project !== undefined || rawPayload.projectId !== undefined) {
      const pVal = rawPayload.project !== undefined ? rawPayload.project : rawPayload.projectId;
      patch.projectId = pVal ? this.toIdString(pVal) : null;
    }

    if (rawPayload.task !== undefined || rawPayload.taskId !== undefined) {
      const tVal = rawPayload.task !== undefined ? rawPayload.task : rawPayload.taskId;
      patch.taskId = tVal ? this.toIdString(tVal) : null;
    }

    // Prune unchanged fields when existing record is provided
    if (existing) {
      for (const k of Object.keys(patch)) {
        if (isSessionFieldUnchanged(k, patch[k], existing)) {
          delete patch[k];
        }
      }
    }

    return patch;
  }

  async findOneAndUpdate(filter, updateData, options = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("SessionRepository.findOneAndUpdate requires a valid filter object");
    }
    if (!updateData || typeof updateData !== "object" || Array.isArray(updateData)) {
      throw new Error("SessionRepository.findOneAndUpdate requires a valid update object");
    }

    if (isPostgres()) {
      try {
        for (const key of Object.keys(filter)) {
          if (key.startsWith("$")) {
            throw new Error(`Unsupported filter operator in SessionRepository: ${key}`);
          }
        }

        for (const key of Object.keys(updateData)) {
          if (key.startsWith("$") && key !== "$set") {
            throw new Error(`Unsupported update operator in SessionRepository: ${key}`);
          }
        }

        if (updateData.$set !== undefined) {
          if (!updateData.$set || typeof updateData.$set !== "object" || Array.isArray(updateData.$set)) {
            throw new Error("Invalid $set envelope in SessionRepository.findOneAndUpdate");
          }
          for (const key of Object.keys(updateData.$set)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in SessionRepository: ${key}`);
            }
          }
        }

        const directFields = { ...updateData };
        delete directFields.$set;
        const setFields = updateData.$set || {};

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
          if (!ALLOWED_SESSION_UPDATE_FIELDS.has(key) && !ALLOWED_SESSION_PASSTHROUGH_FIELDS.has(key)) {
            throw new Error(`Unsupported update field in SessionRepository: ${key}`);
          }
        }

        // Detect conflicting aliases
        if (rawPayload._id !== undefined && rawPayload.id !== undefined) {
          if (this.toIdString(rawPayload._id) !== this.toIdString(rawPayload.id)) {
            throw new Error("Conflicting update values for '_id' and 'id' in SessionRepository");
          }
        }
        if (rawPayload.user !== undefined && rawPayload.userId !== undefined) {
          if (this.toIdString(rawPayload.user) !== this.toIdString(rawPayload.userId)) {
            throw new Error("Conflicting update values for 'user' and 'userId' in SessionRepository");
          }
        }
        if (rawPayload.project !== undefined && rawPayload.projectId !== undefined) {
          if (this.toIdString(rawPayload.project) !== this.toIdString(rawPayload.projectId)) {
            throw new Error("Conflicting update values for 'project' and 'projectId' in SessionRepository");
          }
        }
        if (rawPayload.task !== undefined && rawPayload.taskId !== undefined) {
          if (this.toIdString(rawPayload.task) !== this.toIdString(rawPayload.taskId)) {
            throw new Error("Conflicting update values for 'task' and 'taskId' in SessionRepository");
          }
        }

        let existing = options._existing || null;
        if (!existing) {
          const filterKeys = Object.keys(filter);
          if (filterKeys.length === 1 && (filter._id || filter.id)) {
            const targetId = this.toIdString(filter._id || filter.id);
            existing = await this.findById(targetId, options);
          } else {
            existing = await this.findOne(filter, options);
          }
        }

        if (!existing) {
          return null;
        }

        const existingId = this.toIdString(existing.id || existing._id);
        const existingUserId = this.toIdString(existing.userId || existing.user);

        // Validate immutable fields against existing
        if (rawPayload._id !== undefined && this.toIdString(rawPayload._id) !== existingId) {
          throw new Error("Cannot update immutable field: _id");
        }
        if (rawPayload.id !== undefined && this.toIdString(rawPayload.id) !== existingId) {
          throw new Error("Cannot update immutable field: id");
        }
        if (rawPayload.createdAt !== undefined) {
          const existingCreated = existing.createdAt instanceof Date ? existing.createdAt.getTime() : new Date(existing.createdAt).getTime();
          const payloadCreated = rawPayload.createdAt instanceof Date ? rawPayload.createdAt.getTime() : new Date(rawPayload.createdAt).getTime();
          if (isNaN(payloadCreated) || payloadCreated !== existingCreated) {
            throw new Error("Cannot update immutable field: createdAt");
          }
        }
        if (rawPayload.organization !== undefined) {
          throw new Error("Cannot update immutable field: organization");
        }
        if (rawPayload.organizationId !== undefined) {
          throw new Error("Cannot update immutable field: organizationId");
        }

        const incomingUser = rawPayload.userId !== undefined ? rawPayload.userId : rawPayload.user;
        if (incomingUser !== undefined) {
          const userStr = this.toIdString(incomingUser);
          if (userStr !== existingUserId) {
            throw new Error("Cannot update immutable field: userId");
          }
        }

        const patch = this._buildSessionPatch(rawPayload, existing);

        // Avoid empty/ineffective updates
        if (Object.keys(patch).length === 0) {
          if (options._meta) options._meta.modified = false;
          return existing;
        }

        const include = this.buildInclude(options);
        const updateArgs = {
          where: { id: existingId },
          data: patch,
        };
        if (include) {
          updateArgs.include = include;
        }

        const updatedDoc = await this.delegate.update(updateArgs);
        if (options._meta) options._meta.modified = true;
        const returnOriginal = options.new === false || options.returnDocument === "before";
        if (returnOriginal) {
          return existing;
        }
        return this.formatSession(updatedDoc, options);
      } catch (err) {
        if (err && err.code === "P2025") {
          return null;
        }
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.findOneAndUpdate(filter, updateData, options);
    if (this.hasPopulate("project", options)) query = query.populate("project");
    if (this.hasPopulate("task", options)) query = query.populate("task");
    const doc = await query;
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findByIdAndUpdate(id, updateData, options = { new: true }) {
    const idStr = this.toIdString(id);
    if (!idStr || typeof idStr !== "string" || !idStr.trim() || idStr === "[object Object]") {
      if (isPostgres()) {
        throw new Error("Invalid identifier in SessionRepository.findByIdAndUpdate");
      }
      return null;
    }

    if (!updateData || typeof updateData !== "object" || Array.isArray(updateData)) {
      if (isPostgres()) {
        throw new Error("SessionRepository.findByIdAndUpdate requires a valid update object");
      }
      return null;
    }

    if (isPostgres()) {
      return this.findOneAndUpdate({ _id: idStr }, updateData, options);
    }

    let query = this.mongooseModel.findByIdAndUpdate(idStr, updateData, options);
    if (this.hasPopulate("project", options)) query = query.populate("project");
    if (this.hasPopulate("task", options)) query = query.populate("task");
    const doc = await query;
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async updateById(id, updateData, options = { new: true }) {
    return this.findByIdAndUpdate(id, updateData, options);
  }

  async updateOne(filter, updateData, options = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("SessionRepository.updateOne requires a valid filter object");
    }
    if (!updateData || typeof updateData !== "object" || Array.isArray(updateData)) {
      throw new Error("SessionRepository.updateOne requires a valid update object");
    }

    if (isPostgres()) {
      try {
        const filterKeys = Object.keys(filter);
        let existing = null;
        if (filterKeys.length === 1 && (filter._id || filter.id)) {
          const targetId = this.toIdString(filter._id || filter.id);
          existing = await this.findById(targetId, options);
        } else {
          existing = await this.findOne(filter, options);
        }

        if (!existing) {
          return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
        }

        const meta = {};
        const updated = await this.findOneAndUpdate(filter, updateData, { ...options, _existing: existing, _meta: meta, new: true });
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

    return await this.mongooseModel.updateOne(filter, updateData, options);
  }

  async deleteOne(filter) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("SessionRepository.deleteOne requires a valid filter object");
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

  _extractAndValidateId(val, fieldName) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in SessionRepository filter for field: ${fieldName}`);
    }
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed || trimmed === "[object Object]") {
        throw new Error(`Invalid identifier in SessionRepository filter for field: ${fieldName}`);
      }
      return trimmed;
    }
    if (typeof val === "number") {
      return String(val);
    }
    if (typeof val === "object") {
      if (val._id) {
        const idStr = String(val._id).trim();
        if (!idStr) {
          throw new Error(`Invalid identifier in SessionRepository filter for field: ${fieldName}`);
        }
        return idStr;
      }
      if (val.id) {
        const idStr = String(val.id).trim();
        if (!idStr) {
          throw new Error(`Invalid identifier in SessionRepository filter for field: ${fieldName}`);
        }
        return idStr;
      }
      if (typeof val.toHexString === "function") {
        const hex = val.toHexString();
        if (hex) return hex;
      }
      if (typeof val.toString === "function" && val.constructor && val.constructor.name === "ObjectId") {
        const str = val.toString().trim();
        if (str) return str;
      }
      throw new Error(`Invalid identifier object in SessionRepository filter: ${fieldName}`);
    }
    throw new Error(`Invalid identifier in SessionRepository filter for field: ${fieldName}`);
  }

  _processIdFilter(raw, fieldName) {
    if (raw === null || raw === undefined) {
      throw new Error(`Invalid identifier in SessionRepository filter for field: ${fieldName}`);
    }
    if (Array.isArray(raw)) {
      if (raw.length === 0) return { in: [] };
      const ids = [];
      for (const item of raw) {
        ids.push(this._extractAndValidateId(item, fieldName));
      }
      return { in: ids };
    }
    if (typeof raw === "object") {
      if (raw.$in !== undefined) {
        if (!Array.isArray(raw.$in)) {
          throw new Error(`Invalid array in SessionRepository filter: ${fieldName}`);
        }
        if (raw.$in.length === 0) return { in: [] };
        const ids = [];
        for (const item of raw.$in) {
          ids.push(this._extractAndValidateId(item, fieldName));
        }
        return { in: ids };
      }
      if (raw.in !== undefined) {
        if (!Array.isArray(raw.in)) {
          throw new Error(`Invalid array in SessionRepository filter: ${fieldName}`);
        }
        if (raw.in.length === 0) return { in: [] };
        const ids = [];
        for (const item of raw.in) {
          ids.push(this._extractAndValidateId(item, fieldName));
        }
        return { in: ids };
      }
      if (raw._id || raw.id) {
        return this._extractAndValidateId(raw, fieldName);
      }
      for (const k of Object.keys(raw)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in SessionRepository: ${k}`);
        }
      }
      throw new Error(`Invalid identifier object in SessionRepository filter: ${fieldName}`);
    }
    return this._extractAndValidateId(raw, fieldName);
  }

  _processDateFilter(raw, fieldName) {
    if (raw === null || raw === undefined) {
      throw new Error(`Invalid date value in SessionRepository filter: ${fieldName}`);
    }

    if (raw instanceof Date) {
      if (isNaN(raw.getTime())) {
        throw new Error(`Invalid date value in SessionRepository filter: ${fieldName}`);
      }
      return raw;
    }

    if (typeof raw === "string" || typeof raw === "number") {
      const d = new Date(raw);
      if (isNaN(d.getTime())) {
        throw new Error(`Invalid date value in SessionRepository filter: ${fieldName}`);
      }
      return d;
    }

    if (typeof raw === "object" && !Array.isArray(raw)) {
      const keys = Object.keys(raw);
      if (keys.length === 0) {
        throw new Error(`Invalid date range in SessionRepository filter: ${fieldName} cannot be an empty object`);
      }

      for (const op of keys) {
        if (!ALLOWED_DATE_OPERATORS.has(op)) {
          if (op.startsWith("$")) {
            throw new Error(`Unsupported filter operator in SessionRepository: ${op}`);
          }
          throw new Error(`Unsupported date range operator in SessionRepository: ${op}`);
        }
      }

      const dateCond = {};
      const parseDate = (val, op) => {
        if (val === null || val === undefined || (typeof val === "string" && !val.trim())) {
          throw new Error(`Invalid date value for operator ${op} in SessionRepository filter: ${fieldName}`);
        }
        const parsed = val instanceof Date ? val : new Date(val);
        if (isNaN(parsed.getTime())) {
          throw new Error(`Invalid date value for operator ${op} in SessionRepository filter: ${fieldName}`);
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
        throw new Error(`Invalid date range in SessionRepository filter: lower bound cannot be after upper bound in ${fieldName}`);
      }

      return dateCond;
    }

    throw new Error(`Invalid date value in SessionRepository filter: ${fieldName}`);
  }

  _processTypeFilter(raw, where) {
    if (raw === null || raw === undefined) {
      throw new Error("Invalid type in SessionRepository filter: type");
    }
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!ALLOWED_SESSION_TYPES.has(trimmed)) {
        throw new Error(`Invalid type in SessionRepository filter: ${trimmed}`);
      }
      where.type = trimmed;
      return;
    }
    if (Array.isArray(raw)) {
      if (raw.length === 0) {
        where.type = { in: [] };
        return;
      }
      const types = [];
      for (const item of raw) {
        if (typeof item !== "string" || !ALLOWED_SESSION_TYPES.has(item.trim())) {
          throw new Error(`Invalid type in SessionRepository filter: ${item}`);
        }
        types.push(item.trim());
      }
      where.type = { in: types };
      return;
    }
    if (typeof raw === "object") {
      if (raw.$in !== undefined) {
        if (!Array.isArray(raw.$in)) throw new Error("Invalid array in SessionRepository filter: type");
        if (raw.$in.length === 0) {
          where.type = { in: [] };
          return;
        }
        const types = [];
        for (const item of raw.$in) {
          if (typeof item !== "string" || !ALLOWED_SESSION_TYPES.has(item.trim())) {
            throw new Error(`Invalid type in SessionRepository filter: ${item}`);
          }
          types.push(item.trim());
        }
        where.type = { in: types };
        return;
      }
      if (raw.in !== undefined) {
        if (!Array.isArray(raw.in)) throw new Error("Invalid array in SessionRepository filter: type");
        if (raw.in.length === 0) {
          where.type = { in: [] };
          return;
        }
        const types = [];
        for (const item of raw.in) {
          if (typeof item !== "string" || !ALLOWED_SESSION_TYPES.has(item.trim())) {
            throw new Error(`Invalid type in SessionRepository filter: ${item}`);
          }
          types.push(item.trim());
        }
        where.type = { in: types };
        return;
      }
      for (const k of Object.keys(raw)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in SessionRepository: ${k}`);
        }
      }
      throw new Error("Invalid type in SessionRepository filter: type");
    }
    throw new Error("Invalid type in SessionRepository filter: type");
  }

  _processDateStringFilter(raw, where) {
    if (raw === null || raw === undefined) {
      throw new Error("Invalid date string in SessionRepository filter: date");
    }
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed) throw new Error("Invalid date string in SessionRepository filter: date");
      where.date = trimmed;
      return;
    }
    if (Array.isArray(raw)) {
      if (raw.length === 0) {
        where.date = { in: [] };
        return;
      }
      const dates = [];
      for (const item of raw) {
        if (typeof item !== "string" || !item.trim()) {
          throw new Error("Invalid date string in SessionRepository filter: date");
        }
        dates.push(item.trim());
      }
      where.date = { in: dates };
      return;
    }
    if (typeof raw === "object") {
      if (raw.$in !== undefined) {
        if (!Array.isArray(raw.$in)) throw new Error("Invalid array in SessionRepository filter: date");
        if (raw.$in.length === 0) {
          where.date = { in: [] };
          return;
        }
        const dates = [];
        for (const item of raw.$in) {
          if (typeof item !== "string" || !item.trim()) {
            throw new Error("Invalid date string in SessionRepository filter: date");
          }
          dates.push(item.trim());
        }
        where.date = { in: dates };
        return;
      }
      for (const k of Object.keys(raw)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in SessionRepository: ${k}`);
        }
      }
      throw new Error("Invalid date string in SessionRepository filter: date");
    }
    throw new Error("Invalid date string in SessionRepository filter: date");
  }

  buildDeleteWhere(filter = {}) {
    const where = {};

    for (const key of Object.keys(filter || {})) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in SessionRepository: ${key}`);
      }
      if (!ALLOWED_SESSION_DELETE_FIELDS.has(key)) {
        throw new Error(`Unsupported filter field in SessionRepository: ${key}`);
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

        case "project":
        case "projectId":
          where.projectId = this._processIdFilter(val, key);
          break;

        case "task":
        case "taskId":
          where.taskId = this._processIdFilter(val, key);
          break;

        case "startTime":
          where.startTime = this._processDateFilter(val, "startTime");
          break;

        case "endTime":
          where.endTime = this._processDateFilter(val, "endTime");
          break;

        case "type":
          this._processTypeFilter(val, where);
          break;

        case "date":
          this._processDateStringFilter(val, where);
          break;
      }
    }

    return where;
  }

  async deleteMany(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("SessionRepository.deleteMany requires a valid filter object");
        }

        const where = this.buildDeleteWhere(filter);
        if (Object.keys(where).length === 0) {
          throw new Error("Bulk deletion requires a valid scoped filter in SessionRepository.deleteMany");
        }

        const res = await this.delegate.deleteMany({ where });
        return { acknowledged: true, deletedCount: res.count };
      } catch (err) {
        this.handleError(err);
      }
    }

    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("SessionRepository.deleteMany requires a valid filter object");
    }
    return await this.mongooseModel.deleteMany(filter, options);
  }

  // ---------------------------------------------------------------------------
  // The 6 Aggregation Pipelines (from src/services/report.service.js)
  // ---------------------------------------------------------------------------

  async aggregate(pipeline) {
    if (isPostgres()) {
      try {
        // Translate the standard aggregation pipeline
        return await this.executeAggPipeline(pipeline);
      } catch (err) {
        this.handleError(err);
      }
    }

    return await this.mongooseModel.aggregate(pipeline);
  }

  _parseAggregationUserFilter(raw, fieldName) {
    if (raw === null || raw === undefined) {
      throw new Error(`Invalid identifier in SessionRepository aggregation filter: ${fieldName}`);
    }
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed || trimmed === "[object Object]") {
        throw new Error(`Invalid identifier in SessionRepository aggregation filter: ${fieldName}`);
      }
      return { type: "scalar", id: trimmed };
    }
    if (typeof raw === "number") {
      return { type: "scalar", id: String(raw) };
    }
    if (Array.isArray(raw)) {
      if (raw.length === 0) {
        return { type: "in", ids: [] };
      }
      const ids = raw.map((item) => this._extractAndValidateId(item, fieldName));
      return { type: "in", ids };
    }
    if (typeof raw === "object") {
      if (raw.$in !== undefined || raw.in !== undefined) {
        const arr = raw.$in !== undefined ? raw.$in : raw.in;
        if (!Array.isArray(arr)) {
          throw new Error(`Invalid array in SessionRepository aggregation filter: ${fieldName}`);
        }
        if (arr.length === 0) {
          return { type: "in", ids: [] };
        }
        const ids = arr.map((item) => this._extractAndValidateId(item, fieldName));
        return { type: "in", ids };
      }
      if (typeof raw.toHexString === "function") {
        const hex = raw.toHexString();
        if (hex && typeof hex === "string" && hex.trim() && hex !== "[object Object]") {
          return { type: "scalar", id: hex.trim() };
        }
      }
      if (raw._id !== undefined && raw._id !== null) {
        return this._parseAggregationUserFilter(raw._id, fieldName);
      }
      if (raw.id !== undefined && raw.id !== null) {
        return this._parseAggregationUserFilter(raw.id, fieldName);
      }
      for (const k of Object.keys(raw)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in SessionRepository: ${k}`);
        }
      }
      throw new Error(`Invalid identifier object in SessionRepository filter: ${fieldName}`);
    }
    throw new Error(`Invalid identifier in SessionRepository aggregation filter: ${fieldName}`);
  }

  _areUserFiltersEqual(a, b) {
    if (!a || !b) return a === b;
    if (a.type !== b.type) return false;
    if (a.type === "scalar") {
      return a.id === b.id;
    }
    if (a.type === "in") {
      if (a.ids.length !== b.ids.length) return false;
      const setA = new Set(a.ids);
      return b.ids.every((id) => setA.has(id));
    }
    return false;
  }

  _processAggregationDateFilter(raw, fieldName = "startTime") {
    if (raw === null || raw === undefined) {
      throw new Error(`Invalid date value in SessionRepository aggregation filter: ${fieldName}`);
    }

    if (raw instanceof Date) {
      if (isNaN(raw.getTime())) {
        throw new Error(`Invalid date value in SessionRepository aggregation filter: ${fieldName}`);
      }
      return { equals: raw };
    }

    if (typeof raw === "string" || typeof raw === "number") {
      const d = new Date(raw);
      if (isNaN(d.getTime())) {
        throw new Error(`Invalid date value in SessionRepository aggregation filter: ${fieldName}`);
      }
      return { equals: d };
    }

    if (typeof raw === "object" && !Array.isArray(raw)) {
      const keys = Object.keys(raw);
      if (keys.length === 0) {
        throw new Error(`Invalid date range in SessionRepository aggregation filter: ${fieldName} cannot be an empty object`);
      }

      const ALLOWED_DATE_OPS = new Set(["$gte", "$gt", "$lte", "$lt", "gte", "gt", "lte", "lt"]);
      for (const op of keys) {
        if (!ALLOWED_DATE_OPS.has(op)) {
          if (op.startsWith("$")) {
            throw new Error(`Unsupported filter operator in SessionRepository: ${op}`);
          }
          throw new Error(`Unsupported date range operator in SessionRepository: ${op}`);
        }
      }

      const parseDate = (val, op) => {
        if (val === null || val === undefined || typeof val === "boolean" || (typeof val === "string" && !val.trim())) {
          throw new Error(`Invalid date value for operator ${op} in SessionRepository aggregation filter: ${fieldName}`);
        }
        const parsed = val instanceof Date ? val : new Date(val);
        if (isNaN(parsed.getTime())) {
          throw new Error(`Invalid date value for operator ${op} in SessionRepository aggregation filter: ${fieldName}`);
        }
        return parsed;
      };

      const rawGte = raw.$gte !== undefined ? raw.$gte : raw.gte;
      const rawGt = raw.$gt !== undefined ? raw.$gt : raw.gt;
      const rawLte = raw.$lte !== undefined ? raw.$lte : raw.lte;
      const rawLt = raw.$lt !== undefined ? raw.$lt : raw.lt;

      let gteDate = rawGte !== undefined ? parseDate(rawGte, raw.$gte !== undefined ? "$gte" : "gte") : null;
      let gtDate = rawGt !== undefined ? parseDate(rawGt, raw.$gt !== undefined ? "$gt" : "gt") : null;
      let lteDate = rawLte !== undefined ? parseDate(rawLte, raw.$lte !== undefined ? "$lte" : "lte") : null;
      let ltDate = rawLt !== undefined ? parseDate(rawLt, raw.$lt !== undefined ? "$lt" : "lt") : null;

      let lowerBound = null;
      let lowerKey = null;
      if (gteDate && gtDate) {
        if (gtDate.getTime() >= gteDate.getTime()) {
          lowerBound = gtDate;
          lowerKey = "gt";
        } else {
          lowerBound = gteDate;
          lowerKey = "gte";
        }
      } else if (gteDate) {
        lowerBound = gteDate;
        lowerKey = "gte";
      } else if (gtDate) {
        lowerBound = gtDate;
        lowerKey = "gt";
      }

      let upperBound = null;
      let upperKey = null;
      if (lteDate && ltDate) {
        if (ltDate.getTime() <= lteDate.getTime()) {
          upperBound = ltDate;
          upperKey = "lt";
        } else {
          upperBound = lteDate;
          upperKey = "lte";
        }
      } else if (lteDate) {
        upperBound = lteDate;
        upperKey = "lte";
      } else if (ltDate) {
        upperBound = ltDate;
        upperKey = "lt";
      }

      if (lowerBound && upperBound) {
        if (lowerBound.getTime() > upperBound.getTime()) {
          throw new Error(
            `Invalid date range in SessionRepository aggregation filter: lower bound cannot be after upper bound in ${fieldName}`
          );
        }
        if (lowerBound.getTime() === upperBound.getTime() && (lowerKey === "gt" || upperKey === "lt")) {
          throw new Error(
            `Invalid date range in SessionRepository aggregation filter: lower bound cannot equal upper bound when bound is exclusive in ${fieldName}`
          );
        }
      }

      const dateCond = {};
      if (lowerBound && lowerKey) dateCond[lowerKey] = lowerBound;
      if (upperBound && upperKey) dateCond[upperKey] = upperBound;
      return dateCond;
    }

    throw new Error(`Invalid date value in SessionRepository aggregation filter: ${fieldName}`);
  }

  async executeAggPipeline(pipeline) {
    if (!Array.isArray(pipeline)) {
      throw new Error("SessionRepository.aggregate requires a pipeline array");
    }

    const prisma = this.prisma;
    const matchStage = pipeline.find((s) => s.$match)?.$match || {};
    const groupStage = pipeline.find((s) => s.$group)?.$group || {};
    const sortStage = pipeline.find((s) => s.$sort)?.$sort || {};
    const limitStage = pipeline.find((s) => s.$limit)?.$limit;

    const isPattern1 = groupStage._id === null && groupStage.totalDuration?.$sum === "$duration";
    const isPattern2 = groupStage._id === "$userId" && groupStage.totalDuration?.$sum === "$duration";
    const hasUnsupportedStage = pipeline.some((s) => !s.$match && !s.$group && !s.$sort && !s.$limit);

    if ((!isPattern1 && !isPattern2) || hasUnsupportedStage) {
      throw new Error(
        "Unsupported PostgreSQL aggregation pipeline: pipeline pattern is not supported by the PostgreSQL implementation."
      );
    }

    // Resolve user / userId aliases with conflict detection
    const hasUser = matchStage.user !== undefined;
    const hasUserId = matchStage.userId !== undefined;
    let userFilter = null;

    if (hasUser && hasUserId) {
      const parsedUser = this._parseAggregationUserFilter(matchStage.user, "user");
      const parsedUserId = this._parseAggregationUserFilter(matchStage.userId, "userId");

      if (!this._areUserFiltersEqual(parsedUser, parsedUserId)) {
        throw new Error("Conflicting user and userId filters in SessionRepository aggregation");
      }
      userFilter = parsedUserId;
    } else if (hasUserId) {
      userFilter = this._parseAggregationUserFilter(matchStage.userId, "userId");
    } else if (hasUser) {
      userFilter = this._parseAggregationUserFilter(matchStage.user, "user");
    }

    // Tenant isolation safeguard: short-circuit for explicit empty user array
    if (userFilter && userFilter.type === "in" && userFilter.ids.length === 0) {
      if (isPattern1) {
        return [{ _id: null, totalDuration: 0 }];
      }
      if (isPattern2) {
        return [];
      }
    }

    const type = matchStage.type || "work";

    const where = { type };

    if (userFilter) {
      if (userFilter.type === "in") {
        where.userId = { in: userFilter.ids };
      } else if (userFilter.type === "scalar") {
        where.userId = userFilter.id;
      }
    }

    if (matchStage.startTime !== undefined) {
      const dateCond = this._processAggregationDateFilter(matchStage.startTime, "startTime");
      if (dateCond) {
        if (dateCond.equals !== undefined) {
          where.startTime = dateCond.equals;
        } else if (Object.keys(dateCond).length > 0) {
          where.startTime = dateCond;
        }
      }
    }

    // Pattern 1: Total Duration across all matching users (_id: null)
    if (isPattern1) {
      const result = await prisma.session.aggregate({
        where,
        _sum: { duration: true },
      });

      const total = result?._sum?.duration || 0;
      return [{ _id: null, totalDuration: total }];
    }

    // Pattern 2: Top Performer grouped by userId (_id: "$userId")
    if (isPattern2) {
      const groups = await prisma.session.groupBy({
        by: ["userId"],
        where,
        _sum: { duration: true },
        orderBy: { _sum: { duration: sortStage.totalDuration === 1 ? "asc" : "desc" } },
        ...(limitStage ? { take: limitStage } : {}),
      });

      return groups.map((g) => ({
        _id: g.userId,
        totalDuration: g._sum?.duration || 0,
      }));
    }
  }

  async getTotalWorkDuration(filter = {}) {
    if (isPostgres()) {
      const where = this.buildWhereClause({ ...filter, type: "work" });
      const prisma = this.prisma;
      const res = await prisma.session.aggregate({
        where,
        _sum: { duration: true },
      });
      return res._sum.duration || 0;
    }
    const res = await this.mongooseModel.aggregate([
      { $match: { ...filter, type: "work" } },
      { $group: { _id: null, totalDuration: { $sum: "$duration" } } },
    ]);
    return res[0]?.totalDuration || 0;
  }

  async getTotalBreakDuration(filter = {}) {
    if (isPostgres()) {
      const where = this.buildWhereClause({ ...filter, type: "break" });
      const prisma = this.prisma;
      const res = await prisma.session.aggregate({
        where,
        _sum: { duration: true },
      });
      return res._sum.duration || 0;
    }
    const res = await this.mongooseModel.aggregate([
      { $match: { ...filter, type: "break" } },
      { $group: { _id: null, totalDuration: { $sum: "$duration" } } },
    ]);
    return res[0]?.totalDuration || 0;
  }

  async getTopPerformer(filter = {}, options = {}) {
    if (isPostgres()) {
      const where = this.buildWhereClause({ ...filter, type: "work" });
      const prisma = this.prisma;
      const groups = await prisma.session.groupBy({
        by: ["userId"],
        where,
        _sum: { duration: true },
        orderBy: { _sum: { duration: "desc" } },
        take: options.limit || 1,
      });
      if (groups.length === 0) return null;
      return {
        userId: groups[0].userId,
        totalDuration: groups[0]._sum.duration || 0,
      };
    }
    const res = await this.mongooseModel.aggregate([
      { $match: { ...filter, type: "work" } },
      { $group: { _id: "$userId", totalDuration: { $sum: "$duration" } } },
      { $sort: { totalDuration: -1 } },
      { $limit: options.limit || 1 },
    ]);
    if (!res || res.length === 0) return null;
    return {
      userId: res[0]._id ? res[0]._id.toString() : null,
      totalDuration: res[0].totalDuration || 0,
    };
  }

  async getDistinctUsers(filter = {}) {
    if (isPostgres()) {
      const where = this.buildWhereClause(filter);
      const prisma = this.prisma;
      const distinct = await prisma.session.findMany({
        where,
        select: { userId: true },
        distinct: ["userId"],
      });
      return distinct.map((d) => d.userId);
    }
    return this.mongooseModel.distinct("userId", filter);
  }

  async getDistinctProjects(filter = {}) {
    if (isPostgres()) {
      const where = this.buildWhereClause(filter);
      where.projectId = { not: null };
      const prisma = this.prisma;
      const distinct = await prisma.session.findMany({
        where,
        select: { projectId: true },
        distinct: ["projectId"],
      });
      return distinct.map((d) => d.projectId);
    }
    return this.mongooseModel.distinct("project", filter);
  }

  async getDailyWorkSummaries(filter = {}) {
    if (isPostgres()) {
      const where = this.buildWhereClause({ ...filter, type: "work" });
      const prisma = this.prisma;
      const groups = await prisma.session.groupBy({
        by: ["date", "userId"],
        where,
        _sum: { duration: true },
        orderBy: { date: "asc" },
      });
      return groups.map((g) => ({
        date: g.date,
        userId: g.userId,
        totalDuration: g._sum.duration || 0,
      }));
    }
    return this.mongooseModel.aggregate([
      { $match: { ...filter, type: "work" } },
      { $group: { _id: { date: "$date", userId: "$userId" }, totalDuration: { $sum: "$duration" } } },
      { $project: { _id: 0, date: "$_id.date", userId: "$_id.userId", totalDuration: 1 } },
      { $sort: { date: 1 } },
    ]);
  }

  _buildDateFilter(val, fieldName = "date") {
    if (val === null) {
      return null;
    }
    if (val === undefined) {
      return undefined;
    }
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) {
        throw new Error(`Invalid date string in SessionRepository filter: ${fieldName}`);
      }
      return trimmed;
    }
    if (val instanceof Date) {
      if (isNaN(val.getTime())) {
        throw new Error(`Invalid date value in SessionRepository filter: ${fieldName}`);
      }
      return val.toISOString().split("T")[0];
    }
    if (Array.isArray(val)) {
      if (val.length === 0) {
        return { in: [] };
      }
      const dates = [];
      for (const item of val) {
        if (item === null || item === undefined) {
          throw new Error(`Invalid date in SessionRepository filter: ${fieldName}`);
        }
        if (item instanceof Date) {
          if (isNaN(item.getTime())) throw new Error(`Invalid date in SessionRepository filter: ${fieldName}`);
          dates.push(item.toISOString().split("T")[0]);
        } else if (typeof item === "string") {
          const s = item.trim();
          if (!s) throw new Error(`Invalid date string in SessionRepository filter: ${fieldName}`);
          dates.push(s);
        } else {
          throw new Error(`Invalid date value in SessionRepository filter: ${fieldName}`);
        }
      }
      return { in: dates };
    }
    if (typeof val === "object") {
      const keys = Object.keys(val);
      if (keys.length === 0) {
        throw new Error(`Invalid date range in SessionRepository filter: ${fieldName} cannot be an empty object`);
      }

      const ALLOWED_OPS = new Set([
        "$gte", "$lte", "$gt", "$lt", "gte", "lte", "gt", "lt",
        "$ne", "ne", "not", "$in", "in", "$nin", "nin", "notIn"
      ]);

      for (const k of keys) {
        if (k.startsWith("$") && !ALLOWED_OPS.has(k)) {
          throw new Error(`Unsupported filter operator in SessionRepository: ${k}`);
        }
        if (!ALLOWED_OPS.has(k)) {
          throw new Error(`Unsupported date operator in SessionRepository: ${k}`);
        }
      }

      const parseDateStr = (rawVal, op) => {
        if (rawVal === null || rawVal === undefined) {
          throw new Error(`Invalid date value for operator ${op} in SessionRepository filter: ${fieldName}`);
        }
        if (rawVal instanceof Date) {
          if (isNaN(rawVal.getTime())) {
            throw new Error(`Invalid date value for operator ${op} in SessionRepository filter: ${fieldName}`);
          }
          return rawVal.toISOString().split("T")[0];
        }
        if (typeof rawVal === "string") {
          const s = rawVal.trim();
          if (!s) throw new Error(`Invalid date value for operator ${op} in SessionRepository filter: ${fieldName}`);
          return s;
        }
        if (typeof rawVal === "number") {
          const d = new Date(rawVal);
          if (isNaN(d.getTime())) throw new Error(`Invalid date value for operator ${op} in SessionRepository filter: ${fieldName}`);
          return d.toISOString().split("T")[0];
        }
        throw new Error(`Invalid date value for operator ${op} in SessionRepository filter: ${fieldName}`);
      };

      const dateCond = {};
      if (val.$gte !== undefined || val.gte !== undefined) dateCond.gte = parseDateStr(val.$gte ?? val.gte, "gte");
      if (val.$lte !== undefined || val.lte !== undefined) dateCond.lte = parseDateStr(val.$lte ?? val.lte, "lte");
      if (val.$gt !== undefined || val.gt !== undefined) dateCond.gt = parseDateStr(val.$gt ?? val.gt, "gt");
      if (val.$lt !== undefined || val.lt !== undefined) dateCond.lt = parseDateStr(val.$lt ?? val.lt, "lt");

      if (val.$ne !== undefined || val.ne !== undefined) {
        const neVal = val.$ne !== undefined ? val.$ne : val.ne;
        dateCond.not = neVal === null ? null : parseDateStr(neVal, "not");
      } else if (val.not !== undefined) {
        dateCond.not = val.not === null ? null : parseDateStr(val.not, "not");
      }

      if (val.$in !== undefined || val.in !== undefined) {
        const inArr = val.$in !== undefined ? val.$in : val.in;
        if (!Array.isArray(inArr)) throw new Error(`Invalid array in SessionRepository filter: ${fieldName}`);
        if (inArr.length === 0) {
          dateCond.in = [];
        } else {
          dateCond.in = inArr.map((item) => parseDateStr(item, "in"));
        }
      }

      if (val.$nin !== undefined || val.nin !== undefined || val.notIn !== undefined) {
        const ninArr = val.$nin !== undefined ? val.$nin : val.nin !== undefined ? val.nin : val.notIn;
        if (!Array.isArray(ninArr)) throw new Error(`Invalid array in SessionRepository filter: ${fieldName}`);
        if (ninArr.length === 0) {
          dateCond.notIn = [];
        } else {
          dateCond.notIn = ninArr.map((item) => parseDateStr(item, "notIn"));
        }
      }

      const lowerBound = dateCond.gte || dateCond.gt;
      const upperBound = dateCond.lte || dateCond.lt;
      if (lowerBound && upperBound && lowerBound > upperBound) {
        throw new Error(`Invalid date range in SessionRepository filter: lower bound cannot be after upper bound in ${fieldName}`);
      }

      return dateCond;
    }
    throw new Error(`Invalid date value in SessionRepository filter: ${fieldName}`);
  }

  _buildRelationIdFilter(val, fieldName) {
    if (val === null) {
      return null;
    }
    if (val === undefined) {
      return undefined;
    }
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) {
        throw new Error(`Invalid identifier in SessionRepository filter for field: ${fieldName}`);
      }
      return trimmed;
    }
    if (Array.isArray(val)) {
      if (val.length === 0) return { in: [] };
      const ids = val.map((item) => this.toIdString(item)).filter(Boolean);
      return { in: ids };
    }
    if (typeof val === "object") {
      if (val._id || val.id) {
        const idStr = this.toIdString(val);
        if (idStr && idStr !== "[object Object]") return idStr;
      }
      if (typeof val.toHexString === "function") {
        const hex = val.toHexString();
        if (hex) return hex;
      }
      if (typeof val.toString === "function" && val.constructor && val.constructor.name === "ObjectId") {
        const str = val.toString().trim();
        if (str && str !== "[object Object]") return str;
      }

      const hasIn = val.$in !== undefined || val.in !== undefined;
      const hasNe = val.$ne !== undefined || val.ne !== undefined;
      const hasNin = val.$nin !== undefined || val.nin !== undefined || val.notIn !== undefined;

      if (hasIn) {
        const rawIn = val.$in !== undefined ? val.$in : val.in;
        if (!Array.isArray(rawIn)) {
          throw new Error(`Invalid array in SessionRepository filter: ${fieldName}`);
        }
        const ids = rawIn.map((t) => this.toIdString(t)).filter(Boolean);

        if (hasNe) {
          const rawNe = val.$ne !== undefined ? val.$ne : val.ne;
          const excludedId = rawNe === null ? null : this.toIdString(rawNe);
          const filteredIds = excludedId ? ids.filter((id) => id !== excludedId) : ids;
          return { in: filteredIds, not: excludedId };
        }

        return { in: ids };
      }

      if (hasNe) {
        const rawNe = val.$ne !== undefined ? val.$ne : val.ne;
        if (rawNe === null) {
          return { not: null };
        }
        const excludedId = this.toIdString(rawNe);
        if (!excludedId || excludedId === "[object Object]") {
          throw new Error(`Invalid identifier in SessionRepository filter for field: ${fieldName}`);
        }
        return { not: excludedId };
      }

      if (hasNin) {
        const rawNin = val.$nin !== undefined ? val.$nin : val.nin !== undefined ? val.nin : val.notIn;
        if (!Array.isArray(rawNin)) {
          throw new Error(`Invalid array in SessionRepository filter: ${fieldName}`);
        }
        const ids = rawNin.map((t) => this.toIdString(t)).filter(Boolean);
        return { notIn: ids };
      }

      for (const k of Object.keys(val)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in SessionRepository: ${k}`);
        }
      }
      throw new Error(`Invalid identifier object in SessionRepository filter: ${fieldName}`);
    }
    return this.toIdString(val);
  }

  buildWhereClause(filter) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      return {};
    }

    const where = {};
    if (filter._id !== undefined) where.id = this._buildRelationIdFilter(filter._id, "_id");
    if (filter.id !== undefined) {
      const idFilter = this._buildRelationIdFilter(filter.id, "id");
      if (where.id !== undefined && typeof where.id === "string" && typeof idFilter === "string" && where.id !== idFilter) {
        throw new Error("Conflicting id filters in SessionRepository");
      }
      where.id = idFilter;
    }

    if (filter.user !== undefined && filter.userId !== undefined) {
      const u1 = typeof filter.user === "string" ? filter.user : this.toIdString(filter.user);
      const u2 = typeof filter.userId === "string" ? filter.userId : this.toIdString(filter.userId);
      if (u1 && u2 && u1 !== u2) {
        throw new Error("Conflicting user filters in SessionRepository");
      }
    }

    if (filter.user !== undefined) {
      if (typeof filter.user === "object" && filter.user !== null && filter.user.$in) {
        where.userId = { in: filter.user.$in.map((u) => this.toIdString(u)).filter(Boolean) };
      } else if (typeof filter.user === "object" && filter.user !== null && filter.user.in) {
        where.userId = { in: filter.user.in.map((u) => this.toIdString(u)).filter(Boolean) };
      } else if (Array.isArray(filter.user)) {
        where.userId = { in: filter.user.map((u) => this.toIdString(u)).filter(Boolean) };
      } else {
        where.userId = this.toIdString(filter.user);
      }
    }
    if (filter.userId !== undefined) {
      if (typeof filter.userId === "object" && filter.userId !== null && filter.userId.$in) {
        where.userId = { in: filter.userId.$in.map((u) => this.toIdString(u)).filter(Boolean) };
      } else if (typeof filter.userId === "object" && filter.userId !== null && filter.userId.in) {
        where.userId = { in: filter.userId.in.map((u) => this.toIdString(u)).filter(Boolean) };
      } else if (Array.isArray(filter.userId)) {
        where.userId = { in: filter.userId.map((u) => this.toIdString(u)).filter(Boolean) };
      } else {
        where.userId = this.toIdString(filter.userId);
      }
    }

    if (filter.project !== undefined) {
      where.projectId = this._buildRelationIdFilter(filter.project, "project");
    }
    if (filter.projectId !== undefined) {
      const projIdFilter = this._buildRelationIdFilter(filter.projectId, "projectId");
      if (where.projectId !== undefined && typeof where.projectId === "string" && typeof projIdFilter === "string" && where.projectId !== projIdFilter) {
        throw new Error("Conflicting project filters in SessionRepository");
      }
      where.projectId = projIdFilter;
    }

    if (filter.task !== undefined) {
      where.taskId = this._buildRelationIdFilter(filter.task, "task");
    }
    if (filter.taskId !== undefined) {
      const taskIdFilter = this._buildRelationIdFilter(filter.taskId, "taskId");
      if (where.taskId !== undefined && typeof where.taskId === "string" && typeof taskIdFilter === "string" && where.taskId !== taskIdFilter) {
        throw new Error("Conflicting task filters in SessionRepository");
      }
      where.taskId = taskIdFilter;
    }

    if (filter.type) where.type = filter.type;

    if (filter.date !== undefined) {
      where.date = this._buildDateFilter(filter.date, "date");
    }

    if (filter.startTime !== undefined) {
      if (typeof filter.startTime === "object" && !(filter.startTime instanceof Date) && filter.startTime !== null) {
        where.startTime = {};
        if (filter.startTime.$gte !== undefined || filter.startTime.gte !== undefined) {
          where.startTime.gte = new Date(filter.startTime.$gte ?? filter.startTime.gte);
        }
        if (filter.startTime.$lte !== undefined || filter.startTime.lte !== undefined) {
          where.startTime.lte = new Date(filter.startTime.$lte ?? filter.startTime.lte);
        }
        if (filter.startTime.$gt !== undefined || filter.startTime.gt !== undefined) {
          where.startTime.gt = new Date(filter.startTime.$gt ?? filter.startTime.gt);
        }
        if (filter.startTime.$lt !== undefined || filter.startTime.lt !== undefined) {
          where.startTime.lt = new Date(filter.startTime.$lt ?? filter.startTime.lt);
        }
      } else if (filter.startTime !== null) {
        where.startTime = new Date(filter.startTime);
      }
    }

    if (filter.endTime !== undefined) {
      if (filter.endTime === null) {
        where.endTime = null;
      } else if (typeof filter.endTime === "object" && !(filter.endTime instanceof Date)) {
        where.endTime = {};
        if (filter.endTime.$gte !== undefined || filter.endTime.gte !== undefined) {
          where.endTime.gte = new Date(filter.endTime.$gte ?? filter.endTime.gte);
        }
        if (filter.endTime.$lte !== undefined || filter.endTime.lte !== undefined) {
          where.endTime.lte = new Date(filter.endTime.$lte ?? filter.endTime.lte);
        }
        if (filter.endTime.$gt !== undefined || filter.endTime.gt !== undefined) {
          where.endTime.gt = new Date(filter.endTime.$gt ?? filter.endTime.gt);
        }
        if (filter.endTime.$lt !== undefined || filter.endTime.lt !== undefined) {
          where.endTime.lt = new Date(filter.endTime.$lt ?? filter.endTime.lt);
        }
      } else {
        where.endTime = new Date(filter.endTime);
      }
    }

    if (Array.isArray(filter.OR)) {
      where.OR = filter.OR.map((clause) => this.buildWhereClause(clause));
    }

    return where;
  }

  /**
   * PostgreSQL-first interval query for session overlap.
   * Equivalent to parameterized SQL:
   *   WHERE user_id = $1
   *     AND start_time < $2
   *     AND (end_time > $3 OR end_time IS NULL)
   *
   * @param {Object} params
   * @param {string|string[]} params.userId - Employee ID or array of employee IDs
   * @param {Date|string} params.periodStart - UTC period start (inclusive)
   * @param {Date|string} params.periodEnd - UTC period end (exclusive)
   * @param {string} [params.type] - Optional session type ('work', 'break')
   * @param {Object} [options] - Additional options (populate, sort, limit, skip)
   * @returns {Promise<Array>} Array of formatted session objects
   */
  async findOverlappingSessions({ userId, userIds, periodStart, periodEnd, type, options = {} } = {}) {
    const rawUser = userId || userIds;
    if (!rawUser) {
      throw new Error("findOverlappingSessions requires a valid userId or userIds");
    }

    const pStart = periodStart instanceof Date ? periodStart : new Date(periodStart);
    const pEnd = periodEnd instanceof Date ? periodEnd : new Date(periodEnd);

    if (isNaN(pStart.getTime()) || isNaN(pEnd.getTime())) {
      throw new Error("findOverlappingSessions requires valid periodStart and periodEnd timestamps");
    }

    if (pStart >= pEnd) {
      return [];
    }

    const isArray = Array.isArray(rawUser);
    const userFilter = isArray
      ? { in: rawUser.map((u) => this.toIdString(u)).filter(Boolean) }
      : this.toIdString(rawUser);

    const query = {
      userId: userFilter,
      startTime: { lt: pEnd },
      OR: [
        { endTime: { gt: pStart } },
        { endTime: null },
      ],
    };

    if (type && ALLOWED_SESSION_TYPES.has(type)) {
      query.type = type;
    }

    return await this.find(query, options);
  }

  /**
   * PostgreSQL-first check for session overlap.
   * Checks if an employee has any session overlapping [startTime, endTime).
   * Also detects active sessions (where end_time is NULL).
   *
   * @param {string} userId - Authenticated employee ID
   * @param {Date|string} startTime
   * @param {Date|string} endTime
   * @returns {Promise<Object|null>} Overlapping session or null
   */
  async checkOverlap(userId, startTime, endTime) {
    const userStr = this.toIdString(userId);
    if (!userStr) {
      throw new Error("checkOverlap requires a valid userId");
    }

    const sStart = startTime instanceof Date ? startTime : new Date(startTime);
    const sEnd = endTime instanceof Date ? endTime : new Date(endTime);

    if (isNaN(sStart.getTime()) || isNaN(sEnd.getTime())) {
      throw new Error("checkOverlap requires valid startTime and endTime timestamps");
    }

    if (isPostgres()) {
      try {
        const doc = await this.delegate.findFirst({
          where: {
            userId: userStr,
            startTime: { lt: sEnd },
            OR: [
              { endTime: { gt: sStart } },
              { endTime: null },
            ],
          },
          orderBy: { startTime: "asc" },
        });

        return doc ? this.formatSession(doc) : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    return await this.findOne({
      userId: userStr,
      startTime: { $lt: sEnd },
      $or: [
        { endTime: { $gt: sStart } },
        { endTime: null },
        { endTime: { $exists: false } },
      ],
    });
  }

  /**
   * Find any currently active session for a user (where endTime IS NULL).
   *
   * @param {string} userId
   * @returns {Promise<Object|null>}
   */
  async findActiveSession(userId) {
    const userStr = this.toIdString(userId);
    if (!userStr) return null;

    if (isPostgres()) {
      try {
        const doc = await this.delegate.findFirst({
          where: {
            userId: userStr,
            endTime: null,
          },
          orderBy: { startTime: "desc" },
        });
        return doc ? this.formatSession(doc) : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    return await this.findOne({
      userId: userStr,
      $or: [{ endTime: null }, { endTime: { $exists: false } }],
    });
  }

  /**
   * Complete an active session by recording authoritative endTime and duration.
   *
   * @param {string} sessionId
   * @param {Object} data - { endTime, duration }
   * @returns {Promise<Object|null>}
   */
  async completeSession(sessionId, { endTime, duration } = {}) {
    const idStr = this.toIdString(sessionId);
    if (!idStr) throw new Error("completeSession requires a valid sessionId");

    const end = endTime instanceof Date ? endTime : new Date(endTime || Date.now());
    if (isNaN(end.getTime())) throw new Error("completeSession requires a valid endTime");

    const existing = await this.findById(idStr);
    if (!existing) return null;

    const sStart = new Date(existing.startTime);
    const derivedDuration = duration !== undefined
      ? Number(duration)
      : Math.max(0, Math.floor((end.getTime() - sStart.getTime()) / 1000));

    return await this.findByIdAndUpdate(idStr, {
      endTime: end,
      duration: derivedDuration,
    });
  }
}

export const sessionRepository = new SessionRepository();
export default sessionRepository;
