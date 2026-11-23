"use client";

import { useState, useEffect } from "react";
import { Clock3 } from "lucide-react";
import TopAppsPreview from "./TopAppsPreview";
import ActivityPreview from "./ActivityPreview";
import ScreenshotPreview from "./ScreenshotPreview";
import { useDashboard } from "@/context/DashboardContext";
import { useAppTimezone } from "@/hooks/useAppTimezone";
import { formatDateForApi } from "@/utils/appTimezone";
import API from "@/api";

type Props = {
    userId: string;
    selectedDate: Date;
    workTime: string;
    userName: string;
    breakTime?: string;
    status?: string;
    isTracking?: boolean;
};

/**
 * Checks whether a formatted time string represents a non-zero tracked duration.
 * Supports:
 * - "HH:MM", "HH:MM:SS" (e.g. "00:00", "01:30", "0:05")
 * - "Xh Ym", "Xh", "Ym", "Xs" (e.g. "0h 0m", "2h 15m", "45m")
 * - Numeric strings (e.g. "0", "3600")
 */
export function hasWorkTimeRecorded(timeStr?: string | null): boolean {
    if (!timeStr) return false;
    const trimmed = String(timeStr).trim();
    if (!trimmed || trimmed === "--") return false;

    // Colon-separated: "HH:MM" or "HH:MM:SS"
    if (trimmed.includes(":")) {
        const parts = trimmed.split(":").map((p) => parseInt(p.trim(), 10) || 0);
        return parts.some((n) => n > 0);
    }

    // Formatted "Xh Ym", "Xh", "Ym", "Xs"
    const hours = trimmed.match(/(\d+)\s*h/i);
    const minutes = trimmed.match(/(\d+)\s*m/i);
    const seconds = trimmed.match(/(\d+)\s*s/i);

    const h = parseInt(hours?.[1] || "0", 10);
    const m = parseInt(minutes?.[1] || "0", 10);
    const s = parseInt(seconds?.[1] || "0", 10);

    if (hours || minutes || seconds) {
        return h > 0 || m > 0 || s > 0;
    }

    const num = Number(trimmed);
    if (!isNaN(num)) {
        return num > 0;
    }

    return false;
}

