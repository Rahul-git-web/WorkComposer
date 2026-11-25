"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import API from "@/api";
import socket from "@/socket/socket";

import OverviewContent from "@/app/dashboard/time-tracking/overview/OverviewContent";
import EditTime from "@/app/dashboard/time-tracking/overview/EditTime";
import RemoveTime from "@/app/dashboard/time-tracking/overview/RemoveTime";
import { formatDateForApi } from "@/utils/appTimezone";
import { useTimeTracking } from "@/context/TimeTrackingContext";
import { useOptionalTimer } from "@/context/TimerContext";
import { useDashboard } from "@/context/DashboardContext";
import { isTeamReportAccess } from "@/utils/reportAccess";

import type { ReportContentProps } from "../types";

export default function OverviewContentModule({
    reportRange,
    selectedTeams,
    selectedUsers,
    sortBy,
    order,
    refreshKey,
    isRefreshing,
}: ReportContentProps & {
    refreshKey: number;
    isRefreshing: boolean;
}) {

    const { timezone } = useTimeTracking();
    const timerContext = useOptionalTimer();
    const isTracking = timerContext?.isTracking ?? false;
    const { user } = useDashboard();
    const isTeamReport = isTeamReportAccess(user);

    const [data, setData] = useState<any[]>([]);
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [productivityMap, setProductivityMap] = useState<Record<string, number>>({});
    const [activityMap, setActivityMap] = useState<Record<string, number>>({});
    const [activityDeltaMap, setActivityDeltaMap] = useState<Record<string, number | null>>({});
    const [activityTrendMap, setActivityTrendMap] = useState<Record<string, any[]>>({});

    const [showModal, setShowModal] = useState(false);

    const [showRemoveModal, setShowRemoveModal] = useState(false);
    const [isOverviewLoading, setIsOverviewLoading] = useState(true);
    const [refresh, setRefresh] = useState(0);

    const inFlightRef = useRef(false);
    const fetchRequestIdRef = useRef(0);

    const formattedDate = formatDateForApi(
        reportRange.startDate,
        timezone
    );

    const startDate = formatDateForApi(
        reportRange.startDate,
        timezone
    );

    const endDate = formatDateForApi(
        reportRange.endDate,
        timezone
    );

    const fetchAllUsers = async (signal?: AbortSignal) => {
        try {
            const { data } = await API.get("/users/all-users", {
                params: {
                    page: 1,
                    limit: 1000,
                },
                ...(signal ? { signal } : {}),
            });

            const users = Array.isArray(data?.users)
                ? data.users
                : Array.isArray(data)
                    ? data
                    : [];



            setAllUsers(users);

        } catch (err: any) {
            if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") {
                return;
            }
            if (err?.response?.status === 403) {
                // Expected for managers/roles without manage_users permission
                setAllUsers([]);
            } else if (
                err?.code === "ECONNABORTED" ||
                err?.code === "ETIMEDOUT" ||
                err?.message?.toLowerCase().includes("timeout")
            ) {
                console.warn("Overview users request timed out:", err?.message);
                setAllUsers([]);
            } else {
                console.error("FAILED TO FETCH USERS:", err);
                setAllUsers([]);
            }
        }
    };

    useEffect(() => {
        const controller = new AbortController();
        fetchAllUsers(controller.signal);
        return () => controller.abort();
    }, []);

    const fetchOverview = useCallback(
        async (isBackground = false) => {
            if (inFlightRef.current && isBackground) {
                return;
            }
            const requestId = ++fetchRequestIdRef.current;
            inFlightRef.current = true;

            if (!isBackground) {
                setIsOverviewLoading(true);
            }

            try {
                const [overviewResult, prodResult] = await Promise.allSettled([
                    API.get("/sessions/overview", {
                        params: { startDate, endDate, timezone },
                    }),
                    API.get(`/reports/productivity?startDate=${startDate}&endDate=${endDate}`)
                ]);

                if (requestId !== fetchRequestIdRef.current) {
                    return;
                }

                const res = overviewResult.status === "fulfilled" ? overviewResult.value : { data: [] };

                // Map productivity by user ID
                const newProdMap: Record<string, number> = {};
                if (prodResult.status === "fulfilled" && Array.isArray(prodResult.value?.data)) {
                    for (const u of prodResult.value.data) {
                        const uid = String(u._id || u.id);
                        if (typeof u.productivePercent === "number") {
                            newProdMap[uid] = u.productivePercent;
                        }
                    }
                }
                setProductivityMap(newProdMap);

                let overviewData = Array.isArray(res.data)
                    ? res.data
                    : [];

                // TEAM FILTER
                if (selectedTeams.length > 0) {
                    const selectedTeamIds = selectedTeams.map((team: any) =>
                        String(typeof team === "object" ? (team._id || team.id) : team)
                    );

                    overviewData = overviewData.filter((item: any) => {
                        const itemTeamId =
                            typeof item.team === "object"
                                ? (item.team?._id || item.team?.id)
                                : item.team;

                        return selectedTeamIds.includes(String(itemTeamId));
                    });
                }

                // USER FILTER
                if (selectedUsers.length > 0) {
                    overviewData = overviewData.filter((item: any) =>
                        selectedUsers.some(
                            (user: any) =>
                                String(user._id || user.id) === String(item.id || item._id)
                        )
                    );
                }

                // SORT
                overviewData.sort((a: any, b: any) => {
                    let valueA: any;
                    let valueB: any;

                    switch (sortBy) {
                        case "team":
                            valueA =
                                typeof a.team === "object"
                                    ? a.team?.name
                                    : a.team;

                            valueB =
                                typeof b.team === "object"
                                    ? b.team?.name
                                    : b.team;
                            break;

                        case "trackingStatus":
                            valueA = a.status || "";
                            valueB = b.status || "";
                            break;

                        case "externalId":
                            valueA = a.externalId || "";
                            valueB = b.externalId || "";
                            break;

                        case "name":
                        default:
                            valueA = a.name || "";
                            valueB = b.name || "";
                            break;
                    }

                    valueA = String(valueA).toLowerCase();
                    valueB = String(valueB).toLowerCase();

                    const comparison = valueA.localeCompare(valueB);

                    return order === "desc"
                        ? -comparison
                        : comparison;
                });

                const newActivityMap: Record<string, number> = {};
                const newActivityDeltaMap: Record<string, number | null> = {};
                const newActivityTrendMap: Record<string, any[]> = {};

                const formattedData = overviewData.map(
                    (item: any) => {
                        const uid = String(item.id);
                        if (typeof item.activityScore === "number") {
                            newActivityMap[uid] = item.activityScore;
                        }
                        if (typeof item.activityDelta === "number" || item.activityDelta === null) {
                            newActivityDeltaMap[uid] = item.activityDelta;
                        }
                        if (Array.isArray(item.activityBuckets)) {
                            newActivityTrendMap[uid] = item.activityBuckets;
                        }

                        return {
                            id: item.id,
                            name: item.name,
                            avatar: item.avatar,
                            team: item.team,
                            date: formattedDate,
                            workTime: item.workTime,
                            breakTime: item.breakTime,
                            status: item.status,
                            lastSync: item.lastSync,
                            lastSyncAt: item.lastSyncAt ?? null,
                            isOnline: Boolean(item.isOnline),
                            activityScore: typeof item.activityScore === "number" ? item.activityScore : null,
                            activityDelta: typeof item.activityDelta === "number" ? item.activityDelta : null,
                            activityBuckets: Array.isArray(item.activityBuckets) ? item.activityBuckets : [],
                            externalId: item.externalId,
                        };
                    }
                );

                setData(formattedData);
                setActivityMap(newActivityMap);
                setActivityDeltaMap(newActivityDeltaMap);
                setActivityTrendMap(newActivityTrendMap);

            } catch (err) {
                if (requestId === fetchRequestIdRef.current) {
                    console.error("FAILED TO FETCH OVERVIEW:", err);
                    if (!isBackground) {
                        setData([]);
                    }
                }
            } finally {
                if (requestId === fetchRequestIdRef.current) {
                    inFlightRef.current = false;
                    if (!isBackground) {
                        setIsOverviewLoading(false);
                    }
                }
            }
        },
        [startDate, endDate, timezone, selectedTeams, selectedUsers, sortBy, order, formattedDate, isTeamReport]
    );

    useEffect(() => {
        fetchOverview(false);
    }, [
        fetchOverview,
        refresh,
        refreshKey,
        timezone,
    ]);

    useEffect(() => {
        const handleInvalidate = () => {
            fetchOverview(true);
        };

        socket.on("connect", () => {
            console.info("Frontend connected:", socket.id);
        });
        socket.on("timerStarted", handleInvalidate);
        socket.on("timerStopped", handleInvalidate);
        socket.on("tracking:started", handleInvalidate);
        socket.on("tracking:stopped", handleInvalidate);
        socket.on("session:updated", handleInvalidate);

        return () => {
            socket.off("connect");
            socket.off("timerStarted", handleInvalidate);
            socket.off("timerStopped", handleInvalidate);
            socket.off("tracking:started", handleInvalidate);
            socket.off("tracking:stopped", handleInvalidate);
            socket.off("session:updated", handleInvalidate);
        };
    }, [fetchOverview]);

    const hasActiveTracking =
        isTracking ||
        data.some((item) => item.status?.toLowerCase().includes("running"));

    useEffect(() => {
        if (!hasActiveTracking) return;

        const intervalId = setInterval(() => {
            fetchOverview(true);
        }, 60000);

        return () => {
            clearInterval(intervalId);
        };
    }, [hasActiveTracking, fetchOverview]);

    return (
        <>
            {isRefreshing ? (
                <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-gray-200 bg-white">
                    <div className="flex flex-col items-center justify-center">
                        {/* Spinner */}
                        <div className="relative h-12 w-12">
                            <div className="absolute inset-0 rounded-full border-4 border-gray-100" />

                            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-indigo-600 border-r-indigo-400" />

                            <div className="absolute inset-2 rounded-full bg-white" />

                            <div className="absolute inset-[14px] rounded-full bg-indigo-600 animate-pulse" />
                        </div>

                        <p className="mt-4 text-sm font-semibold text-gray-700">
                            Fetching content...
                        </p>

                        <p className="mt-1 text-xs text-gray-400">
                            Please wait while we update the overview
                        </p>
                    </div>
                </div>
            ) : (

                <OverviewContent
                    data={data}
                    loading={isOverviewLoading}
                    allUsers={allUsers}
                    productivityMap={productivityMap}
                    activityMap={activityMap}
                    activityDeltaMap={activityDeltaMap}
                    activityTrendMap={activityTrendMap}
                    reportRange={reportRange}
                    onAddManualTime={() => setShowModal(true)}
                    onRemoveTime={() => setShowRemoveModal(true)}
                />
            )}

            {showModal && (
                <EditTime
                    onClose={() => setShowModal(false)}
                    onSave={() => {
                        setShowModal(false);
                        setRefresh((prev) => prev + 1);
                    }}
                />
            )}

            {showRemoveModal && (
                <RemoveTime
                    onClose={() => setShowRemoveModal(false)}
                    onDelete={() => {
                        setShowRemoveModal(false);
                        setRefresh((prev) => prev + 1);
                    }}
                />
            )}
        </>
    );
}