"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface RootErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export default function RootError({ error, reset }: RootErrorProps) {
    useEffect(() => {
        console.error("Root application error boundary caught:", error);
    }, [error]);

    return (
        <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center bg-gray-50">
            <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm border border-gray-200">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600 mb-4">
                    <AlertTriangle className="h-7 w-7" aria-hidden="true" />
                </div>

                <h2 className="text-xl font-bold text-gray-900 mb-2">
                    Application encountered an error
                </h2>

                <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                    We encountered an unexpected problem. Please try reloading the page.
                </p>

                <div className="flex justify-center">
                    <button
                        type="button"
                        onClick={() => reset()}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Reload
                    </button>
                </div>
            </div>
        </div>
    );
}
