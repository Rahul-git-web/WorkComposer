/**
 * Phase 5 — Database Error Translation Boundary
 *
 * Translates Prisma errors into Mongoose-compatible error contracts so existing
 * controllers and error handlers continue receiving expected codes, status, and messages.
 */

export class DatabaseError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = options.name || "DatabaseError";
    this.code = options.code || null;
    this.status = options.status || 500;
    this.statusCode = options.statusCode || this.status;
    this.keyValue = options.keyValue || null;
    this.originalError = options.originalError || null;
  }
}

/**
 * Translates any Prisma or database error into an application-compatible error.
 */
export function translateDbError(err) {
  if (!err) return err;

  // 1. Prisma Unique Constraint Violation (P2002 -> Mongo 11000)
  if (err.code === "P2002") {
    const targetFields = Array.isArray(err.meta?.target) ? err.meta.target.join(", ") : err.meta?.target || "field";
    return new DuplicateKeyError(
      `E11000 duplicate key error collection: duplicate value for ${targetFields}`,
      {
        keyValue: { [targetFields]: "duplicate" },
        originalError: err,
      }
    );
  }

  // 2. Prisma Record to Update / Delete Not Found (P2025 -> 404)
  if (err.code === "P2025") {
    return new NotFoundError(
      err.meta?.cause || "Record not found",
      {
        originalError: err,
      }
    );
  }

  // 3. Prisma Foreign Key Constraint Violation (P2003 -> 400)
  if (err.code === "P2003") {
    const fieldName = err.meta?.field_name || "foreign_key";
    return new ForeignKeyError(
      `Foreign key constraint failed on the field: ${fieldName}`,
      {
        originalError: err,
      }
    );
  }

  return err;
}

export class DuplicateKeyError extends DatabaseError {
  constructor(message, options = {}) {
    super(message, { name: "MongoServerError", code: 11000, status: 400, statusCode: 409, ...options });
  }
}

export class NotFoundError extends DatabaseError {
  constructor(message, options = {}) {
    super(message, { name: "NotFoundError", code: "RECORD_NOT_FOUND", status: 404, statusCode: 404, ...options });
  }
}

export class ForeignKeyError extends DatabaseError {
  constructor(message, options = {}) {
    super(message, { name: "ValidationError", code: "FOREIGN_KEY_VIOLATION", status: 400, statusCode: 400, ...options });
  }
}

export const translatePrismaError = translateDbError;

/**
 * Determines whether an error represents a genuine unique constraint or duplicate-key conflict
 * across Prisma and MongoDB database providers.
 *
 * Handles:
 * - Prisma unique constraint error: code === 'P2002'
 * - MongoDB duplicate-key errors: code === 11000 or code === 11001
 * - Wrapped or translated errors where originalError contains P2002, 11000, or 11001
 *
 * Rejects:
 * - Unrelated MongoServerError instances (e.g. code 50 timeout, code 13 auth, code 121 validation)
 * - Generic database or network errors
 *
 * @param {Error|Object} err - The error to evaluate
 * @returns {boolean}
 */
export function isDuplicateKeyError(err) {
  if (!err || typeof err !== "object") return false;

  // Direct Prisma unique constraint conflict
  if (err.code === "P2002") return true;

  // Wrapped Prisma unique constraint error
  if (err.originalError?.code === "P2002") return true;

  // MongoDB duplicate key error codes (11000: duplicate key, 11001: duplicate key on update)
  const code = err.code ?? err.originalError?.code;
  if (code === 11000 || code === 11001 || code === "11000" || code === "11001") {
    return true;
  }

  return false;
}

export default {
  DatabaseError,
  DuplicateKeyError,
  NotFoundError,
  ForeignKeyError,
  translateDbError,
  translatePrismaError,
  isDuplicateKeyError,
};
