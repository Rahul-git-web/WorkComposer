"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

export type IntegrationOAuthProvider = "jira" | "asana" | "slack";

export interface DesktopIntegrationOAuthResult {
    provider: IntegrationOAuthProvider;
    status: "connected" | "cancelled" | "error";
    connected: boolean;
    workspaceName?: string;
    error?: string | null;
    message?: string | null;
}

const DESKTOP_OAUTH_WAIT_TIMEOUT_MS = 180_000;

export function hasDesktopIntegrationOAuth(): boolean {
    return (
        typeof window !== "undefined" &&
        typeof window.electronAPI?.startIntegrationOAuth === "function"
    );
}

/**
 * Shared desktop OAuth initiation + callback state hook reused across Jira, Asana, and Slack pages.
 */
export function useDesktopIntegrationOAuth({
    provider,
    label,
    onConnected,
}: {
    provider: IntegrationOAuthProvider;
    label: string;
    onConnected: () => void | Promise<void>;
}) {
    const [oauthWaiting, setOauthWaiting] = useState(false);
    const inFlightRef = useRef(false);
    const onConnectedRef = useRef(onConnected);
    useEffect(() => {
        onConnectedRef.current = onConnected;
    }, [onConnected]);

    const handleResult = useCallback(
        async (result: DesktopIntegrationOAuthResult) => {
            if (!result || result.provider !== provider) return;

            inFlightRef.current = false;
            setOauthWaiting(false);

            if (result.status === "connected") {
                await onConnectedRef.current();
                window.dispatchEvent(new Event("integrationsUpdated"));
                toast.success(result.message || `${label} connected successfully.`);
                return;
            }

            if (result.status === "cancelled") {
                toast(result.message || `${label} connection was cancelled.`, {
                    icon: "⚠️",
                });
                return;
            }

            const errorMessage =
                result.error === "invalid_state"
                    ? `${label} connection failed: invalid or expired session state.`
                    : result.message || `Failed to connect ${label}.`;
            toast.error(errorMessage);
        },
        [label, provider]
    );

    useEffect(() => {
        if (typeof window === "undefined") return;
        const electronAPI = window.electronAPI;
        if (!electronAPI?.onIntegrationOAuthResult) return;

        let active = true;

        const unsubscribe = electronAPI.onIntegrationOAuthResult((result) => {
            if (!active) return;
            void handleResult(result);
        });

        if (typeof electronAPI.consumePendingIntegrationOAuthResult === "function") {
            void electronAPI
                .consumePendingIntegrationOAuthResult()
                .then((pending) => {
                    if (active && pending && pending.provider === provider) {
                        void handleResult(pending);
                    }
                })
                .catch(() => {});
        }

        return () => {
            active = false;
            unsubscribe?.();
        };
    }, [handleResult, provider]);

    useEffect(() => {
        if (!oauthWaiting) return;
        const timer = window.setTimeout(() => {
            inFlightRef.current = false;
            setOauthWaiting(false);
            toast.error(
                `${label} authorization timed out. Please try connecting again.`
            );
        }, DESKTOP_OAUTH_WAIT_TIMEOUT_MS);

        return () => window.clearTimeout(timer);
    }, [label, oauthWaiting]);

    const startDesktopOAuth = useCallback(async () => {
        if (inFlightRef.current || !window.electronAPI?.startIntegrationOAuth) {
            return;
        }

        inFlightRef.current = true;
        setOauthWaiting(true);

        try {
            const response = await window.electronAPI.startIntegrationOAuth(provider);
            if (!response?.started) {
                inFlightRef.current = false;
                setOauthWaiting(false);
                toast.error(
                    response?.message || `Failed to connect ${label}.`
                );
            }
        } catch (err: any) {
            inFlightRef.current = false;
            setOauthWaiting(false);
            toast.error(err?.message || `Failed to connect ${label}.`);
        }
    }, [label, provider]);

    const cancelWaiting = useCallback(() => {
        inFlightRef.current = false;
        setOauthWaiting(false);
    }, []);

    return {
        oauthWaiting,
        startDesktopOAuth,
        cancelWaiting,
    };
}
