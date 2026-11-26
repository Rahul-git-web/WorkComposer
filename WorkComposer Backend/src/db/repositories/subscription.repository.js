import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";

export class SubscriptionRepository extends BaseRepository {
  constructor() {
    super("Subscription");
  }

  formatSubscription(doc) {
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
    if (filter.stripeCustomerId) where.stripeCustomerId = filter.stripeCustomerId;
    if (filter.stripeSubscriptionId) where.stripeSubscriptionId = filter.stripeSubscriptionId;
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
        return this.formatSubscription(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findById(idStr);
    return doc ? this.formatSubscription(doc) : null;
  }

  async findOne(filter = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const doc = await this.delegate.findFirst({ where });
        return doc ? this.formatSubscription(doc) : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOne(filter);
    return doc ? this.formatSubscription(doc) : null;
  }

  async findOneAndUpdate(filter, update, options = {}) {
    if (isPostgres()) {
      if (options.new === false || options.returnDocument === "before") {
        throw new Error("SubscriptionRepository.findOneAndUpdate does not support returnDocument: 'before' or new: false in PostgreSQL mode");
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
            throw new Error(`Conflicting update values for field '${k}' in SubscriptionRepository`);
          }
        }

        const updatePayload = { ...directFields, ...setPayload };

        const updateData = {};
        if (updatePayload.plan !== undefined) updateData.plan = updatePayload.plan;
        if (updatePayload.billingCycle !== undefined) updateData.billingCycle = updatePayload.billingCycle;
        if (updatePayload.status !== undefined) updateData.status = updatePayload.status;
        if (updatePayload.stripeCustomerId !== undefined) updateData.stripeCustomerId = updatePayload.stripeCustomerId;
        if (updatePayload.stripeSubscriptionId !== undefined) updateData.stripeSubscriptionId = updatePayload.stripeSubscriptionId;
        if (updatePayload.stripePriceId !== undefined) updateData.stripePriceId = updatePayload.stripePriceId;
        if (updatePayload.quantity !== undefined) updateData.quantity = Number(updatePayload.quantity);
        if (updatePayload.startsAt !== undefined) updateData.startsAt = updatePayload.startsAt ? new Date(updatePayload.startsAt) : new Date();
        if (updatePayload.expiresAt !== undefined) updateData.expiresAt = updatePayload.expiresAt ? new Date(updatePayload.expiresAt) : null;
        if (updatePayload.trialEndsAt !== undefined) updateData.trialEndsAt = updatePayload.trialEndsAt ? new Date(updatePayload.trialEndsAt) : null;
        if (updatePayload.cancelledAt !== undefined) updateData.cancelledAt = updatePayload.cancelledAt ? new Date(updatePayload.cancelledAt) : null;

        const filterOrgId = this.normalizeId(filter?.organization || filter?.organizationId);
        const updateOrgId = this.normalizeId(updatePayload?.organization || updatePayload?.organizationId);
        const insertOrgId = this.normalizeId(setOnInsertPayload?.organization || setOnInsertPayload?.organizationId);

        if (filterOrgId && updateOrgId && filterOrgId !== updateOrgId) {
          throw new Error(`Conflicting organization identifiers between filter ('${filterOrgId}') and update payload ('${updateOrgId}') in SubscriptionRepository`);
        }
        if (filterOrgId && insertOrgId && filterOrgId !== insertOrgId) {
          throw new Error(`Conflicting organization identifiers between filter ('${filterOrgId}') and $setOnInsert payload ('${insertOrgId}') in SubscriptionRepository`);
        }
        if (updateOrgId && insertOrgId && updateOrgId !== insertOrgId) {
          throw new Error(`Conflicting organization identifiers between update payload ('${updateOrgId}') and $setOnInsert payload ('${insertOrgId}') in SubscriptionRepository`);
        }

        const targetOrgId = filterOrgId || updateOrgId || insertOrgId || null;

        const filterId = this.normalizeId(filter?._id || filter?.id);
        const updateId = this.normalizeId(updatePayload?._id || updatePayload?.id);
        if (filterId && updateId && filterId !== updateId) {
          throw new Error(`Conflicting id between filter ('${filterId}') and update payload ('${updateId}') in SubscriptionRepository`);
        }

        const targetId = filterId || updateId || null;

        if (options.upsert) {
          if (!targetOrgId && !targetId) {
            throw new Error("SubscriptionRepository upsert requires organization or id in filter");
          }

          const createData = {
            id: targetId || generateId(),
            organizationId: targetOrgId,
            plan: updateData.plan || setOnInsertPayload.plan || "standard",
            billingCycle: updateData.billingCycle || setOnInsertPayload.billingCycle || "monthly",
            status: updateData.status || setOnInsertPayload.status || "trial",
            stripeCustomerId: updateData.stripeCustomerId !== undefined ? updateData.stripeCustomerId : (setOnInsertPayload.stripeCustomerId || ""),
            stripeSubscriptionId: updateData.stripeSubscriptionId !== undefined ? updateData.stripeSubscriptionId : (setOnInsertPayload.stripeSubscriptionId || ""),
            stripePriceId: updateData.stripePriceId !== undefined ? updateData.stripePriceId : (setOnInsertPayload.stripePriceId || ""),
            quantity: updateData.quantity !== undefined ? updateData.quantity : (setOnInsertPayload.quantity !== undefined ? Number(setOnInsertPayload.quantity) : 1),
            startsAt: updateData.startsAt !== undefined ? updateData.startsAt : (setOnInsertPayload.startsAt ? new Date(setOnInsertPayload.startsAt) : new Date()),
            expiresAt: updateData.expiresAt !== undefined ? updateData.expiresAt : (setOnInsertPayload.expiresAt ? new Date(setOnInsertPayload.expiresAt) : null),
            trialEndsAt: updateData.trialEndsAt !== undefined ? updateData.trialEndsAt : (setOnInsertPayload.trialEndsAt ? new Date(setOnInsertPayload.trialEndsAt) : null),
            cancelledAt: updateData.cancelledAt !== undefined ? updateData.cancelledAt : (setOnInsertPayload.cancelledAt ? new Date(setOnInsertPayload.cancelledAt) : null),
          };

          const whereUnique = targetOrgId ? { organizationId: targetOrgId } : { id: targetId };

          // Atomic PostgreSQL native upsert: INSERT ... ON CONFLICT (organization_id) DO UPDATE
          const upserted = await this.delegate.upsert({
            where: whereUnique,
            update: updateData,
            create: createData,
          });
          return this.formatSubscription(upserted);
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
            return this.formatSubscription(updated);
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
            return this.formatSubscription(updated);
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
            return this.formatSubscription(existing);
          }
          const updated = await this.delegate.update({
            where: { id: existing.id },
            data: updateData,
          });
          return this.formatSubscription(updated);
        }
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOneAndUpdate(filter, update, options);
    return doc ? this.formatSubscription(doc) : null;
  }

