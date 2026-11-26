"use client";

import { Settings2 } from "lucide-react";

type Day = {
    day: string;
    enabled: boolean;
    startTime: string;
    endTime: string;
};

type Props = {
    user: any;
    schedule: Day[];
    onConfigure: () => void;
    hasCustomSettings: boolean;
    onReset: () => void;
};

export default function UserShiftCard({
    user,
    schedule,
    onConfigure,
    hasCustomSettings,
    onReset,
}: Props) {
return (
    <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 px-6 py-6 hover:bg-gray-50 dark:hover:bg-slate-800/40">

        {/* Left */}
        <div className="flex items-center gap-4">

            {user?.avatar ? (
                <img
                    src={user.avatar}
                    alt={`${user.firstName} ${user.lastName}`}
                    className="h-10 w-10 rounded-full object-cover"
                />
            ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 text-sm font-semibold text-white">
                    {`${user.firstName?.charAt(0) ?? ""}${user.lastName?.charAt(0) ?? ""}`.toUpperCase()}
                </div>
            )}

            <div>
                <h3 className="font-semibold text-blue-700 dark:text-blue-400">
                    {user.firstName} {user.lastName}
                </h3>

                {hasCustomSettings && (
                    <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300">
                        <span className="mr-1 h-1.5 w-1.5 rounded-full bg-indigo-600"></span>
                        Custom setting
                    </div>
                )}

            </div>

        </div>

        {/* Center */}
        <div className="flex flex-1 items-center justify-center gap-6">

            <div className="w-full max-w-[450px] rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1E293B] p-2 shadow-md">

                {/* Header */}
                <div className="mb-4 flex items-center justify-between">

                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Weekly Schedule
                    </h3>

                    <button
                        onClick={onConfigure}
                        className="flex gap-2 rounded-md border border-indigo-300 dark:border-indigo-800 bg-indigo-100 dark:bg-indigo-950/60 px-5 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 transition hover:bg-indigo-50 dark:hover:bg-indigo-900/50"
                    >
                        <Settings2 size={16} />
                        Configure Shifts
                    </button>

                </div>

                {/* Schedule */}
                <div className="flex gap-2">

                    {schedule.map((day) => (
                        <div
                            key={day.day}
                            className={`flex h-10 w-22 flex-col items-center justify-center rounded-sm border ${day.enabled
                                ? "border-emerald-600 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40"
                                : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-800"
                                }`}
                        >
                            <div className="text-[11px] font-semibold uppercase text-gray-700 dark:text-gray-300">
                                {day.day.slice(0, 3)}
                            </div>

                            <div
                                className={`mt-1 text-[11px] font-medium ${day.enabled
                                    ? "text-emerald-700 dark:text-emerald-400"
                                    : "text-gray-500 dark:text-gray-400"
                                    }`}
                            >
                                {day.enabled
                                    ? `${day.startTime.slice(0, 2)}-${day.endTime.slice(0, 2)}`
                                    : "Off"}
                            </div>
                        </div>
                    ))}

                </div>

            </div>

        </div>

        {hasCustomSettings && (
            <div className="flex w-[90px] justify-end">
                <button
                    onClick={onReset}
                    className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm transition hover:bg-gray-50 dark:hover:bg-slate-700"
                >
                    Reset
                </button>
            </div>
        )}
    </div>
);
}