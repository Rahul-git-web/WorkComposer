"use client";

import { useState, Fragment, useEffect, useRef } from "react";
import { HiOutlineCalendar } from "react-icons/hi";
import {
    HiOutlineShieldCheck,
    HiOutlineMagnifyingGlass,
    HiChevronDown,
    HiOutlineClipboardDocument,
    HiOutlineCheck,
    HiOutlineXMark,
} from "react-icons/hi2";
import API from "@/api";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import SettingsLoading from "@/components/settings/SettingsLoading";
import toast from "react-hot-toast";
import {
    resolveAvatarUrl,
    getInitials,
    getCategoryBadge,
    getCategoryIcon,
} from "@/utils/auditAvatar";

function UserAvatar({
    user,
    size = 32,
    className = "",
}: {
    user?: { firstName?: string; lastName?: string; email?: string; avatar?: string } | null;
    size?: number;
    className?: string;
}) {
    const [imageError, setImageError] = useState(false);
    const avatarUrl = resolveAvatarUrl(user?.avatar);

    if (!avatarUrl || imageError) {
        return (
            <div
                style={{ width: size, height: size }}
                className={`rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-center font-semibold text-xs shrink-0 select-none ${className}`}
            >
                {getInitials(user)}
            </div>
        );
    }

    return (
        <img
            src={avatarUrl}
            alt={user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "User" : "System"}
            width={size}
            height={size}
            style={{ width: size, height: size }}
            className={`rounded-full object-cover shrink-0 border border-gray-200 dark:border-slate-700/80 ${className}`}
            onError={() => setImageError(true)}
        />
    );
}

