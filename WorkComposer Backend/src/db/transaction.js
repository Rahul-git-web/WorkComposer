import { AsyncLocalStorage } from "node:async_hooks";
import mongoose from "mongoose";
import { isMongo, isPostgres } from "./index.js";
import { getPrismaClient } from "./prisma.js";
import { translateDbError } from "./errors.js";

/**
 * Phase 5 & SEC-20A — Transaction Manager
 *
 * Provides a unified `runTransaction(callback, options)` abstraction that transparently executes
 * inside a Mongoose ClientSession or Prisma $transaction depending on the active provider.
 *
 * Uses AsyncLocalStorage to expose the ambient transaction client to BaseRepository
 * without requiring explicit parameter threading through all repository methods.
 */

const transactionStorage = new AsyncLocalStorage();

/**
 * Returns the active ambient transaction client if currently executing within
 * a runTransaction callback, or null otherwise.
 *
 * @returns {import('@prisma/client').Prisma.TransactionClient | import('mongoose').ClientSession | null}
 */
export function getAmbientTransaction() {
  return transactionStorage.getStore() || null;
}

/**
 * Returns true if execution is currently inside an active transaction.
 *
 * @returns {boolean}
 */
export function isTransactionActive() {
  return Boolean(transactionStorage.getStore());
}

/**
 * Executes a callback within an atomic transaction.
 *
 * In PostgreSQL mode (Prisma):
 * - Uses prisma.$transaction interactive callback.
 * - Stores the transaction client in AsyncLocalStorage so all BaseRepository
 *   operations automatically bind to this transaction.
 * - Supports nested runTransaction calls by participating in the enclosing transaction.
 * - On exception, propagates the error and rolls back all database writes.
 *
 * In MongoDB mode:
 * - Uses mongoose.startSession and session.withTransaction.
 * - Stores the session in AsyncLocalStorage.
 * - Reuses ambient session if nested.
 *
 * @param {Function} callback - Async function receiving (txOrSession)
 * @param {Object} [options] - Optional transaction configuration (maxWait, timeout, isolationLevel)
 * @returns {Promise<*>} Result of the callback
 */
export async function runTransaction(callback, options = {}) {
  // Safe nested usage: if already inside an active transaction, participate in it.
  const ambient = transactionStorage.getStore();
  if (ambient) {
    return await callback(ambient);
  }

  if (isMongo()) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await transactionStorage.run(session, () => callback(session));
      });
      return result;
    } catch (err) {
      throw err;
    } finally {
      session.endSession();
    }
  }

  if (isPostgres()) {
    const prisma = getPrismaClient();
    const txOptions = {
      maxWait: options.maxWait ?? 5000,
      timeout: options.timeout ?? 15000,
      ...(options.isolationLevel ? { isolationLevel: options.isolationLevel } : {}),
    };

    try {
      return await prisma.$transaction(async (tx) => {
        return await transactionStorage.run(tx, () => callback(tx));
      }, txOptions);
    } catch (err) {
      throw translateDbError(err);
    }
  }

  throw new Error("Unable to run transaction: active database provider is neither mongo nor postgres.");
}

export default {
  runTransaction,
  getAmbientTransaction,
  isTransactionActive,
};
