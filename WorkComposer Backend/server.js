import dotenv from "dotenv";
import { startSyncJobs } from "./src/jobs/sync.job.js";
import { startDailySummaryScheduler } from "./src/services/dailySummary.scheduler.js";
import { startWeeklySummaryScheduler } from "./src/services/weeklySummary.scheduler.js";
import { startTrackingNotificationScheduler } from "./src/services/trackingNotification.scheduler.js";
import "./src/cron/emailReports.cron.js";

dotenv.config();

import http from "http";

import { initSocket } from "./src/socket/socket.js";

import "./src/config/env.js";
import app from "./src/app.js";
import connectDB from "./src/config/db.js";
import mongoose from "mongoose";
import { isPostgres } from "./src/db/index.js";
import { disconnectPrisma } from "./src/db/prisma.js";

connectDB();

const server = http.createServer(app);

initSocket(server);

const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);

  // Start both Jira & BambooHR cron sync jobs
  startSyncJobs();

  startDailySummaryScheduler();
  startWeeklySummaryScheduler();
  startTrackingNotificationScheduler();
});

const gracefulShutdown = async (signal) => {
  console.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    console.info("HTTP server closed.");
    try {
      if (isPostgres()) {
        await disconnectPrisma();
        console.info("Prisma disconnected.");
      } else {
        await mongoose.disconnect();
        console.info("Mongoose disconnected.");
      }
    } catch (err) {
      console.error("Error during database disconnect:", err);
    }
    process.exit(0);
  });
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
