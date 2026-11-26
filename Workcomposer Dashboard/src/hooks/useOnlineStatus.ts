"use client";

import { useEffect, useState } from "react";

/**
 * Tracks browser connectivity state using navigator.onLine and online/offline window events.
 * Provides isOnline status and whether the user was previously offline (to show connection restored feedback).
 */
export function useOnlineStatus() {
    const [isOnline, setIsOnline] = useState<boolean>(() => {
        if (typeof window !== "undefined" && typeof navigator !== "undefined") {
            return navigator.onLine;
        }
        return true;
    });

    const [wasOffline, setWasOffline] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const handleOnline = () => {
            setIsOnline(true);
            setWasOffline(true);
        };

        const handleOffline = () => {
            setIsOnline(false);
        };

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, []);

    // Automatically clear wasOffline flag after 4 seconds of restored connectivity
    useEffect(() => {
        if (isOnline && wasOffline) {
            const timer = setTimeout(() => {
                setWasOffline(false);
            }, 4000);
            return () => clearTimeout(timer);
        }
    }, [isOnline, wasOffline]);

    return { isOnline, wasOffline };
}
