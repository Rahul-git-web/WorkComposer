import mongoose from "mongoose";

const invoiceSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },

    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    currency: {
      type: String,
      default: "USD",
    },

    status: {
      type: String,
      enum: ["paid", "pending", "failed", "refunded"],
      default: "pending",
    },

    billingPeriodStart: {
      type: Date,
    },

    billingPeriodEnd: {
      type: Date,
    },

    issuedAt: {
      type: Date,
      default: Date.now,
    },

    paidAt: {
      type: Date,
    },

    pdfUrl: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);


import { createModelProxy } from "../db/modelProxy.js";
import { invoiceRepository } from "../db/repositories/invoice.repository.js";

const _Model = mongoose.model("Invoice", invoiceSchema);
export default createModelProxy(_Model, () => invoiceRepository);
