const ALLOWED_TASK_FILTER_FIELDS = new Set([
  "organization",
  "organizationId",
  "project",
  "projectId",
  "_id",
  "id",
  "assignedTo",
  "assignedToId",
  "title",
  "status",
  "provider",
  "deleted",
  "isDeleted",
  "jiraIssueId",
  "jiraIssueKey",
  "asanaTaskId",
  "createdAt",
  "updatedAt",
  "$or",
]);

import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

function formatUserRelation(userDoc) {
  if (!userDoc || typeof userDoc !== "object") return null;
  const user = { ...userDoc };
  if (user.id && !user._id) user._id = user.id;
  if (user._id && !user.id) user.id = user._id;

  if (!user.name && (user.firstName || user.lastName)) {
    user.name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  }

  delete user.password;
  delete user.passwordHash;
  delete user.twoFactorCode;
  delete user.twoFactorExpires;
  delete user.verificationToken;
  delete user.verificationTokenExpire;
  delete user.resetToken;
  delete user.resetTokenExpire;
  delete user.refreshToken;
  delete user.refreshTokens;
  delete user.devices;

  return user;
}

function hasPopulate(name, options = {}) {
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  if (options[`populate${cap}`]) return true;
  if (!options.populate) return false;
  if (typeof options.populate === "string") {
    return options.populate.split(/\s+/).includes(name) || options.populate.includes(name);
  }
  if (Array.isArray(options.populate)) {
    return options.populate.some((p) => (typeof p === "string" ? p === name : p?.path === name));
  }
  if (typeof options.populate === "object" && options.populate !== null) {
    return options.populate.path === name;
  }
  return false;
}

function applyProjection(doc, selectStr) {
  if (!doc || typeof doc !== "object") return doc;
  if (!selectStr || typeof selectStr !== "string") return doc;

  const fields = selectStr.trim().split(/\s+/).filter(Boolean);
  if (fields.length === 0) return doc;
  const isExclusion = fields.some((f) => f.startsWith("-"));

  if (isExclusion) {
    const excluded = fields.filter((f) => f.startsWith("-")).map((f) => f.slice(1));
    for (const key of excluded) {
      delete doc[key];
    }
  } else {
    const included = new Set(fields.filter((f) => !f.startsWith("-")));
    included.add("_id");
    included.add("id");
    if (included.has("firstName") || included.has("lastName")) {
      included.add("name");
    }
    for (const key of Object.keys(doc)) {
      if (!included.has(key) && typeof doc[key] !== "function") {
        delete doc[key];
      }
    }
  }
  return doc;
}

function applyPopulateProjections(doc, options = {}) {
  if (!doc || typeof doc !== "object") return doc;

  const populates = [];
  if (Array.isArray(options.populate)) {
    populates.push(...options.populate);
  } else if (typeof options.populate === "object" && options.populate !== null) {
    populates.push(options.populate);
  }

  for (const pop of populates) {
    if (pop && pop.path && pop.select && doc[pop.path] && typeof doc[pop.path] === "object") {
      applyProjection(doc[pop.path], pop.select);
    }
  }

  if (options.select && typeof options.select === "string") {
    applyProjection(doc, options.select);
  }

  return doc;
}

function buildOrderBy(sort) {
  if (!sort) return undefined;

  const normalizeDirection = (dir) => {
    if (dir === -1 || dir === "-1" || dir === "desc" || dir === "descending") return "desc";
    return "asc";
  };

  const mapField = (field) => {
    if (field === "_id") return "id";
    if (field === "organization") return "organizationId";
    if (field === "project") return "projectId";
    if (field === "assignedTo") return "assignedToId";
    if (field === "assignedBy") return "assignedById";
    if (field === "deletedBy") return "deletedById";
    return field;
  };

  if (typeof sort === "string") {
    const parts = sort.trim().split(/\s+/).filter(Boolean);
    const orderBy = [];
    for (const part of parts) {
      if (part.startsWith("-")) {
        orderBy.push({ [mapField(part.slice(1))]: "desc" });
      } else if (part.startsWith("+")) {
        orderBy.push({ [mapField(part.slice(1))]: "asc" });
      } else {
        orderBy.push({ [mapField(part)]: "asc" });
      }
    }
    return orderBy.length === 1 ? orderBy[0] : orderBy;
  }

  if (Array.isArray(sort)) {
    const orderBy = [];
    for (const item of sort) {
      if (Array.isArray(item) && item.length === 2) {
        orderBy.push({ [mapField(item[0])]: normalizeDirection(item[1]) });
      }
    }
    return orderBy.length > 0 ? orderBy : undefined;
  }

  if (typeof sort === "object" && sort !== null) {
    const entries = Object.entries(sort);
    if (entries.length === 1) {
      const [field, dir] = entries[0];
      return { [mapField(field)]: normalizeDirection(dir) };
    }
    if (entries.length > 1) {
      return entries.map(([field, dir]) => ({
        [mapField(field)]: normalizeDirection(dir),
      }));
    }
  }

  return undefined;
}

export class TaskRepository extends BaseRepository {
  constructor() {
    super("Task");
  }

