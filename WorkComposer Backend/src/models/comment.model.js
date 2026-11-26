import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    content: {
      type: String,
      required: true,
      trim: true,
    },

    edited: {
      type: Boolean,
      default: false,
    },

    readBy: [
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
],
  },
  {
    timestamps: true,
  },
);


import { createModelProxy } from "../db/modelProxy.js";
import { commentRepository } from "../db/repositories/comment.repository.js";

const _Model = mongoose.model("Comment", commentSchema);
export default createModelProxy(_Model, () => commentRepository);
