import axios from "axios";
import type {
    AxiosError,
    InternalAxiosRequestConfig,
} from "axios";
import { reconnectSocketWithToken, disconnectSocket } from "@/socket/socket";

const API = axios.create({
    baseURL:
        process.env.NEXT_PUBLIC_API_URL ||
        "http://localhost:5000/api",
    withCredentials: true,
    timeout: 15000,
    xsrfCookieName: "csrfToken",
    xsrfHeaderName: "X-CSRF-Token",
});

let isRefreshing = false;

let refreshSubscribers: Array<{
    resolve: () => void;
    reject: (error: any) => void;
}> = [];

const subscribeTokenRefresh = (
    resolve: () => void,
    reject: (error: any) => void
) => {
    refreshSubscribers.push({
        resolve,
        reject,
    });
};

const notifySubscribersSuccess = () => {
    refreshSubscribers.forEach(({ resolve }) => resolve());
    refreshSubscribers = [];
};

const notifySubscribersFailure = (error: any) => {
    refreshSubscribers.forEach(({ reject }) => reject(error));
    refreshSubscribers = [];
};

let isInvalidatingSession = false;

const handleConfirmedSessionInvalidation = () => {
    disconnectSocket();
    inMemoryCsrfToken = null;
    if (typeof localStorage !== "undefined") {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("token");
    }
    if (typeof window !== "undefined") {
        if (!isInvalidatingSession && window.electronAPI?.logoutElectron) {
            isInvalidatingSession = true;
            Promise.resolve(window.electronAPI.logoutElectron())
                .catch(() => {})
                .finally(() => {
                    isInvalidatingSession = false;
                });
        }
        if (window.location?.pathname !== "/authenticate/login") {
            window.location.href = "/authenticate/login";
        }
    }
};

const isElectron = () => {
    return (
        typeof window !== "undefined" &&
        !!window.electronAPI
    );
};

const STATE_CHANGING_METHODS = new Set(["post", "put", "patch", "delete"]);

let inMemoryCsrfToken: string | null = null;
let csrfInitializationPromise: Promise<string | null> | null = null;
let csrfInitializationForced = false;

export interface CsrfErrorInfo {
    category: "network" | "http" | "timeout" | "parsing" | "unknown";
    message: string;
    status?: number | undefined;
    endpoint: string;
}

let lastCsrfError: CsrfErrorInfo | null = null;

export const getLastCsrfError = (): CsrfErrorInfo | null => lastCsrfError;

export const resetCsrfTokenForTesting = (): void => {
    inMemoryCsrfToken = null;
    lastCsrfError = null;
    csrfInitializationPromise = null;
    csrfInitializationForced = false;
};

const isAuthSessionMutationUrl = (url?: string): boolean => {
    if (!url) return false;
    const normalized = url.toLowerCase();
    return (
        normalized.includes("/auth/login") ||
        normalized.includes("/auth/verify-two-factor") ||
        normalized.includes("/auth/logout") ||
        normalized.includes("/auth/register") ||
        normalized.includes("/auth/refresh")
    );
};

const getHeaderValue = (headers: any, name: string): string | undefined => {
    if (!headers) return undefined;
    if (typeof headers.get === "function") {
        const val = headers.get(name);
        return typeof val === "string" ? val : val != null ? String(val) : undefined;
    }
    const lowerName = name.toLowerCase();
    for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === lowerName) {
            return headers[key];
        }
    }
    return undefined;
};

const setHeaderValue = (headers: any, name: string, value: string): void => {
    if (!headers) return;
    if (typeof headers.set === "function") {
        headers.set(name, value);
    } else {
        headers[name] = value;
    }
};

const deleteHeaderValue = (headers: any, name: string): void => {
    if (!headers) return;
    if (typeof headers.delete === "function") {
        headers.delete(name);
    }
    const lowerName = name.toLowerCase();
    for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === lowerName) {
            delete headers[key];
        }
    }
};

