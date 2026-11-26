"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import API from "@/api";
import socket from "@/socket/socket";
import { useDashboard } from "@/context/DashboardContext";
import { isTeamReportAccess, getReportAccessLabel } from "@/utils/reportAccess";
import { formatDateForApi, getAppTimezone } from "@/utils/appTimezone";
import useDesktopNavigation from "@/hooks/useDesktopNavigation";
import TeamHomeHeader from "./TeamHomeHeader";
import QuickReportLinks from "./QuickReportLinks";
import TeamMetricCards from "./TeamMetricCards";
import TeamAttendanceOverview, { type AttendanceCounts } from "./TeamAttendanceOverview";
import TeamActivityOverview from "./TeamActivityOverview";
import TeamProductivityOverview from "./TeamProductivityOverview";
import TeamMembersTable from "./TeamMembersTable";
import TeamDayLive from "./TeamDayLive";
import TeamWeeklyComparison from "./TeamWeeklyComparison";
import {
  resolveTodayShiftConfig,
  computeEmployeeAttendanceStatus,
} from "@/utils/teamAttendanceStatus";
import {
  HiOutlineShieldCheck,
  HiOutlineChartBar,
  HiOutlineClock,
  HiOutlineBolt,
  HiOutlineSparkles,
  HiOutlineUserGroup,
  HiOutlineCalendarDays,
} from "react-icons/hi2";

export interface TeamHomeDashboardProps {
  onSwitchToPersonal?: () => void;
}

// Helper to convert "HH:MM:SS" or "Xh Ym" string to seconds
function parseTimeToSeconds(timeStr?: string | null): number {
  if (!timeStr || typeof timeStr !== "string") return 0;
  const parts = timeStr.trim().split(":");
  if (parts.length === 3) {
    const h = parseInt(parts[0] || "0", 10) || 0;
    const m = parseInt(parts[1] || "0", 10) || 0;
    const s = parseInt(parts[2] || "0", 10) || 0;
    return h * 3600 + m * 60 + s;
  }
  const hMatch = timeStr.match(/(\d+)\s*h/i);
  const mMatch = timeStr.match(/(\d+)\s*m/i);
  const hours = hMatch && hMatch[1] ? parseInt(hMatch[1], 10) : 0;
  const minutes = mMatch && mMatch[1] ? parseInt(mMatch[1], 10) : 0;
  return hours * 3600 + minutes * 60;
}

// Helper to parse clock time e.g. "09:15 AM", "14:30" to minutes from midnight
function parseClockToMinutes(clockStr?: string | null): number | null {
  if (!clockStr || typeof clockStr !== "string") return null;
  const match = clockStr.match(/(\d+):(\d+)(?:\s*(AM|PM))?/i);
  if (!match || !match[1] || !match[2]) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3]?.toUpperCase();
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

