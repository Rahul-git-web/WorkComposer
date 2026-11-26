"use client";

import { useDashboard } from "@/context/DashboardContext";
import { Building2, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import type { EffectiveTheme } from "./ThemeSelector";

interface Props {
    effectiveTheme?: EffectiveTheme;
}

export default function OrganizationCard({ effectiveTheme = "dark" }: Props) {
    const { user } = useDashboard();
    const [now, setNow] = useState<Date | null>(null);

    useEffect(() => {
        setNow(new Date());
        const interval = setInterval(() => {
            setNow(new Date());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const orgTimezone =
        user?.organization?.timezone ||
        (user?.reportTimezone && user.reportTimezone !== "Browser timezone"
            ? user.reportTimezone
            : null) ||
        "Asia/Kolkata";

    let currentTime = "--:--:--";
    if (now) {
        try {
            currentTime = now.toLocaleTimeString("en-US", {
                timeZone: orgTimezone,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: true,
            });
        } catch {
            currentTime = now.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: true,
            });
        }
    }

    const isDark = effectiveTheme === "dark";
    const orgName = user?.organization?.name || "Organization";

    return (
        <div
            className={`relative min-h-[175px] overflow-hidden rounded-2xl border p-5 transition-all duration-300 ${
                isDark
                    ? "border-[#1E293B] border-t-2 border-t-blue-500 bg-gradient-to-br from-[#0F1E36] via-[#0D182B] to-[#0A1220] shadow-[0_4px_20px_rgba(0,0,0,0.3)] hover:shadow-[0_0_25px_rgba(59,130,246,0.25)]"
                    : "border-gray-200 border-t-2 border-t-blue-600 bg-gradient-to-br from-blue-50/70 via-white to-white shadow-sm hover:shadow-md"
            }`}
        >
            {/* Ambient background glow (Dark mode only) */}
            {isDark && (
                <>
                    <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-blue-500/15 blur-3xl animate-pulse" />
                    <div className="pointer-events-none absolute -bottom-16 -left-8 h-36 w-36 rounded-full bg-indigo-500/10 blur-3xl" />
                </>
            )}

            <div className="relative z-10 flex flex-col justify-between h-full gap-3">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div
                        className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-md ${
                            isDark
                                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-[0_0_12px_rgba(59,130,246,0.3)]"
                                : "bg-blue-600 text-white shadow-blue-500/20"
                        }`}
                    >
                        <Building2 className="h-4 w-4" />
                    </div>

                    <div>
                        <h3
                            className={`text-[11px] font-bold uppercase tracking-wider ${
                                isDark ? "text-gray-400" : "text-gray-500"
                            }`}
                        >
                            ORGANIZATION
                        </h3>
                    </div>
                </div>

                {/* Organization name */}
                <div className="my-1">
                    <p
                        className={`text-lg font-bold truncate leading-tight ${
                            isDark ? "text-white" : "text-gray-900"
                        }`}
                        title={orgName}
                    >
                        {orgName}
                    </p>
                </div>

                {/* Timezone / Current Local Time */}
                <div
                    className={`mt-auto flex items-center justify-between border-t pt-3 text-xs ${
                        isDark ? "border-[#1E293B]" : "border-gray-100"
                    }`}
                >
                    <div className="flex items-center gap-1.5 min-w-0 pr-2">
                        <Clock className={`h-3.5 w-3.5 shrink-0 ${isDark ? "text-blue-400" : "text-blue-600"}`} />
                        <span
                            className={`truncate text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}
                            title={orgTimezone}
                        >
                            {orgTimezone}
                        </span>
                    </div>

                    <span
                        className={`shrink-0 font-mono text-xs font-semibold ${
                            isDark ? "text-white" : "text-gray-900"
                        }`}
                    >
                        {currentTime}
                    </span>
                </div>
            </div>
        </div>
    );
}
