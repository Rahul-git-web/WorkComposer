import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

const DEFAULT_TRACKING = {
  trackingMode: "automatic",
  startTrackingOnBoot: true,
  allowWorkAwayFromComputer: false,
  pauseTrackingWhenInactive: true,
  inactivityMinutes: 3,
  continueTrackingDuringSleep: true,
  sleepBreakHours: 4,
  sleepBreakMinutes: 0,
  displayBackToWorkReminder: true,
  stopTrackingWithoutInternet: false,
  statusBarVisibility: "during_tracking",
  applicationTracking: true,
  ipTracking: true,
};

const DEFAULT_SCREEN_CAPTURE = {
  enabled: true,
  randomizeFrequency: false,
  screenshotFrequency: 5,
  blurScreenshots: "disabled",
};

const DEFAULT_MANUAL_TIME = {
  allowManualTime: true,
  requireApproval: true,
  managerApproval: true,
  backdatingLimit: 365,
  requireProjectTask: false,
};

const DEFAULT_SHIFT = {
  enabled: false,
  autoStartTracking: false,
  autoStopTracking: false,
  stopTrackingDuringBreaks: false,
  schedule: [],
};

const ALLOWED_UPDATE_FIELDS = new Set([
  "tracking",
  "screenCapture",
  "screen_capture",
  "manualTime",
  "manual_time",
  "shift",
  "productivity",
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
  "$setOnInsert",
  "save",
  "toObject",
  "toJSON",
  "isModified",
  "runValidators",
]);

function extractAndValidateScalarId(raw, fieldName) {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (Array.isArray(raw)) {
    throw new Error(`Invalid identifier in TimeTrackingSettingsRepository for field: ${fieldName}`);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "[object Object]") {
      throw new Error(`Invalid identifier in TimeTrackingSettingsRepository for field: ${fieldName}`);
    }
    return trimmed;
  }
  if (typeof raw === "number") {
    if (isNaN(raw)) {
      throw new Error(`Invalid identifier in TimeTrackingSettingsRepository for field: ${fieldName}`);
    }
    return String(raw);
  }
  if (typeof raw === "boolean") {
    throw new Error(`Invalid identifier in TimeTrackingSettingsRepository for field: ${fieldName}`);
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
    throw new Error(`Invalid identifier in TimeTrackingSettingsRepository for field: ${fieldName}`);
  }
  throw new Error(`Invalid identifier in TimeTrackingSettingsRepository for field: ${fieldName}`);
}

function getInvalidIdentifierErrorMessage(fieldName) {
  if (fieldName === "organization" || fieldName === "organizationId") {
    return `Invalid organization identifier in TimeTrackingSettingsRepository: ${fieldName}`;
  }
  return `Invalid identifier in TimeTrackingSettingsRepository: ${fieldName}`;
}

function parseAndValidateFilterField(value, fieldName) {
  if (value === null || value === undefined) {
    throw new Error(getInvalidIdentifierErrorMessage(fieldName));
  }

  if (Array.isArray(value)) {
    const validated = value.map((item) => {
      const id = extractAndValidateScalarId(item, fieldName);
      if (!id) {
        throw new Error(getInvalidIdentifierErrorMessage(fieldName));
      }
      return id;
    });
    return { in: validated };
  }

  if (typeof value === "object") {
    const keys = Object.keys(value);
    const hasDollarKey = keys.some((k) => k.startsWith("$"));

    if (hasDollarKey) {
      for (const k of keys) {
        if (k !== "$in") {
          throw new Error(`Unsupported filter operator in TimeTrackingSettingsRepository: ${k}`);
        }
      }
      if (!Array.isArray(value.$in)) {
        throw new Error(`Invalid $in filter in TimeTrackingSettingsRepository for field: ${fieldName}`);
      }
      const validated = value.$in.map((item) => {
        const id = extractAndValidateScalarId(item, fieldName);
        if (!id) {
          throw new Error(getInvalidIdentifierErrorMessage(fieldName));
        }
        return id;
      });
      return { in: validated };
    }

    const scalarId = extractAndValidateScalarId(value, fieldName);
    if (!scalarId) {
      throw new Error(getInvalidIdentifierErrorMessage(fieldName));
    }
    return scalarId;
  }

  const scalarId = extractAndValidateScalarId(value, fieldName);
  if (!scalarId) {
    throw new Error(getInvalidIdentifierErrorMessage(fieldName));
  }
  return scalarId;
}

function isFilterValueEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (typeof a === "object" && typeof b === "object" && a.in && b.in) {
    if (!Array.isArray(a.in) || !Array.isArray(b.in)) return false;
    if (a.in.length !== b.in.length) return false;
    const sortedA = [...a.in].sort();
    const sortedB = [...b.in].sort();
    return sortedA.every((v, idx) => v === sortedB[idx]);
  }
  if (typeof a === "object" || typeof b === "object") return false;
  return String(a).trim() === String(b).trim();
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

function isOrganizationUniqueConstraintError(err) {
  if (!err) return false;
  if (err.code !== "P2002") return false;

  const target = err.meta?.target;
  if (target) {
    if (Array.isArray(target)) {
      const isOrg = target.some((t) => t === "organization_id" || t === "organizationId");
      if (isOrg) return true;
      return false;
    }
    if (typeof target === "string") {
      if (target.includes("organization_id") || target.includes("organizationId")) {
        return true;
      }
      return false;
    }
  }

  const msg = String(err.message || "");
  if (msg.includes("organization_id") || msg.includes("organizationId")) {
    return true;
  }

  return false;
}

export class TimeTrackingSettingsRepository extends BaseRepository {
  constructor() {
    super("TimeTrackingSettings");
  }

  formatSettings(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    if (serialized.id && !serialized._id) serialized._id = String(serialized.id);
    if (serialized._id && !serialized.id) serialized.id = String(serialized._id);
    serialized.organization = serialized.organization || serialized.organizationId;
    delete serialized.organizationId;
    if (serialized.screen_capture && !serialized.screenCapture) {
      serialized.screenCapture = serialized.screen_capture;
    }
    delete serialized.screen_capture;
    if (serialized.manual_time && !serialized.manualTime) {
      serialized.manualTime = serialized.manual_time;
    }
    delete serialized.manual_time;

    if (typeof serialized.shift === "string") {
      try {
        serialized.shift = JSON.parse(serialized.shift);
      } catch {
        serialized.shift = null;
      }
    }

    serialized.tracking = serialized.tracking ? { ...DEFAULT_TRACKING, ...serialized.tracking } : { ...DEFAULT_TRACKING };
    serialized.screenCapture = serialized.screenCapture ? { ...DEFAULT_SCREEN_CAPTURE, ...serialized.screenCapture } : { ...DEFAULT_SCREEN_CAPTURE };
    serialized.manualTime = serialized.manualTime ? { ...DEFAULT_MANUAL_TIME, ...serialized.manualTime } : { ...DEFAULT_MANUAL_TIME };
    serialized.shift = serialized.shift ? { ...DEFAULT_SHIFT, ...serialized.shift } : { ...DEFAULT_SHIFT };
    if (!serialized.productivity) delete serialized.productivity;

    return serialized;
  }

  buildWhere(filter = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("TimeTrackingSettingsRepository query requires a valid filter object");
    }

