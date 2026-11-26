import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

const ALLOWED_MANUAL_TIME_UPDATE_FIELDS = new Set([
  "status",
  "managerComment",
  "approvedBy",
  "approvedById",
  "approvedAt",
  "report",
  "reportId",
  "project",
  "projectId",
  "task",
  "taskId",
  "reason",
  "type",
  "startTime",
  "endTime",
  "duration",
  "date",
]);

const ALLOWED_MANUAL_TIME_PASSTHROUGH_FIELDS = new Set([
  "_id",
  "id",
  "organizationId",
  "organization",
  "requestedById",
  "requestedBy",
  "userId",
  "user",
  "createdAt",
  "updatedAt",
  "__v",
  "isNew",
  "_isNew",
  "$set",
  "$setOnInsert",
  "save",
  "toObject",
  "toJSON",
  "isModified",
  "set",
  "markModified",
  "populate",
  "runValidators",
  "deleteOne",
]);

const ALLOWED_MANUAL_TIME_STATUSES = new Set(["pending", "approved", "rejected"]);
const ALLOWED_SESSION_TYPES = new Set(["work", "break"]);

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
    if (typeof val === "string") return val;
    if (typeof val === "object") {
      if (val._id) return String(val._id);
      if (val.id) return String(val.id);
      if (typeof val.toHexString === "function") return val.toHexString();
    }
    return null;
  };
  const idA = toId(valA);
  const idB = toId(valB);
  if (idA && idB) return idA === idB;
  if (typeof valA === "object" && typeof valB === "object") {
    return JSON.stringify(valA) === JSON.stringify(valB);
  }
  return String(valA) === String(valB);
}

function isManualTimeFieldUnchanged(key, newVal, existing) {
  if (!existing) return false;
  let existingVal;
  if (key === "projectId") {
    existingVal = existing.projectId ?? (typeof existing.project === "string" ? existing.project : existing.project?._id || existing.project?.id || null);
  } else if (key === "taskId") {
    existingVal = existing.taskId ?? (typeof existing.task === "string" ? existing.task : existing.task?._id || existing.task?.id || null);
  } else if (key === "approvedById") {
    existingVal = existing.approvedById ?? (typeof existing.approvedBy === "string" ? existing.approvedBy : existing.approvedBy?._id || existing.approvedBy?.id || null);
  } else if (key === "reportId") {
    existingVal = existing.reportId ?? (typeof existing.report === "string" ? existing.report : existing.report?._id || existing.report?.id || null);
  } else if (key === "duration") {
    existingVal = existing.duration !== undefined ? Number(existing.duration) : 0;
  } else if (key === "managerComment") {
    existingVal = existing.managerComment || "";
  } else {
    existingVal = existing[key];
  }

  return isSameValue(newVal, existingVal);
}

export class ManualTimeRequestRepository extends BaseRepository {
  constructor() {
    super("ManualTimeRequest");
  }

