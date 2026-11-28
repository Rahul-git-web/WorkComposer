"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import API from "@/api";
import socket from "@/socket/socket";
import DashboardContext from "@/context/DashboardContext";

type Props = {
    children: React.ReactNode;
};

export default function AuthenticatedProviders({
    children,
}: Props) {
    const [user, setUser] = useState<any>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const router = useRouter();

    const refreshUser = async () => {
        try {
            setLoadError(null);
            const res = await API.get("/auth/me");

            setUser(res.data);

            const organizationId =
                res.data.organization?._id ||
                res.data.organization;

            if (organizationId) {
                socket.emit(
                    "joinOrganization",
                    organizationId
                );
            }
        } catch (error: any) {
            if (error?.response?.status === 401) {
                router.replace("/authenticate/login");
                return;
            }
            console.error(
                "FAILED TO LOAD AUTH USER:",
                error
            );
            setLoadError(error?.message || "Connection error");
        }
    };

    useEffect(() => {
        let mounted = true;
        API.get("/auth/me")
            .then((res) => {
                if (mounted) {
                    setLoadError(null);
                    setUser(res.data);
                    const organizationId =
                        res.data.organization?._id ||
                        res.data.organization;
                    if (organizationId) {
                        socket.emit("joinOrganization", organizationId);
                    }
                }
            })
            .catch((error) => {
                if (!mounted) return;
                if (error?.response?.status === 401) {
                    router.replace("/authenticate/login");
                    return;
                }
                console.error("FAILED TO LOAD AUTH USER:", error);
                setLoadError(error?.message || "Connection error");
            });
        return () => {
            mounted = false;
        };
    }, [router]);

    if (!user) {
        if (loadError) {
            return (
                <div className="flex h-screen w-full flex-col items-center justify-center bg-gray-50 dark:bg-[#090F1D] p-6 text-center">
                    <p className="text-base font-semibold text-gray-800 dark:text-white mb-2">
                        Unable to load account
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-sm">
                        Please check your network connection and try again.
                    </p>
                    <button
                        type="button"
                        onClick={() => void refreshUser()}
                        className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-500 transition-colors"
                    >
                        Retry
                    </button>
                </div>
            );
        }
        return null;
    }

    return (
        <DashboardContext.Provider
            value={{
                user,
                refreshUser,
            }}
        >
            {children}
        </DashboardContext.Provider>
    );
}