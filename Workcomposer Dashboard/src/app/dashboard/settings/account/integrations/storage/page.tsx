"use client";

import Image from "next/image";
import { ArrowLeft, Cloud, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptionalDesktop } from "@/context/DesktopContext";

export default function ExternalStoragePage() {
    const router = useRouter();
    const desktop = useOptionalDesktop();

    const handleBackToIntegrations = () => {
        if (desktop) {
            desktop.setActiveSetting("integrations");
            return;
        }

        router.push("/dashboard/settings/account/integrations");
    };

    return (
        <div className="w-full max-w-6xl mx-auto px-3 sm:px-5 lg:px-6 py-3 sm:py-5">
            {/* Back */}
            <button
                type="button"
                onClick={handleBackToIntegrations}
                className="mb-6 sm:mb-8 inline-flex items-center gap-2 text-sm sm:text-base text-gray-500 dark:text-gray-400 transition hover:text-gray-900 dark:hover:text-white"
            >
                <ArrowLeft size={18} />
                <span>Back to Integrations</span>
            </button>

            {/* Header */}
            <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50">
                    <Cloud className="h-7 w-7 text-blue-600 dark:text-blue-400" />
                </div>

                <div>
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">
                        External Cloud Storage
                    </h1>

                    <p className="mt-1 text-sm sm:text-base text-gray-500 dark:text-gray-400">
                        Connect custom cloud storage providers for screenshots and exports
                    </p>
                </div>
            </div>

            {/* Card */}
            <div className="overflow-hidden rounded-2xl sm:rounded-3xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-8 sm:p-12 text-center shadow-sm">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                    <ShieldCheck size={32} />
                </div>

                <h2 className="mt-6 text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                    External Storage Integration
                </h2>

                <p className="mx-auto mt-3 max-w-lg text-sm sm:text-base text-gray-500 dark:text-gray-400">
                    Custom Amazon Web Services (AWS S3), Google Cloud Storage, and Microsoft Azure Blob storage integrations are scheduled for an upcoming release.
                </p>

                <div className="mt-8 inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-950/40 px-4 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    Coming Soon
                </div>
            </div>
        </div>
    );
}
