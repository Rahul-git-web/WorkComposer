"use client";

import React, { useMemo } from "react";
import {
  HiOutlineSparkles,
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

export type ProductivityCategory = "productive" | "neutral" | "unproductive";

export type TeamClassifiedApp = {
  name: string;
  duration: number; // in seconds
  category: ProductivityCategory;
};

export interface TeamProductivityOverviewProps {
  productivityData: any[];
  isLoading?: boolean;
  isRestricted?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  onNavigateToProductivity?: () => void;
}

export function TeamProductivityOverview({
  productivityData,
  isLoading = false,
  isRestricted = false,
  errorMessage = null,
  onRetry,
  onNavigateToProductivity,
}: TeamProductivityOverviewProps) {
  // 1. Process records: Filter out exact duplicate records, merge multiple records per employee,
  // attribute missing user IDs safely, and normalize durations without double-counting.
  const {
    productiveSeconds,
    neutralSeconds,
    unproductiveSeconds,
    totalClassifiedSeconds,
    productivePercent,
    neutralPercent,
    unproductivePercent,
    topApplications,
  } = useMemo(() => {
    if (!Array.isArray(productivityData) || productivityData.length === 0) {
      return {
        productiveSeconds: 0,
        neutralSeconds: 0,
        unproductiveSeconds: 0,
        totalClassifiedSeconds: 0,
        productivePercent: 0,
        neutralPercent: 0,
        unproductivePercent: 0,
        topApplications: [],
      };
    }

    const seenRecordSignatures = new Set<string>();
    const userMap = new Map<
      string,
      {
        id: string;
        name: string;
        pSec: number;
        nSec: number;
        uSec: number;
        productiveApps: any[];
        neutralApps: any[];
        unproductiveApps: any[];
      }
    >();

    productivityData.forEach((record, index) => {
      if (!record || typeof record !== "object") return;

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

      const effectiveUserId = rawId || `anon_prod_${index}`;

      const pVal = typeof record.productiveSeconds === "number" && Number.isFinite(record.productiveSeconds)
        ? Math.max(0, Math.floor(record.productiveSeconds))
        : 0;
      const nVal = typeof record.neutralSeconds === "number" && Number.isFinite(record.neutralSeconds)
        ? Math.max(0, Math.floor(record.neutralSeconds))
        : 0;
      const uVal = typeof record.unproductiveSeconds === "number" && Number.isFinite(record.unproductiveSeconds)
        ? Math.max(0, Math.floor(record.unproductiveSeconds))
        : 0;

      const pApps = Array.isArray(record.productiveApps) ? record.productiveApps : [];
      const nApps = Array.isArray(record.neutralApps) ? record.neutralApps : [];
      const uApps = Array.isArray(record.unproductiveApps) ? record.unproductiveApps : [];

      // Detect exact duplicate records to prevent double-counting
      const signature = `${effectiveUserId}|${pVal}|${nVal}|${uVal}|${JSON.stringify(
        pApps.map((a: any) => [String(a.name || "").toLowerCase(), Number(a.duration || 0)]).sort()
      )}|${JSON.stringify(
        nApps.map((a: any) => [String(a.name || "").toLowerCase(), Number(a.duration || 0)]).sort()
      )}|${JSON.stringify(
        uApps.map((a: any) => [String(a.name || "").toLowerCase(), Number(a.duration || 0)]).sort()
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
          name: String(record.name || effectiveUserId),
          pSec: 0,
          nSec: 0,
          uSec: 0,
          productiveApps: [],
          neutralApps: [],
          unproductiveApps: [],
        };
        userMap.set(effectiveUserId, userEntry);
      }

      userEntry.pSec += pVal;
      userEntry.nSec += nVal;
      userEntry.uSec += uVal;
      userEntry.productiveApps.push(...pApps);
      userEntry.neutralApps.push(...nApps);
      userEntry.unproductiveApps.push(...uApps);
    });

    // 2. Aggregate team-wide seconds, calculate team percentages from totals (not averaging per-user percentages)
    let pSecSum = 0;
    let nSecSum = 0;
    let uSecSum = 0;

    // Track application durations across categories to assign dominant classification
    const appMap = new Map<
      string,
      {
        name: string;
        categories: { productive: number; neutral: number; unproductive: number };
      }
    >();

    const recordApp = (app: any, cat: ProductivityCategory) => {
      const rawName = String(app?.name || "Unknown").trim();
      if (!rawName) return;
      const key = rawName.toLowerCase();
      const dur = typeof app?.duration === "number" && Number.isFinite(app.duration)
        ? Math.max(0, Math.floor(app.duration))
        : 0;
      if (dur <= 0) return;

      const existing = appMap.get(key);
      if (existing) {
        existing.categories[cat] += dur;
      } else {
        appMap.set(key, {
          name: rawName,
          categories: { productive: 0, neutral: 0, unproductive: 0, [cat]: dur },
        });
      }
    };

    for (const user of userMap.values()) {
      pSecSum += user.pSec;
      nSecSum += user.nSec;
      uSecSum += user.uSec;

      user.productiveApps.forEach((a: any) => recordApp(a, "productive"));
      user.neutralApps.forEach((a: any) => recordApp(a, "neutral"));
      user.unproductiveApps.forEach((a: any) => recordApp(a, "unproductive"));
    }

    const totalSec = pSecSum + nSecSum + uSecSum;

    // Team percentage calculation from aggregate totals with exact 100% sum constraint
    let pPct = 0;
    let nPct = 0;
    let uPct = 0;

    if (totalSec > 0) {
      pPct = Math.round((pSecSum / totalSec) * 100);
      nPct = Math.round((nSecSum / totalSec) * 100);
      uPct = Math.round((uSecSum / totalSec) * 100);

      const sum = pPct + nPct + uPct;
      if (sum !== 100) {
        const diff = 100 - sum;
        if (uSecSum > 0 && uPct + diff >= 0) {
          uPct += diff;
        } else if (nSecSum > 0 && nPct + diff >= 0) {
          nPct += diff;
        } else if (pSecSum > 0 && pPct + diff >= 0) {
          pPct += diff;
        }
      }
    }

    // Determine top applications with dominant category
    const classifiedApps: TeamClassifiedApp[] = Array.from(appMap.values()).map((item) => {
      const totalDur =
        item.categories.productive + item.categories.neutral + item.categories.unproductive;
      let dominantCategory: ProductivityCategory = "neutral";
      if (
        item.categories.productive >= item.categories.neutral &&
        item.categories.productive >= item.categories.unproductive &&
        item.categories.productive > 0
      ) {
        dominantCategory = "productive";
      } else if (
        item.categories.unproductive > item.categories.productive &&
        item.categories.unproductive >= item.categories.neutral
      ) {
        dominantCategory = "unproductive";
      }
      return {
        name: item.name,
        duration: totalDur,
        category: dominantCategory,
      };
    });

    const sortedApps = classifiedApps
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5);

    return {
      productiveSeconds: pSecSum,
      neutralSeconds: nSecSum,
      unproductiveSeconds: uSecSum,
      totalClassifiedSeconds: totalSec,
      productivePercent: pPct,
      neutralPercent: nPct,
      unproductivePercent: uPct,
      topApplications: sortedApps,
    };
  }, [productivityData]);

  const maxAppDuration = useMemo(() => {
    return topApplications.length > 0 ? topApplications[0]?.duration || 0 : 0;
  }, [topApplications]);

  return (
    <div
      data-testid="team-productivity-overview-card"
      className="rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-5 sm:p-6 shadow-xs transition-colors duration-200"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-gray-100 dark:border-[#22324D]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800/70 flex items-center justify-center text-purple-600 dark:text-purple-400">
            <HiOutlineSparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              Team Productivity Overview
            </h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Categorized application and website usage across authorized team
            </p>
          </div>
        </div>

        {onNavigateToProductivity && !isRestricted && (
          <button
            type="button"
            onClick={onNavigateToProductivity}
            data-testid="team-productivity-full-report-btn"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors self-start sm:self-auto cursor-pointer"
          >
            <span>Full Report</span>
            <HiOutlineArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* State Handling: Loading, Restricted, Error, Empty, Populated */}
      {isLoading ? (
        <div className="py-10 flex flex-col items-center justify-center" data-testid="team-productivity-loading">
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 rounded-full border-4 border-gray-100 dark:border-slate-800" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-purple-600 border-r-purple-400" />
          </div>
          <p className="mt-3 text-xs font-semibold text-gray-500 dark:text-slate-400">
            Loading team productivity metrics...
          </p>
        </div>
      ) : isRestricted ? (
        <div
          data-testid="team-productivity-restricted"
          className="py-8 px-4 my-2 rounded-xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/80 dark:border-purple-800/40 flex flex-col items-center text-center"
        >
          <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center text-purple-600 dark:text-purple-400 mb-3">
            <HiOutlineLockClosed className="w-5 h-5" />
          </div>
          <p className="text-sm font-bold text-gray-900 dark:text-white">
            Team Productivity Restricted
          </p>
          <p className="text-xs text-gray-600 dark:text-slate-400 max-w-sm mt-1">
            Your organization policy or assigned role restricts access to team productivity classification reports.
          </p>
        </div>
      ) : errorMessage ? (
        <div
          data-testid="team-productivity-error"
          className="py-8 px-4 my-2 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-800/40 flex flex-col items-center text-center"
        >
          <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-400 mb-3">
            <HiOutlineExclamationCircle className="w-5 h-5" />
          </div>
          <p className="text-sm font-bold text-gray-900 dark:text-white">
            Failed to Load Team Productivity
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
      ) : totalClassifiedSeconds === 0 && topApplications.length === 0 ? (
        <div
          data-testid="team-productivity-empty"
          className="py-8 px-4 my-2 rounded-xl bg-gray-50 dark:bg-[#1E293B]/40 border border-dashed border-gray-200 dark:border-[#22324D] flex flex-col items-center text-center"
        >
          <HiOutlineCube className="w-8 h-8 text-gray-400 dark:text-slate-500 mb-2" />
          <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">
            No team application activity recorded today
          </p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 max-w-xs">
            Start tracking work to view categorized productive, neutral, and unproductive time across the team.
          </p>
        </div>
      ) : (
        <div className="pt-5 space-y-6" data-testid="team-productivity-content">
          {/* Productivity KPI Badges */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50">
              <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block">
                Productive
              </span>
              <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
                {productivePercent}%
              </span>
              <span className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 font-medium">
                {formatHoursMinutes(productiveSeconds)}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
              <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider block">
                Neutral
              </span>
              <span className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 block">
                {neutralPercent}%
              </span>
              <span className="text-[11px] text-amber-700/80 dark:text-amber-400/80 font-medium">
                {formatHoursMinutes(neutralSeconds)}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50">
              <span className="text-[11px] font-semibold text-rose-800 dark:text-rose-300 uppercase tracking-wider block">
                Unproductive
              </span>
              <span className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 mt-1 block">
                {unproductivePercent}%
              </span>
              <span className="text-[11px] text-rose-700/80 dark:text-rose-400/80 font-medium">
                {formatHoursMinutes(unproductiveSeconds)}
              </span>
            </div>
          </div>

          {/* 3-segment Stacked Ratio Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-slate-400">
              <span>Ratio Breakdown</span>
              <span>
                {Math.round(productivePercent + neutralPercent + unproductivePercent)}%
              </span>
            </div>
            <div className="h-3 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
              {productivePercent > 0 && (
                <div
                  style={{ width: `${Math.max(2, productivePercent)}%` }}
                  className="bg-emerald-500 h-full transition-all duration-500"
                  title={`Productive: ${productivePercent}% (${formatHoursMinutes(productiveSeconds)})`}
                />
              )}
              {neutralPercent > 0 && (
                <div
                  style={{ width: `${Math.max(2, neutralPercent)}%` }}
                  className="bg-amber-400 h-full transition-all duration-500"
                  title={`Neutral: ${neutralPercent}% (${formatHoursMinutes(neutralSeconds)})`}
                />
              )}
              {unproductivePercent > 0 && (
                <div
                  style={{ width: `${Math.max(2, unproductivePercent)}%` }}
                  className="bg-rose-500 h-full transition-all duration-500"
                  title={`Unproductive: ${unproductivePercent}% (${formatHoursMinutes(unproductiveSeconds)})`}
                />
              )}
            </div>
          </div>

          {/* Top Classified Applications List */}
          {topApplications.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                  Top Classified Applications Across Team
                </h4>
                <span className="text-xs text-gray-500 dark:text-slate-400">
                  {formatHoursMinutes(totalClassifiedSeconds)} classified
                </span>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-[#22324D]/60 rounded-xl border border-gray-200 dark:border-[#22324D] overflow-hidden">
                {topApplications.map((app, index) => {
                  const badgeColor =
                    app.category === "productive"
                      ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                      : app.category === "unproductive"
                      ? "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800"
                      : "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800";

                  const initial = (app.name || "A").trim().charAt(0).toUpperCase();
                  const pctOfTop = maxAppDuration > 0 ? Math.round((app.duration / maxAppDuration) * 100) : 0;

                  return (
                    <div
                      key={`${app.name}-${index}`}
                      className="p-3 bg-white dark:bg-[#0F172A] hover:bg-gray-50/80 dark:hover:bg-[#1E293B]/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1.5">
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
                        </div>
                      </div>

                      {/* Visual Relative Duration Bar */}
                      <div className="w-full bg-gray-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${Math.min(100, Math.max(3, pctOfTop))}%` }}
                          className={`h-full rounded-full transition-all duration-300 ${
                            app.category === "productive"
                              ? "bg-emerald-500"
                              : app.category === "unproductive"
                              ? "bg-rose-500"
                              : "bg-amber-400"
                          }`}
                          title={`${pctOfTop}% of top application`}
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

export default TeamProductivityOverview;
