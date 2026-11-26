"use client";

import { ChevronDown, X } from "lucide-react";
import { CiImport } from "react-icons/ci";
import { CiViewColumn } from "react-icons/ci";
import Image from 'next/image';
import API from "@/api";
import { useEffect, useRef, useState } from "react";
import AppUsageChart from './AppUsageChart';
import UsageDetailsModal from "./UsageDetailsModal";
import FullListModal from "./FullListModal";
import ReportsModal from "../attendance/reports/ReportsModal";
import UserProfileTrigger from "@/components/UserProfileTrigger";
import { formatDateForApi } from "@/utils/appTimezone";
import { useAppTimezone } from "@/hooks/useAppTimezone";

type Props = {
  usageData: any[];
  allUsers: any[];
  reportRange: {
    type: string;
    startDate: Date;
    endDate: Date;
  };
  selectedUsers?: any[];
  selectedTeams?: any[];
  timezone?: string;
};

export default function WebAppUsageCard({
  usageData,
  allUsers,
  reportRange,
  selectedUsers = [],
  selectedTeams = [],
  timezone: propTimezone,
}: Props) {
  const defaultTimezone = useAppTimezone();
  const timezone = propTimezone || defaultTimezone;

  const [openModal, setOpenModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [openFullList, setOpenFullList] = useState(false);
  const [selectedFullListUser, setSelectedFullListUser] = useState<any>(null);
  const [searchApp, setSearchApp] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [openReports, setOpenReports] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () =>
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
  }, []);

  const appNames = [
    ...new Set(
      (usageData || []).flatMap((user) =>
        user.apps?.map((app: any) => app.name) || []
      )
    ),
  ].sort();

  const normalizedSearchApp = searchApp.trim().toLowerCase();

  const filteredApps = appNames.filter((app) =>
    app.toLowerCase().includes(normalizedSearchApp)
  );

  const filteredUsageData =
    normalizedSearchApp === ""
      ? usageData
      : usageData.filter((user) =>
        user.apps.some(
          (app: any) => (app.name || "").trim().toLowerCase() === normalizedSearchApp
        )
      );

  const activeFullListUser = selectedFullListUser
    ? usageData.find(
        (u) => (u._id || u.id) === (selectedFullListUser._id || selectedFullListUser.id)
      ) || selectedFullListUser
    : null;

  const generateUsageReport = async () => {
    try {
      const startDate = formatDateForApi(reportRange.startDate, timezone);
      const endDate = formatDateForApi(reportRange.endDate, timezone);
      const userIds = (selectedUsers || [])
        .map((u: any) => u?._id || u?.id)
        .filter(Boolean);
      const teamIds = (selectedTeams || [])
        .map((team: any) =>
          typeof team === "object" ? team?._id || team?.id : team
        )
        .filter(Boolean);

      await API.post("/reports/usage", {
        startDate,
        endDate,
        selectedUsers: userIds,
        selectedTeams: teamIds,
      });

      setOpenReports(true);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      <div className="min-h-[calc(100vh-250px)] rounded-b-lg bg-white dark:bg-[#0F172A] shadow-sm border-l border-r border-b border-gray-200 dark:border-[#22324D]">
        <div className="overflow-visible bg-gray-50 dark:bg-[#090F1D] divide-y divide-gray-200 dark:divide-[#22324D]">
          <div className="px-3 py-2 sm:px-5 bg-white dark:bg-[#0F172A] shadow-sm border-b border-gray-200 dark:border-[#22324D]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h2 className="text-lg font-bold text-gray-800 dark:text-white">Web and App Usage</h2>
              <div className="flex items-center gap-2">
                <div
                  ref={dropdownRef}
                  className="relative"
                >
                  <div className="relative w-64 shadow-sm rounded-lg border-gray-300 dark:border-gray-700 focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50">
                    <input
                      type="text"
                      placeholder="Search app"
                      value={searchApp}
                      onChange={(e) => {
                        setSearchApp(e.target.value);
                        setShowDropdown(true);
                      }}
                      onFocus={() => setShowDropdown(true)}
                      className="w-full px-3 py-1 border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1E293B] text-gray-900 dark:text-white rounded-md shadow-sm focus:outline-none focus:ring focus:border-indigo-300 pr-10"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">

                      {searchApp && (

                        <button
                          type="button"
                          onClick={() => {
                            setSearchApp("");
                            setShowDropdown(false);
                          }}
                          className="mr-1 rounded-full p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300"
                          aria-label="Clear search"
                        >
                          <X className="h-4 w-4" />
                        </button>

                      )}

                      <button
                        type="button"
                        onClick={() => setShowDropdown((prev) => !prev)}
                        className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        aria-label="Toggle suggestions"
                      >
                        <ChevronDown
                          className={`h-5 w-5 transition-transform duration-200 ${showDropdown ? "rotate-180" : ""
                            }`}
                        />
                      </button>

                    </div>
                    {showDropdown && (
                      <div className="absolute left-0 right-0 mt-1 bg-white dark:bg-[#1E293B] border border-gray-300 dark:border-gray-700 rounded-md shadow-lg z-50 max-h-64 overflow-y-auto overscroll-contain">

                        {filteredApps.length === 0 ? (

                          <div className="px-3 py-2 text-sm text-gray-500 dark:text-slate-400">
                            No apps found
                          </div>

                        ) : (

                          <ul>

                            <li
                              onClick={() => {
                                setSearchApp("");
                                setShowDropdown(false);
                              }}
                              className={`px-3 py-2 cursor-pointer border-b dark:border-slate-700 transition-colors ${searchApp === ""
                                ? "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-medium"
                                : "hover:bg-indigo-50 dark:hover:bg-slate-700/60 text-gray-700 dark:text-slate-200"
                                }`}
                            >
                              All Apps
                            </li>

                            {filteredApps.map((app) => (

                              <li
                                key={app}
                                onClick={() => {
                                  setSearchApp(app);
                                  setShowDropdown(false);
                                }}
                                className={`px-3 py-2 cursor-pointer transition-colors ${searchApp.toLowerCase() === app.toLowerCase()
                                  ? "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-medium"
                                  : "hover:bg-indigo-50 dark:hover:bg-slate-700/60 text-gray-700 dark:text-slate-200"
                                  }`}
                              >
                                {app}
                              </li>

                            ))}

                          </ul>

                        )}

                      </div>
                    )}
                  </div>
                </div>

                <button
                  title="Export"
                  onClick={() => setOpenReports(true)}
                  className="inline-flex cursor-pointer items-center font-semibold px-4 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  <CiImport className="w-5 h-5 mr-2" />
                  Export
                </button>
              </div>
            </div>
          </div>

          <div className='px-6 py-6 sm:px-8'>
            {filteredUsageData.length === 0 ? (

              <div className="py-20 text-center">

                <CiViewColumn className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />

                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  No data available
                </h3>

                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  App usage data will appear here once it&apos;s captured.
                </p>

              </div>

            ) : (
              filteredUsageData.map((user) => {

                const filteredUserApps =
                  normalizedSearchApp === ""
                    ? user.apps
                    : user.apps.filter(
                      (app: any) => (app.name || "").trim().toLowerCase() === normalizedSearchApp
                    );

                return (
                  <div
                    key={user._id}
                    className='p-4 mb-6 relative border-b border-gray-100 dark:border-gray-800'
                  >
                    <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 pb-4'>

                      <div className='flex items-center'>
                        <span className='flex items-center'>

                          <UserProfileTrigger
                            user={
                              Array.isArray(allUsers)
                                ? allUsers.find(
                                  (profileUser) =>
                                    profileUser._id === user._id
                                )
                                : undefined
                            }
                            className="shrink-0 cursor-pointer rounded-full focus:outline-none"
                          >
                            {user.avatar?.trim() ? (
                              <img
                                src={user.avatar}
                                alt={`${user.firstName} ${user.lastName}`}
                                className="w-12 h-12 rounded-full object-cover hover:ring-2 hover:ring-indigo-400 transition"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-indigo-500 flex items-center justify-center text-white font-semibold hover:ring-2 hover:ring-indigo-400 transition">
                                {user.firstName?.charAt(0)}
                              </div>
                            )}
                          </UserProfileTrigger>

                          <UserProfileTrigger
                            user={
                              Array.isArray(allUsers)
                                ? allUsers.find(
                                  (profileUser) =>
                                    profileUser._id === user._id
                                )
                                : undefined
                            }
                            className="ml-3 text-left"
                          >
                            <h3 className="text-blue-700 dark:text-indigo-400 font-semibold text-lg cursor-pointer transition-colors flex items-center">
                              <span className="truncate max-w-xs">
                                {user.name}
                              </span>
                            </h3>
                          </UserProfileTrigger>

                        </span>
                      </div>

                      <div className='flex items-center gap-3 text-sm flex-wrap'>

                        <div className='flex items-center space-x-4'>

                          <div className='flex items-center space-x-4'>

                            <div className='flex items-center border-l-2 border-blue-500 pl-2'>
                              <span className='text-gray-500 dark:text-slate-400 font-medium'>
                                Work Time
                              </span>

                              <span className='font-semibold text-gray-800 dark:text-slate-200 ml-2'>
                                {user.workTime}
                              </span>
                            </div>

                            <div className='flex items-center border-l-2 border-amber-500 pl-2'>
                              <span className='text-gray-500 dark:text-slate-400 font-medium'>
                                Break Time
                              </span>

                              <span className='font-semibold text-gray-800 dark:text-slate-200 ml-2'>
                                {user.breakTime}
                              </span>
                            </div>

                          </div>

                        </div>

                        <button
                          title="Detailed log"
                          onClick={() => {
                            setSelectedUser(user);
                            setOpenModal(true);
                          }}
                          className="px-4 py-2 font-medium cursor-pointer border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-200 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 text-sm transition-colors"
                        >
                          Detailed log
                        </button>

                        <button
                          title="Full list"
                          onClick={() => {
                            setSelectedFullListUser(user);
                            setOpenFullList(true);
                          }}
                          className='px-4 py-2 font-medium cursor-pointer bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm transition-colors'
                        >
                          Full list
                        </button>

                      </div>
                    </div>

                    {filteredUserApps.length === 0 ? (
                      <div className='text-center text-gray-500 dark:text-slate-400 py-8 bg-gray-50 dark:bg-slate-900/50 rounded-lg'>
                        <CiViewColumn className='h-8 w-8 mx-auto text-gray-300 dark:text-slate-600 mb-2' />
                        <p>No app usage data available</p>
                        <p className='text-sm text-gray-400 dark:text-slate-500 mt-1'>
                          Data will appear once apps are used.
                        </p>
                      </div>
                    ) : (
                      <div>
                        {filteredUserApps.length > 12 && (
                          <div className="mb-2 flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
                            <span>
                              Showing top 12 of {filteredUserApps.length} items
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedFullListUser(user);
                                setOpenFullList(true);
                              }}
                              className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                            >
                              View full list
                            </button>
                          </div>
                        )}
                        <AppUsageChart
                          apps={filteredUserApps}
                        />
                      </div>
                    )}

                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <UsageDetailsModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        user={selectedUser}
        reportRange={reportRange}
        timezone={timezone}
      />

      <FullListModal
        open={openFullList}
        onClose={() => setOpenFullList(false)}
        user={activeFullListUser}
      />

      <ReportsModal
        open={openReports}
        onClose={() => setOpenReports(false)}
        autoGenerate
        onGenerate={generateUsageReport}
      />
    </>
  )
}


