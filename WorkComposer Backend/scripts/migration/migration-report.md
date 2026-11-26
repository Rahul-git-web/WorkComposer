# WorkComposer MongoDB → PostgreSQL ETL Migration Report

## Executive Summary

* **Overall Status**: ❌ **FAIL**
* **Execution Mode**: 🚀 **LIVE EXECUTION (PostgreSQL Written)**
* **Duration**: 4.79s (2026-10-01T12:32:54.691Z → 2026-10-01T12:32:59.484Z)
* **Batch Size**: 5000
* **Strict Mode**: Disabled
* **Active Orphan Policy**: `MIGRATION_ORPHAN_POLICY=block` (Default: `block`)
* **Policy Requirement**: ⚠️ **ORPHAN_POLICY_REQUIRED** (Refusing writes for required-FK orphans)
* **Source MongoDB**: `mongodb+srv://workComposer_auth:***@authentication.yphin3e.mongodb.net/workcomposer`
* **Target PostgreSQL**: `postgresql://postgres:***@localhost:5432/workcomposer?schema=public`

---

## Per-Model Migration Statistics

| Model | Source | Expected | Processed | Safe to Migrate | Blocked (Req FK) | Identical | Conflicts | Ref Valid | Ref Missing (Orphan) | Errors | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Organization** | 7 | 7 | 7 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | ✅ Migrated |
| **Role** | 28 | 28 | 28 | 28 | 0 | 0 | 0 | 28 | 0 | 0 | ✅ Migrated |
| **Team** | 5 | 5 | 5 | 5 | 0 | 0 | 0 | 5 | 2 | 0 | ✅ Migrated |
| **User** | 4 | 4 | 4 | 4 | 0 | 0 | 0 | 12 | 0 | 0 | ✅ Migrated |
| **UserDevice** | 2 | 28 | 28 | 28 | 0 | 0 | 0 | 28 | 0 | 0 | ✅ Migrated |
| **UserRefreshToken** | 3 | 21 | 21 | 21 | 0 | 0 | 0 | 21 | 0 | 0 | ✅ Migrated |
| **TimeTrackingSettings** | 3 | 3 | 3 | 3 | 0 | 0 | 0 | 3 | 0 | 0 | ✅ Migrated |
| **BillingProfile** | 3 | 3 | 3 | 3 | 0 | 0 | 0 | 3 | 0 | 0 | ✅ Migrated |
| **Subscription** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | ✅ Migrated |
| **PaymentMethod** | 3 | 3 | 3 | 3 | 0 | 0 | 0 | 3 | 0 | 0 | ✅ Migrated |
| **Invoice** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | ✅ Migrated |
| **ApiKey** | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 1 | 1 | 0 | ✅ Migrated |
| **Integration** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | ✅ Migrated |
| **AppClassification** | 3 | 3 | 3 | 3 | 0 | 0 | 0 | 3 | 0 | 0 | ✅ Migrated |
| **Project** | 2 | 2 | 2 | 2 | 0 | 0 | 0 | 3 | 1 | 0 | ✅ Migrated |
| **ProjectUser** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | ✅ Migrated |
| **Task** | 10 | 10 | 10 | 10 | 0 | 0 | 0 | 23 | 17 | 0 | ✅ Migrated |
| **Comment** | 5 | 5 | 5 | 2 | 3 | 0 | 0 | 7 | 3 | 0 | ⚠️ BLOCKED_REQUIRED_FK |
| **Session** | 383 | 383 | 383 | 66 | 317 | 0 | 0 | 66 | 317 | 0 | ⚠️ BLOCKED_REQUIRED_FK |
| **Attendance** | 3 | 3 | 3 | 0 | 3 | 0 | 0 | 3 | 3 | 0 | ⚠️ BLOCKED_REQUIRED_FK |
| **Timer** | 178 | 178 | 178 | 34 | 144 | 0 | 0 | 62 | 144 | 0 | ⚠️ BLOCKED_REQUIRED_FK |
| **ProjectTracking** | 25 | 25 | 25 | 0 | 25 | 0 | 0 | 50 | 25 | 0 | ⚠️ BLOCKED_REQUIRED_FK |
| **ManualTimeRequest** | 1 | 1 | 1 | 0 | 1 | 0 | 0 | 1 | 2 | 0 | ⚠️ BLOCKED_REQUIRED_FK |
| **Screenshot** | 379 | 379 | 379 | 22 | 357 | 0 | 0 | 134 | 357 | 0 | ⚠️ BLOCKED_REQUIRED_FK |
| **Activity** | 6963 | 6963 | 6963 | 449 | 6514 | 0 | 0 | 2565 | 6514 | 0 | ⚠️ BLOCKED_REQUIRED_FK |
| **AppUsage** | 149 | 149 | 149 | 7 | 142 | 0 | 0 | 7 | 142 | 0 | ⚠️ BLOCKED_REQUIRED_FK |
| **UsageLog** | 6210 | 6210 | 6210 | 462 | 5748 | 0 | 0 | 2466 | 5748 | 0 | ⚠️ BLOCKED_REQUIRED_FK |
| **Location** | 2 | 2 | 2 | 1 | 1 | 0 | 0 | 3 | 1 | 0 | ⚠️ BLOCKED_REQUIRED_FK |
| **Notification** | 22 | 22 | 22 | 10 | 12 | 0 | 0 | 32 | 12 | 0 | ⚠️ BLOCKED_REQUIRED_FK |
| **AuditLog** | 199 | 199 | 199 | 199 | 0 | 0 | 0 | 226 | 172 | 0 | ✅ Migrated |
| **ApiLog** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | ✅ Migrated |
| **Report** | 12 | 12 | 12 | 0 | 12 | 0 | 0 | 0 | 12 | 0 | ⚠️ BLOCKED_REQUIRED_FK |
| **Invite** | 6 | 6 | 6 | 6 | 0 | 0 | 0 | 12 | 6 | 0 | ✅ Migrated |
| **SyncStatus** | 2 | 2 | 2 | 1 | 1 | 0 | 0 | 1 | 1 | 0 | ⚠️ BLOCKED_REQUIRED_FK |
| **EmailChange** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | ✅ Migrated |

