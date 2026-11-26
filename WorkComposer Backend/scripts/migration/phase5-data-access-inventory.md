# Phase 5 — Mongoose Data Access Inventory Report

## Executive Summary

* **Total Data Access Sites Audited**: **514**
* **Read Operations**: **379**
* **Write Operations**: **133**
* **Explicit Transactions / Sessions**: **15**
* **Aggregation Pipelines (`.aggregate()`)**: **6**
* **Relation Population (`.populate()`)**: **49**
* **ObjectId / `_id` Dependencies**: **248**

### Category Breakdown

| Category | Description | Access Sites Count |
| :--- | :--- | :---: |
| **Category A (Simple CRUD)** | Simple CRUD (find, findById, create, updateOne, count, etc.) | **446** |
| **Category B (Query Operators)** | Query Operators ($in, $or, $and, $gte, $lte, $regex, etc.) | **85** |
| **Category C (Population / Joins)** | Relation Population (.populate()) | **49** |
| **Category D (Aggregation)** | Aggregation Pipelines (.aggregate()) | **6** |
| **Category E (Transactions)** | Transactions (.startSession(), .withTransaction()) | **15** |
| **Category F (Atomic Update Semantics)** | Atomic Update Semantics ($inc, $push, $pull, $addToSet, etc.) | **26** |
| **Category G (ObjectId-Specific Behavior)** | ObjectId-specific behavior (_id, Types.ObjectId) | **248** |

### Data Access Distribution by Directory

| Directory | Access Sites Count | Primary Role |
| :--- | :---: | :--- |
| `src/controllers` | **415** | HTTP request handling, input validation, and JSON API response formatting |
| `src/cron` | **1** | Scheduled background jobs and batch maintenance |
| `src/middleware` | **4** | Authentication, authorization, and request pre-processing |
| `src/routes` | **4** | Route declarations and parameter validation |
| `src/services` | **67** | Core business logic, external integrations, and domain operations |
| `src/socket` | **15** | Real-time bidirectional event handling |
| `src/utils` | **8** | Shared helpers, audit logging, and avatar utilities |

### Data Access Distribution by Model

| Model | Access Sites Count | Target Collection / Table |
| :--- | :---: | :--- |
| **User** | 141 | `users` |
| **Integration** | 46 | `integrations` |
| **Session** | 43 | `sessions` |
| **Task** | 29 | `tasks` |
| **Organization** | 26 | `organizations` |
| **Project** | 21 | `projects` |
| **Role** | 20 | `roles` |
| **Report** | 16 | `reports` |
| **Invite** | 16 | `invites` |
| **Team** | 15 | `teams` |
| **TimeTrackingSettings** | 15 | `time_tracking_settings` |
| **AppClassification** | 14 | `app_classifications` |
| **Screenshot** | 13 | `screenshots` |
| **AppUsage** | 10 | `app_usages` |
| **Timer** | 10 | `timers` |
| **ProjectTracking** | 10 | `project_trackings` |
| **Comment** | 9 | `comments` |
| **Notification** | 8 | `notifications` |
| **Activity** | 7 | `activities` |
| **UsageLog** | 6 | `usage_logs` |
| **ManualTimeRequest** | 6 | `manual_time_requests` |
| **ApiKey** | 5 | `api_keys` |
| **Subscription** | 4 | `subscriptions` |
| **EmailChange** | 4 | `email_changes` |
| **ApiLog** | 3 | `api_logs` |
| **AuditLog** | 3 | `audit_logs` |
| **BillingProfile** | 3 | `billing_profiles` |
| **SyncStatus** | 3 | `sync_statuses` |
| **Attendance** | 2 | `attendances` |
| **Location** | 2 | `locations` |
| **Mongoose / Session** | 2 | `mongoose / sessions` |
| **PaymentMethod** | 1 | `payment_methods` |
| **Invoice** | 1 | `invoices` |

---

## Complete Data Access Inventory (Classified Sites)

