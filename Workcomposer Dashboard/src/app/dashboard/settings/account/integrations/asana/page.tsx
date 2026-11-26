"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useOptionalDesktop } from "@/context/DesktopContext";
import toast from "react-hot-toast";
import {
    ArrowLeft,
    Link2,
    Download,
    Clock3,
    RefreshCw,
    BarChart3,
} from "lucide-react";
import { useEffect, useState } from "react";
import API from "@/api";
import {
    hasDesktopIntegrationOAuth,
    useDesktopIntegrationOAuth,
} from "@/lib/desktopIntegrationOAuth";

export default function AsanaPage() {

    const searchParams = useSearchParams();
    const router = useRouter();
    const desktop = useOptionalDesktop();
    const isDesktop = Boolean(desktop);

    useEffect(() => {
        const status = searchParams.get("status");

        if (!status) return;

        if (status === "connected") {
            toast.success("Asana connected successfully.");
        }

        if (status === "cancelled") {
            toast("Asana connection was cancelled.", {
                icon: "⚠️",
            });
        }

        if (status === "error") {
            const errorParam = searchParams.get("error");
            const msg =
                errorParam === "invalid_state"
                    ? "Asana connection failed: invalid or expired session state."
                    : "Failed to connect Asana.";
            toast.error(msg);
        }

        window.history.replaceState(
            {},
            "",
            isDesktop
                ? window.location.pathname
                : "/dashboard/settings/account/integrations/asana"
        );
    }, [searchParams, isDesktop]);

    const [loading, setLoading] = useState(false);
    const [integration, setIntegration] = useState<any>(null);

    const fetchIntegration = async () => {
        try {
            const { data } = await API.get("/integrations/asana");

            setIntegration(data);
        } catch (err: any) {
            console.error("ASANA FETCH ERROR:", err);

            toast.error(
                err.response?.data?.message ||
                "Failed to load Asana integration."
            );
        }
    };

    useEffect(() => {
        fetchIntegration();
    }, []);

    const { oauthWaiting, startDesktopOAuth, cancelWaiting } =
        useDesktopIntegrationOAuth({
            provider: "asana",
            label: "Asana",
            onConnected: fetchIntegration,
        });

    const connectAsana = async () => {
        if (hasDesktopIntegrationOAuth()) {
            await startDesktopOAuth();
            return;
        }

        try {
            setLoading(true);

            const { data } = await API.get("/integrations/asana/connect");

            if (data.url) {
                window.location.href = data.url;
            }
        } catch (err: any) {
            console.error("ASANA CONNECT ERROR:", err);

            toast.error(
                err.response?.data?.message ||
                "Failed to connect Asana."
            );
        } finally {
            setLoading(false);
        }
    };

    const disconnectAsana = async () => {
        const confirmed = window.confirm(
            "Disconnect Asana?\n\nThis will stop syncing tasks and remove your stored Asana credentials."
        );

        if (!confirmed) return;

        try {
            setLoading(true);

            const { data } = await API.delete("/integrations/asana");

            toast.success(data.message);

            await fetchIntegration();
            window.dispatchEvent(new Event("integrationsUpdated"));
        } catch (err: any) {
            console.error("ASANA DISCONNECT ERROR:", err);

            toast.error(
                err.response?.data?.message ||
                "Failed to disconnect Asana."
            );
        } finally {
            setLoading(false);
        }
    };

    const importProjects = async () => {
        try {
            setLoading(true);

            const { data: workspaces } = await API.get(
                "/integrations/asana/workspaces"
            );

            if (!workspaces.length) {
                toast.error("No workspaces found.");
                return;
            }

            const workspaceId = workspaces[0].gid;

            const { data } = await API.post(
                `/integrations/asana/workspaces/${workspaceId}/import-projects`
            );

            toast.success(data.message);

        } catch (err: any) {
            console.error(err);
            toast.error(
                err.response?.data?.message ||
                "Failed to import projects."
            );
        } finally {
            setLoading(false);
        }
    };

    const handleBackToIntegrations = () => {
        if (desktop) {
            desktop.setActiveSetting("integrations");
            return;
        }

        router.push("/dashboard/settings/account/integrations");
    };


    return (
        <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
            {/* Back */}
            <button
                type="button"
                onClick={handleBackToIntegrations}
                className="mb-6 inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 transition hover:text-gray-900 dark:hover:text-white"
            >
                <ArrowLeft size={16} />
                <span>Back to Integrations</span>
            </button>

            {/* Header */}
            <div className="mb-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <Image
                    src="/icons/asana.png"
                    alt="Asana"
                    width={48}
                    height={48}
                    className="shrink-0"
                />

                <div className="min-w-0">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Asana Integration
                    </h1>

                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
                        Sync tasks and track time across platforms
                    </p>
                </div>
            </div>

            <div className="space-y-6">
                {/* Main Card */}
                {integration?.connected ? (
                    <div className="rounded-xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-4 sm:p-6">
                        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                                <span className="font-medium text-gray-900 dark:text-white">
                                    ✓ Successfully connected
                                </span>
                            </div>

                            <button
                                onClick={disconnectAsana}
                                disabled={loading}
                                className="text-sm text-red-600 transition hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {loading ? "Disconnecting..." : "Disconnect"}
                            </button>
                        </div>

                        <dl className="mb-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                            <div>
                                <dt className="text-gray-500 dark:text-gray-400">Workspace</dt>
                                <dd className="break-words font-medium text-gray-900 dark:text-white">
                                    Workspace: {integration.workspaceName}
                                </dd>
                            </div>
                            {integration.email && (
                                <div>
                                    <dt className="text-gray-500 dark:text-gray-400">Account Email</dt>
                                    <dd className="break-all font-medium text-gray-900 dark:text-white">
                                        {integration.email}
                                    </dd>
                                </div>
                            )}
                        </dl>

                        <div className="border-t border-gray-100 dark:border-gray-800 pt-6">
                            <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                                Project Import
                            </h2>
                            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                                Pull projects and tasks from your connected Asana workspace.
                            </p>

                            <button
                                onClick={importProjects}
                                disabled={loading}
                                className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                            >
                                {loading ? "Importing..." : "Import Projects"}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-4 sm:p-6">
                        <h2 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
                            Connect Your Asana Workspace
                        </h2>

                        <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
                            Link your Asana workspace to import tasks, track time against Asana
                            projects, and automatically sync time entries — all without leaving your
                            workspace.
                        </p>

                        <div className="flex flex-col items-start gap-3">
                            <button
                                onClick={connectAsana}
                                disabled={loading || oauthWaiting}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                            >
                                <Link2 size={16} />
                                {oauthWaiting
                                    ? "Waiting for Asana Authorization..."
                                    : loading
                                        ? "Connecting..."
                                        : "Connect to Asana"}
                            </button>
                            {oauthWaiting && (
                                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                                    <span>Complete authorization in your browser.</span>
                                    <button
                                        type="button"
                                        onClick={cancelWaiting}
                                        className="font-medium text-gray-900 dark:text-white hover:underline"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Features Card */}
                <div className="rounded-xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-4 sm:p-6">
                    <h3 className="mb-5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        What You&apos;ll Get
                    </h3>

                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                        <Feature
                            icon={<Download size={18} className="text-gray-700 dark:text-gray-300" />}
                            title="Import Tasks"
                            desc="Pull tasks from Asana projects"
                        />

                        <Feature
                            icon={<Clock3 size={18} className="text-gray-700 dark:text-gray-300" />}
                            title="Track Time"
                            desc="Log hours against Asana tasks"
                        />

                        <Feature
                            icon={<RefreshCw size={18} className="text-gray-700 dark:text-gray-300" />}
                            title="Auto Sync"
                            desc="Background sync every 15 min"
                        />

                        <Feature
                            icon={<BarChart3 size={18} className="text-gray-700 dark:text-gray-300" />}
                            title="Time Entries"
                            desc="Push time entries to Asana"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

function Feature({
    icon,
    title,
    desc,
}: {
    icon: React.ReactNode;
    title: string;
    desc: string;
}) {
    return (
        <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-800">
                {icon}
            </div>

            <div className="min-w-0">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {title}
                </h4>

                <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-400">
                    {desc}
                </p>
            </div>
        </div>
    );
}