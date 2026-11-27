export type DocSubsection = {
  heading: string;
  body: string;
  bullets?: string[];
  code?: string;
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
      "How WorkComposer connects the Next.js Web Dashboard, Electron Desktop Agent, native Windows/macOS helpers, and the Express + Socket.io backend.",
    tags: [
      "onboarding",
      "invite",
      "installer",
      "windows",
      "architecture",
      "socket.io",
      "setup",
    ],
    subsections: [
      {
        heading: "Workspace Onboarding & Team Invites",
        body: "Owners create an organization account via Sign up and invite team members by email or bulk CSV invite. Invited teammates accept their workspace link at /accept-invite, verify email changes securely, and sign in with email/password or Google, Microsoft, or Apple OAuth.",
        bullets: [
          "Public workspace entry routes (/authenticate/login, /authenticate/signup, /accept-invite, /docs) require no prior session.",
          "Two-factor authentication (2FA) can be configured under Settings → Account → Security.",
          "Each organization sets its canonical report timezone (or Browser timezone fallback) in Settings.",
        ],
      },
      {
        heading: "Desktop Agent Installation (Windows v1.0.0)",
        body: "Employees install WorkComposer-Desktop-Setup-v1.0.0.exe (Windows 10/11 64-bit, NSIS installer). Once signed in on the desktop app, sessions, permissions, and tracking rules sync automatically over HTTPS REST APIs and real-time Socket.io rooms.",
      },
      {
        heading: "Four-Layer Platform Architecture",
        body: "WorkComposer splits responsibilities cleanly so telemetry remains lightweight (<1% CPU at idle) while web reporting stays instant across every team size.",
      },
    ],
    table: {
      headers: ["Component", "Stack & Runtime", "Primary Role"],
      rows: [
        [
          "Workcomposer Dashboard",
          "Next.js 16 (App Router) · React 19 · Tailwind v4",
          "Web reporting portal, settings console, task boards, and embedded Desktop views (/desktop, /idle, /tracking-bar).",
        ],
        [
          "WorkComposer Desktop",
          "Electron 42 · uiohook-napi · active-win · screenshot-desktop",
          "System-tray time tracker, idle detection, always-on-top Floating Bar, shift scheduler, and offline queues.",
        ],
        [
          "BrowserUrlReader & LocationReader",
          ".NET 8 Native Helpers (Windows UIAutomation / macOS)",
          "Reads active foreground browser domain/URL without extensions and provides opt-in device geolocation.",
        ],
        [
          "WorkComposer Backend",
          "Express 5 · Socket.io 4.8 · Prisma (PostgreSQL) / Mongoose",
          "CSRF-protected REST & /api/v1 endpoints, RBAC enforcement, overlap/timezone reporting, and real-time broadcasts.",
        ],
      ],
    },
    callout: {
      tone: "info",
      title: "Live Real-Time Sync",
      text: "Changes to tracking mode, screenshot intervals, blur strength, roles, or user timezone push immediately through organization Socket.io channels (such as tracking-settings-updated) so connected Desktop agents apply updated rules without restarting.",
    },
  },
  {
    id: "desktop-tracker",
    badge: "02 · Desktop Client",
    title: "Desktop Tracker, Modes & Floating Bar",
    summary:
      "Configurable tracking modes (Automatic, Manual, Silent), the compact 410×42 Floating Tracking Bar, idle prompts, shift scheduling, and offline resilience.",
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
    ],
    subsections: [
      {
        heading: "Workspace Tracking Modes",
        body: "Administrators configure an organization-wide tracking mode — and optionally override it per employee using per-user configuration — under Settings → Time Tracking → Tracking:",
        bullets: [
          "Automatic: Tracking starts automatically on sign-in or when the computer boots (startTrackingOnBoot) and follows assigned shift schedules.",
          "Manual: Employees start, stop, take breaks, and switch active project tasks directly from the Desktop dashboard or Floating Bar.",
          "Silent: Runs unobtrusively in the background with system-tray status sync and minimal interruption.",
        ],
      },
      {
        heading: "Compact Floating Tracking Bar (/tracking-bar)",
        body: "While active, the always-on-top 410×42 Floating Bar displays your live elapsed session timer (00:00:00), animated work-state badge (Working, Break, Idle, Stopped with reduced-motion support), quick Stop button, and Expand button to reopen the main Desktop window. Its drag bounds clamp cleanly within the active display work area above the Windows taskbar.",
      },
      {
        heading: "Idle Detection & Work Away From Computer",
        body: "Mouse and keyboard activity events (sampled locally without logging keystrokes) detect inactivity after your configured inactivityMinutes threshold (1–60 minutes). When triggered, the /idle overlay prompts the user to keep or discard idle time, unless allowWorkAwayFromComputer is enabled.",
      },
      {
        heading: "Shift Schedules & Durable Offline Queues",
        body: "Daytime and overnight shift windows (evaluated in the workspace/shift IANA timezone with DST awareness) govern automatic start/break/stop windows. If internet connectivity drops, durableTelemetryQueue and offlineScreenshotQueue retain payloads safely on disk and replay them in chronological order once reconnected.",
      },
    ],
    callout: {
      tone: "tip",
      title: "Keyboard & Tray Lifecycle",
      text: "Closing the Desktop main window minimizes WorkComposer to the system tray instead of killing an active session, and single-instance locking prevents duplicate background trackers on Windows.",
    },
  },
  {
    id: "time-attendance",
    badge: "03 · Time & Attendance",
    title: "Time Tracking, Attendance & Reporting",
    summary:
      "Home dashboards, Attendance punch bounds, My Report, timezone-safe interval merging, manual time approvals, and reusable Date Range persistence.",
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
    ],
    subsections: [
      {
        heading: "Home, Overview, Attendance & My Report",
        body: "Managers and employees share consistent time views scoped by their role permissions:",
        bullets: [
          "Personal & Team Home: Live team day status (Online, On Break, Offline), daily metric cards, and weekly comparison summaries.",
          "Overview: Roll-up totals combining Work Time, Break Time, Idle Time, Activity %, and quick drill-downs.",
          "Attendance: First punch-in, last punch-out, break durations, and chronological session segments per employee.",
        ],
      },
      {
        heading: "Timezone-Accurate Overlap Accounting",
        body: "All daily boundaries use half-open zoned day bounds (getZonedDayRange) in your configured Report Timezone (e.g., Asia/Kolkata, America/New_York). Multiple or overlapping work/break intervals are merged via interval-overlap calculation and reconciled with any still-running active Timer up to evaluation time.",
      },
      {
        heading: "Date Range Picker & Calendar Persistence",
        body: "Filter any Time Tracking report using Quick Select presets (Today, Yesterday, This week, Last 7/14/30 days, This month, Last month) or Day, Week, Month, Year, and Custom dual-calendar modes. Reopening the calendar preserves your committed range and quick-select highlight in the organization timezone.",
      },
      {
        heading: "Manual Time Requests & Exports",
        body: "When enabled in Settings → Time Tracking → Manual Time, employees can submit manual time adjustments for manager approval. Reports support CSV/background export jobs and scheduled daily/weekly Email Reports.",
      },
    ],
  },
  {
    id: "screenshots-activity",
    badge: "04 · Telemetry",
    title: "Screenshots & Work Details Activity",
    summary:
      "Randomized interval screen captures, workspace-wide blur options, newest-first timelines, and 1-minute keystroke/mouse activity buckets.",
    tags: [
      "screenshots",
      "blur",
      "work details",
      "activity",
      "idle time",
      "screen capture",
      "cloudinary",
    ],
    subsections: [
      {
        heading: "Configurable Capture Cadence & Blur",
        body: "Settings → Time Tracking → Screen Capture controls whether screenshots are taken, how frequently captures occur (with randomized intervals to avoid predictable timing), and whether images are stored unblurred, lightly softened, or heavily blurred.",
      },
      {
        heading: "Work Details Modal & 1-Minute Buckets",
        body: "Clicking any user or day opens the Work Details view showing screenshots sorted newest-first in the organization timezone paired with 1-minute mouse/keyboard telemetry buckets.",
        bullets: [
          "Activity % reflects the share of active telemetry minutes relative to tracked work duration.",
          "Idle intervals remain visible alongside active blocks so managers and employees see the same numbers.",
          "Zero keystroke text or passwords are ever recorded — only aggregate input activity counts per minute.",
        ],
      },
    ],
    callout: {
      tone: "privacy",
      title: "Privacy-by-Design Capture Storage",
      text: "Blur strength is configured at the workspace level and visible to tracked team members. Screenshots transfer over authenticated TLS connections to Cloudinary or your configured external S3 storage integration.",
    },
  },
  {
    id: "usage-productivity",
    badge: "05 · Analytics",
    title: "Web & App Usage & Productivity",
    summary:
      "Native foreground app and browser domain tracking, organization-scoped domain normalization, Top-N bar charts, and Productive/Neutral/Unproductive rules.",
    tags: [
      "usage",
      "web usage",
      "app usage",
      "productivity",
      "browserurlreader",
      "domains",
      "chart",
    ],
    subsections: [
      {
        heading: "Foreground App & Native Browser URL Detection",
        body: "Instead of requiring invasive browser extensions, WorkComposer pairs active-win with BrowserUrlReader (.NET 8 Windows UIAutomation and MacBrowserReader on macOS) to extract active browser tab domains cleanly.",
      },
      {
        heading: "Domain Normalization & Drill-Down Modals",
        body: "Domains are normalized case-insensitively per organization so visits to mixed-case hostnames aggregate accurately under one bar. Click Full list or Detailed log inside Web & App Usage to filter, search, and audit minute-by-minute application and domain durations.",
      },
      {
        heading: "Productivity Classification Boards",
        body: "In Settings → Time Tracking → Productivity and the live Productivity report, admins categorize apps and domains into Productive, Neutral, or Unproductive using portal context menus that update charts and scorecards immediately.",
      },
    ],
  },
  {
    id: "live-location",
    badge: "06 · Field & Remote",
    title: "Live Location Tracking",
    summary:
      "Opt-in device and IP geolocation plotted on an interactive Leaflet Street & Esri Satellite team map with date-range work/break cards.",
    tags: [
      "location",
      "map",
      "leaflet",
      "satellite",
      "ip",
      "geolocation",
      "work time",
    ],
    subsections: [
      {
        heading: "Opt-In Location Telemetry",
        body: "Location tracking is disabled by default for new workspaces. When explicitly enabled, Desktop agents pair native LocationReader coordinates or IP-based ISP lookup metadata with active sessions.",
      },
      {
        heading: "Interactive Map, Clustering & Employee Popups",
        body: "The Live Location view supports toggling between Street (OpenStreetMap) and Satellite (Esri) tiles with MarkerClusterGroup clustering. Clicking a team member marker opens a scroll-stable dark/light themed popup displaying their city, network/ISP, recent timestamps, and exact WORK TIME and BREAK TIME totals synced to the active Date Range filter.",
      },
    ],
  },
  {
    id: "projects-tasks",
    badge: "07 · Execution",
    title: "Projects & Task Management",
    summary:
      "Team- and user-scoped projects, task statuses and priorities, comments, Recently Deleted recovery, Desktop task timers, and Jira/Asana sync.",
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
        heading: "Project Access & Task Lifecycle",
        body: "Projects live in the Task Management sidebar and can grant access to entire Teams or specific Individual Users. Tasks move through Todo, In progress, and Done states with Low/Medium/High priority, due dates, overdue highlights, and multi-assignee selection.",
      },
      {
        heading: "Task Details, Comments & Recovery",
        body: "Open any task to edit metadata (or view in read-only mode when opened without manage_tasks privilege), post or edit threaded comments with unread comment indicators, bulk delete tasks, or restore soft-deleted items from More → Recently Deleted.",
      },
      {
        heading: "Project Time Attribution",
        body: "In the Desktop app, assigned users can click Start / Done directly on a task row to attribute tracked focus time to that project and task. Managers review aggregated hours in Time Tracking → Project Tracking and export User or Project reports.",
      },
    ],
  },
  {
    id: "settings-rbac",
    badge: "08 · Governance",
    title: "Organization Settings, Roles (RBAC) & Integrations",
    summary:
      "Granular role privileges, multi-manager team scoping, live settings propagation, API keys, audit logs, billing, and external tool integrations.",
    tags: [
      "rbac",
      "roles",
      "permissions",
      "manager",
      "owner",
      "admin",
      "settings",
      "api",
      "integrations",
      "stripe",
      "slack",
      "bamboohr",
      "keka",
    ],
    subsections: [
      {
        heading: "Multi-Manager User Scoping & Team Sync",
        body: "Under User Management, admins can assign multiple managers to each employee and update team memberships cleanly from both User Edit and Manager modals. Managers automatically scope reports and approvals to their assigned direct reports and managed teams.",
      },
      {
        heading: "Security, API Access & Integrations",
        body: "Organizations can enforce Two-Factor Authentication (2FA), inspect Audit Logs, monitor Desktop app update versions, issue scoped /api/v1 API keys with usage logs, manage Stripe subscriptions under Billings, and connect Slack, Jira, Asana, BambooHR, Keka, and custom S3/Cloudinary storage.",
      },
    ],
    table: {
      headers: ["Role / Privilege", "Scope", "Capabilities"],
      rows: [
        [
          "Owner / Admin",
          "Organization-wide",
          "Full access to billing, organization settings, role definitions, user management, all reports, and audit logs.",
        ],
        [
          "Manager",
          "Assigned users & teams",
          "Views reports, screenshots, attendance, manual time approvals, and projects scoped to assigned team members.",
        ],
        [
          "User (Employee)",
          "Self",
          "Tracks desktop time, views personal Home/My Report telemetry, submits manual time requests, and works on assigned tasks.",
        ],
        [
          "Custom Role Flags",
          "Granular per role",
          "Configurable toggles for manage_billing, manage_settings, manage_users, manage_projects, manage_tasks, reportAccess, and screenshotAccess.",
        ],
      ],
    },
  },
  {
    id: "privacy-troubleshooting",
    badge: "09 · Trust & Support",
    title: "Privacy Transparency & Troubleshooting FAQ",
    summary:
      "Plain-view monitoring guarantees, timezone diagnostics, offline queue recovery, and desktop permission checks.",
    tags: [
      "privacy",
      "faq",
      "troubleshooting",
      "timezone",
      "permissions",
      "network",
      "refresh",
      "token",
    ],
    subsections: [
      {
        heading: "Employee Privacy Guarantees",
        body: "WorkComposer never hides monitoring behind secret config files. Every employee can inspect their organization's active screenshot cadence, blur setting, idle timeout, and location tracking status directly.",
        bullets: [
          "No keystroke content logging: WorkComposer samples event activity counts only.",
          "Location tracking is workspace opt-in and off by default.",
          "All tokens, cookies, CSRF checks, and media uploads are encrypted in transit and scoped strictly by organization tenant ID.",
        ],
      },
      {
        heading: "Why do report timestamps differ from my laptop clock?",
        body: "Reports follow your configured Report Timezone (shown in the top-right header bar beside Last synced and inside the Date Range modal). Update your timezone under Settings → Profile.",
      },
      {
        heading: "What happens if my internet disconnects mid-shift?",
        body: "Keep working normally. WorkComposer Desktop queues timer heartbeats, activity telemetry, and screenshots locally on disk and automatically flushes them with original timestamps once connectivity returns.",
      },
      {
        heading: "Browser URLs are showing as only the browser app name",
        body: "On Windows, verify BrowserUrlReader is bundled alongside the Electron executable and the browser window is in focus. On macOS, grant Accessibility permission to WorkComposer Desktop under System Settings → Privacy & Security so MacBrowserReader can inspect the active tab URL.",
      },
    ],
  },
];

