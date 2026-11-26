export const resolveAvatarUrl = (avatar?: string): string => {
    if (!avatar || !avatar.trim()) return "";
    const trimmed = avatar.trim();
    if (
        trimmed.startsWith("http://") ||
        trimmed.startsWith("https://") ||
        trimmed.startsWith("data:")
    ) {
        return trimmed;
    }
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
    const cleanBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const cleanPath = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
    return `${cleanBase}/${cleanPath}`;
};

export const getInitials = (user?: { firstName?: string; lastName?: string; email?: string } | null): string => {
    if (!user) return "SY";
    const first = user.firstName?.trim() || "";
    const last = user.lastName?.trim() || "";
    if (first || last) {
        return `${first[0] || ""}${last[0] || ""}`.toUpperCase() || "U";
    }
    if (user.email) {
        return user.email[0]?.toUpperCase() || "U";
    }
    return "SY";
};

export const getCategoryBadge = (category: string) => {
    switch (category) {
        case "Users":
            return "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 dark:border dark:border-blue-800/50";
        case "Teams":
            return "bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300 dark:border dark:border-green-800/50";
        case "Roles":
            return "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border dark:border-indigo-800/50";
        case "Desktop App":
            return "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 dark:border dark:border-purple-800/50";
        case "Organization":
            return "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border dark:border-cyan-800/50";
        case "Settings":
            return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:border dark:border-slate-700";
        case "Billing":
            return "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 dark:border dark:border-amber-800/50";
        case "Storage":
            return "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 dark:border dark:border-sky-800/50";
        case "Projects":
            return "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-300 dark:border dark:border-yellow-800/50";
        case "Tasks":
            return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-800/50";
        case "HR Leave Types":
            return "bg-pink-100 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300 dark:border dark:border-pink-800/50";
        case "Devices":
            return "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 dark:border dark:border-rose-800/50";
        default:
            return "bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300 dark:border dark:border-slate-700";
    }
};

export const getCategoryIcon = (category: string) => {
    switch (category) {
        case "Users":
            return "👤";
        case "Teams":
            return "👥";
        case "Roles":
            return "🎭";
        case "Desktop App":
            return "💻";
        case "Organization":
            return "🏢";
        case "Settings":
            return "⚙️";
        case "Billing":
            return "💳";
        case "Storage":
            return "☁️";
        case "Projects":
            return "📁";
        case "Tasks":
            return "✅";
        case "HR Leave Types":
            return "🏖️";
        case "Devices":
            return "🔒";
        default:
            return "📄";
    }
};

