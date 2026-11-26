import mongoose from "mongoose";
import dns from "dns";
import { getProvider, isPostgres, validatePostgresSafety } from "../db/index.js";
import { getPrismaClient } from "../db/prisma.js";

dns.setDefaultResultOrder("ipv4first");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

if (isPostgres()) {
  mongoose.startSession = async () => ({
    startTransaction: () => {},
    commitTransaction: async () => {},
    abortTransaction: async () => {},
    endSession: () => {},
    inTransaction: () => false,
  });
}

const connectDB = async () => {
  const provider = getProvider();

  if (isPostgres()) {
    validatePostgresSafety();
    try {
      const prisma = getPrismaClient();
      await prisma.$queryRaw`SELECT 1`;
      console.info("PostgreSQL staging connected (Prisma compatibility layer)");
      return;
    } catch (err) {
      console.error("PostgreSQL staging connection failed:", err.message);
      process.exit(1);
    }
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      family: 4,
    });

    console.info("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  }
};

export default connectDB;