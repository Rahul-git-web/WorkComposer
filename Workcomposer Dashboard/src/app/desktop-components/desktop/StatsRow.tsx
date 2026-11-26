"use client";

import { useEffect, useState, useMemo } from "react";
import { useTimer } from "@/context/TimerContext";
import API from "@/api";
import socket from "@/socket/socket";
import type { EffectiveTheme } from "./ThemeSelector";

interface Props {
    effectiveTheme?: EffectiveTheme;
}

interface DailyRecord {
    day: string;
    work: number;
    break: number;
}

export default function StatsRow({ effectiveTheme = "dark" }: Props) {
    const { stats, isTracking, lastStartedAt, lastStoppedAt } = useTimer();
    const [chartData, setChartData] = useState<DailyRecord[]>([]);

    useEffect(() => {
        let mounted = true;
        const loadChartData = async () => {
            try {
                const { data } = await API.get("/sessions/last-30-days-chart");
                if (mounted && Array.isArray(data)) {
                    setChartData(data);
                }
            } catch (err) {
                // Silently fallback to timerContext stats
            }
        };

        loadChartData();

        const handleUpdate = () => {
            loadChartData();
        };

        socket.on("session:updated", handleUpdate);
        return () => {
            mounted = false;
            socket.off("session:updated", handleUpdate);
        };
    }, [lastStartedAt, lastStoppedAt]);

    // Calculate rolling 7-day, rolling 30-day, and active-day average
    const calculatedMetrics = useMemo(() => {
        const liveTodayHours = (stats.todaySeconds || 0) / 3600;

        if (chartData.length > 0) {
            // chartData is 30 daily buckets where work is in hours
            // The last item in chartData is today
            const past29 = chartData.slice(0, -1);
            const totalPast29 = past29.reduce((acc, d) => acc + (Number(d.work) || 0), 0);
            const rolling30Hours = totalPast29 + liveTodayHours;

            const past6 = chartData.slice(-7, -1);
            const totalPast6 = past6.reduce((acc, d) => acc + (Number(d.work) || 0), 0);
            const rolling7Hours = totalPast6 + liveTodayHours;

            // Worked days count in 30 days
            const workedDaysCount =
                past29.filter((d) => (Number(d.work) || 0) > 0).length +
                (liveTodayHours > 0 ? 1 : 0);

            const avgDayHours =
                workedDaysCount > 0 ? rolling30Hours / workedDaysCount : 0;

            return {
                last7: `${rolling7Hours.toFixed(1)}h`,
                last30: `${rolling30Hours.toFixed(1)}h`,
                avgDay: `${avgDayHours.toFixed(1)}h`,
                today: `${liveTodayHours.toFixed(1)}h`,
                isRolling: true,
            };
        }

        // Fallback to TimerContext calendar stats if 30-day chart data is not yet loaded
        return {
            last7: `${((stats.weekSeconds || 0) / 3600).toFixed(1)}h`,
            last30: `${((stats.monthSeconds || 0) / 3600).toFixed(1)}h`,
            avgDay: `${((stats.avgDaySeconds || 0) / 3600).toFixed(1)}h`,
            today: `${(liveTodayHours).toFixed(1)}h`,
            isRolling: false,
        };
    }, [chartData, stats.todaySeconds, stats.weekSeconds, stats.monthSeconds, stats.avgDaySeconds]);

    const isDark = effectiveTheme === "dark";

    const panels = [
        {
            title: "LAST 7 DAYS",
            value: calculatedMetrics.last7,
            sublabel: "tracked",
            borderColor: "border-l-emerald-500",
            textColor: isDark ? "text-emerald-400" : "text-emerald-600",
            bgColor: isDark ? "bg-[#0B1528]/80 hover:bg-[#0E1A32]" : "bg-emerald-50/40 hover:bg-emerald-50/70",
        },
        {
            title: "LAST 30 DAYS",
            value: calculatedMetrics.last30,
            sublabel: "tracked",
            borderColor: "border-l-purple-500",
            textColor: isDark ? "text-purple-400" : "text-purple-600",
            bgColor: isDark ? "bg-[#0B1528]/80 hover:bg-[#0E1A32]" : "bg-purple-50/40 hover:bg-purple-50/70",
        },
        {
            title: "AVG / DAY",
            value: calculatedMetrics.avgDay,
            sublabel: "active days",
            borderColor: "border-l-blue-500",
            textColor: isDark ? "text-blue-400" : "text-blue-600",
            bgColor: isDark ? "bg-[#0B1528]/80 hover:bg-[#0E1A32]" : "bg-blue-50/40 hover:bg-blue-50/70",
        },
        {
            title: "TODAY",
            value: calculatedMetrics.today,
            sublabel: "so far",
            borderColor: "border-l-cyan-500",
            textColor: isDark ? "text-cyan-400" : "text-cyan-600",
            bgColor: isDark ? "bg-[#0B1528]/80 hover:bg-[#0E1A32]" : "bg-cyan-50/40 hover:bg-cyan-50/70",
        },
    ];

    return (
        <div
            className={`rounded-2xl border p-4 transition-all duration-300 ${
                isDark
                    ? "bg-[#0E172A] border-[#1E293B] shadow-[0_4px_20px_rgba(0,0,0,0.25)]"
                    : "bg-white border-gray-200 shadow-sm"
            }`}
        >
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                {panels.map((p, idx) => (
                    <div
                        key={idx}
                        className={`rounded-xl border border-l-4 ${p.borderColor} p-4 transition-all duration-200 ${
                            isDark
                                ? "border-[#1E293B] border-t border-r border-b"
                                : "border-gray-200 border-t border-r border-b"
                        } ${p.bgColor}`}
                    >
                        <div className="flex items-center justify-between">
                            <h4
                                className={`text-[10px] font-bold uppercase tracking-wider ${
                                    isDark ? "text-gray-400" : "text-gray-500"
                                }`}
                            >
                                {p.title}
                            </h4>
                            <span className="text-[10px] text-gray-500 font-medium">
                                {p.sublabel}
                            </span>
                        </div>

                        <div className="mt-2 flex items-baseline gap-1">
                            <span className={`text-2xl font-bold font-mono tracking-tight ${p.textColor}`}>
                                {p.value}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
