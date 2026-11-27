const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  screen,
  powerMonitor,
  ipcMain,
  Notification,
  dialog,
  session,
  safeStorage,
} = require("electron");
const net = require("net");
const path = require("path");
const screenshot = require("screenshot-desktop");
const sharp = require("sharp");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const Store = require("electron-store").default;
const activeWin = require("active-win");
const { uIOhook } = require("uiohook-napi");
const { execFile } = require("child_process");
const crypto = require("crypto");
const os = require("os");
const offlineQueue = require("./offlineScreenshotQueue");
const shiftSchedule = require("./shiftSchedule");
const { getEventGapTracker } = require("./eventGapTracker");
const eventGapTracker = getEventGapTracker();
const { getDurableTelemetryQueue } = require("./durableTelemetryQueue");
const durableTelemetryQueue = getDurableTelemetryQueue();

process.on("uncaughtException", (err) => {
  try {
    fs.appendFileSync(
      path.join(app.getPath("userData"), "workcomposer-error.log"),
      `${new Date().toISOString()}\n${err.stack}\n\n`,
    );
  } catch {}
});

process.on("unhandledRejection", (err) => {
  try {
    fs.appendFileSync(
      path.join(app.getPath("userData"), "workcomposer-error.log"),
      `${new Date().toISOString()}\n${err}\n\n`,
    );
  } catch {}
});

const store = new Store();

const isDev = !app.isPackaged;

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
} else {
  if (process.platform === "win32" || process.platform === "linux") {
    if (isDev && process.argv[1]) {
      app.setAsDefaultProtocolClient("workcomposer", process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    } else {
      app.setAsDefaultProtocolClient("workcomposer");
    }
  } else {
    app.setAsDefaultProtocolClient("workcomposer");
  }
}

const devLog = (...args) => {
  if (isDev) {
    console.log(...args);
  }
};

const devWarn = (...args) => {
  if (isDev) {
    console.warn(...args);
  }
};

const logError = (error, context = "") => {
  try {
    const message = error?.stack || error?.message || String(error);

    fs.appendFileSync(
      path.join(app.getPath("userData"), "workcomposer-error.log"),
      `${new Date().toISOString()} ${
        context ? `[${context}] ` : ""
      }${message}\n\n`,
    );
  } catch {}
};

const endpointConfig = require("./endpointConfig");
const windowPolicy = require("./windowPolicy");

let resolvedEndpoints;
try {
  resolvedEndpoints = endpointConfig.resolveEndpoints({
    isPackaged: app.isPackaged,
    env: process.env,
  });
} catch (err) {
  logError(err, "ENDPOINT_CONFIG");
  if (app.isPackaged) {
    dialog.showErrorBox(
      "Configuration Error",
      `WorkComposer failed to resolve service endpoints:\n\n${err.message}`,
    );
    app.quit();
  }
  throw err;
}

const API_BASE_URL = resolvedEndpoints.apiUrl;
const WEB_APP_URL = resolvedEndpoints.webAppUrl;


function saveAuthToken(token) {
  if (!token) return;

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure storage is not available");
  }

  const encryptedToken = safeStorage.encryptString(token);

  store.set("authToken", encryptedToken.toString("base64"));
  currentUserId = offlineQueue.getUserIdFromToken(token);
  if (currentUserId && durableTelemetryQueue.isInitialized()) {
    durableTelemetryQueue.bindUser(currentUserId);
  }
}

function getStoredAuthToken() {
  return getSecureToken("authToken");
}

function saveSecureToken(key, token) {
  if (!token) return;

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Electron secure storage is unavailable");
  }

  const encrypted = safeStorage.encryptString(token);

  store.set(key, encrypted.toString("base64"));
}

function getDeviceInfo() {
  let deviceId = store.get("deviceId");

  if (!deviceId) {
    deviceId = crypto.randomUUID();

    store.set("deviceId", deviceId);

    devLog("NEW DEVICE ID CREATED:", deviceId);
  }

  return {
    deviceId,
    platform: process.platform,
    appVersion: app.getVersion(),
    hostname: os.hostname(),
  };
}

function getSecureToken(key) {
  const encrypted = store.get(key);

  if (!encrypted) {
    return null;
  }

  if (!safeStorage.isEncryptionAvailable()) {
    return null;
  }

  try {
    return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
  } catch (err) {
    logError(err, `FAILED TO DECRYPT ${key}`);

    store.delete(key);

    return null;
  }
}

function deleteSecureToken(key) {
  store.delete(key);
}

function deleteAuthToken() {
  store.delete("authToken");
  store.delete("refreshToken");
  authToken = null;

  devLog("AUTH TOKENS DELETED");
}

async function clearAuthSessionCookies() {
  try {
    if (!session?.defaultSession?.cookies) {
      return;
    }

    const apiOrigin = new URL(API_BASE_URL).origin;
    const apiProtocol = new URL(apiOrigin).protocol.replace(":", "");
    const apiHostname = resolvedEndpoints.apiHost.toLowerCase();
    const authCookieNames = new Set(["accessToken", "refreshToken", "csrfToken"]);
    const existingCookies = await session.defaultSession.cookies.get({});

    await Promise.all(
      existingCookies
        .filter((cookie) => {
          if (!authCookieNames.has(cookie.name)) {
            return false;
          }
          const cookieHost = String(cookie.domain || "")
            .replace(/^\./, "")
            .toLowerCase();
          return (
            cookieHost === apiHostname ||
            apiHostname.endsWith(`.${cookieHost}`)
          );
        })
        .map((cookie) => {
          const scheme = cookie.secure ? "https" : apiProtocol;
          const cleanDomain = String(cookie.domain || apiHostname).replace(
            /^\./,
            "",
          );
          const cookieUrl = `${scheme}://${cleanDomain}${cookie.path || "/"}`;
          return session.defaultSession.cookies
            .remove(cookieUrl, cookie.name)
            .catch(() => {});
        }),
    );
  } catch (err) {
    logError(err, "CLEAR AUTH SESSION COOKIES");
  }
}

function clearElectronAuth() {
  authToken = null;
  clearPendingIntegrationOAuthState();

  deleteSecureToken("authToken");
  deleteSecureToken("refreshToken");

  stopTracking();

  currentUserId = null;
  durableTelemetryQueue.unbindUser();
  currentProjectId = null;
  currentTaskId = null;
  trackingSettings = null;
  lastCapturePauseReason = null;

  offlineQueue.clearRetryTimer();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("electron-logged-out");
  }

  devLog("ELECTRON AUTH CLEARED");
  return clearAuthSessionCookies();
}

function deleteAuthToken() {
  clearElectronAuth();
}

function extractDomain(url) {
  try {
    if (!url) return null;
    const domain = new URL(url).hostname;
    return domain.replace("www.", "");
  } catch {
    return null;
  }
}

function isAccessTokenExpired(token) {
  try {
    if (!token) {
      return true;
    }

    const payloadPart = token.split(".")[1];

    if (!payloadPart) {
      return true;
    }

    const decoded = JSON.parse(
      Buffer.from(payloadPart, "base64url").toString("utf8"),
    );

    if (!decoded?.exp) {
      return true;
    }

    // Refresh if token expires within the next 60 seconds.
    return decoded.exp * 1000 <= Date.now() + 60_000;
  } catch {
    return true;
  }
}

let refreshPromise = null;

