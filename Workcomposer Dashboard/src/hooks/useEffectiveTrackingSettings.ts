import { useEffect, useState } from "react";
import API from "@/api";
import socket from "@/socket/socket";

export default function useEffectiveTrackingSettings() {
    const [settings, setSettings] = useState<any>(null);

    const refresh = async () => {
        const { data } = await API.get(
            "/time-tracking/settings/effective"
        );

        setSettings(data);
    };

    useEffect(() => {
        let mounted = true;
        API.get("/time-tracking/settings/effective")
            .then(({ data }) => {
                if (mounted) {
                    setSettings(data);
                }
            })
            .catch(() => { });
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        const handleSettingsChanged = async () => {
            await refresh();

            window.electronAPI?.reloadTrackingSettings();
        };
        socket.on(
            "tracking-settings-updated",
            handleSettingsChanged
        );

        return () => {
            socket.off(
                "tracking-settings-updated",
                handleSettingsChanged
            );
        };
    }, []);

    return {
        settings,
        refresh,
    };
}