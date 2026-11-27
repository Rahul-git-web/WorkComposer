"use client";

import { useState } from "react";
import { format } from "date-fns";
import { useApiLogs } from "../hooks/useApiLogs";
import DateRangePicker from "./DateRangePicker";

export default function ApiLogs() {
    const [dateRange, setDateRange] = useState({
        startDate: "",
        endDate: "",
    });
    const [page, setPage] = useState(1);

    const { logs, loading, pagination } = useApiLogs(
        dateRange.startDate,
        dateRange.endDate,
        page
    );


    const startItem =
        pagination.total === 0
            ? 0
            : (pagination.page - 1) * pagination.limit + 1;

    const endItem = Math.min(
        pagination.page * pagination.limit,
        pagination.total
    );

    return (
        <div className="flex flex-col gap-6">
            {/* Filters */}
            <div className="w-full max-w-md">
                <DateRangePicker
                    value={{
                        from: dateRange.startDate
                            ? new Date(dateRange.startDate)
                            : undefined,
                        to: dateRange.endDate
                            ? new Date(dateRange.endDate)
                            : undefined,
                    }}
                    onChange={(range) => {
                        setPage(1);

                        setDateRange({
                            startDate: range?.from
                                ? format(range.from, "yyyy-MM-dd")
                                : "",
                            endDate: range?.to
                                ? format(range.to, "yyyy-MM-dd")
                                : "",
                        });
                    }}
                />
            </div>

            {loading ? (
                <div className="flex h-72 items-center justify-center">
                    <p className="text-gray-500 dark:text-slate-400">Loading...</p>
                </div>
            ) : !logs.length ? (
                <div className="flex h-72 items-center justify-center rounded-xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A]">
                    <p className="text-lg text-gray-500 dark:text-slate-400">
                        You have no API Logs yet.
                    </p>
                </div>
            ) : (
                <>
                    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A]">
                        <table className="min-w-full">
                            <thead className="bg-gray-50 dark:bg-[#1E293B] border-b border-gray-200 dark:border-[#22324D]">
                                <tr>
                                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-slate-300">
                                        API Key
                                    </th>

                                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-slate-300">
                                        Method
                                    </th>

                                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-slate-300">
                                        Endpoint
                                    </th>

                                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-slate-300">
                                        Status
                                    </th>

                                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-slate-300">
                                        Response
                                    </th>

                                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-slate-300">
                                        Time
                                    </th>
                                </tr>
                            </thead>


                    <tbody>
                        {logs.map((log) => (
                            <tr
                                key={log.id}
                                className="border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/40"
                            >
                                <td className="px-6 py-4 text-gray-900 dark:text-slate-200">
                                    {log.apiKey}
                                </td>

                                <td className="px-6 py-4">
                                    <span
                                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${log.method === "GET"
                                            ? "bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300"
                                            : log.method === "POST"
                                                ? "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300"
                                                : log.method === "PATCH"
                                                    ? "bg-yellow-100 dark:bg-yellow-950/50 text-yellow-700 dark:text-yellow-300"
                                                    : log.method === "DELETE"
                                                        ? "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300"
                                                        : "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300"
                                            }`}
                                    >
                                        {log.method}
                                    </span>
                                </td>

                                <td className="px-6 py-4">
                                    <code className="rounded bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-slate-200 px-2 py-1 text-sm">
                                        {log.endpoint}
                                    </code>
                                </td>

                                <td className="px-6 py-4">
                                    <span
                                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${log.statusCode >= 200 && log.statusCode < 300
                                            ? "bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300"
                                            : log.statusCode >= 300 && log.statusCode < 400
                                                ? "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300"
                                                : log.statusCode >= 400 && log.statusCode < 500
                                                    ? "bg-yellow-100 dark:bg-yellow-950/50 text-yellow-700 dark:text-yellow-300"
                                                    : "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300"
                                            }`}
                                    >
                                        {log.statusCode}
                                    </span>
                                </td>

                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-slate-200">
                                    {log.responseTime} ms
                                </td>

                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-slate-400">
                                    {new Date(log.createdAt).toLocaleString("en-IN", {
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="mt-6 flex items-center justify-between">
                <p className="text-sm text-gray-600 dark:text-slate-400">
                    Showing {startItem}-{endItem} of {pagination.total} API logs
                </p>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                        disabled={page === 1}
                        className="rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Previous
                    </button>

                    <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
                        Page {pagination.page} of {pagination.totalPages}
                    </span>

                    <button
                        onClick={() =>
                            setPage((prev) =>
                                Math.min(prev + 1, pagination.totalPages)
                            )
                        }
                        disabled={page === pagination.totalPages}
                        className="rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
            </div>
            </>
          )}
        </div>
    );
}