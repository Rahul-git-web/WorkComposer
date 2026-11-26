"use client";

import React, { useState, useMemo } from "react";
import Image from "next/image";
import {
  HiOutlineUserGroup,
  HiOutlineMagnifyingGlass,
  HiOutlineLockClosed,
  HiOutlineArrowRight,
  HiOutlineArrowPath,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineClock,
  HiOutlineExclamationCircle,
} from "react-icons/hi2";
import {
  resolveTodayShiftConfig,
  computeEmployeeAttendanceStatus,
  getAttendanceStatusBadgeMeta,
  type EmployeeAttendanceStatus,
} from "@/utils/teamAttendanceStatus";

export interface TeamMemberRow {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  team: string;
  workSeconds: number;
  workTime: string;
  breakSeconds: number;
  breakTime: string;
  startTime: string | null;
  finishTime: string | null;
  isTracking: boolean;
  sessionsCount: number;
  status: EmployeeAttendanceStatus;
}

export interface TeamMembersTableProps {
  attendanceData?: any[];
  overviewData?: any[];
  effectiveSettings?: any;
  timezone?: string;
  isLoading?: boolean;
  isRestricted?: boolean;
  errorMessage?: string | null;
  error?: string | null;
  onRetry?: () => void;
  onNavigateToOverview?: () => void;
  pageSize?: number;
}

/**
 * Extracts clean two-letter initials from name or email for fallback avatar.
 */
export function getInitials(name?: string | null, email?: string | null): string {
  if (name && typeof name === "string") {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (parts.length >= 2 && first && last && first.length > 0 && last.length > 0) {
      return (first.charAt(0) + last.charAt(0)).toUpperCase();
    }
    if (parts.length === 1 && first && first.length > 0) {
      return first.slice(0, 2).toUpperCase();
    }
  }
  if (email && typeof email === "string" && email.trim().length > 0) {
    return email.trim().slice(0, 2).toUpperCase();
  }
  return "EM";
}

