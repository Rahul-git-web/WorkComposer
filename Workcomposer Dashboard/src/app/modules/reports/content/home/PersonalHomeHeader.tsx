"use client";

import { useMemo } from "react";
import Image from "next/image";
import { resolveAvatarUrl, getInitials } from "@/utils/auditAvatar";
import { Clock, User as UserIcon, AlertCircle, Wifi, Radio, RefreshCw } from "lucide-react";

interface Props {
  user: any;
  reportTimezone: string;
  isTracking: boolean;
  displayedWorkSeconds: number;
  activeTaskName?: string | null;
  activeProjectName?: string | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function PersonalHomeHeader({
  user,
  reportTimezone,
  isTracking,
  displayedWorkSeconds,
  activeTaskName,
  activeProjectName,
  onRefresh,
  isRefreshing,
}: Props) {
  // 1. Time-aware greeting computed in the user's reporting timezone
  const greetingInfo = useMemo(() => {
    try {
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: reportTimezone,
        hour: "numeric",
        hourCycle: "h23",
      }).formatToParts(now);

      const hourPart = parts.find((p) => p.type === "hour")?.value;
      const hour = hourPart !== undefined ? parseInt(hourPart, 10) : now.getHours();

      let greeting = "Good morning";
      if (hour >= 12 && hour < 17) {
        greeting = "Good afternoon";
      } else if (hour >= 17 || hour < 5) {
        greeting = "Good evening";
      }

      const formattedTime = new Intl.DateTimeFormat("en-US", {
        timeZone: reportTimezone,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(now);

      return { greeting, formattedTime };
    } catch {
      return { greeting: "Welcome", formattedTime: "" };
    }
  }, [reportTimezone]);

  // 2. User display name & avatar resolution
  const displayName = useMemo(() => {
    if (user?.firstName) {
      return `${user.firstName} ${user.lastName || ""}`.trim();
    }
    return user?.name || "Employee";
  }, [user]);

  const avatarUrl = useMemo(() => resolveAvatarUrl(user?.avatar), [user?.avatar]);
  const initials = useMemo(() => getInitials(user), [user]);

  // 3. Format seconds into HH:MM:SS
  const formatTimer = (totalSeconds: number) => {
    const s = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  return (
    <div className="w-full rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] shadow-sm p-5 sm:p-6 transition-colors duration-200">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        {/* Left: User Identity & Time-Aware Greeting */}
        <div className="flex items-center gap-4">
          {/* Avatar with fallback */}
          <div className="relative shrink-0 w-14 h-14 rounded-2xl overflow-hidden bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-lg shadow-sm">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName}
                width={56}
                height={56}
                className="w-full h-full object-cover"
                unoptimized
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                {greetingInfo.greeting}, {displayName}!
              </h1>
              {/* Personal Mode Badge */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/80">
                <UserIcon className="w-3 h-3" />
                Personal Mode
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500 dark:text-slate-400">
              {greetingInfo.formattedTime && (
                <span className="font-medium text-gray-700 dark:text-slate-300">
                  {greetingInfo.formattedTime}
                </span>
              )}
              <span>•</span>
              <span className="truncate max-w-[220px]" title={reportTimezone}>
                {reportTimezone}
              </span>
              <span>•</span>
              <span>{user?.email || "Signed in"}</span>
            </div>
          </div>
        </div>

        {/* Right: Read-Only Current Tracking Status & Refresh */}
        <div className="shrink-0 flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh dashboard data"
              aria-label="Refresh dashboard data"
              className="p-2.5 rounded-xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#1E293B]/70 text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white transition-all disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing ? "animate-spin text-indigo-600 dark:text-indigo-400" : ""}`}
              />
            </button>
          )}

          <div
            className={`w-full sm:w-auto flex items-center gap-3.5 px-4 py-2.5 rounded-xl border transition-all duration-200 ${
              isTracking
                ? "bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800/70 text-emerald-900 dark:text-emerald-200"
                : isTracking === false
                ? "bg-gray-50 dark:bg-[#1E293B]/70 border-gray-200 dark:border-[#22324D] text-gray-700 dark:text-slate-300"
                : "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300"
            }`}
          >
            {/* Live Status Indicator Pulse */}
            <div className="relative flex items-center justify-center">
              {isTracking ? (
                <>
                  <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </>
              ) : isTracking === false ? (
                <span className="inline-flex rounded-full h-2.5 w-2.5 bg-gray-400 dark:bg-slate-500" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-500" />
              )}
            </div>

            {/* Read-Only Status Details */}
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {isTracking
                    ? "Tracking Active"
                    : isTracking === false
                    ? "Not Tracking"
                    : "Status Unavailable"}
                </span>
                <span className="font-mono text-sm font-bold text-gray-900 dark:text-white">
                  {formatTimer(displayedWorkSeconds)}
                </span>
              </div>

              {isTracking && (activeTaskName || activeProjectName) && (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400 truncate max-w-[240px]">
                  {activeTaskName || activeProjectName}
                </p>
              )}

              {!isTracking && (
                <p className="text-[11px] text-gray-500 dark:text-slate-400">
                  Total tracked today (read-only)
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

