import { PrismaClient } from "@prisma/client";
import { generateId } from "../utils/idGenerator.js";

// Global instance cache to prevent multiple client instances during hot-reloading
const globalForPrisma = globalThis;

/**
 * Base Prisma Client configured with PostgreSQL connection.
 */
export const basePrisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

/**
 * Extended Prisma Client providing:
 * 1. Automatic '_id = id' result extension for 100% Mongoose JSON compatibility
 * 2. Centralized 24-character hexadecimal BSON ObjectId generation on record creation
 */
export const prisma = basePrisma.$extends({
  result: {
    $allModels: {
      _id: {
        needs: { id: true },
        compute(record) {
          return record.id;
        },
      },
    },
  },
  query: {
    $allModels: {
      async create({ args, query }) {
        if (args.data && !args.data.id) {
          args.data.id = generateId();
        }
        return query(args);
      },
      async createMany({ args, query }) {
        if (Array.isArray(args.data)) {
          for (const item of args.data) {
            if (!item.id) {
              item.id = generateId();
            }
          }
        }
        return query(args);
      },
    },
  },
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = basePrisma;
}

export default prisma;
