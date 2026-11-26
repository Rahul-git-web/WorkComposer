"use client";

import Image from "next/image";
import { FiDownload } from "react-icons/fi";
import { LuClock3 } from "react-icons/lu";
import { IoIosPause } from "react-icons/io";
import { useState } from "react";
import API from "@/api";
import UserProfileTrigger from "@/components/UserProfileTrigger";
import SessionDetailsModal from "./SessionDetailsModal";
import ReportsModal from "./reports/ReportsModal";
import { mapUserToProfileData } from "@/utils/mapUserToProfileData";
import { useAppTimezone } from "@/hooks/useAppTimezone";
import {
    getTimePartsInTimezone,
    formatTimeInTimezone,
    formatDateForApi,
} from "@/utils/appTimezone";
import {
    getTimelineSegmentsForDay,
    clampSessionsToDay,
} from "@/utils/attendanceTimeline";

type Props = {
    reportRange: {
        type: string;
        startDate: Date;
        endDate: Date;
    };
    users: {
        _id: string;
        name: string;
        avatar?: string;
        workTime: string;
        breakTime: string;
        startTime: string;
        finishTime: string;
        sessionsCount: number;
        timezone?: string;

        sessions: {
            startTime: string;
            endTime: string;
            duration: number;
            type: "work" | "break" | "not-tracked";
        }[];
        dailyData?: {
            date: string;
            workTime: string;
            breakTime: string;
            sessions: {
                startTime: string;
                endTime: string;
                duration: number;
                type: "work" | "break" | "not-tracked";
            }[];
        }[];
    }[];
    allUsers: any[];
    selectedUsers: any[];
    selectedTeams: any[];
};

