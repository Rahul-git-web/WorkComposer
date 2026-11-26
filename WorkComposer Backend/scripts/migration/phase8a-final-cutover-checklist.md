# Phase 8A — Production Final Cutover Checklist & Operational Runbook

This document defines the strict, gated checklist required prior to, during, and immediately following the future production migration and provider cutover (Phase 8B).

> **CRITICAL REMINDER**: Phase 8A is a read-only assessment and isolated dry run.  
> **NO PRODUCTION CUTOVER HAS OCCURRED IN PHASE 8A.**  
> `DATABASE_PROVIDER=mongo` remains the active production configuration.

---

## 1. Pre-Migration Gates (Phase 8B Prerequisites)

Before taking any action on production, all items below must be explicitly signed off:

- [ ] **1. Production Backup Verified**:
  - Full MongoDB Atlas cluster snapshot triggered and verified restorable.
  - Backup completion timestamp and snapshot ID recorded.
- [ ] **2. Rollback Owner & Incident Commander Identified**:
  - Designated primary engineer and database administrator assigned.
  - Clear decision threshold agreed upon (e.g. any unresolvable error during migration triggers immediate abort).
- [ ] **3. Maintenance Window Confirmed**:
  - 30-minute maintenance window approved and scheduled during lowest traffic period.
  - Maintenance banner / downtime notice prepared for customer notification if required.
- [ ] **4. MongoDB Write Freeze Mechanism Ready**:
  - Application placed into maintenance mode or write endpoints gated to prevent in-flight mutations.
- [ ] **5. Target Production PostgreSQL Ready**:
  - PostgreSQL instance sized, configured, and accessible from backend application cluster.
  - Extension `pgcrypto` available if needed; collation and encoding (`UTF8`) verified.
- [ ] **6. Production Credentials Verified**:
  - Connection string securely loaded via environment (`DATABASE_URL`).
  - Security guard parameters verified (`ALLOW_POSTGRES_MIGRATION=true`, `MIGRATION_TARGET=production`).
- [ ] **7. Production Schema Verified**:
  - Prisma schema representation matches current `prisma/schema.prisma` without drifts.
  - `npx prisma db push` or migration representation applied and all 35 tables verified empty.
- [ ] **8. Phase 8A Dry Run Status Confirmed**:
  - Dry run completed with `PASS` status.
  - All 5 test suites green (`234 passed / 0 failed`).
- [ ] **9. Orphan Baseline Reconciled**:
  - Confirmed exactly 317 historical orphaned sessions identified and handled via `MIGRATION_ORPHAN_POLICY=block`.
  - Zero unexpected orphan patterns detected.
- [ ] **10. Migration Duration & Schedule Approved**:
  - Expected migration time (~3–5 minutes) fits comfortably within maintenance window.
- [ ] **11. Application & Database Monitoring Active**:
  - Real-time logging (Datadog/CloudWatch/PM2), error tracking (Sentry), and DB CPU/memory dashboards open.

---

## 2. Migration Execution Gates (During Maintenance Window)

- [ ] **1. Writes Frozen**:
  - Ingress traffic stopped or routed to maintenance page.
  - All active timers and ongoing background jobs cleanly stopped.
- [ ] **2. Final MongoDB Baseline Captured**:
  - Snapshot final document counts across all 32 collections to compare against target counts.
- [ ] **3. Migration Started**:
  - Execute migration engine:
    ```bash
    node scripts/migration/migrate.js --all
    ```
- [ ] **4. Checkpoint Monitoring**:
  - Verify progression through all 8 domain batches:
    1. Organizations
    2. Roles & Teams
    3. Users & Normalized Device/Token Tables
    4. Settings, Billing, Integrations & Classifications
    5. Projects, Project Users, Tasks & Comments
    6. Sessions, Attendance, Timers, Tracking & Manual Time
    7. Screenshots, Activities, App Usage, Usage Logs & Locations
    8. Notifications, Audit Logs, API Logs, Reports, Invites, Sync & Email Changes
- [ ] **5. Error & Failure Monitoring**:
  - Confirm `errors: 0`, `failures: 0`.
  - Confirm blocked records exactly equal the expected orphan baseline (317).
- [ ] **6. Migration Parity Validation Executed**:
  - Run the automated parity validator:
    ```bash
    node scripts/migration/validate.js
    ```
  - Verify ID parity (100% 24-char hex), FK integrity (0 orphans), arrays, JSON, and timestamp precision.

---

## 3. Pre-Cutover Validation Gates (Before Provider Switch)

- [ ] **1. Exact Record Count Reconciliation**:
  - PostgreSQL total rows match expected baseline: `Source Documents - Blocked Orphans = Migrated Rows`.
- [ ] **2. Foreign Key Integrity Audit**:
  - 0 dangling foreign keys in PostgreSQL.
- [ ] **3. Critical Business Aggregates Reconciled**:
  - Users per organization match.
  - Projects per organization match.
  - Tasks per project match.
  - Sessions per user match.
- [ ] **4. Application Smoke Tests Against PostgreSQL**:
  - Execute health endpoints and verify read routes return HTTP 200 OK.
  - Authenticate staging/admin test user.
- [ ] **5. Zero Unresolved Blockers**:
  - No database deadlocks, connection exhaustion, or transaction failures observed.

---

## 4. Production Provider Switch

> **STATUS IN PHASE 8A: NOT EXECUTED**  
> (Reserved strictly for Phase 8B upon explicit user sign-off).

When authorized in Phase 8B:
1. Update production configuration:
   ```env
   DATABASE_PROVIDER=postgres
   ```
2. Restart backend application cluster:
   ```bash
   pm2 reload all
   ```
3. Verify startup logs indicate:
   ```text
   PostgreSQL connected
   ```
4. Verify HTTP endpoints and WebSocket connections are accepting traffic.
5. Lift maintenance mode / unfreeze ingress traffic.

---

## 5. Rollback Procedure & Operational Limitations

### Supported Rollback Plan
If any critical defect, data inconsistency, or unexpected latency spike occurs within the maintenance window:
1. **Revert Provider Configuration**:
   ```env
   DATABASE_PROVIDER=mongo
   ```
2. **Restart Backend Cluster**:
   ```bash
   pm2 reload all
   ```
3. **Verify Re-connection to MongoDB**:
   - Inspect server logs to confirm:
     ```text
     MongoDB connected
     ```
   - Confirm `/api/auth/me` and `/api/organization` are operational against MongoDB.
4. **Restore Ingress Traffic to MongoDB backend**.

### CRITICAL OPERATIONAL LIMITATION
- **Migration is Monodirectional**: The migration tooling migrates data exclusively from MongoDB to PostgreSQL.
- **NO Reverse Synchronization**: There is **no automated synchronization from PostgreSQL back to MongoDB**.
- Any new records created by users (timers, sessions, tasks, screenshots) while running on PostgreSQL will **NOT** automatically replicate back to MongoDB.
- Therefore, the decision to rollback must be made **promptly during the maintenance window** before opening unrestricted customer traffic.
