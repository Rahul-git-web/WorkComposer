export type DocSubsection = {
  id?: string;
  heading: string;
  body: string;
  steps?: string[];
  bullets?: string[];
  code?: string;
  cta?: {
    label: string;
    href: string;
  };
};

export type DocTable = {
  headers: string[];
  rows: string[][];
};

export type DocCallout = {
  title: string;
  tone: "info" | "tip" | "privacy";
  text: string;
};

export type DocSection = {
  id: string;
  badge: string;
  title: string;
  summary: string;
  tags: string[];
  subsections: DocSubsection[];
  table?: DocTable;
  callout?: DocCallout;
};

export const DESKTOP_DOWNLOAD_URL =
  "https://github.com/Rahul-git-web/WorkComposer-Desktop/releases/download/v1.0.0/WorkComposer-Desktop-Setup-v1.0.0.exe";

export const DOCS_SECTIONS: DocSection[] = [
  {
    id: "getting-started",
    badge: "01 · Foundation",
    title: "Getting Started & Architecture",
    summary:
      "End-to-end onboarding from creating an organization workspace and inviting employees to installing the Electron 42 desktop agent and understanding real-time Socket.io synchronization.",
    tags: [
      "onboarding",
      "invite",
      "accept-invite",
      "installer",
      "windows",
      "architecture",
      "socket.io",
      "setup",
      "how it works",
      "appdata",
      "oauth",
      "2fa",
    ],
    subsections: [
      {
        id: "user-onboarding",
        heading: "Workspace Setup & User Onboarding",
        body: "Owners register a workspace at /authenticate/signup, configure organization defaults, and invite employees individually or via CSV upload under Dashboard → User Management. Invited team members complete onboarding through a single-use invite token without needing admin intervention.",
        steps: [
          "Register an organization at /authenticate/signup (or accept a workspace invitation link at /accept-invite).",
          "Sign in via email/password or Google, Microsoft, or Apple OAuth at /authenticate/login (with optional 2FA verification under Settings → Account → Security).",
          "Configure your canonical Report Timezone under Settings → Profile (or Organization defaults) so daily attendance and analytics align across distributed teams.",
          "Assign employee teams, roles, and multiple managers under Dashboard → User Management.",
        ],
        bullets: [
          "Public routes (/, /docs, /authenticate/*, /accept-invite, /verify-email-change/*) render without an authenticated dashboard session.",
          "Dashboard routes (/dashboard/*) validate sessions via /api/auth/me with CSRF protection and automatic access-token refresh.",
        ],
      },
      {
        heading: "Windows Desktop Agent Installation (v1.0.0)",
        body: "Download WorkComposer-Desktop-Setup-v1.0.0.exe (NSIS 64-bit Windows installer, customizable install path, optional Desktop and Start Menu shortcuts). On first launch, sign in once inside the desktop client — sessions, role permissions, and organization tracking rules sync automatically.",
        bullets: [
          "Local Electron runtime state, queued offline payloads, and diagnostics (`workcomposer-error.log`) live under `app.getPath(\"userData\")` (typically `%APPDATA%\\WorkComposer` in packaged Windows builds).",
          "Single-instance enforcement (`app.requestSingleInstanceLock()`) prevents duplicate background trackers from running simultaneously.",
        ],
      },
      {
        id: "how-it-works",
        heading: "How It Works — Four-Layer Platform Architecture",
        body: "WorkComposer separates lightweight desktop telemetry capture from real-time web analytics and multi-tenant data enforcement so tracking uses <1% CPU at idle while dashboards stay responsive.",
      },
    ],
    table: {
      headers: ["Component", "Stack & Key Modules", "Primary Responsibilities"],
      rows: [
        [
          "Workcomposer Dashboard",
          "Next.js 16 (App Router) · React 19 · Tailwind CSS v4",
          "Web analytics portal (/dashboard/*), role-scoped reports, settings console, plus embedded Desktop views (/desktop, /tracking-bar, /idle).",
        ],
        [
          "WorkComposer Desktop",
          "Electron 42.3 · electron-store · uiohook-napi · active-win · screenshot-desktop · sharp",
          "System-tray timer agent, global input activity counting, always-on-top 410×42 Floating Bar, shift scheduler, and offline retry queues.",
        ],
        [
          "BrowserUrlReader & LocationReader",
          ".NET 8 Native Helpers (Windows UIAutomation / macOS MacBrowserReader)",
          "Extracts active browser tab domains without browser extensions and provides opt-in Windows device location coordinates.",
        ],
        [
          "WorkComposer Backend",
          "Express 5 · Socket.io 4.8 · PostgreSQL (Prisma 6.19) & MongoDB (Mongoose 9)",
          "Multi-tenant RBAC & CSRF middleware, /api/* & /api/v1/* endpoints, overlap/zoned-day reporting, Cloudinary/Stripe/email services, and Socket.io rooms.",
        ],
      ],
    },
    callout: {
      tone: "info",
      title: "Real-Time Organization Socket Sync",
      text: "Whenever an administrator updates tracking settings, capture rules, roles, or user profiles in the web dashboard, the backend broadcasts events (such as `tracking-settings-updated`) to the organization's Socket.io room so connected Desktop clients and open web tabs enforce the new configuration immediately.",
    },
  },
  {
    id: "desktop-tracker",
    badge: "02 · Desktop Client",
    title: "Desktop Tracker, Modes & Floating Bar",
    summary:
      "Detailed reference for Automatic, Manual, and Silent tracking modes, the compact 410×42 Floating Bar, inactivity detection (/idle), shift enforcement, and durable offline queues.",
    tags: [
      "desktop",
      "electron",
      "floating bar",
      "tracking-bar",
      "automatic",
      "manual",
      "silent",
      "idle",
      "shift",
      "offline",
      "durabletelemetryqueue",
      "offlinescreenshotqueue",
    ],
    subsections: [
      {
        id: "tracking-modes",
        heading: "Time Tracking Modes Explained",
        body: "Configure organization defaults under Settings → Time Tracking → Tracking, or override individual users via the per-user Configure modal:",
        bullets: [
          "Automatic: Starts tracking automatically on desktop login or system startup (when `startTrackingOnBoot` is enabled) and honors assigned shift start/break/end windows.",
          "Manual: Employees explicitly start/stop sessions, take breaks, and switch active project tasks from `/desktop` or the Floating Tracking Bar.",
          "Silent: Records authorized work telemetry unobtrusively from the system tray without interrupting focus workflows.",
        ],
      },
      {
        heading: "Floating Tracking Bar (/tracking-bar)",
        body: "The always-on-top 410×42 Floating Bar keeps current session state visible without cluttering your workspace:",
        bullets: [
          "Displays live elapsed timer (`00:00:00`), active state indicator (`Working 💻`, `Break ☕`, `Idle 🌙`, `Stopped ⏸️` with `prefers-reduced-motion` support), quick Stop control, and Expand button to open `/desktop`.",
          "Position is persisted via `electron-store` (`trackingBarPosition`) and clamped strictly inside the active display's workArea above the Windows taskbar using `setPosition` on drag end and display-metric changes (`Resizable: false`, `useContentSize: true`).",
        ],
      },
      {
        id: "idle-tracking",
        heading: "Idle Time Detection & Allow Work Away From Computer",
        body: "Using `uiohook-napi` mouse and keyboard activity hooks (event timing only, never keystroke content), WorkComposer Desktop checks inactivity against `inactivityMinutes` (configurable from 1 to 60 minutes under `pauseTrackingWhenInactive`).",
        bullets: [
          "When `pauseTrackingWhenInactive` is enabled and idle exceeds the threshold, `/idle` opens showing exact idle duration so the employee can keep or discard the idle interval.",
          "Enabling `allowWorkAwayFromComputer` permits authorized offline/meeting time to remain counted without automatically pausing sessions.",
        ],
      },
      {
        id: "offline-tracking",
        heading: "Shift Schedules & Durable Offline Queues",
        body: "WorkComposer Desktop enforces daytime and overnight shifts (evaluated in the shift's IANA timezone across DST transitions) and protects telemetry during disconnects using two dedicated persistent queues under `app.getPath(\"userData\")`:",
        code: `# Durable Telemetry Queue (durableTelemetryQueue.js)\n- Partitioned per user slug: u_<userId>\n- Max queue size: 500 records / user with idempotency keys\n- Retry backoff: 5s base -> 2m cap (up to 10 retries before quarantine)\n\n# Offline Screenshot Queue (offlineScreenshotQueue.js)\n- Encrypted/archived local safe-retain buffer with free disk-space checks\n- Baseline capacity: 50 captures / 24h retention (30s -> 10m backoff, 5 retries)\n- Rescue & Dead-Letter safety partitions prevent data loss on flaky Wi-Fi`,
      },
    ],
    table: {
      headers: ["Tracking Mode", "Session Start Trigger", "Floating Bar / User Controls", "Best Fit"],
      rows: [
        [
          "Automatic",
          "Desktop sign-in / boot (`startTrackingOnBoot`) / shift start",
          "Live status display; follows shift windows & idle rules",
          "Standardized 9-to-5 or scheduled shift teams",
        ],
        [
          "Manual",
          "User clicks Start in `/desktop` or task row",
          "Full Start / Break / Stop / Switch Task controls",
          "Consultants, flexible schedules & project billing",
        ],
        [
          "Silent",
          "Automatic background agent on active OS session",
          "Tray-managed telemetry synced with organization policy",
          "Managed enterprise workstations",
        ],
      ],
    },
    callout: {
      tone: "tip",
      title: "Tray Close & Multi-Window Security Policy",
      text: "Closing the Desktop window hides it to the system tray rather than aborting active timers. All Electron BrowserWindows enforce `windowPolicy.js` navigation allowlists, blocking arbitrary external popups while permitting OAuth sign-in flows.",
    },
  },
  {
    id: "time-attendance",
    badge: "03 · Time & Attendance",
    title: "Time Tracking, Attendance & Reporting",
    summary:
      "How Home, Overview, Attendance, and My Report compute timezone-accurate work/break hours, merge overlapping sessions, handle manual time approvals, and persist calendar filters.",
    tags: [
      "attendance",
      "overview",
      "home",
      "my report",
      "manual time",
      "timezone",
      "calendar",
      "date range",
      "csv",
      "email reports",
      "getZonedDayRange",
    ],
    subsections: [
      {
        heading: "Home, Overview, Attendance & My Report Views",
        body: "Time Tracking modules roll session intervals into consistent metrics across Web and Desktop:",
        bullets: [
          "Team & Personal Home (`/dashboard/time-tracking/home`): Real-time status indicators (Working, On Break, Stopped/Offline), daily/weekly trend cards, and team timeline bars.",
          "Overview (`/dashboard/time-tracking/overview`): Team-wide or self-scoped summary table with Work Time, Break Time, Idle Time, Activity %, and Work Details modal inspection.",
          "Attendance (`/dashboard/time-tracking/attendance`): Exact first clock-in, last clock-out, session timelines, and printable daily attendance summaries.",
          "Scheduled Exports & Email Reports: Trigger CSV/background export jobs via Reports modals or automate daily/weekly digests under Settings → Time Tracking → Email Reports.",
        ],
      },
      {
        heading: "Zoned Day Bounds & Overlap Merging Engine",
        body: "To prevent cross-midnight drift across global teams, backend controllers compute half-open zoned day intervals (`[startUtc, nextDayStartUtc)` via `getZonedDayRange`) in the caller's Report Timezone, merge overlapping work or break segments via `calculateIntervalOverlap`, and reconcile any currently running Timer up to evaluation time.",
      },
      {
        heading: "Calendar Persistence & Date Range Controls",
        body: "All Time Tracking reports share `OverviewHeader` + `DateControls` + `DateRangeModalPreview`. Selecting `Last month`, `This month`, `Last week`, `Yesterday`, `Last 7/14/30 days`, `Year`, or `Custom` range persists the committed range across tab navigation and re-hydrates the exact Quick Select, mode tab, and calendar month/year in your organization timezone on reopen.",
      },
      {
        heading: "Manual Time Entries & Approval Controls",
        body: "Under Settings → Time Tracking → Manual Time, admins configure `allowManualTime`, `requireApproval`, `managerApproval` (allowing managers to approve requests for assigned team members), and backdating limits (`1–366` days). Approved manual adjustments flow straight into Overview and Attendance totals.",
      },
    ],
  },
  {
    id: "screenshots-activity",
    badge: "04 · Telemetry",
    title: "Screenshots & Work Details Activity",
    summary:
      "Interval/randomized screenshot cadence, workspace-wide blur modes, Cloudinary TLS media pipeline, upcoming S3/GCS/Azure integration, and 1-minute Work Details activity buckets.",
    tags: [
      "screenshots",
      "blur",
      "work details",
      "activity",
      "idle time",
      "screen capture",
      "cloudinary",
      "external storage",
      "s3",
      "1-minute",
    ],
    subsections: [
      {
        id: "screen-capture-blur",
        heading: "Screen Capture & Blur Privacy",
        body: "Configure organization and per-user screenshot rules under Settings → Time Tracking → Screen Capture:",
        bullets: [
          "Toggle capture enabled/disabled globally or per user.",
          "Select frequency intervals (`1`, `2`, `3`, `5`, `10`, `15`, `20`, `30`, or `60` minutes) and optionally enable `Randomize screenshot frequency` so capture times vary organically within each window.",
          "Set blur intensity globally: `Disabled` (`disabled`), `Slightly Blurred` (`slightly_blurred`), or `Maximum Blurring` (`maximum_blurring`).",
        ],
      },
      {
        id: "external-storage",
        heading: "Screenshot Storage & Cloud Integrations",
        body: "Captured screenshots are processed with `sharp` according to workspace blur settings, uploaded over authenticated HTTPS requests (or queued in `offlineScreenshotQueue.js` if offline), and stored on Cloudinary media storage by default. Under Settings → Account → Integrations → External Cloud Storage, direct connectors for custom Amazon Web Services (AWS S3), Google Cloud Storage, and Microsoft Azure Blob are scheduled as Coming Soon.",
      },
      {
        heading: "Work Details Modal & 1-Minute Activity Buckets",
        body: "Opening Work Details from Screenshots or Overview reveals a chronological, newest-first gallery paired with 1-minute activity buckets formatted in the active Report Timezone.",
        bullets: [
          "Each 1-minute bucket records aggregate keyboard and mouse activity presence (`activeSeconds / 60`) via `uiohook-napi` — zero keystroke text, window text input, or clipboard contents are ever captured.",
          "Daily `Activity %` and `Idle Time` cards reconcile identically between the timeline strip, Work Details header, and Overview table.",
        ],
      },
    ],
    callout: {
      tone: "privacy",
      title: "Transparent Blur & Access Controls",
      text: "Blur strength is configured at the workspace level and visible to tracked team members. Screenshot visibility in reports is strictly gated by each role's `screenshotAccess` privilege (`none`, `own`, `assigned`, `all`).",
    },
  },
  {
    id: "usage-productivity",
    badge: "05 · Analytics",
    title: "Web & App Usage & Productivity",
    summary:
      "Zero-extension native browser URL detection via BrowserUrlReader, case-insensitive domain normalization, Top-N bar charts, Detailed Logs, and Productive/Neutral/Unproductive classification.",
    tags: [
      "usage",
      "web usage",
      "app usage",
      "productivity",
      "browserurlreader",
      "macbrowserreader",
      "domains",
      "chart",
    ],
    subsections: [
      {
        heading: "Native Foreground App & Browser URL Detection",
        body: "WorkComposer avoids brittle browser plugins by combining `active-win` with compiled .NET 8 native readers bundled in `extraResources`:",
        bullets: [
          "Windows: `BrowserUrlReader.exe` uses Microsoft `Interop.UIAutomationClient` to inspect only the active browser address bar domain when a supported browser window has focus.",
          "macOS: `MacBrowserReader` extracts the foreground browser tab URL cleanly when Accessibility permission is granted.",
          "Only domain/application context and duration are logged — never form data, page content, or incognito/keystroke text.",
        ],
      },
      {
        heading: "Per-Org Domain Normalization & Drill-Down Modals",
        body: "Backend usage aggregation normalizes domain hostnames case-insensitively scoped per organization so `GitHub.com` and `github.com` merge into a single clean usage entry. Inside `/dashboard/time-tracking/usage`, inspect the Top-N horizontal bar chart or open `Full list` and `Detailed log` modals to filter, search, and audit minute-level app/website durations.",
      },
      {
        heading: "Productivity Classification Rules",
        body: "Admins classify apps and websites into `Productive`, `Neutral`, or `Unproductive` buckets under Settings → Time Tracking → Productivity or directly from the live `/dashboard/time-tracking/productivity` board via portaled context menus, recalculating productivity scores instantaneously.",
      },
    ],
  },
  {
    id: "live-location",
    badge: "06 · Field & Remote",
    title: "Live Location Tracking",
    summary:
      "Privacy-first opt-in team geolocation displayed on interactive OpenStreetMap Street & Esri Satellite tiles with clustered markers and date-range synced Work/Break popups.",
    tags: [
      "location",
      "map",
      "leaflet",
      "satellite",
      "ip",
      "geolocation",
      "work time",
      "locationreader",
    ],
    subsections: [
      {
        heading: "Opt-In Permission & Telemetry Sources",
        body: "Location tracking starts disabled for new organizations. When enabled in workspace settings, Desktop agents enrich active sessions with Windows `LocationReader` coordinates or IP geolocation metadata (`IPINFO_TOKEN` / ISP & city resolution).",
      },
      {
        heading: "Interactive Map, Clustering & Employee Cards",
        body: "In `/dashboard/time-tracking/location`, switch seamlessly between Street (OpenStreetMap) and Satellite (Esri) layers powered by Leaflet and `MarkerClusterGroup`. Clicking a marker opens a dark/light themed, scroll-stable popup showing employee city, ISP/network, recent location timestamps, and exact `WORK TIME` and `BREAK TIME` metrics aligned to the selected Date Range filter.",
      },
    ],
  },
  {
    id: "projects-tasks",
    badge: "07 · Execution",
    title: "Projects & Task Management",
    summary:
      "Team- and user-scoped projects, task statuses & priorities, comments with unread counts, Recently Deleted recovery, Desktop task timers, and Jira/Asana sync.",
    tags: [
      "projects",
      "tasks",
      "task-management",
      "jira",
      "asana",
      "comments",
      "recently deleted",
      "project tracking",
    ],
    subsections: [
      {
        heading: "Project Scoping & Task Workflows",
        body: "Projects are managed from the Task Management sidebar (`/dashboard/task-management`) with two access layers: Team-Based Access (auto-granting access to team members) and Individual User Access. Tasks support `Todo`, `In progress`, and `Done` statuses, `Low` / `Medium` / `High` priorities, due-date overdue highlighting, multi-assignee tagging, and multi-select bulk deletion.",
      },
      {
        heading: "Task Details, Comments & Soft-Delete Recovery",
        body: "Open any task to inspect or edit fields (automatically rendered in read-only banner mode if the viewer lacks `manage_tasks` permission), post/edit/delete threaded comments tracked by unread comment badges, or restore deleted tasks from `More → Recently Deleted`.",
      },
      {
        heading: "Desktop Task Timers & External Sync",
        body: "Employees running WorkComposer Desktop can click `Start` / `Done` directly on assigned task rows to attribute tracked session minutes to that project and task. Managers analyze logged project/task hours in Time Tracking → Project Tracking and synchronize external issues via Jira & Asana integrations.",
      },
    ],
  },
  {
    id: "settings-rbac",
    badge: "08 · Governance",
    title: "Organization Settings, Roles (RBAC) & API Documentation",
    summary:
      "Role-based privileges (`Owner`, `Admin`, `Manager`, `User`, custom roles), multi-manager team scoping, security/audit logs, third-party integrations, and REST `/api/v1` reference.",
    tags: [
      "rbac",
      "roles",
      "permissions",
      "manager",
      "owner",
      "admin",
      "settings",
      "api",
      "api documentation",
      "api keys",
      "integrations",
      "stripe",
      "slack",
      "bamboohr",
      "keka",
    ],
    subsections: [
      {
        heading: "Multi-Manager Scoping & Team Synchronization",
        body: "Under Dashboard → User Management, admins can assign multiple managers to any user and edit team memberships from either the Edit User modal or the Manager modal. When assigned, managers gain scoped visibility over their direct reports' Attendance, Overview, Screenshots, Usage, and Manual Time approvals without exposing unrelated teams.",
      },
      {
        heading: "Security, Billing & Ecosystem Integrations",
        body: "Configure Two-Factor Authentication (`/settings/account/security/two-factor`), inspect Security Audit Logs (`/audit-log`), monitor Desktop client updates (`/app-update`), manage Stripe billing plans (`/billings`), and connect Slack, Jira, Asana, BambooHR, Keka, and Email Reports.",
      },
      {
        id: "api-documentation",
        heading: "REST API Documentation & API Keys (/api/v1)",
        body: "Admins with `manage_settings` can create, revoke, and audit scoped API keys under Settings → Account → API Access (`API Keys` and `API Logs` tabs). Backend `apiKeyAuth` middleware verifies active/non-expired `wc_<64-hex>` keys via `Authorization: Bearer <YOUR_API_KEY>`, active non-archived key owners, and strict organization tenant isolation.",
        code: `# Authenticate API v1 requests using your organization API key\nAuthorization: Bearer <YOUR_API_KEY>\n\n# Public API v1 endpoint (requires active API key + manage_settings permission)\nGET /api/v1/projects\n# Response: { "success": true, "data": [{ "_id", "name", "description", "createdAt", "updatedAt" }] }\n\n# Core organization endpoints documented in Settings -> API Access:\nGET /api/users         # List organization users\nGET /api/projects      # List organization projects and tasks\nGET /api/reports       # Fetch tracking and productivity reports\nGET /api/attendance    # Fetch attendance and daily time summaries`,
        cta: {
          label: "Open Developer API Quickstart & OpenAPI Spec",
          href: "/developer-api/docs/api-quickstart",
        },
      },
    ],
    table: {
      headers: ["Role / Flag", "Access Scope", "Capabilities & Guards"],
      rows: [
        [
          "Owner / Admin",
          "Organization-wide (`callerOrgId`)",
          "Unrestricted workspace administration: billing, roles, API keys, integrations, audit logs, users, projects, and all reports.",
        ],
        [
          "Manager",
          "Assigned users & managed teams",
          "Scoped access to direct reports' Attendance, Overview, Screenshots, Usage, Location, and optional Manual Time approval.",
        ],
        [
          "User (Employee)",
          "Self only",
          "Runs Desktop tracker, views personal Home / My Report data, submits manual time requests, and updates assigned tasks/comments.",
        ],
        [
          "Custom Role Privileges",
          "Granular role matrix",
          "Configurable booleans (`manage_billing`, `manage_settings`, `manage_users`, `manage_projects`, `manage_tasks`) + scoped `reportAccess` & `screenshotAccess`.",
        ],
      ],
    },
  },
  {
    id: "privacy-troubleshooting",
    badge: "09 · Trust & Support",
    title: "Privacy Transparency & Troubleshooting FAQ",
    summary:
      "Plain-view employee privacy guarantees, timezone diagnostics, offline queue verification, and Windows/macOS desktop permission troubleshooting.",
    tags: [
      "privacy",
      "faq",
      "troubleshooting",
      "timezone",
      "permissions",
      "network",
      "refresh",
      "token",
      "browserurlreader",
      "single instance",
    ],
    subsections: [
      {
        heading: "Employee Privacy & Zero Hidden Monitoring",
        body: "WorkComposer keeps all tracking rules visible inside the workspace rather than buried in hidden config files. Every employee can see whether screenshot capture, blurring, inactivity pause, or location telemetry is active.",
        bullets: [
          "No keystroke content, clipboard, or password capture — only 1-minute activity counters (`uiohook-napi`).",
          "Location tracking is opt-in and off by default per organization.",
          "Cross-tenant isolation (`callerOrgId`) returns `404` non-disclosure responses on unauthorized resource lookups.",
        ],
      },
      {
        heading: "Why do dashboard report timestamps differ from my laptop clock?",
        body: "All Time Tracking reports evaluate day bounds and timestamps using your configured Report Timezone (displayed beside `Last synced` in the report header and inside the Date Range modal), rather than whatever temporary browser offset you travel through. Update your preference in Settings → Profile.",
      },
      {
        heading: "What happens if Wi-Fi disconnects or my token expires mid-shift?",
        body: "WorkComposer Desktop refreshes JWT access tokens cleanly in the background and persists pending heartbeats/screenshots in `durableTelemetryQueue` and `offlineScreenshotQueue` under `app.getPath(\"userData\")`. Once connectivity resumes, queued events flush automatically in chronological order.",
      },
      {
        heading: "Troubleshooting: Browser URLs, Tray Launch, & macOS Permissions",
        body: "Use this checklist if telemetry looks incomplete on a workstation:",
        steps: [
          "Windows URLs missing: Confirm `BrowserUrlReader.exe` exists in the Electron app `resources/` folder and the browser window has foreground focus.",
          "macOS URLs missing: Open macOS System Settings → Privacy & Security → Accessibility and enable WorkComposer so `MacBrowserReader` can read the active browser tab.",
          "Desktop app won't open a second window: WorkComposer enforces a single background instance (`requestSingleInstanceLock`); check the Windows system tray icon to restore the active window.",
        ],
      },
    ],
  },
];
