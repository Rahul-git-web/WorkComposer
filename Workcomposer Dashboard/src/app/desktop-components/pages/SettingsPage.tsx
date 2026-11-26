"use client";

import { useContext } from "react";
import SettingsModule from "@/app/modules/settings/SettingsModule";
import DesktopPageHeader from "../common/DesktopPageHeader";
import DashboardContext from "@/context/DashboardContext";
import SettingsLoading from "@/components/settings/SettingsLoading";

export default function SettingsPage() {
    const dashboard = useContext(DashboardContext);

    return (
        <>
            <DesktopPageHeader />

            <div className="pt-[45px]">
                {!dashboard?.user || dashboard?.loading ? (
                    <SettingsLoading />
                ) : (
                    <SettingsModule />
                )}
            </div>
        </>
    );
}