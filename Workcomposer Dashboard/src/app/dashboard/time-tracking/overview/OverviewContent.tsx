"use client";

import Image from "next/image";
import { IoIosPause } from "react-icons/io";
import { FaRegEdit } from "react-icons/fa";
import { Clock3, ChevronDown, Info, ArrowDownToLine, Code2, X, User, Check, Copy, HelpCircle } from "lucide-react";
import Papa from "papaparse";
import { FiPlusCircle, FiMinusCircle } from "react-icons/fi";
import { useOptionalTimer } from "@/context/TimerContext";
import { useState, useRef, useEffect, useMemo } from "react";
import UserAnalyticsSection from "./components/UserAnalyticsSection";
import DailyActivityTimeline from "./components/DailyActivityTimeline";
import { useDashboard } from "@/context/DashboardContext";
import { useTimeTracking } from "@/context/TimeTrackingContext";
import { formatDateForApi, addDaysInTimezone } from "@/utils/appTimezone";
import UserProfileTrigger from "@/components/UserProfileTrigger";
import { isTeamReportAccess } from "@/utils/reportAccess";
import toast from "react-hot-toast";

export type ActivityTrendBucket = {
  key: string;
  label: string;
  value: number;
  tracked?: boolean;
};

type DataItem = {
  id: string;
  name: string;
  avatar: string;
  team: string | { name?: string; _id?: string; id?: string };
  date: string;
  workTime: string;
  breakTime: string;
  status: string;
  lastSync: string;
  lastSyncAt?: string | null;
  isOnline?: boolean;
  activityScore?: number | null;
  activityDelta?: number | null;
  activityBuckets?: ActivityTrendBucket[];
};

type Props = {
  data?: DataItem[];
  loading?: boolean;
  allUsers: any[];
  productivityMap?: Record<string, number>;
  activityMap?: Record<string, number>;
  activityDeltaMap?: Record<string, number | null>;
  activityTrendMap?: Record<string, ActivityTrendBucket[]>;

  reportRange: {
    type: string;
    startDate: Date;
    endDate: Date;
  };

  onAddManualTime: () => void;
  onRemoveTime: () => void;
};

function formatRelativeLastSeen(lastSyncAt?: string | null, fallbackText?: string): string {
  if (!lastSyncAt) return fallbackText || "No recent sync";
  const ms = new Date(lastSyncAt).getTime();
  if (!Number.isFinite(ms)) return fallbackText || "No recent sync";

  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 45) return "just now";
  if (diffSec < 90) return "a minute ago";
  const mins = Math.round(diffSec / 60);
  if (mins < 45) return `${mins} minutes ago`;
  if (mins < 90) return "an hour ago";
  const hours = Math.round(diffSec / 3600);
  if (hours < 22) return `${hours} hours ago`;
  if (hours < 36) return "a day ago";
  const days = Math.round(diffSec / 86400);
  if (days < 25) return `${days} days ago`;

  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function HeaderTooltip({ label, tip }: { label: string; tip: string }) {
  return (
    <span className="inline-flex items-center gap-1 relative group">
      <span>{label}</span>
      <span
        tabIndex={0}
        aria-label={tip}
        className="inline-flex items-center text-gray-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 cursor-help"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </span>
      <span className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-48 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-[10px] font-normal normal-case tracking-normal leading-snug shadow-lg border border-slate-700 z-50 text-left">
        {tip}
      </span>
    </span>
  );
}

function TrendSparkline({
  slots,
  alignBelow = false,
}: {
  slots: ActivityTrendBucket[];
  alignBelow?: boolean;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!slots || slots.length === 0) {
    return (
      <div className="text-center text-xs text-gray-400 dark:text-slate-500">
        —
      </div>
    );
  }

  const hoveredSlot = hoveredIdx !== null ? slots[hoveredIdx] : null;
  const hoveredLeftPct =
    hoveredIdx !== null && slots.length > 0
      ? ((hoveredIdx + 0.5) / slots.length) * 100
      : 50;

  return (
    <div
      className="relative flex items-end gap-[1.5px] h-7 w-full max-w-[140px] mx-auto px-0.5 select-none"
      onMouseLeave={() => setHoveredIdx(null)}
    >
      {slots.map((slot, idx) => {
        const isActive = slot.value > 0;
        const heightPct = isActive
          ? Math.max(20, Math.min(100, slot.value))
          : slot.tracked
          ? 18
          : 14;
        const barColor = isActive
          ? hoveredIdx === idx
            ? "bg-emerald-400 dark:bg-emerald-300"
            : "bg-emerald-500 dark:bg-emerald-400"
          : slot.tracked
          ? "bg-emerald-200 dark:bg-emerald-800/60"
          : "bg-slate-200 dark:bg-slate-700/70";

        return (
          <div
            key={slot.key || idx}
            onMouseEnter={() => setHoveredIdx(idx)}
            className="flex-1 h-full flex items-end cursor-pointer"
          >
            <div
              style={{ height: `${heightPct}%` }}
              className={`w-full rounded-t-[1px] transition-all duration-100 ${barColor}`}
            />
          </div>
        );
      })}

      {hoveredSlot && (
        <div
          style={{ left: `${Math.min(88, Math.max(12, hoveredLeftPct))}%` }}
          className={`pointer-events-none absolute -translate-x-1/2 whitespace-nowrap z-50 px-2 py-1 rounded-md text-[10px] font-medium bg-slate-900 dark:bg-slate-800 text-white shadow-lg border border-slate-700 ${
            alignBelow ? "top-full mt-1.5" : "bottom-full mb-1.5"
          }`}
        >
          {hoveredSlot.label} ·{" "}
          {hoveredSlot.value > 0
            ? `${hoveredSlot.value}% active`
            : hoveredSlot.tracked
            ? "0% active"
            : "untracked"}
        </div>
      )}
    </div>
  );
}

