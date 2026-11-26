"use client";

import { Cloud, CheckCircle2, RefreshCw, AlertCircle, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import API from "@/api";
import type { EffectiveTheme } from "./ThemeSelector";

interface Props {
    effectiveTheme?: EffectiveTheme;
}

export default function CloudSyncCard({ effectiveTheme = "dark" }: Props) {
    const [sync, setSync] = useState<{
        status: string;
        pendingUploads: number;
        lastSync: string | null;
    }>({
        status: "synced",
        pendingUploads: 0,
        lastSync: null,
    });
    const [isOnline, setIsOnline] = useState(true);

    useEffect(() => {
        setIsOnline(navigator.onLine);
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, []);

    useEffect(() => {
        let mounted = true;
        const fetchSync = async () => {
            try {
                const { data } = await API.get("/sync/status");
                if (mounted && data) {
                    setSync({
                        status: data.status || "synced",
                        pendingUploads: Number(data.pendingUploads) || 0,
                        lastSync: data.lastSync || null,
                    });
                }
            } catch (err) {
                if (mounted) {
                    setSync((prev) => ({ ...prev, status: "error" }));
                }
            }
        };

        fetchSync();
        const interval = setInterval(fetchSync, 30000);
        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, []);

    const formatLastSync = (iso: string | null) => {
        if (!iso) return "Never synced";
        const date = new Date(iso);
        if (isNaN(date.getTime())) return "Never synced";
        return date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
        });
    };

    const isDark = effectiveTheme === "dark";

    const getStatusDisplay = () => {
        if (!isOnline) {
            return {
                label: "Offline",
                icon: WifiOff,
                badgeClass: isDark
                    ? "bg-red-950/60 text-red-300 border border-red-800/50"
                    : "bg-red-100 text-red-800",
                iconColor: isDark ? "text-red-400" : "text-red-600",
            };
        }
        if (sync.status === "syncing") {
            return {
                label: "Syncing...",
                icon: RefreshCw,
                badgeClass: isDark
                    ? "bg-amber-950/60 text-amber-300 border border-amber-800/50"
                    : "bg-amber-100 text-amber-800",
                iconColor: isDark ? "text-amber-400 animate-spin" : "text-amber-600 animate-spin",
            };
        }
        if (sync.status === "error") {
            return {
                label: "Sync Failed",
                icon: AlertCircle,
                badgeClass: isDark
                    ? "bg-rose-950/60 text-rose-300 border border-rose-800/50"
                    : "bg-rose-100 text-rose-800",
                iconColor: isDark ? "text-rose-400" : "text-rose-600",
            };
        }
        return {
            label: "Synchronized",
            icon: CheckCircle2,
            badgeClass: isDark
                ? "bg-cyan-950/60 text-cyan-300 border border-cyan-800/50"
                : "bg-cyan-100 text-cyan-800",
            iconColor: isDark ? "text-cyan-400" : "text-cyan-600",
        };
    };

    const statusInfo = getStatusDisplay();
    const StatusIcon = statusInfo.icon;

    return (
        <div
            className={`relative min-h-[175px] overflow-hidden rounded-2xl border p-5 transition-all duration-300 ${
                isDark
                    ? "border-[#1E293B] border-t-2 border-t-cyan-500 bg-gradient-to-br from-[#0C2233] via-[#091A28] to-[#071320] shadow-[0_4px_20px_rgba(0,0,0,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.25)]"
                    : "border-gray-200 border-t-2 border-t-cyan-600 bg-gradient-to-br from-cyan-50/70 via-white to-white shadow-sm hover:shadow-md"
            }`}
        >
            {/* Ambient background glow (Dark mode) */}
            {isDark && (
                <>
                    <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-cyan-500/15 blur-3xl animate-pulse" />
                    <div className="pointer-events-none absolute -bottom-16 -left-8 h-36 w-36 rounded-full bg-blue-500/10 blur-3xl" />
                </>
            )}

            <div className="relative z-10 flex flex-col justify-between h-full gap-3">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div
                        className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-md ${
                            isDark
                                ? "bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.3)]"
                                : "bg-cyan-600 text-white shadow-cyan-500/20"
                        }`}
                    >
                        <Cloud className="h-4 w-4" />
                    </div>

                    <div>
                        <h3
                            className={`text-[11px] font-bold uppercase tracking-wider ${
                                isDark ? "text-gray-400" : "text-gray-500"
                            }`}
                        >
                            CLOUD SYNC
                        </h3>
                    </div>
                </div>

                {/* Status Row */}
                <div className="my-1 flex items-center justify-between">
                    <span className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                        Status:
                    </span>
                    <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${statusInfo.badgeClass}`}
                    >
                        <StatusIcon className={`h-3.5 w-3.5 ${statusInfo.iconColor}`} />
                        {statusInfo.label}
                    </span>
                </div>

                {/* Last Sync Row */}
                <div
                    className={`mt-auto flex items-center justify-between border-t pt-3 text-xs ${
                        isDark ? "border-[#1E293B]" : "border-gray-100"
                    }`}
                >
                    <span className={`text-[11px] font-medium ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                        Last Synced:
                    </span>
                    <span
                        className={`font-mono text-xs font-semibold ${
                            isDark ? "text-cyan-300" : "text-cyan-700"
                        }`}
                    >
                        {formatLastSync(sync.lastSync)}
                    </span>
                </div>
            </div>
        </div>
    );
}