---

## Historical Orphan Migration Readiness

* **Active Orphan Policy**: `MIGRATION_ORPHAN_POLICY=block` (Default: `block`)
* **System Readiness State**: `ORPHAN_POLICY_REQUIRED`
* **Source Record Integrity**:
  * Source records exist and extractable: **YES**
  * Source records transformable: **YES**
  * Referenced parent exists in MongoDB: **NO** (mostly references to deleted user `6a7ed212bd6ad78a910b339f`)
  * PostgreSQL FK constraint permits insertion: **NO** (for required FKs)
  * Action Required: **Stakeholder decision on migration orphan policy** (`block`, `exclude`, `nullify`, `placeholder`, `reassign`). Default policy `block` safely refuses real writes.

| Model | Source Records | Valid Parent Ref | Missing Parent Ref | Required-FK Blocked | Nullable-FK Migratable | Migration-Safe Rows | Blocked Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Team** | 5 | 5 | 2 | 0 | 2 | 5 | ✅ MIGRATABLE_NULLABLE_FK |
| **ApiKey** | 1 | 1 | 1 | 0 | 1 | 1 | ✅ MIGRATABLE_NULLABLE_FK |
| **Project** | 2 | 3 | 1 | 0 | 1 | 2 | ✅ MIGRATABLE_NULLABLE_FK |
| **Task** | 10 | 23 | 17 | 0 | 17 | 10 | ✅ MIGRATABLE_NULLABLE_FK |
| **Comment** | 5 | 7 | 3 | 3 | 0 | 2 | ⚠️ BLOCKED_REQUIRED_FK |
| **Session** | 383 | 66 | 317 | 317 | 0 | 66 | ⚠️ BLOCKED_REQUIRED_FK |
| **Attendance** | 3 | 3 | 3 | 3 | 0 | 0 | ⚠️ BLOCKED_REQUIRED_FK |
| **Timer** | 178 | 62 | 144 | 144 | 0 | 34 | ⚠️ BLOCKED_REQUIRED_FK |
| **ProjectTracking** | 25 | 50 | 25 | 25 | 0 | 0 | ⚠️ BLOCKED_REQUIRED_FK |
| **ManualTimeRequest** | 1 | 1 | 2 | 1 | 1 | 0 | ⚠️ BLOCKED_REQUIRED_FK |
| **Screenshot** | 379 | 134 | 357 | 357 | 0 | 22 | ⚠️ BLOCKED_REQUIRED_FK |
| **Activity** | 6963 | 2565 | 6514 | 6514 | 0 | 449 | ⚠️ BLOCKED_REQUIRED_FK |
| **AppUsage** | 149 | 7 | 142 | 142 | 0 | 7 | ⚠️ BLOCKED_REQUIRED_FK |
| **UsageLog** | 6210 | 2466 | 5748 | 5748 | 0 | 462 | ⚠️ BLOCKED_REQUIRED_FK |
| **Location** | 2 | 3 | 1 | 1 | 0 | 1 | ⚠️ BLOCKED_REQUIRED_FK |
| **Notification** | 22 | 32 | 12 | 12 | 0 | 10 | ⚠️ BLOCKED_REQUIRED_FK |
| **AuditLog** | 199 | 226 | 172 | 0 | 172 | 199 | ✅ MIGRATABLE_NULLABLE_FK |
| **Report** | 12 | 0 | 12 | 12 | 0 | 0 | ⚠️ BLOCKED_REQUIRED_FK |
| **Invite** | 6 | 12 | 6 | 0 | 6 | 6 | ✅ MIGRATABLE_NULLABLE_FK |
| **SyncStatus** | 2 | 1 | 1 | 1 | 0 | 1 | ⚠️ BLOCKED_REQUIRED_FK |

