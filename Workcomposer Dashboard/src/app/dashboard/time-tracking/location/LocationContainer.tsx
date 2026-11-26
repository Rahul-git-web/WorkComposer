"use client";

import { useEffect, useState } from "react";
import API from "@/api";
import LiveMap from "./LiveMap";
import { formatDateForApi } from "@/utils/appTimezone";
import { useTimeTracking } from "@/context/TimeTrackingContext";

function buildLocationsSignature(list: any[]): string {
    if (!Array.isArray(list) || list.length === 0) return "";
    return list
        .map((loc) =>
            [
                loc?._id || "",
                loc?.user?._id || loc?.user?.id || "",
                loc?.latitude ?? "",
                loc?.longitude ?? "",
                loc?.accuracy ?? "",
                loc?.trackedAt ?? "",
                loc?.address ?? "",
                loc?.city ?? "",
                loc?.state ?? "",
                loc?.country ?? "",
                loc?.postalCode ?? "",
                loc?.ipAddress ?? "",
                loc?.serviceProvider ?? "",
                loc?.user?.avatar ?? "",
            ].join("|")
        )
        .join(";");
}

type Props = {
    reportRange?: {
        startDate: Date;
        endDate: Date;
    };
    selectedTeams?: string[];
    selectedUsers?: any[];
    sortBy?: string;
    order?: string;
    refreshKey?: number;
    isRefreshing?: boolean;
};

export default function LocationContainer({
    reportRange,
    selectedTeams = [],
    selectedUsers = [],
    sortBy = "name",
    order = "asc",
    refreshKey = 0,
    isRefreshing = false,
}: Props) {

    const { timezone } = useTimeTracking();

    const [locations, setLocations] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let active = true;

        const fetchLocations = async (showSpinner: boolean) => {
            try {
                if (showSpinner) {
                    setLoading(true);
                }
                const startDate = formatDateForApi(
                    reportRange?.startDate || new Date(),
                    timezone
                );

                const endDate = formatDateForApi(
                    reportRange?.endDate || new Date(),
                    timezone
                );

                const { data } = await API.get("/locations", {
                    params: {
                        startDate,
                        endDate,
                        teams: selectedTeams.join(","),
                        users: selectedUsers
                            .map((u: any) => u?._id || u?.id)
                            .filter(Boolean)
                            .join(","),
                        sortBy,
                        order,
                    },
                });

                if (!active) return;

                const nextList = Array.isArray(data) ? data : [];
                const nextSig = buildLocationsSignature(nextList);

                setLocations((prev) =>
                    buildLocationsSignature(prev) === nextSig ? prev : nextList
                );
            } catch (err) {
                console.error(err);
            } finally {
                if (active && showSpinner) {
                    setLoading(false);
                }
            }
        };

        fetchLocations(true);

        const interval = setInterval(() => {
            fetchLocations(false);
        }, 5000);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [
        reportRange,
        selectedTeams,
        selectedUsers,
        sortBy,
        order,
        refreshKey,
        timezone,
    ]);

    return (
        <div className="relative h-full">
            <LiveMap
                locations={locations}
                reportRange={reportRange}
                timezone={timezone}
            />

            {(loading && isRefreshing) && (
                <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-white/70 dark:bg-slate-900/75 backdrop-blur-[2px]">
                    <div className="flex flex-col items-center justify-center">
                        <div className="relative h-12 w-12">
                            <div className="absolute inset-0 rounded-full border-4 border-gray-100 dark:border-slate-800" />

                            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-indigo-600 border-r-indigo-400" />

                            <div className="absolute inset-2 rounded-full bg-white dark:bg-slate-900" />

                            <div className="absolute inset-[14px] animate-pulse rounded-full bg-indigo-600" />
                        </div>

                        <p className="mt-4 text-sm font-semibold text-gray-700 dark:text-slate-200">
                            Fetching content...
                        </p>

                        <p className="mt-1 text-xs text-gray-400 dark:text-slate-400">
                            Please wait while we update the locations
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}