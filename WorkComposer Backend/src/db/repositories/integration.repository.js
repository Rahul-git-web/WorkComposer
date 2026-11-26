const ALLOWED_INTEGRATION_DELETE_FIELDS = new Set([
  "organization",
  "organizationId",
  "_id",
  "id",
  "provider",
  "connected",
  "userId",
  "createdAt",
  "lastDailySummarySent",
  "lastWeeklySummarySent",
]);

const ALLOWED_INTEGRATION_FILTER_FIELDS = new Set([
  "organization",
  "organizationId",
  "_id",
  "id",
  "provider",
  "connected",
  "userId",
  "createdAt",
  "lastDailySummarySent",
  "lastWeeklySummarySent",
]);

const ALLOWED_INTEGRATION_UPDATE_FIELDS = new Set([
  "apiKey",
  "subdomain",
  "connected",
  "accessToken",
  "refreshToken",
  "expiresAt",
  "cloudId",
  "clientSecret",
  "siteUrl",
  "workspaceName",
  "accountId",
  "workspaceId",
  "slackChannelId",
  "slackChannelName",
  "notifications",
  "userId",
  "email",
  "lastDailySummarySent",
  "lastWeeklySummarySent",
]);

const ALLOWED_INTEGRATION_PASSTHROUGH_FIELDS = new Set([
  "_id",
  "id",
  "organization",
  "organizationId",
  "provider",
  "createdAt",
  "updatedAt",
  "__v",
  "lastSyncedAt",
  "$set",
  "$setOnInsert",
  "save",
  "toObject",
  "toJSON",
  "isModified",
  "runValidators",
  "isNew",
  "_isNew",
]);

const ALLOWED_DATE_OPERATORS = new Set([
  "$gte",
  "$lte",
  "$gt",
  "$lt",
  "gte",
  "lte",
  "gt",
  "lt",
]);

const VALID_INTEGRATION_PROVIDERS = new Set([
  "jira",
  "asana",
  "slack",
  "keka",
  "bamboohr",
  "storage",
]);

function extractAndValidateScalarId(raw, fieldName) {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (Array.isArray(raw)) {
    throw new Error(`Invalid identifier in IntegrationRepository for field: ${fieldName}`);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "[object Object]") {
      throw new Error(`Invalid identifier in IntegrationRepository for field: ${fieldName}`);
    }
    return trimmed;
  }
  if (typeof raw === "number") {
    if (isNaN(raw)) {
      throw new Error(`Invalid identifier in IntegrationRepository for field: ${fieldName}`);
    }
    return String(raw);
  }
  if (typeof raw === "boolean") {
    throw new Error(`Invalid identifier in IntegrationRepository for field: ${fieldName}`);
  }
  if (typeof raw === "object") {
    if (typeof raw.toHexString === "function") {
      const hex = raw.toHexString();
      if (hex && typeof hex === "string" && hex.trim() && hex !== "[object Object]") {
        return hex.trim();
      }
    }
    if (raw._id !== undefined && raw._id !== null) {
      return extractAndValidateScalarId(raw._id, fieldName);
    }
    if (raw.id !== undefined && raw.id !== null) {
      return extractAndValidateScalarId(raw.id, fieldName);
    }
    if (typeof raw.toString === "function" && raw.constructor && raw.constructor.name === "ObjectId") {
      const str = raw.toString().trim();
      if (str && str !== "[object Object]") {
        return str;
      }
    }
    throw new Error(`Invalid identifier in IntegrationRepository for field: ${fieldName}`);
  }
  throw new Error(`Invalid identifier in IntegrationRepository for field: ${fieldName}`);
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
    try {
      return JSON.stringify(valA) === JSON.stringify(valB);
    } catch {
      return false;
    }
  }
  return String(valA) === String(valB);
}

/**
 * Resolves whether findOneAndUpdate should return the updated document.
 * Precedence order for contradictory return options:
 *   1. returnDocument ('after' -> true, 'before' -> false)
 *   2. returnOriginal (false -> true, true -> false)
 *   3. new (true -> true, false -> false)
 *   4. default -> false (returns pre-update document, or null on upsert creation)
 */
function resolveReturnUpdated(options = {}) {
  if (!options || typeof options !== "object") return false;
  if (options.returnDocument !== undefined) {
    return options.returnDocument === "after";
  }
  if (options.returnOriginal !== undefined) {
    return options.returnOriginal === false;
  }
  if (options.new !== undefined) {
    return Boolean(options.new);
  }
  return false;
}

import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";
import { runTransaction, getAmbientTransaction, isTransactionActive } from "../transaction.js";

export class IntegrationRepository extends BaseRepository {
  constructor() {
    super("Integration");
  }