---

## Normalization Audit

* **Monetary Field Normalizations (Invoice.amount)**: 0
* **Array Field Normalizations**: 76
* **Empty-String Foreign Keys Converted to Null**:
  * *None detected.*

---

## Orphan References Audit

* **Total Genuine Missing Parent References in MongoDB**: **13480**

| Model | Record ID | Field | Missing Target ID | Target Model | Target Collection | Required | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Team | `6a7ed212bd6ad78a910b33a0` | `createdById` | `6a7ed212bd6ad78a910b339f` | User | users | NO (Nullable) | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Team | `6a7edfec5c7eadf2489adc00` | `createdById` | `6a7ed212bd6ad78a910b339f` | User | users | NO (Nullable) | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| ApiKey | `6a7ee0e85c7eadf2489ae2e9` | `createdById` | `6a7ed212bd6ad78a910b339f` | User | users | NO (Nullable) | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Project | `6a7ede355c7eadf2489acd71` | `createdById` | `6a7ed212bd6ad78a910b339f` | User | users | NO (Nullable) | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Task | `6a7ede555c7eadf2489ace3a` | `assignedToId` | `6a7ed212bd6ad78a910b339f` | User | users | NO (Nullable) | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Task | `6a7ede555c7eadf2489ace3a` | `assignedById` | `6a7ed212bd6ad78a910b339f` | User | users | NO (Nullable) | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Task | `6a82df47d6e0d1c8382bd83a` | `assignedById` | `6a7ed212bd6ad78a910b339f` | User | users | NO (Nullable) | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Task | `6a8304f524b1d92413f21acf` | `assignedToId` | `6a7ed212bd6ad78a910b339f` | User | users | NO (Nullable) | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Task | `6a8304f524b1d92413f21acf` | `assignedById` | `6a7ed212bd6ad78a910b339f` | User | users | NO (Nullable) | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Task | `6a92b4d587307ebcc6187831` | `assignedToId` | `6a7ed212bd6ad78a910b339f` | User | users | NO (Nullable) | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Task | `6a92b4d587307ebcc6187831` | `assignedById` | `6a7ed212bd6ad78a910b339f` | User | users | NO (Nullable) | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Task | `6a92b56687307ebcc618ce6d` | `assignedById` | `6a7ed212bd6ad78a910b339f` | User | users | NO (Nullable) | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Task | `6a92b7a987307ebcc61a50be` | `assignedById` | `6a7ed212bd6ad78a910b339f` | User | users | NO (Nullable) | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Task | `6a9403dd69fe00984e86b5ff` | `assignedToId` | `6a7ed212bd6ad78a910b339f` | User | users | NO (Nullable) | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Task | `6a9403dd69fe00984e86b5ff` | `assignedById` | `6a7ed212bd6ad78a910b339f` | User | users | NO (Nullable) | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Task | `6a9404c369fe00984e875695` | `assignedToId` | `6a7ed212bd6ad78a910b339f` | User | users | NO (Nullable) | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Task | `6a9404c369fe00984e875695` | `assignedById` | `6a7ed212bd6ad78a910b339f` | User | users | NO (Nullable) | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Task | `6a94081269fe00984e88271d` | `assignedToId` | `6a7ed212bd6ad78a910b339f` | User | users | NO (Nullable) | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Task | `6a94081269fe00984e88271d` | `assignedById` | `6a7ed212bd6ad78a910b339f` | User | users | NO (Nullable) | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Task | `6a94085169fe00984e884c01` | `assignedToId` | `6a7ed212bd6ad78a910b339f` | User | users | NO (Nullable) | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Task | `6a94085169fe00984e884c01` | `assignedById` | `6a7ed212bd6ad78a910b339f` | User | users | NO (Nullable) | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Comment | `6a7ede695c7eadf2489acf53` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Comment | `6a7ee2e25c7eadf2489af932` | `userId` | `6a7edf965c7eadf2489ad844` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Comment | `6a9384f9e618bd9892bb9c35` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7ef3405c7eadf2489b6048` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7ef3455c7eadf2489b6111` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7ef3645c7eadf2489b6cf1` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7ef36a5c7eadf2489b6e82` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7ef36a5c7eadf2489b6e83` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7ef36e5c7eadf2489b6fb0` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7ef36e5c7eadf2489b6fca` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7ef36f5c7eadf2489b6fe4` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7ef36f5c7eadf2489b6ffe` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7ef36f5c7eadf2489b704a` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7ef3705c7eadf2489b7064` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7ef3705c7eadf2489b70b0` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7ef3715c7eadf2489b712e` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7ef3735c7eadf2489b722a` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7ef3b65c7eadf2489b766d` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7ef5185c7eadf2489bb5b2` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7ef7395c7eadf2489bbb9c` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7ef8295c7eadf2489be55a` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7f033a5c7eadf2489c07e4` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7f03625c7eadf2489c1d7b` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7f06c35c7eadf2489c28a1` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7f06f85c7eadf2489c3dfd` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7f0a145c7eadf2489c4aa9` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7f0a305c7eadf2489c5af2` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7f0a325c7eadf2489c5bad` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |
| Session | `6a7f0a375c7eadf2489c6067` | `userId` | `6a7ed212bd6ad78a910b339f` | User | users | **YES (REQUIRED)** | `REFERENCE_PARENT_MISSING_IN_MONGO` |

*... and 13430 more orphans recorded in migration-report.json.*

---

## ID Conflicts Audit

* **Total ID Conflicts Detected**: **15**
* ⚠️ **Organization** (ID: `6a7ed210bd6ad78a910b3398`): Incoming record differs from existing record in PostgreSQL target.
* ⚠️ **Organization** (ID: `6a83fd094568fc6880b4fbc2`): Incoming record differs from existing record in PostgreSQL target.
* ⚠️ **Organization** (ID: `6a83fea74568fc6880b4fbcb`): Incoming record differs from existing record in PostgreSQL target.
* ⚠️ **Organization** (ID: `6a83fee24568fc6880b4fbd2`): Incoming record differs from existing record in PostgreSQL target.
* ⚠️ **Organization** (ID: `6a8401ab1329739130656f79`): Incoming record differs from existing record in PostgreSQL target.
* ⚠️ **Organization** (ID: `6a905f7bea4628e87fb83335`): Incoming record differs from existing record in PostgreSQL target.
* ⚠️ **Organization** (ID: `6aa90d316acf40eafde3d7ad`): Incoming record differs from existing record in PostgreSQL target.
* ⚠️ **Team** (ID: `6a905f7dea4628e87fb8333b`): Incoming record differs from existing record in PostgreSQL target.
* ⚠️ **Team** (ID: `6aa90d316acf40eafde3d7b3`): Incoming record differs from existing record in PostgreSQL target.
* ⚠️ **User** (ID: `6a83065e24b1d92413f24c53`): Incoming record differs from existing record in PostgreSQL target.
* ⚠️ **User** (ID: `6a8401ad1329739130656f7e`): Incoming record differs from existing record in PostgreSQL target.
* ⚠️ **User** (ID: `6a905f7dea4628e87fb8333a`): Incoming record differs from existing record in PostgreSQL target.
* ⚠️ **User** (ID: `6aa90d316acf40eafde3d7b2`): Incoming record differs from existing record in PostgreSQL target.
* ⚠️ **TimeTrackingSettings** (ID: `6a7ee11193541511c2b74231`): Incoming record differs from existing record in PostgreSQL target.
* ⚠️ **TimeTrackingSettings** (ID: `6aa90fdd564952f956ea7580`): Incoming record differs from existing record in PostgreSQL target.

---

## Validation & Deep Sample Reconciliation

* **Validation Status**: ⚠️ WARN

### Sample Deep Comparison Results (Sample Size: 100)

| Model | Sampled | Exact Match | Normalized | Unexpected Differences |
| :--- | :--- | :--- | :--- | :--- |
| **User** | 4 | 4 | 0 | 0 |
| **Project** | 2 | 1 | 0 | 1 |
| **Task** | 10 | 0 | 0 | 10 |
| **Comment** | 5 | 2 | 0 | 3 |
| **Invoice** | 0 | 0 | 0 | 0 |
| **Role** | 28 | 28 | 0 | 0 |

---
*Report automatically generated by WorkComposer ETL Migration Tooling.*