export const getStoredCsrfToken = (): string | null => {
    if (typeof document !== "undefined") {
        const match = document.cookie.match(/(?:^|;\s*)csrfToken=([^;]+)/);
        if (match && match[1]) {
            return decodeURIComponent(match[1]);
        }
    }
    return inMemoryCsrfToken;
};

export const ensureCsrfToken = async (
    forceRefresh = false
): Promise<string | null> => {
    if (typeof window === "undefined") {
        return null;
    }

    if (forceRefresh) {
        inMemoryCsrfToken = null;
        if (csrfInitializationPromise && !csrfInitializationForced) {
            await csrfInitializationPromise.catch(() => null);
        }
    }

    if (!forceRefresh) {
        const existing = getStoredCsrfToken();
        if (existing && typeof existing === "string" && /^[a-f0-9]{64}$/i.test(existing.trim())) {
            return existing.trim();
        }
    }

    if (csrfInitializationPromise) {
        return csrfInitializationPromise;
    }

    csrfInitializationForced = forceRefresh;
    let requestPromise: Promise<string | null> | null = null;
    requestPromise = (async () => {
        const rawBaseUrl =
            process.env.NEXT_PUBLIC_API_URL ||
            "http://localhost:5000/api";
        const baseURL = rawBaseUrl.replace(/\/+$/, "");
        const csrfUrl = `${baseURL}/auth/csrf`;

        try {
            const response = await axios.get(csrfUrl, {
                withCredentials: true,
                timeout: 10000,
            });

            const token = response.data?.csrfToken;
            if (typeof token === "string" && /^[a-f0-9]{64}$/i.test(token.trim())) {
                const cleanToken = token.trim();
                inMemoryCsrfToken = cleanToken;
                lastCsrfError = null;
                return cleanToken;
            }

            // Received HTTP response but token is missing or malformed
            const status = response.status || 200;
            const parsingMsg = `CSRF initialization response from ${csrfUrl} missing valid 64-hex csrfToken property`;
            lastCsrfError = {
                category: "parsing",
                message: parsingMsg,
                status,
                endpoint: csrfUrl,
            };
            console.error(`[CSRF Diagnostic] ${parsingMsg} (HTTP ${status})`);

            const fallback = forceRefresh ? null : getStoredCsrfToken();
            return (fallback && /^[a-f0-9]{64}$/i.test(fallback.trim())) ? fallback.trim() : null;
        } catch (error: any) {
            let category: "network" | "http" | "timeout" | "unknown" = "unknown";
            let status: number | undefined = error.response?.status;
            let detail = error.message || "Unknown error";

            if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
                category = "timeout";
                detail = "Request timed out after 10000ms";
            } else if (!error.response || error.code === "ERR_NETWORK" || error.code === "ECONNREFUSED") {
                category = "network";
                detail = "Network error (backend server offline or connection refused)";
            } else if (status) {
                category = "http";
                detail = `HTTP ${status} (${error.response?.statusText || "Server error"})`;
            }

            lastCsrfError = {
                category,
                message: detail,
                status,
                endpoint: csrfUrl,
            };

            // Safe diagnostic log without logging cookies, passwords, tokens, or credentials
            console.error(
                `[CSRF Diagnostic] Failed to initialize CSRF token from ${csrfUrl} [category: ${category}${status ? `, status: ${status}` : ""}, detail: ${detail}]`
            );

            const fallback = forceRefresh ? null : getStoredCsrfToken();
            return (fallback && /^[a-f0-9]{64}$/i.test(fallback.trim())) ? fallback.trim() : null;
        } finally {
            if (csrfInitializationPromise === requestPromise) {
                csrfInitializationPromise = null;
                csrfInitializationForced = false;
            }
        }
    })();

    csrfInitializationPromise = requestPromise;
    return requestPromise;
};

