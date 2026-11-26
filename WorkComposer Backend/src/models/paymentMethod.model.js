import mongoose from "mongoose";

const paymentMethodSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      unique: true,
    },

    brand: {
      type: String,
      default: "",
    },

    last4: {
      type: String,
      default: "",
    },

    expiryMonth: {
      type: Number,
    },

    expiryYear: {
      type: Number,
    },

    cardholderName: {
      type: String,
      default: "",
    },

    isDefault: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);


import { createModelProxy } from "../db/modelProxy.js";
import { paymentMethodRepository } from "../db/repositories/paymentMethod.repository.js";

const _Model = mongoose.model("PaymentMethod", paymentMethodSchema);
export default createModelProxy(_Model, () => paymentMethodRepository);
