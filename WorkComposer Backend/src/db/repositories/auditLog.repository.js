import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

const ALLOWED_AUDIT_LOG_FILTER_FIELDS = new Set([
  "_id",
  "id",
  "organization",
  "organizationId",
  "performedBy",
  "performedById",
  "category",
  "activity",
  "createdAt",
  "updatedAt",
  "ipAddress",
  "platform",
]);

const ALLOWED_DATE_OPERATORS = new Set([
  "$gte",
  "gte",
  "$gt",
  "gt",
  "$lte",
  "lte",
  "$lt",
  "lt",
]);

const AUDIT_CATEGORY_MAP = {
  "Users": "Users",
  "Teams": "Teams",
  "Roles": "Roles",
  "Desktop App": "Desktop_App",
  "Organization": "Organization",
  "Settings": "Settings",
  "Billing": "Billing",
  "Storage": "Storage",
  "Projects": "Projects",
  "Tasks": "Tasks",
  "HR Leave Types": "HR_Leave_Types",
  "Devices": "Devices",
};

export class AuditLogRepository extends BaseRepository {
  constructor() {
    super("AuditLog");
  }

  formatAuditLog(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    serialized.organization = serialized.organization || serialized.organizationId;
    if (serialized.performedById !== undefined && serialized.performedBy === undefined) {
      serialized.performedBy = serialized.performedById;
    }
    delete serialized.organizationId;
    delete serialized.performedById;
    if (serialized.category === "Desktop_App") serialized.category = "Desktop App";
    if (serialized.category === "HR_Leave_Types") serialized.category = "HR Leave Types";
    return serialized;
  }

