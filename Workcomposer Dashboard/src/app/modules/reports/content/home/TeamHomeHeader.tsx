"use client";

import React, { useMemo } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { getReportAccessLabel } from "@/utils/reportAccess";
import {
  HiUsers,
  HiOutlineBuildingOffice2,
  HiOutlineShieldCheck,
  HiArrowPath,
} from "react-icons/hi2";

export interface TeamHomeHeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
  disabled?: boolean;
}

export default function TeamHomeHeader({
  onRefresh,
  isRefreshing = false,
  disabled = false,
}: TeamHomeHeaderProps) {
  const { user } = useDashboard();

  // 1. Resolve workspace identity from existing context without fabricating values
  const workspaceName = useMemo(() => {
    return user?.organization?.name || undefined;
  }, [user]);

  // 2. Resolve display scope
  const reportAccessLabel = useMemo(() => {
    return getReportAccessLabel(user);
  }, [user]);

  // 3. User display name
  const displayName = useMemo(() => {
    if (user?.firstName) {
      return `${user.firstName} ${user.lastName || ""}`.trim();
    }
    return user?.name || "Manager";
  }, [user]);

  return (
    <div className="w-full rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] shadow-sm p-5 sm:p-6 transition-colors duration-200">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        {/* Left: Team Home Identity & Context */}
        <div className="flex items-start sm:items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shrink-0">
            <HiUsers className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                Team Home
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300">
                Team Mode
              </span>
              {workspaceName && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700">
                  <HiOutlineBuildingOffice2 className="w-3.5 h-3.5 text-gray-500 dark:text-slate-400" />
                  <span>{workspaceName}</span>
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              Operational management dashboard and team activity analytics.
            </p>
          </div>
        </div>

        {/* Right: User Context & Optional Refresh Action */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-50 dark:bg-[#1E293B]/60 border border-gray-100 dark:border-[#22324D]/80 text-xs">
            <HiOutlineShieldCheck className="w-4 h-4 text-gray-500 dark:text-slate-400" />
            <span className="text-gray-500 dark:text-slate-400 font-medium">Scope:</span>
            <span className="font-semibold text-gray-900 dark:text-white uppercase">
              {reportAccessLabel}
            </span>
          </div>

          {onRefresh && (
            <button
              type="button"
              data-testid="team-home-refresh-btn"
              onClick={disabled ? undefined : onRefresh}
              disabled={disabled || isRefreshing}
              aria-disabled={disabled || isRefreshing}
              title={
                disabled
                  ? "Team metrics refresh will be available once live team data is connected in Phase 113D-C"
                  : "Refresh team dashboard"
              }
              aria-label="Refresh team dashboard"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] hover:bg-gray-50 dark:hover:bg-[#1E293B] text-gray-700 dark:text-slate-300 transition-colors shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <HiArrowPath
                className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-indigo-600 dark:text-indigo-400" : ""}`}
              />
              <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