  hasPopulate(name, options = {}) {
    if (!options) return false;
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    if (options[`populate${cap}`]) return true;

    // Check alias flags
    if ((name === "userId" || name === "requestedBy" || name === "user") &&
        (options.populateUserId || options.populateRequestedBy || options.populateUser)) {
      return true;
    }
    if ((name === "projectId" || name === "project") && (options.populateProjectId || options.populateProject)) {
      return true;
    }
    if ((name === "taskId" || name === "task") && (options.populateTaskId || options.populateTask)) {
      return true;
    }
    if ((name === "approvedBy" || name === "approvedById") && (options.populateApprovedBy || options.populateApprovedById)) {
      return true;
    }

    if (!options.populate) return false;
    if (options.populate === true) return true;

    const checkMatch = (target) => {
      if (typeof target !== "string") return false;
      const t = target.trim();
      if (name === "user" || name === "userId" || name === "requestedBy") {
        return t === "user" || t === "userId" || t === "requestedBy";
      }
      if (name === "project" || name === "projectId") {
        return t === "project" || t === "projectId";
      }
      if (name === "task" || name === "taskId") {
        return t === "task" || t === "taskId";
      }
      if (name === "approvedBy" || name === "approvedById") {
        return t === "approvedBy" || t === "approvedById";
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
      const popList = Array.isArray(options.populate)
        ? options.populate
        : typeof options.populate === "object" && options.populate !== null
        ? [options.populate]
        : [];
      const hasNestedTeam = popList.some((p) => {
        return typeof p === "object" && p !== null &&
          (p.path === "requestedBy" || p.path === "userId" || p.path === "user") &&
          p.populate && (p.populate === "team" || p.populate.path === "team");
      });
      if (hasNestedTeam) {
        include.requestedBy = { include: { team: true } };
      } else {
        include.requestedBy = true;
      }
    }
    if (this.hasPopulate("project", options)) {
      include.project = true;
    }
    if (this.hasPopulate("task", options)) {
      include.task = true;
    }
    if (this.hasPopulate("approvedBy", options)) {
      include.approvedBy = true;
    }
    return Object.keys(include).length > 0 ? include : undefined;
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
        const nestedPaths = [];
        if (pop.populate) {
          const nestedList = Array.isArray(pop.populate) ? pop.populate : [pop.populate];
          for (const n of nestedList) {
            if (typeof n === "string") nestedPaths.push(n);
            else if (n && n.path) nestedPaths.push(n.path);
          }
        }

        const effectiveSelect = pop.select && typeof pop.select === "string"
          ? (nestedPaths.length > 0 && !pop.select.startsWith("-") ? `${pop.select} ${nestedPaths.join(" ")}` : pop.select)
          : null;

        const applyToTarget = (target) => {
          if (!target || typeof target !== "object") return;
          if (effectiveSelect) {
            this.applyRelationProjection(target, effectiveSelect);
          }
          if (pop.populate) {
            const nestedList = Array.isArray(pop.populate) ? pop.populate : [pop.populate];
            for (const n of nestedList) {
              if (n && typeof n === "object" && n.path && n.select) {
                if (target[n.path] && typeof target[n.path] === "object") {
                  this.applyRelationProjection(target[n.path], n.select);
                }
              }
            }
          }
        };

        if (path === "userId" || path === "requestedBy" || path === "user") {
          if (doc.requestedBy && typeof doc.requestedBy === "object") {
            applyToTarget(doc.requestedBy);
          }
          if (doc.userId && typeof doc.userId === "object" && doc.userId !== doc.requestedBy) {
            applyToTarget(doc.userId);
          }
        }
        if (path === "projectId" || path === "project") {
          if (doc.project && typeof doc.project === "object") {
            applyToTarget(doc.project);
          }
          if (doc.projectId && typeof doc.projectId === "object" && doc.projectId !== doc.project) {
            applyToTarget(doc.projectId);
          }
        }
        if (path === "taskId" || path === "task") {
          if (doc.task && typeof doc.task === "object") {
            applyToTarget(doc.task);
          }
          if (doc.taskId && typeof doc.taskId === "object" && doc.taskId !== doc.task) {
            applyToTarget(doc.taskId);
          }
        }
        if (path === "approvedBy" || path === "approvedById") {
          if (doc.approvedBy && typeof doc.approvedBy === "object") {
            applyToTarget(doc.approvedBy);
          }
          if (doc.approvedById && typeof doc.approvedById === "object" && doc.approvedById !== doc.approvedBy) {
            applyToTarget(doc.approvedById);
          }
        }
      }
    }
    return doc;
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

  formatRequest(doc, options = {}) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    serialized.organization = serialized.organization || serialized.organizationId;

    // requestedBy / userId relation handling
    if (doc.requestedBy && typeof doc.requestedBy === "object") {
      const u = this.formatUserRelation(doc.requestedBy);
      serialized.requestedBy = u;
      serialized.userId = u;
    } else if (doc.requestedBy === null && this.hasPopulate("userId", options)) {
      serialized.requestedBy = null;
      serialized.userId = null;
    } else if (doc.requestedById) {
      const uId = String(doc.requestedById);
      serialized.requestedById = uId;
      serialized.requestedBy = uId;
      serialized.userId = uId;
    } else {
      serialized.requestedBy = serialized.requestedBy || serialized.requestedById || null;
      serialized.userId = serialized.requestedBy;
    }

    // project / projectId relation handling
    if (doc.project && typeof doc.project === "object") {
      const p = this.serialize(doc.project);
      if (!p._id && p.id) p._id = String(p.id);
      if (!p.id && p._id) p.id = String(p._id);
      serialized.project = p;
      serialized.projectId = p;
    } else if (doc.project === null && this.hasPopulate("project", options)) {
      serialized.project = null;
      serialized.projectId = null;
    } else if (doc.projectId) {
      const pId = String(doc.projectId);
      serialized.projectId = pId;
      serialized.project = pId;
    } else {
      serialized.project = serialized.project || serialized.projectId || null;
      serialized.projectId = serialized.project;
    }

    // task / taskId relation handling
    if (doc.task && typeof doc.task === "object") {
      const t = this.serialize(doc.task);
      if (!t._id && t.id) t._id = String(t.id);
      if (!t.id && t._id) t.id = String(t._id);
      serialized.task = t;
      serialized.taskId = t;
    } else if (doc.task === null && this.hasPopulate("task", options)) {
      serialized.task = null;
      serialized.taskId = null;
    } else if (doc.taskId) {
      const tId = String(doc.taskId);
      serialized.taskId = tId;
      serialized.task = tId;
    } else {
      serialized.task = serialized.task || serialized.taskId || null;
      serialized.taskId = serialized.task;
    }

    // approvedBy / approvedById relation handling
    if (doc.approvedBy && typeof doc.approvedBy === "object") {
      const a = this.formatUserRelation(doc.approvedBy);
      serialized.approvedBy = a;
      serialized.approvedById = a;
    } else if (doc.approvedBy === null && this.hasPopulate("approvedBy", options)) {
      serialized.approvedBy = null;
      serialized.approvedById = null;
    } else if (doc.approvedById) {
      const aId = String(doc.approvedById);
      serialized.approvedById = aId;
      serialized.approvedBy = aId;
    } else {
      serialized.approvedBy = serialized.approvedBy || serialized.approvedById || null;
      serialized.approvedById = serialized.approvedBy;
    }

