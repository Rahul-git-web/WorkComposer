export type CodeLanguage = "curl" | "javascript" | "node";

export type QuickStartStep = {
  step: number;
  title: string;
  description: string;
  note?: string;
};

export type SnippetGroup = {
  id: string;
  title: string;
  badge: string;
  description: string;
  code: Record<CodeLanguage, string>;
};

export type ApiParam = {
  name: string;
  location: "query" | "path" | "body" | "header";
  required?: boolean;
  description: string;
};

export type ApiEndpoint = {
  id: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  auth: "API Key (Bearer wc_...)" | "JWT Bearer / Session";
  permission?: string;
  summary: string;
  params?: ApiParam[];
  responseExample: string;
};

export type EndpointGroup = {
  id: string;
  title: string;
  badge: string;
  description: string;
  endpoints: ApiEndpoint[];
};

export type ExportEndpoint = {
  method: "GET" | "POST";
  path: string;
  format: string;
  description: string;
};

export type ApiErrorCode = {
  status: number;
  title: string;
  cause: string;
  sampleBody: string;
};

export const API_BASE_URLS = {
  local: "http://localhost:5000/api",
  envVar: "NEXT_PUBLIC_API_URL",
  v1Prefix: "/api/v1",
};

export const QUICKSTART_STEPS: QuickStartStep[] = [
  {
    step: 1,
    title: "Generate an Organization API Key",
    description:
      "Sign in as an Owner or user with `manage_settings`, open Dashboard → Settings → Account → API Access, and click Generate a New API Key. Copy the generated `wc_<64-hex>` secret immediately — only its SHA-256 hash and masked preview (`wc_xxxxx****************`) are retained.",
    note: "Keys inherit the creating user's organization tenant and role permissions.",
  },
  {
    step: 2,
    title: "Configure Your Base URL",
    description:
      "Send requests to your configured backend API origin (`NEXT_PUBLIC_API_URL`, defaulting locally to `http://localhost:5000/api`). Versioned API key endpoints live under `/api/v1/*`.",
  },
  {
    step: 3,
    title: "Authenticate With Bearer Authorization",
    description:
      "Include `Authorization: Bearer wc_<your-key>` on `/api/v1/*` requests. Backend `apiKeyAuth` middleware validates key activity, expiration, owner archive status, tenant isolation, and bypasses browser CSRF checks automatically.",
    note: "Routes outside `/api/v1` use JWT Bearer tokens (`/api/auth/login`) or HTTP-only session cookies with `X-CSRF-Token` on mutations.",
  },
  {
    step: 4,
    title: "Monitor Usage in API Logs",
    description:
      "Every request passing `apiKeyAuth` is recorded asynchronously by `apiLogger` with endpoint, HTTP method, status code, client IP, response time (ms), and throttled `lastUsedAt` tracking under Settings → Account → API Access → API Logs.",
  },
];

export const CODE_SNIPPETS: SnippetGroup[] = [
  {
    id: "v1-projects-snippet",
    title: "1. Fetch Projects via API Key (/api/v1/projects)",
    badge: "API Key · Bearer wc_...",
    description:
      "Recommended programmatic integration using a generated organization API key.",
    code: {
      curl: `curl -X GET "http://localhost:5000/api/v1/projects" \\
  -H "Authorization: Bearer wc_your_generated_api_key_here" \\
  -H "Accept: application/json"`,
      javascript: `const res = await fetch("http://localhost:5000/api/v1/projects", {
  method: "GET",
  headers: {
    Authorization: "Bearer wc_your_generated_api_key_here",
    Accept: "application/json",
  },
});

if (!res.ok) {
  throw new Error(\`HTTP \${res.status}: \${await res.text()}\`);
}

const payload = await res.json();
console.log(payload.data);`,
      node: `import axios from "axios";

const { data } = await axios.get("http://localhost:5000/api/v1/projects", {
  headers: {
    Authorization: \`Bearer \${process.env.WORKCOMPOSER_API_KEY}\`,
  },
  timeout: 15000,
});

console.log(data.data);`,
    },
  },
  {
    id: "jwt-attendance-snippet",
    title: "2. Query Attendance & Reports via JWT Bearer",
    badge: "JWT Bearer · Dashboard / Automation",
    description:
      "Use a JWT obtained from `/api/auth/login` to read attendance summaries, tasks, teams, or reports without browser CSRF cookies.",
    code: {
      curl: `curl -X GET "http://localhost:5000/api/attendance?startDate=2026-11-01&endDate=2026-11-27" \\
  -H "Authorization: Bearer <YOUR_JWT_ACCESS_TOKEN>" \\
  -H "Accept: application/json"`,
      javascript: `const params = new URLSearchParams({
  startDate: "2026-11-01",
  endDate: "2026-11-27",
  sortBy: "name",
  order: "asc",
});

const res = await fetch(\`http://localhost:5000/api/attendance?\${params}\`, {
  headers: {
    Authorization: \`Bearer \${jwtToken}\`,
  },
});

const attendance = await res.json();
console.log(attendance);`,
      node: `import axios from "axios";

const { data } = await axios.get("http://localhost:5000/api/attendance", {
  params: {
    startDate: "2026-11-01",
    endDate: "2026-11-27",
  },
  headers: {
    Authorization: \`Bearer \${process.env.WORKCOMPOSER_JWT}\`,
  },
});

console.log(data);`,
    },
  },
];

