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

export default function AppUsageChart({
    apps,
}: Props) {
    const { effectiveTheme } = useTheme();
    const isDark = effectiveTheme === "dark";

    const formatDuration = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        return `${hours}h ${minutes}m`;
    };

    const data = {
        labels: apps.map((app) => app.name),

        datasets: [
            {
                data: apps.map((app) => app.duration),
                barThickness: 26,
                borderRadius: 6,
                backgroundColor: [
                    "#1e78e8",
                    "#5ab0d9",
                    "#37c15a",
                    "#ff9800",
                    "#ff3366",
                    "#9c4dcc",
                    "#5a57d6",
                ],
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
                    label: (context: any) => {
                        const seconds = context.raw;

                        const minutes = Math.floor(seconds / 60);
                        const remainingSeconds = seconds % 60;

                        if (minutes > 0) {
                            return `${minutes}m ${remainingSeconds}s`;
                        }

                        return `${remainingSeconds}s`;
                    },
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
                    stepSize: 30,

                    callback: (value: any) => {
                        const seconds = Number(value);

                        const minutes = Math.floor(seconds / 60);
                        const remainingSeconds = seconds % 60;

                        if (minutes && remainingSeconds) {
                            return `${minutes}m ${remainingSeconds}s`;
                        }

                        if (minutes) {
                            return `${minutes}m`;
                        }

                        return `${remainingSeconds}s`;
                    },
                },
            },

            y: {
                grid: {
                    display: false,
                },
                ticks: {
                    color: isDark ? "#94A3B8" : "#64748B",
                },
            },
        },
    };



    return (
        <div className="h-[350px]">
            <Bar
                data={data}
                options={options}
            />
        </div>
    );
}