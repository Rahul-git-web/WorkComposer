"use client";
import { useState, useRef, useEffect, useMemo, type Dispatch, type SetStateAction } from "react";

import { HiUsers } from "react-icons/hi2";
import { MdKeyboardArrowDown } from "react-icons/md";
import { HiOfficeBuilding } from "react-icons/hi";
import { ArrowUpDown } from "lucide-react";
import FilterPopover from "./FilterPopover";
import DateControls from "./DateControls";
import { useTimeTracking } from "@/context/TimeTrackingContext";
import { useDashboard } from "@/context/DashboardContext";
import { getAppTimezone } from "@/utils/appTimezone";
import { isTeamReportAccess } from "@/utils/reportAccess";

type Props = {
  date: Date;
  setDate: React.Dispatch<React.SetStateAction<Date>>;
  selectedTeams: any[];
  setSelectedTeams: React.Dispatch<React.SetStateAction<any[]>>;
  teams: any[];
  selectedUsers: any[];
  setSelectedUsers: React.Dispatch<React.SetStateAction<any[]>>;
  users: any[];

  sortBy: string;
  setSortBy: React.Dispatch<React.SetStateAction<string>>;
  order: string;
  setOrder: React.Dispatch<React.SetStateAction<string>>;

  reportRange: {
    type: string;
    startDate: Date;
    endDate: Date;
  };

  setReportRange: Dispatch<SetStateAction<{
    type: string;
    startDate: Date;
    endDate: Date;
  }>
  >;

  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
  lastSyncedAt?: Date;
};