| # | File | Line | Function | Model | Operation | Type | Categories | _id Dep | Populate | Expected Shape |
| :---: | :--- | :---: | :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| 1 | [`src/controllers/activity.controller.js`](file:///src/controllers/activity.controller.js#L37) | 37 | `getActivity` | **Screenshot** | `find` | `READ` | A, B | - | - | `Array<Screenshot>` |
| 2 | [`src/controllers/activity.controller.js`](file:///src/controllers/activity.controller.js#L149) | 149 | `getActivityTimeline` | **Session** | `find` | `READ` | A, B | - | - | `Array<Session>` |
| 3 | [`src/controllers/activity.controller.js`](file:///src/controllers/activity.controller.js#L225) | 225 | `trackActivity` | **Activity** | `create` | `WRITE` | A, G | Yes | - | `Activity Document` |
| 4 | [`src/controllers/activity.controller.js`](file:///src/controllers/activity.controller.js#L264) | 264 | `getSessionDetails` | **Activity** | `find` | `READ` | A, B | - | - | `Array<Activity>` |
| 5 | [`src/controllers/activity.controller.js`](file:///src/controllers/activity.controller.js#L266) | 266 | `getSessionDetails` | **Activity** | `find` | `READ` | A, B | - | - | `Array<Activity>` |
| 6 | [`src/controllers/activity.controller.js`](file:///src/controllers/activity.controller.js#L297) | 297 | `getSessionDetails` | **Screenshot** | `find` | `READ` | A, B | - | - | `Array<Screenshot>` |
| 7 | [`src/controllers/activity.controller.js`](file:///src/controllers/activity.controller.js#L305) | 305 | `getSessionDetails` | **UsageLog** | `find` | `READ` | A | - | - | `Array<UsageLog>` |
| 8 | [`src/controllers/activity.controller.js`](file:///src/controllers/activity.controller.js#L315) | 315 | `getSessionDetails` | **AppClassification** | `find` | `READ` | A | - | - | `Array<AppClassification>` |
| 9 | [`src/controllers/api/projectApiController.js`](file:///src/controllers/api/projectApiController.js#L5) | 5 | `getProjects` | **Project** | `find` | `READ` | A, G | Yes | - | `Array<Project>` |
| 10 | [`src/controllers/apiKey.controller.js`](file:///src/controllers/apiKey.controller.js#L32) | 32 | `generateApiKey` | **ApiKey** | `create` | `WRITE` | A, G | Yes | - | `ApiKey Document` |
| 11 | [`src/controllers/apiKey.controller.js`](file:///src/controllers/apiKey.controller.js#L64) | 64 | `getApiKeys` | **ApiKey** | `find` | `READ` | A, C, G | Yes | createdBy | `Array<ApiKey>` |
| 12 | [`src/controllers/apiKey.controller.js`](file:///src/controllers/apiKey.controller.js#L103) | 103 | `updateApiKey` | **ApiKey** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 13 | [`src/controllers/apiKey.controller.js`](file:///src/controllers/apiKey.controller.js#L134) | 134 | `deleteApiKey` | **ApiKey** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 14 | [`src/controllers/apiLog.controller.js`](file:///src/controllers/apiLog.controller.js#L24) | 24 | `skip` | **ApiLog** | `countDocuments` | `READ` | A, C, G | Yes | apiKey | `number` |
| 15 | [`src/controllers/apiLog.controller.js`](file:///src/controllers/apiLog.controller.js#L26) | 26 | `skip` | **ApiLog** | `find` | `READ` | A, C, G | Yes | apiKey | `Array<ApiLog>` |
| 16 | [`src/controllers/appClassification.controller.js`](file:///src/controllers/appClassification.controller.js#L28) | 28 | `search` | **AppClassification** | `find` | `READ` | A | - | - | `Array<AppClassification>` |
| 17 | [`src/controllers/appClassification.controller.js`](file:///src/controllers/appClassification.controller.js#L33) | 33 | `search` | **AppClassification** | `countDocuments` | `READ` | A | - | - | `number` |
| 18 | [`src/controllers/appClassification.controller.js`](file:///src/controllers/appClassification.controller.js#L71) | 71 | `createAppClassification` | **AppClassification** | `findOne` | `READ` | A | - | - | `Document | null` |
| 19 | [`src/controllers/appClassification.controller.js`](file:///src/controllers/appClassification.controller.js#L100) | 100 | `createAppClassification` | **AppClassification** | `create` | `WRITE` | A | - | - | `AppClassification Document` |
| 20 | [`src/controllers/appClassification.controller.js`](file:///src/controllers/appClassification.controller.js#L133) | 133 | `updateAppClassification` | **AppClassification** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 21 | [`src/controllers/appClassification.controller.js`](file:///src/controllers/appClassification.controller.js#L184) | 184 | `deleteAppClassification` | **AppClassification** | `findOneAndDelete` | `WRITE` | G | Yes | - | `AppClassification Document | null` |
| 22 | [`src/controllers/appClassification.controller.js`](file:///src/controllers/appClassification.controller.js#L210) | 210 | `getClassificationStats` | **AppClassification** | `find` | `READ` | A | - | - | `Array<AppClassification>` |
| 23 | [`src/controllers/appClassification.controller.js`](file:///src/controllers/appClassification.controller.js#L246) | 246 | `checkBreakMode` | **AppClassification** | `findOne` | `READ` | A | - | - | `Document | null` |
| 24 | [`src/controllers/asana.controller.js`](file:///src/controllers/asana.controller.js#L81) | 81 | `asanaCallback` | **Integration** | `findOneAndUpdate` | `WRITE` | A | - | - | `Integration Document | null` |
| 25 | [`src/controllers/asana.controller.js`](file:///src/controllers/asana.controller.js#L102) | 102 | `asanaCallback` | **User** | `findByIdAndUpdate` | `WRITE` | A | - | - | `User Document | null` |
| 26 | [`src/controllers/asana.controller.js`](file:///src/controllers/asana.controller.js#L138) | 138 | `asanaWebhook` | **Task** | `findOneAndDelete` | `WRITE` | G | Yes | - | `Task Document | null` |
| 27 | [`src/controllers/asana.controller.js`](file:///src/controllers/asana.controller.js#L146) | 146 | `asanaWebhook` | **Integration** | `findOne` | `READ` | A | - | - | `Document | null` |
| 28 | [`src/controllers/asana.controller.js`](file:///src/controllers/asana.controller.js#L182) | 182 | `asanaWebhook` | **Task** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 29 | [`src/controllers/asana.controller.js`](file:///src/controllers/asana.controller.js#L209) | 209 | `getAsanaIntegration` | **Integration** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 30 | [`src/controllers/asana.controller.js`](file:///src/controllers/asana.controller.js#L226) | 226 | `disconnectAsana` | **Integration** | `findOneAndUpdate` | `WRITE` | G | Yes | - | `Integration Document | null` |
| 31 | [`src/controllers/asana.controller.js`](file:///src/controllers/asana.controller.js#L256) | 256 | `getAsanaWorkspaces` | **Integration** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 32 | [`src/controllers/asana.controller.js`](file:///src/controllers/asana.controller.js#L293) | 293 | `getAsanaProjects` | **Integration** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 33 | [`src/controllers/asana.controller.js`](file:///src/controllers/asana.controller.js#L332) | 332 | `importAsanaProjects` | **Integration** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 34 | [`src/controllers/asana.controller.js`](file:///src/controllers/asana.controller.js#L362) | 362 | `importAsanaProjects` | **Project** | `findOne` | `READ` | A | - | - | `Document | null` |
| 35 | [`src/controllers/asana.controller.js`](file:///src/controllers/asana.controller.js#L372) | 372 | `importAsanaProjects` | **Project** | `create` | `WRITE` | A, G | Yes | - | `Project Document` |
| 36 | [`src/controllers/attendance.controller.js`](file:///src/controllers/attendance.controller.js#L64) | 64 | `getAttendanceData` | **User** | `find` | `READ` | A, C, G | Yes | manager, team | `Array<User>` |
| 37 | [`src/controllers/attendance.controller.js`](file:///src/controllers/attendance.controller.js#L85) | 85 | `getAttendanceData` | **Session** | `find` | `READ` | A | - | - | `Array<Session>` |
| 38 | [`src/controllers/attendance.controller.js`](file:///src/controllers/attendance.controller.js#L256) | 256 | `getUserAttendanceSummary` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 39 | [`src/controllers/attendance.controller.js`](file:///src/controllers/attendance.controller.js#L269) | 269 | `getUserAttendanceSummary` | **Session** | `find` | `READ` | A, B | - | - | `Array<Session>` |
| 40 | [`src/controllers/attendance.controller.js`](file:///src/controllers/attendance.controller.js#L304) | 304 | `finishAttendance` | **User** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 41 | [`src/controllers/attendance.controller.js`](file:///src/controllers/attendance.controller.js#L319) | 319 | `finishAttendance` | **Session** | `find` | `READ` | A | - | - | `Array<Session>` |
| 42 | [`src/controllers/attendance.controller.js`](file:///src/controllers/attendance.controller.js#L336) | 336 | `finishAttendance` | **Attendance** | `findOneAndUpdate` | `WRITE` | B, F | - | - | `Attendance Document | null` |
| 43 | [`src/controllers/attendance.controller.js`](file:///src/controllers/attendance.controller.js#L361) | 361 | `finishAttendance` | **Report** | `create` | `WRITE` | A | - | - | `Report Document` |
| 44 | [`src/controllers/auditLog.controller.js`](file:///src/controllers/auditLog.controller.js#L36) | 36 | `getAuditLogs` | **AuditLog** | `countDocuments` | `READ` | A, C | - | performedBy | `number` |
| 45 | [`src/controllers/auditLog.controller.js`](file:///src/controllers/auditLog.controller.js#L38) | 38 | `getAuditLogs` | **AuditLog** | `find` | `READ` | A, C | - | performedBy | `Array<AuditLog>` |
| 46 | [`src/controllers/auth.controller.js`](file:///src/controllers/auth.controller.js#L69) | 69 | `registerUser` | **User** | `findOne` | `READ` | A | - | - | `Document | null` |
| 47 | [`src/controllers/auth.controller.js`](file:///src/controllers/auth.controller.js#L80) | 80 | `registerUser` | **Organization** | `create` | `WRITE` | A, G | Yes | - | `Organization Document` |
| 48 | [`src/controllers/auth.controller.js`](file:///src/controllers/auth.controller.js#L86) | 86 | `registerUser` | **Role** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 49 | [`src/controllers/auth.controller.js`](file:///src/controllers/auth.controller.js#L93) | 93 | `registerUser` | **User** | `create` | `WRITE` | A, G | Yes | - | `User Document` |
| 50 | [`src/controllers/auth.controller.js`](file:///src/controllers/auth.controller.js#L115) | 115 | `registerUser` | **Team** | `create` | `WRITE` | A, G | Yes | - | `Team Document` |
| 51 | [`src/controllers/auth.controller.js`](file:///src/controllers/auth.controller.js#L165) | 165 | `loginUser` | **User** | `findOne` | `READ` | A | - | - | `Document | null` |
| 52 | [`src/controllers/auth.controller.js`](file:///src/controllers/auth.controller.js#L187) | 187 | `loginUser` | **Organization** | `findById` | `READ` | A | - | - | `Document | null` |
| 53 | [`src/controllers/auth.controller.js`](file:///src/controllers/auth.controller.js#L322) | 322 | `refreshAccessToken` | **User** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 54 | [`src/controllers/auth.controller.js`](file:///src/controllers/auth.controller.js#L371) | 371 | `logoutUser` | **User** | `updateOne` | `WRITE` | A, F | - | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 55 | [`src/controllers/auth.controller.js`](file:///src/controllers/auth.controller.js#L395) | 395 | `verifyEmail` | **User** | `findOne` | `READ` | A | - | - | `Document | null` |
| 56 | [`src/controllers/auth.controller.js`](file:///src/controllers/auth.controller.js#L424) | 424 | `resendVerification` | **User** | `findOne` | `READ` | A | - | - | `Document | null` |
| 57 | [`src/controllers/auth.controller.js`](file:///src/controllers/auth.controller.js#L468) | 468 | `forgotPassword` | **User** | `findOne` | `READ` | A | - | - | `Document | null` |
| 58 | [`src/controllers/auth.controller.js`](file:///src/controllers/auth.controller.js#L505) | 505 | `resetPassword` | **User** | `findOne` | `READ` | A | - | - | `Document | null` |
| 59 | [`src/controllers/auth.controller.js`](file:///src/controllers/auth.controller.js#L537) | 537 | `verifyTwoFactor` | **User** | `findOne` | `READ` | A | - | - | `Document | null` |
| 60 | [`src/controllers/auth.controller.js`](file:///src/controllers/auth.controller.js#L708) | 708 | `googleCallback` | **User** | `findOne` | `READ` | A | - | - | `Document | null` |
| 61 | [`src/controllers/auth.controller.js`](file:///src/controllers/auth.controller.js#L852) | 852 | `microsoftCallback` | **User** | `findOne` | `READ` | A | - | - | `Document | null` |
| 62 | [`src/controllers/auth.controller.js`](file:///src/controllers/auth.controller.js#L1009) | 1009 | `appleCallback` | **User** | `findOne` | `READ` | A | - | - | `Document | null` |
| 63 | [`src/controllers/auth.controller.js`](file:///src/controllers/auth.controller.js#L1010) | 1010 | `appleCallback` | **User** | `findOne` | `READ` | A | - | - | `Document | null` |
| 64 | [`src/controllers/bamboohr.controller.js`](file:///src/controllers/bamboohr.controller.js#L40) | 40 | `connectBambooHR` | **Integration** | `findOneAndUpdate` | `WRITE` | G | Yes | - | `Integration Document | null` |
| 65 | [`src/controllers/bamboohr.controller.js`](file:///src/controllers/bamboohr.controller.js#L71) | 71 | `getBambooHRIntegration` | **Integration** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 66 | [`src/controllers/bamboohr.controller.js`](file:///src/controllers/bamboohr.controller.js#L96) | 96 | `disconnectBambooHR` | **Integration** | `findOneAndUpdate` | `WRITE` | G | Yes | - | `Integration Document | null` |
| 67 | [`src/controllers/bamboohr.controller.js`](file:///src/controllers/bamboohr.controller.js#L122) | 122 | `getBambooHREmployees` | **Integration** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 68 | [`src/controllers/bamboohr.controller.js`](file:///src/controllers/bamboohr.controller.js#L150) | 150 | `syncBambooHREmployees` | **Integration** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 69 | [`src/controllers/bamboohr.controller.js`](file:///src/controllers/bamboohr.controller.js#L173) | 173 | `syncBambooHREmployees` | **User** | `findOneAndUpdate` | `WRITE` | G | Yes | - | `User Document | null` |
| 70 | [`src/controllers/bamboohr.controller.js`](file:///src/controllers/bamboohr.controller.js#L202) | 202 | `getBambooHRTimeOff` | **Integration** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 71 | [`src/controllers/bamboohr.controller.js`](file:///src/controllers/bamboohr.controller.js#L240) | 240 | `syncAllBambooHROrganizations` | **Integration** | `find` | `READ` | A | - | - | `Array<Integration>` |
| 72 | [`src/controllers/bamboohr.controller.js`](file:///src/controllers/bamboohr.controller.js#L253) | 253 | `syncAllBambooHROrganizations` | **User** | `findOneAndUpdate` | `WRITE` | A | - | - | `User Document | null` |
| 73 | [`src/controllers/billing.controller.js`](file:///src/controllers/billing.controller.js#L21) | 21 | `getBillingOverview` | **Subscription** | `findOne` | `READ` | A, F | - | - | `Document | null` |
| 74 | [`src/controllers/billing.controller.js`](file:///src/controllers/billing.controller.js#L25) | 25 | `getBillingOverview` | **BillingProfile** | `findOneAndUpdate` | `WRITE` | F | - | - | `BillingProfile Document | null` |
| 75 | [`src/controllers/billing.controller.js`](file:///src/controllers/billing.controller.js#L38) | 38 | `getBillingOverview` | **PaymentMethod** | `findOneAndUpdate` | `WRITE` | F | - | - | `PaymentMethod Document | null` |
| 76 | [`src/controllers/billing.controller.js`](file:///src/controllers/billing.controller.js#L70) | 70 | `getSubscription` | **Subscription** | `findOne` | `READ` | A | - | - | `Document | null` |
| 77 | [`src/controllers/billing.controller.js`](file:///src/controllers/billing.controller.js#L88) | 88 | `getInvoices` | **Invoice** | `find` | `READ` | A | - | - | `Array<Invoice>` |
| 78 | [`src/controllers/billing.controller.js`](file:///src/controllers/billing.controller.js#L122) | 122 | `updateBillingProfile` | **BillingProfile** | `findOneAndUpdate` | `WRITE` | F | - | - | `BillingProfile Document | null` |
| 79 | [`src/controllers/billing.controller.js`](file:///src/controllers/billing.controller.js#L240) | 240 | `changeStripePlan` | **Subscription** | `findOne` | `READ` | A | - | - | `Document | null` |
| 80 | [`src/controllers/comment.controller.js`](file:///src/controllers/comment.controller.js#L16) | 16 | `addComment` | **Task** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 81 | [`src/controllers/comment.controller.js`](file:///src/controllers/comment.controller.js#L24) | 24 | `addComment` | **Comment** | `create` | `WRITE` | A, G | Yes | - | `Comment Document` |
| 82 | [`src/controllers/comment.controller.js`](file:///src/controllers/comment.controller.js#L56) | 56 | `addComment` | **Comment** | `findById` | `READ` | A, C, G | Yes | user | `Document | null` |
| 83 | [`src/controllers/comment.controller.js`](file:///src/controllers/comment.controller.js#L75) | 75 | `getComments` | **Task** | `findById` | `READ` | A, C, G | Yes | user | `Document | null` |
| 84 | [`src/controllers/comment.controller.js`](file:///src/controllers/comment.controller.js#L83) | 83 | `getComments` | **Comment** | `find` | `READ` | A, C, G | Yes | user | `Array<Comment>` |
| 85 | [`src/controllers/comment.controller.js`](file:///src/controllers/comment.controller.js#L103) | 103 | `getUnreadCommentCount` | **Comment** | `countDocuments` | `READ` | A, B, G | Yes | - | `number` |
| 86 | [`src/controllers/comment.controller.js`](file:///src/controllers/comment.controller.js#L128) | 128 | `markCommentsAsRead` | **Comment** | `updateMany` | `WRITE` | B, F, G | Yes | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 87 | [`src/controllers/comment.controller.js`](file:///src/controllers/comment.controller.js#L163) | 163 | `updateComment` | **Comment** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 88 | [`src/controllers/comment.controller.js`](file:///src/controllers/comment.controller.js#L182) | 182 | `updateComment` | **Comment** | `findById` | `READ` | A, C, G | Yes | user | `Document | null` |
| 89 | [`src/controllers/comment.controller.js`](file:///src/controllers/comment.controller.js#L201) | 201 | `deleteComment` | **Comment** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 90 | [`src/controllers/comment.controller.js`](file:///src/controllers/comment.controller.js#L215) | 215 | `deleteComment` | **Comment** | `findByIdAndDelete` | `WRITE` | G | Yes | - | `Comment Document | null` |
| 91 | [`src/controllers/IntegrationStatus.controller.js`](file:///src/controllers/IntegrationStatus.controller.js#L8) | 8 | `getAllIntegrationStatuses` | **Integration** | `find` | `READ` | A, G | Yes | - | `Array<Integration>` |
| 92 | [`src/controllers/jira.controller.js`](file:///src/controllers/jira.controller.js#L65) | 65 | `jiraCallback` | **User** | `findOneAndUpdate` | `WRITE` | A | - | - | `User Document | null` |
| 93 | [`src/controllers/jira.controller.js`](file:///src/controllers/jira.controller.js#L79) | 79 | `jiraCallback` | **Integration** | `findOneAndUpdate` | `WRITE` | A | - | - | `Integration Document | null` |
| 94 | [`src/controllers/jira.controller.js`](file:///src/controllers/jira.controller.js#L127) | 127 | `getJiraProjects` | **Integration** | `findOne` | `READ` | A | - | - | `Document | null` |
| 95 | [`src/controllers/jira.controller.js`](file:///src/controllers/jira.controller.js#L161) | 161 | `getJiraStatus` | **Integration** | `findOne` | `READ` | A | - | - | `Document | null` |
| 96 | [`src/controllers/jira.controller.js`](file:///src/controllers/jira.controller.js#L189) | 189 | `syncJiraProjects` | **Integration** | `findOne` | `READ` | A | - | - | `Document | null` |
| 97 | [`src/controllers/jira.controller.js`](file:///src/controllers/jira.controller.js#L218) | 218 | `syncJiraProjects` | **Project** | `findOne` | `READ` | A | - | - | `Document | null` |
| 98 | [`src/controllers/jira.controller.js`](file:///src/controllers/jira.controller.js#L227) | 227 | `syncJiraProjects` | **Project** | `create` | `WRITE` | A, G | Yes | - | `Project Document` |
| 99 | [`src/controllers/jira.controller.js`](file:///src/controllers/jira.controller.js#L256) | 256 | `syncProjectIssues` | **Integration** | `findOne` | `READ` | A | - | - | `Document | null` |
| 100 | [`src/controllers/jira.controller.js`](file:///src/controllers/jira.controller.js#L303) | 303 | `syncProjectIssues` | **User** | `findOne` | `READ` | A | - | - | `Document | null` |
| 101 | [`src/controllers/jira.controller.js`](file:///src/controllers/jira.controller.js#L308) | 308 | `syncProjectIssues` | **Task** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 102 | [`src/controllers/jira.controller.js`](file:///src/controllers/jira.controller.js#L326) | 326 | `syncProjectIssues` | **Task** | `findOneAndUpdate` | `WRITE` | G | Yes | - | `Task Document | null` |
| 103 | [`src/controllers/jira.controller.js`](file:///src/controllers/jira.controller.js#L356) | 356 | `syncAllJiraProjects` | **Project** | `find` | `READ` | A | - | - | `Array<Project>` |
| 104 | [`src/controllers/jira.controller.js`](file:///src/controllers/jira.controller.js#L370) | 370 | `syncJiraIssues` | **Project** | `findById` | `READ` | A | - | - | `Document | null` |
| 105 | [`src/controllers/keka.controller.js`](file:///src/controllers/keka.controller.js#L39) | 39 | `connectKeka` | **Integration** | `findOneAndUpdate` | `WRITE` | G | Yes | - | `Integration Document | null` |
| 106 | [`src/controllers/keka.controller.js`](file:///src/controllers/keka.controller.js#L65) | 65 | `getKekaIntegration` | **Integration** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 107 | [`src/controllers/keka.controller.js`](file:///src/controllers/keka.controller.js#L88) | 88 | `disconnectKeka` | **Integration** | `findOneAndUpdate` | `WRITE` | G | Yes | - | `Integration Document | null` |
| 108 | [`src/controllers/keka.controller.js`](file:///src/controllers/keka.controller.js#L109) | 109 | `getKekaEmployees` | **Integration** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 109 | [`src/controllers/keka.controller.js`](file:///src/controllers/keka.controller.js#L131) | 131 | `syncKekaEmployees` | **Integration** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 110 | [`src/controllers/keka.controller.js`](file:///src/controllers/keka.controller.js#L151) | 151 | `syncKekaEmployees` | **User** | `findOneAndUpdate` | `WRITE` | G | Yes | - | `User Document | null` |
| 111 | [`src/controllers/keka.controller.js`](file:///src/controllers/keka.controller.js#L179) | 179 | `getKekaLeaves` | **Integration** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 112 | [`src/controllers/keka.controller.js`](file:///src/controllers/keka.controller.js#L201) | 201 | `syncAllKekaOrganizations` | **Integration** | `find` | `READ` | A | - | - | `Array<Integration>` |
| 113 | [`src/controllers/keka.controller.js`](file:///src/controllers/keka.controller.js#L216) | 216 | `syncAllKekaOrganizations` | **User** | `findOneAndUpdate` | `WRITE` | A | - | - | `User Document | null` |
| 114 | [`src/controllers/location.controller.js`](file:///src/controllers/location.controller.js#L66) | 66 | `saveLocation` | **Location** | `findOneAndUpdate` | `WRITE` | G | Yes | - | `Location Document | null` |
| 115 | [`src/controllers/location.controller.js`](file:///src/controllers/location.controller.js#L130) | 130 | `getLocations` | **User** | `find` | `READ` | A, B, G | Yes | - | `Array<User>` |
| 116 | [`src/controllers/location.controller.js`](file:///src/controllers/location.controller.js#L150) | 150 | `getLocations` | **Location** | `find` | `READ` | A, C | - |  | `Array<Location>` |
| 117 | [`src/controllers/manualTime.controller.js`](file:///src/controllers/manualTime.controller.js#L5) | 5 | `getManualTimeSettings` | **TimeTrackingSettings** | `findOneAndUpdate` | `WRITE` | F | - | - | `TimeTrackingSettings Document | null` |
| 118 | [`src/controllers/manualTime.controller.js`](file:///src/controllers/manualTime.controller.js#L32) | 32 | `updateManualTimeSettings` | **TimeTrackingSettings** | `findOneAndUpdate` | `WRITE` | F | - | - | `TimeTrackingSettings Document | null` |
| 119 | [`src/controllers/manualTimeRequest.controller.js`](file:///src/controllers/manualTimeRequest.controller.js#L17) | 17 | `createRequest` | **TimeTrackingSettings** | `findOne` | `READ` | A | - | - | `Document | null` |
| 120 | [`src/controllers/manualTimeRequest.controller.js`](file:///src/controllers/manualTimeRequest.controller.js#L71) | 71 | `createRequest` | **ManualTimeRequest** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 121 | [`src/controllers/manualTimeRequest.controller.js`](file:///src/controllers/manualTimeRequest.controller.js#L95) | 95 | `createRequest` | **Session** | `create` | `WRITE` | A, E, G | Yes | - | `Session Document` |
| 122 | [`src/controllers/manualTimeRequest.controller.js`](file:///src/controllers/manualTimeRequest.controller.js#L113) | 113 | `createRequest` | **Report** | `create` | `WRITE` | A, G | Yes | - | `Report Document` |
| 123 | [`src/controllers/manualTimeRequest.controller.js`](file:///src/controllers/manualTimeRequest.controller.js#L155) | 155 | `createRequest` | **ManualTimeRequest** | `create` | `WRITE` | A, G | Yes | - | `ManualTimeRequest Document` |
| 124 | [`src/controllers/manualTimeRequest.controller.js`](file:///src/controllers/manualTimeRequest.controller.js#L174) | 174 | `createRequest` | **Report** | `create` | `WRITE` | A, G | Yes | - | `Report Document` |
| 125 | [`src/controllers/manualTimeRequest.controller.js`](file:///src/controllers/manualTimeRequest.controller.js#L186) | 186 | `createRequest` | **User** | `find` | `READ` | A, B, G | Yes | - | `Array<User>` |
| 126 | [`src/controllers/manualTimeRequest.controller.js`](file:///src/controllers/manualTimeRequest.controller.js#L244) | 244 | `getRequests` | **User** | `find` | `READ` | A, B, G | Yes | - | `Array<User>` |
| 127 | [`src/controllers/manualTimeRequest.controller.js`](file:///src/controllers/manualTimeRequest.controller.js#L258) | 258 | `getRequests` | **ManualTimeRequest** | `find` | `READ` | A, C, G | Yes | approvedBy | `Array<ManualTimeRequest>` |
| 128 | [`src/controllers/manualTimeRequest.controller.js`](file:///src/controllers/manualTimeRequest.controller.js#L284) | 284 | `approveRequest` | **ManualTimeRequest** | `findById` | `READ` | A, C | - | requestedBy | `Document | null` |
| 129 | [`src/controllers/manualTimeRequest.controller.js`](file:///src/controllers/manualTimeRequest.controller.js#L295) | 295 | `approveRequest` | **TimeTrackingSettings** | `findOne` | `READ` | A | - | - | `Document | null` |
| 130 | [`src/controllers/manualTimeRequest.controller.js`](file:///src/controllers/manualTimeRequest.controller.js#L306) | 306 | `approveRequest` | **User** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 131 | [`src/controllers/manualTimeRequest.controller.js`](file:///src/controllers/manualTimeRequest.controller.js#L354) | 354 | `approveRequest` | **Session** | `create` | `WRITE` | A, E | - | - | `Session Document` |
| 132 | [`src/controllers/manualTimeRequest.controller.js`](file:///src/controllers/manualTimeRequest.controller.js#L371) | 371 | `approveRequest` | **Report** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 133 | [`src/controllers/manualTimeRequest.controller.js`](file:///src/controllers/manualTimeRequest.controller.js#L450) | 450 | `rejectRequest` | **ManualTimeRequest** | `findById` | `READ` | A, C | - | requestedBy | `Document | null` |
| 134 | [`src/controllers/manualTimeRequest.controller.js`](file:///src/controllers/manualTimeRequest.controller.js#L461) | 461 | `rejectRequest` | **TimeTrackingSettings** | `findOne` | `READ` | A | - | - | `Document | null` |
| 135 | [`src/controllers/manualTimeRequest.controller.js`](file:///src/controllers/manualTimeRequest.controller.js#L472) | 472 | `rejectRequest` | **User** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 136 | [`src/controllers/manualTimeRequest.controller.js`](file:///src/controllers/manualTimeRequest.controller.js#L524) | 524 | `rejectRequest` | **Report** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 137 | [`src/controllers/manualTimeRequest.controller.js`](file:///src/controllers/manualTimeRequest.controller.js#L590) | 590 | `getPendingCount` | **ManualTimeRequest** | `countDocuments` | `READ` | A | - | - | `number` |
| 138 | [`src/controllers/notification.controller.js`](file:///src/controllers/notification.controller.js#L18) | 18 | `skip` | **Notification** | `find` | `READ` | A | - | - | `Array<Notification>` |
| 139 | [`src/controllers/notification.controller.js`](file:///src/controllers/notification.controller.js#L26) | 26 | `skip` | **Notification** | `countDocuments` | `READ` | A | - | - | `number` |
| 140 | [`src/controllers/notification.controller.js`](file:///src/controllers/notification.controller.js#L30) | 30 | `skip` | **Notification** | `countDocuments` | `READ` | A | - | - | `number` |
| 141 | [`src/controllers/notification.controller.js`](file:///src/controllers/notification.controller.js#L57) | 57 | `getUnreadNotificationCount` | **Notification** | `countDocuments` | `READ` | A, G | Yes | - | `number` |
| 142 | [`src/controllers/notification.controller.js`](file:///src/controllers/notification.controller.js#L80) | 80 | `markNotificationAsRead` | **Notification** | `findOneAndUpdate` | `WRITE` | F, G | Yes | - | `Notification Document | null` |
| 143 | [`src/controllers/notification.controller.js`](file:///src/controllers/notification.controller.js#L117) | 117 | `markAllNotificationsAsRead` | **Notification** | `updateMany` | `WRITE` | F, G | Yes | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 144 | [`src/controllers/notification.controller.js`](file:///src/controllers/notification.controller.js#L172) | 172 | `updateOrganizationNotifications` | **Organization** | `findByIdAndUpdate` | `WRITE` | F | - | - | `Organization Document | null` |
| 145 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L27) | 27 | `getOrganization` | **Organization** | `findById` | `READ` | A | - | - | `Document | null` |
| 146 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L54) | 54 | `uploadLogo` | **Organization** | `findById` | `READ` | A | - | - | `Document | null` |
| 147 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L92) | 92 | `updateOrganization` | **Organization** | `findByIdAndUpdate` | `WRITE` | A | - | - | `Organization Document | null` |
| 148 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L122) | 122 | `deleteOrganization` | **Mongoose / Session** | `startSession` | `TRANSACTION` | E | - | - | `ClientSession` |
| 149 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L131) | 131 | `deleteOrganization` | **Organization** | `findById` | `READ` | A, E, G | Yes | - | `Document | null` |
| 150 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L143) | 143 | `deleteOrganization` | **User** | `find` | `READ` | A, B, G | Yes | - | `Array<User>` |
| 151 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L152) | 152 | `deleteOrganization` | **Screenshot** | `find` | `READ` | A, B | - | - | `Array<Screenshot>` |
| 152 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L162) | 162 | `deleteOrganization` | **Activity** | `deleteMany` | `WRITE` | B | - | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 153 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L166) | 166 | `deleteOrganization` | **AppUsage** | `deleteMany` | `WRITE` | B | - | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 154 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L170) | 170 | `deleteOrganization` | **AppClassification** | `deleteMany` | `WRITE` | B | - | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 155 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L174) | 174 | `deleteOrganization` | **Screenshot** | `deleteMany` | `WRITE` | B | - | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 156 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L178) | 178 | `deleteOrganization` | **Timer** | `deleteMany` | `WRITE` | B | - | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 157 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L182) | 182 | `deleteOrganization` | **UsageLog** | `deleteMany` | `WRITE` | B | - | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 158 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L186) | 186 | `deleteOrganization` | **Report** | `deleteMany` | `WRITE` | B | - | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 159 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L190) | 190 | `deleteOrganization` | **ProjectTracking** | `deleteMany` | `WRITE` | B | - | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 160 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L194) | 194 | `deleteOrganization` | **EmailChange** | `deleteMany` | `WRITE` | B | - | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 161 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L198) | 198 | `deleteOrganization` | **Attendance** | `deleteMany` | `WRITE` | B | - | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 162 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L202) | 202 | `deleteOrganization` | **Session** | `deleteMany` | `WRITE` | B | - | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 163 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L210) | 210 | `deleteOrganization` | **Task** | `deleteMany` | `WRITE` | A | - | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 164 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L214) | 214 | `deleteOrganization` | **Project** | `deleteMany` | `WRITE` | A | - | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 165 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L218) | 218 | `deleteOrganization` | **Team** | `deleteMany` | `WRITE` | A | - | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 166 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L222) | 222 | `deleteOrganization` | **Invite** | `deleteMany` | `WRITE` | F | - | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 167 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L227) | 227 | `deleteOrganization` | **User** | `updateMany` | `WRITE` | E, F | - | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 168 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L242) | 242 | `deleteOrganization` | **User** | `deleteMany` | `WRITE` | E | - | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 169 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L247) | 247 | `deleteOrganization` | **Organization** | `findByIdAndDelete` | `WRITE` | E | - | - | `Organization Document | null` |
| 170 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L312) | 312 | `getTwoFactorSettings` | **Organization** | `findById` | `READ` | A | - | - | `Document | null` |
| 171 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L342) | 342 | `updateTwoFactorSettings` | **Organization** | `findById` | `READ` | A | - | - | `Document | null` |
| 172 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L369) | 369 | `getAppUpdateSettings` | **Organization** | `findById` | `READ` | A | - | - | `Document | null` |
| 173 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L426) | 426 | `updateAppUpdateSettings` | **Organization** | `findById` | `READ` | A | - | - | `Document | null` |
| 174 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L461) | 461 | `getEmailReportSettings` | **Organization** | `findById` | `READ` | A | - | - | `Document | null` |
| 175 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L533) | 533 | `updateEmailReportSettings` | **Organization** | `findById` | `READ` | A | - | - | `Document | null` |
| 176 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L571) | 571 | `getTaskManagementSettings` | **Organization** | `findById` | `READ` | A | - | - | `Document | null` |
| 177 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L609) | 609 | `updateTaskManagementSettings` | **Organization** | `findById` | `READ` | A | - | - | `Document | null` |
| 178 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L642) | 642 | `getOrganizationNotifications` | **Organization** | `findById` | `READ` | A | - | - | `Document | null` |
| 179 | [`src/controllers/organization.controller.js`](file:///src/controllers/organization.controller.js#L694) | 694 | `updateOrganizationNotifications` | **Organization** | `findByIdAndUpdate` | `WRITE` | F | - | - | `Organization Document | null` |
| 180 | [`src/controllers/project.controller.js`](file:///src/controllers/project.controller.js#L22) | 22 | `createProject` | **Project** | `create` | `WRITE` | A, G | Yes | - | `Project Document` |
| 181 | [`src/controllers/project.controller.js`](file:///src/controllers/project.controller.js#L54) | 54 | `getProjects` | **Project** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 182 | [`src/controllers/project.controller.js`](file:///src/controllers/project.controller.js#L60) | 60 | `getProjects` | **Project** | `create` | `WRITE` | A, G | Yes | - | `Project Document` |
| 183 | [`src/controllers/project.controller.js`](file:///src/controllers/project.controller.js#L74) | 74 | `getProjects` | **Task** | `updateMany` | `WRITE` | B, G | Yes | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 184 | [`src/controllers/project.controller.js`](file:///src/controllers/project.controller.js#L105) | 105 | `getProjects` | **User** | `find` | `READ` | A, G | Yes | - | `Array<User>` |
| 185 | [`src/controllers/project.controller.js`](file:///src/controllers/project.controller.js#L122) | 122 | `getProjects` | **Task** | `distinct` | `READ` | A, B, G | Yes | - | `Array<string>` |
| 186 | [`src/controllers/project.controller.js`](file:///src/controllers/project.controller.js#L142) | 142 | `getProjects` | **Project** | `find` | `READ` | A, C, G | Yes | users | `Array<Project>` |
| 187 | [`src/controllers/project.controller.js`](file:///src/controllers/project.controller.js#L151) | 151 | `getProjects` | **Task** | `countDocuments` | `READ` | A, G | Yes | - | `number` |
| 188 | [`src/controllers/project.controller.js`](file:///src/controllers/project.controller.js#L184) | 184 | `updateProject` | **Project** | `findByIdAndUpdate` | `WRITE` | A | - | - | `Project Document | null` |
| 189 | [`src/controllers/project.controller.js`](file:///src/controllers/project.controller.js#L212) | 212 | `deleteProject` | **Project** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 190 | [`src/controllers/project.controller.js`](file:///src/controllers/project.controller.js#L228) | 228 | `deleteProject` | **Task** | `deleteMany` | `WRITE` | G | Yes | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 191 | [`src/controllers/project.controller.js`](file:///src/controllers/project.controller.js#L232) | 232 | `deleteProject` | **Project** | `findByIdAndDelete` | `WRITE` | A | - | - | `Project Document | null` |
| 192 | [`src/controllers/projectTracking.controller.js`](file:///src/controllers/projectTracking.controller.js#L14) | 14 | `trackProject` | **Task** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 193 | [`src/controllers/projectTracking.controller.js`](file:///src/controllers/projectTracking.controller.js#L50) | 50 | `trackProject` | **ProjectTracking** | `create` | `WRITE` | A, G | Yes | - | `ProjectTracking Document` |
| 194 | [`src/controllers/projectTracking.controller.js`](file:///src/controllers/projectTracking.controller.js#L111) | 111 | `getProjectTracking` | **Project** | `find` | `READ` | A, C, G | Yes | users | `Array<Project>` |
| 195 | [`src/controllers/projectTracking.controller.js`](file:///src/controllers/projectTracking.controller.js#L139) | 139 | `getProjectTracking` | **ProjectTracking** | `find` | `READ` | A, C, G | Yes | user, task | `Array<ProjectTracking>` |
| 196 | [`src/controllers/projectTracking.controller.js`](file:///src/controllers/projectTracking.controller.js#L235) | 235 | `getTaskDetails` | **ProjectTracking** | `find` | `READ` | A, C, G | Yes | user | `Array<ProjectTracking>` |
| 197 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L118) | 118 | `createAttendanceOverviewReport` | **Report** | `create` | `WRITE` | A, G | Yes | - | `Report Document` |
| 198 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L139) | 139 | `createAttendanceOverviewReport` | **User** | `find` | `READ` | A, B, G | Yes | - | `Array<User>` |
| 199 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L154) | 154 | `createAttendanceOverviewReport` | **Session** | `find` | `READ` | A, G | Yes | - | `Array<Session>` |
| 200 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L218) | 218 | `getReports` | **Report** | `find` | `READ` | A, G | Yes | - | `Array<Report>` |
| 201 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L232) | 232 | `deleteReport` | **Report** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 202 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L254) | 254 | `deleteReport` | **Report** | `findByIdAndDelete` | `WRITE` | G | Yes | - | `Report Document | null` |
| 203 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L272) | 272 | `createAttendanceDetailedReport` | **Report** | `create` | `WRITE` | A, G | Yes | - | `Report Document` |
| 204 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L293) | 293 | `createAttendanceDetailedReport` | **User** | `find` | `READ` | A, B, G | Yes | - | `Array<User>` |
| 205 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L309) | 309 | `createAttendanceDetailedReport` | **Session** | `find` | `READ` | A, G | Yes | - | `Array<Session>` |
| 206 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L397) | 397 | `createUsageReport` | **Report** | `create` | `WRITE` | A, G | Yes | - | `Report Document` |
| 207 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L420) | 420 | `createUsageReport` | **User** | `find` | `READ` | A, B, G | Yes | - | `Array<User>` |
| 208 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L436) | 436 | `createUsageReport` | **AppUsage** | `find` | `READ` | A, G | Yes | - | `Array<AppUsage>` |
| 209 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L528) | 528 | `createProductivityReport` | **User** | `find` | `READ` | A, G | Yes | - | `Array<User>` |
| 210 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L530) | 530 | `createProductivityReport` | **Report** | `create` | `WRITE` | A, G | Yes | - | `Report Document` |
| 211 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L540) | 540 | `createProductivityReport` | **AppClassification** | `find` | `READ` | A, G | Yes | - | `Array<AppClassification>` |
| 212 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L562) | 562 | `createProductivityReport` | **AppUsage** | `find` | `READ` | A, G | Yes | - | `Array<AppUsage>` |
| 213 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L652) | 652 | `getProductivityReport` | **User** | `find` | `READ` | A, B, C, G | Yes | team | `Array<User>` |
| 214 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L667) | 667 | `getProductivityReport` | **Session** | `find` | `READ` | A, G | Yes | - | `Array<Session>` |
| 215 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L687) | 687 | `getProductivityReport` | **AppUsage** | `find` | `READ` | A | - | - | `Array<AppUsage>` |
| 216 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L692) | 692 | `getProductivityReport` | **AppClassification** | `find` | `READ` | A | - | - | `Array<AppClassification>` |
| 217 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L848) | 848 | `createProjectUserReport` | **Report** | `create` | `WRITE` | A, G | Yes | - | `Report Document` |
| 218 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L868) | 868 | `createProjectUserReport` | **User** | `find` | `READ` | A, B, G | Yes | - | `Array<User>` |
| 219 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L885) | 885 | `createProjectUserReport` | **ProjectTracking** | `find` | `READ` | A, C | - | user, project, task | `Array<ProjectTracking>` |
| 220 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L962) | 962 | `createProjectReport` | **Project** | `find` | `READ` | A, C, G | Yes | users | `Array<Project>` |
| 221 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L967) | 967 | `createProjectReport` | **Report** | `create` | `WRITE` | A, G | Yes | - | `Report Document` |
| 222 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L995) | 995 | `createProjectReport` | **ProjectTracking** | `find` | `READ` | A | - | - | `Array<ProjectTracking>` |
| 223 | [`src/controllers/report.controller.js`](file:///src/controllers/report.controller.js#L1058) | 1058 | `classifyApp` | **AppClassification** | `findOneAndUpdate` | `WRITE` | A | - | - | `AppClassification Document | null` |
| 224 | [`src/controllers/role.controller.js`](file:///src/controllers/role.controller.js#L6) | 6 | `getRoles` | **Role** | `find` | `READ` | A, B, G | Yes | - | `Array<Role>` |
| 225 | [`src/controllers/role.controller.js`](file:///src/controllers/role.controller.js#L13) | 13 | `getRoles` | **User** | `countDocuments` | `READ` | A, G | Yes | - | `number` |
| 226 | [`src/controllers/role.controller.js`](file:///src/controllers/role.controller.js#L47) | 47 | `updateRole` | **Role** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 227 | [`src/controllers/role.controller.js`](file:///src/controllers/role.controller.js#L85) | 85 | `getRoleById` | **Role** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 228 | [`src/controllers/role.controller.js`](file:///src/controllers/role.controller.js#L102) | 102 | `getRoleById` | **User** | `countDocuments` | `READ` | A, G | Yes | - | `number` |
| 229 | [`src/controllers/screenCapture.controller.js`](file:///src/controllers/screenCapture.controller.js#L6) | 6 | `getScreenCaptureSettings` | **TimeTrackingSettings** | `findOneAndUpdate` | `WRITE` | F | - | - | `TimeTrackingSettings Document | null` |
| 230 | [`src/controllers/screenCapture.controller.js`](file:///src/controllers/screenCapture.controller.js#L33) | 33 | `updateScreenCaptureSettings` | **TimeTrackingSettings** | `findOneAndUpdate` | `WRITE` | F | - | - | `TimeTrackingSettings Document | null` |
| 231 | [`src/controllers/screenshot.controller.js`](file:///src/controllers/screenshot.controller.js#L24) | 24 | `uploadScreenshot` | **Screenshot** | `create` | `WRITE` | A, G | Yes | - | `Screenshot Document` |
| 232 | [`src/controllers/screenshot.controller.js`](file:///src/controllers/screenshot.controller.js#L60) | 60 | `getScreenshots` | **User** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 233 | [`src/controllers/screenshot.controller.js`](file:///src/controllers/screenshot.controller.js#L70) | 70 | `getScreenshots` | **Role** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 234 | [`src/controllers/screenshot.controller.js`](file:///src/controllers/screenshot.controller.js#L93) | 93 | `getScreenshots` | **User** | `find` | `READ` | A, B, G | Yes | - | `Array<User>` |
| 235 | [`src/controllers/screenshot.controller.js`](file:///src/controllers/screenshot.controller.js#L116) | 116 | `getScreenshots` | **Screenshot** | `find` | `READ` | A, C | - | user | `Array<Screenshot>` |
| 236 | [`src/controllers/screenshot.controller.js`](file:///src/controllers/screenshot.controller.js#L147) | 147 | `getUserScreenshots` | **User** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 237 | [`src/controllers/screenshot.controller.js`](file:///src/controllers/screenshot.controller.js#L157) | 157 | `getUserScreenshots` | **Role** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 238 | [`src/controllers/screenshot.controller.js`](file:///src/controllers/screenshot.controller.js#L170) | 170 | `getUserScreenshots` | **User** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 239 | [`src/controllers/screenshot.controller.js`](file:///src/controllers/screenshot.controller.js#L211) | 211 | `getUserScreenshots` | **Screenshot** | `find` | `READ` | A | - | - | `Array<Screenshot>` |
| 240 | [`src/controllers/screenshot.controller.js`](file:///src/controllers/screenshot.controller.js#L231) | 231 | `exportScreenshotsZip` | **User** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 241 | [`src/controllers/screenshot.controller.js`](file:///src/controllers/screenshot.controller.js#L241) | 241 | `exportScreenshotsZip` | **Role** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 242 | [`src/controllers/screenshot.controller.js`](file:///src/controllers/screenshot.controller.js#L268) | 268 | `exportScreenshotsZip` | **User** | `find` | `READ` | A, G | Yes | - | `Array<User>` |
| 243 | [`src/controllers/screenshot.controller.js`](file:///src/controllers/screenshot.controller.js#L331) | 331 | `exportScreenshotsZip` | **Screenshot** | `find` | `READ` | A, C | - | user | `Array<Screenshot>` |
| 244 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L20) | 20 | `updateSessionScreenshotCount` | **Screenshot** | `countDocuments` | `READ` | A, B, E | - | - | `number` |
| 245 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L88) | 88 | `createSession` | **Session** | `create` | `WRITE` | A, E, G | Yes | - | `Session Document` |
| 246 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L117) | 117 | `getSessions` | **Session** | `find` | `READ` | A | - | - | `Array<Session>` |
| 247 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L156) | 156 | `deleteSessionsInRange` | **Mongoose / Session** | `startSession` | `TRANSACTION` | E | - | - | `ClientSession` |
| 248 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L160) | 160 | `deleteSessionsInRange` | **Session** | `find` | `READ` | A, G | Yes | - | `Array<Session>` |
| 249 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L215) | 215 | `deleteSessionsInRange` | **Session** | `deleteOne` | `WRITE` | A, E, G | Yes | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 250 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L273) | 273 | `deleteSessionsInRange` | **Session** | `deleteOne` | `WRITE` | A, E, G | Yes | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 251 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L275) | 275 | `deleteSessionsInRange` | **Session** | `create` | `WRITE` | A, E, G | Yes | - | `Session Document` |
| 252 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L279) | 279 | `deleteSessionsInRange` | **Session** | `create` | `WRITE` | A, E, G | Yes | - | `Session Document` |
| 253 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L290) | 290 | `deleteSessionsInRange` | **Screenshot** | `deleteMany` | `WRITE` | B, G | Yes | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 254 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L298) | 298 | `deleteSessionsInRange` | **Report** | `create` | `WRITE` | A, E, G | Yes | - | `Report Document` |
| 255 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L383) | 383 | `previewSessionsInRange` | **Session** | `find` | `READ` | A, G | Yes | - | `Array<Session>` |
| 256 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L486) | 486 | `getOverviewData` | **User** | `find` | `READ` | A, C, G | Yes | manager, team | `Array<User>` |
| 257 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L508) | 508 | `getOverviewData` | **Session** | `find` | `READ` | A | - | - | `Array<Session>` |
| 258 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L577) | 577 | `getTodaySummary` | **Session** | `find` | `READ` | A, B, G | Yes | - | `Array<Session>` |
| 259 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L608) | 608 | `getWorkTimeStats` | **User** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 260 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L652) | 652 | `getWorkTimeStats` | **Session** | `find` | `READ` | A | - | - | `Array<Session>` |
| 261 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L761) | 761 | `getTodayChartData` | **Session** | `find` | `READ` | A, B | - | - | `Array<Session>` |
| 262 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L884) | 884 | `getLast30DaysChart` | **Session** | `find` | `READ` | A, B | - | - | `Array<Session>` |
| 263 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L992) | 992 | `getTodayTaskSummary` | **Task** | `countDocuments` | `READ` | A, B | - | - | `number` |
| 264 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L998) | 998 | `getTodayTaskSummary` | **ProjectTracking** | `find` | `READ` | A, B | - | - | `Array<ProjectTracking>` |
| 265 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L1013) | 1013 | `getTodayTaskSummary` | **Session** | `find` | `READ` | A | - | - | `Array<Session>` |
| 266 | [`src/controllers/session.controller.js`](file:///src/controllers/session.controller.js#L1022) | 1022 | `getTodayTaskSummary` | **Activity** | `find` | `READ` | A, B | - | - | `Array<Activity>` |
| 267 | [`src/controllers/settings.controller.js`](file:///src/controllers/settings.controller.js#L11) | 11 | `updateProfile` | **User** | `findByIdAndUpdate` | `WRITE` | G | Yes | - | `User Document | null` |
| 268 | [`src/controllers/settings.controller.js`](file:///src/controllers/settings.controller.js#L61) | 61 | `changePassword` | **User** | `findByIdAndUpdate` | `WRITE` | G | Yes | - | `User Document | null` |
| 269 | [`src/controllers/settings.controller.js`](file:///src/controllers/settings.controller.js#L79) | 79 | `updatePreferences` | **User** | `findByIdAndUpdate` | `WRITE` | G | Yes | - | `User Document | null` |
| 270 | [`src/controllers/settings.controller.js`](file:///src/controllers/settings.controller.js#L113) | 113 | `uploadAvatar` | **User** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 271 | [`src/controllers/shift.controller.js`](file:///src/controllers/shift.controller.js#L5) | 5 | `getShiftSettings` | **TimeTrackingSettings** | `findOneAndUpdate` | `WRITE` | F | - | - | `TimeTrackingSettings Document | null` |
| 272 | [`src/controllers/shift.controller.js`](file:///src/controllers/shift.controller.js#L88) | 88 | `updateShiftSettings` | **TimeTrackingSettings** | `findOneAndUpdate` | `WRITE` | F | - | - | `TimeTrackingSettings Document | null` |
| 273 | [`src/controllers/slack.controller.js`](file:///src/controllers/slack.controller.js#L80) | 80 | `slackCallback` | **Integration** | `findOneAndUpdate` | `WRITE` | A | - | - | `Integration Document | null` |
| 274 | [`src/controllers/slack.controller.js`](file:///src/controllers/slack.controller.js#L98) | 98 | `slackCallback` | **User** | `findByIdAndUpdate` | `WRITE` | A | - | - | `User Document | null` |
| 275 | [`src/controllers/slack.controller.js`](file:///src/controllers/slack.controller.js#L116) | 116 | `getSlackIntegration` | **Integration** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 276 | [`src/controllers/slack.controller.js`](file:///src/controllers/slack.controller.js#L133) | 133 | `disconnectSlack` | **Integration** | `findOneAndUpdate` | `WRITE` | G | Yes | - | `Integration Document | null` |
| 277 | [`src/controllers/slack.controller.js`](file:///src/controllers/slack.controller.js#L161) | 161 | `getSlackChannels` | **Integration** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 278 | [`src/controllers/slack.controller.js`](file:///src/controllers/slack.controller.js#L213) | 213 | `saveSlackChannel` | **Integration** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 279 | [`src/controllers/slack.controller.js`](file:///src/controllers/slack.controller.js#L245) | 245 | `sendTestSlackMessage` | **Integration** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 280 | [`src/controllers/slack.controller.js`](file:///src/controllers/slack.controller.js#L283) | 283 | `updateSlackNotifications` | **Integration** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 281 | [`src/controllers/sync.controller.js`](file:///src/controllers/sync.controller.js#L5) | 5 | `getSyncStatus` | **SyncStatus** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 282 | [`src/controllers/sync.controller.js`](file:///src/controllers/sync.controller.js#L10) | 10 | `getSyncStatus` | **SyncStatus** | `create` | `WRITE` | A, G | Yes | - | `SyncStatus Document` |
| 283 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L32) | 32 | `getTaskAccessScope` | **User** | `find` | `READ` | A, G | Yes | - | `Array<User>` |
| 284 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L78) | 78 | `createTask` | **Project** | `findById` | `READ` | A | - | - | `Document | null` |
| 285 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L93) | 93 | `createTask` | **Integration** | `findOne` | `READ` | A | - | - | `Document | null` |
| 286 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L146) | 146 | `createTask` | **Integration** | `findOne` | `READ` | A | - | - | `Document | null` |
| 287 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L165) | 165 | `createTask` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 288 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L199) | 199 | `createTask` | **Task** | `create` | `WRITE` | A | - | - | `Task Document` |
| 289 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L219) | 219 | `createTask` | **User** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 290 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L257) | 257 | `getTasks` | **Task** | `find` | `READ` | A, C, G | Yes | assignedTo, project | `Array<Task>` |
| 291 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L289) | 289 | `getRecentlyDeletedTasks` | **Task** | `find` | `READ` | A, C, G | Yes | assignedTo, project, deletedBy | `Array<Task>` |
| 292 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L329) | 329 | `restoreTask` | **Task** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 293 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L370) | 370 | `permanentlyDeleteTask` | **Task** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 294 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L382) | 382 | `permanentlyDeleteTask` | **Task** | `deleteOne` | `WRITE` | A, G | Yes | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 295 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L414) | 414 | `updateTask` | **Task** | `findOne` | `READ` | A | - | - | `Document | null` |
| 296 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L434) | 434 | `updateTask` | **User** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 297 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L462) | 462 | `updateTask` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 298 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L466) | 466 | `updateTask` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 299 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L470) | 470 | `updateTask` | **Project** | `findById` | `READ` | A | - | - | `Document | null` |
| 300 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L539) | 539 | `updateTask` | **Integration** | `findOne` | `READ` | A | - | - | `Document | null` |
| 301 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L581) | 581 | `updateTask` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 302 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L651) | 651 | `updateTask` | **Integration** | `findOne` | `READ` | A | - | - | `Document | null` |
| 303 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L674) | 674 | `updateTask` | **User** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 304 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L748) | 748 | `deleteTask` | **Task** | `findOne` | `READ` | A | - | - | `Document | null` |
| 305 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L757) | 757 | `deleteTask` | **Integration** | `findOne` | `READ` | A | - | - | `Document | null` |
| 306 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L791) | 791 | `deleteTask` | **Integration** | `findOne` | `READ` | A | - | - | `Document | null` |
| 307 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L854) | 854 | `deleteMultipleTasks` | **Task** | `find` | `READ` | A, B, G | Yes | - | `Array<Task>` |
| 308 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L861) | 861 | `deleteMultipleTasks` | **Integration** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 309 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L892) | 892 | `deleteMultipleTasks` | **Integration** | `findOne` | `READ` | A | - | - | `Document | null` |
| 310 | [`src/controllers/task.controller.js`](file:///src/controllers/task.controller.js#L922) | 922 | `deleteMultipleTasks` | **Task** | `updateMany` | `WRITE` | B, F, G | Yes | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 311 | [`src/controllers/team.controller.js`](file:///src/controllers/team.controller.js#L13) | 13 | `createTeam` | **Team** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 312 | [`src/controllers/team.controller.js`](file:///src/controllers/team.controller.js#L24) | 24 | `createTeam` | **Team** | `create` | `WRITE` | A, G | Yes | - | `Team Document` |
| 313 | [`src/controllers/team.controller.js`](file:///src/controllers/team.controller.js#L48) | 48 | `getTeams` | **Team** | `find` | `READ` | A, G | Yes | - | `Array<Team>` |
| 314 | [`src/controllers/team.controller.js`](file:///src/controllers/team.controller.js#L74) | 74 | `updateTeam` | **Team** | `findById` | `READ` | A | - | - | `Document | null` |
| 315 | [`src/controllers/team.controller.js`](file:///src/controllers/team.controller.js#L104) | 104 | `deleteTeam` | **Team** | `findById` | `READ` | A | - | - | `Document | null` |
| 316 | [`src/controllers/timeTrackingSettings.controller.js`](file:///src/controllers/timeTrackingSettings.controller.js#L8) | 8 | `getTimeTrackingSettings` | **TimeTrackingSettings** | `findOneAndUpdate` | `WRITE` | F | - | - | `TimeTrackingSettings Document | null` |
| 317 | [`src/controllers/timeTrackingSettings.controller.js`](file:///src/controllers/timeTrackingSettings.controller.js#L35) | 35 | `updateTimeTrackingSettings` | **TimeTrackingSettings** | `findOneAndUpdate` | `WRITE` | A | - | - | `TimeTrackingSettings Document | null` |
| 318 | [`src/controllers/timeTrackingSettings.controller.js`](file:///src/controllers/timeTrackingSettings.controller.js#L69) | 69 | `getEffectiveTimeTrackingSettings` | **TimeTrackingSettings** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 319 | [`src/controllers/timeTrackingSettings.controller.js`](file:///src/controllers/timeTrackingSettings.controller.js#L73) | 73 | `getEffectiveTimeTrackingSettings` | **User** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 320 | [`src/controllers/usage.controller.js`](file:///src/controllers/usage.controller.js#L44) | 44 | `getTopApps` | **AppUsage** | `find` | `READ` | A | - | - | `Array<AppUsage>` |
| 321 | [`src/controllers/usage.controller.js`](file:///src/controllers/usage.controller.js#L75) | 75 | `trackAppUsage` | **AppClassification** | `findOne` | `READ` | A | - | - | `Document | null` |
| 322 | [`src/controllers/usage.controller.js`](file:///src/controllers/usage.controller.js#L120) | 120 | `excludedTeams` | **User** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 323 | [`src/controllers/usage.controller.js`](file:///src/controllers/usage.controller.js#L136) | 136 | `excludedTeams` | **AppUsage** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 324 | [`src/controllers/usage.controller.js`](file:///src/controllers/usage.controller.js#L148) | 148 | `excludedTeams` | **AppUsage** | `create` | `WRITE` | A, G | Yes | - | `AppUsage Document` |
| 325 | [`src/controllers/usage.controller.js`](file:///src/controllers/usage.controller.js#L157) | 157 | `excludedTeams` | **UsageLog** | `create` | `WRITE` | A, G | Yes | - | `UsageLog Document` |
| 326 | [`src/controllers/usage.controller.js`](file:///src/controllers/usage.controller.js#L218) | 218 | `getUsageData` | **User** | `find` | `READ` | A, G | Yes | - | `Array<User>` |
| 327 | [`src/controllers/usage.controller.js`](file:///src/controllers/usage.controller.js#L237) | 237 | `getUsageData` | **Session** | `find` | `READ` | A, G | Yes | - | `Array<Session>` |
| 328 | [`src/controllers/usage.controller.js`](file:///src/controllers/usage.controller.js#L258) | 258 | `getUsageData` | **AppUsage** | `find` | `READ` | A, G | Yes | - | `Array<AppUsage>` |
| 329 | [`src/controllers/usage.controller.js`](file:///src/controllers/usage.controller.js#L353) | 353 | `getUsageDetails` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 330 | [`src/controllers/usage.controller.js`](file:///src/controllers/usage.controller.js#L376) | 376 | `getUsageDetails` | **UsageLog** | `find` | `READ` | A | - | - | `Array<UsageLog>` |
| 331 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L31) | 31 | `getUsers` | **User** | `find` | `READ` | A, B, C, G | Yes | team, manager | `Array<User>` |
| 332 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L39) | 39 | `getUsers` | **User** | `find` | `READ` | A, B, C | - | team, manager | `Array<User>` |
| 333 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L49) | 49 | `getUsers` | **User** | `find` | `READ` | A, B, C, G | Yes | team, manager | `Array<User>` |
| 334 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L58) | 58 | `getUsers` | **User** | `find` | `READ` | A, C, G | Yes | team, manager | `Array<User>` |
| 335 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L78) | 78 | `getUsers` | **User** | `countDocuments` | `READ` | A, B, G | Yes | - | `number` |
| 336 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L83) | 83 | `getUsers` | **User** | `distinct` | `READ` | A, B, G | Yes | - | `Array<string>` |
| 337 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L146) | 146 | `inviteUser` | **User** | `findOne` | `READ` | A | - | - | `Document | null` |
| 338 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L160) | 160 | `inviteUser` | **Invite** | `findOne` | `READ` | A | - | - | `Document | null` |
| 339 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L178) | 178 | `inviteUser` | **Role** | `findOne` | `READ` | A | - | - | `Document | null` |
| 340 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L192) | 192 | `inviteUser` | **Team** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 341 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L216) | 216 | `inviteUser` | **Invite** | `create` | `WRITE` | A, G | Yes | - | `Invite Document` |
| 342 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L230) | 230 | `inviteUser` | **Organization** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 343 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L258) | 258 | `inviteUser` | **Invite** | `findByIdAndDelete` | `WRITE` | G | Yes | - | `Invite Document | null` |
| 344 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L304) | 304 | `createUser` | **User** | `findOne` | `READ` | A | - | - | `Document | null` |
| 345 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L320) | 320 | `normalizedRole` | **Role** | `findOne` | `READ` | A | - | - | `Document | null` |
| 346 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L335) | 335 | `normalizedRole` | **Team** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 347 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L349) | 349 | `normalizedRole` | **Team** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 348 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L358) | 358 | `normalizedRole` | **User** | `create` | `WRITE` | A, G | Yes | - | `User Document` |
| 349 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L407) | 407 | `acceptInvite` | **Invite** | `findOne` | `READ` | A | - | - | `Document | null` |
| 350 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L429) | 429 | `acceptInvite` | **User** | `findOne` | `READ` | A | - | - | `Document | null` |
| 351 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L442) | 442 | `acceptInvite` | **Role** | `findOne` | `READ` | A | - | - | `Document | null` |
| 352 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L453) | 453 | `acceptInvite` | **User** | `create` | `WRITE` | A, G | Yes | - | `User Document` |
| 353 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L491) | 491 | `getInviteDetails` | **Invite** | `findOne` | `READ` | A, C | - | team | `Document | null` |
| 354 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L530) | 530 | `getInvites` | **Invite** | `find` | `READ` | A, B | - | - | `Array<Invite>` |
| 355 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L575) | 575 | `updateUserRole` | **User** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 356 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L608) | 608 | `updateUserRole` | **Role** | `findOne` | `READ` | A | - | - | `Document | null` |
| 357 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L666) | 666 | `deleteUser` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 358 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L691) | 691 | `deleteUser` | **Invite** | `findById` | `READ` | A | - | - | `Document | null` |
| 359 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L732) | 732 | `resendInvite` | **Invite** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 360 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L745) | 745 | `resendInvite` | **Role** | `findOne` | `READ` | A | - | - | `Document | null` |
| 361 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L757) | 757 | `resendInvite` | **Team** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 362 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L771) | 771 | `resendInvite` | **Organization** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 363 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L859) | 859 | `getUserProfile` | **User** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 364 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L881) | 881 | `getUserProfile` | **User** | `findOne` | `READ` | A, C, G | Yes | manager, team | `Document | null` |
| 365 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L967) | 967 | `skip` | **Team** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 366 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L982) | 982 | `skip` | **User** | `find` | `READ` | A, C, G | Yes | team, manager | `Array<User>` |
| 367 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L988) | 988 | `skip` | **Invite** | `find` | `READ` | A, G | Yes | - | `Array<Invite>` |
| 368 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L997) | 997 | `skip` | **User** | `countDocuments` | `READ` | A, B, G | Yes | - | `number` |
| 369 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1001) | 1001 | `skip` | **User** | `distinct` | `READ` | A, B, G | Yes | - | `Array<string>` |
| 370 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1118) | 1118 | `bulkInvitesUsers` | **Team** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 371 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1132) | 1132 | `bulkInvitesUsers` | **Role** | `findOne` | `READ` | A | - | - | `Document | null` |
| 372 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1146) | 1146 | `bulkInvitesUsers` | **Organization** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 373 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1196) | 1196 | `bulkInvitesUsers` | **User** | `findOne` | `READ` | A | - | - | `Document | null` |
| 374 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1213) | 1213 | `bulkInvitesUsers` | **Invite** | `findOne` | `READ` | A | - | - | `Document | null` |
| 375 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1242) | 1242 | `bulkInvitesUsers` | **Invite** | `create` | `WRITE` | A, G | Yes | - | `Invite Document` |
| 376 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1279) | 1279 | `bulkInvitesUsers` | **Invite** | `findByIdAndDelete` | `WRITE` | G | Yes | - | `Invite Document | null` |
| 377 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1316) | 1316 | `updateUser` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 378 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1333) | 1333 | `updateUser` | **Team** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 379 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1383) | 1383 | `updateUserEmail` | **User** | `findOne` | `READ` | A, B, G | Yes | - | `Document | null` |
| 380 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1394) | 1394 | `updateUserEmail` | **User** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 381 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1434) | 1434 | `requestEmailChange` | **User** | `findOne` | `READ` | A | - | - | `Document | null` |
| 382 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1445) | 1445 | `requestEmailChange` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 383 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1462) | 1462 | `requestEmailChange` | **EmailChange** | `deleteMany` | `WRITE` | G | Yes | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 384 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1467) | 1467 | `requestEmailChange` | **EmailChange** | `create` | `WRITE` | A, G | Yes | - | `EmailChange Document` |
| 385 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1497) | 1497 | `verifyEmailChange` | **EmailChange** | `findOne` | `READ` | A | - | - | `Document | null` |
| 386 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1513) | 1513 | `verifyEmailChange` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 387 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1544) | 1544 | `archiveUser` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 388 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1584) | 1584 | `unarchiveUser` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 389 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1628) | 1628 | `updateInviteRole` | **Invite** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 390 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1640) | 1640 | `updateInviteRole` | **Role** | `findOne` | `READ` | A | - | - | `Document | null` |
| 391 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1671) | 1671 | `getUserDevices` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 392 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1710) | 1710 | `registerUserDevice` | **User** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 393 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1766) | 1766 | `logoutUserDevice` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 394 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1804) | 1804 | `checkUserDevice` | **User** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 395 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1845) | 1845 | `updateUserDeviceTracking` | **User** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 396 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1884) | 1884 | `assignManager` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 397 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1897) | 1897 | `assignManager` | **Team** | `find` | `READ` | A, B, G | Yes | - | `Array<Team>` |
| 398 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1904) | 1904 | `assignManager` | **User** | `find` | `READ` | A, B, G | Yes | - | `Array<User>` |
| 399 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1917) | 1917 | `assignManager` | **User** | `find` | `READ` | A, B, G | Yes | - | `Array<User>` |
| 400 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1928) | 1928 | `assignManager` | **User** | `updateMany` | `WRITE` | B, F, G | Yes | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 401 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1942) | 1942 | `assignManager` | **User** | `updateMany` | `WRITE` | B, F, G | Yes | - | `{ acknowledged: boolean, modifiedCount: number }` |
| 402 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1969) | 1969 | `getManagerAssignments` | **User** | `findById` | `READ` | A, G | Yes | - | `Document | null` |
| 403 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L1978) | 1978 | `getManagerAssignments` | **User** | `find` | `READ` | A, C, G | Yes | team | `Array<User>` |
| 404 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L2005) | 2005 | `exportUsersCsv` | **User** | `find` | `READ` | A | - | - | `Array<User>` |
| 405 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L2041) | 2041 | `exportUsersHierarchy` | **User** | `find` | `READ` | A, C | - | manager | `Array<User>` |
| 406 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L2082) | 2082 | `exportManagersHierarchy` | **User** | `find` | `READ` | A, G | Yes | - | `Array<User>` |
| 407 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L2089) | 2089 | `exportManagersHierarchy` | **User** | `countDocuments` | `READ` | A, G | Yes | - | `number` |
| 408 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L2127) | 2127 | `exportDevices` | **User** | `find` | `READ` | A | - | - | `Array<User>` |
| 409 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L2245) | 2245 | `importUsers` | **User** | `findOne` | `READ` | A | - | - | `Document | null` |
| 410 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L2257) | 2257 | `importUsers` | **Invite** | `findOne` | `READ` | A | - | - | `Document | null` |
| 411 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L2280) | 2280 | `importUsers` | **Invite** | `create` | `WRITE` | A, G | Yes | - | `Invite Document` |
| 412 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L2318) | 2318 | `exportUsers` | **User** | `find` | `READ` | A, C, G | Yes | manager | `Array<User>` |
| 413 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L2443) | 2443 | `updateUserSetting` | **User** | `findOne` | `READ` | A, G | Yes | - | `Document | null` |
| 414 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L2472) | 2472 | `updateUserSetting` | **Organization** | `findById` | `READ` | A | - | - | `Document | null` |
| 415 | [`src/controllers/user.controller.js`](file:///src/controllers/user.controller.js#L2536) | 2536 | `updateUserShiftSettings` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 416 | [`src/cron/emailReports.cron.js`](file:///src/cron/emailReports.cron.js#L18) | 18 | `top-level / anonymous` | **User** | `find` | `READ` | A, G | Yes | - | `Array<User>` |
| 417 | [`src/middleware/apiKeyAuth.js`](file:///src/middleware/apiKeyAuth.js#L18) | 18 | `apiKeyAuth` | **ApiKey** | `findOne` | `READ` | A, C | - | organization | `Document | null` |
| 418 | [`src/middleware/apiLogger.js`](file:///src/middleware/apiLogger.js#L11) | 11 | `apiLogger` | **ApiLog** | `create` | `WRITE` | A, G | Yes | - | `ApiLog Document` |
| 419 | [`src/middleware/auth.middleware.js`](file:///src/middleware/auth.middleware.js#L22) | 22 | `protect` | **User** | `findById` | `READ` | A, C | - | organization | `Document | null` |
| 420 | [`src/middleware/permission.middleware.js`](file:///src/middleware/permission.middleware.js#L14) | 14 | `hasPermission` | **Role** | `findById` | `READ` | A | - | - | `Document | null` |
| 421 | [`src/routes/authRoutes.js`](file:///src/routes/authRoutes.js#L52) | 52 | `top-level / anonymous` | **User** | `findById` | `READ` | A, C, G | Yes | organization, reportTeam | `Document | null` |
| 422 | [`src/routes/authRoutes.js`](file:///src/routes/authRoutes.js#L63) | 63 | `top-level / anonymous` | **Role** | `findById` | `READ` | A | - | - | `Document | null` |
| 423 | [`src/routes/timerRoutes.js`](file:///src/routes/timerRoutes.js#L9) | 9 | `top-level / anonymous` | **Timer** | `findOne` | `READ` | A, C | - | project, task | `Document | null` |
| 424 | [`src/routes/timerRoutes.js`](file:///src/routes/timerRoutes.js#L25) | 25 | `top-level / anonymous` | **Timer** | `findOne` | `READ` | A, C | - | project, task | `Document | null` |
| 425 | [`src/services/billingSeat.service.js`](file:///src/services/billingSeat.service.js#L4) | 4 | `getOrganizationSeatCount` | **User** | `countDocuments` | `READ` | A | - | - | `number` |
| 426 | [`src/services/dailyReport.service.js`](file:///src/services/dailyReport.service.js#L27) | 27 | `generateDailyWorkReport` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 427 | [`src/services/dailyReport.service.js`](file:///src/services/dailyReport.service.js#L52) | 52 | `generateDailyWorkReport` | **Session** | `find` | `READ` | A | - | - | `Array<Session>` |
| 428 | [`src/services/dailyReport.service.js`](file:///src/services/dailyReport.service.js#L84) | 84 | `generateDailyWorkReport` | **Activity** | `find` | `READ` | A | - | - | `Array<Activity>` |
| 429 | [`src/services/dailyReport.service.js`](file:///src/services/dailyReport.service.js#L110) | 110 | `generateDailyWorkReport` | **Screenshot** | `find` | `READ` | A, B | - | - | `Array<Screenshot>` |
| 430 | [`src/services/dailyReport.service.js`](file:///src/services/dailyReport.service.js#L136) | 136 | `generateDailyWorkReport` | **ProjectTracking** | `find` | `READ` | A, C, G | Yes | project, task | `Array<ProjectTracking>` |
| 431 | [`src/services/dailySummary.scheduler.js`](file:///src/services/dailySummary.scheduler.js#L11) | 11 | `startDailySummaryScheduler` | **Integration** | `find` | `READ` | A | - | - | `Array<Integration>` |
| 432 | [`src/services/dailySummary.scheduler.js`](file:///src/services/dailySummary.scheduler.js#L32) | 32 | `startDailySummaryScheduler` | **User** | `findOne` | `READ` | A | - | - | `Document | null` |
| 433 | [`src/services/emailReport.service.js`](file:///src/services/emailReport.service.js#L11) | 11 | `checkDailyWarning` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 434 | [`src/services/emailReport.service.js`](file:///src/services/emailReport.service.js#L17) | 17 | `checkDailyWarning` | **Organization** | `findById` | `READ` | A | - | - | `Document | null` |
| 435 | [`src/services/emailReport.service.js`](file:///src/services/emailReport.service.js#L41) | 41 | `checkDailyWarning` | **TimeTrackingSettings** | `findOne` | `READ` | A | - | - | `Document | null` |
| 436 | [`src/services/emailReport.service.js`](file:///src/services/emailReport.service.js#L106) | 106 | `breakSeconds` | **Session** | `find` | `READ` | A | - | - | `Array<Session>` |
| 437 | [`src/services/emailReport.service.js`](file:///src/services/emailReport.service.js#L151) | 151 | `checkWeeklyWarning` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 438 | [`src/services/emailReport.service.js`](file:///src/services/emailReport.service.js#L157) | 157 | `checkWeeklyWarning` | **Organization** | `findById` | `READ` | A | - | - | `Document | null` |
| 439 | [`src/services/emailReport.service.js`](file:///src/services/emailReport.service.js#L176) | 176 | `checkWeeklyWarning` | **TimeTrackingSettings** | `findOne` | `READ` | A | - | - | `Document | null` |
| 440 | [`src/services/emailReport.service.js`](file:///src/services/emailReport.service.js#L251) | 251 | `breakSeconds` | **Session** | `find` | `READ` | A, B | - | - | `Array<Session>` |
| 441 | [`src/services/notification.service.js`](file:///src/services/notification.service.js#L25) | 25 | `sendSlackNotification` | **Integration** | `findOne` | `READ` | A | - | - | `Document | null` |
| 442 | [`src/services/notification.service.js`](file:///src/services/notification.service.js#L99) | 99 | `notifyTaskAssigned` | **Organization** | `findById` | `READ` | A | - | - | `Document | null` |
| 443 | [`src/services/notification.service.js`](file:///src/services/notification.service.js#L106) | 106 | `notifyTaskAssigned` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 444 | [`src/services/notification.service.js`](file:///src/services/notification.service.js#L371) | 371 | `createNotification` | **Notification** | `create` | `WRITE` | A | - | - | `Notification Document` |
| 445 | [`src/services/report.service.js`](file:///src/services/report.service.js#L15) | 15 | `getDailySummary` | **Task** | `countDocuments` | `READ` | A, B, G | Yes | - | `number` |
| 446 | [`src/services/report.service.js`](file:///src/services/report.service.js#L23) | 23 | `getDailySummary` | **Task** | `countDocuments` | `READ` | A, B | - | - | `number` |
| 447 | [`src/services/report.service.js`](file:///src/services/report.service.js#L32) | 32 | `getDailySummary` | **User** | `find` | `READ` | A, B, G | Yes | - | `Array<User>` |
| 448 | [`src/services/report.service.js`](file:///src/services/report.service.js#L41) | 41 | `getDailySummary` | **Session** | `distinct` | `READ` | A, B, G | Yes | - | `Array<string>` |
| 449 | [`src/services/report.service.js`](file:///src/services/report.service.js#L51) | 51 | `getDailySummary` | **Session** | `aggregate` | `READ` | B, D | - | - | `Array<Session>` |
| 450 | [`src/services/report.service.js`](file:///src/services/report.service.js#L74) | 74 | `getDailySummary` | **Session** | `aggregate` | `READ` | B, D, G | Yes | - | `Array<Session>` |
| 451 | [`src/services/report.service.js`](file:///src/services/report.service.js#L111) | 111 | `getDailySummary` | **Session** | `aggregate` | `READ` | B, D | - | - | `Array<Session>` |
| 452 | [`src/services/report.service.js`](file:///src/services/report.service.js#L180) | 180 | `getWeeklySummary` | **User** | `find` | `READ` | A, B, G | Yes | - | `Array<User>` |
| 453 | [`src/services/report.service.js`](file:///src/services/report.service.js#L187) | 187 | `getWeeklySummary` | **Task** | `countDocuments` | `READ` | A, B, G | Yes | - | `number` |
| 454 | [`src/services/report.service.js`](file:///src/services/report.service.js#L195) | 195 | `getWeeklySummary` | **Task** | `countDocuments` | `READ` | A, B, G | Yes | - | `number` |
| 455 | [`src/services/report.service.js`](file:///src/services/report.service.js#L204) | 204 | `getWeeklySummary` | **Session** | `distinct` | `READ` | A, B | - | - | `Array<string>` |
| 456 | [`src/services/report.service.js`](file:///src/services/report.service.js#L212) | 212 | `getWeeklySummary` | **Session** | `aggregate` | `READ` | B, D | - | - | `Array<Session>` |
| 457 | [`src/services/report.service.js`](file:///src/services/report.service.js#L240) | 240 | `getWeeklySummary` | **Session** | `aggregate` | `READ` | B, D | - | - | `Array<Session>` |
| 458 | [`src/services/report.service.js`](file:///src/services/report.service.js#L268) | 268 | `getWeeklySummary` | **Session** | `aggregate` | `READ` | B, D | - | - | `Array<Session>` |
| 459 | [`src/services/reportBuilder.service.js`](file:///src/services/reportBuilder.service.js#L44) | 44 | `buildDailyReport` | **Session** | `find` | `READ` | A | - | - | `Array<Session>` |
| 460 | [`src/services/reportBuilder.service.js`](file:///src/services/reportBuilder.service.js#L69) | 69 | `buildDailyReport` | **Activity** | `find` | `READ` | A | - | - | `Array<Activity>` |
| 461 | [`src/services/reportBuilder.service.js`](file:///src/services/reportBuilder.service.js#L80) | 80 | `buildDailyReport` | **Screenshot** | `find` | `READ` | A, B | - | - | `Array<Screenshot>` |
| 462 | [`src/services/reportBuilder.service.js`](file:///src/services/reportBuilder.service.js#L107) | 107 | `buildDailyReport` | **AppUsage** | `find` | `READ` | A | - | - | `Array<AppUsage>` |
| 463 | [`src/services/reportBuilder.service.js`](file:///src/services/reportBuilder.service.js#L117) | 117 | `buildDailyReport` | **UsageLog** | `find` | `READ` | A, B | - | - | `Array<UsageLog>` |
| 464 | [`src/services/reportBuilder.service.js`](file:///src/services/reportBuilder.service.js#L129) | 129 | `buildDailyReport` | **Project** | `find` | `READ` | A, G | Yes | - | `Array<Project>` |
| 465 | [`src/services/reportBuilder.service.js`](file:///src/services/reportBuilder.service.js#L138) | 138 | `buildDailyReport` | **Task** | `find` | `READ` | A | - | - | `Array<Task>` |
| 466 | [`src/services/reportRecipient.service.js`](file:///src/services/reportRecipient.service.js#L7) | 7 | `getTrackingReportRecipients` | **User** | `find` | `READ` | A, G | Yes | - | `Array<User>` |
| 467 | [`src/services/reportRecipient.service.js`](file:///src/services/reportRecipient.service.js#L13) | 13 | `getTrackingReportRecipients` | **User** | `find` | `READ` | A, G | Yes | - | `Array<User>` |
| 468 | [`src/services/slack.service.js`](file:///src/services/slack.service.js#L11) | 11 | `sendSlackMessage` | **Integration** | `findOne` | `READ` | A | - | - | `Document | null` |
| 469 | [`src/services/stripeCheckoutSync.service.js`](file:///src/services/stripeCheckoutSync.service.js#L42) | 42 | `syncStripeCheckoutSession` | **Subscription** | `findOneAndUpdate` | `WRITE` | F | - | - | `Subscription Document | null` |
| 470 | [`src/services/stripeCustomer.service.js`](file:///src/services/stripeCustomer.service.js#L19) | 19 | `getOrCreateStripeCustomer` | **BillingProfile** | `findOne` | `READ` | A | - | - | `Document | null` |
| 471 | [`src/services/trackingNotification.scheduler.js`](file:///src/services/trackingNotification.scheduler.js#L110) | 110 | `isSameEventAlreadyCreated` | **Notification** | `exists` | `READ` | A | - | - | `boolean | { _id: string }` |
| 472 | [`src/services/trackingNotification.scheduler.js`](file:///src/services/trackingNotification.scheduler.js#L224) | 224 | `getWorkedSecondsToday` | **Session** | `find` | `READ` | A | - | - | `Array<Session>` |
| 473 | [`src/services/trackingNotification.scheduler.js`](file:///src/services/trackingNotification.scheduler.js#L447) | 447 | `startTrackingNotificationScheduler` | **User** | `find` | `READ` | A, B | - | - | `Array<User>` |
| 474 | [`src/services/trackingNotification.scheduler.js`](file:///src/services/trackingNotification.scheduler.js#L462) | 462 | `startTrackingNotificationScheduler` | **Organization** | `find` | `READ` | A, B, G | Yes | - | `Array<Organization>` |
| 475 | [`src/services/trackingNotification.scheduler.js`](file:///src/services/trackingNotification.scheduler.js#L468) | 468 | `startTrackingNotificationScheduler` | **TimeTrackingSettings** | `find` | `READ` | A, B, G | Yes | - | `Array<TimeTrackingSettings>` |
| 476 | [`src/services/trackingReport.service.js`](file:///src/services/trackingReport.service.js#L11) | 11 | `sendDailyTrackingReports` | **User** | `find` | `READ` | A, C | - | organization | `Array<User>` |
| 477 | [`src/services/trackingReport.service.js`](file:///src/services/trackingReport.service.js#L62) | 62 | `sendDailyTrackingReports` | **User** | `find` | `READ` | A, B, G | Yes | - | `Array<User>` |
| 478 | [`src/services/trackingReport.service.js`](file:///src/services/trackingReport.service.js#L93) | 93 | `sendDailyTrackingReports` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 479 | [`src/services/trackingReport.service.js`](file:///src/services/trackingReport.service.js#L128) | 128 | `sendDailyTrackingReports` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 480 | [`src/services/weeklyReportBuilder.service.js`](file:///src/services/weeklyReportBuilder.service.js#L44) | 44 | `buildWeeklyReport` | **Session** | `find` | `READ` | A, B | - | - | `Array<Session>` |
| 481 | [`src/services/weeklyReportBuilder.service.js`](file:///src/services/weeklyReportBuilder.service.js#L83) | 83 | `buildWeeklyReport` | **Screenshot** | `find` | `READ` | A, B | - | - | `Array<Screenshot>` |
| 482 | [`src/services/weeklyReportBuilder.service.js`](file:///src/services/weeklyReportBuilder.service.js#L110) | 110 | `buildWeeklyReport` | **AppUsage** | `find` | `READ` | A, B | - | - | `Array<AppUsage>` |
| 483 | [`src/services/weeklyReportBuilder.service.js`](file:///src/services/weeklyReportBuilder.service.js#L135) | 135 | `buildWeeklyReport` | **UsageLog** | `find` | `READ` | A, B | - | - | `Array<UsageLog>` |
| 484 | [`src/services/weeklyReportBuilder.service.js`](file:///src/services/weeklyReportBuilder.service.js#L147) | 147 | `buildWeeklyReport` | **Project** | `find` | `READ` | A, G | Yes | - | `Array<Project>` |
| 485 | [`src/services/weeklyReportBuilder.service.js`](file:///src/services/weeklyReportBuilder.service.js#L156) | 156 | `buildWeeklyReport` | **Task** | `find` | `READ` | A | - | - | `Array<Task>` |
| 486 | [`src/services/weeklySummary.scheduler.js`](file:///src/services/weeklySummary.scheduler.js#L9) | 9 | `startWeeklySummaryScheduler` | **Integration** | `find` | `READ` | A | - | - | `Array<Integration>` |
| 487 | [`src/services/weeklySummary.scheduler.js`](file:///src/services/weeklySummary.scheduler.js#L15) | 15 | `startWeeklySummaryScheduler` | **User** | `findOne` | `READ` | A | - | - | `Document | null` |
| 488 | [`src/services/weeklyTrackingReport.service.js`](file:///src/services/weeklyTrackingReport.service.js#L11) | 11 | `sendWeeklyTrackingReports` | **User** | `find` | `READ` | A, C | - | organization | `Array<User>` |
| 489 | [`src/services/weeklyTrackingReport.service.js`](file:///src/services/weeklyTrackingReport.service.js#L62) | 62 | `sendWeeklyTrackingReports` | **User** | `find` | `READ` | A, B, G | Yes | - | `Array<User>` |
| 490 | [`src/services/weeklyTrackingReport.service.js`](file:///src/services/weeklyTrackingReport.service.js#L98) | 98 | `sendWeeklyTrackingReports` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 491 | [`src/services/weeklyTrackingReport.service.js`](file:///src/services/weeklyTrackingReport.service.js#L134) | 134 | `sendWeeklyTrackingReports` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 492 | [`src/socket/socket.js`](file:///src/socket/socket.js#L53) | 53 | `initSocket` | **User** | `findById` | `READ` | A, C | - | organization | `Document | null` |
| 493 | [`src/socket/socket.js`](file:///src/socket/socket.js#L90) | 90 | `initSocket` | **Timer** | `findOne` | `READ` | A | - | - | `Document | null` |
| 494 | [`src/socket/socket.js`](file:///src/socket/socket.js#L99) | 99 | `initSocket` | **User** | `findById` | `READ` | A | - | - | `Document | null` |
| 495 | [`src/socket/socket.js`](file:///src/socket/socket.js#L110) | 110 | `initSocket` | **Session** | `create` | `WRITE` | A, G | Yes | - | `Session Document` |
| 496 | [`src/socket/socket.js`](file:///src/socket/socket.js#L128) | 128 | `initSocket` | **Timer** | `create` | `WRITE` | A, C, G | Yes | project, task | `Timer Document` |
| 497 | [`src/socket/socket.js`](file:///src/socket/socket.js#L136) | 136 | `initSocket` | **Timer** | `findById` | `READ` | A, C, G | Yes | project, task | `Document | null` |
| 498 | [`src/socket/socket.js`](file:///src/socket/socket.js#L151) | 151 | `initSocket` | **Timer** | `findOneAndUpdate` | `WRITE` | F | - | - | `Timer Document | null` |
| 499 | [`src/socket/socket.js`](file:///src/socket/socket.js#L175) | 175 | `initSocket` | **Session** | `create` | `WRITE` | A | - | - | `Session Document` |
| 500 | [`src/socket/socket.js`](file:///src/socket/socket.js#L186) | 186 | `initSocket` | **ProjectTracking** | `create` | `WRITE` | A | - | - | `ProjectTracking Document` |
| 501 | [`src/socket/socket.js`](file:///src/socket/socket.js#L198) | 198 | `initSocket` | **Timer** | `create` | `WRITE` | A, C, G | Yes | project, task | `Timer Document` |
| 502 | [`src/socket/socket.js`](file:///src/socket/socket.js#L206) | 206 | `initSocket` | **Timer** | `findById` | `READ` | A, C, G | Yes | project, task | `Document | null` |
| 503 | [`src/socket/socket.js`](file:///src/socket/socket.js#L221) | 221 | `initSocket` | **Timer** | `findOneAndUpdate` | `WRITE` | F, G | Yes | - | `Timer Document | null` |
| 504 | [`src/socket/socket.js`](file:///src/socket/socket.js#L246) | 246 | `initSocket` | **Session** | `create` | `WRITE` | A | - | - | `Session Document` |
| 505 | [`src/socket/socket.js`](file:///src/socket/socket.js#L257) | 257 | `initSocket` | **ProjectTracking** | `create` | `WRITE` | A | - | - | `ProjectTracking Document` |
| 506 | [`src/socket/socket.js`](file:///src/socket/socket.js#L272) | 272 | `initSocket` | **User** | `findByIdAndUpdate` | `WRITE` | A | - | - | `User Document | null` |
| 507 | [`src/utils/createDefaultRoles.js`](file:///src/utils/createDefaultRoles.js#L41) | 41 | `createDefaultRoles` | **Role** | `findOne` | `READ` | A | - | - | `Document | null` |
| 508 | [`src/utils/createDefaultRoles.js`](file:///src/utils/createDefaultRoles.js#L47) | 47 | `createDefaultRoles` | **Role** | `create` | `WRITE` | A | - | - | `Role Document` |
| 509 | [`src/utils/getUserPermissions.js`](file:///src/utils/getUserPermissions.js#L9) | 9 | `getUserPermissions` | **Role** | `findById` | `READ` | A | - | - | `Document | null` |
| 510 | [`src/utils/logAudit.js`](file:///src/utils/logAudit.js#L13) | 13 | `logAudit` | **AuditLog** | `create` | `WRITE` | A | - | - | `AuditLog Document` |
| 511 | [`src/utils/reportAccess.js`](file:///src/utils/reportAccess.js#L14) | 14 | `getReportAccess` | **Role** | `findById` | `READ` | A | - | - | `Document | null` |
| 512 | [`src/utils/reportAccess.js`](file:///src/utils/reportAccess.js#L31) | 31 | `getReportUserIds` | **User** | `find` | `READ` | A, G | Yes | - | `Array<User>` |
| 513 | [`src/utils/session.js`](file:///src/utils/session.js#L4) | 4 | `checkSessionOverlap` | **Session** | `findOne` | `READ` | A | - | - | `Document | null` |
| 514 | [`src/utils/updateSyncStatus.js`](file:///src/utils/updateSyncStatus.js#L8) | 8 | `updateSyncStatus` | **SyncStatus** | `findOneAndUpdate` | `WRITE` | A | - | - | `SyncStatus Document | null` |
