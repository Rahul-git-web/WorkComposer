import fs from "fs";
import path from "path";

/**
 * Phase 5 Data Access Inventory Generator
 * Analyzes every Mongoose dependency and database access location in src/
 */

const MODEL_COLLECTIONS = {
  Organization: "organizations",
  Role: "roles",
  Team: "teams",
  User: "users",
  UserDevice: "user_devices",
  UserRefreshToken: "user_refresh_tokens",
  TimeTrackingSettings: "time_tracking_settings",
  BillingProfile: "billing_profiles",
  Subscription: "subscriptions",
  PaymentMethod: "payment_methods",
  Invoice: "invoices",
  ApiKey: "api_keys",
  Integration: "integrations",
  AppClassification: "app_classifications",
  Project: "projects",
  ProjectUser: "project_users",
  Task: "tasks",
  Comment: "comments",
  Session: "sessions",
  Attendance: "attendances",
  Timer: "timers",
  ProjectTracking: "project_trackings",
  ManualTimeRequest: "manual_time_requests",
  Screenshot: "screenshots",
  Activity: "activities",
  AppUsage: "app_usages",
  UsageLog: "usage_logs",
  Location: "locations",
  Notification: "notifications",
  AuditLog: "audit_logs",
  ApiLog: "api_logs",
  Report: "reports",
  Invite: "invites",
  SyncStatus: "sync_statuses",
  EmailChange: "email_changes",
};

const READ_OPERATIONS = new Set([
  "find",
  "findOne",
  "findById",
  "countDocuments",
  "aggregate",
  "exists",
  "distinct",
]);

const WRITE_OPERATIONS = new Set([
  "create",
  "insertMany",
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "findByIdAndUpdate",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
  "findByIdAndDelete",
  "bulkWrite",
  "save",
]);

function getAllFiles(dir, ext = ".js") {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(getAllFiles(fullPath, ext));
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      files.push(fullPath);
    }
  }
  return files;
}

