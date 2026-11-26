"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Clock, AlertCircle } from "lucide-react";

export interface HourItem {
  time: string;
  work: number; // in hours
  break: number; // in hours
}

interface Props {
  data: HourItem[];
  loading: boolean;
  timezone: string;
}

export default function PersonalDayTimeline({ data, loading, timezone }: Props) {
  // 1. Calculate totals for today
  const { totalWorkHours, totalBreakHours, hasActivity } = useMemo(() => {
    let workSum = 0;
    let breakSum = 0;
    data.forEach((d) => {
      workSum += Number(d.work) || 0;
      breakSum += Number(d.break) || 0;
    });

    return {
      totalWorkHours: workSum,
      totalBreakHours: breakSum,
      hasActivity: workSum > 0 || breakSum > 0,
    };
  }, [data]);

  const formatHoursShort = (hours: number) => {
    const totalMinutes = Math.round(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  };

  const formatYAxis = (hours: number) => {
    if (hours === 0) return "0m";
    const minutes = Math.round(hours * 60);
    return `${minutes}m`;
  };

  // Custom accessible Tooltip
  const CustomTimelineTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    const workVal = Number(payload[0]?.value) || 0;
    const breakVal = Number(payload[1]?.value) || 0;

    return (
      <div className="rounded-xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-3 shadow-lg text-xs z-50">
        <p className="font-bold text-gray-900 dark:text-white mb-1.5 pb-1 border-b border-gray-100 dark:border-[#22324D]">
          {label} ({timezone})
        </p>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              Worked Time:
            </span>
            <span className="font-mono font-bold text-gray-800 dark:text-slate-200">
              {formatHoursShort(workVal)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Break Time:
            </span>
            <span className="font-mono font-bold text-gray-800 dark:text-slate-200">
              {formatHoursShort(breakVal)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-5 sm:p-6 shadow-sm transition-colors duration-200">
      {/* Header & Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 pb-4 border-b border-gray-100 dark:border-[#22324D]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60 shadow-xs">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              My Day Timeline
            </h2>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Today&apos;s hourly tracking and break intervals in {timezone}
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-indigo-500" />
            <span className="text-gray-600 dark:text-slate-300 font-medium">
              Worked Time ({formatHoursShort(totalWorkHours)})
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-amber-500" />
            <span className="text-gray-600 dark:text-slate-300 font-medium">
              Break Time ({formatHoursShort(totalBreakHours)})
            </span>
          </div>
        </div>
      </div>

      {/* Chart Canvas or Empty State */}
      <div className="w-full min-h-[220px] flex items-center justify-center">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 dark:border-gray-700 border-t-indigo-600" />
            <p className="mt-3 text-xs font-medium text-gray-500 dark:text-slate-400">
              Loading day timeline...
            </p>
          </div>
        ) : !hasActivity ? (
          <div className="w-full py-10 px-4 text-center rounded-xl bg-gray-50/70 dark:bg-[#1E293B]/40 border border-dashed border-gray-200 dark:border-[#22324D]">
            <Clock className="w-10 h-10 mx-auto text-gray-300 dark:text-slate-600 mb-2" />
            <h4 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">
              No Tracking Sessions Recorded Today
            </h4>
            <p className="text-xs text-gray-400 dark:text-slate-400 max-w-sm mx-auto">
              Hourly work intervals and break periods will appear here chronologically as you track time today.
            </p>
          </div>
        ) : (
          <div className="w-full h-56 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                barSize={12}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#334155"
                  opacity={0.15}
                />
                <XAxis
                  dataKey="time"
                  stroke="#94A3B8"
                  fontSize={10}
                  tickLine={false}
                  interval={2}
                />
                <YAxis
                  stroke="#94A3B8"
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={formatYAxis}
                  domain={[0, 1]}
                />
                <Tooltip
                  content={<CustomTimelineTooltip />}
                  cursor={{ fill: "rgba(99, 102, 241, 0.08)" }}
                />
                <Bar
                  dataKey="work"
                  name="Worked Time"
                  fill="#6366F1"
                  stackId="a"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="break"
                  name="Break Time"
                  fill="#F59E0B"
                  stackId="a"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

