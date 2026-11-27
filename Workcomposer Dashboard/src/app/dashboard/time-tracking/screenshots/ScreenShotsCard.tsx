"use client";

import Image from 'next/image';
import {
  Download,
  Camera,
  Clock3,
  Activity,
  ChevronDown,
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

const getHourBucketInTimezone = (dateStr: string, tz?: string) => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return { hourNum: 0, hourLabel: "12 AM" };
  }

  let hourNum = d.getHours();
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        hour12: false,
      }).formatToParts(d);
      const rawHour = parseInt(
        parts.find((p) => p.type === "hour")?.value || `${hourNum}`,
        10
      );
      if (!isNaN(rawHour)) {
        hourNum = rawHour === 24 ? 0 : rawHour;
      }
    } catch {
      // Fallback to local hour
    }
  }

  const normalized = ((hourNum % 24) + 24) % 24;
  const hourLabel =
    normalized === 0
      ? "12 AM"
      : normalized < 12
        ? `${normalized} AM`
        : normalized === 12
          ? "12 PM"
          : `${normalized - 12} PM`;

  return { hourNum: normalized, hourLabel };
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
      <div className="relative bg-white dark:bg-[#0F172A] border-b border-gray-200 dark:border-[#22324D]">

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
                <div className="relative flex h-[38px] items-center rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
                  <select
                    aria-label="Timeline filter preset"
                    value={timelinePreset}
                    onChange={(e) => applyTimelinePreset(e.target.value)}
                    className="h-full appearance-none bg-transparent pl-3 pr-8 text-sm font-medium text-gray-700 dark:text-slate-200 outline-none cursor-pointer dark:[color-scheme:dark]"
                  >
                    <option value="all" className="dark:bg-slate-800 dark:text-slate-200">All Day</option>
                    <option value="morning" className="dark:bg-slate-800 dark:text-slate-200">Morning</option>
                    <option value="afternoon" className="dark:bg-slate-800 dark:text-slate-200">Afternoon</option>
                    <option value="evening" className="dark:bg-slate-800 dark:text-slate-200">Evening</option>
                    <option value="workday" className="dark:bg-slate-800 dark:text-slate-200">Workday</option>
                    <option value="custom" className="dark:bg-slate-800 dark:text-slate-200">Custom</option>
                  </select>

                  <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-gray-400 dark:text-slate-500" />
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
                    className="h-[38px] w-[125px] rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-gray-700 dark:text-slate-200 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/40 dark:[color-scheme:dark]"
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
                    className="h-[38px] w-[125px] rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-gray-700 dark:text-slate-200 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/40 dark:[color-scheme:dark]"
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

      <div className="border-b border-gray-200 dark:border-slate-800 pb-4 pl-5 pt-4">
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

              <p className="text-sm font-medium text-gray-500 dark:text-slate-400">
                {selectedUsers && selectedUsers.length > 0
                  ? `No screenshots captured for ${selectedUsers.map((u: any) => u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email).filter(Boolean).join(", ")}`
                  : captureFilter === "captured"
                    ? "No screenshots captured"
                    : "All users have captured screenshots"}
              </p>

              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
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
        <div className="space-y-6 p-5">
          {timelineFilteredUsers.every(
            (user: any) => user.screenshots.length === 0
          ) ? (
            <div className="rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] px-6 py-16 text-center shadow-sm">
              <Camera className="mx-auto h-10 w-10 text-gray-300 dark:text-slate-600" />

              <h3 className="mt-4 text-sm font-semibold text-gray-800 dark:text-white">
                No screenshots found
              </h3>

              <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                Try changing the date, time, or user filters.
              </p>
            </div>
          ) : (
            timelineFilteredUsers.map((user: any, userIdx: number) => {
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
                  className="overflow-hidden rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] shadow-sm"
                >
                  {/* USER HEADER */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 dark:border-[#22324D] bg-gray-50/70 dark:bg-[#1E293B]/60 px-5 py-4">
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

                  {/* DAILY HOURLY SWIMLANES */}
                  <div className="divide-y divide-gray-100 dark:divide-[#22324D]">
                    {dateKeys.map((dateKey) => {
                      const dayShots = shotsByDate[dateKey] || [];
                      if (dayShots.length === 0) return null;

                      const sortedDayShots = [...dayShots].sort(
                        (a: any, b: any) =>
                          new Date(a.capturedAt).getTime() -
                          new Date(b.capturedAt).getTime()
                      );

                      const firstShotTime = new Date(sortedDayShots[0].capturedAt).getTime();
                      const lastShotTime = new Date(sortedDayShots[sortedDayShots.length - 1].capturedAt).getTime();

                      const isOvernightTimeline =
                        !!timelineFrom &&
                        !!timelineTo &&
                        timelineFrom > timelineTo;

                      const dayStart = timelineFrom
                        ? getTimeOnDate(dateKey, timelineFrom, userTz)
                        : firstShotTime;

                      let dayEnd = timelineTo
                        ? getTimeOnDate(dateKey, timelineTo, userTz)
                        : lastShotTime;

                      if (isOvernightTimeline) {
                        dayEnd += 24 * 60 * 60 * 1000;
                      }

                      const hourMap = new Map<
                        number,
                        { hourNum: number; hourLabel: string; shots: any[] }
                      >();
                      sortedDayShots.forEach((shot: any) => {
                        const { hourNum, hourLabel } = getHourBucketInTimezone(
                          shot.capturedAt,
                          userTz
                        );
                        const existing = hourMap.get(hourNum);
                        if (existing) {
                          existing.shots.push(shot);
                        } else {
                          hourMap.set(hourNum, {
                            hourNum,
                            hourLabel,
                            shots: [shot],
                          });
                        }
                      });

                      const hourGroups = Array.from(hourMap.values())
                        .sort((a, b) => a.hourNum - b.hourNum)
                        .map((group) => {
                          const totalActivity = group.shots.reduce(
                            (sum: number, s: any) =>
                              sum + (Number(s.activityScore) || 0),
                            0
                          );
                          const avgActivity = Math.round(
                            totalActivity / group.shots.length
                          );

                          return {
                            ...group,
                            avgActivity,
                            elementId: `timeline-hour-${userIdx}-${dateKey}-${group.hourNum}`,
                          };
                        });

                      return (
                        <div key={dateKey} className="px-5 py-6">
                          {/* Daily Timeline Header */}
                          <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                                  {formatDisplayDate(dateKey, userTz)}
                                </p>
                              </div>

                              <p className="mt-0.5 text-sm font-medium text-gray-700 dark:text-slate-200">
                                {sortedDayShots.length} screenshot{sortedDayShots.length !== 1 ? "s" : ""} across {hourGroups.length} hour{hourGroups.length !== 1 ? "s" : ""}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                              <span className="rounded-md bg-gray-100 dark:bg-[#1E293B] border border-gray-200/70 dark:border-[#22324D] px-2.5 py-1 font-medium text-gray-700 dark:text-slate-200">
                                {formatScreenshotTime(dayStart, userTz)}
                              </span>

                              <span className="text-gray-300 dark:text-slate-500">→</span>

                              <span className="rounded-md bg-gray-100 dark:bg-[#1E293B] border border-gray-200/70 dark:border-[#22324D] px-2.5 py-1 font-medium text-gray-700 dark:text-slate-200">
                                {formatScreenshotTime(dayEnd, userTz)}
                              </span>
                            </div>
                          </div>

                          {/* Quick Jump-to-Hour Pills */}
                          <div className="mb-6 flex flex-wrap items-center gap-2">
                            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                              Hours:
                            </span>
                            {hourGroups.map((group) => (
                              <button
                                key={group.hourNum}
                                type="button"
                                onClick={() => {
                                  document
                                    .getElementById(group.elementId)
                                    ?.scrollIntoView({
                                      behavior: "smooth",
                                      block: "nearest",
                                    });
                                }}
                                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-[#22324D] bg-gray-50 dark:bg-[#1E293B] px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-500/60 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-700 dark:hover:text-indigo-300 transition cursor-pointer"
                              >
                                <span
                                  className="h-1.5 w-1.5 rounded-full shrink-0"
                                  style={{
                                    backgroundColor: getActivityColor(
                                      group.avgActivity
                                    ),
                                  }}
                                />
                                <span>{group.hourLabel}</span>
                                <span className="text-[11px] text-gray-400 dark:text-slate-400">
                                  ({group.shots.length})
                                </span>
                              </button>
                            ))}
                          </div>

                          {/* Hourly Swimlane List */}
                          <div className="space-y-6">
                            {hourGroups.map((group, groupIdx) => (
                              <div
                                key={group.hourNum}
                                id={group.elementId}
                                className="flex flex-col md:flex-row gap-4 scroll-mt-24"
                              >
                                {/* Time Rail */}
                                <div className="md:w-36 shrink-0 flex md:flex-col items-center md:items-start justify-between md:justify-start gap-2">
                                  <div className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200/80 dark:border-indigo-800/60 bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-1 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                                    <Clock3 className="h-3.5 w-3.5 shrink-0" />
                                    <span>{group.hourLabel}</span>
                                  </div>

                                  <div className="flex md:flex-col items-center md:items-start gap-2 md:gap-0.5 text-[11px] text-gray-500 dark:text-slate-400">
                                    <span>
                                      {group.shots.length} screenshot{group.shots.length !== 1 ? "s" : ""}
                                    </span>
                                    <span className="md:hidden text-gray-300 dark:text-slate-600">•</span>
                                    <span className="inline-flex items-center gap-1 font-medium text-gray-600 dark:text-slate-300">
                                      <span
                                        className="h-1.5 w-1.5 rounded-full shrink-0"
                                        style={{
                                          backgroundColor: getActivityColor(
                                            group.avgActivity
                                          ),
                                        }}
                                      />
                                      {group.avgActivity}% avg
                                    </span>
                                  </div>

                                  {groupIdx < hourGroups.length - 1 && (
                                    <div className="hidden md:block ml-4 mt-1 flex-1 w-px min-h-[24px] bg-gradient-to-b from-indigo-300 dark:from-indigo-700/70 to-transparent" />
                                  )}
                                </div>

                                {/* Visual Filmstrip Grid */}
                                <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                  {group.shots.map((shot: any, index: number) => {
                                    const score = Number(shot.activityScore) || 0;
                                    return (
                                      <button
                                        key={shot._id || shot.id || `${group.hourNum}-${index}`}
                                        type="button"
                                        onClick={() => {
                                          setSelectedShot(shot);
                                          setTimelineShotsList(sortedDayShots);
                                          setTimelineModalTz(userTz);
                                        }}
                                        className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 dark:hover:border-indigo-500/70 hover:shadow-md cursor-pointer"
                                      >
                                        {/* Thumbnail */}
                                        <div className="relative aspect-video w-full overflow-hidden bg-gray-100 dark:bg-slate-900 border-b border-gray-100 dark:border-[#22324D]">
                                          <TimelineImage src={shot.imageUrl} />

                                          <div className="absolute bottom-2 left-2 rounded-md bg-slate-950/80 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-xs">
                                            {formatScreenshotTime(shot.capturedAt, userTz)}
                                          </div>

                                          <div className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-slate-950/80 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-xs">
                                            <span
                                              className="h-1.5 w-1.5 rounded-full shrink-0"
                                              style={{
                                                backgroundColor: getActivityColor(score),
                                              }}
                                            />
                                            <span>{score}%</span>
                                          </div>
                                        </div>

                                        {/* App & Window Metadata */}
                                        <div className="flex-1 bg-gray-50/80 dark:bg-[#1E293B]/60 px-3 py-2.5 space-y-0.5">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <Activity className="h-3.5 w-3.5 shrink-0 text-indigo-500 dark:text-indigo-400" />
                                            <span className="truncate text-xs font-semibold text-gray-800 dark:text-white">
                                              {shot.appName || "Unknown App"}
                                            </span>
                                          </div>

                                          <p
                                            className="truncate text-[11px] text-gray-500 dark:text-slate-400"
                                            title={shot.windowTitle || undefined}
                                          >
                                            {shot.windowTitle || "No window title"}
                                          </p>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Timeline Footer */}
                          <div className="mt-6 flex items-center justify-between border-t border-gray-100 dark:border-[#22324D] pt-3">
                            <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-slate-400">
                              <span className="h-2 w-2 rounded-full bg-indigo-500" />
                              Grouped hourly in {userTz || timezone || "local"} timezone
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
      )}

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