  _validateScalarId(val, fieldName) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in AuditLogRepository filter: ${fieldName}`);
    }

    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) {
        throw new Error(`Invalid identifier in AuditLogRepository filter: ${fieldName}`);
      }
      return trimmed;
    }

    if (typeof val === "object") {
      if (typeof val.toHexString === "function") {
        return val.toHexString();
      }
      if (val._id) return String(val._id).trim();
      if (val.id) return String(val.id).trim();
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

    throw new Error(`Invalid identifier in AuditLogRepository filter: ${fieldName}`);
  }

  _processIdFilter(val, fieldName) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in AuditLogRepository filter: ${fieldName}`);
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
        throw new Error(`Invalid filter condition for ${fieldName} in AuditLogRepository: empty object`);
      }

      if (val.$in !== undefined) {
        if (!Array.isArray(val.$in)) {
          throw new Error(`Invalid array for $in operator in AuditLogRepository filter: ${fieldName}`);
        }
        if (val.$in.length === 0) {
          return { in: [] };
        }
        return { in: val.$in.map((item) => this._validateScalarId(item, fieldName)) };
      }

      if (val.in !== undefined) {
        if (!Array.isArray(val.in)) {
          throw new Error(`Invalid array for in operator in AuditLogRepository filter: ${fieldName}`);
        }
        if (val.in.length === 0) {
          return { in: [] };
        }
        return { in: val.in.map((item) => this._validateScalarId(item, fieldName)) };
      }

      if (val._id || val.id) {
        return this._validateScalarId(val, fieldName);
      }

      for (const k of keys) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in AuditLogRepository: ${k}`);
        }
      }

      throw new Error(`Invalid identifier object in AuditLogRepository filter: ${fieldName}`);
    }

    return this._validateScalarId(val, fieldName);
  }

  _processCategoryFilter(val) {
    if (val === null || val === undefined) {
      throw new Error("Invalid category in AuditLogRepository filter");
    }

    if (typeof val === "string") {
      const trimmed = val.trim();
      return AUDIT_CATEGORY_MAP[trimmed] || trimmed;
    }

    if (Array.isArray(val)) {
      if (val.length === 0) return { in: [] };
      return { in: val.map((v) => (typeof v === "string" ? (AUDIT_CATEGORY_MAP[v.trim()] || v.trim()) : v)) };
    }

    if (typeof val === "object") {
      if (val.$in !== undefined) {
        if (!Array.isArray(val.$in)) {
          throw new Error("Invalid array for $in operator in AuditLogRepository filter: category");
        }
        if (val.$in.length === 0) return { in: [] };
        return { in: val.$in.map((v) => (typeof v === "string" ? (AUDIT_CATEGORY_MAP[v.trim()] || v.trim()) : v)) };
      }
      if (val.in !== undefined) {
        if (!Array.isArray(val.in)) {
          throw new Error("Invalid array for in operator in AuditLogRepository filter: category");
        }
        if (val.in.length === 0) return { in: [] };
        return { in: val.in.map((v) => (typeof v === "string" ? (AUDIT_CATEGORY_MAP[v.trim()] || v.trim()) : v)) };
      }
      for (const k of Object.keys(val)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in AuditLogRepository: ${k}`);
        }
      }
      throw new Error("Invalid category in AuditLogRepository filter");
    }

    throw new Error("Invalid category in AuditLogRepository filter");
  }

  _processDateFilter(raw, fieldName) {
    if (raw === null || raw === undefined) {
      throw new Error(`Invalid date value in AuditLogRepository filter: ${fieldName}`);
    }

    if (raw instanceof Date) {
      if (isNaN(raw.getTime())) {
        throw new Error(`Invalid date value in AuditLogRepository filter: ${fieldName}`);
      }
      return raw;
    }

    if (typeof raw === "string" || typeof raw === "number") {
      const trimmed = typeof raw === "string" ? raw.trim() : raw;
      if (trimmed === "") {
        throw new Error(`Invalid date value in AuditLogRepository filter: ${fieldName}`);
      }
      const d = new Date(trimmed);
      if (isNaN(d.getTime())) {
        throw new Error(`Invalid date value in AuditLogRepository filter: ${fieldName}`);
      }
      return d;
    }

    if (typeof raw === "object" && !Array.isArray(raw)) {
      const keys = Object.keys(raw);
      if (keys.length === 0) {
        throw new Error(`Invalid date range in AuditLogRepository filter: ${fieldName} cannot be an empty object`);
      }

      for (const op of keys) {
        if (!ALLOWED_DATE_OPERATORS.has(op)) {
          if (op.startsWith("$")) {
            throw new Error(`Unsupported filter operator in AuditLogRepository: ${op}`);
          }
          throw new Error(`Unsupported date range operator in AuditLogRepository: ${op}`);
        }
      }

      const dateCond = {};
      const parseDate = (val, op) => {
        if (val === null || val === undefined || (typeof val === "string" && !val.trim())) {
          throw new Error(`Invalid date value for operator ${op} in AuditLogRepository filter: ${fieldName}`);
        }
        const parsed = val instanceof Date ? val : new Date(val);
        if (isNaN(parsed.getTime())) {
          throw new Error(`Invalid date value for operator ${op} in AuditLogRepository filter: ${fieldName}`);
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
        throw new Error(`Invalid date range in AuditLogRepository filter: lower bound cannot be after upper bound in ${fieldName}`);
      }

      return dateCond;
    }

    throw new Error(`Invalid date value in AuditLogRepository filter: ${fieldName}`);
  }

  buildWhere(filter = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("AuditLogRepository.buildWhere requires a valid filter object");
    }

    const where = {};

    for (const key of Object.keys(filter)) {
      const val = filter[key];
      if (val === undefined) continue;

      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in AuditLogRepository: ${key}`);
      }
      if (!ALLOWED_AUDIT_LOG_FILTER_FIELDS.has(key)) {
        throw new Error(`Unsupported filter field in AuditLogRepository: ${key}`);
      }

      switch (key) {
        case "_id":
        case "id":
          where.id = this._processIdFilter(val, key);
          break;

        case "organization":
        case "organizationId":
          where.organizationId = this._processIdFilter(val, key);
          break;

        case "performedBy":
        case "performedById":
          where.performedById = this._processIdFilter(val, key);
          break;

        case "category":
          where.category = this._processCategoryFilter(val);
          break;

        case "activity":
          if (typeof val === "string") {
            where.activity = val;
          } else if (typeof val === "object" && val !== null) {
            for (const k of Object.keys(val)) {
              if (k.startsWith("$")) {
                throw new Error(`Unsupported filter operator in AuditLogRepository: ${k}`);
              }
            }
            where.activity = val;
          } else {
            where.activity = val;
          }
          break;

        case "createdAt":
          where.createdAt = this._processDateFilter(val, "createdAt");
          break;

        case "updatedAt":
          where.updatedAt = this._processDateFilter(val, "updatedAt");
          break;

        case "ipAddress":
          where.ipAddress = val;
          break;

        case "platform":
          where.platform = val;
          break;
      }
    }

    return where;
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const include = {};
        if (options.populate !== false) {
          include.performedBy = { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } };
        }

        const queryOptions = { where };
        if (Object.keys(include).length > 0) queryOptions.include = include;
        if (options.sort) {
          const [sortField, sortDir] = Object.entries(options.sort)[0] || ["createdAt", -1];
          queryOptions.orderBy = { [sortField]: sortDir === -1 || sortDir === "desc" ? "desc" : "asc" };
        } else {
          queryOptions.orderBy = { createdAt: "desc" };
        }
        if (options.skip) queryOptions.skip = options.skip;
        if (options.limit) queryOptions.take = options.limit;

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => {
          const formatted = this.formatAuditLog(d);
          if (d.performedBy) formatted.performedBy = this.serialize(d.performedBy);
          return formatted;
        });
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.find(filter);
    if (options.populate !== false) {
      query = query.populate("performedBy", "firstName lastName email avatar");
    }
    if (options.sort) query = query.sort(options.sort);
    if (options.skip) query = query.skip(options.skip);
    if (options.limit) query = query.limit(options.limit);
    const docs = await query;
    return docs.map((d) => this.serialize(d.toObject ? d.toObject() : d));
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

  async create(data) {
    if (isPostgres()) {
      try {
        const organizationId = this.toIdString(data.organization || data.organizationId);
        const performedById = data.performedBy || data.performedById ? this.toIdString(data.performedBy || data.performedById) : null;
        const newId = data._id ? this.toIdString(data._id) : generateId();

        const category = AUDIT_CATEGORY_MAP[data.category] || data.category;

        const createData = {
          id: newId,
          organizationId,
          performedById,
          category,
          activity: data.activity || "",
          details: data.details || {},
          ipAddress: data.ipAddress || "",
          platform: data.platform || "",
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatAuditLog(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.create(data);
    return this.serialize(doc.toObject ? doc.toObject() : doc);
  }
}

export const auditLogRepository = new AuditLogRepository();
export default auditLogRepository;