export default function AuditLogPage() {
    const [expandedLog, setExpandedLog] = useState<string | null>(null);
    const [selectedUser, setSelectedUser] = useState("all");
    const [selectedCategory, setSelectedCategory] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().setDate(new Date().getDate() - 30)),
        end: new Date(),
    });

    const [users, setUsers] = useState<any[]>([]);
    const [categoryOpen, setCategoryOpen] = useState(false);
    const [userOpen, setUserOpen] = useState(false);

    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalLogs, setTotalLogs] = useState(0);
    const [datePickerOpen, setDatePickerOpen] = useState(false);

    const userDropdownRef = useRef<HTMLDivElement>(null);
    const categoryDropdownRef = useRef<HTMLDivElement>(null);
    const datePickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                userDropdownRef.current &&
                !userDropdownRef.current.contains(e.target as Node)
            ) {
                setUserOpen(false);
            }

            if (
                categoryDropdownRef.current &&
                !categoryDropdownRef.current.contains(e.target as Node)
            ) {
                setCategoryOpen(false);
            }

            if (
                datePickerRef.current &&
                !datePickerRef.current.contains(e.target as Node)
            ) {
                setDatePickerOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const fetchAuditLogs = async () => {
        try {
            setLoading(true);

            const { data } = await API.get("/auditLog", {
                params: {
                    page: currentPage,
                    limit: 10,
                    user: selectedUser,
                    category: selectedCategory,
                    startDate: dateRange.start.toISOString(),
                    endDate: dateRange.end.toISOString(),
                },
            });

            setLogs(data.logs || []);
            setTotalPages(data.totalPages || 1);
            setTotalLogs(data.total || 0);
        } catch (err: any) {
            console.error("AUDIT LOG FETCH ERROR:", err);

            toast.error(
                err.response?.data?.message ||
                "Failed to load audit logs."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAuditLogs();
    }, [
        currentPage,
        selectedUser,
        selectedCategory,
        dateRange,
    ]);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const { data } = await API.get("/users");
                setUsers(data || []);
            } catch (err: any) {
                console.error("AUDIT LOG USERS FETCH ERROR:", err);
                toast.error(
                    err.response?.data?.message ||
                    "Failed to load users."
                );
            }
        };

        fetchUsers();
    }, []);

    const copyDetails = async (logId: string, details: any) => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(details, null, 2));
            setCopiedId(logId);
            toast.success("Details copied to clipboard");
            setTimeout(() => setCopiedId(null), 2000);
        } catch {
            toast.error("Failed to copy details");
        }
    };

    const handleClearFilters = () => {
        setSearchQuery("");
        setSelectedUser("all");
        setSelectedCategory("all");
        setDateRange({
            start: new Date(new Date().setDate(new Date().getDate() - 30)),
            end: new Date(),
        });
        setCurrentPage(1);
    };

    const selectedUserData =
        users.find((u: any) => (u._id || u.id) === selectedUser) || null;

    // Filter logs with local search query across activity, performer, IP, platform, and details
    const filteredLogs = logs.filter((log) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        const activityMatch = log.activity?.toLowerCase().includes(q);
        const categoryMatch = log.category?.toLowerCase().includes(q);
        const performer = log.performedBy;
        const performerName = performer
            ? `${performer.firstName || ""} ${performer.lastName || ""}`.toLowerCase()
            : "system";
        const performerEmail = performer?.email?.toLowerCase() || "";
        const ipMatch = log.ipAddress?.toLowerCase().includes(q);
        const platformMatch = log.platform?.toLowerCase().includes(q);
        const detailsMatch = JSON.stringify(log.details || {}).toLowerCase().includes(q);
        return (
            activityMatch ||
            categoryMatch ||
            performerName.includes(q) ||
            performerEmail.includes(q) ||
            ipMatch ||
            platformMatch ||
            detailsMatch
        );
    });

    return (
        <div className="w-full">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Header */}
                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Audit Log</h2>
                    <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                        Track security, authentication, and administrative activities in your workspace
                    </p>
                </div>

                {/* Filter Controls Bar */}
                <div className="mb-6 flex flex-wrap items-center gap-3">
                    {/* Search Input */}
                    <div className="relative flex-1 min-w-[220px] max-w-sm">
                        <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search activity, actor, IP..."
                            className="w-full pl-9 pr-8 py-2 text-sm bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-900 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 transition-colors shadow-sm"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery("")}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                                title="Clear search"
                            >
                                <HiOutlineXMark className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {/* Date Range Selector */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setDatePickerOpen(!datePickerOpen)}
                            className="px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-lg hover:border-gray-400 dark:hover:border-slate-600 text-gray-700 dark:text-slate-200 shadow-sm transition-colors flex items-center gap-2"
                        >
                            <HiOutlineCalendar className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                            <span className="font-medium">
                                {dateRange.start.toLocaleDateString()} -{" "}
                                {dateRange.end.toLocaleDateString()}
                            </span>
                            <HiChevronDown className={`w-3.5 h-3.5 text-gray-400 dark:text-slate-400 transition-transform ${datePickerOpen ? "rotate-180" : ""}`} />
                        </button>

                        {datePickerOpen && (
                            <div
                                ref={datePickerRef}
                                className="absolute left-0 z-30 mt-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-xl dark:[&_.react-datepicker]:!bg-slate-800 dark:[&_.react-datepicker]:!border-slate-700 dark:[&_.react-datepicker__header]:!bg-slate-900 dark:[&_.react-datepicker__header]:!border-slate-700 dark:[&_.react-datepicker__current-month]:!text-white dark:[&_.react-datepicker__day-name]:!text-slate-400 dark:[&_.react-datepicker__day]:!text-slate-200 dark:[&_.react-datepicker__day:hover]:!bg-slate-700 dark:[&_.react-datepicker__day--selected]:!bg-indigo-600 dark:[&_.react-datepicker__day--in-range]:!bg-indigo-900/60 dark:[&_.react-datepicker__navigation-icon::before]:!border-slate-300 dark:[&_.react-datepicker__day--outside-month]:!text-slate-600"
                            >
                                <div className="flex flex-col sm:flex-row gap-4">
                                    <div>
                                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
                                            Start Date
                                        </label>
                                        <DatePicker
                                            selected={dateRange.start}
                                            onChange={(date: Date | null) =>
                                                setDateRange((prev) => ({
                                                    ...prev,
                                                    start: date || prev.start,
                                                }))
                                            }
                                            selectsStart
                                            startDate={dateRange.start}
                                            endDate={dateRange.end}
                                            className="rounded-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
                                            End Date
                                        </label>
                                        <DatePicker
                                            selected={dateRange.end}
                                            onChange={(date: Date | null) =>
                                                setDateRange((prev) => ({
                                                    ...prev,
                                                    end: date || prev.end,
                                                }))
                                            }
                                            selectsEnd
                                            startDate={dateRange.start}
                                            endDate={dateRange.end}
                                            minDate={dateRange.start}
                                            className="rounded-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                </div>

                                <div className="mt-4 flex justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setDatePickerOpen(false)}
                                        className="rounded-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* User Dropdown Selector */}
                    <div ref={userDropdownRef} className="relative">
                        <button
                            type="button"
                            onClick={() => setUserOpen(!userOpen)}
                            className="w-48 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-left text-sm text-gray-900 dark:text-slate-200 hover:border-gray-400 dark:hover:border-slate-600 shadow-sm transition-colors flex items-center justify-between"
                        >
                            <span className="block truncate">
                                {selectedUserData
                                    ? `${selectedUserData.firstName} ${selectedUserData.lastName}`
                                    : "All Users"}
                            </span>
                            <HiChevronDown className={`w-3.5 h-3.5 text-gray-400 dark:text-slate-400 transition-transform ${userOpen ? "rotate-180" : ""}`} />
                        </button>

                        {userOpen && (
                            <div className="absolute left-0 z-20 mt-1 max-h-80 w-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg divide-y divide-gray-100 dark:divide-slate-700/50">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedUser("all");
                                        setUserOpen(false);
                                    }}
                                    className="block w-full px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700/60 transition-colors"
                                >
                                    All Users
                                </button>

                                {users.map((user: any) => (
                                    <button
                                        key={user._id || user.id}
                                        type="button"
                                        onClick={() => {
                                            setSelectedUser(user._id || user.id);
                                            setUserOpen(false);
                                        }}
                                        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-slate-700/60 transition-colors"
                                    >
                                        <UserAvatar user={user} size={30} />
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                {user.firstName} {user.lastName}
                                            </p>
                                            <p className="text-xs capitalize text-gray-500 dark:text-slate-400 truncate">
                                                {user.role}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Category Dropdown Selector */}
                    <div ref={categoryDropdownRef} className="relative">
                        <button
                            type="button"
                            onClick={() => setCategoryOpen(!categoryOpen)}
                            aria-expanded={categoryOpen}
                            className="w-52 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-left text-sm text-gray-900 dark:text-slate-200 hover:border-gray-400 dark:hover:border-slate-600 shadow-sm transition-colors flex items-center justify-between"
                        >
                            <span className="block truncate">
                                {selectedCategory === "all"
                                    ? "All Categories"
                                    : `${getCategoryIcon(selectedCategory)} ${selectedCategory}`}
                            </span>
                            <HiChevronDown className={`w-3.5 h-3.5 text-gray-400 dark:text-slate-400 transition-transform ${categoryOpen ? "rotate-180" : ""}`} />
                        </button>

                        {categoryOpen && (
                            <div className="absolute left-0 z-20 mt-1 max-h-96 w-60 overflow-auto rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedCategory("all");
                                        setCategoryOpen(false);
                                    }}
                                    className="block w-full px-3 py-2 text-left text-sm font-medium text-gray-900 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700/60 transition-colors"
                                >
                                    All Categories
                                </button>

                                <div className="border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-slate-400">
                                    Account & Access
                                </div>
                                {["Users", "Teams", "Roles", "Desktop App"].map((cat) => (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => {
                                            setSelectedCategory(cat);
                                            setCategoryOpen(false);
                                        }}
                                        className="flex items-center gap-2 w-full px-4 py-2 text-left text-sm text-gray-900 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700/60 transition-colors"
                                    >
                                        <span>{getCategoryIcon(cat)}</span>
                                        <span>{cat}</span>
                                    </button>
                                ))}

                                <div className="border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-slate-400">
                                    Organization & Settings
                                </div>
                                {["Organization", "Settings", "Billing", "Storage"].map((cat) => (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => {
                                            setSelectedCategory(cat);
                                            setCategoryOpen(false);
                                        }}
                                        className="flex items-center gap-2 w-full px-4 py-2 text-left text-sm text-gray-900 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700/60 transition-colors"
                                    >
                                        <span>{getCategoryIcon(cat)}</span>
                                        <span>{cat}</span>
                                    </button>
                                ))}

                                <div className="border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-slate-400">
                                    Projects & HR
                                </div>
                                {["Projects", "Tasks", "HR Leave Types"].map((cat) => (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => {
                                            setSelectedCategory(cat);
                                            setCategoryOpen(false);
                                        }}
                                        className="flex items-center gap-2 w-full px-4 py-2 text-left text-sm text-gray-900 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700/60 transition-colors"
                                    >
                                        <span>{getCategoryIcon(cat)}</span>
                                        <span>{cat}</span>
                                    </button>
                                ))}

                                <div className="border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-slate-400">
                                    Devices
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedCategory("Devices");
                                        setCategoryOpen(false);
                                    }}
                                    className="flex items-center gap-2 w-full px-4 py-2 text-left text-sm text-gray-900 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700/60 transition-colors"
                                >
                                    <span>🔒</span>
                                    <span>Devices</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Clear Filters Button */}
                    <button
                        type="button"
                        onClick={handleClearFilters}
                        className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        Clear Filters
                    </button>
                </div>

                {/* Main Activity Log Card */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    {/* Card Header */}
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/60 flex justify-between items-center">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Activity Log</h3>
                        <div className="text-sm text-gray-600 dark:text-slate-400">
                            {filteredLogs.length === 0
                                ? "0 Results"
                                : `${(currentPage - 1) * 10 + 1}-${Math.min(
                                    currentPage * 10,
                                    totalLogs
                                )} of ${totalLogs}`}
                        </div>
                    </div>

                    {/* Table View */}
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100 dark:divide-slate-800">
                            <thead className="bg-gray-50 dark:bg-slate-800/60">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider">
                                        Performed By
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider">
                                        Activity
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider">
                                        Date
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider">
                                        Details
                                    </th>
                                </tr>
                            </thead>

                            {loading ? (
                                <tbody>
                                    <tr>
                                        <td colSpan={4} className="p-0">
                                            <SettingsLoading />
                                        </td>
                                    </tr>
                                </tbody>
                            ) : filteredLogs.length === 0 ? (
                                <tbody>
                                    <tr>
                                        <td colSpan={4} className="px-4 py-12 text-center">
                                            <div className="flex flex-col items-center justify-center space-y-3">
                                                <div className="h-12 w-12 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-gray-400 dark:text-slate-500">
                                                    <HiOutlineShieldCheck className="w-6 h-6" />
                                                </div>
                                                <p className="text-base font-semibold text-gray-900 dark:text-white">
                                                    {searchQuery ? "No matching audit logs" : "No audit logs found"}
                                                </p>
                                                <p className="text-sm text-gray-500 dark:text-slate-400 max-w-sm">
                                                    {searchQuery
                                                        ? `No activities match "${searchQuery}". Try adjusting your search query or clear filters.`
                                                        : "No activities match your current filter parameters or date selection. Try expanding your date range or clearing filters."}
                                                </p>
                                                {(searchQuery || selectedUser !== "all" || selectedCategory !== "all") && (
                                                    <button
                                                        type="button"
                                                        onClick={handleClearFilters}
                                                        className="mt-2 px-3.5 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors"
                                                    >
                                                        Clear Filters
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            ) : (
                                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                                    {filteredLogs.map((log) => {
                                        const performer = log.performedBy;
                                        const isSystem = !performer;
                                        const displayName = isSystem
                                            ? "System"
                                            : `${performer.firstName || ""} ${performer.lastName || ""}`.trim() || performer.email || "Unknown User";
                                        const subtext = isSystem
                                            ? "Automated Platform Event"
                                            : performer.email || performer._id || performer.id || "User";

                                        return (
                                            <Fragment key={log._id || log.id}>
                                                {/* Main Table Row */}
                                                <tr className="hover:bg-gray-50/80 dark:hover:bg-slate-800/40 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center">
                                                            <UserAvatar user={performer} size={32} />
                                                            <div className="ml-3 min-w-0">
                                                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                                    {displayName}
                                                                </p>
                                                                <p className="text-xs text-gray-500 dark:text-slate-400 truncate">
                                                                    {subtext}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <div className="flex flex-col gap-1 items-start">
                                                            <span
                                                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${getCategoryBadge(
                                                                    log.category
                                                                )}`}
                                                            >
                                                                <span>{getCategoryIcon(log.category)}</span>
                                                                <span>{log.category}</span>
                                                            </span>

                                                            <span className="text-sm text-gray-900 dark:text-slate-200 font-normal">
                                                                {log.activity}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                                                        {new Date(log.createdAt).toLocaleString("en-US", {
                                                            month: "short",
                                                            day: "numeric",
                                                            year: "numeric",
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                        })}
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setExpandedLog(
                                                                    expandedLog === (log._id || log.id)
                                                                        ? null
                                                                        : (log._id || log.id)
                                                                )
                                                            }
                                                            className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors"
                                                        >
                                                            {expandedLog === (log._id || log.id)
                                                                ? "Hide"
                                                                : "Show"}
                                                        </button>
                                                    </td>
                                                </tr>

                                                {/* Expanded Details Row */}
                                                {expandedLog === (log._id || log.id) && (
                                                    <tr className="bg-gray-50/60 dark:bg-slate-900/60">
                                                        <td colSpan={4} className="px-4 py-3">
                                                            <div className="rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50/80 dark:bg-slate-800/70 p-4 shadow-sm">
                                                                {/* Details Header & Copy Button */}
                                                                <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-200/80 dark:border-slate-700/60">
                                                                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-400">
                                                                        Event Metadata & Context
                                                                    </span>
                                                                    {log.details && Object.keys(log.details).length > 0 && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => copyDetails(log._id || log.id, log.details)}
                                                                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-md hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors shadow-xs"
                                                                        >
                                                                            {copiedId === (log._id || log.id) ? (
                                                                                <>
                                                                                    <HiOutlineCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                                                                    <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <HiOutlineClipboardDocument className="w-3.5 h-3.5 text-gray-500 dark:text-slate-400" />
                                                                                    <span>Copy JSON</span>
                                                                                </>
                                                                            )}
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                <div className="space-y-2 text-sm">
                                                                    {Object.entries(log.details || {}).map(([key, value]) => (
                                                                        <div key={key} className="flex flex-col sm:flex-row sm:gap-2">
                                                                            <span className="min-w-[140px] capitalize text-gray-500 dark:text-slate-400 text-xs sm:text-sm font-medium">
                                                                                {key.replace(/([A-Z])/g, " $1")}:
                                                                            </span>

                                                                            <div className="font-medium text-gray-900 dark:text-slate-200 text-xs sm:text-sm">
                                                                                {typeof value === "object" && value !== null ? (
                                                                                    <div className="space-y-1 mt-1 pl-2.5 border-l-2 border-indigo-200 dark:border-indigo-800/60">
                                                                                        {Object.entries(value as Record<string, any>).map(
                                                                                            ([subKey, subValue]) => (
                                                                                                <div key={subKey} className="flex gap-2">
                                                                                                    <span className="capitalize text-gray-500 dark:text-slate-400 text-xs">
                                                                                                        {subKey}:
                                                                                                    </span>
                                                                                                    <span className="text-xs text-gray-900 dark:text-slate-200">
                                                                                                        {String(subValue)}
                                                                                                    </span>
                                                                                                </div>
                                                                                            )
                                                                                        )}
                                                                                    </div>
                                                                                ) : (
                                                                                    <span>{String(value)}</span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    ))}

                                                                    {log.ipAddress && (
                                                                        <div className="flex gap-2 pt-2 border-t border-gray-200/80 dark:border-slate-800">
                                                                            <span className="min-w-[140px] text-gray-500 dark:text-slate-400 text-xs sm:text-sm font-medium">
                                                                                IP Address:
                                                                            </span>
                                                                            <span className="font-medium text-gray-900 dark:text-slate-200 font-mono text-xs sm:text-sm">
                                                                                {log.ipAddress}
                                                                            </span>
                                                                        </div>
                                                                    )}

                                                                    {log.platform && (
                                                                        <div className="flex gap-2">
                                                                            <span className="min-w-[140px] text-gray-500 dark:text-slate-400 text-xs sm:text-sm font-medium">
                                                                                Platform:
                                                                            </span>
                                                                            <span className="font-medium text-gray-900 dark:text-slate-200 text-xs sm:text-sm">
                                                                                {log.platform}
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            )}
                        </table>
                    </div>

                    {/* Pagination Footer */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between border-t border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/60 px-4 py-3">
                            <p className="text-sm text-gray-600 dark:text-slate-400">
                                Page {currentPage} of {totalPages}
                            </p>

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage((p) => p - 1)}
                                    className="rounded-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white dark:disabled:hover:bg-slate-800 transition-colors"
                                >
                                    Previous
                                </button>

                                <button
                                    type="button"
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage((p) => p + 1)}
                                    className="rounded-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white dark:disabled:hover:bg-slate-800 transition-colors"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
