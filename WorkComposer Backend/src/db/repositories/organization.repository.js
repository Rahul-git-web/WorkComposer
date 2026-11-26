const ALLOWED_ORGANIZATION_FIND_FIELDS = new Set([
  "_id",
  "id",
  "name",
  "owner",
  "ownerId",
  "logo",
]);

import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

export class OrganizationRepository extends BaseRepository {
  constructor() {
    super("Organization");
  }

  formatOrganization(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    if (serialized.ownerId || serialized.owner) {
      serialized.owner = serialized.owner || serialized.ownerId;
    } else {
      delete serialized.owner;
    }
    delete serialized.ownerId;

    if (!serialized.twoFactor) {
      serialized.twoFactor = { owner: false, admin: false, manager: false, user: false };
    }
    if (!serialized.appUpdates) {
      serialized.appUpdates = { automaticUpdates: true, forceUpdates: false, desktopReleaseEmails: false };
    }
    if (!serialized.taskManagement) {
      serialized.taskManagement = { notifyTaskAssignedEmail: true };
    }
    if (!serialized.notifications) {
      serialized.notifications = {
        shiftStarted: true,
        shiftEndingSoon: true,
        breakStarted: true,
        breakEnded: true,
        dailyTargetReached: true,
        overtimeStarted: true,
      };
    }
    return serialized;
  }

  async findById(id) {
    const idStr = this.toIdString(id);
    if (!idStr) return null;

    if (isPostgres()) {
      try {
        const doc = await this.delegate.findUnique({ where: { id: idStr } });
        return this.formatOrganization(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findById(idStr);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  _extractAndValidateId(val, fieldName) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in OrganizationRepository filter for field: ${fieldName}`);
    }

    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) {
        throw new Error(`Invalid identifier in OrganizationRepository filter for field: ${fieldName}`);
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
      for (const k of Object.keys(val)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in OrganizationRepository: ${k}`);
        }
      }
      throw new Error(`Invalid identifier object in OrganizationRepository filter: ${fieldName}`);
    }

