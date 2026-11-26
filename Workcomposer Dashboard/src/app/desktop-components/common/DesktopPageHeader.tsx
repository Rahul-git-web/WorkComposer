"use client";

import { HiOutlineEnvelopeOpen } from "react-icons/hi2";
import { HiOutlineInboxStack } from "react-icons/hi2";
import { Menu } from 'lucide-react';
import { useDesktop } from "@/context/DesktopContext";
import { useEffect, useState } from "react";
import API from "@/api";
import ReportsModal from "@/app/dashboard/time-tracking/attendance/reports/ReportsModal";
import NotificationBell from "@/components/notifications/NotificationBell";


// WORKCOMPOSER-118: Consolidated Desktop ThemeSelector to DashboardPage only (removed from DesktopPageHeader)

export default function DesktopPageHeader() {

    const {
        activePage,
        setActivePage,
        moduleSidebarOpen,
        setModuleSidebarOpen,
    } = useDesktop();

    const [pendingCount, setPendingCount] = useState(0);
    const [reportsOpen, setReportsOpen] = useState(false);

    useEffect(() => {
        let mounted = true;
        const load = () => {
            API.get("/manual-time-requests/count")
                .then(({ data }) => {
                    if (mounted) setPendingCount(data.count);
                })
                .catch((err) => console.error(err));
        };

        load();

        const interval = setInterval(load, 10000);
        window.addEventListener("refreshInboxCount", load);

        return () => {
            mounted = false;
            clearInterval(interval);
            window.removeEventListener("refreshInboxCount", load);
        };
    }, []);


    return (
        <div className="fixed top-16 left-[78px] xl:left-[366px] right-0 z-30 flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-[#263852] bg-white dark:bg-[#162742] transition-colors duration-200">

            <button
                onClick={() =>
                    setModuleSidebarOpen(!moduleSidebarOpen)
                }
                className="hidden max-xl:flex items-center justify-center rounded-md p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10"
                title="Open menu"
            >
                <Menu className="h-6 w-6" />
            </button>


            <div className="ml-auto flex items-center gap-4">
                <NotificationBell />

                <div className="relative">
                    <button
                        onClick={() =>
                            setActivePage(
                                activePage === "inbox"
                                    ? "dashboard"
                                    : "inbox"
                            )
                        }
                        className={`transition-colors ${activePage === "inbox"
                            ? "text-indigo-600 dark:text-indigo-400"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                            }`}
                        title="Inbox"
                    >
                        <HiOutlineEnvelopeOpen className="w-6 h-6" />
                    </button>

                    {pendingCount > 0 && (
                        <span
                            className="
                absolute
                -top-2
                -right-2
                min-w-[18px]
                h-[18px]
                px-1
                rounded-full
                bg-red-600
                text-white
                text-[10px]
                font-bold
                flex
                items-center
                justify-center
                pointer-events-none
            "
                        >
                            {pendingCount}
                        </span>
                    )}
                </div>

                <button
                    onClick={() => setReportsOpen(true)}
                    className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                    title="Reports"
                >
                    <HiOutlineInboxStack className="w-6 h-6" />
                </button>
            </div>

            <ReportsModal
                open={reportsOpen}
                onClose={() => setReportsOpen(false)}
            />
        </div>
    );
}