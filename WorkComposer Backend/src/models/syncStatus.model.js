import mongoose from "mongoose";

const syncStatusSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      unique: true,
      required: true,
    },

    status: {
      type: String,
      enum: ["synced", "syncing", "offline"],
      default: "synced",
    },

    lastSync: {
      type: Date,
      default: Date.now,
    },

    pendingUploads: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);


import { createModelProxy } from "../db/modelProxy.js";
import { syncStatusRepository } from "../db/repositories/syncStatus.repository.js";

const _Model = mongoose.model("SyncStatus", syncStatusSchema);
export default createModelProxy(_Model, () => syncStatusRepository);
