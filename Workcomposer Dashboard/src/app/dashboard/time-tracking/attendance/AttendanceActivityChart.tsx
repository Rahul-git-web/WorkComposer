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
        value: number;
    }[];
};

export default function ActivityChart({
    data,
}: Props) {
    const { effectiveTheme } = useTheme();
    const isDark = effectiveTheme === "dark";

    const chartData = [...data];

    const tickInterval =
        chartData.length <= 10
            ? 0
            : Math.ceil(chartData.length / 8);

    return (
        <ResponsiveContainer
            width="100%"
            height={240}
        >
            <BarChart
                data={chartData}
                margin={{
                    top: 10,
                    right: 10,
                    left: 0,
                    bottom: 10,
                }}
                barCategoryGap="5%"
                barGap={0}
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
                />

                <YAxis
                    domain={[0, 100]}
                    ticks={[0, 20, 40, 60, 80, 100]}
                    tickFormatter={(value) => `${value}%`}
                    tick={{ fontSize: 12, fill: isDark ? "#94A3B8" : "#64748B" }}
                />

                <Tooltip
                    formatter={(value) => [`${value}%`, "Activity"]}
                    labelFormatter={(label) => `${label}`}
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
                    barSize={8}
                />

            </BarChart>
        </ResponsiveContainer>
    );
}