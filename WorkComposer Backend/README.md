# WorkComposer Backend

The **Node.js (ESM) / Express 5 + Socket.io 4.8** REST and real-time backend for the **WorkComposer** platform (`WorkComposer Backend/`), backed primarily by **PostgreSQL via Prisma 6.19** with **MongoDB / Mongoose 9** compatibility and ETL support.

> Root repository guide: see [../README.md](../README.md) · MongoDB → PostgreSQL migration CLI: see [scripts/migration/README.md](./scripts/migration/README.md)

---

## Tech Stack

- **Runtime & HTTP:** Node.js `v20+` (ESM `"type": "module"`), Express `5.2.1`, HTTP server on `PORT || 5000` (`0.0.0.0`)
- **Real-Time:** Socket.io `4.8.3`
- **Primary Database:** PostgreSQL + Prisma `6.19.3` (`prisma/schema.prisma`)
- **Compatibility / Migration DB:** MongoDB + Mongoose `9.4.1` (`DATABASE_PROVIDER=postgres` or `mongo`)
- **Auth & Security:** `jsonwebtoken`, `bcryptjs`, custom `securityHeaders`, `csrfProtection`, `express-rate-limit`, multi-tenant `callerOrgId` isolation, RBAC middleware
- **Integrations & Media:** Stripe `22.4.0`, Cloudinary `2.10.0`, `@getbrevo/brevo` `6.0.3`, Nodemailer `8.0.5`, `multer`, `archiver`, `json2csv`, `ipinfo`, `node-geocoder`
- **Scheduling & Timezones:** `node-cron` `4.6.0`, `date-fns` `4.4.0`, `date-fns-tz` `3.2.0`

---

## Entrypoint & Middleware Pipeline

- **Actual Entrypoint:** [`server.js`](./server.js) *(Note: `package.json` declares `"main": "index.js"` and a placeholder `"test"` script; both `npm start` and `npm run dev` execute `server.js`.)*
- **Startup Lifecycle (`server.js`):**
  1. Loads environment variables via `dotenv.config()` and `./src/config/env.js`.
  2. Connects to PostgreSQL (Prisma `$queryRaw SELECT 1`) or MongoDB depending on `DATABASE_PROVIDER` (`src/config/db.js`).
  3. Initializes Socket.io (`initSocket(server)`) on the HTTP server.
  4. Starts background jobs and schedulers on listen:
     - `startSyncJobs()` (Jira & BambooHR sync)
     - `startDailySummaryScheduler()`
     - `startWeeklySummaryScheduler()`
     - `startTrackingNotificationScheduler()`
     - `src/cron/emailReports.cron.js`
  5. Registers graceful `SIGINT` / `SIGTERM` shutdown disconnecting Prisma or Mongoose cleanly.
- **Express Middleware (`src/app.js`):**
  - `app.disable("x-powered-by")`, `app.set("trust proxy", 1)`, `securityHeaders`
  - `/api/stripe/webhook` mounted **before** JSON body parsing to preserve raw Stripe webhook payloads
  - `express.json` (storing `req.rawBody`), `express.urlencoded`, `cookieParser`
  - CORS allowing `FRONTEND_URL`, `http://localhost:3000`, `http://127.0.0.1:3000`, and requests without an `Origin` header (e.g., Electron main-process calls)
  - `csrfProtection` across API routes

---

## Mounted API Route Groups (`src/app.js`)

