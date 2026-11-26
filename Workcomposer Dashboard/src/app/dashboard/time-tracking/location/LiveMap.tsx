"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import API from "@/api";
import { Clock, MapPin, Navigation, X } from "lucide-react";
import {
    Circle,
    MapContainer,
    Marker,
    Popup,
    TileLayer,
    useMap,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { formatDateForApi, resolveSafeTimezone } from "@/utils/appTimezone";

type Coordinates = [number, number];

type AttendanceSummary = {
    workTime: string;
    breakTime: string;
};

const EMPTY_SUMMARY: AttendanceSummary = {
    workTime: "0h 0m",
    breakTime: "0h 0m",
};

const createAvatarIcon = (avatar: string) =>
    L.divIcon({
        html: `
            <div class="avatar-marker">
                <img src="${avatar}" />
            </div>
        `,
        className: "",
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -18],
    });

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;

L.Icon.Default.mergeOptions({
    iconRetinaUrl:
        "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
    iconUrl:
        "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
    shadowUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function FitBounds({ locations }: { locations: any[] }) {
    const map = useMap();
    const prevIdsRef = useRef<string>("");

    const idsKey = useMemo(
        () =>
            locations
                .map((location) => location?._id || location?.user?._id || "")
                .filter(Boolean)
                .sort()
                .join(","),
        [locations]
    );

    useEffect(() => {
        if (locations.length === 0) return;
        if (idsKey === prevIdsRef.current) return; // same users already fitted — don't fight the user's zoom/pan

        const bounds = L.latLngBounds(
            locations.map((location) => [location.latitude, location.longitude])
        );

        map.fitBounds(bounds, {
            padding: [60, 60],
            maxZoom: 17,
            animate: true,
        });

        prevIdsRef.current = idsKey;
    }, [idsKey, map, locations]);

    return null;
}

function formatLocationTimestamp(value: string | null | undefined, timezone: string): string {
    if (!value) {
        return "Not available";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return "Not available";
    }
    return new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).format(parsed);
}

function formatAccuracy(accuracy: unknown): string {
    if (accuracy === null || accuracy === undefined || accuracy === "") {
        return "Not available";
    }
    const num = Number(accuracy);
    if (Number.isNaN(num) || !Number.isFinite(num)) {
        return "Not available";
    }
    return `${Math.round(num)} m`;
}

type MarkerProps = {
    location: any;
    icon: L.DivIcon;
    summary: AttendanceSummary | undefined;
    isLoadingSummary: boolean;
    resolvedTimezone: string;
    popupMaxWidth: number;
    popupMinWidth: number;
    onSelectUser: (userId: string) => void;
    onCloseUser: (userId: string) => void;
};

const UserLocationMarker = memo(function UserLocationMarker({
    location,
    icon,
    summary,
    isLoadingSummary,
    resolvedTimezone,
    popupMaxWidth,
    popupMinWidth,
    onSelectUser,
    onCloseUser,
}: MarkerProps) {
    const map = useMap();
    const userId = String(location?.user?._id || location?.user?.id || "");
    const bodyScrollRef = useRef<HTMLDivElement>(null);
    const savedScrollTopRef = useRef(0);

    const position = useMemo<Coordinates>(
        () => [location.latitude, location.longitude],
        [location.latitude, location.longitude]
    );

    const eventHandlers = useMemo(
        () => ({
            click: () => {
                if (userId) {
                    onSelectUser(userId);
                }
            },
            popupclose: () => {
                savedScrollTopRef.current = 0;
                if (userId) {
                    onCloseUser(userId);
                }
            },
        }),
        [userId, onSelectUser, onCloseUser]
    );

    useLayoutEffect(() => {
        if (bodyScrollRef.current && savedScrollTopRef.current > 0) {
            bodyScrollRef.current.scrollTop = savedScrollTopRef.current;
        }
    });

    const displaySummary = summary || EMPTY_SUMMARY;

    return (
        <Marker
            position={position}
            icon={icon}
            eventHandlers={eventHandlers}
        >
            <Popup
                maxWidth={popupMaxWidth}
                minWidth={popupMinWidth}
                autoPan
                keepInView={false}
                closeButton={false}
                className="employee-popup"
            >
                <div className="flex flex-col bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 overflow-hidden">
                    {/* Pinned Header */}
                    <div className="shrink-0 flex items-center justify-between gap-2.5 px-3.5 py-3 border-b border-gray-200 dark:border-slate-700">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <img
                                src={location.user.avatar}
                                alt={`${location.user.firstName} ${location.user.lastName}`}
                                className="w-9 h-9 rounded-full object-cover ring-2 ring-blue-500/20 dark:ring-blue-400/30 shrink-0"
                            />

                            <div className="flex flex-col justify-center min-w-0">
                                <h3 className="text-sm font-semibold leading-tight text-gray-900 dark:text-white truncate">
                                    {location.user.firstName} {location.user.lastName}
                                </h3>

                                <p className="mt-0.5 text-[11px] text-gray-500 dark:text-slate-400 truncate">
                                    {location.user.email}
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            aria-label="Close popup"
                            onClick={(e) => {
                                e.stopPropagation();
                                map.closePopup();
                            }}
                            className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Pinned Work & Break Summary Tiles */}
                    <div className="shrink-0 grid grid-cols-2 gap-2.5 px-3.5 py-2.5 border-b border-gray-200 dark:border-slate-700 bg-gray-50/70 dark:bg-slate-900/40">
                        <div className="rounded-xl border border-blue-200/80 dark:border-blue-800/50 bg-blue-50/70 dark:bg-blue-950/30 px-2.5 py-2">
                            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                                <Clock className="h-3 w-3 shrink-0" />
                                Work Time
                            </p>
                            <p className="mt-1 text-sm font-bold leading-tight text-gray-900 dark:text-white">
                                {isLoadingSummary && !summary ? "Loading..." : displaySummary.workTime}
                            </p>
                        </div>

                        <div className="rounded-xl border border-amber-200/80 dark:border-amber-800/50 bg-amber-50/70 dark:bg-amber-950/30 px-2.5 py-2">
                            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                                <Clock className="h-3 w-3 shrink-0" />
                                Break Time
                            </p>
                            <p className="mt-1 text-sm font-bold leading-tight text-gray-900 dark:text-white">
                                {isLoadingSummary && !summary ? "Loading..." : displaySummary.breakTime}
                            </p>
                        </div>
                    </div>

                    {/* Scrollable Details Body */}
                    <div
                        ref={bodyScrollRef}
                        onScroll={(e) => {
                            savedScrollTopRef.current = e.currentTarget.scrollTop;
                        }}
                        className="max-h-[260px] overflow-y-auto overscroll-contain px-3.5 py-2.5 space-y-2.5"
                    >
                        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                            <MapPin className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                            Location Details
                        </h4>

                        <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between gap-2">
                                <span className="font-medium text-gray-500 dark:text-slate-400">Country</span>
                                <span className="text-right font-semibold text-gray-900 dark:text-slate-200">{location.country || "-"}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="font-medium text-gray-500 dark:text-slate-400">State</span>
                                <span className="text-right font-semibold text-gray-900 dark:text-slate-200">{location.state || "-"}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="font-medium text-gray-500 dark:text-slate-400">City</span>
                                <span className="text-right font-semibold text-gray-900 dark:text-slate-200">{location.city || "-"}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="font-medium text-gray-500 dark:text-slate-400">ZIP Code</span>
                                <span className="text-right font-semibold text-gray-900 dark:text-slate-200">{location.postalCode || "-"}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="font-medium text-gray-500 dark:text-slate-400">IP Address</span>
                                <span className="text-right font-semibold text-gray-900 dark:text-slate-200">{location.ipAddress || "-"}</span>
                            </div>
                            <div className="flex justify-between gap-4 min-w-0">
                                <span className="font-medium text-gray-500 dark:text-slate-400 shrink-0">Service Provider</span>
                                <span className="text-right font-semibold text-gray-900 dark:text-slate-200 break-words min-w-0">{location.serviceProvider || "-"}</span>
                            </div>
                        </div>

                        <div className="border-t border-gray-200 dark:border-slate-700 pt-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-0.5">
                                Address
                            </p>
                            <p className="text-xs leading-5 text-gray-900 dark:text-slate-200 break-words">
                                {location.address || "-"}
                            </p>
                        </div>

                        <div className="border-t border-gray-200 dark:border-slate-700 pt-2 space-y-1.5">
                            <div className="flex justify-between gap-3 text-xs">
                                <span className="text-gray-500 dark:text-slate-400 font-medium">Accuracy</span>
                                <span className="font-semibold text-gray-900 dark:text-slate-200">
                                    {formatAccuracy(location.accuracy)}
                                </span>
                            </div>
                            <div className="flex justify-between gap-3 text-xs">
                                <span className="text-gray-500 dark:text-slate-400 font-medium shrink-0">Last Updated</span>
                                <span className="text-right font-semibold text-gray-900 dark:text-slate-200">
                                    {formatLocationTimestamp(location.trackedAt, resolvedTimezone)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Pinned Footer CTA */}
                    <div className="shrink-0 border-t border-gray-200 dark:border-slate-700 px-3.5 py-2.5 bg-white dark:bg-slate-800">
                        <button
                            type="button"
                            onClick={() =>
                                window.open(
                                    `https://www.google.com/maps?q=${location.latitude},${location.longitude}`,
                                    "_blank",
                                    "noopener,noreferrer"
                                )
                            }
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
                        >
                            <Navigation className="h-3.5 w-3.5 shrink-0" />
                            Open in Google Maps
                        </button>
                    </div>
                </div>
            </Popup>
        </Marker>
    );
});

