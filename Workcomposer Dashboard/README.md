# Workcomposer Dashboard

The **Next.js 16.2 App Router** web dashboard, public documentation portal, and embedded Electron desktop UI for the **WorkComposer** monorepo (`Workcomposer Dashboard/`).

It provides the browser and desktop-hosted interfaces for organizations, managers, and employees to track time, inspect screenshots & activity telemetry, analyze app/web usage and live locations, manage projects & tasks, administer RBAC and Settings, and browse public developer documentation.

> Root repository guide: see [../README.md](../README.md) · Backend API guide: see [../WorkComposer Backend/README.md](../WorkComposer%20Backend/README.md)

---

## Tech Stack

- **Framework:** Next.js `16.2.4` (App Router, `next dev --webpack`)
- **UI Runtime:** React `19.2.7` & React DOM `19.2.7`
- **Language:** TypeScript `6.0.3` (plus JavaScript `.js`/`.jsx` compatibility)
- **Styling:** Tailwind CSS `4` (`@tailwindcss/postcss`) with Light & Dark CSS theme variables (`ThemeContext`)
- **Networking & Real-Time:** Axios `1.15.0` (CSRF + refresh token interceptors), Socket.io Client `4.8.3`
- **Visualization & Maps:** Chart.js `4.5.1` (`react-chartjs-2`), Recharts `3.8.1`, Leaflet `1.9.4` / `react-leaflet` `5.0.0` / `react-leaflet-cluster` `4.1.3`
- **Utilities & Icons:** `date-fns` `4.4.0`, `date-fns-tz` `3.2.0`, `papaparse` `5.5.3`, `lucide-react` `1.8.0`, `react-icons` `5.6.0`, `react-hot-toast` `2.6.0`
- **Testing & Quality:** Playwright `1.64.1` (`npm run test:smoke`), ESLint `9` (`eslint-config-next`)

---

## Main Features & Routes

### Public Marketing & Documentation Portal
- **`/` (`src/app/page.js`)** — Landing page featuring the responsive top navigation and `ResourcesMenu` mega-menu (`src/components/navigation/ResourcesMenu.tsx`).
- **`/docs` (`src/app/docs/`)** — Public WorkComposer knowledge base & onboarding documentation.
- **`/developer-api/docs` & `/developer-api/docs/api-quickstart`** — Public REST API reference (`/api/v1`) and interactive API quickstart guide linked from both the marketing navbar and Dashboard Settings → API Access.
- **`/authenticate`, `/accept-invite`, `/verify-email-change`** — Sign-in, registration, workspace invites, password reset, and email-change confirmation flows.

### Web Dashboard (`/dashboard`)
- **Home & Overview** — Personal and Team Day live status cards, daily worked/break summaries, date-range persistence, and responsive sub-header (`OverviewHeader`, `DateControls`, `FilterPopover`).
- **Time Tracking**
  - **Attendance** — Zoned daily attendance intervals, active timer merging, punch bounds, and shift compliance.
  - **Screenshots** — Gallery view (sorted newest-first) + **Hourly Visual Filmstrip Timeline** grouped by hour in user timezone with quick hour-jump pills, unclipped `aspect-video` cards, click-to-preview detail modal, `Captured`/`Uncaptured` filtering, and ZIP export.
  - **Work Details** — 1-minute activity telemetry buckets, keyboard/mouse activity %, and idle intervals.
  - **Project Tracking, Web & App Usage, Productivity** — Interactive charts, `Full list` / `Detailed log` modals, and `Productive` / `Neutral` / `Unproductive` classification boards.
  - **Live Location** — Leaflet Street & Esri Satellite map with clustered user markers and date-range aligned work/break totals.
- **Task & Project Management (`/dashboard/task-management` & `src/app/modules/`)** — Project sidebar, interactive Kanban & list boards, task comments, soft-deleted task recovery, and Jira/Asana sync visibility.
- **Users, Teams, Roles & Notifications** — Multi-manager assignments, custom role permissions, team scoping, and aligned Notification/Inbox drawer (`left-0 lg:left-64 xl:left-72`).
- **Settings (`/dashboard/settings` & `src/app/modules/settings/`)** — Profile, Organization, Security, Billing (Stripe), Integrations, Time Tracking, App Tracking, and API Access (`ApiKeys`, `ApiLogs`), consistently styled for both Light and Dark modes.

### Electron-Embedded Routes
- **`/desktop` (`src/app/desktop/` + `desktop-components/`)** — Embedded Electron main shell with desktop session status, task selection, and offline alerts.
- **`/idle` (`src/app/idle/`)** — Idle timeout prompt allowing users to keep, reassign, or discard idle minutes.
- **`/tracking-bar` (`src/app/tracking-bar/`)** — Always-on-top compact floating tracking bar (`410x42`) supporting **Work / Break toggle**, live timer display, stop tracking, task/project switching, and opening the main Electron window via `window.electronAPI`.

