"use client";

import Sidebar from "@/app/desktop-components/desktop/Sidebar";
import TopBar from "../desktop-components/desktop/TopBar";
import FooterStatusBar from "../desktop-components/desktop/FooterStatusBar";
import DashboardPage from "../desktop-components/pages/DashboardPage";
import ReportsPage from "../desktop-components/pages/ReportsPage";
import UsersPage from "../desktop-components/pages/UsersPage";
import ProjectsPage from "../desktop-components/pages/ProjectsPage";
import SettingsPage from "../desktop-components/pages/SettingsPage";
import { TimerProvider } from "@/context/TimerContext";
import { ProjectProvider } from "@/context/ProjectContext";
import { DesktopProvider, useDesktop } from "@/context/DesktopContext";
import { useEffect, useState } from "react";
import API from "@/api";
import DashboardContext from "@/context/DashboardContext";
import InboxPage from "../desktop-components/pages/InboxPage";
import NotificationList from "@/components/notifications/NotificationList";
import socket from "@/socket/socket";
import { useRouter } from "next/navigation";
import { useScreenshotCaptureNotifications } from "@/hooks/useScreenshotCaptureNotifications";


function DesktopLayout() {

    const {
        activePage,
        setActivePage,
    } = useDesktop();

    const router = useRouter();

    // Safe-Retain screenshot capture notifications (throttled, paused, resumed)
    useScreenshotCaptureNotifications();

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!window.electronAPI) return;

        const handleSignedOut = () => {
            // Clear renderer-side authentication if present
            localStorage.removeItem("accessToken");
            localStorage.removeItem("token");

            router.replace("/authenticate/login");
        };

        const cleanupDeviceSignedOut = window.electronAPI.onDeviceSignedOut?.(handleSignedOut);
        const cleanupElectronLoggedOut = window.electronAPI.onElectronLoggedOut?.(handleSignedOut);

        const cleanupOpenSettings = (window.electronAPI as any)?.onOpenSettings?.(() => {
            setActivePage("settings");
        });

        return () => {
            cleanupDeviceSignedOut?.();
            cleanupElectronLoggedOut?.();
            cleanupOpenSettings?.();
        };
    }, [router, setActivePage]);

    return (
        <div className="flex min-h-screen bg-slate-100 dark:bg-[#090F1D] text-gray-900 dark:text-white">

            <Sidebar
                activePage={activePage}
                setActivePage={setActivePage}
            />

            <TopBar />

            <main
                className={`relative pt-16 pb-7 flex-1 bg-slate-100 dark:bg-[#090F1D] overflow-auto transition-all duration-300 
        ${activePage === "reports" ||
                        activePage === "users" ||
                        activePage === "projects" ||
                        activePage === "settings" ||
                        activePage === "inbox" ||
                        activePage === "notifications"
                        ? "ml-[78px] xl:ml-[366px]"
                        : "ml-[78px]"
                    }`}
            >

                {activePage === "dashboard" && (
                    <div className="w-full">
                        <DashboardPage />
                    </div>
                )}

                {activePage === "reports" && (
                    <div className="w-full min-h-full">
                        <ReportsPage />
                    </div>
                )}

                {activePage === "users" && (
                    <div className="w-full min-h-full">
                        <UsersPage />
                    </div>
                )}

                {activePage === "projects" && (
                    <div className="w-full min-h-full">
                        <ProjectsPage />
                    </div>
                )}

                {activePage === "settings" && (
                    <div className="w-full min-h-full">
                        <SettingsPage />
                    </div>
                )}

                {activePage === "inbox" && (
                    <div className="w-full min-h-full">
                        <InboxPage />
                    </div>
                )}

                {activePage === "notifications" && (
                    <div className="w-full min-h-full">
                        <NotificationList />
                    </div>
                )}

                <FooterStatusBar />

            </main>

        </div>
    );
}

export default function DesktopPage() {

    const [user, setUser] = useState<any>(null);

    const refreshUser = async () => {
        try {
            const res = await API.get("/auth/me");
            setUser(res.data);

            const organizationId =
                res.data.organization?._id || res.data.organization;

            if (organizationId) {
                socket.emit("joinOrganization", organizationId);
            }
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        let mounted = true;
        API.get("/auth/me")
            .then((res) => {
                if (!mounted) return;
                setUser(res.data);

                const organizationId =
                    res.data.organization?._id || res.data.organization;

                if (organizationId) {
                    socket.emit("joinOrganization", organizationId);
                }
            })
            .catch((err) => {
                console.error(err);
            });
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        document.body.style.overflow = "auto";
        document.documentElement.style.overflow = "auto";

        return () => {
            document.body.style.overflow = "hidden";
            document.documentElement.style.overflow = "hidden";
        };
    }, []);

    return (
        <DashboardContext.Provider
            value={{
                user,
                refreshUser,
            }}
        >
            <DesktopProvider>
                <ProjectProvider>
                    <TimerProvider>
                        <DesktopLayout />
                    </TimerProvider>
                </ProjectProvider>
            </DesktopProvider>
        </DashboardContext.Provider>
    );
}
