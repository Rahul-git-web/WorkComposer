"use client";

import OrganizationCard from "../desktop/OrganizationCard";
import WorkTimeTrackingCard from "../desktop/WorkTrackingCard";
import CloudSyncCard from "../desktop/CloudSyncCard";
import TodaySummaryCard from "../desktop/SummaryCard";
import StatsRow from "../desktop/StatsRow";
import ChartSection from "../desktop/ChartsSection";
import ThemeSelector, { useDesktopTheme } from "../desktop/ThemeSelector";

export default function DashboardPage() {
    const { themeMode, effectiveTheme, setThemeMode } = useDesktopTheme();
    const isDark = effectiveTheme === "dark";

    return (
        <div
            data-theme={effectiveTheme}
            className={`min-h-screen w-full transition-colors duration-300 p-4 md:p-6 pb-12 ${
                isDark
                    ? "bg-[#090F1D] text-white"
                    : "bg-slate-100 text-gray-900"
            }`}
        >
            {/* Top Dashboard Header Bar with Theme Selector */}
            <div className="flex items-center justify-between mb-5 px-1">
                <div>
                    <h1 className={`text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-gray-900"}`}>
                        Dashboard
                    </h1>
                    <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                        Overview & Real-time Activity
                    </p>
                </div>

                <ThemeSelector
                    themeMode={themeMode}
                    onThemeChange={setThemeMode}
                    effectiveTheme={effectiveTheme}
                />
            </div>

            {/* Top 4 Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 w-full">
                <OrganizationCard effectiveTheme={effectiveTheme} />
                <WorkTimeTrackingCard effectiveTheme={effectiveTheme} />
                <CloudSyncCard effectiveTheme={effectiveTheme} />
                <TodaySummaryCard effectiveTheme={effectiveTheme} />
            </div>

            {/* Statistics 4-Part Panel */}
            <div className="mt-5 w-full">
                <StatsRow effectiveTheme={effectiveTheme} />
            </div>

            {/* Charts Section */}
            <div className="mt-5 w-full">
                <ChartSection effectiveTheme={effectiveTheme} />
            </div>
        </div>
    );
}