---

## Desktop & Browser Integration

The dashboard integrates with **WorkComposer Desktop** through the Electron context bridge exposed at `window.electronAPI` (typed under `src/types/`).

Native browser URL capture for Web & App Usage reports is performed by the `.NET 8` native helpers invoked by Electron:
- **Windows (`BrowserUrlReader` UIAutomation):** Google Chrome, Brave, Microsoft Edge, Opera, Vivaldi, and Mozilla Firefox.
- **macOS (`MacBrowserReader` AppleScript):** Safari, Google Chrome, Microsoft Edge, Brave, Opera, and Mozilla Firefox.

---

## Project Structure

```text
Workcomposer Dashboard/
├── next.config.mjs                 # Next.js image remotePatterns (localhost:5000/uploads/**, res.cloudinary.com)
├── package.json                    # Scripts & dependencies
├── README.md                       # This file
└── src/
    ├── api/                        # Axios instance with CSRF, JWT refresh, & timezone headers
    ├── app/
    │   ├── page.js                 # Public landing page
    │   ├── (authenticated)/        # Authenticated route group helpers
    │   ├── authenticate/           # Login / signup / auth flows
    │   ├── accept-invite/          # Workspace invite acceptance
    │   ├── verify-email-change/    # Email change verification
    │   ├── docs/                   # Public /docs portal
    │   ├── developer-api/          # /developer-api/docs & /developer-api/docs/api-quickstart
    │   ├── dashboard/              # Web dashboard routes, responsive navbar (dashnavbar.js), & sidebar
    │   ├── modules/                # Feature workspaces (task-management, settings, etc.)
    │   ├── desktop/                # Embedded desktop app shell
    │   ├── desktop-components/     # Electron-specific UI components
    │   ├── idle/                   # Desktop idle modal route
    │   ├── tracking-bar/           # Floating 410x42 tracking bar route
    │   ├── components/ & providers/
    ├── assets/                     # Product screenshots & static media
    ├── components/                 # Shared UI, navigation (ResourcesMenu.tsx), modals, theme controls
    ├── constants/                  # Shared frontend constants
    ├── context/                    # Dashboard, Desktop, Project, Theme, TimeTracking, Timer contexts
    ├── hooks/                      # Reusable hooks (notifications, timezone, screenshot capture)
    ├── lib/ & socket/              # Shared utilities & Socket.io client wrapper
    ├── types/                      # TypeScript declarations (Electron bridge, API models)
    └── utils/                      # Timezone bounds, chart/timeline formatters, user helpers
```

---

## Prerequisites & Environment Setup

- **Node.js `20+`** (verified with `v24.13.1`) and **npm**
- **WorkComposer Backend** running locally on port `5000` (or deployed HTTPS origin)
- **WorkComposer Desktop** *(optional, required when exercising `/desktop`, `/idle`, or `/tracking-bar` Electron IPC flows)*

Create `Workcomposer Dashboard/.env.local` (never commit `.env*` files):

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
NEXT_PUBLIC_API_ORIGIN=http://localhost:5000
NEXT_PUBLIC_BACKEND_URL=http://localhost:5000
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000

# Optional server/smoke helper tokens (leave unset for normal local UI usage)
# WORKCOMPOSER_API_KEY=<api-key-placeholder>
# WORKCOMPOSER_JWT=<jwt-placeholder>
```

> **Note (`next.config.mjs`):** Remote `<Image>` optimization allows `http://localhost:5000/uploads/**` and `https://res.cloudinary.com`.

---

## Available Scripts

Run commands inside `Workcomposer Dashboard/`:

```bash
# Install dependencies
npm install

# Run local development server (Next.js Webpack dev on http://localhost:3000)
npm run dev

# Typecheck strictly without incremental cache
npx tsc --noEmit --incremental false

# Run ESLint
npm run lint

# Run Playwright smoke tests
npm run test:smoke

# Build & start production server
npm run build
npm start
```

---

## Development Notes

- **Authorization:** The backend (`WorkComposer Backend`) enforces multi-tenant `callerOrgId` and RBAC privileges (`none` / `own` / `managed` / `all`). Frontend checks control UI visibility only and must not be treated as a security boundary.
- **Timezones:** Always route date-sensitive ranges and formatters through the centralized timezone utilities (`src/utils/` and report/user timezone contexts) rather than raw browser-local `Date` assumptions.
- **Electron Safety:** Guard all `window.electronAPI` calls and browser-only globals (`window`, `localStorage`) so Next.js SSR and standalone browser sessions never throw.
- **Theme Parity:** Use shared theme tokens and dark/light Tailwind variants across Settings, modals, charts, and time-tracking views.
