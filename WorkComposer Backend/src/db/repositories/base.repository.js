import mongoose from "mongoose";
import { serializeApiResponse } from "../../utils/serializeApiResponse.js";
import { getPrismaClient } from "../prisma.js";
import { translateDbError } from "../errors.js";
import { isMongo, isPostgres } from "../index.js";
import { getAmbientTransaction } from "../transaction.js";

/**
 * Base Repository Helper
 * Provides serialization, identifier translation, and error translation utilities
 * without imposing generic CRUD constraints on domain repositories.
 */
export class BaseRepository {
  constructor(modelName, mongooseModel = null) {
    this.modelName = modelName;
    this._mongooseModel = mongooseModel;
  }

  get mongooseModel() {
    return this._mongooseModel || (this.modelName && mongoose.models[this.modelName]) || null;
  }

  get prisma() {
    const ambient = isPostgres() && typeof getAmbientTransaction === "function" ? getAmbientTransaction() : null;
    return ambient || getPrismaClient();
  }

  get delegate() {
    if (!this.modelName) return null;
    const delegateName = this.modelName.charAt(0).toLowerCase() + this.modelName.slice(1);
    return this.prisma[delegateName];
  }

  /**
   * Serializes output to preserve MongoDB-compatible shape:
   * - Exposes '_id' matching 'id'
   * - Converts Prisma Decimals to primitive numbers
   * - Preserves Date objects, arrays, and JSON objects
   */
  serialize(data) {
    return serializeApiResponse(data);
  }

  /**
   * Translates an incoming ID (string, ObjectId, or object with id/_id) into a 24-hex string.
   */
  toIdString(val) {
    if (!val) return null;
    if (typeof val === "string") return val;
    if (val._id) return String(val._id);
    if (val.id) return String(val.id);
    return String(val);
  }

  /**
   * Catches and translates Prisma errors into application-compatible errors.
   */
  handleError(err) {
    throw translateDbError(err);
  }
}

export default BaseRepository;
