"use client";

import { useEffect } from "react";

/**
 * Guards against accidental navigation or tab closure when a form contains unsaved modifications.
 *
 * Mechanics:
 * 1. Attaches `beforeunload` handler to guard against browser tab/window close, reload, or external navigation.
 * 2. Attaches document click capturing to guard internal `<a href="...">` link clicks while dirty.
 * 3. Never intercepts button elements (`<button>`), preserving timer start/stop, dropdowns, and modal triggers.
 * 4. Zero overhead or event listeners when `isDirty` is false.
 */
export function useUnsavedChangesWarning(isDirty: boolean) {
    useEffect(() => {
        if (!isDirty) return;

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = "";
            return "";
        };

        const handleDocumentClick = (e: MouseEvent) => {
            // Find closest link ancestor
            const anchor = (e.target as HTMLElement)?.closest("a");
            if (!anchor || !anchor.href) return;

            // Ignore external target="_blank", mailto, javascript:, and file downloads
            if (
                anchor.target === "_blank" ||
                anchor.href.startsWith("javascript:") ||
                anchor.href.startsWith("mailto:") ||
                anchor.getAttribute("download") !== null
            ) {
                return;
            }

            // Check if navigating to a different URL
            const currentUrl = window.location.href;
            if (anchor.href === currentUrl || anchor.href === `${currentUrl}#`) {
                return;
            }

            // Prompt user before client-side navigation
            const confirmed = window.confirm(
                "You have unsaved changes. Are you sure you want to leave this page?"
            );

            if (!confirmed) {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        document.addEventListener("click", handleDocumentClick, true);

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
            document.removeEventListener("click", handleDocumentClick, true);
        };
    }, [isDirty]);
}
