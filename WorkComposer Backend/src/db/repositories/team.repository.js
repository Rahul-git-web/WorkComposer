const ALLOWED_TEAM_DELETE_FIELDS = new Set([
  "organization",
  "organizationId",
  "_id",
  "id",
  "createdBy",
  "createdById",
  "name",
]);

const ALLOWED_TEAM_FILTER_FIELDS = new Set([
  "organization",
  "organizationId",
  "_id",
  "id",
  "createdBy",
  "createdById",
  "name",
]);

import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

export class TeamRepository extends BaseRepository {
  constructor() {
    super("Team");
  }

  formatTeam(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    serialized.organization = serialized.organization || serialized.organizationId;
    delete serialized.organizationId;
    serialized.createdBy = serialized.createdBy || serialized.createdById || null;
    delete serialized.createdById;
    return serialized;
  }

  async findById(id) {
    const idStr = this.toIdString(id);
    if (!idStr) return null;

    if (isPostgres()) {
      try {
        const doc = await this.delegate.findUnique({ where: { id: idStr } });
        return this.formatTeam(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findById(idStr);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findOne(filter = {}) {
    if (isPostgres()) {
      try {
        const where = {};
        if (filter._id) where.id = this.toIdString(filter._id);
        if (filter.id) where.id = this.toIdString(filter.id);
        if (filter.name) where.name = filter.name;
        if (filter.organization) where.organizationId = this.toIdString(filter.organization);
        if (filter.organizationId) where.organizationId = this.toIdString(filter.organizationId);

        const doc = await this.delegate.findFirst({ where });
        return this.formatTeam(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOne(filter);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findTeamByIdAndOrganization(id, organizationId) {
    const idStr = this.toIdString(id);
    const orgIdStr = this.toIdString(organizationId);
    if (!idStr || !orgIdStr) return null;
    return await this.findOne({ _id: idStr, organization: orgIdStr });
  }

  buildWhere(filter = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("TeamRepository.find requires a valid filter object");
    }

    const where = {};

    for (const key of Object.keys(filter)) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in TeamRepository: ${key}`);
      }
      if (!ALLOWED_TEAM_FILTER_FIELDS.has(key)) {
        throw new Error(`Unsupported filter field in TeamRepository: ${key}`);
      }

      const val = filter[key];

      switch (key) {
        case "_id":
        case "id":
          where.id = this._processIdFilter(val, key);
          break;

        case "organization":
        case "organizationId":
          where.organizationId = this._processIdFilter(val, key);
          break;

        case "createdBy":
        case "createdById":
          where.createdById = this._processIdFilter(val, key);
          break;

        case "name":
          this._processNameFilter(val, where);
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
          queryOptions.orderBy = { [sortField]: sortDir === -1 || sortDir === "desc" ? "desc" : "asc" };
        }
        if (options.limit) queryOptions.take = options.limit;
        if (options.skip) queryOptions.skip = options.skip;

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => this.formatTeam(d));
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
        const orgId = this.toIdString(data.organization || data.organizationId);
        const createdById = this.toIdString(data.createdBy || data.createdById);
        const createData = {
          id: data._id ? this.toIdString(data._id) : generateId(),
          name: data.name,
          organizationId: orgId,
          description: data.description || "",
          createdById: createdById || null,
        };
        const doc = await this.delegate.create({ data: createData });
        return this.formatTeam(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.create(data);
    return this.serialize(doc.toObject ? doc.toObject() : doc);
  }

  async findByIdAndUpdate(id, updateData, options = { new: true }) {
    const idStr = this.toIdString(id);
    if (!idStr || typeof idStr !== "string" || !idStr.trim() || idStr === "[object Object]") {
      throw new Error("Invalid identifier in TeamRepository.findByIdAndUpdate");
    }

    if (!updateData || typeof updateData !== "object" || Array.isArray(updateData)) {
      throw new Error("TeamRepository.findByIdAndUpdate requires a valid update object");
    }

    if (isPostgres()) {
      try {
        for (const key of Object.keys(updateData)) {
          if (key.startsWith("$") && key !== "$set") {
            throw new Error(`Unsupported update operator in TeamRepository: ${key}`);
          }
        }

        if (updateData.$set !== undefined) {
          if (!updateData.$set || typeof updateData.$set !== "object" || Array.isArray(updateData.$set)) {
            throw new Error("Invalid $set envelope in TeamRepository.findByIdAndUpdate");
          }
          for (const key of Object.keys(updateData.$set)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in TeamRepository: ${key}`);
            }
          }
        }

        const directFields = { ...updateData };
        delete directFields.$set;
        const setFields = updateData.$set || {};

        for (const key of Object.keys(setFields)) {
          if (directFields[key] !== undefined) {
            if (JSON.stringify(directFields[key]) !== JSON.stringify(setFields[key])) {
              throw new Error(`Conflicting update values for field '${key}' between direct payload and $set envelope`);
            }
          }
        }

        const rawPayload = { ...directFields, ...setFields };

        const ALLOWED_UPDATE_FIELDS = new Set([
          "name",
          "description",
        ]);

        const ALLOWED_PASSTHROUGH_FIELDS = new Set([
          "_id",
          "id",
          "organization",
          "organizationId",
          "createdBy",
          "createdById",
          "createdAt",
          "updatedAt",
          "__v",
          "isNew",
          "_isNew",
          "$set",
          "deleteOne",
          "save",
          "toObject",
          "toJSON",
          "isModified",
        ]);

        for (const key of Object.keys(rawPayload)) {
          if (typeof rawPayload[key] === "function") {
            continue;
          }
          if (!ALLOWED_UPDATE_FIELDS.has(key) && !ALLOWED_PASSTHROUGH_FIELDS.has(key)) {
            throw new Error(`Unsupported update field in TeamRepository: ${key}`);
          }
        }

        // Detect conflicting aliases
        if (rawPayload._id !== undefined && rawPayload.id !== undefined) {
          if (this.toIdString(rawPayload._id) !== this.toIdString(rawPayload.id)) {
            throw new Error("Conflicting update values for '_id' and 'id' in TeamRepository.findByIdAndUpdate");
          }
        }

        if (rawPayload.organization !== undefined && rawPayload.organizationId !== undefined) {
          if (this.toIdString(rawPayload.organization) !== this.toIdString(rawPayload.organizationId)) {
            throw new Error("Conflicting update values for 'organization' and 'organizationId' in TeamRepository.findByIdAndUpdate");
          }
        }

        if (rawPayload.createdBy !== undefined && rawPayload.createdById !== undefined) {
          if (this.toIdString(rawPayload.createdBy) !== this.toIdString(rawPayload.createdById)) {
            throw new Error("Conflicting update values for 'createdBy' and 'createdById' in TeamRepository.findByIdAndUpdate");
          }
        }

        // Validate immutable fields
        if (rawPayload._id !== undefined && this.toIdString(rawPayload._id) !== idStr) {
          throw new Error("Cannot update immutable field: _id");
        }
        if (rawPayload.id !== undefined && this.toIdString(rawPayload.id) !== idStr) {
          throw new Error("Cannot update immutable field: id");
        }
        if (rawPayload.createdAt !== undefined) {
          throw new Error("Cannot update immutable field: createdAt");
        }

        // Fetch existing record if findUnique is available on delegate
        let existing = null;
        if (typeof this.delegate?.findUnique === "function") {
          existing = await this.delegate.findUnique({ where: { id: idStr } });
          if (!existing) {
            return null;
          }
        }

        // Validate immutable organization ownership and creator against existing record
        if (existing) {
          if (rawPayload.organization !== undefined && this.toIdString(rawPayload.organization) !== existing.organizationId) {
            throw new Error("Cannot update immutable field: organization");
          }
          if (rawPayload.organizationId !== undefined && this.toIdString(rawPayload.organizationId) !== existing.organizationId) {
            throw new Error("Cannot update immutable field: organizationId");
          }
          if (rawPayload.createdBy !== undefined && this.toIdString(rawPayload.createdBy) !== existing.createdById) {
            throw new Error("Cannot update immutable field: createdBy");
          }
          if (rawPayload.createdById !== undefined && this.toIdString(rawPayload.createdById) !== existing.createdById) {
            throw new Error("Cannot update immutable field: createdById");
          }
        }

        const patch = {};

        // name
        if (rawPayload.name !== undefined) {
          if (typeof rawPayload.name !== "string" || !rawPayload.name.trim()) {
            throw new Error("Invalid team name in TeamRepository.findByIdAndUpdate");
          }
          patch.name = rawPayload.name.trim();
        }

        // description
        if (rawPayload.description !== undefined) {
          if (rawPayload.description === null) {
            patch.description = "";
          } else if (typeof rawPayload.description === "string") {
            patch.description = rawPayload.description;
          } else {
            throw new Error("Invalid description in TeamRepository.findByIdAndUpdate");
          }
        }

        const returnOriginal = options.new === false || options.returnDocument === "before";

        if (Object.keys(patch).length === 0) {
          if (existing) {
            return this.formatTeam(existing);
          }
          return await this.findById(idStr);
        }

        const doc = await this.delegate.update({
          where: { id: idStr },
          data: patch,
        });

        if (returnOriginal) {
          if (existing) {
            return this.formatTeam(existing);
          }
          return await this.findById(idStr);
        }

        return this.formatTeam(doc);
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

  async deleteOne(filter = {}) {
    if (isPostgres()) {
      try {
        const existing = await this.findOne(filter);
        if (!existing) return { acknowledged: true, deletedCount: 0 };

        await this.delegate.delete({ where: { id: existing.id } });
        return { acknowledged: true, deletedCount: 1 };
      } catch (err) {
        this.handleError(err);
      }
    }

    return await this.mongooseModel.deleteOne(filter);
  }

  async findByIdAndDelete(id) {
    const idStr = this.toIdString(id);
    if (!idStr) return null;

    if (isPostgres()) {
      try {
        const doc = await this.delegate.delete({ where: { id: idStr } });
        return this.serialize(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findByIdAndDelete(idStr);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  _extractAndValidateId(val, fieldName) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in TeamRepository filter for field: ${fieldName}`);
    }
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) {
        throw new Error(`Invalid identifier in TeamRepository filter for field: ${fieldName}`);
      }
      return trimmed;
    }
    if (typeof val === "object") {
      if (val._id) {
        const idStr = String(val._id).trim();
        if (!idStr) {
          throw new Error(`Invalid identifier in TeamRepository filter for field: ${fieldName}`);
        }
        return idStr;
      }
      if (val.id) {
        const idStr = String(val.id).trim();
        if (!idStr) {
          throw new Error(`Invalid identifier in TeamRepository filter for field: ${fieldName}`);
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
      throw new Error(`Invalid identifier object in TeamRepository filter: ${fieldName}`);
    }
    throw new Error(`Invalid identifier in TeamRepository filter for field: ${fieldName}`);
  }

  _processIdFilter(raw, fieldName) {
    if (raw === null || raw === undefined) {
      throw new Error(`Invalid identifier in TeamRepository filter for field: ${fieldName}`);
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
          throw new Error(`Invalid array in TeamRepository filter: ${fieldName}`);
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
          throw new Error(`Invalid array in TeamRepository filter: ${fieldName}`);
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
          throw new Error(`Unsupported filter operator in TeamRepository: ${k}`);
        }
      }
      throw new Error(`Invalid identifier object in TeamRepository filter: ${fieldName}`);
    }
    return this._extractAndValidateId(raw, fieldName);
  }

  _processNameFilter(raw, where) {
    if (raw === null || raw === undefined) {
      throw new Error("Invalid name in TeamRepository filter");
    }
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed) {
        throw new Error("Invalid name in TeamRepository filter");
      }
      where.name = trimmed;
      return;
    }
    if (Array.isArray(raw)) {
      if (raw.length === 0) {
        where.name = { in: [] };
        return;
      }
      const names = [];
      for (const item of raw) {
        if (typeof item !== "string" || !item.trim()) {
          throw new Error("Invalid name in TeamRepository filter");
        }
        names.push(item.trim());
      }
      where.name = { in: names };
      return;
    }
    if (typeof raw === "object") {
      if (raw.$in !== undefined) {
        if (!Array.isArray(raw.$in)) {
          throw new Error("Invalid array in TeamRepository filter: name");
        }
        if (raw.$in.length === 0) {
          where.name = { in: [] };
          return;
        }
        const names = [];
        for (const item of raw.$in) {
          if (typeof item !== "string" || !item.trim()) {
            throw new Error("Invalid name in TeamRepository filter");
          }
          names.push(item.trim());
        }
        where.name = { in: names };
        return;
      }
      if (raw.in !== undefined) {
        if (!Array.isArray(raw.in)) {
          throw new Error("Invalid array in TeamRepository filter: name");
        }
        if (raw.in.length === 0) {
          where.name = { in: [] };
          return;
        }
        const names = [];
        for (const item of raw.in) {
          if (typeof item !== "string" || !item.trim()) {
            throw new Error("Invalid name in TeamRepository filter");
          }
          names.push(item.trim());
        }
        where.name = { in: names };
        return;
      }
      for (const k of Object.keys(raw)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in TeamRepository: ${k}`);
        }
      }
      throw new Error("Invalid name in TeamRepository filter");
    }
    throw new Error("Invalid name in TeamRepository filter");
  }

  buildDeleteWhere(filter = {}) {
    const where = {};

    for (const key of Object.keys(filter || {})) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in TeamRepository: ${key}`);
      }
      if (!ALLOWED_TEAM_DELETE_FIELDS.has(key)) {
        throw new Error(`Unsupported filter field in TeamRepository: ${key}`);
      }

      const val = filter[key];

      switch (key) {
        case "_id":
        case "id":
          where.id = this._processIdFilter(val, key);
          break;

        case "organization":
        case "organizationId":
          where.organizationId = this._processIdFilter(val, key);
          break;

        case "createdBy":
        case "createdById":
          where.createdById = this._processIdFilter(val, key);
          break;

        case "name":
          this._processNameFilter(val, where);
          break;
      }
    }

    return where;
  }

  async deleteMany(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("TeamRepository.deleteMany requires a valid filter object");
        }

        const where = this.buildDeleteWhere(filter);
        if (Object.keys(where).length === 0) {
          throw new Error("Bulk deletion requires a valid scoped filter in TeamRepository.deleteMany");
        }

        const res = await this.delegate.deleteMany({ where });
        return { acknowledged: true, deletedCount: res.count };
      } catch (err) {
        this.handleError(err);
      }
    }

    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("TeamRepository.deleteMany requires a valid filter object");
    }
    return await this.mongooseModel.deleteMany(filter, options);
  }
}

export const teamRepository = new TeamRepository();
export default teamRepository;
