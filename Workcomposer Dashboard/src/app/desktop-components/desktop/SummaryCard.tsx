"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { CheckSquare, Coffee, Activity, ListTodo } from "lucide-react";
import API from "@/api";
import { useTimer } from "@/context/TimerContext";
import socket from "@/socket/socket";
import type { EffectiveTheme } from "./ThemeSelector";

interface Props {
    effectiveTheme?: EffectiveTheme;
}

export default function TodaySummaryCard({ effectiveTheme = "dark" }: Props) {
    const [summary, setSummary] = useState({
        assignedTasks: 0,
        workedTasks: 0,
        taskWorkSeconds: 0,
        breakSeconds: 0,
        activityPercent: 0,
    });

    const { isTracking, lastStartedAt, lastStoppedAt } = useTimer();
    const isMountedRef = useRef(true);
    const requestCountRef = useRef(0);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const fetchSummary = useCallback(async () => {
        const requestId = ++requestCountRef.current;
        try {
            const { data } = await API.get("/sessions/today-task-summary");
            if (isMountedRef.current && requestId === requestCountRef.current && data) {
                setSummary({
                    assignedTasks: Number(data.assignedTasks) || 0,
                    workedTasks: Number(data.workedTasks) || 0,
                    taskWorkSeconds: Number(data.taskWorkSeconds) || 0,
                    breakSeconds: Number(data.breakSeconds) || 0,
                    activityPercent: Number(data.activityPercent) || 0,
                });
            }
        } catch (err: any) {
            // Gracefully handle network disconnects or unreachable backend
            if (!err?.response || err?.code === "ERR_NETWORK") {
                // Offline or backend unreachable - preserve existing summary and suppress console spam
                return;
            }
            console.error("TODAY SUMMARY ERROR:", err);
        }
    }, []);

    const debouncedFetchSummary = useCallback(() => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
            fetchSummary();
        }, 250);
    }, [fetchSummary]);

    // Initial mount and tracking transitions
    useEffect(() => {
        debouncedFetchSummary();
    }, [lastStartedAt, lastStoppedAt, debouncedFetchSummary]);

    // 60-second heartbeat active only while tracking
    useEffect(() => {
        if (!isTracking) return;
        const interval = setInterval(() => {
            fetchSummary();
        }, 60000);
        return () => clearInterval(interval);
    }, [isTracking, fetchSummary]);

    // Socket invalidation and reconnect
    useEffect(() => {
        const handleUpdate = () => {
            debouncedFetchSummary();
        };

        socket.on("session:updated", handleUpdate);
        socket.on("connect", handleUpdate);

        return () => {
            socket.off("session:updated", handleUpdate);
            socket.off("connect", handleUpdate);
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [debouncedFetchSummary]);

    const formatDuration = (seconds: number) => {
        const total = Math.max(0, Math.floor(seconds));
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    };

    const isDark = effectiveTheme === "dark";

    return (
        <div
            className={`relative min-h-[175px] overflow-hidden rounded-2xl border p-5 transition-all duration-300 ${
                isDark
                    ? "border-[#1E293B] border-t-2 border-t-purple-500 bg-gradient-to-br from-[#241238] via-[#1B0E2B] to-[#120A1E] shadow-[0_4px_20px_rgba(0,0,0,0.3)] hover:shadow-[0_0_25px_rgba(168,85,247,0.25)]"
                    : "border-gray-200 border-t-2 border-t-purple-600 bg-gradient-to-br from-purple-50/70 via-white to-white shadow-sm hover:shadow-md"
            }`}
        >
            {/* Ambient background glow (Dark mode) */}
            {isDark && (
                <>
                    <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-purple-500/15 blur-3xl animate-pulse" />
                    <div className="pointer-events-none absolute -bottom-16 -left-8 h-36 w-36 rounded-full bg-fuchsia-500/10 blur-3xl" />
                </>
            )}

            <div className="relative z-10 flex flex-col justify-between h-full gap-2.5">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div
                        className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-md ${
                            isDark
                                ? "bg-purple-600/20 text-purple-400 border border-purple-500/30 shadow-[0_0_12px_rgba(168,85,247,0.3)]"
                                : "bg-purple-600 text-white shadow-purple-500/20"
                        }`}
                    >
                        <ListTodo className="h-4 w-4" />
                    </div>

                    <div>
                        <h3
                            className={`text-[11px] font-bold uppercase tracking-wider ${
                                isDark ? "text-gray-400" : "text-gray-500"
                            }`}
                        >
                            TODAY&apos;S SUMMARY
                        </h3>
                    </div>
                </div>

                {/* Rows: Tasks, Breaks, Activity */}
                <div className="my-1 space-y-2">
                    {/* Tasks */}
                    <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                            <CheckSquare className={`h-3.5 w-3.5 ${isDark ? "text-blue-400" : "text-blue-600"}`} />
                            <span className={isDark ? "text-gray-300" : "text-gray-600"}>Tasks:</span>
                        </div>
                        <span className={`font-mono font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                            {summary.workedTasks} <span className="text-[10px] font-normal text-gray-500">worked</span>
                        </span>
                    </div>

                    {/* Breaks */}
                    <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                            <Coffee className={`h-3.5 w-3.5 ${isDark ? "text-amber-400" : "text-amber-600"}`} />
                            <span className={isDark ? "text-gray-300" : "text-gray-600"}>Breaks:</span>
                        </div>
                        <span className={`font-mono font-bold ${isDark ? "text-amber-300" : "text-amber-700"}`}>
                            {formatDuration(summary.breakSeconds)}
                        </span>
                    </div>
                </div>

                {/* Activity Footer */}
                <div
                    className={`mt-auto flex items-center justify-between border-t pt-2.5 text-xs ${
                        isDark ? "border-[#1E293B]" : "border-gray-100"
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <Activity className={`h-3.5 w-3.5 ${isDark ? "text-purple-400" : "text-purple-600"}`} />
                        <span className={`text-[11px] font-medium ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                            Activity Level:
                        </span>
                    </div>
                    <span
                        className={`font-mono font-bold text-xs ${
                            isDark ? "text-purple-300" : "text-purple-700"
                        }`}
                    >
                        {summary.activityPercent}%
                    </span>
                </div>
            </div>
        </div>
    );
}
