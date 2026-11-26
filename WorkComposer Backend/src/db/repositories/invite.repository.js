import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

function hasPopulate(name, options = {}) {
  if (!options || typeof options !== "object") return false;

  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  if (options[`populate${cap}`]) return true;

  if (name === "organization" && (options.populateOrg || options.populateOrganization)) return true;
  if (name === "invitedBy" && options.populateInvitedBy) return true;
  if (name === "team" && options.populateTeam) return true;

  if (!options.populate) return false;

  const checkMatch = (target) => {
    if (typeof target !== "string") return false;
    const t = target.trim();
    if (name === "organization") {
      return t === "organization" || t === "org";
    }
    return t === name;
  };

  if (typeof options.populate === "string") {
    const parts = options.populate.trim().split(/\s+/).filter(Boolean);
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

export class InviteRepository extends BaseRepository {
  constructor() {
    super("Invite");
  }

  formatInvite(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    serialized.organization = serialized.organization || serialized.organizationId;
    if (serialized.teamId !== undefined && serialized.team === undefined) {
      serialized.team = serialized.teamId;
    }
    if (serialized.invitedById !== undefined && serialized.invitedBy === undefined) {
      serialized.invitedBy = serialized.invitedById;
    }
    return serialized;
  }

  _buildEmailFilter(val, fieldName = "email") {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in InviteRepository filter for field: ${fieldName}`);
    }

    if (typeof val === "string") {
      const trimmed = val.toLowerCase().trim();
      if (!trimmed) {
        throw new Error(`Invalid identifier in InviteRepository filter for field: ${fieldName}`);
      }
      return trimmed;
    }

    if (val instanceof RegExp) {
      const pattern = val.source.replace(/^\^|\$/g, "").toLowerCase().trim();
      return { contains: pattern, mode: "insensitive" };
    }

    if (typeof val === "object") {
      if (val.$regex !== undefined || val.regex !== undefined) {
        const raw = val.$regex !== undefined ? val.$regex : val.regex;
        if (typeof raw !== "string" && !(raw instanceof RegExp)) {
          throw new Error(`Invalid regex value in InviteRepository filter for field: ${fieldName}`);
        }
        const patternStr = raw instanceof RegExp ? raw.source : String(raw);
        const clean = patternStr.replace(/^\^|\$/g, "").toLowerCase().trim();
        return { contains: clean, mode: "insensitive" };
      }

      if (val.contains !== undefined) {
        return { contains: String(val.contains).toLowerCase().trim(), mode: "insensitive" };
      }

      if (val.$in !== undefined || val.in !== undefined) {
        const list = val.$in !== undefined ? val.$in : val.in;
        if (!Array.isArray(list)) {
          throw new Error(`Invalid array in InviteRepository filter: ${fieldName}`);
        }
        return { in: list.map((e) => String(e).toLowerCase().trim()).filter(Boolean) };
      }

      if (val.equals !== undefined) {
        return { equals: String(val.equals).toLowerCase().trim(), mode: "insensitive" };
      }

      if (val.$eq !== undefined) {
        return String(val.$eq).toLowerCase().trim();
      }

      for (const k of Object.keys(val)) {
        if (k.startsWith("$") && k !== "$options") {
          throw new Error(`Unsupported filter operator in InviteRepository: ${k}`);
        }
      }

      throw new Error(`Invalid identifier object in InviteRepository filter: ${fieldName}`);
    }

    throw new Error(`Invalid identifier in InviteRepository filter for field: ${fieldName}`);
  }

  buildWhere(filter = {}) {
    const where = {};

    for (const key of Object.keys(filter || {})) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in InviteRepository: ${key}`);
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
              throw new Error(`Unsupported filter operator in InviteRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in InviteRepository filter: _id");
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
              throw new Error(`Unsupported filter operator in InviteRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in InviteRepository filter: id");
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
              throw new Error(`Unsupported filter operator in InviteRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in InviteRepository filter: organization");
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
              throw new Error(`Unsupported filter operator in InviteRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in InviteRepository filter: organizationId");
        }
      } else {
        where.organizationId = this.toIdString(filter.organizationId);
      }
    }

    if (filter.team) {
      if (Array.isArray(filter.team)) {
        where.teamId = { in: filter.team.map((id) => this.toIdString(id)).filter(Boolean) };
      } else if (typeof filter.team === "object" && filter.team !== null) {
        if (filter.team.$in && Array.isArray(filter.team.$in)) {
          where.teamId = { in: filter.team.$in.map((id) => this.toIdString(id)).filter(Boolean) };
        } else if (filter.team.in && Array.isArray(filter.team.in)) {
          where.teamId = { in: filter.team.in.map((id) => this.toIdString(id)).filter(Boolean) };
        } else if (filter.team._id || filter.team.id) {
          where.teamId = this.toIdString(filter.team);
        } else {
          for (const k of Object.keys(filter.team)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in InviteRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in InviteRepository filter: team");
        }
      } else {
        where.teamId = this.toIdString(filter.team);
      }
    }

    if (filter.teamId) {
      if (Array.isArray(filter.teamId)) {
        where.teamId = { in: filter.teamId.map((id) => this.toIdString(id)).filter(Boolean) };
      } else if (typeof filter.teamId === "object" && filter.teamId !== null) {
        if (filter.teamId.$in && Array.isArray(filter.teamId.$in)) {
          where.teamId = { in: filter.teamId.$in.map((id) => this.toIdString(id)).filter(Boolean) };
        } else if (filter.teamId.in && Array.isArray(filter.teamId.in)) {
          where.teamId = { in: filter.teamId.in.map((id) => this.toIdString(id)).filter(Boolean) };
        } else if (filter.teamId._id || filter.teamId.id) {
          where.teamId = this.toIdString(filter.teamId);
        } else {
          for (const k of Object.keys(filter.teamId)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in InviteRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in InviteRepository filter: teamId");
        }
      } else {
        where.teamId = this.toIdString(filter.teamId);
      }
    }

    if (filter.invitedBy) {
      if (Array.isArray(filter.invitedBy)) {
        where.invitedById = { in: filter.invitedBy.map((id) => this.toIdString(id)).filter(Boolean) };
      } else if (typeof filter.invitedBy === "object" && filter.invitedBy !== null) {
        if (filter.invitedBy.$in && Array.isArray(filter.invitedBy.$in)) {
          where.invitedById = { in: filter.invitedBy.$in.map((id) => this.toIdString(id)).filter(Boolean) };
        } else if (filter.invitedBy.in && Array.isArray(filter.invitedBy.in)) {
          where.invitedById = { in: filter.invitedBy.in.map((id) => this.toIdString(id)).filter(Boolean) };
        } else if (filter.invitedBy._id || filter.invitedBy.id) {
          where.invitedById = this.toIdString(filter.invitedBy);
        } else {
          for (const k of Object.keys(filter.invitedBy)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in InviteRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in InviteRepository filter: invitedBy");
        }
      } else {
        where.invitedById = this.toIdString(filter.invitedBy);
      }
    }

    if (filter.invitedById) {
      if (Array.isArray(filter.invitedById)) {
        where.invitedById = { in: filter.invitedById.map((id) => this.toIdString(id)).filter(Boolean) };
      } else if (typeof filter.invitedById === "object" && filter.invitedById !== null) {
        if (filter.invitedById.$in && Array.isArray(filter.invitedById.$in)) {
          where.invitedById = { in: filter.invitedById.$in.map((id) => this.toIdString(id)).filter(Boolean) };
        } else if (filter.invitedById.in && Array.isArray(filter.invitedById.in)) {
          where.invitedById = { in: filter.invitedById.in.map((id) => this.toIdString(id)).filter(Boolean) };
        } else if (filter.invitedById._id || filter.invitedById.id) {
          where.invitedById = this.toIdString(filter.invitedById);
        } else {
          for (const k of Object.keys(filter.invitedById)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in InviteRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in InviteRepository filter: invitedById");
        }
      } else {
        where.invitedById = this.toIdString(filter.invitedById);
      }
    }

    if (filter.email !== undefined) {
      where.email = this._buildEmailFilter(filter.email, "email");
    }

    if (filter.token) {
      where.token = filter.token;
    }

    if (filter.role) {
      where.role = filter.role;
    }

    if (filter.isAccepted !== undefined) {
      if (typeof filter.isAccepted === "object" && filter.isAccepted !== null) {
        if (filter.isAccepted.$ne !== undefined) {
          where.isAccepted = { not: Boolean(filter.isAccepted.$ne) };
        } else if (filter.isAccepted.not !== undefined) {
          where.isAccepted = { not: Boolean(filter.isAccepted.not) };
        } else if (filter.isAccepted.$eq !== undefined) {
          where.isAccepted = Boolean(filter.isAccepted.$eq);
        } else {
          for (const k of Object.keys(filter.isAccepted)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in InviteRepository: ${k}`);
            }
          }
          throw new Error("Invalid filter object for isAccepted in InviteRepository");
        }
      } else {
        where.isAccepted = Boolean(filter.isAccepted);
      }
    }

    if (filter.expireAt !== undefined) {
      if (filter.expireAt instanceof Date || typeof filter.expireAt === "string" || typeof filter.expireAt === "number") {
        where.expireAt = new Date(filter.expireAt);
      } else if (typeof filter.expireAt === "object" && filter.expireAt !== null) {
        const expFilter = {};
        for (const [k, v] of Object.entries(filter.expireAt)) {
          if (k === "$gt" || k === "gt") expFilter.gt = new Date(v);
          else if (k === "$gte" || k === "gte") expFilter.gte = new Date(v);
          else if (k === "$lt" || k === "lt") expFilter.lt = new Date(v);
          else if (k === "$lte" || k === "lte") expFilter.lte = new Date(v);
          else if (k === "$ne" || k === "not") expFilter.not = new Date(v);
          else if (k === "$eq" || k === "equals") expFilter.equals = new Date(v);
          else if (k.startsWith("$")) {
            throw new Error(`Unsupported filter operator in InviteRepository: ${k}`);
          }
        }
        if (Object.keys(expFilter).length === 0) {
          throw new Error("Invalid identifier object in InviteRepository filter: expireAt");
        }
        where.expireAt = expFilter;
      } else {
        throw new Error("Invalid identifier value in InviteRepository filter: expireAt");
      }
    }

    return where;
  }

  async findOne(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const include = {};
        if (hasPopulate("team", options)) {
          include.team = { select: { id: true, name: true } };
        }
        if (hasPopulate("invitedBy", options)) {
          include.invitedBy = { select: { id: true, firstName: true, lastName: true, email: true } };
        }
        if (hasPopulate("organization", options)) {
          include.organization = { select: { id: true, name: true } };
        }

        const queryOptions = { where };
        if (Object.keys(include).length > 0) queryOptions.include = include;

        const doc = await this.delegate.findFirst(queryOptions);
        if (!doc) return null;
        const formatted = this.formatInvite(doc);
        if (doc.team) formatted.team = this.serialize(doc.team);
        if (doc.invitedBy) formatted.invitedBy = this.serialize(doc.invitedBy);
        if (doc.organization) formatted.organization = this.serialize(doc.organization);
        return formatted;
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.findOne(filter);
    if (options.populate) query = query.populate(options.populate);
    const doc = await query;
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const include = {};
        if (hasPopulate("team", options)) {
          include.team = { select: { id: true, name: true } };
        }
        if (hasPopulate("invitedBy", options)) {
          include.invitedBy = { select: { id: true, firstName: true, lastName: true, email: true } };
        }
        if (hasPopulate("organization", options)) {
          include.organization = { select: { id: true, name: true } };
        }

        const queryOptions = { where };
        if (Object.keys(include).length > 0) queryOptions.include = include;
        if (options.sort) {
          const [sortField, sortDir] = Object.entries(options.sort)[0] || ["createdAt", -1];
          queryOptions.orderBy = { [sortField]: sortDir === -1 || sortDir === "desc" ? "desc" : "asc" };
        }
        if (options.skip) queryOptions.skip = Number(options.skip);
        if (options.limit) queryOptions.take = Number(options.limit);

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => {
          const formatted = this.formatInvite(d);
          if (d.team) formatted.team = this.serialize(d.team);
          if (d.invitedBy) formatted.invitedBy = this.serialize(d.invitedBy);
          if (d.organization) formatted.organization = this.serialize(d.organization);
          return formatted;
        });
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.find(filter);
    if (options.populate) query = query.populate(options.populate);
    if (options.sort) query = query.sort(options.sort);
    if (options.skip) query = query.skip(Number(options.skip));
    if (options.limit) query = query.limit(Number(options.limit));
    const docs = await query;
    return docs.map((d) => this.serialize(d.toObject ? d.toObject() : d));
  }

  async deleteMany(filter = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("InviteRepository.deleteMany requires a valid filter object");
        }

        const where = this.buildWhere(filter);
        if (Object.keys(where).length === 0) {
          throw new Error("Bulk deletion requires a valid scoped filter in InviteRepository.deleteMany");
        }

        const result = await this.delegate.deleteMany({ where });
        return { acknowledged: true, deletedCount: result.count };
      } catch (err) {
        this.handleError(err);
      }
    }

    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("InviteRepository.deleteMany requires a valid filter object");
    }
    return this.mongooseModel.deleteMany(filter);
  }

  async findById(id) {
    if (isPostgres()) {
      try {
        const doc = await this.delegate.findUnique({
          where: { id: this.toIdString(id) },
        });
        return doc ? this.formatInvite(doc) : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findById(id);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async create(data) {
    if (isPostgres()) {
      try {
        const organizationId = this.toIdString(data.organization || data.organizationId);
        const teamId = data.team || data.teamId ? this.toIdString(data.team || data.teamId) : null;
        const invitedById = data.invitedBy || data.invitedById ? this.toIdString(data.invitedBy || data.invitedById) : null;
        const newId = data._id ? this.toIdString(data._id) : generateId();

        const createData = {
          id: newId,
          email: data.email.toLowerCase().trim(),
          role: data.role || "user",
          teamId,
          token: data.token || `inv_${newId}`,
          expireAt: data.expireAt ? new Date(data.expireAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          invitedById,
          organizationId,
          isAccepted: Boolean(data.isAccepted),
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatInvite(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.create(data);
    return this.serialize(doc.toObject ? doc.toObject() : doc);
  }

  async updateById(id, updateData, options = { new: true }) {
    return this.findByIdAndUpdate(id, updateData, options);
  }

  async findByIdAndUpdate(id, update, options = {}) {
    const idStr = this.toIdString(id);
    if (!idStr || typeof idStr !== "string" || !idStr.trim() || idStr === "[object Object]") {
      throw new Error("Invalid identifier in InviteRepository.findByIdAndUpdate");
    }

    if (!update || typeof update !== "object" || Array.isArray(update)) {
      throw new Error("InviteRepository.findByIdAndUpdate requires a valid update object");
    }

    if (isPostgres()) {
      try {
        for (const key of Object.keys(update)) {
          if (key.startsWith("$") && key !== "$set") {
            throw new Error(`Unsupported update operator in InviteRepository: ${key}`);
          }
        }

        if (update.$set !== undefined) {
          if (!update.$set || typeof update.$set !== "object" || Array.isArray(update.$set)) {
            throw new Error("Invalid $set envelope in InviteRepository.findByIdAndUpdate");
          }
          for (const key of Object.keys(update.$set)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in InviteRepository: ${key}`);
            }
          }
        }

        const directFields = { ...update };
        delete directFields.$set;
        const setFields = update.$set || {};

        for (const key of Object.keys(setFields)) {
          if (directFields[key] !== undefined) {
            let matches = false;
            if (directFields[key] === setFields[key]) {
              matches = true;
            } else if (key === "expireAt") {
              const da = directFields[key] instanceof Date ? directFields[key].getTime() : new Date(directFields[key]).getTime();
              const db = setFields[key] instanceof Date ? setFields[key].getTime() : new Date(setFields[key]).getTime();
              matches = !isNaN(da) && !isNaN(db) && da === db;
            } else {
              matches = JSON.stringify(directFields[key]) === JSON.stringify(setFields[key]);
            }

            if (!matches) {
              throw new Error(`Conflicting update values for field '${key}' between direct payload and $set envelope`);
            }
          }
        }

        const rawPayload = { ...directFields, ...setFields };

        const ALLOWED_UPDATE_FIELDS = new Set([
          "token",
          "expireAt",
          "email",
          "role",
          "team",
          "teamId",
          "invitedBy",
          "invitedById",
          "isAccepted",
        ]);

        const ALLOWED_PASSTHROUGH_FIELDS = new Set([
          "_id",
          "id",
          "organization",
          "organizationId",
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
            throw new Error(`Unsupported update field in InviteRepository: ${key}`);
          }
        }

        // Detect conflicting aliases
        if (rawPayload._id !== undefined && rawPayload.id !== undefined) {
          if (this.toIdString(rawPayload._id) !== this.toIdString(rawPayload.id)) {
            throw new Error("Conflicting update values for '_id' and 'id' in InviteRepository.findByIdAndUpdate");
          }
        }

        if (rawPayload.organization !== undefined && rawPayload.organizationId !== undefined) {
          if (this.toIdString(rawPayload.organization) !== this.toIdString(rawPayload.organizationId)) {
            throw new Error("Conflicting update values for 'organization' and 'organizationId' in InviteRepository.findByIdAndUpdate");
          }
        }

        if (rawPayload.team !== undefined && rawPayload.teamId !== undefined) {
          const teamVal = rawPayload.team === null ? null : this.toIdString(rawPayload.team);
          const teamIdVal = rawPayload.teamId === null ? null : this.toIdString(rawPayload.teamId);
          if (teamVal !== teamIdVal) {
            throw new Error("Conflicting update values for 'team' and 'teamId' in InviteRepository.findByIdAndUpdate");
          }
        }

        if (rawPayload.invitedBy !== undefined && rawPayload.invitedById !== undefined) {
          const invVal = rawPayload.invitedBy === null ? null : this.toIdString(rawPayload.invitedBy);
          const invIdVal = rawPayload.invitedById === null ? null : this.toIdString(rawPayload.invitedById);
          if (invVal !== invIdVal) {
            throw new Error("Conflicting update values for 'invitedBy' and 'invitedById' in InviteRepository.findByIdAndUpdate");
          }
        }

        if (rawPayload._id !== undefined && this.toIdString(rawPayload._id) !== idStr) {
          throw new Error("Cannot update immutable field: _id");
        }
        if (rawPayload.id !== undefined && this.toIdString(rawPayload.id) !== idStr) {
          throw new Error("Cannot update immutable field: id");
        }
        if (rawPayload.createdAt !== undefined) {
          throw new Error("Cannot update immutable field: createdAt");
        }

        const patch = {};

        // token
        if (rawPayload.token !== undefined) {
          if (typeof rawPayload.token !== "string" || !rawPayload.token.trim()) {
            throw new Error("Invalid token in InviteRepository.findByIdAndUpdate");
          }
          patch.token = rawPayload.token.trim();
        }

        // expireAt
        if (rawPayload.expireAt !== undefined) {
          if (rawPayload.expireAt === null) {
            throw new Error("Invalid expireAt date in InviteRepository.findByIdAndUpdate: cannot be null");
          }
          const expireDate = rawPayload.expireAt instanceof Date ? rawPayload.expireAt : new Date(rawPayload.expireAt);
          if (isNaN(expireDate.getTime())) {
            throw new Error("Invalid expireAt date in InviteRepository.findByIdAndUpdate");
          }
          patch.expireAt = expireDate;
        }

        // email
        if (rawPayload.email !== undefined) {
          if (typeof rawPayload.email !== "string" || !rawPayload.email.trim()) {
            throw new Error("Invalid email in InviteRepository.findByIdAndUpdate");
          }
          patch.email = rawPayload.email.toLowerCase().trim();
        }

        // role
        if (rawPayload.role !== undefined) {
          if (typeof rawPayload.role !== "string" || !rawPayload.role.trim()) {
            throw new Error("Invalid role in InviteRepository.findByIdAndUpdate");
          }
          const normalizedRole = rawPayload.role.toLowerCase().trim();
          const VALID_ROLES = new Set(["owner", "admin", "manager", "user"]);
          if (!VALID_ROLES.has(normalizedRole)) {
            throw new Error(`Invalid role '${rawPayload.role}' in InviteRepository.findByIdAndUpdate`);
          }
          patch.role = normalizedRole;
        }

        // team / teamId
        const rawTeam = rawPayload.team !== undefined ? rawPayload.team : rawPayload.teamId;
        if (rawTeam !== undefined) {
          if (rawTeam === null || rawTeam === "") {
            patch.teamId = null;
          } else {
            const teamIdStr = this.toIdString(rawTeam);
            if (!teamIdStr || typeof teamIdStr !== "string" || !teamIdStr.trim() || teamIdStr === "[object Object]") {
              throw new Error("Invalid team ID in InviteRepository.findByIdAndUpdate");
            }
            patch.teamId = teamIdStr.trim();
          }
        }

        // invitedBy / invitedById
        const rawInvitedBy = rawPayload.invitedBy !== undefined ? rawPayload.invitedBy : rawPayload.invitedById;
        if (rawInvitedBy !== undefined) {
          if (rawInvitedBy === null || rawInvitedBy === "") {
            patch.invitedById = null;
          } else {
            const invitedByIdStr = this.toIdString(rawInvitedBy);
            if (!invitedByIdStr || typeof invitedByIdStr !== "string" || !invitedByIdStr.trim() || invitedByIdStr === "[object Object]") {
              throw new Error("Invalid invitedBy ID in InviteRepository.findByIdAndUpdate");
            }
            patch.invitedById = invitedByIdStr.trim();
          }
        }

        // isAccepted
        if (rawPayload.isAccepted !== undefined) {
          if (typeof rawPayload.isAccepted === "boolean") {
            patch.isAccepted = rawPayload.isAccepted;
          } else if (rawPayload.isAccepted === "true" || rawPayload.isAccepted === 1) {
            patch.isAccepted = true;
          } else if (rawPayload.isAccepted === "false" || rawPayload.isAccepted === 0) {
            patch.isAccepted = false;
          } else {
            throw new Error("Invalid isAccepted boolean in InviteRepository.findByIdAndUpdate");
          }
        }

        const returnOriginal = options.new === false || options.returnDocument === "before";
        let beforeDoc = null;
        if (returnOriginal) {
          beforeDoc = await this.findById(idStr);
          if (!beforeDoc) return null;
        }

        if (Object.keys(patch).length === 0) {
          return returnOriginal ? beforeDoc : this.findById(idStr);
        }

        const doc = await this.delegate.update({
          where: { id: idStr },
          data: patch,
        });

        if (returnOriginal) {
          return beforeDoc;
        }

        return this.formatInvite(doc);
      } catch (err) {
        if (err && err.code === "P2025") {
          return null;
        }
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findByIdAndUpdate(id, update, options);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findByIdAndDelete(id) {
    if (isPostgres()) {
      try {
        const doc = await this.delegate.delete({
          where: { id: this.toIdString(id) },
        });
        return this.formatInvite(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findByIdAndDelete(id);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async acceptInviteIfUnused(id) {
    if (isPostgres()) {
      try {
        const res = await this.delegate.updateMany({
          where: {
            id: this.toIdString(id),
            isAccepted: false,
          },
          data: {
            isAccepted: true,
          },
        });
        return res.count;
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOneAndUpdate(
      { _id: id, isAccepted: false },
      { $set: { isAccepted: true } },
      { new: true }
    );
    return doc ? 1 : 0;
  }
}

export const inviteRepository = new InviteRepository();
export default inviteRepository;
