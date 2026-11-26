"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { Calendar, TrendingUp, TrendingDown, Minus } from "lucide-react";

export interface DailyRecord {
  day: string; // e.g. "Nov 16"
  work: number; // in hours
  break: number; // in hours
}

interface Props {
  last30Days: DailyRecord[];
  loading: boolean;
  timezone: string;
  todayActivityScore: number;
}

type Mode = "hours" | "activity";

export default function PersonalWeekComparison({
  last30Days,
  loading,
  timezone,
  todayActivityScore,
}: Props) {
  const [mode, setMode] = useState<Mode>("hours");

  // 1. Build weekly comparison aligned by weekday (Mon -> Sun)
  const { comparisonData, currentWeekTotalHours, prevWeekTotalHours, deltaHoursPercent, hasData } =
    useMemo(() => {
      if (!last30Days || last30Days.length === 0) {
        return {
          comparisonData: [],
          currentWeekTotalHours: 0,
          prevWeekTotalHours: 0,
          deltaHoursPercent: 0,
          hasData: false,
        };
      }

      // Today's day of week in timezone (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
      }).format(now);

      const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      // Convert standard 0=Sun to Monday-based index: Mon=0, Tue=1, ..., Sun=6
      const weekdayMap: Record<string, number> = {
        Mon: 0,
        Tue: 1,
        Wed: 2,
        Thu: 3,
        Fri: 4,
        Sat: 5,
        Sun: 6,
      };
      const currentDayIndex = weekdayMap[parts] !== undefined ? weekdayMap[parts] : 0;

      // Index of today in last30Days is the last element
      const todayIndexInArray = last30Days.length - 1;

      // Build data for each of the 7 days (Mon to Sun)
      let curSum = 0;
      let prevSum = 0;

      const items = weekdayNames.map((dayName, idx) => {
        const offsetFromToday = idx - currentDayIndex;
        const isFuture = offsetFromToday > 0;
        const curIndex = todayIndexInArray + offsetFromToday;
        const prevIndex = curIndex - 7;

        const curItem = !isFuture && curIndex >= 0 && curIndex < last30Days.length
          ? last30Days[curIndex]
          : null;
        const prevItem = prevIndex >= 0 && prevIndex < last30Days.length
          ? last30Days[prevIndex]
          : null;

        const curWork = curItem ? Number(curItem.work) || 0 : 0;
        const prevWork = prevItem ? Number(prevItem.work) || 0 : 0;

        curSum += curWork;
        prevSum += prevWork;

        // Activity estimation: today uses actual activity score; past days with work scaled proportionally
        const curActivity = isFuture
          ? 0
          : offsetFromToday === 0
          ? todayActivityScore
          : curWork > 0
          ? Math.min(100, Math.round(65 + Math.min(30, curWork * 4)))
          : 0;

        const prevActivity = prevWork > 0
          ? Math.min(100, Math.round(65 + Math.min(30, prevWork * 4)))
          : 0;

        return {
          day: dayName,
          currentWeekHours: Number(curWork.toFixed(1)),
          previousWeekHours: Number(prevWork.toFixed(1)),
          currentWeekActivity: curActivity,
          previousWeekActivity: prevActivity,
          isFuture,
          isToday: offsetFromToday === 0,
        };
      });

      // Calculate percentage delta
      let deltaPercent = 0;
      if (prevSum > 0) {
        deltaPercent = Math.round(((curSum - prevSum) / prevSum) * 100);
      } else if (curSum > 0) {
        deltaPercent = 100;
      }

      return {
        comparisonData: items,
        currentWeekTotalHours: Number(curSum.toFixed(1)),
        prevWeekTotalHours: Number(prevSum.toFixed(1)),
        deltaHoursPercent: deltaPercent,
        hasData: curSum > 0 || prevSum > 0,
      };
    }, [last30Days, timezone, todayActivityScore]);

  // Custom accessible Tooltip
  const CustomWeekTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    const curVal = payload[0]?.value;
    const prevVal = payload[1]?.value;
    const itemData = payload[0]?.payload;

    return (
      <div className="rounded-xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-3 shadow-lg text-xs z-50">
        <p className="font-bold text-gray-900 dark:text-white mb-1.5 pb-1 border-b border-gray-100 dark:border-[#22324D]">
          {label} {itemData?.isToday ? "(Today)" : itemData?.isFuture ? "(Upcoming)" : ""}
        </p>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              This Week:
            </span>
            <span className="font-mono font-bold text-gray-800 dark:text-slate-200">
              {itemData?.isFuture ? "Pending" : mode === "hours" ? `${curVal}h` : `${curVal}%`}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              Last Week:
            </span>
            <span className="font-mono font-bold text-gray-800 dark:text-slate-200">
              {mode === "hours" ? `${prevVal}h` : `${prevVal}%`}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-5 sm:p-6 shadow-sm transition-colors duration-200">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 pb-4 border-b border-gray-100 dark:border-[#22324D]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800/60 shadow-xs">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              My Week
            </h2>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Comparison between current week and previous week
            </p>
          </div>
        </div>

        {/* Mode Toggle Pill */}
        <div className="flex items-center p-0.5 rounded-lg bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-[#22324D]">
          <button
            type="button"
            onClick={() => setMode("hours")}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              mode === "hours"
                ? "bg-white dark:bg-[#0F172A] text-indigo-600 dark:text-indigo-400 shadow-xs"
                : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            Hours
          </button>
          <button
            type="button"
            onClick={() => setMode("activity")}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              mode === "activity"
                ? "bg-white dark:bg-[#0F172A] text-indigo-600 dark:text-indigo-400 shadow-xs"
                : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            Activity %
          </button>
        </div>
      </div>

      {/* Summary KPI Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 p-3 rounded-xl bg-gray-50/70 dark:bg-[#1E293B]/40 border border-gray-100 dark:border-[#22324D]">
        <div>
          <span className="text-[11px] text-gray-500 dark:text-slate-400 block">
            This Week Total
          </span>
          <span className="text-base font-extrabold font-mono text-indigo-600 dark:text-indigo-400">
            {currentWeekTotalHours}h
          </span>
        </div>
        <div>
          <span className="text-[11px] text-gray-500 dark:text-slate-400 block">
            Last Week Total
          </span>
          <span className="text-base font-extrabold font-mono text-slate-700 dark:text-slate-300">
            {prevWeekTotalHours}h
          </span>
        </div>
        <div className="col-span-2 sm:col-span-1 flex items-center gap-1.5 sm:justify-end">
          {deltaHoursPercent > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-3.5 h-3.5" />
              +{deltaHoursPercent}% vs last week
            </span>
          ) : deltaHoursPercent < 0 ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400">
              <TrendingDown className="w-3.5 h-3.5" />
              {deltaHoursPercent}% vs last week
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 dark:text-slate-400">
              <Minus className="w-3.5 h-3.5" />
              On par with last week
            </span>
          )}
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="w-full min-h-[200px] flex items-center justify-center">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 dark:border-gray-700 border-t-indigo-600" />
            <p className="mt-3 text-xs font-medium text-gray-500 dark:text-slate-400">
              Loading weekly comparison...
            </p>
          </div>
        ) : !hasData ? (
          <div className="w-full py-8 text-center text-xs text-gray-400 dark:text-slate-400">
            No weekly tracking history recorded yet.
          </div>
        ) : (
          <div className="w-full h-56 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={comparisonData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                barGap={4}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#334155"
                  opacity={0.15}
                />
                <XAxis
                  dataKey="day"
                  stroke="#94A3B8"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  stroke="#94A3B8"
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(val) => (mode === "hours" ? `${val}h` : `${val}%`)}
                />
                <Tooltip content={<CustomWeekTooltip />} cursor={{ fill: "rgba(99, 102, 241, 0.06)" }} />
                <Bar
                  dataKey={mode === "hours" ? "currentWeekHours" : "currentWeekActivity"}
                  name="This Week"
                  fill="#6366F1"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={22}
                />
                <Bar
                  dataKey={mode === "hours" ? "previousWeekHours" : "previousWeekActivity"}
                  name="Last Week"
                  fill="#94A3B8"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

