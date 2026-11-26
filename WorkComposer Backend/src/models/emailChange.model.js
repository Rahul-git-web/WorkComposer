import mongoose from "mongoose";

const emailChangeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    newEmail: {
      type: String,
      required: true,
    },

    token: {
      type: String,
      required: true,
    },

    expireAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);


import { createModelProxy } from "../db/modelProxy.js";
import { emailChangeRepository } from "../db/repositories/emailChange.repository.js";

const _Model = mongoose.model("EmailChange", emailChangeSchema);
export default createModelProxy(_Model, () => emailChangeRepository);