function findEnclosingFunction(lines, targetLineIdx) {
  for (let i = targetLineIdx; i >= 0; i--) {
    const line = lines[i];
    // Pattern 1: export const funcName = async (...) =>
    let match = line.match(/(?:export\s+)?(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\(/);
    if (match) return match[1];

    // Pattern 2: async function funcName(...) or function funcName(...)
    match = line.match(/(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(/);
    if (match) return match[1];

    // Pattern 3: funcName: async (...) => or funcName(...) {
    match = line.match(/([a-zA-Z0-9_$]+)\s*:\s*(?:async\s*)?\(/);
    if (match) return match[1];

    match = line.match(/(?:async\s+)?([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*\{/);
    if (match && !["if", "for", "while", "switch", "catch"].includes(match[1])) {
      return match[1];
    }
  }
  return "top-level / anonymous";
}

function getFunctionBody(lines, startLineIdx) {
  let depth = 0;
  let started = false;
  let bodyLines = [];
  for (let i = startLineIdx; i < lines.length && i < startLineIdx + 150; i++) {
    const l = lines[i];
    bodyLines.push(l);
    for (const char of l) {
      if (char === "{") {
        depth++;
        started = true;
      } else if (char === "}") {
        depth--;
      }
    }
    if (started && depth <= 0) break;
  }
  return bodyLines.join("\n");
}

export function generateInventory() {
  const srcDir = path.resolve(process.cwd(), "src");
  const allFiles = getAllFiles(srcDir);

  const inventory = [];
  const modelImportMap = {};

  // Build model name map from src/models
  const modelFiles = fs.readdirSync(path.join(srcDir, "models"));
  const validModels = new Set();
  for (const mf of modelFiles) {
    if (mf.endsWith(".model.js")) {
      const base = mf.replace(".model.js", "");
      const pascal = base.charAt(0).toUpperCase() + base.slice(1);
      validModels.add(pascal);
    }
  }

  for (const filePath of allFiles) {
    const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
    // Skip the models directory itself from access locations
    if (relPath.includes("src/models/")) continue;

    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    // 1. Map imported models in this file
    const fileModels = {};
    for (const line of lines) {
      // import User from "../models/user.model.js"
      const importMatch = line.match(/import\s+([a-zA-Z0-9_$]+)\s+from\s+['"][^'"]*\/models\/([a-zA-Z0-9_$]+)\.model\.js['"]/);
      if (importMatch) {
        const importedAs = importMatch[1];
        const rawModelName = importMatch[2];
        const pascalName = rawModelName.charAt(0).toUpperCase() + rawModelName.slice(1);
        fileModels[importedAs] = pascalName;
      }
    }

    // 2. Scan lines for database operations on imported models or direct mongoose calls
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Look for Model.op(
      for (const [varName, modelName] of Object.entries(fileModels)) {
        const regex = new RegExp(`\\b${varName}\\.([a-zA-Z0-9_$]+)\\s*\\(`, "g");
        let match;
        while ((match = regex.exec(line)) !== null) {
          const op = match[1];
          const isKnownOp = READ_OPERATIONS.has(op) || WRITE_OPERATIONS.has(op);
          if (!isKnownOp) continue;

          // Enclosing function & surrounding context
          const funcName = findEnclosingFunction(lines, i);
          const contextLines = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 12)).join("\n");
          const funcBody = getFunctionBody(lines, Math.max(0, i - 10));

          // Analyze operation features
          const isRead = READ_OPERATIONS.has(op);
          const isWrite = WRITE_OPERATIONS.has(op);
          const hasPopulate = contextLines.includes(".populate(");
          const hasLean = contextLines.includes(".lean(");
          const hasSelect = contextLines.includes(".select(");
          const hasSession =
            /\b(?:startSession|withTransaction|commitTransaction|abortTransaction)\b/.test(contextLines) ||
            /\b(?:mongoSession|session)\s*[:=]/.test(contextLines) ||
            /\{[^{}]*\b(?:mongoSession|session)\b[^{}]*\}/.test(contextLines);
          const isAggregate = op === "aggregate";
          const hasIdDependency = contextLines.includes("_id") || funcBody.includes("_id");
          const hasObjectIdConv = contextLines.includes("ObjectId(") || contextLines.includes("Types.ObjectId");

          // Extract populated fields if any
          const popFields = [];
          if (hasPopulate) {
            const popMatches = contextLines.matchAll(/\.populate\(\s*['"]([a-zA-Z0-9_$.]+)['"]/g);
            for (const pm of popMatches) {
              popFields.push(pm[1]);
            }
          }

          // Classify into Categories A - G
          const categories = [];
          if (["find", "findOne", "findById", "create", "insertMany", "updateOne", "deleteOne", "countDocuments", "exists", "distinct"].includes(op)) {
            categories.push("Category A (Simple CRUD)");
          }
          if (contextLines.includes("$in") || contextLines.includes("$nin") || contextLines.includes("$or") || contextLines.includes("$and") || contextLines.includes("$gte") || contextLines.includes("$lte") || contextLines.includes("$ne") || contextLines.includes("$regex")) {
            categories.push("Category B (Query Operators)");
          }
          if (hasPopulate) categories.push("Category C (Population / Joins)");
          if (isAggregate) categories.push("Category D (Aggregation)");
          if (hasSession) categories.push("Category E (Transactions)");
          if (contextLines.includes("$inc") || contextLines.includes("$push") || contextLines.includes("$pull") || contextLines.includes("$addToSet") || contextLines.includes("$set") || contextLines.includes("$unset")) {
            categories.push("Category F (Atomic Update Semantics)");
          }
          if (hasIdDependency || hasObjectIdConv) {
            categories.push("Category G (ObjectId-Specific Behavior)");
          }
          if (categories.length === 0) {
            categories.push("Category A (Simple CRUD)");
          }

          // Expected response shape
          let expectedShape = "Document | null";
          if (["find", "aggregate"].includes(op)) expectedShape = `Array<${modelName}>`;
          else if (op === "countDocuments") expectedShape = "number";
          else if (op === "exists") expectedShape = "boolean | { _id: string }";
          else if (op === "distinct") expectedShape = "Array<string>";
          else if (["updateOne", "updateMany", "deleteOne", "deleteMany"].includes(op)) expectedShape = "{ acknowledged: boolean, modifiedCount: number }";
          else if (op === "create" || op === "insertMany") expectedShape = op === "create" ? `${modelName} Document` : `Array<${modelName}>`;
          else if (["findOneAndUpdate", "findByIdAndUpdate", "findOneAndDelete", "findByIdAndDelete"].includes(op)) expectedShape = `${modelName} Document | null`;

          // Error handling in function
          let errorHandling = "Uncaught / Controller Wrapper";
          if (funcBody.includes("try {") && funcBody.includes("catch")) {
            const catchIdx = funcBody.indexOf("catch");
            const catchPart = funcBody.slice(catchIdx, catchIdx + 150);
            if (catchPart.includes("500")) errorHandling = "try/catch -> HTTP 500 JSON error";
            else if (catchPart.includes("400")) errorHandling = "try/catch -> HTTP 400 JSON error";
            else if (catchPart.includes("404")) errorHandling = "try/catch -> HTTP 404 JSON error";
            else if (catchPart.includes("next(error)")) errorHandling = "try/catch -> next(error) Express middleware";
            else errorHandling = "try/catch -> JSON error response";
          }

          inventory.push({
            file: relPath,
            line: lineNum,
            function: funcName,
            model: modelName,
            collection: MODEL_COLLECTIONS[modelName] || modelName.toLowerCase() + "s",
            operation: op,
            type: isRead ? "READ" : isWrite ? "WRITE" : "OTHER",
            categories,
            transactionUsage: hasSession,
            populateUsage: hasPopulate ? popFields : false,
            aggregationUsage: isAggregate,
            leanUsage: hasLean,
            selectUsage: hasSelect,
            expectedResponseShape: expectedShape,
            _idDependency: hasIdDependency,
            objectIdConversion: hasObjectIdConv,
            arrayBehavior: contextLines.includes("$push")
              ? "Array append ($push)"
              : contextLines.includes("$pull")
              ? "Array remove ($pull)"
              : contextLines.includes("$addToSet")
              ? "Array unique add ($addToSet)"
              : contextLines.includes("$in")
              ? "Array containment ($in)"
              : "Standard field mapping",
            jsonBehavior: modelName === "AuditLog" || modelName === "Activity" || modelName === "UsageLog"
              ? "Arbitrary nested metadata JSON"
              : "Structured document attributes",
            dateBehavior: contextLines.includes("Date") || contextLines.includes("createdAt") || contextLines.includes("$gte") || contextLines.includes("$lte")
              ? "Timestamp millisecond range / sort"
              : "Standard timestamp tracking",
            nullUndefinedBehavior: "Preserve null vs undefined vs empty string semantics",
            currentErrorBehavior: errorHandling,
            codeSnippet: line.trim(),
          });
        }
      }

      // Also detect direct mongoose.Types.ObjectId or mongoose.startSession
      if (line.includes("mongoose.Types.ObjectId") || line.includes("Types.ObjectId") || line.includes("new ObjectId")) {
        const funcName = findEnclosingFunction(lines, i);
        // Avoid duplicate logging if already on model call line
        if (!Object.keys(fileModels).some(m => line.includes(`${m}.`))) {
          inventory.push({
            file: relPath,
            line: lineNum,
            function: funcName,
            model: "Mongoose / Utility",
            collection: "N/A",
            operation: "Types.ObjectId",
            type: "UTILITY",
            categories: ["Category G (ObjectId-Specific Behavior)"],
            transactionUsage: false,
            populateUsage: false,
            aggregationUsage: false,
            leanUsage: false,
            selectUsage: false,
            expectedResponseShape: "BSON ObjectId string / instance",
            _idDependency: true,
            objectIdConversion: true,
            arrayBehavior: "N/A",
            jsonBehavior: "N/A",
            dateBehavior: "N/A",
            nullUndefinedBehavior: "N/A",
            currentErrorBehavior: "N/A",
            codeSnippet: line.trim(),
          });
        }
      }

      // Direct startSession or withTransaction
      if (line.includes("startSession(") || line.includes("withTransaction(")) {
        const funcName = findEnclosingFunction(lines, i);
        inventory.push({
          file: relPath,
          line: lineNum,
          function: funcName,
          model: "Mongoose / Session",
          collection: "N/A",
          operation: line.includes("startSession") ? "startSession" : "withTransaction",
          type: "TRANSACTION",
          categories: ["Category E (Transactions)"],
          transactionUsage: true,
          populateUsage: false,
          aggregationUsage: false,
          leanUsage: false,
          selectUsage: false,
          expectedResponseShape: "ClientSession",
          _idDependency: false,
          objectIdConversion: false,
          arrayBehavior: "N/A",
          jsonBehavior: "N/A",
          dateBehavior: "N/A",
          nullUndefinedBehavior: "N/A",
          currentErrorBehavior: "Transaction abort / commit error",
          codeSnippet: line.trim(),
        });
      }
    }
  }

  // Summary Metrics
  const summary = {
    totalAccessSites: inventory.length,
    reads: inventory.filter(i => i.type === "READ").length,
    writes: inventory.filter(i => i.type === "WRITE").length,
    utilities: inventory.filter(i => i.type === "UTILITY" || i.type === "TRANSACTION").length,
    transactions: inventory.filter(i => i.transactionUsage).length,
    aggregations: inventory.filter(i => i.aggregationUsage).length,
    populateSites: inventory.filter(i => i.populateUsage).length,
    _idDependencies: inventory.filter(i => i._idDependency).length,
    byModel: {},
    byCategory: {
      "Category A (Simple CRUD)": 0,
      "Category B (Query Operators)": 0,
      "Category C (Population / Joins)": 0,
      "Category D (Aggregation)": 0,
      "Category E (Transactions)": 0,
      "Category F (Atomic Update Semantics)": 0,
      "Category G (ObjectId-Specific Behavior)": 0,
    },
    byDirectory: {},
  };

  for (const item of inventory) {
    // by model
    summary.byModel[item.model] = (summary.byModel[item.model] || 0) + 1;

    // by category
    for (const cat of item.categories) {
      if (summary.byCategory[cat] !== undefined) {
        summary.byCategory[cat]++;
      }
    }

    // by directory
    const dir = item.file.split("/")[1] || "root";
    summary.byDirectory[dir] = (summary.byDirectory[dir] || 0) + 1;
  }

  const outputData = {
    metadata: {
      generatedAt: new Date().toISOString(),
      sourcePath: "WorkComposer Backend/src",
      phase: "Phase 5 — PostgreSQL Application Compatibility Layer",
      objective: "Inventory every Mongoose dependency and database access site across controllers, services, middleware, routes, cron, jobs, socket, and utils.",
    },
    summary,
    inventory,
  };

  // 1. Write JSON report
  const jsonPath = path.resolve(process.cwd(), "scripts/migration/phase5-data-access-inventory.json");
  fs.writeFileSync(jsonPath, JSON.stringify(outputData, null, 2), "utf8");
  console.log(`Generated JSON inventory at ${jsonPath} (${inventory.length} records)`);

  // 2. Write Markdown report
  const mdPath = path.resolve(process.cwd(), "scripts/migration/phase5-data-access-inventory.md");
  const mdContent = generateMarkdownReport(outputData);
  fs.writeFileSync(mdPath, mdContent, "utf8");
  console.log(`Generated Markdown report at ${mdPath}`);

  return outputData;
}

function generateMarkdownReport(data) {
  const { summary, inventory } = data;

  let md = `# Phase 5 — Mongoose Data Access Inventory Report\n\n`;
  md += `## Executive Summary\n\n`;
  md += `* **Total Data Access Sites Audited**: **${summary.totalAccessSites}**\n`;
  md += `* **Read Operations**: **${summary.reads}**\n`;
  md += `* **Write Operations**: **${summary.writes}**\n`;
  md += `* **Explicit Transactions / Sessions**: **${summary.transactions}**\n`;
  md += `* **Aggregation Pipelines (\`.aggregate()\`)**: **${summary.aggregations}**\n`;
  md += `* **Relation Population (\`.populate()\`)**: **${summary.populateSites}**\n`;
  md += `* **ObjectId / \`_id\` Dependencies**: **${summary._idDependencies}**\n\n`;

  md += `### Category Breakdown\n\n`;
  md += `| Category | Description | Access Sites Count |\n`;
  md += `| :--- | :--- | :---: |\n`;
  for (const [cat, count] of Object.entries(summary.byCategory)) {
    md += `| **${cat}** | ${getCategoryDesc(cat)} | **${count}** |\n`;
  }
  md += `\n`;

  md += `### Data Access Distribution by Directory\n\n`;
  md += `| Directory | Access Sites Count | Primary Role |\n`;
  md += `| :--- | :---: | :--- |\n`;
  for (const [dir, count] of Object.entries(summary.byDirectory)) {
    md += `| \`src/${dir}\` | **${count}** | ${getDirRole(dir)} |\n`;
  }
  md += `\n`;

  md += `### Data Access Distribution by Model\n\n`;
  md += `| Model | Access Sites Count | Target Collection / Table |\n`;
  md += `| :--- | :---: | :--- |\n`;
  const sortedModels = Object.entries(summary.byModel).sort((a, b) => b[1] - a[1]);
  for (const [m, count] of sortedModels) {
    md += `| **${m}** | ${count} | \`${MODEL_COLLECTIONS[m] || m.toLowerCase() + "s"}\` |\n`;
  }
  md += `\n---\n\n`;

  md += `## Complete Data Access Inventory (Classified Sites)\n\n`;
  md += `| # | File | Line | Function | Model | Operation | Type | Categories | _id Dep | Populate | Expected Shape |\n`;
  md += `| :---: | :--- | :---: | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |\n`;

  inventory.forEach((item, idx) => {
    const pop = item.populateUsage ? (Array.isArray(item.populateUsage) ? item.populateUsage.join(", ") : "Yes") : "-";
    const cats = item.categories.map(c => c.split(" ")[1]).join(", ");
    md += `| ${idx + 1} | [\`${item.file}\`](file:///${item.file}#L${item.line}) | ${item.line} | \`${item.function}\` | **${item.model}** | \`${item.operation}\` | \`${item.type}\` | ${cats} | ${item._idDependency ? "Yes" : "-"} | ${pop} | \`${item.expectedResponseShape}\` |\n`;
  });

  return md;
}

function getCategoryDesc(cat) {
  if (cat.includes("Category A")) return "Simple CRUD (find, findById, create, updateOne, count, etc.)";
  if (cat.includes("Category B")) return "Query Operators ($in, $or, $and, $gte, $lte, $regex, etc.)";
  if (cat.includes("Category C")) return "Relation Population (.populate())";
  if (cat.includes("Category D")) return "Aggregation Pipelines (.aggregate())";
  if (cat.includes("Category E")) return "Transactions (.startSession(), .withTransaction())";
  if (cat.includes("Category F")) return "Atomic Update Semantics ($inc, $push, $pull, $addToSet, etc.)";
  if (cat.includes("Category G")) return "ObjectId-specific behavior (_id, Types.ObjectId)";
  return "";
}

function getDirRole(dir) {
  switch (dir) {
    case "controllers": return "HTTP request handling, input validation, and JSON API response formatting";
    case "services": return "Core business logic, external integrations, and domain operations";
    case "middleware": return "Authentication, authorization, and request pre-processing";
    case "routes": return "Route declarations and parameter validation";
    case "cron": return "Scheduled background jobs and batch maintenance";
    case "jobs": return "Asynchronous queue workers and telemetry processing";
    case "socket": return "Real-time bidirectional event handling";
    case "utils": return "Shared helpers, audit logging, and avatar utilities";
    case "config": return "Database connections, environment configuration, and passport";
    default: return "Application support";
  }
}

// Auto-run if executed directly
if (process.argv[1] && process.argv[1].endsWith("generate-inventory.js")) {
  generateInventory();
}
