const ALLOWED_DATE_OPERATORS = new Set([
  "$gte",
  "gte",
  "$gt",
  "gt",
  "$lte",
  "lte",
  "$lt",
  "lt",
  "$eq",
  "equals",
]);

import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

function hasPopulate(name, options = {}) {
  if (!options || typeof options !== "object") return false;
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  if (options[`populate${cap}`]) return true;

  if (name === "apiKey" && (options.populateApiKey || options.populateKey)) return true;

  if (!options.populate) return false;
  if (options.populate === true) return true;

  const checkMatch = (target) => {
    if (typeof target !== "string") return false;
    const t = target.trim();
    if (name === "apiKey") return t === "apiKey" || t === "key";
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

export class ApiLogRepository extends BaseRepository {
  constructor() {
    super("ApiLog");
  }

  formatApiLog(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    if (serialized.id && !serialized._id) serialized._id = String(serialized.id);
    if (serialized._id && !serialized.id) serialized.id = String(serialized._id);
    serialized.organization = serialized.organization || serialized.organizationId;
    if (serialized.apiKeyId !== undefined && serialized.apiKey === undefined) {
      serialized.apiKey = serialized.apiKeyId;
    }
    return serialized;
  }

  _buildCreatedAtFilter(raw, fieldName = "createdAt") {
    if (raw === null || raw === undefined) {
      throw new Error(`Invalid date value in ApiLogRepository filter: ${fieldName}`);
    }

    if (raw instanceof Date) {
      if (isNaN(raw.getTime())) {
        throw new Error(`Invalid date value in ApiLogRepository filter: ${fieldName}`);
      }
      return raw;
    }

    if (typeof raw === "string" || typeof raw === "number") {
      const trimmed = typeof raw === "string" ? raw.trim() : raw;
      if (trimmed === "") {
        throw new Error(`Invalid date value in ApiLogRepository filter: ${fieldName}`);
      }
      const d = new Date(trimmed);
      if (isNaN(d.getTime())) {
        throw new Error(`Invalid date value in ApiLogRepository filter: ${fieldName}`);
      }
      return d;
    }

    if (typeof raw === "object" && !Array.isArray(raw)) {
      const keys = Object.keys(raw);
      if (keys.length === 0) {
        throw new Error(`Invalid date range in ApiLogRepository filter: ${fieldName} cannot be an empty object`);
      }

      for (const op of keys) {
        if (!ALLOWED_DATE_OPERATORS.has(op)) {
          if (op.startsWith("$")) {
            throw new Error(`Unsupported filter operator in ApiLogRepository: ${op}`);
          }
          throw new Error(`Unsupported date range operator in ApiLogRepository: ${op}`);
        }
      }

      const dateCond = {};
      const parseDate = (val, op) => {
        if (val === null || val === undefined || (typeof val === "string" && !val.trim())) {
          throw new Error(`Invalid date value for operator ${op} in ApiLogRepository filter: ${fieldName}`);
        }
        const parsed = val instanceof Date ? val : new Date(typeof val === "string" ? val.trim() : val);
        if (isNaN(parsed.getTime())) {
          throw new Error(`Invalid date value for operator ${op} in ApiLogRepository filter: ${fieldName}`);
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
      if (raw.$eq !== undefined) dateCond.equals = parseDate(raw.$eq, "$eq");
      if (raw.equals !== undefined) dateCond.equals = parseDate(raw.equals, "equals");

      const lowerBound = dateCond.gte || dateCond.gt;
      const upperBound = dateCond.lte || dateCond.lt;
      if (lowerBound && upperBound && lowerBound.getTime() > upperBound.getTime()) {
        throw new Error("Invalid date range in ApiLogRepository filter: lower bound cannot be after upper bound in createdAt");
      }

      return dateCond;
    }

    throw new Error(`Invalid date value in ApiLogRepository filter: ${fieldName}`);
  }

  buildWhere(filter = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("ApiLogRepository query requires a valid filter object");
    }

    const where = {};

    for (const key of Object.keys(filter)) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in ApiLogRepository: ${key}`);
      }
    }

    if (filter._id) where.id = this.toIdString(filter._id);
    if (filter.id) where.id = this.toIdString(filter.id);
    if (filter.organization) {
      if (typeof filter.organization === "object" && filter.organization !== null && filter.organization.$in) {
        where.organizationId = { in: filter.organization.$in.map((o) => this.toIdString(o)).filter(Boolean) };
      } else {
        where.organizationId = this.toIdString(filter.organization);
      }
    }
    if (filter.organizationId) {
      if (typeof filter.organizationId === "object" && filter.organizationId !== null && filter.organizationId.$in) {
        where.organizationId = { in: filter.organizationId.$in.map((o) => this.toIdString(o)).filter(Boolean) };
      } else {
        where.organizationId = this.toIdString(filter.organizationId);
      }
    }
    if (filter.apiKey) {
      if (typeof filter.apiKey === "object" && filter.apiKey !== null && filter.apiKey.$in) {
        where.apiKeyId = { in: filter.apiKey.$in.map((k) => this.toIdString(k)).filter(Boolean) };
      } else {
        where.apiKeyId = this.toIdString(filter.apiKey);
      }
    }
    if (filter.apiKeyId) {
      if (typeof filter.apiKeyId === "object" && filter.apiKeyId !== null && filter.apiKeyId.$in) {
        where.apiKeyId = { in: filter.apiKeyId.$in.map((k) => this.toIdString(k)).filter(Boolean) };
      } else {
        where.apiKeyId = this.toIdString(filter.apiKeyId);
      }
    }
    if (filter.statusCode !== undefined && filter.statusCode !== null) {
      if (typeof filter.statusCode === "object" && filter.statusCode.$in) {
        where.statusCode = { in: filter.statusCode.$in.map((c) => Number(c)).filter((n) => !isNaN(n)) };
      } else {
        where.statusCode = Number(filter.statusCode);
      }
    }
    if (filter.createdAt !== undefined) {
      where.createdAt = this._buildCreatedAtFilter(filter.createdAt, "createdAt");
    }

    return where;
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const include = {};
        if (hasPopulate("apiKey", options)) {
          include.apiKey = { select: { id: true, name: true, keyPreview: true, isActive: true } };
        }

        const queryOptions = { where };
        if (Object.keys(include).length > 0) queryOptions.include = include;
        if (options.sort) {
          const [sortField, sortDir] = Object.entries(options.sort)[0] || ["createdAt", -1];
          const prismaField = sortField === "_id" ? "id" : sortField;
          queryOptions.orderBy = { [prismaField]: sortDir === -1 || sortDir === "desc" ? "desc" : "asc" };
        } else {
          queryOptions.orderBy = { createdAt: "desc" };
        }
        if (typeof options.skip === "number" && !isNaN(options.skip) && options.skip >= 0) {
          queryOptions.skip = options.skip;
        }
        if (typeof options.limit === "number" && !isNaN(options.limit) && options.limit >= 0) {
          queryOptions.take = options.limit;
        }

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => {
          const formatted = this.formatApiLog(d);
          if (d.apiKey && typeof d.apiKey === "object") {
            formatted.apiKey = this.serialize(d.apiKey);
            if (formatted.apiKey.id && !formatted.apiKey._id) formatted.apiKey._id = String(formatted.apiKey.id);
            if (formatted.apiKey._id && !formatted.apiKey.id) formatted.apiKey.id = String(formatted.apiKey._id);
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
    } else if (hasPopulate("apiKey", options)) {
      query = query.populate("apiKey", "name");
    }
    if (options.sort) query = query.sort(options.sort);
    if (typeof options.skip === "number" && !isNaN(options.skip) && options.skip >= 0) query = query.skip(options.skip);
    if (typeof options.limit === "number" && !isNaN(options.limit) && options.limit >= 0) query = query.limit(options.limit);
    const docs = await query;
    return docs.map((d) => this.serialize(d.toObject ? d.toObject() : d));
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

  async create(data) {
    if (isPostgres()) {
      try {
        const organizationId = this.toIdString(data.organization || data.organizationId);
        const apiKeyId = data.apiKey || data.apiKeyId ? this.toIdString(data.apiKey || data.apiKeyId) : null;
        const newId = data._id ? this.toIdString(data._id) : generateId();

        const createData = {
          id: newId,
          organizationId,
          apiKeyId,
          endpoint: data.endpoint || "",
          method: data.method || "GET",
          statusCode: Number(data.statusCode) || 200,
          ipAddress: data.ipAddress || null,
          userAgent: data.userAgent || null,
          responseTime: typeof data.responseTime === "number" ? data.responseTime : 0,
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatApiLog(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.create(data);
    return this.serialize(doc.toObject ? doc.toObject() : doc);
  }
}

export const apiLogRepository = new ApiLogRepository();
export default apiLogRepository;