export default function TeamHomeDashboard({
  onSwitchToPersonal,
}: TeamHomeDashboardProps) {
  const router = useRouter();
  const { user } = useDashboard();

  // State management
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [overviewData, setOverviewData] = useState<any[]>([]);
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [effectiveSettings, setEffectiveSettings] = useState<any>(null);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);

  // Phase 113D-D State: Activity & Productivity
  const [usageData, setUsageData] = useState<any[]>([]);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usageRestricted, setUsageRestricted] = useState(false);

  const [productivityData, setProductivityData] = useState<any[]>([]);
  const [productivityError, setProductivityError] = useState<string | null>(null);
  const [productivityRestricted, setProductivityRestricted] = useState(false);

  const fetchRequestIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Timezone resolution
  const timezone = useMemo(() => {
    return getAppTimezone(user?.reportTimezone);
  }, [user?.reportTimezone]);

  const todayDateStr = useMemo(() => {
    return formatDateForApi(new Date(), timezone);
  }, [timezone]);

  // Authorization check
  const isAuthorized = isTeamReportAccess(user);

  // Desktop / Web unified navigation handlers (WORKCOMPOSER-122)
  const { navigateToReport } = useDesktopNavigation();

  const handleNavigateToUsage = useCallback(() => {
    navigateToReport("usage", "/dashboard/time-tracking/usage");
  }, [navigateToReport]);

  const handleNavigateToProductivity = useCallback(() => {
    navigateToReport("productivity", "/dashboard/time-tracking/productivity");
  }, [navigateToReport]);

  const handleNavigateToOverview = useCallback(() => {
    navigateToReport("overview", "/dashboard/time-tracking/overview");
  }, [navigateToReport]);

  // 1. Authoritative Data Fetching Engine (Promise.allSettled)
  const fetchTeamData = useCallback(
    async (isBackground = false) => {
      if (!isAuthorized) return;
      if (inFlightRef.current && isBackground) return;

      const requestId = ++fetchRequestIdRef.current;
      inFlightRef.current = true;

      if (!isBackground) {
        setIsLoading(true);
      }

      try {
        const [overviewRes, attendanceRes, settingsRes, usageRes, productivityRes] = await Promise.allSettled([
          API.get(`/sessions/overview?startDate=${todayDateStr}&endDate=${todayDateStr}`),
          API.get(`/attendance?startDate=${todayDateStr}&endDate=${todayDateStr}`),
          API.get("/time-tracking/settings/effective"),
          API.get(`/usage?startDate=${todayDateStr}&endDate=${todayDateStr}`),
          API.get(`/reports/productivity?startDate=${todayDateStr}&endDate=${todayDateStr}`),
        ]);

        if (requestId !== fetchRequestIdRef.current) return;

        // Process Overview Sessions data
        if (overviewRes.status === "fulfilled" && Array.isArray(overviewRes.value?.data)) {
          setOverviewData(overviewRes.value.data);
        } else {
          setOverviewData([]);
        }

        // Process Attendance data
        if (attendanceRes.status === "fulfilled" && Array.isArray(attendanceRes.value?.data)) {
          setAttendanceData(attendanceRes.value.data);
          setAttendanceError(null);
        } else {
          setAttendanceData([]);
          if (attendanceRes.status === "rejected") {
            setAttendanceError(attendanceRes.reason?.message || "Failed to load attendance records");
          }
        }

        // Process Settings data
        if (settingsRes.status === "fulfilled") {
          setEffectiveSettings(settingsRes.value?.data || null);
        }

        // Process Team Activity / Usage data
        if (usageRes.status === "fulfilled" && Array.isArray(usageRes.value?.data)) {
          setUsageData(usageRes.value.data);
          setUsageError(null);
          setUsageRestricted(false);
        } else if (usageRes.status === "rejected") {
          const status = usageRes.reason?.response?.status;
          if (status === 403) {
            setUsageRestricted(true);
            setUsageData([]);
            setUsageError(null);
          } else {
            setUsageError(usageRes.reason?.message || "Failed to load team activity records");
            setUsageRestricted(false);
            // Preserve previous successful usageData on transient refresh/polling failure
          }
        }

        // Process Team Productivity data
        if (productivityRes.status === "fulfilled" && Array.isArray(productivityRes.value?.data)) {
          setProductivityData(productivityRes.value.data);
          setProductivityError(null);
          setProductivityRestricted(false);
        } else if (productivityRes.status === "rejected") {
          const status = productivityRes.reason?.response?.status;
          if (status === 403) {
            setProductivityRestricted(true);
            setProductivityData([]);
            setProductivityError(null);
          } else {
            setProductivityError(productivityRes.reason?.message || "Failed to load team productivity records");
            setProductivityRestricted(false);
            // Preserve previous successful productivityData on transient refresh/polling failure
          }
        }
      } catch (err: any) {
        if (requestId === fetchRequestIdRef.current) {
          console.error("TEAM HOME DATA FETCH ERROR:", err);
        }
      } finally {
        if (requestId === fetchRequestIdRef.current) {
          inFlightRef.current = false;
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [isAuthorized, todayDateStr]
  );

  // 2. Initial Mount & Trigger
  useEffect(() => {
    let mounted = true;
    if (isAuthorized) {
      fetchTeamData(false);
    }
    return () => {
      mounted = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isAuthorized, fetchTeamData]);

  // 3. User-Initiated Refresh Handler (truthful loading feedback)
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchTeamData(true);
  }, [fetchTeamData]);

  // 4. Socket Events & Debounced Invalidation
  useEffect(() => {
    if (!isAuthorized) return;

    const debouncedInvalidate = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(function triggerDebounce() {
        fetchTeamData(true);
      }, 1500); // 1.5s debounce window
    };

    socket.on("timerStarted", debouncedInvalidate);
    socket.on("timerStopped", debouncedInvalidate);
    socket.on("tracking:started", debouncedInvalidate);
    socket.on("tracking:stopped", debouncedInvalidate);
    socket.on("session:updated", debouncedInvalidate);

    return () => {
      socket.off("timerStarted", debouncedInvalidate);
      socket.off("timerStopped", debouncedInvalidate);
      socket.off("tracking:started", debouncedInvalidate);
      socket.off("tracking:stopped", debouncedInvalidate);
      socket.off("session:updated", debouncedInvalidate);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isAuthorized, fetchTeamData]);

  // 5. Periodic 60s Polling When Active Tracking Exists
  const metrics = useMemo(() => {
    // 1. Authorized Unique Employee Population
    const authorizedUserIds = new Set<string>();
    for (const u of overviewData) {
      const id = u.id || u._id || u.userId;
      if (id) authorizedUserIds.add(String(id));
    }
    for (const u of attendanceData) {
      const id = u.id || u._id;
      if (id) authorizedUserIds.add(String(id));
    }
    const totalMembers = Math.max(authorizedUserIds.size, overviewData.length, attendanceData.length);

    // 2. Unique Active Employees (Prevent multiple sessions per employee inflating count)
    const activeUserIds = new Set<string>();
    for (const u of overviewData) {
      if (u.status?.toLowerCase().includes("running")) {
        const id = u.id || u._id || u.userId;
        if (id) activeUserIds.add(String(id));
      }
    }
    for (const u of attendanceData) {
      if (u.isTracking) {
        const id = u.id || u._id;
        if (id) activeUserIds.add(String(id));
      }
    }
    const activeCount = activeUserIds.size;

    // 3. User Work Map (Deduplicate multiple records per employee to prevent duration inflation)
    const userWorkMap = new Map<
      string,
      { workSeconds: number; breakSeconds: number; hasPunched: boolean; contributed: boolean }
    >();

    if (attendanceData.length > 0) {
      for (const u of attendanceData) {
        const id = String(u.id || u._id || Math.random());
        const work = Math.max(0, Number(u.workSeconds) || 0);
        const brk = Math.max(0, Number(u.breakSeconds) || 0);
        const isPresent = work > 0 || Boolean(u.startTime) || Boolean(u.isTracking);
        const isContributor = work > 0;

        if (!userWorkMap.has(id)) {
          userWorkMap.set(id, {
            workSeconds: work,
            breakSeconds: brk,
            hasPunched: isPresent,
            contributed: isContributor,
          });
        } else {
          const existing = userWorkMap.get(id)!;
          existing.workSeconds += work;
          existing.breakSeconds += brk;
          existing.hasPunched = existing.hasPunched || isPresent;
          existing.contributed = existing.contributed || isContributor;
        }
      }
    } else if (overviewData.length > 0) {
      for (const u of overviewData) {
        const id = String(u.id || u._id || u.userId || Math.random());
        const work = parseTimeToSeconds(u.workTime);
        const brk = parseTimeToSeconds(u.breakTime);
        const isPresent = work > 0 || Boolean(u.status?.toLowerCase().includes("running"));
        const isContributor = work > 0;

        if (!userWorkMap.has(id)) {
          userWorkMap.set(id, {
            workSeconds: work,
            breakSeconds: brk,
            hasPunched: isPresent,
            contributed: isContributor,
          });
        } else {
          const existing = userWorkMap.get(id)!;
          existing.workSeconds += work;
          existing.breakSeconds += brk;
          existing.hasPunched = existing.hasPunched || isPresent;
          existing.contributed = existing.contributed || isContributor;
        }
      }
    }

    let totalWorkSecs = 0;
    let totalBreakSecs = 0;
    let presentCount = 0;
    let contributorCount = 0;

    for (const entry of userWorkMap.values()) {
      totalWorkSecs += entry.workSeconds;
      totalBreakSecs += entry.breakSeconds;
      if (entry.hasPunched) presentCount++;
      if (entry.contributed) contributorCount++;
    }

    // Active contributor average divides strictly by employees who actually contributed work
    const avgWorkSecondsWorked = contributorCount > 0 ? Math.round(totalWorkSecs / contributorCount) : 0;
    // Team-wide average divides by the total authorized employee population
    const avgWorkSecondsTeam = totalMembers > 0 ? Math.round(totalWorkSecs / totalMembers) : 0;

    return {
      totalWorkSeconds: totalWorkSecs,
      totalBreakSeconds: totalBreakSecs,
      activeCount,
      totalMembers,
      presentCount,
      contributorCount,
      avgWorkSecondsWorked,
      avgWorkSecondsTeam,
    };
  }, [overviewData, attendanceData]);

  const hasActiveTracking = useMemo(() => {
    return metrics.activeCount > 0;
  }, [metrics.activeCount]);

  useEffect(() => {
    if (!hasActiveTracking || !isAuthorized) return;

    const intervalId = setInterval(() => {
      fetchTeamData(true);
    }, 60000); // 60s interval

    return () => clearInterval(intervalId);
  }, [hasActiveTracking, isAuthorized, fetchTeamData]);

  // 7. Attendance Overview Calculations (Deduplicated per unique user)
  const uniqueAttendanceUsers = useMemo(() => {
    const map = new Map<string, any>();
    for (const item of attendanceData) {
      const id = String(item.id || item._id);
      if (!map.has(id)) {
        map.set(id, item);
      } else {
        const existing = map.get(id);
        const workSecs = (Number(existing.workSeconds) || 0) + (Number(item.workSeconds) || 0);
        const breakSecs = (Number(existing.breakSeconds) || 0) + (Number(item.breakSeconds) || 0);
        map.set(id, {
          ...existing,
          workSeconds: workSecs,
          breakSeconds: breakSecs,
          startTime: existing.startTime || item.startTime,
          finishTime: item.finishTime || existing.finishTime,
          isTracking: existing.isTracking || item.isTracking,
        });
      }
    }
    return Array.from(map.values());
  }, [attendanceData]);

  const attendanceCounts: AttendanceCounts = useMemo(() => {
    const totalMembers = metrics.totalMembers;
    const shiftConfig = resolveTodayShiftConfig(effectiveSettings, timezone);

    // Authoritative attendance business rules evaluated via @/utils/teamAttendanceStatus:
    // const hasPunched = work > 0 || Boolean(emp.startTime) || emp.isTracking;
    // punchMinutes > shiftStartMinutes;
    // currentMinutes < shiftStartMinutes;

    let onTimeCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let upcomingCount = 0;
    let dayOffCount = 0;

    for (const emp of uniqueAttendanceUsers) {
      const status = computeEmployeeAttendanceStatus(emp, shiftConfig);
      switch (status) {
        case "on_time":
          onTimeCount++;
          break;
        case "late":
          lateCount++;
          break;
        case "absent":
          absentCount++;
          break;
        case "upcoming":
          upcomingCount++;
          break;
        case "day_off":
          dayOffCount++;
          break;
      }
    }

    const presentCount = onTimeCount + lateCount;
    const totalScheduled = shiftConfig.isWorkingDay ? totalMembers - dayOffCount : 0;
    const attendanceRate = totalScheduled > 0
      ? Math.min(100, Math.round((presentCount / totalScheduled) * 100))
      : (presentCount > 0 ? 100 : 0);

    return {
      presentCount,
      onTimeCount,
      lateCount,
      absentCount,
      upcomingCount,
      dayOffCount,
      totalScheduled,
      totalMembers,
      attendanceRate,
      shiftStart: shiftConfig.shiftStart,
      isWorkingDay: shiftConfig.isWorkingDay,
    };
  }, [uniqueAttendanceUsers, effectiveSettings, timezone, metrics.totalMembers]);

  // Loading skeleton when user context is null
  if (!user) {
    return (
      <div className="w-full space-y-6 animate-pulse" data-testid="team-home-loading">
        <div className="h-28 rounded-2xl bg-gray-200 dark:bg-[#1E293B]/70" />
        <div className="h-32 rounded-2xl bg-gray-200 dark:bg-[#1E293B]/70" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-56 rounded-2xl bg-gray-200 dark:bg-[#1E293B]/70" />
          ))}
        </div>
      </div>
    );
  }

  // Strict Permission Enforcement Guard
  if (!isAuthorized) {
    return (
      <div
        className="w-full rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 p-6 sm:p-8"
        data-testid="team-home-restricted"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <HiOutlineShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Team Home Access Restricted
              </h2>
              <p className="text-sm text-gray-600 dark:text-slate-400 mt-1 max-w-2xl">
                Your account is scoped to personal reports only (
                <span className="font-semibold uppercase">{getReportAccessLabel(user)}</span>
                ). Access to team analytics and subordinate data is restricted by organization policy.
              </p>
            </div>
          </div>
          {onSwitchToPersonal && (
            <button
              type="button"
              onClick={onSwitchToPersonal}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer shrink-0"
            >
              Return to Personal Home
            </button>
          )}
        </div>
      </div>
    );
  }

  // Roadmap Blueprint Sections for subsequent phases
  const roadmapSections: any[] = [];

  return (
    <div className="w-full space-y-6" data-testid="team-home-dashboard">
      {/* 1. Header Foundation (Real data refresh enabled) */}
      <TeamHomeHeader
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        disabled={false}
      />

      {/* 2. Quick Report Shortcuts (Team Variant) */}
      <QuickReportLinks variant="team" />

      {/* 3. Section 1 (Integrated in Phase 113D-C): Team Overview Metrics */}
      <div id="team-overview" data-testid="team-overview-metrics-section">
        <TeamMetricCards
          totalWorkSeconds={metrics.totalWorkSeconds}
          totalBreakSeconds={metrics.totalBreakSeconds}
          activeCount={metrics.activeCount}
          totalMembers={metrics.totalMembers}
          presentCount={metrics.presentCount}
          contributorCount={metrics.contributorCount}
          avgWorkSecondsWorked={metrics.avgWorkSecondsWorked}
          avgWorkSecondsTeam={metrics.avgWorkSecondsTeam}
          isLoading={isLoading}
        />
      </div>

      {/* 4. Section 2 (Integrated in Phase 113D-C): Team Attendance Overview */}
      <div id="attendance-overview" data-testid="team-attendance-overview-section">
        <TeamAttendanceOverview
          counts={attendanceCounts}
          isLoading={isLoading}
          error={attendanceError}
          onRetry={() => fetchTeamData(false)}
        />
      </div>

      {/* 5. Section 3 (Phase 113D-D): Team Activity Today */}
      <div id="team-activity" data-testid="team-activity-section">
        <TeamActivityOverview
          usageData={usageData}
          totalMembers={metrics.totalMembers}
          isLoading={isLoading}
          isRestricted={usageRestricted}
          errorMessage={usageError}
          onRetry={() => fetchTeamData(false)}
          onNavigateToUsage={handleNavigateToUsage}
        />
      </div>

      {/* 6. Section 4 (Phase 113D-D): Team Productivity Overview */}
      <div id="team-productivity" data-testid="team-productivity-section">
        <TeamProductivityOverview
          productivityData={productivityData}
          isLoading={isLoading}
          isRestricted={productivityRestricted}
          errorMessage={productivityError}
          onRetry={() => fetchTeamData(false)}
          onNavigateToProductivity={handleNavigateToProductivity}
        />
      </div>

      {/* 7. Section 5 (WORKCOMPOSER-117): Team Day — Live Activity Timeline */}
      <div id="team-members" data-testid="team-members-section">
        <TeamDayLive
          attendanceData={attendanceData}
          overviewData={overviewData}
          usageData={usageData}
          productivityData={productivityData}
          effectiveSettings={effectiveSettings}
          timezone={timezone}
          selectedDate={todayDateStr}
          isLoading={isLoading}
          error={attendanceError}
          onRetry={() => fetchTeamData(false)}
          onNavigateToOverview={handleNavigateToOverview}
        />
      </div>

      {/* 8. Section 6 (Phase 113D-E): Weekly Comparison */}
      <div id="weekly-comparison" data-testid="team-weekly-comparison-section">
        <TeamWeeklyComparison
          timezone={timezone}
          isAuthorized={isAuthorized}
        />
      </div>

      {/* 9. Roadmap Blueprint Grid (Phase 113D-E) - Render only if remaining roadmap items */}
      {roadmapSections.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Scheduled Roadmap Analytics
              </h3>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Future components scheduled for Phase 113D-E integration.
              </p>
            </div>
            <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-[#1E293B] text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-[#22324D] self-start sm:self-auto">
              {roadmapSections.length} {roadmapSections.length === 1 ? "Section" : "Sections"} Scheduled
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {roadmapSections.map((sec) => {
              const Icon = sec.icon;
              return (
                <div
                  key={sec.id}
                  data-testid={`team-placeholder-${sec.id}`}
                  className="group relative flex flex-col justify-between p-5 rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] shadow-xs hover:border-indigo-300 dark:hover:border-indigo-800 transition-all duration-200"
                >
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div
                        className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${sec.color}`}
                      >
                        <Icon className="w-6 h-6" />
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80">
                        {sec.phaseBadge}
                      </span>
                    </div>

                    <div className="mb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                        {sec.category}
                      </span>
                      <h4 className="text-base font-bold text-gray-900 dark:text-white mt-0.5">
                        {sec.title}
                      </h4>
                    </div>

                    <p className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed mb-4">
                      {sec.description}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-gray-100 dark:border-[#22324D]/60 flex items-center justify-between text-[11px]">
                    <span className="text-gray-400 dark:text-slate-500 font-medium">Source:</span>
                    <code className="px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 font-mono text-[10px]">
                      {sec.backendSource}
                    </code>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