  async findByIdAndUpdate(id, update, options = { new: true }) {
    const idStr = this.normalizeId(id);
    if (!idStr) {
      if (isPostgres()) {
        throw new Error("Invalid identifier in SubscriptionRepository.findByIdAndUpdate");
      }
      return null;
    }

    if (isPostgres()) {
      return this.findOneAndUpdate({ _id: idStr }, update, options);
    }

    const doc = await this.mongooseModel.findByIdAndUpdate(id, update, options);
    return doc ? this.formatSubscription(doc) : null;
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
      throw new Error("SubscriptionRepository.create requires a valid data object");
    }

    if (isPostgres()) {
      try {
        const organizationId = this.normalizeId(data.organization || data.organizationId);
        const newId = data._id ? this.normalizeId(data._id) : generateId();

        const createData = {
          id: newId,
          organizationId,
          plan: data.plan || "standard",
          billingCycle: data.billingCycle || "monthly",
          status: data.status || "trial",
          stripeCustomerId: data.stripeCustomerId || "",
          stripeSubscriptionId: data.stripeSubscriptionId || "",
          stripePriceId: data.stripePriceId || "",
          quantity: data.quantity !== undefined ? Number(data.quantity) : 1,
          startsAt: data.startsAt ? new Date(data.startsAt) : new Date(),
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          trialEndsAt: data.trialEndsAt ? new Date(data.trialEndsAt) : null,
          cancelledAt: data.cancelledAt ? new Date(data.cancelledAt) : null,
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatSubscription(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.create(data);
    return this.formatSubscription(doc);
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
        return doc ? this.formatSubscription(doc) : null;
      } catch (err) {
        if (err && err.code === "P2025") {
          return null;
        }
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findByIdAndDelete(idStr);
    return doc ? this.formatSubscription(doc) : null;
  }
}

export const subscriptionRepository = new SubscriptionRepository();
export default subscriptionRepository;