| Prefix | Router Module | Domain |
| --- | --- | --- |
| `/api/auth` | `authRoutes.js` | Registration, login, OAuth, refresh tokens, email verification |
| `/api/sessions` | `sessionRoutes.js` | Work & break session telemetry |
| `/api/users` | `userRoutes.js` | User profiles, avatars, managers, invites |
| `/api/teams` | `teamRoutes.js` | Team groups & memberships |
| `/api/tasks` | `taskRoutes.js`, `commentRoutes.js` | Tasks, subtasks, soft-delete recovery, task comments |
| `/api/projects` | `projectRoutes.js` | Project lifecycle & member assignments |
| `/api/timers` | `timerRoutes.js` | Active server-backed timers |
| `/api/screenshots` | `screenshotRoutes.js` | Screenshot capture uploads, gallery/timeline queries, ZIP export |
| `/api/activity` | `activityRoutes.js` | Per-minute activity telemetry buckets |
| `/api/intelligence` | `intelligenceRoutes.js` | Team-day & overview intelligence metrics |
| `/api/usage` | `usageRoutes.js` | Web & app usage aggregation and logs |
| `/api/attendance` | `attendanceRoutes.js` | Zoned attendance intervals & daily summaries |
| `/api/reports` | `reportRoutes.js` | Time, attendance, productivity, and export reports |
| `/api/project-tracking` | `projectTrackingRoutes.js` | Project/task time tracking analytics |
| `/api/settings` | `settingsRoutes.js` | Organization & user preferences (including theme settings) |
| `/api/organization` | `organizationRoutes.js` | Organization profile & setup |
| `/api/auditLog` | `auditLogRoutes.js` | Security & admin audit logs |
| `/api/roles` | `roleRoutes.js` | Built-in & custom RBAC roles and privileges |
| `/api/integrations` | `integrationRoutes.js` | Jira, Asana, Slack, BambooHR, Keka OAuth & connections |
| `/api/sync` | `syncRoutes.js` | Manual & scheduled external integration sync triggers |
| `/api/api-keys` | `apiKeyRoutes.js` | Public API key provisioning & revocation |
| `/api/v1` | `api/apiRoutes.js` | External Developer API (`/api/v1/*`) authenticated via API keys |
| `/api/api-logs` | `apiLogRoutes.js` | Developer API request logs & auditing |
| `/api/billing` | `billingRoutes.js` | Subscription plans, invoices, and Stripe checkout/portal |
| `/api/stripe/webhook` | `stripeWebhookRoutes.js` | Verified Stripe webhook receiver |
| `/api/time-tracking` | `timeTrackingSettingsRoutes.js` | Time-tracking rules & live Socket.io propagation |
| `/api/screen-capture` | `screenCaptureRoutes.js` | Screenshot capture interval & privacy rules |
| `/api/manual-time` | `manualTimeRoutes.js` | Direct manual time entries |
| `/api/manual-time-requests` | `manualTimeRequestRoutes.js` | Employee manual-time approval workflows |
| `/api/shift` | `shiftRoutes.js` | Work shifts & schedules |
| `/api/app-classifications` | `appClassificationRoutes.js` | `Productive`, `Neutral`, `Unproductive` classification rules |
| `/api/locations` | `locationRoutes.js` | Live geolocation ingestion & team map summaries |
| `/api/notifications` | `notificationRoutes.js` | In-app & desktop notifications |
| `/uploads` | `fileRoutes.js` | Local uploaded asset serving |
| `/api/test-harness` | `testHarnessRoutes.js` | **Non-production only:** mounted when `NODE_ENV !== "production"` and `ENABLE_TEST_HARNESS === "true"` |

---

## Directory Structure

```text
WorkComposer Backend/
├── prisma/                 # schema.prisma, SQL migrations, and PostgreSQL backfill scripts
├── scripts/
│   └── migration/          # Resumable MongoDB -> PostgreSQL 8-tier ETL CLI & README.md
├── src/
│   ├── config/             # env.js, db.js, Prisma, Stripe, Cloudinary configs
│   ├── constants/          # Shared enumerations & defaults
│   ├── controllers/        # Express route handlers
│   ├── cron/               # emailReports.cron.js
│   ├── db/                 # Prisma / Mongoose compatibility layer & prisma.js singleton
│   ├── jobs/               # sync.job.js (Jira & BambooHR)
│   ├── middleware/         # Auth, RBAC permissions, CSRF, rate limiting, securityHeaders
│   ├── models/             # Mongoose models (for MongoDB compatibility & ETL parity)
│   ├── routes/             # /api/* & /api/v1/* Express routers
│   ├── security/           # Multi-tenant callerOrgId & reporting-scope helpers
│   ├── services/           # Attendance/daily reports, schedulers, email, notifications
│   ├── socket/             # Socket.io initialization & room broadcasts
│   ├── templates/          # Transactional & scheduled email HTML templates
│   └── utils/              # Timezone day ranges, overlap math, geocoding, sanitization
├── package.json
├── server.js               # HTTP + Socket.io server entrypoint
└── README.md               # This file
```

---

## Environment Variables (`WorkComposer Backend/.env`)

