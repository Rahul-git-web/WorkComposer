import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
    },

    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
    },

    date: {
      type: String,
      required: true,
    },

    keyPresses: {
      type: Number,
      default: 0,
    },

    mouseClicks: {
      type: Number,
      default: 0,
    },

    mouseMoves: {
      type: Number,
      default: 0,
    },

    idempotencyKey: {
      type: String,
      unique: true,
      sparse: true,
    },

    eventTimestamp: {
      type: Date,
    },

    telemetry: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  },
);


import { createModelProxy } from "../db/modelProxy.js";
import { activityRepository } from "../db/repositories/activity.repository.js";

const _Model = mongoose.model("Activity", activitySchema);
export default createModelProxy(_Model, () => activityRepository);
