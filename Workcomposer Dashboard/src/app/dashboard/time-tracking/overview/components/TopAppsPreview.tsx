"use client";

import API from "@/api";
import { useRouter } from "next/navigation";
import useDesktopNavigation from "@/hooks/useDesktopNavigation";
import AppUsageChart from "./AppUsageChart";
import { useEffect, useState } from "react";
import { useAppTimezone } from "@/hooks/useAppTimezone";
import { formatDateForApi } from "@/utils/appTimezone";

type Props = {
    userId: string;
    selectedDate: any;
    initialData?: any[];
    onLoaded?: (hasData: boolean, error?: boolean) => void;
    onError?: (err: any) => void;
    onLoading?: (isLoading: boolean) => void;
};

export default function TopAppsPreview({
    userId,
    selectedDate,
    initialData,
    onLoaded,
    onError,
    onLoading,
}: Props) {

    const router = useRouter();
    const { navigateToReport } = useDesktopNavigation();
    const timezone = useAppTimezone();
    const [apps, setApps] = useState<any[]>(initialData || []);

    const date = formatDateForApi(selectedDate, timezone);
    useEffect(() => {
        if (initialData !== undefined) {
            setApps(initialData);
            onLoaded?.(initialData.length > 0, false);
            onLoading?.(false);
            return;
        }

        const fetchApps = async () => {
            onLoading?.(true);
            try {
                const res = await API.get(
                    `/usage/top-apps/${userId}?date=${date}`
                );

                const list = Array.isArray(res.data) ? res.data : [];
                setApps(list);
                onLoaded?.(list.length > 0, false);

            } catch (err) {
                console.error(err);
                onLoaded?.(false, true);
                onError?.(err);
            } finally {
                onLoading?.(false);
            }
        };

        fetchApps();
    }, [userId, date, initialData]);

    const formatTime = (sec: number) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);

        return `${h}h ${m}m`;

    };

    return (
        <div className="w-full min-w-0">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                    Top apps by usage
                </h3>

                <button
                    title="View all"
                    onClick={() =>
                        navigateToReport("usage", "/dashboard/time-tracking/usage")
                    }
                    className="text-xs font-semibold cursor-pointer text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded px-2 py-1 shadow-sm transition-colors">
                    View all
                </button>
            </div>

            <div className="bg-white dark:bg-slate-800/80 rounded-lg p-2">

                <div className="flex items-center gap-2 mt-2">

                    {/* Chart */}
                    <div className="flex-shrink-0">
                        {apps.length > 0 ? (
                            <AppUsageChart data={apps} />
                        ) : (
                            <div className="w-[140px] h-[140px] flex items-center justify-center text-xs text-gray-400 dark:text-slate-500">
                                No Data
                            </div>
                        )}
                    </div>

                    {/* Apps */}
                    <div className="flex-1 min-w-0">
                        <div className="space-y-2 h-[125px] overflow-y-auto pr-1">
                            {apps.length > 0 ? (
                                apps.map((app, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center justify-between gap-3"
                                    >
                                        <div className="flex items-center min-w-0">
                                            <div
                                                className="w-2 h-2 rounded-full mr-2 flex-shrink-0"
                                                style={{
                                                    backgroundColor: app.color || "#36A2EB",
                                                }}
                                            />

                                            <span
                                                className="text-sm text-gray-700 dark:text-slate-200 truncate"
                                                title={app.name}
                                            >
                                                {app.name}
                                            </span>
                                        </div>

                                        <span className="text-xs text-gray-500 dark:text-slate-400 whitespace-nowrap">
                                            {formatTime(app.duration)}
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <div className="text-sm text-gray-500 dark:text-slate-400 py-4 text-center">
                                    No app usage data available
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}