  formatTask(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    serialized.organization = serialized.organization || serialized.organizationId;
    delete serialized.organizationId;

    if (doc.project && typeof doc.project === "object") {
      serialized.project = this.serialize(doc.project);
      if (serialized.project.id && !serialized.project._id) serialized.project._id = serialized.project.id;
      if (serialized.project._id && !serialized.project.id) serialized.project.id = serialized.project._id;
    } else {
      serialized.project = serialized.project || serialized.projectId || null;
    }
    delete serialized.projectId;

    if (doc.assignedTo && typeof doc.assignedTo === "object") {
      serialized.assignedTo = formatUserRelation(this.serialize(doc.assignedTo));
    } else {
      serialized.assignedTo = serialized.assignedTo || serialized.assignedToId || null;
    }
    delete serialized.assignedToId;

    if (doc.assignedBy && typeof doc.assignedBy === "object") {
      serialized.assignedBy = formatUserRelation(this.serialize(doc.assignedBy));
    } else {
      serialized.assignedBy = serialized.assignedBy || serialized.assignedById || null;
    }
    delete serialized.assignedById;

    if (doc.deletedBy && typeof doc.deletedBy === "object") {
      serialized.deletedBy = formatUserRelation(this.serialize(doc.deletedBy));
    } else {
      serialized.deletedBy = serialized.deletedBy || serialized.deletedById || null;
    }
    delete serialized.deletedById;

    if (serialized.status === "in_progress") {
      serialized.status = "in-progress";
    }

    return serialized;
  }

