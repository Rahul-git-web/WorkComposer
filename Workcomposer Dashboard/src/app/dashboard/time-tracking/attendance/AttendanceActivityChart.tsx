"use client";

import {
    ResponsiveContainer,
    BarChart,
    Bar,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
} from "recharts";
import { useTheme } from "@/context/ThemeContext";

type Props = {
    data: {
        time: string;
        timestamp?: string;
        value: number;
    }[];
};

export default function ActivityChart({
    data,
}: Props) {
    const { effectiveTheme } = useTheme();
    const isDark = effectiveTheme === "dark";

    const chartData = [...data];

    const getDynamicBarSize = (count: number) => {
        if (count <= 20) return 12;
        if (count <= 45) return 8;
        if (count <= 90) return 4;
        if (count <= 160) return 2;
        return 1;
    };

    const barSize = getDynamicBarSize(chartData.length);
    const barCategoryGap =
        chartData.length > 120 ? 0 : chartData.length > 60 ? "4%" : "15%";
    const barGap = chartData.length > 120 ? 0 : 1;

    const tickInterval =
        chartData.length <= 10
            ? 0
            : Math.max(1, Math.floor(chartData.length / 7));

    return (
        <ResponsiveContainer
            width="100%"
            height={195}
        >
            <BarChart
                data={chartData}
                margin={{
                    top: 8,
                    right: 8,
                    left: -10,
                    bottom: 4,
                }}
                barCategoryGap={barCategoryGap}
                barGap={barGap}
            >

                <CartesianGrid
                    stroke={isDark ? "#22324D" : "#E5E7EB"}
                    strokeDasharray="3 3"
                    vertical={false}
                />

                <XAxis
                    dataKey="time"
                    tick={{ fontSize: 12, fill: isDark ? "#94A3B8" : "#64748B" }}
                    interval={tickInterval}
                    minTickGap={24}
                />

                <YAxis
                    domain={[0, 100]}
                    ticks={[0, 20, 40, 60, 80, 100]}
                    tickFormatter={(value) => `${value}%`}
                    tick={{ fontSize: 12, fill: isDark ? "#94A3B8" : "#64748B" }}
                />

                <Tooltip
                    formatter={(value) => [`${value ?? 0}%`, "Activity"]}
                    labelFormatter={(label) => `Time: ${label}`}
                    contentStyle={{
                        backgroundColor: isDark ? "#0F172A" : "#FFFFFF",
                        border: isDark ? "1px solid #22324D" : "1px solid #E5E7EB",
                        borderRadius: "8px",
                        color: isDark ? "#FFFFFF" : "#0F172A",
                    }}
                    cursor={{
                        fill: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                    }}
                />

                <Bar
                    dataKey="value"
                    fill="#7C6CF6"
                    radius={[2, 2, 0, 0]}
                    barSize={barSize}
                    maxBarSize={24}
                />

            </BarChart>
        </ResponsiveContainer>
    );
}