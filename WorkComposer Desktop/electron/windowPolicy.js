"use strict";

const { URL } = require("url");

/**
 * Checks whether a navigation URL stays strictly within the authorized Web App origin.
 */
function isAllowedNavigation(targetUrl, webAppUrl) {
  try {
    const target = new URL(targetUrl);
    const app = new URL(webAppUrl);

    // Protocol and origin must match exactly
    if (target.protocol !== app.protocol) return false;
    if (target.origin !== app.origin) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether a URL is an OAuth authentication flow initiation endpoint.
 */
function isOAuthUrl(targetUrl) {
  try {
    const target = new URL(targetUrl);
    return /\/api\/auth\/(google|microsoft|apple)$/.test(target.pathname);
  } catch {
    return false;
  }
}

/**
 * Validates whether an external URL is safe to pass to the system browser.
 * Rejects dangerous schemes (javascript:, file:, data:, ms-msdt:, etc.).
 */
function isSafeExternalUrl(targetUrl) {
  try {
    const target = new URL(targetUrl);
    const protocol = target.protocol.toLowerCase();

    // Strictly enforce http: or https:
    if (protocol !== "https:" && protocol !== "http:") {
      return false;
    }

    // Reject dangerous or suspicious hosts
    const host = target.hostname.toLowerCase();
    if (!host || host.includes(" ") || host.includes("\\")) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Creates an Electron setWindowOpenHandler function.
 * Strictly denies creation of arbitrary new native windows.
 * Routes approved external links and OAuth requests safely through shell.openExternal.
 */
function createWindowOpenHandler(options = {}) {
  const {
    openExternalFn,
  } = options;

  return function windowOpenHandler({ url }) {
    if (isOAuthUrl(url)) {
      try {
        const target = new URL(url);
        target.searchParams.set("client", "desktop");
        if (typeof openExternalFn === "function") {
          openExternalFn(target.toString());
        }
      } catch {}
      return { action: "deny" };
    }

    if (isSafeExternalUrl(url)) {
      try {
        if (typeof openExternalFn === "function") {
          openExternalFn(url);
        }
      } catch {}
    }

    // Default deny: Never allow arbitrary new Electron windows to open
    return { action: "deny" };
  };
}

/**
 * Creates an Electron will-navigate event handler function.
 * Permits internal navigation within the Web App.
 * Intercepts OAuth and external links to open in external browser.
 */
function createWillNavigateHandler(options = {}) {
  const {
    webAppUrl,
    openExternalFn,
  } = options;

  return function willNavigateHandler(event, targetUrl) {
    if (isOAuthUrl(targetUrl)) {
      if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      try {
        const target = new URL(targetUrl);
        target.searchParams.set("client", "desktop");
        if (typeof openExternalFn === "function") {
          openExternalFn(target.toString());
        }
      } catch {}
      return;
    }

    if (isAllowedNavigation(targetUrl, webAppUrl)) {
      // Allowed internal navigation
      return;
    }

    // Prevent cross-origin navigation inside the Electron BrowserWindow
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }

    if (isSafeExternalUrl(targetUrl)) {
      try {
        if (typeof openExternalFn === "function") {
          openExternalFn(targetUrl);
        }
      } catch {}
    }
  };
}

/**
 * Evaluates whether an input event is an unauthorized attempt to open DevTools in production.
 */
function shouldBlockDevToolsInput(input, options = {}) {
  const { isDev = false } = options;

  if (isDev) {
    return false;
  }

  if (!input || typeof input !== "object") {
    return false;
  }

  const key = (input.key || "").toLowerCase();

  // F12 key
  if (key === "f12") {
    return true;
  }

  // Ctrl+Shift+I (Windows/Linux)
  if (input.control && input.shift && key === "i") {
    return true;
  }

  // Cmd+Alt+I (macOS)
  if (input.meta && input.alt && key === "i") {
    return true;
  }

  return false;
}

/**
 * Applies security policies to a BrowserWindow instance.
 */
function applyWindowSecurityPolicy(browserWindow, options = {}) {
  if (!browserWindow || !browserWindow.webContents) return;

  const {
    webAppUrl,
    openExternalFn,
    isDev = false,
  } = options;

  // 1. Strict window open policy
  browserWindow.webContents.setWindowOpenHandler(
    createWindowOpenHandler({ openExternalFn })
  );

  // 2. Strict navigation policy
  browserWindow.webContents.on(
    "will-navigate",
    createWillNavigateHandler({ webAppUrl, openExternalFn })
  );

  // 3. Production DevTools shortcut guard
  if (!isDev) {
    browserWindow.webContents.on("before-input-event", (event, input) => {
      if (shouldBlockDevToolsInput(input, { isDev: false })) {
        event.preventDefault();
      }
    });
  }
}

module.exports = {
  isAllowedNavigation,
  isOAuthUrl,
  isSafeExternalUrl,
  createWindowOpenHandler,
  createWillNavigateHandler,
  shouldBlockDevToolsInput,
  applyWindowSecurityPolicy,
};