export const ENDPOINT_GROUPS: EndpointGroup[] = [
  {
    id: "api-v1",
    title: "API v1 (Organization API Key)",
    badge: "apiKeyAuth",
    description:
      "Endpoints under `/api/v1` authenticate strictly with `Authorization: Bearer wc_...` keys generated in API Access settings and log every call to `ApiLog`.",
    endpoints: [
      {
        id: "v1-get-projects",
        method: "GET",
        path: "/api/v1/projects",
        auth: "API Key (Bearer wc_...)",
        permission: "manage_settings",
        summary:
          "Returns all projects belonging to the API key's organization tenant (`_id`, `name`, `description`, `createdAt`, `updatedAt`).",
        params: [
          {
            name: "Authorization",
            location: "header",
            required: true,
            description: "Bearer token formatted as `Bearer wc_<64-hex>`.",
          },
        ],
        responseExample: `{
  "success": true,
  "data": [
    {
      "_id": "6740b9f2e1c4a90012ab3456",
      "name": "Core Web Platform",
      "description": "Primary product engineering workspace",
      "createdAt": "2026-10-12T08:30:00.000Z",
      "updatedAt": "2026-11-20T14:15:00.000Z"
    }
  ]
}`,
      },
    ],
  },
  {
    id: "projects-tasks-api",
    title: "Projects & Tasks",
    badge: "/api/projects · /api/tasks",
    description:
      "Manage workspace projects, task lifecycle states, soft-deleted task restoration, and task assignments.",
    endpoints: [
      {
        id: "get-projects",
        method: "GET",
        path: "/api/projects",
        auth: "JWT Bearer / Session",
        permission: "manage_projects or assigned scope",
        summary:
          "Lists organization projects visible to the authenticated user or manager.",
        responseExample: `[
  {
    "_id": "6740b9f2e1c4a90012ab3456",
    "name": "Core Web Platform",
    "teams": ["Engineering"],
    "users": []
  }
]`,
      },
      {
        id: "post-projects",
        method: "POST",
        path: "/api/projects",
        auth: "JWT Bearer / Session",
        permission: "manage_projects",
        summary: "Creates a new project with optional team and user scoping.",
        params: [
          {
            name: "name",
            location: "body",
            required: true,
            description: "Display name for the project.",
          },
          {
            name: "teams",
            location: "body",
            description: "Array of team names granted project access.",
          },
          {
            name: "users",
            location: "body",
            description: "Array of individual user IDs granted direct access.",
          },
        ],
        responseExample: `{
  "_id": "6740ba18e1c4a90012ab3499",
  "name": "Mobile Sync Q4",
  "teams": ["Engineering"],
  "users": [],
  "createdAt": "2026-11-27T09:10:00.000Z"
}`,
      },
      {
        id: "get-tasks",
        method: "GET",
        path: "/api/tasks",
        auth: "JWT Bearer / Session",
        permission: "manage_tasks / manager / self",
        summary:
          "Fetches active tasks scoped by user role (`Owner`/admin full org, `Manager` direct reports, `User` assigned tasks).",
        responseExample: `[
  {
    "_id": "674101a0e1c4a90012ab7701",
    "title": "Verify timezone rollover",
    "status": "in-progress",
    "priority": "high",
    "dueDate": "2026-11-30T00:00:00.000Z"
  }
]`,
      },
      {
        id: "post-tasks",
        method: "POST",
        path: "/api/tasks",
        auth: "JWT Bearer / Session",
        permission: "manage_tasks",
        summary: "Creates a task assigned to a project and optional assignee.",
        params: [
          { name: "title", location: "body", required: true, description: "Task title." },
          { name: "project", location: "body", required: true, description: "Project ObjectId." },
          { name: "priority", location: "body", description: "`low`, `medium`, or `high`." },
          { name: "status", location: "body", description: "`todo`, `in-progress`, or `completed`." },
        ],
        responseExample: `{
  "_id": "674101f4e1c4a90012ab7705",
  "title": "Audit desktop telemetry queue",
  "status": "todo",
  "priority": "medium"
}`,
      },
      {
        id: "restore-task",
        method: "PATCH",
        path: "/api/tasks/recently-deleted/:id/restore",
        auth: "JWT Bearer / Session",
        permission: "manage_tasks",
        summary: "Restores a soft-deleted task back to active project lists.",
        params: [
          { name: "id", location: "path", required: true, description: "Deleted task ID." },
        ],
        responseExample: `{
  "message": "Task restored successfully."
}`,
      },
    ],
  },
  {
    id: "users-teams-api",
    title: "Users & Teams",
    badge: "/api/users · /api/teams",
    description:
      "Retrieve organization directory members, teams, manager assignments, and user onboarding invites.",
    endpoints: [
      {
        id: "get-users",
        method: "GET",
        path: "/api/users",
        auth: "JWT Bearer / Session",
        permission: "owner | admin | manager",
        summary:
          "Lists organization users scoped by caller role (returns `403` for employee self-only roles).",
        responseExample: `[
  {
    "_id": "66f000000000000000000010",
    "firstName": "Aarav",
    "lastName": "Mehta",
    "email": "aarav@company.com",
    "role": "manager"
  }
]`,
      },
      {
        id: "assign-manager",
        method: "PUT",
        path: "/api/users/:id/assign-manager",
        auth: "JWT Bearer / Session",
        permission: "owner | admin | manage_users",
        summary:
          "Updates multi-manager assignments for an employee (`managers` array + legacy `manager` sync).",
        params: [
          { name: "id", location: "path", required: true, description: "Target user ID." },
          {
            name: "managerIds",
            location: "body",
            required: true,
            description: "Array of manager user IDs.",
          },
        ],
        responseExample: `{
  "message": "Manager assignments updated successfully."
}`,
      },
      {
        id: "get-teams",
        method: "GET",
        path: "/api/teams",
        auth: "JWT Bearer / Session",
        summary: "Returns teams configured inside the organization.",
        responseExample: `[
  {
    "_id": "66f100000000000000000002",
    "name": "Engineering"
  }
]`,
      },
    ],
  },
  {
    id: "attendance-reports-api",
    title: "Attendance, Usage & Reports",
    badge: "/api/attendance · /api/reports · /api/usage",
    description:
      "Query zoned attendance intervals, work/break summaries, app usage breakdowns, productivity scores, and live locations.",
    endpoints: [
      {
        id: "get-attendance",
        method: "GET",
        path: "/api/attendance",
        auth: "JWT Bearer / Session",
        permission: "reportAccess (self | assigned | all)",
        summary:
          "Returns attendance work/break seconds, punch bounds, and merged daily intervals across `[startDate, endDate]` in the caller's timezone.",
        params: [
          { name: "startDate", location: "query", description: "Start date (`YYYY-MM-DD`)." },
          { name: "endDate", location: "query", description: "End date (`YYYY-MM-DD`)." },
          { name: "users", location: "query", description: "Comma-separated user ID filter." },
          { name: "sortBy", location: "query", description: "Sort key (default `name`)." },
          { name: "order", location: "query", description: "`asc` or `desc`." },
        ],
        responseExample: `[
  {
    "_id": "66f000000000000000000010",
    "firstName": "Aarav",
    "lastName": "Mehta",
    "workedSeconds": 28800,
    "breakSeconds": 1800,
    "firstIn": "09:02 AM",
    "lastOut": "05:32 PM"
  }
]`,
      },
      {
        id: "get-reports",
        method: "GET",
        path: "/api/reports",
        auth: "JWT Bearer / Session",
        permission: "reportAccess",
        summary: "Lists generated background overview, usage, productivity, and project reports.",
        responseExample: `[
  {
    "_id": "674209a1e1c4a90012ab8810",
    "type": "attendance-overview",
    "status": "completed",
    "createdAt": "2026-11-27T07:00:00.000Z"
  }
]`,
      },
      {
        id: "get-usage",
        method: "GET",
        path: "/api/usage",
        auth: "JWT Bearer / Session",
        permission: "reportAccess",
        summary:
          "Returns normalized per-organization application and browser domain usage durations.",
        params: [
          { name: "startDate", location: "query", description: "Start date (`YYYY-MM-DD`)." },
          { name: "endDate", location: "query", description: "End date (`YYYY-MM-DD`)." },
        ],
        responseExample: `{
  "topApps": [
    { "name": "Visual Studio Code", "totalSeconds": 14400 },
    { "name": "github.com", "totalSeconds": 5400 }
  ]
}`,
      },
      {
        id: "get-locations",
        method: "GET",
        path: "/api/locations",
        auth: "JWT Bearer / Session",
        permission: "reportAccess",
        summary:
          "Returns team geolocation pins and range-aware work/break summaries when location tracking is enabled.",
        responseExample: `[
  {
    "userId": "66f000000000000000000010",
    "city": "Bengaluru",
    "lat": 12.9716,
    "lng": 77.5946
  }
]`,
      },
    ],
  },
  {
    id: "api-keys-management",
    title: "API Key & Log Management",
    badge: "/api/api-keys · /api/api-logs",
    description:
      "Programmatic or dashboard management of organization API keys and request audit trails.",
    endpoints: [
      {
        id: "list-api-keys",
        method: "GET",
        path: "/api/api-keys",
        auth: "JWT Bearer / Session",
        permission: "manage_settings",
        summary: "Lists active masked API keys (`wc_xxxxx****************`) for the organization.",
        responseExample: `{
  "apiKeys": [
    {
      "id": "67421100e1c4a90012ab9001",
      "name": "CI Sync Worker",
      "maskedKey": "wc_9f41e****************",
      "createdAt": "2026-11-26T10:00:00.000Z"
    }
  ]
}`,
      },
      {
        id: "create-api-key",
        method: "POST",
        path: "/api/api-keys",
        auth: "JWT Bearer / Session",
        permission: "manage_settings",
        summary: "Generates a new `wc_<64-hex>` API key and returns the raw key once.",
        params: [
          { name: "name", location: "body", required: true, description: "Label for the API key." },
        ],
        responseExample: `{
  "message": "API Key generated successfully.",
  "apiKey": {
    "id": "67421122e1c4a90012ab9002",
    "name": "Warehouse BI",
    "key": "wc_4a7d...<64-hex>",
    "keyPreview": "wc_4a7d9****************"
  }
}`,
      },
      {
        id: "get-api-logs",
        method: "GET",
        path: "/api/api-logs",
        auth: "JWT Bearer / Session",
        permission: "manage_settings",
        summary: "Fetches paginated request logs recorded by `apiLogger` across `/api/v1/*`.",
        params: [
          { name: "startDate", location: "query", description: "Filter start (`YYYY-MM-DD`)." },
          { name: "endDate", location: "query", description: "Filter end (`YYYY-MM-DD`)." },
          { name: "page", location: "query", description: "1-based page number." },
        ],
        responseExample: `{
  "logs": [
    {
      "method": "GET",
      "endpoint": "/api/v1/projects",
      "statusCode": 200,
      "responseTime": 18
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1 }
}`,
      },
    ],
  },
];

