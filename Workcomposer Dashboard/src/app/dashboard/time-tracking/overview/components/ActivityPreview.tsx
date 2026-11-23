"use client";

import { BiExpand } from "react-icons/bi";
import { BsBarChart } from "react-icons/bs";
import ActivityChart from "./ActivityChart";
import { useEffect, useState } from "react";
import ActivityDetailsModal from "./ActivityDetailsModal";
import API from "@/api";
import { useAppTimezone } from "@/hooks/useAppTimezone";
import { formatDateForApi } from "@/utils/appTimezone";

type Props = {
    userId: string;
    selectedDate: Date;
    workTime: string;
    userName: string;
    initialData?: {
        activity?: any[];
        activityScore?: number;
        idleTime?: number;
    };
    onLoaded?: (hasData: boolean, error?: boolean) => void;
    onError?: (err: any) => void;
    onLoading?: (isLoading: boolean) => void;
};

export default function ActivityPreview({
    userId,
    selectedDate,
    workTime,
    userName,
    initialData,
    onLoaded,
    onError,
    onLoading,
}: Props) {
    const timezone = useAppTimezone();

    const [isModalOpen, setIsModalOpen] = useState(false);

    const [activityData, setActivityData] = useState<
        {
            time: string;
            value: number;
            color?: string;
        }[]
    >(initialData?.activity || []);

    const [activityScore, setActivityScore] = useState(initialData?.activityScore || 0);
    const [idleTime, setIdleTime] = useState(initialData?.idleTime || 0);

    const date = formatDateForApi(selectedDate, timezone);
    useEffect(() => {
        if (initialData !== undefined) {
            const act = Array.isArray(initialData.activity) ? initialData.activity : [];
            const score = initialData.activityScore || 0;
            const idle = initialData.idleTime || 0;
            setActivityData(act);
            setActivityScore(score);
            setIdleTime(idle);
            const hasActivity = act.some((item: any) => Number(item.value) > 0) || score > 0;
            onLoaded?.(hasActivity, false);
            onLoading?.(false);
            return;
        }

        const fetchActivity = async () => {
            onLoading?.(true);
            try {
                const res = await API.get(
                    `/activity/${userId}?date=${date}`
                );

                const activity = Array.isArray(res.data?.activity)
                    ? res.data.activity
                    : [];

                setActivityData(activity);
                const score = res.data?.activityScore || 0;
                const idle = res.data?.idleTime || 0;
                setActivityScore(score);
                setIdleTime(idle);

                const hasActivityData = activity.some(
                    (item: any) => Number(item.value) > 0
                );
                const hasScore = score > 0;
                // Note: idleTime is 100 - activityScore when 0 work occurred, so idleTime > 0 is NOT activity!
                const hasData = hasActivityData || hasScore;

                onLoaded?.(hasData, false);
            } catch (err) {
                console.error(err);

                setActivityData([]);
                setActivityScore(0);
                setIdleTime(0);

                onLoaded?.(false, true);
                onError?.(err);
            } finally {
                onLoading?.(false);
            }
        };

        fetchActivity();
    }, [userId, date, initialData]);

    const hasActivityData = activityData.some(
        (item) => item.value > 0
    );

    return (
        <div className="w-full min-w-0 max-w-full overflow-hidden">
            {/* Header */}
            <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
                <h3 className="min-w-0 truncate text-lg font-semibold text-gray-900 dark:text-white">
                    Activity Levels
                </h3>

                <button
                    type="button"
                    title="View details"
                    onClick={() => setIsModalOpen(true)}
                    className="shrink-0 cursor-pointer rounded bg-indigo-50 dark:bg-indigo-950/60 px-2 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 shadow-sm transition-colors hover:bg-indigo-100 dark:hover:bg-indigo-900/60"
                >
                    View Details
                </button>
            </div>

            {/* Activity card */}
            <div
                className="
                    w-full
                    min-w-0
                    max-w-full
                    overflow-hidden
                    rounded-lg
                    bg-white
                    dark:bg-slate-800/80
                    p-1.5
                "
            >
                {/* Score */}
                {hasActivityData ? (
                    <div className="mb-1 min-w-0">
                        <div className="mb-0.5 flex min-w-0 items-center justify-between gap-2 text-sm">
                            <div className="flex min-w-0 items-center gap-1">
                                <span className="shrink-0 font-medium text-gray-700 dark:text-slate-300">
                                    Activity Score:
                                </span>

                                <span className="shrink-0 rounded-full bg-yellow-100 dark:bg-yellow-950/60 px-2 py-0.5 text-sm font-semibold text-yellow-800 dark:text-yellow-300">
                                    {activityScore}%
                                </span>
                            </div>

                            <span className="shrink-0 text-xs text-gray-500 dark:text-slate-400">
                                {idleTime}% idle time
                            </span>
                        </div>

                        {/* Progress */}
                        <div className="relative min-w-0">
                            <div
                                className="relative h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700"
                                title="Click to see detailed activity chart"
                            >
                                <div
                                    className="h-full rounded-full transition-all duration-300"
                                    style={{
                                        width: `${Math.min(
                                            Math.max(activityScore, 0),
                                            100
                                        )}%`,
                                        backgroundColor:
                                            activityScore < 40
                                                ? "#EF4444"
                                                : activityScore < 70
                                                    ? "#F59E0B"
                                                    : "#22C55E",
                                    }}
                                />
                            </div>

                            <div className="mt-0.5 flex justify-between text-[11px] leading-none text-gray-500 dark:text-slate-400">
                                <span>Low</span>
                                <span>Medium</span>
                                <span>High</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="mb-2 min-w-0">
                        <div className="flex min-w-0 items-center justify-between gap-2 text-sm">
                            <span className="shrink-0 font-medium text-gray-500 dark:text-slate-400">
                                Activity Status
                            </span>

                            <span className="min-w-0 truncate rounded-md bg-gray-100 dark:bg-slate-800 px-2 py-1 text-xs font-medium text-gray-500 dark:text-slate-400">
                                No activity recorded
                            </span>
                        </div>
                    </div>
                )}

                {/* Chart */}
                <div
                    className="
                        relative
                        h-[90px]
                        min-h-0
                        w-full
                        min-w-0
                        max-w-full
                        overflow-hidden
                    "
                >
                    {hasActivityData ? (
                        <>
                            {/* 
                              Important:
                              The chart is contained inside this wrapper.
                              This prevents SVG/canvas/chart internals from
                              overflowing into the next user's card.
                            */}
                            <div className="h-full w-full min-w-0 max-w-full overflow-hidden">
                                <ActivityChart data={activityData} />
                            </div>

                            {/* Expand button */}
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(true)}
                                className="
                                    absolute
                                    right-0
                                    top-0
                                    z-10
                                    rounded-md
                                    bg-white/80
                                    dark:bg-slate-800/80
                                    p-1
                                    shadow-sm
                                    backdrop-blur-sm
                                    transition-colors
                                    hover:bg-white
                                    dark:hover:bg-slate-700
                                "
                                aria-label="View activity details"
                                title="View activity details"
                            >
                                <BiExpand className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
                            </button>
                        </>
                    ) : (
                        <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/60">
                            <div className="flex flex-col items-center justify-center px-2 text-center">
                                <BsBarChart className="mb-1 h-5 w-5 text-gray-300 dark:text-slate-600" />

                                <p className="text-xs font-medium text-gray-500 dark:text-slate-400">
                                    No activity data
                                </p>

                                <p className="mt-0.5 text-[10px] text-gray-400 dark:text-slate-500">
                                    No activity recorded for the selected date
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Details Modal */}
            <ActivityDetailsModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                activityData={activityData}
                selectedDate={selectedDate}
                workTime={workTime}
                userName={userName}
            />
        </div>
    );
}