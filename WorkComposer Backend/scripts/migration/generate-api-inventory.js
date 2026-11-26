import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "../../");

const routeMounts = [
  { prefix: "/api/auth", file: "src/routes/authRoutes.js" },
  { prefix: "/api/sessions", file: "src/routes/sessionRoutes.js" },
  { prefix: "/api/users", file: "src/routes/userRoutes.js" },
  { prefix: "/api/teams", file: "src/routes/teamRoutes.js" },
  { prefix: "/api/tasks", file: "src/routes/taskRoutes.js" },
  { prefix: "/api/projects", file: "src/routes/projectRoutes.js" },
  { prefix: "/api/timers", file: "src/routes/timerRoutes.js" },
  { prefix: "/api/screenshots", file: "src/routes/screenshotRoutes.js" },
  { prefix: "/api/activity", file: "src/routes/activityRoutes.js" },
  { prefix: "/api/usage", file: "src/routes/usageRoutes.js" },
  { prefix: "/api/attendance", file: "src/routes/attendanceRoutes.js" },
  { prefix: "/api/reports", file: "src/routes/reportRoutes.js" },
  { prefix: "/api/project-tracking", file: "src/routes/projectTrackingRoutes.js" },
  { prefix: "/api/settings", file: "src/routes/settingsRoutes.js" },
  { prefix: "/api/organization", file: "src/routes/organizationRoutes.js" },
  { prefix: "/api/auditLog", file: "src/routes/auditLogRoutes.js" },
  { prefix: "/api/roles", file: "src/routes/roleRoutes.js" },
  { prefix: "/api/integrations", file: "src/routes/integrationRoutes.js" },
  { prefix: "/api/sync", file: "src/routes/syncRoutes.js" },
  { prefix: "/api/api-keys", file: "src/routes/apiKeyRoutes.js" },
  { prefix: "/api/v1", file: "src/routes/api/apiRoutes.js" },
  { prefix: "/api/api-logs", file: "src/routes/apiLogRoutes.js" },
  { prefix: "/api/billing", file: "src/routes/billingRoutes.js" },
  { prefix: "/api/time-tracking", file: "src/routes/timeTrackingSettingsRoutes.js" },
  { prefix: "/api/screen-capture", file: "src/routes/screenCaptureRoutes.js" },
  { prefix: "/api/manual-time", file: "src/routes/manualTimeRoutes.js" },
  { prefix: "/api/shift", file: "src/routes/shiftRoutes.js" },
  { prefix: "/api/app-classifications", file: "src/routes/appClassificationRoutes.js" },
  { prefix: "/api/tasks", file: "src/routes/commentRoutes.js" },
  { prefix: "/api/locations", file: "src/routes/locationRoutes.js" },
  { prefix: "/api/manual-time-requests", file: "src/routes/manualTimeRequestRoutes.js" },
  { prefix: "/api/stripe/webhook", file: "src/routes/stripeWebhookRoutes.js" },
  { prefix: "/api/notifications", file: "src/routes/notificationRoutes.js" },
];

function classifyRoute(method, fullPath, middleware, controller) {
  const p = fullPath.toLowerCase();
  const c = (controller || "").toLowerCase();

  if (p.includes("webhook") || c.includes("webhook")) return "WEBHOOK";
  if (p.includes("/auth/login") || p.includes("/auth/register") || p.includes("/auth/refresh") || p.includes("/auth/logout") || p.includes("/auth/verify") || p.includes("/auth/reset-password") || p.includes("/auth/forgot-password") || p.includes("/auth/2fa")) {
    return "AUTHENTICATION";
  }
  if (p.includes("/sync") || p.includes("desktopsync")) return "DESKTOP_SYNC";
  if (p.includes("/integrations") || p.includes("/jira") || p.includes("/asana") || p.includes("/slack") || p.includes("/bamboohr") || p.includes("/keka")) {
    return "EXTERNAL_INTEGRATION";
  }
  if (middleware.some((m) => m.includes("permission") || m.includes("role") || m.includes("admin") || m.includes("owner") || m.includes("manager"))) {
    return "ADMIN/MANAGER";
  }
  if (!middleware.some((m) => m.includes("protect") || m.includes("auth") || m.includes("token"))) {
    if (method === "GET") return "PUBLIC_READ";
  }
  if (method === "GET") return "AUTHENTICATED_READ";
  return "AUTHENTICATED_WRITE";
}

