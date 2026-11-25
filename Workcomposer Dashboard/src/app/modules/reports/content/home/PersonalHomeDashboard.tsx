"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import API from "@/api";
import socket from "@/socket/socket";
import { useDashboard } from "@/context/DashboardContext";
import { useOptionalDesktop } from "@/context/DesktopContext";
import { useOptionalTimer } from "@/context/TimerContext";
import useEffectiveTrackingSettings from "@/hooks/useEffectiveTrackingSettings";
import { getAppTimezone, getTodayInTimezone } from "@/utils/appTimezone";

import PersonalHomeHeader from "./PersonalHomeHeader";
import PersonalMetricCards from "./PersonalMetricCards";
import PersonalDayTimeline, { type HourItem } from "./PersonalDayTimeline";
import PersonalWeekComparison, { type DailyRecord } from "./PersonalWeekComparison";
import PersonalProductivityCard, { type ProductivitySummary } from "./PersonalProductivityCard";
import QuickReportLinks from "./QuickReportLinks";

export default function PersonalHomeDashboard() {
  const router = useRouter();
  const desktop = useOptionalDesktop();
  const { user } = useDashboard();
  const timerContext = useOptionalTimer();
  const { settings: effectiveSettings } = useEffectiveTrackingSettings();

  const timezone = useMemo(() => {
    return getAppTimezone(user?.reportTimezone);
  }, [user?.reportTimezone]);

  const todayStr = useMemo(() => {
    return getTodayInTimezone(timezone);
  }, [timezone]);

  // Loading & error states
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingTodayChart, setLoadingTodayChart] = useState(true);
  const [loadingLast30Days, setLoadingLast30Days] = useState(true);
  const [loadingProductivity, setLoadingProductivity] = useState(true);

  // Data states
  const [todayTaskSummary, setTodayTaskSummary] = useState<{
    assignedTasks?: number;
    workedTasks?: number;
    taskWorkSeconds?: number;
    breakSeconds?: number;
    activityPercent?: number;
  } | null>(null);

  const [activityData, setActivityData] = useState<{
    activity?: number;
    activityScore?: number;
    idleTime?: number;
  } | null>(null);

  const [hourlyBuckets, setHourlyBuckets] = useState<HourItem[]>([]);
  const [dailyRecords, setDailyRecords] = useState<DailyRecord[]>([]);
  const [productivitySummary, setProductivitySummary] = useState<ProductivitySummary | null>(null);
  const [isProductivityRestricted, setIsProductivityRestricted] = useState(false);

  // Active task name resolution
  const activeTaskName = useMemo(() => {
    if (!timerContext?.timer) return undefined;
    const t = timerContext.timer;
    return (
      t.task?.title ||
      t.task?.name ||
      t.taskTitle ||
      t.taskName ||
      t.project?.name ||
      t.projectName ||
      undefined
    );
  }, [timerContext?.timer]);

  // Fetch all personal metrics in parallel using Promise.allSettled
  const fetchDashboardData = useCallback(async () => {
    if (!user?._id && !user?.id) return;
    const userId = user._id || user.id;

    const results = await Promise.allSettled([
      // 0: Today task summary
      API.get("/sessions/today-task-summary", {
        params: { date: todayStr, timezone },
      }),
      // 1: Activity metrics
      API.get(`/activity/${userId}`, {
        params: { date: todayStr, timezone },
      }),
      // 2: Today 24h chart
      API.get("/sessions/today-chart", {
        params: { date: todayStr, timezone },
      }),
      // 3: Last 30 days chart
      API.get("/sessions/last-30-days-chart", {
        params: { timezone },
      }),
      // 4: Productivity
      API.get("/reports/productivity", {
        params: {
          startDate: todayStr,
          endDate: todayStr,
          users: userId,
        },
      }),
    ]);

    // Handle 0: Today task summary
    if (results[0].status === "fulfilled") {
      setTodayTaskSummary(results[0].value.data || null);
    }
    setLoadingSummary(false);

    // Handle 1: Activity
    if (results[1].status === "fulfilled") {
      setActivityData(results[1].value.data || null);
    }

    // Handle 2: Today chart
    if (results[2].status === "fulfilled") {
      const data = results[2].value.data;
      if (Array.isArray(data)) {
        setHourlyBuckets(data);
      }
    }
    setLoadingTodayChart(false);

    // Handle 3: Last 30 days chart
    if (results[3].status === "fulfilled") {
      const data = results[3].value.data;
      if (Array.isArray(data)) {
        setDailyRecords(data);
      }
    }
    setLoadingLast30Days(false);

    // Handle 4: Productivity
    if (results[4].status === "fulfilled") {
      const data = results[4].value.data;
      setIsProductivityRestricted(false);
      if (Array.isArray(data) && data.length > 0) {
        // First entry corresponds to caller user
        const callerProd = data[0];
        setProductivitySummary({
          productivePercent: Number(callerProd.productivePercent || 0),
          neutralPercent: Number(callerProd.neutralPercent || 0),
          unproductivePercent: Number(callerProd.unproductivePercent || 0),
          productiveSeconds: Number(callerProd.productiveSeconds || 0),
          neutralSeconds: Number(callerProd.neutralSeconds || 0),
          unproductiveSeconds: Number(callerProd.unproductiveSeconds || 0),
          productiveApps: callerProd.productiveApps || [],
          neutralApps: callerProd.neutralApps || [],
          unproductiveApps: callerProd.unproductiveApps || [],
        });
      } else {
        setProductivitySummary(null);
      }
    } else {
      const err = results[4].reason as any;
      if (err?.response?.status === 403) {
        setIsProductivityRestricted(true);
      }
      setProductivitySummary(null);
    }
    setLoadingProductivity(false);
  }, [user, todayStr, timezone]);

  // Initial load
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Socket event listener with debounce for real-time invalidation without 1-second polling
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleRemoteSessionUpdate = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        fetchDashboardData();
      }, 1000);
    };

    socket.on("session:updated", handleRemoteSessionUpdate);
    socket.on("time-tracked", handleRemoteSessionUpdate);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      socket.off("session:updated", handleRemoteSessionUpdate);
      socket.off("time-tracked", handleRemoteSessionUpdate);
    };
  }, [fetchDashboardData]);

  // Manual refresh handler
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.allSettled([
        fetchDashboardData(),
        timerContext?.refreshTodayWork ? timerContext.refreshTodayWork() : Promise.resolve(),
        timerContext?.refreshStats ? timerContext.refreshStats() : Promise.resolve(),
      ]);
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 500);
    }
  };

  const displayedWorkSeconds =
    timerContext?.displayedWorkSeconds ||
    todayTaskSummary?.taskWorkSeconds ||
    0;

  const todayBreakSeconds =
    timerContext?.todayBreakSeconds ||
    todayTaskSummary?.breakSeconds ||
    0;

  const currentActivityScore =
    activityData?.activityScore ?? todayTaskSummary?.activityPercent ?? 0;

  const idlePercentage = Math.max(0, 100 - currentActivityScore);

  const isPolicyRestricted = user?.reportAccess === "none" || isProductivityRestricted;

  // 7-day rolling work calculation from last 30 days (in hours), synchronized with live today tracking
  const recent7DaysWorkHours = useMemo(() => {
    if (!dailyRecords || dailyRecords.length === 0) {
      return (displayedWorkSeconds || 0) / 3600;
    }
    const last7 = dailyRecords.slice(-7);
    const baseHours = last7.reduce((acc, curr) => acc + (Number(curr.work) || 0), 0);
    // If today is actively ticking in TimerContext, add any live delta beyond the last fetched today value
    const lastRecordHours = Number(dailyRecords[dailyRecords.length - 1]?.work) || 0;
    const liveTodayHours = (displayedWorkSeconds || 0) / 3600;
    const liveDeltaHours = Math.max(0, liveTodayHours - lastRecordHours);
    return Number((baseHours + liveDeltaHours).toFixed(1));
  }, [dailyRecords, displayedWorkSeconds]);

  // Navigation helpers (WORKCOMPOSER-122)
  const handleNavigate = (reportName: string, path: string) => {
    if (desktop?.setActiveReport) {
      desktop.setActivePage?.("reports");
      desktop.setActiveReport(reportName);
      return;
    }
    router.push(path);
  };

  return (
    <div className="w-full min-w-0 space-y-6">
      {/* 1. Personal Header */}
      <PersonalHomeHeader
        user={user}
        reportTimezone={timezone}
        isTracking={timerContext?.isTracking || false}
        displayedWorkSeconds={displayedWorkSeconds}
        activeTaskName={activeTaskName}
        onRefresh={handleManualRefresh}
        isRefreshing={isRefreshing}
      />

      {/* 2. Key Metric Cards (Time, Activity, 7-Day Norm, Productivity Summary) */}
      <PersonalMetricCards
        displayedWorkSeconds={displayedWorkSeconds}
        todayBreakSeconds={todayBreakSeconds}
        stats={
          timerContext?.stats || {
            todaySeconds: displayedWorkSeconds,
            weekSeconds: 0,
            monthSeconds: 0,
            avgDaySeconds: 0,
          }
        }
        activityScore={currentActivityScore}
        idlePercentage={idlePercentage}
        hasActivityData={Boolean(activityData || todayTaskSummary)}
        activityLoading={loadingSummary}
        productivity={{
          productivePercent: productivitySummary?.productivePercent || 0,
          neutralPercent: productivitySummary?.neutralPercent || 0,
          unproductivePercent: productivitySummary?.unproductivePercent || 0,
          productiveSeconds: productivitySummary?.productiveSeconds || 0,
          neutralSeconds: productivitySummary?.neutralSeconds || 0,
          unproductiveSeconds: productivitySummary?.unproductiveSeconds || 0,
          isRestricted: isPolicyRestricted,
          hasData: Boolean(productivitySummary),
          loading: loadingProductivity,
        }}
        effectiveSettings={effectiveSettings}
        rolling7Hours={recent7DaysWorkHours}
      />

      {/* 3. Day Timeline & Week Comparison Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PersonalDayTimeline
          data={hourlyBuckets}
          loading={loadingTodayChart}
          timezone={timezone}
        />
        <PersonalWeekComparison
          last30Days={dailyRecords}
          loading={loadingLast30Days}
          timezone={timezone}
          todayActivityScore={currentActivityScore}
        />
      </div>

      {/* 4. Productivity Breakdown & Quick Report Shortcuts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <PersonalProductivityCard
            data={productivitySummary}
            isLoading={loadingProductivity}
            isRestricted={isPolicyRestricted}
            onNavigateToProductivity={() =>
              handleNavigate("productivity", "/dashboard/time-tracking/productivity")
            }
          />
        </div>
        <div className="lg:col-span-1">
          <QuickReportLinks onNavigate={handleNavigate} />
        </div>
      </div>
    </div>
  );
}
