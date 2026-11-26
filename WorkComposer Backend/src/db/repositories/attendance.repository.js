const ALLOWED_ATTENDANCE_UPDATE_FIELDS = new Set([
  "date",
  "workTime",
  "breakTime",
  "startTime",
  "finishTime",
  "user",
  "userId",
  "organization",
  "organizationId",
  "_id",
  "id",
]);

const ALLOWED_ATTENDANCE_PASSTHROUGH_FIELDS = new Set([
  "_id",
  "id",
  "user",
  "userId",
  "organization",
  "organizationId",
  "createdAt",
  "updatedAt",
  "__v",
  "$set",
  "$setOnInsert",
  "isNew",
  "_isNew",
  "save",
  "toObject",
  "toJSON",
  "isModified",
  "deleteOne",
]);

function extractAndValidateScalarId(raw, fieldName) {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (Array.isArray(raw)) {
    throw new Error(`Invalid identifier in AttendanceRepository for field: ${fieldName}`);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "[object Object]") {
      throw new Error(`Invalid identifier in AttendanceRepository for field: ${fieldName}`);
    }
    return trimmed;
  }
  if (typeof raw === "number") {
    if (isNaN(raw)) {
      throw new Error(`Invalid identifier in AttendanceRepository for field: ${fieldName}`);
    }
    return String(raw);
  }
  if (typeof raw === "boolean") {
    throw new Error(`Invalid identifier in AttendanceRepository for field: ${fieldName}`);
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
    throw new Error(`Invalid identifier in AttendanceRepository for field: ${fieldName}`);
  }
  throw new Error(`Invalid identifier in AttendanceRepository for field: ${fieldName}`);
}

function validateDate(val, fieldName) {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) {
      throw new Error(`Invalid date value in AttendanceRepository for field: ${fieldName}`);
    }
    return val;
  }
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    if (isNaN(d.getTime())) {
      throw new Error(`Invalid date value in AttendanceRepository for field: ${fieldName}`);
    }
    return d;
  }
  throw new Error(`Invalid date value in AttendanceRepository for field: ${fieldName}`);
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
    try {
      return JSON.stringify(valA) === JSON.stringify(valB);
    } catch {
      return false;
    }
  }
  return String(valA) === String(valB);
}

import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";
import { runTransaction, getAmbientTransaction, isTransactionActive } from "../transaction.js";

export function deriveAttendanceRangeKey(whereDate) {
  if (!whereDate) return "all_dates";
  if (whereDate instanceof Date) {
    return `date:${whereDate.getTime()}`;
  }
  if (typeof whereDate === "object") {
    const parts = [];
    if (whereDate.gte instanceof Date) parts.push(`gte:${whereDate.gte.getTime()}`);
    if (whereDate.gt instanceof Date) parts.push(`gt:${whereDate.gt.getTime()}`);
    if (whereDate.lte instanceof Date) parts.push(`lte:${whereDate.lte.getTime()}`);
    if (whereDate.lt instanceof Date) parts.push(`lt:${whereDate.lt.getTime()}`);
    if (parts.length > 0) return parts.join("_");
  }
  return "all_dates";
}

export class AttendanceRepository extends BaseRepository {
  constructor() {
    super("Attendance");
  }

