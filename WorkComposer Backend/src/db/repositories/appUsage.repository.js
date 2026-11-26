const ALLOWED_APP_USAGE_DELETE_FIELDS = new Set([
  "user",
  "userId",
  "_id",
  "id",
  "appName",
  "date",
  "createdAt",
]);

const ALLOWED_APP_USAGE_FILTER_FIELDS = new Set([
  "user",
  "userId",
  "_id",
  "id",
  "appName",
  "windowTitle",
  "duration",
  "date",
  "createdAt",
  "updatedAt",
]);

const ALLOWED_APP_USAGE_SORT_FIELDS = new Set([
  "_id",
  "id",
  "user",
  "userId",
  "appName",
  "windowTitle",
  "duration",
  "date",
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

import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

export class AppUsageRepository extends BaseRepository {
  constructor() {
    super("AppUsage");
  }

  formatAppUsage(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    serialized.user = serialized.user || serialized.userId;
    delete serialized.userId;
    if (serialized.id && !serialized._id) serialized._id = serialized.id;
    return serialized;
  }

  buildOrderBy(sort) {
    if (!sort) return { duration: "desc" };

    const mapField = (f) => {
      if (f === "_id") return "id";
      if (f === "user") return "userId";
      return f;
    };

    if (typeof sort === "string") {
      const parts = sort.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) return { duration: "desc" };
      const orderBy = {};
      for (const part of parts) {
        let field = part;
        let dir = "asc";
        if (part.startsWith("-")) {
          field = part.slice(1);
          dir = "desc";
        } else if (part.startsWith("+")) {
          field = part.slice(1);
          dir = "asc";
        }
        if (!ALLOWED_APP_USAGE_SORT_FIELDS.has(field)) {
          throw new Error(`Unsupported sort field in AppUsageRepository: ${field}`);
        }
        orderBy[mapField(field)] = dir;
      }
      return Object.keys(orderBy).length > 0 ? orderBy : { duration: "desc" };
    }

    if (typeof sort === "object" && !Array.isArray(sort)) {
      const entries = Object.entries(sort);
      if (entries.length === 0) return { duration: "desc" };
      const orderBy = {};
      for (const [key, val] of entries) {
        if (!ALLOWED_APP_USAGE_SORT_FIELDS.has(key)) {
          throw new Error(`Unsupported sort field in AppUsageRepository: ${key}`);
        }
        const dir = val === -1 || val === "desc" || val === "descending" ? "desc" : "asc";
        orderBy[mapField(key)] = dir;
      }
      return Object.keys(orderBy).length > 0 ? orderBy : { duration: "desc" };
    }

    return { duration: "desc" };
  }

  buildWhere(filter = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("AppUsageRepository requires a valid filter object");
    }

    const where = {};

    for (const key of Object.keys(filter)) {
      if (filter[key] === undefined) continue;

      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in AppUsageRepository: ${key}`);
      }
      if (!ALLOWED_APP_USAGE_FILTER_FIELDS.has(key)) {
        throw new Error(`Unsupported filter field in AppUsageRepository: ${key}`);
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

        case "appName":
          where.appName = this._processAppNameFilter(val);
          break;

        case "windowTitle":
          where.windowTitle = typeof val === "string" ? val : String(val || "");
          break;

        case "duration":
          if (typeof val === "number" && !isNaN(val)) {
            where.duration = val;
          } else if (typeof val === "object" && val !== null) {
            const durCond = {};
            if (val.$gte !== undefined) durCond.gte = Number(val.$gte);
            if (val.gte !== undefined) durCond.gte = Number(val.gte);
            if (val.$gt !== undefined) durCond.gt = Number(val.$gt);
            if (val.gt !== undefined) durCond.gt = Number(val.gt);
            if (val.$lte !== undefined) durCond.lte = Number(val.$lte);
            if (val.lte !== undefined) durCond.lte = Number(val.lte);
            if (val.$lt !== undefined) durCond.lt = Number(val.$lt);
            if (val.lt !== undefined) durCond.lt = Number(val.lt);
            where.duration = durCond;
          }
          break;

        case "date":
          this._processDateStringFilter(val, where);
          break;

        case "createdAt":
          where.createdAt = this._processCreatedAtFilter(val, "createdAt");
          break;

        case "updatedAt":
          where.updatedAt = this._processCreatedAtFilter(val, "updatedAt");
          break;
      }
    }

    return where;
  }

  async findOne(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const queryOptions = { where };
        if (options && options.sort) {
          queryOptions.orderBy = this.buildOrderBy(options.sort);
        }
        const doc = await this.delegate.findFirst(queryOptions);
        return doc ? this.formatAppUsage(doc) : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.findOne(filter);
    if (options && options.sort) query = query.sort(options.sort);
    const doc = await query;
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findById(id, options = {}) {
    return this.findOne({ _id: id }, options);
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const queryOptions = { where };

        queryOptions.orderBy = this.buildOrderBy(options.sort);

        if (options.skip !== undefined && options.skip !== null) {
          const parsedSkip = Number(options.skip);
          if (Number.isInteger(parsedSkip) && parsedSkip >= 0) {
            queryOptions.skip = parsedSkip;
          }
        }

        const rawLimit = options.limit !== undefined ? options.limit : options.take;
        if (rawLimit !== undefined && rawLimit !== null) {
          const parsedLimit = Number(rawLimit);
          if (Number.isInteger(parsedLimit) && parsedLimit >= 0) {
            queryOptions.take = parsedLimit;
          }
        }

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => this.formatAppUsage(d));
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.find(filter);
    if (options.sort) query = query.sort(options.sort);
    if (options.limit !== undefined && options.limit !== null) {
      const parsedLimit = Number(options.limit);
      if (Number.isInteger(parsedLimit) && parsedLimit >= 0) {
        query = query.limit(parsedLimit);
      } else {
        query = query.limit(options.limit);
      }
    }
    if (options.skip !== undefined && options.skip !== null) {
      const parsedSkip = Number(options.skip);
      if (Number.isInteger(parsedSkip) && parsedSkip >= 0) {
        query = query.skip(parsedSkip);
      } else {
        query = query.skip(options.skip);
      }
    }
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

    return this.mongooseModel.countDocuments(filter);
  }

  async create(data) {
    if (isPostgres()) {
      try {
        const userId = this.toIdString(data.user || data.userId);
        const newId = data._id ? this.toIdString(data._id) : generateId();

        const createData = {
          id: newId,
          userId,
          appName: data.appName,
          windowTitle: data.windowTitle || "",
          duration: typeof data.duration === "number" ? data.duration : 0,
          date: String(data.date),
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatAppUsage(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.create(data);
    return this.serialize(doc.toObject ? doc.toObject() : doc);
  }

  async incrementDuration(id, addedDuration, windowTitle = "") {
    if (isPostgres()) {
      try {
        const updateData = {
          duration: { increment: Number(addedDuration) },
        };
        if (windowTitle) updateData.windowTitle = windowTitle;

        const doc = await this.delegate.update({
          where: { id: this.toIdString(id) },
          data: updateData,
        });
        return this.formatAppUsage(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findById(id);
    if (doc) {
      doc.duration += Number(addedDuration);
      if (windowTitle) doc.windowTitle = windowTitle;
      await doc.save();
      return this.serialize(doc.toObject ? doc.toObject() : doc);
    }
    return null;
  }

  async updateById(id, updateData, options = { new: true }) {
    const idStr = this.toIdString(id);
    if (!idStr || typeof idStr !== "string" || !idStr.trim() || idStr === "[object Object]") {
      throw new Error("Invalid identifier in AppUsageRepository.updateById");
    }

    if (!updateData || typeof updateData !== "object" || Array.isArray(updateData)) {
      throw new Error("AppUsageRepository.updateById requires a valid update object");
    }

    if (isPostgres()) {
      try {
        for (const key of Object.keys(updateData)) {
          if (key.startsWith("$") && key !== "$set") {
            throw new Error(`Unsupported update operator in AppUsageRepository: ${key}`);
          }
        }

        const payload = updateData.$set && typeof updateData.$set === "object"
          ? { ...updateData, ...updateData.$set }
          : { ...updateData };

        if (payload._id !== undefined && this.toIdString(payload._id) !== idStr) {
          throw new Error("Cannot update immutable field: _id");
        }
        if (payload.id !== undefined && this.toIdString(payload.id) !== idStr) {
          throw new Error("Cannot update immutable field: id");
        }
        if (payload.createdAt !== undefined) {
          throw new Error("Cannot update immutable field: createdAt");
        }
        if (payload.userId !== undefined) {
          throw new Error("Cannot update immutable field: userId");
        }

        const ALLOWED_UPDATE_FIELDS = new Set([
          "duration",
          "windowTitle",
          "appName",
          "date",
        ]);

        const ALLOWED_PASSTHROUGH_FIELDS = new Set([
          "_id",
          "id",
          "user",
          "updatedAt",
          "__v",
          "$set",
          "deleteOne",
          "save",
          "toObject",
          "toJSON",
          "isModified",
        ]);

        for (const key of Object.keys(payload)) {
          if (typeof payload[key] === "function") {
            continue;
          }
          if (!ALLOWED_UPDATE_FIELDS.has(key) && !ALLOWED_PASSTHROUGH_FIELDS.has(key)) {
            throw new Error(`Unsupported update field in AppUsageRepository: ${key}`);
          }
        }

        const patch = {};
        if (payload.duration !== undefined) {
          if (typeof payload.duration !== "number" || isNaN(payload.duration) || payload.duration < 0) {
            throw new Error("Invalid duration in AppUsageRepository.updateById");
          }
          patch.duration = payload.duration;
        }
        if (payload.windowTitle !== undefined) {
          patch.windowTitle = typeof payload.windowTitle === "string" ? payload.windowTitle : String(payload.windowTitle || "");
        }
        if (payload.appName !== undefined) {
          if (typeof payload.appName !== "string" || !payload.appName.trim()) {
            throw new Error("Invalid appName in AppUsageRepository.updateById");
          }
          patch.appName = payload.appName.trim();
        }
        if (payload.date !== undefined) {
          if (typeof payload.date !== "string" || !payload.date.trim()) {
            throw new Error("Invalid date string in AppUsageRepository.updateById");
          }
          patch.date = payload.date.trim();
        }

        const doc = await this.delegate.update({
          where: { id: idStr },
          data: patch,
        });
        return this.formatAppUsage(doc);
      } catch (err) {
        if (err && err.code === "P2025") {
          return null;
        }
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findByIdAndUpdate(idStr, updateData, options);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findByIdAndUpdate(id, updateData, options = { new: true }) {
    return this.updateById(id, updateData, options);
  }

  _validateScalarId(val, fieldName) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in AppUsageRepository filter for field: ${fieldName}`);
    }

    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) {
        throw new Error(`Invalid identifier in AppUsageRepository filter for field: ${fieldName}`);
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

      throw new Error(`Invalid identifier object in AppUsageRepository filter: ${fieldName}`);
    }

    throw new Error(`Invalid identifier in AppUsageRepository filter for field: ${fieldName}`);
  }

  _processIdFilter(val, fieldName) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in AppUsageRepository filter for field: ${fieldName}`);
    }

    if (Array.isArray(val)) {
      if (val.length === 0) return { in: [] };
      return { in: val.map((item) => this._validateScalarId(item, fieldName)) };
    }

    if (typeof val === "object") {
      if (val.$in !== undefined) {
        if (!Array.isArray(val.$in)) {
          throw new Error(`Invalid array in AppUsageRepository filter: ${fieldName}`);
        }
        if (val.$in.length === 0) return { in: [] };
        return { in: val.$in.map((item) => this._validateScalarId(item, fieldName)) };
      }
      if (val.in !== undefined) {
        if (!Array.isArray(val.in)) {
          throw new Error(`Invalid array in AppUsageRepository filter: ${fieldName}`);
        }
        if (val.in.length === 0) return { in: [] };
        return { in: val.in.map((item) => this._validateScalarId(item, fieldName)) };
      }

      for (const k of Object.keys(val)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in AppUsageRepository: ${k}`);
        }
      }

      return this._validateScalarId(val, fieldName);
    }

    return this._validateScalarId(val, fieldName);
  }

  _processAppNameFilter(raw) {
    if (raw === null || raw === undefined) {
      throw new Error("Invalid appName in AppUsageRepository filter: appName");
    }

    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed) throw new Error("Invalid appName in AppUsageRepository filter: appName");
      return trimmed;
    }

    if (Array.isArray(raw)) {
      if (raw.length === 0) return { in: [] };
      return {
        in: raw.map((item) => {
          if (typeof item !== "string" || !item.trim()) {
            throw new Error("Invalid appName in AppUsageRepository filter: appName");
          }
          return item.trim();
        }),
      };
    }

    if (typeof raw === "object") {
      if (raw.$in !== undefined) {
        if (!Array.isArray(raw.$in)) throw new Error("Invalid array in AppUsageRepository filter: appName");
        if (raw.$in.length === 0) return { in: [] };
        return {
          in: raw.$in.map((item) => {
            if (typeof item !== "string" || !item.trim()) {
              throw new Error("Invalid appName in AppUsageRepository filter: appName");
            }
            return item.trim();
          }),
        };
      }
      if (raw.in !== undefined) {
        if (!Array.isArray(raw.in)) throw new Error("Invalid array in AppUsageRepository filter: appName");
        if (raw.in.length === 0) return { in: [] };
        return {
          in: raw.in.map((item) => {
            if (typeof item !== "string" || !item.trim()) {
              throw new Error("Invalid appName in AppUsageRepository filter: appName");
            }
            return item.trim();
          }),
        };
      }

      for (const k of Object.keys(raw)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in AppUsageRepository: ${k}`);
        }
      }
    }

    throw new Error("Invalid appName in AppUsageRepository filter: appName");
  }

  _processDateStringFilter(raw, where) {
    if (raw === null || raw === undefined) {
      throw new Error("Invalid date string in AppUsageRepository filter: date");
    }

    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed) {
        throw new Error("Invalid date string in AppUsageRepository filter: date");
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
          throw new Error("Invalid date string in AppUsageRepository filter: date");
        }
        dates.push(item.trim());
      }
      where.date = { in: dates };
      return;
    }

    if (typeof raw === "object") {
      const keys = Object.keys(raw);
      if (keys.length === 0) {
        throw new Error("Invalid date filter in AppUsageRepository: date cannot be an empty object");
      }

      const hasRangeOp = keys.some((k) =>
        ["$gte", "$lte", "$gt", "$lt", "gte", "lte", "gt", "lt"].includes(k)
      );

      if (hasRangeOp) {
        for (const k of keys) {
          if (!ALLOWED_DATE_OPERATORS.has(k)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in AppUsageRepository: ${k}`);
            }
            throw new Error(`Unsupported date range operator in AppUsageRepository: ${k}`);
          }
        }

        const rangeCond = {};
        const validateDateStr = (v, op) => {
          if (typeof v !== "string" || !v.trim()) {
            throw new Error(`Invalid date string for operator ${op} in AppUsageRepository filter: date`);
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
          throw new Error("Invalid date range in AppUsageRepository filter: lower bound cannot be after upper bound in date");
        }

        where.date = rangeCond;
        return;
      }

      if (raw.$in !== undefined) {
        if (!Array.isArray(raw.$in)) throw new Error("Invalid array in AppUsageRepository filter: date");
        if (raw.$in.length === 0) {
          where.date = { in: [] };
          return;
        }
        const dates = [];
        for (const item of raw.$in) {
          if (typeof item !== "string" || !item.trim()) {
            throw new Error("Invalid date string in AppUsageRepository filter: date");
          }
          dates.push(item.trim());
        }
        where.date = { in: dates };
        return;
      }

      if (raw.in !== undefined) {
        if (!Array.isArray(raw.in)) throw new Error("Invalid array in AppUsageRepository filter: date");
        if (raw.in.length === 0) {
          where.date = { in: [] };
          return;
        }
        const dates = [];
        for (const item of raw.in) {
          if (typeof item !== "string" || !item.trim()) {
            throw new Error("Invalid date string in AppUsageRepository filter: date");
          }
          dates.push(item.trim());
        }
        where.date = { in: dates };
        return;
      }

      for (const k of Object.keys(raw)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in AppUsageRepository: ${k}`);
        }
      }

      throw new Error("Invalid date string in AppUsageRepository filter: date");
    }

    throw new Error("Invalid date string in AppUsageRepository filter: date");
  }

  _processCreatedAtFilter(raw, fieldName = "createdAt") {
    if (raw === null || raw === undefined) {
      throw new Error(`Invalid date value in AppUsageRepository filter: ${fieldName}`);
    }

    if (raw instanceof Date) {
      if (isNaN(raw.getTime())) {
        throw new Error(`Invalid date value in AppUsageRepository filter: ${fieldName}`);
      }
      return raw;
    }

    if (typeof raw === "string" || typeof raw === "number") {
      const d = new Date(raw);
      if (isNaN(d.getTime())) {
        throw new Error(`Invalid date value in AppUsageRepository filter: ${fieldName}`);
      }
      return d;
    }

    if (typeof raw === "object" && !Array.isArray(raw)) {
      const keys = Object.keys(raw);
      if (keys.length === 0) {
        throw new Error(`Invalid date range in AppUsageRepository filter: ${fieldName} cannot be an empty object`);
      }

      for (const op of keys) {
        if (!ALLOWED_DATE_OPERATORS.has(op)) {
          if (op.startsWith("$")) {
            throw new Error(`Unsupported filter operator in AppUsageRepository: ${op}`);
          }
          throw new Error(`Unsupported date range operator in AppUsageRepository: ${op}`);
        }
      }

      const dateCond = {};
      const parseDate = (val, op) => {
        if (val === null || val === undefined || (typeof val === "string" && !val.trim())) {
          throw new Error(`Invalid date value for operator ${op} in AppUsageRepository filter: ${fieldName}`);
        }
        const parsed = val instanceof Date ? val : new Date(val);
        if (isNaN(parsed.getTime())) {
          throw new Error(`Invalid date value for operator ${op} in AppUsageRepository filter: ${fieldName}`);
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
        throw new Error(`Invalid date range in AppUsageRepository filter: lower bound cannot be after upper bound in ${fieldName}`);
      }

      return dateCond;
    }

    throw new Error(`Invalid date value in AppUsageRepository filter: ${fieldName}`);
  }

  buildDeleteWhere(filter = {}) {
    const where = {};

    for (const key of Object.keys(filter || {})) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in AppUsageRepository: ${key}`);
      }
      if (!ALLOWED_APP_USAGE_DELETE_FIELDS.has(key)) {
        throw new Error(`Unsupported filter field in AppUsageRepository: ${key}`);
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

  async deleteMany(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("AppUsageRepository.deleteMany requires a valid filter object");
        }

        const where = this.buildDeleteWhere(filter);
        if (Object.keys(where).length === 0) {
          throw new Error("Bulk deletion requires a valid scoped filter in AppUsageRepository.deleteMany");
        }

        const res = await this.delegate.deleteMany({ where });
        return { deletedCount: res.count };
      } catch (err) {
        this.handleError(err);
      }
    }

    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("AppUsageRepository.deleteMany requires a valid filter object");
    }
    return await this.mongooseModel.deleteMany(filter, options);
  }
}

export const appUsageRepository = new AppUsageRepository();
export default appUsageRepository;
