"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import API from "@/api";

export default function FooterStatusBar() {
    const [isOnline, setIsOnline] = useState(false);
    const [lastSync, setLastSync] = useState<Date | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [captureStatus, setCaptureStatus] = useState<"NORMAL" | "THROTTLE" | "PAUSE">("NORMAL");
    const [captureReason, setCaptureReason] = useState<string | null>(null);

    useEffect(() => {
        setIsOnline(navigator.onLine);

        const goOnline = () => setIsOnline(true);
        const goOffline = () => setIsOnline(false);

        window.addEventListener("online", goOnline);
        window.addEventListener("offline", goOffline);

        return () => {
            window.removeEventListener("online", goOnline);
            window.removeEventListener("offline", goOffline);
        };
    }, []);

    useEffect(() => {
        if (typeof window === "undefined" || !window.electronAPI) return;

        // Check initial queue status if available
        if (typeof window.electronAPI.getOfflineQueueStatus === "function") {
            window.electronAPI.getOfflineQueueStatus()
                .then((status) => {
                    if (status?.readiness && !status.readiness.ok) {
                        setCaptureStatus("PAUSE");
                        setCaptureReason(status.readiness.reason || "OFFLINE_QUEUE_FULL");
                    }
                })
                .catch(() => {});
        }

        const unsubPause = window.electronAPI.onScreenshotCapturePaused?.((payload) => {
            setCaptureStatus("PAUSE");
            setCaptureReason(payload?.reason || "OFFLINE_QUEUE_FULL");
        });

        const unsubThrottle = window.electronAPI.onScreenshotCaptureThrottled?.(() => {
            setCaptureStatus((prev) => (prev === "PAUSE" ? "PAUSE" : "THROTTLE"));
        });

        const unsubResume = window.electronAPI.onScreenshotCaptureResumed?.(() => {
            setCaptureStatus("NORMAL");
            setCaptureReason(null);
        });

        const handleReset = () => {
            setCaptureStatus("NORMAL");
            setCaptureReason(null);
        };

        const unsubSignOut = window.electronAPI.onDeviceSignedOut?.(handleReset);
        const unsubLogOut = window.electronAPI.onElectronLoggedOut?.(handleReset);

        return () => {
            if (typeof unsubPause === "function") unsubPause();
            if (typeof unsubThrottle === "function") unsubThrottle();
            if (typeof unsubResume === "function") unsubResume();
            if (typeof unsubSignOut === "function") unsubSignOut();
            if (typeof unsubLogOut === "function") unsubLogOut();
        };
    }, []);

    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const fetchSyncStatus = async () => {
        try {
            if (isMountedRef.current) {
                setSyncing(true);
            }

            const { data } = await API.get("/sync/status");

            if (!isMountedRef.current) return;

            if (data?.lastSync) {
                const parsed = new Date(data.lastSync);
                if (!isNaN(parsed.getTime())) {
                    setLastSync(parsed);
                }
            } else if (data && data.lastSync === null) {
                setLastSync(null);
            }
        } catch (err: any) {
            // Gracefully handle network disconnects or unreachable backend
            if (!err?.response || err?.code === "ERR_NETWORK") {
                // Offline or backend unreachable - preserve existing lastSync and avoid repetitive console spam
                return;
            }
            console.error(err);
        } finally {
            if (isMountedRef.current) {
                setSyncing(false);
            }
        }
    };

    useEffect(() => {
        fetchSyncStatus();

        const interval = setInterval(() => {
            fetchSyncStatus();
        }, 10000);

        return () => clearInterval(interval);
    }, []);

    const formatLastSync = (date: Date | null) => {
        if (!date) return "Never synced";

        return date.toLocaleString([], {
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    return (
        <footer className="fixed bottom-0 left-0 right-0 z-50 h-7 overflow-hidden border-t border-gray-200 dark:border-[#22324D] bg-slate-50 dark:bg-[#111827] text-gray-600 dark:text-gray-300 text-[12px] transition-colors duration-200">

            {/* Ambient background effects */}
            <div className="pointer-events-none absolute -left-10 top-1/2 h-16 w-32 -translate-y-1/2 rounded-full bg-green-500/5 blur-2xl" />

            <div className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/5 blur-2xl" />

            <div className="pointer-events-none absolute -right-10 top-1/2 h-16 w-32 -translate-y-1/2 rounded-full bg-purple-500/5 blur-2xl" />

            {/* Subtle animated glow */}
            <div className="pointer-events-none absolute inset-0 footer-glow" />

            {/* Content */}
            <div className="relative z-10 flex h-full items-center justify-between px-4">

                {/* Left */}
                <div className="flex items-center gap-7 pl-5">

                    {/* Online / Offline */}
                    <div
                        className={`flex items-center gap-2 rounded-sm bg-gray-200 dark:bg-[#16253D] px-2 py-1 transition-all duration-300 ${
                            isOnline
                                ? "hover:shadow-[0_0_14px_rgba(74,222,128,0.3)]"
                                : "hover:shadow-[0_0_14px_rgba(239,68,68,0.25)]"
                        }`}
                    >
                        <span
                            className={`h-2 w-2 rounded-full ${
                                isOnline
                                    ? "animate-pulse bg-green-500 dark:bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.9)]"
                                    : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                            }`}
                        />

                        <span className="text-gray-800 dark:text-white font-medium">
                            {isOnline ? "Online" : "Offline"}
                        </span>
                    </div>

                    {/* Sync status */}
                    <div className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-300">
                        <RefreshCw
                            size={13}
                            className={`transition-all duration-300 ${
                                syncing
                                    ? "animate-spin text-blue-500 dark:text-blue-400"
                                    : "text-gray-500 dark:text-gray-400"
                            }`}
                        />

                        <span>
                            Synced {formatLastSync(lastSync)}
                        </span>
                    </div>

                    {/* Screenshot Capture Safe-Retain Status */}
                    {captureStatus === "PAUSE" && (
                        <div
                            id="footer-capture-paused-badge"
                            role="status"
                            className="flex items-center gap-1.5 rounded-sm bg-red-100 dark:bg-red-950/80 px-2 py-1 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800/60"
                            title={`Screenshot capture paused: ${
                                captureReason === "INSUFFICIENT_HOST_STORAGE"
                                    ? "Host disk space low (< 500 MB reserve)"
                                    : "Offline queue storage capacity full"
                            }. Existing screenshots preserved.`}
                        >
                            <span className="h-2 w-2 rounded-full bg-red-500 dark:bg-red-400 animate-pulse" />
                            <span className="font-medium text-[11px]">Capture Paused</span>
                        </div>
                    )}
                    {captureStatus === "THROTTLE" && (
                        <div
                            id="footer-capture-throttled-badge"
                            role="status"
                            className="flex items-center gap-1.5 rounded-sm bg-amber-100 dark:bg-amber-950/80 px-2 py-1 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60"
                            title="Screenshot capture throttled: offline storage nearing capacity. Existing screenshots preserved."
                        >
                            <span className="h-2 w-2 rounded-full bg-amber-500 dark:bg-amber-400" />
                            <span className="font-medium text-[11px]">Capture Throttled</span>
                        </div>
                    )}
                </div>

                {/* Right */}
                <div className="text-gray-500 dark:text-gray-400">
                    v1.0.0 © 2026 WorkComposer
                </div>
            </div>

            <style jsx>{`
                .footer-glow {
                    background:
                        radial-gradient(
                            circle at 20% 50%,
                            rgba(34, 197, 94, 0.025),
                            transparent 30%
                        ),
                        radial-gradient(
                            circle at 50% 50%,
                            rgba(59, 130, 246, 0.025),
                            transparent 35%
                        ),
                        radial-gradient(
                            circle at 80% 50%,
                            rgba(168, 85, 247, 0.025),
                            transparent 30%
                        );
                    animation: footerAmbient 8s ease-in-out infinite;
                }

                @keyframes footerAmbient {
                    0%,
                    100% {
                        opacity: 0.7;
                    }

                    50% {
                        opacity: 1;
                    }
                }

                @media (prefers-reduced-motion: reduce) {
                    .footer-glow {
                        animation: none;
                    }
                }
            `}</style>
        </footer>
    );
}