  async findById(id, options = {}) {
    const idStr = this.toIdString(id);
    if (!idStr) return null;

    if (isPostgres()) {
      try {
        const include = {};
        if (hasPopulate("assignedTo", options)) include.assignedTo = true;
        if (hasPopulate("project", options)) include.project = true;
        if (hasPopulate("deletedBy", options)) include.deletedBy = true;
        if (hasPopulate("assignedBy", options)) include.assignedBy = true;

        const queryOptions = { where: { id: idStr } };
        if (Object.keys(include).length > 0) queryOptions.include = include;

        const doc = await this.delegate.findUnique(queryOptions);
        const formatted = this.formatTask(doc);
        return applyPopulateProjections(formatted, options);
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.findById(idStr);
    if (options.populate) {
      const popList = Array.isArray(options.populate) ? options.populate : [options.populate];
      for (const pop of popList) {
        if (typeof pop === "string") query = query.populate(pop);
        else if (pop && pop.path) query = query.populate(pop.path, pop.select);
      }
    }
    if (options.populateDeletedBy) query = query.populate("deletedBy", "firstName lastName");
    if (options.populateAssignedTo) query = query.populate("assignedTo", "firstName lastName email avatar");
    if (options.populateProject) query = query.populate("project", "_id name");
    const doc = await query;
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findOne(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = {};
        if (filter._id) where.id = this.toIdString(filter._id);
        if (filter.id) where.id = this.toIdString(filter.id);
        if (filter.organization) where.organizationId = this.toIdString(filter.organization);
        if (filter.organizationId) where.organizationId = this.toIdString(filter.organizationId);
        if (filter.project) where.projectId = this.toIdString(filter.project);
        if (filter.projectId) where.projectId = this.toIdString(filter.projectId);
        if (filter.status) where.status = filter.status === "in-progress" ? "in_progress" : filter.status;
        if (filter.deleted !== undefined) where.deleted = Boolean(filter.deleted);
        if (filter.isDeleted !== undefined) where.deleted = Boolean(filter.isDeleted);
        if (filter.provider) where.provider = filter.provider;
        if (filter.asanaTaskId) where.asanaTaskId = filter.asanaTaskId;
        if (filter.jiraIssueId) where.jiraIssueId = filter.jiraIssueId;
        if (filter.jiraIssueKey) where.jiraIssueKey = filter.jiraIssueKey;
        if (filter.assignedTo !== undefined) {
          where.assignedToId = this._processIdFilter(filter.assignedTo, "assignedTo");
        } else if (filter.assignedToId !== undefined) {
          where.assignedToId = this._processIdFilter(filter.assignedToId, "assignedToId");
        }

        const include = {};
        if (hasPopulate("assignedTo", options)) include.assignedTo = true;
        if (hasPopulate("project", options)) include.project = true;
        if (hasPopulate("deletedBy", options)) include.deletedBy = true;
        if (hasPopulate("assignedBy", options)) include.assignedBy = true;

        const queryOptions = { where };
        if (Object.keys(include).length > 0) queryOptions.include = include;

        const doc = await this.delegate.findFirst(queryOptions);
        const formatted = this.formatTask(doc);
        return applyPopulateProjections(formatted, options);
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.findOne(filter);
    if (options.populate) {
      const popList = Array.isArray(options.populate) ? options.populate : [options.populate];
      for (const pop of popList) {
        if (typeof pop === "string") query = query.populate(pop);
        else if (pop && pop.path) query = query.populate(pop.path, pop.select);
      }
    }
    if (options.populateDeletedBy) query = query.populate("deletedBy", "firstName lastName");
    if (options.populateAssignedTo) query = query.populate("assignedTo", "firstName lastName email avatar");
    if (options.populateProject) query = query.populate("project", "_id name");
    const doc = await query;
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = {};
        if (filter.organization) where.organizationId = this.toIdString(filter.organization);
        if (filter.organizationId) where.organizationId = this.toIdString(filter.organizationId);
        if (filter.project) where.projectId = this.toIdString(filter.project);
        if (filter.projectId) where.projectId = this.toIdString(filter.projectId);
        if (filter.status) where.status = filter.status === "in-progress" ? "in_progress" : filter.status;
        if (filter.deleted !== undefined) where.deleted = Boolean(filter.deleted);
        if (filter.isDeleted !== undefined) where.deleted = Boolean(filter.isDeleted);
        if (filter.provider) where.provider = filter.provider;
        if (filter.asanaTaskId) where.asanaTaskId = filter.asanaTaskId;
        if (filter.jiraIssueId) where.jiraIssueId = filter.jiraIssueId;
        if (filter.jiraIssueKey) where.jiraIssueKey = filter.jiraIssueKey;
        if (filter.assignedTo) {
          if (filter.assignedTo.$in && Array.isArray(filter.assignedTo.$in)) {
            where.assignedToId = { in: filter.assignedTo.$in.map((id) => this.toIdString(id)).filter(Boolean) };
          } else {
            where.assignedToId = this.toIdString(filter.assignedTo);
          }
        }
        if (filter._id) {
          if (filter._id.$in) {
            where.id = { in: filter._id.$in.map((id) => this.toIdString(id)).filter(Boolean) };
          } else {
            where.id = this.toIdString(filter._id);
          }
        }
        if (filter.id) {
          if (filter.id.$in) {
            where.id = { in: filter.id.$in.map((id) => this.toIdString(id)).filter(Boolean) };
          } else {
            where.id = this.toIdString(filter.id);
          }
        }

        const include = {};
        if (hasPopulate("assignedTo", options)) include.assignedTo = true;
        if (hasPopulate("project", options)) include.project = true;
        if (hasPopulate("deletedBy", options)) include.deletedBy = true;
        if (hasPopulate("assignedBy", options)) include.assignedBy = true;

        const queryOptions = { where };
        if (Object.keys(include).length > 0) queryOptions.include = include;

        const orderBy = buildOrderBy(options.sort);
        if (orderBy) {
          queryOptions.orderBy = orderBy;
        }

        const skip = options.skip !== undefined ? Number(options.skip) : options.offset !== undefined ? Number(options.offset) : undefined;
        if (typeof skip === "number" && !isNaN(skip) && skip >= 0) {
          queryOptions.skip = skip;
        }

        const take = options.limit !== undefined ? Number(options.limit) : options.take !== undefined ? Number(options.take) : undefined;
        if (typeof take === "number" && !isNaN(take) && take >= 0) {
          queryOptions.take = take;
        }

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => applyPopulateProjections(this.formatTask(d), options));
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.find(filter);
    if (options.populate) {
      const popList = Array.isArray(options.populate) ? options.populate : [options.populate];
      for (const pop of popList) {
        if (typeof pop === "string") query = query.populate(pop);
        else if (pop && pop.path) query = query.populate(pop.path, pop.select);
      }
    }
    if (options.populateDeletedBy) query = query.populate("deletedBy", "firstName lastName");
    if (options.populateAssignedTo) query = query.populate("assignedTo", "firstName lastName email avatar");
    if (options.populateProject) query = query.populate("project", "_id name");
    if (options.sort) query = query.sort(options.sort);
    if (typeof options.skip === "number") query = query.skip(options.skip);
    if (typeof options.limit === "number") query = query.limit(options.limit);
    const docs = await query;
    return docs.map((d) => this.serialize(d.toObject ? d.toObject() : d));
  }

  async countDocuments(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("TaskRepository.countDocuments requires a valid filter object");
        }
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
        const orgId = this.toIdString(data.organization || data.organizationId);
        const projId = this.toIdString(data.project || data.projectId);
        const assignedToId = this.toIdString(data.assignedTo || data.assignedToId);
        const assignedById = this.toIdString(data.assignedBy || data.assignedById);
        const newId = data._id ? this.toIdString(data._id) : generateId();

        const createData = {
          id: newId,
          title: data.title,
          description: data.description || null,
          status: data.status === "in-progress" ? "in_progress" : (data.status || "todo"),
          priority: data.priority || "medium",
          organizationId: orgId,
          projectId: projId || null,
          assignedToId: assignedToId || null,
          assignedById: assignedById || null,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          deleted: Boolean(data.deleted || data.isDeleted),
          provider: data.provider || "local",
          jiraIssueId: data.jiraIssueId || null,
          jiraIssueKey: data.jiraIssueKey || null,
          asanaTaskId: data.asanaTaskId || null,
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatTask(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.create(data);
    return this.serialize(doc.toObject ? doc.toObject() : doc);
  }

  buildInclude(options = {}) {
    const include = {};
    if (hasPopulate("assignedTo", options)) include.assignedTo = true;
    if (hasPopulate("project", options)) include.project = true;
    if (hasPopulate("deletedBy", options)) include.deletedBy = true;
    if (hasPopulate("assignedBy", options)) include.assignedBy = true;
    return Object.keys(include).length > 0 ? include : undefined;
  }

  async findOneAndUpdate(filter, updateData, options = { new: true }) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("TaskRepository.findOneAndUpdate requires a valid filter object");
    }
    if (!updateData || typeof updateData !== "object" || Array.isArray(updateData)) {
      throw new Error("TaskRepository.findOneAndUpdate requires a valid update object");
    }

    if (isPostgres()) {
      try {
        for (const key of Object.keys(updateData)) {
          if (key.startsWith("$") && key !== "$set") {
            throw new Error(`Unsupported update operator in TaskRepository: ${key}`);
          }
        }

        if (updateData.$set !== undefined) {
          if (!updateData.$set || typeof updateData.$set !== "object" || Array.isArray(updateData.$set)) {
            throw new Error("Invalid $set envelope in TaskRepository.findOneAndUpdate");
          }
          for (const key of Object.keys(updateData.$set)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in TaskRepository: ${key}`);
            }
          }
        }

        const directFields = { ...updateData };
        delete directFields.$set;
        const setFields = updateData.$set || {};

        for (const key of Object.keys(setFields)) {
          if (directFields[key] !== undefined) {
            const isMatch = (valA, valB) => {
              if (valA === valB) return true;
              if (valA instanceof Date || valB instanceof Date) {
                const tA = new Date(valA).getTime();
                const tB = new Date(valB).getTime();
                return !isNaN(tA) && !isNaN(tB) && tA === tB;
              }
              return JSON.stringify(valA) === JSON.stringify(valB);
            };
            if (!isMatch(directFields[key], setFields[key])) {
              throw new Error(`Conflicting update values for field '${key}' between direct payload and $set envelope`);
            }
          }
        }

        const rawPayload = { ...directFields, ...setFields };

        const ALLOWED_UPDATE_FIELDS = new Set([
          "title",
          "description",
          "status",
          "priority",
          "project",
          "projectId",
          "assignedTo",
          "assignedToId",
          "assignedBy",
          "assignedById",
          "dueDate",
          "deleted",
          "isDeleted",
          "deletedAt",
          "deletedBy",
          "deletedById",
          "provider",
          "jiraIssueId",
          "jiraIssueKey",
          "asanaTaskId",
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
            throw new Error(`Unsupported update field in TaskRepository: ${key}`);
          }
        }

        // Detect conflicting aliases
        if (rawPayload._id !== undefined && rawPayload.id !== undefined) {
          if (this.toIdString(rawPayload._id) !== this.toIdString(rawPayload.id)) {
            throw new Error("Conflicting update values for '_id' and 'id' in TaskRepository");
          }
        }
        if (rawPayload.organization !== undefined && rawPayload.organizationId !== undefined) {
          if (this.toIdString(rawPayload.organization) !== this.toIdString(rawPayload.organizationId)) {
            throw new Error("Conflicting update values for 'organization' and 'organizationId' in TaskRepository");
          }
        }
        if (rawPayload.project !== undefined && rawPayload.projectId !== undefined) {
          if (this.toIdString(rawPayload.project) !== this.toIdString(rawPayload.projectId)) {
            throw new Error("Conflicting update values for 'project' and 'projectId' in TaskRepository");
          }
        }
        if (rawPayload.assignedTo !== undefined && rawPayload.assignedToId !== undefined) {
          if (this.toIdString(rawPayload.assignedTo) !== this.toIdString(rawPayload.assignedToId)) {
            throw new Error("Conflicting update values for 'assignedTo' and 'assignedToId' in TaskRepository");
          }
        }
        if (rawPayload.assignedBy !== undefined && rawPayload.assignedById !== undefined) {
          if (this.toIdString(rawPayload.assignedBy) !== this.toIdString(rawPayload.assignedById)) {
            throw new Error("Conflicting update values for 'assignedBy' and 'assignedById' in TaskRepository");
          }
        }
        if (rawPayload.deletedBy !== undefined && rawPayload.deletedById !== undefined) {
          if (this.toIdString(rawPayload.deletedBy) !== this.toIdString(rawPayload.deletedById)) {
            throw new Error("Conflicting update values for 'deletedBy' and 'deletedById' in TaskRepository");
          }
        }
        if (rawPayload.deleted !== undefined && rawPayload.isDeleted !== undefined) {
          if (Boolean(rawPayload.deleted) !== Boolean(rawPayload.isDeleted)) {
            throw new Error("Conflicting update values for 'deleted' and 'isDeleted' in TaskRepository");
          }
        }

        const existing = await this.findOne(filter, options);
        if (!existing) {
          if (options.upsert) {
            const orgVal = rawPayload.organization || rawPayload.organizationId || filter.organization || filter.organizationId;
            const orgId = this.toIdString(orgVal);
            if (!orgId) {
              throw new Error("Cannot upsert Task without valid organization");
            }
            return await this.create({
              ...filter,
              ...rawPayload,
              organizationId: orgId,
            });
          }
          return null;
        }

        const existingId = existing._id || existing.id;
        const existingOrg = existing.organizationId || existing.organization;

        // Validate immutable fields against existing
        if (rawPayload._id !== undefined && this.toIdString(rawPayload._id) !== existingId) {
          throw new Error("Cannot update immutable field: _id");
        }
        if (rawPayload.id !== undefined && this.toIdString(rawPayload.id) !== existingId) {
          throw new Error("Cannot update immutable field: id");
        }
        if (rawPayload.createdAt !== undefined) {
          const existingCreated = existing.createdAt instanceof Date ? existing.createdAt.getTime() : new Date(existing.createdAt).getTime();
          const payloadCreated = rawPayload.createdAt instanceof Date ? rawPayload.createdAt.getTime() : new Date(rawPayload.createdAt).getTime();
          if (isNaN(payloadCreated) || payloadCreated !== existingCreated) {
            throw new Error("Cannot update immutable field: createdAt");
          }
        }
        if (rawPayload.organization !== undefined && this.toIdString(rawPayload.organization) !== existingOrg) {
          throw new Error("Cannot update immutable field: organization");
        }
        if (rawPayload.organizationId !== undefined && this.toIdString(rawPayload.organizationId) !== existingOrg) {
          throw new Error("Cannot update immutable field: organizationId");
        }

        const patch = {};
        if (rawPayload.title !== undefined) {
          if (typeof rawPayload.title !== "string" || !rawPayload.title.trim()) {
            throw new Error("Invalid title in TaskRepository update");
          }
          patch.title = rawPayload.title.trim();
        }
        if (rawPayload.description !== undefined) {
          patch.description = rawPayload.description === null ? null : String(rawPayload.description);
        }
        if (rawPayload.status !== undefined) {
          if (typeof rawPayload.status !== "string" || !rawPayload.status.trim()) {
            throw new Error("Invalid status in TaskRepository update");
          }
          const s = rawPayload.status.trim();
          patch.status = s === "in-progress" ? "in_progress" : s;
        }
        if (rawPayload.priority !== undefined) {
          if (typeof rawPayload.priority !== "string" || !rawPayload.priority.trim()) {
            throw new Error("Invalid priority in TaskRepository update");
          }
          patch.priority = rawPayload.priority.trim();
        }
        if (rawPayload.deleted !== undefined || rawPayload.isDeleted !== undefined) {
          patch.deleted = Boolean(rawPayload.deleted ?? rawPayload.isDeleted);
        }
        if (rawPayload.deletedAt !== undefined) {
          patch.deletedAt = rawPayload.deletedAt ? new Date(rawPayload.deletedAt) : null;
        }
        if (rawPayload.deletedBy !== undefined || rawPayload.deletedById !== undefined) {
          const dVal = rawPayload.deletedBy ?? rawPayload.deletedById;
          patch.deletedById = dVal ? this.toIdString(dVal) : null;
        }
        if (rawPayload.dueDate !== undefined) {
          patch.dueDate = rawPayload.dueDate ? new Date(rawPayload.dueDate) : null;
        }
        if (rawPayload.assignedTo !== undefined || rawPayload.assignedToId !== undefined) {
          const aVal = rawPayload.assignedTo ?? rawPayload.assignedToId;
          patch.assignedToId = aVal ? this.toIdString(aVal) : null;
        }
        if (rawPayload.assignedBy !== undefined || rawPayload.assignedById !== undefined) {
          const abVal = rawPayload.assignedBy ?? rawPayload.assignedById;
          patch.assignedById = abVal ? this.toIdString(abVal) : null;
        }
        if (rawPayload.project !== undefined || rawPayload.projectId !== undefined) {
          const pVal = rawPayload.project ?? rawPayload.projectId;
          patch.projectId = pVal ? this.toIdString(pVal) : null;
        }
        if (rawPayload.provider !== undefined) {
          if (typeof rawPayload.provider !== "string" || !rawPayload.provider.trim()) {
            throw new Error("Invalid provider in TaskRepository update");
          }
          patch.provider = rawPayload.provider.trim();
        }
        if (rawPayload.jiraIssueId !== undefined) {
          patch.jiraIssueId = rawPayload.jiraIssueId === null ? null : String(rawPayload.jiraIssueId).trim();
        }
        if (rawPayload.jiraIssueKey !== undefined) {
          patch.jiraIssueKey = rawPayload.jiraIssueKey === null ? null : String(rawPayload.jiraIssueKey).trim();
        }
        if (rawPayload.asanaTaskId !== undefined) {
          patch.asanaTaskId = rawPayload.asanaTaskId === null ? null : String(rawPayload.asanaTaskId).trim();
        }

        // Avoid empty/ineffective updates
        if (Object.keys(patch).length === 0) {
          return existing;
        }

        const include = this.buildInclude(options);
        const updateArgs = {
          where: { id: existingId },
          data: patch,
        };
        if (include) {
          updateArgs.include = include;
        }

        const updatedDoc = await this.delegate.update(updateArgs);
        const returnOriginal = options.new === false || options.returnDocument === "before";
        if (returnOriginal) {
          return existing;
        }
        const formatted = this.formatTask(updatedDoc);
        return applyPopulateProjections(formatted, options);
      } catch (err) {
        if (err && err.code === "P2025") {
          return null;
        }
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOneAndUpdate(filter, updateData, options);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findByIdAndUpdate(id, updateData, options = { new: true }) {
    const idStr = this.toIdString(id);
    if (!idStr || typeof idStr !== "string" || !idStr.trim() || idStr === "[object Object]") {
      if (isPostgres()) {
        throw new Error("Invalid identifier in TaskRepository.findByIdAndUpdate");
      }
      return null;
    }

    if (isPostgres()) {
      return this.findOneAndUpdate({ _id: idStr }, updateData, options);
    }

    const doc = await this.mongooseModel.findByIdAndUpdate(id, updateData, options);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async updateById(id, updateData, options = { new: true }) {
    return this.findByIdAndUpdate(id, updateData, options);
  }

  async findByIdAndDelete(id, options = {}) {
    const idStr = this.toIdString(id);
    if (!idStr || typeof idStr !== "string" || !idStr.trim() || idStr === "[object Object]") {
      if (isPostgres()) {
        throw new Error("Invalid identifier in TaskRepository.findByIdAndDelete");
      }
      return null;
    }

    if (isPostgres()) {
      try {
        const existing = await this.findById(idStr, options);
        if (!existing) return null;

        await this.delegate.delete({ where: { id: idStr } });
        return existing;
      } catch (err) {
        if (err && err.code === "P2025") {
          return null;
        }
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findByIdAndDelete(id, options);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findOneAndDelete(filter, options = {}) {
    if (isPostgres()) {
      try {
        const existing = await this.findOne(filter, options);
        if (!existing) return null;

        await this.delegate.delete({ where: { id: existing.id } });
        return existing;
      } catch (err) {
        if (err && err.code === "P2025") {
          return null;
        }
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOneAndDelete(filter, options);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async deleteOne(filter) {
    if (isPostgres()) {
      try {
        const existing = await this.findOne(filter);
        if (!existing) return { acknowledged: true, deletedCount: 0 };

        await this.delegate.delete({ where: { id: existing.id } });
        return { acknowledged: true, deletedCount: 1 };
      } catch (err) {
        if (err && err.code === "P2025") {
          return { acknowledged: true, deletedCount: 0 };
        }
        this.handleError(err);
      }
    }

    return await this.mongooseModel.deleteOne(filter);
  }

  _extractAndValidateId(val, fieldName) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in TaskRepository filter for field: ${fieldName}`);
    }
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) {
        throw new Error(`Invalid identifier in TaskRepository filter for field: ${fieldName}`);
      }
      return trimmed;
    }
    if (typeof val === "object") {
      if (val._id) {
        const idStr = String(val._id).trim();
        if (!idStr) {
          throw new Error(`Invalid identifier in TaskRepository filter for field: ${fieldName}`);
        }
        return idStr;
      }
      if (val.id) {
        const idStr = String(val.id).trim();
        if (!idStr) {
          throw new Error(`Invalid identifier in TaskRepository filter for field: ${fieldName}`);
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
      throw new Error(`Invalid identifier object in TaskRepository filter: ${fieldName}`);
    }
    throw new Error(`Invalid identifier in TaskRepository filter for field: ${fieldName}`);
  }

  _processIdFilter(raw, fieldName) {
    if (raw === null || raw === undefined) {
      throw new Error(`Invalid identifier in TaskRepository filter for field: ${fieldName}`);
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
          throw new Error(`Invalid array in TaskRepository filter: ${fieldName}`);
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
          throw new Error(`Invalid array in TaskRepository filter: ${fieldName}`);
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
          throw new Error(`Unsupported filter operator in TaskRepository: ${k}`);
        }
      }
      throw new Error(`Invalid identifier object in TaskRepository filter: ${fieldName}`);
    }
    return this._extractAndValidateId(raw, fieldName);
  }

  _processDateFilter(raw, fieldName) {
    if (raw === null || raw === undefined) {
      throw new Error(`Invalid date value in TaskRepository filter: ${fieldName}`);
    }

    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed) {
        throw new Error(`Invalid date string in TaskRepository filter: ${fieldName}`);
      }
      const parsed = new Date(trimmed);
      if (isNaN(parsed.getTime())) {
        throw new Error(`Invalid date string in TaskRepository filter: ${fieldName}`);
      }
      return parsed;
    }