API.interceptors.request.use(
    async (config) => {
        /*
         * Electron:
         * Get the CURRENT access token from the
         * Electron main process.
         */
        if (isElectron()) {
            try {
                const token = await window.electronAPI.getToken();

                if (token) {
                    setHeaderValue(config.headers, "Authorization", `Bearer ${token}`);
                }
            } catch (error) {
                console.error(
                    "FAILED TO GET ELECTRON ACCESS TOKEN:",
                    error
                );
            }
        }

        /*
         * Web browser & Electron cookie-bearing requests:
         * Attach X-CSRF-Token on state-changing requests unless strictly
         * authenticated via Authorization: Bearer for non-auth routes.
         * Ensures Electron login, 2FA, logout, and other session requests
         * transmit valid CSRF tokens alongside persisted Chromium cookies.
         */
        const method = (config.method || "get").toLowerCase();
        const isStateChanging = STATE_CHANGING_METHODS.has(method);
        const isCsrfEndpoint = config.url?.includes("/auth/csrf");
        const hasBearerToken = Boolean(getHeaderValue(config.headers, "Authorization"));
        const requiresCsrfHeader = !hasBearerToken || isAuthSessionMutationUrl(config.url);

        if (
            isStateChanging &&
            !isCsrfEndpoint &&
            requiresCsrfHeader &&
            !getHeaderValue(config.headers, "X-CSRF-Token")
        ) {
            let csrfToken = getStoredCsrfToken();
            if (!csrfToken) {
                csrfToken = await ensureCsrfToken();
            }
            if (csrfToken) {
                setHeaderValue(config.headers, "X-CSRF-Token", csrfToken);
            }
        }

        /*
         * Client timezone propagation (UI-59):
         * Attach client IANA timezone via X-Client-Timezone header.
         * Guarded with typeof window !== 'undefined' for complete SSR safety.
         */
        if (
            typeof window !== "undefined" &&
            typeof Intl !== "undefined" &&
            typeof Intl.DateTimeFormat === "function"
        ) {
            try {
                const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                if (clientTimezone && !config.headers["X-Client-Timezone"]) {
                    config.headers["X-Client-Timezone"] = clientTimezone;
                }
            } catch {
                // Ignore gracefully if environment lacks resolvedOptions
            }
        }

        return config;
    },
    (error) => Promise.reject(error)
);