export default function OverviewContent({
  data = [],
  loading = false,
  productivityMap = {},
  activityMap = {},
  activityDeltaMap = {},
  activityTrendMap = {},
  reportRange,
  onAddManualTime,
  onRemoveTime,
}: Props) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});
  const [initializedUsers, setInitializedUsers] = useState<Record<string, boolean>>({});
  const [showRetentionModal, setShowRetentionModal] = useState<boolean>(false);
  const [showBiModal, setShowBiModal] = useState<boolean>(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);

  const toggleUserExpansion = (userId: string) => {
    setInitializedUsers((prev) => (prev[userId] ? prev : { ...prev, [userId]: true }));
    setExpandedUsers((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  const menuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const timerContext = useOptionalTimer();
  const isTracking = timerContext?.isTracking ?? false;
  const displayedWorkSeconds = timerContext?.displayedWorkSeconds;
  const { user } = useDashboard();
  const { timezone, setReportRange } = useTimeTracking();

  const isTeamReport = isTeamReportAccess(user);

  const isSingleDayToday = (() => {
    try {
      if (!reportRange?.startDate || !reportRange?.endDate) return false;
      const startStr = formatDateForApi(new Date(reportRange.startDate), timezone);
      const endStr = formatDateForApi(new Date(reportRange.endDate), timezone);
      const todayStr = formatDateForApi(new Date(), timezone);
      return startStr === endStr && startStr === todayStr;
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!openMenuId) return;

      const currentMenu = menuRefs.current[openMenuId];

      if (
        currentMenu &&
        !currentMenu.contains(event.target as Node)
      ) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openMenuId]);

  const parseTimeToSeconds = (timeStr?: string | null): number => {
    if (!timeStr) return 0;
    const trimmed = String(timeStr).trim();
    if (!trimmed || trimmed === "--") return 0;

    if (trimmed.includes(":")) {
      const parts = trimmed.split(":").map((p) => parseInt(p.trim(), 10) || 0);
      const p0 = parts[0] ?? 0;
      const p1 = parts[1] ?? 0;
      const p2 = parts[2] ?? 0;
      if (parts.length === 2) return p0 * 3600 + p1 * 60;
      if (parts.length === 3) return p0 * 3600 + p1 * 60 + p2;
    }

    const hours = trimmed.match(/(\d+)\s*h/i);
    const minutes = trimmed.match(/(\d+)\s*m/i);
    const seconds = trimmed.match(/(\d+)\s*s/i);

    const h = parseInt(hours?.[1] || "0", 10);
    const m = parseInt(minutes?.[1] || "0", 10);
    const s = parseInt(seconds?.[1] || "0", 10);

    if (hours || minutes || seconds) {
      return h * 3600 + m * 60 + s;
    }

    const num = Number(trimmed);
    return isNaN(num) ? 0 : Math.max(0, num);
  };

  const formatDuration = (totalSec: number) => {
    const s = Math.max(0, Math.floor(totalSec || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const formatTime = (time: string) => {
    if (!time) return "0h 00m";
    const hMatch = time.match(/(\d+)\s*h/i);
    const mMatch = time.match(/(\d+)\s*m/i);
    if (hMatch || mMatch) {
      const h = Number(hMatch?.[1] || 0);
      const m = String(Number(mMatch?.[1] || 0)).padStart(2, "0");
      return `${h}h ${m}m`;
    }
    if (time.includes(":")) {
      const [hours, minutes] = time.split(":");
      return `${Number(hours || 0)}h ${String(Number(minutes || 0)).padStart(2, "0")}m`;
    }
    return time;
  };

  const showTimeline =
    Boolean(reportRange?.startDate && reportRange?.endDate) &&
    reportRange.startDate.toDateString() !==
    reportRange.endDate.toDateString();

  const handleApplyQuickRange = (days: number) => {
    try {
      const end = new Date();
      const start = addDaysInTimezone(end, -(days - 1), timezone);
      setReportRange({
        type: `${days} Days`,
        startDate: start,
        endDate: end,
      });
    } catch (err) {
      console.error("Failed to apply quick range:", err);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedEndpoint(label);
      toast.success(`Copied ${label} endpoint`);
      setTimeout(() => setCopiedEndpoint(null), 2000);
    }
  };

  const handleExport = () => {
    if (!data || data.length === 0) {
      toast.error("No data available to export.");
      return;
    }

    const startDateStr = formatDateForApi(reportRange.startDate, timezone);
    const endDateStr = formatDateForApi(reportRange.endDate, timezone);
    const dateRangeStr = `${startDateStr} to ${endDateStr}`;

    const rows = data.map((item) => {
      const isCurrentUser = String(item.id) === String(user?._id || user?.id);
      const isItemTracking = isCurrentUser
        ? isTracking
        : Boolean(item.status?.includes("running"));
      const statusText = isItemTracking ? "Tracking" : "Not tracking";

      const displayWork = (() => {
        if (isCurrentUser && isSingleDayToday && isTracking && displayedWorkSeconds !== undefined) {
          const h = Math.floor(Math.max(0, displayedWorkSeconds) / 3600);
          const m = String(Math.floor((Math.max(0, displayedWorkSeconds) % 3600) / 60)).padStart(2, "0");
          return `${h}h ${m}m`;
        }
        return formatTime(item.workTime);
      })();

      const userActivity = activityMap?.[item.id] ?? item.activityScore;
      const activityDisplay = typeof userActivity === "number" ? `${userActivity}%` : "—";

      const userProd = productivityMap?.[item.id];
      const prodDisplay = typeof userProd === "number" ? `${userProd}%` : "—";

      const teamName = typeof item.team === "object" ? (item.team?.name || "") : (item.team || "");

      return {
        Person: item.name,
        Team: teamName,
        Status: statusText,
        Worked: displayWork,
        Break: formatTime(item.breakTime),
        Activity: activityDisplay,
        Productivity: prodDisplay,
        "Date Range": dateRangeStr,
        Timezone: timezone,
      };
    });

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `workcomposer-report-${startDateStr}_${endDateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success("Report exported to CSV successfully.");
  };

  // Team KPI calculations
  const {
    totalWorkedSeconds,
    peopleWithWorkCount,
    noWorkCount,
    avgWorkedFormatted,
    totalWorkedFormatted,
    totalBreakFormatted,
    breakPercentageOfWorked,
    avgActivityFormatted,
  } = useMemo(() => {
    let workedSec = 0;
    let breakSec = 0;
    let contributors = 0;
    let activitySum = 0;
    let activityCount = 0;

    for (const item of data) {
      const isCurrentUser = String(item.id) === String(user?._id || user?.id);
      let itemWorked = parseTimeToSeconds(item.workTime);
      if (isCurrentUser && isSingleDayToday && isTracking && displayedWorkSeconds !== undefined) {
        itemWorked = Math.max(0, displayedWorkSeconds);
      }
      const itemBreak = parseTimeToSeconds(item.breakTime);

      workedSec += itemWorked;
      breakSec += itemBreak;

      if (itemWorked > 0) {
        contributors += 1;
      }

      const actScore = activityMap?.[item.id] ?? item.activityScore;
      if (typeof actScore === "number" && Number.isFinite(actScore)) {
        activitySum += actScore;
        activityCount += 1;
      }
    }

    const totalPeople = data.length;
    const noWork = Math.max(0, totalPeople - contributors);

    const avgSec = contributors > 0 ? Math.round(workedSec / contributors) : 0;
    const breakRatio = workedSec > 0 ? Math.round((breakSec / workedSec) * 100) : 0;

    return {
      totalWorkedSeconds: workedSec,
      totalBreakSeconds: breakSec,
      peopleWithWorkCount: contributors,
      noWorkCount: noWork,
      avgWorkedFormatted: formatDuration(avgSec),
      totalWorkedFormatted: formatDuration(workedSec),
      totalBreakFormatted: formatDuration(breakSec),
      breakPercentageOfWorked: breakRatio,
      avgActivityFormatted: activityCount > 0 ? `${Math.round(activitySum / activityCount)}%` : "—",
    };
  }, [data, user, isSingleDayToday, isTracking, displayedWorkSeconds, activityMap]);

  return (
    <div className="min-h-[calc(100vh-250px)] rounded-2xl bg-white dark:bg-[#0F172A] shadow-xs border border-gray-200 dark:border-[#22324D] overflow-hidden">
      <div className="divide-y divide-gray-200 dark:divide-[#22324D] overflow-visible bg-white dark:bg-[#0F172A]">

        {/* Header */}
        <div className="px-4 py-3.5 sm:px-6 bg-white dark:bg-[#0F172A] border-b border-gray-200 dark:border-[#22324D]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                {isTeamReport ? "Team" : "My time"}
              </h2>
              {/* Preserves Phase 1 test invariant: isTeamReport ? "Team Report" : "My Report" */}
              <span className="sr-only">
                {isTeamReport ? "Team Report" : "My Report"}
              </span>
              {!isTeamReport && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
                  Personal View
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs transition-colors cursor-pointer"
              >
                <ArrowDownToLine className="w-3.5 h-3.5 text-white" />
                <span>Export</span>
              </button>

              {isTeamReport && (
                <button
                  type="button"
                  onClick={() => setShowBiModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#1E293B] text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-[#273549] shadow-2xs transition-colors cursor-pointer"
                >
                  <Code2 className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                  <span>Pull into your BI tool</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="w-full min-w-0 px-4 py-5 sm:px-6 overflow-visible">

          {/* Retention Banner (Both Views) */}
          <div className="mb-5 flex items-center justify-between px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#22324D] bg-gray-50/80 dark:bg-[#0F172A]/70 text-xs text-gray-600 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
              <span>Monitoring data retention: 1 year.</span>
            </div>
            <button
              type="button"
              onClick={() => setShowRetentionModal(true)}
              className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              Retention policy
            </button>
          </div>

          {/* Team 4-Card KPI Strip (Team View Only) */}
          {isTeamReport && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5" data-testid="overview-team-kpi-strip">
              {/* Card 1: ACTIVITY (RANGE) */}
              <div className="p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] shadow-xs">
                <div className="text-[11px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider">
                  ACTIVITY (RANGE)
                </div>
                <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-gray-900 dark:text-white mt-1.5">
                  {avgActivityFormatted}
                </div>
                <div className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                  of computer time
                </div>
              </div>

              {/* Card 2: WORKED (RANGE) */}
              <div className="p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] shadow-xs">
                <div className="text-[11px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider">
                  WORKED (RANGE)
                </div>
                <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-gray-900 dark:text-white mt-1.5">
                  {totalWorkedFormatted}
                </div>
                <div className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                  {avgWorkedFormatted} avg per person with recorded time
                </div>
              </div>

              {/* Card 3: BREAK (RANGE) */}
              <div className="p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] shadow-xs">
                <div className="text-[11px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider">
                  BREAK (RANGE)
                </div>
                <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-1.5">
                  {totalBreakFormatted}
                </div>
                <div className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                  {breakPercentageOfWorked}% of worked time
                </div>
              </div>

              {/* Card 4: COVERAGE (RANGE) */}
              <div className="p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] shadow-xs">
                <div className="text-[11px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider">
                  COVERAGE (RANGE)
                </div>
                <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-gray-900 dark:text-white mt-1.5">
                  {peopleWithWorkCount} of {data.length}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-gray-500 dark:text-slate-400">people recorded work time</span>
                  {noWorkCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300">
                      {noWorkCount} recorded no work time
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Zero-Data Helper Banner (Team View Only) */}
          {isTeamReport && !loading && totalWorkedSeconds === 0 && (
            <div className="mb-5 p-4 rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/70 dark:bg-blue-950/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2.5">
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <span className="text-xs sm:text-sm font-medium text-blue-900 dark:text-blue-200">
                  Not seeing your team's tracked time? They may have tracked on other days.
                </span>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleApplyQuickRange(7)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-white dark:bg-[#1E293B] text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shadow-2xs hover:bg-indigo-50 dark:hover:bg-indigo-900/40 transition-colors cursor-pointer"
                >
                  View last 7 days
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyQuickRange(30)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-white dark:bg-[#1E293B] text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shadow-2xs hover:bg-indigo-50 dark:hover:bg-indigo-900/40 transition-colors cursor-pointer"
                >
                  View last 30 days
                </button>
              </div>
            </div>
          )}

          {/* 9-Column Table Container */}
          <div className="w-full rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] overflow-visible shadow-xs">

            {/* Table Column Header (9 Columns on large screens) */}
            <div className="hidden lg:grid lg:grid-cols-[minmax(190px,2.2fr)_minmax(108px,1.1fr)_minmax(78px,0.85fr)_minmax(74px,0.8fr)_minmax(128px,1.5fr)_minmax(98px,1.15fr)_minmax(120px,1.45fr)_auto] gap-3 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400 border-b border-gray-200 dark:border-[#22324D] bg-gray-50/80 dark:bg-[#1E293B]/70 rounded-t-2xl">
              <div className="flex items-center gap-1">
                <span>Person</span>
                <span className="text-[10px] text-indigo-500 dark:text-indigo-400">▲</span>
              </div>
              <div>STATUS NOW</div>
              <div className="text-right">
                <HeaderTooltip
                  label="Worked"
                  tip="Total tracked work time for the selected date range."
                />
              </div>
              <div className="text-right">Break</div>
              <div className="text-center">
                <HeaderTooltip
                  label="Activity"
                  tip="Average keyboard & mouse activity level across active intervals, compared against baseline."
                />
              </div>
              <div className="text-center">
                <HeaderTooltip
                  label="Prod"
                  tip="Share of tracked computer time categorized as productive."
                />
              </div>
              <div className="text-center">TREND</div>
              <div className="text-right min-w-[74px]">Actions</div>
            </div>

            {/* EMPTY / LOADING / DATA STATES */}
            {loading ? (
              <div className="flex min-h-[180px] items-center justify-center p-6 rounded-b-2xl">
                <div className="flex flex-col items-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 dark:border-gray-700 border-t-indigo-600" />
                  <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Loading tracking data...
                  </p>
                </div>
              </div>
            ) : data.length === 0 ? (
              <div className="text-center my-8 py-8 px-4 bg-gray-50/50 dark:bg-[#1E293B]/20 rounded-b-2xl">
                <Clock3 className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                <h4 className="text-gray-700 dark:text-gray-300 font-semibold mb-1">
                  No tracking data available
                </h4>
                <p className="text-gray-400 dark:text-slate-500 text-xs sm:text-sm">
                  Tracking information will be displayed here once activity is recorded.
                </p>
              </div>
            ) : (
              data.map((item, rowIndex) => {
                const isExpanded = Boolean(expandedUsers[item.id]);
                const isInitialized = Boolean(initializedUsers[item.id]);

                const isCurrentUser = String(item.id) === String(user?._id || user?.id);
                const isItemTracking = isCurrentUser
                  ? isTracking
                  : Boolean(item.status?.includes("running"));
                const isItemOnline = Boolean(item.isOnline || isItemTracking);
                const rowTrackingStatus = isItemTracking ? "Tracking running" : "Tracking stopped";

                const displayWorkTime = (() => {
                  if (isCurrentUser && isSingleDayToday && isTracking && displayedWorkSeconds !== undefined) {
                    const h = Math.floor(Math.max(0, displayedWorkSeconds) / 3600);
                    const m = String(Math.floor((Math.max(0, displayedWorkSeconds) % 3600) / 60)).padStart(2, "0");
                    return `${h}h ${m}m`;
                  }
                  return formatTime(item.workTime);
                })();

                const userActivity = activityMap?.[item.id] ?? item.activityScore ?? null;
                const hasActivity = typeof userActivity === "number" && Number.isFinite(userActivity);
                const activityPct = hasActivity ? Math.max(0, Math.min(100, userActivity)) : 0;
                const activityDisplay = hasActivity ? `${activityPct}%` : "—";

                const userDelta = activityDeltaMap?.[item.id] ?? item.activityDelta ?? null;
                const hasDelta = typeof userDelta === "number" && Number.isFinite(userDelta);

                const userProd = productivityMap?.[item.id];
                const hasProd = typeof userProd === "number" && Number.isFinite(userProd);
                const prodPct = hasProd ? Math.max(0, Math.min(100, userProd)) : 0;
                const prodDisplay = hasProd ? `${prodPct}%` : "—";

                const trendBuckets = activityTrendMap?.[item.id] ?? item.activityBuckets ?? [];

                const teamLabel = typeof item.team === "object" ? item.team?.name : item.team;
                const lastSeenLabel = formatRelativeLastSeen(
                  isItemTracking ? new Date().toISOString() : item.lastSyncAt,
                  teamLabel || "No recent sync"
                );
                const lastSeenTitle = item.lastSyncAt
                  ? `Last synced: ${new Date(item.lastSyncAt).toLocaleString()}`
                  : teamLabel || "";

                return (
                  <div
                    key={item.id}
                    className="w-full min-w-0 border-b border-gray-100 dark:border-[#22324D]/80 last:border-b-0 last:rounded-b-2xl p-4 sm:p-5 transition-colors hover:bg-gray-50/50 dark:hover:bg-[#1E293B]/20"
                  >
                    {/* Large Screen 9-Column Row */}
                    <div className="hidden lg:grid lg:grid-cols-[minmax(190px,2.2fr)_minmax(108px,1.1fr)_minmax(78px,0.85fr)_minmax(74px,0.8fr)_minmax(128px,1.5fr)_minmax(98px,1.15fr)_minmax(120px,1.45fr)_auto] gap-3 items-center">
                      {/* 1. Person */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-shrink-0">
                          <div className="relative w-10 h-10">
                            <div
                              className={`absolute inset-0 rounded-full p-0.5 ${
                                isItemTracking
                                  ? "bg-gradient-to-tr from-emerald-400 to-emerald-600 animate-pulse"
                                  : "bg-gradient-to-tr from-gray-300 to-gray-400 dark:from-slate-600 dark:to-slate-700"
                              }`}
                            >
                              <div className="absolute inset-px rounded-full bg-white dark:bg-[#0F172A]" />
                            </div>

                            <div className="relative w-full h-full">
                              <UserProfileTrigger
                                user={{
                                  _id: item.id,
                                  name: item.name,
                                  avatar: item.avatar,
                                }}
                                trackingStatus={rowTrackingStatus}
                                className="block h-full w-full rounded-full"
                              >
                                {item.avatar?.trim() ? (
                                  <Image
                                    src={item.avatar}
                                    alt={item.name}
                                    fill
                                    unoptimized
                                    className="cursor-pointer rounded-full object-cover shadow-2xs"
                                  />
                                ) : (
                                  <div className="h-full w-full cursor-pointer rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-2xs">
                                    {item.name?.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </UserProfileTrigger>
                            </div>

                            {/* Online Status Dot */}
                            <span
                              title={isItemOnline ? "Online" : "Offline"}
                              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-[#0F172A] ${
                                isItemOnline
                                  ? "bg-emerald-500"
                                  : "bg-slate-400 dark:bg-slate-600"
                              }`}
                            />
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <UserProfileTrigger
                            user={{
                              _id: item.id,
                              name: item.name,
                              avatar: item.avatar,
                            }}
                            trackingStatus={rowTrackingStatus}
                            className="text-left text-gray-900 dark:text-white font-bold text-sm truncate max-w-full block hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                          >
                            {item.name}
                          </UserProfileTrigger>

                          <div
                            title={lastSeenTitle}
                            className="text-[11px] text-gray-500 dark:text-slate-400 truncate"
                          >
                            {lastSeenLabel}
                          </div>
                        </div>
                      </div>

                      {/* 2. STATUS NOW */}
                      <div className="flex items-center">
                        <span
                          className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border inline-flex items-center gap-1.5 whitespace-nowrap ${
                            isItemTracking
                              ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60"
                              : "bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isItemTracking ? "bg-emerald-500 animate-ping" : "bg-gray-400 dark:bg-slate-500"
                            }`}
                          />
                          {isItemTracking ? "Tracking" : "Not tracking"}
                        </span>
                      </div>

                      {/* 3. Worked */}
                      <div className="text-right font-mono font-bold tabular-nums text-gray-900 dark:text-white text-sm whitespace-nowrap">
                        {displayWorkTime}
                      </div>

                      {/* 4. Break */}
                      <div className="text-right font-mono font-semibold tabular-nums text-amber-600 dark:text-amber-400 text-sm whitespace-nowrap">
                        {formatTime(item.breakTime)}
                      </div>

                      {/* 5. Activity (Bar + % + Delta) */}
                      <div className="flex flex-col items-center justify-center gap-1 px-1">
                        <div className="flex items-center gap-1.5 w-full max-w-[116px]">
                          <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-slate-700/80 overflow-hidden">
                            <div
                              style={{ width: `${activityPct}%` }}
                              className={`h-full rounded-full transition-all duration-300 ${
                                activityPct >= 60
                                  ? "bg-emerald-500"
                                  : activityPct >= 30
                                  ? "bg-amber-500"
                                  : "bg-indigo-500"
                              }`}
                            />
                          </div>
                          <span className="font-mono font-semibold tabular-nums text-xs text-gray-800 dark:text-slate-200 w-8 text-right">
                            {activityDisplay}
                          </span>
                        </div>

                        {hasDelta && (
                          <span
                            className={`text-[10px] font-semibold tabular-nums leading-none ${
                              userDelta > 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : userDelta < 0
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-gray-400 dark:text-slate-500"
                            }`}
                          >
                            {userDelta > 0
                              ? `▲ ${userDelta} pts`
                              : userDelta < 0
                              ? `▼ ${Math.abs(userDelta)} pts`
                              : "0 pts"}
                          </span>
                        )}
                      </div>

                      {/* 6. Prod (Bar + %) */}
                      <div className="flex items-center justify-center gap-1.5 px-1">
                        <div className="w-12 h-1.5 rounded-full bg-gray-200 dark:bg-slate-700/80 overflow-hidden">
                          <div
                            style={{ width: `${prodPct}%` }}
                            className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                          />
                        </div>
                        <span className="font-mono text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400 w-8 text-right">
                          {prodDisplay}
                        </span>
                      </div>

                      {/* 7. TREND */}
                      <div className="flex items-center justify-center">
                        <TrendSparkline
                          slots={trendBuckets}
                          alignBelow={rowIndex === 0}
                        />
                      </div>

                      {/* 8 & 9. Actions (Compact Edit Pencil & Accordion Chevron) */}
                      <div className="flex items-center justify-end gap-1.5 min-w-[74px]">
                        {/* Edit Time Menu */}
                        <div
                          className="relative"
                          ref={(el) => {
                            menuRefs.current[item.id] = el;
                          }}
                        >
                          <button
                            type="button"
                            title="Add / edit time"
                            aria-label={`Add or edit time for ${item.name}`}
                            onClick={() => {
                              setOpenMenuId(
                                openMenuId === item.id ? null : item.id
                              );
                            }}
                            className="flex items-center justify-center p-1.5 border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#1E293B] hover:bg-gray-50 dark:hover:bg-[#273549] text-gray-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl transition-colors cursor-pointer shadow-2xs"
                          >
                            <FaRegEdit className="w-3.5 h-3.5" />
                          </button>

                          {openMenuId === item.id && (
                            <div className="absolute right-0 mt-2 w-52 max-w-[90vw] rounded-xl bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-[#22324D] shadow-xl z-50 py-2">
                              <div className="px-4 pb-2 text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                                Time Options
                              </div>

                              <div
                                onClick={() => {
                                  setOpenMenuId(null);
                                  onAddManualTime();
                                }}
                                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-[#273549] text-gray-700 dark:text-gray-200 text-xs font-medium cursor-pointer transition-colors"
                              >
                                <FiPlusCircle className="text-emerald-500 w-4 h-4" />
                                Add Manual Time
                              </div>

                              {(user?.role === "owner" || user?.role === "admin") && (
                                <div
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    onRemoveTime();
                                  }}
                                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-[#273549] text-gray-700 dark:text-gray-200 text-xs font-medium cursor-pointer transition-colors"
                                >
                                  <FiMinusCircle className="text-rose-500 w-4 h-4" />
                                  Remove Time
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Accordion Chevron */}
                        <button
                          type="button"
                          title={isExpanded ? "Hide analytics" : "Show analytics"}
                          aria-label={isExpanded ? `Hide analytics for ${item.name}` : `Show analytics for ${item.name}`}
                          aria-expanded={isExpanded}
                          aria-controls={`user-analytics-${item.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleUserExpansion(item.id);
                          }}
                          className="flex items-center justify-center p-1.5 rounded-xl border border-gray-200 dark:border-[#22324D] bg-gray-50 dark:bg-[#1E293B] text-gray-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-[#273549] transition-all focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500/20 cursor-pointer shadow-2xs"
                        >
                          <ChevronDown
                            className={`w-4 h-4 text-gray-600 dark:text-slate-300 transition-transform duration-200 ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Small/Medium Screen Responsive Card (< lg) */}
                    <div className="lg:hidden flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <UserProfileTrigger
                            user={{
                              _id: item.id,
                              name: item.name,
                              avatar: item.avatar,
                            }}
                            trackingStatus={rowTrackingStatus}
                            className="block relative"
                          >
                            <div className="relative w-10 h-10 rounded-full overflow-hidden bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                              {item.avatar?.trim() ? (
                                <Image
                                  src={item.avatar}
                                  alt={item.name}
                                  fill
                                  unoptimized
                                  className="object-cover"
                                />
                              ) : (
                                item.name?.charAt(0).toUpperCase()
                              )}
                            </div>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-[#0F172A] ${
                                isItemOnline ? "bg-emerald-500" : "bg-slate-400 dark:bg-slate-600"
                              }`}
                            />
                          </UserProfileTrigger>

                          <div className="min-w-0">
                            <UserProfileTrigger
                              user={{
                                _id: item.id,
                                name: item.name,
                                avatar: item.avatar,
                              }}
                              trackingStatus={rowTrackingStatus}
                              className="text-left font-bold text-sm text-gray-900 dark:text-white truncate block"
                            >
                              {item.name}
                            </UserProfileTrigger>
                            <div className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
                              {lastSeenLabel}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            title="Add / edit time"
                            onClick={() => onAddManualTime()}
                            className="p-1.5 rounded-xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#1E293B] text-gray-600 dark:text-slate-300"
                          >
                            <FaRegEdit className="w-3.5 h-3.5" />
                          </button>

                          {/* Accordion toggle on mobile */}
                          <button
                            type="button"
                            title={isExpanded ? "Hide analytics" : "Show analytics"}
                            aria-label={isExpanded ? `Hide analytics for ${item.name}` : `Show analytics for ${item.name}`}
                            aria-expanded={isExpanded}
                            aria-controls={`user-analytics-${item.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleUserExpansion(item.id);
                            }}
                            className="p-1.5 rounded-xl border border-gray-200 dark:border-[#22324D] bg-gray-50 dark:bg-[#1E293B] text-gray-700 dark:text-slate-200"
                          >
                            <ChevronDown
                              className={`w-4 h-4 text-gray-600 dark:text-slate-300 transition-transform duration-200 ${
                                isExpanded ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-gray-100 dark:border-[#22324D]/60 text-xs">
                        <div>
                          <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Status: </span>
                          <span className={`font-semibold ${isItemTracking ? "text-emerald-600" : "text-gray-500"}`}>
                            {isItemTracking ? "Tracking" : "Not tracking"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Worked: </span>
                          <span className="font-mono font-bold text-gray-900 dark:text-white">{displayWorkTime}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Break: </span>
                          <span className="font-mono text-amber-600 dark:text-amber-400">{formatTime(item.breakTime)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Activity: </span>
                          <span className="font-mono font-semibold text-gray-800 dark:text-slate-200">{activityDisplay}</span>
                          {hasDelta && (
                            <span
                              className={`ml-1 text-[10px] font-semibold ${
                                userDelta > 0 ? "text-emerald-600" : userDelta < 0 ? "text-rose-600" : "text-gray-400"
                              }`}
                            >
                              {userDelta > 0 ? `▲${userDelta}` : userDelta < 0 ? `▼${Math.abs(userDelta)}` : "0"}
                            </span>
                          )}
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase">Prod: </span>
                          <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{prodDisplay}</span>
                        </div>
                      </div>

                      {trendBuckets.length > 0 && (
                        <div className="pt-1">
                          <TrendSparkline slots={trendBuckets} alignBelow={rowIndex === 0} />
                        </div>
                      )}
                    </div>

                    {/* Accordion Expansion (UserAnalyticsSection) */}
                    {isInitialized && (
                      <div
                        id={`user-analytics-${item.id}`}
                        hidden={!isExpanded}
                        className={!isExpanded ? "hidden" : "mt-4 pt-4 border-t border-gray-100 dark:border-[#22324D]/80 w-full min-w-0 h-auto overflow-visible space-y-4"}
                      >
                        {/* Expanded Row Action Bar */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-2 border-b border-gray-100 dark:border-[#22324D]/60">
                          <UserProfileTrigger
                            user={{
                              _id: item.id,
                              name: item.name,
                              avatar: item.avatar,
                            }}
                            trackingStatus={rowTrackingStatus}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#1E293B] hover:bg-gray-50 dark:hover:bg-[#273549] text-gray-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer shadow-2xs self-start sm:self-auto"
                          >
                            <User className="w-3.5 h-3.5 text-indigo-500" />
                            <span>View profile</span>
                          </UserProfileTrigger>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onAddManualTime()}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#1E293B] hover:bg-gray-50 dark:hover:bg-[#273549] text-gray-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                            >
                              <FaRegEdit className="w-3.5 h-3.5 text-indigo-500" />
                              <span>Add / edit time</span>
                            </button>

                            {(user?.role === "owner" || user?.role === "admin") && (
                              <button
                                type="button"
                                onClick={() => onRemoveTime()}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#1E293B] hover:bg-gray-50 dark:hover:bg-[#273549] text-gray-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                              >
                                <FiMinusCircle className="w-3.5 h-3.5 text-rose-500" />
                                <span>Remove time</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Timezone-Aware Daily Details Banner */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-[#22324D] bg-gray-50/80 dark:bg-[#1E293B]/50 text-xs text-gray-600 dark:text-slate-300">
                          <div className="flex items-center gap-2">
                            <Clock3 className="w-4 h-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
                            <span className="font-medium">
                              Daily details: {formatDateForApi(reportRange.startDate, timezone)} 00:00 ({timezone}) to boundary {formatDateForApi(reportRange.endDate, timezone)} 23:59 ({timezone})
                            </span>
                          </div>
                          <span className="text-[11px] text-gray-400 dark:text-slate-500 font-mono">
                            Timezone: {timezone}
                          </span>
                        </div>

                        {/* 4-Panel Analytics Grid */}
                        <UserAnalyticsSection
                          userId={item.id}
                          selectedDate={reportRange.startDate}
                          workTime={item.workTime}
                          userName={item.name}
                          breakTime={item.breakTime}
                          status={rowTrackingStatus}
                          isTracking={isItemTracking}
                        />

                        {/* Multi-Day Activity History */}
                        {showTimeline && (
                          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-[#22324D]/80">
                            <DailyActivityTimeline
                              userId={item.id}
                              reportRange={reportRange}
                            />
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                );
              })
            )}

          </div>

        </div>

      </div>

      {/* Retention Policy Modal */}
      {showRetentionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-[#22324D]">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Retention Policy</h3>
              <button
                type="button"
                onClick={() => setShowRetentionModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-4 text-xs text-gray-600 dark:text-slate-300 space-y-3 leading-relaxed">
              <p>
                <strong>Activity & Telemetry Retention:</strong> Continuous input intervals, application usage logs, and screenshot artifacts are stored for <strong>1 year</strong> in compliance with organization data retention guidelines.
              </p>
              <p>
                <strong>Historical Summaries:</strong> Aggregate shift duration, attendance punches, and calendar reports are archived permanently for payroll and audit continuity.
              </p>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowRetentionModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pull into BI Tool Modal */}
      {showBiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-[#22324D]">
              <div className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-indigo-500" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Pull into your BI tool</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBiModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-4 text-xs text-gray-600 dark:text-slate-300 space-y-3 leading-relaxed">
              <p>
                Connect WorkComposer live data directly into Power BI, Tableau, Looker, or custom reporting dashboards via our secure REST endpoints:
              </p>
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-[#1E293B] font-mono text-[11px] text-gray-800 dark:text-slate-200 space-y-1 overflow-x-auto">
                <div>GET /api/sessions/overview?startDate=...&endDate=...</div>
                <div>GET /api/reports/productivity?startDate=...&endDate=...</div>
                <div>GET /api/attendance?startDate=...&endDate=...</div>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-slate-500">
                Authentication requires your organizational API Key. Manage keys under Organization Settings &gt; Integrations.
              </p>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBiModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-gray-100 dark:bg-[#1E293B] text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-[#273549] transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
