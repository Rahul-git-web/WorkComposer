import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

function formatUserRelation(userDoc) {
  if (!userDoc || typeof userDoc !== "object") return null;
  const user = { ...userDoc };
  if (user.id && !user._id) user._id = String(user.id);
  if (user._id && !user.id) user.id = String(user._id);

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
  delete user.googleId;
  delete user.microsoftId;
  delete user.appleId;

  return user;
}

function hasPopulate(name, options = {}) {
  if (!options) return false;
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  if (options[`populate${cap}`]) return true;
  if (!options.populate) return false;
  if (options.populate === true) return true;
  if (typeof options.populate === "string") {
    return options.populate.split(/\s+/).includes(name) || options.populate === name;
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

const ALLOWED_DATE_OPERATORS = new Set([
  "$gte", "gte",
  "$gt", "gt",
  "$lte", "lte",
  "$lt", "lt",
  "$eq", "equals",
  "$ne", "not",
]);

export class CommentRepository extends BaseRepository {
  constructor() {
    super("Comment");
  }

  formatComment(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    serialized.task = serialized.task || serialized.taskId;
    if (doc.user && typeof doc.user === "object") {
      serialized.user = formatUserRelation(this.serialize(doc.user));
    } else {
      serialized.user = serialized.user || serialized.userId;
    }
    delete serialized.taskId;
    delete serialized.userId;
    if (!Array.isArray(serialized.readBy)) {
      serialized.readBy = [];
    }
    return serialized;
  }

  async findById(id, options = {}) {
    const idStr = this.toIdString(id);
    if (!idStr) return null;

    if (isPostgres()) {
      try {
        const include = {};
        if (hasPopulate("user", options)) include.user = true;
        if (hasPopulate("task", options)) include.task = true;

        const queryOptions = { where: { id: idStr } };
        if (Object.keys(include).length > 0) {
          queryOptions.include = include;
        }

        const doc = await this.delegate.findUnique(queryOptions);
        if (!doc) return null;
        const formatted = this.formatComment(doc);
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
    } else if (options.populateUser) {
      query = query.populate("user", "firstName lastName avatar");
    }
    const doc = await query;
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  _buildCreatedAtFilter(val, fieldName = "createdAt") {
    if (val === null || val === undefined) {
      throw new Error(`Invalid date value in CommentRepository filter: ${fieldName}`);
    }

    if (val instanceof Date) {
      if (isNaN(val.getTime())) {
        throw new Error(`Invalid date value in CommentRepository filter: ${fieldName}`);
      }
      return val;
    }

    if (typeof val === "string" || typeof val === "number") {
      if (typeof val === "string" && !val.trim()) {
        throw new Error(`Invalid date value in CommentRepository filter: ${fieldName}`);
      }
      const d = new Date(val);
      if (isNaN(d.getTime())) {
        throw new Error(`Invalid date value in CommentRepository filter: ${fieldName}`);
      }
      return d;
    }

    if (typeof val === "object" && !Array.isArray(val)) {
      const keys = Object.keys(val);
      if (keys.length === 0) {
        throw new Error(`Invalid date range in CommentRepository filter: ${fieldName} cannot be an empty object`);
      }

      for (const op of keys) {
        if (!ALLOWED_DATE_OPERATORS.has(op)) {
          if (op.startsWith("$")) {
            throw new Error(`Unsupported filter operator in CommentRepository: ${op}`);
          }
          throw new Error(`Unsupported date range operator in CommentRepository: ${op}`);
        }
      }

      const dateCond = {};
      const parseDate = (v, op) => {
        if (v === null || v === undefined || (typeof v === "string" && !v.trim())) {
          throw new Error(`Invalid date value for operator ${op} in CommentRepository filter: ${fieldName}`);
        }
        const parsed = v instanceof Date ? v : new Date(v);
        if (isNaN(parsed.getTime())) {
          throw new Error(`Invalid date value for operator ${op} in CommentRepository filter: ${fieldName}`);
        }
        return parsed;
      };

      if (val.$gte !== undefined) dateCond.gte = parseDate(val.$gte, "$gte");
      if (val.gte !== undefined) dateCond.gte = parseDate(val.gte, "gte");
      if (val.$gt !== undefined) dateCond.gt = parseDate(val.$gt, "$gt");
      if (val.gt !== undefined) dateCond.gt = parseDate(val.gt, "gt");
      if (val.$lte !== undefined) dateCond.lte = parseDate(val.$lte, "$lte");
      if (val.lte !== undefined) dateCond.lte = parseDate(val.lte, "lte");
      if (val.$lt !== undefined) dateCond.lt = parseDate(val.$lt, "$lt");
      if (val.lt !== undefined) dateCond.lt = parseDate(val.lt, "lt");
      if (val.$eq !== undefined) dateCond.equals = parseDate(val.$eq, "$eq");
      if (val.equals !== undefined) dateCond.equals = parseDate(val.equals, "equals");
      if (val.$ne !== undefined) dateCond.not = parseDate(val.$ne, "$ne");
      if (val.not !== undefined) dateCond.not = parseDate(val.not, "not");

      const lowerBound = dateCond.gte || dateCond.gt;
      const upperBound = dateCond.lte || dateCond.lt;
      if (lowerBound && upperBound && lowerBound.getTime() > upperBound.getTime()) {
        throw new Error(`Invalid date range in CommentRepository filter: lower bound cannot be after upper bound in ${fieldName}`);
      }

      return dateCond;
    }

    throw new Error(`Invalid date value in CommentRepository filter: ${fieldName}`);
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = {};
        if (filter.task) where.taskId = this.toIdString(filter.task);
        if (filter.taskId) where.taskId = this.toIdString(filter.taskId);
        if (filter.user) where.userId = this.toIdString(filter.user);
        if (filter.userId) where.userId = this.toIdString(filter.userId);
        if (filter._id) where.id = this.toIdString(filter._id);
        if (filter.id) where.id = this.toIdString(filter.id);
        if (filter.createdAt !== undefined) {
          where.createdAt = this._buildCreatedAtFilter(filter.createdAt, "createdAt");
        } else if (filter.date !== undefined) {
          where.createdAt = this._buildCreatedAtFilter(filter.date, "date");
        }
        if (filter.updatedAt !== undefined) {
          where.updatedAt = this._buildCreatedAtFilter(filter.updatedAt, "updatedAt");
        }

        const queryOptions = {
          where,
          orderBy: { createdAt: options.sort?.createdAt === 1 ? "asc" : "desc" },
        };
        if (options.populateUser || options.populate) {
          queryOptions.include = {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          };
        }

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => this.formatComment(d));
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.find(filter);
    if (options.populateUser) query = query.populate("user", "firstName lastName avatar");
    if (options.sort) query = query.sort(options.sort);
    const docs = await query;
    return docs.map((d) => this.serialize(d.toObject ? d.toObject() : d));
  }

  async countDocuments(filter = {}) {
    if (isPostgres()) {
      try {
        const prisma = this.prisma;
        const taskId = this.toIdString(filter.task || filter.taskId);

        let excludedUserId = null;
        if (filter.user && typeof filter.user === "object" && filter.user.$ne) {
          excludedUserId = this.toIdString(filter.user.$ne);
        } else if (filter.userId && typeof filter.userId === "object" && filter.userId.$ne) {
          excludedUserId = this.toIdString(filter.userId.$ne);
        }

        let unreadForUserId = null;
        if (filter.readBy?.$nin?.[0]) {
          unreadForUserId = this.toIdString(filter.readBy.$nin[0]);
        } else if (Array.isArray(filter.$or)) {
          for (const cond of filter.$or) {
            if (cond.readBy?.$nin?.[0]) {
              unreadForUserId = this.toIdString(cond.readBy.$nin[0]);
              break;
            }
          }
        }

        if (taskId && (excludedUserId || unreadForUserId)) {
          if (excludedUserId && unreadForUserId) {
            const [result] = await prisma.$queryRaw`
              SELECT COUNT(*)::int as count
              FROM "comments"
              WHERE "task_id" = ${taskId}
                AND "user_id" != ${excludedUserId}
                AND NOT (${unreadForUserId} = ANY("readBy"))
            `;
            return result ? result.count : 0;
          } else if (excludedUserId) {
            const [result] = await prisma.$queryRaw`
              SELECT COUNT(*)::int as count
              FROM "comments"
              WHERE "task_id" = ${taskId}
                AND "user_id" != ${excludedUserId}
            `;
            return result ? result.count : 0;
          } else if (unreadForUserId) {
            const [result] = await prisma.$queryRaw`
              SELECT COUNT(*)::int as count
              FROM "comments"
              WHERE "task_id" = ${taskId}
                AND NOT (${unreadForUserId} = ANY("readBy"))
            `;
            return result ? result.count : 0;
          }
        }

        const where = {};
        if (taskId) where.taskId = taskId;
        if (filter.user && typeof filter.user === "string") where.userId = this.toIdString(filter.user);
        if (filter.userId && typeof filter.userId === "string") where.userId = this.toIdString(filter.userId);
        if (filter.createdAt !== undefined) {
          where.createdAt = this._buildCreatedAtFilter(filter.createdAt, "createdAt");
        } else if (filter.date !== undefined) {
          where.createdAt = this._buildCreatedAtFilter(filter.date, "date");
        }
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
        const taskId = this.toIdString(data.task || data.taskId);
        const userId = this.toIdString(data.user || data.userId);
        const newId = data._id ? this.toIdString(data._id) : generateId();

        const createData = {
          id: newId,
          taskId,
          userId,
          content: data.content || data.message || "",
          readBy: Array.isArray(data.readBy) ? data.readBy.map((id) => this.toIdString(id)) : [userId],
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatComment(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.create(data);
    return this.serialize(doc.toObject ? doc.toObject() : doc);
  }

  async markCommentsAsRead(taskId, userId) {
    const taskIdStr = this.toIdString(taskId);
    const userIdStr = this.toIdString(userId);
    if (!taskIdStr || !userIdStr) return;

    if (isPostgres()) {
      try {
        const prisma = this.prisma;
        // Atomic array_append that avoids duplicates
        await prisma.$executeRaw`
          UPDATE "comments"
          SET "readBy" = array_append("readBy", ${userIdStr})
          WHERE "task_id" = ${taskIdStr}
            AND NOT (${userIdStr} = ANY("readBy"))
        `;
        return;
      } catch (err) {
        this.handleError(err);
      }
    }

    await this.mongooseModel.updateMany(
      { task: taskIdStr, readBy: { $nin: [userIdStr] } },
      { $addToSet: { readBy: userIdStr } }
    );
  }

  async findByIdAndUpdate(id, updateData, options = { new: true }) {
    const idStr = this.toIdString(id);
    if (!idStr || typeof idStr !== "string" || !idStr.trim() || idStr === "[object Object]") {
      if (isPostgres()) {
        throw new Error("Invalid identifier in CommentRepository.findByIdAndUpdate");
      }
      return null;
    }

    if (!updateData || typeof updateData !== "object" || Array.isArray(updateData)) {
      if (isPostgres()) {
        throw new Error("CommentRepository.findByIdAndUpdate requires a valid update object");
      }
      return null;
    }

    if (isPostgres()) {
      try {
        for (const key of Object.keys(updateData)) {
          if (key.startsWith("$") && key !== "$set") {
            throw new Error(`Unsupported update operator in CommentRepository: ${key}`);
          }
        }

        if (updateData.$set !== undefined) {
          if (!updateData.$set || typeof updateData.$set !== "object" || Array.isArray(updateData.$set)) {
            throw new Error("Invalid $set envelope in CommentRepository.findByIdAndUpdate");
          }
          for (const key of Object.keys(updateData.$set)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in CommentRepository: ${key}`);
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
          "content",
          "message",
          "edited",
          "readBy",
        ]);

        const ALLOWED_PASSTHROUGH_FIELDS = new Set([
          "_id",
          "id",
          "task",
          "taskId",
          "user",
          "userId",
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
            throw new Error(`Unsupported update field in CommentRepository: ${key}`);
          }
        }

        // Detect conflicting aliases
        if (rawPayload._id !== undefined && rawPayload.id !== undefined) {
          if (this.toIdString(rawPayload._id) !== this.toIdString(rawPayload.id)) {
            throw new Error("Conflicting update values for '_id' and 'id' in CommentRepository.findByIdAndUpdate");
          }
        }

        if (rawPayload.task !== undefined && rawPayload.taskId !== undefined) {
          if (this.toIdString(rawPayload.task) !== this.toIdString(rawPayload.taskId)) {
            throw new Error("Conflicting update values for 'task' and 'taskId' in CommentRepository.findByIdAndUpdate");
          }
        }

        if (rawPayload.user !== undefined && rawPayload.userId !== undefined) {
          if (this.toIdString(rawPayload.user) !== this.toIdString(rawPayload.userId)) {
            throw new Error("Conflicting update values for 'user' and 'userId' in CommentRepository.findByIdAndUpdate");
          }
        }

        if (rawPayload.content !== undefined && rawPayload.message !== undefined) {
          const contentVal = typeof rawPayload.content === "string" ? rawPayload.content.trim() : rawPayload.content;
          const messageVal = typeof rawPayload.message === "string" ? rawPayload.message.trim() : rawPayload.message;
          if (contentVal !== messageVal) {
            throw new Error("Conflicting update values for 'content' and 'message' in CommentRepository.findByIdAndUpdate");
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

        // Validate immutable task and user ownership against existing record
        if (existing) {
          if (rawPayload.task !== undefined && this.toIdString(rawPayload.task) !== existing.taskId) {
            throw new Error("Cannot update immutable field: task");
          }
          if (rawPayload.taskId !== undefined && this.toIdString(rawPayload.taskId) !== existing.taskId) {
            throw new Error("Cannot update immutable field: taskId");
          }
          if (rawPayload.user !== undefined && this.toIdString(rawPayload.user) !== existing.userId) {
            throw new Error("Cannot update immutable field: user");
          }
          if (rawPayload.userId !== undefined && this.toIdString(rawPayload.userId) !== existing.userId) {
            throw new Error("Cannot update immutable field: userId");
          }
        }

        const patch = {};

        // content / message
        const effectiveContent = rawPayload.content !== undefined ? rawPayload.content : rawPayload.message;
        if (effectiveContent !== undefined) {
          if (typeof effectiveContent !== "string" || !effectiveContent.trim()) {
            throw new Error("Invalid content in CommentRepository.findByIdAndUpdate");
          }
          patch.content = effectiveContent.trim();
        }

        // edited
        if (rawPayload.edited !== undefined) {
          if (typeof rawPayload.edited !== "boolean") {
            throw new Error("Invalid edited in CommentRepository.findByIdAndUpdate");
          }
          patch.edited = rawPayload.edited;
        }

        // readBy
        if (rawPayload.readBy !== undefined) {
          if (!Array.isArray(rawPayload.readBy)) {
            throw new Error("Invalid readBy in CommentRepository.findByIdAndUpdate");
          }
          patch.readBy = rawPayload.readBy.map((item) => this.toIdString(item)).filter(Boolean);
        }

        if (Object.keys(patch).length === 0) {
          if (existing) {
            return this.formatComment(existing);
          }
          return await this.findById(idStr);
        }

        const doc = await this.delegate.update({
          where: { id: idStr },
          data: patch,
        });
        return this.formatComment(doc);
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

  async updateMany(filter = {}, update = {}) {
    const taskId = this.toIdString(filter.task || filter.taskId);
    if (isPostgres()) {
      try {
        const prisma = this.prisma;
        if (taskId && update.$addToSet && update.$addToSet.readBy) {
          const userIdStr = this.toIdString(update.$addToSet.readBy);
          if (userIdStr) {
            const res = await prisma.$executeRaw`
              UPDATE "comments"
              SET "readBy" = array_append("readBy", ${userIdStr})
              WHERE "task_id" = ${taskId}
                AND NOT (${userIdStr} = ANY("readBy"))
            `;
            return { acknowledged: true, modifiedCount: res };
          }
        }
        return { acknowledged: true, modifiedCount: 0 };
      } catch (err) {
        this.handleError(err);
      }
    }

    return await this.mongooseModel.updateMany(filter, update);
  }

  async findByIdAndDelete(id) {
    const idStr = this.toIdString(id);
    if (!idStr) return null;

    if (isPostgres()) {
      try {
        const doc = await this.delegate.delete({ where: { id: idStr } });
        return this.formatComment(doc);
      } catch (err) {
        if (err && err.code === "P2025") {
          return null;
        }
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findByIdAndDelete(idStr);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }
}

export const commentRepository = new CommentRepository();
export default commentRepository;
