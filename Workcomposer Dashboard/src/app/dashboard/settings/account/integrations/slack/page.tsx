"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useOptionalDesktop } from "@/context/DesktopContext";
import API from "@/api";
import {
    hasDesktopIntegrationOAuth,
    useDesktopIntegrationOAuth,
} from "@/lib/desktopIntegrationOAuth";
import {
    DEFAULT_SLACK_NOTIFICATIONS,
    normalizeSlackIntegrationResponse,
    normalizeSlackNotifications,
    type SlackChannelOption,
    type SlackIntegrationData,
    type SlackNotifications,
} from "@/lib/slackIntegration";
import {
    ArrowLeft,
    Clock3,
    ClipboardCheck,
    BellRing,
    Activity,
} from "lucide-react";
import toast from "react-hot-toast";

const features = [
    {
        icon: <BellRing className="h-5 w-5 text-blue-600" />,
        title: "Daily & Weekly Reports",
        description: "Receive work summaries directly inside Slack.",
    },
    {
        icon: <Clock3 className="h-5 w-5 text-violet-600" />,
        title: "Time Approvals",
        description: "Approve or reject manual time requests.",
    },
    {
        icon: <ClipboardCheck className="h-5 w-5 text-green-600" />,
        title: "Task Assignments",
        description: "Instant notifications when work is assigned.",
    },
    {
        icon: <Activity className="h-5 w-5 text-orange-500" />,
        title: "Idle Alerts",
        description: "Get notified when idle time exceeds limits.",
    },
];

type FeatureCardProps = {
    icon: React.ReactNode;
    title: string;
    description: string;
};


function FeatureCard({
    icon,
    title,
    description,
}: FeatureCardProps) {
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
                    {description}
                </p>
            </div>
        </div>
    );
}

