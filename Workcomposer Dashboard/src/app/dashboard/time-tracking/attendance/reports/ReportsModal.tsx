"use client";

import { useEffect, useRef, useState } from "react";
import API from "@/api";
import { Loader2 } from "lucide-react";
import { BarChart3, CircleCheck, Download } from "lucide-react";
import { AiOutlineFileText } from "react-icons/ai";

type Props = {
    open: boolean;
    onClose: () => void;

    onGenerate?: () => Promise<void>;
    autoGenerate?: boolean;
};

export default function ReportsModal({
    open,
    onClose,
    onGenerate,
    autoGenerate = false,
}: Props) {

    const [reports, setReports] = useState<any[]>([]);
    const hasGeneratedRef = useRef(false);


    const fetchReports = async () => {
        try {
            const { data } = await API.get(
                "/reports"
            );
            setReports(data);
        } catch (err) {
            console.error(err);

        }
    };

    useEffect(() => {
        if (!open) return;
        let mounted = true;

        const load = () => {
            API.get("/reports")
                .then(({ data }) => {
                    if (mounted) setReports(data);
                })
                .catch((err) => console.error(err));
        };

        load();

        const interval = setInterval(load, 3000);

        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, [open]);

    useEffect(() => {
        if (!open) {
            hasGeneratedRef.current = false;
            return;
        }

        if (!autoGenerate) return;

        if (!onGenerate) return;

        if (hasGeneratedRef.current) return;

        hasGeneratedRef.current = true;

        onGenerate();
    }, [open, autoGenerate, onGenerate]);

    if (!open) return null;

    const latestCompletedReport = reports.find(
        (report) => report.status === "done"
    );

    const processingReport = reports.find(
        (report) => report.status === "processing"
    );

    const getReportName = (type: string) => {
        switch (type) {
            case "attendance-overview":
                return "Attendance Overview";

            case "attendance-detailed":
                return "Attendance Detailed";

            case "productivity":
                return "Productivity Report";

            case "usage":
                return "Web & App Usage Report";

            case "project-user":
                return "Project User Report";

            case "project":
                return "Project Report";

            case "manual-work-time":
                return "Manual Work Time Report";

            case "manual-break-time":
                return "Manual Break Time Report";

            case "removed-time":
                return "Removed Time Report";

            default:
                return type;
        }
    };

    return (
        <>
            <div
                className="fixed inset-0 z-[99999] bg-black/40 backdrop-blur-sm overflow-y-auto p-4"
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget) {
                        onClose();
                    }
                }}
            >
                <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl w-full max-w-6xl max-h-[90vh] overflow-y-auto p-6 shadow-xl mx-auto mt-10">

                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                            Background Tasks and Reports
                            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                                {reports.length} Reports
                            </p>
                        </h2>

                        <button
                            onClick={onClose}
                            className="text-gray-500 dark:text-slate-400 hover:text-black dark:hover:text-white p-1 rounded"
                        >
                            ✕
                        </button>
                    </div>

                    {processingReport ? (

                        <div className="mb-6 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 p-5">

                            <div className="flex items-center gap-3">

                                <Loader2 className="h-5 w-5 text-amber-600 dark:text-amber-400 animate-spin" />

                                <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-300">
                                    Generating Report...
                                </h3>

                            </div>

                            <p className="text-sm text-amber-700 dark:text-amber-400 mt-2">
                                Your report is currently being generated.
                            </p>

                        </div>

                    ) : latestCompletedReport ? (

                        <div className="mb-6 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/60 p-5">

                            <div className="flex items-center justify-between">

                                <div>

                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                                        Latest Report Ready
                                    </h3>

                                    <div className="mt-1">

                                        <p className="text-sm text-gray-700 dark:text-slate-300 font-medium">

                                            {getReportName(latestCompletedReport.type)}
                                        </p>

                                        {latestCompletedReport.startDate &&
                                            latestCompletedReport.endDate && (
                                                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">

                                                    {latestCompletedReport.startDate ===
                                                        latestCompletedReport.endDate ? (

                                                        new Date(
                                                            latestCompletedReport.startDate
                                                        ).toLocaleDateString("en-US", {
                                                            month: "short",
                                                            day: "numeric",
                                                            year: "numeric",
                                                        })

                                                    ) : (

                                                        <>
                                                            {new Date(
                                                                latestCompletedReport.startDate
                                                            ).toLocaleDateString("en-US", {
                                                                month: "short",
                                                                day: "numeric",
                                                                year: "numeric",
                                                            })}

                                                            {" → "}

                                                            {new Date(
                                                                latestCompletedReport.endDate
                                                            ).toLocaleDateString("en-US", {
                                                                month: "short",
                                                                day: "numeric",
                                                                year: "numeric",
                                                            })}
                                                        </>

                                                    )}

                                                </p>
                                            )}

                                    </div>

                                </div>

                                <a
                                    href={`${process.env.NEXT_PUBLIC_API_ORIGIN}${latestCompletedReport.fileUrl}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
                                >
                                    Download
                                </a>

                            </div>

                        </div>

                    ) : null}

                    <div className="overflow-hidden rounded-lg border border-gray-300 dark:border-slate-700">

                        <div className="grid grid-cols-4 bg-gray-50 dark:bg-slate-900 px-6 py-3 font-semibold text-gray-700 dark:text-slate-200">
                            <div>Title</div>
                            <div>Status</div>
                            <div>Generated</div>
                            <div>Actions</div>
                        </div>

                        {reports.map((report: any) => (
                            <div
                                key={report._id}
                                className="grid grid-cols-4 items-center border-t border-gray-100 dark:border-slate-700 px-6 py-3 text-slate-800 dark:text-slate-200"
                            >
                                <div>
                                    <div className="font-medium text-sm flex gap-1">
                                        <div className="mt-1 text-gray-400 dark:text-slate-400">
                                            <AiOutlineFileText className="w-3.5 h-3.5" />
                                        </div>
                                        {getReportName(report.type)}
                                    </div>

                                </div>

                                <div>
                                    {report.status === "done" ? (
                                        <span className="flex text-green-600 dark:text-green-400 font-medium text-sm gap-1">
                                            <div className="mt-1">
                                                <CircleCheck className="w-3.5 h-3.5" />
                                            </div>
                                            Done
                                        </span>
                                    ) : report.status === "failed" ? (
                                        <span className="flex text-red-600 dark:text-red-400 font-medium text-sm gap-1">
                                            <span>✕</span>
                                            Rejected
                                        </span>
                                    ) : (
                                        <span className="text-amber-600 dark:text-amber-400 font-medium text-sm">
                                            ⏳ Processing
                                        </span>
                                    )}
                                </div>

                                <div className="text-sm text-slate-700 dark:text-slate-300">
                                    {new Date(report.createdAt).toLocaleDateString(
                                        "en-US",
                                        {
                                            month: "short",
                                            day: "numeric",
                                            year: "numeric",
                                        }
                                    )}
                                </div>

                                <div className="flex gap-2">
                                    {report.status === "done" && (
                                        <a
                                            href={`${process.env.NEXT_PUBLIC_API_ORIGIN}${report.fileUrl}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex bg-indigo-600 text-white px-3 py-1 rounded-md text-sm gap-1 hover:bg-indigo-700 transition"
                                        >
                                            <div className="mt-1">
                                                <Download className="w-3.5 h-3.5" />
                                            </div>
                                            Download
                                        </a>
                                    )}

                                    <button
                                        onClick={async () => {
                                            try {

                                                await API.delete(
                                                    `/reports/${report._id}`
                                                );

                                                await fetchReports();

                                            } catch (err) {
                                               console.error(err);
                                            }
                                        }}
                                        className="bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-600 px-3 py-1 rounded-md text-sm cursor-pointer transition"
                                    >
                                        Delete
                                    </button>

                                </div>
                            </div>
                        ))}
                    </div>

                </div>
            </div>
        </>
    )
}



