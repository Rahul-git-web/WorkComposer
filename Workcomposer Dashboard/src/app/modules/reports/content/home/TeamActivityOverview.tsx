"use client";

import React, { useMemo } from "react";
import {
  HiOutlineBolt,
  HiOutlineLockClosed,
  HiOutlineArrowRight,
  HiOutlineCube,
  HiOutlineArrowPath,
  HiOutlineExclamationCircle,
} from "react-icons/hi2";

export function formatHoursMinutes(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function formatAppDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "< 1m";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return "< 1m";
  return formatHoursMinutes(seconds);
}

export type TeamApplicationUsage = {
  name: string;
  duration: number; // in seconds
};

export interface TeamActivityOverviewProps {
  usageData: any[];
  totalMembers?: number;
  isLoading?: boolean;
  isRestricted?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  onNavigateToUsage?: () => void;
}

export function TeamActivityOverview({
  usageData,
  totalMembers = 0,
  isLoading = false,
  isRestricted = false,
  errorMessage = null,
  onRetry,
  onNavigateToUsage,
}: TeamActivityOverviewProps) {
  // 1. Process records: Filter out exact duplicates, merge multiple records per employee,
  // attribute missing user IDs safely, and normalize durations without double-counting.
  const {
    activeEmployeesCount,
    totalWorkSeconds,
    totalAppSeconds,
    topApplications,
    distinctAppCount,
    uniqueUserCount,
  } = useMemo(() => {
    if (!Array.isArray(usageData) || usageData.length === 0) {
      return {
        activeEmployeesCount: 0,
        totalWorkSeconds: 0,
        totalAppSeconds: 0,
        topApplications: [],
        distinctAppCount: 0,
        uniqueUserCount: 0,
      };
    }

    const seenRecordSignatures = new Set<string>();
    const userMap = new Map<
      string,
      {
        id: string;
        name: string;
        workSeconds: number;
        appMap: Map<string, { name: string; duration: number }>;
      }
    >();

    usageData.forEach((record, index) => {
      if (!record || typeof record !== "object") return;

      // Extract user ID with fallbacks (id, userId, user object, email, name, or anon index)
      const rawId = String(
        record._id ||
        record.id ||
        record.userId ||
        record.user?._id ||
        record.user?.id ||
        record.email ||
        record.name ||
        ""
      ).trim();

      const effectiveUserId = rawId || `anon_user_${index}`;
      const recordWorkSec = typeof record.workSeconds === "number" && Number.isFinite(record.workSeconds)
        ? Math.max(0, Math.floor(record.workSeconds))
        : 0;

      // Normalize apps list
      const rawApps = Array.isArray(record.apps)
        ? record.apps
        : Array.isArray(record.applications)
        ? record.applications
        : [];

      const normalizedApps: { name: string; duration: number }[] = [];
      for (const app of rawApps) {
        if (!app || typeof app !== "object") continue;
        const appName = String(app.name || "").trim();
        if (!appName) continue;
        const appDur = typeof app.duration === "number" && Number.isFinite(app.duration)
          ? Math.max(0, Math.floor(app.duration))
          : 0;
        if (appDur > 0) {
          normalizedApps.push({ name: appName, duration: appDur });
        }
      }

      // Detect exact duplicate records to prevent double-counting
      const signature = `${effectiveUserId}|${record.sessionId || record.recordId || ""}|${recordWorkSec}|${JSON.stringify(
        normalizedApps.map((a) => [a.name.toLowerCase(), a.duration]).sort()
      )}`;

      if (seenRecordSignatures.has(signature)) {
        return; // Skip duplicate record
      }
      seenRecordSignatures.add(signature);

      // Merge into user entry (handling multiple records for one employee)
      let userEntry = userMap.get(effectiveUserId);
      if (!userEntry) {
        userEntry = {
          id: effectiveUserId,
          name: String(record.name || record.firstName || effectiveUserId),
          workSeconds: 0,
          appMap: new Map<string, { name: string; duration: number }>(),
        };
        userMap.set(effectiveUserId, userEntry);
      }

      userEntry.workSeconds += recordWorkSec;

      for (const app of normalizedApps) {
        const key = app.name.toLowerCase();
        const existing = userEntry.appMap.get(key);
        if (existing) {
          existing.duration += app.duration;
        } else {
          userEntry.appMap.set(key, { name: app.name, duration: app.duration });
        }
      }
    });

    // Aggregate across unique users
    let activeCount = 0;
    let workSecSum = 0;
    let appSecSum = 0;
    const teamAppMap = new Map<string, { name: string; duration: number }>();

    for (const user of userMap.values()) {
      workSecSum += user.workSeconds;
      const userHasApps = user.appMap.size > 0;

      if (user.workSeconds > 0 || userHasApps) {
        activeCount++;
      }

      for (const [key, app] of user.appMap.entries()) {
        appSecSum += app.duration;
        const existingTeamApp = teamAppMap.get(key);
        if (existingTeamApp) {
          existingTeamApp.duration += app.duration;
        } else {
          teamAppMap.set(key, { name: app.name, duration: app.duration });
        }
      }
    }

    const sortedApps = Array.from(teamAppMap.values())
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5);

    return {
      activeEmployeesCount: activeCount,
      totalWorkSeconds: workSecSum,
      totalAppSeconds: appSecSum,
      topApplications: sortedApps,
      distinctAppCount: teamAppMap.size,
      uniqueUserCount: userMap.size,
    };
  }, [usageData]);

  const maxAppDuration = useMemo(() => {
    return topApplications.length > 0 ? topApplications[0]?.duration || 0 : 0;
  }, [topApplications]);

  const displayDenominator = Math.max(totalMembers, uniqueUserCount, activeEmployeesCount);

  return (
    <div
      data-testid="team-activity-overview-card"
      className="rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-5 sm:p-6 shadow-xs transition-colors duration-200"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-gray-100 dark:border-[#22324D]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/70 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <HiOutlineBolt className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              Team Activity Today
            </h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Application usage and activity distribution across authorized team
            </p>
          </div>
        </div>

        {onNavigateToUsage && !isRestricted && (
          <button
            type="button"
            onClick={onNavigateToUsage}
            data-testid="team-activity-full-report-btn"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors self-start sm:self-auto cursor-pointer"
          >
            <span>Full Report</span>
            <HiOutlineArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* State Handling: Loading, Restricted, Error, Empty, Populated */}
      {isLoading ? (
        <div className="py-10 flex flex-col items-center justify-center" data-testid="team-activity-loading">
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 rounded-full border-4 border-gray-100 dark:border-slate-800" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-amber-600 border-r-amber-400" />
          </div>
          <p className="mt-3 text-xs font-semibold text-gray-500 dark:text-slate-400">
            Loading team activity metrics...
          </p>
        </div>
      ) : isRestricted ? (
        <div
          data-testid="team-activity-restricted"
          className="py-8 px-4 my-2 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/40 flex flex-col items-center text-center"
        >
          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-3">
            <HiOutlineLockClosed className="w-5 h-5" />
          </div>
          <p className="text-sm font-bold text-gray-900 dark:text-white">
            Team Activity Access Restricted
          </p>
          <p className="text-xs text-gray-600 dark:text-slate-400 max-w-sm mt-1">
            Your role or organization settings do not grant permission to view team-wide application activity.
          </p>
        </div>
      ) : errorMessage ? (
        <div
          data-testid="team-activity-error"
          className="py-8 px-4 my-2 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-800/40 flex flex-col items-center text-center"
        >
          <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-400 mb-3">
            <HiOutlineExclamationCircle className="w-5 h-5" />
          </div>
          <p className="text-sm font-bold text-gray-900 dark:text-white">
            Failed to Load Team Activity
          </p>
          <p className="text-xs text-gray-600 dark:text-slate-400 max-w-sm mt-1">
            {errorMessage}
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <HiOutlineArrowPath className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          )}
        </div>
      ) : activeEmployeesCount === 0 && topApplications.length === 0 ? (
        <div
          data-testid="team-activity-empty"
          className="py-8 px-4 my-2 rounded-xl bg-gray-50 dark:bg-[#1E293B]/40 border border-dashed border-gray-200 dark:border-[#22324D] flex flex-col items-center text-center"
        >
          <HiOutlineCube className="w-8 h-8 text-gray-400 dark:text-slate-500 mb-2" />
          <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">
            No team activity recorded today
          </p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 max-w-xs">
            Activity and application usage will appear here once authorized team members log time or track work today.
          </p>
        </div>
      ) : (
        <div className="pt-5 space-y-6" data-testid="team-activity-content">
          {/* 3 KPI Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
              <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider block">
                Active Contributors
              </span>
              <span className="text-xl sm:text-2xl font-black text-amber-700 dark:text-amber-400 mt-1 block">
                {activeEmployeesCount} <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">/ {displayDenominator}</span>
              </span>
            </div>

            <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50">
              <span className="text-[11px] font-semibold text-blue-800 dark:text-blue-300 uppercase tracking-wider block">
                Total Work Recorded
              </span>
              <span className="text-xl sm:text-2xl font-black text-blue-700 dark:text-blue-400 mt-1 block">
                {formatHoursMinutes(totalWorkSeconds)}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/50">
              <span className="text-[11px] font-semibold text-indigo-800 dark:text-indigo-300 uppercase tracking-wider block">
                Distinct Applications
              </span>
              <span className="text-xl sm:text-2xl font-black text-indigo-700 dark:text-indigo-400 mt-1 block">
                {distinctAppCount}
              </span>
            </div>
          </div>

          {/* Top Applications Section */}
          {topApplications.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                  Top Applications Across Team Today
                </h4>
                <span className="text-xs text-gray-500 dark:text-slate-400">
                  {formatHoursMinutes(totalAppSeconds)} total app time
                </span>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-[#22324D]/60 rounded-xl border border-gray-200 dark:border-[#22324D] overflow-hidden">
                {topApplications.map((app, index) => {
                  const initial = (app.name || "A").trim().charAt(0).toUpperCase();
                  const pctOfTop = maxAppDuration > 0 ? Math.round((app.duration / maxAppDuration) * 100) : 0;

                  return (
                    <div
                      key={`${app.name}-${index}`}
                      className="p-3 bg-white dark:bg-[#0F172A] hover:bg-gray-50/80 dark:hover:bg-[#1E293B]/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-3 min-w-0 pr-2">
                          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center text-xs font-bold shrink-0">
                            {initial}
                          </div>
                          <span className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {app.name}
                          </span>
                        </div>
                        <span className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white shrink-0">
                          {formatAppDuration(app.duration)}
                        </span>
                      </div>

                      {/* Visual Relative Duration Bar */}
                      <div className="w-full bg-gray-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${Math.min(100, Math.max(3, pctOfTop))}%` }}
                          className="bg-amber-500 h-full rounded-full transition-all duration-300"
                          title={`${pctOfTop}% of top app duration`}
                        />
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

export default TeamActivityOverview;
