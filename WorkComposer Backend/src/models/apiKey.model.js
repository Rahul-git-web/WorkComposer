import mongoose from "mongoose";

const apiKeySchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    keyHash: {
      type: String,
      required: true,
      unique: true,
    },

    keyPreview: {
      type: String,
      required: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    lastUsedAt: {
      type: Date,
      default: null,
    },

    lastUsedIp: {
      type: String,
      default: null,
    },

    revokedAt: {
      type: Date,
      default: null,
    },

    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);


import { createModelProxy } from "../db/modelProxy.js";
import { apiKeyRepository } from "../db/repositories/apiKey.repository.js";

const _Model = mongoose.model("ApiKey", apiKeySchema);
export default createModelProxy(_Model, () => apiKeyRepository);