Never commit `.env*` files. Below is the complete list of verified environment variable names referenced under `src/`:

### Core Server, Database & Auth
| Variable | Purpose | Example Placeholder |
| --- | --- | --- |
| `PORT` | HTTP / Socket.io listen port | `5000` |
| `NODE_ENV` | Runtime mode (`development` / `production`) | `development` |
| `DATABASE_PROVIDER` | Active database engine (`postgres` or `mongo`) | `postgres` |
| `DATABASE_URL` | PostgreSQL connection URL for Prisma | `postgresql://<user>:<password>@localhost:5432/workcomposer?schema=public` |
| `MONGO_URI` | MongoDB connection URL (when using `mongo` or ETL) | `mongodb://localhost:27017/workcomposer` |
| `JWT_SECRET` | Secret for signing access & refresh JWTs | `<random-strong-secret>` |
| `OAUTH_STATE_SECRET` | Secret for signing OAuth state parameters | `<random-strong-secret>` |
| `FRONTEND_URL` | Primary CORS-allowed frontend origin | `http://localhost:3000` |
| `CLIENT_URL` | Frontend base URL used in email/redirect links | `http://localhost:3000` |
| `BACKEND_URL` | Public/local backend URL for OAuth callbacks | `http://localhost:5000` |

### OAuth, Integrations, Media, Email & Billing
| Variable | Purpose | Example Placeholder |
| --- | --- | --- |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Screenshot & avatar cloud storage | `<cloudinary-credentials>` |
| `BREVO_API_KEY`, `EMAIL_FROM`, `MOCK_EMAIL_SERVICE` | Email delivery via Brevo/Nodemailer or mock mode | `<brevo-api-key>`, `noreply@example.com`, `false` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe SDK key & webhook signature secret | `<stripe-secret-key>`, `<stripe-webhook-secret>` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google OAuth sign-in | `<google-oauth-credentials>` |
| `APPLE_CLIENT_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_TEAM_ID`, `APPLE_REDIRECT_URI` | Apple OAuth sign-in | `<apple-oauth-credentials>` |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`, `MICROSOFT_REDIRECT_URI` | Microsoft OAuth sign-in | `<microsoft-oauth-credentials>` |
| `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET`, `JIRA_REDIRECT_URI`, `JIRA_WEBHOOK_SECRET` | Jira OAuth & webhook verification | `<jira-oauth-credentials>` |
| `ASANA_CLIENT_ID`, `ASANA_CLIENT_SECRET`, `ASANA_REDIRECT_URI` | Asana integration | `<asana-oauth-credentials>` |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, `SLACK_REDIRECT_URI` | Slack integration & signing secret | `<slack-app-credentials>` |
| `IPINFO_TOKEN` | IP metadata lookup for location telemetry | `<ipinfo-token>` |

### Scheduler, Diagnostic & Non-Production Flags
| Variable | Purpose | Example Placeholder |
| --- | --- | --- |
| `DISABLE_CRON` | Disable cron/scheduler loops when set (`true`) | `false` |
| `REPORT_CATCHUP_HORIZON_DAYS` | Daily summary catch-up lookback days | `7` |
| `WEEKLY_CATCHUP_WEEKS` | Weekly summary catch-up lookback weeks | `4` |
| `PRISMA_DEBUG` | Enable verbose Prisma query logging (`true`) | `false` |
| `SHADOW_AUTH_ENABLED`, `DEBUG_SHADOW_AUTH` | Shadow-auth verification & debug flags | `false` |
| `ENABLE_TEST_HARNESS`, `TEST_HARNESS_SECRET` | Guard for non-production `/api/test-harness` | `false`, `<test-secret>` |

---

## Setup & Common Commands

Run inside `WorkComposer Backend/`:

```bash
# Install dependencies
npm install

# Generate Prisma Client & apply PostgreSQL migrations
npx prisma generate
npx prisma migrate deploy

# Start in development (with nodemon auto-reload)
npm run dev

# Start in production
npm start
```

### MongoDB → PostgreSQL Migration Tooling
If migrating legacy MongoDB collections into PostgreSQL, review the dedicated ETL manual before running anything:
- [WorkComposer Backend/scripts/migration/README.md](./scripts/migration/README.md) (`--dry-run`, `--validate`, 8-tier dependency order, and safety locks).