  hasPopulate(name, options = {}) {
    if (!options) return false;
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    if (options[`populate${cap}`]) return true;

    // Check alias flags
    if ((name === "userId" || name === "user") && (options.populateUserId || options.populateUser)) {
      return true;
    }
    if ((name === "shiftId" || name === "shift") && (options.populateShiftId || options.populateShift)) {
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
      if (name === "shift" || name === "shiftId") {
        return t === "shift" || t === "shiftId";
      }
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

  buildInclude(options = {}) {
    const include = {};
    if (this.hasPopulate("userId", options)) {
      include.user = true;
    }
    return Object.keys(include).length > 0 ? include : undefined;
  }

  buildOrderBy(sort) {
    if (!sort) return undefined;
    if (typeof sort === "string") {
      const parts = sort.trim().split(/\s+/);
      const orderBy = {};
      for (const part of parts) {
        if (part.startsWith("-")) {
          const f = part.slice(1);
          const prismaField = f === "_id" ? "id" : f === "user" ? "userId" : f === "organization" ? "organizationId" : f;
          orderBy[prismaField] = "desc";
        } else if (part.startsWith("+")) {
          const f = part.slice(1);
          const prismaField = f === "_id" ? "id" : f === "user" ? "userId" : f === "organization" ? "organizationId" : f;
          orderBy[prismaField] = "asc";
        } else {
          const prismaField = part === "_id" ? "id" : part === "user" ? "userId" : part === "organization" ? "organizationId" : part;
          orderBy[prismaField] = "asc";
        }
      }
      return Object.keys(orderBy).length > 0 ? orderBy : undefined;
    }
    if (typeof sort === "object" && sort !== null) {
      const orderBy = {};
      for (const [key, val] of Object.entries(sort)) {
        const prismaField = key === "_id" ? "id" : key === "user" ? "userId" : key === "organization" ? "organizationId" : key;
        orderBy[prismaField] = val === -1 || val === "desc" || val === "descending" ? "desc" : "asc";
      }
      return Object.keys(orderBy).length > 0 ? orderBy : undefined;
    }
    return undefined;
  }

  formatUserRelation(userDoc) {
    if (!userDoc || typeof userDoc !== "object") return null;
    const serialized = this.serialize(userDoc);
    if (!serialized._id && serialized.id) serialized._id = String(serialized.id);
    if (!serialized.id && serialized._id) serialized.id = String(serialized._id);
    if (!serialized.name && (serialized.firstName || serialized.lastName)) {
      serialized.name = `${serialized.firstName || ""} ${serialized.lastName || ""}`.trim();
    }
    if (userDoc.team && typeof userDoc.team === "object") {
      serialized.team = this.serialize(userDoc.team);
    } else if (serialized.teamId) {
      serialized.team = serialized.team || serialized.teamId;
    }
    return serialized;
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
      if (pop && pop.path) {
        const path = pop.path;
        if ((path === "userId" || path === "user") && pop.select && typeof pop.select === "string") {
          if (doc.user && typeof doc.user === "object") {
            this.applyRelationProjection(doc.user, pop.select);
          }
          if (doc.userId && typeof doc.userId === "object" && doc.userId !== doc.user) {
            this.applyRelationProjection(doc.userId, pop.select);
          }
        }
        if ((path === "shiftId" || path === "shift") && pop.select && typeof pop.select === "string") {
          if (doc.shift && typeof doc.shift === "object") {
            this.applyRelationProjection(doc.shift, pop.select);
          }
          if (doc.shiftId && typeof doc.shiftId === "object" && doc.shiftId !== doc.shift) {
            this.applyRelationProjection(doc.shiftId, pop.select);
          }
        }
      }
    }
    return doc;
  }

  formatAttendance(doc, options = {}) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    serialized._id = serialized._id || serialized.id;
    serialized.id = serialized.id || serialized._id;

    // Organization normalization
    if (doc.organization && typeof doc.organization === "object") {
      const orgObj = this.serialize(doc.organization);
      if (!orgObj._id && orgObj.id) orgObj._id = String(orgObj.id);
      if (!orgObj.id && orgObj._id) orgObj.id = String(orgObj._id);
      serialized.organization = orgObj;
      serialized.organizationId = serialized.organizationId || orgObj._id || orgObj.id;
    } else {
      const orgScalar = serialized.organizationId || serialized.organization || null;
      serialized.organization = orgScalar;
      serialized.organizationId = orgScalar;
    }

    // User / userId relation handling
    const isUserPopulated =
      this.hasPopulate("userId", options) ||
      (doc.user && typeof doc.user === "object") ||
      (doc.userId && typeof doc.userId === "object");
    const userDoc =
      doc.user && typeof doc.user === "object"
        ? doc.user
        : doc.userId && typeof doc.userId === "object"
        ? doc.userId
        : null;

    if (userDoc) {
      const u = this.formatUserRelation(userDoc);
      serialized.user = u;
      serialized.userId = u;
    } else if (this.hasPopulate("userId", options)) {
      serialized.user = null;
      serialized.userId = null;
    } else {
      const userScalar = serialized.userId || serialized.user || null;
      serialized.user = userScalar;
      serialized.userId = userScalar;
    }

    // Shift / shiftId handling
    const isShiftPopulated =
      this.hasPopulate("shiftId", options) ||
      (doc.shift && typeof doc.shift === "object") ||
      (doc.shiftId && typeof doc.shiftId === "object");

    if (doc.shift && typeof doc.shift === "object") {
      const s = this.serialize(doc.shift);
      if (!s._id && s.id) s._id = String(s.id);
      if (!s.id && s._id) s.id = String(s._id);
      serialized.shift = s;
      serialized.shiftId = s;
    } else if (doc.shiftId && typeof doc.shiftId === "object") {
      const s = this.serialize(doc.shiftId);
      if (!s._id && s.id) s._id = String(s.id);
      if (!s.id && s._id) s.id = String(s._id);
      serialized.shift = s;
      serialized.shiftId = s;
    } else if ((doc.shift === null || doc.shiftId === null) && isShiftPopulated) {
      serialized.shift = null;
      serialized.shiftId = null;
    } else if (doc.shiftId !== undefined || doc.shift !== undefined) {
      serialized.shift = serialized.shift !== undefined ? serialized.shift : (serialized.shiftId !== undefined ? serialized.shiftId : null);
      if (isShiftPopulated) {
        serialized.shiftId = serialized.shift;
      }
    }

    if (options && options.populate) {
      this.applyPopulateProjections(serialized, options);
    }

    return serialized;
  }

