"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useOptionalDesktop } from "@/context/DesktopContext";
import { useDashboard } from "@/context/DashboardContext";
import {
  HiOutlineChartBar,
  HiOutlineCalendarDays,
  HiOutlineCamera,
  HiOutlineGlobeAlt,
  HiOutlineArrowRight,
} from "react-icons/hi2";

export interface QuickReportLinksProps {
  onNavigate?: (reportName: string, path: string) => void;
  variant?: "personal" | "team";
}

export function QuickReportLinks({ onNavigate, variant = "personal" }: QuickReportLinksProps) {
  const router = useRouter();
  const desktop = useOptionalDesktop();
  const { user } = useDashboard();

  const canViewScreenshots = user?.screenshotAccess !== "none";

  const handleNavigate = (reportName: string, path: string) => {
    if (onNavigate) {
      onNavigate(reportName, path);
      return;
    }

    if (desktop?.setActiveReport) {
      desktop.setActivePage?.("reports");
      desktop.setActiveReport(reportName);
      return;
    }

    router.push(path);
  };

  const isTeam = variant === "team";

  const links = [
    {
      id: "overview",
      name: isTeam ? "Team Report" : "My Report",
      subtitle: isTeam
        ? "Live team overview, active members, and aggregate hours"
        : "Detailed daily timeline, tasks, and hours",
      path: "/dashboard/time-tracking/overview",
      icon: HiOutlineChartBar,
      color: "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border-indigo-100 dark:border-indigo-800/70",
      visible: true,
    },
    {
      id: "attendance",
      name: "Attendance",
      subtitle: "Check-in, check-out, and shift logs",
      path: "/dashboard/time-tracking/attendance",
      icon: HiOutlineCalendarDays,
      color: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-100 dark:border-emerald-800/70",
      visible: true,
    },
    {
      id: "screenshots",
      name: "Screenshots",
      subtitle: "Timeline captures and visual activity logs",
      path: "/dashboard/time-tracking/screenshots",
      icon: HiOutlineCamera,
      color: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 border-purple-100 dark:border-purple-800/70",
      visible: canViewScreenshots,
    },
    {
      id: "usage",
      name: "Web & App Usage",
      subtitle: "Application usage statistics and breakdown",
      path: "/dashboard/time-tracking/usage",
      icon: HiOutlineGlobeAlt,
      color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border-amber-100 dark:border-amber-800/70",
      visible: true,
    },
  ].filter((link) => link.visible);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
          Quick Report Shortcuts
        </h3>
      </div>

      <div
        className={`grid gap-4 ${
          isTeam
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
            : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-1"
        }`}
      >
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <button
              key={link.id}
              type="button"
              onClick={() => handleNavigate(link.id, link.path)}
              className="group relative flex flex-col justify-between p-4 rounded-xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] hover:bg-gray-50/80 dark:hover:bg-[#1E293B]/70 shadow-sm hover:shadow transition-all duration-200 text-left cursor-pointer"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div
                    className={`w-9 h-9 rounded-lg border flex items-center justify-center ${link.color}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <HiOutlineArrowRight className="w-4 h-4 text-gray-400 dark:text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                </div>

                <h4 className="text-sm font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {link.name}
                </h4>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 line-clamp-2">
                  {link.subtitle}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default QuickReportLinks;

