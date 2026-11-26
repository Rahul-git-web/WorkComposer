import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

function hasPopulate(name, options = {}) {
  if (!options || typeof options !== "object") return false;

  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  if (options[`populate${cap}`]) return true;

  if (name === "organization" && options.populateOrg) return true;
  if (name === "createdBy" && (options.populateUser || options.populateCreator)) return true;

  if (!options.populate) return false;

  const checkMatch = (target) => {
    if (typeof target !== "string") return false;
    const t = target.trim();
    if (name === "organization") {
      return t === "organization" || t === "org";
    }
    if (name === "createdBy") {
      return t === "createdBy" || t === "createdById" || t === "user" || t === "creator";
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

export class ApiKeyRepository extends BaseRepository {
  constructor() {
    super("ApiKey");
  }

  formatApiKey(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    if (serialized.id && !serialized._id) serialized._id = String(serialized.id);
    if (serialized._id && !serialized.id) serialized.id = String(serialized._id);

    // Never expose secret keyHash
    delete serialized.keyHash;

    if (doc.organization && typeof doc.organization === "object") {
      serialized.organization = this.serialize(doc.organization);
      if (serialized.organization.id && !serialized.organization._id) {
        serialized.organization._id = String(serialized.organization.id);
      }
      if (serialized.organization._id && !serialized.organization.id) {
        serialized.organization.id = String(serialized.organization._id);
      }
      if (serialized.organization.ownerId && !serialized.organization.owner) {
        serialized.organization.owner = serialized.organization.ownerId;
      }
    } else {
      serialized.organization = serialized.organization || serialized.organizationId;
    }

    if (doc.createdBy && typeof doc.createdBy === "object") {
      serialized.createdBy = this.serialize(doc.createdBy);
      if (serialized.createdBy.id && !serialized.createdBy._id) {
        serialized.createdBy._id = String(serialized.createdBy.id);
      }
      if (serialized.createdBy._id && !serialized.createdBy.id) {
        serialized.createdBy.id = String(serialized.createdBy._id);
      }
      if (!serialized.createdBy.name && (serialized.createdBy.firstName || serialized.createdBy.lastName)) {
        serialized.createdBy.name = `${serialized.createdBy.firstName || ""} ${serialized.createdBy.lastName || ""}`.trim();
      }
    } else if (serialized.createdById !== undefined && serialized.createdBy === undefined) {
      serialized.createdBy = serialized.createdById;
    }

    return serialized;
  }

  buildWhere(filter = {}) {
    const where = {};

    if (filter._id) {
      if (Array.isArray(filter._id)) {
        where.id = { in: filter._id.map((id) => this.toIdString(id)).filter(Boolean) };
      } else if (typeof filter._id === "object" && filter._id !== null) {
        if (filter._id.$in && Array.isArray(filter._id.$in)) {
          where.id = { in: filter._id.$in.map((id) => this.toIdString(id)).filter(Boolean) };
        } else if (filter._id.in && Array.isArray(filter._id.in)) {
          where.id = { in: filter._id.in.map((id) => this.toIdString(id)).filter(Boolean) };
        } else {
          where.id = this.toIdString(filter._id);
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
        } else {
          where.id = this.toIdString(filter.id);
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
        } else {
          where.organizationId = this.toIdString(filter.organization);
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
        } else {
          where.organizationId = this.toIdString(filter.organizationId);
        }
      } else {
        where.organizationId = this.toIdString(filter.organizationId);
      }
    }

    if (filter.keyHash) where.keyHash = filter.keyHash;
    if (filter.isActive !== undefined) where.isActive = Boolean(filter.isActive);
    if (filter.createdBy) where.createdById = this.toIdString(filter.createdBy);
    if (filter.createdById) where.createdById = this.toIdString(filter.createdById);
    return where;
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const include = {};
        if (hasPopulate("createdBy", options)) {
          include.createdBy = { select: { id: true, firstName: true, lastName: true, email: true } };
        }
        if (hasPopulate("organization", options)) {
          include.organization = true;
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
        return docs.map((d) => this.formatApiKey(d));
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.find(filter);
    if (options.populate) query = query.populate(options.populate);
    if (options.sort) query = query.sort(options.sort);
    if (typeof options.skip === "number") query = query.skip(options.skip);
    if (typeof options.limit === "number") query = query.limit(options.limit);
    const docs = await query;
    return docs.map((d) => {
      const s = this.serialize(d.toObject ? d.toObject() : d);
      delete s.keyHash;
      return s;
    });
  }

  async findOne(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const include = {};
        if (hasPopulate("createdBy", options)) {
          include.createdBy = { select: { id: true, firstName: true, lastName: true, email: true } };
        }
        if (hasPopulate("organization", options)) {
          include.organization = true;
        }

        const queryOptions = { where };
        if (Object.keys(include).length > 0) queryOptions.include = include;

        const doc = await this.delegate.findFirst(queryOptions);
        if (!doc) return null;
        return this.formatApiKey(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.findOne(filter);
    if (options.populate) query = query.populate(options.populate);
    const doc = await query;
    if (!doc) return null;
    const s = this.serialize(doc.toObject ? doc.toObject() : doc);
    delete s.keyHash;
    return s;
  }

  async findById(id, options = {}) {
    if (isPostgres()) {
      try {
        const where = { id: this.toIdString(id) };
        const include = {};
        if (hasPopulate("createdBy", options)) {
          include.createdBy = { select: { id: true, firstName: true, lastName: true, email: true } };
        }
        if (hasPopulate("organization", options)) {
          include.organization = true;
        }

        const queryOptions = { where };
        if (Object.keys(include).length > 0) queryOptions.include = include;

        const doc = await this.delegate.findUnique(queryOptions);
        return doc ? this.formatApiKey(doc) : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.findById(id);
    if (options.populate) query = query.populate(options.populate);
    const doc = await query;
    if (!doc) return null;
    const s = this.serialize(doc.toObject ? doc.toObject() : doc);
    delete s.keyHash;
    return s;
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
        const organizationId = this.toIdString(data.organization || data.organizationId);
        const createdById = data.createdBy || data.createdById ? this.toIdString(data.createdBy || data.createdById) : null;
        const newId = data._id ? this.toIdString(data._id) : generateId();

        const createData = {
          id: newId,
          organizationId,
          name: data.name,
          keyHash: data.keyHash,
          keyPreview: data.keyPreview,
          createdById,
          isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          lastUsedAt: data.lastUsedAt ? new Date(data.lastUsedAt) : null,
          lastUsedIp: data.lastUsedIp || null,
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatApiKey(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.create(data);
    const s = this.serialize(doc.toObject ? doc.toObject() : doc);
    delete s.keyHash;
    return s;
  }

  async findOneAndUpdate(filter, update, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const existing = await this.delegate.findFirst({ where });
        if (!existing) return null;

        const updatePayload = update.$set ? { ...update.$set, ...update } : update;
        delete updatePayload.$set;

        const updateData = {};
        if (updatePayload.name !== undefined) updateData.name = updatePayload.name;
        if (updatePayload.isActive !== undefined) updateData.isActive = Boolean(updatePayload.isActive);
        if (updatePayload.lastUsedAt !== undefined) updateData.lastUsedAt = updatePayload.lastUsedAt ? new Date(updatePayload.lastUsedAt) : null;
        if (updatePayload.lastUsedIp !== undefined) updateData.lastUsedIp = updatePayload.lastUsedIp;
        if (updatePayload.revokedAt !== undefined) updateData.revokedAt = updatePayload.revokedAt ? new Date(updatePayload.revokedAt) : null;

        const doc = await this.delegate.update({
          where: { id: existing.id },
          data: updateData,
        });
        return this.formatApiKey(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOneAndUpdate(filter, update, options);
    if (!doc) return null;
    const s = this.serialize(doc.toObject ? doc.toObject() : doc);
    delete s.keyHash;
    return s;
  }

  async findOneAndDelete(filter) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const existing = await this.delegate.findFirst({ where });
        if (!existing) return null;

        const doc = await this.delegate.delete({ where: { id: existing.id } });
        return this.formatApiKey(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOneAndDelete(filter);
    if (!doc) return null;
    const s = this.serialize(doc.toObject ? doc.toObject() : doc);
    delete s.keyHash;
    return s;
  }

  async findByIdAndUpdate(id, update, options = {}) {
    return this.findOneAndUpdate({ _id: id }, update, options);
  }

  async findByIdAndDelete(id, options = {}) {
    return this.findOneAndDelete({ _id: id });
  }
}

export const apiKeyRepository = new ApiKeyRepository();
export default apiKeyRepository;
