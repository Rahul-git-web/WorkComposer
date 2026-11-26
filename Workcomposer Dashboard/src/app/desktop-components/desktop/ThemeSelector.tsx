"use client";

import { Monitor, Sun, Moon } from "lucide-react";
import { useTheme, type ThemeMode, type EffectiveTheme } from "@/context/ThemeContext";

export type { ThemeMode, EffectiveTheme };

/**
 * Backward-compatible alias for existing consumers.
 * Routes directly to the centralized global ThemeContext.
 */
export function useDesktopTheme() {
    return useTheme();
}

export interface ThemeSelectorProps {
    themeMode?: ThemeMode;
    onThemeChange?: (mode: ThemeMode) => void;
    effectiveTheme?: EffectiveTheme;
    className?: string;
}

export default function ThemeSelector({
    themeMode,
    onThemeChange,
    effectiveTheme,
    className = "",
}: ThemeSelectorProps) {
    const contextTheme = useTheme();

    const currentMode = themeMode ?? contextTheme.themeMode;
    const handleThemeChange = onThemeChange ?? contextTheme.setThemeMode;
    const activeEffective = effectiveTheme ?? contextTheme.effectiveTheme;
    const isDark = activeEffective === "dark";

    const options: { mode: ThemeMode; label: string; icon: typeof Monitor }[] = [
        { mode: "system", label: "System", icon: Monitor },
        { mode: "light", label: "Light", icon: Sun },
        { mode: "dark", label: "Dark", icon: Moon },
    ];

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <span className={`text-[11px] font-semibold uppercase tracking-wider ${
                isDark ? "text-gray-400" : "text-gray-500"
            }`}>
                Theme
            </span>

            <div className={`flex items-center rounded-lg p-0.5 border ${
                isDark
                    ? "bg-[#0F172A] border-[#22324D]"
                    : "bg-gray-100 border-gray-300"
            }`}>
                {options.map(({ mode, label, icon: Icon }) => {
                    const active = currentMode === mode;
                    return (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => handleThemeChange(mode)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                                active
                                    ? "bg-blue-600 text-white shadow-sm font-semibold"
                                    : isDark
                                    ? "text-gray-400 hover:text-white hover:bg-white/5"
                                    : "text-gray-600 hover:text-gray-900 hover:bg-black/5"
                            }`}
                            title={`Switch to ${label} theme`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            <span>{label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
