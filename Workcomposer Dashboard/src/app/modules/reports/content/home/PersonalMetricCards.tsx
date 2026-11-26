"use client";

import { useMemo } from "react";
import { Clock, Activity, Calendar, Sparkles, CheckCircle2, AlertTriangle, Coffee } from "lucide-react";

interface Props {
  displayedWorkSeconds: number;
  todayBreakSeconds: number;
  stats: {
    todaySeconds: number;
    weekSeconds: number;
    monthSeconds: number;
    avgDaySeconds: number;
  };
  activityScore: number;
  idlePercentage: number;
  hasActivityData: boolean;
  activityLoading: boolean;
  productivity: {
    productivePercent: number;
    neutralPercent: number;
    unproductivePercent: number;
    productiveSeconds: number;
    neutralSeconds: number;
    unproductiveSeconds: number;
    isRestricted: boolean;
    hasData: boolean;
    loading: boolean;
  };
  effectiveSettings: any;
  rolling7Hours?: number;
}

export default function PersonalMetricCards({
  displayedWorkSeconds,
  todayBreakSeconds,
  stats,
  activityScore,
  idlePercentage,
  hasActivityData,
  activityLoading,
  productivity,
  effectiveSettings,
  rolling7Hours,
}: Props) {
  // 1. Time formatting helpers
  const formatTimer = (totalSeconds: number) => {
    const s = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  const formatHoursShort = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    return `${(s / 3600).toFixed(1)}h`;
  };

  const formatMinutesShort = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  // 2. Active time vs Idle time calculation
  const { activeDurationStr, idleDurationStr } = useMemo(() => {
    const totalSecs = Math.max(0, Math.floor(displayedWorkSeconds));
    if (totalSecs === 0 || !hasActivityData) {
      return { activeDurationStr: "0m", idleDurationStr: "0m" };
    }
    const activeSecs = Math.round(totalSecs * (activityScore / 100));
    const idleSecs = Math.max(0, totalSecs - activeSecs);
    return {
      activeDurationStr: formatMinutesShort(activeSecs),
      idleDurationStr: formatMinutesShort(idleSecs),
    };
  }, [displayedWorkSeconds, activityScore, hasActivityData]);

  // 3. 7-Day Norm Calculation from authoritative schedule
  const normCalculation = useMemo(() => {
    const actual7Hours =
      rolling7Hours !== undefined
        ? rolling7Hours
        : (stats.weekSeconds || 0) / 3600;

    const shift = effectiveSettings?.shift;
    const schedule = shift?.schedule;

    // Check if shift tracking is enabled and has configured days
    if (shift?.enabled && schedule) {
      const scheduleItems: any[] = Array.isArray(schedule)
        ? schedule
        : typeof schedule === "object"
        ? Object.entries(schedule).map(([dayKey, dayVal]: [string, any]) => ({
            day: dayKey,
            ...(typeof dayVal === "object" ? dayVal : {}),
          }))
        : [];

      if (scheduleItems.length > 0) {
        let totalWeeklyScheduledMinutes = 0;
        let scheduledDaysCount = 0;

        scheduleItems.forEach((item: any) => {
          if (item && item.enabled !== false && item.startTime && item.endTime) {
            const [startH, startM] = item.startTime.split(":").map(Number);
            const [endH, endM] = item.endTime.split(":").map(Number);
            if (
              Number.isInteger(startH) &&
              Number.isInteger(startM) &&
              Number.isInteger(endH) &&
              Number.isInteger(endM)
            ) {
              let startMinutes = startH * 60 + startM;
              let endMinutes = endH * 60 + endM;
              if (endMinutes <= startMinutes) {
                endMinutes += 24 * 60; // Overnight shift
              }
              let shiftDuration = endMinutes - startMinutes;

              // Subtract scheduled breaks if configured
              let breakDurationMinutes = 0;
              if (Array.isArray(item.breaks)) {
                item.breaks.forEach((b: any) => {
                  if (b && b.enabled !== false && b.startTime && b.endTime) {
                    const [bStartH, bStartM] = b.startTime.split(":").map(Number);
                    const [bEndH, bEndM] = b.endTime.split(":").map(Number);
                    if (
                      Number.isInteger(bStartH) &&
                      Number.isInteger(bStartM) &&
                      Number.isInteger(bEndH) &&
                      Number.isInteger(bEndM)
                    ) {
                      let bStart = bStartH * 60 + bStartM;
                      let bEnd = bEndH * 60 + bEndM;
                      if (bEnd <= bStart) bEnd += 24 * 60;
                      breakDurationMinutes += Math.max(0, bEnd - bStart);
                    }
                  }
                });
              }

              if (typeof item.breakMinutes === "number" && item.breakMinutes > 0) {
                breakDurationMinutes = Math.max(breakDurationMinutes, item.breakMinutes);
              }

              shiftDuration = Math.max(0, shiftDuration - breakDurationMinutes);
              totalWeeklyScheduledMinutes += shiftDuration;
              scheduledDaysCount++;
            }
          }
        });

        if (totalWeeklyScheduledMinutes > 0) {
          const scheduledHours = totalWeeklyScheduledMinutes / 60;
          const progressPercent = Math.min(
            100,
            Math.round((actual7Hours / scheduledHours) * 100)
          );
          const diffHours = actual7Hours - scheduledHours;

          return {
            hasSchedule: true,
            scheduledHours: `${scheduledHours.toFixed(1)}h`,
            actualHours: `${actual7Hours.toFixed(1)}h`,
            progressPercent,
            diffHoursFormatted: `${diffHours >= 0 ? "+" : ""}${diffHours.toFixed(1)}h`,
            diffPositive: diffHours >= 0,
            scheduledDaysCount,
          };
        }
      }
    }

    // Honest fallback: No schedule configured
    const baselineDailyHours = (stats.avgDaySeconds || 0) / 3600;
    return {
      hasSchedule: false,
      scheduledHours: "No schedule",
      actualHours: `${actual7Hours.toFixed(1)}h`,
      progressPercent: 0,
      baselineDailyHours: `${baselineDailyHours.toFixed(1)}h/day`,
      diffHoursFormatted: "",
      diffPositive: true,
      scheduledDaysCount: 0,
    };
  }, [effectiveSettings, rolling7Hours, stats.weekSeconds, stats.avgDaySeconds]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
      {/* CARD 1: My Time Today */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-5 shadow-sm transition-all duration-200 hover:shadow-md">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60 shadow-xs">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                My Time Today
              </h3>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60">
            TODAY
          </span>
        </div>

        <div className="my-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold font-mono text-gray-900 dark:text-white tracking-tight">
            {formatTimer(displayedWorkSeconds)}
          </h2>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-[#22324D]/80 flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5" title="Break time today">
            <Coffee className="w-3.5 h-3.5 text-amber-500" />
            <span>Break: {formatMinutesShort(todayBreakSeconds)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span>Week:</span>
            <span className="font-semibold text-gray-800 dark:text-slate-200">
              {formatHoursShort(stats.weekSeconds)}
            </span>
          </div>
        </div>
      </div>

      {/* CARD 2: My Activity Today */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-5 shadow-sm transition-all duration-200 hover:shadow-md">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 shadow-xs">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                My Activity Today
              </h3>
            </div>
          </div>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              !hasActivityData
                ? "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400"
                : activityScore >= 70
                ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
                : activityScore >= 50
                ? "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60"
                : "bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60"
            }`}
          >
            {!hasActivityData ? "NO DATA" : activityScore >= 70 ? "OPTIMAL" : activityScore >= 50 ? "MODERATE" : "LOW"}
          </span>
        </div>

        <div className="my-2">
          {activityLoading ? (
            <div className="h-9 flex items-center">
              <span className="text-sm text-gray-400 animate-pulse">Calculating activity...</span>
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              <h2 className="text-2xl sm:text-3xl font-extrabold font-mono text-gray-900 dark:text-white tracking-tight">
                {hasActivityData ? `${activityScore}%` : "0%"}
              </h2>
              <span className="text-xs text-gray-400 dark:text-slate-500">
                {hasActivityData ? "keystrokes & mouse" : "no activity logged"}
              </span>
            </div>
          )}
        </div>

        {/* Activity progress bar */}
        <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2 my-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              activityScore >= 70
                ? "bg-emerald-500"
                : activityScore >= 50
                ? "bg-amber-500"
                : "bg-rose-500"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, activityScore))}%` }}
          />
        </div>

        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-[#22324D]/80 flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
          <span>Active: {activeDurationStr}</span>
          <span>Idle: {idleDurationStr}</span>
        </div>
      </div>

      {/* CARD 3: My Norm — 7 Day */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-5 shadow-sm transition-all duration-200 hover:shadow-md">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800/60 shadow-xs">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                My Norm — 7 Day
              </h3>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/60">
            7-DAY
          </span>
        </div>

        <div className="my-2">
          {normCalculation.hasSchedule ? (
            <div className="flex items-baseline gap-2">
              <h2 className="text-2xl sm:text-3xl font-extrabold font-mono text-gray-900 dark:text-white tracking-tight">
                {normCalculation.actualHours}
              </h2>
              <span className="text-xs font-medium text-gray-500 dark:text-slate-400">
                / {normCalculation.scheduledHours}
              </span>
            </div>
          ) : (
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold font-mono text-gray-900 dark:text-white tracking-tight">
                {normCalculation.actualHours}
              </h2>
              <span className="text-xs text-gray-400 dark:text-slate-500">
                Tracked last 7 days
              </span>
            </div>
          )}
        </div>

        {/* Schedule Norm Bar */}
        {normCalculation.hasSchedule ? (
          <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2 my-2 overflow-hidden">
            <div
              className="h-full bg-cyan-500 rounded-full transition-all duration-500"
              style={{ width: `${normCalculation.progressPercent}%` }}
            />
          </div>
        ) : (
          <div className="my-2 text-[11px] text-gray-400 dark:text-slate-500">
            No shift schedule configured
          </div>
        )}

        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-[#22324D]/80 flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
          {normCalculation.hasSchedule ? (
            <>
              <span>Progress: {normCalculation.progressPercent}%</span>
              <span
                className={`font-semibold ${
                  normCalculation.diffPositive
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {normCalculation.diffHoursFormatted}
              </span>
            </>
          ) : (
            <>
              <span>Daily Baseline:</span>
              <span className="font-semibold text-gray-800 dark:text-slate-200">
                {normCalculation.baselineDailyHours}
              </span>
            </>
          )}
        </div>
      </div>

      {/* CARD 4: My Productivity Today */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-5 shadow-sm transition-all duration-200 hover:shadow-md">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                My Productivity
              </h3>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
            SCORE
          </span>
        </div>

        <div className="my-2">
          {productivity.loading ? (
            <div className="h-9 flex items-center">
              <span className="text-sm text-gray-400 animate-pulse">Calculating productivity...</span>
            </div>
          ) : productivity.isRestricted ? (
            <div>
              <h2 className="text-xl font-bold text-gray-700 dark:text-slate-300">
                Restricted
              </h2>
              <span className="text-[11px] text-gray-400 dark:text-slate-500">
                Access disabled by policy
              </span>
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              <h2 className="text-2xl sm:text-3xl font-extrabold font-mono text-gray-900 dark:text-white tracking-tight">
                {productivity.hasData ? `${productivity.productivePercent}%` : "0%"}
              </h2>
              <span className="text-xs text-gray-400 dark:text-slate-500">
                {productivity.hasData ? "productive time" : "no apps logged"}
              </span>
            </div>
          )}
        </div>

        {/* 3-Segment Stacked Progress Bar */}
        <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2 my-2 overflow-hidden flex">
          {productivity.hasData && !productivity.isRestricted ? (
            <>
              <div
                className="bg-emerald-500 h-full"
                style={{ width: `${productivity.productivePercent}%` }}
                title={`Productive: ${productivity.productivePercent}%`}
              />
              <div
                className="bg-slate-400 dark:bg-slate-500 h-full"
                style={{ width: `${productivity.neutralPercent}%` }}
                title={`Neutral: ${productivity.neutralPercent}%`}
              />
              <div
                className="bg-rose-500 h-full"
                style={{ width: `${productivity.unproductivePercent}%` }}
                title={`Unproductive: ${productivity.unproductivePercent}%`}
              />
            </>
          ) : (
            <div className="w-full h-full bg-gray-200 dark:bg-slate-700" />
          )}
        </div>

        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-[#22324D]/80 flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
          <span>Productive: {productivity.hasData ? formatMinutesShort(productivity.productiveSeconds) : "0m"}</span>
          <span>Unproductive: {productivity.hasData ? formatMinutesShort(productivity.unproductiveSeconds) : "0m"}</span>
        </div>
      </div>
    </div>
  );
}

