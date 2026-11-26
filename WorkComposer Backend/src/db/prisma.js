import { PrismaClient } from "@prisma/client";
import { validatePostgresSafety } from "./index.js";

/**
 * Phase 5 — Singleton Prisma Client Provider
 * Guarantees a single, safe PrismaClient instance connected strictly to workcomposer_staging.
 */

let prismaInstance = null;

export function getPrismaClient() {
  if (!prismaInstance) {
    validatePostgresSafety();

    const isDebug = process.env.PRISMA_DEBUG === "true";
    prismaInstance = new PrismaClient({
      log: isDebug ? ["query", "info", "warn", "error"] : ["warn", "error"],
    });
  }

  return prismaInstance;
}

export async function connectPrisma() {
  const client = getPrismaClient();
  await client.$connect();
  return client;
}

export async function disconnectPrisma() {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
}

export default {
  getPrismaClient,
  connectPrisma,
  disconnectPrisma,
};
