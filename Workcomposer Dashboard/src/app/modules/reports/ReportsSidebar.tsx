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
import DesktopModuleHeader from "../common/DesktopModuleHeader";
import useDesktopNavigation from "@/hooks/useDesktopNavigation";

type ReportsSidebarProps = {
    activeReport?: string;
    setActiveReport?: React.Dispatch<React.SetStateAction<string>>;
    desktop?: boolean;
};

type ReportNavItem = {
    reportName: string;
    path: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    visible?: boolean;
};

export default function ReportsSidebar({
    activeReport,
    setActiveReport,
    desktop = false,
}: ReportsSidebarProps) {
    const { closeSidebar } = useDesktopNavigation(desktop);
    const pathname = usePathname();
    const router = useRouter();
    const { user } = useDashboard();

    const isTeamReport = isTeamReportAccess(user);
    const overviewLabel = isTeamReport ? "Team Report" : "My Report";
    const canViewScreenshots = user?.screenshotAccess !== "none";
    const canViewLocation = Boolean(user?.permissions?.includes("manage_users"));

    const isItemActive = (path: string, reportName: string) =>
        desktop ? activeReport === reportName : pathname === path;

    const getClass = (isActive: boolean) => {
        const layoutClasses = desktop ? "px-3" : "-mx-3 px-3";

        if (desktop) {
            return `group flex items-center gap-x-3 p-2 text-sm font-semibold transition-all duration-200 ease-in-out ${layoutClasses} ${
                isActive
                    ? "router-link-active router-link-exact-active bg-indigo-50 dark:bg-linear-to-r dark:from-indigo-900/70 dark:to-gray-800 text-indigo-700 dark:text-white border-l-3 border-indigo-600 dark:border-indigo-500 shadow-xs dark:shadow-md"
                    : "text-slate-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 border-l-3 border-transparent"
            }`;
        }

        return `group flex items-center gap-x-3 p-2 text-sm font-semibold transition-all duration-200 ease-in-out ${layoutClasses} ${
            isActive
                ? "router-link-active router-link-exact-active bg-linear-to-r from-indigo-900/70 to-gray-800 text-white border-l-3 border-indigo-500 shadow-md"
                : "text-gray-300 hover:text-white hover:bg-white/5 border-l-3 border-transparent"
        }`;
    };

    const getIconClass = (isActive: boolean) => {
        if (desktop) {
            return `h-5 w-5 transition-colors duration-200 ${
                isActive
                    ? "text-indigo-600 dark:text-indigo-300"
                    : "text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-white"
            }`;
        }

        return `h-5 w-5 transition-colors duration-200 ${
            isActive
                ? "text-indigo-300"
                : "text-gray-400 group-hover:text-white"
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

    const navItems: ReportNavItem[] = [
        {
            reportName: "home",
            path: "/dashboard/time-tracking/home",
            label: "Home",
            icon: HiHome,
        },
        {
            reportName: "overview",
            path: "/dashboard/time-tracking/overview",
            label: overviewLabel,
            icon: HiUsers,
        },
        {
            reportName: "screenshots",
            path: "/dashboard/time-tracking/screenshots",
            label: "Screenshots",
            icon: Camera,
            visible: canViewScreenshots,
        },
        {
            reportName: "attendance",
            path: "/dashboard/time-tracking/attendance",
            label: "Attendance",
            icon: Clock3,
        },
        {
            reportName: "usage",
            path: "/dashboard/time-tracking/usage",
            label: "Web & App Usage",
            icon: Globe,
        },
        {
            reportName: "productivity",
            path: "/dashboard/time-tracking/productivity",
            label: "Productivity",
            icon: BsBarChart,
        },
        {
            reportName: "project-tracking",
            path: "/dashboard/time-tracking/project-tracking",
            label: "Project Tracking",
            icon: HiOutlineClipboardDocumentList,
        },
        {
            reportName: "location",
            path: "/dashboard/time-tracking/location",
            label: "Location",
            icon: MapPin,
            visible: canViewLocation,
        },
    ];

    return (
        <div className="space-y-1">
            {desktop && <DesktopModuleHeader />}

            {navItems
                .filter((item) => item.visible !== false)
                .map((item) => {
                    const isActive = isItemActive(item.path, item.reportName);
                    const Icon = item.icon;

                    return (
                        <a
                            key={item.reportName}
                            href={item.path}
                            onClick={(e) => {
                                e.preventDefault();
                                navigate(item.reportName, item.path);
                            }}
                            className={getClass(isActive)}
                        >
                            <div className="shrink-0 flex items-center justify-center w-8 h-8">
                                <Icon className={getIconClass(isActive)} />
                            </div>
                            <span className="text-sm font-bold">{item.label}</span>
                        </a>
                    );
                })}
        </div>
    );
}