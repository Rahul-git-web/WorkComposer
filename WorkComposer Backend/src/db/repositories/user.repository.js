import { BaseRepository } from "./base.repository.js";
import { isMongo, isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";
import { runTransaction, getAmbientTransaction } from "../transaction.js";

function hasPopulate(name, options = {}) {
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  if (options[`populate${cap}`]) return true;
  if (!options.populate) return false;
  if (typeof options.populate === "string") {
    return options.populate.split(/\s+/).includes(name) || options.populate.includes(name);
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
    if (pop && pop.path && pop.select && doc[pop.path]) {
      if (Array.isArray(doc[pop.path])) {
        for (const sub of doc[pop.path]) {
          if (sub && typeof sub === "object") {
            applyProjection(sub, pop.select);
          }
        }
      } else if (typeof doc[pop.path] === "object") {
        applyProjection(doc[pop.path], pop.select);
      }
    }
  }

  if (options.select && typeof options.select === "string") {
    applyProjection(doc, options.select);
  }

  return doc;
}

function buildOrderBy(sort) {
  if (!sort) return undefined;

  const normalizeDirection = (dir) => {
    if (dir === -1 || dir === "-1" || dir === "desc" || dir === "descending") return "desc";
    return "asc";
  };

  const mapField = (field) => {
    if (field === "_id") return "id";
    if (field === "organization") return "organizationId";
    if (field === "team") return "teamId";
    if (field === "reportTeam") return "reportTeamId";
    if (field === "manager") return "managerId";
    if (field === "roleRef") return "roleRef";
    return field;
  };

  if (typeof sort === "string") {
    const parts = sort.trim().split(/\s+/).filter(Boolean);
    const orderBy = [];
    for (const part of parts) {
      if (part.startsWith("-")) {
        orderBy.push({ [mapField(part.slice(1))]: "desc" });
      } else if (part.startsWith("+")) {
        orderBy.push({ [mapField(part.slice(1))]: "asc" });
      } else {
        orderBy.push({ [mapField(part)]: "asc" });
      }
    }
    return orderBy.length === 1 ? orderBy[0] : orderBy;
  }

  if (Array.isArray(sort)) {
    const orderBy = [];
    for (const item of sort) {
      if (Array.isArray(item) && item.length === 2) {
        orderBy.push({ [mapField(item[0])]: normalizeDirection(item[1]) });
      }
    }
    return orderBy.length > 0 ? orderBy : undefined;
  }

  if (typeof sort === "object" && sort !== null) {
    const entries = Object.entries(sort);
    if (entries.length === 1) {
      const [field, dir] = entries[0];
      return { [mapField(field)]: normalizeDirection(dir) };
    }
    if (entries.length > 1) {
      return entries.map(([field, dir]) => ({
        [mapField(field)]: normalizeDirection(dir),
      }));
    }
  }

  return undefined;
}

function isSameFilter(a, b) {
  if (a === b) return true;
  if (typeof a === "object" && typeof b === "object" && a !== null && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

const ALLOWED_USER_UPDATE_FIELDS = new Set([
  "email",
  "firstName",
  "lastName",
  "jobTitle",
  "hourlyRate",
  "currency",
  "role",
  "roleRef",
  "avatar",
  "password",
  "isVerified",
  "isArchived",
  "authProvider",
  "googleId",
  "microsoftId",
  "appleId",
  "breakStartTime",
  "weeklyReport",
  "dailyReport",
  "reportTimezone",
  "lastDailyWarningEmail",
  "lastWeeklyWarningEmail",
  "verificationToken",
  "verificationTokenExpire",
  "resetToken",
  "resetTokenExpire",
  "jiraAccountId",
  "asanaAccountId",
  "bambooHREmployeeId",
  "slackUserId",
  "workSpaceId",
  "twoFactorCode",
  "twoFactorExpires",
  "appUpdateSettings",
  "trackingSettings",
  "screenCaptureSettings",
  "manualTimeSettings",
  "shiftSettings",
  "notificationSettings",
  "emailReportSettings",
  "team",
  "teamId",
  "reportTeam",
  "reportTeamId",
  "manager",
  "managerId",
  "managers",
  "devices",
  "refreshTokens",
  "refreshToken",
  "kekaEmployeeId",
]);

const ALLOWED_USER_PASSTHROUGH_FIELDS = new Set([
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
  "deleteOne",
  "toObject",
  "toJSON",
  "isModified",
  "set",
  "markModified",
  "populate",
  "runValidators",
]);

const ALLOWED_USER_FILTER_FIELDS = new Set([
  "_id",
  "id",
  "email",
  "organization",
  "organizationId",
  "manager",
  "managerId",
  "managers",
  "team",
  "teamId",
  "reportTeam",
  "reportTeamId",
  "role",
  "roleRef",
  "isArchived",
  "deleted",
  "isVerified",
  "googleId",
  "microsoftId",
  "appleId",
  "jiraAccountId",
  "bambooHREmployeeId",
  "asanaAccountId",
  "slackUserId",
  "verificationToken",
  "resetToken",
  "refreshTokens.token",
]);

function buildUserInclude(options = {}) {
  const include = {
    devices: true,
    refreshTokens: true,
  };
  const isPopulated = (rel) => {
    const cap = rel.charAt(0).toUpperCase() + rel.slice(1);
    if (options?.[`populate${cap}`]) return true;
    if (options?.populate === rel) return true;
    if (Array.isArray(options?.populate)) {
      return options.populate.some((p) => p === rel || p?.path === rel);
    }
    if (typeof options?.populate === "string") {
      return options.populate.split(/\s+/).includes(rel);
    }
    return false;
  };

  if (isPopulated("team")) include.team = true;
  if (isPopulated("reportTeam")) include.reportTeam = true;
  if (isPopulated("manager") || isPopulated("managers")) {
    include.manager = true;
    include.managerLinks = {
      orderBy: { createdAt: "asc" },
      include: {
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
      },
    };
  }
  if (isPopulated("role") || isPopulated("roleRef") || options?.populateRole || options?.populateRoleRef) {
    include.customRole = true;
  }
  if (isPopulated("organization")) include.organization = true;

  return include;
}

const MANAGER_POPULATE_SELECT = "firstName lastName email role";

function isPopulatedManagerObject(val) {
  if (!val || typeof val !== "object") return false;
  if (typeof val.toHexString === "function") return false;
  if (val.constructor && val.constructor.name === "ObjectId") return false;
  return (
    val.firstName !== undefined ||
    val.lastName !== undefined ||
    val.email !== undefined ||
    val.role !== undefined ||
    val._id !== undefined ||
    val.id !== undefined
  );
}

function isSameIdArray(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sanitizePopulatedManager(serializer, mgr) {
  const s = serializer(mgr);
  if (!s || typeof s !== "object") return null;
  const idStr = s.id || s._id ? String(s.id || s._id) : null;
  if (idStr) {
    s.id = idStr;
    s._id = idStr;
  }
  const fieldsToDelete = [
    "organizationId",
    "organization",
    "password",
    "passwordHash",
    "refreshToken",
    "refreshTokens",
    "twoFactorCode",
    "twoFactorExpires",
    "verificationToken",
    "verificationTokenExpire",
    "resetToken",
    "resetTokenExpire",
  ];
  for (const f of fieldsToDelete) {
    delete s[f];
  }
  return s;
}

function applyMongooseManagerPopulate(query, options = {}) {
  let q = query;
  let populatedManager = false;
  let populatedManagers = false;
  if (options.populate) {
    const popList = Array.isArray(options.populate) ? options.populate : [options.populate];
    for (const pop of popList) {
      if (typeof pop === "string") {
        if (pop === "manager") populatedManager = true;
        if (pop === "managers") populatedManagers = true;
        q = q.populate(pop);
      } else if (pop && pop.path) {
        if (pop.path === "manager") populatedManager = true;
        if (pop.path === "managers") populatedManagers = true;
        q = q.populate(pop.path, pop.select);
      }
    }
  }
  if (options.populateOrganization) q = q.populate("organization");
  if (options.populateTeam) q = q.populate("team", "name");
  if (options.populateManager && !populatedManager) {
    q = q.populate("manager", MANAGER_POPULATE_SELECT);
    populatedManager = true;
  }
  if (options.populateManagers && !populatedManagers) {
    q = q.populate("managers", MANAGER_POPULATE_SELECT);
    populatedManagers = true;
  }
  if (populatedManager && !populatedManagers) {
    q = q.populate("managers", MANAGER_POPULATE_SELECT);
  } else if (populatedManagers && !populatedManager) {
    q = q.populate("manager", MANAGER_POPULATE_SELECT);
  }
  if (options.populateRole) q = q.populate("roleRef");
  return q;
}

function isValueMatch(valA, valB) {
  if (valA === valB) return true;
  if (valA instanceof Date || valB instanceof Date) {
    const tA = new Date(valA).getTime();
    const tB = new Date(valB).getTime();
    return !isNaN(tA) && !isNaN(tB) && tA === tB;
  }
  return JSON.stringify(valA) === JSON.stringify(valB);
}

function isUserFieldUnchanged(key, newVal, existing) {
  if (!existing) return false;
  let existingVal;
  if (key === "teamId") {
    existingVal = existing.teamId ?? (typeof existing.team === "string" ? existing.team : existing.team?.id || null);
  } else if (key === "reportTeamId") {
    existingVal = existing.reportTeamId ?? (typeof existing.reportTeam === "string" ? existing.reportTeam : existing.reportTeam?.id || null);
  } else if (key === "managerId") {
    existingVal = existing.managerId ?? (typeof existing.manager === "string" ? existing.manager : existing.manager?.id || null);
  } else if (key === "roleRef") {
    existingVal = existing.roleRef ?? (typeof existing.customRole === "string" ? existing.customRole : existing.customRole?.id || null);
  } else {
    existingVal = existing[key];
  }

  if (newVal === existingVal) return true;
  if ((newVal === null || newVal === undefined) && (existingVal === null || existingVal === undefined)) return true;

  if (newVal instanceof Date || existingVal instanceof Date) {
    const tA = newVal ? new Date(newVal).getTime() : NaN;
    const tB = existingVal ? new Date(existingVal).getTime() : NaN;
    return !isNaN(tA) && !isNaN(tB) && tA === tB;
  }

  if (typeof newVal === "object" && typeof existingVal === "object" && newVal !== null && existingVal !== null) {
    return JSON.stringify(newVal) === JSON.stringify(existingVal);
  }

  return false;
}

export class UserRepository extends BaseRepository {
  constructor() {
    super("User");
  }

  _normalizeManagerIdList(val) {
    if (val === null) return [];
    if (!Array.isArray(val)) {
      throw new Error("Invalid managers value in UserRepository: expected array or null");
    }
    const seen = new Set();
    const out = [];
    for (const item of val) {
      if (!item) continue;
      const rawTarget = typeof item === "object" ? (item._id || item.id || item) : item;
      const idStr = this.toIdString(rawTarget);
      if (!idStr || idStr === "[object Object]") {
        throw new Error("Invalid identifier in UserRepository update for field: managers");
      }
      if (!seen.has(idStr)) {
        seen.add(idStr);
        out.push(idStr);
      }
    }
    return out;
  }

  _getExistingManagerIds(existing) {
    if (!existing || typeof existing !== "object") return [];
    const seen = new Set();
    const out = [];
    const addId = (val) => {
      if (!val) return;
      const raw = typeof val === "object" ? (val._id || val.id || val) : val;
      const idStr = this.toIdString(raw);
      if (idStr && idStr !== "[object Object]" && !seen.has(idStr)) {
        seen.add(idStr);
        out.push(idStr);
      }
    };
    const primaryId = existing.managerId
      ? this.toIdString(existing.managerId)
      : (typeof existing.manager === "string"
        ? existing.manager
        : (existing.manager && (existing.manager.id || existing.manager._id) ? this.toIdString(existing.manager.id || existing.manager._id) : null));
    if (primaryId) addId(primaryId);
    if (Array.isArray(existing.managerLinks)) {
      for (const link of existing.managerLinks) {
        addId(link?.managerId || link?.manager);
      }
    }
    if (Array.isArray(existing.managers)) {
      for (const m of existing.managers) {
        addId(m);
      }
    }
    return out;
  }

  _resolveManagerMutation(rawPayload, existing = null) {
    const hasSingle = rawPayload.manager !== undefined || rawPayload.managerId !== undefined;
    const hasList = rawPayload.managers !== undefined;
    if (!hasSingle && !hasList) {
      return { hasMutation: false, targetManagerIds: null, primaryManagerId: undefined };
    }

    let singleId;
    if (hasSingle) {
      const mVal = rawPayload.manager !== undefined ? rawPayload.manager : rawPayload.managerId;
      if (mVal === null || mVal === "") {
        singleId = null;
      } else if (typeof mVal === "object") {
        singleId = this.toIdString(mVal._id || mVal.id || mVal);
      } else {
        singleId = this.toIdString(mVal);
      }
      if (singleId !== null && (!singleId || singleId === "[object Object]")) {
        throw new Error("Invalid identifier in UserRepository update for field: manager");
      }
    }

    const listIds = hasList ? this._normalizeManagerIdList(rawPayload.managers) : undefined;

    if (existing) {
      const existingIds = this._getExistingManagerIds(existing);
      const existingPrimary = existing.managerId
        ?? (typeof existing.manager === "string"
          ? existing.manager
          : (existing.manager && (existing.manager.id || existing.manager._id) ? this.toIdString(existing.manager.id || existing.manager._id) : null))
        ?? null;

      const listChanged = hasList && !isSameIdArray(listIds, existingIds);
      const singleChanged = hasSingle && (singleId ?? null) !== (existingPrimary ?? null);

      let targetManagerIds = null;
      if (listChanged && singleChanged) {
        if ((listIds[0] || null) !== (singleId || null)) {
          throw new Error("Conflicting update values for 'manager' and 'managers' in UserRepository");
        }
        targetManagerIds = listIds;
      } else if (listChanged) {
        targetManagerIds = listIds;
      } else if (singleChanged) {
        targetManagerIds = singleId ? [singleId] : [];
      } else if (hasList && !hasSingle) {
        targetManagerIds = listIds;
      } else if (hasSingle && !hasList) {
        targetManagerIds = singleId ? [singleId] : [];
      } else {
        return { hasMutation: false, targetManagerIds: null, primaryManagerId: undefined };
      }

      const primaryManagerId = targetManagerIds[0] || null;
      const linksChanged = !isSameIdArray(targetManagerIds, existingIds);
      const primaryChanged = primaryManagerId !== (existingPrimary ?? null);
      if (!linksChanged && !primaryChanged) {
        return { hasMutation: false, targetManagerIds: null, primaryManagerId: undefined };
      }
      return { hasMutation: true, targetManagerIds, primaryManagerId };
    }

    if (hasList && hasSingle && (listIds[0] || null) !== (singleId || null)) {
      throw new Error("Conflicting update values for 'manager' and 'managers' in UserRepository");
    }
    const targetManagerIds = hasList ? listIds : (singleId ? [singleId] : []);
    return {
      hasMutation: true,
      targetManagerIds,
      primaryManagerId: targetManagerIds[0] || null,
    };
  }

  async _syncUserManagerLinks(prismaClient, { userId, organizationId, managerIds, existingLinks = [] }) {
    if (!prismaClient?.userManagerAssignment) return;
    await prismaClient.userManagerAssignment.deleteMany({
      where: {
        userId,
        ...(managerIds.length > 0 ? { managerId: { notIn: managerIds } } : {}),
      },
    });
    if (managerIds.length === 0) return;

    const existingSet = new Set(
      (Array.isArray(existingLinks) ? existingLinks : [])
        .map((l) => this.toIdString(l?.managerId || l?.manager))
        .filter(Boolean),
    );
    const missingIds = managerIds.filter((mId) => mId !== userId && !existingSet.has(mId));
    if (missingIds.length === 0) return;

    const rows = missingIds.map((managerId) => ({
      id: generateId(),
      organizationId,
      userId,
      managerId,
    }));

    if (typeof prismaClient.userManagerAssignment.createMany === "function") {
      await prismaClient.userManagerAssignment.createMany({
        data: rows,
        skipDuplicates: true,
      });
    } else if (typeof prismaClient.userManagerAssignment.upsert === "function") {
      await Promise.all(
        rows.map((row) =>
          prismaClient.userManagerAssignment.upsert({
            where: { userId_managerId: { userId: row.userId, managerId: row.managerId } },
            create: row,
            update: {},
          }),
        ),
      );
    } else if (typeof prismaClient.userManagerAssignment.create === "function") {
      await Promise.all(
        rows.map((row) => prismaClient.userManagerAssignment.create({ data: row })),
      );
    }
  }

  _buildManagerWhereCondition(parsed) {
    if (parsed === undefined) return undefined;
    if (parsed === null) {
      return {
        AND: [
          { managerId: null },
          { managerLinks: { none: {} } },
        ],
      };
    }
    if (typeof parsed === "string") {
      return {
        OR: [
          { managerId: parsed },
          { managerLinks: { some: { managerId: parsed } } },
        ],
      };
    }
    if (typeof parsed === "object" && parsed !== null) {
      const clauses = [];
      if (Array.isArray(parsed.in)) {
        clauses.push({
          OR: [
            { managerId: { in: parsed.in } },
            { managerLinks: { some: { managerId: { in: parsed.in } } } },
          ],
        });
      }
      if (parsed.not === null) {
        clauses.push({
          OR: [
            { managerId: { not: null } },
            { managerLinks: { some: {} } },
          ],
        });
      } else if (parsed.not !== undefined) {
        clauses.push({
          NOT: {
            OR: [
              { managerId: parsed.not },
              { managerLinks: { some: { managerId: parsed.not } } },
            ],
          },
        });
      }
      if (Array.isArray(parsed.notIn)) {
        clauses.push({
          NOT: {
            OR: [
              { managerId: { in: parsed.notIn } },
              { managerLinks: { some: { managerId: { in: parsed.notIn } } } },
            ],
          },
        });
      }
      if (clauses.length === 1) return clauses[0];
      if (clauses.length > 1) return { AND: clauses };
    }
    return undefined;
  }

  _applyManagerFilter(where, filter) {
    let parsedManager;
    if (filter.manager !== undefined) {
      parsedManager = this._buildRelationIdFilter(filter.manager, "manager");
    }
    if (filter.managerId !== undefined) {
      const parsedManagerId = this._buildRelationIdFilter(filter.managerId, "managerId");
      if (parsedManager !== undefined && !isSameFilter(parsedManager, parsedManagerId)) {
        throw new Error("Conflicting manager filters in UserRepository");
      }
      parsedManager = parsedManagerId;
    }
    if (filter.managers !== undefined) {
      const parsedManagers = this._buildRelationIdFilter(filter.managers, "managers");
      if (parsedManager !== undefined && !isSameFilter(parsedManager, parsedManagers)) {
        throw new Error("Conflicting manager filters in UserRepository");
      }
      parsedManager = parsedManagers;
    }
    if (parsedManager === undefined) return;
    const condition = this._buildManagerWhereCondition(parsedManager);
    if (!condition) return;
    where.AND = Array.isArray(where.AND) ? [...where.AND, condition] : [condition];
  }

  _buildSingleMongoManagerClause(val) {
    if (val === null) {
      return {
        $and: [
          { $or: [{ manager: null }, { manager: { $exists: false } }] },
          { $or: [{ managers: { $exists: false } }, { managers: { $size: 0 } }] },
        ],
      };
    }
    return {
      $or: [{ manager: val }, { managers: val }],
    };
  }

  _rewriteMongoManagerFilter(filter) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) return filter;
    const hasTopManager = filter.manager !== undefined || filter.managerId !== undefined || filter.managers !== undefined;
    const hasTopOr = Array.isArray(filter.$or);
    const hasTopAnd = Array.isArray(filter.$and);
    if (!hasTopManager && !hasTopOr && !hasTopAnd) return filter;

    const copy = { ...filter };
    if (hasTopManager) {
      const mVal = copy.manager !== undefined ? copy.manager : (copy.managerId !== undefined ? copy.managerId : copy.managers);
      delete copy.manager;
      delete copy.managerId;
      delete copy.managers;
      const mgrCond = this._buildSingleMongoManagerClause(mVal);
      if (copy.$or) {
        copy.$and = [...(Array.isArray(copy.$and) ? copy.$and : []), mgrCond];
      } else if (mgrCond.$or) {
        copy.$or = mgrCond.$or;
      } else if (mgrCond.$and) {
        copy.$and = [...(Array.isArray(copy.$and) ? copy.$and : []), ...mgrCond.$and];
      }
    }
    if (Array.isArray(copy.$or)) {
      copy.$or = copy.$or.map((clause) => this._rewriteMongoManagerFilter(clause));
    }
    if (Array.isArray(copy.$and)) {
      copy.$and = copy.$and.map((clause) => this._rewriteMongoManagerFilter(clause));
    }
    return copy;
  }

  _normalizeMongoManagerUpdate(update) {
    if (!update || typeof update !== "object" || Array.isArray(update)) return update;
    const out = { ...update };
    if (out.$set) out.$set = { ...out.$set };
    if (out.$unset) out.$unset = { ...out.$unset };

    const setContainer = out.$set || out;
    const hasManagers = setContainer.managers !== undefined;
    const hasSingle = setContainer.manager !== undefined || setContainer.managerId !== undefined;

    if (hasManagers && !hasSingle) {
      const normalized = this._normalizeManagerIdList(setContainer.managers);
      setContainer.managers = normalized;
      setContainer.manager = normalized[0] || null;
    } else if (hasSingle && !hasManagers) {
      const raw = setContainer.manager !== undefined ? setContainer.manager : setContainer.managerId;
      const single = raw ? this.toIdString(raw?._id || raw?.id || raw) : null;
      setContainer.manager = single;
      setContainer.managers = single ? [single] : [];
    } else if (out.$unset && (out.$unset.manager !== undefined || out.$unset.managerId !== undefined) && !hasManagers) {
      out.$set = out.$set || {};
      out.$set.managers = [];
    }
    return out;
  }

  _formatMongoUser(doc) {
    if (!doc) return null;
    const raw = doc.toObject ? doc.toObject() : doc;
    const serialized = this.serialize(raw);
    const seen = new Set();
    const managersList = [];
    const pushManager = (entry) => {
      if (!entry) return;
      if (isPopulatedManagerObject(entry)) {
        const clean = sanitizePopulatedManager((v) => this.serialize(v), entry);
        if (!clean) return;
        const idStr = clean.id || clean._id;
        if (idStr && seen.has(idStr)) {
          const idx = managersList.findIndex((m) => (typeof m === "object" ? (m.id || m._id) : m) === idStr);
          if (idx >= 0) managersList[idx] = clean;
          return;
        }
        if (idStr) seen.add(idStr);
        managersList.push(clean);
      } else {
        const idStr = this.toIdString(entry);
        if (idStr && idStr !== "[object Object]" && !seen.has(idStr)) {
          seen.add(idStr);
          managersList.push(idStr);
        }
      }
    };

    if (Array.isArray(raw.managers)) {
      for (const m of raw.managers) pushManager(m);
    }
    if (raw.manager) {
      const prevLen = managersList.length;
      pushManager(raw.manager);
      if (managersList.length > prevLen && managersList.length > 1) {
        const added = managersList.pop();
        managersList.unshift(added);
      }
    }

    serialized.managers = managersList;
    if (managersList.length > 0 && isPopulatedManagerObject(managersList[0])) {
      serialized.manager = { ...managersList[0] };
    } else {
      serialized.manager = null;
    }
    return serialized;
  }

  /**
   * Formats a raw Prisma User record into the exact Mongoose application shape:
   * - Exposes '_id'
   * - Exposes 'organization', 'team', 'reportTeam', 'managers', 'manager'
   * - Rehydrates 'devices' from UserDevice relations
   * - Rehydrates 'refreshTokens' from UserRefreshToken relations
   */
  formatUser(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc);

    // Map foreign key IDs and populated relations
    if (doc.organization && typeof doc.organization === "object") {
      serialized.organization = this.serialize(doc.organization);
      if (serialized.organization.id && !serialized.organization._id) {
        serialized.organization._id = serialized.organization.id;
      }
      if (serialized.organization._id && !serialized.organization.id) {
        serialized.organization.id = serialized.organization._id;
      }
      if (serialized.organization.ownerId && !serialized.organization.owner) {
        serialized.organization.owner = serialized.organization.ownerId;
      }
    } else {
      serialized.organization = serialized.organization || serialized.organizationId;
    }
    delete serialized.organizationId;

    if (doc.team && typeof doc.team === "object") {
      serialized.team = this.serialize(doc.team);
      delete serialized.team.organizationId;
    } else {
      serialized.team = serialized.team || serialized.teamId || null;
    }
    delete serialized.teamId;

    if (doc.reportTeam && typeof doc.reportTeam === "object") {
      serialized.reportTeam = this.serialize(doc.reportTeam);
      delete serialized.reportTeam.organizationId;
    } else {
      serialized.reportTeam = serialized.reportTeam || serialized.reportTeamId || null;
    }
    delete serialized.reportTeamId;

    const seenManagerIds = new Set();
    const managersList = [];
    const upsertManagerEntry = (entry) => {
      if (!entry) return;
      if (isPopulatedManagerObject(entry)) {
        const clean = sanitizePopulatedManager((v) => this.serialize(v), entry);
        if (!clean) return;
        const idStr = clean.id || clean._id;
        if (idStr && seenManagerIds.has(idStr)) {
          const idx = managersList.findIndex((m) => (typeof m === "object" ? (m.id || m._id) : m) === idStr);
          if (idx >= 0 && typeof managersList[idx] !== "object") {
            managersList[idx] = clean;
          }
          return;
        }
        if (idStr) seenManagerIds.add(idStr);
        managersList.push(clean);
      } else {
        const idStr = this.toIdString(entry);
        if (idStr && idStr !== "[object Object]" && !seenManagerIds.has(idStr)) {
          seenManagerIds.add(idStr);
          managersList.push(idStr);
        }
      }
    };

    if (Array.isArray(doc.managerLinks)) {
      for (const link of doc.managerLinks) {
        if (!link) continue;
        if (link.manager && typeof link.manager === "object") {
          upsertManagerEntry(link.manager);
        } else if (link.managerId) {
          upsertManagerEntry(link.managerId);
        }
      }
    }

    if (Array.isArray(doc.managers)) {
      for (const m of doc.managers) {
        upsertManagerEntry(m);
      }
    }

    if (isPopulatedManagerObject(doc.manager)) {
      const primaryClean = sanitizePopulatedManager((v) => this.serialize(v), doc.manager);
      if (primaryClean) {
        const primaryId = primaryClean.id || primaryClean._id;
        const existingIdx = managersList.findIndex((m) => (typeof m === "object" ? (m.id || m._id) : m) === primaryId);
        if (existingIdx > 0) {
          managersList.splice(existingIdx, 1);
          managersList.unshift(primaryClean);
        } else if (existingIdx === 0) {
          managersList[0] = primaryClean;
        } else {
          if (primaryId) seenManagerIds.add(primaryId);
          managersList.unshift(primaryClean);
        }
      }
    } else {
      const legacyManagerId = doc.managerId || (typeof doc.manager === "string" && doc.manager.trim() ? doc.manager.trim() : null);
      if (legacyManagerId) {
        const idStr = this.toIdString(legacyManagerId);
        if (idStr && idStr !== "[object Object]") {
          const existingIdx = managersList.findIndex((m) => (typeof m === "object" ? (m.id || m._id) : m) === idStr);
          if (existingIdx > 0) {
            const [item] = managersList.splice(existingIdx, 1);
            managersList.unshift(item);
          } else if (existingIdx === -1) {
            seenManagerIds.add(idStr);
            managersList.unshift(idStr);
          }
        }
      }
    }

    serialized.managers = managersList;
    delete serialized.managerId;
    delete serialized.managerLinks;
    delete serialized.subordinateLinks;

    if (managersList.length > 0 && isPopulatedManagerObject(managersList[0])) {
      serialized.manager = { ...managersList[0] };
    } else {
      serialized.manager = null;
    }

    if (doc.customRole && typeof doc.customRole === "object") {
      serialized.roleRef = this.serialize(doc.customRole);
    }

    // Subdocument defaults
    const DEFAULT_APP_UPDATE = { automaticUpdates: null, forceUpdates: null };
    const DEFAULT_TRACKING = { trackingMode: null, startTrackingOnBoot: null, allowWorkAwayFromComputer: null, pauseTrackingWhenInactive: null, inactivityMinutes: null, continueTrackingDuringSleep: null, sleepBreakHours: null, sleepBreakMinutes: null, displayBackToWorkReminder: null, stopTrackingWithoutInternet: null, statusBarVisibility: null, applicationTracking: null, ipTracking: null };
    const DEFAULT_SCREEN_CAPTURE = { enabled: null, screenshotFrequency: null, blurScreenshots: null };
    const DEFAULT_MANUAL_TIME = { allowManualTime: null, requireApproval: null, managerApproval: null, backdatingLimit: null, requireProjectTask: null };
    const DEFAULT_SHIFT = { autoStartTracking: null, autoStopTracking: null, schedule: null };
    const DEFAULT_NOTIFICATIONS = { shiftStarted: null, shiftEndingSoon: null, breakStarted: null, breakEnded: null, dailyTargetReached: null, overtimeStarted: null };
    const DEFAULT_EMAIL_REPORTS = { dailyMinimumTime: { hours: null, minutes: null }, weeklyMinimumTime: { hours: null, minutes: null }, weeklyTrackingReports: null, dailyTrackingReports: null, dailyWarningEmails: null, dailyBasedOnShift: null, dailyWeekDays: null, weeklyWarningEmails: null, weeklyBasedOnShift: null, idlePercentageEnabled: null, idlePercentage: null };

    serialized.appUpdateSettings = serialized.appUpdateSettings ? { ...DEFAULT_APP_UPDATE, ...serialized.appUpdateSettings } : { ...DEFAULT_APP_UPDATE };
    serialized.trackingSettings = serialized.trackingSettings ? { ...DEFAULT_TRACKING, ...serialized.trackingSettings } : { ...DEFAULT_TRACKING };
    serialized.screenCaptureSettings = serialized.screenCaptureSettings ? { ...DEFAULT_SCREEN_CAPTURE, ...serialized.screenCaptureSettings } : { ...DEFAULT_SCREEN_CAPTURE };
    serialized.manualTimeSettings = serialized.manualTimeSettings ? { ...DEFAULT_MANUAL_TIME, ...serialized.manualTimeSettings } : { ...DEFAULT_MANUAL_TIME };
    serialized.shiftSettings = serialized.shiftSettings ? { ...DEFAULT_SHIFT, ...serialized.shiftSettings } : { ...DEFAULT_SHIFT };
    serialized.notificationSettings = serialized.notificationSettings ? { ...DEFAULT_NOTIFICATIONS, ...serialized.notificationSettings } : { ...DEFAULT_NOTIFICATIONS };
    serialized.emailReportSettings = serialized.emailReportSettings ? { ...DEFAULT_EMAIL_REPORTS, ...serialized.emailReportSettings } : { ...DEFAULT_EMAIL_REPORTS };

    // Ensure devices and refreshTokens arrays are present
    if (doc.devices && Array.isArray(doc.devices)) {
      serialized.devices = doc.devices.map((d) => {
        const s = this.serialize(d);
        delete s.userId;
        delete s.createdAt;
        delete s.updatedAt;
        if (!s.hostname) delete s.hostname;
        return s;
      });
    } else if (!serialized.devices) {
      serialized.devices = [];
    }

    if (doc.refreshTokens && Array.isArray(doc.refreshTokens)) {
      serialized.refreshTokens = doc.refreshTokens.map((t) => {
        const s = this.serialize(t);
        delete s.userId;
        return s;
      });
    } else if (!serialized.refreshTokens) {
      serialized.refreshTokens = [];
    }

    const nullableFieldsToOmit = [
      "twoFactorCode",
      "twoFactorExpires",
      "jiraAccountId",
      "asanaAccountId",
      "bambooHREmployeeId",
      "slackUserId",
      "workSpaceId",
      "verificationToken",
      "verificationTokenExpire",
      "resetToken",
      "resetTokenExpire",
      "lastDailyWarningEmail",
      "lastWeeklyWarningEmail",
      "googleId",
      "microsoftId",
      "appleId",
    ];
    for (const f of nullableFieldsToOmit) {
      if (serialized[f] === null || serialized[f] === undefined) delete serialized[f];
    }

    return serialized;
  }

  async findById(id, options = {}) {
    const idStr = this.toIdString(id);
    if (!idStr) return null;

    if (isPostgres()) {
      try {
        const include = buildUserInclude(options);

        const doc = await this.delegate.findUnique({
          where: { id: idStr },
          include,
        });
        const formatted = this.formatUser(doc);
        return applyPopulateProjections(formatted, options);
      } catch (err) {
        this.handleError(err);
      }
    }

    const query = applyMongooseManagerPopulate(this.mongooseModel.findById(idStr), options);
    const doc = await query;
    return this._formatMongoUser(doc);
  }

  async findUserByIdAndOrganization(id, organizationId, options = {}) {
    const idStr = this.toIdString(id);
    const orgIdStr = this.toIdString(organizationId);
    if (!idStr || !orgIdStr) return null;
    return await this.findOne({ _id: idStr, organization: orgIdStr }, options);
  }

  async findByEmail(email) {
    if (!email) return null;
    const cleanEmail = email.toLowerCase().trim();

    if (isPostgres()) {
      try {
        const doc = await this.delegate.findUnique({
          where: { email: cleanEmail },
          include: {
            devices: true,
            refreshTokens: true,
          },
        });
        return this.formatUser(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOne({ email: cleanEmail });
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findOne(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        // Special lookup for refreshToken
        if (filter["refreshTokens.token"]) {
          return await this.findByRefreshToken(filter["refreshTokens.token"]);
        }

        for (const key of Object.keys(filter)) {
          if (key.startsWith("$")) {
            throw new Error(`Unsupported filter operator in UserRepository: ${key}`);
          }
        }

        const where = {};
        if (filter._id !== undefined) where.id = this._buildIdFilter(filter._id, "_id");
        if (filter.id !== undefined) {
          const idFilter = this._buildIdFilter(filter.id, "id");
          if (where.id !== undefined && typeof where.id === "string" && typeof idFilter === "string" && where.id !== idFilter) {
            throw new Error("Conflicting id filters in UserRepository");
          }
          where.id = idFilter;
        }
        const isArchived = this._processArchivedFilter(filter, "UserRepository");
        if (isArchived !== undefined) where.isArchived = isArchived;
        if (filter.email) where.email = filter.email.toLowerCase().trim();
        if (filter.googleId) where.googleId = filter.googleId;
        if (filter.microsoftId) where.microsoftId = filter.microsoftId;
        if (filter.appleId) where.appleId = filter.appleId;
        if (filter.organization !== undefined) where.organizationId = this._buildOrganizationFilter(filter.organization, "organization");
        if (filter.organizationId !== undefined) {
          const orgIdFilter = this._buildOrganizationFilter(filter.organizationId, "organizationId");
          if (where.organizationId !== undefined && typeof where.organizationId === "string" && typeof orgIdFilter === "string" && where.organizationId !== orgIdFilter) {
            throw new Error("Conflicting organization filters in UserRepository");
          }
          where.organizationId = orgIdFilter;
        }

        this._applyManagerFilter(where, filter);

        if (filter.team !== undefined) {
          where.teamId = this._buildRelationIdFilter(filter.team, "team");
        }
        if (filter.teamId !== undefined) {
          const teamIdFilter = this._buildRelationIdFilter(filter.teamId, "teamId");
          if (where.teamId !== undefined && typeof where.teamId === "string" && typeof teamIdFilter === "string" && where.teamId !== teamIdFilter) {
            throw new Error("Conflicting team filters in UserRepository");
          }
          where.teamId = teamIdFilter;
        }

        if (filter.roleRef !== undefined) {
          where.roleRef = this._buildRelationIdFilter(filter.roleRef, "roleRef");
        }

        if (filter.role !== undefined) {
          where.role = this._buildRoleFilter(filter.role, "role");
        }

        if (filter.isVerified !== undefined) where.isVerified = Boolean(filter.isVerified);
        if (filter.jiraAccountId) where.jiraAccountId = filter.jiraAccountId;
        if (filter.bambooHREmployeeId) where.bambooHREmployeeId = filter.bambooHREmployeeId;
        if (filter.asanaAccountId) where.asanaAccountId = filter.asanaAccountId;
        if (filter.slackUserId) where.slackUserId = filter.slackUserId;
        if (filter.verificationToken) where.verificationToken = filter.verificationToken;
        if (filter.resetToken) where.resetToken = filter.resetToken;

        const include = buildUserInclude(options);

        const doc = await this.delegate.findFirst({
          where,
          include,
        });
        const formatted = this.formatUser(doc);
        return applyPopulateProjections(formatted, options);
      } catch (err) {
        this.handleError(err);
      }
    }

    const mongoFilter = this._rewriteMongoManagerFilter(filter);
    const query = applyMongooseManagerPopulate(this.mongooseModel.findOne(mongoFilter), options);
    const doc = await query;
    return this._formatMongoUser(doc);
  }

  async findWithAuth(filter = {}) {
    if (isPostgres()) {
      try {
        const user = await this.findOne(filter);
        if (user) {
          user.password = user.passwordHash || user.password;
        }
        return user;
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOne(filter).select("+password");
    if (!doc) return null;
    const serialized = this.serialize(doc.toObject ? doc.toObject() : doc);
    serialized.password = doc.password;
    return serialized;
  }

  _buildTextFilter(val, fieldName) {
    if (val === null || val === undefined) {
      throw new Error(`Invalid text filter in UserRepository: ${fieldName}`);
    }

    if (typeof val === "string") {
      const trimmed = val.trim();
      if (fieldName === "email") return trimmed.toLowerCase();
      return trimmed;
    }

    if (val instanceof RegExp) {
      const pattern = val.source.replace(/^\^|\$/g, "");
      const cleanPattern = fieldName === "email" ? pattern.toLowerCase().trim() : pattern;
      return { contains: cleanPattern, mode: "insensitive" };
    }

    if (typeof val === "object") {
      const rawPattern = val.$regex !== undefined ? val.$regex : val.regex !== undefined ? val.regex : val.contains;
      if (rawPattern !== undefined) {
        if (typeof rawPattern !== "string" && !(rawPattern instanceof RegExp)) {
          throw new Error(`Invalid regex value in UserRepository filter: ${fieldName}`);
        }
        const patternStr = rawPattern instanceof RegExp ? rawPattern.source : String(rawPattern);
        const cleanPattern = patternStr.replace(/^\^|\$/g, "");
        const finalPattern = fieldName === "email" ? cleanPattern.toLowerCase().trim() : cleanPattern;
        return { contains: finalPattern, mode: "insensitive" };
      }

      if (val.$in !== undefined || val.in !== undefined) {
        const list = val.$in !== undefined ? val.$in : val.in;
        if (!Array.isArray(list)) {
          throw new Error(`Invalid array in UserRepository filter: ${fieldName}`);
        }
        const mapped = list.map((item) => (fieldName === "email" ? String(item).toLowerCase().trim() : String(item).trim()));
        return { in: mapped };
      }

      if (val.equals !== undefined) {
        const eqStr = fieldName === "email" ? String(val.equals).toLowerCase().trim() : String(val.equals).trim();
        return { equals: eqStr, mode: val.mode || "insensitive" };
      }

      if (val.$eq !== undefined) {
        const eqStr = fieldName === "email" ? String(val.$eq).toLowerCase().trim() : String(val.$eq).trim();
        return eqStr;
      }

      for (const k of Object.keys(val)) {
        if (k.startsWith("$") && k !== "$options") {
          throw new Error(`Unsupported ${fieldName} filter operator in UserRepository: ${k}`);
        }
      }

      throw new Error(`Invalid filter object in UserRepository: ${fieldName}`);
    }

    throw new Error(`Invalid filter value in UserRepository: ${fieldName}`);
  }

  _buildOrganizationFilter(val, fieldName = "organization") {
    if (val === null || val === undefined) {
      return undefined;
    }

    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) {
        throw new Error(`Invalid identifier in UserRepository filter for field: ${fieldName}`);
      }
      return trimmed;
    }

    if (Array.isArray(val)) {
      const mapped = val.map((id) => this.toIdString(id)).filter(Boolean);
      return { in: mapped };
    }

    if (typeof val === "object") {
      const inList = val.$in !== undefined ? val.$in : val.in;
      if (inList !== undefined) {
        if (!Array.isArray(inList)) {
          throw new Error(`Invalid array in UserRepository filter: ${fieldName}`);
        }
        const mapped = inList.map((id) => this.toIdString(id)).filter(Boolean);
        return { in: mapped };
      }

      const neVal = val.$ne !== undefined ? val.$ne : val.ne !== undefined ? val.ne : val.not;
      if (neVal !== undefined) {
        if (neVal === null) {
          return { not: "" };
        }
        throw new Error(`Unsupported organization filter operator in UserRepository: ${val.$ne !== undefined ? "$ne" : "ne"}`);
      }

      const ninList = val.$nin !== undefined ? val.$nin : val.nin !== undefined ? val.nin : val.notIn;
      if (ninList !== undefined) {
        if (!Array.isArray(ninList)) {
          throw new Error(`Invalid array in UserRepository filter: ${fieldName}`);
        }
        const mapped = ninList.map((id) => this.toIdString(id)).filter(Boolean);
        return { notIn: mapped };
      }

      const candidate = val._id || val.id;
      if (candidate) {
        const idStr = this.toIdString(candidate);
        if (idStr && idStr !== "[object Object]") {
          return idStr;
        }
      }
      if (typeof val.toHexString === "function") {
        const hex = val.toHexString();
        if (hex) return hex;
      }
      if (typeof val.toString === "function" && val.constructor && val.constructor.name === "ObjectId") {
        const str = val.toString().trim();
        if (str && str !== "[object Object]") return str;
      }

      for (const k of Object.keys(val)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported organization filter operator in UserRepository: ${k}`);
        }
      }

      throw new Error(`Invalid identifier object in UserRepository filter: ${fieldName}`);
    }

    return this.toIdString(val);
  }

  _buildIdFilter(val, fieldName = "_id", allowNegation = true) {
    if (val === null || val === undefined) {
      return undefined;
    }

    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) {
        throw new Error(`Invalid identifier in UserRepository filter for field: ${fieldName}`);
      }
      return trimmed;
    }

    if (Array.isArray(val)) {
      const mapped = val.map((id) => this.toIdString(id)).filter(Boolean);
      return { in: mapped };
    }

    if (typeof val === "object") {
      const hasIn = val.$in !== undefined || val.in !== undefined;
      const hasNe = val.$ne !== undefined || val.ne !== undefined || val.not !== undefined;
      const hasNin = val.$nin !== undefined || val.nin !== undefined || val.notIn !== undefined;

      if (hasIn && hasNin) {
        const inRaw = val.$in !== undefined ? val.$in : val.in;
        const ninRaw = val.$nin !== undefined ? val.$nin : val.nin !== undefined ? val.nin : val.notIn;
        if (!Array.isArray(inRaw) || !Array.isArray(ninRaw)) {
          throw new Error(`Invalid array in UserRepository filter: ${fieldName}`);
        }
        const inIds = inRaw.map((id) => this.toIdString(id)).filter(Boolean);
        const ninIds = ninRaw.map((id) => this.toIdString(id)).filter(Boolean);
        const ninSet = new Set(ninIds);
        let filteredInIds = inIds.filter((id) => !ninSet.has(id));
        if (hasNe && allowNegation) {
          const neRaw = val.$ne !== undefined ? val.$ne : val.ne !== undefined ? val.ne : val.not;
          if (neRaw !== null) {
            const excludedId = this.toIdString(neRaw);
            if (!excludedId) {
              throw new Error(`Invalid identifier in UserRepository filter for field: ${fieldName}`);
            }
            filteredInIds = filteredInIds.filter((id) => id !== excludedId);
            return { in: filteredInIds, notIn: ninIds, not: excludedId };
          }
        }
        return { in: filteredInIds, notIn: ninIds };
      }

      if (hasIn && hasNe) {
        const inRaw = val.$in !== undefined ? val.$in : val.in;
        if (!Array.isArray(inRaw)) {
          throw new Error(`Invalid array in UserRepository filter: ${fieldName}`);
        }
        const neRaw = val.$ne !== undefined ? val.$ne : val.ne !== undefined ? val.ne : val.not;
        if (!allowNegation) {
          throw new Error(`Unsupported id filter operator in UserRepository: ${val.$ne !== undefined ? "$ne" : "ne"}`);
        }
        const excludedId = this.toIdString(neRaw);
        if (!excludedId) {
          throw new Error(`Invalid identifier in UserRepository filter for field: ${fieldName}`);
        }
        const inIds = inRaw.map((id) => this.toIdString(id)).filter(Boolean);
        const inFiltered = inIds.filter((id) => id !== excludedId);
        return { in: inFiltered, not: excludedId };
      }

      if (hasIn) {
        const inRaw = val.$in !== undefined ? val.$in : val.in;
        if (!Array.isArray(inRaw)) {
          throw new Error(`Invalid array in UserRepository filter: ${fieldName}`);
        }
        const inIds = inRaw.map((id) => this.toIdString(id)).filter(Boolean);
        return { in: inIds };
      }

      if (hasNe) {
        const neRaw = val.$ne !== undefined ? val.$ne : val.ne !== undefined ? val.ne : val.not;
        if (!allowNegation) {
          throw new Error(`Unsupported id filter operator in UserRepository: ${val.$ne !== undefined ? "$ne" : "ne"}`);
        }
        if (neRaw === null) {
          return { not: "" };
        }
        const excludedId = this.toIdString(neRaw);
        if (!excludedId) {
          throw new Error(`Invalid identifier in UserRepository filter for field: ${fieldName}`);
        }
        return { not: excludedId };
      }

      if (hasNin) {
        const ninRaw = val.$nin !== undefined ? val.$nin : val.nin !== undefined ? val.nin : val.notIn;
        if (!Array.isArray(ninRaw)) {
          throw new Error(`Invalid array in UserRepository filter: ${fieldName}`);
        }
        const ninIds = ninRaw.map((id) => this.toIdString(id)).filter(Boolean);
        return { notIn: ninIds };
      }

      const candidate = val._id || val.id;
      if (candidate) {
        const idStr = this.toIdString(candidate);
        if (idStr && idStr !== "[object Object]") {
          return idStr;
        }
      }
      if (typeof val.toHexString === "function") {
        const hex = val.toHexString();
        if (hex) return hex;
      }
      if (typeof val.toString === "function" && val.constructor && val.constructor.name === "ObjectId") {
        const str = val.toString().trim();
        if (str && str !== "[object Object]") return str;
      }

      for (const k of Object.keys(val)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported id filter operator in UserRepository: ${k}`);
        }
      }

      throw new Error(`Invalid identifier object in UserRepository filter: ${fieldName}`);
    }

    return this.toIdString(val);
  }

  _processArchivedFilter(filter, contextName = "UserRepository") {
    const hasArchived = filter.isArchived !== undefined;
    const hasDeleted = filter.deleted !== undefined;

    if (!hasArchived && !hasDeleted) return undefined;

    if (hasDeleted) {
      if (typeof filter.deleted !== "boolean") {
        if (filter.deleted && typeof filter.deleted === "object") {
          for (const k of Object.keys(filter.deleted)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported filter operator in ${contextName}: ${k}`);
            }
          }
        }
        throw new Error(`Invalid filter value for deleted in ${contextName}: expected boolean`);
      }
    }

    if (hasArchived && hasDeleted) {
      const archivedVal = Boolean(filter.isArchived);
      if (archivedVal !== filter.deleted) {
        throw new Error(`Conflicting deleted and isArchived filters in ${contextName}`);
      }
      return archivedVal;
    }

    if (hasDeleted) {
      return filter.deleted;
    }

    return Boolean(filter.isArchived);
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("UserRepository.find requires a valid filter object");
        }

        for (const key of Object.keys(filter)) {
          if (key.startsWith("$") && key !== "$or") {
            throw new Error(`Unsupported filter operator in UserRepository: ${key}`);
          }
        }

        const where = {};
        if (filter.organization !== undefined) {
          where.organizationId = this._buildOrganizationFilter(filter.organization, "organization");
        }
        if (filter.organizationId !== undefined) {
          const orgIdFilter = this._buildOrganizationFilter(filter.organizationId, "organizationId");
          if (where.organizationId !== undefined && !isSameFilter(where.organizationId, orgIdFilter)) {
            throw new Error("Conflicting organization filters in UserRepository");
          }
          where.organizationId = orgIdFilter;
        }

        if (filter.role !== undefined) {
          where.role = this._buildRoleFilter(filter.role, "role");
        }

        const isArchived = this._processArchivedFilter(filter, "UserRepository");
        if (isArchived !== undefined) where.isArchived = isArchived;
        if (filter.isVerified !== undefined) where.isVerified = Boolean(filter.isVerified);
        if (filter.email) where.email = this._buildTextFilter(filter.email, "email");
        if (filter.firstName) where.firstName = this._buildTextFilter(filter.firstName, "firstName");
        if (filter.lastName) where.lastName = this._buildTextFilter(filter.lastName, "lastName");

        if (filter.team !== undefined) {
          where.teamId = this._buildRelationIdFilter(filter.team, "team");
        }
        if (filter.teamId !== undefined) {
          const teamIdFilter = this._buildRelationIdFilter(filter.teamId, "teamId");
          if (where.teamId !== undefined && !isSameFilter(where.teamId, teamIdFilter)) {
            throw new Error("Conflicting team filters in UserRepository");
          }
          where.teamId = teamIdFilter;
        }

        this._applyManagerFilter(where, filter);

        if (filter.roleRef !== undefined) {
          where.roleRef = this._buildRelationIdFilter(filter.roleRef, "roleRef");
        }

        if (filter._id !== undefined) {
          where.id = this._buildIdFilter(filter._id, "_id");
        }
        if (filter.id !== undefined) {
          const idFilter = this._buildIdFilter(filter.id, "id");
          if (where.id !== undefined && !isSameFilter(where.id, idFilter)) {
            throw new Error("Conflicting id filters in UserRepository");
          }
          where.id = idFilter;
        }
        if (filter.$or !== undefined) {
          if (!Array.isArray(filter.$or) || filter.$or.length === 0) {
            throw new Error("Invalid or empty $or filter in UserRepository");
          }
          where.OR = filter.$or.map((clause, idx) => {
            if (!clause || typeof clause !== "object" || Array.isArray(clause)) {
              throw new Error(`Invalid clause at index ${idx} in $or filter in UserRepository`);
            }
            const clauseKeys = Object.keys(clause);
            if (clauseKeys.length === 0) {
              throw new Error(`Empty clause at index ${idx} in $or filter in UserRepository`);
            }

            const clauseOrg = clause.organization || clause.organizationId;
            if (clauseOrg) {
              const clauseOrgStr = this.toIdString(clauseOrg);
              if (where.organizationId && clauseOrgStr !== where.organizationId) {
                throw new Error(`Tenant isolation violation in UserRepository $or clause at index ${idx}`);
              }
            }

            const orItem = {};
            for (const key of clauseKeys) {
              if (key === "_id" || key === "id") {
                orItem.id = this._buildIdFilter(clause[key], key);
              } else if (key === "manager" || key === "managerId") {
                const parsedClauseMgr = this._buildRelationIdFilter(clause[key], key);
                const cond = this._buildManagerWhereCondition(parsedClauseMgr);
                if (cond) {
                  orItem.AND = Array.isArray(orItem.AND) ? [...orItem.AND, cond] : [cond];
                }
              } else if (key === "firstName") {
                orItem.firstName = this._buildTextFilter(clause.firstName, "firstName");
              } else if (key === "lastName") {
                orItem.lastName = this._buildTextFilter(clause.lastName, "lastName");
              } else if (key === "email") {
                orItem.email = this._buildTextFilter(clause.email, "email");
              } else if (key === "isArchived" || key === "deleted") {
                if (key === "deleted") {
                  if (typeof clause.deleted !== "boolean") {
                    throw new Error("Invalid filter value for deleted in UserRepository: expected boolean");
                  }
                  orItem.isArchived = clause.deleted;
                } else {
                  orItem.isArchived = Boolean(clause.isArchived);
                }
              } else if (key === "role") {
                if (clause.role && typeof clause.role === "object") {
                  if (clause.role.$ne) orItem.role = { not: clause.role.$ne };
                  else if (clause.role.$in) orItem.role = { in: clause.role.$in };
                  else throw new Error("Unsupported role operator in UserRepository $or clause");
                } else {
                  orItem.role = clause.role;
                }
              } else if (key === "team" || key === "teamId") {
                if (clause[key] && typeof clause[key] === "object" && clause[key].$in) {
                  orItem.teamId = { in: clause[key].$in.map((id) => this.toIdString(id)).filter(Boolean) };
                } else {
                  orItem.teamId = this.toIdString(clause[key]);
                }
              } else if (key === "roleRef") {
                orItem.roleRef = this._buildRelationIdFilter(clause[key], "roleRef");
              } else if (key === "organization" || key === "organizationId") {
                orItem.organizationId = this.toIdString(clause[key]);
              } else if (key.startsWith("$")) {
                throw new Error(`Unsupported filter operator in UserRepository: ${key}`);
              } else {
                throw new Error(`Unsupported field in UserRepository $or clause: ${key}`);
              }
            }

            return orItem;
          });

          if (where.OR.length === 0) {
            throw new Error("No valid clauses in $or filter in UserRepository");
          }
        }

        const queryOptions = {
          where,
          include: buildUserInclude(options),
        };

        const orderBy = buildOrderBy(options.sort);
        if (orderBy) {
          queryOptions.orderBy = orderBy;
        }

        const skip = options.skip !== undefined ? Number(options.skip) : options.offset !== undefined ? Number(options.offset) : undefined;
        if (typeof skip === "number" && !isNaN(skip) && skip >= 0) {
          queryOptions.skip = skip;
        }

        const take = options.limit !== undefined ? Number(options.limit) : options.take !== undefined ? Number(options.take) : undefined;
        if (typeof take === "number" && !isNaN(take) && take >= 0) {
          queryOptions.take = take;
        }

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => applyPopulateProjections(this.formatUser(d), options));
      } catch (err) {
        this.handleError(err);
      }
    }

    const mongoFilter = this._rewriteMongoManagerFilter(filter);
    let query = applyMongooseManagerPopulate(this.mongooseModel.find(mongoFilter), options);
    if (options.sort) query = query.sort(options.sort);
    if (typeof options.skip === "number") query = query.skip(options.skip);
    if (typeof options.limit === "number") query = query.limit(options.limit);
    const docs = await query;
    return docs.map((d) => this._formatMongoUser(d));
  }

  _buildRelationIdFilter(val, fieldName) {
    if (val === null) {
      return null;
    }
    if (val === undefined) {
      return undefined;
    }

    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) {
        throw new Error(`Invalid identifier in UserRepository filter for field: ${fieldName}`);
      }
      return trimmed;
    }

    if (Array.isArray(val)) {
      const mapped = val.map((id) => this.toIdString(id)).filter(Boolean);
      return { in: mapped };
    }

    if (typeof val === "object") {
      const candidate = val._id || val.id;
      if (candidate) {
        const idStr = this.toIdString(candidate);
        if (idStr && idStr !== "[object Object]") {
          return idStr;
        }
      }

      if (typeof val.toHexString === "function") {
        const hex = val.toHexString();
        if (hex) return hex;
      }

      if (typeof val.toString === "function" && val.constructor && val.constructor.name === "ObjectId") {
        const str = val.toString().trim();
        if (str && str !== "[object Object]") return str;
      }

      const hasIn = val.$in !== undefined || val.in !== undefined;
      const hasNe = val.$ne !== undefined || val.ne !== undefined || val.not !== undefined;
      const hasNin = val.$nin !== undefined || val.nin !== undefined || val.notIn !== undefined;

      if (hasIn && hasNin) {
        const inRaw = val.$in !== undefined ? val.$in : val.in;
        const ninRaw = val.$nin !== undefined ? val.$nin : val.nin !== undefined ? val.nin : val.notIn;
        if (!Array.isArray(inRaw) || !Array.isArray(ninRaw)) {
          throw new Error(`Invalid array in UserRepository filter: ${fieldName}`);
        }
        const inIds = inRaw.map((id) => this.toIdString(id)).filter(Boolean);
        const ninIds = ninRaw.map((id) => this.toIdString(id)).filter(Boolean);
        const ninSet = new Set(ninIds);
        let filteredInIds = inIds.filter((id) => !ninSet.has(id));
        if (hasNe && allowNegation) {
          const neRaw = val.$ne !== undefined ? val.$ne : val.ne !== undefined ? val.ne : val.not;
          if (neRaw !== null) {
            const excludedId = this.toIdString(neRaw);
            if (!excludedId) {
              throw new Error(`Invalid identifier in UserRepository filter for field: ${fieldName}`);
            }
            filteredInIds = filteredInIds.filter((id) => id !== excludedId);
            return { in: filteredInIds, notIn: ninIds, not: excludedId };
          }
        }
        return { in: filteredInIds, notIn: ninIds };
      }

      if (hasIn && hasNe) {
        const inRaw = val.$in !== undefined ? val.$in : val.in;
        if (!Array.isArray(inRaw)) {
          throw new Error(`Invalid array in UserRepository filter: ${fieldName}`);
        }
        const neRaw = val.$ne !== undefined ? val.$ne : val.ne !== undefined ? val.ne : val.not;
        if (neRaw === null) {
          const inIds = inRaw.map((id) => this.toIdString(id)).filter(Boolean);
          return { in: inIds, not: null };
        }
        const excludedId = this.toIdString(neRaw);
        if (!excludedId || excludedId === "[object Object]") {
          throw new Error(`Invalid identifier in UserRepository filter for field: ${fieldName}`);
        }
        const inIds = inRaw.map((id) => this.toIdString(id)).filter(Boolean);
        const inFiltered = inIds.filter((id) => id !== excludedId);
        return { in: inFiltered, not: excludedId };
      }

      if (hasIn) {
        const inRaw = val.$in !== undefined ? val.$in : val.in;
        if (!Array.isArray(inRaw)) {
          throw new Error(`Invalid array in UserRepository filter: ${fieldName}`);
        }
        const inIds = inRaw.map((id) => this.toIdString(id)).filter(Boolean);
        return { in: inIds };
      }

      if (hasNe) {
        const neRaw = val.$ne !== undefined ? val.$ne : val.ne !== undefined ? val.ne : val.not;
        if (neRaw === null) {
          return { not: null };
        }
        const excludedId = this.toIdString(neRaw);
        if (!excludedId || excludedId === "[object Object]") {
          throw new Error(`Invalid identifier in UserRepository filter for field: ${fieldName}`);
        }
        return { not: excludedId };
      }

      if (hasNin) {
        const ninRaw = val.$nin !== undefined ? val.$nin : val.nin !== undefined ? val.nin : val.notIn;
        if (!Array.isArray(ninRaw)) {
          throw new Error(`Invalid array in UserRepository filter: ${fieldName}`);
        }
        const ninIds = ninRaw.map((id) => this.toIdString(id)).filter(Boolean);
        return { notIn: ninIds };
      }

      for (const k of Object.keys(val)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported ${fieldName} filter operator in UserRepository: ${k}`);
        }
      }

      throw new Error(`Invalid identifier object in UserRepository filter: ${fieldName}`);
    }

    const idStr = this.toIdString(val);
    if (!idStr || idStr === "[object Object]") {
      throw new Error(`Invalid identifier in UserRepository filter for field: ${fieldName}`);
    }
    return idStr;
  }

  _buildRoleFilter(val, fieldName = "role") {
    if (val === undefined) return undefined;
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) {
        throw new Error(`Invalid filter value in UserRepository: ${fieldName}`);
      }
      return trimmed;
    }
    if (typeof val === "object" && val !== null) {
      if (val.$in && Array.isArray(val.$in)) {
        return { in: val.$in };
      }
      if (val.in && Array.isArray(val.in)) {
        return { in: val.in };
      }
      if (val.$ne !== undefined) {
        return { not: val.$ne };
      }
      if (val.ne !== undefined) {
        return { not: val.ne };
      }
      if (val.not !== undefined) {
        return { not: val.not };
      }
      for (const k of Object.keys(val)) {
        if (k.startsWith("$")) {
          throw new Error(`Unsupported role filter operator in UserRepository: ${k}`);
        }
      }
      throw new Error(`Invalid filter object in UserRepository: ${fieldName}`);
    }
    throw new Error(`Invalid filter value in UserRepository: ${fieldName}`);
  }

  buildCountWhere(filter = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("UserRepository.countDocuments requires a valid filter object");
    }

    const ALLOWED_COUNT_FIELDS = new Set([
      "organization",
      "organizationId",
      "manager",
      "managerId",
      "managers",
      "team",
      "teamId",
      "role",
      "roleRef",
      "isArchived",
      "deleted",
      "isVerified",
      "_id",
      "id",
      "email",
    ]);

    for (const key of Object.keys(filter)) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in UserRepository.countDocuments: ${key}`);
      }
      if (!ALLOWED_COUNT_FIELDS.has(key)) {
        throw new Error(`Unsupported filter field in UserRepository.countDocuments: ${key}`);
      }
    }

    const where = {};

    if (filter.organization !== undefined) {
      where.organizationId = this._buildOrganizationFilter(filter.organization, "organization");
    }
    if (filter.organizationId !== undefined) {
      const orgIdFilter = this._buildOrganizationFilter(filter.organizationId, "organizationId");
      if (where.organizationId !== undefined && typeof where.organizationId === "string" && typeof orgIdFilter === "string" && where.organizationId !== orgIdFilter) {
        throw new Error("Conflicting organization filters in UserRepository");
      }
      where.organizationId = orgIdFilter;
    }

    if (filter.manager !== undefined || filter.managerId !== undefined || filter.managers !== undefined) {
      this._applyManagerFilter(where, filter);
    }

    if (filter.team !== undefined) {
      where.teamId = this._buildRelationIdFilter(filter.team, "team");
    }
    if (filter.teamId !== undefined) {
      const teamIdFilter = this._buildRelationIdFilter(filter.teamId, "teamId");
      if (where.teamId !== undefined && typeof where.teamId === "string" && typeof teamIdFilter === "string" && where.teamId !== teamIdFilter) {
        throw new Error("Conflicting team filters in UserRepository");
      }
      where.teamId = teamIdFilter;
    }

    if (filter.roleRef !== undefined) {
      where.roleRef = this._buildRelationIdFilter(filter.roleRef, "roleRef");
    }

    if (filter.role !== undefined) {
      if (typeof filter.role === "string") {
        where.role = filter.role.trim();
      } else if (typeof filter.role === "object" && filter.role !== null) {
        if (filter.role.$in && Array.isArray(filter.role.$in)) {
          where.role = { in: filter.role.$in };
        } else if (filter.role.in && Array.isArray(filter.role.in)) {
          where.role = { in: filter.role.in };
        } else if (filter.role.$ne !== undefined) {
          where.role = { not: filter.role.$ne };
        } else if (filter.role.ne !== undefined) {
          where.role = { not: filter.role.ne };
        } else {
          for (const k of Object.keys(filter.role)) {
            if (k.startsWith("$")) {
              throw new Error(`Unsupported role filter operator in UserRepository: ${k}`);
            }
          }
          throw new Error("Invalid filter object in UserRepository: role");
        }
      } else {
        throw new Error("Invalid filter value in UserRepository: role");
      }
    }

    const isArchivedCount = this._processArchivedFilter(filter, "UserRepository.countDocuments");
    if (isArchivedCount !== undefined) {
      where.isArchived = isArchivedCount;
    }

    if (filter.isVerified !== undefined) {
      where.isVerified = Boolean(filter.isVerified);
    }

    if (filter._id !== undefined) {
      where.id = this._buildIdFilter(filter._id, "_id");
    }
    if (filter.id !== undefined) {
      const idFilter = this._buildIdFilter(filter.id, "id");
      if (where.id !== undefined && typeof where.id === "string" && typeof idFilter === "string" && where.id !== idFilter) {
        throw new Error("Conflicting id filters in UserRepository");
      }
      where.id = idFilter;
    }

    if (filter.email !== undefined) {
      where.email = this._buildTextFilter(filter.email, "email");
    }

    return where;
  }

  async countDocuments(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildCountWhere(filter);
        return await this.delegate.count({ where });
      } catch (err) {
        this.handleError(err);
      }
    }

    return await this.mongooseModel.countDocuments(this._rewriteMongoManagerFilter(filter));
  }

  async create(userData) {
    if (isPostgres()) {
      try {
        const orgId = this.toIdString(userData.organization || userData.organizationId);
        const teamId = this.toIdString(userData.team || userData.teamId);
        const roleRef = this.toIdString(userData.roleRef);
        const managerMutation = this._resolveManagerMutation(userData, null);
        const targetManagerIds = managerMutation.hasMutation ? managerMutation.targetManagerIds : [];
        const managerId = targetManagerIds[0] || null;

        const newId = userData._id ? this.toIdString(userData._id) : generateId();

        const createPayload = {
          id: newId,
          email: userData.email.toLowerCase().trim(),
          password: userData.password || null,
          firstName: userData.firstName || null,
          lastName: userData.lastName || null,
          role: userData.role || "user",
          roleRef: roleRef || null,
          organizationId: orgId,
          teamId: teamId || null,
          managerId: managerId || null,
          authProvider: userData.authProvider || "local",
          googleId: userData.googleId || null,
          microsoftId: userData.microsoftId || null,
          appleId: userData.appleId || null,
          isVerified: Boolean(userData.isVerified),
          isArchived: Boolean(userData.isArchived),
          verificationToken: userData.verificationToken || null,
          verificationTokenExpire: userData.verificationTokenExpire ? new Date(userData.verificationTokenExpire) : null,
          resetToken: userData.resetToken || null,
          resetTokenExpire: userData.resetTokenExpire ? new Date(userData.resetTokenExpire) : null,
          avatar: userData.avatar || "",
          weeklyReport: userData.weeklyReport !== undefined ? Boolean(userData.weeklyReport) : true,
          dailyReport: Boolean(userData.dailyReport),
          reportTimezone: userData.reportTimezone || "Browser timezone",
          trackingSettings: userData.trackingSettings || {},
          screenCaptureSettings: userData.screenCaptureSettings || {},
          manualTimeSettings: userData.manualTimeSettings || {},
          shiftSettings: userData.shiftSettings || {},
          notificationSettings: userData.notificationSettings || {},
          emailReportSettings: userData.emailReportSettings || {},
        };

        const doc = await this.delegate.create({
          data: createPayload,
          include: { devices: true, refreshTokens: true },
        });

        if (targetManagerIds.length > 0 && orgId && this.prisma?.userManagerAssignment) {
          await this._syncUserManagerLinks(this.prisma, {
            userId: newId,
            organizationId: orgId,
            managerIds: targetManagerIds,
            existingLinks: [],
          });
        }
        if (targetManagerIds.length > 0 && !Array.isArray(doc.managerLinks)) {
          doc.managerLinks = targetManagerIds.map((mId) => ({ managerId: mId }));
        }

        // Insert initial devices if provided
        if (Array.isArray(userData.devices) && userData.devices.length > 0) {
          const prisma = this.prisma;
          for (const d of userData.devices) {
            await prisma.userDevice.create({
              data: {
                id: generateId(),
                userId: newId,
                deviceId: d.deviceId,
                ip: d.ip || null,
                location: d.location || null,
                platform: d.platform || null,
                appVersion: d.appVersion || null,
                hostname: d.hostname || null,
                isOnline: Boolean(d.isOnline),
                isTracking: Boolean(d.isTracking),
              },
            });
          }
        }

        return this.formatUser(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const mongoData = { ...userData };
    const managerMutation = this._resolveManagerMutation(mongoData, null);
    if (managerMutation.hasMutation) {
      mongoData.managers = managerMutation.targetManagerIds;
      mongoData.manager = managerMutation.primaryManagerId || undefined;
    }
    const doc = await this.mongooseModel.create(mongoData);
    return this._formatMongoUser(doc);
  }

  _buildUserPatch(rawPayload, existing) {
    const patch = {};
    const allowedScalarFields = [
      "email", "firstName", "lastName", "jobTitle", "hourlyRate", "currency", "role",
      "avatar", "password", "isVerified", "isArchived", "authProvider",
      "googleId", "microsoftId", "appleId", "breakStartTime", "weeklyReport",
      "dailyReport", "reportTimezone", "lastDailyWarningEmail", "lastWeeklyWarningEmail",
      "verificationToken", "verificationTokenExpire", "resetToken", "resetTokenExpire",
      "jiraAccountId", "asanaAccountId", "bambooHREmployeeId", "slackUserId",
      "workSpaceId", "twoFactorCode", "twoFactorExpires",
      "appUpdateSettings", "trackingSettings", "screenCaptureSettings", "manualTimeSettings",
      "shiftSettings", "notificationSettings", "emailReportSettings",
    ];

    for (const field of allowedScalarFields) {
      if (rawPayload[field] !== undefined) {
        patch[field] = rawPayload[field];
      }
    }

    if (patch.email !== undefined && patch.email !== null) {
      patch.email = String(patch.email).toLowerCase().trim();
    }

    const dateFields = [
      "breakStartTime",
      "lastDailyWarningEmail",
      "lastWeeklyWarningEmail",
      "verificationTokenExpire",
      "resetTokenExpire",
      "twoFactorExpires",
    ];
    for (const df of dateFields) {
      if (patch[df] !== undefined) {
        patch[df] = patch[df] ? new Date(patch[df]) : null;
      }
    }

    if (rawPayload.team !== undefined || rawPayload.teamId !== undefined) {
      const tVal = rawPayload.team ?? rawPayload.teamId;
      if (tVal && typeof tVal === "object") {
        patch.teamId = this.toIdString(tVal._id || tVal.id || tVal);
      } else {
        patch.teamId = tVal ? this.toIdString(tVal) : null;
      }
    }

    if (rawPayload.reportTeam !== undefined || rawPayload.reportTeamId !== undefined) {
      const rtVal = rawPayload.reportTeam ?? rawPayload.reportTeamId;
      if (rtVal && typeof rtVal === "object") {
        patch.reportTeamId = this.toIdString(rtVal._id || rtVal.id || rtVal);
      } else {
        patch.reportTeamId = rtVal ? this.toIdString(rtVal) : null;
      }
    }

    if (rawPayload.manager !== undefined || rawPayload.managerId !== undefined) {
      const mVal = rawPayload.manager ?? rawPayload.managerId;
      if (mVal && typeof mVal === "object") {
        patch.managerId = this.toIdString(mVal._id || mVal.id || mVal);
      } else {
        patch.managerId = mVal ? this.toIdString(mVal) : null;
      }
    }

    if (rawPayload.roleRef !== undefined) {
      const rrVal = rawPayload.roleRef;
      if (rrVal && typeof rrVal === "object") {
        patch.roleRef = this.toIdString(rrVal._id || rrVal.id || rrVal);
      } else {
        patch.roleRef = rrVal ? this.toIdString(rrVal) : null;
      }
    }

    // Prune unchanged fields when existing record is provided
    if (existing) {
      for (const k of Object.keys(patch)) {
        if (isUserFieldUnchanged(k, patch[k], existing)) {
          delete patch[k];
        }
      }
    }

    return patch;
  }

  async findByIdAndUpdate(id, updateData, options = { new: true }) {
    const idStr = this.toIdString(id);
    if (!idStr || typeof idStr !== "string" || !idStr.trim() || idStr === "[object Object]") {
      if (isPostgres()) {
        throw new Error("Invalid identifier in UserRepository.findByIdAndUpdate");
      }
      return null;
    }

    if (!updateData || typeof updateData !== "object" || Array.isArray(updateData)) {
      if (isPostgres()) {
        throw new Error("UserRepository.findByIdAndUpdate requires a valid update object");
      }
      return null;
    }

    if (isPostgres()) {
      try {
        for (const key of Object.keys(updateData)) {
          if (key.startsWith("$") && key !== "$set") {
            throw new Error(`Unsupported update operator in UserRepository.findByIdAndUpdate: ${key}`);
          }
        }

        if (updateData.$set !== undefined) {
          if (!updateData.$set || typeof updateData.$set !== "object" || Array.isArray(updateData.$set)) {
            throw new Error("Invalid $set envelope in UserRepository.findByIdAndUpdate");
          }
          for (const key of Object.keys(updateData.$set)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in UserRepository.findByIdAndUpdate: ${key}`);
            }
          }
        }

        const directFields = { ...updateData };
        delete directFields.$set;
        const setFields = updateData.$set || {};

        for (const key of Object.keys(setFields)) {
          if (directFields[key] !== undefined) {
            if (!isValueMatch(directFields[key], setFields[key])) {
              throw new Error(`Conflicting update values for field '${key}' between direct payload and $set envelope`);
            }
          }
        }

        const rawPayload = { ...directFields, ...setFields };

        for (const key of Object.keys(rawPayload)) {
          if (typeof rawPayload[key] === "function") continue;
          if (!ALLOWED_USER_UPDATE_FIELDS.has(key) && !ALLOWED_USER_PASSTHROUGH_FIELDS.has(key)) {
            throw new Error(`Unsupported update field in UserRepository: ${key}`);
          }
        }

        // Detect conflicting aliases
        if (rawPayload._id !== undefined && rawPayload.id !== undefined) {
          if (this.toIdString(rawPayload._id) !== this.toIdString(rawPayload.id)) {
            throw new Error("Conflicting update values for '_id' and 'id' in UserRepository");
          }
        }
        if (rawPayload.organization !== undefined && rawPayload.organizationId !== undefined) {
          if (this.toIdString(rawPayload.organization) !== this.toIdString(rawPayload.organizationId)) {
            throw new Error("Conflicting update values for 'organization' and 'organizationId' in UserRepository");
          }
        }
        if (rawPayload.team !== undefined && rawPayload.teamId !== undefined) {
          if (this.toIdString(rawPayload.team) !== this.toIdString(rawPayload.teamId)) {
            throw new Error("Conflicting update values for 'team' and 'teamId' in UserRepository");
          }
        }
        if (rawPayload.reportTeam !== undefined && rawPayload.reportTeamId !== undefined) {
          if (this.toIdString(rawPayload.reportTeam) !== this.toIdString(rawPayload.reportTeamId)) {
            throw new Error("Conflicting update values for 'reportTeam' and 'reportTeamId' in UserRepository");
          }
        }
        if (rawPayload.manager !== undefined && rawPayload.managerId !== undefined) {
          if (this.toIdString(rawPayload.manager) !== this.toIdString(rawPayload.managerId)) {
            throw new Error("Conflicting update values for 'manager' and 'managerId' in UserRepository");
          }
        }

        const include = buildUserInclude(options);
        const wantsManagerMutation =
          rawPayload.manager !== undefined ||
          rawPayload.managerId !== undefined ||
          rawPayload.managers !== undefined;
        const existingInclude = wantsManagerMutation && !include.managerLinks
          ? { ...include, managerLinks: true }
          : include;

        // Fetch existing record if delegate provides findUnique
        let existing = null;
        if (typeof this.delegate.findUnique === "function") {
          existing = await this.delegate.findUnique({
            where: { id: idStr },
            include: existingInclude,
          });
          if (!existing) {
            return null;
          }
        }

        const existingId = existing ? (existing.id || existing._id) : idStr;
        const existingOrg = existing ? (existing.organizationId || existing.organization) : null;

        if (existing) {
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
          const rawOrg = rawPayload.organization ?? rawPayload.organizationId;
          if (rawOrg !== undefined) {
            const orgStr = this.toIdString(rawOrg);
            if (orgStr !== existingOrg) {
              throw new Error("Cannot update immutable field: organization");
            }
          }
        }

        const managerMutation = this._resolveManagerMutation(rawPayload, existing);
        const sanitizedPayloadForPatch = { ...rawPayload };
        if (managerMutation.hasMutation) {
          sanitizedPayloadForPatch.manager = managerMutation.primaryManagerId;
          sanitizedPayloadForPatch.managerId = managerMutation.primaryManagerId;
        } else {
          delete sanitizedPayloadForPatch.manager;
          delete sanitizedPayloadForPatch.managerId;
        }
        const patch = this._buildUserPatch(sanitizedPayloadForPatch, existing);

        const existingDevices = Array.isArray(existing?.devices) ? existing.devices : [];
        const existingDeviceMap = new Map(
          existingDevices.filter((d) => d && d.deviceId).map((d) => [d.deviceId, d])
        );
        const devicesToUpsert = Array.isArray(rawPayload.devices)
          ? rawPayload.devices.filter((d) => {
              if (!d || !d.deviceId) return false;
              const prev = existingDeviceMap.get(d.deviceId);
              if (!prev) return true;
              const prevSync = prev.lastSync ? new Date(prev.lastSync).getTime() : 0;
              const nextSync = d.lastSync ? new Date(d.lastSync).getTime() : 0;
              return (
                (prev.ip || null) !== (d.ip || null) ||
                (prev.location || null) !== (d.location || null) ||
                (prev.platform || null) !== (d.platform || null) ||
                (prev.appVersion || null) !== (d.appVersion || null) ||
                (prev.hostname || null) !== (d.hostname || null) ||
                Boolean(prev.isOnline) !== Boolean(d.isOnline) ||
                Boolean(prev.isTracking) !== Boolean(d.isTracking) ||
                prevSync !== nextSync
              );
            })
          : [];

        const existingTokens = Array.isArray(existing?.refreshTokens) ? existing.refreshTokens : [];
        const existingTokenById = new Map(
          existingTokens.filter((rt) => rt && (rt.id || rt._id)).map((rt) => [String(rt.id || rt._id), rt])
        );
        const existingTokenByVal = new Map(
          existingTokens.filter((rt) => rt && rt.token).map((rt) => [rt.token, rt])
        );
        const tokensToUpsert = Array.isArray(rawPayload.refreshTokens)
          ? rawPayload.refreshTokens.filter((rt) => {
              if (!rt || !rt.token) return false;
              const rtId = rt.id || rt._id ? this.toIdString(rt.id || rt._id) : null;
              const prev = (rtId && existingTokenById.get(rtId)) || existingTokenByVal.get(rt.token);
              if (!prev) return true;
              return (
                prev.token !== rt.token ||
                (prev.deviceId || null) !== (rt.deviceId || null)
              );
            })
          : [];

        const needsManagerLinkSync = Boolean(managerMutation.hasMutation && this.prisma?.userManagerAssignment);
        const hasChildWrites = devicesToUpsert.length > 0 || tokensToUpsert.length > 0 || needsManagerLinkSync;

        // Avoid empty/ineffective updates
        if (Object.keys(patch).length === 0 && !hasChildWrites) {
          if (existing) {
            const formatted = this.formatUser(existing);
            return applyPopulateProjections(formatted, options);
          }
          return null;
        }

        const executeMutation = async (txClient = null) => {
          const prisma = txClient || this.prisma;
          if (txClient) {
            if (!txClient.userDevice || !txClient.userRefreshToken || !txClient.user) {
              throw new Error("Transaction client missing required delegate in UserRepository.findByIdAndUpdate");
            }
          }
          const userDelegate = txClient ? txClient.user : this.delegate;

          if (needsManagerLinkSync && prisma?.userManagerAssignment) {
            await this._syncUserManagerLinks(prisma, {
              userId: idStr,
              organizationId: existingOrg || this.toIdString(rawPayload.organization || rawPayload.organizationId),
              managerIds: managerMutation.targetManagerIds,
              existingLinks: existing?.managerLinks || [],
            });
          }

          if (devicesToUpsert.length > 0) {
            await Promise.all(
              devicesToUpsert.map((d) =>
                prisma.userDevice.upsert({
                  where: { userId_deviceId: { userId: idStr, deviceId: d.deviceId } },
                  create: {
                    id: d.id || d._id ? this.toIdString(d.id || d._id) : generateId(),
                    userId: idStr,
                    deviceId: d.deviceId,
                    ip: d.ip || null,
                    location: d.location || null,
                    platform: d.platform || null,
                    appVersion: d.appVersion || null,
                    hostname: d.hostname || null,
                    isOnline: Boolean(d.isOnline),
                    isTracking: Boolean(d.isTracking),
                    lastSync: d.lastSync ? new Date(d.lastSync) : new Date(),
                    loginTime: d.loginTime ? new Date(d.loginTime) : new Date(),
                  },
                  update: {
                    ip: d.ip || null,
                    location: d.location || null,
                    platform: d.platform || null,
                    appVersion: d.appVersion || null,
                    hostname: d.hostname || null,
                    isOnline: Boolean(d.isOnline),
                    isTracking: Boolean(d.isTracking),
                    lastSync: d.lastSync ? new Date(d.lastSync) : new Date(),
                  },
                })
              )
            );
          }

          if (tokensToUpsert.length > 0) {
            await Promise.all(
              tokensToUpsert.map((rt) => {
                const rtId = rt.id || rt._id ? this.toIdString(rt.id || rt._id) : null;
                if (rtId) {
                  return prisma.userRefreshToken.upsert({
                    where: { id: rtId },
                    create: {
                      id: rtId,
                      userId: idStr,
                      token: rt.token,
                      deviceId: rt.deviceId || null,
                    },
                    update: {
                      token: rt.token,
                      deviceId: rt.deviceId || null,
                    },
                  });
                }
                return prisma.userRefreshToken.upsert({
                  where: { token: rt.token },
                  create: {
                    id: generateId(),
                    userId: idStr,
                    token: rt.token,
                    deviceId: rt.deviceId || null,
                  },
                  update: {
                    deviceId: rt.deviceId || null,
                  },
                });
              })
            );
          }

          let updatedDoc = null;
          if (Object.keys(patch).length > 0) {
            updatedDoc = await userDelegate.update({
              where: { id: idStr },
              data: patch,
              include,
            });
          } else if (typeof userDelegate.findUnique === "function") {
            updatedDoc = await userDelegate.findUnique({
              where: { id: idStr },
              include,
            });
          } else {
            updatedDoc = existing;
          }

          return updatedDoc;
        };

        let doc;
        if (hasChildWrites) {
          const prisma = this.prisma;
          const executeInTx = typeof prisma?.$transaction === "function"
            ? (fn) => prisma.$transaction(fn, { maxWait: 5000, timeout: 15000 })
            : (fn) => runTransaction(fn, { maxWait: 5000, timeout: 15000 });

          doc = await executeInTx(async (tx) => {
            return await executeMutation(tx);
          });
        } else {
          doc = await executeMutation();
        }

        const returnOriginal = options.new === false || options.returnDocument === "before";
        if (returnOriginal && existing) {
          const formatted = this.formatUser(existing);
          return applyPopulateProjections(formatted, options);
        }

        if (managerMutation.hasMutation && doc && !include.managerLinks) {
          doc.managerLinks = managerMutation.targetManagerIds.map((mId) => ({ managerId: mId }));
        }

        const formatted = this.formatUser(doc);
        return applyPopulateProjections(formatted, options);
      } catch (err) {
        if (err && (err.code === "P2025" || err.originalError?.code === "P2025" || err.name === "NotFoundError")) {
          return null;
        }
        this.handleError(err);
      }
    }

    const session = (options && options.session) || (isMongo() && typeof getAmbientTransaction === "function" ? getAmbientTransaction() : null);
    const finalOptions = { ...options };
    if (session && !finalOptions.session) {
      finalOptions.session = session;
    }
    const normalizedUpdate = this._normalizeMongoManagerUpdate(updateData);
    const doc = await this.mongooseModel.findByIdAndUpdate(idStr, normalizedUpdate, finalOptions);
    return this._formatMongoUser(doc);
  }

  async updateById(id, updateData, options = { new: true }) {
    return this.findByIdAndUpdate(id, updateData, options);
  }

  buildWhere(filter = {}, options = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("UserRepository requires a valid filter object");
    }

    const where = {};

    for (const key of Object.keys(filter)) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in UserRepository: ${key}`);
      }
      if (!ALLOWED_USER_FILTER_FIELDS.has(key)) {
        throw new Error(`Unsupported filter field in UserRepository: ${key}`);
      }
    }

    if (filter._id !== undefined) {
      where.id = this._buildIdFilter(filter._id, "_id", options.allowIdNegation !== false);
    }
    if (filter.id !== undefined) {
      const idFilter = this._buildIdFilter(filter.id, "id", options.allowIdNegation !== false);
      if (where.id !== undefined && !isSameFilter(where.id, idFilter)) {
        throw new Error("Conflicting id filters in UserRepository");
      }
      where.id = idFilter;
    }

    if (filter.organization !== undefined) {
      where.organizationId = this._buildOrganizationFilter(filter.organization, "organization");
    }
    if (filter.organizationId !== undefined) {
      const orgIdFilter = this._buildOrganizationFilter(filter.organizationId, "organizationId");
      if (where.organizationId !== undefined && !isSameFilter(where.organizationId, orgIdFilter)) {
        throw new Error("Conflicting organization filters in UserRepository");
      }
      where.organizationId = orgIdFilter;
    }

    if (filter.manager !== undefined) {
      where.managerId = this._buildRelationIdFilter(filter.manager, "manager");
    }
    if (filter.managerId !== undefined) {
      const managerIdFilter = this._buildRelationIdFilter(filter.managerId, "managerId");
      if (where.managerId !== undefined && !isSameFilter(where.managerId, managerIdFilter)) {
        throw new Error("Conflicting manager filters in UserRepository");
      }
      where.managerId = managerIdFilter;
    }

    if (filter.team !== undefined) {
      where.teamId = this._buildRelationIdFilter(filter.team, "team");
    }
    if (filter.teamId !== undefined) {
      const teamIdFilter = this._buildRelationIdFilter(filter.teamId, "teamId");
      if (where.teamId !== undefined && !isSameFilter(where.teamId, teamIdFilter)) {
        throw new Error("Conflicting team filters in UserRepository");
      }
      where.teamId = teamIdFilter;
    }

    if (filter.reportTeam !== undefined) {
      where.reportTeamId = this._buildRelationIdFilter(filter.reportTeam, "reportTeam");
    }
    if (filter.reportTeamId !== undefined) {
      const reportTeamIdFilter = this._buildRelationIdFilter(filter.reportTeamId, "reportTeamId");
      if (where.reportTeamId !== undefined && !isSameFilter(where.reportTeamId, reportTeamIdFilter)) {
        throw new Error("Conflicting reportTeam filters in UserRepository");
      }
      where.reportTeamId = reportTeamIdFilter;
    }

    if (filter.role !== undefined) {
      where.role = this._buildRoleFilter(filter.role, "role");
    }

    if (filter.roleRef !== undefined) {
      where.roleRef = this._buildRelationIdFilter(filter.roleRef, "roleRef");
    }

    const isArchivedBuild = this._processArchivedFilter(filter, "UserRepository");
    if (isArchivedBuild !== undefined) {
      where.isArchived = isArchivedBuild;
    }

    if (filter.email !== undefined) {
      where.email = this._buildTextFilter(filter.email, "email");
    }

    if (filter.isVerified !== undefined) {
      where.isVerified = Boolean(filter.isVerified);
    }

    if (filter.googleId !== undefined) where.googleId = filter.googleId;
    if (filter.microsoftId !== undefined) where.microsoftId = filter.microsoftId;
    if (filter.appleId !== undefined) where.appleId = filter.appleId;
    if (filter.jiraAccountId !== undefined) where.jiraAccountId = filter.jiraAccountId;
    if (filter.bambooHREmployeeId !== undefined) where.bambooHREmployeeId = filter.bambooHREmployeeId;
    if (filter.asanaAccountId !== undefined) where.asanaAccountId = filter.asanaAccountId;
    if (filter.slackUserId !== undefined) where.slackUserId = filter.slackUserId;
    if (filter.verificationToken !== undefined) where.verificationToken = filter.verificationToken;
    if (filter.resetToken !== undefined) where.resetToken = filter.resetToken;

    if (filter["refreshTokens.token"] !== undefined) {
      where.refreshTokens = {
        some: { token: String(filter["refreshTokens.token"]) },
      };
    }

    return where;
  }

  async findOneAndUpdate(filter, update, options = {}) {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("UserRepository.findOneAndUpdate requires a valid filter object");
    }
    if (!update || typeof update !== "object" || Array.isArray(update)) {
      throw new Error("UserRepository.findOneAndUpdate requires a valid update object");
    }

    if (isPostgres()) {
      try {
        for (const key of Object.keys(update)) {
          if (key.startsWith("$") && key !== "$set" && key !== "$setOnInsert") {
            throw new Error(`Unsupported update operator in UserRepository.findOneAndUpdate: ${key}`);
          }
        }

        if (update.$set !== undefined) {
          if (!update.$set || typeof update.$set !== "object" || Array.isArray(update.$set)) {
            throw new Error("Invalid $set envelope in UserRepository.findOneAndUpdate");
          }
          for (const key of Object.keys(update.$set)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported update operator in UserRepository.findOneAndUpdate: ${key}`);
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

        for (const key of Object.keys(rawPayload)) {
          if (typeof rawPayload[key] === "function") continue;
          if (!ALLOWED_USER_UPDATE_FIELDS.has(key) && !ALLOWED_USER_PASSTHROUGH_FIELDS.has(key)) {
            throw new Error(`Unsupported update field in UserRepository: ${key}`);
          }
        }

        // Detect conflicting aliases
        if (rawPayload._id !== undefined && rawPayload.id !== undefined) {
          if (this.toIdString(rawPayload._id) !== this.toIdString(rawPayload.id)) {
            throw new Error("Conflicting update values for '_id' and 'id' in UserRepository");
          }
        }
        if (rawPayload.organization !== undefined && rawPayload.organizationId !== undefined) {
          if (this.toIdString(rawPayload.organization) !== this.toIdString(rawPayload.organizationId)) {
            throw new Error("Conflicting update values for 'organization' and 'organizationId' in UserRepository");
          }
        }
        if (rawPayload.team !== undefined && rawPayload.teamId !== undefined) {
          if (this.toIdString(rawPayload.team) !== this.toIdString(rawPayload.teamId)) {
            throw new Error("Conflicting update values for 'team' and 'teamId' in UserRepository");
          }
        }
        if (rawPayload.reportTeam !== undefined && rawPayload.reportTeamId !== undefined) {
          if (this.toIdString(rawPayload.reportTeam) !== this.toIdString(rawPayload.reportTeamId)) {
            throw new Error("Conflicting update values for 'reportTeam' and 'reportTeamId' in UserRepository");
          }
        }
        if (rawPayload.manager !== undefined && rawPayload.managerId !== undefined) {
          if (this.toIdString(rawPayload.manager) !== this.toIdString(rawPayload.managerId)) {
            throw new Error("Conflicting update values for 'manager' and 'managerId' in UserRepository");
          }
        }

        const where = this.buildWhere(filter, { allowIdNegation: false });
        const include = buildUserInclude(options);
        const wantsManagerMutation =
          rawPayload.manager !== undefined ||
          rawPayload.managerId !== undefined ||
          rawPayload.managers !== undefined;
        const existingInclude = wantsManagerMutation && !include.managerLinks
          ? { ...include, managerLinks: true }
          : include;

        const existing = await this.delegate.findFirst({
          where,
          include: existingInclude,
        });

        if (!existing) {
          if (options.upsert) {
            const insertPayload = { ...rawPayload };
            if (update.$setOnInsert) {
              Object.assign(insertPayload, update.$setOnInsert);
            }

            const orgId = this.toIdString(
              insertPayload.organization || insertPayload.organizationId || filter.organization || filter.organizationId
            );
            const rawEmail = insertPayload.email || filter.email;
            const emailVal = typeof rawEmail === "string" ? rawEmail.toLowerCase().trim() : null;
            if (!emailVal || !orgId) {
              throw new Error("Cannot upsert User without valid email string and organization");
            }

            const insertMgrMutation = this._resolveManagerMutation(insertPayload, null);
            const insertPatchPayload = { ...insertPayload };
            if (insertMgrMutation.hasMutation) {
              insertPatchPayload.manager = insertMgrMutation.primaryManagerId;
              insertPatchPayload.managerId = insertMgrMutation.primaryManagerId;
            }
            const patch = this._buildUserPatch(insertPatchPayload, null);
            const newId = insertPayload._id || insertPayload.id ? this.toIdString(insertPayload._id || insertPayload.id) : generateId();

            const createData = {
              id: newId,
              email: emailVal,
              firstName: insertPayload.firstName || "",
              lastName: insertPayload.lastName || "",
              organizationId: orgId,
              role: insertPayload.role || "user",
              ...patch,
            };

            const created = await this.delegate.create({
              data: createData,
              include,
            });
            if (insertMgrMutation.hasMutation && insertMgrMutation.targetManagerIds.length > 0 && this.prisma?.userManagerAssignment) {
              await this._syncUserManagerLinks(this.prisma, {
                userId: newId,
                organizationId: orgId,
                managerIds: insertMgrMutation.targetManagerIds,
                existingLinks: [],
              });
              if (!Array.isArray(created.managerLinks)) {
                created.managerLinks = insertMgrMutation.targetManagerIds.map((mId) => ({ managerId: mId }));
              }
            }
            const resDoc = this.formatUser(created);
            if (insertPayload.kekaEmployeeId !== undefined) {
              resDoc.kekaEmployeeId = insertPayload.kekaEmployeeId;
            }
            return resDoc;
          }
          return null;
        }

        const existingId = existing.id || existing._id;
        const existingOrg = existing.organizationId || existing.organization;

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
        const rawOrg = rawPayload.organization ?? rawPayload.organizationId;
        if (rawOrg !== undefined) {
          const orgStr = this.toIdString(rawOrg);
          if (orgStr !== existingOrg) {
            throw new Error("Cannot update immutable field: organization");
          }
        }

        const managerMutation = this._resolveManagerMutation(rawPayload, existing);
        const sanitizedPayloadForPatch = { ...rawPayload };
        if (managerMutation.hasMutation) {
          sanitizedPayloadForPatch.manager = managerMutation.primaryManagerId;
          sanitizedPayloadForPatch.managerId = managerMutation.primaryManagerId;
        } else {
          delete sanitizedPayloadForPatch.manager;
          delete sanitizedPayloadForPatch.managerId;
        }
        const patch = this._buildUserPatch(sanitizedPayloadForPatch, existing);

        const returnOriginal = options.new === false || options.returnDocument === "before";
        const needsManagerLinkSync = Boolean(managerMutation.hasMutation && this.prisma?.userManagerAssignment);

        // Avoid empty writes
        if (Object.keys(patch).length === 0 && !needsManagerLinkSync) {
          const formatted = this.formatUser(existing);
          if (rawPayload.kekaEmployeeId !== undefined && !returnOriginal) {
            formatted.kekaEmployeeId = rawPayload.kekaEmployeeId;
          }
          return applyPopulateProjections(formatted, options);
        }

        let updated;
        if (needsManagerLinkSync && this.prisma?.userManagerAssignment) {
          const prisma = this.prisma;
          const executeInTx = typeof prisma?.$transaction === "function"
            ? (fn) => prisma.$transaction(fn, { maxWait: 5000, timeout: 15000 })
            : (fn) => runTransaction(fn, { maxWait: 5000, timeout: 15000 });

          updated = await executeInTx(async (tx) => {
            const txClient = tx || prisma;
            const userDelegate = tx ? txClient.user : this.delegate;
            await this._syncUserManagerLinks(txClient, {
              userId: existingId,
              organizationId: existingOrg,
              managerIds: managerMutation.targetManagerIds,
              existingLinks: existing.managerLinks || [],
            });
            if (Object.keys(patch).length > 0) {
              return await userDelegate.update({
                where: { id: existingId },
                data: patch,
                include,
              });
            }
            return typeof userDelegate.findUnique === "function"
              ? await userDelegate.findUnique({ where: { id: existingId }, include })
              : existing;
          });
        } else {
          updated = await this.delegate.update({
            where: { id: existingId },
            data: patch,
            include,
          });
        }

        if (managerMutation.hasMutation && updated && !include.managerLinks) {
          updated.managerLinks = managerMutation.targetManagerIds.map((mId) => ({ managerId: mId }));
        }

        const resDoc = returnOriginal ? this.formatUser(existing) : this.formatUser(updated);
        if (rawPayload.kekaEmployeeId !== undefined && !returnOriginal) {
          resDoc.kekaEmployeeId = rawPayload.kekaEmployeeId;
        }
        return applyPopulateProjections(resDoc, options);
      } catch (err) {
        if (err && (err.code === "P2025" || err.originalError?.code === "P2025" || err.name === "NotFoundError")) {
          return null;
        }
        this.handleError(err);
      }
    }

    const mongoFilter = this._rewriteMongoManagerFilter(filter);
    const mongoUpdate = this._normalizeMongoManagerUpdate(update);
    const doc = await this.mongooseModel.findOneAndUpdate(mongoFilter, mongoUpdate, options);
    return this._formatMongoUser(doc);
  }

  buildDistinctWhere(filter = {}) {
    const where = {};

    for (const key of Object.keys(filter || {})) {
      if (key.startsWith("$")) {
        throw new Error(`Unsupported filter operator in UserRepository.distinct: ${key}`);
      }
    }

    if (filter.organization) {
      where.organizationId = this.toIdString(filter.organization);
    }
    if (filter.organizationId) {
      where.organizationId = this.toIdString(filter.organizationId);
    }

    let distinctMgrParsed;
    if (filter.manager !== undefined) {
      if (filter.manager === null) {
        distinctMgrParsed = null;
      } else if (typeof filter.manager === "object") {
        if (filter.manager.$ne === null) {
          distinctMgrParsed = { not: null };
        } else if (filter.manager.$in && Array.isArray(filter.manager.$in)) {
          distinctMgrParsed = { in: filter.manager.$in.map((m) => this.toIdString(m)).filter(Boolean) };
        } else {
          for (const k of Object.keys(filter.manager)) {
            if (k.startsWith("$") && k !== "$in" && k !== "$ne") {
              throw new Error(`Unsupported manager filter operator in UserRepository.distinct: ${k}`);
            }
          }
          if (filter.manager.$ne !== undefined) {
            distinctMgrParsed = { not: this.toIdString(filter.manager.$ne) };
          } else {
            distinctMgrParsed = this.toIdString(filter.manager);
          }
        }
      } else {
        distinctMgrParsed = this.toIdString(filter.manager);
      }
    }
    if (filter.managerId !== undefined) {
      let mgrIdParsed;
      if (filter.managerId === null) {
        mgrIdParsed = null;
      } else if (typeof filter.managerId === "object") {
        if (filter.managerId.$ne === null) {
          mgrIdParsed = { not: null };
        } else if (filter.managerId.$in && Array.isArray(filter.managerId.$in)) {
          mgrIdParsed = { in: filter.managerId.$in.map((m) => this.toIdString(m)).filter(Boolean) };
        } else {
          for (const k of Object.keys(filter.managerId)) {
            if (k.startsWith("$") && k !== "$in" && k !== "$ne") {
              throw new Error(`Unsupported manager filter operator in UserRepository.distinct: ${k}`);
            }
          }
          if (filter.managerId.$ne !== undefined) {
            mgrIdParsed = { not: this.toIdString(filter.managerId.$ne) };
          } else {
            mgrIdParsed = this.toIdString(filter.managerId);
          }
        }
      } else {
        mgrIdParsed = this.toIdString(filter.managerId);
      }
      if (distinctMgrParsed !== undefined && !isSameFilter(distinctMgrParsed, mgrIdParsed)) {
        throw new Error("Conflicting manager filters in UserRepository");
      }
      distinctMgrParsed = mgrIdParsed;
    }
    if (distinctMgrParsed !== undefined) {
      const cond = this._buildManagerWhereCondition(distinctMgrParsed);
      if (cond) {
        where.AND = Array.isArray(where.AND) ? [...where.AND, cond] : [cond];
      }
    }

    if (filter.team !== undefined) {
      if (filter.team === null) {
        where.teamId = null;
      } else if (typeof filter.team === "object") {
        if (filter.team.$ne === null) {
          where.teamId = { not: null };
        } else if (filter.team.$in && Array.isArray(filter.team.$in)) {
          where.teamId = { in: filter.team.$in.map((t) => this.toIdString(t)).filter(Boolean) };
        } else {
          for (const k of Object.keys(filter.team)) {
            if (k.startsWith("$") && k !== "$in" && k !== "$ne") {
              throw new Error(`Unsupported team filter operator in UserRepository.distinct: ${k}`);
            }
          }
          if (filter.team.$ne !== undefined) {
            where.teamId = { not: this.toIdString(filter.team.$ne) };
          } else {
            where.teamId = this.toIdString(filter.team);
          }
        }
      } else {
        where.teamId = this.toIdString(filter.team);
      }
    }
    if (filter.teamId !== undefined) {
      if (filter.teamId === null) {
        where.teamId = null;
      } else if (typeof filter.teamId === "object") {
        if (filter.teamId.$ne === null) {
          where.teamId = { not: null };
        } else if (filter.teamId.$in && Array.isArray(filter.teamId.$in)) {
          where.teamId = { in: filter.teamId.$in.map((t) => this.toIdString(t)).filter(Boolean) };
        } else {
          for (const k of Object.keys(filter.teamId)) {
            if (k.startsWith("$") && k !== "$in" && k !== "$ne") {
              throw new Error(`Unsupported team filter operator in UserRepository.distinct: ${k}`);
            }
          }
          if (filter.teamId.$ne !== undefined) {
            where.teamId = { not: this.toIdString(filter.teamId.$ne) };
          } else {
            where.teamId = this.toIdString(filter.teamId);
          }
        }
      } else {
        where.teamId = this.toIdString(filter.teamId);
      }
    }

    if (filter.role !== undefined) {
      if (typeof filter.role === "object" && filter.role !== null) {
        if (filter.role.$in && Array.isArray(filter.role.$in)) {
          where.role = { in: filter.role.$in };
        } else if (filter.role.$ne !== undefined) {
          where.role = { not: filter.role.$ne };
        } else {
          where.role = filter.role;
        }
      } else {
        where.role = filter.role;
      }
    }

    const isArchivedDistinct = this._processArchivedFilter(filter, "UserRepository.distinct");
    if (isArchivedDistinct !== undefined) {
      where.isArchived = isArchivedDistinct;
    }

    if (filter._id) {
      where.id = this.toIdString(filter._id);
    }
    if (filter.id) {
      where.id = this.toIdString(filter.id);
    }

    return where;
  }

  async distinct(field, filter = {}) {
    if (!field || typeof field !== "string") {
      throw new Error("Field parameter is required for UserRepository.distinct");
    }

    const FIELD_MAP = {
      team: "teamId",
      teamId: "teamId",
      manager: "managerId",
      managerId: "managerId",
      reportTeam: "reportTeamId",
      reportTeamId: "reportTeamId",
      organization: "organizationId",
      organizationId: "organizationId",
      role: "role",
      roleRef: "roleRef",
      email: "email",
      id: "id",
      _id: "id",
    };

    const prismaField = FIELD_MAP[field];
    if (!prismaField) {
      throw new Error(`Unsupported distinct field in UserRepository: ${field}`);
    }

    if (isPostgres()) {
      try {
        const where = this.buildDistinctWhere(filter);

        const results = await this.delegate.findMany({
          where,
          select: { [prismaField]: true },
          distinct: [prismaField],
        });

        const rawValues = results
          .map((r) => r[prismaField])
          .filter((val) => val !== null && val !== undefined);

        return [...new Set(rawValues)];
      } catch (err) {
        this.handleError(err);
      }
    }

    return await this.mongooseModel.distinct(field, this._rewriteMongoManagerFilter(filter));
  }

  async findByIdAndDelete(id) {
    const idStr = this.toIdString(id);
    if (!idStr || typeof idStr !== "string" || !idStr.trim() || idStr === "[object Object]") {
      if (isPostgres()) {
        throw new Error("Invalid identifier in UserRepository.findByIdAndDelete");
      }
      return null;
    }

    if (isPostgres()) {
      try {
        let existing = null;
        if (typeof this.findById === "function") {
          existing = await this.findById(idStr);
          if (!existing) return null;
        } else if (typeof this.delegate.findUnique === "function") {
          const doc = await this.delegate.findUnique({ where: { id: idStr } });
          if (!doc) return null;
          existing = this.formatUser(doc);
        }

        const prisma = this.prisma;
        const executeInTx = typeof prisma?.$transaction === "function"
          ? (fn) => prisma.$transaction(fn)
          : (fn) => runTransaction(fn);

        return await executeInTx(async (tx) => {
          const txClient = tx || prisma;
          if (tx && (!txClient.userDevice || !txClient.userRefreshToken || !txClient.user)) {
            throw new Error("Transaction client missing required delegate in UserRepository.findByIdAndDelete");
          }
          const userDelegate = tx ? txClient.user : this.delegate;
          if (txClient.userManagerAssignment) {
            await txClient.userManagerAssignment.deleteMany({
              where: { OR: [{ userId: idStr }, { managerId: idStr }] },
            });
          }
          await txClient.userDevice.deleteMany({ where: { userId: idStr } });
          await txClient.userRefreshToken.deleteMany({ where: { userId: idStr } });
          const doc = await userDelegate.delete({ where: { id: idStr } });
          return existing || this.formatUser(doc);
        });
      } catch (err) {
        if (err && (err.code === "P2025" || err.originalError?.code === "P2025" || err.name === "NotFoundError")) {
          return null;
        }
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findByIdAndDelete(idStr);
    return this._formatMongoUser(doc);
  }

  async deleteOne(filter = {}) {
    if (isPostgres()) {
      try {
        const target = await this.findOne(filter);
        if (!target) return { acknowledged: true, deletedCount: 0 };
        await this.findByIdAndDelete(target._id || target.id);
        return { acknowledged: true, deletedCount: 1 };
      } catch (err) {
        this.handleError(err);
      }
    }
    return await this.mongooseModel.deleteOne(this._rewriteMongoManagerFilter(filter));
  }

  async deleteMany(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("UserRepository.deleteMany requires a valid filter object");
        }

        let where;
        try {
          where = this.buildWhere(filter);
        } catch (err) {
          if (err && err.message && err.message.startsWith("Unsupported filter field in UserRepository")) {
            throw new Error("Bulk deletion requires a valid scoped filter in UserRepository.deleteMany");
          }
          throw err;
        }

        if (Object.keys(where).length === 0) {
          throw new Error("Bulk deletion requires a valid scoped filter in UserRepository.deleteMany");
        }

        const result = await this.delegate.deleteMany({ where });
        return { acknowledged: true, deletedCount: result.count };
      } catch (err) {
        this.handleError(err);
      }
    }

    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw new Error("UserRepository.deleteMany requires a valid filter object");
    }
    return this.mongooseModel.deleteMany(this._rewriteMongoManagerFilter(filter), options);
  }

  async updateMany(filter = {}, update = {}) {
    if (isPostgres()) {
      try {
        if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
          throw new Error("UserRepository.updateMany requires a valid scoped filter object");
        }

        const filterKeys = Object.keys(filter);
        if (filterKeys.length === 0) {
          throw new Error("UserRepository.updateMany requires a valid scoped filter object");
        }

        const ALLOWED_FILTER_FIELDS = new Set([
          "_id",
          "id",
          "organization",
          "organizationId",
          "manager",
          "managerId",
          "managers",
          "team",
          "teamId",
          "role",
          "roleRef",
          "isArchived",
          "deleted",
          "isVerified",
          "email",
        ]);

        for (const key of filterKeys) {
          if (key.startsWith("$")) {
            throw new Error(`Unsupported filter operator in UserRepository.updateMany: ${key}`);
          }
          if (!ALLOWED_FILTER_FIELDS.has(key)) {
            throw new Error(`Unsupported filter field in UserRepository.updateMany: ${key}`);
          }
        }

        const where = {};

        // 1. Organization filter
        if (filter.organization !== undefined) {
          where.organizationId = this._buildOrganizationFilter(filter.organization, "organization");
        }
        if (filter.organizationId !== undefined) {
          const orgIdFilter = this._buildOrganizationFilter(filter.organizationId, "organizationId");
          if (where.organizationId !== undefined && !isSameFilter(where.organizationId, orgIdFilter)) {
            throw new Error("Conflicting organization filters in UserRepository");
          }
          where.organizationId = orgIdFilter;
        }

        // 2. ID filter
        if (filter._id !== undefined) {
          where.id = this._buildIdFilter(filter._id, "_id");
        }
        if (filter.id !== undefined) {
          const idFilter = this._buildIdFilter(filter.id, "id");
          if (where.id !== undefined && !isSameFilter(where.id, idFilter)) {
            throw new Error("Conflicting id filters in UserRepository");
          }
          where.id = idFilter;
        }

        // 3. Manager filter
        this._applyManagerFilter(where, filter);

        // 4. Team filter
        if (typeof filter.team === "string" && !/^[0-9a-fA-F]{24}$/.test(filter.team)) {
          const teamOrgId = where.organizationId;
          let teamDoc = null;
          if (this.prisma && this.prisma.team && typeof this.prisma.team.findFirst === "function") {
            teamDoc = await this.prisma.team.findFirst({
              where: {
                name: filter.team,
                ...(teamOrgId !== undefined ? { organizationId: teamOrgId } : {}),
              },
            });
          }
          where.teamId = teamDoc ? teamDoc.id : "000000000000000000000000";
        } else if (filter.team !== undefined) {
          where.teamId = this._buildRelationIdFilter(filter.team, "team");
        }
        if (filter.teamId !== undefined) {
          const teamIdFilter = this._buildRelationIdFilter(filter.teamId, "teamId");
          if (where.teamId !== undefined && !isSameFilter(where.teamId, teamIdFilter)) {
            throw new Error("Conflicting team filters in UserRepository");
          }
          where.teamId = teamIdFilter;
        }

        // 5. Role & RoleRef filters
        if (filter.role !== undefined) {
          where.role = this._buildRoleFilter(filter.role, "role");
        }
        if (filter.roleRef !== undefined) {
          where.roleRef = this._buildRelationIdFilter(filter.roleRef, "roleRef");
        }

        // 6. Archived & Deleted filters
        const isArchived = this._processArchivedFilter(filter, "UserRepository");
        if (isArchived !== undefined) {
          where.isArchived = isArchived;
        }

        // 7. Verified & Email filters
        if (filter.isVerified !== undefined) {
          where.isVerified = Boolean(filter.isVerified);
        }
        if (filter.email !== undefined) {
          where.email = this._buildTextFilter(filter.email, "email");
        }

        for (const [k, v] of Object.entries(where)) {
          if (v === undefined) {
            delete where[k];
          }
        }

        if (Object.keys(where).length === 0) {
          throw new Error("Bulk update requires a valid scoped filter in UserRepository.updateMany");
        }

        // Payload validation & translation
        if (!update || typeof update !== "object" || Array.isArray(update)) {
          throw new Error("UserRepository.updateMany requires a valid update object");
        }

        const ALLOWED_UPDATE_FIELDS = new Set([
          "manager",
          "managerId",
          "managers",
          "team",
          "teamId",
          "reportTeam",
          "reportTeamId",
          "role",
          "roleRef",
          "isArchived",
          "isVerified",
          "trackingSettings",
          "appUpdateSettings",
          "refreshToken",
        ]);

        for (const key of Object.keys(update)) {
          if (key.startsWith("$")) {
            if (key !== "$set" && key !== "$unset") {
              throw new Error(`Unsupported update operator in UserRepository.updateMany: ${key}`);
            }
            if (!update[key] || typeof update[key] !== "object" || Array.isArray(update[key])) {
              throw new Error(`Invalid ${key} payload in UserRepository.updateMany: expected object`);
            }
          } else if (!ALLOWED_UPDATE_FIELDS.has(key)) {
            throw new Error(`Unsupported update field in UserRepository.updateMany: ${key}`);
          }
        }

        if (update.$set) {
          for (const key of Object.keys(update.$set)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported operator in $set in UserRepository.updateMany: ${key}`);
            }
            if (!ALLOWED_UPDATE_FIELDS.has(key)) {
              throw new Error(`Unsupported update field in UserRepository.updateMany: ${key}`);
            }
          }
        }

        if (update.$unset) {
          for (const key of Object.keys(update.$unset)) {
            if (key.startsWith("$")) {
              throw new Error(`Unsupported operator in $unset in UserRepository.updateMany: ${key}`);
            }
            if (!ALLOWED_UPDATE_FIELDS.has(key)) {
              throw new Error(`Unsupported update field in UserRepository.updateMany: ${key}`);
            }
            if (key === "role" || key === "isArchived" || key === "isVerified") {
              throw new Error(`Cannot unset non-nullable field in UserRepository.updateMany: ${key}`);
            }
            if (update.$set && update.$set[key] !== undefined) {
              throw new Error(`Conflicting $set and $unset for field in UserRepository.updateMany: ${key}`);
            }
            if (!key.startsWith("$") && update[key] !== undefined) {
              throw new Error(`Conflicting direct update and $unset for field in UserRepository.updateMany: ${key}`);
            }
          }
        }

        // Check alias conflicts in update payload
        const directManager = update.manager !== undefined ? update.manager : update.managerId;
        const setManager = update.$set ? (update.$set.manager !== undefined ? update.$set.manager : update.$set.managerId) : undefined;
        if (update.manager !== undefined && update.managerId !== undefined) {
          const m1 = this.toIdString(update.manager);
          const m2 = this.toIdString(update.managerId);
          if (m1 !== m2) {
            throw new Error("Conflicting manager update fields in UserRepository.updateMany");
          }
        }
        if (update.$set && update.$set.manager !== undefined && update.$set.managerId !== undefined) {
          const m1 = this.toIdString(update.$set.manager);
          const m2 = this.toIdString(update.$set.managerId);
          if (m1 !== m2) {
            throw new Error("Conflicting manager update fields in UserRepository.updateMany");
          }
        }
        if (directManager !== undefined && setManager !== undefined) {
          const m1 = this.toIdString(directManager);
          const m2 = this.toIdString(setManager);
          if (m1 !== m2) {
            throw new Error("Conflicting manager update fields in UserRepository.updateMany");
          }
        }

        const directTeam = update.team !== undefined ? update.team : update.teamId;
        const setTeam = update.$set ? (update.$set.team !== undefined ? update.$set.team : update.$set.teamId) : undefined;
        if (update.team !== undefined && update.teamId !== undefined) {
          const t1 = this.toIdString(update.team);
          const t2 = this.toIdString(update.teamId);
          if (t1 !== t2) {
            throw new Error("Conflicting team update fields in UserRepository.updateMany");
          }
        }
        if (update.$set && update.$set.team !== undefined && update.$set.teamId !== undefined) {
          const t1 = this.toIdString(update.$set.team);
          const t2 = this.toIdString(update.$set.teamId);
          if (t1 !== t2) {
            throw new Error("Conflicting team update fields in UserRepository.updateMany");
          }
        }
        if (directTeam !== undefined && setTeam !== undefined) {
          const t1 = this.toIdString(directTeam);
          const t2 = this.toIdString(setTeam);
          if (t1 !== t2) {
            throw new Error("Conflicting team update fields in UserRepository.updateMany");
          }
        }

        const directReportTeam = update.reportTeam !== undefined ? update.reportTeam : update.reportTeamId;
        const setReportTeam = update.$set ? (update.$set.reportTeam !== undefined ? update.$set.reportTeam : update.$set.reportTeamId) : undefined;
        if (update.reportTeam !== undefined && update.reportTeamId !== undefined) {
          const r1 = this.toIdString(update.reportTeam);
          const r2 = this.toIdString(update.reportTeamId);
          if (r1 !== r2) {
            throw new Error("Conflicting reportTeam update fields in UserRepository.updateMany");
          }
        }
        if (update.$set && update.$set.reportTeam !== undefined && update.$set.reportTeamId !== undefined) {
          const r1 = this.toIdString(update.$set.reportTeam);
          const r2 = this.toIdString(update.$set.reportTeamId);
          if (r1 !== r2) {
            throw new Error("Conflicting reportTeam update fields in UserRepository.updateMany");
          }
        }
        if (directReportTeam !== undefined && setReportTeam !== undefined) {
          const r1 = this.toIdString(directReportTeam);
          const r2 = this.toIdString(setReportTeam);
          if (r1 !== r2) {
            throw new Error("Conflicting reportTeam update fields in UserRepository.updateMany");
          }
        }

        const patch = {};

        // 1. Process $unset
        if (update.$unset) {
          if (update.$unset.manager !== undefined || update.$unset.managerId !== undefined) {
            patch.managerId = null;
          }
          if (update.$unset.team !== undefined || update.$unset.teamId !== undefined) {
            patch.teamId = null;
          }
          if (update.$unset.reportTeam !== undefined || update.$unset.reportTeamId !== undefined) {
            patch.reportTeamId = null;
          }
          if (update.$unset.roleRef !== undefined) {
            patch.roleRef = null;
          }
          if (update.$unset.trackingSettings !== undefined) {
            patch.trackingSettings = null;
          }
          if (update.$unset.appUpdateSettings !== undefined) {
            patch.appUpdateSettings = null;
          }
        }

        // 2. Process $set and direct fields
        const rawManager = setManager !== undefined ? setManager : directManager;
        if (rawManager !== undefined) {
          if (rawManager === null || rawManager === "") {
            patch.managerId = null;
          } else {
            const mgrIdStr = this.toIdString(rawManager);
            if (!mgrIdStr || mgrIdStr === "[object Object]") {
              throw new Error("Invalid identifier in UserRepository update for field: manager");
            }
            patch.managerId = mgrIdStr;
          }
        }

        const rawTeam = setTeam !== undefined ? setTeam : directTeam;
        if (rawTeam !== undefined) {
          if (rawTeam === null || rawTeam === "") {
            patch.teamId = null;
          } else {
            const teamIdStr = this.toIdString(rawTeam);
            if (teamIdStr && /^[0-9a-fA-F]{24}$/.test(teamIdStr)) {
              patch.teamId = teamIdStr;
            } else if (typeof rawTeam === "string") {
              let teamDoc = null;
              if (this.prisma && this.prisma.team && typeof this.prisma.team.findFirst === "function") {
                teamDoc = await this.prisma.team.findFirst({
                  where: {
                    name: rawTeam,
                    ...(where.organizationId !== undefined ? { organizationId: where.organizationId } : {}),
                  },
                });
              }
              patch.teamId = teamDoc ? teamDoc.id : null;
            } else {
              const fallbackId = this.toIdString(rawTeam);
              if (!fallbackId || fallbackId === "[object Object]") {
                throw new Error("Invalid identifier in UserRepository update for field: team");
              }
              patch.teamId = fallbackId;
            }
          }
        }

        const rawReportTeam = setReportTeam !== undefined ? setReportTeam : directReportTeam;
        if (rawReportTeam !== undefined) {
          if (rawReportTeam === null || rawReportTeam === "") {
            patch.reportTeamId = null;
          } else {
            const repTeamIdStr = this.toIdString(rawReportTeam);
            if (!repTeamIdStr || repTeamIdStr === "[object Object]") {
              throw new Error("Invalid identifier in UserRepository update for field: reportTeam");
            }
            patch.reportTeamId = repTeamIdStr;
          }
        }

        const rawRoleRef = (update.$set && update.$set.roleRef !== undefined) ? update.$set.roleRef : update.roleRef;
        if (rawRoleRef !== undefined) {
          if (rawRoleRef === null || rawRoleRef === "") {
            patch.roleRef = null;
          } else {
            const roleRefStr = this.toIdString(rawRoleRef);
            if (!roleRefStr || roleRefStr === "[object Object]") {
              throw new Error("Invalid identifier in UserRepository update for field: roleRef");
            }
            patch.roleRef = roleRefStr;
          }
        }

        const rawRole = (update.$set && update.$set.role !== undefined) ? update.$set.role : update.role;
        if (rawRole !== undefined) {
          if (typeof rawRole !== "string" || !rawRole.trim()) {
            throw new Error("Invalid role value in UserRepository update");
          }
          patch.role = rawRole.trim();
        }

        const rawArchived = (update.$set && update.$set.isArchived !== undefined) ? update.$set.isArchived : update.isArchived;
        if (rawArchived !== undefined) {
          if (typeof rawArchived !== "boolean") {
            throw new Error("Invalid isArchived value in UserRepository update: expected boolean");
          }
          patch.isArchived = rawArchived;
        }

        const rawVerified = (update.$set && update.$set.isVerified !== undefined) ? update.$set.isVerified : update.isVerified;
        if (rawVerified !== undefined) {
          if (typeof rawVerified !== "boolean") {
            throw new Error("Invalid isVerified value in UserRepository update: expected boolean");
          }
          patch.isVerified = rawVerified;
        }

        const rawTracking = (update.$set && update.$set.trackingSettings !== undefined) ? update.$set.trackingSettings : update.trackingSettings;
        if (rawTracking !== undefined) {
          if (rawTracking !== null && typeof rawTracking !== "object") {
            throw new Error("Invalid trackingSettings in UserRepository update: expected object or null");
          }
          patch.trackingSettings = rawTracking;
        }

        const rawAppUpdate = (update.$set && update.$set.appUpdateSettings !== undefined) ? update.$set.appUpdateSettings : update.appUpdateSettings;
        if (rawAppUpdate !== undefined) {
          if (rawAppUpdate !== null && typeof rawAppUpdate !== "object") {
            throw new Error("Invalid appUpdateSettings in UserRepository update: expected object or null");
          }
          patch.appUpdateSettings = rawAppUpdate;
        }

        // Check refreshToken cleanup
        const rawRefreshToken = (update.$set && update.$set.refreshToken !== undefined)
          ? update.$set.refreshToken
          : ((update.$unset && update.$unset.refreshToken !== undefined)
            ? null
            : update.refreshToken);

        let clearRefreshTokens = false;
        if (rawRefreshToken !== undefined) {
          if (rawRefreshToken === null || rawRefreshToken === "") {
            clearRefreshTokens = true;
          } else {
            throw new Error("Setting non-null refreshToken via UserRepository.updateMany is not supported");
          }
        }

        let deletedTokensResult = null;
        if (clearRefreshTokens) {
          if (this.prisma && this.prisma.userRefreshToken && typeof this.prisma.userRefreshToken.deleteMany === "function") {
            deletedTokensResult = await this.prisma.userRefreshToken.deleteMany({
              where: { user: where },
            });
          }
        }

        if (Object.keys(patch).length === 0) {
          return {
            acknowledged: true,
            modifiedCount: deletedTokensResult ? deletedTokensResult.count : 0,
          };
        }

        let targetUsersForManagerSync = null;
        if (patch.managerId !== undefined && this.prisma?.userManagerAssignment && typeof this.delegate.findMany === "function") {
          targetUsersForManagerSync = await this.delegate.findMany({
            where,
            select: { id: true, organizationId: true },
          });
        }

        const res = await this.delegate.updateMany({ where, data: patch });

        if (Array.isArray(targetUsersForManagerSync) && targetUsersForManagerSync.length > 0 && this.prisma?.userManagerAssignment) {
          const matchedUserIds = targetUsersForManagerSync.map((u) => u.id).filter(Boolean);
          if (patch.managerId === null) {
            await this.prisma.userManagerAssignment.deleteMany({
              where: { userId: { in: matchedUserIds } },
            });
          } else if (patch.managerId) {
            await Promise.all(
              targetUsersForManagerSync.map((u) =>
                this._syncUserManagerLinks(this.prisma, {
                  userId: u.id,
                  organizationId: u.organizationId,
                  managerIds: [patch.managerId],
                  existingLinks: [],
                }),
              ),
            );
          }
        }

        return { acknowledged: true, modifiedCount: res.count };
      } catch (err) {
        this.handleError(err);
      }
    }
    return await this.mongooseModel.updateMany(
      this._rewriteMongoManagerFilter(filter),
      this._normalizeMongoManagerUpdate(update),
    );
  }

  // ---------------------------------------------------------------------------
  // Specialized Refresh Token & Device Methods
  // ---------------------------------------------------------------------------

  async findByRefreshToken(token) {
    if (!token) return null;

    if (isPostgres()) {
      try {
        const prisma = this.prisma;
        const tokenRecord = await prisma.userRefreshToken.findFirst({
          where: { token },
          include: {
            user: {
              include: { devices: true, refreshTokens: true },
            },
          },
        });
        return tokenRecord && tokenRecord.user ? this.formatUser(tokenRecord.user) : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOne({ "refreshTokens.token": token });
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async addRefreshToken(userId, { token, deviceId }) {
    const idStr = this.toIdString(userId);
    if (!idStr || !token) return;

    if (isPostgres()) {
      try {
        const prisma = this.prisma;
        await prisma.userRefreshToken.create({
          data: {
            id: generateId(),
            userId: idStr,
            token,
            deviceId: deviceId || null,
          },
        });
        return;
      } catch (err) {
        this.handleError(err);
      }
    }

    await this.mongooseModel.findByIdAndUpdate(idStr, {
      $push: { refreshTokens: { token, deviceId } },
    });
  }

  async removeRefreshToken(token) {
    if (!token) return;

    if (isPostgres()) {
      try {
        const prisma = this.prisma;
        await prisma.userRefreshToken.deleteMany({
          where: { token },
        });
        return;
      } catch (err) {
        this.handleError(err);
      }
    }

    await this.mongooseModel.updateOne(
      { "refreshTokens.token": token },
      { $pull: { refreshTokens: { token } } }
    );
  }

  async rotateRefreshToken(userId, oldToken, newToken) {
    const idStr = this.toIdString(userId);
    if (!idStr || !oldToken || !newToken) {
      return { modifiedCount: 0 };
    }

    if (isPostgres()) {
      try {
        const prisma = this.prisma;
        const result = await prisma.userRefreshToken.updateMany({
          where: { userId: idStr, token: oldToken },
          data: { token: newToken },
        });
        return { modifiedCount: result?.count || 0 };
      } catch (err) {
        this.handleError(err);
      }
    }

    const result = await this.mongooseModel.updateOne(
      { _id: idStr, "refreshTokens.token": oldToken },
      { $set: { "refreshTokens.$.token": newToken } }
    );
    return { modifiedCount: result?.modifiedCount || 0 };
  }

  async upsertDevice(userId, deviceInfo) {
    const idStr = this.toIdString(userId);
    if (!idStr || !deviceInfo || !deviceInfo.deviceId) return;

    if (isPostgres()) {
      try {
        const prisma = this.prisma;
        const existing = await prisma.userDevice.findFirst({
          where: { userId: idStr, deviceId: deviceInfo.deviceId },
        });

        if (existing) {
          await prisma.userDevice.update({
            where: { id: existing.id },
            data: {
              ip: deviceInfo.ip || existing.ip,
              location: deviceInfo.location || existing.location,
              platform: deviceInfo.platform || existing.platform,
              appVersion: deviceInfo.appVersion || existing.appVersion,
              hostname: deviceInfo.hostname || existing.hostname,
              isOnline: deviceInfo.isOnline !== undefined ? Boolean(deviceInfo.isOnline) : existing.isOnline,
              isTracking: deviceInfo.isTracking !== undefined ? Boolean(deviceInfo.isTracking) : existing.isTracking,
              lastSync: new Date(),
            },
          });
        } else {
          await prisma.userDevice.create({
            data: {
              id: generateId(),
              userId: idStr,
              deviceId: deviceInfo.deviceId,
              ip: deviceInfo.ip || null,
              location: deviceInfo.location || null,
              platform: deviceInfo.platform || null,
              appVersion: deviceInfo.appVersion || null,
              hostname: deviceInfo.hostname || null,
              isOnline: Boolean(deviceInfo.isOnline),
              isTracking: Boolean(deviceInfo.isTracking),
            },
          });
        }
        return;
      } catch (err) {
        this.handleError(err);
      }
    }

    const user = await this.mongooseModel.findById(idStr);
    if (!user) return;
    const existing = (user.devices || []).find((d) => d.deviceId === deviceInfo.deviceId);
    if (existing) {
      Object.assign(existing, deviceInfo, { lastSync: new Date() });
    } else {
      user.devices.push(deviceInfo);
    }
    await user.save();
  }
}

export const userRepository = new UserRepository();
export default userRepository;