    if (serialized.reportId !== undefined && serialized.report === undefined) {
      serialized.report = serialized.reportId;
    }

    if (options && options.populate) {
      this.applyPopulateProjections(serialized, options);
    }

    return serialized;
  }

  buildWhere(filter = {}) {
    const where = {};
    if (filter._id) where.id = this.toIdString(filter._id);
    if (filter.id) where.id = this.toIdString(filter.id);
    if (filter.organization) where.organizationId = this.toIdString(filter.organization);
    if (filter.organizationId) where.organizationId = this.toIdString(filter.organizationId);

    const userFilter = filter.requestedBy || filter.requestedById || filter.userId || filter.user;
    if (userFilter) {
      if (userFilter.$in) where.requestedById = { in: userFilter.$in.map((u) => this.toIdString(u)) };
      else where.requestedById = this.toIdString(userFilter);
    }

    const projectFilter = filter.project || filter.projectId;
    if (projectFilter) {
      if (projectFilter.$in) where.projectId = { in: projectFilter.$in.map((p) => this.toIdString(p)) };
      else where.projectId = this.toIdString(projectFilter);
    }

    const taskFilter = filter.task || filter.taskId;
    if (taskFilter) {
      if (taskFilter.$in) where.taskId = { in: taskFilter.$in.map((t) => this.toIdString(t)) };
      else where.taskId = this.toIdString(taskFilter);
    }

    if (filter.status) {
      if (typeof filter.status === "object" && filter.status.$in) {
        where.status = { in: filter.status.$in };
      } else {
        where.status = filter.status;
      }
    }
    if (filter.date) where.date = String(filter.date);
    if (filter.type) where.type = filter.type;
    if (filter.startTime) {
      if (typeof filter.startTime === "object" && !(filter.startTime instanceof Date)) {
        where.startTime = {};
        if (filter.startTime.$gte || filter.startTime.gte) where.startTime.gte = new Date(filter.startTime.$gte || filter.startTime.gte);
        if (filter.startTime.$lte || filter.startTime.lte) where.startTime.lte = new Date(filter.startTime.$lte || filter.startTime.lte);
        if (filter.startTime.$gt || filter.startTime.gt) where.startTime.gt = new Date(filter.startTime.$gt || filter.startTime.gt);
        if (filter.startTime.$lt || filter.startTime.lt) where.startTime.lt = new Date(filter.startTime.$lt || filter.startTime.lt);
      } else {
        where.startTime = new Date(filter.startTime);
      }
    }
    if (filter.endTime) {
      if (typeof filter.endTime === "object" && !(filter.endTime instanceof Date)) {
        where.endTime = {};
        if (filter.endTime.$gte || filter.endTime.gte) where.endTime.gte = new Date(filter.endTime.$gte || filter.endTime.gte);
        if (filter.endTime.$lte || filter.endTime.lte) where.endTime.lte = new Date(filter.endTime.$lte || filter.endTime.lte);
        if (filter.endTime.$gt || filter.endTime.gt) where.endTime.gt = new Date(filter.endTime.$gt || filter.endTime.gt);
        if (filter.endTime.$lt || filter.endTime.lt) where.endTime.lt = new Date(filter.endTime.$lt || filter.endTime.lt);
      } else {
        where.endTime = new Date(filter.endTime);
      }
    }
    return where;
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const include = this.buildInclude(options);

        const queryOptions = { where };
        if (include) queryOptions.include = include;

        if (options.sort) {
          const [sortField, sortDir] = Object.entries(options.sort)[0] || ["createdAt", -1];
          queryOptions.orderBy = { [sortField]: sortDir === -1 || sortDir === "desc" ? "desc" : "asc" };
        }
        if (options.skip) queryOptions.skip = options.skip;
        if (options.limit) queryOptions.take = options.limit;

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => this.formatRequest(d, options));
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.find(filter);
    if (this.hasPopulate("userId", options)) query = query.populate("requestedBy");
    if (this.hasPopulate("projectId", options)) query = query.populate("project");
    if (this.hasPopulate("taskId", options)) query = query.populate("task");
    if (this.hasPopulate("approvedBy", options)) query = query.populate("approvedBy");
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
        return this.formatRequest(doc, options);
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.findOne(filter);
    if (this.hasPopulate("userId", options)) query = query.populate("requestedBy");
    if (this.hasPopulate("projectId", options)) query = query.populate("project");
    if (this.hasPopulate("taskId", options)) query = query.populate("task");
    if (this.hasPopulate("approvedBy", options)) query = query.populate("approvedBy");
    const doc = await query;
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findRequestByIdAndOrganization(id, organizationId, options = {}) {
    if (isPostgres()) {
      try {
        const include = this.buildInclude(options) || {
          requestedBy: true,
          approvedBy: true,
          project: true,
          task: true,
        };
        const doc = await this.delegate.findFirst({
          where: {
            id: this.toIdString(id),
            organizationId: this.toIdString(organizationId),
          },
          include,
        });
        if (!doc) return null;
        return this.formatRequest(doc, options);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOne({
      _id: id,
      organization: organizationId,
    })
      .populate("requestedBy", "firstName lastName email avatar")
      .populate("approvedBy", "firstName lastName email")
      .populate("project", "name color")
      .populate("task", "title");
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
        return this.formatRequest(doc, options);
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.findById(idStr);
    if (this.hasPopulate("userId", options)) query = query.populate("requestedBy");
    if (this.hasPopulate("projectId", options)) query = query.populate("project");
    if (this.hasPopulate("taskId", options)) query = query.populate("task");
    if (this.hasPopulate("approvedBy", options)) query = query.populate("approvedBy");
    const doc = await query;
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async create(data) {
    if (Array.isArray(data)) {
      const results = [];
      for (const item of data) {
        results.push(await this.create(item));
      }
      return results;
    }

    if (!data || typeof data !== "object") {
      throw new Error("ManualTimeRequestRepository.create requires a valid data object");
    }

    if (isPostgres()) {
      try {
        // Detect conflicting aliases
        if (data._id !== undefined && data.id !== undefined) {
          if (this.toIdString(data._id) !== this.toIdString(data.id)) {
            throw new Error("Conflicting values for '_id' and 'id' in ManualTimeRequestRepository.create");
          }
        }
        if (data.organization !== undefined && data.organizationId !== undefined) {
          if (this.toIdString(data.organization) !== this.toIdString(data.organizationId)) {
            throw new Error("Conflicting values for 'organization' and 'organizationId' in ManualTimeRequestRepository.create");
          }
        }
        const userAliases = [data.requestedBy, data.requestedById, data.user, data.userId].filter((v) => v !== undefined && v !== null);
        if (userAliases.length > 1) {
          const firstId = this.toIdString(userAliases[0]);
          for (let i = 1; i < userAliases.length; i++) {
            if (this.toIdString(userAliases[i]) !== firstId) {
              throw new Error("Conflicting values for requester aliases in ManualTimeRequestRepository.create");
            }
          }
        }
        if (data.project !== undefined && data.projectId !== undefined) {
          if (this.toIdString(data.project) !== this.toIdString(data.projectId)) {
            throw new Error("Conflicting values for 'project' and 'projectId' in ManualTimeRequestRepository.create");
          }
        }
        if (data.task !== undefined && data.taskId !== undefined) {
          if (this.toIdString(data.task) !== this.toIdString(data.taskId)) {
            throw new Error("Conflicting values for 'task' and 'taskId' in ManualTimeRequestRepository.create");
          }
        }
        if (data.approvedBy !== undefined && data.approvedById !== undefined) {
          if (this.toIdString(data.approvedBy) !== this.toIdString(data.approvedById)) {
            throw new Error("Conflicting values for 'approvedBy' and 'approvedById' in ManualTimeRequestRepository.create");
          }
        }
        if (data.report !== undefined && data.reportId !== undefined) {
          if (this.toIdString(data.report) !== this.toIdString(data.reportId)) {
            throw new Error("Conflicting values for 'report' and 'reportId' in ManualTimeRequestRepository.create");
          }
        }

        const orgId = this.toIdString(data.organization || data.organizationId);
        if (!orgId) {
          throw new Error("Cannot create ManualTimeRequest without valid organizationId");
        }
        const requestedById = this.toIdString(data.requestedBy || data.requestedById || data.userId || data.user);
        if (!requestedById) {
          throw new Error("Cannot create ManualTimeRequest without valid requestedById");
        }

        const projectId = data.project || data.projectId ? this.toIdString(data.project || data.projectId) : null;
        const taskId = data.task || data.taskId ? this.toIdString(data.task || data.taskId) : null;
        const approvedById = data.approvedBy || data.approvedById ? this.toIdString(data.approvedBy || data.approvedById) : null;
        const reportId = data.report || data.reportId ? this.toIdString(data.report || data.reportId) : null;
        const newId = data._id ? this.toIdString(data._id) : (data.id ? this.toIdString(data.id) : generateId());

        if (!data.type || !ALLOWED_SESSION_TYPES.has(String(data.type).trim())) {
          throw new Error(`Invalid type in ManualTimeRequestRepository.create: ${data.type}`);
        }

        const startTime = new Date(data.startTime);
        if (isNaN(startTime.getTime())) {
          throw new Error("Invalid date value in ManualTimeRequestRepository.create: startTime");
        }
        const endTime = new Date(data.endTime);
        if (isNaN(endTime.getTime())) {
          throw new Error("Invalid date value in ManualTimeRequestRepository.create: endTime");
        }

        const duration = Number(data.duration);
        if (isNaN(duration) || duration < 0) {
          throw new Error("Invalid duration in ManualTimeRequestRepository.create");
        }

        let status = "pending";
        if (data.status !== undefined && data.status !== null) {
          if (typeof data.status !== "string" || !ALLOWED_MANUAL_TIME_STATUSES.has(data.status.trim())) {
            throw new Error(`Invalid status in ManualTimeRequestRepository.create: ${data.status}`);
          }
          status = data.status.trim();
        }

        let approvedAt = null;
        if (data.approvedAt !== undefined && data.approvedAt !== null) {
          const d = data.approvedAt instanceof Date ? data.approvedAt : new Date(data.approvedAt);
          if (isNaN(d.getTime())) {
            throw new Error("Invalid date value in ManualTimeRequestRepository.create: approvedAt");
          }
          approvedAt = d;
        }

        const createData = {
          id: newId,
          organizationId: orgId,
          requestedById,
          projectId,
          taskId,
          approvedById,
          reportId,
          type: data.type.trim(),
          startTime,
          endTime,
          duration,
          date: String(data.date),
          reason: String(data.reason || "").trim(),
          status,
          managerComment: data.managerComment || "",
          approvedAt,
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatRequest(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.create(data);
    if (Array.isArray(doc)) {
      return doc.map((d) => this.serialize(d.toObject ? doc.toObject() : doc));
    }
    return this.serialize(doc.toObject ? doc.toObject() : doc);
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

  _buildManualTimePatch(rawPayload, existing = null) {
    const patch = {};

    if (rawPayload.status !== undefined) {
      if (typeof rawPayload.status !== "string" || !ALLOWED_MANUAL_TIME_STATUSES.has(rawPayload.status.trim())) {
        throw new Error(`Invalid status in ManualTimeRequestRepository: ${rawPayload.status}`);
      }
      patch.status = rawPayload.status.trim();
    }

    if (rawPayload.managerComment !== undefined) {
      patch.managerComment = String(rawPayload.managerComment || "");
    }

    if (rawPayload.approvedBy !== undefined || rawPayload.approvedById !== undefined) {
      if (rawPayload.approvedBy !== undefined && rawPayload.approvedById !== undefined) {
        if (this.toIdString(rawPayload.approvedBy) !== this.toIdString(rawPayload.approvedById)) {
          throw new Error("Conflicting values for 'approvedBy' and 'approvedById' in ManualTimeRequestRepository");
        }
      }
      const aVal = rawPayload.approvedBy !== undefined ? rawPayload.approvedBy : rawPayload.approvedById;
      patch.approvedById = aVal ? this.toIdString(aVal) : null;
    }

    if (rawPayload.approvedAt !== undefined) {
      if (rawPayload.approvedAt === null) {
        patch.approvedAt = null;
      } else {
        const d = rawPayload.approvedAt instanceof Date ? rawPayload.approvedAt : new Date(rawPayload.approvedAt);
        if (isNaN(d.getTime())) {
          throw new Error("Invalid date value in ManualTimeRequestRepository update: approvedAt");
        }
        patch.approvedAt = d;
      }
    }

    if (rawPayload.report !== undefined || rawPayload.reportId !== undefined) {
      if (rawPayload.report !== undefined && rawPayload.reportId !== undefined) {
        if (this.toIdString(rawPayload.report) !== this.toIdString(rawPayload.reportId)) {
          throw new Error("Conflicting values for 'report' and 'reportId' in ManualTimeRequestRepository");
        }
      }
      const rVal = rawPayload.report !== undefined ? rawPayload.report : rawPayload.reportId;
      patch.reportId = rVal ? this.toIdString(rVal) : null;
    }

    if (rawPayload.project !== undefined || rawPayload.projectId !== undefined) {
      if (rawPayload.project !== undefined && rawPayload.projectId !== undefined) {
        if (this.toIdString(rawPayload.project) !== this.toIdString(rawPayload.projectId)) {
          throw new Error("Conflicting values for 'project' and 'projectId' in ManualTimeRequestRepository");
        }
      }
      const pVal = rawPayload.project !== undefined ? rawPayload.project : rawPayload.projectId;
      patch.projectId = pVal ? this.toIdString(pVal) : null;
    }

    if (rawPayload.task !== undefined || rawPayload.taskId !== undefined) {
      if (rawPayload.task !== undefined && rawPayload.taskId !== undefined) {
        if (this.toIdString(rawPayload.task) !== this.toIdString(rawPayload.taskId)) {
          throw new Error("Conflicting values for 'task' and 'taskId' in ManualTimeRequestRepository");
        }
      }
      const tVal = rawPayload.task !== undefined ? rawPayload.task : rawPayload.taskId;
      patch.taskId = tVal ? this.toIdString(tVal) : null;
    }

    if (rawPayload.type !== undefined) {
      if (typeof rawPayload.type !== "string" || !ALLOWED_SESSION_TYPES.has(rawPayload.type.trim())) {
        throw new Error(`Invalid type in ManualTimeRequestRepository: ${rawPayload.type}`);
      }
      patch.type = rawPayload.type.trim();
    }

    if (rawPayload.startTime !== undefined) {
      const d = rawPayload.startTime instanceof Date ? rawPayload.startTime : new Date(rawPayload.startTime);
      if (isNaN(d.getTime())) {
        throw new Error("Invalid date value in ManualTimeRequestRepository update: startTime");
      }
      patch.startTime = d;
    }

    if (rawPayload.endTime !== undefined) {
      const d = rawPayload.endTime instanceof Date ? rawPayload.endTime : new Date(rawPayload.endTime);
      if (isNaN(d.getTime())) {
        throw new Error("Invalid date value in ManualTimeRequestRepository update: endTime");
      }
      patch.endTime = d;
    }

    if (rawPayload.duration !== undefined) {
      const num = Number(rawPayload.duration);
      if (isNaN(num) || num < 0) {
        throw new Error("Invalid duration in ManualTimeRequestRepository update");
      }
      patch.duration = num;
    }

    if (rawPayload.date !== undefined) {
      patch.date = String(rawPayload.date);
    }

    if (rawPayload.reason !== undefined) {
      patch.reason = String(rawPayload.reason || "").trim();
    }

    // Prune unchanged fields against existing record
    if (existing) {
      for (const k of Object.keys(patch)) {
        if (isManualTimeFieldUnchanged(k, patch[k], existing)) {
          delete patch[k];
        }
      }
    }

    return patch;
  }

  async updateById(id, data, options = { new: true }) {
    if (!id) {
      throw new Error("ManualTimeRequestRepository.updateById requires a valid id");
    }
    const idStr = this.toIdString(id);
    if (!idStr || idStr === "[object Object]") {
      throw new Error("ManualTimeRequestRepository.updateById requires a valid id");
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("ManualTimeRequestRepository.updateById requires a valid update object");
    }

    if (isPostgres()) {
      try {
        for (const key of Object.keys(data)) {
          if (key.startsWith("$") && key !== "$set") {
            throw new Error(`Unsupported update operator in ManualTimeRequestRepository: ${key}`);
          }
        }

        if (data.$set !== undefined) {
          if (!data.$set || typeof data.$set !== "object" || Array.isArray(data.$set)) {
            throw new Error("Invalid $set envelope in ManualTimeRequestRepository.updateById");
          }
          for (const key of Object.keys(data.$set)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in ManualTimeRequestRepository: ${key}`);
            }
          }
        }

        const directFields = { ...data };
        delete directFields.$set;
        const setFields = data.$set || {};

        for (const key of Object.keys(setFields)) {
          if (directFields[key] !== undefined) {
            if (!isSameValue(directFields[key], setFields[key])) {
              throw new Error(`Conflicting update values for field '${key}' between direct payload and $set envelope`);
            }
          }
        }

        const rawPayload = { ...directFields, ...setFields };

        for (const key of Object.keys(rawPayload)) {
          if (typeof rawPayload[key] === "function") continue;
          if (!ALLOWED_MANUAL_TIME_UPDATE_FIELDS.has(key) && !ALLOWED_MANUAL_TIME_PASSTHROUGH_FIELDS.has(key)) {
            throw new Error(`Unsupported update field in ManualTimeRequestRepository: ${key}`);
          }
        }

        let existing = options._existing || null;
        if (!existing) {
          existing = await this.findById(idStr, options);
        }

        if (!existing) {
          return null;
        }

        const existingId = this.toIdString(existing.id || existing._id);
        const existingOrgId = this.toIdString(existing.organizationId || existing.organization);
        const existingRequesterId = this.toIdString(
          existing.requestedById ||
          existing.requestedBy?._id ||
          existing.requestedBy?.id ||
          existing.requestedBy ||
          existing.userId ||
          existing.user
        );

        // Normalize alias pairs when coming from ModelProxy doc.save():
        // If one alias was mutated while the other alias still has the existing record's value,
        // synchronize to the mutated value rather than throwing a false conflict.
        if (existing) {
          const existingReportId = this.toIdString(existing.reportId || existing.report);
          if (rawPayload.report !== undefined && rawPayload.reportId !== undefined) {
            const r1 = this.toIdString(rawPayload.report);
            const r2 = this.toIdString(rawPayload.reportId);
            if (r1 !== r2) {
              if (r2 === existingReportId && r1 !== existingReportId) {
                rawPayload.reportId = rawPayload.report;
              } else if (r1 === existingReportId && r2 !== existingReportId) {
                rawPayload.report = rawPayload.reportId;
              }
            }
          }

          const existingProjectId = this.toIdString(existing.projectId || existing.project);
          if (rawPayload.project !== undefined && rawPayload.projectId !== undefined) {
            const p1 = this.toIdString(rawPayload.project);
            const p2 = this.toIdString(rawPayload.projectId);
            if (p1 !== p2) {
              if (p2 === existingProjectId && p1 !== existingProjectId) {
                rawPayload.projectId = rawPayload.project;
              } else if (p1 === existingProjectId && p2 !== existingProjectId) {
                rawPayload.project = rawPayload.projectId;
              }
            }
          }

          const existingTaskId = this.toIdString(existing.taskId || existing.task);
          if (rawPayload.task !== undefined && rawPayload.taskId !== undefined) {
            const t1 = this.toIdString(rawPayload.task);
            const t2 = this.toIdString(rawPayload.taskId);
            if (t1 !== t2) {
              if (t2 === existingTaskId && t1 !== existingTaskId) {
                rawPayload.taskId = rawPayload.task;
              } else if (t1 === existingTaskId && t2 !== existingTaskId) {
                rawPayload.task = rawPayload.taskId;
              }
            }
          }

          const existingApprovedById = this.toIdString(existing.approvedById || existing.approvedBy);
          if (rawPayload.approvedBy !== undefined && rawPayload.approvedById !== undefined) {
            const a1 = this.toIdString(rawPayload.approvedBy);
            const a2 = this.toIdString(rawPayload.approvedById);
            if (a1 !== a2) {
              if (a2 === existingApprovedById && a1 !== existingApprovedById) {
                rawPayload.approvedById = rawPayload.approvedBy;
              } else if (a1 === existingApprovedById && a2 !== existingApprovedById) {
                rawPayload.approvedBy = rawPayload.approvedById;
              }
            }
          }
        }

        // Detect conflicting aliases
        if (rawPayload._id !== undefined && rawPayload.id !== undefined) {
          if (this.toIdString(rawPayload._id) !== this.toIdString(rawPayload.id)) {
            throw new Error("Conflicting update values for '_id' and 'id' in ManualTimeRequestRepository");
          }
        }
        if (rawPayload.organization !== undefined && rawPayload.organizationId !== undefined) {
          if (this.toIdString(rawPayload.organization) !== this.toIdString(rawPayload.organizationId)) {
            throw new Error("Conflicting update values for 'organization' and 'organizationId' in ManualTimeRequestRepository");
          }
        }
        const userAliases = [rawPayload.requestedBy, rawPayload.requestedById, rawPayload.user, rawPayload.userId].filter((v) => v !== undefined && v !== null);
        if (userAliases.length > 1) {
          const firstId = this.toIdString(userAliases[0]);
          for (let i = 1; i < userAliases.length; i++) {
            if (this.toIdString(userAliases[i]) !== firstId) {
              throw new Error("Conflicting update values for requester aliases in ManualTimeRequestRepository");
            }
          }
        }
        if (rawPayload.project !== undefined && rawPayload.projectId !== undefined) {
          if (this.toIdString(rawPayload.project) !== this.toIdString(rawPayload.projectId)) {
            throw new Error("Conflicting update values for 'project' and 'projectId' in ManualTimeRequestRepository");
          }
        }
        if (rawPayload.task !== undefined && rawPayload.taskId !== undefined) {
          if (this.toIdString(rawPayload.task) !== this.toIdString(rawPayload.taskId)) {
            throw new Error("Conflicting update values for 'task' and 'taskId' in ManualTimeRequestRepository");
          }
        }
        if (rawPayload.approvedBy !== undefined && rawPayload.approvedById !== undefined) {
          if (this.toIdString(rawPayload.approvedBy) !== this.toIdString(rawPayload.approvedById)) {
            throw new Error("Conflicting update values for 'approvedBy' and 'approvedById' in ManualTimeRequestRepository");
          }
        }
        if (rawPayload.report !== undefined && rawPayload.reportId !== undefined) {
          if (this.toIdString(rawPayload.report) !== this.toIdString(rawPayload.reportId)) {
            throw new Error("Conflicting update values for 'report' and 'reportId' in ManualTimeRequestRepository");
          }
        }

        // Validate immutable fields against existing record
        if (rawPayload._id !== undefined && this.toIdString(rawPayload._id) !== existingId) {
          throw new Error("Cannot update immutable field: _id");
        }
        if (rawPayload.id !== undefined && this.toIdString(rawPayload.id) !== existingId) {
          throw new Error("Cannot update immutable field: id");
        }
        if (rawPayload.organizationId !== undefined && this.toIdString(rawPayload.organizationId) !== existingOrgId) {
          throw new Error("Cannot update immutable field: organizationId");
        }
        if (rawPayload.organization !== undefined && this.toIdString(rawPayload.organization) !== existingOrgId) {
          throw new Error("Cannot update immutable field: organization");
        }
        if (rawPayload.requestedById !== undefined && this.toIdString(rawPayload.requestedById) !== existingRequesterId) {
          throw new Error("Cannot update immutable field: requestedById");
        }
        if (rawPayload.requestedBy !== undefined && this.toIdString(rawPayload.requestedBy) !== existingRequesterId) {
          throw new Error("Cannot update immutable field: requestedBy");
        }
        if (rawPayload.userId !== undefined && this.toIdString(rawPayload.userId) !== existingRequesterId) {
          throw new Error("Cannot update immutable field: userId");
        }
        if (rawPayload.user !== undefined && this.toIdString(rawPayload.user) !== existingRequesterId) {
          throw new Error("Cannot update immutable field: user");
        }
        if (rawPayload.createdAt !== undefined) {
          const existingCreated = existing.createdAt instanceof Date ? existing.createdAt.getTime() : new Date(existing.createdAt).getTime();
          const payloadCreated = rawPayload.createdAt instanceof Date ? rawPayload.createdAt.getTime() : new Date(rawPayload.createdAt).getTime();
          if (isNaN(payloadCreated) || payloadCreated !== existingCreated) {
            throw new Error("Cannot update immutable field: createdAt");
          }
        }

        const patch = this._buildManualTimePatch(rawPayload, existing);

        if (Object.keys(patch).length === 0) {
          if (options._meta) {
            options._meta.modified = false;
          }
          return this.formatRequest(existing, options);
        }

        const include = this.buildInclude(options);
        const doc = await this.delegate.update({
          where: { id: idStr },
          data: patch,
          ...(include ? { include } : {}),
        });

        if (options._meta) {
          options._meta.modified = true;
        }

        const returnOriginal = options.new === false || options.returnDocument === "before";
        if (returnOriginal) {
          return this.formatRequest(existing, options);
        }

        return this.formatRequest(doc, options);
      } catch (err) {
        if (err && err.code === "P2025") {
          return null;
        }
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findByIdAndUpdate(idStr, data, { new: true, ...options });
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findByIdAndUpdate(id, data, options = { new: true }) {
    return this.updateById(id, data, options);
  }

  async updateStatusIfPending(id, data) {
    if (!id) {
      throw new Error("ManualTimeRequestRepository.updateStatusIfPending requires a valid id");
    }
    const idStr = this.toIdString(id);
    if (!idStr || idStr === "[object Object]") {
      return 0;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("ManualTimeRequestRepository.updateStatusIfPending requires a valid update object");
    }

    for (const key of Object.keys(data)) {
      if (key.startsWith("$") && key !== "$set") {
        throw new Error(`Unsupported update operator in ManualTimeRequestRepository: ${key}`);
      }
    }

    if (data.$set !== undefined) {
      if (!data.$set || typeof data.$set !== "object" || Array.isArray(data.$set)) {
        throw new Error("Invalid $set envelope in ManualTimeRequestRepository.updateStatusIfPending");
      }
      for (const key of Object.keys(data.$set)) {
        if (key.startsWith("$")) {
          throw new Error(`Unsupported update operator in ManualTimeRequestRepository: ${key}`);
        }
      }
    }

    const directFields = { ...data };
    delete directFields.$set;
    const setFields = data.$set || {};

    for (const key of Object.keys(setFields)) {
      if (directFields[key] !== undefined) {
        if (!isSameValue(directFields[key], setFields[key])) {
          throw new Error(`Conflicting update values for field '${key}' between direct payload and $set envelope`);
        }
      }
    }

    const rawPayload = { ...directFields, ...setFields };

    const allowedStatusFields = new Set([
      "status",
      "approvedBy",
      "approvedById",
      "approvedAt",
      "managerComment",
      "_id",
      "id",
      "$set",
      "save",
      "toObject",
      "toJSON",
    ]);

    for (const key of Object.keys(rawPayload)) {
      if (typeof rawPayload[key] === "function") continue;
      if (!allowedStatusFields.has(key)) {
        throw new Error(`Unsupported field in ManualTimeRequestRepository.updateStatusIfPending: ${key}`);
      }
    }

    if (!rawPayload.status || typeof rawPayload.status !== "string") {
      throw new Error("ManualTimeRequestRepository.updateStatusIfPending requires a valid status ('approved' or 'rejected')");
    }
    const status = rawPayload.status.trim();
    if (status !== "approved" && status !== "rejected") {
      throw new Error(`Invalid status transition in ManualTimeRequestRepository.updateStatusIfPending: ${status}`);
    }

    if (rawPayload.approvedBy !== undefined && rawPayload.approvedById !== undefined) {
      if (this.toIdString(rawPayload.approvedBy) !== this.toIdString(rawPayload.approvedById)) {
        throw new Error("Conflicting values for 'approvedBy' and 'approvedById' in ManualTimeRequestRepository");
      }
    }
    const approvedById = rawPayload.approvedBy !== undefined ? rawPayload.approvedBy : rawPayload.approvedById;
    const approvedByIdStr = approvedById ? this.toIdString(approvedById) : null;

    let approvedAtDate = null;
    if (rawPayload.approvedAt !== undefined && rawPayload.approvedAt !== null) {
      const d = rawPayload.approvedAt instanceof Date ? rawPayload.approvedAt : new Date(rawPayload.approvedAt);
      if (isNaN(d.getTime())) {
        throw new Error("Invalid date value in ManualTimeRequestRepository.updateStatusIfPending: approvedAt");
      }
      approvedAtDate = d;
    }

    const managerComment = rawPayload.managerComment !== undefined ? String(rawPayload.managerComment || "") : undefined;

    if (isPostgres()) {
      try {
        const dataToUpdate = {
          status,
          approvedById: approvedByIdStr,
          approvedAt: approvedAtDate,
        };
        if (managerComment !== undefined) {
          dataToUpdate.managerComment = managerComment;
        }

        const res = await this.delegate.updateMany({
          where: {
            id: idStr,
            status: "pending",
          },
          data: dataToUpdate,
        });
        return res.count;
      } catch (err) {
        this.handleError(err);
      }
    }

    const dataToSet = {
      status,
      approvedBy: approvedByIdStr,
      approvedAt: approvedAtDate,
    };
    if (managerComment !== undefined) {
      dataToSet.managerComment = managerComment;
    }

    const doc = await this.mongooseModel.findOneAndUpdate(
      { _id: idStr, status: "pending" },
      { $set: dataToSet },
      { new: true }
    );
    return doc ? 1 : 0;
  }
}

export const manualTimeRequestRepository = new ManualTimeRequestRepository();
export default manualTimeRequestRepository;
