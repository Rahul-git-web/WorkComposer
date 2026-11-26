"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface DashboardErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
    useEffect(() => {
        // Log the error to console for debugging without exposing secrets to the UI
        console.error("Dashboard error boundary caught:", error);
    }, [error]);

    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
            <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm border border-gray-200">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600 mb-4">
                    <AlertTriangle className="h-7 w-7" aria-hidden="true" />
                </div>

                <h2 className="text-xl font-bold text-gray-900 mb-2">
                    Something went wrong
                </h2>

                <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                    An unexpected error occurred while loading this section of the dashboard. Your other tabs and timer sessions remain active.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                        type="button"
                        onClick={() => reset()}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Try again
                    </button>

                    <Link
                        href="/dashboard/time-tracking/home"
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Home
                    </Link>
                </div>
            </div>
        </div>
    );
}
