"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { canAccessTeamHome } from "@/utils/reportAccess";
import {
  HiUsers,
  HiOutlineUser,
} from "react-icons/hi2";

import PersonalHomeDashboard from "./home/PersonalHomeDashboard";
import TeamHomeDashboard from "./home/TeamHomeDashboard";
import ThemeSelector from "@/app/desktop-components/desktop/ThemeSelector";
import { useOptionalDesktop } from "@/context/DesktopContext";

export default function HomeContentModule() {
  const { user } = useDashboard();
  const desktopContext = useOptionalDesktop();
  const isDesktop = Boolean(
    desktopContext || (typeof window !== "undefined" && (window as any).electronAPI)
  );

  // Strict Team Home access check (gated on manage_users or owner role)
  const isTeamAccess = canAccessTeamHome(user);
  // Phase 113B Foundation active and preserved in Phase 113D-B
  const mode = isTeamAccess ? "team" : "personal";

  // Initialize active tab from URL search parameters or persistent local storage
  const [activeTab, setActiveTab] = useState<"personal" | "team">(() => {
    if (typeof window !== "undefined") {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlTab = urlParams.get("tab");
        if (urlTab === "team") return "team";
        if (urlTab === "personal") return "personal";

        const storedTab = localStorage.getItem("workcomposer_home_tab");
        if (storedTab === "team" || storedTab === "personal") return storedTab;
      } catch {
        // Fallback to personal on any storage/URL access error
      }
    }
    return "personal";
  });

  // Synchronize tab when user context resolves
  useEffect(() => {
    if (user && isTeamAccess && typeof window !== "undefined") {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlTab = urlParams.get("tab");
        if (urlTab === "team") {
          setActiveTab("team");
        } else if (!urlTab) {
          const stored = localStorage.getItem("workcomposer_home_tab");
          if (stored === "team") {
            setActiveTab("team");
          }
        }
      } catch {
        // Safe no-op
      }
    }
  }, [user, isTeamAccess]);

  // Guard: if user context has loaded and user does NOT have team access, sanitize URL and force personal tab
  useEffect(() => {
    if (user && !isTeamAccess && typeof window !== "undefined") {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get("tab") === "team") {
          urlParams.delete("tab");
          const query = urlParams.toString() ? `?${urlParams.toString()}` : "";
          window.history.replaceState({}, "", window.location.pathname + query);
        }
      } catch {
        // Safe no-op
      }
      if (activeTab !== "personal") {
        setActiveTab("personal");
      }
    }
  }, [user, isTeamAccess, activeTab]);

  // Support browser Back/Forward navigation between views
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlTab = urlParams.get("tab");
        if (urlTab === "team" && isTeamAccess) {
          setActiveTab("team");
        } else {
          setActiveTab("personal");
        }
      } catch {
        setActiveTab("personal");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isTeamAccess]);

  // Handle user-initiated tab switching with URL & storage synchronization
  const handleTabChange = useCallback(
    (tab: "personal" | "team") => {
      if (tab === activeTab) return; // avoid duplicate history entries

      // If user lacks team access, never allow switching to team
      if (tab === "team" && !isTeamAccess) {
        return;
      }

      setActiveTab(tab);

      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("workcomposer_home_tab", tab);
          const urlParams = new URLSearchParams(window.location.search);
          if (tab === "team") {
            urlParams.set("tab", "team");
          } else {
            urlParams.delete("tab");
          }
          const query = urlParams.toString() ? `?${urlParams.toString()}` : "";
          const newUrl = window.location.pathname + query;
          window.history.pushState({ tab }, "", newUrl);
        } catch {
          // Graceful fallback if pushState or localStorage is restricted
        }
      }
    },
    [activeTab, isTeamAccess]
  );

  // If user does not have team report access, render personal shell with ThemeSelector
  if (!isTeamAccess) {
    return (
      <div
        className={`w-full min-w-0 pt-3 pb-6 space-y-4 ${
          isDesktop ? "px-4 sm:px-6 lg:px-8 max-w-[1700px] mx-auto" : ""
        }`}
        data-testid="time-home-personal-shell"
      >
        {/* WORKCOMPOSER-118: Dedicated Theme Selector between Dashboard Navbar and Time Tracking Module Navigation */}
        {!isDesktop && (
          <div
            data-testid="time-home-theme-selector-bar"
            className="flex items-center justify-end w-full pb-1"
          >
            <ThemeSelector />
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center shrink-0">
              <HiOutlineUser className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-900 dark:text-white">
                  Time Tracking Home
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
                  Personal Mode
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Personal activity and performance dashboard.
              </p>
            </div>
          </div>
        </div>

        <PersonalHomeDashboard />
      </div>
    );
  }

  // If user has team report access, provide view switcher between My Personal Home and Team Home
  return (
    <div
      className={`w-full min-w-0 pt-3 pb-6 space-y-4 ${
        isDesktop ? "px-4 sm:px-6 lg:px-8 max-w-[1700px] mx-auto" : ""
      }`}
    >
      {/* WORKCOMPOSER-118: Dedicated Theme Selector between Dashboard Navbar and Time Tracking Module Navigation */}
      {!isDesktop && (
        <div
          data-testid="time-home-theme-selector-bar"
          className="flex items-center justify-end w-full pb-1"
        >
          <ThemeSelector />
        </div>
      )}

      {/* Team User View Selector Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center shrink-0">
            <HiUsers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                Time Tracking Home
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                Team Access
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Switch between your personal tracking dashboard and team overview.
            </p>
          </div>
        </div>

        {/* View Switcher Pills */}
        <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
          <div className="flex items-center bg-gray-100 dark:bg-slate-800/80 p-1 rounded-xl border border-gray-200 dark:border-slate-700/60">
            <button
              type="button"
              onClick={() => handleTabChange("personal")}
              data-testid="tab-personal-home"
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "personal"
                  ? "bg-white dark:bg-[#0F172A] text-indigo-600 dark:text-indigo-400 shadow-2xs"
                  : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <HiOutlineUser className="w-3.5 h-3.5" />
              <span>My Personal Home</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("team")}
              data-testid="tab-team-home"
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "team"
                  ? "bg-white dark:bg-[#0F172A] text-indigo-600 dark:text-indigo-400 shadow-2xs"
                  : "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <HiUsers className="w-3.5 h-3.5" />
              <span>Team Home</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "personal" ? (
        <PersonalHomeDashboard />
      ) : (
        <TeamHomeDashboard onSwitchToPersonal={() => handleTabChange("personal")} />
      )}
    </div>
  );
}
