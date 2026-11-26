"use client";

import React from "react";
import {
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineXCircle,
  HiOutlineCalendar,
  HiOutlineInformationCircle,
  HiOutlineExclamationTriangle,
  HiOutlineArrowPath,
} from "react-icons/hi2";

export interface AttendanceCounts {
  presentCount: number;
  onTimeCount: number;
  lateCount: number;
  absentCount: number;
  upcomingCount: number;
  dayOffCount: number;
  totalScheduled: number;
  totalMembers: number;
  attendanceRate: number;
  shiftStart?: string;
  isWorkingDay?: boolean;
}

export interface TeamAttendanceOverviewProps {
  counts: AttendanceCounts;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export default function TeamAttendanceOverview({
  counts,
  isLoading = false,
  error = null,
  onRetry,
}: TeamAttendanceOverviewProps) {
  if (isLoading) {
    return (
      <div
        className="w-full p-6 rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] shadow-xs animate-pulse space-y-4"
        data-testid="attendance-overview-loading"
      >
        <div className="flex items-center justify-between">
          <div className="w-36 h-5 rounded bg-gray-200 dark:bg-[#1E293B]" />
          <div className="w-24 h-5 rounded-full bg-gray-200 dark:bg-[#1E293B]" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-gray-200 dark:bg-[#1E293B]" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="w-full p-6 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300 space-y-3"
        data-testid="attendance-overview-error"
      >
        <div className="flex items-center gap-3">
          <HiOutlineExclamationTriangle className="w-5 h-5 shrink-0" />
          <span className="text-sm font-semibold">Failed to load team attendance data: {error}</span>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-rose-900/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 hover:bg-rose-50 cursor-pointer shadow-xs"
          >
            <HiOutlineArrowPath className="w-3.5 h-3.5" />
            <span>Retry Attendance Load</span>
          </button>
        )}
      </div>
    );
  }

  const {
    presentCount,
    onTimeCount,
    lateCount,
    absentCount,
    upcomingCount,
    dayOffCount,
    totalScheduled,
    totalMembers,
    attendanceRate,
    shiftStart = "09:00",
    isWorkingDay = true,
  } = counts;

  return (
    <div
      className="w-full p-5 sm:p-6 rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] shadow-xs space-y-5"
      data-testid="team-attendance-overview"
    >
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-gray-100 dark:border-[#22324D]/60">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              Team Attendance Overview
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              {attendanceRate}% Rate
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            Shift schedule baseline: {shiftStart} start •{" "}
            {isWorkingDay ? "Regular working day" : "Non-working schedule"}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
          <HiOutlineInformationCircle className="w-4 h-4 text-gray-400" />
          <span>Leave status: Not configured</span>
        </div>
      </div>

      {/* Grid of 4 Status Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* 1. Present */}
        <div
          data-testid="attendance-stat-present"
          className="p-4 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20"
        >
          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider">Present</span>
            <HiOutlineCheckCircle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {presentCount}
          </div>
          <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">
            {onTimeCount} on time arrival{onTimeCount === 1 ? "" : "s"}
          </div>
        </div>

        {/* 2. Late */}
        <div
          data-testid="attendance-stat-late"
          className="p-4 rounded-xl border border-amber-200/80 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20"
        >
          <div className="flex items-center justify-between text-amber-700 dark:text-amber-400 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider">Late Arrivals</span>
            <HiOutlineClock className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {lateCount}
          </div>
          <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
            Punched after {shiftStart}
          </div>
        </div>

        {/* 3. Absent */}
        <div
          data-testid="attendance-stat-absent"
          className="p-4 rounded-xl border border-rose-200/80 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20"
        >
          <div className="flex items-center justify-between text-rose-700 dark:text-rose-400 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider">Absent</span>
            <HiOutlineXCircle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {absentCount}
          </div>
          <div className="text-[11px] text-rose-700 dark:text-rose-400 mt-1">
            {absentCount === 0 ? "Full team active" : "No punch recorded"}
          </div>
        </div>

        {/* 4. Not Started / Scheduled Off */}
        <div
          data-testid="attendance-stat-off"
          className="p-4 rounded-xl border border-gray-200 dark:border-[#22324D] bg-gray-50/60 dark:bg-[#1E293B]/40"
        >
          <div className="flex items-center justify-between text-gray-600 dark:text-slate-400 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider">Upcoming / Off</span>
            <HiOutlineCalendar className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {upcomingCount + dayOffCount}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
            {upcomingCount} shift pending • {dayOffCount} off
          </div>
        </div>
      </div>

      {/* Footer Summary Bar */}
      <div className="pt-3 border-t border-gray-100 dark:border-[#22324D]/60 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-gray-500 dark:text-slate-400 gap-2">
        <span>
          Total Roster: <strong className="text-gray-900 dark:text-white">{totalMembers}</strong> members (
          <strong className="text-gray-900 dark:text-white">{totalScheduled}</strong> scheduled for duty today)
        </span>
        <span>
          Calculated using authoritative shift schedules and timestamps in reporting timezone.
        </span>
      </div>
    </div>
  );
}

