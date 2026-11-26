import mongoose from "mongoose";

const appUsageSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    appName: {
      type: String,
      required: true,
    },

    windowTitle: {
      type: String,
      default: "",
    },

    duration: {
      type: Number,
      default: 0,
    },

    date: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);


import { createModelProxy } from "../db/modelProxy.js";
import { appUsageRepository } from "../db/repositories/appUsage.repository.js";

const _Model = mongoose.model("AppUsage", appUsageSchema);
export default createModelProxy(_Model, () => appUsageRepository);
