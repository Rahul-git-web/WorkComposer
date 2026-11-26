import type { UserProfileData } from "../types/userProfile";
import { getAppTimezone } from "./appTimezone.ts";

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export function mapUserToProfileData(
    user: any,
    trackingStatus?: string
): UserProfileData {
    if (!user) {
        return {
            firstName: "",
            name: "Unknown User",
            avatarUrl: "",
            isOnline: false,
            team: "Default team",
            email: "",
            role: "User",
            manager: "No manager assigned",
            managers: [],
            trackingStatus: "Not tracking",
            timezone: getAppTimezone(null),
            lastSynced: "Never",
            appVersion: "Unknown",
            id: "",
        };
    }

    const lastDevice = user.devices?.length
        ? [...user.devices].sort(
            (a: any, b: any) =>
                new Date(b.lastSync || 0).getTime() -
                new Date(a.lastSync || 0).getTime()
        )[0]
        : null;

    // Tracking status precedence:
    // 1. Authoritative backend fields from user object (isTracking or trackingStatus)
    // 2. Caller-supplied trackingStatus prop (from report row)
    // 3. Device telemetry (lastDevice?.isTracking)
    const isTracking =
        typeof user.isTracking === "boolean"
            ? user.isTracking
            : user.trackingStatus === "Tracking" || user.trackingStatus === "Tracking running"
            ? true
            : trackingStatus === "Tracking running" || trackingStatus === "Tracking"
            ? true
            : lastDevice?.isTracking === true;

    // Name construction precedence:
    // 1. Valid non-empty firstName + lastName
    // 2. Existing non-empty user.name
    // 3. Email prefix fallback
    // 4. "Unknown User"
    const rawFirstLast = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
    const resolvedName =
        rawFirstLast ||
        (typeof user.name === "string" && user.name.trim() ? user.name.trim() : "") ||
        (typeof user.email === "string" && user.email.includes("@") ? user.email.split("@")[0] : "") ||
        "Unknown User";

    const resolvedFirstName =
        user.firstName ||
        (resolvedName !== "Unknown User" ? resolvedName.split(" ")[0] : "");

    // Avatar normalization (ensure relative paths resolve to absolute URLs)
    let avatarUrl = user.avatarUrl || user.avatar || "";
    if (typeof avatarUrl === "string" && avatarUrl.trim()) {
        avatarUrl = avatarUrl.trim();
        if (
            !avatarUrl.startsWith("http://") &&
            !avatarUrl.startsWith("https://") &&
            !avatarUrl.startsWith("data:")
        ) {
            const backendBase =
                process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
            avatarUrl = `${backendBase.replace(/\/$/, "")}/${avatarUrl.replace(/^\//, "")}`;
        }
    } else {
        avatarUrl = "";
    }

    // Team formatting with raw 24-hex ObjectId suppression
    let resolvedTeam = "Default team";
    if (typeof user.team === "object" && user.team !== null) {
        resolvedTeam = user.team.name || "Default team";
    } else if (typeof user.team === "string" && user.team.trim()) {
        const trimmed = user.team.trim();
        resolvedTeam = OBJECT_ID_REGEX.test(trimmed) ? "Default team" : trimmed;
    }

    // Manager formatting with raw 24-hex ObjectId suppression (supports multi-manager arrays + legacy single manager)
    const rawManagerEntries =
        Array.isArray(user.managers) && user.managers.length > 0
            ? user.managers
            : user.manager
            ? [user.manager]
            : [];

    const resolvedManagers: string[] = [];
    const seenManagers = new Set<string>();
    for (const entry of rawManagerEntries) {
        let candidateName = "";
        if (typeof entry === "object" && entry !== null) {
            const mgrName = `${entry.firstName ?? ""} ${entry.lastName ?? ""}`.trim();
            candidateName = mgrName || entry.name || entry.email || "";
        } else if (typeof entry === "string" && entry.trim()) {
            const trimmed = entry.trim();
            candidateName = OBJECT_ID_REGEX.test(trimmed) ? "" : trimmed;
        }
        if (
            candidateName &&
            !OBJECT_ID_REGEX.test(candidateName) &&
            !seenManagers.has(candidateName)
        ) {
            seenManagers.add(candidateName);
            resolvedManagers.push(candidateName);
        }
    }

    const resolvedManager =
        resolvedManagers.length > 0
            ? resolvedManagers.join(", ")
            : "No manager assigned";

    // Timezone resolution: resolves "Browser timezone" or invalid value to effective IANA timezone
    const resolvedTimezone = getAppTimezone(user.reportTimezone || user.timezone);

    // Last Synced resolution: actual device synchronization timestamp
    const lastSyncDate = user.lastSync || lastDevice?.lastSync;
    const resolvedLastSynced = lastSyncDate && !isNaN(new Date(lastSyncDate).getTime())
        ? new Date(lastSyncDate).toLocaleString()
        : "Never";

    return {
        firstName: resolvedFirstName,
        name: resolvedName,
        avatarUrl,
        isOnline: isTracking || lastDevice?.isOnline === true,
        team: resolvedTeam,
        email: user.email || "",
        role: user.role
            ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
            : "User",
        manager: resolvedManager,
        managers: resolvedManagers,
        trackingStatus: isTracking ? "Tracking" : "Not tracking",
        timezone: resolvedTimezone,
        lastSynced: resolvedLastSynced,
        appVersion: user.appVersion || lastDevice?.appVersion || "Unknown",
        id: user._id || user.id || "",
    };
}
