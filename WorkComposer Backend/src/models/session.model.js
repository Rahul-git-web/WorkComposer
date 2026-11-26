import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    startTime: Date,
    endTime: Date,
    duration: Number,
    screenshots: Number,
    date: String,
    team: {
      type: String,
      default: "Default team",
    },
    type: {
      type: String,
      enum: ["work", "break"],
      default: "work",
    },
    source: {
      type: String,
      enum: ["tracking", "manual"],
      default: "tracking",
    },
  },
  { timestamps: true },
);


import { createModelProxy } from "../db/modelProxy.js";
import { sessionRepository } from "../db/repositories/session.repository.js";

const _Model = mongoose.model("Session", sessionSchema);
export default createModelProxy(_Model, () => sessionRepository);
