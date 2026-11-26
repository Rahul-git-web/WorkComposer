# Phase 7 — Production Cutover Runbook

> **CRITICAL NOTICE: DOCUMENTATION ONLY**  
> This runbook is an operational procedure guide for future deployment.  
> **DO NOT EXECUTE PRODUCTION CUTOVER DURING THIS AUDIT PHASE.**  
> The application remains defaulted to `DATABASE_PROVIDER=mongo`.

---

## 1. Architectural Strategy & Maintenance Window

### 1.1 Maintenance Window Requirement (No False Zero-Downtime Claim)
WorkComposer Backend does **not** possess an active bi-directional change data capture (CDC) or dual-write replication mechanism between MongoDB and PostgreSQL. Therefore:
* Cutover **must** be executed within a scheduled maintenance window (recommended duration: 45–60 minutes).
* Client writes must be frozen (desktop agents and dashboard set to maintenance/read-only or ingress paused) prior to running the final production data migration.
* Claims of "zero-downtime cutover" are strictly forbidden, as doing so without CDC risks silent data divergence.

### 1.2 Target Architecture

```text
Pre-Cutover:
Client Ingress -> Express Backend -> Mongoose Models -> MongoDB Atlas (Read/Write)

Maintenance Window:
Write Freeze -> Final Mongo Backup -> Migration ETL -> PostgreSQL Production -> Reconciliation Gate

Post-Cutover:
Client Ingress -> Express Backend -> Provider-Aware Repositories -> Prisma -> PostgreSQL Production
                                                                          (MongoDB Atlas: READ-ONLY Reference)
```

---

## 2. Pre-Cutover Checklist & Prerequisites

### 2.1 Backup & Snapshot Verification
1. **MongoDB Atlas Snapshot:**
   * Create an on-demand snapshot of the production MongoDB cluster (`workcomposer`).
   * Confirm snapshot completion and status: `Available`.
2. **PostgreSQL Production Snapshot:**
   * Take a full baseline snapshot/backup of target PostgreSQL database (`pg_dump` or cloud snapshot).
   * Verify target PostgreSQL version (>= 16, confirmed on 18.6 in staging) and clean database state.
3. **Application & Infrastructure State:**
   * Confirm current git tag / release commit deployed and stable.
   * Verify all regression suites passed on the deployment candidate:
     * `migration.test.js` (25/25)
     * `phase5-compatibility.test.js` (41/41)
     * `phase5-api-compatibility.test.js` (48/48)
     * `phase6-runtime-integration.test.js` (66/66)

### 2.2 Roles & Operational Responsibilities
* **Cutover Lead:** Coordinates execution and timeline.
* **Database Administrator:** Executes migration ETL, runs reconciliation checks.
* **Backend Engineer:** Manages environment configurations, restarts processes, runs smoke tests.
* **Rollback Owner:** Empowered with absolute authority to abort and revert to MongoDB if any gate fails.

---

## 3. Production Environment Configuration Checklist

The following environment variables must be prepared in the production secret store (redacted values):

```env
# Database Provider Selection (set to postgres ONLY at cutover step)
DATABASE_PROVIDER=postgres

# PostgreSQL Production Connection URL (with SSL and connection pool limits)
DATABASE_URL="postgresql://<user>:<password>@<prod-host>:5432/<database>?schema=public&sslmode=require&connection_limit=25&pool_timeout=30"

# Migration Safety Flags (Required ONLY during migration execution)
ALLOW_POSTGRES_MIGRATION=true
MIGRATION_TARGET=production
MIGRATION_DRY_RUN=false
MIGRATION_ORPHAN_POLICY=block
PRISMA_DEBUG=false
```

---

## 4. Execution Step-by-Step

### Phase A: Ingress Write Freeze (T - 0 min)
1. Notify active dashboard and desktop sessions of maintenance mode.
2. Direct API gateway/load balancer to return HTTP 503 Maintenance page for write endpoints, or route through read-only proxy.
3. Verify no active sessions or timer writes are in-flight in MongoDB.

### Phase B: Schema Deployment (T + 5 min)
1. Run schema push / Prisma migration against production PostgreSQL:
   ```bash
   npx prisma migrate deploy
   ```
2. Verify table generation (35 tables, 18 enums, indexes, and constraints).

### Phase C: Production Migration ETL (T + 10 min)
1. Execute preflight validation:
   ```bash
   node scripts/migration/preflight.js
   ```
   *Gate:* Must pass 100% before continuing.
2. Execute production data migration:
   ```bash
   node scripts/migration/migrate.js --all
   ```
3. Run post-migration reconciliation:
   ```bash
   node scripts/migration/reconcile.js
   ```
   *Gate:* All 35 entity counts must reconcile with MongoDB source records (accounting for blocked orphans per policy). 0 schema or relational integrity errors.

### Phase D: Provider Switch & Application Restart (T + 25 min)
1. Update application environment variables:
   ```bash
   DATABASE_PROVIDER=postgres
   ```
2. Restart backend application cluster:
   ```bash
   pm2 restart workcomposer-backend
   # or
   systemctl restart workcomposer-backend
   ```
3. Verify logs confirm:
   * `PostgreSQL staging connected (Prisma compatibility layer)` / production connection confirmed.
   * `Server running on port ...`
   * Schedulers, Socket.IO, and cron jobs initialized.

### Phase E: Production Smoke Testing (T + 30 min)
1. **Authentication:**
   * Login with admin/owner credentials.
   * Verify `/api/auth/me` returns expected profile, role, and organization.
   * Test token refresh.
2. **Read Verification:**
   * Verify `/api/organization`, `/api/users`, `/api/teams`, `/api/projects`, `/api/tasks`.
   * Verify time tracking dashboards, reports, and sessions.
3. **Write Verification:**
   * Create a non-critical test task or comment; verify persistence in PostgreSQL.
   * Start and stop a test timer; verify Socket.IO events and session creation.
4. **Desktop Sync:**
   * Verify desktop client connects, authenticates, and retrieves sync status.

### Phase F: Ingress Unfreeze & Traffic Restoration (T + 40 min)
1. Remove maintenance mode flag at load balancer.
2. Monitor error logs, CPU, connection pool utilization, and response latencies.
3. Leave MongoDB in read-only state as rollback reference.

---

## 5. Rollback Procedure & Operational Limitations

### 5.1 Rollback Trigger Criteria
Rollback to MongoDB is **mandatory** if any of the following occur during the maintenance window:
1. Migration ETL encounters fatal unrecoverable errors.
2. Reconciliation gate identifies data corruption or missing records.
3. Application startup fails or crashes in PostgreSQL mode.
4. Core authentication or time tracking endpoints fail smoke testing.
5. Critical latency degradation or database connection exhaustion occurs within the first 15 minutes of traffic.

### 5.2 Rollback Execution Steps
1. Re-freeze public ingress immediately.
2. Revert application environment configuration:
   ```bash
   DATABASE_PROVIDER=mongo
   ```
3. Restart backend application cluster.
4. Verify MongoDB connection restored in logs:
   * `MongoDB connected`
5. Run smoke tests against MongoDB.
6. Re-open public ingress.

### 5.3 Critical Rollback Limitation (Reverse Synchronization)
> **WARNING:**  
> Automatic reverse synchronization from PostgreSQL back to MongoDB is **NOT IMPLEMENTED**.  
> If rollback occurs **after** user writes have been accepted by PostgreSQL, any data created in PostgreSQL during that window will NOT be present in MongoDB.  
> Therefore, the decision to rollback must be made during the smoke test phase **before** traffic is un-frozen, or the team must be prepared to manually reconcile transactions written to PostgreSQL.