  formatIntegration(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    serialized.organization = serialized.organization || serialized.organizationId;
    return serialized;
  }

  buildWhere(filter = {}) {
    const where = {};
    if (filter._id) where.id = this.toIdString(filter._id);
    if (filter.id) where.id = this.toIdString(filter.id);
    if (filter.organization) where.organizationId = this.toIdString(filter.organization);
    if (filter.organizationId) where.organizationId = this.toIdString(filter.organizationId);
    if (filter.provider) where.provider = filter.provider;
    if (filter.connected !== undefined) where.connected = Boolean(filter.connected);
    if (filter.userId) where.userId = this.toIdString(filter.userId);
    if (filter.lastDailySummarySent !== undefined) {
      where.lastDailySummarySent = this._processDateFilter(filter.lastDailySummarySent, "lastDailySummarySent");
    }
    if (filter.lastWeeklySummarySent !== undefined) {
      where.lastWeeklySummarySent = this._processDateFilter(filter.lastWeeklySummarySent, "lastWeeklySummarySent");
    }
    if (filter.createdAt !== undefined) {
      where.createdAt = this._processDateFilter(filter.createdAt, "createdAt");
    }
    return where;
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const queryOptions = { where };

        if (options.sort) {
          const [sortField, sortDir] = Object.entries(options.sort)[0] || ["createdAt", -1];
          queryOptions.orderBy = { [sortField]: sortDir === -1 || sortDir === "desc" ? "desc" : "asc" };
        }

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => this.formatIntegration(d));
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.find(filter);
    if (options.sort) query = query.sort(options.sort);
    const docs = await query;
    return docs.map((d) => this.serialize(d.toObject ? d.toObject() : d));
  }

  async findOne(filter = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const doc = await this.delegate.findFirst({ where });
        return doc ? this.formatIntegration(doc) : null;
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
        return doc ? this.formatIntegration(doc) : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findById(id);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findByIdAndUpdate(id, update, options = {}) {
    return this.findOneAndUpdate({ id: this.toIdString(id) }, update, options);
  }

  async create(data) {
    if (isPostgres()) {
      try {
        const organizationId = this.toIdString(data.organization || data.organizationId);
        const newId = data._id ? this.toIdString(data._id) : generateId();

        const createData = {
          id: newId,
          organizationId,
          provider: data.provider,
          apiKey: data.apiKey || null,
          subdomain: data.subdomain || null,
          connected: Boolean(data.connected),
          accessToken: data.accessToken || null,
          refreshToken: data.refreshToken || null,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          cloudId: data.cloudId || null,
          clientSecret: data.clientSecret || null,
          siteUrl: data.siteUrl || null,
          workspaceName: data.workspaceName || null,
          accountId: data.accountId || null,
          workspaceId: data.workspaceId || null,
          slackChannelId: data.slackChannelId || null,
          slackChannelName: data.slackChannelName || null,
          notifications: data.notifications || null,
          userId: data.userId ? this.toIdString(data.userId) : null,
          email: data.email || null,
          lastDailySummarySent: data.lastDailySummarySent !== undefined
            ? this._parseNullableDate(data.lastDailySummarySent, "lastDailySummarySent")
            : null,
          lastWeeklySummarySent: data.lastWeeklySummarySent !== undefined
            ? this._parseNullableDate(data.lastWeeklySummarySent, "lastWeeklySummarySent")
            : null,
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatIntegration(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.create(data);
    return this.serialize(doc.toObject ? doc.toObject() : doc);
  }

  _validateSingleProvider(raw) {
    if (raw === null || raw === undefined) {
      throw new Error("Invalid provider in IntegrationRepository filter: provider");
    }
    if (typeof raw !== "string" || !raw.trim()) {
      throw new Error("Invalid provider in IntegrationRepository filter: provider");
    }
    const trimmed = raw.trim().toLowerCase();
    if (!VALID_INTEGRATION_PROVIDERS.has(trimmed)) {
      throw new Error(`Invalid provider in IntegrationRepository filter: ${trimmed}`);
    }
    return trimmed;
  }

  async _applyExistingUpdate(existing, rawPayload, updateData, returnUpdated, delegate) {
    if (rawPayload._id !== undefined || rawPayload.id !== undefined) {
      const idVal = extractAndValidateScalarId(rawPayload._id ?? rawPayload.id, "id");
      if (idVal !== existing.id) {
        throw new Error("Cannot alter immutable id for Integration");
      }
    }
    if (rawPayload.organization !== undefined || rawPayload.organizationId !== undefined) {
      const orgVal = extractAndValidateScalarId(rawPayload.organization ?? rawPayload.organizationId, "organizationId");
      if (orgVal !== existing.organizationId) {
        throw new Error("Cannot alter immutable organization for Integration");
      }
    }
    if (rawPayload.provider !== undefined) {
      const provVal = String(rawPayload.provider).trim().toLowerCase();
      if (provVal !== existing.provider) {
        throw new Error("Cannot alter immutable provider for Integration");
      }
    }

    if (Object.keys(updateData).length === 0) {
      return this.formatIntegration(existing);
    }

    const updated = await delegate.update({
      where: { id: existing.id },
      data: updateData,
    });
    return returnUpdated ? this.formatIntegration(updated) : this.formatIntegration(existing);
  }

  async _applyUpsertCreate({
    filterOrgId,
    filterProvider,
    rawPayload,
    setOnInsertFields,
    updateData,
    returnUpdated,
    where,
    delegate,
  }) {
    const insertPayload = { ...setOnInsertFields, ...rawPayload };

    const newId = insertPayload.id || insertPayload._id
      ? extractAndValidateScalarId(insertPayload.id || insertPayload._id, "id")
      : generateId();

    const createData = {
      id: newId,
      organizationId: filterOrgId,
      provider: filterProvider,
      apiKey: insertPayload.apiKey !== undefined ? insertPayload.apiKey : null,
      subdomain: insertPayload.subdomain !== undefined ? insertPayload.subdomain : null,
      connected: Boolean(insertPayload.connected),
      accessToken: insertPayload.accessToken !== undefined ? insertPayload.accessToken : null,
      refreshToken: insertPayload.refreshToken !== undefined ? insertPayload.refreshToken : null,
      expiresAt: insertPayload.expiresAt !== undefined ? this._parseNullableDate(insertPayload.expiresAt, "expiresAt") : null,
      cloudId: insertPayload.cloudId !== undefined ? insertPayload.cloudId : null,
      clientSecret: insertPayload.clientSecret !== undefined ? insertPayload.clientSecret : null,
      siteUrl: insertPayload.siteUrl !== undefined ? insertPayload.siteUrl : null,
      workspaceName: insertPayload.workspaceName !== undefined ? insertPayload.workspaceName : null,
      accountId: insertPayload.accountId !== undefined ? insertPayload.accountId : null,
      workspaceId: insertPayload.workspaceId !== undefined ? insertPayload.workspaceId : null,
      slackChannelId: insertPayload.slackChannelId !== undefined ? insertPayload.slackChannelId : null,
      slackChannelName: insertPayload.slackChannelName !== undefined ? insertPayload.slackChannelName : null,
      notifications: insertPayload.notifications !== undefined ? insertPayload.notifications : null,
      userId: insertPayload.userId ? extractAndValidateScalarId(insertPayload.userId, "userId") : null,
      email: insertPayload.email !== undefined ? insertPayload.email : null,
      lastDailySummarySent: insertPayload.lastDailySummarySent !== undefined
        ? this._parseNullableDate(insertPayload.lastDailySummarySent, "lastDailySummarySent")
        : null,
      lastWeeklySummarySent: insertPayload.lastWeeklySummarySent !== undefined
        ? this._parseNullableDate(insertPayload.lastWeeklySummarySent, "lastWeeklySummarySent")
        : null,
    };

    let created;
    try {
      created = await delegate.create({ data: createData });
    } catch (createErr) {
      if (createErr && createErr.code === "P2002") {
        const target = createErr.meta?.target;
        const isTargetMatch = (t) => {
          if (!t) return false;
          const str = Array.isArray(t) ? t.join(",") : String(t);
          return str.includes("organization") || str.includes("provider");
        };
        if (isTargetMatch(target)) {
          const raceExisting = await delegate.findFirst({ where });
          if (raceExisting) {
            return await this._applyExistingUpdate(raceExisting, rawPayload, updateData, returnUpdated, delegate);
          }
        }
      }
      throw createErr;
    }

    return returnUpdated ? this.formatIntegration(created) : null;
  }

  /**
   * Hardened findOneAndUpdate implementation (MIG-REM-91A)
   *
   * Security & Integrity Guarantees:
   * 1. Fail-closed filter validation prevents unscoped queries (where: {}) and cross-tenant leakage.
   *    Requires either a validated scalar organization identifier or a primary record ID.
   * 2. When provider is supplied, requires organization-scoped lookup.
   * 3. Immutability of ownership and identity fields (organizationId, provider, id).
   * 4. Strict update payload allowlist derived from Prisma Integration schema.
   * 5. Mongoose-compatible return semantics with deterministic precedence.
   * 6. Transaction-scoped PostgreSQL advisory locking on upsert:
   *    Keyed by (organizationId, provider) to serialize concurrent creation and prevent duplicate records.
   *    Note: Pre-existing duplicates and direct creation outside this repository remain separate operational concerns.
   */
  async findOneAndUpdate(filter, update, options = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("IntegrationRepository.findOneAndUpdate requires a valid filter object");
        }
        if (!update || typeof update !== "object" || Array.isArray(update)) {
          throw new Error("IntegrationRepository.findOneAndUpdate requires a valid update object");
        }

        const filterKeys = Object.keys(filter);
        if (filterKeys.length === 0) {
          throw new Error("IntegrationRepository.findOneAndUpdate requires a scoped filter object");
        }

        for (const key of filterKeys) {
          if (key.startsWith("$")) {
            throw new Error(`Unsupported filter operator in IntegrationRepository: ${key}`);
          }
          if (!ALLOWED_INTEGRATION_FILTER_FIELDS.has(key)) {
            throw new Error(`Unsupported filter field in IntegrationRepository: ${key}`);
          }
        }

        let filterOrgId = null;
        if (filter.organization !== undefined) {
          filterOrgId = extractAndValidateScalarId(filter.organization, "organization");
          if (!filterOrgId) {
            throw new Error("Invalid organization identifier in IntegrationRepository: organization");
          }
        }
        if (filter.organizationId !== undefined) {
          const orgIdFromField = extractAndValidateScalarId(filter.organizationId, "organizationId");
          if (!orgIdFromField) {
            throw new Error("Invalid organization identifier in IntegrationRepository: organizationId");
          }
          if (filterOrgId && filterOrgId !== orgIdFromField) {
            throw new Error("Conflicting organization filters in IntegrationRepository");
          }
          filterOrgId = orgIdFromField;
        }

        let filterId = null;
        if (filter._id !== undefined) {
          filterId = extractAndValidateScalarId(filter._id, "_id");
          if (!filterId) {
            throw new Error("Invalid identifier in IntegrationRepository: _id");
          }
        }
        if (filter.id !== undefined) {
          const idFromField = extractAndValidateScalarId(filter.id, "id");
          if (!idFromField) {
            throw new Error("Invalid identifier in IntegrationRepository: id");
          }
          if (filterId && filterId !== idFromField) {
            throw new Error("Conflicting id filters in IntegrationRepository");
          }
          filterId = idFromField;
        }

        let filterProvider = null;
        if (filter.provider !== undefined) {
          filterProvider = this._validateSingleProvider(filter.provider);
        }

        if (filterProvider && !filterOrgId) {
          throw new Error("Integration lookup with provider must be scoped by organization");
        }
        if (!filterOrgId && !filterId) {
          throw new Error("IntegrationRepository.findOneAndUpdate requires a scoped filter with organization or id");
        }

        const where = {};
        if (filterOrgId) where.organizationId = filterOrgId;
        if (filterId) where.id = filterId;
        if (filterProvider) where.provider = filterProvider;
        if (filter.connected !== undefined) {
          where.connected = this._processConnectedFilter(filter.connected);
        }
        if (filter.userId !== undefined) {
          where.userId = extractAndValidateScalarId(filter.userId, "userId");
        }
        if (filter.lastDailySummarySent !== undefined) {
          where.lastDailySummarySent = this._processDateFilter(filter.lastDailySummarySent, "lastDailySummarySent");
        }
        if (filter.lastWeeklySummarySent !== undefined) {
          where.lastWeeklySummarySent = this._processDateFilter(filter.lastWeeklySummarySent, "lastWeeklySummarySent");
        }
        if (filter.createdAt !== undefined) {
          where.createdAt = this._processDateFilter(filter.createdAt, "createdAt");
        }

        // Validate update operators
        for (const key of Object.keys(update)) {
          if (key.startsWith("$") && key !== "$set" && key !== "$setOnInsert") {
            throw new Error(`Unsupported update operator in IntegrationRepository: ${key}`);
          }
        }

        if (update.$set !== undefined) {
          if (!update.$set || typeof update.$set !== "object" || Array.isArray(update.$set)) {
            throw new Error("Invalid $set envelope in IntegrationRepository.findOneAndUpdate");
          }
          for (const key of Object.keys(update.$set)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in IntegrationRepository: ${key}`);
            }
          }
        }

        if (update.$setOnInsert !== undefined) {
          if (!update.$setOnInsert || typeof update.$setOnInsert !== "object" || Array.isArray(update.$setOnInsert)) {
            throw new Error("Invalid $setOnInsert envelope in IntegrationRepository.findOneAndUpdate");
          }
          for (const key of Object.keys(update.$setOnInsert)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in IntegrationRepository: ${key}`);
            }
          }
        }

        const directFields = { ...update };
        delete directFields.$set;
        delete directFields.$setOnInsert;
        const setFields = update.$set || {};
        const setOnInsertFields = update.$setOnInsert || {};

        for (const key of Object.keys(setFields)) {
          if (directFields[key] !== undefined) {
            if (!isSameValue(directFields[key], setFields[key])) {
              throw new Error(`Conflicting update values for field '${key}' between direct payload and $set envelope`);
            }
          }
        }

        const rawPayload = { ...directFields, ...setFields };

        // Validate allowed update fields
        for (const key of Object.keys(rawPayload)) {
          if (typeof rawPayload[key] === "function") {
            continue;
          }
          if (!ALLOWED_INTEGRATION_UPDATE_FIELDS.has(key) && !ALLOWED_INTEGRATION_PASSTHROUGH_FIELDS.has(key)) {
            throw new Error(`Unsupported update field in IntegrationRepository: ${key}`);
          }
        }

        for (const key of Object.keys(setOnInsertFields)) {
          if (typeof setOnInsertFields[key] === "function") {
            continue;
          }
          if (!ALLOWED_INTEGRATION_UPDATE_FIELDS.has(key) && !ALLOWED_INTEGRATION_PASSTHROUGH_FIELDS.has(key)) {
            throw new Error(`Unsupported update field in IntegrationRepository: ${key}`);
          }
        }

        // Validate alias conflicts in rawPayload
        if (rawPayload._id !== undefined && rawPayload.id !== undefined) {
          const idA = extractAndValidateScalarId(rawPayload._id, "_id");
          const idB = extractAndValidateScalarId(rawPayload.id, "id");
          if (idA !== idB) {
            throw new Error("Conflicting update values for '_id' and 'id' in IntegrationRepository");
          }
        }
        if (rawPayload.organization !== undefined && rawPayload.organizationId !== undefined) {
          const orgA = extractAndValidateScalarId(rawPayload.organization, "organization");
          const orgB = extractAndValidateScalarId(rawPayload.organizationId, "organizationId");
          if (orgA !== orgB) {
            throw new Error("Conflicting update values for 'organization' and 'organizationId' in IntegrationRepository");
          }
        }

        // Validate alias conflicts in $setOnInsert
        if (setOnInsertFields._id !== undefined && setOnInsertFields.id !== undefined) {
          const idA = extractAndValidateScalarId(setOnInsertFields._id, "_id");
          const idB = extractAndValidateScalarId(setOnInsertFields.id, "id");
          if (idA !== idB) {
            throw new Error("Conflicting $setOnInsert values for '_id' and 'id' in IntegrationRepository");
          }
        }
        if (setOnInsertFields.organization !== undefined && setOnInsertFields.organizationId !== undefined) {
          const orgA = extractAndValidateScalarId(setOnInsertFields.organization, "organization");
          const orgB = extractAndValidateScalarId(setOnInsertFields.organizationId, "organizationId");
          if (orgA !== orgB) {
            throw new Error("Conflicting $setOnInsert values for 'organization' and 'organizationId' in IntegrationRepository");
          }
        }

        // Validate immutable fields against filter
        const payloadOrg = rawPayload.organization ?? rawPayload.organizationId;
        if (payloadOrg !== undefined && filterOrgId) {
          const payloadOrgId = extractAndValidateScalarId(payloadOrg, "organizationId");
          if (payloadOrgId !== filterOrgId) {
            throw new Error("Cannot alter immutable organization for Integration");
          }
        }

        const insertOrg = setOnInsertFields.organization ?? setOnInsertFields.organizationId;
        if (insertOrg !== undefined && filterOrgId) {
          const insertOrgId = extractAndValidateScalarId(insertOrg, "organizationId");
          if (insertOrgId !== filterOrgId) {
            throw new Error("Cannot alter immutable organization for Integration");
          }
        }

        if (rawPayload.provider !== undefined && filterProvider) {
          const payloadProv = String(rawPayload.provider).trim().toLowerCase();
          if (payloadProv !== filterProvider) {
            throw new Error("Cannot alter immutable provider for Integration");
          }
        }

        if (setOnInsertFields.provider !== undefined && filterProvider) {
          const insertProv = String(setOnInsertFields.provider).trim().toLowerCase();
          if (insertProv !== filterProvider) {
            throw new Error("Cannot alter immutable provider for Integration");
          }
        }

        const payloadId = rawPayload._id ?? rawPayload.id;
        if (payloadId !== undefined && filterId) {
          const pId = extractAndValidateScalarId(payloadId, "id");
          if (pId !== filterId) {
            throw new Error("Cannot alter immutable id for Integration");
          }
        }

        const returnUpdated = resolveReturnUpdated(options);

        const updateData = {};
        if (rawPayload.apiKey !== undefined) updateData.apiKey = rawPayload.apiKey;
        if (rawPayload.subdomain !== undefined) updateData.subdomain = rawPayload.subdomain;
        if (rawPayload.connected !== undefined) updateData.connected = Boolean(rawPayload.connected);
        if (rawPayload.accessToken !== undefined) updateData.accessToken = rawPayload.accessToken;
        if (rawPayload.refreshToken !== undefined) updateData.refreshToken = rawPayload.refreshToken;
        if (rawPayload.expiresAt !== undefined) {
          updateData.expiresAt = this._parseNullableDate(rawPayload.expiresAt, "expiresAt");
        }
        if (rawPayload.cloudId !== undefined) updateData.cloudId = rawPayload.cloudId;
        if (rawPayload.clientSecret !== undefined) updateData.clientSecret = rawPayload.clientSecret;
        if (rawPayload.siteUrl !== undefined) updateData.siteUrl = rawPayload.siteUrl;
        if (rawPayload.workspaceName !== undefined) updateData.workspaceName = rawPayload.workspaceName;
        if (rawPayload.accountId !== undefined) updateData.accountId = rawPayload.accountId;
        if (rawPayload.workspaceId !== undefined) updateData.workspaceId = rawPayload.workspaceId;
        if (rawPayload.slackChannelId !== undefined) updateData.slackChannelId = rawPayload.slackChannelId;
        if (rawPayload.slackChannelName !== undefined) updateData.slackChannelName = rawPayload.slackChannelName;
        if (rawPayload.notifications !== undefined) updateData.notifications = rawPayload.notifications;
        if (rawPayload.userId !== undefined) {
          updateData.userId = rawPayload.userId ? extractAndValidateScalarId(rawPayload.userId, "userId") : null;
        }
        if (rawPayload.email !== undefined) updateData.email = rawPayload.email;
        if (rawPayload.lastDailySummarySent !== undefined) {
          updateData.lastDailySummarySent = this._parseNullableDate(rawPayload.lastDailySummarySent, "lastDailySummarySent");
        }
        if (rawPayload.lastWeeklySummarySent !== undefined) {
          updateData.lastWeeklySummarySent = this._parseNullableDate(rawPayload.lastWeeklySummarySent, "lastWeeklySummarySent");
        }

        if (options.upsert) {
          const targetOrgId = filterOrgId || (rawPayload.organization || rawPayload.organizationId ? extractAndValidateScalarId(rawPayload.organization ?? rawPayload.organizationId, "organizationId") : null) || (setOnInsertFields.organization || setOnInsertFields.organizationId ? extractAndValidateScalarId(setOnInsertFields.organization ?? setOnInsertFields.organizationId, "organizationId") : null);

          if (!targetOrgId) {
            throw new Error("Cannot upsert Integration without valid organization identifier");
          }

          let targetProvider = filterProvider;
          if (!targetProvider) {
            const rawProv = rawPayload.provider ?? setOnInsertFields.provider;
            if (rawProv) {
              targetProvider = this._validateSingleProvider(rawProv);
            }
          }

          if (!targetProvider) {
            throw new Error("Cannot upsert Integration without valid provider");
          }

          const orgTag = `integration:org:${targetOrgId}`;
          const providerTag = `provider:${targetProvider}`;

          const ambientTx = isTransactionActive() ? getAmbientTransaction() : null;
          const isMockedPrisma = Object.prototype.hasOwnProperty.call(this, "prisma") ||
            Object.getOwnPropertyDescriptor(this, "prisma") !== undefined ||
            (Object.getOwnPropertyDescriptor(this, "delegate") !== undefined && typeof this.prisma?.$transaction === "function");

          let executeInTx;
          if (ambientTx) {
            executeInTx = (fn) => fn(ambientTx);
          } else if (isMockedPrisma && typeof this.prisma?.$transaction === "function") {
            executeInTx = (fn) => this.prisma.$transaction(fn);
          } else {
            executeInTx = (fn) => runTransaction(fn);
          }

          return await executeInTx(async (txClient) => {
            const tx = txClient || this.prisma;
            const delegate = tx?.integration || this.delegate;

            if (typeof tx?.$executeRaw === "function") {
              await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orgTag}), hashtext(${providerTag}))`;
            } else if (typeof tx?.$queryRaw === "function") {
              await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${orgTag}), hashtext(${providerTag}))`;
            } else {
              throw new Error("Transaction client does not support raw queries for advisory locking in IntegrationRepository");
            }

            const existing = await delegate.findFirst({ where });
            if (existing) {
              return await this._applyExistingUpdate(existing, rawPayload, updateData, returnUpdated, delegate);
            }
            return await this._applyUpsertCreate({
              filterOrgId: targetOrgId,
              filterProvider: targetProvider,
              rawPayload,
              setOnInsertFields,
              updateData,
              returnUpdated,
              where,
              delegate,
            });
          });
        }

        const existing = await this.delegate.findFirst({ where });
        if (existing) {
          return await this._applyExistingUpdate(existing, rawPayload, updateData, returnUpdated, this.delegate);
        }

        return null;
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOneAndUpdate(filter, update, options);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  _validateScalarId(val, fieldName) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in IntegrationRepository filter for field: ${fieldName}`);
    }

    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) {
        throw new Error(`Invalid identifier in IntegrationRepository filter for field: ${fieldName}`);
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

      if (typeof val.toHexString === "function") {
        const hex = val.toHexString().trim();
        if (hex) return hex;
      }
      if (typeof val.toString === "function") {
        const str = val.toString().trim();
        if (str && str !== "[object Object]") {
          return str;
        }
      }

      throw new Error(`Invalid identifier object in IntegrationRepository filter: ${fieldName}`);
    }

    throw new Error(`Invalid identifier in IntegrationRepository filter for field: ${fieldName}`);
  }

  _processIdFilter(val, fieldName) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid identifier in IntegrationRepository filter for field: ${fieldName}`);
    }

    if (Array.isArray(val)) {
      if (val.length === 0) return { in: [] };
      return { in: val.map((item) => this._validateScalarId(item, fieldName)) };
    }

    if (typeof val === "object") {
      if (val.$in !== undefined) {
        if (!Array.isArray(val.$in)) {
          throw new Error(`Invalid array in IntegrationRepository filter: ${fieldName}`);
        }
        if (val.$in.length === 0) return { in: [] };
        return { in: val.$in.map((item) => this._validateScalarId(item, fieldName)) };
      }
      if (val.in !== undefined) {
        if (!Array.isArray(val.in)) {
          throw new Error(`Invalid array in IntegrationRepository filter: ${fieldName}`);
        }
        if (val.in.length === 0) return { in: [] };
        return { in: val.in.map((item) => this._validateScalarId(item, fieldName)) };
      }

      for (const k of Object.keys(val)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in IntegrationRepository: ${k}`);
        }
      }

      return this._validateScalarId(val, fieldName);
    }

    return this._validateScalarId(val, fieldName);
  }

  _processProviderFilter(raw) {
    if (raw === null || raw === undefined) {
      throw new Error("Invalid provider in IntegrationRepository filter: provider");
    }

    const validateSingleProvider = (p) => {
      if (typeof p !== "string" || !p.trim()) {
        throw new Error("Invalid provider in IntegrationRepository filter: provider");
      }
      const trimmed = p.trim().toLowerCase();
      if (!VALID_INTEGRATION_PROVIDERS.has(trimmed)) {
        throw new Error(`Invalid provider in IntegrationRepository filter: ${trimmed}`);
      }
      return trimmed;
    };

    if (typeof raw === "string") {
      return validateSingleProvider(raw);
    }

    if (Array.isArray(raw)) {
      if (raw.length === 0) return { in: [] };
      return { in: raw.map(validateSingleProvider) };
    }

    if (typeof raw === "object") {
      if (raw.$in !== undefined) {
        if (!Array.isArray(raw.$in)) throw new Error("Invalid array in IntegrationRepository filter: provider");
        if (raw.$in.length === 0) return { in: [] };
        return { in: raw.$in.map(validateSingleProvider) };
      }
      if (raw.in !== undefined) {
        if (!Array.isArray(raw.in)) throw new Error("Invalid array in IntegrationRepository filter: provider");
        if (raw.in.length === 0) return { in: [] };
        return { in: raw.in.map(validateSingleProvider) };
      }

      for (const k of Object.keys(raw)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported filter operator in IntegrationRepository: ${k}`);
        }
      }
    }

    throw new Error("Invalid provider in IntegrationRepository filter: provider");
  }

  _processConnectedFilter(raw) {
    if (raw === null || raw === undefined || typeof raw !== "boolean") {
      throw new Error("Invalid connected value in IntegrationRepository filter: connected must be a boolean");
    }
    return raw;
  }

  _parseNullableDate(val, fieldName) {
    if (val === null || val === undefined) {
      return val === null ? null : undefined;
    }

    if (val instanceof Date) {
      if (isNaN(val.getTime())) {
        throw new Error(`Invalid date value in IntegrationRepository for field: ${fieldName}`);
      }
      return val;
    }

    if (typeof val === "string" || typeof val === "number") {
      const trimmed = typeof val === "string" ? val.trim() : val;
      if (trimmed === "") {
        throw new Error(`Invalid date value in IntegrationRepository for field: ${fieldName}`);
      }
      const d = new Date(trimmed);
      if (isNaN(d.getTime())) {
        throw new Error(`Invalid date value in IntegrationRepository for field: ${fieldName}`);
      }
      return d;
    }

    throw new Error(`Invalid date value in IntegrationRepository for field: ${fieldName}`);
  }

  _processDateFilter(raw, fieldName) {
    if (raw === null) {
      if (fieldName === "lastDailySummarySent" || fieldName === "lastWeeklySummarySent") {
        return null;
      }
      throw new Error(`Invalid date value in IntegrationRepository filter: ${fieldName}`);
    }

    if (raw === undefined) {
      throw new Error(`Invalid date value in IntegrationRepository filter: ${fieldName}`);
    }

    if (raw instanceof Date) {
      if (isNaN(raw.getTime())) {
        throw new Error(`Invalid date value in IntegrationRepository filter: ${fieldName}`);
      }
      return raw;
    }

    if (typeof raw === "string" || typeof raw === "number") {
      const trimmed = typeof raw === "string" ? raw.trim() : raw;
      if (trimmed === "") {
        throw new Error(`Invalid date value in IntegrationRepository filter: ${fieldName}`);
      }
      const d = new Date(trimmed);
      if (isNaN(d.getTime())) {
        throw new Error(`Invalid date value in IntegrationRepository filter: ${fieldName}`);
      }
      return d;
    }

    if (typeof raw === "object" && !Array.isArray(raw)) {
      const keys = Object.keys(raw);
      if (keys.length === 0) {
        throw new Error(`Invalid date range in IntegrationRepository filter: ${fieldName} cannot be an empty object`);
      }

      for (const op of keys) {
        if (!ALLOWED_DATE_OPERATORS.has(op)) {
          if (op.startsWith("$")) {
            throw new Error(`Unsupported filter operator in IntegrationRepository: ${op}`);
          }
          throw new Error(`Unsupported date range operator in IntegrationRepository: ${op}`);
        }
      }

      const dateCond = {};
      const parseDate = (val, op) => {
        if (val === null || val === undefined || (typeof val === "string" && !val.trim())) {
          throw new Error(`Invalid date value for operator ${op} in IntegrationRepository filter: ${fieldName}`);
        }
        const parsed = val instanceof Date ? val : new Date(val);
        if (isNaN(parsed.getTime())) {
          throw new Error(`Invalid date value for operator ${op} in IntegrationRepository filter: ${fieldName}`);
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
        throw new Error(`Invalid date range in IntegrationRepository filter: lower bound cannot be after upper bound in ${fieldName}`);
      }

      return dateCond;
    }

    throw new Error(`Invalid date value in IntegrationRepository filter: ${fieldName}`);
  }

  _processCreatedAtFilter(raw) {
    return this._processDateFilter(raw, "createdAt");
  }

  buildDeleteWhere(filter = {}) {
    const where = {};

    for (const key of Object.keys(filter || {})) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in IntegrationRepository: ${key}`);
      }
      if (!ALLOWED_INTEGRATION_DELETE_FIELDS.has(key)) {
        throw new Error(`Unsupported filter field in IntegrationRepository: ${key}`);
      }

      const val = filter[key];

      switch (key) {
        case "_id":
        case "id":
          where.id = this._processIdFilter(val, key);
          break;

        case "organization":
        case "organizationId":
          where.organizationId = this._processIdFilter(val, key);
          break;

        case "provider":
          where.provider = this._processProviderFilter(val);
          break;

        case "connected":
          where.connected = this._processConnectedFilter(val);
          break;

        case "userId":
          where.userId = this._processIdFilter(val, key);
          break;

        case "createdAt":
          where.createdAt = this._processCreatedAtFilter(val);
          break;

        case "lastDailySummarySent":
          where.lastDailySummarySent = this._processDateFilter(val, key);
          break;

        case "lastWeeklySummarySent":
          where.lastWeeklySummarySent = this._processDateFilter(val, key);
          break;
      }
    }

    return where;
  }

  async deleteMany(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("IntegrationRepository.deleteMany requires a valid filter object");
        }

        const where = this.buildDeleteWhere(filter);
        if (Object.keys(where).length === 0) {
          throw new Error("Bulk deletion requires a valid scoped filter in IntegrationRepository.deleteMany");
        }

        const res = await this.delegate.deleteMany({ where });
        return { deletedCount: res.count };
      } catch (err) {
        this.handleError(err);
      }
    }

    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("IntegrationRepository.deleteMany requires a valid filter object");
    }
    return await this.mongooseModel.deleteMany(filter, options);
  }
}

export const integrationRepository = new IntegrationRepository();
export default integrationRepository;
