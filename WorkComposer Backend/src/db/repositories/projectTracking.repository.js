const ALLOWED_PROJECT_TRACKING_FILTER_FIELDS = new Set([
  "user",
  "userId",
  "project",
  "projectId",
  "task",
  "taskId",
  "_id",
  "id",
  "date",
  "createdAt",
]);
const ALLOWED_PROJECT_TRACKING_DELETE_FIELDS = ALLOWED_PROJECT_TRACKING_FILTER_FIELDS;
const ALLOWED_PROJECT_TRACKING_FIND_FIELDS = ALLOWED_PROJECT_TRACKING_FILTER_FIELDS;

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

function isFilterValueEqual(a, b) {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (typeof a === "object" && typeof b === "object" && a.in && b.in) {
    if (!Array.isArray(a.in) || !Array.isArray(b.in)) return false;
    if (a.in.length !== b.in.length) return false;
    const sortedA = [...a.in].sort();
    const sortedB = [...b.in].sort();
    return sortedA.every((v, idx) => v === sortedB[idx]);
  }
  if (typeof a === "object" && typeof b === "object" && "not" in a && "not" in b) {
    return a.not === b.not;
  }
  if (typeof a === "object" && typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return String(a).trim() === String(b).trim();
}

import { BaseRepository } from "./base.repository.js";
import { isMongo, isPostgres } from "../index.js";
import { getAmbientTransaction } from "../transaction.js";
import { generateId } from "../../utils/idGenerator.js";

function hasPopulate(name, options = {}) {
  if (!options || typeof options !== "object") return false;
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  if (options[`populate${cap}`]) return true;

  if (name === "user" && (options.populateUser || options.populateUserId)) return true;
  if (name === "project" && (options.populateProject || options.populateProjectId)) return true;
  if (name === "task" && (options.populateTask || options.populateTaskId)) return true;

  if (!options.populate) return false;
  if (options.populate === true) return true;

  const checkMatch = (target) => {
    if (typeof target !== "string") return false;
    const t = target.trim();
    if (name === "user" || name === "userId") return t === "user" || t === "userId";
    if (name === "project" || name === "projectId") return t === "project" || t === "projectId";
    if (name === "task" || name === "taskId") return t === "task" || t === "taskId";
    return t === name;
  };

  if (typeof options.populate === "string") {
    const parts = options.populate.split(/\s+/).filter(Boolean);
    return parts.some((p) => checkMatch(p));
  }
  if (Array.isArray(options.populate)) {
    return options.populate.some((p) => {
      if (typeof p === "string") return checkMatch(p);
      if (typeof p === "object" && p !== null) return checkMatch(p.path);
      return false;
    });
  }
  if (typeof options.populate === "object" && options.populate !== null) {
    return checkMatch(options.populate.path);
  }
  return false;
}

export class ProjectTrackingRepository extends BaseRepository {
  constructor() {
    super("ProjectTracking");
  }

  formatTracking(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    if (serialized.id && !serialized._id) serialized._id = serialized.id;
    if (serialized._id && !serialized.id) serialized.id = serialized._id;
    serialized.user = serialized.user || serialized.userId;
    serialized.project = serialized.project || serialized.projectId;
    if (serialized.taskId !== undefined && serialized.task === undefined) {
      serialized.task = serialized.taskId;
    }
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
      if (!trimmed || trimmed === "[object Object]") {
        throw new Error(`Invalid identifier in ProjectTrackingRepository filter for field: ${fieldName}`);
      }
      return trimmed;
    }
    if (Array.isArray(val)) {
      if (val.length === 0) return { in: [] };
      return { in: val.map((item) => this._validateScalarId(item, fieldName)) };
    }
    if (typeof val === "object") {
      if (val.$ne !== undefined) {
        if (val.$ne === null) {
          return { not: null };
        }
        return { not: this._validateScalarId(val.$ne, fieldName) };
      }
      if (val.ne !== undefined) {
        if (val.ne === null) {
          return { not: null };
        }
        return { not: this._validateScalarId(val.ne, fieldName) };
      }
      if (val.$in !== undefined) {
        if (!Array.isArray(val.$in)) {
          throw new Error(`Invalid array in ProjectTrackingRepository filter: ${fieldName}`);
        }
        if (val.$in.length === 0) return { in: [] };
        return { in: val.$in.map((t) => this._validateScalarId(t, fieldName)) };
      }
      if (val.in !== undefined) {
        if (!Array.isArray(val.in)) {
          throw new Error(`Invalid array in ProjectTrackingRepository filter: ${fieldName}`);
        }
        if (val.in.length === 0) return { in: [] };
        return { in: val.in.map((t) => this._validateScalarId(t, fieldName)) };
      }
      const candidate = val._id || val.id;
      if (candidate) {
        const idStr = this._validateScalarId(candidate, fieldName);
        if (idStr) {
          return idStr;
        }
      }
      if (typeof val.toHexString === "function") {
        const hex = val.toHexString().trim();
        if (hex && hex !== "[object Object]") return hex;
      }
      if (typeof val.toString === "function" && val.constructor && val.constructor.name === "ObjectId") {
        const str = val.toString().trim();
        if (str && str !== "[object Object]") return str;
      }
      for (const k of Object.keys(val)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in ProjectTrackingRepository: ${k}`);
        }
      }
      throw new Error(`Invalid identifier object in ProjectTrackingRepository filter: ${fieldName}`);
    }
    return this._validateScalarId(val, fieldName);
  }

  buildWhere(filter = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("ProjectTrackingRepository query requires a valid filter object");
    }

    const where = {};

    for (const key of Object.keys(filter)) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in ProjectTrackingRepository: ${key}`);
      }
      if (!ALLOWED_PROJECT_TRACKING_FIND_FIELDS.has(key)) {
        throw new Error(`Unsupported filter field in ProjectTrackingRepository: ${key}`);
      }
    }

    // 1. _id / id
    let resolvedId = null;
    if (Object.prototype.hasOwnProperty.call(filter, "_id")) {
      resolvedId = this._processIdFilter(filter._id, "_id");
    }
    let resolvedIdFromField = null;
    if (Object.prototype.hasOwnProperty.call(filter, "id")) {
      resolvedIdFromField = this._processIdFilter(filter.id, "id");
    }
    if (resolvedId !== null && resolvedIdFromField !== null) {
      if (!isFilterValueEqual(resolvedId, resolvedIdFromField)) {
        throw new Error("Conflicting id filters in ProjectTrackingRepository");
      }
    }
    const finalId = resolvedId !== null ? resolvedId : resolvedIdFromField;
    if (finalId !== null) {
      where.id = finalId;
    }

    // 2. user / userId
    let resolvedUser = null;
    if (Object.prototype.hasOwnProperty.call(filter, "user")) {
      resolvedUser = this._processIdFilter(filter.user, "user");
    }
    let resolvedUserFromField = null;
    if (Object.prototype.hasOwnProperty.call(filter, "userId")) {
      resolvedUserFromField = this._processIdFilter(filter.userId, "userId");
    }
    if (resolvedUser !== null && resolvedUserFromField !== null) {
      if (!isFilterValueEqual(resolvedUser, resolvedUserFromField)) {
        throw new Error("Conflicting user filters in ProjectTrackingRepository");
      }
    }
    const finalUser = resolvedUser !== null ? resolvedUser : resolvedUserFromField;
    if (finalUser !== null) {
      where.userId = finalUser;
    }

    // 3. project / projectId
    let resolvedProject = null;
    if (Object.prototype.hasOwnProperty.call(filter, "project")) {
      resolvedProject = this._processIdFilter(filter.project, "project");
    }
    let resolvedProjectFromField = null;
    if (Object.prototype.hasOwnProperty.call(filter, "projectId")) {
      resolvedProjectFromField = this._processIdFilter(filter.projectId, "projectId");
    }
    if (resolvedProject !== null && resolvedProjectFromField !== null) {
      if (!isFilterValueEqual(resolvedProject, resolvedProjectFromField)) {
        throw new Error("Conflicting project filters in ProjectTrackingRepository");
      }
    }
    const finalProject = resolvedProject !== null ? resolvedProject : resolvedProjectFromField;
    if (finalProject !== null) {
      where.projectId = finalProject;
    }

    // 4. task / taskId
    let resolvedTask = undefined;
    if (Object.prototype.hasOwnProperty.call(filter, "task")) {
      if (filter.task === undefined) {
        throw new Error("Invalid identifier in ProjectTrackingRepository filter for field: task");
      }
      resolvedTask = this._buildTaskFilter(filter.task, "task");
    }
    let resolvedTaskFromField = undefined;
    if (Object.prototype.hasOwnProperty.call(filter, "taskId")) {
      if (filter.taskId === undefined) {
        throw new Error("Invalid identifier in ProjectTrackingRepository filter for field: taskId");
      }
      resolvedTaskFromField = this._buildTaskFilter(filter.taskId, "taskId");
    }
    if (resolvedTask !== undefined && resolvedTaskFromField !== undefined) {
      if (!isFilterValueEqual(resolvedTask, resolvedTaskFromField)) {
        throw new Error("Conflicting task filters in ProjectTrackingRepository");
      }
    }
    const finalTask = resolvedTask !== undefined ? resolvedTask : resolvedTaskFromField;
    if (finalTask !== undefined) {
      where.taskId = finalTask;
    }

    // 5. date
    if (Object.prototype.hasOwnProperty.call(filter, "date")) {
      this._processDateStringFilter(filter.date, where);
    }

    // 6. createdAt
    if (Object.prototype.hasOwnProperty.call(filter, "createdAt")) {
      where.createdAt = this._processCreatedAtFilter(filter.createdAt);
    }

    const hasScope = where.userId !== undefined || where.projectId !== undefined || where.taskId !== undefined || where.id !== undefined;
    if (!hasScope) {
      throw new Error("ProjectTrackingRepository query requires a valid scoped filter: user, project, task, or record ID is required");
    }

    return where;
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const include = {};
        if (hasPopulate("project", options)) {
          include.project = { select: { id: true, name: true } };
        }
        if (hasPopulate("task", options)) {
          include.task = { select: { id: true, title: true } };
        }
        if (hasPopulate("user", options)) {
          include.user = {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
            },
          };
        }

        const queryOptions = { where };
        if (Object.keys(include).length > 0) queryOptions.include = include;
        if (options.sort) {
          const [sortField, sortDir] = Object.entries(options.sort)[0] || ["createdAt", -1];
          const prismaField = sortField === "_id" ? "id" : sortField;
          queryOptions.orderBy = { [prismaField]: sortDir === -1 || sortDir === "desc" ? "desc" : "asc" };
        }
        if (typeof options.skip === "number" && !isNaN(options.skip) && options.skip >= 0) {
          queryOptions.skip = options.skip;
        }
        if (typeof options.limit === "number" && !isNaN(options.limit) && options.limit >= 0) {
          queryOptions.take = options.limit;
        }

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => {
          const formatted = this.formatTracking(d);
          if (d.project && typeof d.project === "object") {
            formatted.project = this.serialize(d.project);
            if (formatted.project.id && !formatted.project._id) formatted.project._id = formatted.project.id;
            if (formatted.project._id && !formatted.project.id) formatted.project.id = formatted.project._id;
          }
          if (d.task && typeof d.task === "object") {
            formatted.task = this.serialize(d.task);
            if (formatted.task.id && !formatted.task._id) formatted.task._id = formatted.task.id;
            if (formatted.task._id && !formatted.task.id) formatted.task.id = formatted.task._id;
          }
          if (d.user && typeof d.user === "object") {
            formatted.user = this.serialize(d.user);
            if (formatted.user.id && !formatted.user._id) formatted.user._id = formatted.user.id;
            if (formatted.user._id && !formatted.user.id) formatted.user.id = formatted.user._id;
          }
          return formatted;
        });
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.find(filter);
    if (options.populate) {
      query = query.populate(options.populate);
    } else {
      if (hasPopulate("project", options)) query = query.populate("project");
      if (hasPopulate("task", options)) query = query.populate("task");
      if (hasPopulate("user", options)) query = query.populate("user");
    }
    if (options.sort) query = query.sort(options.sort);
    if (typeof options.skip === "number" && !isNaN(options.skip) && options.skip >= 0) query = query.skip(options.skip);
    if (typeof options.limit === "number" && !isNaN(options.limit) && options.limit >= 0) query = query.limit(options.limit);
    const docs = await query;
    return docs.map((d) => this.serialize(d.toObject ? d.toObject() : d));
  }

  async findOne(filter = {}, options = {}) {
    if (isPostgres()) {
      const results = await this.find(filter, { ...options, limit: 1 });
      return results && results.length > 0 ? results[0] : null;
    }

    let query = this.mongooseModel.findOne(filter);
    if (options.populate) {
      query = query.populate(options.populate);
    } else {
      if (hasPopulate("project", options)) query = query.populate("project");
      if (hasPopulate("task", options)) query = query.populate("task");
      if (hasPopulate("user", options)) query = query.populate("user");
    }
    if (options.sort) query = query.sort(options.sort);
    if (typeof options.skip === "number" && !isNaN(options.skip) && options.skip >= 0) query = query.skip(options.skip);
    const doc = await query;
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findById(id, options = {}) {
    const idStr = this._validateScalarId(id, "id");
    if (isPostgres()) {
      return this.findOne({ _id: idStr }, options);
    }

    let query = typeof this.mongooseModel.findById === "function"
      ? this.mongooseModel.findById(idStr)
      : this.mongooseModel.findOne({ _id: idStr });

    if (options.populate) {
      query = query.populate(options.populate);
    } else {
      if (hasPopulate("project", options)) query = query.populate("project");
      if (hasPopulate("task", options)) query = query.populate("task");
      if (hasPopulate("user", options)) query = query.populate("user");
    }
    const doc = await query;
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async create(data, options = {}) {
    if (isPostgres()) {
      try {
        const userId = this.toIdString(data.user || data.userId);
        const projectId = this.toIdString(data.project || data.projectId);
        const taskId = data.task || data.taskId ? this.toIdString(data.task || data.taskId) : null;
        const newId = data._id ? this.toIdString(data._id) : generateId();

        const createData = {
          id: newId,
          userId,
          projectId,
          taskId,
          startTime: new Date(data.startTime),
          endTime: new Date(data.endTime),
          duration: typeof data.duration === "number" ? data.duration : 0,
          date: String(data.date),
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatTracking(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const session = (options && options.session) || (isMongo() && typeof getAmbientTransaction === "function" ? getAmbientTransaction() : null);
    if (session) {
      const docs = Array.isArray(data) ? data : [data];
      const res = await this.mongooseModel.create(docs, { session });
      if (Array.isArray(data)) {
        return res.map((d) => this.serialize(d.toObject ? d.toObject() : d));
      }
      const doc = res[0];
      return this.serialize(doc.toObject ? doc.toObject() : doc);
    }

    const doc = await this.mongooseModel.create(data);
    return this.serialize(doc.toObject ? doc.toObject() : doc);
  }

  _validateScalarId(val, fieldName) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in ProjectTrackingRepository filter for field: ${fieldName}`);
    }

    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed || trimmed === "[object Object]") {
        throw new Error(`Invalid identifier in ProjectTrackingRepository filter for field: ${fieldName}`);
      }
      return trimmed;
    }

    if (typeof val === "object") {
      const candidate = val._id || val.id;
      if (candidate && typeof candidate === "string" && candidate.trim() && candidate.trim() !== "[object Object]") {
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
        if (hex && hex !== "[object Object]") return hex;
      }
      if (typeof val.toString === "function") {
        const str = val.toString().trim();
        if (str && str !== "[object Object]") {
          return str;
        }
      }

      throw new Error(`Invalid identifier object in ProjectTrackingRepository filter: ${fieldName}`);
    }

    throw new Error(`Invalid identifier in ProjectTrackingRepository filter for field: ${fieldName}`);
  }

  _processIdFilter(val, fieldName) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in ProjectTrackingRepository filter for field: ${fieldName}`);
    }

    if (Array.isArray(val)) {
      if (val.length === 0) return { in: [] };
      return { in: val.map((item) => this._validateScalarId(item, fieldName)) };
    }

    if (typeof val === "object") {
      if (val.$in !== undefined) {
        if (!Array.isArray(val.$in)) {
          throw new Error(`Invalid array in ProjectTrackingRepository filter: ${fieldName}`);
        }
        if (val.$in.length === 0) return { in: [] };
        return { in: val.$in.map((item) => this._validateScalarId(item, fieldName)) };
      }
      if (val.in !== undefined) {
        if (!Array.isArray(val.in)) {
          throw new Error(`Invalid array in ProjectTrackingRepository filter: ${fieldName}`);
        }
        if (val.in.length === 0) return { in: [] };
        return { in: val.in.map((item) => this._validateScalarId(item, fieldName)) };
      }

      for (const k of Object.keys(val)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in ProjectTrackingRepository: ${k}`);
        }
      }

      return this._validateScalarId(val, fieldName);
    }

    return this._validateScalarId(val, fieldName);
  }

  _processDateStringFilter(raw, where) {
    if (raw === null || raw === undefined) {
      throw new Error("Invalid date string in ProjectTrackingRepository filter: date");
    }

    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed) {
        throw new Error("Invalid date string in ProjectTrackingRepository filter: date");
      }
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
          throw new Error("Invalid date string in ProjectTrackingRepository filter: date");
        }
        dates.push(item.trim());
      }
      where.date = { in: dates };
      return;
    }

    if (typeof raw === "object") {
      const keys = Object.keys(raw);
      if (keys.length === 0) {
        throw new Error("Invalid date filter in ProjectTrackingRepository: date cannot be an empty object");
      }

      const hasRangeOp = keys.some((k) =>
        ["$gte", "$lte", "$gt", "$lt", "gte", "lte", "gt", "lt"].includes(k)
      );

      if (hasRangeOp) {
        for (const k of keys) {
          if (!ALLOWED_DATE_OPERATORS.has(k)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in ProjectTrackingRepository: ${k}`);
            }
            throw new Error(`Unsupported date range operator in ProjectTrackingRepository: ${k}`);
          }
        }

        const rangeCond = {};
        const validateDateStr = (v, op) => {
          if (typeof v !== "string" || !v.trim()) {
            throw new Error(`Invalid date string for operator ${op} in ProjectTrackingRepository filter: date`);
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
          throw new Error("Invalid date range in ProjectTrackingRepository filter: lower bound cannot be after upper bound in date");
        }

        where.date = rangeCond;
        return;
      }

      if (raw.$in !== undefined) {
        if (!Array.isArray(raw.$in)) throw new Error("Invalid array in ProjectTrackingRepository filter: date");
        if (raw.$in.length === 0) {
          where.date = { in: [] };
          return;
        }
        const dates = [];
        for (const item of raw.$in) {
          if (typeof item !== "string" || !item.trim()) {
            throw new Error("Invalid date string in ProjectTrackingRepository filter: date");
          }
          dates.push(item.trim());
        }
        where.date = { in: dates };
        return;
      }

      if (raw.in !== undefined) {
        if (!Array.isArray(raw.in)) throw new Error("Invalid array in ProjectTrackingRepository filter: date");
        if (raw.in.length === 0) {
          where.date = { in: [] };
          return;
        }
        const dates = [];
        for (const item of raw.in) {
          if (typeof item !== "string" || !item.trim()) {
            throw new Error("Invalid date string in ProjectTrackingRepository filter: date");
          }
          dates.push(item.trim());
        }
        where.date = { in: dates };
        return;
      }

      for (const k of Object.keys(raw)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in ProjectTrackingRepository: ${k}`);
        }
      }

      throw new Error("Invalid date string in ProjectTrackingRepository filter: date");
    }

    throw new Error("Invalid date string in ProjectTrackingRepository filter: date");
  }

  _processCreatedAtFilter(raw) {
    if (raw === null || raw === undefined) {
      throw new Error("Invalid date value in ProjectTrackingRepository filter: createdAt");
    }

    if (raw instanceof Date) {
      if (isNaN(raw.getTime())) {
        throw new Error("Invalid date value in ProjectTrackingRepository filter: createdAt");
      }
      return raw;
    }

    if (typeof raw === "string" || typeof raw === "number") {
      const d = new Date(raw);
      if (isNaN(d.getTime())) {
        throw new Error("Invalid date value in ProjectTrackingRepository filter: createdAt");
      }
      return d;
    }

    if (typeof raw === "object" && !Array.isArray(raw)) {
      const keys = Object.keys(raw);
      if (keys.length === 0) {
        throw new Error("Invalid date range in ProjectTrackingRepository filter: createdAt cannot be an empty object");
      }

      for (const op of keys) {
        if (!ALLOWED_DATE_OPERATORS.has(op)) {
          if (op.startsWith("$")) {
            throw new Error(`Unsupported filter operator in ProjectTrackingRepository: ${op}`);
          }
          throw new Error(`Unsupported date range operator in ProjectTrackingRepository: ${op}`);
        }
      }

      const dateCond = {};
      const parseDate = (val, op) => {
        if (val === null || val === undefined || (typeof val === "string" && !val.trim())) {
          throw new Error(`Invalid date value for operator ${op} in ProjectTrackingRepository filter: createdAt`);
        }
        const parsed = val instanceof Date ? val : new Date(val);
        if (isNaN(parsed.getTime())) {
          throw new Error(`Invalid date value for operator ${op} in ProjectTrackingRepository filter: createdAt`);
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
        throw new Error("Invalid date range in ProjectTrackingRepository filter: lower bound cannot be after upper bound in createdAt");
      }

      return dateCond;
    }

    throw new Error("Invalid date value in ProjectTrackingRepository filter: createdAt");
  }

  buildDeleteWhere(filter = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("ProjectTrackingRepository.deleteMany requires a valid filter object");
    }

    for (const key of Object.keys(filter)) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in ProjectTrackingRepository: ${key}`);
      }
      if (!ALLOWED_PROJECT_TRACKING_DELETE_FIELDS.has(key)) {
        throw new Error(`Unsupported filter field in ProjectTrackingRepository: ${key}`);
      }
    }

    const where = {};

    // 1. _id / id
    let resolvedId = null;
    if (Object.prototype.hasOwnProperty.call(filter, "_id")) {
      resolvedId = this._processIdFilter(filter._id, "_id");
    }
    let resolvedIdFromField = null;
    if (Object.prototype.hasOwnProperty.call(filter, "id")) {
      resolvedIdFromField = this._processIdFilter(filter.id, "id");
    }
    if (resolvedId !== null && resolvedIdFromField !== null) {
      if (!isFilterValueEqual(resolvedId, resolvedIdFromField)) {
        throw new Error("Conflicting id filters in ProjectTrackingRepository");
      }
    }
    const finalId = resolvedId !== null ? resolvedId : resolvedIdFromField;
    if (finalId !== null) {
      where.id = finalId;
    }

    // 2. user / userId
    let resolvedUser = null;
    if (Object.prototype.hasOwnProperty.call(filter, "user")) {
      resolvedUser = this._processIdFilter(filter.user, "user");
    }
    let resolvedUserFromField = null;
    if (Object.prototype.hasOwnProperty.call(filter, "userId")) {
      resolvedUserFromField = this._processIdFilter(filter.userId, "userId");
    }
    if (resolvedUser !== null && resolvedUserFromField !== null) {
      if (!isFilterValueEqual(resolvedUser, resolvedUserFromField)) {
        throw new Error("Conflicting user filters in ProjectTrackingRepository");
      }
    }
    const finalUser = resolvedUser !== null ? resolvedUser : resolvedUserFromField;
    if (finalUser !== null) {
      where.userId = finalUser;
    }

    // 3. project / projectId
    let resolvedProject = null;
    if (Object.prototype.hasOwnProperty.call(filter, "project")) {
      resolvedProject = this._processIdFilter(filter.project, "project");
    }
    let resolvedProjectFromField = null;
    if (Object.prototype.hasOwnProperty.call(filter, "projectId")) {
      resolvedProjectFromField = this._processIdFilter(filter.projectId, "projectId");
    }
    if (resolvedProject !== null && resolvedProjectFromField !== null) {
      if (!isFilterValueEqual(resolvedProject, resolvedProjectFromField)) {
        throw new Error("Conflicting project filters in ProjectTrackingRepository");
      }
    }
    const finalProject = resolvedProject !== null ? resolvedProject : resolvedProjectFromField;
    if (finalProject !== null) {
      where.projectId = finalProject;
    }

    // 4. task / taskId
    let resolvedTask = undefined;
    if (Object.prototype.hasOwnProperty.call(filter, "task")) {
      if (filter.task === undefined) {
        throw new Error("Invalid identifier in ProjectTrackingRepository filter for field: task");
      }
      resolvedTask = this._buildTaskFilter(filter.task, "task");
    }
    let resolvedTaskFromField = undefined;
    if (Object.prototype.hasOwnProperty.call(filter, "taskId")) {
      if (filter.taskId === undefined) {
        throw new Error("Invalid identifier in ProjectTrackingRepository filter for field: taskId");
      }
      resolvedTaskFromField = this._buildTaskFilter(filter.taskId, "taskId");
    }
    if (resolvedTask !== undefined && resolvedTaskFromField !== undefined) {
      if (!isFilterValueEqual(resolvedTask, resolvedTaskFromField)) {
        throw new Error("Conflicting task filters in ProjectTrackingRepository");
      }
    }
    const finalTask = resolvedTask !== undefined ? resolvedTask : resolvedTaskFromField;
    if (finalTask !== undefined) {
      where.taskId = finalTask;
    }

    // 5. date
    if (Object.prototype.hasOwnProperty.call(filter, "date")) {
      this._processDateStringFilter(filter.date, where);
    }

    // 6. createdAt
    if (Object.prototype.hasOwnProperty.call(filter, "createdAt")) {
      where.createdAt = this._processCreatedAtFilter(filter.createdAt);
    }

    if (Object.keys(where).length === 0) {
      throw new Error("Bulk deletion requires a valid scoped filter in ProjectTrackingRepository.deleteMany");
    }

    if (where.taskId === null || (where.taskId && typeof where.taskId === "object" && "not" in where.taskId)) {
      if (!where.userId && !where.projectId && !where.id) {
        throw new Error("Bulk deletion requires a valid scoped filter in ProjectTrackingRepository.deleteMany");
      }
    }

    return where;
  }

  async deleteMany(filter = {}, options = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("ProjectTrackingRepository.deleteMany requires a valid filter object");
    }

    const where = this.buildDeleteWhere(filter);
    if (Object.keys(where).length === 0) {
      throw new Error("Bulk deletion requires a valid scoped filter in ProjectTrackingRepository.deleteMany");
    }

    if (isPostgres()) {
      try {
        const res = await this.delegate.deleteMany({ where });
        return { deletedCount: res.count };
      } catch (err) {
        this.handleError(err);
      }
    }

    return await this.mongooseModel.deleteMany(filter, options);
  }
}

export const projectTrackingRepository = new ProjectTrackingRepository();
export default projectTrackingRepository;
