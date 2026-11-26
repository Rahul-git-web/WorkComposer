"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, AlertOctagon, CheckCircle2, X } from "lucide-react";

export type CaptureStatusType = "NORMAL" | "THROTTLE" | "PAUSE";

export interface ScreenshotCaptureStatusState {
  status: CaptureStatusType;
  reason: string | null;
  warning?: string | undefined;
  usagePercent?: number | undefined;
  count?: number | undefined;
  maxCount?: number | undefined;
  freeBytes?: number | undefined;
  reserveBytes?: number | undefined;
  previousReason?: string | undefined;
}

export const TOAST_ID_CAPTURE_STATUS = "screenshot-capture-status";
export const TOAST_ID_CAPTURE_RESUME = "screenshot-capture-resumed";

/**
 * Sanitizes and formats user-facing copy without leaking sensitive file paths,
 * tokens, user identifiers, or technical stack traces.
 */
export function getCaptureNotificationContent(
  status: CaptureStatusType,
  reason?: string | null,
  data?: Record<string, any>
) {
  if (status === "PAUSE") {
    if (reason === "OFFLINE_QUEUE_FULL") {
      return {
        title: "Screenshot Capture Paused",
        badge: "Offline Storage Full",
        description:
          "Offline screenshot storage is at capacity. Existing screenshots are safely retained. Capture will resume automatically when offline screenshots are uploaded or capacity is freed.",
      };
    }
    if (reason === "INSUFFICIENT_HOST_STORAGE") {
      return {
        title: "Screenshot Capture Paused",
        badge: "Low Host Storage",
        description:
          "Host disk space has fallen below the 500 MB safety reserve. Existing screenshots are safely retained. Capture will resume automatically once local disk space is restored.",
      };
    }
    return {
      title: "Screenshot Capture Paused",
      badge: "Storage Protection",
      description:
        "Screenshot capture is temporarily paused. Existing screenshots are safely retained and capture will resume when conditions recover.",
    };
  }

  if (status === "THROTTLE") {
    return {
      title: "Screenshot Capture Slowed",
      badge: "Storage Filling",
      description:
        "Screenshot capture frequency has been temporarily slowed because offline screenshot storage is approaching capacity.",
    };
  }

  // RESUMED / NORMAL
  return {
    title: "Screenshot Capture Resumed",
    badge: "Active",
    description:
      "Storage and capture readiness have recovered. Normal screenshot capture has resumed.",
  };
}

/**
 * Hook to subscribe to Electron Safe-Retain screenshot capture lifecycle events.
 * Manages toast notifications with deduplication, accessible semantics, theme awareness,
 * and automatic cleanup on unmount or account switching.
 */
