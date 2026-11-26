import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

export class ProjectRepository extends BaseRepository {
  constructor() {
    super("Project");
  }

  hasPopulate(name, options = {}) {
    if (!options) return false;
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    if (options[`populate${cap}`]) return true;

    // Check alias flags
    if ((name === "users" || name === "user") && (options.populateUsers || options.populateUser)) {
      return true;
    }

    if (!options.populate) return false;
    if (options.populate === true) return true;

    const checkMatch = (target) => {
      if (typeof target !== "string") return false;
      const t = target.trim();
      if (name === "users" || name === "user") {
        return t === "users" || t === "user";
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
    if (this.hasPopulate("users", options)) {
      return {
        members: {
          include: {
            user: true,
          },
        },
      };
    }
    return {
      members: true,
    };
  }

  formatUserRelation(userDoc) {
    if (!userDoc || typeof userDoc !== "object") return null;
    const serialized = this.serialize(userDoc);
    if (!serialized._id && serialized.id) serialized._id = String(serialized.id);
    if (!serialized.id && serialized._id) serialized.id = String(serialized._id);
    if (!serialized.name && (serialized.firstName || serialized.lastName)) {
      serialized.name = `${serialized.firstName || ""} ${serialized.lastName || ""}`.trim();
    }
    delete serialized.password;
    delete serialized.passwordHash;
    delete serialized.twoFactorCode;
    delete serialized.twoFactorExpires;
    delete serialized.verificationToken;
    delete serialized.verificationTokenExpire;
    delete serialized.resetToken;
    delete serialized.resetTokenExpire;
    delete serialized.googleId;
    delete serialized.microsoftId;
    delete serialized.appleId;
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
        if ((path === "users" || path === "user") && pop.select && typeof pop.select === "string") {
          if (Array.isArray(doc.users)) {
            for (const u of doc.users) {
              if (u && typeof u === "object") {
                this.applyRelationProjection(u, pop.select);
              }
            }
          }
        }
      }
    }
    return doc;
  }

  buildOrderBy(sort) {
    if (!sort) return undefined;
    if (typeof sort === "string") {
      const parts = sort.trim().split(/\s+/);
      const orderBy = {};
      for (const part of parts) {
        if (part.startsWith("-")) {
          const f = part.slice(1);
          const prismaField = f === "_id" ? "id" : f === "organization" ? "organizationId" : f === "createdBy" ? "createdById" : f;
          orderBy[prismaField] = "desc";
        } else if (part.startsWith("+")) {
          const f = part.slice(1);
          const prismaField = f === "_id" ? "id" : f === "organization" ? "organizationId" : f === "createdBy" ? "createdById" : f;
          orderBy[prismaField] = "asc";
        } else {
          const prismaField = part === "_id" ? "id" : part === "organization" ? "organizationId" : part === "createdBy" ? "createdById" : part;
          orderBy[prismaField] = "asc";
        }
      }
      return Object.keys(orderBy).length > 0 ? orderBy : undefined;
    }
    if (Array.isArray(sort)) {
      const orderBy = {};
      for (const item of sort) {
        if (typeof item === "string") {
          const f = item.startsWith("-") || item.startsWith("+") ? item.slice(1) : item;
          const dir = item.startsWith("-") ? "desc" : "asc";
          const prismaField = f === "_id" ? "id" : f === "organization" ? "organizationId" : f === "createdBy" ? "createdById" : f;
          orderBy[prismaField] = dir;
        } else if (Array.isArray(item) && item.length >= 2) {
          const [key, val] = item;
          const prismaField = key === "_id" ? "id" : key === "organization" ? "organizationId" : key === "createdBy" ? "createdById" : key;
          orderBy[prismaField] = (val === -1 || val === "desc" || val === "descending") ? "desc" : "asc";
        } else if (item && typeof item === "object") {
          for (const [key, val] of Object.entries(item)) {
            const prismaField = key === "_id" ? "id" : key === "organization" ? "organizationId" : key === "createdBy" ? "createdById" : key;
            orderBy[prismaField] = (val === -1 || val === "desc" || val === "descending") ? "desc" : "asc";
          }
        }
      }
      return Object.keys(orderBy).length > 0 ? orderBy : undefined;
    }
    if (typeof sort === "object") {
      const orderBy = {};
      for (const [key, val] of Object.entries(sort)) {
        const prismaField = key === "_id" ? "id" : key === "organization" ? "organizationId" : key === "createdBy" ? "createdById" : key;
        if (val === -1 || val === "desc" || val === "descending") {
          orderBy[prismaField] = "desc";
        } else if (val === 1 || val === "asc" || val === "ascending") {
          orderBy[prismaField] = "asc";
        }
      }
      return Object.keys(orderBy).length > 0 ? orderBy : undefined;
    }
    return undefined;
  }

