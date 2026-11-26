"use client";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import AttendanceActivityChart from "./AttendanceActivityChart";
import ScreenshotDetailsModal from "../screenshots/ScreenshotDetailsModal";
import { useAppTimezone } from "@/hooks/useAppTimezone";
import { formatTimeInTimezone } from "@/utils/appTimezone";
import { HiClock } from "react-icons/hi2";
import { HiBriefcase } from "react-icons/hi2";
import { BsFillBarChartFill } from "react-icons/bs";

type Props = {
    open: boolean;
    onClose: () => void;
    detailsData: any;
    timezone?: string | undefined;
};

export default function SessionDetailsModal({
    open,
    onClose,
    detailsData,
    timezone,
}: Props) {
    const appTimezone = useAppTimezone();
    const effectiveTimezone = timezone || detailsData?.timezone || appTimezone;

    const [selectedScreenshot, setSelectedScreenshot] =
        useState<any>(null);

    const [selectedIndex, setSelectedIndex] =
        useState(0);

    useEffect(() => {
        setSelectedScreenshot(null);
        setSelectedIndex(0);
    }, [open, detailsData]);

    useEffect(() => {
        if (!open) return;
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !selectedScreenshot) {
                onClose();
            }
        };
        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [open, selectedScreenshot, onClose]);

    const screenshots = useMemo(() => {
        const list = Array.isArray(detailsData?.screenshots)
            ? detailsData.screenshots
            : [];
        return [...list].sort(
            (a: any, b: any) =>
                new Date(b?.capturedAt || 0).getTime() -
                new Date(a?.capturedAt || 0).getTime()
        );
    }, [detailsData?.screenshots]);

    const highActivity = screenshots.filter(
        (s: any) => s.activityScore >= 70
    ).length;

    const mediumActivity = screenshots.filter(
        (s: any) =>
            s.activityScore >= 40 &&
            s.activityScore < 70
    ).length;

    const lowActivity = screenshots.filter(
        (s: any) => s.activityScore < 40
    ).length;

    const totalShots = screenshots.length;

    const highPercent =
        totalShots > 0
            ? Math.round((highActivity / totalShots) * 100)
            : 0;

    const mediumPercent =
        totalShots > 0
            ? Math.round((mediumActivity / totalShots) * 100)
            : 0;

    const lowPercent =
        totalShots > 0
            ? Math.round((lowActivity / totalShots) * 100)
            : 0;



    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            onClick={onClose}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px] overscroll-contain"
        >

            <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-5xl max-h-[86vh] overflow-y-auto overscroll-contain border border-gray-200 dark:border-slate-700 shadow-2xl"
            >

                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-slate-700">

                    <div className="flex items-center gap-2">
                        <HiClock className="w-4.5 h-4.5 text-indigo-700 dark:text-indigo-400" />

                        <h2 className="text-base font-semibold text-black dark:text-white">
                            Work Details
                        </h2>

                    </div>

                    <div className="flex items-center gap-4">

                        <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-semibold">
                            {detailsData?.startTime &&
                                detailsData?.endTime
                                ? `${formatTimeInTimezone(
                                    new Date(detailsData.startTime),
                                    effectiveTimezone
                                )} - ${formatTimeInTimezone(
                                    new Date(detailsData.endTime),
                                    effectiveTimezone
                                )}`
                                : "--"}
                        </span>

                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-full border-2 border-indigo-500 flex items-center justify-center text-sm text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer"
                        >
                            ✕
                        </button>

                    </div>

                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">

                    {/* Left Side */}
                    <div className="bg-white dark:bg-slate-800/80 border border-gray-200 dark:border-slate-700 rounded-xl p-4 flex items-center">

                        <div className="grid grid-cols-2 gap-4 w-full">

                            {/* Work Time */}
                            <div className="flex items-center gap-3">

                                <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 flex items-center justify-center shrink-0">
                                    <HiBriefcase className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                                </div>

                                <div>
                                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                                        Work Time
                                    </p>

                                    <p className="text-base font-bold text-indigo-500 dark:text-indigo-400 mt-0.5">
                                        {detailsData?.workTime || "0h 0m"}
                                    </p>
                                </div>

                            </div>

                            {/* Activity */}
                            <div>



                                <div className="flex items-center text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 mb-2 gap-2">
                                    <div className="w-6 h-6 rounded-md bg-indigo-100 dark:bg-indigo-950/60 flex items-center justify-center shrink-0">
                                        <BsFillBarChartFill className="h-3.5 w-3.5 text-blue-400" />
                                    </div>
                                    Activity Levels
                                </div>

                                <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div
                                        className={
                                            detailsData?.activityScore >= 70
                                                ? "h-full bg-green-500"
                                                : detailsData?.activityScore >= 40
                                                    ? "h-full bg-amber-500"
                                                    : "h-full bg-red-500"
                                        }
                                        style={{
                                            width: `${detailsData?.activityScore || 0}%`,
                                        }}
                                    />

                                </div>

                                <div className="flex justify-between mt-1.5 text-xs font-semibold">

                                    <span
                                        className={
                                            detailsData?.activityScore >= 70
                                                ? "text-green-600 dark:text-green-400 font-medium"
                                                : detailsData?.activityScore >= 40
                                                    ? "text-amber-600 dark:text-amber-400 font-medium"
                                                    : "text-red-600 dark:text-red-400 font-medium"
                                        }
                                    >
                                        {detailsData?.activityScore || 0}% active
                                    </span>

                                    <span className="text-slate-500 dark:text-slate-400">
                                        {detailsData?.idleTime ??
                                            Math.max(
                                                0,
                                                100 -
                                                    (detailsData?.activityScore ?? 0)
                                            )}
                                        % idle
                                    </span>

                                </div>

                            </div>

                        </div>

                    </div>

                    {/* Right Side */}
                    <div className="bg-white dark:bg-slate-800/80 border border-gray-200 dark:border-slate-700 rounded-xl p-4">

                        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-2.5">
                            Application Usage
                        </h3>

                        <div className="grid grid-cols-3 gap-3">

                            <div className="rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800/60 p-2.5 text-center">
                                <p className="text-xs text-gray-500 dark:text-slate-400">Productive</p>
                                <p className="mt-0.5 text-lg font-semibold text-green-600 dark:text-green-400">
                                    {detailsData?.productivePercent ?? 0}%
                                </p>
                            </div>

                            <div className="rounded-lg bg-gray-50 dark:bg-slate-900/60 border border-gray-200 dark:border-slate-700 p-2.5 text-center">
                                <p className="text-xs text-gray-500 dark:text-slate-400">Neutral</p>
                                <p className="mt-0.5 text-lg font-semibold text-gray-700 dark:text-slate-200">
                                    {detailsData?.neutralPercent ?? 0}%
                                </p>
                            </div>

                            <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 p-2.5 text-center">
                                <p className="text-xs text-gray-500 dark:text-slate-400">Unproductive</p>
                                <p className="mt-0.5 text-lg font-semibold text-red-600 dark:text-red-400">
                                    {detailsData?.unproductivePercent ?? 0}%
                                </p>
                            </div>

                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4">

                    {/* Activity Chart */}
                    <div className="border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 rounded-xl p-4">

                        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-2.5">
                            Activity Timeline
                        </h3>

                        <div className="h-[195px]">

                            <AttendanceActivityChart
                                data={detailsData?.chartData || []}
                            />

                        </div>

                    </div>

                    {/* Empty Right Panel */}
                    <div className="border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 rounded-xl p-4">

                        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-2.5">
                            Activity Details
                        </h3>

                        <div className="space-y-2.5">

                            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200/60 dark:border-green-800/50">

                                <div className="flex items-center gap-2.5">

                                    <div className="w-2.5 h-2.5 rounded-full bg-green-500" />

                                    <span className="font-medium text-sm text-slate-700 dark:text-slate-200">
                                        High Activity
                                    </span>

                                </div>

                                <span className="font-bold text-sm text-green-600 dark:text-green-400">
                                    {highActivity} - ({highPercent}%)
                                </span>

                            </div>

                            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/50">

                                <div className="flex items-center gap-2.5">

                                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />

                                    <span className="font-medium text-sm text-slate-700 dark:text-slate-200">
                                        Medium Activity
                                    </span>

                                </div>

                                <span className="font-bold text-sm text-amber-600 dark:text-amber-400">
                                    {mediumActivity} - ({mediumPercent}%)
                                </span>

                            </div>

                            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200/60 dark:border-red-800/50">

                                <div className="flex items-center gap-2.5">

                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />

                                    <span className="font-medium text-sm text-slate-700 dark:text-slate-200">
                                        Low Activity
                                    </span>

                                </div>

                                <span className="font-bold text-sm text-red-600 dark:text-red-400">
                                    {lowActivity} - ({lowPercent}%)
                                </span>

                            </div>

                            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">

                                <span className="font-medium text-sm text-slate-700 dark:text-slate-200">
                                    Total Screenshots
                                </span>

                                <span className="font-bold text-sm text-indigo-600 dark:text-indigo-400">
                                    {screenshots.length}
                                </span>

                            </div>

                        </div>

                    </div>

                </div>

                <div className="px-4 py-4">

                    <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-2.5">
                        Screenshots ({screenshots.length})
                    </h3>

                    <div className="flex gap-3 overflow-x-auto pb-1">

                        {screenshots.map((shot: any, index: number) => (

                            <div
                                key={shot._id || shot.id || index}
                                className="

group
border
border-gray-200
dark:border-slate-700
rounded-xl
overflow-hidden
bg-white
dark:bg-slate-800
flex-shrink-0
w-52
cursor-pointer
transition-all
duration-200
hover:shadow-md
hover:-translate-y-0.5
"
                            >

                                <Image
                                    src={shot.imageUrl}
                                    alt="Screenshot"
                                    width={600}
                                    height={240}
                                    className="w-full h-28 object-cover cursor-pointer hover:opacity-90"
                                    onClick={() => {
                                        setSelectedScreenshot(shot);
                                        setSelectedIndex(index);
                                    }}
                                />

                                <div className="p-2.5">

                                    <div className="flex justify-between text-xs font-semibold mb-2">

                                        <div className="flex items-center gap-2">

                                            <div
                                                className={`
    w-2.5
    h-2.5
    rounded-full
    transition-transform
    group-hover:scale-125
    ${shot.activityScore >= 70
                                                        ? "bg-green-500 animate-pulse"
                                                        : shot.activityScore >= 40
                                                            ? "bg-amber-500"
                                                            : "bg-red-500"
                                                    }
`}
                                            />

                                            <span className="text-slate-700 dark:text-slate-300">
                                                {formatTimeInTimezone(
                                                    new Date(shot.capturedAt),
                                                    effectiveTimezone
                                                )}
                                            </span>

                                        </div>

                                        <span
                                            className={
                                                shot.activityScore >= 70
                                                    ? "text-green-600 dark:text-green-400"
                                                    : shot.activityScore >= 40
                                                        ? "text-amber-500 dark:text-amber-400"
                                                        : "text-red-500 dark:text-red-400"
                                            }
                                        >
                                            {shot.activityScore}%
                                        </span>

                                    </div>

                                    <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">

                                        <div
                                            className={
                                                shot.activityScore >= 70
                                                    ? "h-full bg-green-500"
                                                    : shot.activityScore >= 40
                                                        ? "h-full bg-amber-500"
                                                        : "h-full bg-red-500"
                                            }
                                            style={{
                                                width: `${shot.activityScore}%`,
                                            }}
                                        />

                                    </div>

                                </div>

                            </div>

                        ))}

                    </div>

                </div>

            </div>


            {
                selectedScreenshot && (
                    <ScreenshotDetailsModal
                        screenshot={selectedScreenshot}
                        currentIndex={selectedIndex}
                        total={screenshots.length}
                        timezone={effectiveTimezone}
                        onClose={() =>
                            setSelectedScreenshot(null)
                        }
                        onPrevious={() => {
                            const newIndex =
                                selectedIndex - 1;

                            if (newIndex < 0) return;

                            setSelectedIndex(newIndex);

                            setSelectedScreenshot(
                                screenshots[newIndex]
                            );
                        }}
                        onNext={() => {
                            const newIndex =
                                selectedIndex + 1;

                            if (
                                newIndex >=
                                screenshots.length
                            )
                                return;

                            setSelectedIndex(newIndex);

                            setSelectedScreenshot(
                                screenshots[newIndex]
                            );
                        }}
                    />
                )
            }
        </div>
    );
}