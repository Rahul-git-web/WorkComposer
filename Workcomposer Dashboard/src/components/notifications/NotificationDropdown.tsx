"use client";

import type { CSSProperties, Ref } from "react";
import {
    Bell,
    CheckCheck,
    Loader2,
} from "lucide-react";

import NotificationItem from "./NotificationItem";
import type { Notification } from "@/hooks/useNotifications";

type Props = {
    notifications: Notification[];
    unreadCount: number;
    loading: boolean;
    onRead: (id: string) => void;
    onMarkAllRead: () => void;
    onViewAll?: () => void;
    onNotificationClick?: (
        notification: Notification,
    ) => void;
    style?: CSSProperties | undefined;
    ref?: Ref<HTMLDivElement> | undefined;
};

export default function NotificationDropdown({
    notifications,
    unreadCount,
    loading,
    onRead,
    onMarkAllRead,
    onViewAll,
    onNotificationClick,
    style,
    ref,
}: Props) {

    // NotificationItem expects onClick to always exist.
    // Keep the parent prop optional by providing a safe fallback.
    const handleNotificationClick =
        onNotificationClick ?? (() => { });

    const positioningClasses = style
        ? "fixed z-[9999]"
        : "absolute right-0 top-full z-[9999] mt-3 w-[calc(100vw-2rem)] max-w-[390px]";

    return (
        <div
            ref={ref}
            style={style}
            className={`${positioningClasses} flex flex-col max-h-[min(520px,calc(100vh-5rem))] overflow-hidden rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl`}
        >

            {/* Header */}
            <div className="shrink-0 flex items-center justify-between border-b border-gray-200 dark:border-slate-700 px-4 py-3">
                <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Notifications
                    </h3>

                    {unreadCount > 0 && (
                        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-slate-400">
                            {unreadCount} unread
                        </p>
                    )}
                </div>

                {unreadCount > 0 && (
                    <button
                        type="button"
                        onClick={onMarkAllRead}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                    >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Mark all read
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                {loading ? (
                    <div className="flex h-40 items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-indigo-600 dark:text-indigo-400" />
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="flex h-48 flex-col items-center justify-center px-6 text-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-slate-700">
                            <Bell className="h-5 w-5 text-gray-400 dark:text-slate-500" />
                        </div>

                        <p className="mt-3 text-sm font-medium text-gray-700 dark:text-slate-200">
                            No notifications
                        </p>

                        <p className="mt-1 text-xs text-gray-400 dark:text-slate-400">
                            You&apos;re all caught up.
                        </p>
                    </div>
                ) : (
                    notifications.map((notification) => (
                        <NotificationItem
                            key={notification._id}
                            notification={notification}
                            onRead={onRead}
                            onClick={handleNotificationClick}
                        />
                    ))
                )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
                <div className="shrink-0 border-t border-gray-200 dark:border-slate-700 p-2">
                    <button
                        type="button"
                        onClick={onViewAll}
                        className="w-full rounded-lg py-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 transition hover:bg-indigo-50 dark:hover:bg-slate-700/50"
                    >
                        View all notifications
                    </button>
                </div>
            )}
        </div>
    );
}