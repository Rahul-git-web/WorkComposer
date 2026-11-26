import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: [
        "attendance-overview",
        "attendance-detailed",
        "productivity",
        "usage",
        "project-user",
        "project",

        // Time tracking reports
        "manual-work-time",
        "manual-break-time",
        "removed-time",
        "daily-work",
      ],
      required: true,
    },

    status: {
      type: String,
      enum: ["processing", "done", "failed"],
      default: "processing",
    },

    fileUrl: {
      type: String,
      default: "",
    },

    generatedAt: {
      type: Date,
      default: null,
    },

    startDate: {
      type: String,
      default: "",
    },

    endDate: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);


import { createModelProxy } from "../db/modelProxy.js";
import { reportRepository } from "../db/repositories/report.repository.js";

const _Model = mongoose.model("Report", reportSchema);
export default createModelProxy(_Model, () => reportRepository);
