"use client";

import { useTimeTracking } from "@/context/TimeTrackingContext";
import ScreenshotsContent from "@/app/modules/reports/content/ScreenshotsContent";

export default function Page() {

    const {
        reportRange,
        selectedTeams,
        selectedUsers,
        sortBy,
        order,
        refreshKey,
        isRefreshing,
        timezone,
        users,
    } = useTimeTracking();

    return (
        <>
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
        </>
    );
}