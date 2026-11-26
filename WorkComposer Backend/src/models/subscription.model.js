import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      unique: true,
    },

    plan: {
      type: String,
      enum: ["standard", "premium", "enterprise"],
      default: "standard",
    },

    billingCycle: {
      type: String,
      enum: ["monthly", "annual"],
      default: "monthly",
    },

    status: {
      type: String,
      enum: ["active", "trial", "suspended", "cancelled"],
      default: "trial",
    },

    stripeCustomerId: {
      type: String,
      default: "",
    },

    stripeSubscriptionId: {
      type: String,
      default: "",
      unique: true,
      sparse: true,
    },

    stripePriceId: {
      type: String,
      default: "",
    },

    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },

    startsAt: {
      type: Date,
      default: Date.now,
    },

    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);


import { createModelProxy } from "../db/modelProxy.js";
import { subscriptionRepository } from "../db/repositories/subscription.repository.js";

const _Model = mongoose.model("Subscription", subscriptionSchema);
export default createModelProxy(_Model, () => subscriptionRepository);
