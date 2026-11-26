import { BaseRepository } from "./base.repository.js";
import { isPostgres } from "../index.js";
import { generateId } from "../../utils/idGenerator.js";
import { Prisma } from "@prisma/client";

export class InvoiceRepository extends BaseRepository {
  constructor() {
    super("Invoice");
  }

  formatInvoice(doc) {
    if (!doc) return null;
    const serialized = this.serialize(doc.toObject ? doc.toObject() : doc);
    if (!serialized.id && serialized._id) serialized.id = String(serialized._id);
    if (!serialized._id && serialized.id) serialized._id = String(serialized.id);
    serialized.organization = serialized.organization || serialized.organizationId;
    if (serialized.amount !== undefined && typeof serialized.amount !== "number") {
      serialized.amount = Number(serialized.amount);
    }
    return serialized;
  }

  buildWhere(filter = {}) {
    const where = {};
    if (filter._id) where.id = this.toIdString(filter._id);
    if (filter.id) where.id = this.toIdString(filter.id);
    if (filter.organization) where.organizationId = this.toIdString(filter.organization);
    if (filter.organizationId) where.organizationId = this.toIdString(filter.organizationId);
    if (filter.invoiceNumber) where.invoiceNumber = filter.invoiceNumber;
    if (filter.status) where.status = filter.status;
    return where;
  }