  formatProject(doc, options = {}) {
    if (!doc) return null;
    const serialized = this.serialize(doc);

    serialized.organization = serialized.organization || serialized.organizationId;
    delete serialized.organizationId;

    serialized.createdBy = serialized.createdBy || serialized.createdById || null;
    delete serialized.createdById;

    const isUsersPopulated = this.hasPopulate("users", options);

    // Rehydrate users array from members
    if (doc.members && Array.isArray(doc.members)) {
      if (isUsersPopulated) {
        serialized.users = doc.members
          .map((pu) => {
            if (pu && pu.user && typeof pu.user === "object") {
              return this.formatUserRelation(pu.user);
            }
            return null;
          })
          .filter(Boolean);
      } else {
        serialized.users = doc.members
          .map((pu) => (pu ? (pu.userId || (pu.user && (pu.user.id || pu.user._id)) || null) : null))
          .filter(Boolean);
      }
    } else if (Array.isArray(doc.users)) {
      if (isUsersPopulated) {
        serialized.users = doc.users
          .map((u) => (u && typeof u === "object" ? this.formatUserRelation(u) : null))
          .filter(Boolean);
      } else {
        serialized.users = doc.users
          .map((u) => (u && typeof u === "object" ? (u._id || u.id) : u))
          .filter(Boolean);
      }
    } else if (!serialized.users) {
      serialized.users = [];
    }
    delete serialized.members;

    // Ensure teams is an array
    if (!Array.isArray(serialized.teams)) {
      serialized.teams = [];
    }

    if (serialized.jiraProjectId === null) delete serialized.jiraProjectId;
    if (serialized.jiraProjectKey === null) delete serialized.jiraProjectKey;
    if (serialized.asanaProjectId === null) delete serialized.asanaProjectId;
    if (serialized.asanaWebhookId === null) delete serialized.asanaWebhookId;

    if (options && options.populate) {
      this.applyPopulateProjections(serialized, options);
    }

    return serialized;
  }

