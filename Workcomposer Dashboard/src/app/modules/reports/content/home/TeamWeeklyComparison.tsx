"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import API from "@/api";
import {
  formatDateForApi,
  resolveSafeTimezone,
  addDaysInTimezone,
} from "@/utils/appTimezone";
import {
  HiOutlineCalendarDays,
  HiOutlineClock,
  HiOutlineUserGroup,
  HiOutlineSparkles,
  HiOutlineArrowTrendingUp,
  HiOutlineArrowTrendingDown,
  HiOutlineMinus,
  HiOutlineLockClosed,
  HiOutlineArrowPath,
  HiOutlineInformationCircle,
  HiOutlineExclamationCircle,
} from "react-icons/hi2";

export interface TeamWeeklyComparisonProps {
  timezone?: string;
  isAuthorized?: boolean;
}

export interface WeekPeriodRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  displayLabel: string; // e.g. "16 Nov – 22 Nov"
}

export interface CalendarWeekBoundaries {
  currentWeek: WeekPeriodRange;
  previousWeek: WeekPeriodRange;
  elapsedDays: number;
  isCurrentWeekInProgress: boolean;
}

/**
 * Calculates strict calendar week (Monday to Sunday) boundaries in the configured IANA timezone.
 * Monday is 00:00:00 through following Monday 00:00:00 (Sunday inclusive for display).
 */
export function calculateCalendarWeekBoundaries(
  referenceDate: Date = new Date(),
  timezone: string = "UTC"
): CalendarWeekBoundaries {
  const safeTz = resolveSafeTimezone(timezone);
  const now = referenceDate instanceof Date && !isNaN(referenceDate.getTime()) ? referenceDate : new Date();

  // Determine weekday in target timezone (Mon=0, Tue=1, ..., Sun=6)
  const weekdayStr = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTz,
    weekday: "short",
  }).format(now);

  const weekdayMap: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const dayIndex = weekdayMap[weekdayStr] ?? 0;

  // 1. Current Week: Monday to Sunday
  const currentWeekMonday = addDaysInTimezone(now, -dayIndex, safeTz);
  const currentWeekSunday = addDaysInTimezone(currentWeekMonday, 6, safeTz);

  // 2. Previous Week: Preceding Monday to Sunday
  const prevWeekMonday = addDaysInTimezone(currentWeekMonday, -7, safeTz);
  const prevWeekSunday = addDaysInTimezone(prevWeekMonday, 6, safeTz);

  // 3. Format Date labels (e.g. "16 Nov – 22 Nov")
  const formatRangeLabel = (start: Date, end: Date): string => {
    const startStr = new Intl.DateTimeFormat("en-US", {
      timeZone: safeTz,
      month: "short",
      day: "numeric",
    }).format(start);

    const endStr = new Intl.DateTimeFormat("en-US", {
      timeZone: safeTz,
      month: "short",
      day: "numeric",
    }).format(end);

    return `${startStr} – ${endStr}`;
  };

  const elapsedDays = Math.min(7, Math.max(1, dayIndex + 1));
  const isCurrentWeekInProgress = dayIndex < 6;

  return {
    currentWeek: {
      startDate: formatDateForApi(currentWeekMonday, safeTz),
      endDate: formatDateForApi(currentWeekSunday, safeTz),
      displayLabel: formatRangeLabel(currentWeekMonday, currentWeekSunday),
    },
    previousWeek: {
      startDate: formatDateForApi(prevWeekMonday, safeTz),
      endDate: formatDateForApi(prevWeekSunday, safeTz),
      displayLabel: formatRangeLabel(prevWeekMonday, prevWeekSunday),
    },
    elapsedDays,
    isCurrentWeekInProgress,
  };
}

/**
 * Formats seconds into human readable "Xh Ym" or "0h 0m".
 */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Calculates directional percentage change between current and previous values.
 * When previous is 0, percentage is null to prevent misleading infinite growth.
 */
