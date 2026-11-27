"use client";

import { useState, useRef, useEffect } from "react";
import { useTimer } from "@/context/TimerContext";
import { FaUsers } from "react-icons/fa";
import { IoIosPause } from "react-icons/io";
import { usePathname, useRouter } from "next/navigation";
import API from "@/api";
import { Clock3, ChevronDown, Settings, Play, Check } from "lucide-react";
import { HiBars3, HiOutlineInboxStack, HiOutlineEnvelopeOpen } from "react-icons/hi2";
import ReportsModal from "./time-tracking/attendance/reports/ReportsModal";
import toast from "react-hot-toast";
import NotificationBell from "@/components/notifications/NotificationBell";
import { disconnectSocket } from "@/socket/socket";

import { useDashboard } from "@/context/DashboardContext";

const DashNavbar = ({ sidebarOpen = false, onOpenSidebar }) => {
  const { user } = useDashboard();

  const canManageUsersTeams = user?.permissions?.includes("manage_users");

  const [appOpen, setAppOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [showDesktopDownloadModal, setShowDesktopDownloadModal] =
    useState(false);
  const appRef = useRef(null);
  const profileRef = useRef(null);

  const router = useRouter();
  const pathname = usePathname();

  const currentApp = pathname.startsWith("/dashboard/user-management")
    ? "User Management"
    : pathname.startsWith("/dashboard/task-management")
      ? "Task Management"
      : pathname.startsWith("/dashboard/settings")
        ? "Settings"
        : "Time Tracking";

  const handleLogout = async () => {
  const toastId = toast.loading("Signing out...");

  try {
    if (typeof window !== "undefined" && window.electronAPI?.logoutElectron) {
      await window.electronAPI.logoutElectron();
    }

    await API.post("/auth/logout");

    disconnectSocket();

    toast.success("Logged out successfully", {
      id: toastId,
      duration: 1200,
    });

    setProfileOpen(false);

    // Give the success toast time to be visible
    setTimeout(() => {
      router.push("/authenticate/login");
    }, 500);
  } catch (err) {
    console.error("LOGOUT ERROR:", err);

    toast.error("Logout failed. Please try again.", {
      id: toastId,
      duration: 3000,
    });
  }
};

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (appRef.current && !appRef.current.contains(e.target)) {
        setAppOpen(false);
      }

      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const avatarLetter = user?.email?.charAt(0).toUpperCase() || "U";

  const handleTracking = () => {
    setShowDesktopDownloadModal(true);
  };

  useEffect(() => {
    let mounted = true;
    const load = () => {
      API.get("/manual-time-requests/count")
        .then(({ data }) => {
          if (mounted) setPendingCount(data.count);
        })
        .catch((err) => console.error(err));
    };

    load();

    const interval = setInterval(load, 10000);
    window.addEventListener("refreshInboxCount", load);

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener("refreshInboxCount", load);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-[#162742] border-b border-gray-200 dark:border-[#263852] transition-colors duration-200">
      <div className="flex h-16 items-center justify-between gap-1.5 sm:gap-3 px-2.5 sm:px-5 md:px-6 lg:px-8">
        {/* LEFT */}
        <div className="flex items-center gap-x-2 sm:gap-x-2.5 md:gap-x-3 min-w-0 shrink">
          {onOpenSidebar && (
            <button
              type="button"
              onClick={onOpenSidebar}
              aria-label="Open sidebar"
              aria-expanded={sidebarOpen}
              title="Open sidebar"
              className="lg:hidden inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <HiBars3 className="h-5 w-5" aria-hidden="true" />
            </button>
          )}

          {/* Dropdown */}
          <div className="relative min-w-0 shrink" ref={appRef}>
            <button
              type="button"
              onClick={() => setAppOpen(!appOpen)}
              aria-label={`Switch application (current: ${currentApp})`}
              aria-expanded={appOpen}
              className="inline-flex h-9 shrink-0 items-center gap-1 sm:gap-2 px-2 sm:px-3 rounded-lg bg-indigo-50 dark:bg-[#0F1B31] hover:bg-indigo-100 dark:hover:bg-[#1A2E4F] border border-indigo-200/70 dark:border-[#263852] text-gray-800 dark:text-gray-100 shadow-sm whitespace-nowrap cursor-pointer transition-colors"
            >
              <Clock3 className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span className="text-sm font-semibold text-indigo-900 dark:text-indigo-300 hidden sm:inline max-w-[140px] md:max-w-none truncate">
                {currentApp}
              </span>
              <ChevronDown className="w-4 h-4 shrink-0 text-gray-600 dark:text-gray-400" />
            </button>

            {/* Dropdown Menu */}
            {appOpen && (
              <div className="absolute -left-10 sm:left-0 mt-2 w-[min(18rem,calc(100vw-1.5rem))] bg-[#020617] text-white rounded-xl shadow-lg p-4 z-40 border border-slate-800">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Apps</p>

                <div className="bg-gray-800 rounded-lg p-2 space-y-1">
                  <div
                    onClick={() => {
                      router.push("/dashboard/time-tracking/home");
                      setAppOpen(false);
                    }}
                    className="flex items-center justify-between p-1 hover:bg-gray-700 rounded cursor-pointer"
                  >
                    <span>Time Tracking</span>
                    {pathname.startsWith(
                      "/dashboard/time-tracking",
                    ) && <Check className="w-4 h-4 text-gray-400 ml-auto" />}
                  </div>

                  <div
                    onClick={() => {
                      router.push("/dashboard/task-management");
                      setAppOpen(false);
                    }}
                    className="flex items-center justify-between p-1 hover:bg-gray-700 rounded cursor-pointer"
                  >
                    <span>Task Management</span>

                    {pathname.startsWith("/dashboard/task-management") && (
                      <Check className="w-4 h-4 text-green-400 ml-auto" />
                    )}
                  </div>
                </div>

                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mt-3 mb-2">Configuration</p>

                <div className="space-y-1">
                  {canManageUsersTeams && (
                    <div
                      onClick={() => {
                        router.push("/dashboard/user-management");
                        setAppOpen(false);
                      }}
                      className="flex items-center justify-between p-1 hover:bg-gray-700 rounded cursor-pointer"
                    >
                      <span>User Management</span>

                      {pathname.startsWith("/dashboard/user-management") && (
                        <Check className="w-4 h-4 text-green-400 ml-auto" />
                      )}
                    </div>
                  )}

                  <div
                    onClick={() => {
                      router.push("/dashboard/settings");
                      setAppOpen(false);
                    }}
                    className="flex items-center justify-between p-1 hover:bg-gray-700 rounded cursor-pointer"
                  >
                    <span>Settings</span>

                    {pathname.startsWith("/dashboard/settings/profile") && (
                      <Check className="w-4 h-4 text-green-400 ml-auto" />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Users */}
          {canManageUsersTeams && (
            <button
              type="button"
              onClick={() => router.push("/dashboard/user-management")}
              aria-label="User Management"
              title="Users"
              className={`hidden md:inline-flex h-9 shrink-0 items-center justify-center gap-2 px-2.5 xl:px-3 rounded text-sm font-semibold whitespace-nowrap transition cursor-pointer ${
                pathname.startsWith("/dashboard/user-management")
                  ? "bg-indigo-600 text-white"
                  : "bg-indigo-50 hover:bg-indigo-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-800 dark:text-slate-200"
              }`}
            >
              <FaUsers
                className={`h-4 w-4 shrink-0 ${
                  pathname.startsWith("/dashboard/user-management")
                    ? "text-white"
                    : "text-indigo-600 dark:text-indigo-400"
                }`}
              />
              <span className="hidden xl:inline">Users</span>
            </button>
          )}

          {/* Settings */}
          <button
            type="button"
            onClick={() => router.push("/dashboard/settings/profile")}
            aria-label="Settings"
            title="Settings"
            className={`hidden md:inline-flex h-9 shrink-0 items-center justify-center gap-2 px-2.5 xl:px-3 rounded text-sm font-semibold whitespace-nowrap transition cursor-pointer ${
              pathname.startsWith("/dashboard/settings")
                ? "bg-indigo-600 text-white"
                : "bg-indigo-50 hover:bg-indigo-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-800 dark:text-slate-200"
            }`}
          >
            <Settings
              className={`h-4 w-4 shrink-0 ${
                pathname.startsWith("/dashboard/settings")
                  ? "text-white"
                  : "text-indigo-600 dark:text-indigo-400"
              }`}
            />
            <span className="hidden xl:inline">Settings</span>
          </button>
        </div>

        {/* RIGHT */}
        <div className="flex items-center gap-x-1 min-[360px]:gap-x-2 sm:gap-x-2.5 md:gap-x-3 shrink-0 min-w-0">
          {/* Start Tracking */}
          <button
            type="button"
            onClick={handleTracking}
            aria-label="Start Tracking"
            title="Start Tracking"
            className="inline-flex h-9 w-9 sm:w-auto shrink-0 items-center justify-center rounded-lg bg-indigo-600 sm:px-3 text-sm font-semibold whitespace-nowrap text-white transition hover:bg-indigo-700 cursor-pointer"
          >
            <Play className="h-4 w-4 shrink-0" />

            <span className="ml-2 hidden sm:inline">Start Tracking</span>
          </button>

          {/* Notifications */}
          <NotificationBell />

          {/* Inbox */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("toggleInbox"))}
              aria-label="Manual time requests inbox"
              title="Inbox"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 dark:text-slate-400 transition hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <HiOutlineEnvelopeOpen className="w-5 h-5" />
            </button>

            {pendingCount > 0 && (
              <span
                className="
                pointer-events-none
                absolute
                -top-0.5
                -right-0.5
                min-w-[17px]
                h-[17px]
                px-1
                rounded-full
                bg-red-600
                text-white
                text-[9px]
                font-bold
                flex
                items-center
                justify-center
                ring-2
                ring-white
                dark:ring-[#162742]
                shadow
            "
              >
                {pendingCount}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setReportsOpen(true)}
            aria-label="Background tasks and reports"
            title="Reports"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 dark:text-slate-400 transition-colors hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <HiOutlineInboxStack className="w-5 h-5" />
          </button>

          {/* // User Profile */}

          <div className="relative min-w-0" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen(!profileOpen)}
              aria-label="Account menu"
              aria-expanded={profileOpen}
              className="flex h-9 min-w-[36px] items-center justify-center gap-1 sm:gap-2 rounded-lg px-0 min-[360px]:px-1 sm:px-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.firstName || "User avatar"}
                  className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs sm:text-sm font-bold">
                  {avatarLetter}
                </div>
              )}

              <span className="text-sm text-gray-700 dark:text-gray-200 hidden xl:block max-w-[160px] 2xl:max-w-[220px] truncate">
                {user?.email || "user@example.com"}
              </span>

              <ChevronDown className="hidden min-[360px]:block w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-gray-500 dark:text-gray-400" />
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-2 w-[min(18rem,calc(100vw-1.5rem))] bg-white dark:bg-slate-800 text-gray-900 dark:text-white border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg p-4 z-40">
                {/* Organization */}
                <div className="mb-3">
                  <p className="text-sm text-gray-900 dark:text-white font-medium">Organization</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-sm break-words">
                    {user?.organization?.name || "XYZ"}
                  </p>
                </div>

                {/* Account */}
                <div className="mb-3">
                  <p className="text-sm text-gray-900 dark:text-white font-medium">Account</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-sm break-all">{user?.email}</p>
                </div>

                {/* Role */}
                <div className="mb-4">
                  <p className="text-sm text-gray-900 dark:text-white font-medium">Role</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-sm">
                    {user?.role || "Owner"}
                  </p>
                </div>

                {/* Sign out */}
                <div
                  className="border-t border-gray-100 dark:border-slate-700 mt-2 pt-2"
                  role="none"
                >
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full px-2 rounded-md text-left text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-slate-700/60 text-sm cursor-pointer min-h-10 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ReportsModal open={reportsOpen} onClose={() => setReportsOpen(false)} />

      {showDesktopDownloadModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 border border-transparent dark:border-slate-700 p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Desktop App Required
                </h2>

                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-slate-300">
                  WorkComposer time tracking runs through the Desktop app. To
                  start tracking your time, download and install the
                  WorkComposer Desktop application.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowDesktopDownloadModal(false)}
                className="text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-200 text-xl"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDesktopDownloadModal(false)}
                className="rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-600"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowDesktopDownloadModal(false);
                  router.push("/#download");
                }}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Download Desktop App
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default DashNavbar;
