"use client";

import Image from 'next/image';
import {
  Download,
  Camera,
  Clock3,
  Activity,
  ChevronDown,
  X,
} from "lucide-react";
import ScreenshotModal from './ScreenshotModal';
import { useEffect, useState } from 'react';
import API from '@/api';
import ScreenshotDetailsModal from './ScreenshotDetailsModal';

type Props = {
  screenshots: any[];
  selectedUsers: any[];
  sortBy: string;
  order: string;
  startDate: string;
  endDate: string;
  timezone?: string;
  users?: any[];
};

function TimelineImage({ src }: { src?: string }) {
  const [error, setError] = useState(false);
  if (!src || error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-100 dark:bg-slate-900">
        <Camera className="h-5 w-5 text-gray-300 dark:text-slate-600" />
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt="Screenshot"
      fill
      unoptimized
      onError={() => setError(true)}
      className="object-cover transition-transform duration-200 group-hover:scale-105"
    />
  );
}

const getMinutesInTimezone = (date: Date, tz?: string) => {
  if (!tz) {
    return date.getHours() * 60 + date.getMinutes();
  }
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    }).formatToParts(date);
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
    return hour * 60 + minute;
  } catch {
    return date.getHours() * 60 + date.getMinutes();
  }
};

const getDateKey = (dateStr: string, tz?: string) => {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Unknown Date";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return (dateStr || "").split("T")[0] || "Unknown Date";
  }
};

const formatDisplayDate = (dateKey: string, tz?: string) => {
  try {
    const parts = dateKey.split("-");
    if (parts.length !== 3) return dateKey;
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const d = Number(parts[2]);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return dateKey;
    const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "UTC",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  } catch {
    return dateKey;
  }
};

const getTimeOnDate = (dateKey: string, timeStr: string, tz?: string) => {
  try {
    const dateParts = dateKey.split("-");
    const timeParts = timeStr.split(":");
    if (dateParts.length !== 3 || timeParts.length !== 2) return new Date().getTime();
    const y = Number(dateParts[0]);
    const m = Number(dateParts[1]);
    const d = Number(dateParts[2]);
    const hours = Number(timeParts[0]);
    const minutes = Number(timeParts[1]);
    if (isNaN(y) || isNaN(m) || isNaN(d) || isNaN(hours) || isNaN(minutes)) return new Date().getTime();

    const baseDate = new Date(Date.UTC(y, m - 1, d, hours, minutes, 0));
    if (!tz) return baseDate.getTime();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    }).formatToParts(baseDate);
    const tzYear = parseInt(parts.find((p) => p.type === "year")?.value || `${y}`, 10);
    const tzMonth = parseInt(parts.find((p) => p.type === "month")?.value || `${m}`, 10);
    const tzDay = parseInt(parts.find((p) => p.type === "day")?.value || `${d}`, 10);
    const tzHour = parseInt(parts.find((p) => p.type === "hour")?.value || `${hours}`, 10);
    const tzMinute = parseInt(parts.find((p) => p.type === "minute")?.value || `${minutes}`, 10);

    const wantedUtc = Date.UTC(y, m - 1, d, hours, minutes, 0);
    const actualUtc = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, 0);
    const offsetMs = actualUtc - wantedUtc;
    return baseDate.getTime() - offsetMs;
  } catch {
    return new Date().getTime();
  }
};