API.interceptors.response.use(
    (response) => {
        if (response.data?.csrfToken) {
            inMemoryCsrfToken = response.data.csrfToken;
        }
        if (response.config?.url?.includes("/auth/logout")) {
            inMemoryCsrfToken = null;
            disconnectSocket();
        }
        return response;
    },

    async (error: AxiosError) => {
        const originalRequest =
            error.config as InternalAxiosRequestConfig & {
                _retry?: boolean;
                _csrfRetry?: boolean;
            };

        if (!originalRequest) {
            return Promise.reject(error);
        }

        if (
            axios.isCancel(error) ||
            error.code === "ERR_CANCELED" ||
            error.name === "CanceledError"
        ) {
            return Promise.reject(error);
        }

        /*
         * Safe recovery for stale or rotated CSRF state:
         * Refresh the CSRF token once and retry without allowing infinite loops.
         */
        const responseMessage =
            typeof (error.response?.data as { message?: unknown } | undefined)?.message === "string"
                ? ((error.response?.data as { message: string }).message).toLowerCase()
                : "";
        const isCsrfRejection =
            error.response?.status === 403 && responseMessage.includes("csrf");

        if (
            isCsrfRejection &&
            !originalRequest._csrfRetry &&
            !originalRequest.url?.includes("/auth/csrf")
        ) {
            originalRequest._csrfRetry = true;
            deleteHeaderValue(originalRequest.headers, "X-CSRF-Token");

            const refreshedCsrfToken = await ensureCsrfToken(true);
            if (!refreshedCsrfToken) {
                return Promise.reject(error);
            }

            setHeaderValue(originalRequest.headers, "X-CSRF-Token", refreshedCsrfToken);
            return API(originalRequest);
        }

        /*
         * Never intercept 401 refresh loops or auth session mutations.
         */
        if (
            originalRequest.url?.includes("/auth/refresh") ||
            isAuthSessionMutationUrl(originalRequest.url)
        ) {
            return Promise.reject(error);
        }

        /*
         * Offline & Network Failure Handling:
         * Handle network disconnects separately from HTTP status errors (401/403/400/500).
         * Provide a single safe retry for eligible idempotent read requests (GET/HEAD).
         * Never automatically retry non-idempotent mutations (POST/PUT/DELETE/PATCH) to prevent duplicate operations.
         */
        if (!error.response) {
            const method = (originalRequest.method || "get").toLowerCase();
            const isIdempotent = method === "get" || method === "head";
            const isTimeout =
                error.code === "ECONNABORTED" ||
                error.code === "ETIMEDOUT" ||
                Boolean(error.message?.toLowerCase().includes("timeout"));
            const extendedRequest = originalRequest as typeof originalRequest & { _networkRetry?: boolean };

            if (!isTimeout && isIdempotent && !extendedRequest._networkRetry) {
                extendedRequest._networkRetry = true;
                await new Promise((resolve) => setTimeout(resolve, 800));
                return API(originalRequest);
            }

            return Promise.reject(error);
        }

        /*
         * Only handle 401.
         */
        if (error.response?.status !== 401) {
            return Promise.reject(error);
        }

        /*
         * Prevent infinite retry.
         */
        if (originalRequest._retry) {
            console.error(
                "REQUEST FAILED AFTER TOKEN REFRESH"
            );

            return Promise.reject(error);
        }

        originalRequest._retry = true;

        /*
         * Another request is already refreshing.
         * Wait for it.
         */
        if (isRefreshing) {
            return new Promise((resolve, reject) => {
                subscribeTokenRefresh(
                    () => {
                        deleteHeaderValue(originalRequest.headers, "X-CSRF-Token");
                        resolve(API(originalRequest));
                    },
                    reject
                );
            });
        }

        isRefreshing = true;

        try {

            /*
             * ============================
             * ELECTRON
             * ============================
             */
            if (isElectron()) {
                const result = await window.electronAPI.refreshToken();

                if (!result?.success || !result?.accessToken) {
                    notifySubscribersFailure(error);

                    if (result?.invalid !== false) {
                        handleConfirmedSessionInvalidation();
                    }

                    return Promise.reject(error);
                }

                void reconnectSocketWithToken(result.accessToken);

                notifySubscribersSuccess();

                /*
                 * Retry request.
                 *
                 * The request interceptor will automatically
                 * fetch the NEW token from Electron.
                 */
                deleteHeaderValue(originalRequest.headers, "X-CSRF-Token");
                return API(originalRequest);
            }

            /*
             * ============================
             * WEB
             * ============================
             */

            await API.post(
                "/auth/refresh",
                {},
                {
                    withCredentials: true,
                }
            );

            void reconnectSocketWithToken();

            notifySubscribersSuccess();

            deleteHeaderValue(originalRequest.headers, "X-CSRF-Token");
            return API(originalRequest);
        } catch (refreshError: any) {
            const refreshStatus = refreshError?.response?.status;
            const isConfirmedInvalidSession =
                refreshStatus === 401 || refreshStatus === 403;

            const isCanceled =
                axios.isCancel(refreshError) ||
                refreshError?.code === "ERR_CANCELED" ||
                refreshError?.name === "CanceledError";

            if (!isConfirmedInvalidSession && !isCanceled) {
                console.error(
                    "REFRESH TOKEN FAILED:",
                    refreshError
                );
            }

            notifySubscribersFailure(refreshError);

            /*
             * Only clear socket state and redirect to login when the server
             * confirms the refresh session is invalid/expired (401/403).
             */
            if (isConfirmedInvalidSession) {
                handleConfirmedSessionInvalidation();
            }

            return Promise.reject(refreshError);
        } finally {
            isRefreshing = false;
        }
    }
);

export default API;