    if (raw instanceof Date) {
      if (isNaN(raw.getTime())) {
        throw new Error(`Invalid date value in TaskRepository filter: ${fieldName}`);
      }
      return raw;
    }

    if (typeof raw === "object") {
      const keys = Object.keys(raw);
      if (keys.length === 0) {
        throw new Error(`Invalid date range in TaskRepository filter: ${fieldName} cannot be an empty object`);
      }

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

      for (const op of keys) {
        if (!ALLOWED_DATE_OPERATORS.has(op)) {
          if (op.startsWith("$")) {
            throw new Error(`Unsupported filter operator in TaskRepository: ${op}`);
          }
          throw new Error(`Unsupported date range operator in TaskRepository: ${op}`);
        }
      }

      const dateCond = {};
      const parseDate = (val, op) => {
        if (val === null || val === undefined || (typeof val === "string" && !val.trim())) {
          throw new Error(`Invalid date value for operator ${op} in TaskRepository filter: ${fieldName}`);
        }
        const parsed = val instanceof Date ? val : new Date(val);
        if (isNaN(parsed.getTime())) {
          throw new Error(`Invalid date value for operator ${op} in TaskRepository filter: ${fieldName}`);
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
        throw new Error("Invalid date range in TaskRepository filter: lower bound cannot be after upper bound");
      }

      return dateCond;
    }

    if (typeof raw === "number" && !isNaN(raw)) {
      const parsed = new Date(raw);
      if (!isNaN(parsed.getTime())) return parsed;
    }

    throw new Error(`Invalid date value in TaskRepository filter: ${fieldName}`);
  }

