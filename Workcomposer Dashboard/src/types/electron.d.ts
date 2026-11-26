export { };

declare global {
    interface Window {
        electronAPI: {
            // Authentication
            saveToken: (
                accessToken: string,
                refreshToken: string
            ) => void;

            getToken: () => Promise<string | null>;

            refreshToken: () => Promise<{
                success: boolean;
                accessToken: string | null;
                invalid?: boolean;
            }>;

            logoutElectron: () => Promise<{
                success: boolean;
                message?: string;
            }>;

            onTokenRefreshed: (
                callback: (accessToken: string) => void
            ) => () => void;

            onDeviceSignedOut: (
                callback: () => void
            ) => () => void;

            onElectronLoggedOut: (
                callback: () => void
            ) => () => void;

            // Device
            getDeviceId: () => Promise<string>;

            getDeviceInfo: () => Promise<any>;

            // Tracking
            startTracking: (
                projectId?: string | null,
                taskId?: string | null
            ) => void;

            switchTask: (
                projectId?: string | null,
                taskId?: string | null
            ) => void;

            stopTracking: () => void;

            openMainWindow: () => void;

            showSystemNotification: (
                title: string,
                body: string,
            ) => void;

            // Auto tracking
            onAutoStartTracking: (
                callback: () => void
            ) => (() => void) | void;

            onAutoStopTracking: (
                callback: () => void
            ) => (() => void) | void;

            rendererReadyForAutoStart: () => void;

            reloadTrackingSettings: () => void;

            // Tracking bar
            updateTrackingBar: (data: any) => void;

            onTrackingUpdate: (
                callback: (data: any) => void
            ) => (() => void) | void;

            onTrackingBarStop: (
                callback: () => void
            ) => (() => void) | void;

            stopTrackingFromBar: () => void;

            // Idle
            onIdleWarning: (
                callback: () => void
            ) => (() => void) | void;

            onIdleStart: (
                callback: (data: {
                    countdown: number;
                }) => void
            ) => (() => void) | void;

            onIdleCountdown: (
                callback: (data: {
                    countdown: number;
                }) => void
            ) => (() => void) | void;

            onIdleResumed: (
                callback: () => void
            ) => (() => void) | void;

            onIdleTimeout: (
                callback: () => void
            ) => (() => void) | void;

            resetIdle: () => void;

            getLastSleep: () => Promise<{
                sleptMinutes: number;
                resumedAt: number;
            } | null>;

            // Screenshot Safe-Retain & Capture Status
            getOfflineQueueStatus: () => Promise<{
                initialized: boolean;
                userId?: string | null;
                readiness?: {
                    ok: boolean;
                    status: string;
                    reason?: string;
                    warning?: string;
                    freeBytes?: number;
                    reserveBytes?: number;
                    count?: number;
                    maxCount?: number;
                    usagePercent?: number;
                };
                activeCount?: number;
                maxCount?: number;
                policy?: {
                    enableAdaptiveBackpressure: boolean;
                    diskReserveBytes: number;
                };
            }>;

            onScreenshotCapturePaused: (
                callback: (data: {
                    ok: boolean;
                    status: string;
                    reason: string;
                    warning?: string;
                    freeBytes?: number;
                    reserveBytes?: number;
                    count?: number;
                    maxCount?: number;
                    usagePercent?: number;
                }) => void
            ) => () => void;

            onScreenshotCaptureThrottled: (
                callback: (data: {
                    ok: boolean;
                    status: string;
                    reason: string;
                    warning?: string;
                    usagePercent?: number;
                    count?: number;
                    maxCount?: number;
                }) => void
            ) => () => void;

            onScreenshotCaptureResumed: (
                callback: (data: {
                    ok: boolean;
                    status: string;
                    previousReason?: string;
                }) => void
            ) => () => void;

            startIntegrationOAuth?: (
                provider: "jira" | "asana" | "slack"
            ) => Promise<{
                started: boolean;
                provider?: "jira" | "asana" | "slack";
                error?: string;
                message?: string;
            }>;

            consumePendingIntegrationOAuthResult?: () => Promise<{
                provider: "jira" | "asana" | "slack";
                status: "connected" | "cancelled" | "error";
                connected: boolean;
                workspaceName?: string;
                error?: string | null;
                message?: string | null;
            } | null>;

            onIntegrationOAuthResult?: (
                callback: (data: {
                    provider: "jira" | "asana" | "slack";
                    status: "connected" | "cancelled" | "error";
                    connected: boolean;
                    workspaceName?: string;
                    error?: string | null;
                    message?: string | null;
                }) => void
            ) => () => void;
        };
    }
}