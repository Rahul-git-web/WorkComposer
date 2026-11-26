"use client";

import React, { useMemo } from "react";
import {
  HiOutlineClock,
  HiOutlineUsers,
  HiOutlineChartBar,
  HiOutlineBolt,
  HiOutlineBriefcase,
  HiOutlineSparkles,
  HiOutlineInformationCircle,
} from "react-icons/hi2";

export interface TeamMetricCardsProps {
  totalWorkSeconds: number;
  totalBreakSeconds: number;
  activeCount: number;
  totalMembers: number;
  presentCount: number;
  contributorCount?: number;
  avgWorkSecondsWorked: number;
  avgWorkSecondsTeam: number;
  isLoading?: boolean;
}

export default function TeamMetricCards({
  totalWorkSeconds,
  totalBreakSeconds,
  activeCount,
  totalMembers,
  presentCount,
  contributorCount,
  avgWorkSecondsWorked,
  avgWorkSecondsTeam,
  isLoading = false,
}: TeamMetricCardsProps) {
  // Format seconds to "Xh Ym" or "0m"
  const formatDuration = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  // Format seconds to precise "HH:MM:SS"
  const formatExactTime = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const totalWorkFormatted = useMemo(() => formatDuration(totalWorkSeconds), [totalWorkSeconds]);
  const totalBreakFormatted = useMemo(() => formatDuration(totalBreakSeconds), [totalBreakSeconds]);
  const avgWorkedFormatted = useMemo(() => formatDuration(avgWorkSecondsWorked), [avgWorkSecondsWorked]);
  const avgTeamFormatted = useMemo(() => formatDuration(avgWorkSecondsTeam), [avgWorkSecondsTeam]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="team-metrics-skeleton">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-5 rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] shadow-xs animate-pulse space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-[#1E293B]" />
              <div className="w-16 h-5 rounded-full bg-gray-200 dark:bg-[#1E293B]" />
            </div>
            <div className="w-24 h-4 rounded bg-gray-200 dark:bg-[#1E293B]" />
            <div className="w-32 h-7 rounded bg-gray-200 dark:bg-[#1E293B]" />
            <div className="w-40 h-3 rounded bg-gray-200 dark:bg-[#1E293B]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="team-metric-cards">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
          Team Operational Overview Today
        </h3>
        <span className="text-xs text-gray-400 dark:text-slate-500">
          Scope: {totalMembers} authorized member{totalMembers === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CARD 1: Total Team Work Time Today */}
        <div
          data-testid="metric-card-total-work"
          className="flex flex-col justify-between p-5 rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] shadow-xs transition-all duration-200"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <HiOutlineClock className="w-5 h-5" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
                Team Work
              </span>
            </div>
            <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">
              Total Work Time Today
            </span>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {totalWorkFormatted}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-[#22324D]/60 flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
            <span>Contributors</span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {contributorCount !== undefined ? contributorCount : presentCount} of {totalMembers} worked
            </span>
          </div>
        </div>

        {/* CARD 2: Active Team Members */}
        <div
          data-testid="metric-card-active-members"
          className="flex flex-col justify-between p-5 rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] shadow-xs transition-all duration-200"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <HiOutlineUsers className="w-5 h-5" />
              </div>
              {activeCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Tracking
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400">
                  Idle
                </span>
              )}
            </div>
            <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">
              Active Right Now
            </span>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {activeCount}{" "}
              <span className="text-sm font-normal text-gray-500 dark:text-slate-400">
                / {totalMembers} members
              </span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-[#22324D]/60 flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
            <span>Tracking Status</span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {totalMembers - activeCount} stopped/offline
            </span>
          </div>
        </div>

        {/* CARD 3: Team Average Work Time */}
        <div
          data-testid="metric-card-average-work"
          className="flex flex-col justify-between p-5 rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] shadow-xs transition-all duration-200"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <HiOutlineChartBar className="w-5 h-5" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                Daily Average
              </span>
            </div>
            <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">
              Average Work Time
            </span>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {avgWorkedFormatted}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-[#22324D]/60 flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
            <span title="Average across all authorized team members regardless of activity">
              Team-wide avg
            </span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {avgTeamFormatted}
            </span>
          </div>
        </div>

        {/* CARD 4: Team Work Time Summary (Worked vs Break) */}
        <div
          data-testid="metric-card-summary"
          className="flex flex-col justify-between p-5 rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] shadow-xs transition-all duration-200"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <HiOutlineBriefcase className="w-5 h-5" />
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                Time Split
              </span>
            </div>
            <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">
              Break Time Recorded
            </span>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
              {totalBreakFormatted}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-[#22324D]/60 flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
            <span>Work : Break Ratio</span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {totalBreakSeconds > 0
                ? `${Math.round((totalWorkSeconds / (totalWorkSeconds + totalBreakSeconds)) * 100)}% work`
                : "100% work"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