  buildWhere(filter = {}) {
    const where = {};

    for (const key of Object.keys(filter || {})) {
      if (key.startsWith("$") && key !== "$or") {
        throw new Error(`Unsupported filter operator in TaskRepository: ${key}`);
      }
      if (!ALLOWED_TASK_FILTER_FIELDS.has(key)) {
        throw new Error(`Unsupported filter field in TaskRepository: ${key}`);
      }

      const val = filter[key];

      switch (key) {
        case "_id":
        case "id": {
          const processed = this._processIdFilter(val, key);
          if (where.id !== undefined) {
            const existingStr = typeof where.id === "string" ? where.id : JSON.stringify(where.id);
            const newStr = typeof processed === "string" ? processed : JSON.stringify(processed);
            if (existingStr !== newStr) {
              throw new Error("Conflicting id filters in TaskRepository");
            }
          }
          where.id = processed;
          break;
        }

        case "organization":
        case "organizationId": {
          const processed = this._processIdFilter(val, key);
          if (where.organizationId !== undefined) {
            const existingStr = typeof where.organizationId === "string" ? where.organizationId : JSON.stringify(where.organizationId);
            const newStr = typeof processed === "string" ? processed : JSON.stringify(processed);
            if (existingStr !== newStr) {
              throw new Error("Conflicting organization filters in TaskRepository");
            }
          }
          where.organizationId = processed;
          break;
        }

        case "project":
        case "projectId": {
          const processed = this._processIdFilter(val, key);
          if (where.projectId !== undefined) {
            const existingStr = typeof where.projectId === "string" ? where.projectId : JSON.stringify(where.projectId);
            const newStr = typeof processed === "string" ? processed : JSON.stringify(processed);
            if (existingStr !== newStr) {
              throw new Error("Conflicting project filters in TaskRepository");
            }
          }
          where.projectId = processed;
          break;
        }

        case "assignedTo":
        case "assignedToId": {
          const processed = this._processIdFilter(val, key);
          if (where.assignedToId !== undefined) {
            const existingStr = typeof where.assignedToId === "string" ? where.assignedToId : JSON.stringify(where.assignedToId);
            const newStr = typeof processed === "string" ? processed : JSON.stringify(processed);
            if (existingStr !== newStr) {
              throw new Error("Conflicting assignment filters in TaskRepository");
            }
          }
          where.assignedToId = processed;
          break;
        }

        case "title":
          if (typeof val !== "string" || !val.trim()) {
            throw new Error("Invalid title in TaskRepository filter");
          }
          where.title = val.trim();
          break;

        case "status":
          if (typeof val !== "string" || !val.trim()) {
            throw new Error("Invalid status in TaskRepository filter");
          }
          const s = val.trim();
          where.status = s === "in-progress" ? "in_progress" : s;
          break;

        case "provider":
          if (typeof val !== "string" || !val.trim()) {
            throw new Error("Invalid provider in TaskRepository filter");
          }
          where.provider = val.trim();
          break;

        case "deleted":
        case "isDeleted": {
          const boolVal = Boolean(val);
          if (where.deleted !== undefined && where.deleted !== boolVal) {
            throw new Error("Conflicting deleted filters in TaskRepository");
          }
          where.deleted = boolVal;
          break;
        }

        case "jiraIssueId":
          if (typeof val !== "string" || !val.trim()) {
            throw new Error("Invalid jiraIssueId in TaskRepository filter");
          }
          where.jiraIssueId = val.trim();
          break;

        case "jiraIssueKey":
          if (typeof val !== "string" || !val.trim()) {
            throw new Error("Invalid jiraIssueKey in TaskRepository filter");
          }
          where.jiraIssueKey = val.trim();
          break;

        case "asanaTaskId":
          if (typeof val !== "string" || !val.trim()) {
            throw new Error("Invalid asanaTaskId in TaskRepository filter");
          }
          where.asanaTaskId = val.trim();
          break;

        case "createdAt":
          where.createdAt = this._processDateFilter(val, key);
          break;

        case "updatedAt":
          where.updatedAt = this._processDateFilter(val, key);
          break;

        case "$or": {
          if (!Array.isArray(val) || val.length === 0) {
            throw new Error("Invalid $or in TaskRepository filter: expected non-empty array");
          }

          const isNullProjectClause = (cond) => {
            if (!cond || typeof cond !== "object" || Array.isArray(cond)) return false;
            const keys = Object.keys(cond);
            if (keys.length !== 1) return false;
            const k = keys[0];
            if (k !== "project" && k !== "projectId") return false;
            const v = cond[k];
            if (v === null) return true;
            if (v && typeof v === "object" && !Array.isArray(v)) {
              if (v.$exists === false || v.exists === false) return true;
            }
            return false;
          };

          const allNullProject = val.every(isNullProjectClause);
          if (allNullProject) {
            if (where.projectId !== undefined && where.projectId !== null) {
              throw new Error("Conflicting project filters in TaskRepository");
            }
            where.projectId = null;
          } else {
            where.OR = val.map((clause, idx) => {
              if (!clause || typeof clause !== "object" || Array.isArray(clause)) {
                throw new Error(`Invalid clause in TaskRepository $or at index ${idx}: expected object`);
              }
              if (Object.keys(clause).length === 0) {
                throw new Error(`Invalid clause in TaskRepository $or at index ${idx}: empty object`);
              }
              if (isNullProjectClause(clause)) {
                return { projectId: null };
              }
              return this.buildWhere(clause);
            });
          }
          break;
        }
      }
    }

    return where;
  }