/**
 * Formats integer seconds into human-readable "Xh Ym" or "0h 0m".
 */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export default function TeamMembersTable({
  attendanceData,
  overviewData = [],
  effectiveSettings,
  timezone = "UTC",
  isLoading = false,
  isRestricted = false,
  errorMessage = null,
  error = null,
  onRetry,
  onNavigateToOverview,
  pageSize = 10,
}: TeamMembersTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const displayError = errorMessage || error || null;

  // 1. Resolve Shift baseline for today
  const shiftConfig = useMemo(() => {
    return resolveTodayShiftConfig(effectiveSettings, timezone);
  }, [effectiveSettings, timezone]);

  // 2. Normalize and deduplicate team member records
  const allMembers: TeamMemberRow[] = useMemo(() => {
    if (!Array.isArray(attendanceData) && !Array.isArray(overviewData)) {
      return [];
    }

    // Index overviewData by userId for fast cross-referencing
    const overviewMap = new Map<string, any>();
    if (Array.isArray(overviewData)) {
      overviewData.forEach((item) => {
        const id = String(item?.id || item?._id || item?.userId || "");
        if (id) overviewMap.set(id, item);
      });
    }

    const memberMap = new Map<string, any>();

    // Process attendance data
    if (Array.isArray(attendanceData)) {
      attendanceData.forEach((item, index) => {
        if (!item || typeof item !== "object") return;

        const id = String(
          item.id ||
          item._id ||
          item.userId ||
          item.user?._id ||
          item.email ||
          `member_${index}`
        ).trim();

        if (!memberMap.has(id)) {
          memberMap.set(id, { ...item, _stableId: id });
        } else {
          // Merge multiple session records for the same employee
          const existing = memberMap.get(id);
          const workSecs = (Number(existing.workSeconds) || 0) + (Number(item.workSeconds) || 0);
          const breakSecs = (Number(existing.breakSeconds) || 0) + (Number(item.breakSeconds) || 0);
          memberMap.set(id, {
            ...existing,
            workSeconds: workSecs,
            breakSeconds: breakSecs,
            startTime: existing.startTime || item.startTime,
            finishTime: item.finishTime || existing.finishTime,
            isTracking: existing.isTracking || item.isTracking,
            sessionsCount: (existing.sessionsCount || 0) + (item.sessionsCount || 0),
          });
        }
      });
    }

    // Ensure users who appear in overviewData but had 0 attendance records are also included
    overviewMap.forEach((overviewUser, id) => {
      if (!memberMap.has(id)) {
        memberMap.set(id, {
          _stableId: id,
          id,
          name: overviewUser.name,
          avatar: overviewUser.avatar,
          team: overviewUser.team,
          workSeconds: 0,
          breakSeconds: 0,
          workTime: overviewUser.workTime || "0h 0m",
          breakTime: overviewUser.breakTime || "0m",
          startTime: null,
          finishTime: null,
          isTracking: overviewUser.status?.toLowerCase().includes("running") || false,
          sessionsCount: 0,
        });
      }
    });

    // Transform into clean TeamMemberRow objects
    const rows: TeamMemberRow[] = [];
    memberMap.forEach((emp, id) => {
      const overviewUser = overviewMap.get(id);

      const name = String(
        emp.name ||
        `${emp.firstName || ""} ${emp.lastName || ""}`.trim() ||
        overviewUser?.name ||
        emp.email ||
        "Unnamed Member"
      );

      const rawTeam = emp.team || overviewUser?.team;
      const teamName = typeof rawTeam === "object" && rawTeam !== null
        ? String(rawTeam.name || rawTeam.title || "Default team")
        : typeof rawTeam === "string" && rawTeam.trim() !== ""
        ? rawTeam
        : "Default team";

      const workSec = Number(emp.workSeconds) || 0;
      const breakSec = Number(emp.breakSeconds) || 0;
      const workTime = emp.workTime || formatDuration(workSec);
      const breakTime = emp.breakTime || formatDuration(breakSec);

      const isTracking = Boolean(
        emp.isTracking ||
        overviewUser?.status?.toLowerCase().includes("running")
      );

      const status = computeEmployeeAttendanceStatus(
        {
          workSeconds: workSec,
          startTime: emp.startTime,
          isTracking,
        },
        shiftConfig
      );

      rows.push({
        id,
        name,
        email: emp.email || overviewUser?.email || undefined,
        avatar: emp.avatar || overviewUser?.avatar || undefined,
        team: teamName,
        workSeconds: workSec,
        workTime,
        breakSeconds: breakSec,
        breakTime,
        startTime: emp.startTime || null,
        finishTime: emp.finishTime || null,
        isTracking,
        sessionsCount: Number(emp.sessionsCount) || (workSec > 0 ? 1 : 0),
        status,
      });
    });

    // Default sort: active tracking first, then alphabetical by name
    return rows.sort((a, b) => {
      if (a.isTracking !== b.isTracking) {
        return a.isTracking ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [attendanceData, overviewData, shiftConfig]);

  // 3. Filter members based on search query
  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allMembers;
    return allMembers.filter((m) => {
      const matchName = m.name.toLowerCase().includes(q);
      const matchEmail = m.email ? m.email.toLowerCase().includes(q) : false;
      const matchTeam = m.team.toLowerCase().includes(q);
      return matchName || matchEmail || matchTeam;
    });
  }, [allMembers, searchQuery]);

  // 4. Pagination math
  const totalItems = filteredMembers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedMembers = useMemo(() => {
    return filteredMembers.slice(startIndex, endIndex);
  }, [filteredMembers, startIndex, endIndex]);

  // Handlers
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1); // Page reset when search query changes
  };

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  return (
    <div
      data-testid="team-members-table-card"
      className="rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-5 sm:p-6 shadow-xs transition-colors duration-200 space-y-5"
    >
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-100 dark:border-[#22324D]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/70 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <HiOutlineUserGroup className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Team Members Breakdown
              </h3>
              <span
                data-testid="team-members-count-badge"
                className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700"
              >
                {allMembers.length} {allMembers.length === 1 ? "Member" : "Members"}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
              Roster breakdown with today&apos;s activity, tracking state, and punch times
            </p>
          </div>
        </div>

        {/* Search Bar & Full Report Button */}
        <div className="flex flex-wrap items-center gap-3 self-stretch sm:self-auto">
          {!isRestricted && allMembers.length > 0 && (
            <div className="relative flex-1 sm:w-64">
              <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Search member or team..."
                data-testid="team-members-search-input"
                className="w-full pl-9 pr-3 py-1.5 rounded-xl text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400 transition-all"
              />
            </div>
          )}

          {onNavigateToOverview && !isRestricted && (
            <button
              type="button"
              onClick={onNavigateToOverview}
              data-testid="team-members-full-report-btn"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer"
            >
              <span>Full Report</span>
              <HiOutlineArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* State 1: Loading Skeleton */}
      {isLoading ? (
        <div data-testid="team-members-loading" className="space-y-3 py-4 animate-pulse">
          <div className="h-10 rounded-xl bg-gray-100 dark:bg-slate-800/70" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-gray-50 dark:bg-slate-800/40" />
          ))}
        </div>
      ) : isRestricted ? (
        /* State 2: HTTP 403 Restricted Card */
        <div
          data-testid="team-members-restricted"
          className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 p-6 text-center space-y-2"
        >
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 mb-1">
            <HiOutlineLockClosed className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-gray-900 dark:text-white">
            Team Member Telemetry Restricted
          </h4>
          <p className="text-xs text-gray-600 dark:text-slate-400 max-w-md mx-auto">
            Viewing individual employee attendance summaries requires Organization Admin or Team
            Manager privileges.
          </p>
        </div>
      ) : displayError ? (
        /* State 3: API Failure with Retry */
        <div
          data-testid="team-members-error"
          className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 p-5 space-y-3"
        >
          <div className="flex items-center gap-3 text-rose-700 dark:text-rose-300 text-xs font-semibold">
            <HiOutlineExclamationCircle className="w-5 h-5 shrink-0" />
            <span>{displayError}</span>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              data-testid="team-members-retry-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-rose-900/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 hover:bg-rose-50 cursor-pointer shadow-xs"
            >
              <HiOutlineArrowPath className="w-3.5 h-3.5" />
              <span>Retry Load</span>
            </button>
          )}
        </div>
      ) : allMembers.length === 0 ? (
        /* State 4: Empty Team Roster */
        <div
          data-testid="team-members-empty"
          className="py-12 text-center space-y-2 border border-dashed border-gray-200 dark:border-slate-800 rounded-xl"
        >
          <HiOutlineUserGroup className="w-8 h-8 text-gray-300 dark:text-slate-600 mx-auto" />
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
            No Team Members Found
          </h4>
          <p className="text-xs text-gray-500 dark:text-slate-400 max-w-sm mx-auto">
            No active team members or attendance records were reported for your organization today.
          </p>
        </div>
      ) : filteredMembers.length === 0 ? (
        /* State 5: Empty Search Results */
        <div
          data-testid="team-members-empty-search"
          className="py-10 text-center space-y-3 border border-dashed border-gray-200 dark:border-slate-800 rounded-xl"
        >
          <p className="text-xs text-gray-500 dark:text-slate-400">
            No team members found matching{" "}
            <span className="font-semibold text-gray-900 dark:text-white">&quot;{searchQuery}&quot;</span>
          </p>
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            data-testid="team-members-clear-search"
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            Clear Search Filter
          </button>
        </div>
      ) : (
        /* State 6: Populated Table View */
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-[#22324D]/80">
            <table
              data-testid="team-members-table"
              className="w-full text-left text-xs border-collapse"
            >
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-900/70 border-b border-gray-200 dark:border-[#22324D] text-gray-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                  <th scope="col" className="py-3 px-4">
                    Employee
                  </th>
                  <th scope="col" className="py-3 px-3">
                    Team
                  </th>
                  <th scope="col" className="py-3 px-3 text-center">
                    Tracking
                  </th>
                  <th scope="col" className="py-3 px-3">
                    Today&apos;s Work
                  </th>
                  <th scope="col" className="py-3 px-3">
                    Break
                  </th>
                  <th scope="col" className="py-3 px-3">
                    Punches (In / Out)
                  </th>
                  <th scope="col" className="py-3 px-3 text-center">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-[#22324D]/60 bg-white dark:bg-[#0F172A]">
                {paginatedMembers.map((member) => {
                  const badgeMeta = getAttendanceStatusBadgeMeta(member.status);
                  const initials = getInitials(member.name, member.email);

                  return (
                    <tr
                      key={member.id}
                      data-testid={`team-member-row-${member.id}`}
                      className="hover:bg-gray-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* 1. Employee Name + Avatar */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="relative w-8 h-8 rounded-full overflow-hidden bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-[11px] font-bold text-white shrink-0 shadow-xs">
                            {member.avatar ? (
                              <Image
                                src={member.avatar}
                                alt={member.name}
                                fill
                                sizes="32px"
                                className="object-cover"
                                unoptimized
                              />
                            ) : (
                              <span>{initials}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="font-semibold text-gray-900 dark:text-white truncate block">
                              {member.name}
                            </span>
                            {member.email && (
                              <span className="text-[11px] text-gray-400 dark:text-slate-500 truncate block">
                                {member.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 2. Team */}
                      <td className="py-3 px-3 text-gray-600 dark:text-slate-300">
                        <span className="inline-block px-2 py-0.5 rounded-md bg-gray-100 dark:bg-slate-800/80 text-[11px] font-medium border border-gray-200 dark:border-slate-700/60 truncate max-w-[120px]">
                          {member.team}
                        </span>
                      </td>

                      {/* 3. Tracking Indicator */}
                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex items-center justify-center">
                          {member.isTracking ? (
                            <span
                              title="Active tracking running"
                              aria-label="Active tracking running"
                              data-testid="tracking-active-indicator"
                              className="relative flex h-3 w-3"
                            >
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                            </span>
                          ) : (
                            <span
                              title="Tracking stopped"
                              aria-label="Tracking stopped"
                              data-testid="tracking-stopped-indicator"
                              className="inline-block h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600"
                            />
                          )}
                        </div>
                      </td>

                      {/* 4. Today's Work Time */}
                      <td className="py-3 px-3">
                        <span className="font-bold text-gray-900 dark:text-white">
                          {member.workTime}
                        </span>
                      </td>

                      {/* 5. Break Time */}
                      <td className="py-3 px-3 text-gray-500 dark:text-slate-400">
                        {member.breakTime}
                      </td>

                      {/* 6. Punches (In / Out) */}
                      <td className="py-3 px-3 text-[11px] text-gray-600 dark:text-slate-300 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <HiOutlineClock className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500 shrink-0" />
                          <span>
                            {member.startTime || "--"} → {member.finishTime || (member.isTracking ? "Now" : "--")}
                          </span>
                        </div>
                      </td>

                      {/* 7. Attendance Status Pill */}
                      <td className="py-3 px-3 text-center">
                        <span
                          data-testid={`attendance-status-badge-${member.id}`}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide ${badgeMeta.badgeClasses}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${badgeMeta.dotClasses}`} />
                          <span>{badgeMeta.label}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-gray-500 dark:text-slate-400">
            <div>
              Showing <span className="font-semibold text-gray-900 dark:text-white">{startIndex + 1}</span> to{" "}
              <span className="font-semibold text-gray-900 dark:text-white">{endIndex}</span> of{" "}
              <span className="font-semibold text-gray-900 dark:text-white">{totalItems}</span> members
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrevPage}
                  disabled={safePage <= 1}
                  data-testid="team-members-prev-page"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <HiOutlineChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>

                <span className="px-2 text-xs">
                  Page <span className="font-semibold text-gray-900 dark:text-white">{safePage}</span> of{" "}
                  <span className="font-semibold text-gray-900 dark:text-white">{totalPages}</span>
                </span>

                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={safePage >= totalPages}
                  data-testid="team-members-next-page"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <span>Next</span>
                  <HiOutlineChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
