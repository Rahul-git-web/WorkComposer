# Phase 4 — Historical Orphan Ledger

## Overview

* **Total Historical Orphan References Audited**: **13480**
* **Policy Applied**: `MIGRATION_ORPHAN_POLICY=block`
* **Target PostgreSQL Action**:
  * **Required Foreign Keys**: **BLOCKED** from writing to target PostgreSQL to prevent relational integrity violations.
  * **Nullable Foreign Keys**: **MIGRATED** with foreign key normalized safely to `NULL`.
* **Source MongoDB**: 100% read-only. Zero records deleted, modified, or reassigned.

---

## Orphan Ledger Entries

| # | Model | Source Record ID | FK Field | Missing Parent ID | Target Parent Model | Nullability | Classification | Migration Action |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: | :--- | :--- |
| 1 | **Team** | `6a7ed212bd6ad78a910b33a0` | `createdById` | `6a7ed212bd6ad78a910b339f` | User | NULLABLE | `SOURCE_RECORD_NULLABLE_PARENT_MISSING` | MIGRATED (Foreign key normalized to NULL) |
| 2 | **Team** | `6a7edfec5c7eadf2489adc00` | `createdById` | `6a7ed212bd6ad78a910b339f` | User | NULLABLE | `SOURCE_RECORD_NULLABLE_PARENT_MISSING` | MIGRATED (Foreign key normalized to NULL) |
| 3 | **ApiKey** | `6a7ee0e85c7eadf2489ae2e9` | `createdById` | `6a7ed212bd6ad78a910b339f` | User | NULLABLE | `SOURCE_RECORD_NULLABLE_PARENT_MISSING` | MIGRATED (Foreign key normalized to NULL) |
| 4 | **Project** | `6a7ede355c7eadf2489acd71` | `createdById` | `6a7ed212bd6ad78a910b339f` | User | NULLABLE | `SOURCE_RECORD_NULLABLE_PARENT_MISSING` | MIGRATED (Foreign key normalized to NULL) |
| 5 | **Task** | `6a7ede555c7eadf2489ace3a` | `assignedToId` | `6a7ed212bd6ad78a910b339f` | User | NULLABLE | `SOURCE_RECORD_NULLABLE_PARENT_MISSING` | MIGRATED (Foreign key normalized to NULL) |
| 6 | **Task** | `6a7ede555c7eadf2489ace3a` | `assignedById` | `6a7ed212bd6ad78a910b339f` | User | NULLABLE | `SOURCE_RECORD_NULLABLE_PARENT_MISSING` | MIGRATED (Foreign key normalized to NULL) |
| 7 | **Task** | `6a82df47d6e0d1c8382bd83a` | `assignedById` | `6a7ed212bd6ad78a910b339f` | User | NULLABLE | `SOURCE_RECORD_NULLABLE_PARENT_MISSING` | MIGRATED (Foreign key normalized to NULL) |
| 8 | **Task** | `6a8304f524b1d92413f21acf` | `assignedToId` | `6a7ed212bd6ad78a910b339f` | User | NULLABLE | `SOURCE_RECORD_NULLABLE_PARENT_MISSING` | MIGRATED (Foreign key normalized to NULL) |
| 9 | **Task** | `6a8304f524b1d92413f21acf` | `assignedById` | `6a7ed212bd6ad78a910b339f` | User | NULLABLE | `SOURCE_RECORD_NULLABLE_PARENT_MISSING` | MIGRATED (Foreign key normalized to NULL) |
| 10 | **Task** | `6a92b4d587307ebcc6187831` | `assignedToId` | `6a7ed212bd6ad78a910b339f` | User | NULLABLE | `SOURCE_RECORD_NULLABLE_PARENT_MISSING` | MIGRATED (Foreign key normalized to NULL) |
| 11 | **Task** | `6a92b4d587307ebcc6187831` | `assignedById` | `6a7ed212bd6ad78a910b339f` | User | NULLABLE | `SOURCE_RECORD_NULLABLE_PARENT_MISSING` | MIGRATED (Foreign key normalized to NULL) |
| 12 | **Task** | `6a92b56687307ebcc618ce6d` | `assignedById` | `6a7ed212bd6ad78a910b339f` | User | NULLABLE | `SOURCE_RECORD_NULLABLE_PARENT_MISSING` | MIGRATED (Foreign key normalized to NULL) |
| 13 | **Task** | `6a92b7a987307ebcc61a50be` | `assignedById` | `6a7ed212bd6ad78a910b339f` | User | NULLABLE | `SOURCE_RECORD_NULLABLE_PARENT_MISSING` | MIGRATED (Foreign key normalized to NULL) |
| 14 | **Task** | `6a9403dd69fe00984e86b5ff` | `assignedToId` | `6a7ed212bd6ad78a910b339f` | User | NULLABLE | `SOURCE_RECORD_NULLABLE_PARENT_MISSING` | MIGRATED (Foreign key normalized to NULL) |
| 15 | **Task** | `6a9403dd69fe00984e86b5ff` | `assignedById` | `6a7ed212bd6ad78a910b339f` | User | NULLABLE | `SOURCE_RECORD_NULLABLE_PARENT_MISSING` | MIGRATED (Foreign key normalized to NULL) |
| 16 | **Task** | `6a9404c369fe00984e875695` | `assignedToId` | `6a7ed212bd6ad78a910b339f` | User | NULLABLE | `SOURCE_RECORD_NULLABLE_PARENT_MISSING` | MIGRATED (Foreign key normalized to NULL) |
| 17 | **Task** | `6a9404c369fe00984e875695` | `assignedById` | `6a7ed212bd6ad78a910b339f` | User | NULLABLE | `SOURCE_RECORD_NULLABLE_PARENT_MISSING` | MIGRATED (Foreign key normalized to NULL) |
| 18 | **Task** | `6a94081269fe00984e88271d` | `assignedToId` | `6a7ed212bd6ad78a910b339f` | User | NULLABLE | `SOURCE_RECORD_NULLABLE_PARENT_MISSING` | MIGRATED (Foreign key normalized to NULL) |
| 19 | **Task** | `6a94081269fe00984e88271d` | `assignedById` | `6a7ed212bd6ad78a910b339f` | User | NULLABLE | `SOURCE_RECORD_NULLABLE_PARENT_MISSING` | MIGRATED (Foreign key normalized to NULL) |
| 20 | **Task** | `6a94085169fe00984e884c01` | `assignedToId` | `6a7ed212bd6ad78a910b339f` | User | NULLABLE | `SOURCE_RECORD_NULLABLE_PARENT_MISSING` | MIGRATED (Foreign key normalized to NULL) |
| 21 | **Task** | `6a94085169fe00984e884c01` | `assignedById` | `6a7ed212bd6ad78a910b339f` | User | NULLABLE | `SOURCE_RECORD_NULLABLE_PARENT_MISSING` | MIGRATED (Foreign key normalized to NULL) |
| 22 | **Comment** | `6a7ede695c7eadf2489acf53` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 23 | **Comment** | `6a7ee2e25c7eadf2489af932` | `userId` | `6a7edf965c7eadf2489ad844` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 24 | **Comment** | `6a9384f9e618bd9892bb9c35` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 25 | **Session** | `6a7ef3405c7eadf2489b6048` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 26 | **Session** | `6a7ef3455c7eadf2489b6111` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 27 | **Session** | `6a7ef3645c7eadf2489b6cf1` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 28 | **Session** | `6a7ef36a5c7eadf2489b6e82` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 29 | **Session** | `6a7ef36a5c7eadf2489b6e83` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 30 | **Session** | `6a7ef36e5c7eadf2489b6fb0` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 31 | **Session** | `6a7ef36e5c7eadf2489b6fca` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 32 | **Session** | `6a7ef36f5c7eadf2489b6fe4` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 33 | **Session** | `6a7ef36f5c7eadf2489b6ffe` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 34 | **Session** | `6a7ef36f5c7eadf2489b704a` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 35 | **Session** | `6a7ef3705c7eadf2489b7064` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 36 | **Session** | `6a7ef3705c7eadf2489b70b0` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 37 | **Session** | `6a7ef3715c7eadf2489b712e` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 38 | **Session** | `6a7ef3735c7eadf2489b722a` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 39 | **Session** | `6a7ef3b65c7eadf2489b766d` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 40 | **Session** | `6a7ef5185c7eadf2489bb5b2` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 41 | **Session** | `6a7ef7395c7eadf2489bbb9c` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 42 | **Session** | `6a7ef8295c7eadf2489be55a` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 43 | **Session** | `6a7f033a5c7eadf2489c07e4` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 44 | **Session** | `6a7f03625c7eadf2489c1d7b` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 45 | **Session** | `6a7f06c35c7eadf2489c28a1` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 46 | **Session** | `6a7f06f85c7eadf2489c3dfd` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 47 | **Session** | `6a7f0a145c7eadf2489c4aa9` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 48 | **Session** | `6a7f0a305c7eadf2489c5af2` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 49 | **Session** | `6a7f0a325c7eadf2489c5bad` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 50 | **Session** | `6a7f0a375c7eadf2489c6067` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 51 | **Session** | `6a7f1aa35c7eadf2489c9082` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 52 | **Session** | `6a7f1aa75c7eadf2489c913e` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 53 | **Session** | `6a7f1aef5c7eadf2489ca308` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 54 | **Session** | `6a7f1b7b5c7eadf2489ce9e1` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 55 | **Session** | `6a80360a08a04664ab92fba4` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 56 | **Session** | `6a80361408a04664ab92fe17` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 57 | **Session** | `6a80379c08a04664ab937c57` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 58 | **Session** | `6a80387508a04664ab939dbc` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 59 | **Session** | `6a80387908a04664ab939dbe` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 60 | **Session** | `6a80a4e09dac0c07cdaf03db` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 61 | **Session** | `6a80a64c9dac0c07cdb00106` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 62 | **Session** | `6a80a66a9dac0c07cdb012a7` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 63 | **Session** | `6a80a6779dac0c07cdb013f2` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 64 | **Session** | `6a811f94ceeebe692b55ebe1` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 65 | **Session** | `6a8121afceeebe692b56c359` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 66 | **Session** | `6a812579ceeebe692b5702d2` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 67 | **Session** | `6a812661ceeebe692b57be66` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 68 | **Session** | `6a81267dceeebe692b57d89a` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 69 | **Session** | `6a812689ceeebe692b57e90b` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 70 | **Session** | `6a812689ceeebe692b57e97a` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 71 | **Session** | `6a8126d0ceeebe692b580681` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 72 | **Session** | `6a812737ceeebe692b584b14` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 73 | **Session** | `6a8127deceeebe692b58693f` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 74 | **Session** | `6a812807ceeebe692b5877ca` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 75 | **Session** | `6a812827ceeebe692b5880bf` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 76 | **Session** | `6a81294dceeebe692b59853c` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 77 | **Session** | `6a81298eceeebe692b59b1d1` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 78 | **Session** | `6a812a0cceeebe692b59f12f` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 79 | **Session** | `6a812cf2ceeebe692b5a2b2e` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 80 | **Session** | `6a812d60ceeebe692b5a8c8d` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 81 | **Session** | `6a812da9ceeebe692b5a9428` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 82 | **Session** | `6a812ebdceeebe692b5b21e7` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 83 | **Session** | `6a812ebfceeebe692b5b25ae` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 84 | **Session** | `6a812ec5ceeebe692b5b2edb` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 85 | **Session** | `6a812ecbceeebe692b5b36f2` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 86 | **Session** | `6a812f70ceeebe692b5b744f` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 87 | **Session** | `6a812f79ceeebe692b5b7907` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 88 | **Session** | `6a81386cceeebe692b5c33b0` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 89 | **Session** | `6a813875ceeebe692b5c374c` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 90 | **Session** | `6a813880ceeebe692b5c3c70` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 91 | **Session** | `6a8138baceeebe692b5c568a` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 92 | **Session** | `6a81398aceeebe692b5c9d92` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 93 | **Session** | `6a81399dceeebe692b5ca73b` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 94 | **Session** | `6a81399eceeebe692b5ca73c` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 95 | **Session** | `6a8139a2ceeebe692b5ca9e9` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 96 | **Session** | `6a8139a2ceeebe692b5ca9ea` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 97 | **Session** | `6a8139a2ceeebe692b5ca9eb` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 98 | **Session** | `6a8139a2ceeebe692b5ca9ec` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 99 | **Session** | `6a8139a2ceeebe692b5ca9ed` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |
| 100 | **Session** | `6a8139bbceeebe692b5cb8ee` | `userId` | `6a7ed212bd6ad78a910b339f` | User | REQUIRED | `SOURCE_RECORD_VALID_PARENT_MISSING` | BLOCKED (Refuse real write under orphan policy 'block') |

*... and 13380 additional orphan records cataloged in phase4-orphan-ledger.json.*

---
*Orphan ledger generated by Phase 4 Reconciliation Engine.*
