"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import useDesktopNavigation from "@/hooks/useDesktopNavigation";
import {
  HiOutlineChevronDown,
  HiOutlineBolt,
  HiOutlineArrowRight,
  HiOutlineArrowPath,
  HiOutlineExclamationCircle,
} from "react-icons/hi2";
import {
  generateTimelineBuckets,
  buildEmployeeTimelineCells,
  calculateCurrentTimeMarkerPosition,
  calculateTeamDaySummaryMetrics,
  getActivityIntensityState,
  formatTimelineDuration,
  formatMinutesToClock,
  type EmployeeTimelineData,
  type TimelineBucket,
} from "./teamDayTimeline.utils";

export interface TeamDayLiveProps {
  attendanceData?: any[];
  overviewData?: any[];
  usageData?: any[];
  productivityData?: any[];
  effectiveSettings?: any;
  timezone?: string;
  selectedDate?: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onNavigateToOverview?: () => void;
}

// Supported visualization modes: Worked time and Activity
// (Break time is handled as a distinct state in Worked time mode)
export type SelectedMetric = "worked" | "activity" | "break";

export default function TeamDayLive({
  attendanceData = [],
  overviewData = [],
  usageData = [],
  productivityData = [],
  effectiveSettings,
  timezone = "UTC",
  selectedDate,
  isLoading = false,
  error = null,
  onRetry,
  onNavigateToOverview,
}: TeamDayLiveProps) {
  const router = useRouter();
  const { navigateToReport } = useDesktopNavigation();

  // Dropdown states
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [selectedMetric, setSelectedMetric] = useState<SelectedMetric>("worked");
  const [isTeamMenuOpen, setIsTeamMenuOpen] = useState(false);
  const [isMetricMenuOpen, setIsMetricMenuOpen] = useState(false);

  // Check if viewing today's date in reporting timezone
  const isToday = useMemo(() => {
    if (!selectedDate) return true;
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const y = parts.find((p) => p.type === "year")?.value;
      const m = parts.find((p) => p.type === "month")?.value;
      const d = parts.find((p) => p.type === "day")?.value;
      const todayStr = `${y}-${m}-${d}`;
      return selectedDate === todayStr;
    } catch {
      const now = new Date();
      return selectedDate === now.toISOString().slice(0, 10);
    }
  }, [selectedDate, timezone]);

  // Hovered cell tooltip state
  const [hoveredCell, setHoveredCell] = useState<{
    employeeName: string;
    timeRange: string;
    state: string;
    durationFormatted: string;
    activityScore: number | null;
    appName?: string | undefined;
    unusualInput?: boolean | undefined;
    x: number;
    y: number;
  } | null>(null);

  const teamDropdownRef = useRef<HTMLDivElement>(null);
  const metricDropdownRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (teamDropdownRef.current && !teamDropdownRef.current.contains(event.target as Node)) {
        setIsTeamMenuOpen(false);
      }
      if (metricDropdownRef.current && !metricDropdownRef.current.contains(event.target as Node)) {
        setIsMetricMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 1. Current minutes from midnight in the given timezone
  const currentMinutesNow = useMemo(() => {
    try {
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        minute: "numeric",
        hourCycle: "h23",
      }).formatToParts(now);

      const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
      const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
      return h * 60 + m;
    } catch {
      const d = new Date();
      return d.getHours() * 60 + d.getMinutes();
    }
  }, [timezone]);

  // Timeline boundaries: 5:30 AM (330m) to dynamic end for today, or 6:00 PM (1080m) for historical
  const timelineStartMinutes = 330; // 5:30 AM
  const timelineEndMinutes = useMemo(() => {
    if (!isToday) {
      return 1080; // 6:00 PM for past dates
    }
    // Dynamic end for today ending at current time (aligned by 30-min steps)
    return Math.max(timelineStartMinutes + 30, Math.ceil(currentMinutesNow / 30) * 30);
  }, [isToday, timelineStartMinutes, currentMinutesNow]);

  // Generate aligned buckets across the timeline window
  const buckets: TimelineBucket[] = useMemo(() => {
    return generateTimelineBuckets(timelineStartMinutes, timelineEndMinutes, 30);
  }, [timelineStartMinutes, timelineEndMinutes]);

  // Current time vertical indicator (visible only for today)
  const timeMarker = useMemo(() => {
    if (!isToday) {
      return { positionPercent: 0, isVisible: false, formattedTime: "" };
    }
    return calculateCurrentTimeMarkerPosition(
      currentMinutesNow,
      timelineStartMinutes,
      timelineEndMinutes
    );
  }, [isToday, currentMinutesNow, timelineStartMinutes, timelineEndMinutes]);

  // 2. Normalize and index all raw data per employee
  const { allEmployees, availableTeams } = useMemo(() => {
    const empMap = new Map<string, any>();
    const teamsSet = new Set<string>();

    // Index usage data for top app/domain
    const usageMap = new Map<string, any>();
    if (Array.isArray(usageData)) {
      usageData.forEach((u) => {
        const id = String(u.id || u._id || u.userId || "").trim();
        if (id) usageMap.set(id, u);
      });
    }

    // Index productivity data for activity scores
    const prodMap = new Map<string, any>();
    if (Array.isArray(productivityData)) {
      productivityData.forEach((p) => {
        const id = String(p.id || p._id || p.userId || "").trim();
        if (id) prodMap.set(id, p);
      });
    }

    // Index overview data
    const overviewMap = new Map<string, any>();
    if (Array.isArray(overviewData)) {
      overviewData.forEach((o) => {
        const id = String(o.id || o._id || o.userId || "").trim();
        if (id) overviewMap.set(id, o);
      });
    }

    // Process attendance data
    if (Array.isArray(attendanceData)) {
      attendanceData.forEach((att, idx) => {
        if (!att || typeof att !== "object") return;
        const id = String(att.id || att._id || att.userId || att.email || `emp_${idx}`).trim();

        if (!empMap.has(id)) {
          empMap.set(id, { ...att, _stableId: id });
        } else {
          const prev = empMap.get(id);
          const mergedSessions = [...(prev.sessions || []), ...(att.sessions || [])];
          empMap.set(id, {
            ...prev,
            workSeconds: (prev.workSeconds || 0) + (att.workSeconds || 0),
            breakSeconds: (prev.breakSeconds || 0) + (att.breakSeconds || 0),
            isTracking: prev.isTracking || att.isTracking,
            sessions: mergedSessions,
          });
        }
      });
    }

    // Ensure overview users with 0 attendance records are also present
    overviewMap.forEach((user, id) => {
      if (!empMap.has(id)) {
        empMap.set(id, {
          _stableId: id,
          id,
          name: user.name,
          avatar: user.avatar,
          team: user.team,
          workSeconds: 0,
          breakSeconds: 0,
          isTracking: user.status?.toLowerCase().includes("running") || false,
          sessions: [],
        });
      }
    });

    // Build clean EmployeeTimelineData objects
    const employees: EmployeeTimelineData[] = [];

    empMap.forEach((raw, id) => {
      const uUsage = usageMap.get(id);
      const uProd = prodMap.get(id);
      const uOverview = overviewMap.get(id);

      const name = String(
        raw.name ||
        `${raw.firstName || ""} ${raw.lastName || ""}`.trim() ||
        uOverview?.name ||
        raw.email ||
        "Team Member"
      );

      const rawTeam = raw.team || uOverview?.team;
      const teamName = typeof rawTeam === "object" && rawTeam !== null
        ? String(rawTeam.name || rawTeam.title || "Default team")
        : typeof rawTeam === "string" && rawTeam.trim() !== ""
        ? rawTeam
        : "Default team";

      teamsSet.add(teamName);

      const isTracking = Boolean(raw.isTracking || uOverview?.status?.toLowerCase().includes("running"));
      const workSecs = Number(raw.workSeconds) || 0;
      const breakSecs = Number(raw.breakSeconds) || 0;
      const hasStarted = workSecs > 0 || breakSecs > 0 || isTracking;

      // Determine top application / domain or status string
      let statusText = "off";
      if (!hasStarted) {
        statusText = "not started";
      } else if (isTracking) {
        const topApp = uUsage?.apps?.[0]?.name || uProd?.productiveApps?.[0]?.name;
        statusText = topApp ? String(topApp) : "Active";
      } else {
        statusText = "off";
      }

      // Determine activity score and measurement state
      const rawTelemetryScore =
        raw.activityScore !== null && raw.activityScore !== undefined
          ? Number(raw.activityScore)
          : uOverview?.activityScore !== null && uOverview?.activityScore !== undefined
          ? Number(uOverview.activityScore)
          : undefined;

      const hasTelemetry = rawTelemetryScore !== undefined && !isNaN(rawTelemetryScore);
      const hasProdRecord = Boolean(uProd && typeof uProd === "object");
      const rawProdScore = uProd?.productivePercent !== undefined ? Number(uProd.productivePercent) : undefined;

      let activityScore: number | null = null;
      let activityMeasured = false;

      if (!hasStarted) {
        // No activity measurement because tracking has not started
        activityScore = null;
        activityMeasured = false;
      } else if (hasTelemetry) {
        // Confirmed measured input telemetry from backend (/api/attendance)
        activityScore = rawTelemetryScore;
        activityMeasured = true;
      } else if (hasProdRecord && rawProdScore !== undefined && !isNaN(rawProdScore)) {
        // Fallback for environments reporting scalar productivity score
        activityScore = rawProdScore;
        activityMeasured = true;
      } else if (workSecs > 0) {
        // Tracked time, but activity data unavailable or missing
        activityScore = null;
        activityMeasured = false;
      } else {
        activityScore = null;
        activityMeasured = false;
      }

      // Check if tracking status is genuinely unknown due to missing/incomplete data
      const isStatusUnknown = Boolean(raw.isUnavailable || raw.trackingStatusUnknown || uOverview?.status === "unknown");

      // Check for unusual activity data and historical delta if present
      const rawUnusualMins = raw.unusualActivityMinutes ?? uOverview?.unusualActivityMinutes ?? uProd?.unusualActivityMinutes;
      const rawUnusualCount = raw.unusualActivityCount ?? uOverview?.unusualActivityCount ?? uProd?.unusualActivityCount;
      const rawActivityDelta =
        typeof raw.activityDelta === "number" && !isNaN(raw.activityDelta)
          ? raw.activityDelta
          : typeof uOverview?.activityDelta === "number" && !isNaN(uOverview.activityDelta)
          ? uOverview.activityDelta
          : null;

      let histAvg = raw.historicalAvgActivity ?? uOverview?.historicalAvgActivity ?? uProd?.historicalAvgActivity;
      if (typeof histAvg !== "number" && typeof activityScore === "number" && rawActivityDelta !== null) {
        histAvg = Math.max(0, Math.min(100, activityScore - rawActivityDelta));
      }

      // Anomaly measurement distinction:
      // - Confirmed measurement exists if explicitly flagged or rawUnusualMins is a valid number
      // - If rawUnusualMins is absent/null/undefined: unavailable
      const unusualMeasured = raw.unusualActivityMeasured === true ||
        (raw.unusualActivityMeasured !== false && typeof rawUnusualMins === "number" && !isNaN(rawUnusualMins));
      const unusualActivityMinutes = unusualMeasured && typeof rawUnusualMins === "number" && !isNaN(rawUnusualMins)
        ? rawUnusualMins
        : null;

      // Extract any 30-minute bucket activity data if available on attendance or productivity
      const intervalActivity =
        raw.activityBuckets ||
        raw.activity ||
        uProd?.activityBuckets ||
        uProd?.activity;

      // Build timeline cells for this employee
      const cells = buildEmployeeTimelineCells(
        raw.sessions || [],
        buckets,
        currentMinutesNow,
        activityScore,
        timezone,
        selectedMetric === "activity" ? "activity" : "worked",
        isToday,
        Boolean(uProd),
        intervalActivity
      );

      const hasCellUnusual = cells.some((c) => c.unusualInput);
      const hasPositiveUnusualMins = Boolean(unusualActivityMinutes && unusualActivityMinutes > 0);
      const baselineDrop =
        hasStarted && workSecs > 0 && typeof activityScore === "number" && typeof histAvg === "number"
          ? histAvg - activityScore
          : 0;
      const isPinnedException = hasPositiveUnusualMins || hasCellUnusual || baselineDrop >= 20;

      employees.push({
        id,
        name,
        email: raw.email,
        avatar: raw.avatar || uOverview?.avatar,
        team: teamName,
        isTracking,
        statusText,
        workSeconds: workSecs,
        breakSeconds: breakSecs,
        activityScore,
        activityMeasured,
        trackingStatusUnknown: isStatusUnknown || undefined,
        historicalAvgActivity: typeof histAvg === "number" ? histAvg : undefined,
        unusualActivityMinutes,
        unusualActivityMeasured: unusualMeasured,
        unusualActivityCount: typeof rawUnusualCount === "number" ? rawUnusualCount : undefined,
        activityDelta: rawActivityDelta,
        isPinnedException,
        cells,
        hasStarted,
        isUnavailable: isStatusUnknown || undefined,
      });
    });

    return {
      allEmployees: employees,
      availableTeams: Array.from(teamsSet).sort(),
    };
  }, [attendanceData, overviewData, usageData, productivityData, buckets, currentMinutesNow, selectedMetric, isToday, timezone]);

  // 3. Filter and sort employees: pinned exceptions -> started (worked desc) -> not started at bottom
  const filteredEmployees = useMemo(() => {
    let list = allEmployees;
    if (selectedTeam !== "all") {
      list = list.filter((emp) => emp.team.toLowerCase() === selectedTeam.toLowerCase());
    }

    return [...list].sort((a, b) => {
      const aPinned = Boolean(a.isPinnedException);
      const bPinned = Boolean(b.isPinnedException);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;

      if (a.hasStarted !== b.hasStarted) return a.hasStarted ? -1 : 1;

      return b.workSeconds - a.workSeconds;
    });
  }, [allEmployees, selectedTeam]);

  const pinnedEmployees = useMemo(
    () => filteredEmployees.filter((emp) => emp.isPinnedException),
    [filteredEmployees]
  );

  const regularEmployees = useMemo(
    () => filteredEmployees.filter((emp) => !emp.isPinnedException),
    [filteredEmployees]
  );

  // 4. Calculate summary metrics
  const summaryMetrics = useMemo(() => {
    return calculateTeamDaySummaryMetrics(filteredEmployees);
  }, [filteredEmployees]);

  // Navigation to Team Report (WORKCOMPOSER-122)
  const handleNavigateToReport = () => {
    if (onNavigateToOverview) {
      onNavigateToOverview();
    } else {
      navigateToReport("overview", "/dashboard/time-tracking/overview");
    }
  };

  // Helper for avatar initials
  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (parts.length >= 2 && first && last && first[0] && last[0]) {
      return (first[0] + last[0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // Cell color helper (light mint -> medium emerald -> dark forest green in light mode; crisp graduated contrast in dark mode)
  const getCellBgClass = (state: string) => {
    switch (state) {
      case "active-work":
        return "bg-emerald-500 hover:brightness-110";
      case "active-high":
        return "bg-emerald-800 dark:bg-emerald-500 hover:brightness-110";
      case "active-medium-high":
        return "bg-emerald-600 dark:bg-emerald-600/90 hover:brightness-110";
      case "active-medium":
        return "bg-emerald-500 dark:bg-emerald-700/80 hover:brightness-110";
      case "active-low":
        return "bg-emerald-300 dark:bg-emerald-800/70 hover:brightness-110";
      case "active-very-low":
        return "bg-emerald-200 dark:bg-emerald-900/60 hover:brightness-110";
      case "active-zero":
        return "bg-emerald-100/70 dark:bg-emerald-950/40 border border-emerald-300/40 dark:border-emerald-800/40 hover:brightness-110";
      case "unavailable":
        return "bg-slate-300 dark:bg-slate-700/80 border border-dashed border-slate-400 dark:border-slate-500";
      case "break":
        return "bg-amber-400 dark:bg-amber-500 hover:brightness-110";
      case "not-tracking":
        return "bg-gray-200 dark:bg-slate-700/60 hover:bg-gray-300 dark:hover:bg-slate-600/60";
      case "future":
        return "bg-gray-100/40 dark:bg-slate-800/20";
      default:
        return "bg-gray-200 dark:bg-slate-700/60";
    }
  };

  // -------------------------------------------------------------
  // RENDER: Loading Skeleton
  // -------------------------------------------------------------
  if (isLoading) {
    return (
      <div
        data-testid="team-day-live-loading"
        className="w-full bg-white dark:bg-[#0F172A] border border-gray-200 dark:border-[#22324D] rounded-2xl p-5 shadow-xs animate-pulse space-y-4"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="h-5 w-48 bg-gray-200 dark:bg-slate-800 rounded-md" />
          <div className="h-5 w-64 bg-gray-200 dark:bg-slate-800 rounded-md" />
        </div>
        <div className="h-4 w-72 bg-gray-100 dark:bg-slate-800/60 rounded-md" />
        <div className="h-5 w-full bg-gray-100 dark:bg-slate-800/40 rounded-md" />
        <div className="space-y-3 pt-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 h-11 border-b border-gray-100 dark:border-[#22324D]/40">
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-slate-800 shrink-0" />
              <div className="w-32 h-4 bg-gray-200 dark:bg-slate-800 rounded" />
              <div className="flex-1 h-6 bg-gray-100 dark:bg-slate-800/40 rounded" />
              <div className="w-16 h-4 bg-gray-200 dark:bg-slate-800 rounded" />
              <div className="w-14 h-4 bg-gray-200 dark:bg-slate-800 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: Error State
  // -------------------------------------------------------------
  if (error) {
    return (
      <div
        data-testid="team-day-live-error"
        className="w-full bg-white dark:bg-[#0F172A] border border-red-200 dark:border-red-900/60 rounded-2xl p-6 shadow-xs text-center space-y-3"
      >
        <HiOutlineExclamationCircle className="w-9 h-9 text-red-500 mx-auto" />
        <h4 className="text-sm font-bold text-gray-900 dark:text-white">Failed to load Team Day live activity</h4>
        <p className="text-xs text-gray-500 dark:text-slate-400 max-w-md mx-auto">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
          >
            <HiOutlineArrowPath className="w-3.5 h-3.5" />
            Retry
          </button>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: Main Component (Reproducing Screenshot Exactly)
  // -------------------------------------------------------------
  return (
    <div
      data-testid="team-day-live-container"
      className="w-full bg-white dark:bg-[#0F172A] border border-gray-200 dark:border-[#22324D] rounded-2xl p-4 sm:p-5 shadow-xs transition-colors duration-200"
    >
      {/* 1. TOP TOOLBAR */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 border-b border-gray-100 dark:border-[#22324D]">
        {/* Left: Title, Time Range, Team Dropdown, Metric Dropdown */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-gray-900 dark:text-white tracking-tight">
              Team day — live
            </span>
            <span className="text-gray-400 dark:text-slate-500 font-medium">
              {isToday ? "5:30 AM – now" : `${formatMinutesToClock(timelineStartMinutes)} – ${formatMinutesToClock(timelineEndMinutes)}`}
            </span>
          </div>

          <span className="text-gray-300 dark:text-slate-700">|</span>

          {/* Team Dropdown */}
          <div className="relative" ref={teamDropdownRef}>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 dark:text-slate-400 font-medium">Team</span>
              <button
                type="button"
                onClick={() => setIsTeamMenuOpen(!isTeamMenuOpen)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-gray-200 dark:border-[#263852] bg-white dark:bg-[#162742] text-gray-800 dark:text-slate-200 text-xs font-medium hover:border-gray-300 dark:hover:border-slate-600 transition-colors cursor-pointer"
                data-testid="team-filter-dropdown"
              >
                <span>
                  {selectedTeam === "all"
                    ? "All allowed people"
                    : selectedTeam}
                </span>
                <HiOutlineChevronDown className="w-3 h-3 text-gray-400" />
              </button>
            </div>

            {isTeamMenuOpen && (
              <div className="absolute left-0 mt-1 w-48 rounded-lg border border-gray-200 dark:border-[#263852] bg-white dark:bg-[#162742] shadow-lg z-50 py-1 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTeam("all");
                    setIsTeamMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 transition-colors cursor-pointer ${
                    selectedTeam === "all"
                      ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold"
                      : "text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-white/5"
                  }`}
                >
                  All allowed people
                </button>
                {availableTeams.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setSelectedTeam(t);
                      setIsTeamMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 transition-colors cursor-pointer ${
                      selectedTeam.toLowerCase() === t.toLowerCase()
                        ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold"
                        : "text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-white/5"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Metric Dropdown: Switches timeline visualization mode */}
          <div className="relative" ref={metricDropdownRef}>
            <button
              type="button"
              onClick={() => setIsMetricMenuOpen(!isMetricMenuOpen)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-gray-200 dark:border-[#263852] bg-white dark:bg-[#162742] text-gray-800 dark:text-slate-200 text-xs font-medium hover:border-gray-300 dark:hover:border-slate-600 transition-colors cursor-pointer"
              data-testid="metric-selector-dropdown"
            >
              <span>
                {selectedMetric === "activity"
                  ? "Activity"
                  : "Worked time"}
              </span>
              <HiOutlineChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {isMetricMenuOpen && (
              <div className="absolute left-0 mt-1 w-36 rounded-lg border border-gray-200 dark:border-[#263852] bg-white dark:bg-[#162742] shadow-lg z-50 py-1 text-xs">
                <button
                  type="button"
                  data-testid="metric-option-worked"
                  onClick={() => {
                    setSelectedMetric("worked");
                    setIsMetricMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 transition-colors cursor-pointer ${
                    selectedMetric === "worked"
                      ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold"
                      : "text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-white/5"
                  }`}
                >
                  Worked time
                </button>
                <button
                  type="button"
                  data-testid="metric-option-activity"
                  onClick={() => {
                    setSelectedMetric("activity");
                    setIsMetricMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 transition-colors cursor-pointer ${
                    selectedMetric === "activity"
                      ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold"
                      : "text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-white/5"
                  }`}
                >
                  Activity
                </button>
                {/* Break time is rendered directly in Worked time mode */}
              </div>
            )}
          </div>
        </div>

        {/* Right: Legend matching screenshot */}
        {selectedMetric === "activity" ? (
          <div
            data-testid="timeline-legend-activity"
            className="flex flex-wrap items-center gap-3.5 text-[11px] text-gray-500 dark:text-slate-400"
          >
            <div className="flex items-center gap-1.5">
              <span>Low</span>
              <div className="flex items-center gap-0.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-200 dark:bg-emerald-900/60" title="1–19%" />
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-300 dark:bg-emerald-800/70" title="20–39%" />
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 dark:bg-emerald-700/80" title="40–59%" />
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 dark:bg-emerald-600/90" title="60–79%" />
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-700 dark:bg-emerald-500" title="80–100%" />
              </div>
              <span>High</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-slate-300 dark:bg-slate-700/80 border border-dashed border-slate-400" />
              <span>unavailable</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-400 dark:bg-amber-500" />
              <span>break</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-gray-200 dark:bg-slate-700/60" />
              <span>not tracking</span>
            </div>
            <div className="flex items-center gap-1">
              <HiOutlineBolt className="w-3.5 h-3.5 text-amber-500" />
              <span>unusual input</span>
            </div>
          </div>
        ) : (
          <div
            data-testid="timeline-legend-worked"
            className="flex flex-wrap items-center gap-3.5 text-[11px] text-gray-500 dark:text-slate-400"
          >
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-0.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-200 dark:bg-emerald-900/60" />
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 dark:bg-emerald-700/80" />
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-800 dark:bg-emerald-500" />
              </div>
              <span>active (darker = more input)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-400 dark:bg-amber-500" />
              <span>break</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-gray-200 dark:bg-slate-700/60" />
              <span>not tracking</span>
            </div>
            <div className="flex items-center gap-1">
              <HiOutlineBolt className="w-3.5 h-3.5 text-amber-500" />
              <span>unusual input</span>
            </div>
          </div>
        )}
      </div>

      {/* 2. SUPPORTING TEXT */}
      <div className="pt-2 pb-1.5">
        <p className="text-[11px] text-gray-400 dark:text-slate-500 italic">
          Team selection affects this timeline only.
        </p>
      </div>

      {/* 3. TEAM SUMMARY LINE */}
      <div className="py-1.5 px-0 text-xs font-medium text-gray-700 dark:text-slate-300 border-b border-gray-100 dark:border-[#22324D]/60 flex flex-wrap items-center gap-1.5">
        <span>Team avg {summaryMetrics.avgWorkedFormatted}</span>
        <span className="text-gray-300 dark:text-slate-600">·</span>
        <span>{summaryMetrics.activePercentage}% tracking</span>
        {summaryMetrics.topPerformer && (
          <>
            <span className="text-gray-300 dark:text-slate-600">·</span>
            <span>
              Top: {summaryMetrics.topPerformer.name} {summaryMetrics.topPerformer.workedFormatted}
            </span>
          </>
        )}
        {summaryMetrics.biggestDrop && (
          <>
            <span className="text-gray-300 dark:text-slate-600">·</span>
            <span>
              Biggest drop: {summaryMetrics.biggestDrop.name} −{summaryMetrics.biggestDrop.dropPoints} pts vs {summaryMetrics.biggestDrop.comparisonLabel || "their avg"}
            </span>
          </>
        )}
        {/* Unusual activity metric distinction:
            - Positive: display actual duration with lightning badge
            - Confirmed zero: display 0m
            - Unavailable: omit metric to avoid misleading the user with false 0m */}
        {summaryMetrics.unusualActivityStatus === "positive" && (
          <>
            <span className="text-gray-300 dark:text-slate-600">·</span>
            <span
              data-testid="summary-unusual-activity"
              className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold"
            >
              <HiOutlineBolt className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Unusual activity {summaryMetrics.unusualActivityFormatted}</span>
            </span>
          </>
        )}
        {summaryMetrics.unusualActivityStatus === "measured-zero" && (
          <>
            <span className="text-gray-300 dark:text-slate-600">·</span>
            <span
              data-testid="summary-unusual-activity"
              className="inline-flex items-center gap-1"
            >
              <span>Unusual activity 0m</span>
            </span>
          </>
        )}
      </div>

      {/* 4. TIMELINE TABLE HEADER */}
      <div className="overflow-x-auto">
        <div className="min-w-[824px]">
          {/* Table Column Headers */}
          <div className="grid grid-cols-[200px_1fr_168px_90px] items-center pt-3 pb-2 text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider border-b border-gray-100 dark:border-[#22324D]/40">
            <div>PERSON</div>
            <div className="relative pl-1">
              <div className="flex items-center justify-between pr-2">
                {buckets.filter((b) => b.hourLabel).map((b) => (
                  <span key={b.index} className="text-[10px]">
                    {b.hourLabel}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-right pr-4">ACTIVITY</div>
            <div className="text-right">TOTAL</div>
          </div>

          {/* 5. TIMELINE EMPLOYEE ROWS (Internally Scrollable) */}
          <div className="max-h-[480px] overflow-y-auto pt-4 divide-y divide-gray-100 dark:divide-[#22324D]/40 relative">
            {/* Current Time Vertical Line Marker bounded strictly inside Col 2 (Timeline Track) */}
            {timeMarker.isVisible && (
              <div className="pointer-events-none absolute inset-0 z-20 grid grid-cols-[200px_1fr_168px_90px]">
                <div />
                <div className="relative mr-2 h-full">
                  <span
                    className="absolute top-0.5 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-blue-500 text-white shadow-xs whitespace-nowrap"
                    style={
                      timeMarker.positionPercent > 86
                        ? { right: 0 }
                        : timeMarker.positionPercent < 14
                        ? { left: 0 }
                        : { left: `${timeMarker.positionPercent}%`, transform: "translateX(-50%)" }
                    }
                  >
                    {timeMarker.formattedTime}
                  </span>
                  <div
                    className="absolute top-4 bottom-0 w-[1.5px] -translate-x-1/2 bg-blue-500"
                    style={{ left: `${timeMarker.positionPercent}%` }}
                  />
                </div>
                <div />
                <div />
              </div>
            )}

            {filteredEmployees.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400 dark:text-slate-500">
                No employees found for the selected team scope.
              </div>
            ) : (
              <>
                {pinnedEmployees.length > 0 && (
                  <div
                    data-testid="exceptions-pinned-header"
                    className="px-0 py-1.5 bg-purple-50/40 dark:bg-purple-950/20 flex items-center gap-2"
                  >
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60">
                      exceptions pinned
                    </span>
                  </div>
                )}

                {[...pinnedEmployees, ...regularEmployees].map((emp) => (
                  <div
                    key={emp.id}
                    data-testid={`team-day-row-${emp.id}`}
                    className="grid grid-cols-[200px_1fr_168px_90px] items-center py-2.5 hover:bg-gray-50/70 dark:hover:bg-white/2 transition-colors relative"
                  >
                    {/* Column 1: PERSON */}
                    <div className="flex items-center gap-2.5 pr-2 truncate">
                      {/* Avatar */}
                      <div className="relative w-7 h-7 rounded-full shrink-0 overflow-hidden bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-bold text-[10px] flex items-center justify-center border border-gray-200 dark:border-slate-700">
                        {emp.avatar ? (
                          <Image
                            src={emp.avatar}
                            alt={emp.name}
                            fill
                            className="object-cover"
                            sizes="28px"
                          />
                        ) : (
                          <span>{getInitials(emp.name)}</span>
                        )}
                        {/* Status dot */}
                        <span
                          className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-white dark:border-slate-900 ${
                            emp.isTracking
                              ? "bg-emerald-500"
                              : emp.hasStarted
                              ? "bg-gray-400"
                              : "bg-gray-300"
                          }`}
                        />
                      </div>

                      {/* Name & Subtext */}
                      <div className="truncate">
                        <div className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                          {emp.name}
                        </div>
                        <div className="text-[10px] text-gray-400 dark:text-slate-500 truncate flex items-center gap-1">
                          <span>{emp.statusText}</span>
                        </div>
                      </div>
                    </div>

                    {/* Column 2: TIME TIMELINE */}
                    <div className="flex items-center gap-[2px] pr-2 overflow-visible h-6 relative">
                      {emp.cells.map((cell) => {
                        const visualState =
                          selectedMetric === "worked" &&
                          cell.workSeconds > 0 &&
                          cell.state !== "break" &&
                          cell.state !== "future" &&
                          typeof cell.activityScore === "number"
                            ? getActivityIntensityState(cell.activityScore)
                            : cell.state;
                        const hasPurpleBorder = Boolean(cell.unusualInput || cell.pinnedException);

                        return (
                          <div
                            key={cell.bucketIndex}
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setHoveredCell({
                                employeeName: emp.name,
                                timeRange: cell.timeRangeLabel,
                                state: visualState,
                                durationFormatted: formatTimelineDuration(cell.workSeconds || cell.breakSeconds),
                                activityScore: cell.activityScore,
                                appName: emp.statusText !== "off" && emp.statusText !== "not started" ? emp.statusText : undefined,
                                unusualInput: cell.unusualInput,
                                x: rect.left + rect.width / 2,
                                y: rect.top,
                              });
                            }}
                            onMouseLeave={() => setHoveredCell(null)}
                            className={`flex-1 h-3 rounded-[2px] transition-colors relative cursor-pointer ${getCellBgClass(
                              visualState
                            )} ${hasPurpleBorder ? "border-t-2 border-purple-500" : ""}`}
                          >
                            {/* Unusual input purple top marker + bolt */}
                            {cell.unusualInput && (
                              <HiOutlineBolt className="w-2.5 h-2.5 text-amber-500 absolute -top-2.5 left-0 pointer-events-none" />
                            )}
                          </div>
                        );
                      })}

                      {/* Not Started Status Pill in Timeline Area at Current Time Boundary */}
                      {!emp.hasStarted && isToday && (
                        <div
                          className="absolute top-1/2 z-10 pointer-events-none"
                          style={{
                            left: `${Math.min(86, Math.max(14, timeMarker.positionPercent))}%`,
                            transform: "translate(-50%, -50%)",
                          }}
                        >
                          <span
                            data-testid={`not-started-pill-${emp.id}`}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border border-amber-500/80 text-amber-600 dark:text-amber-400 bg-white/95 dark:bg-[#0F172A]/95 shadow-xs whitespace-nowrap"
                          >
                            Not started
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Column 3: ACTIVITY */}
                    <div className="flex items-center justify-end gap-1.5 pr-4">
                      {/* Real unusual activity indicator if present on employee */}
                      {emp.unusualActivityMinutes && emp.unusualActivityMinutes > 0 ? (
                        <span
                          data-testid={`unusual-activity-badge-${emp.id}`}
                          className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-300/60 dark:border-amber-800/60 shrink-0"
                          title={`Repeated aggregate pattern observed: ${emp.unusualActivityMinutes}m (${emp.unusualActivityCount || 1} observations). Numerical observation only.`}
                        >
                          <HiOutlineBolt className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                          <span>{emp.unusualActivityMinutes}m</span>
                        </span>
                      ) : null}

                      <div className="w-14 h-1.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden shrink-0">
                        <div
                          className={`h-full rounded-full ${
                            typeof emp.activityScore === "number" && emp.activityScore >= 50
                              ? "bg-emerald-500"
                              : typeof emp.activityScore === "number" && emp.activityScore > 0
                              ? "bg-amber-500"
                              : "bg-transparent"
                          }`}
                          style={{
                            width: typeof emp.activityScore === "number" ? `${Math.min(100, emp.activityScore)}%` : "0%",
                          }}
                        />
                      </div>
                      <span className="text-xs font-mono font-medium text-gray-700 dark:text-slate-300 w-8 text-right shrink-0">
                        {emp.activityMeasured && typeof emp.activityScore === "number"
                          ? `${emp.activityScore}%`
                          : "—"}
                      </span>
                    </div>

                    {/* Column 4: TOTAL */}
                    <div className="flex items-center justify-end gap-1 text-right">
                      {!emp.hasStarted || emp.workSeconds === 0 ? (
                        <span className="text-xs font-mono font-medium text-gray-400 dark:text-slate-500">
                          0h 00m
                        </span>
                      ) : (
                        <>
                          <span className="text-xs font-mono font-semibold text-gray-900 dark:text-white">
                            {formatTimelineDuration(emp.workSeconds)}
                          </span>
                          {typeof emp.activityDelta === "number" && emp.activityDelta > 0 && (
                            <span
                              className="text-[10px] font-bold text-emerald-500 dark:text-emerald-400 leading-none"
                              title={`+${emp.activityDelta} pts vs baseline`}
                            >
                              ▲
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 6. HOVER TOOLTIP PORTAL / FLOATING */}
      {hoveredCell && (
        <div
          className="fixed pointer-events-none z-50 -translate-x-1/2 -translate-y-full -mt-2 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-[#263852] bg-gray-900/95 dark:bg-[#090F1D]/95 text-white text-[11px] shadow-xl backdrop-blur-xs"
          style={{
            left: `${hoveredCell.x}px`,
            top: `${hoveredCell.y}px`,
          }}
        >
          <div className="font-bold">{hoveredCell.employeeName}</div>
          <div className="text-[10px] text-gray-300">{hoveredCell.timeRange}</div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px]">
            <span className="capitalize">{hoveredCell.state.replace("-", " ")}</span>
            {hoveredCell.durationFormatted !== "0h 00m" && (
              <span>· {hoveredCell.durationFormatted}</span>
            )}
            {hoveredCell.activityScore !== null && (
              <span>· Activity: {hoveredCell.activityScore}%</span>
            )}
            {hoveredCell.appName && <span>· {hoveredCell.appName}</span>}
            {hoveredCell.unusualInput && (
              <span className="text-amber-400">· Unusual input (repeated pattern)</span>
            )}
          </div>
        </div>
      )}

      {/* 7. FOOTER */}
      <div className="flex items-center justify-end pt-3 mt-1 border-t border-gray-100 dark:border-[#22324D]/60">
        <button
          type="button"
          onClick={handleNavigateToReport}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors cursor-pointer"
          data-testid="team-report-footer-link"
        >
          <span>View all {filteredEmployees.length} · Team Report</span>
          <HiOutlineArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