  async find(filter = {}, options = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const queryOptions = { where };

        if (options.sort) {
          const [sortField, sortDir] = Object.entries(options.sort)[0] || ["issuedAt", -1];
          queryOptions.orderBy = { [sortField]: sortDir === -1 || sortDir === "desc" ? "desc" : "asc" };
        } else {
          queryOptions.orderBy = { issuedAt: "desc" };
        }
        if (options.limit) queryOptions.take = options.limit;
        if (options.skip) queryOptions.skip = options.skip;

        const docs = await this.delegate.findMany(queryOptions);
        return docs.map((d) => this.formatInvoice(d));
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

  async findOne(filter = {}) {
    if (isPostgres()) {
      try {
        const where = this.buildWhere(filter);
        const doc = await this.delegate.findFirst({ where });
        return doc ? this.formatInvoice(doc) : null;
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
        return doc ? this.formatInvoice(doc) : null;
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findById(id);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async create(data) {
    if (isPostgres()) {
      try {
        const organizationId = this.toIdString(data.organization || data.organizationId);
        const newId = data._id ? this.toIdString(data._id) : generateId();

        const createData = {
          id: newId,
          organizationId,
          invoiceNumber: data.invoiceNumber,
          amount: new Prisma.Decimal(data.amount != null && !isNaN(data.amount) ? data.amount : 0),
          currency: data.currency || "USD",
          status: data.status || "pending",
          billingPeriodStart: data.billingPeriodStart ? new Date(data.billingPeriodStart) : null,
          billingPeriodEnd: data.billingPeriodEnd ? new Date(data.billingPeriodEnd) : null,
          issuedAt: data.issuedAt ? new Date(data.issuedAt) : new Date(),
          paidAt: data.paidAt ? new Date(data.paidAt) : null,
          pdfUrl: data.pdfUrl || "",
        };

        const doc = await this.delegate.create({ data: createData });
        return this.formatInvoice(doc);
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.create(data);
    return this.serialize(doc.toObject ? doc.toObject() : doc);
  }

  async findOneAndUpdate(filter, update, options = {}) {
    if (isPostgres()) {
      if (options.new === false || options.returnDocument === "before") {
        throw new Error("InvoiceRepository.findOneAndUpdate does not support returnDocument: 'before' or new: false in PostgreSQL mode");
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

        for (const [k, v] of Object.entries(setPayload)) {
          if (k in directFields && directFields[k] !== v) {
            throw new Error(`Conflicting update values for field '${k}' in InvoiceRepository`);
          }
        }

        const updatePayload = { ...directFields, ...setPayload };

        const updateData = {};
        if (updatePayload.amount !== undefined) {
          updateData.amount = new Prisma.Decimal(updatePayload.amount != null && !isNaN(updatePayload.amount) ? updatePayload.amount : 0);
        }
        if (updatePayload.currency !== undefined) updateData.currency = String(updatePayload.currency || "USD");
        if (updatePayload.status !== undefined) updateData.status = updatePayload.status;
        if (updatePayload.billingPeriodStart !== undefined) updateData.billingPeriodStart = updatePayload.billingPeriodStart ? new Date(updatePayload.billingPeriodStart) : null;
        if (updatePayload.billingPeriodEnd !== undefined) updateData.billingPeriodEnd = updatePayload.billingPeriodEnd ? new Date(updatePayload.billingPeriodEnd) : null;
        if (updatePayload.issuedAt !== undefined) updateData.issuedAt = updatePayload.issuedAt ? new Date(updatePayload.issuedAt) : new Date();
        if (updatePayload.paidAt !== undefined) updateData.paidAt = updatePayload.paidAt ? new Date(updatePayload.paidAt) : null;
        if (updatePayload.pdfUrl !== undefined) updateData.pdfUrl = String(updatePayload.pdfUrl || "");

        const filterInvoiceNumber = filter?.invoiceNumber;
        const updateInvoiceNumber = updatePayload?.invoiceNumber;
        const insertInvoiceNumber = setOnInsertPayload?.invoiceNumber;
        const targetInvoiceNumber = filterInvoiceNumber || updateInvoiceNumber || insertInvoiceNumber;

        const filterId = this.toIdString(filter?._id || filter?.id);
        const updateId = this.toIdString(updatePayload?._id || updatePayload?.id);
        const insertId = this.toIdString(setOnInsertPayload?._id || setOnInsertPayload?.id);
        const targetId = filterId || updateId || insertId;

        const filterOrgId = this.toIdString(filter?.organization || filter?.organizationId);
        const updateOrgId = this.toIdString(updatePayload?.organization || updatePayload?.organizationId);
        const insertOrgId = this.toIdString(setOnInsertPayload?.organization || setOnInsertPayload?.organizationId);
        const targetOrgId = filterOrgId || updateOrgId || insertOrgId;

        if (options.upsert) {
          if (!targetInvoiceNumber && !targetId) {
            throw new Error("InvoiceRepository upsert requires invoiceNumber or id in filter");
          }

          const createData = {
            id: targetId || generateId(),
            organizationId: targetOrgId,
            invoiceNumber: targetInvoiceNumber,
            amount: updateData.amount !== undefined ? updateData.amount : new Prisma.Decimal(setOnInsertPayload.amount != null && !isNaN(setOnInsertPayload.amount) ? setOnInsertPayload.amount : 0),
            currency: updateData.currency !== undefined ? updateData.currency : (setOnInsertPayload.currency || "USD"),
            status: updateData.status !== undefined ? updateData.status : (setOnInsertPayload.status || "pending"),
            billingPeriodStart: updateData.billingPeriodStart !== undefined ? updateData.billingPeriodStart : (setOnInsertPayload.billingPeriodStart ? new Date(setOnInsertPayload.billingPeriodStart) : null),
            billingPeriodEnd: updateData.billingPeriodEnd !== undefined ? updateData.billingPeriodEnd : (setOnInsertPayload.billingPeriodEnd ? new Date(setOnInsertPayload.billingPeriodEnd) : null),
            issuedAt: updateData.issuedAt !== undefined ? updateData.issuedAt : (setOnInsertPayload.issuedAt ? new Date(setOnInsertPayload.issuedAt) : new Date()),
            paidAt: updateData.paidAt !== undefined ? updateData.paidAt : (setOnInsertPayload.paidAt ? new Date(setOnInsertPayload.paidAt) : null),
            pdfUrl: updateData.pdfUrl !== undefined ? updateData.pdfUrl : (setOnInsertPayload.pdfUrl || ""),
          };

          const whereUnique = targetInvoiceNumber ? { invoiceNumber: targetInvoiceNumber } : { id: targetId };

          const upserted = await this.delegate.upsert({
            where: whereUnique,
            update: updateData,
            create: createData,
          });
          return this.formatInvoice(upserted);
        }

        // Non-upsert
        if (targetInvoiceNumber) {
          if (Object.keys(updateData).length === 0) {
            return this.findOne({ invoiceNumber: targetInvoiceNumber });
          }
          try {
            const updated = await this.delegate.update({
              where: { invoiceNumber: targetInvoiceNumber },
              data: updateData,
            });
            return this.formatInvoice(updated);
          } catch (err) {
            if (err && err.code === "P2025") return null;
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
            return this.formatInvoice(updated);
          } catch (err) {
            if (err && err.code === "P2025") return null;
            this.handleError(err);
          }
        } else {
          const where = this.buildWhere(filter);
          const existing = await this.delegate.findFirst({ where });
          if (!existing) return null;
          if (Object.keys(updateData).length === 0) {
            return this.formatInvoice(existing);
          }
          const updated = await this.delegate.update({
            where: { id: existing.id },
            data: updateData,
          });
          return this.formatInvoice(updated);
        }
      } catch (err) {
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findOneAndUpdate(filter, update, options);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }

  async findByIdAndUpdate(id, update, options = { new: true }) {
    const idStr = this.toIdString(id);
    if (!idStr) {
      if (isPostgres()) {
        throw new Error("Invalid identifier in InvoiceRepository.findByIdAndUpdate");
      }
      return null;
    }

    if (isPostgres()) {
      return this.findOneAndUpdate({ _id: idStr }, update, options);
    }

    const doc = await this.mongooseModel.findByIdAndUpdate(id, update, options);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
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
    const idStr = this.toIdString(id);
    if (!idStr) return null;

    if (isPostgres()) {
      try {
        const existing = await this.delegate.findUnique({ where: { id: idStr } });
        if (!existing) return null;
        const doc = await this.delegate.delete({ where: { id: idStr } });
        return doc ? this.formatInvoice(doc) : null;
      } catch (err) {
        if (err && err.code === "P2025") return null;
        this.handleError(err);
      }
    }

    const doc = await this.mongooseModel.findByIdAndDelete(idStr);
    return doc ? this.serialize(doc.toObject ? doc.toObject() : doc) : null;
  }
}

export const invoiceRepository = new InvoiceRepository();
export default invoiceRepository;
