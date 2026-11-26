"use client";

import { usePathname, useRouter } from "next/navigation";
import { useDashboard } from "@/context/DashboardContext";
import { isTeamReportAccess } from "@/utils/reportAccess";
import {
    HiUsers,
    HiOutlineClipboardDocumentList,
    HiHome,
} from "react-icons/hi2";

import {
    Camera,
    Clock3,
    Globe,
    MapPin,
} from "lucide-react";

import { BsBarChart } from "react-icons/bs";
import { useState } from "react";
import DesktopModuleHeader from "../common/DesktopModuleHeader";
import useDesktopNavigation from "@/hooks/useDesktopNavigation";

type ReportsSidebarProps = {
    activeReport?: string;
    setActiveReport?: React.Dispatch<React.SetStateAction<string>>;
    desktop?: boolean;
};
export default function ReportsSidebar({
    activeReport,
    setActiveReport,
    desktop = false,
}: ReportsSidebarProps) {

    const [isOpen, setIsOpen] = useState(false);

    const { closeSidebar } = useDesktopNavigation(desktop);

    const pathname = usePathname();

    const router = useRouter();

    const { user } = useDashboard();

    const isTeamReport = isTeamReportAccess(user);

    const overviewLabel = isTeamReport ? "Team Report" : "My Report";

    const canViewScreenshots =
        user?.screenshotAccess !== "none";

    const getClass = (path: string, reportName?: string) => {
        const isActive = desktop ? activeReport === reportName : pathname === path;
        return `group flex items-center gap-x-3 p-2 text-sm font-semibold -mx-3 px-3 transition-all duration-200 ease-in-out ${
            isActive
                ? "router-link-active router-link-exact-active bg-linear-to-r from-indigo-900/70 to-gray-800 shadow-md text-white border-l-3 border-indigo-500"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 border-none"
        }`;
    };

    const navigate = (report: string, path: string) => {

        closeSidebar();

        if (setActiveReport) {
            setActiveReport(report);
            return;
        }

        router.push(path);
    };

    return (
        <div className="space-y-1">

            <>
                {desktop && (
                    <DesktopModuleHeader />
                )}

                {/* Home */}
                <a
                    href="/dashboard/time-tracking/home"
                    onClick={(e) => {
                        e.preventDefault();
                        setIsOpen(false);
                        navigate("home", "/dashboard/time-tracking/home");
                    }}
                    className={getClass("/dashboard/time-tracking/home", "home")}
                >
                    <div className="shrink-0 flex items-center justify-center w-8 h-8">
                        <HiHome className="h-5 w-5 text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white" />
                    </div>
                    <span className="text-sm font-bold">Home</span>
                </a>

                {/* My Report / Team Report */}
                <a
                    href="/dashboard/time-tracking/overview"
                    onClick={(e) => {
                        e.preventDefault();
                        setIsOpen(false);
                        navigate("overview", "/dashboard/time-tracking/overview");
                    }}
                    className={getClass("/dashboard/time-tracking/overview", "overview")}
                >
                    <div className="shrink-0 flex items-center justify-center w-8 h-8">
                        <HiUsers className="h-5 w-5 text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white" />
                    </div>
                    <span className="text-sm font-bold">{overviewLabel}</span>
                </a>

                {/* Screenshots */}
                {canViewScreenshots && (
                    <a
                        href="/dashboard/time-tracking/screenshots"
                        onClick={(e) => {
                            e.preventDefault();
                            setIsOpen(false);
                            navigate("screenshots", "/dashboard/time-tracking/screenshots")
                        }}
                        className={getClass("/dashboard/time-tracking/screenshots", "screenshots")}
                    >
                        <div className="shrink-0 flex items-center justify-center w-8 h-8">
                            <Camera className="h-5 w-5 text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white" />
                        </div>
                        <span className="text-sm font-bold">Screenshots</span>
                    </a>
                )}

                {/* Attendance */}
                <a
                    href="/dashboard/time-tracking/attendance"
                    onClick={(e) => {
                        e.preventDefault();

                        navigate(
                            "attendance",
                            "/dashboard/time-tracking/attendance"
                        );
                    }}
                    className={getClass("/dashboard/time-tracking/attendance", "attendance")}
                >
                    <div className="shrink-0 flex items-center justify-center w-8 h-8">
                        <Clock3 className="h-5 w-5 text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white" />
                    </div>
                    <span className="text-sm font-bold">Attendance</span>
                </a>

                {/* Usage */}
                <a
                    href="/dashboard/time-tracking/usage"
                    onClick={(e) => {
                        e.preventDefault();
                        setIsOpen(false);
                        navigate("usage", "/dashboard/time-tracking/usage")
                    }}
                    className={getClass("/dashboard/time-tracking/usage", "usage")}
                >
                    <div className="shrink-0 flex items-center justify-center w-8 h-8">
                        <Globe className="h-5 w-5 text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white" />
                    </div>
                    <span className="text-sm font-bold">Web & App Usage</span>
                </a>

                {/* Productivity */}
                <a
                    href="/dashboard/time-tracking/productivity"
                    onClick={(e) => {
                        e.preventDefault();
                        setIsOpen(false);
                        navigate("productivity", "/dashboard/time-tracking/productivity")
                    }}
                    className={getClass(
                        "/dashboard/time-tracking/productivity",
                        "productivity"
                    )}
                >
                    <div className="shrink-0 flex items-center justify-center w-8 h-8">
                        <BsBarChart className="h-5 w-5 text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white" />
                    </div>
                    <span className="text-sm font-bold">Productivity</span>
                </a>

                {/* Projects */}
                <a
                    href="/dashboard/time-tracking/project-tracking"
                    onClick={(e) => {
                        e.preventDefault();
                        setIsOpen(false);
                        navigate("project-tracking", "/dashboard/time-tracking/project-tracking")
                    }}
                    className={getClass("/dashboard/time-tracking/project-tracking", "project-tracking")}
                >
                    <div className="shrink-0 flex items-center justify-center w-8 h-8">
                        <HiOutlineClipboardDocumentList className="h-5 w-5 text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white" />
                    </div>
                    <span className="text-sm font-bold">Project Tracking</span>
                </a>

                {/* Location */}
                {user?.permissions?.includes("manage_users") && (
                    <a
                        href="/dashboard/time-tracking/location"
                        onClick={(e) => {
                            e.preventDefault();
                            setIsOpen(false);
                            navigate(
                                "location",
                                "/dashboard/time-tracking/location"
                            );
                        }}
                        className={getClass("/dashboard/time-tracking/location", "location")}
                    >
                        <div className="shrink-0 flex items-center justify-center w-8 h-8">
                            <MapPin className="h-5 w-5 text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white" />
                        </div>

                        <span className="text-sm font-bold">
                            Location
                        </span>
                    </a>
                )}
            </>

        </div>

    );

}