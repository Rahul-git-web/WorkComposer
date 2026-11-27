"use client";

import { useState } from "react";
import Link from "next/link";
import { Code2, FileText, BookOpen } from "lucide-react";
import ApiKeys from "./components/ApiKeys";
import ApiLogs from "./components/ApiLogs";

type Tab = "keys" | "logs";

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

                <Link
                    href="/developer-api/docs/api-quickstart"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 pb-4 text-[14px] font-medium transition text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white"
                >
                    <BookOpen size={16} />
                    API Documentation
                </Link>
            </div>

            {/* Card */}
            <div className="mt-8 rounded-3xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-10 shadow-sm">
                {activeTab === "keys" && <ApiKeys />}

                {activeTab === "logs" && <ApiLogs />}
            </div>
        </div>
    );
}
