"use client";

import { useEffect, useState } from "react";
import API from "@/api";
import type { ReportContentProps } from "../types";
import ScreenshotCard from "@/app/dashboard/time-tracking/screenshots/ScreenShotsCard";
import { formatDateForApi } from "@/utils/appTimezone";

import { useTimeTracking } from "@/context/TimeTrackingContext";

export default function ScreenshotsContent({
    reportRange,
    selectedTeams,
    selectedUsers,
    sortBy,
    order,
    refreshKey,
    isRefreshing,
    timezone,
    users: usersProp,
}: ReportContentProps & {
    refreshKey: number;
    isRefreshing: boolean;
    timezone: string;
    users?: any[];
}) {

    let contextUsers: any[] = [];
    try {
        const timeTracking = useTimeTracking();
        if (timeTracking?.users) {
            contextUsers = timeTracking.users;
        }
    } catch {
        // Outside TimeTrackingContext
    }

    const resolvedUsers = usersProp ?? contextUsers;

    const [screenshots, setScreenshots] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const startDate = formatDateForApi(
        reportRange.startDate,
        timezone
    );

    const endDate = formatDateForApi(
        reportRange.endDate,
        timezone
    );

    useEffect(() => {
        const fetchScreenshots = async () => {
            try {
                setLoading(true);

                const { data } = await API.get("/screenshots", {
                    params: {
                        startDate,
                        endDate,
                    },
                });

                setScreenshots(data.screenshots);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchScreenshots();
    }, [startDate, endDate, refreshKey, timezone]);

    return (
        <>
            {loading || isRefreshing ? (
                <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A]">
                    <div className="flex flex-col items-center justify-center">
                        <div className="relative h-12 w-12">
                            <div className="absolute inset-0 rounded-full border-4 border-gray-100 dark:border-slate-800" />

                            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-indigo-600 border-r-indigo-400" />

                            <div className="absolute inset-2 rounded-full bg-white dark:bg-slate-900" />

                            <div className="absolute inset-[14px] animate-pulse rounded-full bg-indigo-600" />
                        </div>

                        <p className="mt-4 text-sm font-semibold text-gray-700 dark:text-slate-200">
                            Fetching content...
                        </p>

                        <p className="mt-1 text-xs text-gray-400 dark:text-slate-400">
                            Please wait while we update the screenshots
                        </p>
                    </div>
                </div>
            ) : (
                <ScreenshotCard
                    screenshots={screenshots}
                    selectedUsers={selectedUsers}
                    sortBy={sortBy}
                    order={order}
                    startDate={startDate}
                    endDate={endDate}
                    timezone={timezone}
                    users={resolvedUsers}
                />
            )}
        </>
    );
}