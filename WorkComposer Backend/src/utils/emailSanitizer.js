/**
 * Shared email sanitization, HTML escaping, header safety, and URL helpers.
 */

const HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
};

/**
 * Escapes HTML special characters so untrusted strings cannot inject markup into emails.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value = "") {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

/**
 * Strips CR/LF characters from email header fields (subject, recipient, custom headers)
 * to prevent header injection.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function sanitizeHeaderText(value = "") {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).replace(/[\r\n]+/g, " ").trim();
}

/**
 * Validates that a URL uses http: or https: and returns an HTML-attribute-safe string.
 * Rejects javascript:, data:, vbscript:, or malformed URLs cleanly.
 *
 * @param {unknown} rawUrl
 * @param {string} [fallback="#"]
 * @returns {string}
 */
export function sanitizeHttpUrl(rawUrl, fallback = "#") {
  if (!rawUrl || typeof rawUrl !== "string") {
    return fallback;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
      return fallback;
    }
    return escapeHtml(parsed.toString());
  } catch {
    return fallback;
  }
}

/**
 * Resolves the web application base URL for outbound email links without ever returning "undefined".
 *
 * @returns {string}
 */
export function resolveAppBaseUrl() {
  const candidate =
    process.env.CLIENT_URL ||
    process.env.FRONTEND_URL ||
    "http://localhost:3000";
  return String(candidate).trim().replace(/\/+$/, "") || "http://localhost:3000";
}

/**
 * Resolves the backend API base URL for outbound email verification links without ever returning "undefined".
 *
 * @returns {string}
 */
export function resolveApiBaseUrl() {
  const candidate = process.env.BACKEND_URL || "http://localhost:5000";
  return String(candidate).trim().replace(/\/+$/, "") || "http://localhost:5000";
}