type Props = {
    locations: any[];
    reportRange?: {
        startDate: Date;
        endDate: Date;
    } | undefined;
    timezone?: string | undefined;
};

export default function LiveMap({
    locations = [],
    reportRange,
    timezone,
}: Props) {
    const resolvedTimezone = useMemo(
        () => resolveSafeTimezone(timezone),
        [timezone]
    );

    const startDateParam = useMemo(
        () =>
            formatDateForApi(
                reportRange?.startDate || new Date(),
                resolvedTimezone
            ),
        [reportRange?.startDate, resolvedTimezone]
    );

    const endDateParam = useMemo(
        () =>
            formatDateForApi(
                reportRange?.endDate || new Date(),
                resolvedTimezone
            ),
        [reportRange?.endDate, resolvedTimezone]
    );

    const [mapType, setMapType] = useState<"street" | "satellite">("street");
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [summaryByUser, setSummaryByUser] = useState<Record<string, AttendanceSummary>>({});
    const [loadingUserId, setLoadingUserId] = useState<string | null>(null);

    const summaryRequestIdRef = useRef(0);
    const abortControllerRef = useRef<AbortController | null>(null);
    const iconCache = useRef<Map<string, L.DivIcon>>(new Map());

    const getAvatarIcon = useCallback((avatar: string) => {
        if (!iconCache.current.has(avatar)) {
            iconCache.current.set(avatar, createAvatarIcon(avatar));
        }
        return iconCache.current.get(avatar)!;
    }, []);

    const [popupMaxWidth, setPopupMaxWidth] = useState(340);
    const [popupMinWidth, setPopupMinWidth] = useState(300);

    useEffect(() => {
        const updatePopupSize = () => {
            const isSmall = window.innerWidth < 480;
            setPopupMaxWidth(isSmall ? Math.max(240, window.innerWidth - 48) : 340);
            setPopupMinWidth(isSmall ? Math.max(220, window.innerWidth - 56) : 300);
        };

        updatePopupSize();
        window.addEventListener("resize", updatePopupSize);
        return () => window.removeEventListener("resize", updatePopupSize);
    }, []);

    const fetchSummaryForUser = useCallback(
        async (userId: string, showLoading: boolean) => {
            if (!userId) return;

            abortControllerRef.current?.abort();
            const controller = new AbortController();
            abortControllerRef.current = controller;
            const reqId = ++summaryRequestIdRef.current;

            if (showLoading) {
                setLoadingUserId(userId);
            }

            try {
                const { data } = await API.get(`/attendance/summary/${userId}`, {
                    params: {
                        startDate: startDateParam,
                        endDate: endDateParam,
                    },
                    signal: controller.signal,
                });

                if (summaryRequestIdRef.current !== reqId) return;

                setSummaryByUser((prev) => {
                    const nextSummary: AttendanceSummary = {
                        workTime: data?.workTime || "0h 0m",
                        breakTime: data?.breakTime || "0h 0m",
                    };
                    const existing = prev[userId];
                    if (
                        existing &&
                        existing.workTime === nextSummary.workTime &&
                        existing.breakTime === nextSummary.breakTime
                    ) {
                        return prev;
                    }
                    return {
                        ...prev,
                        [userId]: nextSummary,
                    };
                });
            } catch (err: any) {
                if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") {
                    return;
                }
                console.error(err);
                if (summaryRequestIdRef.current === reqId) {
                    setSummaryByUser((prev) =>
                        prev[userId] ? prev : { ...prev, [userId]: EMPTY_SUMMARY }
                    );
                }
            } finally {
                if (summaryRequestIdRef.current === reqId) {
                    setLoadingUserId((prev) => (prev === userId ? null : prev));
                }
            }
        },
        [startDateParam, endDateParam]
    );

    const handleSelectUser = useCallback(
        (userId: string) => {
            setSelectedUserId(userId);
            fetchSummaryForUser(userId, true);
        },
        [fetchSummaryForUser]
    );

    const handleCloseUser = useCallback((userId: string) => {
        setSelectedUserId((prev) => (prev === userId ? null : prev));
    }, []);

    useEffect(() => {
        if (!selectedUserId) {
            return;
        }

        fetchSummaryForUser(selectedUserId, false);

        const interval = window.setInterval(() => {
            fetchSummaryForUser(selectedUserId, false);
        }, 5000);

        return () => {
            window.clearInterval(interval);
        };
    }, [selectedUserId, startDateParam, endDateParam, fetchSummaryForUser]);

    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();
        };
    }, []);

    const activeLocation = useMemo(() => {
        if (locations.length === 0) return null;
        if (selectedUserId) {
            const matched = locations.find(
                (loc) => String(loc?.user?._id || loc?.user?.id || "") === selectedUserId
            );
            if (matched) return matched;
        }
        return locations[0];
    }, [locations, selectedUserId]);

    const headerTitle = useMemo(() => {
        if (locations.length === 0) return "No Active Users";
        if (selectedUserId && activeLocation?.user) {
            return `${activeLocation.user.firstName} ${activeLocation.user.lastName}`;
        }
        if (locations.length === 1) {
            return `${locations[0]?.user?.firstName} ${locations[0]?.user?.lastName}`;
        }
        return `${locations.length} Active Users`;
    }, [locations, selectedUserId, activeLocation]);

    return (
        <section className="bg-gray-100 dark:bg-slate-900 pt-4 pb-6">
            <div className="overflow-hidden rounded-3xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] shadow-sm">
                <div className="border-b border-gray-200 dark:border-[#22324D] px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Location Tracking</p>
                            <h1 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                                {headerTitle}
                            </h1>
                        </div>

                        <span
                            className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/60 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                        >
                            Live
                        </span>
                    </div>
                </div>

                <div className="border-b border-gray-200 dark:border-[#22324D] px-5 py-4">
                    <div className="grid gap-3 lg:grid-cols-3">
                        <div className="rounded-2xl bg-blue-50 dark:bg-blue-950/40 px-4 py-3 text-sm font-medium text-blue-700 dark:text-blue-300">
                            Each marker represents a user&apos;s location
                        </div>

                        <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                            Click on a marker to see detailed information
                        </div>

                        <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm font-medium text-amber-700 dark:text-amber-300">
                            Full details are visible inside the marker popup
                        </div>
                    </div>
                </div>

                <div className="px-2 py-2">
                    <div className="relative h-[calc(100vh-20rem)] min-h-[30rem] overflow-hidden rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] shadow-sm">

                        <div className="absolute top-4 right-4 z-[1000]">
                            <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1E293B] overflow-hidden shadow-md">
                                <button
                                    type="button"
                                    onClick={() => setMapType("street")}
                                    className={`px-4 py-2 text-sm font-medium ${mapType === "street"
                                        ? "bg-blue-600 text-white"
                                        : "bg-white dark:bg-[#1E293B] text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#273549]"
                                        }`}
                                >
                                    Street
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setMapType("satellite")}
                                    className={`px-4 py-2 text-sm font-medium ${mapType === "satellite"
                                        ? "bg-blue-600 text-white"
                                        : "bg-white dark:bg-[#1E293B] text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#273549]"
                                        }`}
                                >
                                    Satellite
                                </button>
                            </div>
                        </div>

                        <MapContainer
                            center={
                                locations.length
                                    ? [locations[0].latitude, locations[0].longitude]
                                    : [20.5937, 78.9629]
                            }
                            zoom={16}
                            minZoom={3}
                            maxZoom={22}
                            zoomControl={true}
                            scrollWheelZoom={true}
                            doubleClickZoom={true}
                            touchZoom={true}
                            dragging={true}
                            className="h-full w-full"
                        >
                            <FitBounds locations={locations} />

                            <TileLayer
                                attribution={
                                    mapType === "street"
                                        ? '&copy; OpenStreetMap contributors'
                                        : '&copy; Esri'
                                }
                                url={
                                    mapType === "street"
                                        ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                }
                            />

                            {activeLocation && activeLocation.accuracy ? (
                                <Circle
                                    center={[
                                        activeLocation.latitude,
                                        activeLocation.longitude,
                                    ]}
                                    radius={activeLocation.accuracy}
                                    pathOptions={{
                                        color: "#2563eb",
                                        fillColor: "#60a5fa",
                                        fillOpacity: 0.2,
                                        weight: 1,
                                    }}
                                />
                            ) : null}

                            <MarkerClusterGroup>
                                {locations.map((location: any) => {
                                    const uid = String(location?.user?._id || location?.user?.id || "");
                                    return (
                                        <UserLocationMarker
                                            key={uid || location._id}
                                            location={location}
                                            icon={getAvatarIcon(location.user.avatar)}
                                            summary={summaryByUser[uid]}
                                            isLoadingSummary={loadingUserId === uid}
                                            resolvedTimezone={resolvedTimezone}
                                            popupMaxWidth={popupMaxWidth}
                                            popupMinWidth={popupMinWidth}
                                            onSelectUser={handleSelectUser}
                                            onCloseUser={handleCloseUser}
                                        />
                                    );
                                })}
                            </MarkerClusterGroup>
                        </MapContainer>
                    </div>
                </div>
            </div>
        </section>
    );
}