"use client";

import Last30DaysChart from "./Last30DaysChart";
import TodayChart from "./TodayChart";
import { useState, useEffect, useRef, useCallback } from "react";
import { useTimer } from "@/context/TimerContext";
import socket from "@/socket/socket";
import type { EffectiveTheme } from "./ThemeSelector";

interface Props {
    effectiveTheme?: EffectiveTheme;
}

export default function ChartSection({ effectiveTheme = "dark" }: Props) {
    const [refreshKey, setRefreshKey] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const { isTracking, lastStartedAt, lastStoppedAt } = useTimer();
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    const triggerRefresh = useCallback(() => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => {
            setRefreshing(true);
            setRefreshKey((prev) => prev + 1);
        }, 250);
    }, []);

    // Tracking start, stop, or task switch
    useEffect(() => {
        if (lastStartedAt || lastStoppedAt) {
            triggerRefresh();
        }
    }, [lastStartedAt, lastStoppedAt, triggerRefresh]);

    // 60-second heartbeat operates only while tracking is active
    useEffect(() => {
        if (!isTracking) return;
        const interval = setInterval(() => {
            triggerRefresh();
        }, 60000);
        return () => clearInterval(interval);
    }, [isTracking, triggerRefresh]);

    // Socket event invalidation and reconnect reconciliation
    useEffect(() => {
        const handleUpdate = () => {
            triggerRefresh();
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
    }, [triggerRefresh]);

    const isDark = effectiveTheme === "dark";

    return (
        <div className="w-full">
            {/* Unified Top Chart Legend */}
            <div className="flex items-center justify-between mb-3 px-2">
                <div className="flex items-center gap-6">
                    {/* Work Legend */}
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-[3px] bg-[#3B82F6] shrink-0 inline-block shadow-sm" />
                        <span className={`text-xs font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                            Work
                        </span>
                    </div>

                    {/* Break Legend */}
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-[3px] bg-[#F97316] shrink-0 inline-block shadow-sm" />
                        <span className={`text-xs font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                            Break
                        </span>
                    </div>
                </div>

                <div className={`text-[11px] font-medium ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                    Stacked metrics
                </div>
            </div>

            {/* Two Equal-Width Chart Columns */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="h-[320px]">
                    <TodayChart
                        refreshKey={refreshKey}
                        setRefreshing={setRefreshing}
                        onManualRefresh={triggerRefresh}
                        effectiveTheme={effectiveTheme}
                    />
                </div>

                <div className="h-[320px]">
                    <Last30DaysChart
                        refreshKey={refreshKey}
                        setRefreshing={setRefreshing}
                        onManualRefresh={triggerRefresh}
                        effectiveTheme={effectiveTheme}
                    />
                </div>
            </div>
        </div>
    );
}