export function useScreenshotCaptureNotifications() {
  const [captureStatus, setCaptureStatus] = useState<ScreenshotCaptureStatusState>({
    status: "NORMAL",
    reason: null,
  });

  const lastStatusRef = useRef<CaptureStatusType>("NORMAL");
  const lastReasonRef = useRef<string | null>(null);

  const renderToast = useCallback(
    (
      status: CaptureStatusType,
      reason?: string | null,
      data?: Record<string, any>
    ) => {
      const content = getCaptureNotificationContent(status, reason, data);
      const isPause = status === "PAUSE";
      const isThrottle = status === "THROTTLE";
      const isResume = status === "NORMAL";

      // If resuming, dismiss any pending pause/throttle toast first
      if (isResume) {
        toast.dismiss(TOAST_ID_CAPTURE_STATUS);
      }

      toast.custom(
        (t) =>
          React.createElement(
            "div",
            {
              id: isResume ? "toast-capture-resumed" : "toast-capture-status",
              role: isPause ? "alert" : "status",
              "aria-live": isPause ? "assertive" : "polite",
              "aria-label": content.title,
              className: `pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border p-4 shadow-xl transition-all duration-300 ${
                t.visible ? "opacity-100 scale-100" : "opacity-0 scale-95"
              } ${
                isPause
                  ? "border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-[#201013] dark:text-red-100"
                  : isThrottle
                  ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-[#221a10] dark:text-amber-100"
                  : "border-green-300 bg-green-50 text-green-950 dark:border-green-800 dark:bg-[#102216] dark:text-green-100"
              }`,
            },
            React.createElement(
              "div",
              { className: "flex-shrink-0 pt-0.5" },
              isPause &&
                React.createElement(
                  "div",
                  {
                    className:
                      "flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300",
                    "aria-hidden": "true",
                  },
                  React.createElement(AlertOctagon, { className: "h-5 w-5" })
                ),
              isThrottle &&
                React.createElement(
                  "div",
                  {
                    className:
                      "flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-300",
                    "aria-hidden": "true",
                  },
                  React.createElement(AlertTriangle, { className: "h-5 w-5" })
                ),
              isResume &&
                React.createElement(
                  "div",
                  {
                    className:
                      "flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-300",
                    "aria-hidden": "true",
                  },
                  React.createElement(CheckCircle2, { className: "h-5 w-5" })
                )
            ),
            React.createElement(
              "div",
              { className: "flex-1 min-w-0" },
              React.createElement(
                "div",
                { className: "flex items-center gap-2" },
                React.createElement(
                  "h4",
                  { className: "text-sm font-semibold tracking-tight" },
                  content.title
                ),
                React.createElement(
                  "span",
                  {
                    className: `inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide ${
                      isPause
                        ? "bg-red-200/80 text-red-800 dark:bg-red-900/80 dark:text-red-200"
                        : isThrottle
                        ? "bg-amber-200/80 text-amber-800 dark:bg-amber-900/80 dark:text-amber-200"
                        : "bg-green-200/80 text-green-800 dark:bg-green-900/80 dark:text-green-200"
                    }`,
                  },
                  content.badge
                )
              ),
              React.createElement(
                "p",
                { className: "mt-1 text-xs leading-relaxed opacity-90" },
                content.description
              )
            ),
            React.createElement(
              "button",
              {
                type: "button",
                onClick: () => toast.dismiss(t.id),
                "aria-label": "Dismiss notification",
                className:
                  "ml-2 inline-flex flex-shrink-0 rounded-lg p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2",
              },
              React.createElement(X, { className: "h-4 w-4", "aria-hidden": "true" })
            )
          ),
        {
          id: isResume ? TOAST_ID_CAPTURE_RESUME : TOAST_ID_CAPTURE_STATUS,
          // Pause notifications stay visible until recovery or user dismissal
          duration: isPause ? Infinity : isThrottle ? 8000 : 5000,
        }
      );
    },
    []
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.electronAPI) {
      return;
    }

    const cleanups: Array<() => void> = [];

    // 1. Initial State Pre-flight: Check queue readiness on renderer mount
    if (typeof window.electronAPI.getOfflineQueueStatus === "function") {
      window.electronAPI
        .getOfflineQueueStatus()
        .then((queueStatus) => {
          if (queueStatus?.readiness && !queueStatus.readiness.ok) {
            const reason = queueStatus.readiness.reason || "OFFLINE_QUEUE_FULL";
            setCaptureStatus({
              status: "PAUSE",
              reason,
              warning: queueStatus.readiness.warning,
              count: queueStatus.readiness.count,
              maxCount: queueStatus.readiness.maxCount,
              freeBytes: queueStatus.readiness.freeBytes,
              reserveBytes: queueStatus.readiness.reserveBytes,
            });
            lastStatusRef.current = "PAUSE";
            lastReasonRef.current = reason;
            renderToast("PAUSE", reason, queueStatus.readiness);
          }
        })
        .catch(() => {
          // Graceful handling of unexpected IPC errors
        });
    }

    // 2. Event: screenshot-capture-paused
    if (typeof window.electronAPI.onScreenshotCapturePaused === "function") {
      const unsubPause = window.electronAPI.onScreenshotCapturePaused((payload) => {
        const safeReason = payload?.reason || "OFFLINE_QUEUE_FULL";
        setCaptureStatus({
          status: "PAUSE",
          reason: safeReason,
          warning: payload?.warning,
          usagePercent: payload?.usagePercent,
          count: payload?.count,
          maxCount: payload?.maxCount,
          freeBytes: payload?.freeBytes,
          reserveBytes: payload?.reserveBytes,
        });
        lastStatusRef.current = "PAUSE";
        lastReasonRef.current = safeReason;
        renderToast("PAUSE", safeReason, payload || {});
      });
      if (typeof unsubPause === "function") cleanups.push(unsubPause);
    }

    // 3. Event: screenshot-capture-throttled
    if (typeof window.electronAPI.onScreenshotCaptureThrottled === "function") {
      const unsubThrottle = window.electronAPI.onScreenshotCaptureThrottled((payload) => {
        // Do not downgrade a PAUSE to THROTTLE
        if (lastStatusRef.current === "PAUSE") return;

        setCaptureStatus({
          status: "THROTTLE",
          reason: payload?.reason || "THROTTLE",
          warning: payload?.warning,
          usagePercent: payload?.usagePercent,
          count: payload?.count,
          maxCount: payload?.maxCount,
        });
        lastStatusRef.current = "THROTTLE";
        lastReasonRef.current = "THROTTLE";
        renderToast("THROTTLE", "THROTTLE", payload || {});
      });
      if (typeof unsubThrottle === "function") cleanups.push(unsubThrottle);
    }

    // 4. Event: screenshot-capture-resumed
    if (typeof window.electronAPI.onScreenshotCaptureResumed === "function") {
      const unsubResume = window.electronAPI.onScreenshotCaptureResumed((payload) => {
        const prev = payload?.previousReason || lastReasonRef.current || undefined;
        setCaptureStatus({
          status: "NORMAL",
          reason: null,
          previousReason: prev,
        });
        lastStatusRef.current = "NORMAL";
        lastReasonRef.current = null;
        renderToast("NORMAL", null, { previousReason: prev });
      });
      if (typeof unsubResume === "function") cleanups.push(unsubResume);
    }

    // 5. Account Isolation: Clear notifications on logout or device sign-out
    const handleAccountReset = () => {
      toast.dismiss(TOAST_ID_CAPTURE_STATUS);
      toast.dismiss(TOAST_ID_CAPTURE_RESUME);
      setCaptureStatus({ status: "NORMAL", reason: null });
      lastStatusRef.current = "NORMAL";
      lastReasonRef.current = null;
    };

    if (typeof window.electronAPI.onDeviceSignedOut === "function") {
      const unsubSignOut = window.electronAPI.onDeviceSignedOut(handleAccountReset);
      if (typeof unsubSignOut === "function") cleanups.push(unsubSignOut);
    }

    if (typeof window.electronAPI.onElectronLoggedOut === "function") {
      const unsubLoggedOut = window.electronAPI.onElectronLoggedOut(handleAccountReset);
      if (typeof unsubLoggedOut === "function") cleanups.push(unsubLoggedOut);
    }

    // Cleanup on unmount or hot reload
    return () => {
      cleanups.forEach((cleanup) => {
        try {
          cleanup();
        } catch {}
      });
      // Do not leave unmounted/dangling toasts
      toast.dismiss(TOAST_ID_CAPTURE_STATUS);
      toast.dismiss(TOAST_ID_CAPTURE_RESUME);
    };
  }, [renderToast]);

  return captureStatus;
}
