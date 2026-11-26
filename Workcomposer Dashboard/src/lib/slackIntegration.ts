export interface SlackNotifications {
    taskAssigned: boolean;
    taskUpdated: boolean;
    taskReassigned: boolean;
    taskCompleted: boolean;
    dailySummary: boolean;
    weeklySummary: boolean;
    reportReady: boolean;
}

export interface SlackIntegrationData {
    connected: boolean;
    workspaceId?: string | null;
    workspaceName?: string | null;
    slackChannelId?: string | null;
    slackChannelName?: string | null;
    notifications: SlackNotifications | null;
}

export interface SlackChannelOption {
    id: string;
    name: string;
    isPrivate?: boolean;
}

export const DEFAULT_SLACK_NOTIFICATIONS: SlackNotifications = {
    taskAssigned: true,
    taskUpdated: true,
    taskReassigned: true,
    taskCompleted: true,
    dailySummary: true,
    weeklySummary: true,
    reportReady: true,
};

const SLACK_NOTIFICATION_KEYS: Array<keyof SlackNotifications> = [
    "taskAssigned",
    "taskUpdated",
    "taskReassigned",
    "taskCompleted",
    "dailySummary",
    "weeklySummary",
    "reportReady",
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * Validates and normalizes notification flags from an untrusted API payload.
 * Returns null if rawNotifications is missing or not a plain object so callers
 * do not overwrite existing preferences unintentionally.
 */
export function normalizeSlackNotifications(
    rawNotifications: unknown,
    fallback: SlackNotifications = DEFAULT_SLACK_NOTIFICATIONS
): SlackNotifications | null {
    if (!isPlainObject(rawNotifications)) {
        return null;
    }

    const base: SlackNotifications = {
        ...DEFAULT_SLACK_NOTIFICATIONS,
        ...fallback,
    };

    const next: SlackNotifications = { ...base };
    for (const key of SLACK_NOTIFICATION_KEYS) {
        if (typeof rawNotifications[key] === "boolean") {
            next[key] = rawNotifications[key];
        }
    }

    return next;
}

/**
 * Safely narrows GET /integrations/slack responses (including legitimate null
 * responses when Slack is unconnected) into a typed SlackIntegrationData or null.
 */
export function normalizeSlackIntegrationResponse(
    data: unknown
): SlackIntegrationData | null {
    if (!isPlainObject(data)) {
        return null;
    }

    return {
        connected: Boolean(data.connected),
        workspaceId:
            typeof data.workspaceId === "string" ? data.workspaceId : null,
        workspaceName:
            typeof data.workspaceName === "string" ? data.workspaceName : null,
        slackChannelId:
            typeof data.slackChannelId === "string" ? data.slackChannelId : null,
        slackChannelName:
            typeof data.slackChannelName === "string"
                ? data.slackChannelName
                : null,
        notifications: normalizeSlackNotifications(data.notifications),
    };
}

