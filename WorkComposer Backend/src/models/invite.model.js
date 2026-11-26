import mongoose from "mongoose";

const inviteSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    role: {
      type: String,
      enum: ["owner", "admin", "manager", "user"],
      required: true,
    },

    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
    },

    token: {
      type: String,
      required: true,
      index: true,
    },

    expireAt: {
      type: Date,
      required: true,
    },

    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },

    isAccepted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);


import { createModelProxy } from "../db/modelProxy.js";
import { inviteRepository } from "../db/repositories/invite.repository.js";

const _Model = mongoose.model("Invite", inviteSchema);
export default createModelProxy(_Model, () => inviteRepository);
