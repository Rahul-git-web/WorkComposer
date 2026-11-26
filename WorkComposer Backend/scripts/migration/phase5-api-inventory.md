# Phase 5B — Express API Route & Contract Inventory

## 1. Executive Summary

* **Total API Route Endpoints Inventoried**: **216**
* **Total Route Modules Mounted**: **33**
* **Active Default Provider**: `DATABASE_PROVIDER=mongo` (Mongoose baseline)
* **PostgreSQL Target Provider**: `workcomposer_staging` (Prisma compatibility layer)

### Route Classification Summary

| Classification | Description | Count |
| :--- | :--- | :---: |
| **`AUTHENTICATION`** | Routes classified under AUTHENTICATION | **8** |
| **`PUBLIC_READ`** | Routes classified under PUBLIC_READ | **12** |
| **`AUTHENTICATED_WRITE`** | Routes classified under AUTHENTICATED_WRITE | **75** |
| **`AUTHENTICATED_READ`** | Routes classified under AUTHENTICATED_READ | **64** |
| **`ADMIN/MANAGER`** | Routes classified under ADMIN/MANAGER | **17** |
| **`EXTERNAL_INTEGRATION`** | Routes classified under EXTERNAL_INTEGRATION | **31** |
| **`WEBHOOK`** | Routes classified under WEBHOOK | **3** |
| **`DESKTOP_SYNC`** | Routes classified under DESKTOP_SYNC | **6** |

---

## 2. Complete Route Inventory