    const str = String(val).trim();
    if (str && str !== "[object Object]") {
      return str;
    }
    throw new Error(`Invalid identifier in OrganizationRepository filter for field: ${fieldName}`);
  }

  buildFindOneWhere(filter = {}) {
    const where = {};

    for (const key of Object.keys(filter || {})) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in OrganizationRepository: ${key}`);
      }
      if (!ALLOWED_ORGANIZATION_FIND_FIELDS.has(key)) {
        throw new Error(`Unsupported filter field in OrganizationRepository: ${key}`);
      }
    }

    if (filter._id !== undefined) {
      where.id = this._extractAndValidateId(filter._id, "_id");
    }
    if (filter.id !== undefined) {
      where.id = this._extractAndValidateId(filter.id, "id");
    }

    if (filter.name !== undefined) {
      if (filter.name instanceof RegExp) {
        const pattern = filter.name.source.replace(/^\^|\$/g, "");
        where.name = { equals: pattern, mode: "insensitive" };
      } else if (typeof filter.name === "string") {
        where.name = filter.name.trim();
      } else if (typeof filter.name === "object" && filter.name !== null) {
        if (filter.name.$regex) {
          const pattern = filter.name.$regex instanceof RegExp
            ? filter.name.$regex.source.replace(/^\^|\$/g, "")
            : String(filter.name.$regex).replace(/^\^|\$/g, "");
          where.name = { equals: pattern, mode: "insensitive" };
        } else if (filter.name.equals) {
          where.name = { equals: filter.name.equals, mode: filter.name.mode || "insensitive" };
        } else {
          for (const k of Object.keys(filter.name)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in OrganizationRepository: ${k}`);
            }
          }
          throw new Error("Invalid name filter in OrganizationRepository");
        }
      } else {
        throw new Error("Invalid name filter in OrganizationRepository");
      }
    }

    if (filter.owner !== undefined) {
      where.ownerId = this._extractAndValidateId(filter.owner, "owner");
    }
    if (filter.ownerId !== undefined) {
      where.ownerId = this._extractAndValidateId(filter.ownerId, "ownerId");
    }

    if (filter.logo !== undefined) {
      if (typeof filter.logo === "string") {
        where.logo = filter.logo;
      } else if (filter.logo instanceof RegExp) {
        const pattern = filter.logo.source.replace(/^\^|\$/g, "");
        where.logo = { contains: pattern, mode: "insensitive" };
      } else if (typeof filter.logo === "object" && filter.logo !== null) {
        if (filter.logo.$regex) {
          const pattern = filter.logo.$regex instanceof RegExp
            ? filter.logo.$regex.source.replace(/^\^|\$/g, "")
            : String(filter.logo.$regex).replace(/^\^|\$/g, "");
          where.logo = { contains: pattern, mode: "insensitive" };
        } else if (filter.logo.contains) {
          where.logo = { contains: filter.logo.contains, mode: filter.logo.mode || "insensitive" };
        } else {
          for (const k of Object.keys(filter.logo)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in OrganizationRepository: ${k}`);
            }
          }
          throw new Error("Invalid logo filter in OrganizationRepository");
        }
      } else {
        throw new Error("Invalid logo filter in OrganizationRepository");
      }
    }

    return where;
  }

  async findOne(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildFindOneWhere(filter);
        const queryOptions = { where };
        if (options.include) queryOptions.include = options.include;
        const doc = await this.delegate.findFirst(queryOptions);
        return doc ? this.formatOrganization(doc) : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOne(filter, options);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  _processIdFilter(val, fieldName = "_id") {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in OrganizationRepository filter for field: ${fieldName}`);
    }

    if (Array.isArray(val)) {
      if (val.length === 0) return { in: [] };
      return { in: val.map((item) => this._extractAndValidateId(item, fieldName)) };
    }

    if (typeof val === "object") {
      if (val.$in !== undefined) {
        if (!Array.isArray(val.$in)) {
          throw new Error(`Invalid array in OrganizationRepository filter: ${fieldName}`);
        }
        if (val.$in.length === 0) return { in: [] };
        return { in: val.$in.map((item) => this._extractAndValidateId(item, fieldName)) };
      }
      if (val.in !== undefined) {
        if (!Array.isArray(val.in)) {
          throw new Error(`Invalid array in OrganizationRepository filter: ${fieldName}`);
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
          throw new Error(`Unsupported filter operator in OrganizationRepository: ${k}`);
        }
      }
      throw new Error(`Invalid identifier object in OrganizationRepository filter: ${fieldName}`);
    }

    return this._extractAndValidateId(val, fieldName);
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = {};
        if (filter._id !== undefined) {
          where.id = this._processIdFilter(filter._id, "_id");
        }
        if (filter.id !== undefined) {
          where.id = this._processIdFilter(filter.id, "id");
        }
        if (filter.name !== undefined) {
          if (filter.name instanceof RegExp) {
            const pattern = filter.name.source.replace(/^\^|\$/g, "");
            where.name = { equals: pattern, mode: "insensitive" };
          } else if (typeof filter.name === "string") {
            where.name = filter.name.trim();
          } else if (typeof filter.name === "object" && filter.name !== null) {
            if (filter.name.$regex) {
              const pattern = filter.name.$regex instanceof RegExp
                ? filter.name.$regex.source.replace(/^\^|\$/g, "")
                : String(filter.name.$regex).replace(/^\^|\$/g, "");
              where.name = { equals: pattern, mode: "insensitive" };
            } else if (filter.name.equals) {
              where.name = { equals: filter.name.equals, mode: filter.name.mode || "insensitive" };
            } else {
              where.name = filter.name;
            }
          } else {
            where.name = filter.name;
          }
        }
        if (filter.owner !== undefined) {
          where.ownerId = this._extractAndValidateId(filter.owner, "owner");
        }
        if (filter.ownerId !== undefined) {
          where.ownerId = this._extractAndValidateId(filter.ownerId, "ownerId");
        }

        const queryOptions = { where };
        if (options.limit) queryOptions.take = options.limit;
        if (options.skip) queryOptions.skip = options.skip;
        if (options.sort) {
          const [sortField, sortDir] = Object.entries(options.sort)[0] || ["createdAt", -1];
          queryOptions.orderBy = { [sortField]: sortDir === -1 || sortDir === "desc" ? "desc" : "asc" };
        }

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => this.formatOrganization(d));
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
        const createData = {
          id: data._id ? this.toIdString(data._id) : generateId(),
          name: data.name || "Default Organization",
          ownerId: data.ownerId || data.owner ? this.toIdString(data.ownerId || data.owner) : null,
          logo: data.logo || "",
          timezone: data.timezone || "Asia/Kolkata",
          twoFactor: data.twoFactor || data.twoFactorAuth || {},
          appUpdates: data.appUpdates || data.appUpdate || {},
          emailReports: data.emailReports || {},
          taskManagement: data.taskManagement || {},
          notifications: data.notifications || data.notificationSettings || {},
        };
        const doc = await this.delegate.create({ data: createData });
        return this.serialize(doc);
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
      throw new Error("Invalid identifier in OrganizationRepository.findByIdAndUpdate");
    }

    if (!updateData || typeof updateData !== "object" || Array.isArray(updateData)) {
      throw new Error("OrganizationRepository.findByIdAndUpdate requires a valid update object");
    }

    if (isPostgres()) {
      try {
        for (const key of Object.keys(updateData)) {
          if (key.startsWith("$") && key !== "$set") {
            throw new Error(`Unsupported update operator in OrganizationRepository: ${key}`);
          }
        }

        if (updateData.$set !== undefined) {
          if (!updateData.$set || typeof updateData.$set !== "object" || Array.isArray(updateData.$set)) {
            throw new Error("Invalid $set envelope in OrganizationRepository.findByIdAndUpdate");
          }
          for (const key of Object.keys(updateData.$set)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in OrganizationRepository: ${key}`);
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
          "logo",
          "timezone",
          "owner",
          "ownerId",
          "twoFactor",
          "twoFactorAuth",
          "appUpdates",
          "appUpdate",
          "emailReports",
          "taskManagement",
          "notifications",
          "notificationSettings",
        ]);

        const ALLOWED_PASSTHROUGH_FIELDS = new Set([
          "_id",
          "id",
          "updatedAt",
          "__v",
          "isNew",
          "_isNew",
        ]);

        if (rawPayload._id !== undefined && this.toIdString(rawPayload._id) !== idStr) {
          throw new Error("Cannot update immutable field: _id");
        }
        if (rawPayload.id !== undefined && this.toIdString(rawPayload.id) !== idStr) {
          throw new Error("Cannot update immutable field: id");
        }
        if (rawPayload.createdAt !== undefined) {
          throw new Error("Cannot update immutable field: createdAt");
        }

        for (const key of Object.keys(rawPayload)) {
          if (typeof rawPayload[key] === "function") {
            continue;
          }
          if (!ALLOWED_UPDATE_FIELDS.has(key) && !ALLOWED_PASSTHROUGH_FIELDS.has(key)) {
            throw new Error(`Unsupported update field in OrganizationRepository: ${key}`);
          }
        }

        if (rawPayload.twoFactor !== undefined && rawPayload.twoFactorAuth !== undefined) {
          if (JSON.stringify(rawPayload.twoFactor) !== JSON.stringify(rawPayload.twoFactorAuth)) {
            throw new Error("Conflicting update values for 'twoFactor' and 'twoFactorAuth' in OrganizationRepository.findByIdAndUpdate");
          }
        }
        if (rawPayload.appUpdates !== undefined && rawPayload.appUpdate !== undefined) {
          if (JSON.stringify(rawPayload.appUpdates) !== JSON.stringify(rawPayload.appUpdate)) {
            throw new Error("Conflicting update values for 'appUpdates' and 'appUpdate' in OrganizationRepository.findByIdAndUpdate");
          }
        }
        if (rawPayload.notifications !== undefined && rawPayload.notificationSettings !== undefined) {
          if (JSON.stringify(rawPayload.notifications) !== JSON.stringify(rawPayload.notificationSettings)) {
            throw new Error("Conflicting update values for 'notifications' and 'notificationSettings' in OrganizationRepository.findByIdAndUpdate");
          }
        }
        if (rawPayload.owner !== undefined && rawPayload.ownerId !== undefined) {
          if (this.toIdString(rawPayload.owner) !== this.toIdString(rawPayload.ownerId)) {
            throw new Error("Conflicting update values for 'owner' and 'ownerId' in OrganizationRepository.findByIdAndUpdate");
          }
        }

        const patch = {};

        if (rawPayload.name !== undefined) {
          if (typeof rawPayload.name !== "string" || !rawPayload.name.trim()) {
            throw new Error("Invalid organization name in OrganizationRepository.findByIdAndUpdate");
          }
          patch.name = rawPayload.name.trim();
        }

        if (rawPayload.logo !== undefined) {
          patch.logo = typeof rawPayload.logo === "string" ? rawPayload.logo.trim() : (rawPayload.logo === null ? "" : String(rawPayload.logo));
        }

        if (rawPayload.timezone !== undefined) {
          if (typeof rawPayload.timezone !== "string" || !rawPayload.timezone.trim()) {
            throw new Error("Invalid timezone in OrganizationRepository.findByIdAndUpdate");
          }
          patch.timezone = rawPayload.timezone.trim();
        }

        const rawOwner = rawPayload.ownerId !== undefined ? rawPayload.ownerId : rawPayload.owner;
        if (rawOwner !== undefined) {
          if (rawOwner === null) {
            patch.ownerId = null;
          } else {
            const ownerIdStr = this.toIdString(rawOwner);
            if (!ownerIdStr || typeof ownerIdStr !== "string" || !ownerIdStr.trim() || ownerIdStr === "[object Object]") {
              throw new Error("Invalid owner ID in OrganizationRepository.findByIdAndUpdate");
            }
            patch.ownerId = ownerIdStr.trim();
          }
        }

        const rawTwoFactor = rawPayload.twoFactor !== undefined ? rawPayload.twoFactor : rawPayload.twoFactorAuth;
        if (rawTwoFactor !== undefined) {
          if (rawTwoFactor !== null && (typeof rawTwoFactor !== "object" || Array.isArray(rawTwoFactor))) {
            throw new Error("Invalid twoFactor configuration in OrganizationRepository.findByIdAndUpdate");
          }
          patch.twoFactor = rawTwoFactor;
        }

        const rawAppUpdates = rawPayload.appUpdates !== undefined ? rawPayload.appUpdates : rawPayload.appUpdate;
        if (rawAppUpdates !== undefined) {
          if (rawAppUpdates !== null && (typeof rawAppUpdates !== "object" || Array.isArray(rawAppUpdates))) {
            throw new Error("Invalid appUpdates configuration in OrganizationRepository.findByIdAndUpdate");
          }
          patch.appUpdates = rawAppUpdates;
        }

        if (rawPayload.emailReports !== undefined) {
          if (rawPayload.emailReports !== null && (typeof rawPayload.emailReports !== "object" || Array.isArray(rawPayload.emailReports))) {
            throw new Error("Invalid emailReports configuration in OrganizationRepository.findByIdAndUpdate");
          }
          patch.emailReports = rawPayload.emailReports;
        }

        if (rawPayload.taskManagement !== undefined) {
          if (rawPayload.taskManagement !== null && (typeof rawPayload.taskManagement !== "object" || Array.isArray(rawPayload.taskManagement))) {
            throw new Error("Invalid taskManagement configuration in OrganizationRepository.findByIdAndUpdate");
          }
          patch.taskManagement = rawPayload.taskManagement;
        }

        const rawNotifications = rawPayload.notifications !== undefined ? rawPayload.notifications : rawPayload.notificationSettings;
        if (rawNotifications !== undefined) {
          if (rawNotifications !== null && (typeof rawNotifications !== "object" || Array.isArray(rawNotifications))) {
            throw new Error("Invalid notifications configuration in OrganizationRepository.findByIdAndUpdate");
          }
          patch.notifications = rawNotifications;
        }

        if (Object.keys(patch).length === 0) {
          return this.findById(idStr);
        }

        const doc = await this.delegate.update({
          where: { id: idStr },
          data: patch,
        });
        return this.formatOrganization(doc);
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
}

export const organizationRepository = new OrganizationRepository();
export default organizationRepository;
