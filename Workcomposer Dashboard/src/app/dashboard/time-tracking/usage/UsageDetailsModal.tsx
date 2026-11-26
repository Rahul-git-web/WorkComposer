"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import API from "@/api";
import { CiViewColumn } from "react-icons/ci";
import { HiMiniInformationCircle } from "react-icons/hi2";
import { CiImport } from "react-icons/ci";
import { X } from 'lucide-react';



type Props = {
    open: boolean;
    onClose: () => void;
    user: any;
    reportRange: {
        type: string;
        startDate: Date;
        endDate: Date;
    };
};

export default function UsageDetailsModal({
    open,
    onClose,
    user,
    reportRange,
}: Props) {

    const [logs, setLogs] = useState<any[]>([]);
    const modalRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open || !user?._id) return;
        let mounted = true;

        const load = () => {
            const startDate = reportRange.startDate.toISOString().split("T")[0];
            const endDate = reportRange.endDate.toISOString().split("T")[0];

            API.get(`/usage/details/${user._id}?startDate=${startDate}&endDate=${endDate}`)
                .then(({ data }) => {
                    if (mounted) setLogs(data);
                })
                .catch((err) => console.error(err));
        };

        load();

        const interval = setInterval(load, 10000);

        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, [open, user, reportRange]);

    useEffect(() => {

        if (!open) return;

        const handleClickOutside = (e: MouseEvent) => {

            if (
                modalRef.current &&
                !modalRef.current.contains(e.target as Node)
            ) {
                onClose();
            }

        };

        document.addEventListener(
            "mousedown",
            handleClickOutside
        );

        return () =>
            document.removeEventListener(
                "mousedown",
                handleClickOutside
            );

    }, [open, onClose]);

    useEffect(() => {

        if (!open) return;

        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = "auto";
        };

    }, [open]);

    const formatDuration = (seconds: number) => {

        const hours = Math.floor(seconds / 3600);

        const minutes = Math.floor((seconds % 3600) / 60);

        if (hours === 0 && minutes === 0) {
            return "<1m";
        }

        return `${hours}h ${minutes}m`;
    };

    const exportCSV = () => {

        if (logs.length === 0) return;

        const headers = [
            "App",
            "Window Title",
            "Start Time",
            "End Time",
            "Duration",
        ];

        const rows = logs.map((log) => [

            log.appName,

            `"${log.windowTitle || ""}"`,

            new Date(log.startTime).toLocaleString(),

            new Date(log.endTime).toLocaleString(),

            formatDuration(log.duration),

        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map((row) => row.join(",")),
        ].join("\n");

        const blob = new Blob(
            [csvContent],
            {
                type: "text/csv;charset=utf-8;",
            }
        );

        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");

        link.href = url;

        link.download =
            `${user?.name
                ?.replace(/\s+/g, "-")
                .toLowerCase()}-usage-log.csv`;

        document.body.appendChild(link);

        link.click();

        document.body.removeChild(link);

        URL.revokeObjectURL(url);
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-md">

            <div
                ref={modalRef}
                className="bg-white dark:bg-slate-800 border border-transparent dark:border-slate-700 w-[95%] max-w-6xl max-h-[90vh] rounded-xl shadow-xl flex flex-col"
            >

                <div className="flex items-center justify-between p-6 border-b border-gray-300 dark:border-slate-700">
                    <h2 className="flex text-lg font-semibold text-gray-700 dark:text-white">
                        <HiMiniInformationCircle className="h-7 w-7 text-blue-600 dark:text-blue-400 mr-4" />
                        Detailed App Usage Log for{" "}{user?.name}
                    </h2>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={exportCSV}
                            title="Export usage data"
                            className="inline-flex cursor-pointer items-center font-semibold px-4 py-2 text-sm font-medium rounded-md shadow-sm focus:outline-none transition bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-md transition-shadow duration-300 px-4 py-2 rounded-lg text-sm font-medium">
                            <CiImport className="w-5 h-5 mr-2" />
                            Export
                        </button>
                        <button
                            onClick={onClose}
                            title="Close modal"
                            className="rounded-full p-2.5 text-gray-400 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-600 dark:hover:text-slate-200 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        >
                            <X className="h-6 w-6" />
                        </button>
                    </div>

                </div>

                <div className="p-6 overflow-y-auto flex-1">

                    {logs.length === 0 ? (

                        <div className="p-8">
                            <div className="text-center py-20 bg-white dark:bg-slate-900/60 rounded-2xl border border-gray-100 dark:border-slate-700 max-w-2xl mx-auto shadow-sm">
                                <CiViewColumn className="h-20 w-20 mx-auto text-gray-200 dark:text-slate-700 mb-6" />
                                <h3 className="text-xl font-medium text-gray-800 dark:text-white mb-3">No app usage data available</h3>
                                <p className="text-sm text-gray-500 dark:text-slate-400 max-w-md mx-auto">There is no detailed app usage data for this time period.</p>
                            </div>
                        </div>

                    ) : (

                        <div className="overflow-x-auto">

                            <table className="w-full text-sm">

                                <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-slate-900/60">
                                    <tr className="text-xs text-gray-500 dark:text-slate-400 border-b border-gray-300 dark:border-slate-700">
                                        <th className="px-4 py-3 text-left">
                                            App
                                        </th>

                                        <th className="px-4 py-3 text-left">
                                            Window Title
                                        </th>

                                        <th className="px-4 py-3 text-left">
                                            Start Time
                                        </th>

                                        <th className="px-4 py-3 text-left">
                                            End Time
                                        </th>

                                        <th className="px-4 py-3 text-left">
                                            Duration
                                        </th>
                                    </tr>
                                </thead>

                                <tbody>

                                    {logs.map((log) => (

                                        <tr
                                            key={log._id}
                                            className="border-b border-gray-100 dark:border-slate-700/60 hover:bg-gray-50 dark:hover:bg-slate-700/40 h-13"
                                        >

                                            <td className="px-4 py-3 w-[220px] whitespace-nowrap font-semibold text-gray-800 dark:text-white align-top">
                                                {log.appName}
                                            </td>

                                            <td className="px-4 py-3 w-[45%] text-gray-600 dark:text-slate-300 align-top">
                                                <div className="break-words">
                                                    {log.windowTitle}
                                                </div>
                                            </td>

                                            <td className="text-sm text-gray-600 dark:text-slate-300">
                                                {new Date(log.startTime).toLocaleTimeString(
                                                    "en-US",
                                                    {
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                        second: "2-digit",
                                                    }
                                                )}
                                            </td>

                                            <td className="text-sm text-gray-600 dark:text-slate-300">
                                                {new Date(log.endTime).toLocaleTimeString(
                                                    "en-US",
                                                    {
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                        second: "2-digit",
                                                    }
                                                )}
                                            </td>

                                            <td className="px-4 py-3 text-gray-600 dark:text-slate-300">
                                                {formatDuration(log.duration)}
                                            </td>

                                        </tr>

                                    ))}

                                </tbody>

                            </table>

                        </div>

                    )}

                </div>

            </div>

        </div>
    );
}