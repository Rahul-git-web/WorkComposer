# WorkComposer MongoDB → PostgreSQL ETL Migration Tooling

Production-quality, resumable, validation-heavy ETL system designed to extract existing WorkComposer MongoDB data, normalize it according to the finalized Prisma schema, bulk-load it into PostgreSQL, and reconcile parity.

---

## Architecture Overview

```text
MongoDB (Read-Only)
        ↓
Cursor Extraction (Batch size: 1000/5000/10000)
        ↓
Transformation & Normalization
  - Preserve 100% of 24-hex BSON ObjectIds
  - Empty-string FKs ("") → null
  - Subdocument flattening (UserDevice, UserRefreshToken, ProjectUser)
  - Native text[] arrays & JSON preservation
  - Decimal monetary rounding (Invoice.amount)
        ↓
PostgreSQL Batch Transaction Load
  - Idempotent (skipDuplicates / deterministic upserts)
  - Checkpoint tracking (resumable per model and _id)
        ↓
Validation & Reconciliation
  - Row-count checks
  - ID coverage
  - Deep sample comparison (100 random samples)
  - Parity audit reports (JSON & Markdown)
```

---

## Safety Mechanisms

1. **Strict Read-Only MongoDB Source**: The migration tooling proxies the native MongoDB driver so write methods (`update`, `delete`, `insert`, `bulkWrite`, `drop`) are blocked at runtime.
2. **Default Dry-Run Mode**: `MIGRATION_DRY_RUN` defaults to `true`. No database writes are performed unless:
   - `ALLOW_POSTGRES_MIGRATION=true` OR `MIGRATION_TARGET=staging|local|test` is explicitly provided in the environment.
   - `--dry-run` flag is omitted and `MIGRATION_DRY_RUN=false`.
3. **Isolated Migration Scope**: All ETL logic resides strictly inside `scripts/migration/`. Zero application controllers, services, models, routes, or frontend packages are modified.

---

## Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `ALLOW_POSTGRES_MIGRATION` | `false` | Must be `true` to authorize writing to PostgreSQL. |
| `MIGRATION_DRY_RUN` | `true` | When `true`, extracts and transforms records without writing. |
| `MIGRATION_STRICT` | `false` | When `true`, aborts batch if an unresolved required foreign key is detected. |
| `MIGRATION_BATCH_SIZE` | `5000` | Number of documents extracted per cursor batch (e.g. 1000, 5000, 10000). |
| `MIGRATION_SAMPLE_SIZE` | `100` | Number of random records sampled per model during validation. |
| `MIGRATION_CHECKPOINT_FILE`| `checkpoint.json` | Path to persistent checkpoint file for resumability. |
| `MONGO_URI` / `MONGODB_URI`| Loaded from `.env` | MongoDB connection string. |
| `DATABASE_URL` | Loaded from `.env` | Target PostgreSQL connection string. |

---

## Approved 8-Tier Dependency Order

The migration executes models in 8 sequential tiers to respect foreign-key referential integrity:

* **Tier 1 — Root**: `Organization`
* **Tier 2 — RBAC & Groups**: `Role`, `Team`
* **Tier 3 — Identity**: `User`, `UserDevice` (normalized), `UserRefreshToken` (normalized)
* **Tier 4 — Tenant Settings & Billing**: `TimeTrackingSettings`, `BillingProfile`, `Subscription`, `PaymentMethod`, `Invoice`, `ApiKey`, `Integration`, `AppClassification`
* **Tier 5 — Work Management**: `Project`, `ProjectUser` (normalized), `Task`, `Comment`
* **Tier 6 — Tracking & Attendance**: `Session`, `Attendance`, `Timer`, `ProjectTracking`, `ManualTimeRequest`
* **Tier 7 — High-Volume Telemetry**: `Screenshot`, `Activity`, `AppUsage`, `UsageLog`, `Location`
* **Tier 8 — Logs & System Records**: `Notification`, `AuditLog`, `ApiLog`, `Report`, `Invite`, `SyncStatus`, `EmailChange`

---

## CLI Usage

Run commands from `WorkComposer Backend/`:

### 1. Dry-Run Migration (Default & Safe)

```bash
node scripts/migration/migrate.js --all --dry-run
```

### 2. Single Model Migration

```bash
node scripts/migration/migrate.js --model User --dry-run
node scripts/migration/migrate.js --model Task --dry-run
```

### 3. Single Tier Migration

```bash
node scripts/migration/migrate.js --tier 1 --dry-run
```

### 4. Standalone Validation & Reconciliation

```bash
node scripts/migration/migrate.js --validate
```

### 5. Reset Checkpoint State

```bash
node scripts/migration/migrate.js --reset-checkpoint
```

### 6. Configurable Batch Size

```bash
node scripts/migration/migrate.js --all --batch-size 10000 --dry-run
```

---

## Resumability & Idempotency

* **Checkpoint Tracking**: State is persisted to `checkpoint.json` after every batch. If interrupted, restarting resumes from the last recorded `_id > lastProcessedId`.
* **Idempotent Insertion**: Uses `createMany({ skipDuplicates: true })` and deterministic 24-character hexadecimal IDs for subdocuments (`UserDevice`, `UserRefreshToken`). Re-running batches will not duplicate records.

---

## Reports & Artifacts

After every migration or validation run, the tooling generates:
1. `scripts/migration/migration-report.json`: Machine-readable summary with counts, duration, and orphan lists.
2. `scripts/migration/migration-report.md`: Formatted Markdown report for engineering review.
