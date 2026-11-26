"use client";

import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    useMemo,
} from "react";
import API from "@/api";
import socket from "@/socket/socket";

export type ThemeMode = "system" | "light" | "dark";
export type EffectiveTheme = "light" | "dark";

export interface ThemeContextValue {
    themeMode: ThemeMode;
    effectiveTheme: EffectiveTheme;
    setThemeMode: (mode: ThemeMode) => void;
}

const SHARED_STORAGE_KEY = "workcomposer_theme";
const LEGACY_STORAGE_KEY = "workcomposer_desktop_theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function resolveEffectiveTheme(mode: ThemeMode): EffectiveTheme {
    if (mode === "light") return "light";
    if (mode === "dark") return "dark";
    if (typeof window !== "undefined" && window.matchMedia) {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "dark"; // WorkComposer desktop baseline defaults to dark
}

export function getStoredThemeMode(): ThemeMode {
    if (typeof window === "undefined") return "system";
    try {
        const shared = localStorage.getItem(SHARED_STORAGE_KEY) as ThemeMode | null;
        if (shared === "system" || shared === "light" || shared === "dark") {
            return shared;
        }
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY) as ThemeMode | null;
        if (legacy === "system" || legacy === "light" || legacy === "dark") {
            return legacy;
        }
    } catch {
        // Ignore localStorage read errors (e.g. security sandboxes)
    }
    return "system";
}

export function applyThemeToDocument(effective: EffectiveTheme) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.setAttribute("data-theme", effective);
    if (effective === "dark") {
        root.classList.add("dark");
    } else {
        root.classList.remove("dark");
    }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
    const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>("dark");

    // Initialize state on mount from storage / OS
    useEffect(() => {
        const initialMode = getStoredThemeMode();
        const effective = resolveEffectiveTheme(initialMode);
        setThemeModeState(initialMode);
        setEffectiveTheme(effective);
        applyThemeToDocument(effective);
    }, []);

    // Listen for OS system theme changes while mode === "system"
    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        if (themeMode !== "system") return;

        const mql = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
            const nextEffective: EffectiveTheme = e.matches ? "dark" : "light";
            setEffectiveTheme(nextEffective);
            applyThemeToDocument(nextEffective);
        };

        if (mql.addEventListener) {
            mql.addEventListener("change", handleChange);
            return () => mql.removeEventListener("change", handleChange);
        } else if ((mql as any).addListener) {
            (mql as any).addListener(handleChange);
            return () => (mql as any).removeListener(handleChange);
        }
    }, [themeMode]);

    // Cross-window / cross-tab storage sync (Electron sub-windows and multi-tab browser)
    useEffect(() => {
        if (typeof window === "undefined") return;

        const handleStorage = (e: StorageEvent) => {
            if (e.key === SHARED_STORAGE_KEY || e.key === LEGACY_STORAGE_KEY) {
                const newMode = (e.newValue as ThemeMode) || "system";
                if (newMode === "system" || newMode === "light" || newMode === "dark") {
                    setThemeModeState(newMode);
                    const effective = resolveEffectiveTheme(newMode);
                    setEffectiveTheme(effective);
                    applyThemeToDocument(effective);
                }
            }
        };

        window.addEventListener("storage", handleStorage);
        return () => window.removeEventListener("storage", handleStorage);
    }, []);

    // Reconcile backend theme preference if user is authenticated
    useEffect(() => {
        if (typeof window === "undefined") return;

        let active = true;
        API.get("/settings/theme")
            .then((res) => {
                if (!active || !res?.data?.themeMode) return;
                const remoteMode = res.data.themeMode as ThemeMode;
                if (
                    remoteMode === "system" ||
                    remoteMode === "light" ||
                    remoteMode === "dark"
                ) {
                    const localMode = getStoredThemeMode();
                    if (localMode !== remoteMode) {
                        setThemeModeState(remoteMode);
                        const effective = resolveEffectiveTheme(remoteMode);
                        setEffectiveTheme(effective);
                        applyThemeToDocument(effective);
                        try {
                            localStorage.setItem(SHARED_STORAGE_KEY, remoteMode);
                            localStorage.setItem(LEGACY_STORAGE_KEY, remoteMode);
                        } catch {}
                    }
                }
            })
            .catch(() => {
                // Silently ignore if unauthenticated or offline
            });

        return () => {
            active = false;
        };
    }, []);

    // Real-time synchronization across Web and Desktop via socket
    useEffect(() => {
        if (typeof window === "undefined" || !socket) return;

        const handleRemoteTheme = (data: { themeMode: ThemeMode }) => {
            const nextMode = data?.themeMode;
            if (
                nextMode === "system" ||
                nextMode === "light" ||
                nextMode === "dark"
            ) {
                setThemeModeState((prev) => {
                    if (prev === nextMode) return prev;
                    const effective = resolveEffectiveTheme(nextMode);
                    setEffectiveTheme(effective);
                    applyThemeToDocument(effective);
                    try {
                        localStorage.setItem(SHARED_STORAGE_KEY, nextMode);
                        localStorage.setItem(LEGACY_STORAGE_KEY, nextMode);
                    } catch {}
                    return nextMode;
                });
            }
        };

        socket.on("themePreferenceUpdated", handleRemoteTheme);
        return () => {
            socket.off("themePreferenceUpdated", handleRemoteTheme);
        };
    }, []);

    const setThemeMode = useCallback((mode: ThemeMode) => {
        setThemeModeState(mode);
        const effective = resolveEffectiveTheme(mode);
        setEffectiveTheme(effective);
        applyThemeToDocument(effective);

        try {
            localStorage.setItem(SHARED_STORAGE_KEY, mode);
            localStorage.setItem(LEGACY_STORAGE_KEY, mode);
        } catch (err) {
            console.error("Failed to persist theme preference:", err);
        }

        // Notify socket peers across Web and Desktop
        try {
            if (socket) {
                socket.emit("updateThemePreference", { themeMode: mode });
            }
        } catch {}

        // Persist to backend preference store
        API.put("/settings/theme", { themeMode: mode }).catch(() => {
            // Silently ignore if unauthenticated or offline
        });
    }, []);

    const contextValue = useMemo<ThemeContextValue>(() => ({
        themeMode,
        effectiveTheme,
        setThemeMode,
    }), [themeMode, effectiveTheme, setThemeMode]);

    return (
        <ThemeContext.Provider value={contextValue}>
            {children}
        </ThemeContext.Provider>
    );
}

const fallbackContext: ThemeContextValue = {
    themeMode: "system",
    effectiveTheme: "dark",
    setThemeMode: () => { },
};

export function useTheme(): ThemeContextValue {
    const context = useContext(ThemeContext);
    if (!context) {
        return fallbackContext;
    }
    return context;
}

export default ThemeContext;

