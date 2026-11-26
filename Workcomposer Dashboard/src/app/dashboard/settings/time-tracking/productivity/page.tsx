"use client";

import {
    Plus, Search, ArrowUpDown, EllipsisVertical, SquarePen, ChevronLeft, ChevronRight, MoreVertical,
    Pencil,
    Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import API from "@/api";
import toast from 'react-hot-toast';
import NewAppConfigurationModal from './components/NewAppConfigurationModal';
import DeleteAppConfigurationModal from './components/DeleteAppConfigurationModal';
import SettingsLoading from '@/components/settings/SettingsLoading';

const ProductivityPage = () => {

    const [stats, setStats] = useState({
        productive: 0,
        neutral: 0,
        unproductive: 0,
        blacklisted: 0,
        total: 0,
    });

    const [applications, setApplications] = useState<any[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [sortConfig, setSortConfig] = useState<{
        key: "appName" | "productivity" | null;
        direction: "asc" | "desc";
    }>({
        key: null,
        direction: "asc",
    });
    const [search, setSearch] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("all");
    const [showNewAppModal, setShowNewAppModal] = useState(false);
    const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState({
        x: 0,
        y: 0,
    });
    const [editingApp, setEditingApp] = useState<any>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deletingApp, setDeletingApp] = useState<any>(null);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);

    const fetchStats = async () => {
        try {
            const { data } = await API.get("/app-classifications/stats");

            setStats(data);
        } catch (err: any) {
            console.error("PRODUCTIVITY STATS FETCH ERROR:", err);

            toast.error(
                err.response?.data?.message ||
                "Failed to load productivity statistics."
            );
        }
    };

    const fetchApplications = async () => {
        try {
            setLoading(true);

            const { data } = await API.get("/app-classifications", {
                params: {
                    page,
                    limit,
                    search,
                    category: selectedCategory,
                }
            });

            setApplications(data.applications);
            setSelectedIds([]);
            setTotal(data.pagination.total);
            setTotalPages(data.pagination.totalPages);
        } catch (err: any) {
            console.error("APPLICATION CONFIGURATION FETCH ERROR:", err);

            toast.error(
                err.response?.data?.message ||
                "Failed to load application configurations."
            );
        } finally {
            setLoading(false);
        }
    };

    const sortedApplications = useMemo(() => {
        if (!sortConfig.key) return applications;
        const field = sortConfig.key;
        const factor = sortConfig.direction === "asc" ? 1 : -1;
        return [...applications].sort((a, b) =>
            String(a?.[field] || "").localeCompare(String(b?.[field] || "")) * factor
        );
    }, [applications, sortConfig]);

    const handleToggleSort = (key: "appName" | "productivity") => {
        setSortConfig((prev) => ({
            key,
            direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
        }));
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0 || bulkDeleting) return;
        try {
            setBulkDeleting(true);
            await Promise.all(
                selectedIds.map((id) => API.delete(`/app-classifications/${id}`))
            );
            toast.success(
                `Deleted ${selectedIds.length} app configuration${selectedIds.length === 1 ? "" : "s"}.`
            );
            setSelectedIds([]);
            await fetchApplications();
            await fetchStats();
        } catch (err: any) {
            toast.error(
                err?.response?.data?.message ||
                "Failed to delete selected app configurations."
            );
        } finally {
            setBulkDeleting(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, []);

    useEffect(() => {
        fetchApplications();
    }, [page, limit, search, selectedCategory]);


    useEffect(() => {
        const handleClickOutside = () => {
            setOpenActionMenu(null);
        };

        window.addEventListener("click", handleClickOutside);

        return () => {
            window.removeEventListener("click", handleClickOutside);
        };
    }, []);

    const handleDelete = async () => {
        if (!deletingApp) return;

        try {
            await API.delete(
                `/app-classifications/${deletingApp._id}`
            );

            toast.success("App configuration deleted successfully.");

            setShowDeleteModal(false);
            setDeletingApp(null);

            await fetchApplications();
            await fetchStats();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                "Failed to delete app configuration."
            );
        }
    };

    if (loading) {
        return (
            <div className='py-10 flex-1'>
                <div className='mx-auto w-full max-w-[1700px] px-4 sm:px-6 lg:px-8'>
                    <SettingsLoading />
                </div>
            </div>
        );
    }

    return (
        <>
            <div className='py-10 flex-1'>
                <div className='mx-auto w-full max-w-[1700px] px-4 sm:px-6 lg:px-8'>
                    <div className='min-h-[calc(100vh-250px)] px-2 sm:px-4 my-2 py-4 rounded-lg bg-white dark:bg-[#0F172A] border border-gray-200 dark:border-[#22324D] shadow-sm'>
                        <div className='max-w-7xl mx-auto p-6'>
                            <div>
                                <div className='mb-6'>
                                    <div className='flex items-center justify-between mb-2'>
                                        <div>
                                            <h1 className='text-2xl font-semibold text-gray-900 dark:text-white'>App Tracking Configuration</h1>
                                            <p className='text-sm text-gray-600 dark:text-gray-400 mt-1'>Manage how applications are tracked and categorized</p>
                                        </div>
                                        <div className='flex gap-2'>
                                            <button
                                                type='button'
                                                onClick={() =>
                                                    setShowNewAppModal(true)
                                                }
                                                className='inline-flex items-center justify-center rounded bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 text-sm font-semibold cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2'>
                                                <Plus className='w-4 h-4' />
                                                <span className='ml-2'> Add Application </span>
                                            </button>
                                        </div>
                                    </div>
                                    <div className='flex gap-4 mt-4 text-sm text-gray-600 dark:text-gray-400'>
                                        <span>
                                            <span className='font-medium text-gray-900 dark:text-white'>
                                                {stats.productive}{" "}
                                            </span>
                                            Productive
                                        </span>
                                        <span className='text-gray-400'>•</span>
                                        <span>
                                            <span className='font-medium text-gray-900 dark:text-white'>
                                                {stats.neutral}{" "}
                                            </span>
                                            Neutral
                                        </span>
                                        <span className='font-medium text-gray-900 dark:text-white'>•</span>
                                        <span>
                                            <span className='font-medium text-gray-900 dark:text-white'>
                                                {stats.unproductive}{" "}
                                            </span>
                                            Unproductive
                                        </span>
                                        <span className='font-medium text-gray-900 dark:text-white'>•</span>
                                        <span>
                                            <span className='font-medium text-gray-900 dark:text-white'>
                                                {stats.blacklisted}{" "}
                                            </span>
                                            Blacklisted
                                        </span>
                                        <span className='font-medium text-gray-900 dark:text-white'>•</span>
                                        <span>
                                            <span className='font-medium text-gray-900 dark:text-white'>
                                                {stats.total}{" "}
                                            </span>
                                            Total
                                        </span>
                                    </div>
                                </div>

                                <div className='bg-white dark:bg-[#0F172A] rounded-lg shadow-sm border border-gray-200 dark:border-[#22324D] mb-4'>
                                    <div className='p-4 border-b border-gray-200 dark:border-gray-800'>
                                        <div className='flex items-center justify-between gap-4'>
                                            <div className='flex gap-1 bg-gray-100 dark:bg-slate-800 rounded-lg p-1'>
                                                <button
                                                    onClick={() => {
                                                        setSelectedCategory("all");
                                                        setPage(1);
                                                    }}
                                                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${selectedCategory === "all"
                                                        ? "bg-white dark:bg-[#1E293B] text-gray-900 dark:text-white shadow-sm"
                                                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                                                        }`}
                                                >
                                                    All Apps
                                                    <span className="text-gray-400"> ({stats.total}) </span>
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setSelectedCategory("productive");
                                                        setPage(1);
                                                    }}
                                                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${selectedCategory === "productive"
                                                        ? "bg-white dark:bg-[#1E293B] text-gray-900 dark:text-white shadow-sm"
                                                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                                                        }`}
                                                >
                                                    Productive
                                                    <span className="text-gray-400"> ({stats.productive}) </span>
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setSelectedCategory("neutral");
                                                        setPage(1);
                                                    }}
                                                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${selectedCategory === "neutral"
                                                        ? "bg-white dark:bg-[#1E293B] text-gray-900 dark:text-white shadow-sm"
                                                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                                                        }`}
                                                >
                                                    Neutral
                                                    <span className="text-gray-400"> ({stats.neutral}) </span>
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setSelectedCategory("unproductive");
                                                        setPage(1);
                                                    }}
                                                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${selectedCategory === "unproductive"
                                                        ? "bg-white dark:bg-[#1E293B] text-gray-900 dark:text-white shadow-sm"
                                                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                                                        }`}
                                                >
                                                    Unproductive
                                                    <span className="text-gray-400"> ({stats.unproductive}) </span>
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setSelectedCategory("blacklisted");
                                                        setPage(1);
                                                    }}
                                                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${selectedCategory === "blacklisted"
                                                        ? "bg-white dark:bg-[#1E293B] text-gray-900 dark:text-white shadow-sm"
                                                        : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                                                        }`}
                                                >
                                                    Blacklisted
                                                    <span className="text-gray-400"> ({stats.blacklisted}) </span>
                                                </button>
                                            </div>

                                            <div className='relative w-80'>
                                                <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400' />
                                                <input
                                                    type="text"
                                                    placeholder="Search applications..."
                                                    value={search}
                                                    onChange={(e) => {
                                                        setSearch(e.target.value);
                                                        setPage(1);
                                                    }}
                                                    className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent"
                                                />
                                            </div>
                                        </div>

                                        {selectedIds.length > 0 && (
                                            <div className='mt-3 flex items-center justify-between rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/70 dark:bg-indigo-950/30 px-4 py-2 text-sm'>
                                                <span className='font-medium text-indigo-900 dark:text-indigo-200'>
                                                    {selectedIds.length} application{selectedIds.length === 1 ? "" : "s"} selected
                                                </span>
                                                <button
                                                    type='button'
                                                    disabled={bulkDeleting}
                                                    onClick={handleBulkDelete}
                                                    className='inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer'
                                                >
                                                    <Trash2 className='h-3.5 w-3.5' />
                                                    {bulkDeleting ? "Deleting..." : "Delete Selected"}
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className='overflow-x-auto'>
                                        <table className='w-full'>
                                            <thead className='bg-gray-50 dark:bg-[#1E293B] border-b border-gray-200 dark:border-gray-800'>
                                                <tr>
                                                    <th className='w-12 px-4 py-3'>
                                                        <input
                                                            type="checkbox"
                                                            checked={
                                                                sortedApplications.length > 0 &&
                                                                sortedApplications.every((app: any) =>
                                                                    selectedIds.includes(app._id)
                                                                )
                                                            }
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setSelectedIds(
                                                                        sortedApplications.map((app: any) => app._id)
                                                                    );
                                                                } else {
                                                                    setSelectedIds([]);
                                                                }
                                                            }}
                                                            className='w-4 h-4 rounded border-gray-200 text-indigo-600 focus:ring-indigo-500 cursor-pointer'
                                                        />
                                                    </th>
                                                    <th className='px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider'>
                                                        <button
                                                            type='button'
                                                            onClick={() => handleToggleSort("appName")}
                                                            className='inline-flex items-center gap-1 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors'
                                                        >
                                                            Application
                                                            <ArrowUpDown className='w-3.5 h-3.5 text-gray-400' />
                                                        </button>
                                                    </th>

                                                    <th className='px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider'>
                                                        <button
                                                            type='button'
                                                            onClick={() => handleToggleSort("productivity")}
                                                            className='inline-flex items-center gap-1 cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors'
                                                        >
                                                            Status
                                                            <ArrowUpDown className='w-3.5 h-3.5 text-gray-400' />
                                                        </button>
                                                    </th>

                                                    <th className='px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider'> Exclusions </th>
                                                    <th className='w-20 px-4 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider'> Actions </th>
                                                </tr>
                                            </thead>

                                            <tbody className="bg-white dark:bg-[#0F172A] divide-y divide-gray-200 dark:divide-gray-800">
                                                {sortedApplications.length > 0 ? (
                                                    sortedApplications.map((app: any, index: number) => (
                                                        <tr
                                                            key={app._id}
                                                            className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                                                        >
                                                            <td className="px-4 py-4">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedIds.includes(app._id)}
                                                                    onChange={(e) => {
                                                                        if (e.target.checked) {
                                                                            setSelectedIds((prev) =>
                                                                                prev.includes(app._id)
                                                                                    ? prev
                                                                                    : [...prev, app._id]
                                                                            );
                                                                        } else {
                                                                            setSelectedIds((prev) =>
                                                                                prev.filter((id) => id !== app._id)
                                                                            );
                                                                        }
                                                                    }}
                                                                    className="w-4 h-4 rounded border-gray-200 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                                />
                                                            </td>

                                                            <td className="px-4 py-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-slate-800 rounded-lg">
                                                                        <img
                                                                            src={`https://api.workcomposer.com/file/appicon?app=${encodeURIComponent(app.appName)}`}
                                                                            alt={app.appName}
                                                                            className="h-5 w-5 rounded"
                                                                        />
                                                                    </div>

                                                                    <div>
                                                                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                                                                            {app.appName}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <span
                                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border
        ${app.productivity === "productive"
                                                                            ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800"
                                                                            : app.productivity === "unproductive"
                                                                                ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800"
                                                                                : "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800"
                                                                        }`}
                                                                >
                                                                    <span
                                                                        className={`w-1.5 h-1.5 rounded-full
            ${app.productivity === "productive"
                                                                                ? "bg-green-500"
                                                                                : app.productivity === "unproductive"
                                                                                    ? "bg-red-500"
                                                                                    : "bg-yellow-500"
                                                                            }`}
                                                                    ></span>

                                                                    {app.productivity.charAt(0).toUpperCase() +
                                                                        app.productivity.slice(1)}
                                                                </span>
                                                            </td>

                                                            <td className="px-4 py-4">
                                                                {(() => {
                                                                    const teamCount = app.excludedTeams?.length || 0;
                                                                    const userCount = app.excludedUsers?.length || 0;

                                                                    if (teamCount === 0 && userCount === 0) {
                                                                        return (
                                                                            <span className="text-sm text-gray-500 dark:text-gray-400">
                                                                                None
                                                                            </span>
                                                                        );
                                                                    }

                                                                    const parts = [];

                                                                    if (teamCount > 0) {
                                                                        parts.push(
                                                                            `${teamCount} team${teamCount > 1 ? "s" : ""}`
                                                                        );
                                                                    }

                                                                    if (userCount > 0) {
                                                                        parts.push(
                                                                            `${userCount} user${userCount > 1 ? "s" : ""}`
                                                                        );
                                                                    }

                                                                    return (
                                                                        <span className="text-sm text-gray-900 dark:text-white">
                                                                            {parts.join(", ")}
                                                                        </span>
                                                                    );
                                                                })()}
                                                            </td>

                                                            <td className="relative px-4 py-4 text-right">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();

                                                                        if (openActionMenu === app._id) {
                                                                            setOpenActionMenu(null);
                                                                            return;
                                                                        }

                                                                        const rect = e.currentTarget.getBoundingClientRect();

                                                                        const menuHeight = 96;
                                                                        const spaceBelow = window.innerHeight - rect.bottom;

                                                                        setMenuPosition({
                                                                            x: rect.right,
                                                                            y: spaceBelow < menuHeight ? rect.top - menuHeight - 8 : rect.bottom + 8,
                                                                        });

                                                                        setOpenActionMenu(app._id);
                                                                    }}
                                                                    className="rounded-md p-2 hover:bg-gray-100 dark:hover:bg-slate-800 transition"
                                                                >
                                                                    <MoreVertical className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                                                </button>

                                                                {openActionMenu === app._id &&
                                                                    createPortal(
                                                                        <div
                                                                            className="fixed w-36 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1E293B] shadow-lg z-[9999]"
                                                                            style={{
                                                                                left: menuPosition.x - 144,
                                                                                top: menuPosition.y,
                                                                            }}
                                                                        >
                                                                            <button
                                                                                onClick={() => {
                                                                                    setEditingApp(app);
                                                                                    setOpenActionMenu(null);
                                                                                    setShowNewAppModal(true);
                                                                                }}
                                                                                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800"
                                                                            >
                                                                                <Pencil className="h-4 w-4" />
                                                                                Edit
                                                                            </button>

                                                                            <button
                                                                                onClick={() => {
                                                                                    setDeletingApp(app);
                                                                                    setOpenActionMenu(null);
                                                                                    setShowDeleteModal(true);
                                                                                }}
                                                                                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                                                                            >
                                                                                <Trash2 className="h-4 w-4" />
                                                                                Delete
                                                                            </button>
                                                                        </div>,
                                                                        document.body
                                                                    )}
                                                            </td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    <tr>
                                                        <td
                                                            colSpan={5}
                                                            className="py-20 text-center"
                                                        >
                                                            <div className="flex flex-col items-center">
                                                                <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                                                                    📱
                                                                </div>

                                                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                                                    No applications found
                                                                </h3>

                                                                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                                                                    Try adjusting your search or filter criteria.
                                                                </p>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>


                                    <div className='px-4 py-3 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between'>
                                        <div className='flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400'>
                                            <span>Rows per page:</span>
                                            <select
                                                value={limit}
                                                onChange={(e) => {
                                                    setLimit(Number(e.target.value));
                                                    setPage(1);
                                                }}
                                                className="px-2 py-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-md text-sm cursor-pointer"
                                            >
                                                <option value={10}>10</option>
                                                <option value={25}>25</option>
                                                <option value={50}>50</option>
                                            </select>
                                        </div>
                                        <div className='flex items-center gap-4'>
                                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                                {total === 0
                                                    ? "0 of 0"
                                                    : `${(page - 1) * limit + 1}-${Math.min(page * limit, total)} of ${total}`}
                                            </span>
                                            <div className='flex gap-1'>
                                                <button
                                                    disabled={page === 1}
                                                    onClick={() => setPage((p) => p - 1)}
                                                    className="p-2 rounded hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                                >
                                                    <ChevronLeft className="w-4 h-4" />
                                                </button>
                                                <button className="min-w-[32px] h-8 px-2 rounded text-sm bg-indigo-600 text-white">
                                                    {page}
                                                </button>
                                                <button
                                                    disabled={page >= totalPages}
                                                    onClick={() => setPage((p) => p + 1)}
                                                    className="p-2 rounded hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                                >
                                                    <ChevronRight className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <NewAppConfigurationModal
                open={showNewAppModal}
                editingApp={editingApp}
                onClose={() => {
                    setShowNewAppModal(false);
                    setEditingApp(null);
                }}
                onSuccess={async () => {
                    await fetchApplications();
                    await fetchStats();
                }}
            />

            <DeleteAppConfigurationModal
                open={showDeleteModal}
                app={deletingApp}
                onClose={() => {
                    setShowDeleteModal(false);
                    setDeletingApp(null);
                }}
                onDelete={handleDelete}
            />
        </>
    )
}

export default ProductivityPage