export const DATA_EXPORT_ENDPOINTS: ExportEndpoint[] = [
  {
    method: "GET",
    path: "/api/users/export/users",
    format: "CSV",
    description: "Exports scoped organization users, roles, teams, and status metadata.",
  },
  {
    method: "POST",
    path: "/api/reports/usageCSV",
    format: "CSV",
    description: "Generates normalized application and domain usage CSV exports for a date range.",
  },
  {
    method: "GET",
    path: "/api/reports/:id/download",
    format: "CSV / File",
    description: "Downloads a previously generated attendance, productivity, or project report.",
  },
  {
    method: "GET",
    path: "/api/screenshots/export-zip",
    format: "ZIP",
    description: "Exports authorized screenshot captures for a user/date range as a bundled ZIP archive.",
  },
];

export const API_ERROR_CODES: ApiErrorCode[] = [
  {
    status: 400,
    title: "Bad Request",
    cause: "Missing required fields (e.g., API key name) or malformed JSON payload.",
    sampleBody: `{ "message": "Malformed JSON payload", "error": "Malformed JSON payload" }`,
  },
  {
    status: 401,
    title: "Unauthorized",
    cause: "Missing Bearer header, invalid/expired `wc_...` API key, archived owner, or expired JWT.",
    sampleBody: `{ "message": "Invalid API key." }`,
  },
  {
    status: 403,
    title: "Forbidden",
    cause: "Missing RBAC permission (`manage_settings`, `manage_projects`), CORS origin block, or missing/invalid `X-CSRF-Token` on cookie mutations.",
    sampleBody: `{ "message": "CSRF token missing or invalid" }`,
  },
  {
    status: 404,
    title: "Not Found",
    cause: "Unknown route or zero-disclosure response when querying another organization tenant.",
    sampleBody: `{ "message": "Resource not found", "error": "Resource not found" }`,
  },
  {
    status: 429,
    title: "Too Many Requests",
    cause: "Triggered `express-rate-limit` protections on auth/OTP verification routes.",
    sampleBody: `{ "message": "Too many attempts. Please try again later." }`,
  },
  {
    status: 500,
    title: "Internal Server Error",
    cause: "Unexpected unhandled server failure; sanitized message returned without leaking stack traces.",
    sampleBody: `{ "message": "An unexpected error occurred", "error": "An unexpected error occurred" }`,
  },
];

