
"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useState } from "react";
import API from "@/api";
import { useDashboard } from "@/context/DashboardContext";
import { useOptionalDesktop } from "@/context/DesktopContext";
import { useAppTimezone } from "@/hooks/useAppTimezone";
import useDesktopNavigation from "@/hooks/useDesktopNavigation";
import { formatDateForApi } from "@/utils/appTimezone";

type Props = {
    userId: string;
    selectedDate: Date;
    initialData?: any[];
    onLoaded?: (hasData: boolean, error?: boolean) => void;
    onError?: (err: any) => void;
    onLoading?: (isLoading: boolean) => void;
};

export default function ScreenshotPreview({
    userId,
    selectedDate,
    initialData,
    onLoaded,
    onError,
    onLoading,
}: Props) {
    const router = useRouter();
    const { user } = useDashboard();
    const { navigateToReport } = useDesktopNavigation();
    const desktop = useOptionalDesktop();

    const isDesktop = typeof window !== "undefined" && !!window.electronAPI;

    const timezone = useAppTimezone();

    const [screenshots, setScreenshots] = useState<any[]>(initialData || []);

    const canViewScreenshots =
        user?.screenshotAccess !== "none";

    const date = formatDateForApi(selectedDate, timezone);
    useEffect(() => {
        if (initialData !== undefined) {
            setScreenshots(initialData);
            onLoaded?.(initialData.length > 0, false);
            onLoading?.(false);
            return;
        }

        if (!canViewScreenshots) {
            setScreenshots([]);
            onLoaded?.(false, false);
            onLoading?.(false);
            return;
        }

        const fetchScreenshots = async () => {
            onLoading?.(true);
            try {
                const res = await API.get(
                    `/screenshots/${userId}?date=${date}`
                );

                const list = Array.isArray(res.data?.screenshots)
                    ? res.data.screenshots
                    : [];
                setScreenshots(list);
                onLoaded?.(list.length > 0, false);
            } catch (err) {
                console.error(err);
                onLoaded?.(false, true);
                onError?.(err);
            } finally {
                onLoading?.(false);
            }
        };

        fetchScreenshots();
    }, [userId, date, canViewScreenshots, initialData]);

    if (!canViewScreenshots) {
        return null;
    }


    return (
        <div className="w-full min-w-0">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                    Screenshots
                </h3>

                <button
                    title="View all"
                    onClick={() => {
                        navigateToReport("screenshots", "/dashboard/time-tracking/screenshots");
                    }}
                    className="text-xs font-semibold cursor-pointer text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded px-2 py-1 shadow-sm transition-colors">
                    View all
                </button>
            </div>

            <div className="bg-white dark:bg-slate-800/80 rounded-lg">
                <div className="grid grid-cols-3 gap-3">

                    {screenshots.length === 0 ? (
                        <div className="col-span-3 flex items-center justify-center h-32 border border-dashed border-gray-300 dark:border-slate-700 rounded-lg">
                            <p className="text-sm text-gray-500 dark:text-slate-400">
                                No screenshots captured for this day
                            </p>
                        </div>
                    ) : (
                        screenshots.map((shot, index) => {
                            return (
                                <div key={index} className="relative">
                                    <div className="overflow-hidden rounded-md border border-gray-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer transform hover:scale-[1.01] hover:border-gray-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800">

                                        <Image
                                            src={shot.imageUrl}
                                            alt="Screenshot"
                                            width={500}
                                            height={300}
                                            className="w-full h-24 object-cover rounded-t-md"
                                        />

                                        <div className="p-2.5 bg-white dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700">

                                            <div className="flex flex-wrap justify-between items-start mb-1">
                                                <div className="text-xs font-medium text-gray-700 dark:text-slate-200 mb-0.5">
                                                    {new Date(
                                                        shot.capturedAt
                                                    ).toLocaleTimeString([], {
                                                        hour: "numeric",
                                                        minute: "2-digit",
                                                        timeZone: timezone,
                                                    })}

                                                </div>

                                                <div
                                                    className="text-xs font-semibold flex items-center gap-1"
                                                    style={{
                                                        color:
                                                            shot.activityScore < 40
                                                                ? "#EF4444"
                                                                : shot.activityScore < 70
                                                                    ? "#F59E0B"
                                                                    : "#22C55E",
                                                    }}
                                                >
                                                    <span
                                                        className="h-1.5 w-1.5 rounded-full"
                                                        style={{
                                                            backgroundColor:
                                                                shot.activityScore < 40
                                                                    ? "#EF4444"
                                                                    : shot.activityScore < 70
                                                                        ? "#F59E0B"
                                                                        : "#22C55E",
                                                        }}
                                                    />

                                                    {shot.activityScore}%
                                                </div>
                                            </div>

                                            <div className="h-1 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full"
                                                    style={{
                                                        width: `${shot.activityScore}%`,
                                                        backgroundColor:
                                                            shot.activityScore < 40
                                                                ? "#EF4444"
                                                                : shot.activityScore < 70
                                                                    ? "#F59E0B"
                                                                    : "#22C55E",
                                                    }}
                                                />
                                            </div>

                                        </div>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>
        </div>
    );
}