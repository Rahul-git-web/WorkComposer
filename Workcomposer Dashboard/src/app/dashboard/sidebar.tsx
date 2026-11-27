"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import logo from "@/assets/dashboard workcomposer logo.png";
import { X } from "lucide-react";

import Image from "next/image";
import ReportsSidebar from "@/app/modules/reports/ReportsSidebar";
import UsersSidebar from "@/app/modules/users-management/UsersSidebar";
import ProjectsSidebar from "@/app/modules/task-management/ProjectsSidebar";
import SettingsSidebar from "@/app/modules/settings/SettingsSidebar";

type SidebarProps = {
  isOpen?: boolean;
  onClose?: () => void;
};

const Sidebar = ({ isOpen: controlledOpen, onClose }: SidebarProps) => {
  const pathname = usePathname();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof controlledOpen === "boolean";
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const searchParams = useSearchParams();
  const navKey = `${pathname}?${searchParams.toString()}`;
  const prevNavKeyRef = useRef(navKey);

  useEffect(() => {
    if (prevNavKeyRef.current !== navKey) {
      prevNavKeyRef.current = navKey;
      onClose?.();
    }
  }, [navKey, onClose]);

  const handleClose = () => {
    onClose?.();
    if (!isControlled) {
      setInternalOpen(false);
    }
  };

  const activeTeam =
    searchParams.get("team") || "All Teams";


  const isTimeTracking =
    pathname.startsWith("/dashboard/time-tracking") ||
    pathname === "/dashboard";
  const isTaskManagement = pathname.startsWith("/dashboard/task-management");
  const isUserManagement = pathname.startsWith("/dashboard/user-management");
  const isSettings = pathname.startsWith("/dashboard/settings");

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[55] lg:hidden"
          onClick={handleClose}
        ></div>
      )}

      <div
        className={`fixed lg:static inset-y-0 left-0 z-[60] lg:z-30 flex flex-col bg-gray-900 
  w-64 lg:w-64 xl:w-72 max-w-[85vw]
  transition-transform duration-300 ease-in-out
  ${isOpen ? "translate-x-0" : "-translate-x-full"}
  lg:translate-x-0`}
      >
        <div className="flex grow flex-col overflow-y-auto px-3 pb-4">
          <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-3">
            <div className="flex items-center min-w-0">
              <Image
                className="h-7 w-auto"
                src={logo}
                alt="WorkComposer"
                priority
              />
            </div>

            <button
              type="button"
              onClick={handleClose}
              aria-label="Close sidebar"
              title="Close sidebar"
              className="lg:hidden inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center justify-between mb-3 mt-4 px-3">
            <h2 className="text-white font-semibold text-lg">
              {isUserManagement
                ? "User Management"
                : isTaskManagement
                  ? "Task Management"
                  : isSettings
                    ? "Settings"
                    : "Time Tracking"}
            </h2>
          </div>

          <nav className="flex flex-1 flex-col mt-2">
            <div className="space-y-1">
              {/* Time Tracking  */}
              {isTimeTracking && (
                <ReportsSidebar />
              )}

              {/* USER - MANAGEMENT  */}

              {isUserManagement && (
                <UsersSidebar
                  activeTeam={activeTeam}
                />
              )}

              {/* TASK MANAGEMENT */}

              {isTaskManagement && (
                <ProjectsSidebar />
              )}

              {/* SETTINGS */}

              {isSettings && (
                <SettingsSidebar />
              )}

            </div>
          </nav>
        </div>
      </div>

    </>
  );
};

export default Sidebar;