async function refreshAuthToken() {
  // If another refresh is already running,
  // wait for that same refresh instead of starting another one.
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const refreshToken = getSecureToken("refreshToken");

      if (!refreshToken) {
        devLog("REFRESH FAILED: NO STORED REFRESH TOKEN");
        return { success: false, invalid: true };
      }

      devLog(
        "REFRESH REQUEST START:",
        API_BASE_URL,
        "REFRESH TOKEN PRESENT:",
        !!refreshToken,
      );

      const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
        client: "desktop",
        refreshToken,
      });

      devLog(
        "REFRESH RESPONSE:",
        data?.accessToken ? "ACCESS TOKEN RECEIVED" : "NO ACCESS TOKEN",
        data?.refreshToken ? "REFRESH TOKEN RECEIVED" : "NO REFRESH TOKEN",
      );

      if (!data?.accessToken) {
        return { success: false, invalid: false };
      }

      authToken = data.accessToken;
      currentUserId = offlineQueue.getUserIdFromToken(data.accessToken);
      if (currentUserId && durableTelemetryQueue.isInitialized()) {
        durableTelemetryQueue.bindUser(currentUserId);
      }

      try {
        saveSecureToken("authToken", data.accessToken);
        saveSecureToken("refreshToken", data.refreshToken);
      } catch (storageErr) {
        logError(
          storageErr,
          "TOKEN STORAGE FAILED (non-fatal, using in-memory token)",
        );
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("token-refreshed", data.accessToken);
      }

      return { success: true, accessToken: data.accessToken };
    } catch (error) {
      devLog(
        "ELECTRON TOKEN REFRESH FAILED:",
        JSON.stringify(
          {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
          },
          null,
          2,
        ),
      );

      console.error(
        "ELECTRON TOKEN REFRESH FAILED:",
        error.response?.data || error.message,
      );

      // The server rejected the refresh token.
      // Do not keep retrying the same invalid session.
      const isInvalidRefreshToken = error.response?.status === 401;

      if (isInvalidRefreshToken) {
        await clearElectronAuth();

        devLog("INVALID REFRESH TOKEN - ELECTRON SESSION CLEARED");
      } else {
        devLog("TRANSIENT REFRESH FAILURE - KEEPING SESSION, WILL RETRY");
      }

      return { success: false, invalid: isInvalidRefreshToken };
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

let isRefreshingElectronToken = false;
let refreshQueue = [];

function processRefreshQueue(success) {
  refreshQueue.forEach((callback) => callback(success));
  refreshQueue = [];
}

axios.interceptors.response.use(
  (response) => response,

  async (error) => {
    devLog(
      "AXIOS RESPONSE INTERCEPTOR:",
      error.response?.status,
      error.config?.url,
    );

    const originalRequest = error.config;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Never intercept the refresh request itself
    if (originalRequest.url?.includes("/auth/refresh")) {
      return Promise.reject(error);
    }

    // Only handle unauthorized requests
    if (error.response?.status !== 401) {
      return Promise.reject(error);
    }

    // Prevent infinite retry
    if (originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    // Another request is already refreshing
    if (isRefreshingElectronToken) {
      return new Promise((resolve, reject) => {
        refreshQueue.push((success) => {
          if (!success) {
            reject(error);
            return;
          }

          originalRequest.headers.Authorization = `Bearer ${authToken}`;

          resolve(axios(originalRequest));
        });
      });
    }

    isRefreshingElectronToken = true;
    try {
      const result = await refreshAuthToken();

      processRefreshQueue(result.success);

      if (!result.success) {
        return Promise.reject(error);
      }

      originalRequest.headers.Authorization = `Bearer ${authToken}`;

      return axios(originalRequest);
    } finally {
      isRefreshingElectronToken = false;
    }
  },
);

function getBrowserInfo() {
  return new Promise((resolve) => {
    let readerPath;

    if (process.platform === "win32") {
      readerPath = app.isPackaged
        ? path.join(process.resourcesPath, "BrowserUrlReader.exe")
        : path.join(__dirname, "../resources/BrowserUrlReader.exe");
    } else if (process.platform === "darwin") {
      const macArch = process.arch === "arm64" ? "arm64" : "x64";

      readerPath = app.isPackaged
        ? path.join(process.resourcesPath, "MacBrowserReader", macArch, "Mac")
        : path.join(__dirname, "../resources/MacBrowserReader", macArch, "Mac");
    } else {
      return resolve(null);
    }

    execFile(readerPath, (error, stdout, stderr) => {
      if (error) {
        devLog("BrowserReader Error:", error.message);
        return resolve(null);
      }

      if (stderr) {
        devLog("BrowserReader stderr:", stderr);
      }

      try {
        const result = JSON.parse(stdout);

        // Program.cs prints {} when no supported browser is active
        if (!result.Browser) {
          return resolve(null);
        }

        resolve(result);
      } catch (err) {
        devLog("BrowserReader Parse Error:", stdout);
        resolve(null);
      }
    });
  });
}

function getCurrentLocation() {
  return new Promise((resolve) => {
    const exePath = app.isPackaged
      ? path.join(process.resourcesPath, "LocationReader", "LocationReader.exe")
      : path.join(
          __dirname,
          "../resources/LocationReader",
          "LocationReader.exe",
        );

    execFile(exePath, (error, stdout, stderr) => {
      if (error) {
        devLog("LocationReader Error:", error.message);
        return resolve(null);
      }

      if (stderr) {
        devLog("LocationReader stderr:", stderr);
      }

      try {
        const result = JSON.parse(stdout);

        if (!result.Success) {
          devLog(result.Error);
          return resolve(null);
        }

        resolve(result);
      } catch (err) {
        devLog("LocationReader Parse Error:", stdout);
        resolve(null);
      }
    });
  });
}

let authToken = null;
let trackingSettings = null;
let screenshotInterval = null;
let activityInterval = null;
let idleCheckInterval = null;
let locationInterval = null;

let appUsageInterval = null;

let mainWindow = null;

let idleCountdownInterval = null;
let idleCountdown = 20;

let mouseClicks = 0;
let keyPresses = 0;
let mouseMoves = 0;

let screenshotMouseClicks = 0;
let screenshotKeyPresses = 0;
let screenshotMouseMoves = 0;

let lastActivityAt = Date.now();
let idleWarningShown = false;

let isTracking = false;
let isOnBreak = false;
let lastBreakContext = null;
let currentUserId = null;

let currentProjectId = null;
let currentTaskId = null;

let sleepStartedAt = null;
let lastSleepInfo = null;

let internetCheckInterval = null;

let shiftAutoStartedToday = false;
let manuallyStoppedDuringShift = false;
let stoppedForBreak = false;
let autoStoppedForBreak = false;
let lastCapturePauseReason = null;

function getEffectiveShiftTimezone() {
  return (
    trackingSettings?.shift?.timezone ||
    trackingSettings?.timezone ||
    (typeof Intl !== "undefined" && Intl.DateTimeFormat().resolvedOptions().timeZone) ||
    "UTC"
  );
}

function getCurrentShift() {
  const schedule = trackingSettings?.shift?.schedule;

  if (!trackingSettings?.shift?.enabled || !Array.isArray(schedule)) {
    return null;
  }

  const timezone = getEffectiveShiftTimezone();
  return shiftSchedule.getCurrentShift(schedule, new Date(), timezone);
}

function isWithinCurrentShift() {
  const schedule = trackingSettings?.shift?.schedule;

  if (!trackingSettings?.shift?.enabled || !Array.isArray(schedule)) {
    return false;
  }

  const timezone = getEffectiveShiftTimezone();
  return shiftSchedule.isWithinCurrentShift(schedule, new Date(), timezone);
}

function isWithinScheduledBreak() {
  const schedule = trackingSettings?.shift?.schedule;

  if (!trackingSettings?.shift?.enabled || !Array.isArray(schedule)) {
    return false;
  }

  const timezone = getEffectiveShiftTimezone();
  return shiftSchedule.isWithinScheduledBreak(schedule, new Date(), timezone);
}

function handleActivityResumeInput() {
  lastActivityAt = Date.now();

  if (idleWarningShown) {
    hideIdleWindow();
  }

  if (
    isOnBreak &&
    !isTracking &&
    !(
      trackingSettings?.shift?.enabled &&
      trackingSettings?.shift?.stopTrackingDuringBreaks &&
      autoStoppedForBreak &&
      isWithinScheduledBreak()
    )
  ) {
    devLog("ACTIVITY RESUMED DURING BREAK - AUTO-RESUMING WORK");

    const resumeContext = lastBreakContext || {
      projectId: currentProjectId || null,
      taskId: currentTaskId || null,
    };

    isOnBreak = false;
    lastBreakContext = null;
    updateTrackingBarVisibility();

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("auto-start-tracking", resumeContext);
    }
  }
}

uIOhook.on("click", () => {
  devLog("CLICK DETECTED");

  mouseClicks++;
  screenshotMouseClicks++;
  eventGapTracker.recordEvent("click");

  handleActivityResumeInput();
});

uIOhook.on("keydown", () => {
  keyPresses++;
  screenshotKeyPresses++;
  eventGapTracker.recordEvent("keydown");

  handleActivityResumeInput();
});

let lastMouseMoveUpdate = 0;

uIOhook.on("mousemove", () => {
  const now = Date.now();

  // Update at most once every 500ms
  if (now - lastMouseMoveUpdate < 500) return;

  devLog("MOUSE MOVE");

  lastMouseMoveUpdate = now;
  mouseMoves++;
  screenshotMouseMoves++;
  eventGapTracker.recordEvent("mousemove");

  handleActivityResumeInput();
});

ipcMain.on("reset-idle", () => {
  lastActivityAt = Date.now();
  idleWarningShown = false;

  devLog("IDLE TIMER RESET");
});

// uIOhook.start();

async function getActiveApp() {
  try {
    const browser = await getBrowserInfo();

    if (browser) {
      return {
        appName: browser.Domain,
        windowTitle: browser.Title,
        browser: browser.Browser,
        url: browser.Url,
      };
    }

    const win = await activeWin();

    if (!win) {
      return { appName: "Unknown", windowTitle: "Unknown" };
    }

    const rawUrl = win.url || null;
    const domain = extractDomain(rawUrl);

    const appName = domain || win.owner?.name || "Unknown";

    return {
      appName,
      windowTitle: win.title || "Unknown",
    };
  } catch (err) {
    devLog("ACTIVE WINDOW ERROR:", err);
    return { appName: "Unknown", windowTitle: "Unknown" };
  }
}

async function trackAppUsage() {
  try {
    if (!trackingSettings?.tracking?.applicationTracking) {
      devLog("APPLICATION TRACKING DISABLED");
      return;
    }

    if (!authToken) return;

    const activeApp = await getActiveApp();

    devLog("ACTIVE APP:", activeApp);

    devLog("SENDING USAGE:", {
      appName: activeApp.appName,
      windowTitle: activeApp.windowTitle,
      duration: 10,
      project: currentProjectId,
      task: currentTaskId,
    });

    const { data: usageResult } = await axios.post(
      `${API_BASE_URL}/usage/track`,
      {
        appName: activeApp.appName,
        windowTitle: activeApp.windowTitle,
        duration: 10,

        project: currentProjectId,
        task: currentTaskId,
      },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    if (usageResult?.reason === "blacklisted") {
      devLog("BLACKLISTED APP DETECTED - STOPPING TRACKING:", activeApp.appName);

      try {
        if (Notification && Notification.isSupported()) {
          new Notification({
            title: "Tracking Stopped",
            body: `"${activeApp.appName || "Application"}" is blacklisted by your organization.`,
          }).show();
        }
      } catch {}

      stopTracking({ isBreak: false });

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("auto-stop-tracking", {
          reason: "blacklisted",
          appName: activeApp.appName || "",
        });
      }
    }
  } catch (err) {
    logError(err, "APP USAGE TRACKING");
  }
}

async function sendLocation() {
  try {
    if (!authToken) return;

    if (!trackingSettings?.tracking?.ipTracking) {
      devLog("LOCATION TRACKING DISABLED");
      return;
    }

    const location = await getCurrentLocation();

    if (!location) return;

    devLog("LOCATION:", location);

    await axios.post(
      `${API_BASE_URL}/locations`,
      {
        latitude: location.Latitude,
        longitude: location.Longitude,
        accuracy: location.Accuracy,
      },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    devLog("LOCATION SENT");
  } catch (err) {
    logError(err, "LOCATION TRACKING");
  }
}

async function loadTrackingSettings() {
  try {
    if (!authToken) return false;

    const prevTrackingMode = trackingSettings?.tracking?.trackingMode;
    const prevCaptureEnabled = trackingSettings?.screenCapture?.enabled;
    const prevScreenshotFrequency =
      trackingSettings?.screenCapture?.screenshotFrequency;
    const prevRandomizeFrequency =
      trackingSettings?.screenCapture?.randomizeFrequency;

    const { data } = await axios.get(
      `${API_BASE_URL}/time-tracking/settings/effective`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    trackingSettings = data;

    devLog("EFFECTIVE SETTINGS:", trackingSettings);

    try {
      app.setLoginItemSettings({
        openAtLogin: Boolean(trackingSettings?.tracking?.startTrackingOnBoot),
      });
    } catch (loginErr) {
      devLog("LOGIN ITEM SYNC ERROR:", loginErr?.message || loginErr);
    }

    updateTrackingBarVisibility();

    if (
      trackingSettings?.tracking?.trackingMode === "silent" &&
      mainWindow &&
      !mainWindow.isDestroyed()
    ) {
      devLog("HIDING MAIN WINDOW (SILENT MODE)");
      mainWindow.hide();
    } else if (
      prevTrackingMode === "silent" &&
      trackingSettings?.tracking?.trackingMode !== "silent" &&
      mainWindow &&
      !mainWindow.isDestroyed()
    ) {
      devLog("SHOWING MAIN WINDOW (LEFT SILENT MODE)");
      mainWindow.show();
    }

    const captureChanged =
      prevCaptureEnabled !== data?.screenCapture?.enabled ||
      prevScreenshotFrequency !== data?.screenCapture?.screenshotFrequency ||
      prevRandomizeFrequency !== data?.screenCapture?.randomizeFrequency;

    if (isTracking && captureChanged) {
      if (screenshotInterval) {
        clearTimeout(screenshotInterval);
        screenshotInterval = null;
      }
      if (data?.screenCapture?.enabled) {
        startScreenshotInterval();
      }
    }

    return true;
  } catch (err) {
    logError(err, "TRACKING SETTINGS");

    return false;
  }
}

function updateTrackingBarVisibility() {
  if (!trackingBar || trackingBar.isDestroyed()) {
    return;
  }

  const visibility =
    trackingSettings?.tracking?.statusBarVisibility || "during_tracking";

  devLog("STATUS BAR MODE:", visibility);

  switch (visibility) {
    case "always":
      clampTrackingBarPosition({ persist: false });
      trackingBar.show();
      break;

    case "hidden":
    case "never":
      trackingBar.hide();
      break;

    case "during_tracking":
      if (isTracking || isOnBreak) {
        clampTrackingBarPosition({ persist: false });
        trackingBar.show();
      } else {
        trackingBar.hide();
      }
      break;
  }
}

async function sendActivity() {
  try {
    devLog("SEND ACTIVITY CALLED", keyPresses, mouseClicks);

    if (!authToken) return;

    if (!currentUserId) {
      currentUserId = offlineQueue.getUserIdFromToken(authToken);
    }
    if (currentUserId && durableTelemetryQueue.isInitialized()) {
      durableTelemetryQueue.bindUser(currentUserId);
    }

    const timingSummary = eventGapTracker.flush();
    const idempotencyKey = timingSummary.summaryId;
    const eventTimestamp = timingSummary.firstObservedAt || timingSummary.measuredStart || new Date().toISOString();

    devLog("SENDING ACTIVITY:", {
      keyPresses,
      mouseClicks,
      mouseMoves,
      project: currentProjectId,
      task: currentTaskId,
      idempotencyKey,
      eventTimestamp,
      telemetry: timingSummary,
    });

    const activityPayload = {
      keyPresses,
      mouseClicks,
      mouseMoves,

      project: currentProjectId,
      task: currentTaskId,
      idempotencyKey,
      eventTimestamp,
      telemetry: timingSummary,
    };

    // Reset accumulators immediately upon snapshot creation to prevent double-counting
    keyPresses = 0;
    mouseClicks = 0;
    mouseMoves = 0;

    // Drain legacy tracker offline queue into durable queue if present
    if (eventGapTracker.offlineQueue.length > 0) {
      const legacyItems = eventGapTracker.drainOfflineQueue();
      for (const legacyItem of legacyItems) {
        try {
          if (durableTelemetryQueue.isInitialized() && currentUserId) {
            durableTelemetryQueue.enqueue(legacyItem);
          }
        } catch {}
      }
    }

    if (durableTelemetryQueue.isInitialized() && currentUserId) {
      // Persist to durable queue BEFORE network submission
      durableTelemetryQueue.enqueue(activityPayload);
      await durableTelemetryQueue.processQueue({
        apiBaseUrl: API_BASE_URL,
        authToken,
        activeUserId: currentUserId,
      });
    } else {
      // Fallback: direct post if queue uninitialized
      try {
        await axios.post(
          `${API_BASE_URL}/activity`,
          activityPayload,
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          },
        );
      } catch (postErr) {
        eventGapTracker.queueOffline(activityPayload);
        throw postErr;
      }
    }

    devLog("ACTIVITY PROCESSED:", idempotencyKey);
  } catch (err) {
    logError(err, "ACTIVITY TRACKING");
  }
}

function shouldIgnoreIdle(data, activeApp) {
  if (data.disableIdleCalculation) {
    devLog(`${activeApp.appName}: Disable Idle Calculation enabled`);

    return true;
  }

  if (data.preventBreakMode) {
    devLog(`${activeApp.appName}: Prevent Break Mode enabled`);

    return true;
  }

  return false;
}

function startIdleCountdown() {
  if (idleCountdownInterval) {
    clearInterval(idleCountdownInterval);
  }

  idleCountdown = 20;

  idleWindow.webContents.send("idle-countdown", {
    countdown: idleCountdown,
  });

  idleCountdownInterval = setInterval(() => {
    idleCountdown--;

    idleWindow.webContents.send("idle-countdown", {
      countdown: idleCountdown,
    });

    if (idleCountdown <= 0) {
      clearInterval(idleCountdownInterval);
      idleCountdownInterval = null;

      devLog("IDLE COUNTDOWN FINISHED");

      hideIdleWindow(false);

      if (mainWindow && !mainWindow.isDestroyed()) {
        devLog("SENDING IDLE TIMEOUT TO DASHBOARD");

        mainWindow.webContents.send("idle-timeout");
      }
    }
  }, 1000);
}

async function checkIdle() {
  if (!authToken || !isTracking || isOnBreak) return;

  if (trackingSettings?.tracking?.allowWorkAwayFromComputer) {
    return;
  }

  devLog(
    "ALLOW WORK AWAY:",
    trackingSettings?.tracking?.allowWorkAwayFromComputer,
  );

  if (!trackingSettings?.tracking?.pauseTrackingWhenInactive) {
    return;
  }

  const idleSeconds = Math.floor((Date.now() - lastActivityAt) / 1000);

  const idleLimit = (trackingSettings?.tracking?.inactivityMinutes || 3) * 60;

  devLog({
    pauseTrackingWhenInactive:
      trackingSettings?.tracking?.pauseTrackingWhenInactive,
    inactivityMinutes: trackingSettings?.tracking?.inactivityMinutes,
    idleSeconds,
    idleLimit,
    idleWarningShown,
  });

  if (idleSeconds < idleLimit || idleWarningShown) {
    return;
  }

  try {
    // Get the current active application
    const activeApp = await getActiveApp();

    // Ask the backend if this app prevents break mode
    const { data } = await axios.get(
      `${API_BASE_URL}/app-classifications/check-break-mode`,
      {
        params: {
          appName: activeApp.appName,
        },
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    if (shouldIgnoreIdle(data, activeApp)) {
      lastActivityAt = Date.now();
      return;
    }

    devLog("PASSED IDLE LIMIT - SWITCHING TO BREAK MODE");

    idleWarningShown = false;
    isOnBreak = true;
    lastBreakContext = {
      projectId: currentProjectId || null,
      taskId: currentTaskId || null,
    };

    devLog(`USER IDLE FOR ${idleSeconds} SECONDS - ENTERING BREAK`);

    updateTrackingBarVisibility();

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("idle-timeout");
    }
  } catch (err) {
    logError(err, "CHECK BREAK MODE");
  }
}

const PENDING_INTEGRATION_OAUTH_TTL_MS = 10 * 60 * 1000;
const pendingIntegrationOAuth = new Map();
let unconsumedIntegrationOAuthResult = null;

function clearPendingIntegrationOAuthState() {
  pendingIntegrationOAuth.clear();
  unconsumedIntegrationOAuthResult = null;
}

function prunePendingIntegrationOAuth() {
  const now = Date.now();
  for (const [challenge, entry] of pendingIntegrationOAuth.entries()) {
    if (!entry || entry.expiresAt <= now) {
      pendingIntegrationOAuth.delete(challenge);
    }
  }
}

async function ensureDesktopAuthToken(forceRefresh = false) {
  if (forceRefresh || !authToken || isAccessTokenExpired(authToken)) {
    const refreshed = await refreshAuthToken();
    if (!refreshed?.success && !authToken) {
      return null;
    }
  }
  return authToken;
}

async function authorizedDesktopApiRequest(config) {
  const token = await ensureDesktopAuthToken(false);
  if (!token) {
    throw new Error("Desktop authentication token missing");
  }

  try {
    return await axios({
      ...config,
      headers: {
        ...(config.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (err) {
    if (err.response?.status === 401) {
      const refreshed = await refreshAuthToken();
      if (refreshed?.success && authToken) {
        return await axios({
          ...config,
          headers: {
            ...(config.headers || {}),
            Authorization: `Bearer ${authToken}`,
          },
        });
      }
    }
    throw err;
  }
}

function deliverIntegrationOAuthResult(resultPayload) {
  if (
    mainWindow &&
    !mainWindow.isDestroyed() &&
    mainWindow.webContents &&
    !mainWindow.webContents.isLoadingMainFrame()
  ) {
    unconsumedIntegrationOAuthResult = null;
    mainWindow.webContents.send("integration-oauth-result", resultPayload);
    return;
  }
  unconsumedIntegrationOAuthResult = resultPayload;
}

async function handleIntegrationOAuthDeepLink(deepLinkUrl) {
  try {
    const validation = endpointConfig.validateIntegrationCallbackDeepLink(deepLinkUrl);
    if (!validation.valid) {
      devLog("IGNORING INVALID INTEGRATION DEEP LINK:", validation.reason);
      return;
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }

    prunePendingIntegrationOAuth();
    const pending = pendingIntegrationOAuth.get(validation.challenge);
    pendingIntegrationOAuth.delete(validation.challenge);

    const activeUserId =
      currentUserId || (authToken ? offlineQueue.getUserIdFromToken(authToken) : null);

    if (
      !pending ||
      pending.expiresAt <= Date.now() ||
      pending.provider !== validation.provider ||
      !activeUserId ||
      String(pending.userId) !== String(activeUserId)
    ) {
      devLog(
        "IGNORING UNMATCHED OR STALE INTEGRATION OAUTH CALLBACK:",
        validation.provider,
      );
      deliverIntegrationOAuthResult({
        provider: validation.provider,
        status: "error",
        connected: false,
        workspaceName: "",
        error: "invalid_state",
        message: "Authorization session expired or does not match the active desktop session.",
      });
      return;
    }

    const { data } = await authorizedDesktopApiRequest({
      method: "POST",
      url: `${API_BASE_URL}/integrations/${validation.provider}/desktop/complete`,
      data: {
        completionCode: validation.code,
        desktopVerifier: pending.desktopVerifier,
      },
      timeout: 15000,
    });

    const sanitizedResult = {
      provider: validation.provider,
      status: ["connected", "cancelled", "error"].includes(data?.status)
        ? data.status
        : validation.status,
      connected: Boolean(data?.connected),
      workspaceName: typeof data?.workspaceName === "string" ? data.workspaceName : "",
      error: typeof data?.error === "string" ? data.error : null,
      message: typeof data?.message === "string" ? data.message : null,
    };

    devLog(
      "INTEGRATION OAUTH COMPLETED:",
      sanitizedResult.provider,
      sanitizedResult.status,
    );
    deliverIntegrationOAuthResult(sanitizedResult);
  } catch (err) {
    const fallbackProvider = endpointConfig.validateIntegrationCallbackDeepLink(
      deepLinkUrl,
    ).provider;
    devLog(
      "INTEGRATION OAUTH CALLBACK COMPLETION FAILED:",
      err.response?.status || err.message || "Unknown error",
    );
    if (fallbackProvider) {
      deliverIntegrationOAuthResult({
        provider: fallbackProvider,
        status: "error",
        connected: false,
        workspaceName: "",
        error: "completion_failed",
        message:
          err.response?.data?.message ||
          `Failed to complete ${fallbackProvider} authorization.`,
      });
    }
  }
}

async function handleDeepLink(deepLinkUrl) {
  if (endpointConfig.isIntegrationCallbackDeepLink(deepLinkUrl)) {
    return handleIntegrationOAuthDeepLink(deepLinkUrl);
  }
  return handleAuthDeepLink(deepLinkUrl);
}

async function handleAuthDeepLink(deepLinkUrl) {
  try {
    const validation = endpointConfig.validateDeepLink(deepLinkUrl);

    if (!validation.valid) {
      devLog("IGNORING INVALID DEEP LINK:", validation.reason);
      return;
    }

    const { accessToken, refreshToken } = validation;

    authToken = accessToken;
    currentUserId = offlineQueue.getUserIdFromToken(accessToken);
    if (currentUserId && durableTelemetryQueue.isInitialized()) {
      durableTelemetryQueue.bindUser(currentUserId);
    }

    saveSecureToken("authToken", accessToken);
    saveSecureToken("refreshToken", refreshToken);

    devLog("OAUTH TOKENS SAVED FROM DEEP LINK");

    const deviceInfo = getDeviceInfo();

    await axios.post(`${API_BASE_URL}/users/device`, deviceInfo, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    await loadTrackingSettings();
    triggerOfflineQueueProcessing();

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(`${WEB_APP_URL}/desktop`);
      mainWindow.show();
      mainWindow.focus();
    }
  } catch (err) {
    logError(err, "OAUTH DEEP LINK HANDLING");
  }
}

// macOS: deep link received while app is already running, or app is
// launched fresh via the link (Electron queues it until 'ready')
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Windows/Linux: a second launch attempt (e.g. via deep link) is
// redirected here instead of opening a second instance
app.on("second-instance", (event, argv) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }

  const deepLinkArg = argv.find((arg) => typeof arg === "string" && arg.startsWith("workcomposer://"));

  if (deepLinkArg) {
    handleDeepLink(deepLinkArg);
  }
});

ipcMain.on("save-token", async (_, tokens) => {
  try {
    const { accessToken, refreshToken } = tokens;

    if (!accessToken || !refreshToken) {
      throw new Error("Access token or refresh token missing");
    }

    authToken = accessToken;
    currentUserId = offlineQueue.getUserIdFromToken(accessToken);
    if (currentUserId && durableTelemetryQueue.isInitialized()) {
      durableTelemetryQueue.bindUser(currentUserId);
    }
    lastCapturePauseReason = null;

    saveSecureToken("authToken", accessToken);
    saveSecureToken("refreshToken", refreshToken);

    devLog("ELECTRON AUTH TOKENS SAVED SECURELY");

    const deviceInfo = getDeviceInfo();

    await axios.post(`${API_BASE_URL}/users/device`, deviceInfo, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    await loadTrackingSettings();
    triggerOfflineQueueProcessing();
  } catch (err) {
    logError(err, "DEVICE REGISTRATION");
  }
});

const checkDeviceStatus = async () => {
  try {
    if (!authToken) return;

    const deviceId = store.get("deviceId");

    if (!deviceId) return;

    const response = await axios.get(
      `${API_BASE_URL}/users/device/${deviceId}/status`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    devLog("DEVICE STATUS:", response.data);

    if (!response.data.authorized) {
      devLog("DEVICE REMOTELY SIGNED OUT");

      authToken = null;
      deleteSecureToken("authToken");
      deleteSecureToken("refreshToken");
      stopTracking();
      void clearAuthSessionCookies();

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("device-signed-out");
      }
    }
  } catch (err) {
    logError(err, "DEVICE STATUS CHECK");
  }
};

function getScreenshotDelay() {
  devLog("SCREEN CAPTURE SETTINGS:", trackingSettings?.screenCapture);

  const minutes = trackingSettings?.screenCapture?.screenshotFrequency || 5;

  const randomize = trackingSettings?.screenCapture?.randomizeFrequency;

  devLog("RANDOMIZE:", randomize);

  if (!randomize) {
    return minutes * 60 * 1000;
  }

  const min = minutes * 0.8;
  const max = minutes * 1.2;

  const randomMinutes = Math.random() * (max - min) + min;

  devLog("RANDOM MINUTES:", randomMinutes);

  return randomMinutes * 60 * 1000;
}

function startScreenshotInterval() {
  if (screenshotInterval) {
    return;
  }

  const scheduleNext = () => {
    const delay = getScreenshotDelay();

    devLog("NEXT SCREENSHOT IN", Math.round(delay / 1000), "seconds");

    screenshotInterval = setTimeout(async () => {
      await captureScreenshot();

      screenshotInterval = null;

      if (isTracking) {
        scheduleNext();
      }
    }, delay);
  };

  scheduleNext();
}

async function checkInternet() {
  if (!isTracking) return;

  if (!trackingSettings?.tracking?.stopTrackingWithoutInternet) {
    return;
  }

  const online = net.isOnline();

  devLog("INTERNET:", online);

  if (!online) {
    devLog("NO INTERNET - REQUESTING TRACKING STOP");

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("auto-stop-tracking", {
        reason: "offline",
      });
    } else {
      stopTracking({ isBreak: false });
    }

    return;
  }
}

async function updateTrackingStatus(isTracking) {
  try {
    if (!authToken) return;

    const deviceId = getDeviceInfo().deviceId;

    if (!deviceId) return;

    await axios.post(
      `${API_BASE_URL}/users/device/${deviceId}/tracking`,
      {
        isTracking,
      },
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    devLog("TRACKING STATUS UPDATED:", isTracking);
  } catch (err) {
    devWarn(
      "FAILED TO UPDATE TRACKING STATUS:",
      err?.response?.data || err.message,
    );
  }
}

ipcMain.on("start-tracking", (_, data) => {
  devLog("START TRACKING RECEIVED");

  startTracking(data?.projectId || null, data?.taskId || null);
});

ipcMain.on("open-main-window", () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
});

ipcMain.on("show-system-notification", (_, data) => {
  if (!Notification.isSupported()) {
    devWarn("SYSTEM NOTIFICATIONS ARE NOT SUPPORTED");
    return;
  }

  const notification = new Notification({
    title: data?.title || "WorkComposer",
    body: data?.body || "",
  });

  notification.show();
});

ipcMain.on("switch-task", (_, data) => {
  devLog("SWITCH TASK:", data);

  currentProjectId = data?.projectId || null;
  currentTaskId = data?.taskId || null;
});

async function startTracking(projectId = null, taskId = null) {
  devLog("START TRACKING");

  if (!trackingSettings) {
    devLog("TRACKING SETTINGS NOT LOADED YET - LOADING NOW");
    await loadTrackingSettings();
  }

  devLog("TODAY SHIFT:", getCurrentShift());
  devLog("WITHIN SHIFT:", isWithinCurrentShift());
  devLog("WITHIN BREAK:", isWithinScheduledBreak());

  isTracking = true;
  isOnBreak = false;
  lastBreakContext = null;
  lastActivityAt = Date.now();
  idleWarningShown = false;

  try {
    const devInfo = typeof getDeviceInfo === "function" ? getDeviceInfo() : null;
    eventGapTracker.onStartTracking({
      deviceId: devInfo?.deviceId || null,
    });
  } catch {}

  updateTrackingStatus(true);

  currentProjectId = projectId;
  currentTaskId = taskId;

  startScreenshotInterval();

  if (!activityInterval) {
    activityInterval = setInterval(sendActivity, 10000);
  }

  if (!locationInterval) {
    locationInterval = setInterval(sendLocation, 30000);
    sendLocation();
  }

  if (!appUsageInterval) {
    appUsageInterval = setInterval(trackAppUsage, 10000);

    trackAppUsage();
  }

  if (!idleCheckInterval) {
    idleCheckInterval = setInterval(checkIdle, 5000);
  }

  if (!internetCheckInterval) {
    internetCheckInterval = setInterval(checkInternet, 5000);
  }

  updateTrackingBarVisibility();
}

function stopTracking(options = {}) {
  devLog("STOP TRACKING RECEIVED", options);
  const stoppedForBreakMode = Boolean(options?.isBreak);
  isTracking = false;
  isOnBreak = stoppedForBreakMode;
  if (!stoppedForBreakMode) {
    lastBreakContext = null;
  }
  lastCapturePauseReason = null;

  try {
    eventGapTracker.onStopTracking();
  } catch {}

  updateTrackingStatus(false);

  if (screenshotInterval) {
    clearInterval(screenshotInterval);
    screenshotInterval = null;
  }

  if (activityInterval) {
    clearInterval(activityInterval);
    activityInterval = null;
  }

  if (locationInterval) {
    clearInterval(locationInterval);
    locationInterval = null;
  }

  if (appUsageInterval) {
    clearInterval(appUsageInterval);
    appUsageInterval = null;
  }

  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }

  if (internetCheckInterval) {
    clearInterval(internetCheckInterval);
    internetCheckInterval = null;
  }

  if (trackingBar && !trackingBar.isDestroyed()) {
    trackingBar.webContents.send("tracking-update", {
      duration: 0,
      isTracking: false,
      isOnBreak: stoppedForBreakMode,
      status: stoppedForBreakMode ? "break" : "stopped",
    });

    updateTrackingBarVisibility();
  }
}

ipcMain.on("stop-tracking", (_, options = {}) => {
  stopTracking(options);

  if (!options?.isBreak) {
    manuallyStoppedDuringShift = true;
  }
});

ipcMain.on("trackingbar-stop", () => {
  devLog("TRACKING BAR STOP CLICKED");

  isOnBreak = false;
  lastBreakContext = null;
  manuallyStoppedDuringShift = true;

  // Notify the dashboard
  if (mainWindow && !mainWindow.isDestroyed()) {
    devLog("SENDING trackingbar-stop TO DASHBOARD");

    mainWindow.webContents.send("trackingbar-stop");
  }

  // Hide the floating toolbar immediately unless status bar mode is "always"
  if (trackingBar && !trackingBar.isDestroyed()) {
    trackingBar.webContents.send("tracking-update", {
      duration: 0,
      isTracking: false,
      isOnBreak: false,
      status: "stopped",
    });

    if (trackingSettings?.tracking?.statusBarVisibility !== "always") {
      trackingBar.hide();
    }
  }
});

ipcMain.on("tracking-update", (_, data) => {
  if (trackingBar && !trackingBar.isDestroyed()) {
    trackingBar.webContents.send("tracking-update", data);
  }
});

ipcMain.on("reload-tracking-settings", async () => {
  devLog("RELOADING TRACKING SETTINGS");

  await loadTrackingSettings();
});

ipcMain.on("show-main-window", () => {
  if (!mainWindow) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
});

async function uploadScreenshot(filePath, metadata = null) {
  try {
    if (!authToken) {
      return false;
    }

    if (isAccessTokenExpired(authToken)) {
      const refreshed = await refreshAuthToken();
      if (!refreshed || !authToken) {
        return false;
      }
    }

    const payload = metadata || {};
    const activeApp = metadata
      ? { appName: metadata.appName, windowTitle: metadata.windowTitle }
      : await getActiveApp();

    const formData = new FormData();
    formData.append("screenshot", fs.createReadStream(filePath));
    formData.append("appName", activeApp.appName || "");
    formData.append("windowTitle", activeApp.windowTitle || "");

    const keyPresses =
      payload.keyPresses !== undefined
        ? payload.keyPresses
        : screenshotKeyPresses;
    const mouseClicks =
      payload.mouseClicks !== undefined
        ? payload.mouseClicks
        : screenshotMouseClicks;
    const mouseMoves =
      payload.mouseMoves !== undefined
        ? payload.mouseMoves
        : screenshotMouseMoves;
    const totalActions = keyPresses + mouseClicks + mouseMoves;
    const activityScore =
      payload.activityScore !== undefined
        ? payload.activityScore
        : Math.min(Math.round((totalActions / 50) * 100), 100);

    formData.append("keyPresses", keyPresses);
    formData.append("mouseClicks", mouseClicks);
    formData.append("mouseMoves", mouseMoves);
    formData.append("activityScore", activityScore);

    formData.append("project", payload.project || currentProjectId || "");
    formData.append("task", payload.task || currentTaskId || "");
    if (payload.capturedAt) {
      formData.append("capturedAt", payload.capturedAt);
    }

    const response = await axios.post(
      `${API_BASE_URL}/screenshots/upload`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${authToken}`,
        },
        timeout: 30000,
      },
    );

    if (response.status === 200 || response.status === 201) {
      if (!metadata) {
        screenshotKeyPresses = 0;
        screenshotMouseClicks = 0;
        screenshotMouseMoves = 0;
      }
      return true;
    }
    return false;
  } catch (err) {
    logError(err, "SCREENSHOT UPLOAD");
    return false;
  }
}

async function triggerOfflineQueueProcessing() {
  if (!authToken) return;
  if (!currentUserId) {
    currentUserId = offlineQueue.getUserIdFromToken(authToken);
  }
  if (!currentUserId) return;

  try {
    await offlineQueue.recoverRescuedScreenshots({ currentUserId });
  } catch (recoverErr) {
    logError(recoverErr, "OFFLINE_QUEUE_RECOVER");
  }

  offlineQueue
    .processQueue(
      async ({ imagePath, meta }) => {
        return await uploadScreenshot(imagePath, meta);
      },
      { token: authToken, currentUserId },
    )
    .then((result) => {
      if (lastCapturePauseReason && offlineQueue.isInitialized()) {
        const checkReadiness = offlineQueue.evaluateCaptureReadiness(currentUserId);
        if (checkReadiness.ok) {
          const previousReason = lastCapturePauseReason;
          lastCapturePauseReason = null;
          devLog(
            `[SAFE-RETAIN] Screenshot capture resumed after queue processing (recovered from ${previousReason})`,
          );
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("screenshot-capture-resumed", {
              ok: true,
              status: "NORMAL",
              previousReason,
            });
          }
        }
      }

      if (result && result.hasFailures && result.nextDelayMs) {
        scheduleOfflineQueueRetry(result.nextDelayMs);
      }
    })
    .catch((err) => {
      logError(err, "OFFLINE QUEUE PROCESS");
    });
}

function scheduleOfflineQueueRetry(delayMs) {
  offlineQueue.scheduleRetry(() => {
    triggerOfflineQueueProcessing();
  }, delayMs);
}

async function blurScreenshot(filePath) {
  const blurMode = trackingSettings?.screenCapture?.blurScreenshots;

  if (!blurMode || blurMode === "disabled") {
    return;
  }

  let sigma = 0;

  switch (blurMode) {
    case "slightly_blurred":
      sigma = 4;
      break;

    case "maximum_blurring":
      sigma = 12;
      break;

    default:
      return;
  }

  await sharp(filePath)
    .blur(sigma)
    .toFile(filePath + ".tmp");

  fs.renameSync(filePath + ".tmp", filePath);

  devLog("SCREENSHOT BLURRED:", blurMode);
}

async function captureScreenshot() {
  try {
    if (!trackingSettings?.screenCapture?.enabled) {
      devLog("SCREENSHOTS DISABLED");
      return;
    }

    const activeUserId = currentUserId || (authToken ? offlineQueue.getUserIdFromToken(authToken) : null);

    if (offlineQueue.isInitialized()) {
      const readiness = offlineQueue.evaluateCaptureReadiness(activeUserId);
      if (!readiness.ok) {
        lastCapturePauseReason = readiness.reason;
        devLog(`[SAFE-RETAIN] Screenshot capture paused (${readiness.reason}):`, readiness.warning || readiness.reason);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("screenshot-capture-paused", readiness);
        }
        return;
      }

      if (lastCapturePauseReason) {
        const previousReason = lastCapturePauseReason;
        lastCapturePauseReason = null;
        devLog(`[SAFE-RETAIN] Screenshot capture resumed (recovered from ${previousReason})`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("screenshot-capture-resumed", {
            ok: true,
            status: "NORMAL",
            previousReason,
          });
        }
      }

      if (readiness.status === "THROTTLE") {
        devLog(`[SAFE-RETAIN] Screenshot capture throttled:`, readiness.warning);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("screenshot-capture-throttled", readiness);
        }
      }
    }

    const screenshotsDir = path.join(app.getPath("userData"), "screenshots");
    fs.mkdirSync(screenshotsDir, { recursive: true });

    const filePath = path.join(screenshotsDir, `shot-${Date.now()}.jpg`);

    const image = await screenshot(); // returns Buffer

    fs.writeFileSync(filePath, image);

    if (!fs.existsSync(filePath)) {
      throw new Error("Screenshot not created");
    }

    // Blur if enabled
    await blurScreenshot(filePath);

    const activeApp = await getActiveApp();
    const totalActions =
      screenshotKeyPresses + screenshotMouseClicks + screenshotMouseMoves;
    const activityScore = Math.min(Math.round((totalActions / 50) * 100), 100);

    const metadata = {
      userId: activeUserId,
      capturedAt: new Date().toISOString(),
      appName: activeApp.appName || "",
      windowTitle: activeApp.windowTitle || "",
      keyPresses: screenshotKeyPresses,
      mouseClicks: screenshotMouseClicks,
      mouseMoves: screenshotMouseMoves,
      activityScore,
      project: currentProjectId || "",
      task: currentTaskId || "",
    };

    const uploaded = await uploadScreenshot(filePath, null);

    if (uploaded) {
      try {
        fs.unlinkSync(filePath);
      } catch {}
      triggerOfflineQueueProcessing();
    } else {
      devLog("SCREENSHOT UPLOAD FAILED — ENQUEUEING IN OFFLINE QUEUE");
      try {
        offlineQueue.enqueueScreenshot(filePath, metadata);
        screenshotKeyPresses = 0;
        screenshotMouseClicks = 0;
        screenshotMouseMoves = 0;
        try {
          fs.unlinkSync(filePath);
        } catch {}
      } catch (queueErr) {
        logError(queueErr, "OFFLINE QUEUE ENQUEUE");
        // Rescue screenshot to durable storage before any cleanup only if not storage exhaustion or backpressure
        if (queueErr.code !== "OFFLINE_QUEUE_FULL" && queueErr.code !== "INSUFFICIENT_HOST_STORAGE") {
          try {
            offlineQueue.rescueScreenshot(
              filePath,
              metadata,
              queueErr.message,
              app.getPath("userData"),
            );
          } catch {}
        }
        try {
          fs.unlinkSync(filePath);
        } catch {}
      }
      scheduleOfflineQueueRetry();
    }
  } catch (err) {
    logError(err, "SCREENSHOT CAPTURE");
  }
}

let tray = null;
let trackingBar = null;

let idleWindow = null;

function hideIdleWindow(resetIdle = true) {
  if (!idleWindow || idleWindow.isDestroyed()) return;

  if (idleCountdownInterval) {
    clearInterval(idleCountdownInterval);
    idleCountdownInterval = null;
  }

  idleWindow.hide();

  if (resetIdle) {
    idleWindow.webContents.send("idle-resumed");

    idleWarningShown = false;
    lastActivityAt = Date.now();
  }

  devLog("IDLE WINDOW HIDDEN");
}

const TRACKING_BAR_WIDTH = 456;
const TRACKING_BAR_HEIGHT = 48;
const TRACKING_BAR_BOTTOM_MARGIN = 8;
let isClampingTrackingBar = false;

/**
 * Clamps window bounds strictly inside the target display workArea
 * (excluding taskbars/docks) while keeping top/left safe on short viewports.
 */
function clampBoundsToWorkArea(
  bounds,
  workArea,
  bottomMargin = TRACKING_BAR_BOTTOM_MARGIN,
) {
  const width = Number.isFinite(bounds?.width)
    ? bounds.width
    : TRACKING_BAR_WIDTH;
  const height = Number.isFinite(bounds?.height)
    ? bounds.height
    : TRACKING_BAR_HEIGHT;
  const safeMargin = Number.isFinite(bottomMargin)
    ? Math.max(0, bottomMargin)
    : 0;

  const minX = workArea.x;
  const maxX = Math.max(minX, workArea.x + workArea.width - width);
  const minY = workArea.y;
  const maxY = Math.max(
    minY,
    workArea.y + workArea.height - height - safeMargin,
  );

  const rawX = Number.isFinite(bounds?.x) ? bounds.x : minX;
  const rawY = Number.isFinite(bounds?.y) ? bounds.y : minY;

  return {
    x: Math.round(Math.min(Math.max(rawX, minX), maxX)),
    y: Math.round(Math.min(Math.max(rawY, minY), maxY)),
  };
}

/**
 * Clamps trackingBar onto its matched display workArea using setPosition
 * to avoid fractional-DPI resize drift on Windows.
 */
function clampTrackingBarPosition({
  persist = false,
  bottomMargin = TRACKING_BAR_BOTTOM_MARGIN,
} = {}) {
  if (!trackingBar || trackingBar.isDestroyed() || isClampingTrackingBar) {
    return null;
  }

  const currentBounds = trackingBar.getBounds();
  const fixedBounds = {
    x: currentBounds.x,
    y: currentBounds.y,
    width: TRACKING_BAR_WIDTH,
    height: TRACKING_BAR_HEIGHT,
  };

  let display = null;
  try {
    display = screen.getDisplayMatching(fixedBounds);
  } catch {
    display = null;
  }
  if (!display || !display.workArea) {
    display = screen.getPrimaryDisplay();
  }

  const clamped = clampBoundsToWorkArea(
    fixedBounds,
    display.workArea,
    bottomMargin,
  );

  if (clamped.x !== currentBounds.x || clamped.y !== currentBounds.y) {
    isClampingTrackingBar = true;
    try {
      trackingBar.setPosition(clamped.x, clamped.y);
    } finally {
      isClampingTrackingBar = false;
    }
  }

  if (persist) {
    store.set("trackingBarPosition", clamped);
  }

  return clamped;
}

function createTrackingBar() {
  devLog("CREATING TRACKING BAR");

  trackingBar = new BrowserWindow({
    width: TRACKING_BAR_WIDTH,
    height: TRACKING_BAR_HEIGHT,
    minWidth: TRACKING_BAR_WIDTH,
    maxWidth: TRACKING_BAR_WIDTH,
    minHeight: TRACKING_BAR_HEIGHT,
    maxHeight: TRACKING_BAR_HEIGHT,
    useContentSize: true,
    frame: false,
    transparent: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    movable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  devLog("TRACKING BAR OBJECT:", !!trackingBar);

  trackingBar.loadURL(`${WEB_APP_URL}/tracking-bar`);

  windowPolicy.applyWindowSecurityPolicy(trackingBar, {
    webAppUrl: WEB_APP_URL,
    openExternalFn: (url) => require("electron").shell.openExternal(url),
    isDev,
  });

  trackingBar.webContents.on("did-finish-load", () => {
    devLog("TRACKING BAR LOADED");
  });

  trackingBar.webContents.on(
    "did-fail-load",
    (_, errorCode, errorDescription) => {
      devLog("TRACKING BAR FAILED:", errorCode, errorDescription);
    },
  );

  trackingBar.on("moved", () => {
    clampTrackingBarPosition({ persist: true });
  });

  trackingBar.once("ready-to-show", () => {
    if (!trackingBar || trackingBar.isDestroyed()) return;

    const savedPos = store.get("trackingBarPosition");
    const hasSavedPos =
      savedPos &&
      Number.isFinite(savedPos.x) &&
      Number.isFinite(savedPos.y);

    const primaryWorkArea = screen.getPrimaryDisplay().workArea;
    const candidateBounds = hasSavedPos
      ? {
          x: savedPos.x,
          y: savedPos.y,
          width: TRACKING_BAR_WIDTH,
          height: TRACKING_BAR_HEIGHT,
        }
      : {
          x:
            primaryWorkArea.x +
            Math.round((primaryWorkArea.width - TRACKING_BAR_WIDTH) / 2),
          y:
            primaryWorkArea.y +
            primaryWorkArea.height -
            TRACKING_BAR_HEIGHT -
            TRACKING_BAR_BOTTOM_MARGIN,
          width: TRACKING_BAR_WIDTH,
          height: TRACKING_BAR_HEIGHT,
        };

    let display = null;
    try {
      display = screen.getDisplayMatching(candidateBounds);
    } catch {
      display = null;
    }
    if (!display || !display.workArea) {
      display = screen.getPrimaryDisplay();
    }

    const clamped = clampBoundsToWorkArea(
      candidateBounds,
      display.workArea,
      TRACKING_BAR_BOTTOM_MARGIN,
    );

    isClampingTrackingBar = true;
    try {
      trackingBar.setPosition(clamped.x, clamped.y);
    } finally {
      isClampingTrackingBar = false;
    }

    updateTrackingBarVisibility();
  });
}

function createIdleWindow() {
  devLog("CREATE IDLE WINDOW CALLED");

  idleWindow = new BrowserWindow({
    width: 900,
    height: 780,
    backgroundColor: "#162742",
    center: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    frame: false,
    useContentSize: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  idleWindow.loadURL(`${WEB_APP_URL}/idle`);

  windowPolicy.applyWindowSecurityPolicy(idleWindow, {
    webAppUrl: WEB_APP_URL,
    openExternalFn: (url) => require("electron").shell.openExternal(url),
    isDev,
  });

  idleWindow.webContents.on("did-finish-load", () => {
    devLog("IDLE WINDOW LOADED");
  });

  idleWindow.webContents.on(
    "did-fail-load",
    (_, errorCode, errorDescription) => {
      devLog("IDLE WINDOW FAILED:", errorCode, errorDescription);
    },
  );
}

function createWindow() {
  const isSilentMode =
    trackingSettings?.tracking?.trackingMode === "silent";

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: !isSilentMode,
    autoHideMenuBar: false,

    icon: path.join(__dirname, "../assets/workcomposer.ico"),

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  windowPolicy.applyWindowSecurityPolicy(mainWindow, {
    webAppUrl: WEB_APP_URL,
    openExternalFn: (url) => require("electron").shell.openExternal(url),
    isDev,
  });

  if (authToken) {
    devLog("OPENING DESKTOP");
    mainWindow.loadURL(`${WEB_APP_URL}/desktop`);
  } else {
    devLog("OPENING LOGIN");
    mainWindow.loadURL(`${WEB_APP_URL}/authenticate/login`);
  }

  mainWindow.webContents.on("did-finish-load", () => {
    if (unconsumedIntegrationOAuthResult && mainWindow && !mainWindow.isDestroyed()) {
      const queuedResult = unconsumedIntegrationOAuthResult;
      unconsumedIntegrationOAuthResult = null;
      mainWindow.webContents.send("integration-oauth-result", queuedResult);
    }
  });

  mainWindow.on("close", (event) => {
    event.preventDefault();
    mainWindow.hide();
  });
}

async function getConnectionDiagnostics() {
  const apiReachable = await new Promise((resolve) => {
    const socket = net.createConnection(
      {
        host: resolvedEndpoints.apiHost,
        port: resolvedEndpoints.apiPort,
        timeout: 2000,
      },
      () => {
        socket.end();
        resolve(true);
      },
    );

    socket.on("error", () => resolve(false));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });

  return {
    api: apiReachable,
    socket: false,
    tracking: isTracking,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  };
}

function createAppMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Start Tracking",
          click() {
            startTracking();
          },
        },
        {
          label: "Stop Tracking",
          click() {
            stopTracking();
          },
        },
        { type: "separator" },
        {
          label: "Settings",
          click() {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.show();
              mainWindow.focus();
              mainWindow.webContents.send("open-settings");
            }
          },
        },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: "Ctrl+Q",
          click() {
            app.exit();
          },
        },
      ],
    },

    {
      label: "Edit",
      submenu: [
        { role: "undo", label: "Undo" },
        { role: "redo", label: "Redo" },
        { type: "separator" },
        { role: "cut", label: "Cut" },
        { role: "copy", label: "Copy" },
        { role: "paste", label: "Paste" },
        { role: "selectAll", label: "Select All" },
      ],
    },

    {
      label: "View",
      submenu: [
        {
          label: "Reload",
          accelerator: "Ctrl+R",
          click() {
            if (mainWindow) {
              mainWindow.reload();
            }
          },
        },
        {
          label: "Force Reload",
          accelerator: "Ctrl+Shift+R",
          click() {
            if (mainWindow) {
              mainWindow.webContents.reloadIgnoringCache();
            }
          },
        },
        { type: "separator" },
        {
          label: "Toggle Full Screen",
          accelerator: "F11",
          click() {
            if (mainWindow) {
              mainWindow.setFullScreen(!mainWindow.isFullScreen());
            }
          },
        },
        ...(isDev
          ? [
              { type: "separator" },
              {
                label: "Developer Tools",
                accelerator: "Ctrl+Shift+I",
                click() {
                  if (mainWindow) {
                    mainWindow.webContents.toggleDevTools();
                  }
                },
              },
            ]
          : []),
      ],
    },

    {
      label: "Window",
      submenu: [
        {
          label: "Minimize",
          accelerator: "Ctrl+W",
          role: "minimize",
        },
        {
          label: "Maximize",
          accelerator: "Ctrl+M",
          click() {
            if (!mainWindow) return;

            if (mainWindow.isMaximized()) {
              mainWindow.unmaximize();
            } else {
              mainWindow.maximize();
            }
          },
        },
        { type: "separator" },
        {
          label: "Reset Window Position",
          click() {
            if (!mainWindow) return;

            mainWindow.setSize(1400, 900);
            mainWindow.center();
          },
        },
      ],
    },

    {
      label: "Help",
      submenu: [
        {
          label: "About WorkComposer",
          click() {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "About WorkComposer",
              message: "WorkComposer Desktop",
              detail:
                `Version ${app.getVersion()}\n\n` +
                `Electron ${process.versions.electron}\n` +
                `Chrome ${process.versions.chrome}\n` +
                `Node ${process.versions.node}`,
              buttons: ["OK"],
            });
          },
        },

        {
          label: "Connection Diagnostics",
          async click() {
            const info = await getConnectionDiagnostics();

            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "Connection Diagnostics",
              message: "WorkComposer Desktop",
              detail:
                `API Server: ${info.api ? "✓ Connected" : "✗ Offline"}\n\n` +
                `Socket: ${info.socket ? "✓ Connected" : "✗ Disconnected"}\n\n` +
                `Tracking: ${info.tracking ? "✓ Running" : "○ Stopped"}\n\n` +
                `Electron: ${info.electron}\n` +
                `Chrome: ${info.chrome}\n` +
                `Node: ${info.node}`,
            });
          },
        },

        {
          label: "Clear Cache and Restart",
          async click() {
            try {
              const result = await dialog.showMessageBox(mainWindow, {
                type: "warning",
                title: "Clear Cache and Restart",
                message: "Clear application cache?",
                detail:
                  "WorkComposer will clear its cached data and restart. Your account and server data will not be deleted.",
                buttons: ["Cancel", "Clear & Restart"],
                defaultId: 1,
                cancelId: 0,
              });

              if (result.response !== 1) {
                return;
              }

              await session.defaultSession.clearCache();

              await session.defaultSession.clearStorageData({
                storages: ["appcache", "shadercache"],
              });

              app.relaunch();
              app.exit();
            } catch (error) {
              logError(error, "CLEAR CACHE");

              dialog.showErrorBox(
                "Clear Cache Failed",
                error.message || "Unable to clear application cache.",
              );
            }
          },
        },

        {
          label: "Reset Local Database",
          async click() {
            const result = await dialog.showMessageBox(mainWindow, {
              type: "warning",
              title: "Reset Local Database",
              message: "Reset local WorkComposer data?",
              detail:
                "This will remove locally stored WorkComposer data, including the saved login session. Your data already synchronized with the server will not be deleted.",
              buttons: ["Cancel", "Reset"],
              defaultId: 0,
              cancelId: 0,
            });

            if (result.response !== 1) {
              return;
            }

            try {
              store.clear();

              await dialog.showMessageBox(mainWindow, {
                type: "info",
                title: "Reset Complete",
                message: "Local data has been reset.",
                detail: "WorkComposer will restart now.",
                buttons: ["OK"],
              });

              app.relaunch();
              app.exit();
            } catch (error) {
              logError(error, "RESET LOCAL DATA");

              dialog.showErrorBox(
                "Reset Failed",
                error.message || "Unable to reset local data.",
              );
            }
          },
        },

        { type: "separator" },

        {
          label: "Check For Updates...",
          click() {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "Check For Updates",
              message: "WorkComposer is up to date",
              detail: `Current version: ${app.getVersion()}`,
              buttons: ["OK"],
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(async () => {
  devLog("APP READY FIRED");

  try {
    offlineQueue.initOfflineQueue(app.getPath("userData"));
    devLog("OFFLINE SCREENSHOT QUEUE INITIALIZED");
  } catch (queueInitErr) {
    logError(queueInitErr, "OFFLINE_QUEUE_INIT");
  }

  try {
    durableTelemetryQueue.init(app.getPath("userData"));
    devLog("DURABLE TELEMETRY QUEUE INITIALIZED");
  } catch (tQueueErr) {
    logError(tQueueErr, "DURABLE_TELEMETRY_QUEUE_INIT");
  }

  try {
    authToken = getStoredAuthToken();

    const hasRefreshToken = !!getSecureToken("refreshToken");

    devLog(
      "TOKEN LOADED:",
      !!authToken,
      "REFRESH TOKEN PRESENT:",
      hasRefreshToken,
    );

    if (authToken) {
      if (isAccessTokenExpired(authToken)) {
        devLog("STORED ACCESS TOKEN EXPIRED - REFRESHING...");

        const result = await refreshAuthToken();

        if (result.success) {
          devLog("ACCESS TOKEN REFRESHED BEFORE WINDOW");
        } else if (result.invalid) {
          devLog("REFRESH TOKEN INVALID - LOGIN REQUIRED");
          authToken = null;
        } else {
          // Transient failure (e.g. network/server unreachable at startup).
          // Keep the stored token and let it try again later rather than
          // forcing a logout.
          devLog("ACCESS TOKEN REFRESH FAILED (TRANSIENT) - KEEPING SESSION");
        }
      } else {
        devLog("STORED ACCESS TOKEN VALID");
      }
    } else if (hasRefreshToken) {
      devLog("NO ACCESS TOKEN - REFRESHING FROM STORED REFRESH TOKEN...");

      const result = await refreshAuthToken();

      if (result.success) {
        devLog("ACCESS TOKEN REFRESHED BEFORE WINDOW");
      } else if (result.invalid) {
        devLog("REFRESH TOKEN INVALID - LOGIN REQUIRED");
        authToken = null;
      } else {
        devLog("ACCESS TOKEN REFRESH FAILED (TRANSIENT) - WILL RETRY LATER");
      }
    } else {
      devLog("NO STORED AUTH TOKENS - LOGIN REQUIRED");
    }

    if (authToken) {
      currentUserId = offlineQueue.getUserIdFromToken(authToken);
      if (currentUserId && durableTelemetryQueue.isInitialized()) {
        durableTelemetryQueue.bindUser(currentUserId);
        void durableTelemetryQueue.processQueue({
          apiBaseUrl: API_BASE_URL,
          authToken,
          activeUserId: currentUserId,
        });
      }
      devLog("LOADING TRACKING SETTINGS ON STARTUP");
      await loadTrackingSettings();
      triggerOfflineQueueProcessing();
    }
  } catch (error) {
    logError(error, "TOKEN LOAD/REFRESH");
    authToken = null;
  }

  createWindow();
  devLog("WINDOW CREATED");

  const coldStartDeepLink = process.argv.find(
    (arg) => typeof arg === "string" && arg.startsWith("workcomposer://"),
  );

  if (coldStartDeepLink) {
    handleDeepLink(coldStartDeepLink);
  }

  try {
    uIOhook.start();
    devLog("UIOHOOK STARTED");
  } catch (error) {
    logError(error, "UIOHOOK START");
  }
  createAppMenu();
  createTrackingBar();
  updateTrackingBarVisibility();
  createIdleWindow();

  const reclampTrackingBarOnDisplayChange = () => {
    clampTrackingBarPosition({ persist: true });
  };
  screen.on("display-metrics-changed", reclampTrackingBarOnDisplayChange);
  screen.on("display-removed", reclampTrackingBarOnDisplayChange);

  setInterval(() => {
    if (!trackingSettings?.shift?.enabled) return;

    if (!trackingSettings?.shift?.autoStartTracking) return;

    if (isTracking) return;

    if (manuallyStoppedDuringShift) return;

    if (shiftAutoStartedToday) return;

    if (!isWithinCurrentShift()) {
      shiftAutoStartedToday = false;
      manuallyStoppedDuringShift = false;
      return;
    }

    devLog("AUTO STARTING TRACKING");

    shiftAutoStartedToday = true;
    manuallyStoppedDuringShift = false;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("auto-start-tracking");
    }
  }, 60000);

  setInterval(() => {
    if (!trackingSettings?.shift?.enabled) return;

    if (!trackingSettings?.shift?.autoStopTracking) return;

    if (!isTracking) return;

    if (isWithinCurrentShift()) return;

    devLog("AUTO STOPPING TRACKING");

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("auto-stop-tracking");
    }
  }, 60000);

  setInterval(() => {
    if (!trackingSettings?.shift?.enabled) return;

    if (!trackingSettings?.shift?.stopTrackingDuringBreaks) return;

    if (!isTracking) return;

    if (!isWithinCurrentShift()) return;

    if (!isWithinScheduledBreak()) {
      stoppedForBreak = false;
      return;
    }

    if (stoppedForBreak) return;

    stoppedForBreak = true;
    autoStoppedForBreak = true;

    devLog("AUTO STOP FOR BREAK");

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("auto-stop-tracking");
    }
  }, 60000);

  setInterval(() => {
    if (!trackingSettings?.shift?.enabled) return;

    if (!trackingSettings?.shift?.stopTrackingDuringBreaks) return;

    // Only resume if WE stopped it
    if (!autoStoppedForBreak) return;

    // User already started tracking manually
    if (isTracking) return;

    // Still on break
    if (isWithinScheduledBreak()) return;

    // Shift already ended
    if (!isWithinCurrentShift()) {
      autoStoppedForBreak = false;
      stoppedForBreak = false;
      return;
    }

    devLog("AUTO RESUME AFTER BREAK");

    autoStoppedForBreak = false;
    stoppedForBreak = false;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("auto-start-tracking");
    }
  }, 60000);

  setInterval(() => {
    checkDeviceStatus();
  }, 30000);

  setInterval(async () => {
    if (!authToken) return;

    if (isAccessTokenExpired(authToken)) {
      devLog("PROACTIVE TOKEN REFRESH TRIGGERED");
      await refreshAuthToken();
    }
  }, 60000);

  powerMonitor.on("suspend", () => {
    devLog("SYSTEM SLEEP");

    sleepStartedAt = Date.now();
    try {
      eventGapTracker.onSuspend();
    } catch {}
  });

  powerMonitor.on("resume", () => {
    devLog("SYSTEM RESUMED");

    try {
      eventGapTracker.onResume();
    } catch {}

    if (!sleepStartedAt) return;

    const sleptMinutes = (Date.now() - sleepStartedAt) / 1000 / 60;

    devLog("SLEPT FOR", sleptMinutes, "MINUTES");

    lastSleepInfo = {
      sleptMinutes,
      resumedAt: Date.now(),
    };

    sleepStartedAt = null;
  });

  tray = new Tray(path.join(__dirname, "../assets/workcomposer-tray.png"));

  tray.setToolTip("WorkComposer");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show WorkComposer",
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },

    {
      type: "separator",
    },

    {
      label: "Quit",
      click: () => {
        app.exit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  offlineQueue.clearRetryTimer();
  durableTelemetryQueue.clearRetryTimer();
});

ipcMain.handle("get-token", async () => {
  return authToken;
});

ipcMain.handle("consume-pending-integration-oauth-result", async () => {
  const result = unconsumedIntegrationOAuthResult;
  unconsumedIntegrationOAuthResult = null;
  return result || null;
});

ipcMain.handle("start-integration-oauth", async (_, provider) => {
  try {
    const normalizedProvider = String(provider || "").trim().toLowerCase();
    if (!endpointConfig.SUPPORTED_INTEGRATION_PROVIDERS.has(normalizedProvider)) {
      return {
        started: false,
        error: "UNSUPPORTED_PROVIDER",
        message: "Unsupported integration provider.",
      };
    }

    const token = await ensureDesktopAuthToken(false);
    if (!token) {
      return {
        started: false,
        error: "NOT_AUTHENTICATED",
        message: "Session expired. Please log in again.",
      };
    }

    const initiatorUserId = currentUserId || offlineQueue.getUserIdFromToken(token);
    if (!initiatorUserId) {
      return {
        started: false,
        error: "INVALID_SESSION",
        message: "Unable to verify active desktop user session.",
      };
    }

    prunePendingIntegrationOAuth();
    // Replace any existing pending OAuth challenge for this provider cleanly.
    for (const [challenge, entry] of pendingIntegrationOAuth.entries()) {
      if (entry?.provider === normalizedProvider) {
        pendingIntegrationOAuth.delete(challenge);
      }
    }

    const desktopVerifier = crypto.randomBytes(32).toString("base64url");
    const desktopChallenge = crypto
      .createHash("sha256")
      .update(desktopVerifier)
      .digest("base64url");

    const { data } = await authorizedDesktopApiRequest({
      method: "GET",
      url: `${API_BASE_URL}/integrations/${normalizedProvider}/connect`,
      params: {
        client: "desktop",
        mode: "json",
        desktopChallenge,
      },
      timeout: 15000,
    });

    const urlValidation = endpointConfig.validateIntegrationAuthorizeUrl(
      data?.url,
      normalizedProvider,
    );
    if (!urlValidation.valid) {
      return {
        started: false,
        error: urlValidation.reason,
        message: "Received invalid authorization URL from server.",
      };
    }

    unconsumedIntegrationOAuthResult = null;
    pendingIntegrationOAuth.set(desktopChallenge, {
      provider: normalizedProvider,
      userId: String(initiatorUserId),
      desktopVerifier,
      desktopChallenge,
      expiresAt: Date.now() + PENDING_INTEGRATION_OAUTH_TTL_MS,
    });

    await require("electron").shell.openExternal(urlValidation.url);

    return {
      started: true,
      provider: normalizedProvider,
    };
  } catch (err) {
    const status = err.response?.status;
    devLog(
      "START INTEGRATION OAUTH FAILED:",
      provider,
      status || err.message || "Unknown error",
    );
    return {
      started: false,
      error: status === 401 ? "UNAUTHORIZED" : "START_OAUTH_FAILED",
      message:
        err.response?.data?.message ||
        `Failed to start ${String(provider || "integration")} authorization.`,
    };
  }
});

ipcMain.handle("refresh-token", async () => {
  try {
    const result = await refreshAuthToken();

    if (!result.success) {
      return {
        success: false,
        accessToken: null,
        invalid: !!result.invalid,
      };
    }

    return {
      success: true,
      accessToken: authToken,
      invalid: false,
    };
  } catch (error) {
    console.error("IPC TOKEN REFRESH ERROR:", error);

    // Unexpected error, not a confirmed invalid refresh token —
    // treat as transient so the renderer doesn't force a logout.
    return {
      success: false,
      accessToken: null,
      invalid: false,
    };
  }
});

ipcMain.handle("get-device-id", () => {
  let deviceId = store.get("deviceId");

  if (!deviceId) {
    deviceId = crypto.randomUUID();

    store.set("deviceId", deviceId);

    devLog("NEW DEVICE ID CREATED:", deviceId);
  }

  return deviceId;
});

ipcMain.handle("get-device-info", () => {
  let deviceId = store.get("deviceId");

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    store.set("deviceId", deviceId);
  }

  return {
    deviceId,
    platform: process.platform,
    appVersion: app.getVersion(),
    hostname: require("os").hostname(),
  };
});

ipcMain.handle("get-last-sleep", () => {
  const sleep = lastSleepInfo;

  lastSleepInfo = null;

  return sleep;
});

ipcMain.handle("logout-electron", async () => {
  try {
    devLog("ELECTRON LOGOUT REQUESTED");

    const refreshToken = getSecureToken("refreshToken");
    let serverRevocationSuccess = false;

    if (refreshToken) {
      try {
        await axios.post(
          `${API_BASE_URL}/auth/logout`,
          {
            client: "desktop",
            refreshToken,
          },
          {
            headers: authToken
              ? { Authorization: `Bearer ${authToken}` }
              : {},
          },
        );
        serverRevocationSuccess = true;
        devLog("DESKTOP REFRESH TOKEN REVOKED ON SERVER");
      } catch (logoutApiError) {
        logError(logoutApiError, "SERVER LOGOUT FAILED");
      }
    }

    await clearElectronAuth();

    return {
      success: true,
      serverRevocation: serverRevocationSuccess,
    };
  } catch (error) {
    logError(error, "ELECTRON LOGOUT");

    try {
      await clearElectronAuth();
    } catch {}

    return {
      success: false,
      message: error.message,
    };
  }
});

ipcMain.handle("get-offline-queue-status", async () => {
  if (!offlineQueue.isInitialized()) {
    return { initialized: false };
  }
  const activeUser = currentUserId || (authToken ? offlineQueue.getUserIdFromToken(authToken) : null);
  const readiness = offlineQueue.evaluateCaptureReadiness(activeUser);
  const items = activeUser ? offlineQueue.listQueueItems(activeUser) : [];
  const policy = offlineQueue.getRetentionPolicy();
  return {
    initialized: true,
    userId: activeUser,
    readiness,
    activeCount: items.length,
    maxCount: policy?.activeQueueMaxCount || 50,
    policy: {
      enableAdaptiveBackpressure: Boolean(policy?.enableAdaptiveBackpressure),
      diskReserveBytes: policy?.diskReserveBytes || 524288000,
    },
  };
});

ipcMain.handle("get-durable-telemetry-queue-status", async () => {
  if (!durableTelemetryQueue.isInitialized()) {
    return { initialized: false };
  }
  const activeUser = currentUserId || (authToken ? offlineQueue.getUserIdFromToken(authToken) : null);
  const items = activeUser ? durableTelemetryQueue.listQueueItems(activeUser) : [];
  return {
    initialized: true,
    userId: activeUser,
    activeCount: items.length,
    maxCount: durableTelemetryQueue.maxQueueSize,
    overflowDroppedCount: durableTelemetryQueue.overflowDroppedCount,
  };
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    durableTelemetryQueue,
    sendActivity,
    getEffectiveShiftTimezone,
    getCurrentShift,
    isWithinCurrentShift,
    isWithinScheduledBreak,
    getLastCapturePauseReason: () => lastCapturePauseReason,
    setLastCapturePauseReason: (r) => {
      lastCapturePauseReason = r;
    },
    evaluateAndDispatchCaptureReadiness: (activeUserId = null) => {
      if (!offlineQueue.isInitialized()) return { ok: true, status: "UNINITIALIZED" };
      const readiness = offlineQueue.evaluateCaptureReadiness(activeUserId);
      if (!readiness.ok) {
        lastCapturePauseReason = readiness.reason;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("screenshot-capture-paused", readiness);
        }
        return readiness;
      }
      if (lastCapturePauseReason) {
        const previousReason = lastCapturePauseReason;
        lastCapturePauseReason = null;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("screenshot-capture-resumed", {
            ok: true,
            status: "NORMAL",
            previousReason,
          });
        }
      }
      if (readiness.status === "THROTTLE") {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("screenshot-capture-throttled", readiness);
        }
      }
      return readiness;
    },
    resetCapturePauseState: () => {
      lastCapturePauseReason = null;
    },
  };
}

