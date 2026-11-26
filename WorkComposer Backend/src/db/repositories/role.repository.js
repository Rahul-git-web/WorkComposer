import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

export class RoleRepository extends BaseRepository {
  constructor() {
    super("Role");
  }

  formatRole(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    serialized.organization = serialized.organization || serialized.organizationId;
    delete serialized.organizationId;
    return serialized;
  }

  async findById(id) {
    const idStr = this.toIdString(id);
    if (!idStr) return null;

    if (isPostgres()) {
      try {
        const doc = await this.delegate.findUnique({ where: { id: idStr } });
        return this.formatRole(doc);
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
        if (filter.name) {
          if (filter.name instanceof RegExp) {
            const pattern = filter.name.source.replace(/^\^|\$$/g, "");
            where.name = { equals: pattern, mode: "insensitive" };
          } else if (typeof filter.name === "string") {
            where.name = { equals: filter.name, mode: "insensitive" };
          } else {
            where.name = filter.name;
          }
        }
        if (filter.organization) where.organizationId = this.toIdString(filter.organization);
        if (filter.organizationId) where.organizationId = this.toIdString(filter.organizationId);
        if (filter.type) where.type = filter.type;

        const doc = await this.delegate.findFirst({ where });
        return this.formatRole(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOne(filter);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findRoleByIdAndOrganization(roleId, orgId) {
    const rId = this.toIdString(roleId);
    const oId = this.toIdString(orgId);
    if (!rId || !oId) return null;
    return this.findOne({ _id: rId, organization: oId });
  }

  _buildNameFilter(val, fieldName = "name") {
    if (val === null || val === undefined) {
      return val;
    }
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) {
        throw new Error(`Invalid name in RoleRepository filter: ${fieldName}`);
      }
      return trimmed;
    }
    if (val instanceof RegExp) {
      const pattern = val.source.replace(/^\^|\$/g, "");
      return { equals: pattern, mode: "insensitive" };
    }
    if (typeof val === "object") {
      if (val.$ne !== undefined) {
        if (typeof val.$ne === "string") {
          const trimmed = val.$ne.trim();
          if (!trimmed) {
            throw new Error(`Invalid name in RoleRepository filter: ${fieldName}`);
          }
          return { not: trimmed };
        }
        if (val.$ne === null) {
          return { not: null };
        }
        throw new Error(`Invalid name in RoleRepository filter: ${fieldName}`);
      }
      if (val.ne !== undefined) {
        if (typeof val.ne === "string") {
          const trimmed = val.ne.trim();
          if (!trimmed) {
            throw new Error(`Invalid name in RoleRepository filter: ${fieldName}`);
          }
          return { not: trimmed };
        }
        if (val.ne === null) {
          return { not: null };
        }
        throw new Error(`Invalid name in RoleRepository filter: ${fieldName}`);
      }
      if (val.$in !== undefined) {
        if (!Array.isArray(val.$in)) {
          throw new Error(`Invalid array in RoleRepository filter: ${fieldName}`);
        }
        return { in: val.$in.map((s) => String(s).trim()) };
      }
      if (val.in !== undefined) {
        if (!Array.isArray(val.in)) {
          throw new Error(`Invalid array in RoleRepository filter: ${fieldName}`);
        }
        return { in: val.in.map((s) => String(s).trim()) };
      }
      if (val.$regex !== undefined) {
        const pattern = val.$regex instanceof RegExp
          ? val.$regex.source.replace(/^\^|\$/g, "")
          : String(val.$regex).replace(/^\^|\$/g, "");
        return { equals: pattern, mode: "insensitive" };
      }
      if (val.equals !== undefined) {
        return { equals: val.equals, mode: val.mode || "insensitive" };
      }
      for (const k of Object.keys(val)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in RoleRepository: ${k}`);
        }
      }
      throw new Error(`Invalid name filter in RoleRepository: ${fieldName}`);
    }
    return String(val);
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = {};
        if (filter.organization) {
          if (filter.organization.$in) where.organizationId = { in: filter.organization.$in.map((o) => this.toIdString(o)) };
          else where.organizationId = this.toIdString(filter.organization);
        }
        if (filter.organizationId) {
          if (filter.organizationId.$in) where.organizationId = { in: filter.organizationId.$in.map((o) => this.toIdString(o)) };
          else where.organizationId = this.toIdString(filter.organizationId);
        }
        if (filter.type) where.type = filter.type;
        if (filter._id) where.id = this.toIdString(filter._id);
        if (filter.id) where.id = this.toIdString(filter.id);
        if (filter.name !== undefined) {
          const nameCond = this._buildNameFilter(filter.name, "name");
          if (nameCond !== undefined) where.name = nameCond;
        }

        const queryOptions = { where };
        if (options.limit) queryOptions.take = options.limit;
        if (options.skip) queryOptions.skip = options.skip;
        if (options.sort) {
          const [sortField, sortDir] = Object.entries(options.sort)[0] || ["createdAt", -1];
          queryOptions.orderBy = { [sortField]: sortDir === -1 || sortDir === "desc" ? "desc" : "asc" };
        }

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => this.formatRole(d));
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
        const createData = {
          id: data._id ? this.toIdString(data._id) : generateId(),
          name: data.name,
          organizationId: orgId,
          description: data.description || "",
          permissions: Array.isArray(data.permissions) ? data.permissions : [],
          reportAccess: data.reportAccess || "none",
          screenshotAccess: data.screenshotAccess || "none",
          isSystem: Boolean(data.isSystem),
        };
        const doc = await this.delegate.create({ data: createData });
        return this.formatRole(doc);
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
      throw new Error("Invalid identifier in RoleRepository.findByIdAndUpdate");
    }

    if (!updateData || typeof updateData !== "object" || Array.isArray(updateData)) {
      throw new Error("RoleRepository.findByIdAndUpdate requires a valid update object");
    }

    if (isPostgres()) {
      try {
        for (const key of Object.keys(updateData)) {
          if (key.startsWith("$") && key !== "$set") {
            throw new Error(`Unsupported update operator in RoleRepository: ${key}`);
          }
        }

        const payload = updateData.$set && typeof updateData.$set === "object"
          ? { ...updateData, ...updateData.$set }
          : { ...updateData };

        if (payload._id !== undefined && this.toIdString(payload._id) !== idStr) {
          throw new Error("Cannot update immutable field: _id");
        }
        if (payload.id !== undefined && this.toIdString(payload.id) !== idStr) {
          throw new Error("Cannot update immutable field: id");
        }
        if (payload.createdAt !== undefined) {
          throw new Error("Cannot update immutable field: createdAt");
        }
        if (payload.organizationId !== undefined) {
          throw new Error("Cannot update immutable field: organizationId");
        }

        const ALLOWED_UPDATE_FIELDS = new Set([
          "name",
          "description",
          "permissions",
          "reportAccess",
          "screenshotAccess",
          "isSystem",
        ]);

        const ALLOWED_PASSTHROUGH_FIELDS = new Set([
          "_id",
          "id",
          "organization",
          "updatedAt",
          "__v",
          "$set",
          "deleteOne",
          "save",
          "toObject",
          "toJSON",
          "isModified",
        ]);

        for (const key of Object.keys(payload)) {
          if (typeof payload[key] === "function") {
            continue;
          }
          if (!ALLOWED_UPDATE_FIELDS.has(key) && !ALLOWED_PASSTHROUGH_FIELDS.has(key)) {
            throw new Error(`Unsupported update field in RoleRepository: ${key}`);
          }
        }

        const patch = {};
        if (payload.name !== undefined) {
          if (typeof payload.name !== "string" || !payload.name.trim()) {
            throw new Error("Invalid role name in RoleRepository.findByIdAndUpdate");
          }
          patch.name = payload.name.trim();
        }
        if (payload.description !== undefined) {
          patch.description = typeof payload.description === "string" ? payload.description : "";
        }
        if (payload.permissions !== undefined) {
          if (!Array.isArray(payload.permissions)) {
            throw new Error("Invalid permissions array in RoleRepository.findByIdAndUpdate");
          }
          patch.permissions = payload.permissions.map(String);
        }
        if (payload.reportAccess !== undefined) {
          patch.reportAccess = String(payload.reportAccess);
        }
        if (payload.screenshotAccess !== undefined) {
          patch.screenshotAccess = String(payload.screenshotAccess);
        }
        if (payload.isSystem !== undefined) {
          patch.isSystem = Boolean(payload.isSystem);
        }

        const doc = await this.delegate.update({
          where: { id: idStr },
          data: patch,
        });
        return this.formatRole(doc);
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
}

export const roleRepository = new RoleRepository();
export default roleRepository;