export function calculateDelta(
  current: number,
  previous: number
): {
  diff: number;
  percent: number | null;
  direction: "up" | "down" | "neutral";
} {
  const diff = current - previous;
  if (Math.abs(diff) < 0.001) {
    return { diff: 0, percent: 0, direction: "neutral" };
  }
  if (previous <= 0) {
    return {
      diff,
      percent: null,
      direction: diff > 0 ? "up" : "down",
    };
  }
  const percent = Math.round((diff / previous) * 100);
  return {
    diff,
    percent,
    direction: diff > 0 ? "up" : "down",
  };
}

export default function TeamWeeklyComparison({
  timezone = "UTC",
  isAuthorized = true,
}: TeamWeeklyComparisonProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRestricted, setIsRestricted] = useState(false);

  // Period data states
  const [curAttendance, setCurAttendance] = useState<any[]>([]);
  const [curProductivity, setCurProductivity] = useState<any[]>([]);
  const [prevAttendance, setPrevAttendance] = useState<any[]>([]);
  const [prevProductivity, setPrevProductivity] = useState<any[]>([]);

  const fetchRequestIdRef = useRef(0);
  const inFlightRef = useRef(false);

  // 1. Resolve strict calendar week boundaries in configured timezone
  const boundaries = useMemo(() => {
    return calculateCalendarWeekBoundaries(new Date(), timezone);
  }, [timezone]);

  // 2. Authoritative Data Fetching Engine (Promise.allSettled)
  const fetchWeeklyData = useCallback(
    async (isBackground = false) => {
      if (!isAuthorized) return;
      if (inFlightRef.current && isBackground) return;

      const requestId = ++fetchRequestIdRef.current;
      inFlightRef.current = true;

      if (!isBackground) {
        setIsLoading(true);
      }

      const { currentWeek, previousWeek } = boundaries;

      try {
        const [curAttRes, curProdRes, prevAttRes, prevProdRes] = await Promise.allSettled([
          API.get(`/attendance?startDate=${currentWeek.startDate}&endDate=${currentWeek.endDate}`),
          API.get(`/reports/productivity?startDate=${currentWeek.startDate}&endDate=${currentWeek.endDate}`),
          API.get(`/attendance?startDate=${previousWeek.startDate}&endDate=${previousWeek.endDate}`),
          API.get(`/reports/productivity?startDate=${previousWeek.startDate}&endDate=${previousWeek.endDate}`),
        ]);

        if (requestId !== fetchRequestIdRef.current) return;

        // Check for HTTP 403 authorization refusals
        const any403 = [curAttRes, curProdRes, prevAttRes, prevProdRes].some(
          (res) => res.status === "rejected" && res.reason?.response?.status === 403
        );
        if (any403) {
          setIsRestricted(true);
          setErrorMessage(null);
          setIsLoading(false);
          setIsRefreshing(false);
          return;
        }

        // Process Current Week Attendance
        if (curAttRes.status === "fulfilled" && Array.isArray(curAttRes.value?.data)) {
          setCurAttendance(curAttRes.value.data);
        } else {
          setCurAttendance([]);
        }

        // Process Current Week Productivity
        if (curProdRes.status === "fulfilled" && Array.isArray(curProdRes.value?.data)) {
          setCurProductivity(curProdRes.value.data);
        } else {
          setCurProductivity([]);
        }

        // Process Previous Week Attendance
        if (prevAttRes.status === "fulfilled" && Array.isArray(prevAttRes.value?.data)) {
          setPrevAttendance(prevAttRes.value.data);
        } else {
          setPrevAttendance([]);
        }

        // Process Previous Week Productivity
        if (prevProdRes.status === "fulfilled" && Array.isArray(prevProdRes.value?.data)) {
          setPrevProductivity(prevProdRes.value.data);
        } else {
          setPrevProductivity([]);
        }

        setErrorMessage(null);
        setIsRestricted(false);
      } catch (err: any) {
        if (requestId === fetchRequestIdRef.current) {
          setErrorMessage(err?.message || "Failed to load weekly comparison records");
        }
      } finally {
        if (requestId === fetchRequestIdRef.current) {
          inFlightRef.current = false;
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [isAuthorized, boundaries]
  );

  useEffect(() => {
    if (isAuthorized) {
      fetchWeeklyData(false);
    }
  }, [isAuthorized, fetchWeeklyData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchWeeklyData(true);
  };

  // 3. Metric Aggregations & Fair Comparison Calculations
  const metrics = useMemo(() => {
    // A. Current Week Aggregations
    const curUserMap = new Map<string, { workSeconds: number; breakSeconds: number }>();
    for (const item of curAttendance) {
      const id = String(item.id || item._id || item.userId || "");
      if (!id) continue;
      const work = Math.max(0, Number(item.workSeconds) || 0);
      const brk = Math.max(0, Number(item.breakSeconds) || 0);
      if (!curUserMap.has(id)) {
        curUserMap.set(id, { workSeconds: work, breakSeconds: brk });
      } else {
        const existing = curUserMap.get(id)!;
        existing.workSeconds += work;
        existing.breakSeconds += brk;
      }
    }

    let curTotalWorkSec = 0;
    let curTotalBreakSec = 0;
    let curActiveContributors = 0;

    for (const u of curUserMap.values()) {
      curTotalWorkSec += u.workSeconds;
      curTotalBreakSec += u.breakSeconds;
      if (u.workSeconds > 0) curActiveContributors++;
    }

    // B. Previous Week Aggregations
    const prevUserMap = new Map<string, { workSeconds: number; breakSeconds: number }>();
    for (const item of prevAttendance) {
      const id = String(item.id || item._id || item.userId || "");
      if (!id) continue;
      const work = Math.max(0, Number(item.workSeconds) || 0);
      const brk = Math.max(0, Number(item.breakSeconds) || 0);
      if (!prevUserMap.has(id)) {
        prevUserMap.set(id, { workSeconds: work, breakSeconds: brk });
      } else {
        const existing = prevUserMap.get(id)!;
        existing.workSeconds += work;
        existing.breakSeconds += brk;
      }
    }

    let prevTotalWorkSec = 0;
    let prevTotalBreakSec = 0;
    let prevActiveContributors = 0;

    for (const u of prevUserMap.values()) {
      prevTotalWorkSec += u.workSeconds;
      prevTotalBreakSec += u.breakSeconds;
      if (u.workSeconds > 0) prevActiveContributors++;
    }

    // C. Daily Work Pace (Fair comparison based on elapsed days)
    const elapsedDays = boundaries.elapsedDays;
    const curDailyAvgSec = elapsedDays > 0 ? Math.round(curTotalWorkSec / elapsedDays) : 0;
    const prevDailyAvgSec = Math.round(prevTotalWorkSec / 7);

    // D. Productivity Seconds Aggregations
    let curProdSec = 0;
    let curNeutSec = 0;
    let curUnprodSec = 0;
    for (const item of curProductivity) {
      curProdSec += Math.max(0, Number(item.productiveSeconds) || 0);
      curNeutSec += Math.max(0, Number(item.neutralSeconds) || 0);
      curUnprodSec += Math.max(0, Number(item.unproductiveSeconds) || 0);
    }
    const curTotalTrackedSec = curProdSec + curNeutSec + curUnprodSec;
    const curProdPercent = curTotalTrackedSec > 0 ? Math.round((curProdSec / curTotalTrackedSec) * 100) : 0;

    let prevProdSec = 0;
    let prevNeutSec = 0;
    let prevUnprodSec = 0;
    for (const item of prevProductivity) {
      prevProdSec += Math.max(0, Number(item.productiveSeconds) || 0);
      prevNeutSec += Math.max(0, Number(item.neutralSeconds) || 0);
      prevUnprodSec += Math.max(0, Number(item.unproductiveSeconds) || 0);
    }
    const prevTotalTrackedSec = prevProdSec + prevNeutSec + prevUnprodSec;
    const prevProdPercent = prevTotalTrackedSec > 0 ? Math.round((prevProdSec / prevTotalTrackedSec) * 100) : 0;

    // Deltas
    const workTimeDelta = calculateDelta(curTotalWorkSec, prevTotalWorkSec);
    const dailyPaceDelta = calculateDelta(curDailyAvgSec, prevDailyAvgSec);
    const contributorsDelta = calculateDelta(curActiveContributors, prevActiveContributors);
    const prodPercentDelta = calculateDelta(curProdPercent, prevProdPercent);

    const hasAnyData = curTotalWorkSec > 0 || prevTotalWorkSec > 0;

    return {
      curTotalWorkSec,
      prevTotalWorkSec,
      curDailyAvgSec,
      prevDailyAvgSec,
      curActiveContributors,
      prevActiveContributors,
      curProdPercent,
      prevProdPercent,
      curProdSec,
      prevProdSec,
      curTotalBreakSec,
      prevTotalBreakSec,
      workTimeDelta,
      dailyPaceDelta,
      contributorsDelta,
      prodPercentDelta,
      hasAnyData,
    };
  }, [curAttendance, prevAttendance, curProductivity, prevProductivity, boundaries.elapsedDays]);

  // Guard 1: Unauthorized State
  if (!isAuthorized) {
    return null;
  }

  return (
    <div
      id="weekly-comparison"
      data-testid="team-weekly-comparison-card"
      className="rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-5 sm:p-6 shadow-xs transition-colors duration-200 space-y-5"
    >
      {/* 1. Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-100 dark:border-[#22324D]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/70 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
            <HiOutlineCalendarDays className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Weekly Comparison
              </h3>
              {boundaries.isCurrentWeekInProgress ? (
                <span
                  data-testid="weekly-in-progress-badge"
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/80"
                >
                  Week in Progress · Day {boundaries.elapsedDays} of 7
                </span>
              ) : (
                <span
                  data-testid="weekly-completed-badge"
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80"
                >
                  Full Week Completed
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
              Comparing Current Calendar Week (
              <span className="font-semibold text-gray-700 dark:text-slate-300" data-testid="current-week-label">
                {boundaries.currentWeek.displayLabel}
              </span>
              ) vs Previous (
              <span className="font-semibold text-gray-700 dark:text-slate-300" data-testid="prev-week-label">
                {boundaries.previousWeek.displayLabel}
              </span>
              )
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
          data-testid="weekly-comparison-refresh-btn"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer self-start sm:self-auto disabled:opacity-50"
        >
          <HiOutlineArrowPath className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          <span>Refresh Comparison</span>
        </button>
      </div>

      {/* 2. State Handling */}
      {isLoading ? (
        /* State A: Loading Skeleton */
        <div data-testid="weekly-comparison-loading" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 py-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-gray-100 dark:bg-slate-800/60" />
          ))}
        </div>
      ) : isRestricted ? (
        /* State B: HTTP 403 Restricted Card */
        <div
          data-testid="weekly-comparison-restricted"
          className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 p-6 text-center space-y-2"
        >
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 mb-1">
            <HiOutlineLockClosed className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-gray-900 dark:text-white">
            Team Comparison Restricted
          </h4>
          <p className="text-xs text-gray-600 dark:text-slate-400 max-w-md mx-auto">
            Viewing team-wide weekly performance comparison requires Team Manager or Organization
            Admin privileges.
          </p>
        </div>
      ) : errorMessage ? (
        /* State C: Error Banner with Retry */
        <div
          data-testid="weekly-comparison-error"
          className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 p-5 space-y-3"
        >
          <div className="flex items-center gap-3 text-rose-700 dark:text-rose-300 text-xs font-semibold">
            <HiOutlineExclamationCircle className="w-5 h-5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchWeeklyData(false)}
            data-testid="weekly-comparison-retry-btn"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-rose-900/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 hover:bg-rose-50 cursor-pointer shadow-xs"
          >
            <HiOutlineArrowPath className="w-3.5 h-3.5" />
            <span>Retry Comparison</span>
          </button>
        </div>
      ) : !metrics.hasAnyData ? (
        /* State D: Empty Comparison State */
        <div
          data-testid="weekly-comparison-empty"
          className="py-10 text-center space-y-2 border border-dashed border-gray-200 dark:border-slate-800 rounded-xl"
        >
          <HiOutlineCalendarDays className="w-8 h-8 text-gray-300 dark:text-slate-600 mx-auto" />
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
            No Weekly Comparison Data Available
          </h4>
          <p className="text-xs text-gray-500 dark:text-slate-400 max-w-sm mx-auto">
            No tracked team activity was recorded for either the current or previous calendar week.
          </p>
        </div>
      ) : (
        /* State E: Populated Comparison View */
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Work Time */}
            <div
              data-testid="metric-card-total-work"
              className="p-4 rounded-xl border border-gray-100 dark:border-[#22324D] bg-gray-50/60 dark:bg-[#1E293B]/40 flex flex-col justify-between space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                  Total Work Time
                </span>
                <HiOutlineClock className="w-4 h-4 text-blue-500" />
              </div>

              <div>
                <div className="text-xl font-extrabold text-gray-900 dark:text-white">
                  {formatDuration(metrics.curTotalWorkSec)}
                </div>
                <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                  vs {formatDuration(metrics.prevTotalWorkSec)} prev week
                </div>
              </div>

              <div className="pt-2 border-t border-gray-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs">
                <span className="text-gray-400 dark:text-slate-500 text-[11px]">Period Total:</span>
                <span
                  data-testid="total-work-delta"
                  className={`inline-flex items-center gap-1 font-semibold text-xs ${
                    metrics.workTimeDelta.direction === "up"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : metrics.workTimeDelta.direction === "down"
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-gray-500 dark:text-slate-400"
                  }`}
                >
                  {metrics.workTimeDelta.direction === "up" && <HiOutlineArrowTrendingUp className="w-3.5 h-3.5" />}
                  {metrics.workTimeDelta.direction === "down" && <HiOutlineArrowTrendingDown className="w-3.5 h-3.5" />}
                  {metrics.workTimeDelta.direction === "neutral" && <HiOutlineMinus className="w-3.5 h-3.5" />}
                  <span>
                    {metrics.workTimeDelta.diff >= 0 ? "+" : "-"}
                    {formatDuration(Math.abs(metrics.workTimeDelta.diff))}
                    {metrics.workTimeDelta.percent !== null && ` (${metrics.workTimeDelta.percent > 0 ? "+" : ""}${metrics.workTimeDelta.percent}%)`}
                  </span>
                </span>
              </div>
            </div>

            {/* Card 2: Daily Pace (Fair Comparison across elapsed days) */}
            <div
              data-testid="metric-card-daily-pace"
              className="p-4 rounded-xl border border-gray-100 dark:border-[#22324D] bg-gray-50/60 dark:bg-[#1E293B]/40 flex flex-col justify-between space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                  Daily Work Pace
                </span>
                <HiOutlineInformationCircle
                  className="w-4 h-4 text-emerald-500"
                  title="Daily pace calculates average daily work using only elapsed days for the current week against completed days for previous week"
                />
              </div>

              <div>
                <div className="text-xl font-extrabold text-gray-900 dark:text-white">
                  {formatDuration(metrics.curDailyAvgSec)}
                  <span className="text-xs font-normal text-gray-400 dark:text-slate-500"> / day</span>
                </div>
                <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                  vs {formatDuration(metrics.prevDailyAvgSec)} / day prev
                </div>
              </div>

              <div className="pt-2 border-t border-gray-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs">
                <span className="text-gray-400 dark:text-slate-500 text-[11px]" data-testid="daily-pace-denominator">
                  {boundaries.elapsedDays}d vs 7d pace:
                </span>
                <span
                  data-testid="daily-pace-delta"
                  className={`inline-flex items-center gap-1 font-semibold text-xs ${
                    metrics.dailyPaceDelta.direction === "up"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : metrics.dailyPaceDelta.direction === "down"
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-gray-500 dark:text-slate-400"
                  }`}
                >
                  {metrics.dailyPaceDelta.direction === "up" && <HiOutlineArrowTrendingUp className="w-3.5 h-3.5" />}
                  {metrics.dailyPaceDelta.direction === "down" && <HiOutlineArrowTrendingDown className="w-3.5 h-3.5" />}
                  {metrics.dailyPaceDelta.direction === "neutral" && <HiOutlineMinus className="w-3.5 h-3.5" />}
                  <span>
                    {metrics.dailyPaceDelta.percent !== null
                      ? `${metrics.dailyPaceDelta.percent > 0 ? "+" : ""}${metrics.dailyPaceDelta.percent}%`
                      : metrics.dailyPaceDelta.diff > 0 ? "+gain" : "unchanged"}
                  </span>
                </span>
              </div>
            </div>

            {/* Card 3: Active Contributors */}
            <div
              data-testid="metric-card-contributors"
              className="p-4 rounded-xl border border-gray-100 dark:border-[#22324D] bg-gray-50/60 dark:bg-[#1E293B]/40 flex flex-col justify-between space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                  Active Contributors
                </span>
                <HiOutlineUserGroup className="w-4 h-4 text-indigo-500" />
              </div>

              <div>
                <div className="text-xl font-extrabold text-gray-900 dark:text-white">
                  {metrics.curActiveContributors}
                  <span className="text-xs font-normal text-gray-400 dark:text-slate-500">
                    {" "}{metrics.curActiveContributors === 1 ? "member" : "members"}
                  </span>
                </div>
                <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                  vs {metrics.prevActiveContributors} active prev week
                </div>
              </div>

              <div className="pt-2 border-t border-gray-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs">
                <span className="text-gray-400 dark:text-slate-500 text-[11px]">Roster Shift:</span>
                <span
                  data-testid="contributors-delta"
                  className={`inline-flex items-center gap-1 font-semibold text-xs ${
                    metrics.contributorsDelta.direction === "up"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : metrics.contributorsDelta.direction === "down"
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-gray-500 dark:text-slate-400"
                  }`}
                >
                  {metrics.contributorsDelta.direction === "up" && <HiOutlineArrowTrendingUp className="w-3.5 h-3.5" />}
                  {metrics.contributorsDelta.direction === "down" && <HiOutlineArrowTrendingDown className="w-3.5 h-3.5" />}
                  {metrics.contributorsDelta.direction === "neutral" && <HiOutlineMinus className="w-3.5 h-3.5" />}
                  <span>
                    {metrics.contributorsDelta.diff > 0 ? `+${metrics.contributorsDelta.diff}` : `${metrics.contributorsDelta.diff}`}
                    {" "}net
                  </span>
                </span>
              </div>
            </div>

            {/* Card 4: Team Productivity */}
            <div
              data-testid="metric-card-productivity"
              className="p-4 rounded-xl border border-gray-100 dark:border-[#22324D] bg-gray-50/60 dark:bg-[#1E293B]/40 flex flex-col justify-between space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                  Productivity Rate
                </span>
                <HiOutlineSparkles className="w-4 h-4 text-amber-500" />
              </div>

              <div>
                <div className="text-xl font-extrabold text-gray-900 dark:text-white">
                  {metrics.curProdPercent}%
                  <span className="text-xs font-normal text-gray-400 dark:text-slate-500"> productive</span>
                </div>
                <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                  vs {metrics.prevProdPercent}% prev week
                </div>
              </div>

              <div className="pt-2 border-t border-gray-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs">
                <span className="text-gray-400 dark:text-slate-500 text-[11px]">Quality Shift:</span>
                <span
                  data-testid="productivity-delta"
                  className={`inline-flex items-center gap-1 font-semibold text-xs ${
                    metrics.prodPercentDelta.direction === "up"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : metrics.prodPercentDelta.direction === "down"
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-gray-500 dark:text-slate-400"
                  }`}
                >
                  {metrics.prodPercentDelta.direction === "up" && <HiOutlineArrowTrendingUp className="w-3.5 h-3.5" />}
                  {metrics.prodPercentDelta.direction === "down" && <HiOutlineArrowTrendingDown className="w-3.5 h-3.5" />}
                  {metrics.prodPercentDelta.direction === "neutral" && <HiOutlineMinus className="w-3.5 h-3.5" />}
                  <span>
                    {metrics.prodPercentDelta.diff > 0 ? `+${metrics.prodPercentDelta.diff}%` : `${metrics.prodPercentDelta.diff}%`} pts
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Sub-bar: Fair Comparison Context Notice */}
          {boundaries.isCurrentWeekInProgress && (
            <div
              data-testid="weekly-comparison-fair-notice"
              className="flex items-start gap-2.5 p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/60 text-xs text-blue-800 dark:text-blue-300"
            >
              <HiOutlineInformationCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
              <span>
                <strong>Fair Comparison Notice:</strong> The current week is currently in progress (Day {boundaries.elapsedDays} of 7). Period totals reflect accumulated hours to date. For an accurate pace evaluation, refer to the <strong>Daily Work Pace</strong> metric which compares elapsed working days rather than raw 7-day totals.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