  _extractAndValidateId(val, fieldName) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in ProjectRepository filter for field: ${fieldName}`);
    }

    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) {
        throw new Error(`Invalid identifier in ProjectRepository filter for field: ${fieldName}`);
      }
      return trimmed;
    }

    if (typeof val === "object") {
      const candidate = val._id || val.id;
      if (candidate) {
        if (typeof candidate === "string" && candidate.trim()) {
          return candidate.trim();
        }
        if (typeof candidate.toHexString === "function") {
          return candidate.toHexString();
        }
        if (typeof candidate.toString === "function" && candidate.toString !== Object.prototype.toString) {
          const str = candidate.toString().trim();
          if (str && str !== "[object Object]") return str;
        }
      }
      if (typeof val.toHexString === "function") {
        return val.toHexString();
      }
      if (typeof val.toString === "function" && val.toString !== Object.prototype.toString) {
        const str = val.toString().trim();
        if (str && str !== "[object Object]") return str;
      }
      for (const k of Object.keys(val)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in ProjectRepository: ${k}`);
        }
      }
      throw new Error(`Invalid identifier object in ProjectRepository filter: ${fieldName}`);
    }

    const str = String(val).trim();
    if (str && str !== "[object Object]") {
      return str;
    }
    throw new Error(`Invalid identifier in ProjectRepository filter for field: ${fieldName}`);
  }

  _processIdFilter(val, fieldName = "_id") {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in ProjectRepository filter for field: ${fieldName}`);
    }

    if (Array.isArray(val)) {
      if (val.length === 0) return { in: [] };
      return { in: val.map((item) => this._extractAndValidateId(item, fieldName)) };
    }

    if (typeof val === "object") {
      if (val.$in !== undefined) {
        if (!Array.isArray(val.$in)) {
          throw new Error(`Invalid array in ProjectRepository filter: ${fieldName}`);
        }
        if (val.$in.length === 0) return { in: [] };
        return { in: val.$in.map((item) => this._extractAndValidateId(item, fieldName)) };
      }
      if (val.in !== undefined) {
        if (!Array.isArray(val.in)) {
          throw new Error(`Invalid array in ProjectRepository filter: ${fieldName}`);
        }
        if (val.in.length === 0) return { in: [] };
        return { in: val.in.map((item) => this._extractAndValidateId(item, fieldName)) };
      }
      const candidate = val._id || val.id;
      if (candidate) {
        return this._extractAndValidateId(candidate, fieldName);
      }
      for (const k of Object.keys(val)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in ProjectRepository: ${k}`);
        }
      }
      throw new Error(`Invalid identifier object in ProjectRepository filter: ${fieldName}`);
    }

    return this._extractAndValidateId(val, fieldName);
  }

  _buildUsersFilter(val, fieldName = "users") {
    if (val === null || val === undefined) {
      throw new Error(`Invalid user filter in ProjectRepository: ${fieldName}`);
    }

    if (Array.isArray(val)) {
      if (val.length === 0) return { some: { userId: { in: [] } } };
      const ids = val.map((item) => this._extractAndValidateId(item, fieldName));
      return { some: { userId: { in: ids } } };
    }

    if (typeof val === "object") {
      if (val.$in !== undefined) {
        if (!Array.isArray(val.$in)) {
          throw new Error(`Invalid array in ProjectRepository filter: ${fieldName}`);
        }
        if (val.$in.length === 0) return { some: { userId: { in: [] } } };
        const ids = val.$in.map((item) => this._extractAndValidateId(item, fieldName));
        return { some: { userId: { in: ids } } };
      }
      if (val.in !== undefined) {
        if (!Array.isArray(val.in)) {
          throw new Error(`Invalid array in ProjectRepository filter: ${fieldName}`);
        }
        if (val.in.length === 0) return { some: { userId: { in: [] } } };
        const ids = val.in.map((item) => this._extractAndValidateId(item, fieldName));
        return { some: { userId: { in: ids } } };
      }
      const candidate = val._id || val.id;
      if (candidate) {
        const uid = this._extractAndValidateId(candidate, fieldName);
        return { some: { userId: uid } };
      }
      for (const k of Object.keys(val)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in ProjectRepository: ${k}`);
        }
      }
      throw new Error(`Invalid identifier object in ProjectRepository filter: ${fieldName}`);
    }

    const uid = this._extractAndValidateId(val, fieldName);
    return { some: { userId: uid } };
  }

  _buildTeamsFilter(val, fieldName = "teams") {
    if (val === null || val === undefined) {
      throw new Error(`Invalid team filter in ProjectRepository: ${fieldName}`);
    }

    if (Array.isArray(val)) {
      if (val.length === 0) return { hasSome: [] };
      const ids = val.map((item) => this._extractAndValidateId(item, fieldName));
      return { hasSome: ids };
    }

    if (typeof val === "object") {
      if (val.$in !== undefined) {
        if (!Array.isArray(val.$in)) {
          throw new Error(`Invalid array in ProjectRepository filter: ${fieldName}`);
        }
        if (val.$in.length === 0) return { hasSome: [] };
        const ids = val.$in.map((item) => this._extractAndValidateId(item, fieldName));
        return { hasSome: ids };
      }
      if (val.in !== undefined) {
        if (!Array.isArray(val.in)) {
          throw new Error(`Invalid array in ProjectRepository filter: ${fieldName}`);
        }
        if (val.in.length === 0) return { hasSome: [] };
        const ids = val.in.map((item) => this._extractAndValidateId(item, fieldName));
        return { hasSome: ids };
      }
      if (val.has !== undefined) {
        const tid = this._extractAndValidateId(val.has, fieldName);
        return { has: tid };
      }
      if (val.hasSome !== undefined) {
        if (!Array.isArray(val.hasSome)) {
          throw new Error(`Invalid array in ProjectRepository filter: ${fieldName}`);
        }
        if (val.hasSome.length === 0) return { hasSome: [] };
        const ids = val.hasSome.map((item) => this._extractAndValidateId(item, fieldName));
        return { hasSome: ids };
      }
      const candidate = val._id || val.id;
      if (candidate) {
        const tid = this._extractAndValidateId(candidate, fieldName);
        return { has: tid };
      }
      for (const k of Object.keys(val)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in ProjectRepository: ${k}`);
        }
      }
      throw new Error(`Invalid identifier object in ProjectRepository filter: ${fieldName}`);
    }

    const tid = this._extractAndValidateId(val, fieldName);
    return { has: tid };
  }

  _buildClauseWhere(clause, topOrgId = null) {
    if (!clause || typeof clause !== "object" || Array.isArray(clause)) {
      throw new Error("Invalid clause in ProjectRepository $or filter: expected object");
    }

    const clauseWhere = {};

    for (const key of Object.keys(clause)) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in ProjectRepository clause: ${key}`);
      }
    }

    if (clause._id !== undefined) {
      clauseWhere.id = this._processIdFilter(clause._id, "_id");
    }
    if (clause.id !== undefined) {
      clauseWhere.id = this._processIdFilter(clause.id, "id");
    }
    if (clause.organization !== undefined) {
      const orgId = this._processIdFilter(clause.organization, "organization");
      if (topOrgId && typeof orgId === "string" && orgId !== topOrgId) {
        throw new Error("Tenant isolation violation in ProjectRepository $or clause");
      }
      clauseWhere.organizationId = orgId;
    }
    if (clause.organizationId !== undefined) {
      const orgId = this._processIdFilter(clause.organizationId, "organizationId");
      if (topOrgId && typeof orgId === "string" && orgId !== topOrgId) {
        throw new Error("Tenant isolation violation in ProjectRepository $or clause");
      }
      clauseWhere.organizationId = orgId;
    }
    if (clause.users !== undefined) {
      clauseWhere.members = this._buildUsersFilter(clause.users, "users");
    }
    if (clause.user !== undefined) {
      clauseWhere.members = this._buildUsersFilter(clause.user, "user");
    }
    if (clause.members !== undefined) {
      clauseWhere.members = this._buildUsersFilter(clause.members, "members");
    }
    if (clause.teams !== undefined) {
      clauseWhere.teams = this._buildTeamsFilter(clause.teams, "teams");
    }
    if (clause.team !== undefined) {
      clauseWhere.teams = this._buildTeamsFilter(clause.team, "team");
    }
    if (clause.name !== undefined) {
      clauseWhere.name = typeof clause.name === "string" ? clause.name.trim() : clause.name;
    }
    if (clause.provider !== undefined) {
      clauseWhere.provider = clause.provider;
    }
    if (clause.createdBy !== undefined || clause.createdById !== undefined) {
      clauseWhere.createdById = this._extractAndValidateId(clause.createdBy || clause.createdById, "createdBy");
    }
    if (clause.jiraProjectId !== undefined) {
      clauseWhere.jiraProjectId = clause.jiraProjectId;
    }
    if (clause.asanaProjectId !== undefined) {
      clauseWhere.asanaProjectId = clause.asanaProjectId;
    }

    if (Object.keys(clauseWhere).length === 0) {
      throw new Error("Empty or invalid clause in ProjectRepository $or");
    }

    return clauseWhere;
  }

  buildWhere(filter = {}) {
    const where = {};

    for (const key of Object.keys(filter || {})) {
      if (key.startsWith("$") && key !== "$or") {
        throw new Error(`Unsupported filter operator in ProjectRepository: ${key}`);
      }
    }

    let topOrgId = null;

    if (filter._id !== undefined) {
      where.id = this._processIdFilter(filter._id, "_id");
    }
    if (filter.id !== undefined) {
      where.id = this._processIdFilter(filter.id, "id");
    }
    if (filter.organization !== undefined) {
      where.organizationId = this._processIdFilter(filter.organization, "organization");
      if (typeof where.organizationId === "string") topOrgId = where.organizationId;
    }
    if (filter.organizationId !== undefined) {
      where.organizationId = this._processIdFilter(filter.organizationId, "organizationId");
      if (typeof where.organizationId === "string") topOrgId = where.organizationId;
    }
    if (filter.name !== undefined) {
      where.name = typeof filter.name === "string" ? filter.name.trim() : filter.name;
    }
    if (filter.provider !== undefined) {
      where.provider = filter.provider;
    }
    if (filter.createdBy !== undefined || filter.createdById !== undefined) {
      where.createdById = this._extractAndValidateId(filter.createdBy || filter.createdById, "createdBy");
    }
    if (filter.users !== undefined) {
      where.members = this._buildUsersFilter(filter.users, "users");
    }
    if (filter.user !== undefined) {
      where.members = this._buildUsersFilter(filter.user, "user");
    }
    if (filter.members !== undefined) {
      where.members = this._buildUsersFilter(filter.members, "members");
    }
    if (filter.teams !== undefined) {
      where.teams = this._buildTeamsFilter(filter.teams, "teams");
    }
    if (filter.team !== undefined) {
      where.teams = this._buildTeamsFilter(filter.team, "team");
    }
    if (filter.jiraProjectId !== undefined) {
      where.jiraProjectId = filter.jiraProjectId;
    }
    if (filter.asanaProjectId !== undefined) {
      where.asanaProjectId = filter.asanaProjectId;
    }

    if (filter.$or !== undefined) {
      if (!Array.isArray(filter.$or)) {
        throw new Error("Invalid $or in ProjectRepository: expected array");
      }
      if (filter.$or.length === 0) {
        throw new Error("Invalid $or in ProjectRepository: array cannot be empty");
      }
      where.OR = filter.$or.map((clause, idx) => {
        try {
          return this._buildClauseWhere(clause, topOrgId);
        } catch (err) {
          throw new Error(`Invalid clause in ProjectRepository $or at index ${idx}: ${err.message}`);
        }
      });
    }

    return where;
  }

  async findById(id, options = {}) {
    const idStr = this.toIdString(id);
    if (!idStr) return null;

    if (isPostgres()) {
      try {
        const include = this.buildInclude(options);
        const doc = await this.delegate.findUnique({
          where: { id: idStr },
          include,
        });
        return this.formatProject(doc, options);
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.findById(idStr);
    if (this.hasPopulate("users", options)) query = query.populate("users");
    const doc = await query;
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findOne(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const include = this.buildInclude(options);
        const doc = await this.delegate.findFirst({
          where,
          include,
        });
        return this.formatProject(doc, options);
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.findOne(filter);
    if (this.hasPopulate("users", options)) query = query.populate("users");
    const doc = await query;
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findProjectByIdAndOrganization(id, organizationId, options = {}) {
    const idStr = this.toIdString(id);
    const orgIdStr = this.toIdString(organizationId);
    if (!idStr || !orgIdStr) return null;
    return await this.findOne({ _id: idStr, organization: orgIdStr }, options);
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const include = this.buildInclude(options);
        const queryOptions = {
          where,
          include,
        };
        const orderBy = this.buildOrderBy(options.sort);
        if (orderBy) {
          queryOptions.orderBy = orderBy;
        }
        if (typeof options.skip === "number" && !isNaN(options.skip) && options.skip >= 0) {
          queryOptions.skip = options.skip;
        }
        if (typeof options.limit === "number" && !isNaN(options.limit) && options.limit >= 0) {
          queryOptions.take = options.limit;
        } else if (typeof options.take === "number" && !isNaN(options.take) && options.take >= 0) {
          queryOptions.take = options.take;
        }

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => this.formatProject(d, options));
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.find(filter);
    if (this.hasPopulate("users", options)) query = query.populate("users");
    if (options.sort) query = query.sort(options.sort);
    if (options.skip) query = query.skip(options.skip);
    if (options.limit) query = query.limit(options.limit);
    const docs = await query;
    return docs.map((d) => this.serialize(d.toObject ? d.toObject() : d));
  }

  async create(data) {
    if (isPostgres()) {
      try {
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          throw new Error("ProjectRepository.create requires a valid data object");
        }

        const orgId = this.toIdString(data.organization || data.organizationId);
        const createdById = this.toIdString(data.createdBy || data.createdById);
        const newId = data._id ? this.toIdString(data._id) : generateId();

        const createData = {
          id: newId,
          name: typeof data.name === "string" ? data.name.trim() : data.name,
          organizationId: orgId,
          createdById: createdById || null,
          teams: Array.isArray(data.teams) ? data.teams : [],
          provider: data.provider || "workcomposer",
          ...(data.jiraProjectId ? { jiraProjectId: data.jiraProjectId } : {}),
          ...(data.jiraProjectKey ? { jiraProjectKey: data.jiraProjectKey } : {}),
          ...(data.asanaProjectId ? { asanaProjectId: data.asanaProjectId } : {}),
          ...(data.asanaWebhookId ? { asanaWebhookId: data.asanaWebhookId } : {}),
        };

        if (data.users !== undefined && data.users !== null && !Array.isArray(data.users)) {
          throw new Error("Invalid users array in ProjectRepository.create");
        }

        const hasUsers = Array.isArray(data.users) && data.users.length > 0;
        const userIds = hasUsers
          ? [...new Set(data.users.map((u) => this.toIdString(u)).filter(Boolean))]
          : [];

        if (userIds.length > 0) {
          const prisma = this.prisma;
          const executeInTx = typeof prisma.$transaction === "function"
            ? (fn) => prisma.$transaction(fn)
            : (fn) => fn(prisma);

          const doc = await executeInTx(async (tx) => {
            const txProject = tx?.project;
            const txProjectUser = tx?.projectUser;

            if (!txProject || typeof txProject.create !== "function" || typeof txProject.findUnique !== "function") {
              throw new Error("Transaction client does not provide a valid project delegate");
            }
            if (!txProjectUser || typeof txProjectUser.create !== "function") {
              throw new Error("Transaction client does not provide a valid projectUser delegate");
            }

            await txProject.create({
              data: createData,
            });

            for (const uid of userIds) {
              await txProjectUser.create({
                data: { projectId: newId, userId: uid },
              });
            }

            return await txProject.findUnique({
              where: { id: newId },
              include: { members: true },
            });
          });

          return this.formatProject(doc);
        }

        const doc = await this.delegate.create({
          data: createData,
          include: { members: true },
        });

        return this.formatProject(doc);
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
      if (isPostgres()) {
        throw new Error("Invalid identifier in ProjectRepository.findByIdAndUpdate");
      }
      return null;
    }

    if (!updateData || typeof updateData !== "object" || Array.isArray(updateData)) {
      if (isPostgres()) {
        throw new Error("ProjectRepository.findByIdAndUpdate requires a valid update object");
      }
      return null;
    }

    if (isPostgres()) {
      try {
        for (const key of Object.keys(updateData)) {
          if (key.startsWith("$") && key !== "$set") {
            throw new Error(`Unsupported update operator in ProjectRepository: ${key}`);
          }
        }

        if (updateData.$set !== undefined) {
          if (!updateData.$set || typeof updateData.$set !== "object" || Array.isArray(updateData.$set)) {
            throw new Error("Invalid $set envelope in ProjectRepository.findByIdAndUpdate");
          }
          for (const key of Object.keys(updateData.$set)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in ProjectRepository: ${key}`);
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
          "teams",
          "users",
          "provider",
          "jiraProjectId",
          "jiraProjectKey",
          "asanaProjectId",
          "asanaWebhookId",
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
            throw new Error(`Unsupported update field in ProjectRepository: ${key}`);
          }
        }

        // Detect conflicting aliases
        if (rawPayload._id !== undefined && rawPayload.id !== undefined) {
          if (this.toIdString(rawPayload._id) !== this.toIdString(rawPayload.id)) {
            throw new Error("Conflicting update values for '_id' and 'id' in ProjectRepository.findByIdAndUpdate");
          }
        }

        if (rawPayload.organization !== undefined && rawPayload.organizationId !== undefined) {
          if (this.toIdString(rawPayload.organization) !== this.toIdString(rawPayload.organizationId)) {
            throw new Error("Conflicting update values for 'organization' and 'organizationId' in ProjectRepository.findByIdAndUpdate");
          }
        }

        if (rawPayload.createdBy !== undefined && rawPayload.createdById !== undefined) {
          if (this.toIdString(rawPayload.createdBy) !== this.toIdString(rawPayload.createdById)) {
            throw new Error("Conflicting update values for 'createdBy' and 'createdById' in ProjectRepository.findByIdAndUpdate");
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

        const include = this.buildInclude(options);

        // Fetch existing record to validate passthrough organization / createdBy and handle empty updates
        let existing = null;
        if (typeof this.delegate?.findUnique === "function") {
          existing = await this.delegate.findUnique({
            where: { id: idStr },
            include,
          });
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
        if (rawPayload.name !== undefined) {
          if (typeof rawPayload.name !== "string" || !rawPayload.name.trim()) {
            throw new Error("Invalid project name in ProjectRepository.findByIdAndUpdate");
          }
          patch.name = rawPayload.name.trim();
        }
        if (rawPayload.teams !== undefined) {
          if (!Array.isArray(rawPayload.teams)) {
            throw new Error("Invalid teams array in ProjectRepository.findByIdAndUpdate");
          }
          patch.teams = rawPayload.teams.map(String);
        }
        if (rawPayload.provider !== undefined) {
          patch.provider = rawPayload.provider;
        }
        if (rawPayload.jiraProjectId !== undefined) {
          patch.jiraProjectId = rawPayload.jiraProjectId;
        }
        if (rawPayload.jiraProjectKey !== undefined) {
          patch.jiraProjectKey = rawPayload.jiraProjectKey;
        }
        if (rawPayload.asanaProjectId !== undefined) {
          patch.asanaProjectId = rawPayload.asanaProjectId;
        }
        if (rawPayload.asanaWebhookId !== undefined) {
          patch.asanaWebhookId = rawPayload.asanaWebhookId;
        }

        const hasUsersUpdate = rawPayload.users !== undefined;
        if (hasUsersUpdate && !Array.isArray(rawPayload.users)) {
          throw new Error("Invalid users array in ProjectRepository.findByIdAndUpdate");
        }

        // Avoid empty writes when no mutable fields and no membership updates
        if (Object.keys(patch).length === 0 && !hasUsersUpdate) {
          if (existing) {
            return this.formatProject(existing, options);
          }
          return await this.findById(idStr, options);
        }

        const returnOriginal = options.new === false || options.returnDocument === "before";

        if (hasUsersUpdate) {
          const userIds = [
            ...new Set(rawPayload.users.map((u) => this.toIdString(u)).filter(Boolean)),
          ];

          const prisma = this.prisma;
          const executeInTx = typeof prisma.$transaction === "function"
            ? (fn) => prisma.$transaction(fn)
            : (fn) => fn(prisma);

          const doc = await executeInTx(async (tx) => {
            const txProject = tx?.project;
            const txProjectUser = tx?.projectUser;

            if (!txProject || typeof txProject.update !== "function" || typeof txProject.findUnique !== "function") {
              throw new Error("Transaction client does not provide a valid project delegate");
            }
            if (!txProjectUser || typeof txProjectUser.deleteMany !== "function" || typeof txProjectUser.create !== "function") {
              throw new Error("Transaction client does not provide a valid projectUser delegate");
            }

            if (Object.keys(patch).length > 0) {
              await txProject.update({
                where: { id: idStr },
                data: patch,
              });
            }

            await txProjectUser.deleteMany({ where: { projectId: idStr } });

            for (const uid of userIds) {
              await txProjectUser.create({
                data: { projectId: idStr, userId: uid },
              });
            }

            return await txProject.findUnique({
              where: { id: idStr },
              include,
            });
          });

          if (returnOriginal) {
            if (existing) {
              return this.formatProject(existing, options);
            }
            return await this.findById(idStr, options);
          }

          return this.formatProject(doc, options);
        }

        const doc = await this.delegate.update({
          where: { id: idStr },
          data: patch,
          include,
        });

        if (returnOriginal) {
          if (existing) {
            return this.formatProject(existing, options);
          }
          return await this.findById(idStr, options);
        }

        return this.formatProject(doc, options);
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

  async deleteMany(filter = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("ProjectRepository.deleteMany requires a valid filter object");
        }

        if (filter.$or !== undefined) {
          throw new Error("Unsupported filter operator in ProjectRepository: $or");
        }

        const where = this.buildWhere(filter);
        if (Object.keys(where).length === 0) {
          throw new Error("Bulk deletion requires a valid scoped filter in ProjectRepository.deleteMany");
        }

        const result = await this.delegate.deleteMany({ where });
        return { acknowledged: true, deletedCount: result.count };
      } catch (err) {
        this.handleError(err);
      }
    }

    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("ProjectRepository.deleteMany requires a valid filter object");
    }
    return this.mongooseModel.deleteMany(filter);
  }

  async findByIdAndDelete(id, options = {}) {
    const idStr = this.toIdString(id);
    if (!idStr || typeof idStr !== "string" || !idStr.trim() || idStr === "[object Object]") {
      if (isPostgres()) {
        throw new Error("Invalid identifier in ProjectRepository.findByIdAndDelete");
      }
      return null;
    }

    if (isPostgres()) {
      try {
        const prisma = this.prisma;
        const executeInTx = typeof prisma.$transaction === "function"
          ? (fn) => prisma.$transaction(fn)
          : (fn) => fn(prisma);

        const include = this.buildInclude(options);

        const doc = await executeInTx(async (tx) => {
          const txProject = tx?.project;
          const txProjectUser = tx?.projectUser;

          if (!txProject || typeof txProject.delete !== "function" || typeof txProject.findUnique !== "function") {
            throw new Error("Transaction client does not provide a valid project delegate");
          }
          if (!txProjectUser || typeof txProjectUser.deleteMany !== "function") {
            throw new Error("Transaction client does not provide a valid projectUser delegate");
          }

          const existing = await txProject.findUnique({
            where: { id: idStr },
            include,
          });

          if (!existing) {
            return null;
          }

          await txProjectUser.deleteMany({ where: { projectId: idStr } });
          await txProject.delete({ where: { id: idStr } });

          return existing;
        });

        return doc ? this.formatProject(doc, options) : null;
      } catch (err) {
        if (err && err.code === "P2025") {
          return null;
        }
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findByIdAndDelete(idStr, options);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }
}

export const projectRepository = new ProjectRepository();
export default projectRepository;