| # | Method | Path | Classification | Auth | Authorization | Domain Model | Handler / Controller | Source File |
| :-: | :---: | :--- | :---: | :---: | :--- | :--- | :--- | :--- |
| 1 | `POST` | `/api/auth/register` | `AUTHENTICATION` | OPTIONAL_OR_NONE | STANDARD_USER | User | `registerUser` | [authRoutes.js](file:///src/routes/authRoutes.js) |
| 2 | `POST` | `/api/auth/login` | `AUTHENTICATION` | OPTIONAL_OR_NONE | STANDARD_USER | User | `loginUser` | [authRoutes.js](file:///src/routes/authRoutes.js) |
| 3 | `GET` | `/api/auth/google` | `PUBLIC_READ` | OPTIONAL_OR_NONE | STANDARD_USER | User | `googleLogin` | [authRoutes.js](file:///src/routes/authRoutes.js) |
| 4 | `GET` | `/api/auth/google/callback` | `PUBLIC_READ` | OPTIONAL_OR_NONE | STANDARD_USER | User | `googleCallback` | [authRoutes.js](file:///src/routes/authRoutes.js) |
| 5 | `GET` | `/api/auth/google-signup-info` | `PUBLIC_READ` | OPTIONAL_OR_NONE | STANDARD_USER | User | `getGoogleSignupInfo` | [authRoutes.js](file:///src/routes/authRoutes.js) |
| 6 | `GET` | `/api/auth/microsoft` | `PUBLIC_READ` | OPTIONAL_OR_NONE | STANDARD_USER | User | `microsoftLogin` | [authRoutes.js](file:///src/routes/authRoutes.js) |
| 7 | `GET` | `/api/auth/microsoft/callback` | `PUBLIC_READ` | OPTIONAL_OR_NONE | STANDARD_USER | User | `microsoftCallback` | [authRoutes.js](file:///src/routes/authRoutes.js) |
| 8 | `GET` | `/api/auth/microsoft-signup-info` | `PUBLIC_READ` | OPTIONAL_OR_NONE | STANDARD_USER | User | `getMicrosoftSignupInfo` | [authRoutes.js](file:///src/routes/authRoutes.js) |
| 9 | `POST` | `/api/auth/refresh` | `AUTHENTICATION` | OPTIONAL_OR_NONE | STANDARD_USER | User | `refreshAccessToken` | [authRoutes.js](file:///src/routes/authRoutes.js) |
| 10 | `POST` | `/api/auth/logout` | `AUTHENTICATION` | OPTIONAL_OR_NONE | STANDARD_USER | User | `logoutUser` | [authRoutes.js](file:///src/routes/authRoutes.js) |
| 11 | `GET` | `/api/auth/verify/:token` | `AUTHENTICATION` | OPTIONAL_OR_NONE | STANDARD_USER | User | `verifyEmail` | [authRoutes.js](file:///src/routes/authRoutes.js) |
| 12 | `POST` | `/api/auth/resend-verification` | `AUTHENTICATED_WRITE` | OPTIONAL_OR_NONE | STANDARD_USER | User | `resendVerification` | [authRoutes.js](file:///src/routes/authRoutes.js) |
| 13 | `GET` | `/api/auth/me` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | User | `"name timezone")
      .populate
      .select("-password -refreshToken"` | [authRoutes.js](file:///src/routes/authRoutes.js) |
| 14 | `POST` | `/api/auth/forgot-password` | `AUTHENTICATION` | OPTIONAL_OR_NONE | STANDARD_USER | User | `forgotPassword` | [authRoutes.js](file:///src/routes/authRoutes.js) |
| 15 | `POST` | `/api/auth/reset-password` | `AUTHENTICATION` | OPTIONAL_OR_NONE | STANDARD_USER | User | `resetPassword` | [authRoutes.js](file:///src/routes/authRoutes.js) |
| 16 | `POST` | `/api/auth/verify-two-factor` | `AUTHENTICATION` | OPTIONAL_OR_NONE | STANDARD_USER | User | `verifyTwoFactor` | [authRoutes.js](file:///src/routes/authRoutes.js) |
| 17 | `POST` | `/api/sessions/create` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Session | `createSession` | [sessionRoutes.js](file:///src/routes/sessionRoutes.js) |
| 18 | `GET` | `/api/sessions` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Session | `getSessions` | [sessionRoutes.js](file:///src/routes/sessionRoutes.js) |
| 19 | `DELETE` | `/api/sessions/delete-range` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Session | `deleteSessionsInRange` | [sessionRoutes.js](file:///src/routes/sessionRoutes.js) |
| 20 | `GET` | `/api/sessions/preview-range` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Session | `previewSessionsInRange` | [sessionRoutes.js](file:///src/routes/sessionRoutes.js) |
| 21 | `GET` | `/api/sessions/overview` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Session | `getOverviewData` | [sessionRoutes.js](file:///src/routes/sessionRoutes.js) |
| 22 | `GET` | `/api/sessions/today` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Session | `getTodaySummary` | [sessionRoutes.js](file:///src/routes/sessionRoutes.js) |
| 23 | `GET` | `/api/sessions/today-task-summary` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Session | `getTodayTaskSummary` | [sessionRoutes.js](file:///src/routes/sessionRoutes.js) |
| 24 | `GET` | `/api/sessions/stats` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Session | `getWorkTimeStats` | [sessionRoutes.js](file:///src/routes/sessionRoutes.js) |
| 25 | `GET` | `/api/sessions/today-chart` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Session | `getTodayChartData` | [sessionRoutes.js](file:///src/routes/sessionRoutes.js) |
| 26 | `GET` | `/api/sessions/last-30-days-chart` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Session | `getLast30DaysChart` | [sessionRoutes.js](file:///src/routes/sessionRoutes.js) |
| 27 | `GET` | `/api/users` | `ADMIN/MANAGER` | REQUIRED | "admin" | User | `getUsers` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 28 | `POST` | `/api/users/invite` | `ADMIN/MANAGER` | REQUIRED | "admin" | User | `inviteUser` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 29 | `POST` | `/api/users/create-user` | `ADMIN/MANAGER` | REQUIRED | "admin" | User | `createUser` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 30 | `POST` | `/api/users/accept-invite` | `AUTHENTICATED_WRITE` | OPTIONAL_OR_NONE | STANDARD_USER | User | `acceptInvite` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 31 | `GET` | `/api/users/invite/:token` | `PUBLIC_READ` | OPTIONAL_OR_NONE | STANDARD_USER | User | `getInviteDetails` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 32 | `GET` | `/api/users/invites` | `ADMIN/MANAGER` | REQUIRED | "admin" | User | `getInvites` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 33 | `POST` | `/api/users/bulk-invite` | `ADMIN/MANAGER` | REQUIRED | STANDARD_USER | User | `bulkInvitesUsers` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 34 | `GET` | `/api/users/export/users` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | User | `exportUsersCsv` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 35 | `GET` | `/api/users/export/hierarchy-users` | `ADMIN/MANAGER` | REQUIRED | "admin") | User | `exportUsersHierarchy` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 36 | `GET` | `/api/users/export/hierarchy-managers` | `ADMIN/MANAGER` | REQUIRED | "admin") | User | `exportManagersHierarchy` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 37 | `GET` | `/api/users/export/devices` | `ADMIN/MANAGER` | REQUIRED | "admin") | User | `exportDevices` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 38 | `POST` | `/api/users/import-users` | `ADMIN/MANAGER` | REQUIRED | "admin") | User | `importUsers` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 39 | `GET` | `/api/users/export-users` | `ADMIN/MANAGER` | REQUIRED | "admin") | User | `exportUsers` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 40 | `PUT` | `/api/users/:id/email-request` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | User | `requestEmailChange` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 41 | `GET` | `/api/users/verify-email-change/:token` | `PUBLIC_READ` | OPTIONAL_OR_NONE | STANDARD_USER | User | `verifyEmailChange` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 42 | `PUT` | `/api/users/:id/email` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | User | `updateUserEmail` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 43 | `PUT` | `/api/users/:id/archive` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | User | `archiveUser` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 44 | `PUT` | `/api/users/:id/unarchive` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | User | `unarchiveUser` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 45 | `POST` | `/api/users/device` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | User | `registerUserDevice` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 46 | `GET` | `/api/users/device/:deviceId/status` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | User | `checkUserDevice` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 47 | `POST` | `/api/users/device/:deviceId/tracking` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | User | `updateUserDeviceTracking` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 48 | `GET` | `/api/users/:id/devices` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | User | `getUserDevices` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 49 | `POST` | `/api/users/:id/devices/:deviceId/logout` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | User | `logoutUserDevice` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 50 | `PUT` | `/api/users/:id` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | User | `updateUser` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 51 | `DELETE` | `/api/users/:id` | `ADMIN/MANAGER` | REQUIRED | STANDARD_USER | User | `deleteUser` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 52 | `PUT` | `/api/users/:id/role` | `ADMIN/MANAGER` | REQUIRED | "admin") | User | `updateUserRole` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 53 | `PUT` | `/api/users/:id/configure-setting` | `ADMIN/MANAGER` | REQUIRED | "admin") | User | `updateUserSetting` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 54 | `PATCH` | `/api/users/:id/shift-settings` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | User | `updateUserShiftSettings` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 55 | `PUT` | `/api/users/:id/assign-manager` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | User | `assignManager` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 56 | `GET` | `/api/users/:id/manager-assignments` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | User | `getManagerAssignments` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 57 | `PUT` | `/api/users/invite/:id/role` | `ADMIN/MANAGER` | REQUIRED | "admin") | User | `updateInviteRole` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 58 | `POST` | `/api/users/resend-invite` | `ADMIN/MANAGER` | REQUIRED | "admin") | User | `resendInvite` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 59 | `GET` | `/api/users/profile/:id` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | User | `getUserProfile` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 60 | `GET` | `/api/users/all-users` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | User | `getAllUsersWithInvites` | [userRoutes.js](file:///src/routes/userRoutes.js) |
| 61 | `POST` | `/api/teams` | `ADMIN/MANAGER` | REQUIRED | "admin") | Team | `createTeam` | [teamRoutes.js](file:///src/routes/teamRoutes.js) |
| 62 | `GET` | `/api/teams` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Team | `getTeams` | [teamRoutes.js](file:///src/routes/teamRoutes.js) |
| 63 | `PUT` | `/api/teams/:id` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Team | `updateTeam` | [teamRoutes.js](file:///src/routes/teamRoutes.js) |
| 64 | `DELETE` | `/api/teams/:id` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Team | `deleteTeam` | [teamRoutes.js](file:///src/routes/teamRoutes.js) |
| 65 | `POST` | `/api/tasks` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Task | `createTask` | [taskRoutes.js](file:///src/routes/taskRoutes.js) |
| 66 | `GET` | `/api/tasks` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Task | `getTasks` | [taskRoutes.js](file:///src/routes/taskRoutes.js) |
| 67 | `GET` | `/api/tasks/recently-deleted` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Task | `getRecentlyDeletedTasks` | [taskRoutes.js](file:///src/routes/taskRoutes.js) |
| 68 | `PATCH` | `/api/tasks/recently-deleted/:id/restore` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Task | `restoreTask` | [taskRoutes.js](file:///src/routes/taskRoutes.js) |
| 69 | `DELETE` | `/api/tasks/recently-deleted/:id` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Task | `permanentlyDeleteTask` | [taskRoutes.js](file:///src/routes/taskRoutes.js) |
| 70 | `DELETE` | `/api/tasks/delete-multiple` | `ADMIN/MANAGER` | REQUIRED | "admin") | Task | `deleteMultipleTasks` | [taskRoutes.js](file:///src/routes/taskRoutes.js) |
| 71 | `PUT` | `/api/tasks/:id` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Task | `updateTask` | [taskRoutes.js](file:///src/routes/taskRoutes.js) |
| 72 | `DELETE` | `/api/tasks/:id` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Task | `deleteTask` | [taskRoutes.js](file:///src/routes/taskRoutes.js) |
| 73 | `POST` | `/api/projects` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Project | `createProject` | [projectRoutes.js](file:///src/routes/projectRoutes.js) |
| 74 | `GET` | `/api/projects` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Project | `getProjects` | [projectRoutes.js](file:///src/routes/projectRoutes.js) |
| 75 | `PUT` | `/api/projects/:id` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Project | `updateProject` | [projectRoutes.js](file:///src/routes/projectRoutes.js) |
| 76 | `DELETE` | `/api/projects/:id` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Project | `deleteProject` | [projectRoutes.js](file:///src/routes/projectRoutes.js) |
| 77 | `GET` | `/api/timers/active` | `PUBLIC_READ` | OPTIONAL_OR_NONE | STANDARD_USER | Timer | `"title"` | [timerRoutes.js](file:///src/routes/timerRoutes.js) |
| 78 | `GET` | `/api/timers/active/:userId` | `PUBLIC_READ` | OPTIONAL_OR_NONE | STANDARD_USER | Timer | `"title"` | [timerRoutes.js](file:///src/routes/timerRoutes.js) |
| 79 | `POST` | `/api/screenshots/upload` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Screenshot | `uploadScreenshot` | [screenshotRoutes.js](file:///src/routes/screenshotRoutes.js) |
| 80 | `GET` | `/api/screenshots` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Screenshot | `getScreenshots` | [screenshotRoutes.js](file:///src/routes/screenshotRoutes.js) |
| 81 | `GET` | `/api/screenshots/export-zip` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Screenshot | `exportScreenshotsZip` | [screenshotRoutes.js](file:///src/routes/screenshotRoutes.js) |
| 82 | `GET` | `/api/screenshots/:userId` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Screenshot | `getUserScreenshots` | [screenshotRoutes.js](file:///src/routes/screenshotRoutes.js) |
| 83 | `POST` | `/api/activity` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Activity | `trackActivity` | [activityRoutes.js](file:///src/routes/activityRoutes.js) |
| 84 | `GET` | `/api/activity/session-details` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Activity | `getSessionDetails` | [activityRoutes.js](file:///src/routes/activityRoutes.js) |
| 85 | `GET` | `/api/activity/:userId` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Activity | `getActivity` | [activityRoutes.js](file:///src/routes/activityRoutes.js) |
| 86 | `GET` | `/api/activity/timeline/:userId` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Activity | `getActivityTimeline` | [activityRoutes.js](file:///src/routes/activityRoutes.js) |
| 87 | `GET` | `/api/usage` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | AppUsage / UsageLog | `getUsageData` | [usageRoutes.js](file:///src/routes/usageRoutes.js) |
| 88 | `POST` | `/api/usage/track` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | AppUsage / UsageLog | `trackAppUsage` | [usageRoutes.js](file:///src/routes/usageRoutes.js) |
| 89 | `GET` | `/api/usage/top-apps/:userId` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | AppUsage / UsageLog | `getTopApps` | [usageRoutes.js](file:///src/routes/usageRoutes.js) |
| 90 | `GET` | `/api/usage/details/:userId` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | AppUsage / UsageLog | `getUsageDetails` | [usageRoutes.js](file:///src/routes/usageRoutes.js) |
| 91 | `GET` | `/api/attendance` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Attendance | `getAttendanceData` | [attendanceRoutes.js](file:///src/routes/attendanceRoutes.js) |
| 92 | `GET` | `/api/attendance/summary/:userId` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Attendance | `getUserAttendanceSummary` | [attendanceRoutes.js](file:///src/routes/attendanceRoutes.js) |
| 93 | `GET` | `/api/attendance/daily-report` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Attendance | `getDailyWorkReport` | [attendanceRoutes.js](file:///src/routes/attendanceRoutes.js) |
| 94 | `POST` | `/api/attendance/finish` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Attendance | `finishAttendance` | [attendanceRoutes.js](file:///src/routes/attendanceRoutes.js) |
| 95 | `POST` | `/api/reports/attendance-overview` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Report | `createAttendanceOverviewReport` | [reportRoutes.js](file:///src/routes/reportRoutes.js) |
| 96 | `GET` | `/api/reports` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Report | `getReports` | [reportRoutes.js](file:///src/routes/reportRoutes.js) |
| 97 | `GET` | `/api/reports/test-csv` | `PUBLIC_READ` | OPTIONAL_OR_NONE | STANDARD_USER | Report | `testCSV` | [reportRoutes.js](file:///src/routes/reportRoutes.js) |
| 98 | `POST` | `/api/reports/attendance-detailed` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Report | `createAttendanceDetailedReport` | [reportRoutes.js](file:///src/routes/reportRoutes.js) |
| 99 | `POST` | `/api/reports/usage` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Report | `createUsageReport` | [reportRoutes.js](file:///src/routes/reportRoutes.js) |
| 100 | `POST` | `/api/reports/usageCSV` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Report | `generateUsageCSV` | [reportRoutes.js](file:///src/routes/reportRoutes.js) |
| 101 | `GET` | `/api/reports/productivity` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Report | `getProductivityReport` | [reportRoutes.js](file:///src/routes/reportRoutes.js) |
| 102 | `POST` | `/api/reports/productivity` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Report | `createProductivityReport` | [reportRoutes.js](file:///src/routes/reportRoutes.js) |
| 103 | `POST` | `/api/reports/project-user` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Report | `createProjectUserReport` | [reportRoutes.js](file:///src/routes/reportRoutes.js) |
| 104 | `POST` | `/api/reports/project` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Report | `createProjectReport` | [reportRoutes.js](file:///src/routes/reportRoutes.js) |
| 105 | `POST` | `/api/reports/classify-app` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Report | `classifyApp` | [reportRoutes.js](file:///src/routes/reportRoutes.js) |
| 106 | `DELETE` | `/api/reports/:id` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Report | `deleteReport` | [reportRoutes.js](file:///src/routes/reportRoutes.js) |
| 107 | `POST` | `/api/project-tracking/track` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | ProjectTracking | `trackProject` | [projectTrackingRoutes.js](file:///src/routes/projectTrackingRoutes.js) |
| 108 | `GET` | `/api/project-tracking` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | ProjectTracking | `getProjectTracking` | [projectTrackingRoutes.js](file:///src/routes/projectTrackingRoutes.js) |
| 109 | `GET` | `/api/project-tracking/task/:taskId` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | ProjectTracking | `getTaskDetails` | [projectTrackingRoutes.js](file:///src/routes/projectTrackingRoutes.js) |
| 110 | `PUT` | `/api/settings/profile` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | TimeTrackingSettings | `updateProfile` | [settingsRoutes.js](file:///src/routes/settingsRoutes.js) |
| 111 | `PUT` | `/api/settings/change-password` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | TimeTrackingSettings | `changePassword` | [settingsRoutes.js](file:///src/routes/settingsRoutes.js) |
| 112 | `PUT` | `/api/settings/preferences` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | TimeTrackingSettings | `updatePreferences` | [settingsRoutes.js](file:///src/routes/settingsRoutes.js) |
| 113 | `POST` | `/api/settings/avatar` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | TimeTrackingSettings | `uploadAvatar` | [settingsRoutes.js](file:///src/routes/settingsRoutes.js) |
| 114 | `GET` | `/api/organization` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Organization | `getOrganization` | [organizationRoutes.js](file:///src/routes/organizationRoutes.js) |
| 115 | `PUT` | `/api/organization` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Organization | `updateOrganization` | [organizationRoutes.js](file:///src/routes/organizationRoutes.js) |
| 116 | `POST` | `/api/organization/upload-logo` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Organization | `uploadLogo` | [organizationRoutes.js](file:///src/routes/organizationRoutes.js) |
| 117 | `DELETE` | `/api/organization` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Organization | `deleteOrganization` | [organizationRoutes.js](file:///src/routes/organizationRoutes.js) |
| 118 | `GET` | `/api/organization/two-factor` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Organization | `getTwoFactorSettings` | [organizationRoutes.js](file:///src/routes/organizationRoutes.js) |
| 119 | `PUT` | `/api/organization/two-factor` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Organization | `updateTwoFactorSettings` | [organizationRoutes.js](file:///src/routes/organizationRoutes.js) |
| 120 | `GET` | `/api/organization/app-updates` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Organization | `getAppUpdateSettings` | [organizationRoutes.js](file:///src/routes/organizationRoutes.js) |
| 121 | `PUT` | `/api/organization/app-updates` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Organization | `updateAppUpdateSettings` | [organizationRoutes.js](file:///src/routes/organizationRoutes.js) |
| 122 | `GET` | `/api/organization/email-reports` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Organization | `getEmailReportSettings` | [organizationRoutes.js](file:///src/routes/organizationRoutes.js) |
| 123 | `PUT` | `/api/organization/email-reports` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Organization | `updateEmailReportSettings` | [organizationRoutes.js](file:///src/routes/organizationRoutes.js) |
| 124 | `GET` | `/api/organization/task-management` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Organization | `getTaskManagementSettings` | [organizationRoutes.js](file:///src/routes/organizationRoutes.js) |
| 125 | `PUT` | `/api/organization/task-management` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Organization | `updateTaskManagementSettings` | [organizationRoutes.js](file:///src/routes/organizationRoutes.js) |
| 126 | `GET` | `/api/organization/notifications` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Organization | `getOrganizationNotifications` | [organizationRoutes.js](file:///src/routes/organizationRoutes.js) |
| 127 | `PATCH` | `/api/organization/notifications` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Organization | `updateOrganizationNotifications` | [organizationRoutes.js](file:///src/routes/organizationRoutes.js) |
| 128 | `GET` | `/api/auditLog` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | AuditLog | `getAuditLogs` | [auditLogRoutes.js](file:///src/routes/auditLogRoutes.js) |
| 129 | `GET` | `/api/roles` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Role | `updateRole` | [roleRoutes.js](file:///src/routes/roleRoutes.js) |
| 130 | `GET` | `/api/roles/:id` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Role | `getRoleById` | [roleRoutes.js](file:///src/routes/roleRoutes.js) |
| 131 | `GET` | `/api/integrations/jira/connect` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `connectJira` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 132 | `GET` | `/api/integrations/jira/callback` | `EXTERNAL_INTEGRATION` | OPTIONAL_OR_NONE | STANDARD_USER | Integration | `jiraCallback` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 133 | `POST` | `/api/integrations/jira/webhook` | `WEBHOOK` | OPTIONAL_OR_NONE | STANDARD_USER | Integration | `jiraWebhook` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 134 | `GET` | `/api/integrations/jira/projects` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `getJiraProjects` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 135 | `GET` | `/api/integrations/jira/status` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `getJiraStatus` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 136 | `POST` | `/api/integrations/jira/sync-projects` | `DESKTOP_SYNC` | REQUIRED | STANDARD_USER | Integration | `syncJiraProjects` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 137 | `POST` | `/api/integrations/jira/sync-issues/:projectId` | `DESKTOP_SYNC` | REQUIRED | STANDARD_USER | Integration | `syncJiraIssues` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 138 | `GET` | `/api/integrations/asana/connect` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `connectAsana` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 139 | `GET` | `/api/integrations/asana/callback` | `EXTERNAL_INTEGRATION` | OPTIONAL_OR_NONE | STANDARD_USER | Integration | `asanaCallback` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 140 | `POST` | `/api/integrations/asana/webhook` | `WEBHOOK` | OPTIONAL_OR_NONE | STANDARD_USER | Integration | `asanaWebhook` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 141 | `GET` | `/api/integrations/asana` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `getAsanaIntegration` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 142 | `DELETE` | `/api/integrations/asana` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `disconnectAsana` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 143 | `GET` | `/api/integrations/asana/workspaces` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `getAsanaWorkspaces` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 144 | `GET` | `/api/integrations/asana/workspaces/:workspace/projects` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `getAsanaProjects` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 145 | `POST` | `/api/integrations/asana/workspaces/:workspace/import-projects` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `importAsanaProjects` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 146 | `GET` | `/api/integrations/slack/connect` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `connectSlack` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 147 | `GET` | `/api/integrations/slack/callback` | `EXTERNAL_INTEGRATION` | OPTIONAL_OR_NONE | STANDARD_USER | Integration | `slackCallback` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 148 | `GET` | `/api/integrations/slack` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `getSlackIntegration` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 149 | `DELETE` | `/api/integrations/slack` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `disconnectSlack` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 150 | `GET` | `/api/integrations/slack/channels` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `getSlackChannels` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 151 | `PUT` | `/api/integrations/slack/channel` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `saveSlackChannel` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 152 | `POST` | `/api/integrations/slack/test-message` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `sendTestSlackMessage` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 153 | `PUT` | `/api/integrations/slack/notifications` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `updateSlackNotifications` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 154 | `POST` | `/api/integrations/slack/interactions` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `handleSlackInteraction` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 155 | `POST` | `/api/integrations/bamboohr/connect` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `connectBambooHR` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 156 | `GET` | `/api/integrations/bamboohr` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `getBambooHRIntegration` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 157 | `DELETE` | `/api/integrations/bamboohr` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `disconnectBambooHR` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 158 | `GET` | `/api/integrations/bamboohr/employees` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `getBambooHREmployees` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 159 | `POST` | `/api/integrations/bamboohr/sync-employees` | `DESKTOP_SYNC` | REQUIRED | STANDARD_USER | Integration | `syncBambooHREmployees` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 160 | `GET` | `/api/integrations/bamboohr/time-off` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `getBambooHRTimeOff` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 161 | `POST` | `/api/integrations/keka/connect` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `connectKeka` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 162 | `GET` | `/api/integrations/keka` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `getKekaIntegration` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 163 | `DELETE` | `/api/integrations/keka` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `disconnectKeka` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 164 | `GET` | `/api/integrations/keka/employees` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `getKekaEmployees` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 165 | `POST` | `/api/integrations/keka/sync-employees` | `DESKTOP_SYNC` | REQUIRED | STANDARD_USER | Integration | `syncKekaEmployees` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 166 | `GET` | `/api/integrations/keka/leaves` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `getKekaLeaves` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 167 | `GET` | `/api/integrations/status-summary` | `EXTERNAL_INTEGRATION` | REQUIRED | STANDARD_USER | Integration | `getAllIntegrationStatuses` | [integrationRoutes.js](file:///src/routes/integrationRoutes.js) |
| 168 | `GET` | `/api/sync/status` | `DESKTOP_SYNC` | REQUIRED | STANDARD_USER | SyncStatus | `getSyncStatus` | [syncRoutes.js](file:///src/routes/syncRoutes.js) |
| 169 | `GET` | `/api/api-keys` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | ApiKey | `getApiKeys` | [apiKeyRoutes.js](file:///src/routes/apiKeyRoutes.js) |
| 170 | `POST` | `/api/api-keys` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | ApiKey | `generateApiKey` | [apiKeyRoutes.js](file:///src/routes/apiKeyRoutes.js) |
| 171 | `PATCH` | `/api/api-keys/:id` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | ApiKey | `updateApiKey` | [apiKeyRoutes.js](file:///src/routes/apiKeyRoutes.js) |
| 172 | `DELETE` | `/api/api-keys/:id` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | ApiKey | `deleteApiKey` | [apiKeyRoutes.js](file:///src/routes/apiKeyRoutes.js) |
| 173 | `GET` | `/api/v1/projects` | `PUBLIC_READ` | OPTIONAL_OR_NONE | STANDARD_USER | Unknown | `getProjects` | [apiRoutes.js](file:///src/routes/api/apiRoutes.js) |
| 174 | `POST` | `/api/v1/tasks` | `AUTHENTICATED_WRITE` | OPTIONAL_OR_NONE | STANDARD_USER | Unknown | `createTask` | [apiRoutes.js](file:///src/routes/api/apiRoutes.js) |
| 175 | `GET` | `/api/api-logs` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | ApiLog | `getApiLogs` | [apiLogRoutes.js](file:///src/routes/apiLogRoutes.js) |
| 176 | `GET` | `/api/billing/overview` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | BillingProfile / Subscription / Invoice | `getBillingOverview` | [billingRoutes.js](file:///src/routes/billingRoutes.js) |
| 177 | `GET` | `/api/billing/subscription` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | BillingProfile / Subscription / Invoice | `getSubscription` | [billingRoutes.js](file:///src/routes/billingRoutes.js) |
| 178 | `GET` | `/api/billing/invoices` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | BillingProfile / Subscription / Invoice | `getInvoices` | [billingRoutes.js](file:///src/routes/billingRoutes.js) |
| 179 | `PUT` | `/api/billing/billing-profile` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | BillingProfile / Subscription / Invoice | `updateBillingProfile` | [billingRoutes.js](file:///src/routes/billingRoutes.js) |
| 180 | `POST` | `/api/billing/create-checkout-session` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | BillingProfile / Subscription / Invoice | `createCheckoutSession` | [billingRoutes.js](file:///src/routes/billingRoutes.js) |
| 181 | `POST` | `/api/billing/sync-checkout-session` | `DESKTOP_SYNC` | REQUIRED | STANDARD_USER | BillingProfile / Subscription / Invoice | `syncCheckoutSession` | [billingRoutes.js](file:///src/routes/billingRoutes.js) |
| 182 | `POST` | `/api/billing/change-plan` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | BillingProfile / Subscription / Invoice | `changeStripePlan` | [billingRoutes.js](file:///src/routes/billingRoutes.js) |
| 183 | `GET` | `/api/time-tracking/settings` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | TimeTrackingSettings | `getTimeTrackingSettings` | [timeTrackingSettingsRoutes.js](file:///src/routes/timeTrackingSettingsRoutes.js) |
| 184 | `PUT` | `/api/time-tracking/settings` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | TimeTrackingSettings | `updateTimeTrackingSettings` | [timeTrackingSettingsRoutes.js](file:///src/routes/timeTrackingSettingsRoutes.js) |
| 185 | `GET` | `/api/time-tracking/settings/effective` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | TimeTrackingSettings | `getEffectiveTimeTrackingSettings` | [timeTrackingSettingsRoutes.js](file:///src/routes/timeTrackingSettingsRoutes.js) |
| 186 | `GET` | `/api/screen-capture/settings` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Unknown | `getScreenCaptureSettings` | [screenCaptureRoutes.js](file:///src/routes/screenCaptureRoutes.js) |
| 187 | `PUT` | `/api/screen-capture/settings` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Unknown | `updateScreenCaptureSettings` | [screenCaptureRoutes.js](file:///src/routes/screenCaptureRoutes.js) |
| 188 | `GET` | `/api/manual-time/settings` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Unknown | `getManualTimeSettings` | [manualTimeRoutes.js](file:///src/routes/manualTimeRoutes.js) |
| 189 | `PUT` | `/api/manual-time/settings` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Unknown | `updateManualTimeSettings` | [manualTimeRoutes.js](file:///src/routes/manualTimeRoutes.js) |
| 190 | `GET` | `/api/shift/settings` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Unknown | `getShiftSettings` | [shiftRoutes.js](file:///src/routes/shiftRoutes.js) |
| 191 | `PUT` | `/api/shift/settings` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Unknown | `updateShiftSettings` | [shiftRoutes.js](file:///src/routes/shiftRoutes.js) |
| 192 | `GET` | `/api/app-classifications` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | AppClassification | `getAppClassifications` | [appClassificationRoutes.js](file:///src/routes/appClassificationRoutes.js) |
| 193 | `GET` | `/api/app-classifications/stats` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | AppClassification | `getClassificationStats` | [appClassificationRoutes.js](file:///src/routes/appClassificationRoutes.js) |
| 194 | `POST` | `/api/app-classifications` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | AppClassification | `createAppClassification` | [appClassificationRoutes.js](file:///src/routes/appClassificationRoutes.js) |
| 195 | `PUT` | `/api/app-classifications/:id` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | AppClassification | `updateAppClassification` | [appClassificationRoutes.js](file:///src/routes/appClassificationRoutes.js) |
| 196 | `DELETE` | `/api/app-classifications/:id` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | AppClassification | `deleteAppClassification` | [appClassificationRoutes.js](file:///src/routes/appClassificationRoutes.js) |
| 197 | `GET` | `/api/app-classifications/check-break-mode` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | AppClassification | `checkBreakMode` | [appClassificationRoutes.js](file:///src/routes/appClassificationRoutes.js) |
| 198 | `GET` | `/api/tasks/:taskId/comments` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Comment | `getComments` | [commentRoutes.js](file:///src/routes/commentRoutes.js) |
| 199 | `POST` | `/api/tasks/:taskId/comments` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Comment | `addComment` | [commentRoutes.js](file:///src/routes/commentRoutes.js) |
| 200 | `PUT` | `/api/tasks/comment/:commentId` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Comment | `updateComment` | [commentRoutes.js](file:///src/routes/commentRoutes.js) |
| 201 | `DELETE` | `/api/tasks/comment/:commentId` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Comment | `deleteComment` | [commentRoutes.js](file:///src/routes/commentRoutes.js) |
| 202 | `GET` | `/api/tasks/:taskId/comments/unread-count` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Comment | `getUnreadCommentCount` | [commentRoutes.js](file:///src/routes/commentRoutes.js) |
| 203 | `PATCH` | `/api/tasks/:taskId/comments/read` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Comment | `markCommentsAsRead` | [commentRoutes.js](file:///src/routes/commentRoutes.js) |
| 204 | `POST` | `/api/locations` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Location | `saveLocation` | [locationRoutes.js](file:///src/routes/locationRoutes.js) |
| 205 | `GET` | `/api/locations` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Location | `getLocations` | [locationRoutes.js](file:///src/routes/locationRoutes.js) |
| 206 | `POST` | `/api/manual-time-requests` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | ManualTimeRequest | `createRequest` | [manualTimeRequestRoutes.js](file:///src/routes/manualTimeRequestRoutes.js) |
| 207 | `GET` | `/api/manual-time-requests` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | ManualTimeRequest | `getRequests` | [manualTimeRequestRoutes.js](file:///src/routes/manualTimeRequestRoutes.js) |
| 208 | `PATCH` | `/api/manual-time-requests/:id/approve` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | ManualTimeRequest | `approveRequest` | [manualTimeRequestRoutes.js](file:///src/routes/manualTimeRequestRoutes.js) |
| 209 | `PATCH` | `/api/manual-time-requests/:id/reject` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | ManualTimeRequest | `rejectRequest` | [manualTimeRequestRoutes.js](file:///src/routes/manualTimeRequestRoutes.js) |
| 210 | `GET` | `/api/manual-time-requests/count` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | ManualTimeRequest | `getPendingCount` | [manualTimeRequestRoutes.js](file:///src/routes/manualTimeRequestRoutes.js) |
| 211 | `POST` | `/api/stripe/webhook` | `WEBHOOK` | OPTIONAL_OR_NONE | STANDARD_USER | Unknown | `handleStripeWebhook` | [stripeWebhookRoutes.js](file:///src/routes/stripeWebhookRoutes.js) |
| 212 | `GET` | `/api/notifications` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Notification | `getNotifications` | [notificationRoutes.js](file:///src/routes/notificationRoutes.js) |
| 213 | `GET` | `/api/notifications/unread-count` | `AUTHENTICATED_READ` | REQUIRED | STANDARD_USER | Notification | `getUnreadNotificationCount` | [notificationRoutes.js](file:///src/routes/notificationRoutes.js) |
| 214 | `PATCH` | `/api/notifications/:id/read` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Notification | `markNotificationAsRead` | [notificationRoutes.js](file:///src/routes/notificationRoutes.js) |
| 215 | `PATCH` | `/api/notifications/read-all` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Notification | `markAllNotificationsAsRead` | [notificationRoutes.js](file:///src/routes/notificationRoutes.js) |
| 216 | `PATCH` | `/api/notifications/notifications` | `AUTHENTICATED_WRITE` | REQUIRED | STANDARD_USER | Notification | `updateOrganizationNotifications` | [notificationRoutes.js](file:///src/routes/notificationRoutes.js) |

---

## 3. Representative Endpoints Selected for Dual-Provider Testing

The compatibility test suite exercises representative routes from each domain area against both MongoDB (production reference) and PostgreSQL staging (`workcomposer_staging`):

1. **Authentication & Identity**:
   * `POST /api/auth/login`
   * `GET /api/auth/me`
   * `POST /api/auth/refresh`
   * `POST /api/auth/logout`
2. **Organizations & Teams**:
   * `GET /api/organization`
   * `GET /api/teams`
   * `GET /api/roles`
3. **Users & Profiles**:
   * `GET /api/users`
   * `GET /api/users/:id`
4. **Work Management**:
   * `GET /api/projects`
   * `GET /api/tasks`
   * `GET /api/tasks/:taskId/comments`
5. **Time Tracking & Attendance**:
   * `GET /api/sessions`
   * `GET /api/attendance`
   * `GET /api/timers/active`
   * `GET /api/project-tracking`
   * `GET /api/manual-time-requests`
6. **Reports & Analytics**:
   * `GET /api/reports/daily-summary`
   * `GET /api/reports/weekly-summary`
   * `GET /api/reports`
7. **Telemetry & Activity**:
   * `GET /api/screenshots`
   * `GET /api/activity`
   * `GET /api/usage`
   * `GET /api/locations`
8. **Platform & Integrations**:
   * `GET /api/notifications`
   * `GET /api/auditLog`
   * `GET /api/api-keys`
   * `GET /api/billing/profile`
   * `GET /api/time-tracking`
