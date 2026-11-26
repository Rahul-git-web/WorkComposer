"use client";

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    ResponsiveContainer,
    Tooltip,
    CartesianGrid,
} from "recharts";
import CustomTooltip from "./CustomTooltip";
import { useEffect, useState, useRef } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import API from "@/api";
import type { EffectiveTheme } from "./ThemeSelector";

interface Props {
    refreshKey: number;
    setRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
    onManualRefresh?: () => void;
    effectiveTheme?: EffectiveTheme;
}

export default function Last30DaysChart({
    refreshKey,
    setRefreshing,
    onManualRefresh,
    effectiveTheme = "dark",
}: Props) {
    const [data, setData] = useState<{ day: string; work: number; break: number }[]>([]);
    const [loading, setLoading] = useState(false);
    const requestCountRef = useRef(0);

    useEffect(() => {
        const requestId = ++requestCountRef.current;
        setLoading(true);
        const fetchChart = async () => {
            try {
                const { data } = await API.get("/sessions/last-30-days-chart");
                if (requestId === requestCountRef.current && Array.isArray(data)) {
                    setData(data);
                }
            } catch (err) {
                console.error("GET LAST 30 DAYS CHART ERROR:", err);
            } finally {
                if (requestId === requestCountRef.current) {
                    setRefreshing(false);
                    setLoading(false);
                }
            }
        };

        fetchChart();
    }, [refreshKey, setRefreshing]);

    const formatYAxis = (hours: number) => {
        if (hours === 0) return "0h";
        return `${Math.round(hours)}h`;
    };

    const maxHours = Math.max(
        ...data.map((d) => (Number(d.work) || 0) + (Number(d.break) || 0)),
        1
    );

    const isDark = effectiveTheme === "dark";

    return (
        <div
            className={`relative flex flex-col h-full w-full rounded-2xl border p-4 transition-all duration-300 ${
                isDark
                    ? "bg-[#0E172A] border-[#1E293B] shadow-[0_4px_20px_rgba(0,0,0,0.25)]"
                    : "bg-white border-gray-200 shadow-sm"
            }`}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-3">
                    <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                            isDark
                                ? "bg-cyan-600/20 text-cyan-400 border border-cyan-500/30"
                                : "bg-cyan-600 text-white"
                        }`}
                    >
                        <CalendarDays className="h-4 w-4" />
                    </div>

                    <div>
                        <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                            Last 30 Days
                        </h3>
                        <p className={`text-[11px] ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                            Daily breakdown
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => {
                        if (onManualRefresh) onManualRefresh();
                        else setRefreshing(true);
                    }}
                    className={`p-1.5 rounded-lg transition-colors ${
                        isDark
                            ? "text-gray-400 hover:text-white hover:bg-white/5"
                            : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                    }`}
                    title="Refresh 30-day chart"
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-cyan-400" : ""}`} />
                </button>
            </div>

            {/* Chart Area */}
            <div className="relative z-10 flex-1 w-full min-h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} barCategoryGap="15%">
                        <CartesianGrid
                            stroke={isDark ? "#1E293B" : "#E2E8F0"}
                            strokeDasharray="3 3"
                            vertical={false}
                        />

                        <XAxis
                            dataKey="day"
                            interval={3}
                            tick={{
                                fill: isDark ? "#64748B" : "#94A3B8",
                                fontSize: 10,
                            }}
                            axisLine={false}
                            tickLine={false}
                        />

                        <YAxis
                            domain={[0, Math.ceil(maxHours * 1.15)]}
                            tickFormatter={formatYAxis}
                            tick={{
                                fill: isDark ? "#64748B" : "#94A3B8",
                                fontSize: 10,
                            }}
                            axisLine={false}
                            tickLine={false}
                            width={34}
                        />

                        <Tooltip
                            cursor={{
                                fill: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
                            }}
                            content={<CustomTooltip />}
                        />

                        {/* Work (Blue) */}
                        <Bar
                            dataKey="work"
                            fill="#3B82F6"
                            stackId="total"
                            radius={[0, 0, 0, 0]}
                        />

                        {/* Break (Orange) */}
                        <Bar
                            dataKey="break"
                            fill="#F97316"
                            stackId="total"
                            radius={[3, 3, 0, 0]}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
