"use client";

import React, { useMemo } from "react";
import {
  HiOutlineSparkles,
  HiOutlineLockClosed,
  HiOutlineArrowRight,
  HiOutlineCube,
} from "react-icons/hi2";

export function formatHoursMinutes(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export type ApplicationUsage = {
  name: string;
  duration: number; // in seconds
  category?: "productive" | "neutral" | "unproductive";
};

export type ProductivitySummary = {
  productivePercent: number;
  neutralPercent: number;
  unproductivePercent: number;
  productiveSeconds?: number;
  neutralSeconds?: number;
  unproductiveSeconds?: number;
  productiveApps?: ApplicationUsage[];
  neutralApps?: ApplicationUsage[];
  unproductiveApps?: ApplicationUsage[];
};

export interface PersonalProductivityCardProps {
  data: ProductivitySummary | null;
  isLoading?: boolean;
  isRestricted?: boolean;
  onNavigateToProductivity?: () => void;
}

export function PersonalProductivityCard({
  data,
  isLoading = false,
  isRestricted = false,
  onNavigateToProductivity,
}: PersonalProductivityCardProps) {
  // Aggregate and sort top applications
  const topApplications = useMemo(() => {
    if (!data) return [];

    const apps: ApplicationUsage[] = [];

    (data.productiveApps || []).forEach((app) => {
      apps.push({
        name: app.name || "Unknown App",
        duration: app.duration || 0,
        category: "productive",
      });
    });

    (data.neutralApps || []).forEach((app) => {
      apps.push({
        name: app.name || "Unknown App",
        duration: app.duration || 0,
        category: "neutral",
      });
    });

    (data.unproductiveApps || []).forEach((app) => {
      apps.push({
        name: app.name || "Unknown App",
        duration: app.duration || 0,
        category: "unproductive",
      });
    });

    // Sort by duration descending and take top 5
    return apps.sort((a, b) => b.duration - a.duration).slice(0, 5);
  }, [data]);

  const totalAppDuration = useMemo(() => {
    return topApplications.reduce((sum, app) => sum + app.duration, 0);
  }, [topApplications]);

  const formatAppDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return "< 1m";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 1) return "< 1m";
    return formatHoursMinutes(seconds);
  };

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-5 sm:p-6 shadow-sm transition-colors duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-gray-100 dark:border-[#22324D]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800/70 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <HiOutlineSparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              My Productivity Today
            </h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Categorized application and website usage
            </p>
          </div>
        </div>

        {onNavigateToProductivity && !isRestricted && (
          <button
            type="button"
            onClick={onNavigateToProductivity}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors self-start sm:self-auto cursor-pointer"
          >
            <span>Full Report</span>
            <HiOutlineArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Body State Handling */}
      {isLoading ? (
        <div className="py-10 flex flex-col items-center justify-center">
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 rounded-full border-4 border-gray-100 dark:border-slate-800" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-indigo-600 border-r-indigo-400" />
          </div>
          <p className="mt-3 text-xs font-semibold text-gray-500 dark:text-slate-400">
            Loading productivity metrics...
          </p>
        </div>
      ) : isRestricted ? (
        <div className="py-8 px-4 my-2 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/40 flex flex-col items-center text-center">
          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-3">
            <HiOutlineLockClosed className="w-5 h-5" />
          </div>
          <p className="text-sm font-bold text-gray-900 dark:text-white">
            Productivity Metrics Restricted
          </p>
          <p className="text-xs text-gray-600 dark:text-slate-400 max-w-sm mt-1">
            Your organization policy restricts access to detailed application classification and productivity reports.
          </p>
        </div>
      ) : !data || (data.productivePercent === 0 && data.neutralPercent === 0 && data.unproductivePercent === 0 && topApplications.length === 0) ? (
        <div className="py-8 px-4 my-2 rounded-xl bg-gray-50 dark:bg-[#1E293B]/40 border border-dashed border-gray-200 dark:border-[#22324D] flex flex-col items-center text-center">
          <HiOutlineCube className="w-8 h-8 text-gray-400 dark:text-slate-500 mb-2" />
          <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">
            No application activity recorded today
          </p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 max-w-xs">
            Start tracking work to view your categorized productive, neutral, and unproductive time.
          </p>
        </div>
      ) : (
        <div className="pt-5 space-y-6">
          {/* Productivity KPI Badges */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50">
              <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block">
                Productive
              </span>
              <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
                {Math.round(data.productivePercent || 0)}%
              </span>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
              <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider block">
                Neutral
              </span>
              <span className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 block">
                {Math.round(data.neutralPercent || 0)}%
              </span>
            </div>

            <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50">
              <span className="text-[11px] font-semibold text-rose-800 dark:text-rose-300 uppercase tracking-wider block">
                Unproductive
              </span>
              <span className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 mt-1 block">
                {Math.round(data.unproductivePercent || 0)}%
              </span>
            </div>
          </div>

          {/* 3-segment Stacked Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-slate-400">
              <span>Ratio Breakdown</span>
              <span>
                {Math.round((data.productivePercent || 0) + (data.neutralPercent || 0) + (data.unproductivePercent || 0))}%
              </span>
            </div>
            <div className="h-3 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
              {data.productivePercent > 0 && (
                <div
                  style={{ width: `${Math.max(2, data.productivePercent)}%` }}
                  className="bg-emerald-500 h-full transition-all duration-500"
                  title={`Productive: ${Math.round(data.productivePercent)}%`}
                />
              )}
              {data.neutralPercent > 0 && (
                <div
                  style={{ width: `${Math.max(2, data.neutralPercent)}%` }}
                  className="bg-amber-400 h-full transition-all duration-500"
                  title={`Neutral: ${Math.round(data.neutralPercent)}%`}
                />
              )}
              {data.unproductivePercent > 0 && (
                <div
                  style={{ width: `${Math.max(2, data.unproductivePercent)}%` }}
                  className="bg-rose-500 h-full transition-all duration-500"
                  title={`Unproductive: ${Math.round(data.unproductivePercent)}%`}
                />
              )}
            </div>
          </div>

          {/* Top Applications List */}
          {topApplications.length > 0 && (
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                Top Applications Today
              </h4>
              <div className="divide-y divide-gray-100 dark:divide-[#22324D]/60 rounded-xl border border-gray-200 dark:border-[#22324D] overflow-hidden">
                {topApplications.map((app, index) => {
                  const badgeColor =
                    app.category === "productive"
                      ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                      : app.category === "unproductive"
                      ? "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                      : "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800";

                  const initial = (app.name || "A").trim().charAt(0).toUpperCase();

                  return (
                    <div
                      key={`${app.name}-${index}`}
                      className="flex items-center justify-between p-3 bg-white dark:bg-[#0F172A] hover:bg-gray-50/80 dark:hover:bg-[#1E293B]/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-gray-700 dark:text-slate-300 shrink-0">
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {app.name}
                          </p>
                          <span
                            className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold border capitalize mt-0.5 ${badgeColor}`}
                          >
                            {app.category}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">
                          {formatAppDuration(app.duration)}
                        </span>
                        {totalAppDuration > 0 && (
                          <p className="text-[10px] text-gray-400 dark:text-slate-500">
                            {Math.round((app.duration / totalAppDuration) * 100)}% of top
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PersonalProductivityCard;
