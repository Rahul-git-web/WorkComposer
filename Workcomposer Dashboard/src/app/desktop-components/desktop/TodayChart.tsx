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
import { Clock3, RefreshCw } from "lucide-react";
import API from "@/api";
import type { EffectiveTheme } from "./ThemeSelector";

interface Props {
    refreshKey: number;
    setRefreshing: React.Dispatch<React.SetStateAction<boolean>>;
    onManualRefresh?: () => void;
    effectiveTheme?: EffectiveTheme;
}

export default function TodayChart({
    refreshKey,
    setRefreshing,
    onManualRefresh,
    effectiveTheme = "dark",
}: Props) {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const requestCountRef = useRef(0);

    useEffect(() => {
        const requestId = ++requestCountRef.current;
        setLoading(true);
        const fetchChart = async () => {
            try {
                const { data } = await API.get("/sessions/today-chart");
                if (requestId === requestCountRef.current && Array.isArray(data)) {
                    setData(data);
                }
            } catch (err) {
                console.error("GET TODAY CHART ERROR:", err);
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
        if (hours === 0) return "0m";
        const totalMinutes = Math.round(hours * 60);
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        if (h > 0 && m > 0) return `${h}h ${m}m`;
        if (h > 0) return `${h}h`;
        return `${m}m`;
    };

    const maxValue = Math.max(
        ...data.map((d: any) => (Number(d.work) || 0) + (Number(d.break) || 0)),
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
                                ? "bg-blue-600/20 text-blue-400 border border-blue-500/30"
                                : "bg-blue-600 text-white"
                        }`}
                    >
                        <Clock3 className="h-4 w-4" />
                    </div>

                    <div>
                        <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                            Today
                        </h3>
                        <p className={`text-[11px] ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                            Hourly breakdown
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
                    title="Refresh today chart"
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-blue-400" : ""}`} />
                </button>
            </div>

            {/* Chart Area */}
            <div className="relative z-10 flex-1 w-full min-h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} barCategoryGap="12%" barGap={0}>
                        <CartesianGrid
                            stroke={isDark ? "#1E293B" : "#E2E8F0"}
                            strokeDasharray="3 3"
                            vertical={false}
                        />

                        <XAxis
                            dataKey="time"
                            interval={1}
                            tick={{
                                fill: isDark ? "#64748B" : "#94A3B8",
                                fontSize: 10,
                            }}
                            axisLine={false}
                            tickLine={false}
                        />

                        <YAxis
                            domain={[0, Math.ceil(maxValue * 1.1)]}
                            tickFormatter={formatYAxis}
                            tick={{
                                fill: isDark ? "#64748B" : "#94A3B8",
                                fontSize: 10,
                            }}
                            axisLine={false}
                            tickLine={false}
                            width={38}
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
