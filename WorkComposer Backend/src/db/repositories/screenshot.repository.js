const ALLOWED_SCREENSHOT_DELETE_FIELDS = new Set([
  "user",
  "userId",
  "project",
  "projectId",
  "task",
  "taskId",
  "_id",
  "id",
  "capturedAt",
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

function hasPopulate(name, options = {}) {
  if (!options || typeof options !== "object") return false;
  if (options.populate === false) return false;

  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  if (options[`populate${cap}`]) return true;
  if (options[`populate${cap}Id`]) return true;

  if ((name === "user" || name === "userId") && (options.populateUser || options.populateUserId)) {
    return true;
  }
  if ((name === "project" || name === "projectId") && (options.populateProject || options.populateProjectId)) {
    return true;
  }
  if ((name === "task" || name === "taskId") && (options.populateTask || options.populateTaskId)) {
    return true;
  }

  if (!options.populate) return false;
  if (options.populate === true) return true;

  const checkMatch = (target) => {
    if (typeof target !== "string") return false;
    const t = target.trim();
    if (name === "user" || name === "userId") {
      return t === "user" || t === "userId";
    }
    if (name === "project" || name === "projectId") {
      return t === "project" || t === "projectId";
    }
    if (name === "task" || name === "taskId") {
      return t === "task" || t === "taskId";
    }
    return t === name;
  };

  if (typeof options.populate === "string") {
    const parts = options.populate.trim().split(/[\s,]+/).filter(Boolean);
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

function getPopulateSelect(name, options = {}) {
  if (!options || !options.populate) return null;
  const isTarget = (p) => {
    if (typeof p === "string") return p.trim() === name;
    if (typeof p === "object" && p !== null) return p.path === name;
    return false;
  };
  if (Array.isArray(options.populate)) {
    const found = options.populate.find((p) => isTarget(p));
    return (found && typeof found === "object" && found.select) ? found.select : null;
  }
  if (typeof options.populate === "object" && options.populate !== null && options.populate.path === name) {
    return options.populate.select || null;
  }
  return null;
}

export class ScreenshotRepository extends BaseRepository {
  constructor() {
    super("Screenshot");
  }

  hasPopulate(name, options = {}) {
    return hasPopulate(name, options);
  }

  _buildInclude(options = {}) {
    const include = {};
    if (hasPopulate("user", options)) {
      include.user = {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          teamId: true,
          avatar: true,
        },
      };
    }
    if (hasPopulate("project", options)) {
      include.project = {
        select: {
          id: true,
          name: true,
        },
      };
    }
    if (hasPopulate("task", options)) {
      include.task = {
        select: {
          id: true,
          title: true,
        },
      };
    }
    return Object.keys(include).length > 0 ? include : undefined;
  }

  _formatDoc(d) {
    if (!d) return null;
    const formatted = this.formatScreenshot(d);
    if (d.user && typeof d.user === "object") {
      formatted.user = this.serialize(d.user);
      formatted.user.team = formatted.user.teamId || formatted.user.team;
      delete formatted.user.teamId;
    } else if (d.user === null) {
      formatted.user = null;
    }
    if (d.project && typeof d.project === "object") {
      formatted.project = this.serialize(d.project);
    } else if (d.project === null) {
      formatted.project = null;
    }
    if (d.task && typeof d.task === "object") {
      formatted.task = this.serialize(d.task);
    } else if (d.task === null) {
      formatted.task = null;
    }
    return formatted;
  }

  formatScreenshot(doc) {
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
    const where = {};

    for (const key of Object.keys(filter || {})) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in ScreenshotRepository: ${key}`);
      }
    }

    if (filter._id !== undefined) where.id = this._processIdFilter(filter._id, "_id");
    if (filter.id !== undefined) where.id = this._processIdFilter(filter.id, "id");
    if (filter.user !== undefined) where.userId = this._processIdFilter(filter.user, "user");
    if (filter.userId !== undefined) where.userId = this._processIdFilter(filter.userId, "userId");
    if (filter.project !== undefined) where.projectId = this._processIdFilter(filter.project, "project");
    if (filter.projectId !== undefined) where.projectId = this._processIdFilter(filter.projectId, "projectId");
    if (filter.task !== undefined) where.taskId = this._processIdFilter(filter.task, "task");
    if (filter.taskId !== undefined) where.taskId = this._processIdFilter(filter.taskId, "taskId");

    if (filter.capturedAt !== undefined) {
      where.capturedAt = this._processCapturedAt(filter.capturedAt);
    }

    if (filter.publicId !== undefined) where.publicId = String(filter.publicId);
    if (filter.appName !== undefined) where.appName = String(filter.appName);
    if (filter.windowTitle !== undefined) where.windowTitle = String(filter.windowTitle);

    return where;
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const include = this._buildInclude(options);

        const queryOptions = { where };
        if (include) queryOptions.include = include;

        if (options.sort) {
          const [sortField, sortDir] = Object.entries(options.sort)[0] || ["capturedAt", -1];
          const prismaField = sortField === "_id" ? "id" : sortField;
          queryOptions.orderBy = { [prismaField]: sortDir === -1 || sortDir === "desc" ? "desc" : "asc" };
        } else {
          queryOptions.orderBy = { capturedAt: "desc" };
        }

        if (options.skip !== undefined && options.skip !== null) {
          const parsedSkip = Number(options.skip);
          if (Number.isInteger(parsedSkip) && parsedSkip >= 0) {
            queryOptions.skip = parsedSkip;
          }
        }

        if (options.limit !== undefined && options.limit !== null) {
          const parsedLimit = Number(options.limit);
          if (Number.isInteger(parsedLimit) && parsedLimit >= 0) {
            queryOptions.take = parsedLimit;
          }
        }

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => this._formatDoc(d));
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.find(filter);
    if (hasPopulate("user", options)) {
      const userSelect = getPopulateSelect("user", options);
      query = userSelect ? query.populate("user", userSelect) : query.populate("user");
    }
    if (hasPopulate("project", options)) {
      const projectSelect = getPopulateSelect("project", options) || "name";
      query = query.populate("project", projectSelect);
    }
    if (hasPopulate("task", options)) {
      const taskSelect = getPopulateSelect("task", options) || "title";
      query = query.populate("task", taskSelect);
    }

    if (options.sort) query = query.sort(options.sort);
    if (options.skip !== undefined && options.skip !== null) {
      const parsedSkip = Number(options.skip);
      if (Number.isInteger(parsedSkip) && parsedSkip >= 0) {
        query = query.skip(parsedSkip);
      }
    }
    if (options.limit !== undefined && options.limit !== null) {
      const parsedLimit = Number(options.limit);
      if (Number.isInteger(parsedLimit) && parsedLimit >= 0) {
        query = query.limit(parsedLimit);
      }
    }

    const docs = await query;
    return docs.map((d) => this.serialize(d.toObject ? d.toObject() : d));
  }

  async findOne(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const include = this._buildInclude(options);

        const queryOptions = { where };
        if (include) queryOptions.include = include;

        const doc = await this.delegate.findFirst(queryOptions);
        return doc ? this._formatDoc(doc) : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.findOne(filter);
    if (hasPopulate("user", options)) {
      const userSelect = getPopulateSelect("user", options);
      query = userSelect ? query.populate("user", userSelect) : query.populate("user");
    }
    if (hasPopulate("project", options)) {
      const projectSelect = getPopulateSelect("project", options) || "name";
      query = query.populate("project", projectSelect);
    }
    if (hasPopulate("task", options)) {
      const taskSelect = getPopulateSelect("task", options) || "title";
      query = query.populate("task", taskSelect);
    }

    const doc = await query;
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findById(id, options = {}) {
    return this.findOne({ _id: id }, options);
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

    return this.mongooseModel.countDocuments(filter);
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
          imageUrl: data.imageUrl,
          publicId: data.publicId || "",
          capturedAt: data.capturedAt ? new Date(data.capturedAt) : new Date(),
          appName: data.appName || "",
          windowTitle: data.windowTitle || "",
          keyPresses: typeof data.keyPresses === "number" ? data.keyPresses : 0,
          mouseClicks: typeof data.mouseClicks === "number" ? data.mouseClicks : 0,
          mouseMoves: typeof data.mouseMoves === "number" ? data.mouseMoves : 0,
          activityScore: typeof data.activityScore === "number" ? data.activityScore : 0,
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatScreenshot(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.create(data);
    return this.serialize(doc.toObject ? doc.toObject() : doc);
  }

  _extractAndValidateId(val, fieldName) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in ScreenshotRepository filter for field: ${fieldName}`);
    }
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) {
        throw new Error(`Invalid identifier in ScreenshotRepository filter for field: ${fieldName}`);
      }
      return trimmed;
    }
    if (typeof val === "object") {
      if (val._id) {
        const idStr = String(val._id).trim();
        if (!idStr) {
          throw new Error(`Invalid identifier in ScreenshotRepository filter for field: ${fieldName}`);
        }
        return idStr;
      }
      if (val.id) {
        const idStr = String(val.id).trim();
        if (!idStr) {
          throw new Error(`Invalid identifier in ScreenshotRepository filter for field: ${fieldName}`);
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
      throw new Error(`Invalid identifier object in ScreenshotRepository filter: ${fieldName}`);
    }
    throw new Error(`Invalid identifier in ScreenshotRepository filter for field: ${fieldName}`);
  }

  _processIdFilter(raw, fieldName) {
    if (raw === null || raw === undefined) {
      throw new Error(`Invalid identifier in ScreenshotRepository filter for field: ${fieldName}`);
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
          throw new Error(`Invalid array in ScreenshotRepository filter: ${fieldName}`);
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
          throw new Error(`Invalid array in ScreenshotRepository filter: ${fieldName}`);
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
          throw new Error(`Unsupported filter operator in ScreenshotRepository: ${k}`);
        }
      }
      throw new Error(`Invalid identifier object in ScreenshotRepository filter: ${fieldName}`);
    }
    return this._extractAndValidateId(raw, fieldName);
  }

  _processCapturedAt(raw) {
    if (raw === null || raw === undefined) {
      throw new Error("Invalid date value in ScreenshotRepository filter: capturedAt");
    }

    if (raw instanceof Date) {
      if (isNaN(raw.getTime())) {
        throw new Error("Invalid date value in ScreenshotRepository filter: capturedAt");
      }
      return raw;
    }

    if (typeof raw === "string" || typeof raw === "number") {
      const d = new Date(raw);
      if (isNaN(d.getTime())) {
        throw new Error("Invalid date value in ScreenshotRepository filter: capturedAt");
      }
      return d;
    }

    if (typeof raw === "object" && !Array.isArray(raw)) {
      const keys = Object.keys(raw);
      if (keys.length === 0) {
        throw new Error("Invalid date range in ScreenshotRepository filter: capturedAt cannot be an empty object");
      }

      for (const op of keys) {
        if (!ALLOWED_DATE_OPERATORS.has(op)) {
          if (op.startsWith("$")) {
            throw new Error(`Unsupported filter operator in ScreenshotRepository: ${op}`);
          }
          throw new Error(`Unsupported date range operator in ScreenshotRepository: ${op}`);
        }
      }

      const dateCond = {};
      const parseDate = (val, op) => {
        if (val === null || val === undefined || (typeof val === "string" && !val.trim())) {
          throw new Error(`Invalid date value for operator ${op} in ScreenshotRepository filter: capturedAt`);
        }
        const parsed = val instanceof Date ? val : new Date(val);
        if (isNaN(parsed.getTime())) {
          throw new Error(`Invalid date value for operator ${op} in ScreenshotRepository filter: capturedAt`);
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
        throw new Error("Invalid date range in ScreenshotRepository filter: lower bound cannot be after upper bound");
      }

      return dateCond;
    }

    throw new Error("Invalid date value in ScreenshotRepository filter: capturedAt");
  }

  buildDeleteWhere(filter = {}) {
    const where = {};

    for (const key of Object.keys(filter || {})) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in ScreenshotRepository: ${key}`);
      }
      if (!ALLOWED_SCREENSHOT_DELETE_FIELDS.has(key)) {
        throw new Error(`Unsupported filter field in ScreenshotRepository: ${key}`);
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

        case "capturedAt":
          where.capturedAt = this._processCapturedAt(val);
          break;
      }
    }

    return where;
  }

  async deleteMany(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("ScreenshotRepository.deleteMany requires a valid filter object");
        }

        const where = this.buildDeleteWhere(filter);
        if (Object.keys(where).length === 0) {
          throw new Error("Bulk deletion requires a valid scoped filter in ScreenshotRepository.deleteMany");
        }

        const res = await this.delegate.deleteMany({ where });
        return { acknowledged: true, deletedCount: res.count };
      } catch (err) {
        this.handleError(err);
      }
    }

    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("ScreenshotRepository.deleteMany requires a valid filter object");
    }
    return await this.mongooseModel.deleteMany(filter, options);
  }
}

export const screenshotRepository = new ScreenshotRepository();
export default screenshotRepository;
