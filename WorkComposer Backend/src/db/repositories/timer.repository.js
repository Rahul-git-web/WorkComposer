import { BaseRepository } from "./base.repository.js";
import { isPostgres, isMongo } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";
import { getAmbientTransaction } from "../transaction.js";

function hasPopulate(name, options = {}) {
  if (!options || typeof options !== "object") return false;

  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  if (options[`populate${cap}`]) return true;
  if (options[`populate${cap}Id`]) return true;

  if (!options.populate) return false;

  const checkMatch = (target) => {
    if (typeof target !== "string") return false;
    const t = target.trim();
    if (name === "project") {
      return t === "project" || t === "projectId";
    }
    if (name === "task") {
      return t === "task" || t === "taskId";
    }
    return t === name;
  };

  if (typeof options.populate === "string") {
    const parts = options.populate.trim().split(/[\s,]+/).filter(Boolean);
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

const ALLOWED_TIMER_UPDATE_FIELDS = new Set([
  "startTime",
  "endTime",
  "duration",
  "status",
  "project",
  "projectId",
  "task",
  "taskId",
]);

const ALLOWED_TIMER_PASSTHROUGH_FIELDS = new Set([
  "_id",
  "id",
  "userId",
  "user",
  "organization",
  "organizationId",
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

const ALLOWED_TIMER_STATUSES = new Set(["running", "stopped", "paused"]);

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

function isTimerFieldUnchanged(key, newVal, existing) {
  if (!existing) return false;
  let existingVal;
  if (key === "projectId") {
    existingVal = existing.projectId ?? (typeof existing.project === "string" ? existing.project : existing.project?._id || existing.project?.id || null);
  } else if (key === "taskId") {
    existingVal = existing.taskId ?? (typeof existing.task === "string" ? existing.task : existing.task?._id || existing.task?.id || null);
  } else if (key === "duration") {
    existingVal = existing.duration !== undefined ? Number(existing.duration) : 0;
  } else {
    existingVal = existing[key];
  }

  return isSameValue(newVal, existingVal);
}

export class TimerRepository extends BaseRepository {
  constructor() {
    super("Timer");
  }

  formatTimer(doc, options = {}) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    serialized.user = serialized.user || serialized.userId;
    if (serialized.projectId !== undefined && serialized.project === undefined) {
      serialized.project = serialized.projectId;
    }
    if (serialized.taskId !== undefined && serialized.task === undefined) {
      serialized.task = serialized.taskId;
    }
    if (doc.project && typeof doc.project === "object") {
      serialized.project = this.serialize(doc.project);
    }
    if (doc.task && typeof doc.task === "object") {
      serialized.task = this.serialize(doc.task);
    }
    delete serialized.userId;
    delete serialized.projectId;
    delete serialized.taskId;
    return serialized;
  }

  buildInclude(options = {}) {
    const include = {};
    if (hasPopulate("project", options)) {
      include.project = { select: { id: true, name: true } };
    }
    if (hasPopulate("task", options)) {
      include.task = { select: { id: true, title: true } };
    }
    return Object.keys(include).length > 0 ? include : null;
  }

  buildWhere(filter = {}) {
    const where = {};

    for (const key of Object.keys(filter || {})) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in TimerRepository: ${key}`);
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
              throw new Error(`Unsupported filter operator in TimerRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in TimerRepository filter: _id");
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
              throw new Error(`Unsupported filter operator in TimerRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in TimerRepository filter: id");
        }
      } else {
        where.id = this.toIdString(filter.id);
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
              throw new Error(`Unsupported filter operator in TimerRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in TimerRepository filter: user");
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
              throw new Error(`Unsupported filter operator in TimerRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in TimerRepository filter: userId");
        }
      } else {
        where.userId = this.toIdString(filter.userId);
      }
    }

    if (filter.project) {
      if (Array.isArray(filter.project)) {
        where.projectId = { in: filter.project.map((p) => this.toIdString(p)).filter(Boolean) };
      } else if (typeof filter.project === "object" && filter.project !== null) {
        if (filter.project.$in && Array.isArray(filter.project.$in)) {
          where.projectId = { in: filter.project.$in.map((p) => this.toIdString(p)).filter(Boolean) };
        } else if (filter.project.in && Array.isArray(filter.project.in)) {
          where.projectId = { in: filter.project.in.map((p) => this.toIdString(p)).filter(Boolean) };
        } else if (filter.project._id || filter.project.id) {
          where.projectId = this.toIdString(filter.project);
        } else {
          for (const k of Object.keys(filter.project)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in TimerRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in TimerRepository filter: project");
        }
      } else {
        where.projectId = this.toIdString(filter.project);
      }
    }
    if (filter.projectId) {
      if (Array.isArray(filter.projectId)) {
        where.projectId = { in: filter.projectId.map((p) => this.toIdString(p)).filter(Boolean) };
      } else if (typeof filter.projectId === "object" && filter.projectId !== null) {
        if (filter.projectId.$in && Array.isArray(filter.projectId.$in)) {
          where.projectId = { in: filter.projectId.$in.map((p) => this.toIdString(p)).filter(Boolean) };
        } else if (filter.projectId.in && Array.isArray(filter.projectId.in)) {
          where.projectId = { in: filter.projectId.in.map((p) => this.toIdString(p)).filter(Boolean) };
        } else if (filter.projectId._id || filter.projectId.id) {
          where.projectId = this.toIdString(filter.projectId);
        } else {
          for (const k of Object.keys(filter.projectId)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in TimerRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in TimerRepository filter: projectId");
        }
      } else {
        where.projectId = this.toIdString(filter.projectId);
      }
    }

    if (filter.task) {
      if (Array.isArray(filter.task)) {
        where.taskId = { in: filter.task.map((t) => this.toIdString(t)).filter(Boolean) };
      } else if (typeof filter.task === "object" && filter.task !== null) {
        if (filter.task.$in && Array.isArray(filter.task.$in)) {
          where.taskId = { in: filter.task.$in.map((t) => this.toIdString(t)).filter(Boolean) };
        } else if (filter.task.in && Array.isArray(filter.task.in)) {
          where.taskId = { in: filter.task.in.map((t) => this.toIdString(t)).filter(Boolean) };
        } else if (filter.task._id || filter.task.id) {
          where.taskId = this.toIdString(filter.task);
        } else {
          for (const k of Object.keys(filter.task)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in TimerRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in TimerRepository filter: task");
        }
      } else {
        where.taskId = this.toIdString(filter.task);
      }
    }
    if (filter.taskId) {
      if (Array.isArray(filter.taskId)) {
        where.taskId = { in: filter.taskId.map((t) => this.toIdString(t)).filter(Boolean) };
      } else if (typeof filter.taskId === "object" && filter.taskId !== null) {
        if (filter.taskId.$in && Array.isArray(filter.taskId.$in)) {
          where.taskId = { in: filter.taskId.$in.map((t) => this.toIdString(t)).filter(Boolean) };
        } else if (filter.taskId.in && Array.isArray(filter.taskId.in)) {
          where.taskId = { in: filter.taskId.in.map((t) => this.toIdString(t)).filter(Boolean) };
        } else if (filter.taskId._id || filter.taskId.id) {
          where.taskId = this.toIdString(filter.taskId);
        } else {
          for (const k of Object.keys(filter.taskId)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in TimerRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in TimerRepository filter: taskId");
        }
      } else {
        where.taskId = this.toIdString(filter.taskId);
      }
    }

    if (filter.status) {
      if (typeof filter.status === "string") {
        where.status = filter.status;
      } else if (typeof filter.status === "object" && filter.status !== null) {
        if (filter.status.$in && Array.isArray(filter.status.$in)) {
          where.status = { in: filter.status.$in };
        } else if (filter.status.in && Array.isArray(filter.status.in)) {
          where.status = { in: filter.status.in };
        } else {
          for (const k of Object.keys(filter.status)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in TimerRepository: ${k}`);
            }
          }
          throw new Error("Invalid status filter in TimerRepository");
        }
      }
    }

    return where;
  }

  async findOne(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const include = {};
        if (hasPopulate("project", options)) {
          include.project = { select: { id: true, name: true } };
        }
        if (hasPopulate("task", options)) {
          include.task = { select: { id: true, title: true } };
        }

        const queryOptions = { where };
        if (Object.keys(include).length > 0) {
          queryOptions.include = include;
        }

        const doc = await this.delegate.findFirst(queryOptions);
        if (!doc) return null;

        const formatted = this.formatTimer(doc);
        if (doc.project) formatted.project = this.serialize(doc.project);
        if (doc.task) formatted.task = this.serialize(doc.task);
        return formatted;
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.findOne(filter);
    const session = (options && options.session) || (isMongo() && typeof getAmbientTransaction === "function" ? getAmbientTransaction() : null);
    if (session) {
      query = query.session(session);
    }
    if (hasPopulate("project", options)) {
      query = query.populate("project", "name");
    }
    if (hasPopulate("task", options)) {
      query = query.populate("task", "title");
    }
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
        const include = {};
        if (hasPopulate("project", options)) {
          include.project = { select: { id: true, name: true } };
        }
        if (hasPopulate("task", options)) {
          include.task = { select: { id: true, title: true } };
        }

        const queryOptions = { where };
        if (Object.keys(include).length > 0) queryOptions.include = include;
        if (options.sort) {
          const [sortField, sortDir] = Object.entries(options.sort)[0] || ["createdAt", -1];
          queryOptions.orderBy = { [sortField]: sortDir === -1 || sortDir === "desc" ? "desc" : "asc" };
        }
        if (options.skip !== undefined) queryOptions.skip = Number(options.skip);
        if (options.limit !== undefined) queryOptions.take = Number(options.limit);

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => {
          const formatted = this.formatTimer(d);
          if (d.project) formatted.project = this.serialize(d.project);
          if (d.task) formatted.task = this.serialize(d.task);
          return formatted;
        });
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.find(filter);
    if (hasPopulate("project", options)) {
      query = query.populate("project", "name");
    }
    if (hasPopulate("task", options)) {
      query = query.populate("task", "title");
    }
    if (options.sort) query = query.sort(options.sort);
    if (options.skip !== undefined) query = query.skip(Number(options.skip));
    if (options.limit !== undefined) query = query.limit(Number(options.limit));
    const docs = await query;
    return docs.map((d) => this.serialize(d.toObject ? d.toObject() : d));
  }

  async create(data, options = {}) {
    if (Array.isArray(data)) {
      const results = [];
      for (const item of data) {
        results.push(await this.create(item, options));
      }
      return results;
    }

    if (isPostgres()) {
      try {
        if (!data || typeof data !== "object") {
          throw new Error("TimerRepository.create requires a valid data object");
        }

        // Validate conflicting alias fields
        if (data.user !== undefined && data.userId !== undefined) {
          if (this.toIdString(data.user) !== this.toIdString(data.userId)) {
            throw new Error("Conflicting values for 'user' and 'userId' in TimerRepository.create");
          }
        }
        if (data.project !== undefined && data.projectId !== undefined) {
          if (this.toIdString(data.project) !== this.toIdString(data.projectId)) {
            throw new Error("Conflicting values for 'project' and 'projectId' in TimerRepository.create");
          }
        }
        if (data.task !== undefined && data.taskId !== undefined) {
          if (this.toIdString(data.task) !== this.toIdString(data.taskId)) {
            throw new Error("Conflicting values for 'task' and 'taskId' in TimerRepository.create");
          }
        }

        const userId = this.toIdString(data.user || data.userId);
        if (!userId) {
          throw new Error("Cannot create Timer without valid userId");
        }

        const projectId = this.toIdString(data.project || data.projectId);
        const taskId = this.toIdString(data.task || data.taskId);
        const newId = data._id ? this.toIdString(data._id) : (data.id ? this.toIdString(data.id) : generateId());

        let startTime = new Date();
        if (data.startTime !== undefined && data.startTime !== null) {
          const d = data.startTime instanceof Date ? data.startTime : new Date(data.startTime);
          if (isNaN(d.getTime())) {
            throw new Error("Invalid date value in TimerRepository.create: startTime");
          }
          startTime = d;
        }

        let endTime = null;
        if (data.endTime !== undefined && data.endTime !== null) {
          const d = data.endTime instanceof Date ? data.endTime : new Date(data.endTime);
          if (isNaN(d.getTime())) {
            throw new Error("Invalid date value in TimerRepository.create: endTime");
          }
          endTime = d;
        }

        let duration = 0;
        if (data.duration !== undefined && data.duration !== null) {
          const num = Number(data.duration);
          if (isNaN(num) || num < 0) {
            throw new Error("Invalid duration in TimerRepository.create");
          }
          duration = num;
        }

        let status = "stopped";
        if (data.status !== undefined && data.status !== null) {
          if (typeof data.status !== "string" || !ALLOWED_TIMER_STATUSES.has(data.status.trim())) {
            throw new Error(`Invalid status in TimerRepository.create: ${data.status}`);
          }
          status = data.status.trim();
        }

        const createData = {
          id: newId,
          userId,
          projectId: projectId || null,
          taskId: taskId || null,
          startTime,
          endTime,
          duration,
          status,
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatTimer(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const session = (options && options.session) || (isMongo() && typeof getAmbientTransaction === "function" ? getAmbientTransaction() : null);
    if (session) {
      const docs = Array.isArray(data) ? data : [data];
      const res = await this.mongooseModel.create(docs, { session });
      if (Array.isArray(data)) {
        return res.map((d) => this.serialize(d.toObject ? d.toObject() : d));
      }
      const doc = res[0];
      return this.serialize(doc.toObject ? doc.toObject() : doc);
    }

    const doc = await this.mongooseModel.create(data);
    if (Array.isArray(doc)) {
      return doc.map((d) => this.serialize(d.toObject ? d.toObject() : d));
    }
    return this.serialize(doc.toObject ? doc.toObject() : doc);
  }

  _buildTimerPatch(rawPayload, existing = null) {
    const patch = {};

    if (rawPayload.startTime !== undefined) {
      if (rawPayload.startTime === null) {
        patch.startTime = null;
      } else {
        const d = rawPayload.startTime instanceof Date ? rawPayload.startTime : new Date(rawPayload.startTime);
        if (isNaN(d.getTime())) {
          throw new Error("Invalid date value in TimerRepository update: startTime");
        }
        patch.startTime = d;
      }
    }

    if (rawPayload.endTime !== undefined) {
      if (rawPayload.endTime === null) {
        patch.endTime = null;
      } else {
        const d = rawPayload.endTime instanceof Date ? rawPayload.endTime : new Date(rawPayload.endTime);
        if (isNaN(d.getTime())) {
          throw new Error("Invalid date value in TimerRepository update: endTime");
        }
        patch.endTime = d;
      }
    }

    if (rawPayload.duration !== undefined) {
      if (rawPayload.duration === null) {
        patch.duration = 0;
      } else {
        const num = Number(rawPayload.duration);
        if (isNaN(num) || num < 0) {
          throw new Error("Invalid duration in TimerRepository update");
        }
        patch.duration = num;
      }
    }

    if (rawPayload.status !== undefined) {
      if (typeof rawPayload.status !== "string" || !ALLOWED_TIMER_STATUSES.has(rawPayload.status.trim())) {
        throw new Error(`Invalid status in TimerRepository update: ${rawPayload.status}`);
      }
      patch.status = rawPayload.status.trim();
    }

    if (rawPayload.project !== undefined || rawPayload.projectId !== undefined) {
      const pVal = rawPayload.project !== undefined ? rawPayload.project : rawPayload.projectId;
      patch.projectId = pVal ? this.toIdString(pVal) : null;
    }

    if (rawPayload.task !== undefined || rawPayload.taskId !== undefined) {
      const tVal = rawPayload.task !== undefined ? rawPayload.task : rawPayload.taskId;
      patch.taskId = tVal ? this.toIdString(tVal) : null;
    }

    // Prune unchanged fields when existing record is provided
    if (existing) {
      for (const k of Object.keys(patch)) {
        if (isTimerFieldUnchanged(k, patch[k], existing)) {
          delete patch[k];
        }
      }
    }

    return patch;
  }

  async findOneAndUpdate(filter, updateData, options = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("TimerRepository.findOneAndUpdate requires a valid filter object");
    }
    if (!updateData || typeof updateData !== "object" || Array.isArray(updateData)) {
      throw new Error("TimerRepository.findOneAndUpdate requires a valid update object");
    }

    if (isPostgres()) {
      try {
        for (const key of Object.keys(filter)) {
          if (key.startsWith("$")) {
            throw new Error(`Unsupported filter operator in TimerRepository: ${key}`);
          }
        }

        for (const key of Object.keys(updateData)) {
          if (key.startsWith("$") && key !== "$set") {
            throw new Error(`Unsupported update operator in TimerRepository: ${key}`);
          }
        }

        if (updateData.$set !== undefined) {
          if (!updateData.$set || typeof updateData.$set !== "object" || Array.isArray(updateData.$set)) {
            throw new Error("Invalid $set envelope in TimerRepository.findOneAndUpdate");
          }
          for (const key of Object.keys(updateData.$set)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in TimerRepository: ${key}`);
            }
          }
        }

        const directFields = { ...updateData };
        delete directFields.$set;
        const setFields = updateData.$set || {};

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
          if (!ALLOWED_TIMER_UPDATE_FIELDS.has(key) && !ALLOWED_TIMER_PASSTHROUGH_FIELDS.has(key)) {
            throw new Error(`Unsupported update field in TimerRepository: ${key}`);
          }
        }

        // Detect conflicting aliases
        if (rawPayload._id !== undefined && rawPayload.id !== undefined) {
          if (this.toIdString(rawPayload._id) !== this.toIdString(rawPayload.id)) {
            throw new Error("Conflicting update values for '_id' and 'id' in TimerRepository");
          }
        }
        if (rawPayload.user !== undefined && rawPayload.userId !== undefined) {
          if (this.toIdString(rawPayload.user) !== this.toIdString(rawPayload.userId)) {
            throw new Error("Conflicting update values for 'user' and 'userId' in TimerRepository");
          }
        }
        if (rawPayload.project !== undefined && rawPayload.projectId !== undefined) {
          if (this.toIdString(rawPayload.project) !== this.toIdString(rawPayload.projectId)) {
            throw new Error("Conflicting update values for 'project' and 'projectId' in TimerRepository");
          }
        }
        if (rawPayload.task !== undefined && rawPayload.taskId !== undefined) {
          if (this.toIdString(rawPayload.task) !== this.toIdString(rawPayload.taskId)) {
            throw new Error("Conflicting update values for 'task' and 'taskId' in TimerRepository");
          }
        }

        let existing = options._existing || null;
        if (!existing) {
          const filterKeys = Object.keys(filter);
          if (filterKeys.length === 1 && (filter._id || filter.id)) {
            const targetId = this.toIdString(filter._id || filter.id);
            existing = await this.findById(targetId, options);
          } else {
            existing = await this.findOne(filter, options);
          }
        }

        if (!existing) {
          return null;
        }

        const existingId = this.toIdString(existing.id || existing._id);
        const existingUserId = this.toIdString(existing.userId || existing.user);

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
        if (rawPayload.organization !== undefined) {
          throw new Error("Cannot update immutable field: organization");
        }
        if (rawPayload.organizationId !== undefined) {
          throw new Error("Cannot update immutable field: organizationId");
        }

        const incomingUser = rawPayload.userId !== undefined ? rawPayload.userId : rawPayload.user;
        if (incomingUser !== undefined) {
          const userStr = this.toIdString(incomingUser);
          if (userStr !== existingUserId) {
            throw new Error("Cannot update immutable field: userId");
          }
        }

        const patch = this._buildTimerPatch(rawPayload, existing);

        // Avoid empty/ineffective updates
        if (Object.keys(patch).length === 0) {
          if (options._meta) options._meta.modified = false;
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
        if (options._meta) options._meta.modified = true;
        const returnOriginal = options.new === false || options.returnDocument === "before";
        if (returnOriginal) {
          return existing;
        }
        return this.formatTimer(updatedDoc, options);
      } catch (err) {
        if (err && err.code === "P2025") {
          return null;
        }
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.findOneAndUpdate(filter, updateData, options);
    if (hasPopulate("project", options)) query = query.populate("project", "name");
    if (hasPopulate("task", options)) query = query.populate("task", "title");
    const doc = await query;
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findByIdAndUpdate(id, updateData, options = { new: true }) {
    const idStr = this.toIdString(id);
    if (!idStr || typeof idStr !== "string" || !idStr.trim() || idStr === "[object Object]") {
      if (isPostgres()) {
        throw new Error("Invalid identifier in TimerRepository.findByIdAndUpdate");
      }
      return null;
    }

    if (!updateData || typeof updateData !== "object" || Array.isArray(updateData)) {
      if (isPostgres()) {
        throw new Error("TimerRepository.findByIdAndUpdate requires a valid update object");
      }
      return null;
    }

    if (isPostgres()) {
      return this.findOneAndUpdate({ _id: idStr }, updateData, options);
    }

    let query = this.mongooseModel.findByIdAndUpdate(idStr, updateData, options);
    if (hasPopulate("project", options)) query = query.populate("project", "name");
    if (hasPopulate("task", options)) query = query.populate("task", "title");
    const doc = await query;
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async updateById(id, updateData, options = { new: true }) {
    return this.findByIdAndUpdate(id, updateData, options);
  }

  async updateOne(filter, updateData, options = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("TimerRepository.updateOne requires a valid filter object");
    }
    if (!updateData || typeof updateData !== "object" || Array.isArray(updateData)) {
      throw new Error("TimerRepository.updateOne requires a valid update object");
    }

    if (isPostgres()) {
      try {
        const filterKeys = Object.keys(filter);
        let existing = null;
        if (filterKeys.length === 1 && (filter._id || filter.id)) {
          const targetId = this.toIdString(filter._id || filter.id);
          existing = await this.findById(targetId, options);
        } else {
          existing = await this.findOne(filter, options);
        }

        if (!existing) {
          return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
        }

        const meta = {};
        const updated = await this.findOneAndUpdate(filter, updateData, { ...options, _existing: existing, _meta: meta, new: true });
        if (!updated) {
          return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
        }
        return {
          acknowledged: true,
          matchedCount: 1,
          modifiedCount: meta.modified ? 1 : 0,
        };
      } catch (err) {
        this.handleError(err);
      }
    }

    const res = await this.mongooseModel.updateOne(filter, updateData, options);
    return {
      acknowledged: res?.acknowledged ?? true,
      matchedCount: res?.matchedCount ?? (res?.n ?? 0),
      modifiedCount: res?.modifiedCount ?? (res?.nModified ?? 0),
    };
  }

  async deleteMany(filter = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("TimerRepository.deleteMany requires a valid filter object");
        }

        const where = this.buildWhere(filter);
        if (Object.keys(where).length === 0) {
          throw new Error("Bulk deletion requires a valid scoped filter in TimerRepository.deleteMany");
        }

        const res = await this.delegate.deleteMany({ where });
        return { deletedCount: res.count };
      } catch (err) {
        this.handleError(err);
      }
    }

    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("TimerRepository.deleteMany requires a valid filter object");
    }
    return this.mongooseModel.deleteMany(filter);
  }

  /**
   * Atomically claims the stop transition for a running timer matching timer ID and status = 'running'.
   *
   * In PostgreSQL mode:
   * Uses this.delegate.updateMany({ where: { id: idStr, status: 'running', ... }, data: patch })
   * which produces an atomic UPDATE with count = 1 on successful claim, or count = 0 if already stopped or concurrently claimed.
   *
   * In MongoDB mode:
   * Uses this.mongooseModel.findOneAndUpdate({ _id: idStr, status: 'running', ... }, { $set: patch }, { new: true })
   * which atomically claims the running document or returns null if already stopped.
   *
   * @param {string|Object} id - The timer ID to stop
   * @param {Object} [data] - The update payload ({ endTime, duration, status: 'stopped' })
   * @param {Object} [options] - Optional scoped filters ({ userId, organizationId }) and population options
   * @returns {Promise<{ count: number, claimed: boolean, timer: Object|null }>}
   */
  async stopTimerIfRunning(id, data = {}, options = {}) {
    if (!id) {
      throw new Error("TimerRepository.stopTimerIfRunning requires a valid id");
    }
    const idStr = this.toIdString(id);
    if (!idStr || typeof idStr !== "string" || !idStr.trim() || idStr === "[object Object]") {
      if (isPostgres()) {
        throw new Error("Invalid identifier in TimerRepository.stopTimerIfRunning");
      }
      return { count: 0, claimed: false, timer: null };
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("TimerRepository.stopTimerIfRunning requires a valid update object");
    }

    for (const key of Object.keys(data)) {
      if (key.startsWith("$") && key !== "$set") {
        throw new Error(`Unsupported update operator in TimerRepository.stopTimerIfRunning: ${key}`);
      }
    }

    if (data.$set !== undefined) {
      if (!data.$set || typeof data.$set !== "object" || Array.isArray(data.$set)) {
        throw new Error("Invalid $set envelope in TimerRepository.stopTimerIfRunning");
      }
      for (const key of Object.keys(data.$set)) {
        if (key.startsWith("$")) {
          throw new Error(`Unsupported update operator in TimerRepository.stopTimerIfRunning: ${key}`);
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

    const allowedStopFields = new Set([
      "endTime",
      "duration",
      "status",
      "_id",
      "id",
      "user",
      "userId",
      "$set",
      "save",
      "toObject",
      "toJSON",
    ]);

    for (const key of Object.keys(rawPayload)) {
      if (typeof rawPayload[key] === "function") continue;
      if (!allowedStopFields.has(key)) {
        throw new Error(`Unsupported field in TimerRepository.stopTimerIfRunning: ${key}`);
      }
    }

    if (rawPayload.status !== undefined && rawPayload.status !== null) {
      if (typeof rawPayload.status !== "string" || rawPayload.status.trim() !== "stopped") {
        throw new Error(`Invalid status transition in TimerRepository.stopTimerIfRunning: ${rawPayload.status}`);
      }
    }

    let endTime = new Date();
    if (rawPayload.endTime !== undefined && rawPayload.endTime !== null) {
      const d = rawPayload.endTime instanceof Date ? rawPayload.endTime : new Date(rawPayload.endTime);
      if (isNaN(d.getTime())) {
        throw new Error("Invalid date value in TimerRepository.stopTimerIfRunning: endTime");
      }
      endTime = d;
    }

    let duration = 0;
    if (rawPayload.duration !== undefined && rawPayload.duration !== null) {
      const num = Number(rawPayload.duration);
      if (isNaN(num) || num < 0) {
        throw new Error("Invalid duration in TimerRepository.stopTimerIfRunning");
      }
      duration = num;
    }

    const patch = {
      endTime,
      duration,
      status: "stopped",
    };

    if (isPostgres()) {
      try {
        const where = {
          id: idStr,
          status: "running",
        };
        if (options.userId) {
          where.userId = this.toIdString(options.userId);
        }

        const res = await this.delegate.updateMany({
          where,
          data: patch,
        });

        if (res.count === 0) {
          return { count: 0, claimed: false, timer: null };
        }

        const updated = await this.findById(idStr, options);
        return {
          count: res.count,
          claimed: true,
          timer: updated,
        };
      } catch (err) {
        this.handleError(err);
      }
    }

    // MongoDB delegation
    const mongoFilter = {
      _id: idStr,
      status: "running",
    };
    if (options.userId) {
      mongoFilter.user = this.toIdString(options.userId);
    }

    const session = (options && options.session) || (isMongo() && typeof getAmbientTransaction === "function" ? getAmbientTransaction() : null);
    const queryOptions = { new: true };
    if (session && isMongo()) {
      queryOptions.session = session;
    }

    let query = this.mongooseModel.findOneAndUpdate(
      mongoFilter,
      { $set: patch },
      queryOptions
    );
    if (hasPopulate("project", options)) query = query.populate("project", "name");
    if (hasPopulate("task", options)) query = query.populate("task", "title");

    const doc = await query;
    if (!doc) {
      return { count: 0, claimed: false, timer: null };
    }

    return {
      count: 1,
      claimed: true,
      timer: this.serialize(doc.toObject ? doc.toObject() : doc),
    };
  }

  /**
   * Scopes active timer lookup strictly by user ID.
   */
  async findActiveTimerByUser(userId) {
    const targetUserId = this.toIdString(userId);
    if (!targetUserId) return null;
    return this.findOne(
      { user: targetUserId, status: "running" },
      { populateProject: true, populateTask: true }
    );
  }

  /**
   * Scopes timer lookup strictly by timer ID and user ID.
   */
  async findTimerByIdAndUser(id, userId, options = {}) {
    const targetId = this.toIdString(id);
    const targetUserId = this.toIdString(userId);
    if (!targetId || !targetUserId) return null;
    return this.findOne({ _id: targetId, user: targetUserId }, options);
  }

  /**
   * Scopes timer lookup strictly by timer ID, user ID, and organization ID.
   */
  async findTimerByIdAndUserAndOrganization(id, userId, organizationId, options = {}) {
    const targetId = this.toIdString(id);
    const targetUserId = this.toIdString(userId);
    const targetOrgId = this.toIdString(organizationId);
    if (!targetId || !targetUserId || !targetOrgId) return null;

    if (isPostgres()) {
      try {
        const where = {
          id: targetId,
          userId: targetUserId,
          user: {
            organizationId: targetOrgId,
          },
        };
        const include = {};
        if (hasPopulate("project", options)) {
          include.project = { select: { id: true, name: true } };
        }
        if (hasPopulate("task", options)) {
          include.task = { select: { id: true, title: true } };
        }
        const queryOptions = { where };
        if (Object.keys(include).length > 0) queryOptions.include = include;

        const doc = await this.delegate.findFirst(queryOptions);
        if (!doc) return null;

        const formatted = this.formatTimer(doc);
        if (doc.project) formatted.project = this.serialize(doc.project);
        if (doc.task) formatted.task = this.serialize(doc.task);
        return formatted;
      } catch (err) {
        this.handleError(err);
      }
    }

    const timer = await this.findOne({ _id: targetId, user: targetUserId }, options);
    if (!timer) return null;
    const User = (await import("../models/user.model.js")).default;
    const user = await User.findById(targetUserId);
    if (!user || this.toIdString(user.organizationId || user.organization) !== targetOrgId) {
      return null;
    }
    return timer;
  }
}

export const timerRepository = new TimerRepository();
export default timerRepository;