export default function OverviewHeader({
  date,
  setDate,
  selectedTeams,
  setSelectedTeams,
  selectedUsers,
  setSelectedUsers,
  teams,
  users,
  sortBy,
  setSortBy,
  order,
  setOrder,
  reportRange,
  setReportRange,
  onRefresh,
  isRefreshing,
  lastSyncedAt,
}: Props) {
  const [open, setOpen] = useState<boolean>(false);
  const [sortOpen, setSortOpen] = useState<boolean>(false);

  const ref = useRef<HTMLDivElement | null>(null);
  const sortRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateHeight = () => {
      const rect = el.getBoundingClientRect();
      const height = Math.round(rect.height);
      document.documentElement.style.setProperty("--overview-header-height", `${height}px`);
    };

    updateHeight();

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(updateHeight);
      ro.observe(el);
      return () => ro.disconnect();
    } else {
      window.addEventListener("resize", updateHeight);
      return () => window.removeEventListener("resize", updateHeight);
    }
  }, []);


  const timeTrackingContext = useTimeTracking();
  const { user } = useDashboard();
  const isTeamReport = isTeamReportAccess(user);

  const effectiveTimezone = useMemo(() => {
    return getAppTimezone(timeTrackingContext?.timezone || user?.reportTimezone);
  }, [timeTrackingContext?.timezone, user?.reportTimezone]);

  const timezoneDisplay = useMemo(() => {
    try {
      const offsetPart = new Intl.DateTimeFormat("en-US", {
        timeZone: effectiveTimezone,
        timeZoneName: "shortOffset",
      })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName")?.value;
      return `Timezone: ${effectiveTimezone}${offsetPart ? ` (${offsetPart})` : ""}`;
    } catch {
      return `Timezone: ${effectiveTimezone}`;
    }
  }, [effectiveTimezone]);

  const formatDateTime = (date: Date): string => {
    try {
      return date.toLocaleString("en-US", {
        timeZone: effectiveTimezone,
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
    } catch {
      return date.toLocaleString();
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
      if (
        sortRef.current &&
        !sortRef.current.contains(e.target as Node)
      ) {
        setSortOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      handleClickOutside
    );

    return () =>
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full sticky top-0 z-30 bg-gray-100 dark:bg-[#090F1D] pt-3 pb-1 -mt-1 transition-colors duration-200"
    >
      {/* Top Info */}
      <div className="mt-2 sm:mt-3 mb-2 flex flex-col items-start gap-1 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-end sm:gap-2 px-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="whitespace-nowrap">
            Last synced: {formatDateTime(lastSyncedAt || new Date())}
          </span>
          <span className="hidden sm:inline">•</span>
          <span className="whitespace-nowrap" title={effectiveTimezone}>
            {timezoneDisplay}
          </span>
        </div>
      </div>

      {/* Header */}
      <div className="relative flex flex-col gap-3 sm:gap-4 border border-gray-200 dark:border-[#22324D] rounded-t-md bg-gray-50 dark:bg-[#0F172A] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8 transition-colors duration-200">
        {/* Left Section */}
        <div className="flex w-full items-center gap-2 sm:gap-3 sm:w-auto">
          {isTeamReport ? (
            <div className="relative flex items-center" ref={ref}>
              {/* Main Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(!open);
                }}
                className="flex w-full sm:w-auto items-center gap-2 sm:gap-2.5 px-3 sm:px-3.5 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1E293B] text-gray-900 dark:text-white text-sm transition-colors hover:border-gray-400 dark:hover:border-gray-600 min-w-0"
              >
                {selectedTeams.length > 0 ? (
                  <HiOfficeBuilding className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                ) : (
                  <HiUsers className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                )}

                <div className="flex min-w-0 flex-1 items-center gap-2 max-w-full sm:max-w-[250px]">
                  {selectedTeams.length > 0 ? (
                    <>
                      <span className="font-medium text-gray-900 dark:text-white truncate">
                        {selectedTeams[0]?.name}
                      </span>

                      <span className="text-gray-400 flex-shrink-0">•</span>

                      <span className="text-gray-500 dark:text-gray-400 text-sm whitespace-nowrap flex-shrink-0">
                        {selectedTeams.length} selected
                      </span>
                    </>
                  ) : (
                    <span className="truncate text-gray-900 dark:text-white">
                      All Users & Teams
                    </span>
                  )}
                </div>

                <MdKeyboardArrowDown className="w-4 h-4 text-gray-400 ml-1" />
              </button>

              {/* Clear Button */}
              {selectedTeams.length > 0 && (
                <button
                  title="Clear"
                  onClick={() => setSelectedTeams([])}
                  className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 ml-3 transition"
                >
                  Clear
                </button>
              )}

              {/* Popover */}
              {open && (
                <div
                  className="absolute top-full left-0 right-0 sm:right-auto mt-2 z-50 w-[95vw] max-w-sm sm:w-auto sm:max-w-none"
                  onClick={(e) => e.stopPropagation()}
                >
                  <FilterPopover
                    selectedTeams={selectedTeams}
                    setSelectedTeams={setSelectedTeams}
                    selectedUsers={selectedUsers}
                    setSelectedUsers={setSelectedUsers}
                    setOpen={setOpen}
                    teams={teams}
                    users={users}
                    sortBy={sortBy}
                    setSortBy={setSortBy}
                    order={order}
                    setOrder={setOrder}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="relative flex items-center" ref={sortRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSortOpen(!sortOpen);
                }}
                className="flex w-full sm:w-auto items-center gap-2 px-3 sm:px-3.5 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-[#1E293B] text-gray-900 dark:text-white text-sm transition-colors hover:border-gray-400 dark:hover:border-gray-600 min-w-0 cursor-pointer"
              >
                <ArrowUpDown className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                <span className="font-medium text-gray-700 dark:text-slate-200">Sort</span>
                <MdKeyboardArrowDown className="w-4 h-4 text-gray-400 ml-1" />
              </button>

              {sortOpen && (
                <div
                  className="absolute top-full left-0 mt-2 z-50 w-52 rounded-xl bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-[#22324D] shadow-xl py-2 text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-3 pb-1.5 text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                    Sort By
                  </div>
                  {[
                    { label: "Name", key: "name" },
                    { label: "Status", key: "trackingStatus" },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => {
                        if (sortBy === opt.key) {
                          setOrder(order === "asc" ? "desc" : "asc");
                        } else {
                          setSortBy(opt.key);
                          setOrder("asc");
                        }
                        setSortOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-[#273549] text-left transition-colors cursor-pointer ${
                        sortBy === opt.key ? "text-indigo-600 dark:text-indigo-400 font-semibold" : "text-gray-700 dark:text-slate-200"
                      }`}
                    >
                      <span>{opt.label}</span>
                      {sortBy === opt.key && (
                        <span className="text-[10px] uppercase font-bold text-indigo-500">{order}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Section */}
        <DateControls
          date={date}
          setDate={setDate}
          reportRange={reportRange}
          setReportRange={setReportRange}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
        />
      </div>
    </div>
  );
}