  buildWhere(filter = {}) {
    const where = {};

    for (const key of Object.keys(filter || {})) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in AttendanceRepository: ${key}`);
      }
    }

    if (filter._id !== undefined && filter.id !== undefined) {
      const idA = this.toIdString(filter._id);
      const idB = this.toIdString(filter.id);
      if (idA && idB && idA !== idB) {
        throw new Error("Conflicting filter values for '_id' and 'id' in AttendanceRepository");
      }
    }
    if (filter.organization !== undefined && filter.organizationId !== undefined) {
      const oA = this.toIdString(filter.organization);
      const oB = this.toIdString(filter.organizationId);
      if (oA && oB && oA !== oB) {
        throw new Error("Conflicting filter values for 'organization' and 'organizationId' in AttendanceRepository");
      }
    }
    if (filter.user !== undefined && filter.userId !== undefined) {
      const uA = this.toIdString(filter.user);
      const uB = this.toIdString(filter.userId);
      if (uA && uB && uA !== uB) {
        throw new Error("Conflicting filter values for 'user' and 'userId' in AttendanceRepository");
      }
    }

    if (filter._id) {
      if (Array.isArray(filter._id)) {
        where.id = { in: filter._id.map((id) => this.toIdString(id)).filter(Boolean) };
      } else if (typeof filter._id === "object" && filter._id !== null) {
        if (filter._id.$in && Array.isArray(filter._id.$in)) {
          where.id = { in: filter._id.$in.map((id) => this.toIdString(id)).filter(Boolean) };
        } else if (filter._id.in && Array.isArray(filter._id.in)) {
          where.id = { in: filter._id.in.map((id) => this.toIdString(id)).filter(Boolean) };
        } else if (filter._id._id || filter._id.id) {
          where.id = this.toIdString(filter._id);
        } else {
          for (const k of Object.keys(filter._id)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in AttendanceRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in AttendanceRepository filter: _id");
        }
      } else {
        where.id = this.toIdString(filter._id);
      }
    }
    if (filter.id) {
      if (Array.isArray(filter.id)) {
        where.id = { in: filter.id.map((id) => this.toIdString(id)).filter(Boolean) };
      } else if (typeof filter.id === "object" && filter.id !== null) {
        if (filter.id.$in && Array.isArray(filter.id.$in)) {
          where.id = { in: filter.id.$in.map((id) => this.toIdString(id)).filter(Boolean) };
        } else if (filter.id.in && Array.isArray(filter.id.in)) {
          where.id = { in: filter.id.in.map((id) => this.toIdString(id)).filter(Boolean) };
        } else if (filter.id._id || filter.id.id) {
          where.id = this.toIdString(filter.id);
        } else {
          for (const k of Object.keys(filter.id)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in AttendanceRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in AttendanceRepository filter: id");
        }
      } else {
        where.id = this.toIdString(filter.id);
      }
    }
    if (filter.organization) {
      if (Array.isArray(filter.organization)) {
        where.organizationId = { in: filter.organization.map((id) => this.toIdString(id)).filter(Boolean) };
      } else if (typeof filter.organization === "object" && filter.organization !== null) {
        if (filter.organization.$in && Array.isArray(filter.organization.$in)) {
          where.organizationId = { in: filter.organization.$in.map((id) => this.toIdString(id)).filter(Boolean) };
        } else if (filter.organization.in && Array.isArray(filter.organization.in)) {
          where.organizationId = { in: filter.organization.in.map((id) => this.toIdString(id)).filter(Boolean) };
        } else if (filter.organization._id || filter.organization.id) {
          where.organizationId = this.toIdString(filter.organization);
        } else {
          for (const k of Object.keys(filter.organization)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in AttendanceRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in AttendanceRepository filter: organization");
        }
      } else {
        where.organizationId = this.toIdString(filter.organization);
      }
    }
    if (filter.organizationId) {
      if (Array.isArray(filter.organizationId)) {
        where.organizationId = { in: filter.organizationId.map((id) => this.toIdString(id)).filter(Boolean) };
      } else if (typeof filter.organizationId === "object" && filter.organizationId !== null) {
        if (filter.organizationId.$in && Array.isArray(filter.organizationId.$in)) {
          where.organizationId = { in: filter.organizationId.$in.map((id) => this.toIdString(id)).filter(Boolean) };
        } else if (filter.organizationId.in && Array.isArray(filter.organizationId.in)) {
          where.organizationId = { in: filter.organizationId.in.map((id) => this.toIdString(id)).filter(Boolean) };
        } else if (filter.organizationId._id || filter.organizationId.id) {
          where.organizationId = this.toIdString(filter.organizationId);
        } else {
          for (const k of Object.keys(filter.organizationId)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in AttendanceRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in AttendanceRepository filter: organizationId");
        }
      } else {
        where.organizationId = this.toIdString(filter.organizationId);
      }
    }
    if (filter.user) {
      if (Array.isArray(filter.user)) {
        where.userId = { in: filter.user.map((u) => this.toIdString(u)).filter(Boolean) };
      } else if (typeof filter.user === "object" && filter.user !== null) {
        if (filter.user.$in && Array.isArray(filter.user.$in)) {
          where.userId = { in: filter.user.$in.map((u) => this.toIdString(u)).filter(Boolean) };
        } else if (filter.user.in && Array.isArray(filter.user.in)) {
          where.userId = { in: filter.user.in.map((u) => this.toIdString(u)).filter(Boolean) };
        } else if (filter.user._id || filter.user.id) {
          where.userId = this.toIdString(filter.user);
        } else {
          for (const k of Object.keys(filter.user)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in AttendanceRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in AttendanceRepository filter: user");
        }
      } else {
        where.userId = this.toIdString(filter.user);
      }
    }
    if (filter.userId) {
      if (Array.isArray(filter.userId)) {
        where.userId = { in: filter.userId.map((u) => this.toIdString(u)).filter(Boolean) };
      } else if (typeof filter.userId === "object" && filter.userId !== null) {
        if (filter.userId.$in && Array.isArray(filter.userId.$in)) {
          where.userId = { in: filter.userId.$in.map((u) => this.toIdString(u)).filter(Boolean) };
        } else if (filter.userId.in && Array.isArray(filter.userId.in)) {
          where.userId = { in: filter.userId.in.map((u) => this.toIdString(u)).filter(Boolean) };
        } else if (filter.userId._id || filter.userId.id) {
          where.userId = this.toIdString(filter.userId);
        } else {
          for (const k of Object.keys(filter.userId)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in AttendanceRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in AttendanceRepository filter: userId");
        }
      } else {
        where.userId = this.toIdString(filter.userId);
      }
    }
    if (filter.date) {
      if (typeof filter.date === "object" && filter.date !== null && !(filter.date instanceof Date)) {
        for (const k of Object.keys(filter.date)) {
          if (k.startsWith("$") && !["$gte", "$lte", "$gt", "$lt"].includes(k)) {
            throw new Error(`Unsupported date filter operator in AttendanceRepository: ${k}`);
          }
        }
        where.date = {};
        if (filter.date.$gte !== undefined) where.date.gte = new Date(filter.date.$gte);
        if (filter.date.$lte !== undefined) where.date.lte = new Date(filter.date.$lte);
        if (filter.date.$gt !== undefined) where.date.gt = new Date(filter.date.$gt);
        if (filter.date.$lt !== undefined) where.date.lt = new Date(filter.date.$lt);
        if (filter.date.gte !== undefined) where.date.gte = new Date(filter.date.gte);
        if (filter.date.lte !== undefined) where.date.lte = new Date(filter.date.lte);
        if (filter.date.gt !== undefined) where.date.gt = new Date(filter.date.gt);
        if (filter.date.lt !== undefined) where.date.lt = new Date(filter.date.lt);
      } else {
        where.date = new Date(filter.date);
      }
    }
    return where;
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const include = this.buildInclude(options);
        const queryOptions = {
          where,
          ...(include ? { include } : {}),
        };
        const orderBy = this.buildOrderBy(options.sort);
        if (orderBy) {
          queryOptions.orderBy = orderBy;
        }
        if (typeof options.skip === "number" && !isNaN(options.skip)) {
          queryOptions.skip = options.skip;
        }
        if (typeof options.limit === "number" && !isNaN(options.limit)) {
          queryOptions.take = options.limit;
        } else if (typeof options.take === "number" && !isNaN(options.take)) {
          queryOptions.take = options.take;
        }

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => this.formatAttendance(d, options));
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.find(filter);
    if (this.hasPopulate("userId", options)) query = query.populate("user");
    if (this.hasPopulate("shiftId", options)) query = query.populate("shiftId");
    if (options.sort) query = query.sort(options.sort);
    if (options.skip) query = query.skip(options.skip);
    if (options.limit) query = query.limit(options.limit);
    const docs = await query;
    return docs.map((d) => this.serialize(d.toObject ? d.toObject() : d));
  }

  async findOne(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const include = this.buildInclude(options);
        const doc = await this.delegate.findFirst({
          where,
          ...(include ? { include } : {}),
        });
        return this.formatAttendance(doc, options);
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.findOne(filter);
    if (this.hasPopulate("userId", options)) query = query.populate("user");
    if (this.hasPopulate("shiftId", options)) query = query.populate("shiftId");
    const doc = await query;
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
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
        return this.formatAttendance(doc, options);
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.findById(idStr);
    if (this.hasPopulate("userId", options)) query = query.populate("user");
    if (this.hasPopulate("shiftId", options)) query = query.populate("shiftId");
    const doc = await query;
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async _applyExistingUpdate(existing, rawPayload, options, delegate) {
    const existingId = extractAndValidateScalarId(existing.id || existing._id, "id");
    const existingOrg = extractAndValidateScalarId(existing.organizationId || existing.organization, "organization");
    const existingUser = extractAndValidateScalarId(existing.userId || existing.user, "user");

    // Immutable ID validation
    if (rawPayload._id !== undefined) {
      const idVal = extractAndValidateScalarId(rawPayload._id, "_id");
      if (idVal !== existingId) {
        throw new Error("Cannot update immutable field: _id");
      }
    }
    if (rawPayload.id !== undefined) {
      const idVal = extractAndValidateScalarId(rawPayload.id, "id");
      if (idVal !== existingId) {
        throw new Error("Cannot update immutable field: id");
      }
    }

    // Immutable organization validation
    const rawOrg = rawPayload.organization !== undefined ? rawPayload.organization : rawPayload.organizationId;
    if (rawOrg !== undefined) {
      const orgVal = extractAndValidateScalarId(rawOrg, "organization");
      if (orgVal !== existingOrg) {
        throw new Error("Cannot update immutable field: organization");
      }
    }

    // Immutable user validation
    const rawUser = rawPayload.user !== undefined ? rawPayload.user : rawPayload.userId;
    if (rawUser !== undefined) {
      const userVal = extractAndValidateScalarId(rawUser, "user");
      if (userVal !== existingUser) {
        throw new Error("Cannot update immutable field: user");
      }
    }

    // Immutable createdAt validation
    if (rawPayload.createdAt !== undefined) {
      const existingCreated = existing.createdAt instanceof Date ? existing.createdAt.getTime() : new Date(existing.createdAt).getTime();
      const payloadCreated = rawPayload.createdAt instanceof Date ? rawPayload.createdAt.getTime() : new Date(rawPayload.createdAt).getTime();
      if (isNaN(payloadCreated) || payloadCreated !== existingCreated) {
        throw new Error("Cannot update immutable field: createdAt");
      }
    }

    // Build mutable updateData: NEVER include organizationId or userId
    const updateData = {};
    if (rawPayload.date !== undefined) {
      updateData.date = validateDate(rawPayload.date, "date");
    }
    if (rawPayload.workTime !== undefined) {
      updateData.workTime = Number(rawPayload.workTime);
    }
    if (rawPayload.breakTime !== undefined) {
      updateData.breakTime = Number(rawPayload.breakTime);
    }
    if (rawPayload.startTime !== undefined) {
      updateData.startTime = rawPayload.startTime ? validateDate(rawPayload.startTime, "startTime") : null;
    }
    if (rawPayload.finishTime !== undefined) {
      updateData.finishTime = rawPayload.finishTime ? validateDate(rawPayload.finishTime, "finishTime") : null;
    }

    // No-op check: empty update payload must not invoke Prisma update
    if (Object.keys(updateData).length === 0) {
      return this.formatAttendance(existing, options);
    }

    const returnUpdated = Boolean(options.new === true || options.returnDocument === "after" || options.returnOriginal === false);
    const updated = await delegate.update({
      where: { id: existingId },
      data: updateData,
    });

    return returnUpdated ? this.formatAttendance(updated, options) : this.formatAttendance(existing, options);
  }

  async _applyCreate(filter, rawPayload, setOnInsertFields, options, delegate) {
    const insertPayload = { ...setOnInsertFields, ...rawPayload };

    const rawOrg = insertPayload.organization ?? insertPayload.organizationId ?? filter.organization ?? filter.organizationId;
    const orgId = extractAndValidateScalarId(rawOrg, "organizationId");
    if (!orgId) {
      throw new Error("Cannot upsert Attendance without valid organization identifier");
    }

    const rawUser = insertPayload.user ?? insertPayload.userId ?? filter.user ?? filter.userId;
    const userId = extractAndValidateScalarId(rawUser, "userId");
    if (!userId) {
      throw new Error("Cannot upsert Attendance without valid user identifier");
    }

    const rawId = insertPayload._id ?? insertPayload.id ?? filter._id ?? filter.id;
    const newId = rawId ? extractAndValidateScalarId(rawId, "id") : generateId();

    let dateVal = null;
    if (insertPayload.date !== undefined && insertPayload.date !== null) {
      dateVal = validateDate(insertPayload.date, "date");
    } else if (filter.date instanceof Date) {
      dateVal = validateDate(filter.date, "date");
    } else if (filter.date && typeof filter.date === "object") {
      if (filter.date.$gte !== undefined) dateVal = validateDate(filter.date.$gte, "date");
      else if (filter.date.gte !== undefined) dateVal = validateDate(filter.date.gte, "date");
      else if (filter.date.$lte !== undefined) dateVal = validateDate(filter.date.$lte, "date");
      else if (filter.date.lte !== undefined) dateVal = validateDate(filter.date.lte, "date");
      else if (filter.date.$gt !== undefined) dateVal = validateDate(filter.date.$gt, "date");
      else if (filter.date.gt !== undefined) dateVal = validateDate(filter.date.gt, "date");
      else if (filter.date.$lt !== undefined) dateVal = validateDate(filter.date.$lt, "date");
      else if (filter.date.lt !== undefined) dateVal = validateDate(filter.date.lt, "date");
    } else if (filter.date) {
      dateVal = validateDate(filter.date, "date");
    } else {
      dateVal = new Date();
    }

    const createData = {
      id: newId,
      organizationId: orgId,
      userId,
      date: dateVal,
      workTime: typeof insertPayload.workTime === "number" ? insertPayload.workTime : (insertPayload.workTime !== undefined ? Number(insertPayload.workTime) : 0),
      breakTime: typeof insertPayload.breakTime === "number" ? insertPayload.breakTime : (insertPayload.breakTime !== undefined ? Number(insertPayload.breakTime) : 0),
      startTime: insertPayload.startTime ? validateDate(insertPayload.startTime, "startTime") : null,
      finishTime: insertPayload.finishTime ? validateDate(insertPayload.finishTime, "finishTime") : null,
    };

    const created = await delegate.create({ data: createData });
    return this.formatAttendance(created, options);
  }

  async findOneAndUpdate(filter, update, options = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("AttendanceRepository.findOneAndUpdate requires a valid filter object");
        }
        if (!update || typeof update !== "object" || Array.isArray(update)) {
          throw new Error("AttendanceRepository.findOneAndUpdate requires a valid update object");
        }
        if (Object.keys(filter).length === 0) {
          throw new Error("AttendanceRepository.findOneAndUpdate requires a scoped filter object");
        }

        const updateKeys = Object.keys(update || {});
        for (const key of updateKeys) {
          if (key.startsWith("$") && key !== "$set" && key !== "$setOnInsert") {
            throw new Error(`Unsupported update operator in AttendanceRepository.findOneAndUpdate: ${key}`);
          }
        }

        if (update.$set !== undefined) {
          if (!update.$set || typeof update.$set !== "object" || Array.isArray(update.$set)) {
            throw new Error("Invalid $set envelope in AttendanceRepository.findOneAndUpdate");
          }
          for (const key of Object.keys(update.$set)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in AttendanceRepository.findOneAndUpdate: ${key}`);
            }
          }
        }

        if (update.$setOnInsert !== undefined) {
          if (!update.$setOnInsert || typeof update.$setOnInsert !== "object" || Array.isArray(update.$setOnInsert)) {
            throw new Error("Invalid $setOnInsert envelope in AttendanceRepository.findOneAndUpdate");
          }
          for (const key of Object.keys(update.$setOnInsert)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in AttendanceRepository.findOneAndUpdate: ${key}`);
            }
          }
        }

        const directFields = { ...update };
        delete directFields.$set;
        delete directFields.$setOnInsert;
        const setFields = update.$set || {};

        for (const key of Object.keys(setFields)) {
          if (directFields[key] !== undefined) {
            if (!isSameValue(directFields[key], setFields[key])) {
              throw new Error(`Conflicting update values for field '${key}' between direct payload and $set envelope`);
            }
          }
        }

        const rawPayload = { ...directFields, ...setFields };

        const setOnInsertFields = update.$setOnInsert && typeof update.$setOnInsert === "object"
          ? { ...update.$setOnInsert }
          : {};

        // Detect overlapping field paths between update payload ($set / root) and $setOnInsert
        for (const key of Object.keys(setOnInsertFields)) {
          if (typeof setOnInsertFields[key] === "function") continue;
          if (rawPayload[key] !== undefined) {
            throw new Error(`Conflicting update values for field '${key}' between update payload and $setOnInsert envelope`);
          }
        }

        const hasOrgInRaw = rawPayload.organization !== undefined || rawPayload.organizationId !== undefined;
        const hasOrgInInsert = setOnInsertFields.organization !== undefined || setOnInsertFields.organizationId !== undefined;
        if (hasOrgInRaw && hasOrgInInsert) {
          throw new Error("Conflicting update values for field 'organization' between update payload and $setOnInsert envelope");
        }

        const hasUserInRaw = rawPayload.user !== undefined || rawPayload.userId !== undefined;
        const hasUserInInsert = setOnInsertFields.user !== undefined || setOnInsertFields.userId !== undefined;
        if (hasUserInRaw && hasUserInInsert) {
          throw new Error("Conflicting update values for field 'user' between update payload and $setOnInsert envelope");
        }

        const hasIdInRaw = rawPayload._id !== undefined || rawPayload.id !== undefined;
        const hasIdInInsert = setOnInsertFields._id !== undefined || setOnInsertFields.id !== undefined;
        if (hasIdInRaw && hasIdInInsert) {
          throw new Error("Conflicting update values for field 'id' between update payload and $setOnInsert envelope");
        }

        // Validate allowed fields
        for (const key of Object.keys(rawPayload)) {
          if (typeof rawPayload[key] === "function") continue;
          if (!ALLOWED_ATTENDANCE_UPDATE_FIELDS.has(key) && !ALLOWED_ATTENDANCE_PASSTHROUGH_FIELDS.has(key)) {
            throw new Error(`Unsupported update field in AttendanceRepository: ${key}`);
          }
        }

        for (const key of Object.keys(setOnInsertFields)) {
          if (typeof setOnInsertFields[key] === "function") continue;
          if (!ALLOWED_ATTENDANCE_UPDATE_FIELDS.has(key) && !ALLOWED_ATTENDANCE_PASSTHROUGH_FIELDS.has(key)) {
            throw new Error(`Unsupported field in $setOnInsert in AttendanceRepository: ${key}`);
          }
        }

        // Detect conflicting aliases in rawPayload
        if (rawPayload._id !== undefined && rawPayload.id !== undefined) {
          const idA = extractAndValidateScalarId(rawPayload._id, "_id");
          const idB = extractAndValidateScalarId(rawPayload.id, "id");
          if (idA !== idB) {
            throw new Error("Conflicting update values for '_id' and 'id' in AttendanceRepository");
          }
        }
        if (rawPayload.organization !== undefined && rawPayload.organizationId !== undefined) {
          const orgA = extractAndValidateScalarId(rawPayload.organization, "organization");
          const orgB = extractAndValidateScalarId(rawPayload.organizationId, "organizationId");
          if (orgA !== orgB) {
            throw new Error("Conflicting update values for 'organization' and 'organizationId' in AttendanceRepository");
          }
        }
        if (rawPayload.user !== undefined && rawPayload.userId !== undefined) {
          const userA = extractAndValidateScalarId(rawPayload.user, "user");
          const userB = extractAndValidateScalarId(rawPayload.userId, "userId");
          if (userA !== userB) {
            throw new Error("Conflicting update values for 'user' and 'userId' in AttendanceRepository");
          }
        }

        // Detect conflicting aliases in setOnInsertFields
        if (setOnInsertFields._id !== undefined && setOnInsertFields.id !== undefined) {
          const idA = extractAndValidateScalarId(setOnInsertFields._id, "_id");
          const idB = extractAndValidateScalarId(setOnInsertFields.id, "id");
          if (idA !== idB) {
            throw new Error("Conflicting values for '_id' and 'id' in AttendanceRepository upsert");
          }
        }
        if (setOnInsertFields.organization !== undefined && setOnInsertFields.organizationId !== undefined) {
          const orgA = extractAndValidateScalarId(setOnInsertFields.organization, "organization");
          const orgB = extractAndValidateScalarId(setOnInsertFields.organizationId, "organizationId");
          if (orgA !== orgB) {
            throw new Error("Conflicting values for 'organization' and 'organizationId' in AttendanceRepository upsert");
          }
        }
        if (setOnInsertFields.user !== undefined && setOnInsertFields.userId !== undefined) {
          const userA = extractAndValidateScalarId(setOnInsertFields.user, "user");
          const userB = extractAndValidateScalarId(setOnInsertFields.userId, "userId");
          if (userA !== userB) {
            throw new Error("Conflicting values for 'user' and 'userId' in AttendanceRepository upsert");
          }
        }

        const where = this.buildWhere(filter);
        if (Object.keys(where).length === 0) {
          throw new Error("AttendanceRepository.findOneAndUpdate requires a scoped filter object");
        }

        if (options.upsert) {
          let userTag;
          if (filter.user !== undefined || filter.userId !== undefined || rawPayload.user !== undefined || rawPayload.userId !== undefined) {
            const rawUser = rawPayload.user ?? rawPayload.userId ?? filter.user ?? filter.userId;
            const targetUserId = extractAndValidateScalarId(rawUser, "userId");
            userTag = `attendance:${targetUserId}`;
          } else if (filter._id !== undefined || filter.id !== undefined) {
            const targetId = extractAndValidateScalarId(filter._id ?? filter.id, "id");
            userTag = `attendance:id:${targetId}`;
          } else {
            userTag = "attendance:global";
          }

          const rangeKey = deriveAttendanceRangeKey(where.date);

          const ambientTx = isTransactionActive() ? getAmbientTransaction() : null;
          const isMockedPrisma = Object.prototype.hasOwnProperty.call(this, "prisma") ||
            Object.getOwnPropertyDescriptor(this, "prisma") !== undefined;

          let executeInTx;
          if (ambientTx) {
            executeInTx = (fn) => fn(ambientTx);
          } else if (isMockedPrisma && typeof this.prisma?.$transaction === "function") {
            executeInTx = (fn) => this.prisma.$transaction(fn);
          } else {
            executeInTx = (fn) => runTransaction(fn);
          }

          return await executeInTx(async (txClient) => {
            const tx = txClient || this.prisma;
            const delegate = tx?.attendance || this.delegate;

            if (typeof tx?.$executeRaw === "function") {
              await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userTag}), hashtext(${rangeKey}))`;
            } else if (typeof tx?.$queryRaw === "function") {
              await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userTag}), hashtext(${rangeKey}))`;
            } else {
              throw new Error("Transaction client does not support raw queries for advisory locking in AttendanceRepository");
            }

            const existing = await delegate.findFirst({ where });
            if (existing) {
              return await this._applyExistingUpdate(existing, rawPayload, options, delegate);
            }
            return await this._applyCreate(filter, rawPayload, setOnInsertFields, options, delegate);
          });
        }

        const existing = await this.delegate.findFirst({ where });
        if (existing) {
          return await this._applyExistingUpdate(existing, rawPayload, options, this.delegate);
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
        const orgId = extractAndValidateScalarId(data.organization || data.organizationId, "organizationId");
        if (!orgId) {
          throw new Error("Cannot create Attendance without valid organization identifier");
        }
        const userId = extractAndValidateScalarId(data.user || data.userId, "userId");
        if (!userId) {
          throw new Error("Cannot create Attendance without valid user identifier");
        }
        const newId = data._id || data.id ? extractAndValidateScalarId(data._id || data.id, "id") : generateId();

        const createData = {
          id: newId,
          organizationId: orgId,
          userId,
          date: validateDate(data.date, "date"),
          workTime: typeof data.workTime === "number" ? data.workTime : 0,
          breakTime: typeof data.breakTime === "number" ? data.breakTime : 0,
          startTime: data.startTime ? validateDate(data.startTime, "startTime") : null,
          finishTime: data.finishTime ? validateDate(data.finishTime, "finishTime") : null,
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatAttendance(doc);
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
          throw new Error("AttendanceRepository.deleteMany requires a valid filter object");
        }

        const where = this.buildWhere(filter);
        if (Object.keys(where).length === 0) {
          throw new Error("Bulk deletion requires a valid scoped filter in AttendanceRepository.deleteMany");
        }

        const res = await this.delegate.deleteMany({ where });
        return { acknowledged: true, deletedCount: res.count };
      } catch (err) {
        this.handleError(err);
      }
    }

    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("AttendanceRepository.deleteMany requires a valid filter object");
    }
    return await this.mongooseModel.deleteMany(filter, options);
  }
}

export const attendanceRepository = new AttendanceRepository();
export default attendanceRepository;