    const ALLOWED_FILTER_FIELDS = new Set(["organization", "organizationId", "_id", "id"]);
    for (const key of Object.keys(filter)) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in TimeTrackingSettingsRepository: ${key}`);
      }
      if (!ALLOWED_FILTER_FIELDS.has(key)) {
        throw new Error(`Unsupported filter field in TimeTrackingSettingsRepository: ${key}`);
      }
    }

    let resolvedOrg = null;
    if (Object.prototype.hasOwnProperty.call(filter, "organization")) {
      resolvedOrg = parseAndValidateFilterField(filter.organization, "organization");
    }

    let resolvedOrgFromField = null;
    if (Object.prototype.hasOwnProperty.call(filter, "organizationId")) {
      resolvedOrgFromField = parseAndValidateFilterField(filter.organizationId, "organizationId");
    }

    if (resolvedOrg !== null && resolvedOrgFromField !== null) {
      if (!isFilterValueEqual(resolvedOrg, resolvedOrgFromField)) {
        throw new Error("Conflicting organization filters in TimeTrackingSettingsRepository");
      }
    }

    let resolvedId = null;
    if (Object.prototype.hasOwnProperty.call(filter, "_id")) {
      resolvedId = parseAndValidateFilterField(filter._id, "_id");
    }

    let resolvedIdFromField = null;
    if (Object.prototype.hasOwnProperty.call(filter, "id")) {
      resolvedIdFromField = parseAndValidateFilterField(filter.id, "id");
    }

    if (resolvedId !== null && resolvedIdFromField !== null) {
      if (!isFilterValueEqual(resolvedId, resolvedIdFromField)) {
        throw new Error("Conflicting id filters in TimeTrackingSettingsRepository");
      }
    }

    const finalOrg = resolvedOrg !== null ? resolvedOrg : resolvedOrgFromField;
    const finalId = resolvedId !== null ? resolvedId : resolvedIdFromField;

    if (finalOrg === null && finalId === null) {
      throw new Error("TimeTrackingSettingsRepository query requires a valid scoped filter: organization, organizationId, id, or _id is required");
    }

    const where = {};
    if (finalOrg !== null) {
      where.organizationId = finalOrg;
    }
    if (finalId !== null) {
      where.id = finalId;
    }

    return where;
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("TimeTrackingSettingsRepository.find requires a valid filter object");
        }
        if (Object.keys(filter).length === 0) {
          throw new Error("TimeTrackingSettingsRepository.find requires a valid scoped filter: organization, organizationId, id, or _id is required");
        }
        const where = this.buildWhere(filter);
        if (!where.organizationId && !where.id) {
          throw new Error("TimeTrackingSettingsRepository.find requires a valid scoped filter: organization, organizationId, id, or _id is required");
        }
        const queryOptions = { where };

        if (options.sort) {
          const [sortField, sortDir] = Object.entries(options.sort)[0] || ["createdAt", 1];
          const prismaField =
            sortField === "_id" ? "id" : sortField === "organization" ? "organizationId" : sortField;
          queryOptions.orderBy = {
            [prismaField]: sortDir === -1 || sortDir === "desc" ? "desc" : "asc",
          };
        }
        if (typeof options.skip === "number" && !isNaN(options.skip)) {
          queryOptions.skip = options.skip;
        }
        if (typeof options.limit === "number" && !isNaN(options.limit)) {
          queryOptions.take = options.limit;
        } else if (typeof options.take === "number" && !isNaN(options.take)) {
          queryOptions.take = options.take;
        }

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((doc) => this.formatSettings(doc));
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.find(filter);
    if (options.sort) query = query.sort(options.sort);
    if (options.skip) query = query.skip(options.skip);
    if (options.limit) query = query.limit(options.limit);
    const docs = await query;
    return docs.map((doc) => this.serialize(doc.toObject ? doc.toObject() : doc));
  }

  async findOne(filter = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("TimeTrackingSettingsRepository.findOne requires a valid filter object");
        }
        if (Object.keys(filter).length === 0) {
          throw new Error("TimeTrackingSettingsRepository.findOne requires a valid scoped filter: organization, organizationId, id, or _id is required");
        }

        const where = this.buildWhere(filter);

        if (!where.organizationId && !where.id) {
          throw new Error("TimeTrackingSettingsRepository.findOne requires a valid scoped filter: organization, organizationId, id, or _id is required");
        }

        const doc = await this.delegate.findFirst({ where });
        return doc ? this.formatSettings(doc) : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOne(filter);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findById(id, options = {}) {
    if (isPostgres()) {
      try {
        const idStr = extractAndValidateScalarId(id, "id");
        if (!idStr) {
          throw new Error("Invalid identifier in TimeTrackingSettingsRepository: id");
        }
        const doc = await this.delegate.findUnique({
          where: { id: idStr },
        });
        return doc ? this.formatSettings(doc) : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findById(id);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findByIdAndUpdate(id, update, options = { new: true }) {
    if (isPostgres()) {
      try {
        const idStr = extractAndValidateScalarId(id, "id");
        if (!idStr) {
          throw new Error("Invalid identifier in TimeTrackingSettingsRepository: id");
        }

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

  async findOneAndUpdate(filter, update, options = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("TimeTrackingSettingsRepository.findOneAndUpdate requires a valid filter object");
    }

    if (!update || typeof update !== "object" || Array.isArray(update)) {
      throw new Error("TimeTrackingSettingsRepository.findOneAndUpdate requires a valid update object");
    }

    if (isPostgres()) {
      try {
        const filterKeys = Object.keys(filter);
        if (filterKeys.length === 0) {
          throw new Error("TimeTrackingSettingsRepository.findOneAndUpdate requires a scoped filter object");
        }

        const ALLOWED_FILTER_FIELDS = new Set(["organization", "organizationId", "_id", "id"]);
        for (const key of filterKeys) {
          if (key.startsWith("$")) {
            throw new Error(`Unsupported filter operator in TimeTrackingSettingsRepository: ${key}`);
          }
          if (!ALLOWED_FILTER_FIELDS.has(key)) {
            throw new Error(`Unsupported filter field in TimeTrackingSettingsRepository: ${key}`);
          }
        }

        let filterOrgId = null;
        if (Object.prototype.hasOwnProperty.call(filter, "organization")) {
          filterOrgId = extractAndValidateScalarId(filter.organization, "organization");
          if (!filterOrgId) {
            throw new Error("Invalid organization identifier in TimeTrackingSettingsRepository: organization");
          }
        }
        if (Object.prototype.hasOwnProperty.call(filter, "organizationId")) {
          const orgIdFromField = extractAndValidateScalarId(filter.organizationId, "organizationId");
          if (!orgIdFromField) {
            throw new Error("Invalid organization identifier in TimeTrackingSettingsRepository: organizationId");
          }
          if (filterOrgId && filterOrgId !== orgIdFromField) {
            throw new Error("Conflicting organization filters in TimeTrackingSettingsRepository");
          }
          filterOrgId = orgIdFromField;
        }

        let filterId = null;
        if (Object.prototype.hasOwnProperty.call(filter, "_id")) {
          filterId = extractAndValidateScalarId(filter._id, "_id");
          if (!filterId) {
            throw new Error("Invalid identifier in TimeTrackingSettingsRepository: _id");
          }
        }
        if (Object.prototype.hasOwnProperty.call(filter, "id")) {
          const idFromField = extractAndValidateScalarId(filter.id, "id");
          if (!idFromField) {
            throw new Error("Invalid identifier in TimeTrackingSettingsRepository: id");
          }
          if (filterId && filterId !== idFromField) {
            throw new Error("Conflicting id filters in TimeTrackingSettingsRepository");
          }
          filterId = idFromField;
        }

        if (!filterOrgId && !filterId) {
          throw new Error("TimeTrackingSettingsRepository.findOneAndUpdate requires a scoped filter object");
        }

        if (options && options.upsert && !filterOrgId) {
          throw new Error("Cannot upsert TimeTrackingSettings without valid organization identifier");
        }

        const where = {};
        if (filterOrgId) where.organizationId = filterOrgId;
        if (filterId) where.id = filterId;

        // Validate update operators
        for (const key of Object.keys(update)) {
          if (key.startsWith("$") && key !== "$set" && key !== "$setOnInsert") {
            throw new Error(`Unsupported update operator in TimeTrackingSettingsRepository: ${key}`);
          }
        }

        if (update.$set !== undefined) {
          if (!update.$set || typeof update.$set !== "object" || Array.isArray(update.$set)) {
            throw new Error("Invalid $set envelope in TimeTrackingSettingsRepository.findOneAndUpdate");
          }
          for (const key of Object.keys(update.$set)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in TimeTrackingSettingsRepository: ${key}`);
            }
          }
        }

        if (update.$setOnInsert !== undefined) {
          if (!update.$setOnInsert || typeof update.$setOnInsert !== "object" || Array.isArray(update.$setOnInsert)) {
            throw new Error("Invalid $setOnInsert envelope in TimeTrackingSettingsRepository.findOneAndUpdate");
          }
          for (const key of Object.keys(update.$setOnInsert)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in TimeTrackingSettingsRepository: ${key}`);
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
          if (key.startsWith("shift.")) {
            continue;
          }
          if (!ALLOWED_UPDATE_FIELDS.has(key) && !ALLOWED_PASSTHROUGH_FIELDS.has(key)) {
            throw new Error(`Unsupported update field in TimeTrackingSettingsRepository: ${key}`);
          }
        }

        // Validate alias conflicts in rawPayload
        if (rawPayload._id !== undefined && rawPayload.id !== undefined) {
          const idA = extractAndValidateScalarId(rawPayload._id, "_id");
          const idB = extractAndValidateScalarId(rawPayload.id, "id");
          if (idA !== idB) {
            throw new Error("Conflicting update values for '_id' and 'id' in TimeTrackingSettingsRepository");
          }
        }
        if (rawPayload.organization !== undefined && rawPayload.organizationId !== undefined) {
          const orgA = extractAndValidateScalarId(rawPayload.organization, "organization");
          const orgB = extractAndValidateScalarId(rawPayload.organizationId, "organizationId");
          if (orgA !== orgB) {
            throw new Error("Conflicting update values for 'organization' and 'organizationId' in TimeTrackingSettingsRepository");
          }
        }
        if (rawPayload.screenCapture !== undefined && rawPayload.screen_capture !== undefined) {
          if (!isSameValue(rawPayload.screenCapture, rawPayload.screen_capture)) {
            throw new Error("Conflicting update values for 'screenCapture' and 'screen_capture' in TimeTrackingSettingsRepository");
          }
        }
        if (rawPayload.manualTime !== undefined && rawPayload.manual_time !== undefined) {
          if (!isSameValue(rawPayload.manualTime, rawPayload.manual_time)) {
            throw new Error("Conflicting update values for 'manualTime' and 'manual_time' in TimeTrackingSettingsRepository");
          }
        }

        // Validate alias conflicts in $setOnInsert
        if (setOnInsertFields.organization !== undefined && setOnInsertFields.organizationId !== undefined) {
          const orgA = extractAndValidateScalarId(setOnInsertFields.organization, "organization");
          const orgB = extractAndValidateScalarId(setOnInsertFields.organizationId, "organizationId");
          if (orgA !== orgB) {
            throw new Error("Conflicting $setOnInsert values for 'organization' and 'organizationId' in TimeTrackingSettingsRepository");
          }
        }
        const insertOrg = setOnInsertFields.organization ?? setOnInsertFields.organizationId;
        if (insertOrg !== undefined && filterOrgId) {
          const insertOrgId = extractAndValidateScalarId(insertOrg, "organization");
          if (insertOrgId !== filterOrgId) {
            throw new Error("Cannot reassign organization: $setOnInsert organization does not match filter");
          }
        }
        if (rawPayload.organization !== undefined && filterOrgId) {
          const updateOrgId = extractAndValidateScalarId(rawPayload.organization, "organization");
          if (updateOrgId !== filterOrgId) {
            throw new Error("Cannot update immutable field: organization");
          }
        }
        if (rawPayload.organizationId !== undefined && filterOrgId) {
          const updateOrgId = extractAndValidateScalarId(rawPayload.organizationId, "organizationId");
          if (updateOrgId !== filterOrgId) {
            throw new Error("Cannot update immutable field: organizationId");
          }
        }

        const returnUpdated = Boolean(
          options && (
            options.new === true ||
            options.returnDocument === "after" ||
            options.returnOriginal === false
          )
        );

        const existing = await this.delegate.findFirst({ where });

        if (existing) {
          if (rawPayload._id !== undefined) {
            const idVal = extractAndValidateScalarId(rawPayload._id, "_id");
            if (idVal !== existing.id) {
              throw new Error("Cannot update immutable field: _id");
            }
          }
          if (rawPayload.id !== undefined) {
            const idVal = extractAndValidateScalarId(rawPayload.id, "id");
            if (idVal !== existing.id) {
              throw new Error("Cannot update immutable field: id");
            }
          }
          if (rawPayload.organization !== undefined) {
            const orgVal = extractAndValidateScalarId(rawPayload.organization, "organization");
            if (orgVal !== existing.organizationId) {
              throw new Error("Cannot update immutable field: organization");
            }
          }
          if (rawPayload.organizationId !== undefined) {
            const orgVal = extractAndValidateScalarId(rawPayload.organizationId, "organizationId");
            if (orgVal !== existing.organizationId) {
              throw new Error("Cannot update immutable field: organizationId");
            }
          }
          if (rawPayload.createdAt !== undefined) {
            const existingCreated = existing.createdAt instanceof Date ? existing.createdAt.getTime() : new Date(existing.createdAt).getTime();
            const payloadCreated = rawPayload.createdAt instanceof Date ? rawPayload.createdAt.getTime() : new Date(rawPayload.createdAt).getTime();
            if (isNaN(payloadCreated) || payloadCreated !== existingCreated) {
              throw new Error("Cannot update immutable field: createdAt");
            }
          }

          const updateData = {};
          if (rawPayload.tracking !== undefined) updateData.tracking = rawPayload.tracking;
          if (rawPayload.screenCapture !== undefined || rawPayload.screen_capture !== undefined) {
            updateData.screenCapture = rawPayload.screenCapture !== undefined ? rawPayload.screenCapture : rawPayload.screen_capture;
          }
          if (rawPayload.manualTime !== undefined || rawPayload.manual_time !== undefined) {
            updateData.manualTime = rawPayload.manualTime !== undefined ? rawPayload.manualTime : rawPayload.manual_time;
          }
          if (rawPayload.productivity !== undefined) updateData.productivity = rawPayload.productivity;

          // Parse existing shift from existing record (if present)
          let existingShift = null;
          if (existing.shift) {
            if (typeof existing.shift === "object" && !Array.isArray(existing.shift)) {
              existingShift = existing.shift;
            } else if (typeof existing.shift === "string") {
              try {
                const parsed = JSON.parse(existing.shift);
                if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                  existingShift = parsed;
                }
              } catch {
                existingShift = null;
              }
            }
          }
          const baseShift = existingShift ? { ...DEFAULT_SHIFT, ...existingShift } : { ...DEFAULT_SHIFT };

          if (rawPayload.shift !== undefined) {
            updateData.shift = rawPayload.shift;
          }

          const shiftDotKeys = Object.keys(rawPayload).filter((k) => k.startsWith("shift."));
          if (shiftDotKeys.length > 0) {
            const targetShift = updateData.shift !== undefined
              ? (typeof updateData.shift === "object" && updateData.shift !== null && !Array.isArray(updateData.shift)
                  ? { ...updateData.shift }
                  : { ...baseShift })
              : { ...baseShift };

            for (const key of shiftDotKeys) {
              const subProp = key.slice("shift.".length);
              if (subProp) {
                targetShift[subProp] = rawPayload[key];
              }
            }
            updateData.shift = targetShift;
          }

          if (Object.keys(updateData).length === 0) {
            return this.formatSettings(existing);
          }

          const updated = await this.delegate.update({
            where: { id: existing.id },
            data: updateData,
          });

          return returnUpdated ? this.formatSettings(updated) : this.formatSettings(existing);
        } else if (options && options.upsert) {
          const organizationId = filterOrgId;
          const newId = (rawPayload._id || rawPayload.id)
            ? extractAndValidateScalarId(rawPayload._id || rawPayload.id, "id")
            : generateId();

          const updateData = {};
          if (rawPayload.tracking !== undefined) updateData.tracking = rawPayload.tracking;
          if (rawPayload.screenCapture !== undefined || rawPayload.screen_capture !== undefined) {
            updateData.screenCapture = rawPayload.screenCapture !== undefined ? rawPayload.screenCapture : rawPayload.screen_capture;
          }
          if (rawPayload.manualTime !== undefined || rawPayload.manual_time !== undefined) {
            updateData.manualTime = rawPayload.manualTime !== undefined ? rawPayload.manualTime : rawPayload.manual_time;
          }
          if (rawPayload.productivity !== undefined) updateData.productivity = rawPayload.productivity;

          const baseShift = { ...DEFAULT_SHIFT };
          if (rawPayload.shift !== undefined) {
            updateData.shift = rawPayload.shift;
          }

          const shiftDotKeys = Object.keys(rawPayload).filter((k) => k.startsWith("shift."));
          if (shiftDotKeys.length > 0) {
            const targetShift = updateData.shift !== undefined
              ? (typeof updateData.shift === "object" && updateData.shift !== null && !Array.isArray(updateData.shift)
                  ? { ...updateData.shift }
                  : { ...baseShift })
              : { ...baseShift };

            for (const key of shiftDotKeys) {
              const subProp = key.slice("shift.".length);
              if (subProp) {
                targetShift[subProp] = rawPayload[key];
              }
            }
            updateData.shift = targetShift;
          }

          const createData = {
            id: newId,
            organizationId,
            tracking: updateData.tracking || setOnInsertFields.tracking || DEFAULT_TRACKING,
            screenCapture: updateData.screenCapture || setOnInsertFields.screenCapture || setOnInsertFields.screen_capture || DEFAULT_SCREEN_CAPTURE,
            manualTime: updateData.manualTime || setOnInsertFields.manualTime || setOnInsertFields.manual_time || DEFAULT_MANUAL_TIME,
            shift: updateData.shift || setOnInsertFields.shift || DEFAULT_SHIFT,
            productivity: updateData.productivity || setOnInsertFields.productivity || {},
          };

          try {
            const created = await this.delegate.create({ data: createData });
            return returnUpdated ? this.formatSettings(created) : null;
          } catch (createErr) {
            if (isOrganizationUniqueConstraintError(createErr)) {
              const concurrentExisting = await this.delegate.findFirst({
                where: { organizationId },
              });
              if (concurrentExisting) {
                if (Object.keys(updateData).length > 0) {
                  let existingShift = null;
                  if (concurrentExisting.shift) {
                    if (typeof concurrentExisting.shift === "object" && !Array.isArray(concurrentExisting.shift)) {
                      existingShift = concurrentExisting.shift;
                    } else if (typeof concurrentExisting.shift === "string") {
                      try {
                        const parsed = JSON.parse(concurrentExisting.shift);
                        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                          existingShift = parsed;
                        }
                      } catch {
                        existingShift = null;
                      }
                    }
                  }
                  if (shiftDotKeys.length > 0) {
                    const baseConcurrentShift = existingShift ? { ...DEFAULT_SHIFT, ...existingShift } : { ...DEFAULT_SHIFT };
                    const targetShift = { ...baseConcurrentShift };
                    for (const key of shiftDotKeys) {
                      const subProp = key.slice("shift.".length);
                      if (subProp) {
                        targetShift[subProp] = rawPayload[key];
                      }
                    }
                    updateData.shift = targetShift;
                  }

                  const updated = await this.delegate.update({
                    where: { id: concurrentExisting.id },
                    data: updateData,
                  });
                  return returnUpdated
                    ? this.formatSettings(updated)
                    : this.formatSettings(concurrentExisting);
                }
                return this.formatSettings(concurrentExisting);
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

  async create(data) {
    if (isPostgres()) {
      try {
        const rawOrg = data?.organization || data?.organizationId;
        const organizationId = extractAndValidateScalarId(rawOrg, "organization");
        if (!organizationId) {
          throw new Error("TimeTrackingSettingsRepository.create requires a valid organization identifier");
        }
        const newId = (data?._id || data?.id)
          ? extractAndValidateScalarId(data._id || data.id, "id")
          : generateId();

        const createData = {
          id: newId,
          organizationId,
          tracking: data.tracking || null,
          screenCapture: data.screenCapture || data.screen_capture || null,
          manualTime: data.manualTime || data.manual_time || null,
          shift: data.shift || null,
          productivity: data.productivity || null,
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatSettings(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.create(data);
    return this.serialize(doc.toObject ? doc.toObject() : doc);
  }
}

export const timeTrackingSettingsRepository = new TimeTrackingSettingsRepository();
export default timeTrackingSettingsRepository;
