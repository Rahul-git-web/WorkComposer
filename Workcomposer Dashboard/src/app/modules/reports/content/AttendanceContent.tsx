"use client";

import { useEffect, useState } from "react";
import API from "@/api";
import AttendanceCard from "@/app/dashboard/time-tracking/attendance/AttendanceCard";
import type { ReportContentProps } from "../types";
import { formatDateForApi } from "@/utils/appTimezone";
import { useAppTimezone } from "@/hooks/useAppTimezone";

export default function AttendanceContent({
    reportRange,
    selectedTeams,
    selectedUsers,
    sortBy,
    order,
    refreshKey,
    isRefreshing,
    timezone: propTimezone,
}: ReportContentProps & {
    refreshKey?: number;
    isRefreshing?: boolean;
    timezone?: string;
}) {
    const defaultTimezone = useAppTimezone();
    const timezone = propTimezone || defaultTimezone;

    const [users, setUsers] = useState<any[]>([]);
    const [allUsers, setAllUsers] = useState<any[]>([]);

    useEffect(() => {
        let mounted = true;
        API.get("/users/all-users", {
            params: {
                page: 1,
                limit: 1000,
            },
        })
            .then((res) => {
                if (!mounted) return;
                setAllUsers(
                    Array.isArray(res.data.users)
                        ? res.data.users
                        : Array.isArray(res.data)
                        ? res.data
                        : []
                );
            })
            .catch((error) => {
                console.error("ERROR FETCHING USERS:", error);
                if (mounted) setAllUsers([]);
            });
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        const fetchAttendance = async () => {
            try {
                const startDate = formatDateForApi(reportRange.startDate, timezone);
                const endDate = formatDateForApi(reportRange.endDate, timezone);

                const userIds = (selectedUsers || [])
                    .map((u: any) => u?._id || u?.id)
                    .filter(Boolean)
                    .join(",");

                const teamIds = (selectedTeams || [])
                    .map((team: any) =>
                        typeof team === "object" ? team?._id || team?.id : team
                    )
                    .filter(Boolean)
                    .join(",");

                const { data } = await API.get("/attendance", {
                    params: {
                        startDate,
                        endDate,
                        users: userIds,
                        teams: teamIds,
                        sortBy,
                        order,
                    },
                });

                setUsers(Array.isArray(data) ? data : []);
            } catch (error) {
                console.error("ATTENDANCE ERROR:", error);
                setUsers([]);
            }
        };

        fetchAttendance();
    }, [
        reportRange,
        selectedUsers,
        selectedTeams,
        sortBy,
        order,
        refreshKey,
        timezone,
    ]);

    return (
        <AttendanceCard
            users={users}
            allUsers={allUsers}
            reportRange={reportRange}
            selectedUsers={selectedUsers}
            selectedTeams={selectedTeams}
        />
    );
}