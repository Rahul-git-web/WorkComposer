# WorkComposer Desktop

The **Electron 42** cross-platform desktop client and background workforce telemetry agent for **WorkComposer** (`WorkComposer Desktop/`).

> Root repository guide: see [../README.md](../README.md) · Native helpers guide: see [../BrowserUrlReader/README.md](../BrowserUrlReader/README.md)

---

## Architecture & Capabilities

- **Main Process & Preload Bridge (`electron/main.js`, `electron/preload.js`)**
  - Manages system-tray lifecycle, single-instance locking, desktop authentication tokens, active Work/Break tracking state, and IPC (`window.electronAPI`).
  - Opens embedded Next.js UI routes hosted by **Workcomposer Dashboard**:
    - `/desktop` — Main desktop shell & task/project switcher
    - `/idle` — Interactive idle-timeout prompt
    - `/tracking-bar` — Compact always-on-top floating timer bar (`410x42`) with Work/Break status control and stop-tracking action
  - Uses local fallback files under `renderer/` (`index.html`, `app.js`, `style.css`) when offline or unavailable.
- **Endpoint Validation & Security (`electron/endpointConfig.js`)**
  - **Development defaults:** API `http://localhost:5000/api`, Web App `http://localhost:3000`.
  - **Packaged production defaults:** API `https://api.workcomposer.com/api`, Web App `https://app.workcomposer.com` (strictly enforces `https:` and rejects `localhost` / loopback hosts when packaged or `NODE_ENV=production`).
- **Custom Protocol Deep Links (`workcomposer://`)**
  - Validated in `endpointConfig.js` and handled in `main.js`:
    - `workcomposer://auth?...` — Receives `accessToken` / `refreshToken` from browser sign-in
    - `workcomposer://integrations/callback?...` — Returns completed desktop third-party OAuth integration flows
- **Workstation Telemetry & Policies**
  - Keyboard & mouse activity monitoring (`uiohook-napi`)
  - Active foreground window tracking (`active-win`) & browser URL reading via bundled .NET helpers
  - Automated screenshot capture & compression (`screenshot-desktop`, `sharp`)
  - Shift scheduling (`shiftSchedule.js`), window visibility policies (`windowPolicy.js`), disk-space checks (`diskSpaceProvider.js`), and gap detection (`eventGapTracker.js`)
- **Offline Resilience Queues**
  - `durableTelemetryQueue.js` — Persists activity/usage events across connectivity drops with original timestamps intact
  - `offlineScreenshotQueue.js` — Queues screenshots locally until connectivity resumes
  - `safeRetainArchive.js` & `safeRetainPolicy.js` — Safe-retain local storage management within configured disk caps

---

## Directory Structure

```text
WorkComposer Desktop/
├── assets/                          # App icons (workcomposer.png, workcomposer.ico)
├── electron/
│   ├── main.js                      # Electron main process, tray, IPC handlers, native helper runner
│   ├── preload.js                   # Context-isolated window.electronAPI bridge
│   ├── endpointConfig.js            # Dev/prod URL validation & workcomposer:// deep link validator
│   ├── durableTelemetryQueue.js     # Persistent offline telemetry queue
│   ├── offlineScreenshotQueue.js    # Persistent offline screenshot upload queue
│   ├── safeRetainArchive.js         # Local retained archive manager
│   ├── safeRetainPolicy.js          # Retention & disk threshold policy
│   ├── diskSpaceProvider.js         # Disk free-space helper
│   ├── eventGapTracker.js           # Suspend/resume & telemetry gap detector
│   ├── shiftSchedule.js             # Local shift-window enforcement
│   └── windowPolicy.js              # Desktop/TrackingBar/Idle window geometry & policy rules
├── renderer/                        # Offline/fallback HTML, JS, CSS renderer assets
├── resources/                       # Native helper executables referenced locally & via extraResources
│   ├── BrowserUrlReader.exe         # Windows UIAutomation browser URL reader
│   ├── LocationReader/              # Windows .NET 8 WinRT geolocation reader (net8.0-windows10.0.19041.0)
│   └── MacBrowserReader/            # macOS <arm64|x64>/Mac native browser URL reader binaries
├── package.json
└── README.md                        # This file
```

---

## Endpoint Environment Overrides

Both API and Web URLs can be overridden in development or custom deployments (`electron/endpointConfig.js`):

| Variable | Precedence | Purpose | Default |
| --- | --- | --- | --- |
| `WORKCOMPOSER_API_URL` | 1st | Desktop REST API base URL | Dev: `http://localhost:5000/api` |
| `NEXT_PUBLIC_API_URL` | 2nd | Shared API URL fallback | Prod: `https://api.workcomposer.com/api` |
| `WORKCOMPOSER_WEB_APP_URL` | 1st | Embedded Dashboard base URL | Dev: `http://localhost:3000` |
| `WORKCOMPOSER_APP_URL` / `NEXT_PUBLIC_APP_URL` / `WEB_APP_URL` | 2nd–4th | Alternate Web App URL overrides | Prod: `https://app.workcomposer.com` |

> When packaged (`app.isPackaged === true` or `NODE_ENV=production`), `endpointConfig.js` throws `EndpointConfigurationError` if either URL uses `http:` or points to `localhost` / `127.0.0.1` / `::1`.

---

## Bundled Native Resources (`build.extraResources`)

In packaged builds (`package.json`), `electron-builder` copies these native helpers alongside the app resources, and `electron/main.js` switches between `process.resourcesPath` (packaged) and `../resources/` (dev):

1. **`resources/BrowserUrlReader.exe`** → `BrowserUrlReader.exe` (Windows active-browser URL capture)
2. **`resources/LocationReader/bin/Release/net8.0-windows10.0.19041.0/win-x64/publish`** → `LocationReader/LocationReader.exe` (Windows geolocation)
3. **`resources/MacBrowserReader`** → `MacBrowserReader/<arm64|x64>/Mac` (macOS active-browser URL capture)

To rebuild these helpers from source, see [../BrowserUrlReader/README.md](../BrowserUrlReader/README.md).

---

## Development & Packaging Commands

Run inside `WorkComposer Desktop/` after starting **WorkComposer Backend** (`:5000`) and **Workcomposer Dashboard** (`:3000`):

```bash
# Install dependencies (runs postinstall: electron-builder install-app-deps)
npm install

# Launch the Electron desktop app locally (recommended dev entrypoint)
npm run electron

# Create unpacked directory build for local verification
npm run pack

# Build distributable installers (Windows NSIS .exe / macOS .dmg)
npm run dist
```

> **Important:** Use `npm run electron` (not `npm run dev`). `WorkComposer Desktop/package.json` still contains a legacy `"dev": "next dev --webpack"` script from an earlier setup even though Next.js lives in `Workcomposer Dashboard/`.