export default function SlackIntegrationPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const desktop = useOptionalDesktop();
    const isDesktop = Boolean(desktop);

    const [loading, setLoading] = useState(true);
    const [integration, setIntegration] =
        useState<SlackIntegrationData | null>(null);
    const [channels, setChannels] = useState<SlackChannelOption[]>([]);
    const [selectedChannel, setSelectedChannel] = useState("");
    const [notifications, setNotifications] = useState<SlackNotifications>(() => ({
        ...DEFAULT_SLACK_NOTIFICATIONS,
    }));

    const fetchChannels = async () => {
        try {
            const response = await API.get<SlackChannelOption[]>(
                "/integrations/slack/channels"
            );
            const data = response?.data;

            setChannels(Array.isArray(data) ? data : []);
        } catch (err: any) {
            console.error("SLACK CHANNELS ERROR:", err);

            toast.error(
                err?.response?.data?.message ||
                "Failed to load Slack channels."
            );
        }
    };

    const fetchIntegration = async () => {
        setLoading(true);
        try {
            const response = await API.get<SlackIntegrationData | null>(
                "/integrations/slack"
            );
            const normalized = normalizeSlackIntegrationResponse(response?.data);

            setIntegration(normalized);

            if (!normalized) {
                setChannels([]);
                setSelectedChannel("");
                return;
            }

            if (normalized.notifications) {
                setNotifications((prev) =>
                    normalizeSlackNotifications(normalized.notifications, prev) ??
                    prev
                );
            }

            if (normalized.connected) {
                await fetchChannels();
                setSelectedChannel(normalized.slackChannelId || "");
            } else {
                setChannels([]);
                setSelectedChannel("");
            }
        } catch (err: any) {
            console.error("SLACK FETCH ERROR:", err);

            toast.error(
                err?.response?.data?.message ||
                "Failed to load Slack integration."
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const statusParam = searchParams.get("status");
        const errorParam = searchParams.get("error");

        if (statusParam) {
            if (statusParam === "connected") {
                toast.success("Slack connected successfully.");
            } else if (statusParam === "cancelled") {
                toast("Slack connection was cancelled.", { icon: "⚠️" });
            } else if (statusParam === "error") {
                const msg =
                    errorParam === "invalid_state"
                        ? "Slack connection failed: invalid or expired session state."
                        : "Failed to connect Slack.";
                toast.error(msg);
            }

            window.history.replaceState(
                {},
                "",
                isDesktop
                    ? window.location.pathname
                    : "/dashboard/settings/account/integrations/slack"
            );
        }

        fetchIntegration();
    }, [searchParams, isDesktop]);

    const { oauthWaiting, startDesktopOAuth, cancelWaiting } =
        useDesktopIntegrationOAuth({
            provider: "slack",
            label: "Slack",
            onConnected: fetchIntegration,
        });

    const connectSlack = async () => {
        if (hasDesktopIntegrationOAuth()) {
            await startDesktopOAuth();
            return;
        }

        try {
            const { data } = await API.get("/integrations/slack/connect");

            window.location.href = data.url;
        } catch (err: any) {
            console.error("SLACK CONNECT ERROR:", err);

            toast.error(
                err.response?.data?.message ||
                "Failed to connect Slack."
            );
        }
    };

    const disconnectSlack = async () => {
        const confirmed = window.confirm(
            "Disconnect Slack?\n\nThis will remove your stored Slack credentials and stop sending Slack notifications."
        );
        if (!confirmed) return;

        try {
            await API.delete("/integrations/slack");

            toast.success("Slack disconnected successfully.");

            await fetchIntegration();
            window.dispatchEvent(new Event("integrationsUpdated"));
        } catch (err: any) {
            console.error("SLACK DISCONNECT ERROR:", err);

            toast.error(
                err.response?.data?.message ||
                "Failed to disconnect Slack."
            );
        }
    };

    const saveChannel = async () => {
        try {
            const channel = channels.find(
                (c) => c.id === selectedChannel
            );

            if (!channel) return;

            await API.put("/integrations/slack/channel", {
                channelId: channel.id,
                channelName: channel.name,
            });

            await fetchIntegration();

            toast.success(
                "Slack notification channel updated successfully."
            );
        } catch (err: any) {
            console.error("SLACK CHANNEL SAVE ERROR:", err);

            toast.error(
                err.response?.data?.message ||
                "Failed to save Slack channel."
            );
        }
    };

    const saveNotifications = async () => {
        try {
            await API.put(
                "/integrations/slack/notifications",
                notifications,
            );

            toast.success(
                "Notification preferences updated successfully."
            );
        } catch (err: any) {
            console.error("SLACK NOTIFICATION SAVE ERROR:", err);

            toast.error(
                err.response?.data?.message ||
                "Failed to update notification preferences."
            );
        }
    };

    const sendTestMessage = async () => {
        try {
            const { data } = await API.post(
                "/integrations/slack/test-message"
            );

            toast.success(
                data.message || "Test message sent successfully."
            );
        } catch (err: any) {
            console.error("SLACK TEST MESSAGE ERROR:", err);

            toast.error(
                err?.response?.data?.message ||
                "Failed to send test message."
            );
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
            {/* Back Button */}
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
                    src="/icons/slack.png"
                    alt="Slack"
                    width={48}
                    height={48}
                    className="shrink-0"
                />

                <div className="min-w-0">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Slack Integration
                    </h1>

                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
                        Get work reports and notifications delivered directly to your
                        team&apos;s Slack workspace.
                    </p>
                </div>
            </div>

            <div className="space-y-6">
                {/* Main Connect / Connected Card */}
                {integration?.connected ? (
                    <>
                        <div
                            aria-busy={loading}
                            data-loading={loading ? "true" : "false"}
                            className="rounded-xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-4 sm:p-6"
                        >
                            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        ✓ Connected
                                    </span>
                                </div>

                                <button
                                    onClick={disconnectSlack}
                                    className="text-sm text-red-600 dark:text-red-400 transition hover:text-red-700"
                                >
                                    Disconnect
                                </button>
                            </div>

                            <dl className="mb-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                                <div>
                                    <dt className="text-gray-500 dark:text-gray-400">Connected Workspace</dt>
                                    <dd className="break-words font-medium text-gray-900 dark:text-white">
                                        <h3 className="font-medium text-gray-900 dark:text-white">
                                            {integration.workspaceName}
                                        </h3>
                                    </dd>
                                </div>
                            </dl>

                            <div className="border-t border-gray-100 dark:border-gray-800 pt-6">
                                <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                                    Default Notification Channel
                                </h2>
                                <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                                    Choose the Slack channel where WorkComposer should post work
                                    summaries and approval updates.
                                </p>

                                <div className="mb-4 max-w-md">
                                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Channel
                                    </label>
                                    <select
                                        value={selectedChannel}
                                        onChange={(e) => setSelectedChannel(e.target.value)}
                                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900 dark:[color-scheme:dark]"
                                    >
                                        <option value="">Select a channel</option>

                                        {channels.map((channel) => (
                                            <option key={channel.id} value={channel.id}>
                                                #{channel.name}
                                                {channel.isPrivate ? " (Private)" : ""}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex flex-col gap-3 sm:flex-row">
                                    <button
                                        onClick={saveChannel}
                                        disabled={!selectedChannel}
                                        className="w-full rounded-lg bg-gray-900 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                                    >
                                        Save Channel
                                    </button>

                                    <button
                                        onClick={sendTestMessage}
                                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition hover:bg-gray-50 dark:hover:bg-slate-700 sm:w-auto"
                                    >
                                        Send Test Message
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-4 sm:p-6">
                            <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
                                Notification Preferences
                            </h3>

                            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                                Choose which WorkComposer events should be sent to Slack.
                            </p>

                            <div className="space-y-3">
                                {([
                                    ["taskAssigned", "Task Assigned"],
                                    ["taskUpdated", "Task Updated"],
                                    ["taskReassigned", "Task Reassigned"],
                                    ["taskCompleted", "Task Completed"],
                                    ["dailySummary", "Daily Summary"],
                                    ["weeklySummary", "Weekly Summary"],
                                    ["reportReady", "Report Ready"],
                                ] as Array<[keyof typeof notifications, string]>).map(([key, label]) => (
                                    <label
                                        key={key}
                                        className="flex items-center justify-between text-sm cursor-pointer"
                                    >
                                        <span className="font-medium text-gray-700 dark:text-gray-300">
                                            {label}
                                        </span>

                                        <input
                                            type="checkbox"
                                            checked={notifications[key as keyof typeof notifications]}
                                            onChange={(e) =>
                                                setNotifications({
                                                    ...notifications,
                                                    [key]: e.target.checked,
                                                })
                                            }
                                            className="h-4 w-4 rounded border-gray-300 dark:border-gray-700 accent-gray-900 dark:accent-indigo-500"
                                        />
                                    </label>
                                ))}
                            </div>

                            <button
                                onClick={saveNotifications}
                                className="mt-6 w-full rounded-lg bg-gray-900 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 sm:w-auto"
                            >
                                Save Notification Preferences
                            </button>
                        </div>
                    </>
                ) : (
                    <div
                        aria-busy={loading}
                        data-loading={loading ? "true" : "false"}
                        className="rounded-xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-4 sm:p-6"
                    >
                        <h2 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
                            Connect Your Slack Workspace
                        </h2>

                        <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
                            Link your Slack workspace to receive daily work reports, idle alerts,
                            task assignments, and manual time approval requests — all delivered
                            directly inside Slack.
                        </p>

                        <div className="flex flex-col items-start gap-3">
                            <button
                                onClick={connectSlack}
                                disabled={oauthWaiting}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                            >
                                <Image
                                    src="/icons/slack.png"
                                    alt="Slack"
                                    width={18}
                                    height={18}
                                />
                                {oauthWaiting ? "Waiting for Slack Authorization..." : "Add to Slack"}
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

                {/* Features */}
                <div className="rounded-xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-4 sm:p-6">
                    <h3 className="mb-5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        What You&apos;ll Get
                    </h3>

                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
                        {features.map((feature) => (
                            <FeatureCard
                                key={feature.title}
                                icon={feature.icon}
                                title={feature.title}
                                description={feature.description}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}