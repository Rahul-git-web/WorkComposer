"use client";

import { useState } from "react";
import ReportsSidebar from "./ReportsSidebar";
import OverviewHeader from "@/app/dashboard/time-tracking/overview/OverviewHeader";
import API from "@/api";
import { useEffect } from "react";
// import AttendanceModule from "@/app/modules/attendance/AttendanceModule";
import AttendanceContent from "./content/AttendanceContent";
import TeamReportContent from "./content/OverviewContentModule";
import ProductivityContent from "./content/ProductivityContent";
import ScreenshotsContent from "@/app/modules/reports/content/ScreenshotsContent";
import UsageContent from "./content/UsageContent";
import OverviewContentModule from "./content/OverviewContentModule";
import HomeContentModule from "./content/HomeContentModule";
import ProjectTrackingContent from "./content/ProjectTrackingContent";
import LocationContent from "./content/LocationContent";
import { useDesktop } from "@/context/DesktopContext";
import TimeTrackingContext from "@/context/TimeTrackingContext";
import { getAppTimezone } from "@/utils/appTimezone";
import { useDashboard } from "@/context/DashboardContext";



export default function ReportsModule() {

    const {
        activeReport,
        setActiveReport,
    } = useDesktop();

    const { user } = useDashboard();

    const timezone = getAppTimezone(
        user?.reportTimezone
    );

    const [date, setDate] = useState(new Date());

    const [selectedTeams, setSelectedTeams] = useState<any[]>([]);

    const [selectedUsers, setSelectedUsers] = useState<any[]>([]);

    const [sortBy, setSortBy] = useState("name");

    const [order, setOrder] = useState("asc");

    const [users, setUsers] = useState<any[]>([]);
    const [refreshKey, setRefreshKey] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        setIsRefreshing(true);

        setRefreshKey((prev) => prev + 1);

        // Give all report components time to refetch.
        setTimeout(() => {
            setIsRefreshing(false);
        }, 800);
    };

    const [reportRange, setReportRange] = useState({
        type: "Day",
        startDate: new Date(),
        endDate: new Date(),
    });

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const { data } = await API.get("/users");

                setUsers(Array.isArray(data) ? data : []);
            } catch (err: any) {
                if (err?.response?.status === 403 && user) {
                    // For employees (role: "user"), /api/users is restricted by RBAC.
                    // Authorized scope for employee is self.
                    setUsers([user]);
                } else {
                    console.error("Failed to fetch users in ReportsModule:", err);
                    setUsers([]);
                }
            }
        };

        fetchUsers();
    }, [user]);

    const teams = Array.from(
        new Map(
            users
                .filter((user: any) => user.team)
                .map((user: any) => [user.team._id || user.team.id, user.team])
        ).values()
    );

    const reportComponents = {
        home: (
            <HomeContentModule />
        ),

        overview: (
            <OverviewContentModule
                reportRange={reportRange}
                selectedTeams={selectedTeams}
                selectedUsers={selectedUsers}
                sortBy={sortBy}
                order={order}
                refreshKey={refreshKey}
                isRefreshing={isRefreshing}
            />
        ),

        attendance: (
            <AttendanceContent
                reportRange={reportRange}
                selectedTeams={selectedTeams}
                selectedUsers={selectedUsers}
                sortBy={sortBy}
                order={order}
                refreshKey={refreshKey}
                isRefreshing={isRefreshing}
                timezone={timezone}
            />
        ),

        screenshots: (
            <ScreenshotsContent
                reportRange={reportRange}
                selectedTeams={selectedTeams}
                selectedUsers={selectedUsers}
                sortBy={sortBy}
                order={order}
                refreshKey={refreshKey}
                isRefreshing={isRefreshing}
                timezone={timezone}
                users={users}
            />
        ),

        usage: (
            <UsageContent
                reportRange={reportRange}
                selectedTeams={selectedTeams}
                selectedUsers={selectedUsers}
                sortBy={sortBy}
                order={order}
                refreshKey={refreshKey}
                isRefreshing={isRefreshing}
                timezone={timezone}
            />
        ),

        productivity: (
            <ProductivityContent
                reportRange={reportRange}
                selectedTeams={selectedTeams}
                selectedUsers={selectedUsers}
                sortBy={sortBy}
                order={order}
                refreshKey={refreshKey}
                isRefreshing={isRefreshing}
                timezone={timezone}
            />
        ),

        "project-tracking": (
            <ProjectTrackingContent
                reportRange={reportRange}
                selectedTeams={selectedTeams}
                selectedUsers={selectedUsers}
                sortBy={sortBy}
                order={order}
                refreshKey={refreshKey}
                isRefreshing={isRefreshing}
                timezone={timezone}
            />
        ),

        location: (
            <LocationContent
                reportRange={reportRange}
                selectedTeams={selectedTeams}
                selectedUsers={selectedUsers}
                sortBy={sortBy}
                order={order}
            />
        ),
    };

    return (
        <TimeTrackingContext.Provider
            value={{
                timezone,

                date,
                setDate,

                reportRange,
                setReportRange,

                selectedTeams,
                setSelectedTeams,

                selectedUsers,
                setSelectedUsers,

                users,

                sortBy,
                setSortBy,

                order,
                setOrder,
                refreshKey,
                isRefreshing,
                handleRefresh,
            }}
        >
            <div className="flex-1 flex flex-col min-h-0 h-full pt-4 xl:pt-3">

                <div className="flex-1 flex flex-col min-h-0">
                    {activeReport !== "home" && (
                        <div className="shrink-0">
                            <div className="px-4 sm:px-6 lg:px-8">
                                <OverviewHeader
                                    date={date}
                                    setDate={setDate}
                                    selectedTeams={selectedTeams}
                                    setSelectedTeams={setSelectedTeams}
                                    selectedUsers={selectedUsers}
                                    setSelectedUsers={setSelectedUsers}
                                    users={users}
                                    teams={teams}
                                    reportRange={reportRange}
                                    setReportRange={setReportRange}
                                    sortBy={sortBy}
                                    setSortBy={setSortBy}
                                    order={order}
                                    setOrder={setOrder}
                                    onRefresh={handleRefresh}
                                    isRefreshing={isRefreshing}
                                />
                            </div>
                        </div>
                    )}

                    <div
                        className="flex-1 overflow-y-auto min-h-0"
                        style={{ "--overview-header-height": "0px" } as React.CSSProperties}
                    >
                        {activeReport === "home" ? (
                            reportComponents[
                                activeReport as keyof typeof reportComponents
                            ]
                        ) : (
                            <div className="px-4 sm:px-6 lg:px-8 pb-6">
                                {reportComponents[
                                    activeReport as keyof typeof reportComponents
                                ]}
                            </div>
                        )}
                    </div>

                </div>

            </div>
        </TimeTrackingContext.Provider>
    );
}