function parseRoutesFromFile(mount) {
  const filePath = path.join(backendRoot, mount.file);
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const results = [];

  // Match router.get(...), router.post(...), etc.
  const regex = /router\.(get|post|put|delete|patch)\(\s*(["'`])([^"'`]+)\2\s*,([\s\S]*?)(?=\n\s*(?:router|\/\/|export|const router))/g;

  // More reliable line-by-line / block parser
  const routerCallRegex = /router\.(get|post|put|delete|patch)\(\s*(["'`])([^"'`]+)\2\s*,\s*([\s\S]*?)\);/g;
  let match;
  while ((match = routerCallRegex.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const subPath = match[3];
    const argsString = match[4].trim();

    // Split middleware and handler
    const tokens = argsString
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const controller = tokens[tokens.length - 1] || "inlineHandler";
    const middleware = tokens.slice(0, -1);

    const cleanSubPath = subPath === "/" ? "" : subPath;
    const fullPath = mount.prefix + cleanSubPath;

    // Detect route params
    const routeParams = (fullPath.match(/:[a-zA-Z0-9_]+/g) || []).map((p) => p.slice(1));

    // Guess domain models used from route prefix
    let domainModel = "Unknown";
    if (mount.prefix.includes("auth")) domainModel = "User";
    else if (mount.prefix.includes("sessions")) domainModel = "Session";
    else if (mount.prefix.includes("users")) domainModel = "User";
    else if (mount.prefix.includes("teams")) domainModel = "Team";
    else if (mount.prefix.includes("tasks")) domainModel = mount.file.includes("comment") ? "Comment" : "Task";
    else if (mount.prefix.includes("projects")) domainModel = "Project";
    else if (mount.prefix.includes("timers")) domainModel = "Timer";
    else if (mount.prefix.includes("screenshots")) domainModel = "Screenshot";
    else if (mount.prefix.includes("activity")) domainModel = "Activity";
    else if (mount.prefix.includes("usage")) domainModel = "AppUsage / UsageLog";
    else if (mount.prefix.includes("attendance")) domainModel = "Attendance";
    else if (mount.prefix.includes("reports")) domainModel = "Report";
    else if (mount.prefix.includes("project-tracking")) domainModel = "ProjectTracking";
    else if (mount.prefix.includes("settings") || mount.prefix.includes("time-tracking")) domainModel = "TimeTrackingSettings";
    else if (mount.prefix.includes("organization")) domainModel = "Organization";
    else if (mount.prefix.includes("auditLog")) domainModel = "AuditLog";
    else if (mount.prefix.includes("roles")) domainModel = "Role";
    else if (mount.prefix.includes("integrations")) domainModel = "Integration";
    else if (mount.prefix.includes("sync")) domainModel = "SyncStatus";
    else if (mount.prefix.includes("api-keys")) domainModel = "ApiKey";
    else if (mount.prefix.includes("api-logs")) domainModel = "ApiLog";
    else if (mount.prefix.includes("billing")) domainModel = "BillingProfile / Subscription / Invoice";
    else if (mount.prefix.includes("app-classifications")) domainModel = "AppClassification";
    else if (mount.prefix.includes("locations")) domainModel = "Location";
    else if (mount.prefix.includes("manual-time-requests")) domainModel = "ManualTimeRequest";
    else if (mount.prefix.includes("notifications")) domainModel = "Notification";

    const classification = classifyRoute(method, fullPath, middleware, controller);

    results.push({
      method,
      path: fullPath,
      file: mount.file,
      controller: controller.replace(/\(.*\)/, ""),
      middleware,
      authentication: middleware.some((m) => m.includes("protect") || m.includes("verify") || m.includes("auth")) ? "REQUIRED" : "OPTIONAL_OR_NONE",
      authorization: middleware.find((m) => m.includes("hasPermission") || m.includes("role") || m.includes("admin")) || "STANDARD_USER",
      routeParams,
      domainModel,
      operationType: method === "GET" ? "READ" : "WRITE",
      classification,
    });
  }

  return results;
}

function generateInventory() {
  console.log("Analyzing all Express routes...");
  const allRoutes = [];

  for (const mount of routeMounts) {
    const routes = parseRoutesFromFile(mount);
    allRoutes.push(...routes);
  }

  console.log(`Total unique route handlers identified: ${allRoutes.length}`);

  // Summary counts
  const classificationCounts = {};
  for (const r of allRoutes) {
    classificationCounts[r.classification] = (classificationCounts[r.classification] || 0) + 1;
  }

  const inventoryData = {
    generatedAt: new Date().toISOString(),
    totalRoutes: allRoutes.length,
    classificationSummary: classificationCounts,
    routes: allRoutes,
  };

  const jsonPath = path.join(__dirname, "phase5-api-inventory.json");
  fs.writeFileSync(jsonPath, JSON.stringify(inventoryData, null, 2));
  console.log(`Written JSON inventory to: ${jsonPath}`);

  // Generate Markdown report
  let md = `# Phase 5B — Express API Route & Contract Inventory

## 1. Executive Summary

* **Total API Route Endpoints Inventoried**: **${allRoutes.length}**
* **Total Route Modules Mounted**: **${routeMounts.length}**
* **Active Default Provider**: \`DATABASE_PROVIDER=mongo\` (Mongoose baseline)
* **PostgreSQL Target Provider**: \`workcomposer_staging\` (Prisma compatibility layer)

### Route Classification Summary

| Classification | Description | Count |
| :--- | :--- | :---: |
`;

  for (const [cls, count] of Object.entries(classificationCounts)) {
    md += `| **\`${cls}\`** | Routes classified under ${cls} | **${count}** |\n`;
  }

  md += `
---

## 2. Complete Route Inventory

| # | Method | Path | Classification | Auth | Authorization | Domain Model | Handler / Controller | Source File |
| :-: | :---: | :--- | :---: | :---: | :--- | :--- | :--- | :--- |
`;

  allRoutes.forEach((r, idx) => {
    md += `| ${idx + 1} | \`${r.method}\` | \`${r.path}\` | \`${r.classification}\` | ${r.authentication} | ${r.authorization} | ${r.domainModel} | \`${r.controller}\` | [${path.basename(r.file)}](file:///${r.file.replace(/\\/g, "/")}) |\n`;
  });

  md += `
---

## 3. Representative Endpoints Selected for Dual-Provider Testing

The compatibility test suite exercises representative routes from each domain area against both MongoDB (production reference) and PostgreSQL staging (\`workcomposer_staging\`):

1. **Authentication & Identity**:
   * \`POST /api/auth/login\`
   * \`GET /api/auth/me\`
   * \`POST /api/auth/refresh\`
   * \`POST /api/auth/logout\`
2. **Organizations & Teams**:
   * \`GET /api/organization\`
   * \`GET /api/teams\`
   * \`GET /api/roles\`
3. **Users & Profiles**:
   * \`GET /api/users\`
   * \`GET /api/users/:id\`
4. **Work Management**:
   * \`GET /api/projects\`
   * \`GET /api/tasks\`
   * \`GET /api/tasks/:taskId/comments\`
5. **Time Tracking & Attendance**:
   * \`GET /api/sessions\`
   * \`GET /api/attendance\`
   * \`GET /api/timers/active\`
   * \`GET /api/project-tracking\`
   * \`GET /api/manual-time-requests\`
6. **Reports & Analytics**:
   * \`GET /api/reports/daily-summary\`
   * \`GET /api/reports/weekly-summary\`
   * \`GET /api/reports\`
7. **Telemetry & Activity**:
   * \`GET /api/screenshots\`
   * \`GET /api/activity\`
   * \`GET /api/usage\`
   * \`GET /api/locations\`
8. **Platform & Integrations**:
   * \`GET /api/notifications\`
   * \`GET /api/auditLog\`
   * \`GET /api/api-keys\`
   * \`GET /api/billing/profile\`
   * \`GET /api/time-tracking\`
`;

  const mdPath = path.join(__dirname, "phase5-api-inventory.md");
  fs.writeFileSync(mdPath, md);
  console.log(`Written Markdown inventory to: ${mdPath}`);
}

generateInventory();
