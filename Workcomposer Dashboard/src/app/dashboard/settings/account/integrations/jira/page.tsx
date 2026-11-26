"use client";

import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { HiOutlineLink } from "react-icons/hi2";
import { SiJira } from "react-icons/si";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

import API from "@/api";
import { useOptionalDesktop } from "@/context/DesktopContext";
import {
    hasDesktopIntegrationOAuth,
    useDesktopIntegrationOAuth,
} from "@/lib/desktopIntegrationOAuth";

export default function JiraPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const desktop = useOptionalDesktop();
    const isDesktop = Boolean(desktop);

    const [status, setStatus] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const fetchStatus = async () => {
        try {
            const { data } = await API.get(
                "/integrations/jira/status"
            );

            setStatus(data);
        } catch (err: any) {
            console.error("JIRA STATUS ERROR:", err);

            toast.error(
                err.response?.data?.message ||
                "Failed to load Jira integration."
            );
        }
    };

    useEffect(() => {
        const statusParam = searchParams.get("status");
        const errorParam = searchParams.get("error");

        if (statusParam) {
            if (statusParam === "connected") {
                toast.success("Jira connected successfully.");
            } else if (statusParam === "cancelled") {
                toast("Jira connection was cancelled.", { icon: "⚠️" });
            } else if (statusParam === "error") {
                const msg =
                    errorParam === "invalid_state"
                        ? "Jira connection failed: invalid or expired session state."
                        : "Failed to connect Jira.";
                toast.error(msg);
            }

            window.history.replaceState(
                {},
                "",
                isDesktop
                    ? window.location.pathname
                    : "/dashboard/settings/account/integrations/jira"
            );
        }

        fetchStatus();
    }, [searchParams, isDesktop]);

    const syncProjects = async () => {
        try {
            setLoading(true);

            await API.post("/integrations/jira/sync-projects");

            toast.success("Projects synced successfully.");
        } catch (err: any) {
            console.error("JIRA SYNC ERROR:", err);

            toast.error(
                err.response?.data?.message ||
                "Failed to sync projects."
            );
        } finally {
            setLoading(false);
        }
    };

    const disconnectJira = async () => {
        const confirmed = window.confirm(
            "Disconnect Jira?\n\nThis will stop syncing projects and tasks and remove your stored Jira credentials."
        );
        if (!confirmed) return;

        try {
            setLoading(true);
            await API.delete("/integrations/jira");
            toast.success("Jira disconnected successfully.");
            await fetchStatus();
            window.dispatchEvent(new Event("integrationsUpdated"));
        } catch (err: any) {
            console.error("JIRA DISCONNECT ERROR:", err);
            toast.error(
                err.response?.data?.message ||
                "Failed to disconnect Jira."
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

        router.push(
            "/dashboard/settings/account/integrations"
        );
    };

    const { oauthWaiting, startDesktopOAuth, cancelWaiting } =
        useDesktopIntegrationOAuth({
            provider: "jira",
            label: "Jira",
            onConnected: fetchStatus,
        });

    const connectJira = () => {
        if (hasDesktopIntegrationOAuth()) {
            void startDesktopOAuth();
            return;
        }
        window.location.href =
            `${process.env.NEXT_PUBLIC_API_URL}/integrations/jira/connect`;
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
                    src="/icons/jira.png"
                    alt="Jira"
                    width={48}
                    height={48}
                    className="shrink-0"
                />

                <div className="min-w-0">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Jira Integration
                    </h1>

                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
                        Sync tasks and track time across platforms
                    </p>
                </div>
            </div>

            <div className="space-y-6">
                {/* Main Card */}
                {status?.connected ? (
                    <div className="rounded-xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-4 sm:p-6">
                        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                                <span className="font-medium text-gray-900 dark:text-white">
                                    ✓ Jira Connected
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={disconnectJira}
                                disabled={loading}
                                className="text-sm text-red-600 transition hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Disconnect
                            </button>
                        </div>

                        <dl className="mb-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                            <div>
                                <dt className="text-gray-500 dark:text-gray-400">Workspace</dt>
                                <dd className="break-words font-medium text-gray-900 dark:text-white">
                                    {status.workspaceName || "Jira Cloud"}
                                </dd>
                            </div>
                            {status.siteUrl && (
                                <div>
                                    <dt className="text-gray-500 dark:text-gray-400">Site URL</dt>
                                    <dd className="break-all font-medium text-gray-900 dark:text-white">
                                        {status.siteUrl}
                                    </dd>
                                </div>
                            )}
                        </dl>

                        <div className="border-t border-gray-100 dark:border-gray-800 pt-6">
                            <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                                Project Sync
                            </h2>
                            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                                Import Jira projects and keep tasks synchronized with WorkComposer.
                            </p>

                            <button
                                type="button"
                                onClick={syncProjects}
                                disabled={loading}
                                className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                            >
                                {loading ? "Syncing..." : "Sync Projects"}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-4 sm:p-6">
                        <h2 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
                            Connect Your Jira Workspace
                        </h2>

                        <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
                            Link your Jira Cloud instance to import tasks, track time against Jira issues,
                            and automatically sync work logs — all without leaving your workspace.
                        </p>

                        <div className="flex flex-col items-start gap-3">
                            <button
                                type="button"
                                onClick={connectJira}
                                disabled={oauthWaiting}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                            >
                                <SiJira className="h-4 w-4" />
                                {oauthWaiting ? "Waiting for Jira Authorization..." : "Connect to Jira"}
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

                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                        <Feature
                            icon={<SiJira className="h-5 w-5 text-gray-700 dark:text-gray-300" />}
                            title="Import Tasks"
                            desc="Import Jira issues and work with them inside WorkComposer."
                        />

                        <Feature
                            icon={<HiOutlineLink className="h-5 w-5 text-gray-700 dark:text-gray-300" />}
                            title="Track Time"
                            desc="Track time against Jira issues while working."
                        />

                        <Feature
                            icon={<ArrowLeft className="h-5 w-5 rotate-180 text-gray-700 dark:text-gray-300" />}
                            title="Sync Projects"
                            desc="Keep your Jira projects synchronized with WorkComposer."
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