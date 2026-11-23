"use client";

import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell,
} from "recharts";
import { useTheme } from "@/context/ThemeContext";

type Props = {
    data: {
        time: string;
        value: number;
        color?: string;
    }[];
};

export default function ActivityChart({
    data,
}: Props) {
    const { effectiveTheme } = useTheme();
    const isDark = effectiveTheme === "dark";

    return (
        <div className="h-52 sm:h-64 lg:h-full w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={data}
                    barCategoryGap="0%"
                >

                    <CartesianGrid
                        stroke={isDark ? "#22324D" : "#E5E7EB"}
                        strokeDasharray="2 2"
                        vertical={false}
                    />

                    <YAxis
                        domain={[0, 100]}
                        ticks={[0, 100]}
                        tick={{ fontSize: 11, fill: isDark ? "#94A3B8" : "#64748B" }}
                        tickFormatter={(value) => `${value}%`}
                        axisLine={false}
                        tickLine={false}
                        width={28}
                    />

                    <XAxis
                        dataKey="time"
                        interval="preserveStartEnd"
                        minTickGap={20}
                        tick={{ fontSize: 11, fill: isDark ? "#94A3B8" : "#64748B" }}
                        axisLine={false}
                        tickLine={false}
                    />

                    <Tooltip
                        formatter={(value) => [`${value}%`, "Activity"]}
                        wrapperStyle={{
                            zIndex: 100,
                        }}
                        contentStyle={{
                            backgroundColor: isDark ? "#0F172A" : "#1F2937",
                            border: isDark ? "1px solid #22324D" : "none",
                            borderRadius: "8px",
                            color: "#fff",
                            fontSize: 11,
                        }}
                    />

                    <Bar
                        dataKey="value"
                        maxBarSize={6}
                        radius={[2, 2, 0, 0]}
                    >
                        {data.map((entry, index) => (
                            <Cell
                                key={index}
                                fill={entry.color ?? "#3B82F6"}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}