  async deleteMany(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("TaskRepository.deleteMany requires a valid filter object");
        }
        if (filter.$or !== undefined) {
          throw new Error("Unsupported filter operator in TaskRepository: $or");
        }

        const where = this.buildWhere(filter);
        if (Object.keys(where).length === 0) {
          throw new Error("Bulk deletion requires a valid scoped filter in TaskRepository.deleteMany");
        }

        const res = await this.delegate.deleteMany({ where });
        return { acknowledged: true, deletedCount: res.count };
      } catch (err) {
        this.handleError(err);
      }
    }

    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("TaskRepository.deleteMany requires a valid filter object");
    }
    return await this.mongooseModel.deleteMany(filter, options);
  }

  async distinct(field, filter = {}) {
    if (isPostgres()) {
      try {
        const where = {};
        if (filter.organization) where.organizationId = this.toIdString(filter.organization);
        if (filter.organizationId) where.organizationId = this.toIdString(filter.organizationId);
        if (filter.project) where.projectId = this.toIdString(filter.project);
        if (filter.projectId) where.projectId = this.toIdString(filter.projectId);
        if (filter.deleted !== undefined) where.deleted = Boolean(filter.deleted);
        if (filter.isDeleted !== undefined) where.deleted = Boolean(filter.isDeleted);
        if (filter.assignedTo) {
          if (filter.assignedTo.$in) {
            where.assignedToId = { in: filter.assignedTo.$in.map((id) => this.toIdString(id)).filter(Boolean) };
          } else {
            where.assignedToId = this.toIdString(filter.assignedTo);
          }
        }
        if (filter.assignedToId) {
          if (filter.assignedToId.$in) {
            where.assignedToId = { in: filter.assignedToId.$in.map((id) => this.toIdString(id)).filter(Boolean) };
          } else {
            where.assignedToId = this.toIdString(filter.assignedToId);
          }
        }

        const fieldMap = {
          project: "projectId",
          projectId: "projectId",
          assignedTo: "assignedToId",
          assignedToId: "assignedToId",
        };
        const prismaField = fieldMap[field] || field;

        const results = await this.delegate.findMany({
          where,
          select: { [prismaField]: true },
          distinct: [prismaField],
        });

        return results.map((r) => r[prismaField]).filter(Boolean);
      } catch (err) {
        this.handleError(err);
      }
    }

    return await this.mongooseModel.distinct(field, filter);
  }

  async updateMany(filter = {}, updateData = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("TaskRepository.updateMany requires a valid filter object");
        }
        if (!updateData || typeof updateData !== "object" || Array.isArray(updateData)) {
          throw new Error("TaskRepository.updateMany requires a valid update object");
        }

        for (const k of Object.keys(updateData)) {
          if (k.startsWith("$") && k !== "$set" && k !== "$unset") {
            throw new Error(`Unsupported update operator in TaskRepository.updateMany: ${k}`);
          }
        }

        const where = this.buildWhere(filter);

        const patch = {};
        const setObj = (updateData.$set && typeof updateData.$set === "object" && !Array.isArray(updateData.$set)) ? updateData.$set : {};
        const directObj = {};
        for (const [k, v] of Object.entries(updateData)) {
          if (!k.startsWith("$")) directObj[k] = v;
        }
        const data = { ...directObj, ...setObj };

        if (data.deleted !== undefined || data.isDeleted !== undefined) {
          patch.deleted = Boolean(data.deleted ?? data.isDeleted);
        }
        if (data.deletedAt !== undefined) {
          patch.deletedAt = data.deletedAt ? new Date(data.deletedAt) : null;
        }
        if (data.deletedBy !== undefined) patch.deletedById = this.toIdString(data.deletedBy);
        if (data.deletedById !== undefined) patch.deletedById = this.toIdString(data.deletedById);
        if (data.status !== undefined) {
          patch.status = data.status === "in-progress" ? "in_progress" : data.status;
        }
        if (data.project !== undefined) {
          patch.projectId = data.project ? this.toIdString(data.project) : null;
        }
        if (data.projectId !== undefined) {
          patch.projectId = data.projectId ? this.toIdString(data.projectId) : null;
        }
        if (data.assignedTo !== undefined) {
          patch.assignedToId = data.assignedTo ? this.toIdString(data.assignedTo) : null;
        }
        if (data.assignedToId !== undefined) {
          patch.assignedToId = data.assignedToId ? this.toIdString(data.assignedToId) : null;
        }
        if (data.assignedBy !== undefined) {
          patch.assignedById = data.assignedBy ? this.toIdString(data.assignedBy) : null;
        }
        if (data.assignedById !== undefined) {
          patch.assignedById = data.assignedById ? this.toIdString(data.assignedById) : null;
        }
        if (data.title !== undefined) patch.title = data.title;
        if (data.description !== undefined) patch.description = data.description;
        if (data.priority !== undefined) patch.priority = data.priority;
        if (data.dueDate !== undefined) {
          patch.dueDate = data.dueDate ? new Date(data.dueDate) : null;
        }
        if (data.provider !== undefined) patch.provider = data.provider;
        if (data.jiraIssueId !== undefined) patch.jiraIssueId = data.jiraIssueId;
        if (data.jiraIssueKey !== undefined) patch.jiraIssueKey = data.jiraIssueKey;
        if (data.asanaTaskId !== undefined) patch.asanaTaskId = data.asanaTaskId;

        if (updateData.$unset && typeof updateData.$unset === "object" && !Array.isArray(updateData.$unset)) {
          if (updateData.$unset.project !== undefined || updateData.$unset.projectId !== undefined) {
            patch.projectId = null;
          }
          if (updateData.$unset.assignedTo !== undefined || updateData.$unset.assignedToId !== undefined) {
            patch.assignedToId = null;
          }
          if (updateData.$unset.deletedBy !== undefined || updateData.$unset.deletedById !== undefined) {
            patch.deletedById = null;
          }
          if (updateData.$unset.deletedAt !== undefined) {
            patch.deletedAt = null;
          }
          if (updateData.$unset.dueDate !== undefined) {
            patch.dueDate = null;
          }
          if (updateData.$unset.jiraIssueId !== undefined) {
            patch.jiraIssueId = null;
          }
          if (updateData.$unset.jiraIssueKey !== undefined) {
            patch.jiraIssueKey = null;
          }
          if (updateData.$unset.asanaTaskId !== undefined) {
            patch.asanaTaskId = null;
          }
          if (updateData.$unset.description !== undefined) {
            patch.description = null;
          }
        }

        if (Object.keys(patch).length === 0) {
          return { acknowledged: true, modifiedCount: 0 };
        }

        const res = await this.delegate.updateMany({ where, data: patch });
        return { acknowledged: true, modifiedCount: res.count };
      } catch (err) {
        this.handleError(err);
      }
    }

    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("TaskRepository.updateMany requires a valid filter object");
    }
    return await this.mongooseModel.updateMany(filter, updateData);
  }
}

export const taskRepository = new TaskRepository();
export default taskRepository;
