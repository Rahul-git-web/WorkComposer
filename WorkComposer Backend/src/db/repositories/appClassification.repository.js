import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

export const VALID_PRODUCTIVITY_LEVELS = new Set([
  "productive",
  "neutral",
  "unproductive",
  "blacklisted",
]);

const IMMUTABLE_IDENTITY_FIELDS = new Set([
  "_id",
  "id",
  "organization",
  "organizationId",
]);

function extractAndValidateScalarId(raw, fieldName, repoName = "AppClassificationRepository") {
  if (raw === null || raw === undefined) {
    throw new Error(`Invalid identifier in ${repoName} for field: ${fieldName}`);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "[object Object]") {
      throw new Error(`Invalid identifier in ${repoName} for field: ${fieldName}`);
    }
    return trimmed;
  }
  if (typeof raw === "number") {
    if (isNaN(raw)) {
      throw new Error(`Invalid identifier in ${repoName} for field: ${fieldName}`);
    }
    return String(raw);
  }
  if (typeof raw === "boolean") {
    throw new Error(`Invalid identifier in ${repoName} for field: ${fieldName}`);
  }
  if (typeof raw === "object") {
    if (typeof raw.toHexString === "function") {
      const hex = raw.toHexString();
      if (hex && typeof hex === "string" && hex.trim() && hex !== "[object Object]") {
        return hex.trim();
      }
    }
    if (raw._id !== undefined && raw._id !== null) {
      return extractAndValidateScalarId(raw._id, fieldName, repoName);
    }
    if (raw.id !== undefined && raw.id !== null) {
      return extractAndValidateScalarId(raw.id, fieldName, repoName);
    }
    if (typeof raw.toString === "function" && raw.constructor && raw.constructor.name === "ObjectId") {
      const str = raw.toString().trim();
      if (str && str !== "[object Object]") {
        return str;
      }
    }
    if (typeof raw.toString === "function") {
      const str = raw.toString().trim();
      if (str && str !== "[object Object]") {
        return str;
      }
    }
    throw new Error(`Invalid identifier object in ${repoName} filter: ${fieldName}`);
  }
  throw new Error(`Invalid identifier in ${repoName} for field: ${fieldName}`);
}

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
  if (Array.isArray(valA) && Array.isArray(valB)) {
    if (valA.length !== valB.length) return false;
    for (let i = 0; i < valA.length; i++) {
      if (!isSameValue(valA[i], valB[i])) return false;
    }
    return true;
  }
  const toId = (val) => {
    if (!val) return null;
    if (typeof val === "string") return val.trim();
    if (typeof val === "object") {
      if (val._id) return String(val._id).trim();
      if (val.id) return String(val.id).trim();
      if (typeof val.toHexString === "function") return val.toHexString().trim();
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

export function isAppClassificationCompoundUniqueError(err) {
  if (!err) return false;
  if (err.code !== "P2002") return false;

  const target = err.meta?.target;
  if (target) {
    if (Array.isArray(target)) {
      const isOnlyId = target.length === 1 && (target[0] === "id" || target[0] === "_id");
      if (isOnlyId) return false;

      const hasOrg = target.some((t) => t === "organization_id" || t === "organizationId");
      const hasApp = target.some((t) => t === "app_name" || t === "appName");
      const hasConstraint = target.some(
        (t) => typeof t === "string" && t.includes("app_classifications_organization_id_app_name_key")
      );
      if ((hasOrg && hasApp) || hasConstraint) {
        return true;
      }
      return false;
    }
    if (typeof target === "string") {
      if (target === "id" || target === "_id" || target.includes("app_classifications_pkey")) {
        return false;
      }
      if (
        target.includes("app_classifications_organization_id_app_name_key") ||
        ((target.includes("organization_id") || target.includes("organizationId")) &&
          (target.includes("app_name") || target.includes("appName")))
      ) {
        return true;
      }
      return false;
    }
  }

  const msg = String(err.message || "");
  if (msg.includes("app_classifications_pkey") || (msg.includes("(`id`)") && !msg.includes("app_name"))) {
    return false;
  }
  if (
    msg.includes("app_classifications_organization_id_app_name_key") ||
    ((msg.includes("organization_id") || msg.includes("organizationId") || msg.includes("organization")) &&
      (msg.includes("app_name") || msg.includes("appName")))
  ) {
    return true;
  }

  return false;
}

/**
 * Resolves whether to return the post-update document (true) or pre-update document (false).
 * Precedence:
 * 1. options.returnDocument: "after" -> true, "before" -> false
 * 2. options.new: true -> true, false -> false
 * 3. options.returnOriginal: false -> true, true -> false
 * 4. Default: false (return pre-update document, matching native Mongoose findOneAndUpdate)
 *
 * For upserts that create a new document:
 * - returnUpdated = true -> return the newly created document
 * - returnUpdated = false -> return null (matching Mongoose findOneAndUpdate with upsert)
 */
function resolveReturnUpdated(options = {}) {
  if (!options || typeof options !== "object") return false;
  if (options.returnDocument === "after") return true;
  if (options.returnDocument === "before") return false;
  if (options.new !== undefined) return Boolean(options.new);
  if (options.returnOriginal !== undefined) return !options.returnOriginal;
  return false;
}

function parseScopedFilter(filter, operationName) {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
    throw new Error(`${operationName} requires a valid filter object`);
  }

  for (const key of Object.keys(filter)) {
    if (key.startsWith("$")) {
      throw new Error(`Unsupported filter operator in ${operationName}: ${key}`);
    }
  }

  const rawOrg = filter.organization;
  const rawOrgId = filter.organizationId;

  if (rawOrg === undefined && rawOrgId === undefined) {
    throw new Error(
      `${operationName} requires a valid organization filter: Cannot upsert AppClassification without valid organization`
    );
  }

  let orgId = null;
  if (rawOrg !== undefined && rawOrgId !== undefined) {
    const parsedA = extractAndValidateScalarId(rawOrg, "organization");
    const parsedB = extractAndValidateScalarId(rawOrgId, "organizationId");
    if (parsedA !== parsedB) {
      throw new Error(`Conflicting organization identifiers in ${operationName} filter`);
    }
    orgId = parsedA;
  } else if (rawOrg !== undefined) {
    orgId = extractAndValidateScalarId(rawOrg, "organization");
  } else {
    orgId = extractAndValidateScalarId(rawOrgId, "organizationId");
  }

  const rawId = filter.id;
  const rawUnderscoreId = filter._id;
  let recordId = null;

  if (rawId !== undefined && rawUnderscoreId !== undefined) {
    const idA = extractAndValidateScalarId(rawId, "id");
    const idB = extractAndValidateScalarId(rawUnderscoreId, "_id");
    if (idA !== idB) {
      throw new Error(`Conflicting record identifiers in ${operationName} filter: _id and id`);
    }
    recordId = idA;
  } else if (rawId !== undefined) {
    recordId = extractAndValidateScalarId(rawId, "id");
  } else if (rawUnderscoreId !== undefined) {
    recordId = extractAndValidateScalarId(rawUnderscoreId, "_id");
  }

  let appName = null;
  if (filter.appName !== undefined) {
    if (typeof filter.appName === "string") {
      const trimmed = filter.appName.trim().toLowerCase();
      if (!trimmed) {
        throw new Error(`Invalid appName in ${operationName} filter`);
      }
      appName = trimmed;
    } else if (typeof filter.appName === "object" && filter.appName !== null) {
      if (filter.appName.$regex) {
        appName = { contains: filter.appName.$regex, mode: "insensitive" };
      } else if (filter.appName.contains) {
        appName = { contains: filter.appName.contains, mode: "insensitive" };
      } else {
        for (const k of Object.keys(filter.appName)) {
          if (k.startsWith("$")) {
            throw new Error(`Unsupported filter operator in ${operationName}: ${k}`);
          }
        }
        appName = String(filter.appName).trim().toLowerCase();
      }
    } else {
      appName = String(filter.appName).trim().toLowerCase();
    }
  }

  let productivity = null;
  if (filter.productivity !== undefined) {
    if (typeof filter.productivity !== "string") {
      throw new Error(`Invalid productivity value in ${operationName} filter`);
    }
    const normalizedProd = filter.productivity.trim().toLowerCase();
    if (!VALID_PRODUCTIVITY_LEVELS.has(normalizedProd)) {
      throw new Error(`Invalid productivity value in ${operationName} filter`);
    }
    productivity = normalizedProd;
  }

  const where = {
    organizationId: orgId,
  };
  if (recordId) {
    where.id = recordId;
  }
  if (appName) {
    where.appName = appName;
  }
  if (productivity) {
    where.productivity = productivity;
  }

  return {
    organizationId: orgId,
    recordId,
    appName,
    productivity,
    where,
  };
}

export class AppClassificationRepository extends BaseRepository {
  constructor() {
    super("AppClassification");
  }

  formatClassification(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    serialized.organization = serialized.organization || serialized.organizationId;
    delete serialized.organizationId;
    serialized.excludedTeams = serialized.excludedTeams || [];
    serialized.excludedUsers = serialized.excludedUsers || [];
    return serialized;
  }

  buildWhere(filter = {}) {
    const where = {};

    for (const key of Object.keys(filter || {})) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in AppClassificationRepository: ${key}`);
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
              throw new Error(`Unsupported filter operator in AppClassificationRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in AppClassificationRepository filter: _id");
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
              throw new Error(`Unsupported filter operator in AppClassificationRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in AppClassificationRepository filter: id");
        }
      } else {
        where.id = this.toIdString(filter.id);
      }
    }

    if (filter._id && filter.id && where.id) {
      const idA = typeof filter._id === "string" ? filter._id : this.toIdString(filter._id);
      const idB = typeof filter.id === "string" ? filter.id : this.toIdString(filter.id);
      if (idA && idB && idA !== idB) {
        throw new Error("Conflicting record identifiers in AppClassificationRepository filter: _id and id");
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
              throw new Error(`Unsupported filter operator in AppClassificationRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in AppClassificationRepository filter: organization");
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
              throw new Error(`Unsupported filter operator in AppClassificationRepository: ${k}`);
            }
          }
          throw new Error("Invalid identifier object in AppClassificationRepository filter: organizationId");
        }
      } else {
        where.organizationId = this.toIdString(filter.organizationId);
      }
    }

    if (filter.organization && filter.organizationId && where.organizationId) {
      const orgA = typeof filter.organization === "string" ? filter.organization : this.toIdString(filter.organization);
      const orgB = typeof filter.organizationId === "string" ? filter.organizationId : this.toIdString(filter.organizationId);
      if (orgA && orgB && orgA !== orgB) {
        throw new Error("Conflicting organization identifiers in AppClassificationRepository filter");
      }
    }

    if (filter.appName) {
      if (typeof filter.appName === "object" && filter.appName !== null) {
        if (filter.appName.$regex) {
          where.appName = { contains: filter.appName.$regex, mode: "insensitive" };
        } else if (filter.appName.contains) {
          where.appName = { contains: filter.appName.contains, mode: "insensitive" };
        } else {
          for (const k of Object.keys(filter.appName)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in AppClassificationRepository: ${k}`);
            }
          }
          where.appName = String(filter.appName).toLowerCase().trim();
        }
      } else {
        where.appName = String(filter.appName).toLowerCase().trim();
      }
    }

    if (filter.productivity) {
      if (typeof filter.productivity === "string") {
        const normalizedProd = filter.productivity.toLowerCase().trim();
        if (!VALID_PRODUCTIVITY_LEVELS.has(normalizedProd)) {
          throw new Error("Invalid productivity value in AppClassificationRepository filter");
        }
        where.productivity = normalizedProd;
      } else {
        throw new Error("Invalid productivity value in AppClassificationRepository filter");
      }
    }

    return where;
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const queryOptions = { where };

        if (options.sort) {
          const [sortField, sortDir] = Object.entries(options.sort)[0] || ["appName", 1];
          queryOptions.orderBy = { [sortField]: sortDir === -1 || sortDir === "desc" ? "desc" : "asc" };
        } else {
          queryOptions.orderBy = { appName: "asc" };
        }
        if (options.skip) queryOptions.skip = options.skip;
        if (options.limit) queryOptions.take = options.limit;

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => this.formatClassification(d));
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.find(filter);
    if (options.sort) query = query.sort(options.sort);
    if (options.skip) query = query.skip(options.skip);
    if (options.limit) query = query.limit(options.limit);
    const docs = await query;
    return docs.map((d) => this.serialize(d.toObject ? d.toObject() : doc));
  }

  async findOne(filter = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const doc = await this.delegate.findFirst({ where });
        return doc ? this.formatClassification(doc) : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOne(filter);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findById(id) {
    if (isPostgres()) {
      try {
        const doc = await this.delegate.findUnique({
          where: { id: this.toIdString(id) },
        });
        return doc ? this.formatClassification(doc) : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findById(id);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findByIdAndUpdate(id, update, options = { new: true }) {
    const idStr = this.toIdString(id);
    if (!idStr || typeof idStr !== "string" || !idStr.trim() || idStr === "[object Object]") {
      if (isPostgres()) {
        throw new Error("Invalid identifier in AppClassificationRepository.findByIdAndUpdate");
      }
      return null;
    }

    if (isPostgres()) {
      try {
        const existing = await this.delegate.findUnique({
          where: { id: idStr },
        });
        if (!existing) return null;

        return this.findOneAndUpdate(
          {
            _id: idStr,
            organizationId: existing.organizationId,
          },
          update,
          options
        );
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findByIdAndUpdate(id, update, options);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async updateById(id, update, options = { new: true }) {
    return this.findByIdAndUpdate(id, update, options);
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

  async create(data) {
    if (isPostgres()) {
      try {
        const organizationId = this.toIdString(data.organization || data.organizationId);
        const newId = data._id ? this.toIdString(data._id) : generateId();

        const productivityVal = data.productivity
          ? String(data.productivity).trim().toLowerCase()
          : "neutral";
        if (!VALID_PRODUCTIVITY_LEVELS.has(productivityVal)) {
          throw new Error(`Invalid productivity value in AppClassificationRepository: ${data.productivity}`);
        }

        const createData = {
          id: newId,
          organizationId,
          appName: String(data.appName).toLowerCase().trim(),
          productivity: productivityVal,
          preventBreakMode: Boolean(data.preventBreakMode),
          disableIdleCalculation: Boolean(data.disableIdleCalculation),
          excludedTeams: (data.excludedTeams || []).map((t) => this.toIdString(t)),
          excludedUsers: (data.excludedUsers || []).map((u) => this.toIdString(u)),
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatClassification(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.create(data);
    return this.serialize(doc.toObject ? doc.toObject() : doc);
  }

  async findOneAndUpdate(filter, update, options = {}) {
    if (isPostgres()) {
      try {
        if (!update || typeof update !== "object" || Array.isArray(update)) {
          throw new Error("AppClassificationRepository.findOneAndUpdate requires a valid update object");
        }

        const updateKeys = Object.keys(update);
        for (const key of updateKeys) {
          if (key.startsWith("$") && key !== "$set" && key !== "$setOnInsert") {
            throw new Error(`Unsupported update operator in AppClassificationRepository.findOneAndUpdate: ${key}`);
          }
        }

        if (update.$set !== undefined) {
          if (!update.$set || typeof update.$set !== "object" || Array.isArray(update.$set)) {
            throw new Error("Invalid $set envelope in AppClassificationRepository.findOneAndUpdate");
          }
          for (const key of Object.keys(update.$set)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in AppClassificationRepository.findOneAndUpdate: ${key}`);
            }
          }
        }

        if (update.$setOnInsert !== undefined) {
          if (!update.$setOnInsert || typeof update.$setOnInsert !== "object" || Array.isArray(update.$setOnInsert)) {
            throw new Error("Invalid $setOnInsert envelope in AppClassificationRepository.findOneAndUpdate");
          }
          for (const key of Object.keys(update.$setOnInsert)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in AppClassificationRepository.findOneAndUpdate: ${key}`);
            }
          }
        }

        const directFields = { ...update };
        delete directFields.$set;
        delete directFields.$setOnInsert;
        const setFields = update.$set || {};

        for (const key of Object.keys(setFields)) {
          if (directFields[key] !== undefined) {
            if (!isSameValue(directFields[key], setFields[key])) {
              throw new Error(`Conflicting update values for field '${key}' between direct payload and $set envelope`);
            }
          }
        }

        const updatePayload = { ...directFields, ...setFields };

        for (const immutable of IMMUTABLE_IDENTITY_FIELDS) {
          if (updatePayload[immutable] !== undefined) {
            throw new Error(`Cannot update immutable field: ${immutable}`);
          }
        }

        const scopedFilter = parseScopedFilter(filter, "AppClassificationRepository.findOneAndUpdate");
        const existing = await this.delegate.findFirst({ where: scopedFilter.where });

        const updateData = {};
        if (updatePayload.productivity !== undefined) {
          if (typeof updatePayload.productivity !== "string") {
            throw new Error(`Invalid productivity value in AppClassificationRepository: ${updatePayload.productivity}`);
          }
          const normalizedProd = updatePayload.productivity.trim().toLowerCase();
          if (!VALID_PRODUCTIVITY_LEVELS.has(normalizedProd)) {
            throw new Error(`Invalid productivity value in AppClassificationRepository: ${updatePayload.productivity}`);
          }
          updateData.productivity = normalizedProd;
        }

        if (updatePayload.preventBreakMode !== undefined) {
          updateData.preventBreakMode = Boolean(updatePayload.preventBreakMode);
        }
        if (updatePayload.disableIdleCalculation !== undefined) {
          updateData.disableIdleCalculation = Boolean(updatePayload.disableIdleCalculation);
        }
        if (updatePayload.appName !== undefined) {
          if (typeof updatePayload.appName !== "string" || !updatePayload.appName.trim()) {
            throw new Error("Invalid appName in AppClassificationRepository update payload");
          }
          updateData.appName = updatePayload.appName.trim().toLowerCase();
        }
        if (updatePayload.excludedTeams !== undefined) {
          if (!Array.isArray(updatePayload.excludedTeams)) {
            throw new Error("excludedTeams must be an array in AppClassificationRepository update payload");
          }
          updateData.excludedTeams = updatePayload.excludedTeams.map((t) => this.toIdString(t)).filter(Boolean);
        }
        if (updatePayload.excludedUsers !== undefined) {
          if (!Array.isArray(updatePayload.excludedUsers)) {
            throw new Error("excludedUsers must be an array in AppClassificationRepository update payload");
          }
          updateData.excludedUsers = updatePayload.excludedUsers.map((u) => this.toIdString(u)).filter(Boolean);
        }

        const returnUpdated = resolveReturnUpdated(options);

        if (existing) {
          const doc = await this.delegate.update({
            where: { id: existing.id },
            data: updateData,
          });

          return returnUpdated ? this.formatClassification(doc) : this.formatClassification(existing);
        } else if (options.upsert) {
          const insertPayload = { ...updatePayload };
          if (update?.$setOnInsert) {
            Object.assign(insertPayload, update.$setOnInsert);
          }

          const orgId = scopedFilter.organizationId;

          const rawAppName = insertPayload.appName || scopedFilter.appName;
          const appNameVal =
            typeof rawAppName === "string" && rawAppName.trim().length > 0
              ? String(rawAppName).trim().toLowerCase()
              : null;
          if (!appNameVal) {
            throw new Error("Cannot upsert AppClassification without valid appName");
          }

          let productivityVal = "neutral";
          if (insertPayload.productivity !== undefined) {
            if (typeof insertPayload.productivity !== "string") {
              throw new Error(`Invalid productivity value in AppClassificationRepository: ${insertPayload.productivity}`);
            }
            const normalizedProd = insertPayload.productivity.trim().toLowerCase();
            if (!VALID_PRODUCTIVITY_LEVELS.has(normalizedProd)) {
              throw new Error(`Invalid productivity value in AppClassificationRepository: ${insertPayload.productivity}`);
            }
            productivityVal = normalizedProd;
          }

          const newId =
            insertPayload._id || insertPayload.id
              ? this.toIdString(insertPayload._id || insertPayload.id)
              : generateId();

          const createData = {
            id: newId,
            organizationId: orgId,
            appName: appNameVal,
            productivity: productivityVal,
            preventBreakMode:
              insertPayload.preventBreakMode !== undefined
                ? Boolean(insertPayload.preventBreakMode)
                : false,
            disableIdleCalculation:
              insertPayload.disableIdleCalculation !== undefined
                ? Boolean(insertPayload.disableIdleCalculation)
                : false,
            excludedTeams: Array.isArray(insertPayload.excludedTeams)
              ? insertPayload.excludedTeams.map((t) => this.toIdString(t)).filter(Boolean)
              : [],
            excludedUsers: Array.isArray(insertPayload.excludedUsers)
              ? insertPayload.excludedUsers.map((u) => this.toIdString(u)).filter(Boolean)
              : [],
          };

          try {
            const created = await this.delegate.create({ data: createData });
            return returnUpdated ? this.formatClassification(created) : null;
          } catch (createErr) {
            if (isAppClassificationCompoundUniqueError(createErr)) {
              const concurrentExisting = await this.delegate.findFirst({
                where: {
                  organizationId: orgId,
                  appName: appNameVal,
                },
              });
              if (concurrentExisting) {
                const updated = await this.delegate.update({
                  where: { id: concurrentExisting.id },
                  data: updateData,
                });
                return returnUpdated
                  ? this.formatClassification(updated)
                  : this.formatClassification(concurrentExisting);
              }
            }
            throw createErr;
          }
        }

        return null;
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOneAndUpdate(filter, update, options);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async deleteMany(filter = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("AppClassificationRepository.deleteMany requires a valid filter object");
        }

        const where = this.buildWhere(filter);
        if (Object.keys(where).length === 0) {
          throw new Error("Bulk deletion requires a valid scoped filter in AppClassificationRepository.deleteMany");
        }

        const result = await this.delegate.deleteMany({ where });
        return { acknowledged: true, deletedCount: result.count };
      } catch (err) {
        this.handleError(err);
      }
    }

    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("AppClassificationRepository.deleteMany requires a valid filter object");
    }
    return this.mongooseModel.deleteMany(filter);
  }

  async findOneAndDelete(filter) {
    if (isPostgres()) {
      try {
        const scopedFilter = parseScopedFilter(filter, "AppClassificationRepository.findOneAndDelete");
        const existing = await this.delegate.findFirst({ where: scopedFilter.where });
        if (!existing) return null;

        const doc = await this.delegate.delete({ where: { id: existing.id } });
        return this.formatClassification(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOneAndDelete(filter);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }
}

export const appClassificationRepository = new AppClassificationRepository();
export default appClassificationRepository;
