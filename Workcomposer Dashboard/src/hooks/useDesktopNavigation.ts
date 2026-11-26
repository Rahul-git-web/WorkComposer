"use client";

import { useOptionalDesktop } from "@/context/DesktopContext";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

export default function useDesktopNavigation(enabled = true) {
    const desktopContext = useOptionalDesktop();
    const router = useRouter();

    const isDesktop = Boolean(
        desktopContext || (typeof window !== "undefined" && Boolean((window as any).electronAPI))
    );

    const closeSidebar = useCallback(() => {
        if (enabled && desktopContext?.setModuleSidebarOpen) {
            desktopContext.setModuleSidebarOpen(false);
        }
    }, [enabled, desktopContext]);

    const navigateToReport = useCallback(
        (reportName: string, fallbackWebPath?: string) => {
            closeSidebar();
            if (desktopContext?.setActiveReport) {
                desktopContext.setActivePage?.("reports");
                desktopContext.setActiveReport(reportName);
                return;
            }
            const webPath =
                fallbackWebPath ||
                `/dashboard/time-tracking/${reportName === "home" ? "home" : reportName}`;
            router.push(webPath);
        },
        [closeSidebar, desktopContext, router]
    );

    const navigateToSetting = useCallback(
        (settingKey: string, fallbackWebPath?: string) => {
            closeSidebar();
            if (desktopContext?.setActiveSetting) {
                desktopContext.setActivePage?.("settings");
                desktopContext.setActiveSetting(settingKey);
                return;
            }
            const webPath =
                fallbackWebPath ||
                `/dashboard/settings/${settingKey}`;
            router.push(webPath);
        },
        [closeSidebar, desktopContext, router]
    );

    const navigateToPage = useCallback(
        (pageName: string, fallbackWebPath: string) => {
            closeSidebar();
            if (desktopContext?.setActivePage) {
                desktopContext.setActivePage(pageName);
                return;
            }
            router.push(fallbackWebPath);
        },
        [closeSidebar, desktopContext, router]
    );

    return {
        isDesktop,
        desktop: desktopContext,
        closeSidebar,
        navigateToReport,
        navigateToSetting,
        navigateToPage,
    };
}