export default function UserAnalyticsSection({
    userId,
    selectedDate,
    workTime,
    userName,
    breakTime,
    status,
    isTracking = false,
}: Props) {
    const { user } = useDashboard();
    const timezone = useAppTimezone();
    const canViewScreenshots = user?.screenshotAccess !== "none";
    const date = formatDateForApi(selectedDate, timezone);

    const [loading, setLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    const [analyticsData, setAnalyticsData] = useState<{
        screenshots: any[];
        apps: any[];
        activity: { activity: any[]; activityScore: number; idleTime: number };
        productivity: {
            productivePercent: number;
            neutralPercent: number;
            unproductivePercent: number;
            productiveTime?: string;
            neutralTime?: string;
            unproductiveTime?: string;
        };
    }>({
        screenshots: [],
        apps: [],
        activity: { activity: [], activityScore: 0, idleTime: 0 },
        productivity: {
            productivePercent: 0,
            neutralPercent: 0,
            unproductivePercent: 0,
            productiveTime: "0h 0m",
            neutralTime: "0h 0m",
            unproductiveTime: "0h 0m",
        },
    });

    useEffect(() => {
        let isCancelled = false;
        setLoading(true);
        setHasError(false);

        const fetchAll = async () => {
            const promises: Promise<any>[] = [];

            // 1. Screenshots (only if permitted)
            if (canViewScreenshots) {
                promises.push(
                    API.get(`/screenshots/${userId}?date=${date}`)
                        .then((res) => ({
                            type: "screenshots",
                            data: Array.isArray(res.data?.screenshots) ? res.data.screenshots : [],
                        }))
                        .catch((err) => {
                            const httpStatus = err?.response?.status;
                            if (httpStatus === 403 || httpStatus === 404) {
                                return { type: "screenshots", data: [] };
                            }
                            throw err;
                        })
                );
            } else {
                promises.push(
                    Promise.resolve({ type: "screenshots", data: [] })
                );
            }

            // 2. Top Apps
            promises.push(
                API.get(`/usage/top-apps/${userId}?date=${date}`)
                    .then((res) => ({
                        type: "apps",
                        data: Array.isArray(res.data) ? res.data : [],
                    }))
                    .catch((err) => {
                        const httpStatus = err?.response?.status;
                        if (httpStatus === 403 || httpStatus === 404) {
                            return { type: "apps", data: [] };
                        }
                        throw err;
                    })
            );

            // 3. Activity
            promises.push(
                API.get(`/activity/${userId}?date=${date}`)
                    .then((res) => ({
                        type: "activity",
                        data: {
                            activity: Array.isArray(res.data?.activity) ? res.data.activity : [],
                            activityScore: res.data?.activityScore || 0,
                            idleTime: res.data?.idleTime || 0,
                        },
                    }))
                    .catch((err) => {
                        const httpStatus = err?.response?.status;
                        if (httpStatus === 403 || httpStatus === 404) {
                            return {
                                type: "activity",
                                data: { activity: [], activityScore: 0, idleTime: 0 },
                            };
                        }
                        throw err;
                    })
            );

            // 4. Productivity
            promises.push(
                API.get(`/reports/productivity?startDate=${date}&endDate=${date}&users=${userId}`)
                    .then((res) => {
                        const list = Array.isArray(res.data) ? res.data : [];
                        const userProd = list.find((u: any) => String(u._id || u.id) === String(userId)) || list[0] || null;
                        return {
                            type: "productivity",
                            data: userProd
                                ? {
                                      productivePercent: Number(userProd.productivePercent || 0),
                                      neutralPercent: Number(userProd.neutralPercent || 0),
                                      unproductivePercent: Number(userProd.unproductivePercent || 0),
                                      productiveTime: userProd.productiveTime || "0h 0m",
                                      neutralTime: userProd.neutralTime || "0h 0m",
                                      unproductiveTime: userProd.unproductiveTime || "0h 0m",
                                  }
                                : {
                                      productivePercent: 0,
                                      neutralPercent: 0,
                                      unproductivePercent: 0,
                                      productiveTime: "0h 0m",
                                      neutralTime: "0h 0m",
                                      unproductiveTime: "0h 0m",
                                  },
                        };
                    })
                    .catch((err) => {
                        return {
                            type: "productivity",
                            data: {
                                productivePercent: 0,
                                neutralPercent: 0,
                                unproductivePercent: 0,
                                productiveTime: "0h 0m",
                                neutralTime: "0h 0m",
                                unproductiveTime: "0h 0m",
                            },
                        };
                    })
            );

            try {
                const results = await Promise.allSettled(promises);
                if (isCancelled) return;

                let encounteredNetworkError = false;
                let screenshotsList: any[] = [];
                let appsList: any[] = [];
                let activityObj = { activity: [], activityScore: 0, idleTime: 0 };
                let productivityObj = {
                    productivePercent: 0,
                    neutralPercent: 0,
                    unproductivePercent: 0,
                    productiveTime: "0h 0m",
                    neutralTime: "0h 0m",
                    unproductiveTime: "0h 0m",
                };

                for (const result of results) {
                    if (result.status === "rejected") {
                        encounteredNetworkError = true;
                    } else if (result.status === "fulfilled") {
                        const val = result.value;
                        if (val.type === "screenshots") screenshotsList = val.data;
                        if (val.type === "apps") appsList = val.data;
                        if (val.type === "activity") activityObj = val.data;
                        if (val.type === "productivity") productivityObj = val.data;
                    }
                }

                setAnalyticsData({
                    screenshots: screenshotsList,
                    apps: appsList,
                    activity: activityObj,
                    productivity: productivityObj,
                });
                setHasError(encounteredNetworkError);
            } catch (err) {
                if (!isCancelled) {
                    console.error("Failed to fetch analytics data:", err);
                    setHasError(true);
                }
            } finally {
                if (!isCancelled) {
                    setLoading(false);
                }
            }
        };

        fetchAll();

        return () => {
            isCancelled = true;
        };
    }, [userId, date, canViewScreenshots, reloadKey]);

    const hasWork = hasWorkTimeRecorded(workTime);
    const hasBreak = hasWorkTimeRecorded(breakTime);
    const isCurrentlyTracking = isTracking || status === "Tracking running";

    const hasScreenshots = (analyticsData.screenshots?.length || 0) > 0;
    const hasApps = (analyticsData.apps?.length || 0) > 0;
    // Note: When no activity records exist, the backend calculates idleTime = 100 - activityScore = 100.
    // Therefore idleTime > 0 is NOT an indicator of tracking activity. Only bucket values > 0 or score > 0 count.
    const hasActivity =
        (analyticsData.activity?.activity || []).some((item: any) => Number(item.value) > 0) ||
        (analyticsData.activity?.activityScore || 0) > 0;

    const hasTrackingData =
        hasWork ||
        hasBreak ||
        isCurrentlyTracking ||
        (canViewScreenshots && hasScreenshots) ||
        hasApps ||
        hasActivity;

    if (loading) {
        return (
            <div className="mt-3 w-full min-w-0 overflow-visible">
                <div
                    data-testid="user-analytics-loading"
                    className="flex min-h-[140px] w-full items-center justify-center rounded-xl border border-gray-100 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-6 shadow-xs"
                >
                    <div className="flex flex-col items-center">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 dark:border-slate-700 border-t-indigo-600" />
                        <p className="mt-2 text-xs font-medium text-gray-500 dark:text-slate-400">
                            Loading analytics...
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (hasError) {
        return (
            <div className="mt-3 w-full min-w-0 overflow-visible">
                <div
                    data-testid="user-analytics-error"
                    className="flex min-h-[120px] w-full flex-col items-center justify-center rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-red-950/20 p-6 text-center"
                >
                    <p className="text-sm font-medium text-red-800 dark:text-red-300">
                        Failed to load analytics for the selected period.
                    </p>
                    <button
                        type="button"
                        onClick={() => setReloadKey((k) => k + 1)}
                        className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                        Try again
                    </button>
                </div>
            </div>
        );
    }

    if (!hasTrackingData) {
        return (
            <div className="mt-3 w-full min-w-0 overflow-visible">
                <div
                    data-testid="user-no-tracking-data"
                    className="w-full rounded-xl border border-dashed border-gray-200 dark:border-[#22324D] bg-gray-50/60 dark:bg-[#1E293B]/40 p-6 sm:p-8 text-center transition-colors"
                >
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-[#1E293B] text-gray-400 dark:text-slate-400">
                        <Clock3 className="h-6 w-6 stroke-[1.75]" />
                    </div>

                    <h4 className="text-sm sm:text-base font-semibold text-gray-800 dark:text-slate-200">
                        No tracking data available
                    </h4>

                    <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-slate-400 max-w-md mx-auto">
                        No tracking activity was recorded for this user during the selected period.
                    </p>

                    <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
                        Try selecting a different reporting period.
                    </p>

                    <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
                        No additional detail returned for this range. Use the time options above to add time.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="mt-3 w-full min-w-0 overflow-visible">
            <div
                data-testid="user-analytics-cards"
                className={`
                    grid
                    w-full
                    min-w-0
                    grid-cols-1
                    gap-5
                    overflow-visible
                    ${canViewScreenshots ? "xl:grid-cols-12" : "xl:grid-cols-8"}
                `}
            >
                {/* SCREENSHOTS */}
                {canViewScreenshots && (
                    <div className="w-full min-w-0 xl:col-span-3">
                        <ScreenshotPreview
                            userId={userId}
                            selectedDate={selectedDate}
                            initialData={analyticsData.screenshots}
                        />
                    </div>
                )}

                {/* TOP APPS */}
                <div
                    className={`
                        w-full
                        min-w-0
                        ${canViewScreenshots ? "xl:col-span-3" : "xl:col-span-3"}
                    `}
                >
                    <TopAppsPreview
                        userId={userId}
                        selectedDate={selectedDate}
                        initialData={analyticsData.apps}
                    />
                </div>

                {/* PRODUCTIVITY */}
                <div
                    className={`
                        w-full
                        min-w-0
                        ${canViewScreenshots ? "xl:col-span-3" : "xl:col-span-2"}
                    `}
                >
                    <div className="w-full min-w-0">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                                Productivity
                            </h3>
                            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 rounded px-2 py-0.5 border border-emerald-200 dark:border-emerald-800/60">
                                {analyticsData.productivity.productivePercent}% Prod
                            </span>
                        </div>

                        <div className="bg-white dark:bg-slate-800/80 rounded-lg p-3 min-h-[160px] flex flex-col justify-between">
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
                                    <span className="font-medium">Ratio Breakdown</span>
                                    <span className="font-mono tabular-nums text-[11px]">
                                        {analyticsData.productivity.productivePercent +
                                        analyticsData.productivity.neutralPercent +
                                        analyticsData.productivity.unproductivePercent >
                                        0
                                            ? `${
                                                  analyticsData.productivity
                                                      .productivePercent +
                                                  analyticsData.productivity
                                                      .neutralPercent +
                                                  analyticsData.productivity
                                                      .unproductivePercent
                                              }% categorized`
                                            : "No categorized time"}
                                    </span>
                                </div>
                                <div className="h-3 w-full bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden flex shadow-inner">
                                    {analyticsData.productivity.productivePercent > 0 && (
                                        <div
                                            style={{
                                                width: `${analyticsData.productivity.productivePercent}%`,
                                            }}
                                            className="bg-emerald-500 h-full transition-all duration-300"
                                            title={`Productive: ${analyticsData.productivity.productivePercent}%`}
                                        />
                                    )}
                                    {analyticsData.productivity.neutralPercent > 0 && (
                                        <div
                                            style={{
                                                width: `${analyticsData.productivity.neutralPercent}%`,
                                            }}
                                            className="bg-indigo-500 dark:bg-blue-500 h-full transition-all duration-300"
                                            title={`Neutral: ${analyticsData.productivity.neutralPercent}%`}
                                        />
                                    )}
                                    {analyticsData.productivity.unproductivePercent > 0 && (
                                        <div
                                            style={{
                                                width: `${analyticsData.productivity.unproductivePercent}%`,
                                            }}
                                            className="bg-rose-500 h-full transition-all duration-300"
                                            title={`Unproductive: ${analyticsData.productivity.unproductivePercent}%`}
                                        />
                                    )}
                                    {analyticsData.productivity.productivePercent === 0 &&
                                        analyticsData.productivity.neutralPercent === 0 &&
                                        analyticsData.productivity.unproductivePercent === 0 && (
                                            <div className="bg-gray-200 dark:bg-slate-700 h-full w-full" />
                                        )}
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100 dark:border-slate-700/60 text-center">
                                <div className="p-1.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
                                    <div className="flex items-center justify-center gap-1 mb-0.5">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                        <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
                                            Prod
                                        </span>
                                    </div>
                                    <div className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                        {analyticsData.productivity.productivePercent}%
                                    </div>
                                </div>

                                <div className="p-1.5 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40">
                                    <div className="flex items-center justify-center gap-1 mb-0.5">
                                        <span className="w-2 h-2 rounded-full bg-indigo-500 dark:bg-blue-500" />
                                        <span className="text-[10px] font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-wider">
                                            Neutral
                                        </span>
                                    </div>
                                    <div className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                        {analyticsData.productivity.neutralPercent}%
                                    </div>
                                </div>

                                <div className="p-1.5 rounded-lg bg-rose-50/60 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40">
                                    <div className="flex items-center justify-center gap-1 mb-0.5">
                                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                                        <span className="text-[10px] font-bold text-rose-800 dark:text-rose-300 uppercase tracking-wider">
                                            Unprod
                                        </span>
                                    </div>
                                    <div className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400">
                                        {analyticsData.productivity.unproductivePercent}%
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ACTIVITY */}
                <div
                    className={`
                        w-full
                        min-w-0
                        ${canViewScreenshots ? "xl:col-span-3" : "xl:col-span-3"}
                    `}
                >
                    <ActivityPreview
                        userId={userId}
                        selectedDate={selectedDate}
                        workTime={workTime}
                        userName={userName}
                        initialData={analyticsData.activity}
                    />
                </div>
            </div>
        </div>
    );
}
