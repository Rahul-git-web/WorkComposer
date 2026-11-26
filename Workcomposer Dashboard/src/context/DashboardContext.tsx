"use client";

import {
    createContext,
    useContext,
} from "react";
import socket from "@/socket/socket";

type DashboardUser = {
    _id: string;
    id?: string;
    firstName: string;
    lastName: string;
    email: string;
    screenshotAccess?: "none" | "view" | string;
    reportAccess?: "none" | "own" | "managed" | "all" | string;
    name?: string;
    avatar: string;
    role: string;
    reportTimezone: string;
    manager?: {
        _id?: string;
        id?: string;
        firstName?: string;
        lastName?: string;
        email?: string;
    } | null;
    managers?: Array<{
        _id?: string;
        id?: string;
        firstName?: string;
        lastName?: string;
        email?: string;
    } | string>;
    permissions?: string[];
    manageUsers?: boolean;
    organization?: {
        name: string;
        timezone: string;
    };
};

type DashboardContextType = {
    user: DashboardUser | null;
    refreshUser: () => Promise<void>;
    loading?: boolean;
};

export const subscribeDashboardUpdates = (refreshUser: () => Promise<void>) => {
    const handleSync = () => {
        refreshUser();
    };

    socket.on("organization-updated", handleSync);
    socket.on("roles-updated", handleSync);

    return () => {
        socket.off("organization-updated", handleSync);
        socket.off("roles-updated", handleSync);
    };
};

const DashboardContext =
    createContext<DashboardContextType | null>(null);

export const useDashboard = () => {
    const context = useContext(DashboardContext);

    if (!context) {
        throw new Error(
            "useDashboard must be used inside DashboardContext.Provider"
        );
    }

    return context;
};

export default DashboardContext;