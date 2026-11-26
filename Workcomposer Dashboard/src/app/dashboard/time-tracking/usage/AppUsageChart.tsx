"use client";

import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Tooltip,
    Legend,
} from "chart.js";

import { Bar } from "react-chartjs-2";
import { useTheme } from "@/context/ThemeContext";

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Tooltip,
    Legend
);

type Props = {
    apps: {
        name: string;
        duration: number;
    }[];
};

const MAX_CHART_ITEMS = 12;

const BAR_COLORS = [
    "#1e78e8",
    "#5ab0d9",
    "#37c15a",
    "#ff9800",
    "#ff3366",
    "#9c4dcc",
    "#5a57d6",
    "#06b6d4",
    "#10b981",
    "#f59e0b",
    "#ec4899",
    "#6366f1",
];

const truncateLabel = (label: string, maxLen = 24) => {
    const clean = (label || "").trim();
    if (clean.length <= maxLen) return clean;
    return `${clean.slice(0, maxLen - 3)}...`;
};

const formatDurationShort = (seconds: number) => {
    const safe = Math.max(0, Math.round(seconds || 0));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;

    if (hours > 0) {
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    if (minutes > 0) {
        return secs > 0 && safe < 300 ? `${minutes}m ${secs}s` : `${minutes}m`;
    }
    return `${secs}s`;
};

const formatTooltipDuration = (seconds: number) => {
    const safe = Math.max(0, Math.round(seconds || 0));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    }
    if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
};

export default function AppUsageChart({
    apps,
}: Props) {
    const { effectiveTheme } = useTheme();
    const isDark = effectiveTheme === "dark";

    const displayedApps = [...(apps || [])]
        .sort((a, b) => (b.duration || 0) - (a.duration || 0))
        .slice(0, MAX_CHART_ITEMS);

    const containerHeight = Math.max(240, displayedApps.length * 32 + 44);

    const data = {
        labels: displayedApps.map((app) => app.name),

        datasets: [
            {
                data: displayedApps.map((app) => app.duration),
                barThickness: 20,
                borderRadius: 6,
                backgroundColor: displayedApps.map(
                    (_, index) => BAR_COLORS[index % BAR_COLORS.length]
                ),
            },
        ],
    };

    const options = {
        responsive: true,

        maintainAspectRatio: false,

        indexAxis: "y" as const,

        plugins: {
            legend: {
                display: false,
            },

            tooltip: {
                backgroundColor: isDark ? "#0F172A" : "#1F2937",
                titleColor: "#FFFFFF",
                bodyColor: "#FFFFFF",
                borderColor: isDark ? "#22324D" : "#E5E7EB",
                borderWidth: isDark ? 1 : 0,
                callbacks: {
                    title: (items: any[]) => {
                        const first = items?.[0];
                        if (!first) return "";
                        return displayedApps[first.dataIndex]?.name || first.label || "";
                    },
                    label: (context: any) =>
                        formatTooltipDuration(Number(context.raw) || 0),
                },
            },
        },

        scales: {
            x: {
                beginAtZero: true,
                grid: {
                    color: isDark ? "#22324D" : "#E5E7EB",
                },

                ticks: {
                    color: isDark ? "#94A3B8" : "#64748B",
                    maxTicksLimit: 6,

                    callback: (value: any) => formatDurationShort(Number(value) || 0),
                },
            },

            y: {
                grid: {
                    display: false,
                },
                ticks: {
                    autoSkip: false,
                    color: isDark ? "#94A3B8" : "#64748B",
                    callback: (_value: any, index: number) =>
                        truncateLabel(displayedApps[index]?.name || ""),
                },
            },
        },
    };

    return (
        <div style={{ height: `${containerHeight}px` }}>
            <Bar
                data={data}
                options={options}
            />
        </div>
    );
}