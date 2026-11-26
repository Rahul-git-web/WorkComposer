import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

function hasPopulate(name, options = {}) {
  if (!options || typeof options !== "object") return false;
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  if (options[`populate${cap}`]) return true;

  if ((name === "user" || name === "userId") && (options.populateUser || options.populateUserId)) {
    return true;
  }

  if (!options.populate) return false;
  if (options.populate === true) return true;

  const checkMatch = (target) => {
    if (typeof target !== "string") return false;
    const t = target.trim();
    if (name === "user" || name === "userId") {
      return t === "user" || t === "userId";
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

const ALLOWED_LOCATION_UPDATE_FIELDS = new Set([
  "latitude",
  "longitude",
  "accuracy",
  "country",
  "state",
  "city",
  "postalCode",
  "address",
  "ipAddress",
  "serviceProvider",
  "trackedAt",
  "recordedAt",
]);

const ALLOWED_LOCATION_PASSTHROUGH_FIELDS = new Set([
  "_id",
  "id",
  "organization",
  "organizationId",
  "user",
  "userId",
  "createdAt",
  "updatedAt",
  "__v",
  "$set",
  "$setOnInsert",
  "isNew",
  "_isNew",
]);

function isValueMatch(valA, valB) {
  if (valA === valB) return true;
  if (valA instanceof Date || valB instanceof Date) {
    const tA = new Date(valA).getTime();
    const tB = new Date(valB).getTime();
    return !isNaN(tA) && !isNaN(tB) && tA === tB;
  }
  return JSON.stringify(valA) === JSON.stringify(valB);
}

function validateCoordinate(val, name) {
  if (val === null || val === undefined || typeof val === "boolean" || (typeof val === "string" && !val.trim())) {
    throw new Error(`Invalid ${name} value in LocationRepository: must be a valid finite number`);
  }
  const num = typeof val === "number" ? val : Number(val);
  if (isNaN(num) || !isFinite(num)) {
    throw new Error(`Invalid ${name} value in LocationRepository: must be a valid finite number`);
  }
  return num;
}

function validateAccuracy(val) {
  if (val === null) return null;
  if (val === undefined || typeof val === "boolean" || (typeof val === "string" && !val.trim())) {
    throw new Error("Invalid accuracy value in LocationRepository: must be a non-negative number or null");
  }
  const num = typeof val === "number" ? val : Number(val);
  if (isNaN(num) || !isFinite(num) || num < 0) {
    throw new Error("Invalid accuracy value in LocationRepository: must be a non-negative number or null");
  }
  return num;
}

function validateDate(val, name) {
  if (val === null || val === undefined || typeof val === "boolean" || (typeof val === "string" && !val.trim())) {
    throw new Error(`Invalid date value in LocationRepository for field: ${name}`);
  }
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date value in LocationRepository for field: ${name}`);
  }
  return d;
}

function extractAndValidateScalarId(raw, fieldName) {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (Array.isArray(raw)) {
    throw new Error(`Invalid identifier in LocationRepository for field: ${fieldName}`);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "[object Object]") {
      throw new Error(`Invalid identifier in LocationRepository for field: ${fieldName}`);
    }
    return trimmed;
  }
  if (typeof raw === "number") {
    return String(raw);
  }
  if (typeof raw === "boolean") {
    throw new Error(`Invalid identifier in LocationRepository for field: ${fieldName}`);
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
    throw new Error(`Invalid identifier in LocationRepository for field: ${fieldName}`);
  }
  throw new Error(`Invalid identifier in LocationRepository for field: ${fieldName}`);
}

export class LocationRepository extends BaseRepository {
  constructor() {
    super("Location");
  }

  formatLocation(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc);
    if (serialized.id && !serialized._id) serialized._id = serialized.id;
    if (serialized._id && !serialized.id) serialized.id = serialized._id;
    serialized.organization = serialized.organization || serialized.organizationId;
    serialized.user = serialized.user || serialized.userId;
    serialized.trackedAt = serialized.trackedAt || serialized.recordedAt;
    if (serialized.serviceProvider === undefined) serialized.serviceProvider = "";
    delete serialized.organizationId;
    delete serialized.userId;
    delete serialized.recordedAt;
    return serialized;
  }

  buildWhere(filter = {}) {
    const where = {};
    if (filter._id) where.id = this.toIdString(filter._id);
    if (filter.id) where.id = this.toIdString(filter.id);
    if (filter.organization) where.organizationId = this.toIdString(filter.organization);
    if (filter.organizationId) where.organizationId = this.toIdString(filter.organizationId);
    if (filter.user) {
      if (filter.user.$in) where.userId = { in: filter.user.$in.map((u) => this.toIdString(u)) };
      else where.userId = this.toIdString(filter.user);
    }
    if (filter.userId) {
      if (filter.userId.$in) where.userId = { in: filter.userId.$in.map((u) => this.toIdString(u)) };
      else where.userId = this.toIdString(filter.userId);
    }

    const dateFilter = filter.trackedAt || filter.recordedAt;
    if (dateFilter) {
      if (typeof dateFilter === "object") {
        const dateCond = {};
        if (dateFilter.$gte) dateCond.gte = new Date(dateFilter.$gte);
        if (dateFilter.$lte) dateCond.lte = new Date(dateFilter.$lte);
        if (dateFilter.$gt) dateCond.gt = new Date(dateFilter.$gt);
        if (dateFilter.$lt) dateCond.lt = new Date(dateFilter.$lt);
        if (dateFilter.gte) dateCond.gte = new Date(dateFilter.gte);
        if (dateFilter.lte) dateCond.lte = new Date(dateFilter.lte);
        if (dateFilter.gt) dateCond.gt = new Date(dateFilter.gt);
        if (dateFilter.lt) dateCond.lt = new Date(dateFilter.lt);
        where.recordedAt = dateCond;
      } else {
        where.recordedAt = new Date(dateFilter);
      }
    }
    return where;
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const include = {};
        if (hasPopulate("user", options)) {
          include.user = {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              avatar: true,
              teamId: true,
            },
          };
        }

        const queryOptions = { where };
        if (Object.keys(include).length > 0) queryOptions.include = include;

        if (options.sort) {
          const [sortField, sortDir] = Object.entries(options.sort)[0] || ["recordedAt", -1];
          const pgSortField = sortField === "trackedAt" ? "recordedAt" : sortField === "_id" ? "id" : sortField;
          queryOptions.orderBy = { [pgSortField]: sortDir === -1 || sortDir === "desc" ? "desc" : "asc" };
        } else {
          queryOptions.orderBy = { recordedAt: "desc" };
        }

        if (typeof options.skip === "number" && !isNaN(options.skip) && options.skip >= 0) {
          queryOptions.skip = options.skip;
        }
        if (typeof options.limit === "number" && !isNaN(options.limit) && options.limit >= 0) {
          queryOptions.take = options.limit;
        }

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => {
          const formatted = this.formatLocation(d);
          if (d.user && typeof d.user === "object") {
            formatted.user = this.serialize(d.user);
            if (formatted.user.id && !formatted.user._id) formatted.user._id = formatted.user.id;
            if (formatted.user._id && !formatted.user.id) formatted.user.id = formatted.user._id;
            formatted.user.team = formatted.user.teamId || formatted.user.team || null;
            delete formatted.user.teamId;
          }
          return formatted;
        });
      } catch (err) {
        this.handleError(err);
      }
    }

    let query = this.mongooseModel.find(filter);
    if (options.populate) query = query.populate(options.populate);
    if (options.sort) query = query.sort(options.sort);
    if (typeof options.skip === "number" && !isNaN(options.skip) && options.skip >= 0) query = query.skip(options.skip);
    if (typeof options.limit === "number" && !isNaN(options.limit) && options.limit >= 0) query = query.limit(options.limit);
    const docs = await query;
    return docs.map((d) => this.serialize(d.toObject ? d.toObject() : d));
  }

  async findOneAndUpdate(filter, update, options = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("LocationRepository.findOneAndUpdate requires a valid filter object");
        }
        if (!update || typeof update !== "object" || Array.isArray(update)) {
          throw new Error("LocationRepository.findOneAndUpdate requires a valid update object");
        }

        const opts = options || {};

        for (const key of Object.keys(update)) {
          if (key.startsWith("$") && key !== "$set" && key !== "$setOnInsert") {
            throw new Error(`Unsupported update operator in LocationRepository.findOneAndUpdate: ${key}`);
          }
        }

        if (update.$set !== undefined) {
          if (!update.$set || typeof update.$set !== "object" || Array.isArray(update.$set)) {
            throw new Error("Invalid $set envelope in LocationRepository.findOneAndUpdate");
          }
          for (const key of Object.keys(update.$set)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in LocationRepository.findOneAndUpdate: ${key}`);
            }
          }
        }

        if (update.$setOnInsert !== undefined) {
          if (!update.$setOnInsert || typeof update.$setOnInsert !== "object" || Array.isArray(update.$setOnInsert)) {
            throw new Error("Invalid $setOnInsert envelope in LocationRepository.findOneAndUpdate");
          }
          for (const key of Object.keys(update.$setOnInsert)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in LocationRepository.findOneAndUpdate: ${key}`);
            }
          }
        }

        const directFields = { ...update };
        delete directFields.$set;
        delete directFields.$setOnInsert;
        const setFields = update.$set || {};

        for (const key of Object.keys(setFields)) {
          if (directFields[key] !== undefined) {
            if (!isValueMatch(directFields[key], setFields[key])) {
              throw new Error(`Conflicting update values for field '${key}' between direct payload and $set envelope`);
            }
          }
        }

        const rawPayload = { ...directFields, ...setFields };

        const setOnInsertFields = update.$setOnInsert && typeof update.$setOnInsert === "object"
          ? { ...update.$setOnInsert }
          : {};

        // Detect overlapping field paths between update payload ($set / root) and $setOnInsert
        for (const key of Object.keys(setOnInsertFields)) {
          if (typeof setOnInsertFields[key] === "function") continue;
          if (rawPayload[key] !== undefined) {
            throw new Error(`Conflicting update values for field '${key}' between update payload and $setOnInsert envelope`);
          }
        }

        const hasOrgInRaw = rawPayload.organization !== undefined || rawPayload.organizationId !== undefined;
        const hasOrgInInsert = setOnInsertFields.organization !== undefined || setOnInsertFields.organizationId !== undefined;
        if (hasOrgInRaw && hasOrgInInsert) {
          throw new Error("Conflicting update values for field 'organization' between update payload and $setOnInsert envelope");
        }

        const hasUserInRaw = rawPayload.user !== undefined || rawPayload.userId !== undefined;
        const hasUserInInsert = setOnInsertFields.user !== undefined || setOnInsertFields.userId !== undefined;
        if (hasUserInRaw && hasUserInInsert) {
          throw new Error("Conflicting update values for field 'user' between update payload and $setOnInsert envelope");
        }

        const hasIdInRaw = rawPayload._id !== undefined || rawPayload.id !== undefined;
        const hasIdInInsert = setOnInsertFields._id !== undefined || setOnInsertFields.id !== undefined;
        if (hasIdInRaw && hasIdInInsert) {
          throw new Error("Conflicting update values for field 'id' between update payload and $setOnInsert envelope");
        }

        const hasDateInRaw = rawPayload.trackedAt !== undefined || rawPayload.recordedAt !== undefined;
        const hasDateInInsert = setOnInsertFields.trackedAt !== undefined || setOnInsertFields.recordedAt !== undefined;
        if (hasDateInRaw && hasDateInInsert) {
          throw new Error("Conflicting update values for field 'trackedAt' between update payload and $setOnInsert envelope");
        }

        for (const key of Object.keys(rawPayload)) {
          if (typeof rawPayload[key] === "function") continue;
          if (!ALLOWED_LOCATION_UPDATE_FIELDS.has(key) && !ALLOWED_LOCATION_PASSTHROUGH_FIELDS.has(key)) {
            throw new Error(`Unsupported update field in LocationRepository: ${key}`);
          }
        }

        if (update.$setOnInsert && typeof update.$setOnInsert === "object") {
          for (const key of Object.keys(update.$setOnInsert)) {
            if (typeof update.$setOnInsert[key] === "function") continue;
            if (!ALLOWED_LOCATION_UPDATE_FIELDS.has(key) && !ALLOWED_LOCATION_PASSTHROUGH_FIELDS.has(key)) {
              throw new Error(`Unsupported field in $setOnInsert in LocationRepository: ${key}`);
            }
          }
        }

        if (rawPayload._id !== undefined && rawPayload.id !== undefined) {
          const idA = extractAndValidateScalarId(rawPayload._id, "_id");
          const idB = extractAndValidateScalarId(rawPayload.id, "id");
          if (idA !== idB) {
            throw new Error("Conflicting update values for '_id' and 'id' in LocationRepository");
          }
        }
        if (rawPayload.organization !== undefined && rawPayload.organizationId !== undefined) {
          const orgA = extractAndValidateScalarId(rawPayload.organization, "organization");
          const orgB = extractAndValidateScalarId(rawPayload.organizationId, "organizationId");
          if (orgA !== orgB) {
            throw new Error("Conflicting update values for 'organization' and 'organizationId' in LocationRepository");
          }
        }
        if (rawPayload.user !== undefined && rawPayload.userId !== undefined) {
          const userA = extractAndValidateScalarId(rawPayload.user, "user");
          const userB = extractAndValidateScalarId(rawPayload.userId, "userId");
          if (userA !== userB) {
            throw new Error("Conflicting update values for 'user' and 'userId' in LocationRepository");
          }
        }
        if (rawPayload.trackedAt !== undefined && rawPayload.recordedAt !== undefined) {
          const tTracked = new Date(rawPayload.trackedAt).getTime();
          const tRecorded = new Date(rawPayload.recordedAt).getTime();
          if (isNaN(tTracked) || isNaN(tRecorded) || tTracked !== tRecorded) {
            throw new Error("Conflicting update values for 'trackedAt' and 'recordedAt' in LocationRepository");
          }
        }

        const where = this.buildWhere(filter);
        const existing = await this.delegate.findFirst({ where });

        const returnUpdated = Boolean(opts.new === true || opts.returnDocument === "after");

        if (existing) {
          const existingId = existing.id || existing._id;
          const existingOrg = existing.organizationId || existing.organization;
          const existingUser = existing.userId || existing.user;

          if (rawPayload._id !== undefined) {
            const idVal = extractAndValidateScalarId(rawPayload._id, "_id");
            if (idVal !== existingId) {
              throw new Error("Cannot update immutable field: _id");
            }
          }
          if (rawPayload.id !== undefined) {
            const idVal = extractAndValidateScalarId(rawPayload.id, "id");
            if (idVal !== existingId) {
              throw new Error("Cannot update immutable field: id");
            }
          }
          const rawOrg = rawPayload.organization !== undefined ? rawPayload.organization : rawPayload.organizationId;
          if (rawOrg !== undefined) {
            const orgVal = extractAndValidateScalarId(rawOrg, "organization");
            if (orgVal !== existingOrg) {
              throw new Error("Cannot update immutable field: organization");
            }
          }
          const rawUser = rawPayload.user !== undefined ? rawPayload.user : rawPayload.userId;
          if (rawUser !== undefined) {
            const userVal = extractAndValidateScalarId(rawUser, "user");
            if (userVal !== existingUser) {
              throw new Error("Cannot update immutable field: user");
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
          if (rawPayload.latitude !== undefined) {
            updateData.latitude = validateCoordinate(rawPayload.latitude, "latitude");
          }
          if (rawPayload.longitude !== undefined) {
            updateData.longitude = validateCoordinate(rawPayload.longitude, "longitude");
          }
          if (rawPayload.accuracy !== undefined) {
            updateData.accuracy = validateAccuracy(rawPayload.accuracy);
          }
          if (rawPayload.country !== undefined) {
            updateData.country = String(rawPayload.country ?? "");
          }
          if (rawPayload.state !== undefined) {
            updateData.state = String(rawPayload.state ?? "");
          }
          if (rawPayload.city !== undefined) {
            updateData.city = String(rawPayload.city ?? "");
          }
          if (rawPayload.postalCode !== undefined) {
            updateData.postalCode = String(rawPayload.postalCode ?? "");
          }
          if (rawPayload.address !== undefined) {
            updateData.address = String(rawPayload.address ?? "");
          }
          if (rawPayload.ipAddress !== undefined) {
            updateData.ipAddress = String(rawPayload.ipAddress ?? "");
          }
          if (rawPayload.trackedAt !== undefined || rawPayload.recordedAt !== undefined) {
            const dateVal = rawPayload.trackedAt !== undefined ? rawPayload.trackedAt : rawPayload.recordedAt;
            updateData.recordedAt = validateDate(dateVal, rawPayload.trackedAt !== undefined ? "trackedAt" : "recordedAt");
          }

          if (Object.keys(updateData).length === 0) {
            const formatted = this.formatLocation(existing);
            if (rawPayload.serviceProvider !== undefined && returnUpdated) {
              formatted.serviceProvider = String(rawPayload.serviceProvider);
            }
            return formatted;
          }

          const updated = await this.delegate.update({
            where: { id: existingId },
            data: updateData,
          });

          if (rawPayload.serviceProvider !== undefined) {
            updated.serviceProvider = String(rawPayload.serviceProvider);
          }

          return returnUpdated ? this.formatLocation(updated) : this.formatLocation(existing);
        } else if (opts.upsert) {
          const insertPayload = { ...setOnInsertFields, ...rawPayload };

          if (insertPayload._id !== undefined && insertPayload.id !== undefined) {
            const idA = extractAndValidateScalarId(insertPayload._id, "_id");
            const idB = extractAndValidateScalarId(insertPayload.id, "id");
            if (idA !== idB) {
              throw new Error("Conflicting values for '_id' and 'id' in LocationRepository upsert");
            }
          }
          if (insertPayload.organization !== undefined && insertPayload.organizationId !== undefined) {
            const orgA = extractAndValidateScalarId(insertPayload.organization, "organization");
            const orgB = extractAndValidateScalarId(insertPayload.organizationId, "organizationId");
            if (orgA !== orgB) {
              throw new Error("Conflicting values for 'organization' and 'organizationId' in LocationRepository upsert");
            }
          }
          if (insertPayload.user !== undefined && insertPayload.userId !== undefined) {
            const userA = extractAndValidateScalarId(insertPayload.user, "user");
            const userB = extractAndValidateScalarId(insertPayload.userId, "userId");
            if (userA !== userB) {
              throw new Error("Conflicting values for 'user' and 'userId' in LocationRepository upsert");
            }
          }
          if (insertPayload.trackedAt !== undefined && insertPayload.recordedAt !== undefined) {
            const tTracked = new Date(insertPayload.trackedAt).getTime();
            const tRecorded = new Date(insertPayload.recordedAt).getTime();
            if (isNaN(tTracked) || isNaN(tRecorded) || tTracked !== tRecorded) {
              throw new Error("Conflicting values for 'trackedAt' and 'recordedAt' in LocationRepository upsert");
            }
          }

          const rawOrg = insertPayload.organization ?? insertPayload.organizationId ?? filter.organization ?? filter.organizationId;
          const orgId = extractAndValidateScalarId(rawOrg, "organizationId");
          if (!orgId) {
            throw new Error("Cannot upsert Location without valid organization identifier");
          }

          const rawUser = insertPayload.user ?? insertPayload.userId ?? filter.user ?? filter.userId;
          const userId = extractAndValidateScalarId(rawUser, "userId");
          if (!userId) {
            throw new Error("Cannot upsert Location without valid user identifier");
          }

          const rawLat = insertPayload.latitude !== undefined ? insertPayload.latitude : filter.latitude;
          if (rawLat === undefined || rawLat === null) {
            throw new Error("Cannot upsert Location without valid latitude coordinate");
          }
          const latitude = validateCoordinate(rawLat, "latitude");

          const rawLon = insertPayload.longitude !== undefined ? insertPayload.longitude : filter.longitude;
          if (rawLon === undefined || rawLon === null) {
            throw new Error("Cannot upsert Location without valid longitude coordinate");
          }
          const longitude = validateCoordinate(rawLon, "longitude");

          let accuracy = null;
          const rawAcc = insertPayload.accuracy !== undefined ? insertPayload.accuracy : filter.accuracy;
          if (rawAcc !== undefined && rawAcc !== null) {
            accuracy = validateAccuracy(rawAcc);
          }

          const country = String(insertPayload.country ?? filter.country ?? "");
          const state = String(insertPayload.state ?? filter.state ?? "");
          const city = String(insertPayload.city ?? filter.city ?? "");
          const postalCode = String(insertPayload.postalCode ?? filter.postalCode ?? "");
          const address = String(insertPayload.address ?? filter.address ?? "");
          const ipAddress = String(insertPayload.ipAddress ?? filter.ipAddress ?? "");

          let recordedAt = new Date();
          const rawDate = insertPayload.trackedAt ?? insertPayload.recordedAt ?? filter.trackedAt ?? filter.recordedAt;
          if (rawDate !== undefined && rawDate !== null) {
            recordedAt = validateDate(rawDate, "trackedAt");
          }

          const rawId = insertPayload._id ?? insertPayload.id ?? filter._id ?? filter.id;
          const newId = rawId !== undefined && rawId !== null
            ? extractAndValidateScalarId(rawId, "id")
            : generateId();

          const createData = {
            id: newId,
            organizationId: orgId,
            userId,
            latitude,
            longitude,
            accuracy,
            country,
            state,
            city,
            postalCode,
            address,
            ipAddress,
            recordedAt,
          };

          const created = await this.delegate.create({ data: createData });

          if (insertPayload.serviceProvider !== undefined) {
            created.serviceProvider = String(insertPayload.serviceProvider);
          }

          return returnUpdated ? this.formatLocation(created) : null;
        }

        return null;
      } catch (err) {
        if (err && (err.code === "P2025" || err.originalError?.code === "P2025" || err.name === "NotFoundError")) {
          return null;
        }
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOneAndUpdate(filter, update, options);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }
}

export const locationRepository = new LocationRepository();
export default locationRepository;