export default function AttendanceCard({
    users = [],
    allUsers,
    reportRange,

    selectedUsers,
    selectedTeams,
}: Props) {

    const timezone = useAppTimezone();

    const [showBanner, setShowBanner] = useState(true);
    const [showDetailsModal, setShowDetailsModal] =
        useState(false);

    const [detailsData, setDetailsData] =
        useState<any>(null);

    const [detailsTimezone, setDetailsTimezone] =
        useState<string | undefined>(undefined);

    const [showReports, setShowReports] =
        useState(false);

    const isSingleDay =
        reportRange.type === "Day" ||
        reportRange.type === "Yesterday" ||
        reportRange.type === "Today" ||
        (Boolean(reportRange.startDate && reportRange.endDate) &&
            formatDateForApi(reportRange.startDate, timezone) ===
                formatDateForApi(reportRange.endDate, timezone));

    const buildThirtyMinuteBuckets = (
        sessions: {
            startTime: string;
            endTime: string;
            duration?: number;
            type: "work" | "break" | "not-tracked";
        }[] = [],
        dayDate?: string | Date,
        effectiveTimezone?: string
    ) => {
        const tz = effectiveTimezone || timezone;
        const daySessions = dayDate
            ? clampSessionsToDay(sessions as any, dayDate, tz)
            : sessions;

        const buckets = [];

        for (let i = 0; i < 48; i++) {
            const bucketStart = i * 30;
            const bucketEnd = bucketStart + 30;

            let workMinutes = 0;
            let breakMinutes = 0;

            daySessions.forEach((session) => {
                if (!session || !session.startTime) return;
                const start = new Date(session.startTime);
                const end = session.endTime ? new Date(session.endTime) : new Date();

                const { hour: startHour, minute: startMinute } =
                    getTimePartsInTimezone(start, tz);

                const { hour: endHour, minute: endMinute } =
                    getTimePartsInTimezone(end, tz);

                const startMinutes = startHour * 60 + startMinute;
                const endMinutes = endHour * 60 + endMinute;

                const overlapStart = Math.max(bucketStart, startMinutes);
                const overlapEnd = Math.min(bucketEnd, endMinutes);

                const overlap = Math.max(0, overlapEnd - overlapStart);

                if (session.type === "work") {
                    workMinutes += overlap;
                }

                if (session.type === "break") {
                    breakMinutes += overlap;
                }
            });

            if (workMinutes > 0 || breakMinutes > 0) {
                buckets.push({
                    bucketStart,
                    bucketEnd,
                    workMinutes,
                    breakMinutes,
                });
            }
        }

        return buckets;
    };

    const formatDuration = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        return `${hours}h ${minutes}m`;
    };

    const openDetailsModal = async (
        userId: string,
        startTime: string,
        endTime?: string | null,
        modalTimezone?: string
    ) => {
        try {
            const resolvedEndTime = endTime || new Date().toISOString();

            const { data } = await API.get(
                "/activity/session-details",
                {
                    params: {
                        userId,
                        startTime,
                        endTime: resolvedEndTime,
                    },
                }
            );

            setDetailsData(data);
            setDetailsTimezone(data?.timezone || modalTimezone || timezone);

            setShowDetailsModal(true);

        } catch (error) {
            console.error(error);
        }
    };

    const handleExportOverview = async () => {
        try {
            const startDate = formatDateForApi(reportRange.startDate, timezone);
            const endDate = formatDateForApi(reportRange.endDate, timezone);
            const userIds = (selectedUsers || [])
                .map((user: any) => user?._id || user?.id)
                .filter(Boolean);
            const teamIds = (selectedTeams || [])
                .map((team: any) =>
                    typeof team === "object" ? team?._id || team?.id : team
                )
                .filter(Boolean);

            await API.post(
                "/reports/attendance-overview",
                {
                    startDate,
                    endDate,
                    selectedUsers: userIds,
                    selectedTeams: teamIds,
                }
            );

            setShowReports(true);

        } catch (err) {

            console.error(err);

        }
    };

    const handleExportDetailed = async () => {
        try {
            const startDate = formatDateForApi(reportRange.startDate, timezone);
            const endDate = formatDateForApi(reportRange.endDate, timezone);
            const userIds = (selectedUsers || [])
                .map((user: any) => user?._id || user?.id)
                .filter(Boolean);
            const teamIds = (selectedTeams || [])
                .map((team: any) =>
                    typeof team === "object" ? team?._id || team?.id : team
                )
                .filter(Boolean);

            await API.post(
                "/reports/attendance-detailed",
                {
                    startDate,
                    endDate,
                    selectedUsers: userIds,
                    selectedTeams: teamIds,
                }
            );

            setShowReports(true);

        } catch (err) {

            console.error(err);

        }
    };

    return (
        <>
            <div className="min-h-[calc(100vh-250px)] rounded-b-lg bg-white dark:bg-[#0F172A] shadow-sm border-l border-r border-b border-gray-200 dark:border-[#22324D]">
                <div className="divide-y divide-gray-200 dark:divide-[#22324D] overflow-hidden bg-white dark:bg-[#0F172A] shadow-sm rounded-lg">
                    <div className="px-3 py-2 sm:px-5 bg-white dark:bg-[#0F172A] shadow-sm border-b border-gray-200 dark:border-[#22324D]">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <h2 className="text-lg font-bold text-gray-800 dark:text-white">Attendance</h2>
                            <div className="flex items-center gap-2">
                                <button
                                    title="Export Detailed report"
                                    onClick={handleExportDetailed}
                                    className="inline-flex cursor-pointer items-center font-semibold px-4 py-2 text-sm font-medium rounded-md shadow-sm focus:outline-none transition border border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40">
                                    <FiDownload className="w-5 h-5 mr-2" />
                                    Export Detailed
                                </button>
                                <button
                                    title="Export Overview report"
                                    onClick={handleExportOverview}
                                    className="inline-flex cursor-pointer items-center font-semibold px-4 py-2 text-sm font-medium rounded-md shadow-sm focus:outline-none transition bg-indigo-600 text-white hover:bg-indigo-700"
                                >
                                    <FiDownload className="w-5 h-5 mr-2" />
                                    Export Overview
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="px-4 py-5 sm:px-6">

                        <div>
                            {showBanner && (
                                <div data-test="no-activity-banner" className="mb-4 rounded-lg border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/60 dark:bg-indigo-950/30 px-4 py-3 text-center sm:flex sm:items-center sm:justify-between sm:gap-4 sm:text-left">
                                    <p className="text-sm text-gray-700 dark:text-gray-300">
                                        <span className="font-semibold">Not seeing your team&#39;s attendance?{" "}</span>
                                        They may have tracked on other days.
                                    </p>
                                    <div className="mt-3 flex flex-col gap-2 sm:mt-0 sm:flex-row sm:flex-shrink-0">

                                    </div>
                                </div>
                            )}


                            {users?.map((user) => {

                                const filteredSessions = user.sessions || [];

                                const workSeconds = filteredSessions
                                    .filter((s) => s.type === "work")
                                    .reduce((total, s) => total + (s.duration || 0), 0);

                                const breakSeconds = filteredSessions
                                    .filter((s) => s.type === "break")
                                    .reduce(
                                        (total, s) => total + (s.duration || 0),
                                        0
                                    );

                                const userTimezone = user.timezone || timezone;

                                const sortedSessions = [...filteredSessions].sort(
                                    (a, b) =>
                                        new Date(a.startTime).getTime() -
                                        new Date(b.startTime).getTime()
                                );

                                const firstSession = sortedSessions[0];

                                const lastSession =
                                    sortedSessions[sortedSessions.length - 1];

                                const targetDay = reportRange.startDate;
                                const segments = getTimelineSegmentsForDay(
                                    filteredSessions,
                                    targetDay,
                                    userTimezone
                                );

                                return (

                                    <div
                                        key={user._id}
                                        className="p-3 mb-4 relative border-b border-gray-100 dark:border-gray-800">
                                        <div className="flex flex-col md:flex-row gap-2 items-start md:items-center rounded-lg p-1 -m-1">
                                            <div className="relative flex-shrink-0 mx-auto md:mx-0 mb-2 md:mb-0 flex-1 min-w-0 w-full md:w-1/3">
                                                <span className="flex items-center">
                                                    <UserProfileTrigger
                                                        user={user}
                                                        className="shrink-0 cursor-pointer rounded-full focus:outline-none"
                                                    >
                                                        <Image
                                                            src={
                                                                user.avatar?.trim()
                                                                    ? user.avatar
                                                                    : `https://ui-avatars.com/api/?name=${encodeURIComponent(
                                                                        user.name
                                                                    )}`
                                                            }
                                                            alt={user.name}
                                                            width={48}
                                                            height={48}
                                                            className="w-12 h-12 rounded-full object-cover shadow-sm border-2 border-white hover:ring-2 hover:ring-indigo-400 transition"
                                                            unoptimized
                                                        />
                                                    </UserProfileTrigger>

                                                    <UserProfileTrigger
                                                        user={user}
                                                        className="ml-3 truncate max-w-xs text-left"
                                                    >
                                                        <h3 className="text-blue-700 dark:text-indigo-400 font-semibold text-lg cursor-pointer transition-colors hover:text-indigo-600 dark:hover:text-indigo-300 truncate">
                                                            {" "}{user.name}
                                                        </h3>
                                                    </UserProfileTrigger>
                                                </span>
                                            </div>

                                            <div className="flex flex-row items-start gap-1 text-sm w-full md:w-2/3">
                                                <div className="flex flex-row flex-nowrap gap-1 w-full overflow-x-auto">
                                                    <div className="flex items-center p-1 rounded-md flex-1 min-w-[90px]">
                                                        <div className="w-full">
                                                            <div className="flex items-center">
                                                                <LuClock3 className="w-4 h-4 mr-1 text-indigo-600" />
                                                                <div className="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">Work</div>
                                                            </div>
                                                            <div className="text-blue-600 dark:text-indigo-400 font-bold text-sm ml-5">{formatDuration(workSeconds)}</div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center p-1 rounded-md flex-1 min-w-[90px]">
                                                        <div className="w-full">
                                                            <div className="flex items-center">
                                                                <IoIosPause className="w-4 h-4 mr-1 text-orange-500" />
                                                                <div className="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">Break</div>
                                                            </div>
                                                            <div className="text-orange-600 font-bold text-sm ml-5">{formatDuration(breakSeconds)}</div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center p-1 flex-1 min-w-[90px]">
                                                        <div className="w-full">
                                                            <div className="flex items-center">
                                                                <div className="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">Start</div>
                                                            </div>
                                                            <div className="text-gray-600 dark:text-gray-400 font-bold text-sm">
                                                                {
                                                                    isSingleDay
                                                                        ? user.startTime || (firstSession
                                                                            ? formatTimeInTimezone(
                                                                                new Date(firstSession.startTime),
                                                                                userTimezone
                                                                            )
                                                                            : "Not started")
                                                                        : "Not started"
                                                                }
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center p-1 flex-1 min-w-[90px]">
                                                        <div className="w-full">
                                                            <div className="flex items-center">
                                                                <div className="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">Finish</div>
                                                            </div>
                                                            <div className="text-gray-600 dark:text-gray-400 font-bold text-sm">
                                                                {
                                                                    isSingleDay
                                                                        ? user.finishTime || (lastSession && lastSession.endTime
                                                                            ? formatTimeInTimezone(
                                                                                new Date(lastSession.endTime),
                                                                                userTimezone
                                                                            )
                                                                            : (lastSession ? "Active" : "Not finished"))
                                                                        : "Not finished"
                                                                }
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {isSingleDay && (
                                            <div className="mt-2">
                                                <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1.5 tracking-wide">Activity Timeline</h4>
                                                <div className="relative h-8 rounded-sm border border-gray-100 dark:border-gray-800 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700">

                                                    {segments.map((segment, index) => (
                                                        <div
                                                            key={index}
                                                            className="group absolute top-0 h-full cursor-pointer"
                                                            onClick={() => {

                                                                if (segment.type === "break") return;

                                                                if (segment.type === "not-tracked") return;

                                                                openDetailsModal(
                                                                    user._id,
                                                                    segment.startTime,
                                                                    segment.segmentEnd || segment.endTime,
                                                                    userTimezone
                                                                );
                                                            }}
                                                            style={{
                                                                left: `${segment.left}%`,
                                                                width: `${segment.width}%`,
                                                            }}
                                                        >
                                                            <div
                                                                className={`h-full ${segment.type === "work"
                                                                    ? "bg-green-400"
                                                                    : segment.type === "break"
                                                                        ? "bg-orange-500"
                                                                        : "bg-gray-300 dark:bg-gray-600"
                                                                    }`}
                                                            />

                                                            <div className="hidden group-hover:block absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white rounded-xl px-4 py-3 shadow-xl min-w-[180px] whitespace-nowrap z-50">
                                                                <div className="font-semibold text-base capitalize">
                                                                    {segment.type === "not-tracked"
                                                                        ? "Not Tracked"
                                                                        : segment.type}
                                                                </div>

                                                                <div className="text-sm text-slate-200">
                                                                    {segment.start} - {segment.end}
                                                                </div>

                                                                {segment.type !== "break" && (
                                                                    <div className="text-xs text-slate-400 mt-1">
                                                                        Click to view details
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="timeline-labels flex justify-between mt-1.5 px-1">
                                                    <div className="flex flex-col items-center">
                                                        <div className="h-1 w-[1px] bg-gray-200 dark:bg-gray-700 mb-1"></div>
                                                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">12 AM</span>
                                                    </div>
                                                    <div className="flex flex-col items-center">
                                                        <div className="h-1 w-[1px] bg-gray-200 dark:bg-gray-700 mb-1"></div>
                                                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">6 AM</span>
                                                    </div>
                                                    <div className="flex flex-col items-center">
                                                        <div className="h-1 w-[1px] bg-gray-200 dark:bg-gray-700 mb-1"></div>
                                                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">12 PM</span>
                                                    </div>
                                                    <div className="flex flex-col items-center">
                                                        <div className="h-1 w-[1px] bg-gray-200 dark:bg-gray-700 mb-1"></div>
                                                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">6 PM</span>
                                                    </div>
                                                    <div className="flex flex-col items-center">
                                                        <div className="h-1 w-[1px] bg-gray-200 dark:bg-gray-700 mb-1"> </div>
                                                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">12 AM</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {!isSingleDay && (
                                            <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
                                                {user.dailyData?.map((day) => {

                                                    const dayBuckets = buildThirtyMinuteBuckets(
                                                        day.sessions || [],
                                                        day.date,
                                                        userTimezone
                                                    );

                                                    const workMinutes =
                                                        dayBuckets.reduce(
                                                            (sum, bucket) => sum + bucket.workMinutes,
                                                            0
                                                        );

                                                    const activityPercent =
                                                        (workMinutes / 480) * 100;

                                                    let activityColor = "bg-red-500";

                                                    if (activityPercent >= 75) {
                                                        activityColor = "bg-green-500";
                                                    } else if (activityPercent >= 25) {
                                                        activityColor = "bg-yellow-500";
                                                    } else {
                                                        activityColor = "bg-red-500";
                                                    }

                                                    return (
                                                        <div
                                                            key={day.date}
                                                            className="min-w-[380px] rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1E293B] px-3 py-3 shadow-sm"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <div
                                                                    className={`w-3 h-3 rounded-full ${activityColor}`}
                                                                />
                                                                <h3 className="font-semibold text-sm text-gray-900 dark:text-white">
                                                                    {new Date(day.date).toLocaleDateString("en-US", {
                                                                        month: "short",
                                                                        day: "2-digit",
                                                                        timeZone: userTimezone,
                                                                    })}
                                                                </h3>
                                                            </div>

                                                            <div className="flex items-center justify-between mt-3">

                                                                <div className="text-sm text-slate-700 dark:text-slate-300">
                                                                    Work: {day.workTime}
                                                                </div>

                                                                <div className="text-sm text-slate-700 dark:text-slate-300">
                                                                    Break: {day.breakTime}
                                                                </div>
                                                            </div>
                                                            <div className="mt-3">
                                                                <div className="relative h-3 bg-slate-200 dark:bg-slate-700 rounded-sm overflow-hidden">

                                                                    {dayBuckets.map((bucket, index) => {

                                                                        const left =
                                                                            (bucket.bucketStart / 1440) * 100;

                                                                        const width =
                                                                            ((bucket.bucketEnd - bucket.bucketStart) / 1440) * 100;

                                                                        const total =
                                                                            bucket.workMinutes + bucket.breakMinutes;

                                                                        const workPercent =
                                                                            total > 0
                                                                                ? (bucket.workMinutes / total) * 100
                                                                                : 0;

                                                                        const startHour = Math.floor(bucket.bucketStart / 60);
                                                                        const startMinute = bucket.bucketStart % 60;

                                                                        const endHour = Math.floor(bucket.bucketEnd / 60);
                                                                        const endMinute = bucket.bucketEnd % 60;

                                                                        const startLabel = new Date(
                                                                            2026,
                                                                            0,
                                                                            1,
                                                                            startHour,
                                                                            startMinute
                                                                        ).toLocaleTimeString([], {
                                                                            hour: "2-digit",
                                                                            minute: "2-digit",
                                                                        });

                                                                        const endLabel = new Date(
                                                                            2026,
                                                                            0,
                                                                            1,
                                                                            endHour,
                                                                            endMinute
                                                                        ).toLocaleTimeString([], {
                                                                            hour: "2-digit",
                                                                            minute: "2-digit",
                                                                        });

                                                                        return (
                                                                            <div
                                                                                key={index}
                                                                                className="group absolute top-0 h-full cursor-pointer"
                                                                                style={{
                                                                                    left: `${left}%`,
                                                                                    width: `${width}%`,
                                                                                }}
                                                                            >
                                                                                <div
                                                                                    className="h-full"
                                                                                    style={{
                                                                                        background: `linear-gradient(
                        to right,
                        #22c55e 0%,
                        #22c55e ${workPercent}%,
                        #a3e635 ${workPercent}%,
                        #a3e635 100%
                    )`,
                                                                                    }}
                                                                                />

                                                                                <div className="hidden group-hover:block absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50">
                                                                                    <div className="flex gap-1 bg-slate-800 dark:bg-slate-700 border border-transparent dark:border-slate-600 text-white px-2.5 py-1.5 rounded-lg text-xs shadow-lg whitespace-nowrap">
                                                                                        <div className="font-medium">
                                                                                            {startLabel} - {endLabel} |
                                                                                        </div>

                                                                                        <div className="text-xs font-semibold">
                                                                                            {bucket.workMinutes > 0 && (
                                                                                                <span>
                                                                                                    Work: {bucket.workMinutes}m
                                                                                                </span>
                                                                                            )}

                                                                                            {bucket.workMinutes > 0 &&
                                                                                                bucket.breakMinutes > 0 && (
                                                                                                    <span> • </span>
                                                                                                )}

                                                                                            {bucket.breakMinutes > 0 && (
                                                                                                <span>
                                                                                                    Break: {bucket.breakMinutes}m
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}

                                                                </div>
                                                            </div>

                                                            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-2">
                                                                <span>12:00AM</span>
                                                                <span>9:00AM</span>
                                                                <span>6:00PM</span>
                                                                <span>11:30PM</span>
                                                            </div>
                                                        </div>
                                                    )
                                                }
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <SessionDetailsModal
                open={showDetailsModal}
                onClose={() => setShowDetailsModal(false)}
                detailsData={detailsData}
                timezone={detailsTimezone}
            />

            <ReportsModal
                open={showReports}
                onClose={() => setShowReports(false)}
            />

        </>
    );
}