"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import socket from "@/socket/socket";
import useNotifications from "@/hooks/useNotifications";
import type { Notification } from "@/hooks/useNotifications";
import NotificationDropdown from "./NotificationDropdown";
import { useOptionalDesktop } from "@/context/DesktopContext";

const emptySubscribe = () => () => {};

export default function NotificationBell() {
    const router = useRouter();
    const desktop = useOptionalDesktop();
    const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

    const [open, setOpen] = useState(false);
    const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
    const containerRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const portalRef = useRef<HTMLDivElement>(null);

    const {
        notifications,
        unreadCount,
        loading,
        markAsRead,
        markAllAsRead,
    } = useNotifications();

    const updatePosition = useCallback(() => {
        if (!buttonRef.current || typeof window === "undefined") return;
        const rect = buttonRef.current.getBoundingClientRect();
        const margin = 16;
        const width = Math.min(390, Math.max(240, window.innerWidth - margin * 2));
        const top = Math.max(8, Math.round(rect.bottom + 8));
        const rawRight = Math.round(window.innerWidth - rect.right);
        const maxRight = Math.max(margin, window.innerWidth - width - margin);
        const right = Math.min(Math.max(margin, rawRight), maxRight);
        const maxHeight = Math.max(220, Math.min(520, window.innerHeight - top - margin));

        setDropdownStyle({
            position: "fixed",
            top: `${top}px`,
            right: `${right}px`,
            width: `${width}px`,
            maxHeight: `${maxHeight}px`,
            zIndex: 9999,
        });
    }, []);

    useEffect(() => {
        if (!open) return;

        const handleClickOutside = (
            event: MouseEvent,
        ) => {
            const target = event.target;
            if (
                target instanceof Node &&
                (containerRef.current?.contains(target) ||
                    portalRef.current?.contains(target))
            ) {
                return;
            }
            setOpen(false);
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
            }
        };

        updatePosition();
        document.addEventListener("mousedown", handleClickOutside);
        window.addEventListener("keydown", handleEscape);
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            window.removeEventListener("keydown", handleEscape);
            window.removeEventListener("resize", updatePosition);
            window.removeEventListener("scroll", updatePosition, true);
        };
    }, [open, updatePosition]);

    useEffect(() => {
        if (!desktop) {
            return;
        }

        const handleNewNotification = (
            notification: Notification,
        ) => {
            window.electronAPI?.showSystemNotification(
                notification.title,
                notification.message,
            );
        };

        socket.on(
            "notification:new",
            handleNewNotification,
        );

        return () => {
            socket.off(
                "notification:new",
                handleNewNotification,
            );
        };
    }, [desktop]);

    const handleNotificationClick = (
        notification: Notification,
    ) => {
        if (
            notification.entityType === "task" &&
            notification.entityId
        ) {
            setOpen(false);

            if (desktop) {
                desktop.setActivePage("task-management");
                return;
            }

            router.push(
                `/dashboard/task-management?task=${notification.entityId}`,
            );
        }
    };

    const handleViewAll = () => {
        setOpen(false);

        if (desktop) {
            desktop.setActivePage("notifications");
            return;
        }

        router.push("/dashboard/notifications");
    };

    return (
        <div
            ref={containerRef}
            className="relative"
        >
            <button
                ref={buttonRef}
                type="button"
                aria-label="Notifications"
                aria-expanded={open}
                onClick={() => {
                    if (!open) {
                        updatePosition();
                    }
                    setOpen((value) => !value);
                }}
                className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 dark:text-slate-400 transition hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-slate-200"
            >
                <Bell className="h-5 w-5" />

                {unreadCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex min-w-[17px] h-[17px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[9px] font-bold text-white ring-2 ring-white dark:ring-[#162742]">
                        {unreadCount > 99
                            ? "99+"
                            : unreadCount}
                    </span>
                )}
            </button>

            {open && mounted &&
                createPortal(
                    <NotificationDropdown
                        ref={portalRef}
                        style={dropdownStyle}
                        notifications={notifications}
                        unreadCount={unreadCount}
                        loading={loading}
                        onRead={markAsRead}
                        onMarkAllRead={markAllAsRead}
                        onViewAll={handleViewAll}
                        onNotificationClick={
                            handleNotificationClick
                        }
                    />,
                    document.body,
                )}
        </div>
    );
}