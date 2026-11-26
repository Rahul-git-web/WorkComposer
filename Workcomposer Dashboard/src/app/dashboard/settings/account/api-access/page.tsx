"use client";

import { useState } from "react";
import { Code2, FileText, BookOpen } from "lucide-react";
import ApiKeys from "./components/ApiKeys";
import ApiLogs from "./components/ApiLogs";

type Tab = "keys" | "logs" | "docs";

export default function ApiAccessPage() {
    const [activeTab, setActiveTab] = useState<Tab>("keys");

    return (
        <div className="w-full p-6">
            {/* Tabs */}
            <div className="flex items-center gap-8 border-b border-gray-200 dark:border-gray-800">
                <button
                    onClick={() => setActiveTab("keys")}
                    className={`flex items-center gap-2 pb-4 text-[14px] font-medium transition ${activeTab === "keys"
                            ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                            : "text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white"
                        }`}
                >
                    <Code2 size={16} />
                    API Keys
                </button>

                <button
                    onClick={() => setActiveTab("logs")}
                    className={`flex items-center gap-2 pb-4 text-[14px] font-medium transition ${activeTab === "logs"
                            ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                            : "text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white"
                        }`}
                >
                    <FileText size={16} />
                    API Logs
                </button>

                <button
                    onClick={() => setActiveTab("docs")}
                    className={`flex items-center gap-2 pb-4 text-[14px] font-medium transition ${activeTab === "docs"
                            ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                            : "text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white"
                        }`}
                >
                    <BookOpen size={16} />
                    API Documentation
                </button>
            </div>

            {/* Card */}
            <div className="mt-8 rounded-3xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-10 shadow-sm">
                {activeTab === "keys" && (
                    <ApiKeys onOpenDocs={() => setActiveTab("docs")} />
                )}

                {activeTab === "logs" && <ApiLogs />}

                {activeTab === "docs" && (
                    <div className="space-y-6 text-sm text-gray-700 dark:text-gray-300">
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                WorkComposer REST API Documentation
                            </h2>
                            <p className="mt-1 text-gray-500 dark:text-gray-400">
                                Authenticate programmatic requests using your organization API key generated from the API Keys tab.
                            </p>
                        </div>

                        <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/60 p-4 space-y-2">
                            <p className="font-semibold text-gray-900 dark:text-white">
                                Authentication Header
                            </p>
                            <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
{`Authorization: Bearer <YOUR_API_KEY>
# or
x-api-key: <YOUR_API_KEY>`}
                            </pre>
                        </div>

                        <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/60 p-4 space-y-2">
                            <p className="font-semibold text-gray-900 dark:text-white">
                                Common Endpoints
                            </p>
                            <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm">
                                <li><code>GET /api/users</code> — List organization users</li>
                                <li><code>GET /api/projects</code> — List organization projects and tasks</li>
                                <li><code>GET /api/reports</code> — Fetch generated tracking and productivity reports</li>
                                <li><code>GET /api/attendance</code> — Fetch attendance and daily time summaries</li>
                            </ul>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
