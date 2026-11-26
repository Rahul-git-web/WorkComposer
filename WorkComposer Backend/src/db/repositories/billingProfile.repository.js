import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

export class BillingProfileRepository extends BaseRepository {
  constructor() {
    super("BillingProfile");
  }

  formatBillingProfile(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc.toObject ? doc.toObject() : doc);
    if (!serialized.id && serialized._id) serialized.id = String(serialized._id);
    if (!serialized._id && serialized.id) serialized._id = String(serialized.id);
    serialized.organization = serialized.organization || serialized.organizationId;
    delete serialized.organizationId;
    return serialized;
  }

  normalizeId(val) {
    const idStr = this.toIdString(val);
    if (!idStr || typeof idStr !== "string") return null;
    const trimmed = idStr.trim();
    if (!trimmed || trimmed === "[object Object]") return null;
    return trimmed;
  }

  buildWhere(filter = {}) {
    const where = {};
    const idVal = this.normalizeId(filter._id || filter.id);
    if (idVal) where.id = idVal;
    const orgVal = this.normalizeId(filter.organization || filter.organizationId);
    if (orgVal) where.organizationId = orgVal;
    return where;
  }

  async findById(id, options = {}) {
    const idStr = this.normalizeId(id);
    if (!idStr) {
      return null;
    }

    if (isPostgres()) {
      try {
        const doc = await this.delegate.findUnique({
          where: { id: idStr },
        });
        return this.formatBillingProfile(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findById(idStr);
    return doc ? this.formatBillingProfile(doc) : null;
  }

  async findOne(filter = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const doc = await this.delegate.findFirst({ where });
        return doc ? this.formatBillingProfile(doc) : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOne(filter);
    return doc ? this.formatBillingProfile(doc) : null;
  }

  async findOneAndUpdate(filter, update, options = {}) {
    if (isPostgres()) {
      if (options.new === false || options.returnDocument === "before") {
        throw new Error("BillingProfileRepository.findOneAndUpdate does not support returnDocument: 'before' or new: false in PostgreSQL mode");
      }

      try {
        const setPayload = update?.$set || {};
        const setOnInsertPayload = update?.$setOnInsert || {};

        const directFields = {};
        for (const [k, v] of Object.entries(update || {})) {
          if (!k.startsWith("$")) {
            directFields[k] = v;
          }
        }

        // Conflict detection between direct updates and $set
        for (const [k, v] of Object.entries(setPayload)) {
          if (k in directFields && directFields[k] !== v) {
            throw new Error(`Conflicting update values for field '${k}' in BillingProfileRepository`);
          }
        }

        const updatePayload = { ...directFields, ...setPayload };

        const updateData = {};
        if (updatePayload.companyName !== undefined) updateData.companyName = String(updatePayload.companyName || "");
        if (updatePayload.contactName !== undefined) updateData.contactName = String(updatePayload.contactName || "");
        if (updatePayload.email !== undefined) updateData.email = String(updatePayload.email || "");
        if (updatePayload.address !== undefined) updateData.address = String(updatePayload.address || "");
        if (updatePayload.city !== undefined) updateData.city = String(updatePayload.city || "");
        if (updatePayload.state !== undefined) updateData.state = String(updatePayload.state || "");
        if (updatePayload.postalCode !== undefined) updateData.postalCode = String(updatePayload.postalCode || "");
        if (updatePayload.country !== undefined) updateData.country = String(updatePayload.country || "");
        if (updatePayload.taxId !== undefined) updateData.taxId = String(updatePayload.taxId || "");

        const filterOrgId = this.normalizeId(filter?.organization || filter?.organizationId);
        const updateOrgId = this.normalizeId(updatePayload?.organization || updatePayload?.organizationId);
        const insertOrgId = this.normalizeId(setOnInsertPayload?.organization || setOnInsertPayload?.organizationId);

        if (filterOrgId && updateOrgId && filterOrgId !== updateOrgId) {
          throw new Error(`Conflicting organization identifiers between filter ('${filterOrgId}') and update payload ('${updateOrgId}') in BillingProfileRepository`);
        }
        if (filterOrgId && insertOrgId && filterOrgId !== insertOrgId) {
          throw new Error(`Conflicting organization identifiers between filter ('${filterOrgId}') and $setOnInsert payload ('${insertOrgId}') in BillingProfileRepository`);
        }
        if (updateOrgId && insertOrgId && updateOrgId !== insertOrgId) {
          throw new Error(`Conflicting organization identifiers between update payload ('${updateOrgId}') and $setOnInsert payload ('${insertOrgId}') in BillingProfileRepository`);
        }

        const targetOrgId = filterOrgId || updateOrgId || insertOrgId || null;

        const filterId = this.normalizeId(filter?._id || filter?.id);
        const updateId = this.normalizeId(updatePayload?._id || updatePayload?.id);
        if (filterId && updateId && filterId !== updateId) {
          throw new Error(`Conflicting id between filter ('${filterId}') and update payload ('${updateId}') in BillingProfileRepository`);
        }

        const targetId = filterId || updateId || null;

        if (options.upsert) {
          if (!targetOrgId && !targetId) {
            throw new Error("BillingProfileRepository upsert requires organization or id in filter");
          }

          const createData = {
            id: targetId || generateId(),
            organizationId: targetOrgId,
            companyName: updateData.companyName !== undefined ? updateData.companyName : (setOnInsertPayload.companyName || ""),
            contactName: updateData.contactName !== undefined ? updateData.contactName : (setOnInsertPayload.contactName || ""),
            email: updateData.email !== undefined ? updateData.email : (setOnInsertPayload.email || ""),
            address: updateData.address !== undefined ? updateData.address : (setOnInsertPayload.address || ""),
            city: updateData.city !== undefined ? updateData.city : (setOnInsertPayload.city || ""),
            state: updateData.state !== undefined ? updateData.state : (setOnInsertPayload.state || ""),
            postalCode: updateData.postalCode !== undefined ? updateData.postalCode : (setOnInsertPayload.postalCode || ""),
            country: updateData.country !== undefined ? updateData.country : (setOnInsertPayload.country || ""),
            taxId: updateData.taxId !== undefined ? updateData.taxId : (setOnInsertPayload.taxId || ""),
          };

          const whereUnique = targetOrgId ? { organizationId: targetOrgId } : { id: targetId };

          // Atomic PostgreSQL native upsert: INSERT ... ON CONFLICT (organization_id) DO UPDATE
          const upserted = await this.delegate.upsert({
            where: whereUnique,
            update: updateData,
            create: createData,
          });
          return this.formatBillingProfile(upserted);
        }

        // Non-upsert update
        if (targetOrgId) {
          if (Object.keys(updateData).length === 0) {
            return this.findOne(filter);
          }
          try {
            const updated = await this.delegate.update({
              where: { organizationId: targetOrgId },
              data: updateData,
            });
            return this.formatBillingProfile(updated);
          } catch (err) {
            if (err && err.code === "P2025") {
              return null;
            }
            this.handleError(err);
          }
        } else if (targetId) {
          if (Object.keys(updateData).length === 0) {
            return this.findById(targetId);
          }
          try {
            const updated = await this.delegate.update({
              where: { id: targetId },
              data: updateData,
            });
            return this.formatBillingProfile(updated);
          } catch (err) {
            if (err && err.code === "P2025") {
              return null;
            }
            this.handleError(err);
          }
        } else {
          const where = this.buildWhere(filter);
          const existing = await this.delegate.findFirst({ where });
          if (!existing) return null;
          if (Object.keys(updateData).length === 0) {
            return this.formatBillingProfile(existing);
          }
          const updated = await this.delegate.update({
            where: { id: existing.id },
            data: updateData,
          });
          return this.formatBillingProfile(updated);
        }
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOneAndUpdate(filter, update, options);
    return doc ? this.formatBillingProfile(doc) : null;
  }

  async findByIdAndUpdate(id, update, options = { new: true }) {
    const idStr = this.normalizeId(id);
    if (!idStr) {
      if (isPostgres()) {
        throw new Error("Invalid identifier in BillingProfileRepository.findByIdAndUpdate");
      }
      return null;
    }

    if (isPostgres()) {
      return this.findOneAndUpdate({ _id: idStr }, update, options);
    }

    const doc = await this.mongooseModel.findByIdAndUpdate(id, update, options);
    return doc ? this.formatBillingProfile(doc) : null;
  }

  async updateById(id, update, options = { new: true }) {
    return this.findByIdAndUpdate(id, update, options);
  }

  async updateOne(filter, update, options = {}) {
    if (isPostgres()) {
      const res = await this.findOneAndUpdate(filter, update, options);
      return {
        acknowledged: true,
        matchedCount: res ? 1 : 0,
        modifiedCount: res ? 1 : 0,
      };
    }

    return await this.mongooseModel.updateOne(filter, update, options);
  }

  async create(data) {
    if (!data || typeof data !== "object") {
      throw new Error("BillingProfileRepository.create requires a valid data object");
    }

    if (isPostgres()) {
      try {
        const organizationId = this.normalizeId(data.organization || data.organizationId);
        const newId = data._id ? this.normalizeId(data._id) : generateId();

        const createData = {
          id: newId,
          organizationId,
          companyName: data.companyName || "",
          contactName: data.contactName || "",
          email: data.email || "",
          address: data.address || "",
          city: data.city || "",
          state: data.state || "",
          postalCode: data.postalCode || "",
          country: data.country || "",
          taxId: data.taxId || "",
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatBillingProfile(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.create(data);
    return this.formatBillingProfile(doc);
  }

  async deleteOne(filter) {
    if (isPostgres()) {
      try {
        const existing = await this.findOne(filter);
        if (!existing) return { acknowledged: true, deletedCount: 0 };
        await this.delegate.delete({ where: { id: existing.id } });
        return { acknowledged: true, deletedCount: 1 };
      } catch (err) {
        if (err && err.code === "P2025") {
          return { acknowledged: true, deletedCount: 0 };
        }
        this.handleError(err);
      }
    }

    return await this.mongooseModel.deleteOne(filter);
  }

  async findByIdAndDelete(id) {
    const idStr = this.normalizeId(id);
    if (!idStr) {
      return null;
    }

    if (isPostgres()) {
      try {
        const existing = await this.delegate.findUnique({ where: { id: idStr } });
        if (!existing) return null;
        const doc = await this.delegate.delete({ where: { id: idStr } });
        return doc ? this.formatBillingProfile(doc) : null;
      } catch (err) {
        if (err && err.code === "P2025") {
          return null;
        }
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findByIdAndDelete(idStr);
    return doc ? this.formatBillingProfile(doc) : null;
  }
}

export const billingProfileRepository = new BillingProfileRepository();
export default billingProfileRepository;
