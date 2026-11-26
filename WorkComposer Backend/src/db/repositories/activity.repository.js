const ALLOWED_ACTIVITY_DELETE_FIELDS = new Set([
  "user",
  "userId",
  "_id",
  "id",
  "project",
  "projectId",
  "task",
  "taskId",
  "date",
  "createdAt",
  "eventTimestamp",
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

import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

export class ActivityRepository extends BaseRepository {
  constructor() {
    super("Activity");
  }

  formatActivity(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    serialized.user = serialized.user || serialized.userId;
    if (serialized.projectId !== undefined && serialized.project === undefined) {
      serialized.project = serialized.projectId;
    }
    if (serialized.taskId !== undefined && serialized.task === undefined) {
      serialized.task = serialized.taskId;
    }
    serialized.idempotencyKey = doc.idempotencyKey || doc.idempotency_key || serialized.idempotencyKey || null;
    serialized.eventTimestamp = doc.eventTimestamp || doc.event_timestamp || serialized.eventTimestamp || null;
    serialized.telemetry = doc.telemetry || serialized.telemetry || null;
    delete serialized.userId;
    delete serialized.projectId;
    delete serialized.taskId;
    return serialized;
  }

  _buildTaskFilter(val, fieldName = "task") {
    if (val === null) {
      return null;
    }
    if (val === undefined) {
      return undefined;
    }
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) {
        throw new Error(`Invalid identifier in ActivityRepository filter for field: ${fieldName}`);
      }
      return trimmed;
    }
    if (typeof val === "object") {
      if (val.$ne !== undefined) {
        if (val.$ne === null) {
          return { not: null };
        }
        return { not: this.toIdString(val.$ne) };
      }
      if (val.ne !== undefined) {
        if (val.ne === null) {
          return { not: null };
        }
        return { not: this.toIdString(val.ne) };
      }
      if (val.$in !== undefined) {
        if (!Array.isArray(val.$in)) {
          throw new Error(`Invalid array in ActivityRepository filter: ${fieldName}`);
        }
        return { in: val.$in.map((t) => this.toIdString(t)) };
      }
      if (val.in !== undefined) {
        if (!Array.isArray(val.in)) {
          throw new Error(`Invalid array in ActivityRepository filter: ${fieldName}`);
        }
        return { in: val.in.map((t) => this.toIdString(t)) };
      }
      const candidate = val._id || val.id;
      if (candidate) {
        const idStr = this.toIdString(candidate);
        if (idStr && idStr !== "[object Object]") {
          return idStr;
        }
      }
      if (typeof val.toHexString === "function") {
        const hex = val.toHexString();
        if (hex) return hex;
      }
      if (typeof val.toString === "function" && val.constructor && val.constructor.name === "ObjectId") {
        const str = val.toString().trim();
        if (str && str !== "[object Object]") return str;
      }
      for (const k of Object.keys(val)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in ActivityRepository: ${k}`);
        }
      }
      throw new Error(`Invalid identifier object in ActivityRepository filter: ${fieldName}`);
    }
    return this.toIdString(val);
  }

  buildWhere(filter = {}) {
    const where = {};
    if (filter._id) where.id = this.toIdString(filter._id);
    if (filter.id) where.id = this.toIdString(filter.id);
    if (filter.idempotencyKey) where.idempotencyKey = String(filter.idempotencyKey);
    if (filter.user) {
      if (filter.user.$in) where.userId = { in: filter.user.$in.map((u) => this.toIdString(u)) };
      else where.userId = this.toIdString(filter.user);
    }
    if (filter.userId) {
      if (filter.userId.$in) where.userId = { in: filter.userId.$in.map((u) => this.toIdString(u)) };
      else where.userId = this.toIdString(filter.userId);
    }
    if (filter.project) where.projectId = this.toIdString(filter.project);
    if (filter.projectId) where.projectId = this.toIdString(filter.projectId);
    if (filter.task !== undefined) {
      const taskCond = this._buildTaskFilter(filter.task, "task");
      if (taskCond !== undefined) where.taskId = taskCond;
    }
    if (filter.taskId !== undefined) {
      const taskCond = this._buildTaskFilter(filter.taskId, "taskId");
      if (taskCond !== undefined) where.taskId = taskCond;
    }

    if (filter.date) {
      if (typeof filter.date === "object") {
        const dateCond = {};
        if (filter.date.$gte) dateCond.gte = filter.date.$gte;
        if (filter.date.$lte) dateCond.lte = filter.date.$lte;
        if (filter.date.$in) dateCond.in = filter.date.$in;
        where.date = dateCond;
      } else {
        where.date = String(filter.date);
      }
    }

    if (filter.createdAt) {
      if (typeof filter.createdAt === "object") {
        const cond = {};
        if (filter.createdAt.$gte || filter.createdAt.gte) {
          cond.gte = new Date(filter.createdAt.$gte || filter.createdAt.gte);
        }
        if (filter.createdAt.$gt || filter.createdAt.gt) {
          cond.gt = new Date(filter.createdAt.$gt || filter.createdAt.gt);
        }
        if (filter.createdAt.$lte || filter.createdAt.lte) {
          cond.lte = new Date(filter.createdAt.$lte || filter.createdAt.lte);
        }
        if (filter.createdAt.$lt || filter.createdAt.lt) {
          cond.lt = new Date(filter.createdAt.$lt || filter.createdAt.lt);
        }
        where.createdAt = cond;
      } else {
        where.createdAt = new Date(filter.createdAt);
      }
    }

    if (filter.eventTimestamp !== undefined) {
      if (filter.eventTimestamp === null) {
        where.eventTimestamp = null;
      } else if (typeof filter.eventTimestamp === "object" && !(filter.eventTimestamp instanceof Date)) {
        const cond = {};
        if (filter.eventTimestamp.$gte || filter.eventTimestamp.gte) {
          cond.gte = new Date(filter.eventTimestamp.$gte || filter.eventTimestamp.gte);
        }
        if (filter.eventTimestamp.$gt || filter.eventTimestamp.gt) {
          cond.gt = new Date(filter.eventTimestamp.$gt || filter.eventTimestamp.gt);
        }
        if (filter.eventTimestamp.$lte || filter.eventTimestamp.lte) {
          cond.lte = new Date(filter.eventTimestamp.$lte || filter.eventTimestamp.lte);
        }
        if (filter.eventTimestamp.$lt || filter.eventTimestamp.lt) {
          cond.lt = new Date(filter.eventTimestamp.$lt || filter.eventTimestamp.lt);
        }
        where.eventTimestamp = cond;
      } else {
        where.eventTimestamp = new Date(filter.eventTimestamp);
      }
    }

    if (filter.OR || filter.$or) {
      const orList = filter.OR || filter.$or;
      if (Array.isArray(orList)) {
        where.OR = orList.map((clause) => this.buildWhere(clause));
      }
    }

    return where;
  }

  async findOne(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const doc = await this.delegate.findFirst({ where });
        return this.formatActivity(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOne(filter);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const queryOptions = { where };

        if (options.sort) {
          if (Array.isArray(options.sort)) {
            queryOptions.orderBy = options.sort;
          } else {
            const entries = Object.entries(options.sort);
            if (entries.length > 1) {
              queryOptions.orderBy = entries.map(([field, dir]) => ({
                [field]: dir === -1 || dir === "desc" ? "desc" : "asc",
              }));
            } else if (entries.length === 1) {
              const [sortField, sortDir] = entries[0];
              queryOptions.orderBy = { [sortField]: sortDir === -1 || sortDir === "desc" ? "desc" : "asc" };
            }
          }
        }
        if (options.limit) queryOptions.take = options.limit;
        if (options.skip) queryOptions.skip = options.skip;

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => this.formatActivity(d));
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.find(filter);
    if (options.sort) query = query.sort(options.sort);
    if (options.limit) query = query.limit(options.limit);
    if (options.skip) query = query.skip(options.skip);
    const docs = await query;
    return docs.map((d) => this.serialize(d.toObject ? d.toObject() : d));
  }

  async create(data) {
    if (isPostgres()) {
      try {
        const userId = this.toIdString(data.user || data.userId);
        const projectId = data.project || data.projectId ? this.toIdString(data.project || data.projectId) : null;
        const taskId = data.task || data.taskId ? this.toIdString(data.task || data.taskId) : null;
        const newId = data._id ? this.toIdString(data._id) : generateId();

        const createData = {
          id: newId,
          userId,
          projectId,
          taskId,
          date: String(data.date),
          keyPresses: typeof data.keyPresses === "number" ? data.keyPresses : 0,
          mouseClicks: typeof data.mouseClicks === "number" ? data.mouseClicks : 0,
          mouseMoves: typeof data.mouseMoves === "number" ? data.mouseMoves : 0,
          idempotencyKey: data.idempotencyKey ? String(data.idempotencyKey) : null,
          eventTimestamp: data.eventTimestamp ? new Date(data.eventTimestamp) : null,
          telemetry: data.telemetry ? data.telemetry : undefined,
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatActivity(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.create(data);
    return this.serialize(doc.toObject ? doc.toObject() : doc);
  }

  _extractAndValidateId(val, fieldName) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in ActivityRepository filter for field: ${fieldName}`);
    }
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) {
        throw new Error(`Invalid identifier in ActivityRepository filter for field: ${fieldName}`);
      }
      return trimmed;
    }
    if (typeof val === "object") {
      if (val._id) {
        const idStr = String(val._id).trim();
        if (!idStr) {
          throw new Error(`Invalid identifier in ActivityRepository filter for field: ${fieldName}`);
        }
        return idStr;
      }
      if (val.id) {
        const idStr = String(val.id).trim();
        if (!idStr) {
          throw new Error(`Invalid identifier in ActivityRepository filter for field: ${fieldName}`);
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
      throw new Error(`Invalid identifier object in ActivityRepository filter: ${fieldName}`);
    }
    throw new Error(`Invalid identifier in ActivityRepository filter for field: ${fieldName}`);
  }

  _processIdFilter(raw, fieldName) {
    if (raw === null || raw === undefined) {
      throw new Error(`Invalid identifier in ActivityRepository filter for field: ${fieldName}`);
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
          throw new Error(`Invalid array in ActivityRepository filter: ${fieldName}`);
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
          throw new Error(`Invalid array in ActivityRepository filter: ${fieldName}`);
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
          throw new Error(`Unsupported filter operator in ActivityRepository: ${k}`);
        }
      }
      throw new Error(`Invalid identifier object in ActivityRepository filter: ${fieldName}`);
    }
    return this._extractAndValidateId(raw, fieldName);
  }

  _processDateStringFilter(raw, where) {
    if (raw === null || raw === undefined) {
      throw new Error("Invalid date string in ActivityRepository filter: date");
    }
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed) throw new Error("Invalid date string in ActivityRepository filter: date");
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
          throw new Error("Invalid date string in ActivityRepository filter: date");
        }
        dates.push(item.trim());
      }
      where.date = { in: dates };
      return;
    }
    if (typeof raw === "object") {
      if (raw.$in !== undefined) {
        if (!Array.isArray(raw.$in)) throw new Error("Invalid array in ActivityRepository filter: date");
        if (raw.$in.length === 0) {
          where.date = { in: [] };
          return;
        }
        const dates = [];
        for (const item of raw.$in) {
          if (typeof item !== "string" || !item.trim()) {
            throw new Error("Invalid date string in ActivityRepository filter: date");
          }
          dates.push(item.trim());
        }
        where.date = { in: dates };
        return;
      }
      if (raw.in !== undefined) {
        if (!Array.isArray(raw.in)) throw new Error("Invalid array in ActivityRepository filter: date");
        if (raw.in.length === 0) {
          where.date = { in: [] };
          return;
        }
        const dates = [];
        for (const item of raw.in) {
          if (typeof item !== "string" || !item.trim()) {
            throw new Error("Invalid date string in ActivityRepository filter: date");
          }
          dates.push(item.trim());
        }
        where.date = { in: dates };
        return;
      }
      for (const k of Object.keys(raw)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in ActivityRepository: ${k}`);
        }
      }
      throw new Error("Invalid date string in ActivityRepository filter: date");
    }
    throw new Error("Invalid date string in ActivityRepository filter: date");
  }

  _processCreatedAtFilter(raw) {
    if (raw === null || raw === undefined) {
      throw new Error("Invalid date value in ActivityRepository filter: createdAt");
    }

    if (raw instanceof Date) {
      if (isNaN(raw.getTime())) {
        throw new Error("Invalid date value in ActivityRepository filter: createdAt");
      }
      return raw;
    }

    if (typeof raw === "string" || typeof raw === "number") {
      const d = new Date(raw);
      if (isNaN(d.getTime())) {
        throw new Error("Invalid date value in ActivityRepository filter: createdAt");
      }
      return d;
    }

    if (typeof raw === "object" && !Array.isArray(raw)) {
      const keys = Object.keys(raw);
      if (keys.length === 0) {
        throw new Error("Invalid date range in ActivityRepository filter: createdAt cannot be an empty object");
      }

      for (const op of keys) {
        if (!ALLOWED_DATE_OPERATORS.has(op)) {
          if (op.startsWith("$")) {
            throw new Error(`Unsupported filter operator in ActivityRepository: ${op}`);
          }
          throw new Error(`Unsupported date range operator in ActivityRepository: ${op}`);
        }
      }

      const dateCond = {};
      const parseDate = (val, op) => {
        if (val === null || val === undefined || (typeof val === "string" && !val.trim())) {
          throw new Error(`Invalid date value for operator ${op} in ActivityRepository filter: createdAt`);
        }
        const parsed = val instanceof Date ? val : new Date(val);
        if (isNaN(parsed.getTime())) {
          throw new Error(`Invalid date value for operator ${op} in ActivityRepository filter: createdAt`);
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
        throw new Error("Invalid date range in ActivityRepository filter: lower bound cannot be after upper bound in createdAt");
      }

      return dateCond;
    }

    throw new Error("Invalid date value in ActivityRepository filter: createdAt");
  }

  buildDeleteWhere(filter = {}) {
    const where = {};

    for (const key of Object.keys(filter || {})) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in ActivityRepository: ${key}`);
      }
      if (!ALLOWED_ACTIVITY_DELETE_FIELDS.has(key)) {
        throw new Error(`Unsupported filter field in ActivityRepository: ${key}`);
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

        case "date":
          this._processDateStringFilter(val, where);
          break;

        case "createdAt":
          where.createdAt = this._processCreatedAtFilter(val);
          break;

        case "eventTimestamp":
          where.eventTimestamp = this._processCreatedAtFilter(val);
          break;
      }
    }

    return where;
  }

  async deleteMany(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("ActivityRepository.deleteMany requires a valid filter object");
        }

        const where = this.buildDeleteWhere(filter);
        if (Object.keys(where).length === 0) {
          throw new Error("Bulk deletion requires a valid scoped filter in ActivityRepository.deleteMany");
        }

        const res = await this.delegate.deleteMany({ where });
        return { deletedCount: res.count };
      } catch (err) {
        this.handleError(err);
      }
    }

    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("ActivityRepository.deleteMany requires a valid filter object");
    }
    return await this.mongooseModel.deleteMany(filter, options);
  }
}

export const activityRepository = new ActivityRepository();
export default activityRepository;
