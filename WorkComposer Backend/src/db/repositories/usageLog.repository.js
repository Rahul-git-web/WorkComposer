import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

const ALLOWED_USAGE_LOG_DELETE_FIELDS = new Set([
  "_id",
  "id",
  "user",
  "userId",
  "project",
  "projectId",
  "task",
  "taskId",
  "appName",
  "date",
  "createdAt",
]);

const ALLOWED_USAGE_LOG_FILTER_FIELDS = new Set([
  "_id",
  "id",
  "user",
  "userId",
  "project",
  "projectId",
  "task",
  "taskId",
  "appName",
  "date",
  "startTime",
  "endTime",
  "createdAt",
  "updatedAt",
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

export class UsageLogRepository extends BaseRepository {
  constructor() {
    super("UsageLog");
  }

  formatUsageLog(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    serialized.user = serialized.user || serialized.userId;
    if (serialized.projectId !== undefined && serialized.project === undefined) {
      serialized.project = serialized.projectId;
    }
    if (serialized.taskId !== undefined && serialized.task === undefined) {
      serialized.task = serialized.taskId;
    }
    delete serialized.userId;
    delete serialized.projectId;
    delete serialized.taskId;
    return serialized;
  }

  buildWhere(filter = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("UsageLogRepository.find requires a valid filter object");
    }

    const where = {};

    for (const key of Object.keys(filter)) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in UsageLogRepository: ${key}`);
      }
      if (!ALLOWED_USAGE_LOG_FILTER_FIELDS.has(key)) {
        throw new Error(`Unsupported filter field in UsageLogRepository: ${key}`);
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

        case "appName":
          where.appName = this._processAppNameFilter(val);
          break;

        case "date":
          this._processDateStringFilter(val, where);
          break;

        case "startTime":
          where.startTime = this._processDateFilter(val, "startTime");
          break;

        case "endTime":
          where.endTime = this._processDateFilter(val, "endTime");
          break;

        case "createdAt":
          where.createdAt = this._processDateFilter(val, "createdAt");
          break;

        case "updatedAt":
          where.updatedAt = this._processDateFilter(val, "updatedAt");
          break;
      }
    }

    return where;
  }

  _validateScalarId(val, fieldName) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in UsageLogRepository filter: ${fieldName}`);
    }

    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) {
        throw new Error(`Invalid identifier in UsageLogRepository filter: ${fieldName}`);
      }
      return trimmed;
    }

    if (typeof val === "object") {
      if (typeof val.toHexString === "function") {
        return val.toHexString();
      }
      if (typeof val.toString === "function" && val.toString !== Object.prototype.toString) {
        const str = val.toString().trim();
        if (str && str !== "[object Object]") {
          return str;
        }
      }
    }

    if (typeof val === "number" && !isNaN(val)) {
      return String(val);
    }

    throw new Error(`Invalid identifier in UsageLogRepository filter: ${fieldName}`);
  }

  _processIdFilter(val, fieldName) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in UsageLogRepository filter: ${fieldName}`);
    }

    if (Array.isArray(val)) {
      if (val.length === 0) {
        return { in: [] };
      }
      return { in: val.map((item) => this._validateScalarId(item, fieldName)) };
    }

    if (typeof val === "object") {
      if (typeof val.toHexString === "function") {
        return val.toHexString();
      }

      const keys = Object.keys(val);
      if (keys.length === 0) {
        throw new Error(`Invalid filter condition for ${fieldName} in UsageLogRepository: empty object`);
      }

      if (val.$in !== undefined) {
        if (!Array.isArray(val.$in)) {
          throw new Error(`Invalid array for $in operator in UsageLogRepository filter: ${fieldName}`);
        }
        if (val.$in.length === 0) {
          return { in: [] };
        }
        return { in: val.$in.map((item) => this._validateScalarId(item, fieldName)) };
      }

      if (val.in !== undefined) {
        if (!Array.isArray(val.in)) {
          throw new Error(`Invalid array for in operator in UsageLogRepository filter: ${fieldName}`);
        }
        if (val.in.length === 0) {
          return { in: [] };
        }
        return { in: val.in.map((item) => this._validateScalarId(item, fieldName)) };
      }

      for (const op of keys) {
        if (op.startsWith("$")) {
          throw new Error(`Unsupported filter operator in UsageLogRepository: ${op}`);
        }
      }

      if (typeof val.toString === "function" && val.toString !== Object.prototype.toString) {
        const str = val.toString().trim();
        if (str && str !== "[object Object]") {
          return str;
        }
      }

      throw new Error(`Invalid filter condition for ${fieldName} in UsageLogRepository`);
    }

    return this._validateScalarId(val, fieldName);
  }

  _processAppNameFilter(raw) {
    if (raw === null || raw === undefined) {
      throw new Error("Invalid appName filter in UsageLogRepository: appName cannot be null or undefined");
    }

    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed) {
        throw new Error("Invalid appName filter in UsageLogRepository: appName cannot be empty");
      }
      return trimmed;
    }

    if (Array.isArray(raw)) {
      if (raw.length === 0) {
        return { in: [] };
      }
      return {
        in: raw.map((item) => {
          if (typeof item !== "string" || !item.trim()) {
            throw new Error("Invalid appName in UsageLogRepository array filter");
          }
          return item.trim();
        }),
      };
    }

    if (typeof raw === "object") {
      const keys = Object.keys(raw);
      if (keys.length === 0) {
        throw new Error("Invalid appName filter in UsageLogRepository: empty object");
      }

      if (raw.$in !== undefined) {
        if (!Array.isArray(raw.$in)) {
          throw new Error("Invalid array in UsageLogRepository filter: appName");
        }
        if (raw.$in.length === 0) {
          return { in: [] };
        }
        return {
          in: raw.$in.map((item) => {
            if (typeof item !== "string" || !item.trim()) {
              throw new Error("Invalid appName in UsageLogRepository filter");
            }
            return item.trim();
          }),
        };
      }

      if (raw.in !== undefined) {
        if (!Array.isArray(raw.in)) {
          throw new Error("Invalid array in UsageLogRepository filter: appName");
        }
        if (raw.in.length === 0) {
          return { in: [] };
        }
        return {
          in: raw.in.map((item) => {
            if (typeof item !== "string" || !item.trim()) {
              throw new Error("Invalid appName in UsageLogRepository filter");
            }
            return item.trim();
          }),
        };
      }

      for (const k of keys) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in UsageLogRepository: ${k}`);
        }
      }
    }

    throw new Error("Invalid appName filter in UsageLogRepository: must be a valid string or array");
  }

  _processDateStringFilter(raw, where) {
    if (raw === null || raw === undefined) {
      throw new Error("Invalid date filter in UsageLogRepository: date cannot be null or undefined");
    }

    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed) {
        throw new Error("Invalid date filter in UsageLogRepository: date string cannot be empty");
      }
      where.date = trimmed;
      return;
    }

    if (typeof raw === "object" && !Array.isArray(raw)) {
      const keys = Object.keys(raw);
      if (keys.length === 0) {
        throw new Error("Invalid date filter in UsageLogRepository: date cannot be an empty object");
      }

      const hasRangeOp = keys.some((k) =>
        ["$gte", "$lte", "$gt", "$lt", "gte", "lte", "gt", "lt"].includes(k)
      );

      if (hasRangeOp) {
        for (const k of keys) {
          if (!ALLOWED_DATE_OPERATORS.has(k)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in UsageLogRepository: ${k}`);
            }
            throw new Error(`Unsupported date range operator in UsageLogRepository: ${k}`);
          }
        }

        const rangeCond = {};
        const validateDateStr = (v, op) => {
          if (typeof v !== "string" || !v.trim()) {
            throw new Error(`Invalid date string for operator ${op} in UsageLogRepository filter: date`);
          }
          return v.trim();
        };

        if (raw.$gte !== undefined) rangeCond.gte = validateDateStr(raw.$gte, "$gte");
        if (raw.gte !== undefined) rangeCond.gte = validateDateStr(raw.gte, "gte");
        if (raw.$gt !== undefined) rangeCond.gt = validateDateStr(raw.$gt, "$gt");
        if (raw.gt !== undefined) rangeCond.gt = validateDateStr(raw.gt, "gt");
        if (raw.$lte !== undefined) rangeCond.lte = validateDateStr(raw.$lte, "$lte");
        if (raw.lte !== undefined) rangeCond.lte = validateDateStr(raw.lte, "lte");
        if (raw.$lt !== undefined) rangeCond.lt = validateDateStr(raw.$lt, "$lt");
        if (raw.lt !== undefined) rangeCond.lt = validateDateStr(raw.lt, "lt");

        const lower = rangeCond.gte || rangeCond.gt;
        const upper = rangeCond.lte || rangeCond.lt;
        if (lower && upper && lower > upper) {
          throw new Error("Invalid date range in UsageLogRepository filter: lower bound cannot be after upper bound in date");
        }

        where.date = rangeCond;
        return;
      }

      if (raw.$in !== undefined) {
        if (!Array.isArray(raw.$in)) throw new Error("Invalid array in UsageLogRepository filter: date");
        if (raw.$in.length === 0) {
          where.date = { in: [] };
          return;
        }
        const dates = [];
        for (const item of raw.$in) {
          if (typeof item !== "string" || !item.trim()) {
            throw new Error("Invalid date string in UsageLogRepository filter: date");
          }
          dates.push(item.trim());
        }
        where.date = { in: dates };
        return;
      }

      if (raw.in !== undefined) {
        if (!Array.isArray(raw.in)) throw new Error("Invalid array in UsageLogRepository filter: date");
        if (raw.in.length === 0) {
          where.date = { in: [] };
          return;
        }
        const dates = [];
        for (const item of raw.in) {
          if (typeof item !== "string" || !item.trim()) {
            throw new Error("Invalid date string in UsageLogRepository filter: date");
          }
          dates.push(item.trim());
        }
        where.date = { in: dates };
        return;
      }

      for (const k of Object.keys(raw)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in UsageLogRepository: ${k}`);
        }
      }

      throw new Error("Invalid date string in UsageLogRepository filter: date");
    }

    throw new Error("Invalid date string in UsageLogRepository filter: date");
  }

  _processDateFilter(raw, fieldName) {
    if (raw === null || raw === undefined) {
      throw new Error(`Invalid date value in UsageLogRepository filter: ${fieldName}`);
    }

    if (raw instanceof Date) {
      if (isNaN(raw.getTime())) {
        throw new Error(`Invalid date value in UsageLogRepository filter: ${fieldName}`);
      }
      return raw;
    }

    if (typeof raw === "string" || typeof raw === "number") {
      const trimmed = typeof raw === "string" ? raw.trim() : raw;
      if (trimmed === "") {
        throw new Error(`Invalid date string in UsageLogRepository filter: ${fieldName}`);
      }
      const d = new Date(trimmed);
      if (isNaN(d.getTime())) {
        throw new Error(`Invalid date value in UsageLogRepository filter: ${fieldName}`);
      }
      return d;
    }

    if (typeof raw === "object" && !Array.isArray(raw)) {
      const keys = Object.keys(raw);
      if (keys.length === 0) {
        throw new Error(`Invalid date range in UsageLogRepository filter: ${fieldName} cannot be an empty object`);
      }

      for (const op of keys) {
        if (!ALLOWED_DATE_OPERATORS.has(op)) {
          if (op.startsWith("$")) {
            throw new Error(`Unsupported filter operator in UsageLogRepository: ${op}`);
          }
          throw new Error(`Unsupported date range operator in UsageLogRepository: ${op}`);
        }
      }

      const dateCond = {};
      const parseDate = (val, op) => {
        if (val === null || val === undefined || (typeof val === "string" && !val.trim())) {
          throw new Error(`Invalid date value for operator ${op} in UsageLogRepository filter: ${fieldName}`);
        }
        const parsed = val instanceof Date ? val : new Date(val);
        if (isNaN(parsed.getTime())) {
          throw new Error(`Invalid date value for operator ${op} in UsageLogRepository filter: ${fieldName}`);
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
        throw new Error(`Invalid date range in UsageLogRepository filter: lower bound cannot be after upper bound in ${fieldName}`);
      }

      return dateCond;
    }

    throw new Error(`Invalid date value in UsageLogRepository filter: ${fieldName}`);
  }

  _processCreatedAtFilter(raw) {
    return this._processDateFilter(raw, "createdAt");
  }

  buildDeleteWhere(filter = {}) {
    const where = {};

    for (const key of Object.keys(filter || {})) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in UsageLogRepository: ${key}`);
      }
      if (!ALLOWED_USAGE_LOG_DELETE_FIELDS.has(key)) {
        throw new Error(`Unsupported filter field in UsageLogRepository: ${key}`);
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

        case "appName":
          where.appName = this._processAppNameFilter(val);
          break;

        case "date":
          this._processDateStringFilter(val, where);
          break;

        case "createdAt":
          where.createdAt = this._processCreatedAtFilter(val);
          break;
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
          const field = sortField === "capturedAt" ? "startTime" : sortField;
          queryOptions.orderBy = { [field]: sortDir === -1 || sortDir === "desc" ? "desc" : "asc" };
        }
        if (options.limit) queryOptions.take = options.limit;
        if (options.skip) queryOptions.skip = options.skip;

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => this.formatUsageLog(d));
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
          appName: data.appName,
          windowTitle: data.windowTitle || "",
          startTime: new Date(data.startTime),
          endTime: new Date(data.endTime),
          duration: typeof data.duration === "number" ? data.duration : 0,
          date: String(data.date),
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatUsageLog(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.create(data);
    return this.serialize(doc.toObject ? doc.toObject() : doc);
  }

  async deleteMany(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("UsageLogRepository.deleteMany requires a valid filter object");
        }

        const where = this.buildDeleteWhere(filter);
        if (Object.keys(where).length === 0) {
          throw new Error("Bulk deletion requires a valid scoped filter in UsageLogRepository.deleteMany");
        }

        const res = await this.delegate.deleteMany({ where });
        return { deletedCount: res.count };
      } catch (err) {
        this.handleError(err);
      }
    }

    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("UsageLogRepository.deleteMany requires a valid filter object");
    }
    return await this.mongooseModel.deleteMany(filter, options);
  }
}

export const usageLogRepository = new UsageLogRepository();
export default usageLogRepository;