export function buildOpenApiSpec() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const group of ENDPOINT_GROUPS) {
    for (const ep of group.endpoints) {
      const openApiPath = ep.path.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");
      const methodKey = ep.method.toLowerCase();

      if (!paths[openApiPath]) {
        paths[openApiPath] = {};
      }

      const parameters = (ep.params || [])
        .filter((p) => p.location !== "body")
        .map((p) => ({
          name: p.name,
          in: p.location,
          required: Boolean(p.required),
          description: p.description,
          schema: { type: "string" },
        }));

      const bodyParams = (ep.params || []).filter((p) => p.location === "body");
      const requestBody =
        bodyParams.length > 0
          ? {
              required: bodyParams.some((b) => b.required),
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: Object.fromEntries(
                      bodyParams.map((b) => [
                        b.name,
                        { type: "string", description: b.description },
                      ])
                    ),
                  },
                },
              },
            }
          : undefined;

      paths[openApiPath][methodKey] = {
        tags: [group.title],
        summary: ep.summary,
        security:
          ep.auth === "API Key (Bearer wc_...)"
            ? [{ apiKeyBearer: [] }]
            : [{ jwtBearer: [] }],
        ...(parameters.length > 0 ? { parameters } : {}),
        ...(requestBody ? { requestBody } : {}),
        responses: {
          "200": {
            description: "Successful response",
          },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
        },
      };
    }
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "WorkComposer Platform API",
      version: "1.0.0",
      description:
        "WorkComposer API Reference covering organization `/api/v1` API key endpoints and authenticated REST endpoints.",
    },
    servers: [
      {
        url: "http://localhost:5000",
        description: "Local WorkComposer Backend Server",
      },
    ],
    components: {
      securitySchemes: {
        apiKeyBearer: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "wc_<64-hex>",
          description:
            "Organization API key generated under Settings → Account → API Access (`Authorization: Bearer wc_...`).",
        },
        jwtBearer: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "User session JWT access token (or HTTP-only cookie + X-CSRF-Token for browser mutations).",
        },
      },
    },
    paths,
  };
}

