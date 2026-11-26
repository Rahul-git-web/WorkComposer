import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

export class EmailChangeRepository extends BaseRepository {
  constructor() {
    super("EmailChange");
  }

  formatEmailChange(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    serialized.user = serialized.user || serialized.userId;
    return serialized;
  }

  buildWhere(filter = {}) {
    const where = {};

    for (const key of Object.keys(filter || {})) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in EmailChangeRepository: ${key}`);
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
              throw new Error(`Unsupported filter operator in EmailChangeRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in EmailChangeRepository filter: _id");
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
              throw new Error(`Unsupported filter operator in EmailChangeRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in EmailChangeRepository filter: id");
        }
      } else {
        where.id = this.toIdString(filter.id);
      }
    }

    if (filter.token) {
      where.token = filter.token;
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
              throw new Error(`Unsupported filter operator in EmailChangeRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in EmailChangeRepository filter: user");
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
              throw new Error(`Unsupported filter operator in EmailChangeRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in EmailChangeRepository filter: userId");
        }
      } else {
        where.userId = this.toIdString(filter.userId);
      }
    }

    return where;
  }

  async findOne(filter = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const doc = await this.delegate.findFirst({ where });
        return doc ? this.formatEmailChange(doc) : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOne(filter);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async create(data) {
    if (isPostgres()) {
      try {
        const userId = this.toIdString(data.user || data.userId);
        const newId = data._id ? this.toIdString(data._id) : generateId();

        const createData = {
          id: newId,
          userId,
          newEmail: data.newEmail.toLowerCase().trim(),
          token: data.token,
          expireAt: data.expireAt ? new Date(data.expireAt) : new Date(Date.now() + 24 * 60 * 60 * 1000),
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatEmailChange(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.create(data);
    return this.serialize(doc.toObject ? doc.toObject() : doc);
  }

  async deleteOne(filter = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const existing = await this.delegate.findFirst({ where });
        if (existing) {
          await this.delegate.delete({ where: { id: existing.id } });
          return { deletedCount: 1 };
        }
        return { deletedCount: 0 };
      } catch (err) {
        this.handleError(err);
      }
    }

    return this.mongooseModel.deleteOne(filter);
  }

  async deleteMany(filter = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("EmailChangeRepository.deleteMany requires a valid filter object");
        }

        const where = this.buildWhere(filter);
        if (Object.keys(where).length === 0) {
          throw new Error("Bulk deletion requires a valid scoped filter in EmailChangeRepository.deleteMany");
        }

        const result = await this.delegate.deleteMany({ where });
        return { acknowledged: true, deletedCount: result.count };
      } catch (err) {
        this.handleError(err);
      }
    }

    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("EmailChangeRepository.deleteMany requires a valid filter object");
    }
    return this.mongooseModel.deleteMany(filter);
  }

  async findById(id) {
    if (isPostgres()) {
      try {
        const idStr = this.toIdString(id);
        const doc = await this.delegate.findUnique({ where: { id: idStr } });
        return doc ? this.formatEmailChange(doc) : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findById(id);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findByIdAndDelete(id) {
    if (isPostgres()) {
      try {
        const idStr = this.toIdString(id);
        const existing = await this.delegate.findUnique({ where: { id: idStr } });
        if (existing) {
          await this.delegate.delete({ where: { id: idStr } });
          return this.formatEmailChange(existing);
        }
        return null;
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findByIdAndDelete(id);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }
}

export const emailChangeRepository = new EmailChangeRepository();
export default emailChangeRepository;