export default function ScreenshotsCard({
  screenshots,
  selectedUsers,
  sortBy,
  order,
  startDate,
  endDate,
  timezone,
  users: usersProp,
}: Props) {

  const formatScreenshotTime = (time: Date | string | number, userTz?: string) => {
    if (!time) return "--";
    const d = new Date(time);
    if (isNaN(d.getTime())) return "--";
    const tz = userTz || timezone || "UTC";
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    } catch {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
  };

  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [selectedShot, setSelectedShot] = useState<any>(null);
  const [timelineShotsList, setTimelineShotsList] = useState<any[]>([]);
  const [timelineModalTz, setTimelineModalTz] = useState<string | undefined>(undefined);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [users, setUsers] = useState<any[]>(usersProp && usersProp.length > 0 ? usersProp : []);
  const [timelineFrom, setTimelineFrom] = useState("");
  const [timelineTo, setTimelineTo] = useState("");
  const [timelinePreset, setTimelinePreset] = useState("all");


  const [search, setSearch] = useState("");

  const [view, setView] = useState("gallery")

  const [captureFilter, setCaptureFilter] = useState<"captured" | "uncaptured">("captured")

  const groupedScreenshots = screenshots.reduce(
    (acc: any, shot: any) => {
      const email = shot.user?.email || "Unknown User";

      if (!acc[email]) {
        acc[email] = [];
      }

      acc[email].push(shot);

      return acc;
    },
    {}
  );


  const filteredUsers = users.filter((user: any) => {
    const matchesSearch =
      `${user.firstName} ${user.lastName} ${user.email}`
        .toLowerCase()
        .includes(search.toLowerCase());

    const matchesTeam =
      selectedTeams.length === 0 ||
      selectedTeams.includes(
        user.team || "Default team"
      );

    const matchesSelectedUsers =
      selectedUsers.length === 0 ||
      selectedUsers.some((u) => {
        const uId = u._id || u.id;
        const currentId = user._id || user.id;
        return (
          (uId && currentId && String(uId) === String(currentId)) ||
          (u.email && user.email && u.email.toLowerCase() === user.email.toLowerCase())
        );
      });

    return matchesSearch && matchesTeam && matchesSelectedUsers;
  });

  const usersWithScreenshots = filteredUsers.map(
    (user: any) => ({
      ...user,
      screenshots: groupedScreenshots[user.email] || [],
    })
  )


  const sortedUsers = [...usersWithScreenshots].sort(
    (a: any, b: any) => {
      let comparison = 0;

      if (sortBy === "name") {
        comparison = `${a.firstName} ${a.lastName}`.localeCompare(
          `${b.firstName} ${b.lastName}`
        );
      }

      if (sortBy === "team") {
        comparison = (a.team || "").localeCompare(
          b.team || ""
        );
      }

      return order === "asc"
        ? comparison
        : -comparison;
    }
  );

  const finalUsers = sortedUsers.filter(
    (user: any) => {
      if (captureFilter === "captured") {
        return user.screenshots.length > 0;
      }

      return user.screenshots.length === 0;
    }
  );

  useEffect(() => {
    if (usersProp && Array.isArray(usersProp) && usersProp.length > 0) {
      setUsers(usersProp);
      return;
    }
    if (!usersProp) {
      const fetchUsers = async () => {
        try {
          const { data } = await API.get("/users");
          setUsers(Array.isArray(data) ? data : []);
        } catch (err: any) {
          if (err?.response?.status === 403) {
            console.warn("ScreenShotsCard: User list restricted by role permissions.");
          } else {
            console.error("ScreenShotsCard fetchUsers error:", err);
          }
        }
      };
      fetchUsers();
    }
  }, [usersProp]);

  const teams = [
    ...new Set(
      users.map(
        (user: any) =>
          user.team || "Default team"
      )
    ),
  ];

  const handleExport = async () => {
    try {
      const userIds = selectedUsers
        .map((user: any) => user._id || user.id)
        .filter(Boolean);

      const response = await API.get(
        "/screenshots/export-zip",
        {
          params: {
            startDate,
            endDate,
            ...(userIds.length > 0
              ? { userIds: userIds.join(",") }
              : {}),
          },
          responseType: "blob",
        }
      );
      const blob = new Blob(
        [response.data],
        { type: "application/zip" }
      );

      if (blob.size === 0) {
        throw new Error(
          "Screenshot export returned an empty ZIP."
        );
      }

      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");

      link.href = url;
      link.download = "screenshots.zip";

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(
        "SCREENSHOT EXPORT ERROR:",
        err
      );
    }
  };

  const getActivityColor = (score: number) => {
    if (score < 40) return "#EF4444";
    if (score < 70) return "#F59E0B";
    return "#22C55E";
  };

  const getShotTime = (shot: any) => {
    return new Date(shot.capturedAt);
  };

  const timelineFilteredUsers = finalUsers.map((user: any) => {
    const userTz = user.reportTimezone || user.timezone || timezone;
    const filteredShots = user.screenshots.filter((shot: any) => {
      if (!timelineFrom && !timelineTo) {
        return true;
      }

      const date = getShotTime(shot);
      const minutes = getMinutesInTimezone(date, userTz);

      const fromMinutes = timelineFrom
        ? Number(timelineFrom.split(":")[0]) * 60 +
        Number(timelineFrom.split(":")[1])
        : 0;

      const toMinutes = timelineTo
        ? Number(timelineTo.split(":")[0]) * 60 +
        Number(timelineTo.split(":")[1])
        : 1439;

      if (fromMinutes <= toMinutes) {
        return (
          minutes >= fromMinutes &&
          minutes <= toMinutes
        );
      }

      // Overnight range, e.g. 18:00 → 02:00
      return (
        minutes >= fromMinutes ||
        minutes <= toMinutes
      );
    });

    return {
      ...user,
      screenshots: filteredShots,
    };
  });

  const applyTimelinePreset = (preset: string) => {
    setTimelinePreset(preset);

    switch (preset) {
      case "morning":
        setTimelineFrom("06:00");
        setTimelineTo("12:00");
        break;

      case "afternoon":
        setTimelineFrom("12:00");
        setTimelineTo("17:00");
        break;

      case "evening":
        setTimelineFrom("17:00");
        setTimelineTo("22:00");
        break;

      case "workday":
        setTimelineFrom("09:00");
        setTimelineTo("18:00");
        break;

      default:
        setTimelineFrom("");
        setTimelineTo("");
        setTimelinePreset("all");
        break;
    }
  };

  return (
    <div className="bg-white dark:bg-[#0F172A] border border-gray-200 dark:border-[#22324D] border-t-0 rounded-b-md">

      {/* Header */}
      <div
        className="sticky z-20 bg-white dark:bg-[#0F172A] border-b border-gray-200 dark:border-[#22324D] shadow-sm transition-[top] duration-75"
        style={{ top: "var(--overview-header-height, 98px)" }}
      >

        {/* Main Controls */}
        <div className="px-5 py-4">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">

            {/* Left Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">

              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search users..."
                  className="w-full sm:w-[260px] px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-[#1E293B] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                />
              </div>

              {/* View Toggle */}
              <div className="flex h-[42px] border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-[#1E293B] shrink-0">
                <button
                  type="button"
                  title="Gallery view"
                  onClick={() => setView("gallery")}
                  className={`px-5 text-sm font-medium transition ${view === "gallery"
                    ? "bg-indigo-600 text-white"
                    : "bg-white dark:bg-[#1E293B] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#273549]"
                    }`}
                >
                  Gallery
                </button>

                <button
                  type="button"
                  title="Timeline view"
                  onClick={() => setView("timeline")}
                  className={`px-5 text-sm font-medium transition ${view === "timeline"
                    ? "bg-indigo-600 text-white"
                    : "bg-white dark:bg-[#1E293B] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#273549]"
                    }`}
                >
                  Timeline
                </button>
              </div>
            </div>

            {/* Right Controls */}
            <div className="flex flex-wrap items-center gap-4">

              {/* Capture Filter */}
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-300 hidden sm:inline">
                  Showing:
                </span>

                <button
                  title="Captured"
                  onClick={() => setCaptureFilter("captured")}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${captureFilter === "captured"
                    ? "bg-green-100 dark:bg-green-900/60 text-green-700 dark:text-green-300"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                >
                  Captured
                </button>

                <button
                  title="Uncaptured"
                  onClick={() => setCaptureFilter("uncaptured")}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${captureFilter === "uncaptured"
                    ? "bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                >
                  Uncaptured
                </button>
              </div>

              {/* User Count */}
              <div className="text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
                Users: <span className="text-gray-900 dark:text-white">{finalUsers.length}</span>
              </div>

              {/* Export */}
              <button
                title="Export screenshots"
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 transition shadow-sm"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>
          </div>
        </div>

        {/* Timeline Filter */}
        {view === "timeline" && (
          <div className="border-t border-gray-100 dark:border-slate-800 bg-gray-50/70 dark:bg-slate-900/60 px-5 py-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

              {/* Label */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-950/50">
                  <Clock3 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-slate-100">
                    Timeline filter
                  </p>

                  <p className="text-[11px] text-gray-500 dark:text-slate-400">
                    Filter screenshots by capture time
                  </p>
                </div>
              </div>

              {/* Filter Controls */}
              <div className="flex flex-wrap items-center gap-2">

                {/* Preset */}
                <div className="flex h-[38px] items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 shadow-sm">
                  <select
                    value={timelinePreset}
                    onChange={(e) => applyTimelinePreset(e.target.value)}
                    className="bg-transparent text-sm font-medium text-gray-700 dark:text-slate-200 outline-none cursor-pointer"
                  >
                    <option value="all" className="dark:bg-slate-800 dark:text-slate-200">All Day</option>
                    <option value="morning" className="dark:bg-slate-800 dark:text-slate-200">Morning</option>
                    <option value="afternoon" className="dark:bg-slate-800 dark:text-slate-200">Afternoon</option>
                    <option value="evening" className="dark:bg-slate-800 dark:text-slate-200">Evening</option>
                    <option value="workday" className="dark:bg-slate-800 dark:text-slate-200">Workday</option>
                    <option value="custom" className="dark:bg-slate-800 dark:text-slate-200">Custom</option>
                  </select>

                  <ChevronDown className="h-4 w-4 text-gray-400 dark:text-slate-500 pointer-events-none" />
                </div>

                {/* From */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-slate-400">
                    From
                  </span>

                  <input
                    type="time"
                    value={timelineFrom}
                    onChange={(e) => {
                      setTimelineFrom(e.target.value);
                      setTimelinePreset("custom");
                    }}
                    className="h-[38px] w-[125px] rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-gray-700 dark:text-slate-200 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/40"
                    title="Timeline start time"
                  />
                </div>

                {/* Arrow */}
                <span className="text-gray-400 dark:text-slate-500 text-sm px-1">
                  →
                </span>

                {/* To */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-slate-400">
                    To
                  </span>

                  <input
                    type="time"
                    value={timelineTo}
                    onChange={(e) => {
                      setTimelineTo(e.target.value);
                      setTimelinePreset("custom");
                    }}
                    className="h-[38px] w-[125px] rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-gray-700 dark:text-slate-200 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/40"
                    title="Timeline end time"
                  />
                </div>

                {/* Clear */}
                {(timelineFrom || timelineTo) && (
                  <button
                    type="button"
                    onClick={() => applyTimelinePreset("all")}
                    className="h-[38px] rounded-lg px-3 text-xs font-medium text-gray-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-slate-200 transition"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-b border-gray-200 dark:border-slate-800 pb-4 pl-5 mb-1 mt-1">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white">
          Screenshots
        </h2>
      </div>

      {/* Cards */}
      {view === "gallery" ? (
        <div className="p-6">
          {finalUsers.length === 0 ? (
            <div className="min-h-[260px] flex flex-col items-center justify-center text-gray-400">
              <svg
                width="80"
                height="80"
                viewBox="0 0 64 64"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="mb-4 opacity-50"
              >
                <rect
                  x="8"
                  y="14"
                  width="48"
                  height="36"
                  rx="5"
                  stroke="currentColor"
                  strokeWidth="3"
                />

                <path
                  d="M20 14L24 9H40L44 14"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                <circle
                  cx="32"
                  cy="31"
                  r="9"
                  stroke="currentColor"
                  strokeWidth="3"
                />

                <circle
                  cx="32"
                  cy="31"
                  r="3"
                  fill="currentColor"
                />

                <path
                  d="M20 50H44"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>

              <p className="text-sm font-medium text-gray-500">
                {selectedUsers && selectedUsers.length > 0
                  ? `No screenshots captured for ${selectedUsers.map((u: any) => u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email).filter(Boolean).join(", ")}`
                  : captureFilter === "captured"
                    ? "No screenshots captured"
                    : "All users have captured screenshots"}
              </p>

              <p className="text-xs text-gray-400 mt-1">
                {selectedUsers && selectedUsers.length > 0
                  ? "The selected user has no captured screenshots for this day."
                  : captureFilter === "captured"
                    ? "No users have captured screenshots for this day."
                    : "There are no uncaptured users for this day."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {finalUsers.map((user: any) => {
                const email = user.email;
                const userShots = user.screenshots;


                const latestShot =
                  userShots.length > 0
                    ? [...userShots].sort(
                      (a, b) =>
                        new Date(b.capturedAt).getTime() -
                        new Date(a.capturedAt).getTime()
                    )[0]
                    : null;

                return (
                  <div
                    key={email}
                    className="min-h-[330px] bg-white dark:bg-[#0F172A] border border-gray-200 dark:border-[#22324D] rounded-md shadow-sm overflow-hidden"
                  >
                    {/* User Header */}
                    <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100 dark:border-gray-800">
                      {user.avatar?.trim() ? (
                        <img
                          src={user.avatar}
                          alt={`${user.firstName} ${user.lastName}`}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-green-200 dark:bg-green-900/60 flex items-center justify-center text-green-700 dark:text-green-300 font-semibold">
                          {user.firstName?.charAt(0).toUpperCase() || "U"}
                        </div>
                      )}

                      <h3 className="text-[17px] font-bold text-indigo-700 dark:text-indigo-400 truncate">
                        {user.firstName} {user.lastName}
                      </h3>
                    </div>

                    {/* Screenshot Area */}
                    <div className="h-[140px] bg-gray-100 dark:bg-slate-900 overflow-hidden relative">
                      {latestShot?.imageUrl ? (
                        <Image
                          src={latestShot.imageUrl}
                          alt="Screenshot"
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 dark:text-slate-500 gap-2">
                          <Camera className="w-6 h-6 opacity-40" />
                          <span className="text-xs">No Screenshot</span>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="px-3 py-3">
                      <div className="flex items-center justify-between text-[15px] mb-2">
                        <div className="flex items-center gap-1 font-semibold text-gray-700 dark:text-slate-200">
                          <span>🕒</span>

                          <span>
                            {latestShot
                              ? formatScreenshotTime(latestShot.capturedAt, user.reportTimezone || user.timezone)
                              : "--"}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          {latestShot && (
                            <div className="flex gap-[2px]">
                              {[1, 2, 3, 4, 5, 6, 7].map((dot) => (
                                <div
                                  key={dot}
                                  className="w-1 h-1.5 rounded-full"
                                  style={{
                                    backgroundColor: getActivityColor(
                                      latestShot?.activityScore || 0
                                    ),
                                  }}
                                />
                              ))}
                            </div>
                          )}

                          <span
                            className="font-medium"
                            style={{
                              color: getActivityColor(
                                latestShot?.activityScore || 0
                              ),
                            }}
                          >
                            {latestShot
                              ? `${latestShot.activityScore || 0}%`
                              : "--"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-600 dark:text-slate-400 font-semibold">
                          {userShots.length > 0
                            ? `${userShots.length} Screenshot${userShots.length > 1 ? "s" : ""}`
                            : "No Screenshots"}
                        </span>

                        <button
                          title='See all'
                          disabled={!userShots.length}
                          onClick={() => {
                            setSelectedUser({
                              email,
                              firstName: user.firstName,
                              lastName: user.lastName,
                              avatar: user.avatar,
                              screenshots: userShots,
                            });
                            setShowModal(true);
                          }}
                          className={`text-xs px-2 py-1 rounded-md ${userShots.length
                            ? "bg-blue-200 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400"
                            : "bg-gray-200 dark:bg-slate-800 text-gray-400 dark:text-slate-500 cursor-not-allowed"
                            }`}
                        >
                          See all
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-6 px-5 pb-6">
          {timelineFilteredUsers.every(
            (user: any) => user.screenshots.length === 0
          ) ? (
            <div className="rounded-2xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-[#1E293B] px-6 py-16 text-center shadow-sm">
              <Camera className="mx-auto h-10 w-10 text-gray-300 dark:text-slate-600" />

              <h3 className="mt-4 text-sm font-semibold text-gray-800 dark:text-white">
                No screenshots found
              </h3>

              <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                Try changing the date, time, or user filters.
              </p>
            </div>
          ) : (
            timelineFilteredUsers.map((user: any) => {
              const userTz = user.reportTimezone || user.timezone || timezone;
              const userShots = [...(user.screenshots || [])].sort(
                (a: any, b: any) =>
                  new Date(a.capturedAt).getTime() -
                  new Date(b.capturedAt).getTime()
              );

              if (userShots.length === 0) {
                return null;
              }

              // Group shots by calendar date in user's timezone (DEF-111-08)
              const shotsByDate: { [dateKey: string]: any[] } = {};
              userShots.forEach((shot: any) => {
                const dKey = getDateKey(shot.capturedAt, userTz);
                if (!shotsByDate[dKey]) {
                  shotsByDate[dKey] = [];
                }
                shotsByDate[dKey].push(shot);
              });
              const dateKeys = Object.keys(shotsByDate).sort();

              return (
                <div
                  key={user.email}
                  className="overflow-hidden rounded-2xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-[#1E293B] shadow-sm"
                >
                  {/* USER HEADER */}
                  <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      {user.avatar?.trim() ? (
                        <img
                          src={user.avatar}
                          alt={`${user.firstName} ${user.lastName}`}
                          className="h-10 w-10 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950/70 text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                          {user.firstName?.charAt(0).toUpperCase() || "U"}
                          {user.lastName?.charAt(0).toUpperCase() || ""}
                        </div>
                      )}

                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                          {user.firstName} {user.lastName}
                        </h3>

                        <p className="truncate text-xs text-gray-500 dark:text-slate-400">
                          {user.email}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 rounded-full bg-indigo-50 dark:bg-indigo-950/50 px-3 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50">
                      {userShots.length} screenshot
                      {userShots.length !== 1 ? "s" : ""}
                    </div>
                  </div>

                  {/* DAILY TIMELINE TRACKS */}
                  <div className="divide-y divide-gray-100 dark:divide-slate-800/60">
                    {dateKeys.map((dateKey) => {
                      const dayShots = shotsByDate[dateKey] || [];
                      if (dayShots.length === 0) return null;
                      const firstShotTime = new Date(dayShots[0].capturedAt).getTime();
                      const lastShotTime = new Date(dayShots[dayShots.length - 1].capturedAt).getTime();

                      const isOvernightTimeline =
                        !!timelineFrom &&
                        !!timelineTo &&
                        timelineFrom > timelineTo;

                      let dayStart = timelineFrom
                        ? getTimeOnDate(dateKey, timelineFrom, userTz)
                        : firstShotTime;

                      let dayEnd = timelineTo
                        ? getTimeOnDate(dateKey, timelineTo, userTz)
                        : lastShotTime;

                      if (isOvernightTimeline) {
                        dayEnd += 24 * 60 * 60 * 1000;
                      }

                      // Enforce minimum 1-hour span (3,600,000 ms) so time labels do not repeat (DEF-111-06)
                      if (dayEnd - dayStart < 3600000) {
                        const mid = (dayStart + dayEnd) / 2;
                        dayStart = mid - 1800000;
                        dayEnd = mid + 1800000;
                      }

                      const dayRange = Math.max(dayEnd - dayStart, 60 * 1000);

                      const getTimelinePosition = (shot: any) => {
                        let currentTime = new Date(shot.capturedAt).getTime();
                        if (isOvernightTimeline && currentTime < dayStart) {
                          currentTime += 24 * 60 * 60 * 1000;
                        }
                        const rawRatio = Math.min(
                          1,
                          Math.max(0, (currentTime - dayStart) / dayRange)
                        );
                        // DEF-111-07: return 6 + rawPercent * 0.88;
                        return rawRatio;
                      };

                      const trackMinWidth = Math.max(
                        1000,
                        dayShots.length * 190
                      );

                      // WORKCOMPOSER-121-D: Single unified coordinate system with safe boundary insets
                      const INSET = 100; // 90px card half-width + 10px safe margin
                      const usableWidth = Math.max(trackMinWidth - 2 * INSET, 100);

                      // WORKCOMPOSER-121-A: Collision-aware multi-lane placement algorithm
                      const sortedDayShots = [...dayShots].sort(
                        (a: any, b: any) =>
                          new Date(a.capturedAt).getTime() -
                          new Date(b.capturedAt).getTime()
                      );

                      const CARD_COLLISION_THRESHOLD = 185; // 180px card + 5px buffer
                      const lastLaneX: Record<'upper' | 'lower-1' | 'lower-2' | 'lower-3', number> = {
                        'upper': -9999,
                        'lower-1': -9999,
                        'lower-2': -9999,
                        'lower-3': -9999,
                      };
                      let nextPreferredSide: 'upper' | 'lower' = 'upper';

                      const placedDayShots = sortedDayShots.map((shot: any) => {
                        const positionRatio = getTimelinePosition(shot);
                        const pixelX = INSET + positionRatio * usableWidth;
                        const position = positionRatio * 100;
                        const positionStyle = `calc(${positionRatio * 100}% + ${INSET - positionRatio * (2 * INSET)}px)`;

                        let assignedLane = 'upper';
                        let laneLevel = 1;

                        if (nextPreferredSide === 'upper') {
                          if (pixelX - (lastLaneX['upper'] ?? -9999) >= CARD_COLLISION_THRESHOLD) {
                            assignedLane = 'upper';
                            laneLevel = 1;
                            lastLaneX['upper'] = pixelX;
                            nextPreferredSide = 'lower';
                          } else if (pixelX - (lastLaneX['lower-1'] ?? -9999) >= CARD_COLLISION_THRESHOLD) {
                            assignedLane = 'lower-1';
                            laneLevel = 1;
                            lastLaneX['lower-1'] = pixelX;
                            nextPreferredSide = 'upper';
                          } else if (pixelX - (lastLaneX['lower-2'] ?? -9999) >= CARD_COLLISION_THRESHOLD) {
                            assignedLane = 'lower-2';
                            laneLevel = 2;
                            lastLaneX['lower-2'] = pixelX;
                          } else {
                            assignedLane = 'lower-3';
                            laneLevel = 3;
                            lastLaneX['lower-3'] = pixelX;
                          }
                        } else {
                          if (pixelX - (lastLaneX['lower-1'] ?? -9999) >= CARD_COLLISION_THRESHOLD) {
                            assignedLane = 'lower-1';
                            laneLevel = 1;
                            lastLaneX['lower-1'] = pixelX;
                            nextPreferredSide = 'upper';
                          } else if (pixelX - (lastLaneX['upper'] ?? -9999) >= CARD_COLLISION_THRESHOLD) {
                            assignedLane = 'upper';
                            laneLevel = 1;
                            lastLaneX['upper'] = pixelX;
                            nextPreferredSide = 'lower';
                          } else if (pixelX - (lastLaneX['lower-2'] ?? -9999) >= CARD_COLLISION_THRESHOLD) {
                            assignedLane = 'lower-2';
                            laneLevel = 2;
                            lastLaneX['lower-2'] = pixelX;
                          } else {
                            assignedLane = 'lower-3';
                            laneLevel = 3;
                            lastLaneX['lower-3'] = pixelX;
                          }
                        }

                        return {
                          ...shot,
                          position,
                          positionRatio,
                          positionStyle,
                          lane: assignedLane,
                          laneLevel,
                        };
                      });

                      const maxLevel = placedDayShots.reduce(
                        (max: number, s: any) => Math.max(max, s.laneLevel || 1),
                        1
                      );
                      const dynamicTrackHeight =
                        maxLevel === 1 ? 425 : maxLevel === 2 ? 540 : 680;

                      const getLaneConfig = (lane: string) => {
                        switch (lane) {
                          case 'upper':
                            return {
                              cardTopClass: 'top-[20px]',
                              connectorClass: 'top-[150px] h-[40px]',
                            };
                          case 'lower-2':
                            return {
                              cardTopClass: 'top-[376px]',
                              connectorClass: 'top-[190px] h-[186px]',
                            };
                          case 'lower-3':
                            return {
                              cardTopClass: 'top-[522px]',
                              connectorClass: 'top-[190px] h-[332px]',
                            };
                          case 'lower-1':
                          default:
                            return {
                              cardTopClass: 'top-[230px]',
                              connectorClass: 'top-[190px] h-[40px]',
                            };
                        }
                      };

                      return (
                        <div key={dateKey} className="px-5 py-6">
                          {/* Daily Timeline Header */}
                          <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                                  {formatDisplayDate(dateKey, userTz)}
                                </p>
                              </div>

                              <p className="mt-0.5 text-sm font-medium text-gray-700 dark:text-slate-200">
                                {dayShots.length} screenshot{dayShots.length !== 1 ? "s" : ""}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                              <span className="rounded-md bg-gray-100 dark:bg-slate-800 px-2 py-1 font-medium text-gray-700 dark:text-slate-200">
                                {formatScreenshotTime(dayStart, userTz)}
                              </span>

                              <span className="text-gray-300 dark:text-slate-500">→</span>

                              <span className="rounded-md bg-gray-100 dark:bg-slate-800 px-2 py-1 font-medium text-gray-700 dark:text-slate-200">
                                {formatScreenshotTime(dayEnd, userTz)}
                              </span>
                            </div>
                          </div>

                          {/* Scrollable Timeline */}
                          <div className="overflow-x-auto overflow-y-hidden pb-3">
                            <div
                              className="relative h-[425px]"
                              style={{
                                width: "100%",
                                minWidth: `${trackMinWidth}px`,
                                height: dynamicTrackHeight !== 425 ? `${dynamicTrackHeight}px` : undefined,
                              }}
                            >
                              {/* Time Labels */}
                              {/* DEF-111-07: const labelPos = 6 + percent * 0.88; */}
                              <div className="absolute left-0 right-0 top-1 h-5 text-[11px] text-gray-400 dark:text-slate-400">
                                {[0, 25, 50, 75, 100].map((percent) => {
                                  const labelTime = new Date(
                                    dayStart + (dayRange * percent) / 100
                                  );
                                  const labelRatio = percent / 100;
                                  const labelPosStyle = `calc(${percent}% + ${INSET - labelRatio * (2 * INSET)}px)`;

                                  return (
                                    <span
                                      key={percent}
                                      className="absolute -translate-x-1/2 whitespace-nowrap font-medium"
                                      style={{
                                        left: labelPosStyle,
                                      }}
                                    >
                                      {formatScreenshotTime(labelTime, userTz)}
                                    </span>
                                  );
                                })}
                              </div>

                              {/* Vertical Grid Lines */}
                              {/* DEF-111-07: const linePos = 6 + value * 0.88; */}
                              <div className="absolute left-0 right-0 top-8 bottom-8 pointer-events-none">
                                {[0, 25, 50, 75, 100].map((value) => {
                                  const lineRatio = value / 100;
                                  const linePosStyle = `calc(${value}% + ${INSET - lineRatio * (2 * INSET)}px)`;

                                  return (
                                    <div
                                      key={value}
                                      className="absolute top-0 bottom-0 w-px bg-gray-100 dark:bg-slate-800"
                                      style={{
                                        left: linePosStyle,
                                      }}
                                    />
                                  );
                                })}
                              </div>

                              {/* Main Timeline Track */}
                              {/* DEF-111-07: className="absolute left-[6%] right-[6%] top-[190px]" */}
                              <div className="absolute left-[100px] right-[100px] top-[190px]">
                                <div className="h-1 rounded-full bg-gray-200 dark:bg-slate-700" />

                                {/* Progress */}
                                <div
                                  className="absolute left-0 top-0 h-1 rounded-full bg-indigo-200 dark:bg-indigo-800"
                                  style={{
                                    width: "100%",
                                  }}
                                />

                                {/* Start Point */}
                                <div className="absolute left-0 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white dark:border-slate-800 bg-indigo-600 shadow-md" />

                                {/* End Point */}
                                <div className="absolute right-0 top-1/2 h-4 w-4 translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white dark:border-slate-800 bg-indigo-600 shadow-md" />
                              </div>

                              {/* Screenshot Events */}
                              {placedDayShots.map((shot: any, index: number) => {
                                const position = shot.position;
                                const laneConfig = getLaneConfig(shot.lane);

                                return (
                                  <div
                                    key={shot._id || shot.id || index}
                                    className="absolute top-0 h-full"
                                    style={{
                                      left: shot.positionStyle || `${position}%`,
                                      width: "0px",
                                    }}
                                  >
                                    {/* Connector */}
                                    <div
                                      className={`absolute left-1/2 w-px -translate-x-1/2 bg-indigo-300 dark:bg-indigo-600/70 ${laneConfig.connectorClass}`}
                                    />

                                    {/* Event Point */}
                                    <div
                                      className="absolute left-1/2 top-[192px] z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white dark:border-slate-800 bg-indigo-600 shadow-md"
                                    />

                                    {/* Screenshot Card */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedShot(shot);
                                        setTimelineShotsList(dayShots);
                                        setTimelineModalTz(userTz);
                                      }}
                                      className={`group absolute left-1/2 z-10 w-[180px] -translate-x-1/2 overflow-hidden rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-left shadow-md transition-all duration-200 hover:-translate-y-1 hover:border-indigo-200 dark:hover:border-indigo-500 hover:shadow-lg ${laneConfig.cardTopClass}`}
                                    >
                                      {/* Screenshot Image with Fallback (DEF-111-10) */}
                                      <div className="relative h-[92px] w-full overflow-hidden bg-gray-100 dark:bg-slate-900">
                                        <TimelineImage src={shot.imageUrl} />

                                        {/* Time Badge */}
                                        <div className="absolute bottom-2 left-2 rounded-md bg-black/75 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
                                          {formatScreenshotTime(shot.capturedAt, userTz)}
                                        </div>
                                      </div>

                                      {/* Card Info */}
                                      <div className="flex items-center justify-between px-3 py-2.5">
                                        <div className="flex items-center gap-1.5">
                                          <span
                                            className="h-2 w-2 rounded-full"
                                            style={{
                                              backgroundColor: getActivityColor(
                                                shot.activityScore || 0
                                              ),
                                            }}
                                          />

                                          <span className="text-[11px] font-medium text-gray-600 dark:text-slate-400">
                                            Activity
                                          </span>
                                        </div>

                                        <span className="text-[11px] font-semibold text-gray-700 dark:text-slate-200">
                                          {shot.activityScore || 0}%
                                        </span>
                                      </div>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Timeline Footer */}
                          <div className="mt-2 flex items-center justify-between border-t border-gray-100 dark:border-slate-700/60 pt-3">
                            <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-slate-400">
                              <span className="h-2 w-2 rounded-full bg-indigo-500" />
                              Screenshot captured
                            </div>

                            <span className="text-[11px] text-gray-400 dark:text-slate-400">
                              Click a screenshot to preview
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )
      }

      {
        showModal && selectedUser && (
          <ScreenshotModal
            user={selectedUser}
            onClose={() =>
              setShowModal(false)
            }
          />
        )
      }

      {selectedShot && (
        <ScreenshotDetailsModal
          screenshot={selectedShot}
          currentIndex={Math.max(
            0,
            timelineShotsList.findIndex(
              (s: any) => (s._id || s.id) === (selectedShot._id || selectedShot.id)
            )
          )}
          total={Math.max(1, timelineShotsList.length)}
          timezone={timelineModalTz}
          onPrevious={() => {
            const idx = timelineShotsList.findIndex(
              (s: any) => (s._id || s.id) === (selectedShot._id || selectedShot.id)
            );
            if (idx > 0) {
              setSelectedShot(timelineShotsList[idx - 1]);
            }
          }}
          onNext={() => {
            const idx = timelineShotsList.findIndex(
              (s: any) => (s._id || s.id) === (selectedShot._id || selectedShot.id)
            );
            if (idx >= 0 && idx < timelineShotsList.length - 1) {
              setSelectedShot(timelineShotsList[idx + 1]);
            }
          }}
          onClose={() => {
            setSelectedShot(null);
            setTimelineShotsList([]);
          }}
        />
      )}
    </div >
  );
}