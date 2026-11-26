"use client";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { WifiOff, CheckCircle } from "lucide-react";

export default function OfflineBanner() {
    const { isOnline, wasOffline } = useOnlineStatus();

    if (isOnline && !wasOffline) {
        return null;
    }

    if (!isOnline) {
        return (
            <div
                role="status"
                aria-live="polite"
                className="bg-amber-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-sm shrink-0 z-30 transition-all duration-200"
            >
                <div className="flex items-center gap-2">
                    <WifiOff className="h-4 w-4 shrink-0 text-amber-200" aria-hidden="true" />
                    <span>
                        You are currently offline. Viewing cached information. Actions requiring network connectivity will resume once reconnected.
                    </span>
                </div>
                <span className="text-[11px] font-normal text-amber-100 hidden sm:inline">
                    Read-only mode active
                </span>
            </div>
        );
    }

    // wasOffline && isOnline: connection just restored
    return (
        <div
            role="status"
            aria-live="polite"
            className="bg-emerald-600 text-white px-4 py-2 text-xs font-semibold flex items-center gap-2 shadow-sm shrink-0 z-30 transition-all duration-200"
        >
            <CheckCircle className="h-4 w-4 shrink-0 text-emerald-200" aria-hidden="true" />
            <span>Connection restored. Network services are back online.</span>
        </div>
    );
}
