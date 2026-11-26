"use client";

import { Clock } from "lucide-react";
import { useTimer } from "@/context/TimerContext";
import type { EffectiveTheme } from "./ThemeSelector";

interface Props {
    effectiveTheme?: EffectiveTheme;
}

export default function WorkTimeTrackingCard({ effectiveTheme = "dark" }: Props) {
    const { stats } = useTimer();

    const formatTimer = (seconds: number) => {
        const total = Math.max(0, Math.floor(seconds));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    };

    const formatHoursShort = (seconds: number) => {
        const total = Math.max(0, Math.floor(seconds));
        const hours = (total / 3600).toFixed(1);
        return `${hours}h`;
    };

    const isDark = effectiveTheme === "dark";

    return (
        <div
            className={`relative min-h-[175px] overflow-hidden rounded-2xl border p-5 transition-all duration-300 ${
                isDark
                    ? "border-[#1E293B] border-t-2 border-t-emerald-500 bg-gradient-to-br from-[#0C2420] via-[#091D1C] to-[#071518] shadow-[0_4px_20px_rgba(0,0,0,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.25)]"
                    : "border-gray-200 border-t-2 border-t-emerald-600 bg-gradient-to-br from-emerald-50/70 via-white to-white shadow-sm hover:shadow-md"
            }`}
        >
            {/* Ambient background glow (Dark mode) */}
            {isDark && (
                <>
                    <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-emerald-500/15 blur-3xl animate-pulse" />
                    <div className="pointer-events-none absolute -bottom-16 -left-8 h-36 w-36 rounded-full bg-teal-500/10 blur-3xl" />
                </>
            )}

            <div className="relative z-10 flex flex-col justify-between h-full gap-3">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div
                            className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-md ${
                                isDark
                                    ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                                    : "bg-emerald-600 text-white shadow-emerald-500/20"
                            }`}
                        >
                            <Clock className="h-4 w-4" />
                        </div>

                        <div>
                            <h3
                                className={`text-[11px] font-bold uppercase tracking-wider ${
                                    isDark ? "text-gray-400" : "text-gray-500"
                                }`}
                            >
                                WORK TIME
                            </h3>
                        </div>
                    </div>

                    <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            isDark
                                ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/50"
                                : "bg-emerald-100 text-emerald-800"
                        }`}
                    >
                        TODAY
                    </span>
                </div>

                {/* Large Green Live Timer */}
                <div className="my-1">
                    <h2
                        className={`text-3xl font-extrabold font-mono tracking-tight ${
                            isDark ? "text-emerald-400" : "text-emerald-600"
                        }`}
                    >
                        {formatTimer(stats.todaySeconds)}
                    </h2>
                </div>

                {/* Sub-values: Week & Month */}
                <div
                    className={`mt-auto flex items-center justify-between border-t pt-3 text-xs ${
                        isDark ? "border-[#1E293B]" : "border-gray-100"
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-medium ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                            This Week:
                        </span>
                        <span
                            className={`font-mono font-bold ${
                                isDark ? "text-emerald-300" : "text-emerald-700"
                            }`}
                        >
                            {formatHoursShort(stats.weekSeconds)}
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-medium ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                            This Month:
                        </span>
                        <span
                            className={`font-mono font-bold ${
                                isDark ? "text-emerald-300" : "text-emerald-700"
                            }`}
                        >
                            {formatHoursShort(stats.monthSeconds)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
