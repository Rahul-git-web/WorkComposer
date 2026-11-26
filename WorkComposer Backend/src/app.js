import express from "express";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/authRoutes.js";
import sessionRoutes from "./routes/sessionRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import cors from "cors";
import teamRoutes from "./routes/teamRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import timerRoutes from "./routes/timerRoutes.js";
import screenshotRoutes from "./routes/screenshotRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import intelligenceRoutes from "./routes/intelligenceRoutes.js";
import usageRoutes from "./routes/usageRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import projectTrackingRoutes from "./routes/projectTrackingRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import organizationRoutes from "./routes/organizationRoutes.js";
import auditLogRoutes from "./routes/auditLogRoutes.js";
import roleRoutes from "./routes/roleRoutes.js";
import integrationRoutes from "./routes/integrationRoutes.js";
import syncRoutes from "./routes/syncRoutes.js";
import apiKeyRoutes from "./routes/apiKeyRoutes.js";
import apiRoutes from "./routes/api/apiRoutes.js";
import apiLogRoutes from "./routes/apiLogRoutes.js";
import billingRoutes from "./routes/billingRoutes.js";
import timeTrackingSettingsRoutes from "./routes/timeTrackingSettingsRoutes.js";
import screenCaptureRoutes from "./routes/screenCaptureRoutes.js";
import manualTimeRoutes from "./routes/manualTimeRoutes.js";
import shiftRoutes from "./routes/shiftRoutes.js";
import appClassificationRoutes from "./routes/appClassificationRoutes.js";
import commentRoutes from "./routes/commentRoutes.js";
import locationRoutes from "./routes/locationRoutes.js";
import manualTimeRequestRoutes from "./routes/manualTimeRequestRoutes.js";
import stripeWebhookRoutes from "./routes/stripeWebhookRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import testHarnessRoutes from "./routes/testHarnessRoutes.js";
import { csrfProtection } from "./middleware/csrf.middleware.js";
import { securityHeaders } from "./middleware/securityHeaders.middleware.js";
import { sanitizeErrorDetails } from "./utils/sendErrorResponse.js";

const app = express();

app.disable("x-powered-by");

app.set("trust proxy", 1);

app.use(securityHeaders);

app.use("/api/stripe/webhook", stripeWebhookRoutes);

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  }),
);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  express.urlencoded({
    extended: true,
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  }),
);

app.use("/uploads", fileRoutes);

// app.use(
//   cors({
//     origin: process.env.FRONTEND_URL,
//     credentials: true,
//   }),
// );

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without an Origin header
      // (Electron/main-process requests, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-CSRF-Token",
      "X-Client-Timezone",
      "Accept",
    ],
  }),
);

app.use(csrfProtection);

app.use("/api/auth", authRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/users", userRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/timers", timerRoutes);
app.use("/api/screenshots", screenshotRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/intelligence", intelligenceRoutes);
app.use("/api/usage", usageRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/project-tracking", projectTrackingRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/organization", organizationRoutes);
app.use("/api/auditLog", auditLogRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/api-keys", apiKeyRoutes);
app.use("/api/v1", apiRoutes);
app.use("/api/api-logs", apiLogRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/time-tracking", timeTrackingSettingsRoutes);
app.use("/api/screen-capture", screenCaptureRoutes);
app.use("/api/manual-time", manualTimeRoutes);
app.use("/api/shift", shiftRoutes);
app.use("/api/app-classifications", appClassificationRoutes);
app.use("/api/tasks", commentRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/manual-time-requests", manualTimeRequestRoutes);
app.use("/api/notifications", notificationRoutes);

// Test harness route: only mounted when explicitly enabled in non-production environments
if (
  process.env.NODE_ENV !== "production" &&
  process.env.ENABLE_TEST_HARNESS === "true"
) {
  app.use("/api/test-harness", testHarnessRoutes);
}

// 404 Fallback for unhandled API routes
app.use((req, res) => {
  return res.status(404).json({
    message: "Resource not found",
    error: "Resource not found",
  });
});

// Centralized Express 5 Error Handling Middleware
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  // Safe server-side diagnostic logging (sanitized, no secrets)
  const safeMsg = sanitizeErrorDetails(err);
  console.error(`[UnhandledError] ${safeMsg}`);

  // CORS origin rejection
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({
      message: "Not allowed by CORS",
      error: "Not allowed by CORS",
    });
  }

  // Body-parser / express.json malformed payload SyntaxError
  if (
    err instanceof SyntaxError &&
    (err.status === 400 || err.statusCode === 400) &&
    "body" in err
  ) {
    return res.status(400).json({
      message: "Malformed JSON payload",
      error: "Malformed JSON payload",
    });
  }

  const statusCode = err.status || err.statusCode || 500;
  return res.status(statusCode).json({
    message: "An unexpected error occurred",
    error: "An unexpected error occurred",
  });
});

export default app;
