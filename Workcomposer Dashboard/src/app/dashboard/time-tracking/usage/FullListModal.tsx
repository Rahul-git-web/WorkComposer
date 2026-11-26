"use client";

import { useEffect, useRef } from "react";
import { HiMiniCommandLine } from "react-icons/hi2";
import { X, Monitor } from "lucide-react";

type Props = {
    open: boolean;
    onClose: () => void;
    user: any;
};

export default function FullListModal({
    open,
    onClose,
    user,
}: Props) {

    const modalRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {

        if (!open) return;

        const handleClickOutside = (e: MouseEvent) => {

            if (
                modalRef.current &&
                !modalRef.current.contains(e.target as Node)
            ) {
                onClose();
            }

        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        };

        document.addEventListener(
            "mousedown",
            handleClickOutside
        );
        window.addEventListener("keydown", handleEscape);

        return () => {
            document.removeEventListener(
                "mousedown",
                handleClickOutside
            );
            window.removeEventListener("keydown", handleEscape);
        };

    }, [open, onClose]);

    const formatDuration = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (hours === 0 && minutes === 0) {
            return "<1m";
        }

        return `${hours}h ${minutes}m`;
    };

    useEffect(() => {

        if (!open) return;

        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = "auto";
        };

    }, [open]);

    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-md overscroll-contain"
        >

            <div
                ref={modalRef}
                className="
  bg-white
  dark:bg-slate-800
  border
  border-transparent
  dark:border-slate-700
  w-[95%]
  max-w-6xl
  max-h-[90vh]
  rounded-xl
  shadow-xl
  flex
  flex-col
  overscroll-contain
"
            >

                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">

                    <h2 className="flex items-center text-lg font-semibold text-gray-800 dark:text-white">
                        <HiMiniCommandLine className="h-7 w-7 text-blue-600 dark:text-blue-400 mr-4" />
                        All apps used by {user?.name}
                    </h2>

                    <button
                        onClick={onClose}
                        className="
    rounded-full
    p-2.5
    text-gray-400
    dark:text-slate-400
    hover:bg-gray-100
    dark:hover:bg-slate-700
    hover:text-gray-600
    dark:hover:text-slate-200
    transition-all
    duration-200
    border
    border-blue-200
    dark:border-slate-700
  "
                    >
                        <X className="h-6 w-6" />
                    </button>

                </div>

                <div className="p-6 overflow-y-auto flex-1">

                    {user?.apps?.length === 0 ? (

                        <div className="text-center py-16 text-gray-500 dark:text-slate-400">
                            No apps found
                        </div>

                    ) : (

                        <div className="overflow-x-auto">

                            <table className="w-full">

                                <thead className="sticky top-0 bg-gray-50 dark:bg-slate-900/60 z-10">

                                    <tr className="border-b border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/60">

                                        <th className="text-left px-6 py-4 text-xs text-gray-600 dark:text-slate-300 font-medium">
                                            APP
                                        </th>

                                        <th className="text-right px-6 py-4 text-xs text-gray-600 dark:text-slate-300 font-medium">
                                            DURATION
                                        </th>

                                    </tr>

                                </thead>

                                <tbody>

                                    {user.apps.map((app: any, index: number) => (

                                        <tr
                                            key={index}
                                            className="border-b border-gray-200 dark:border-slate-700/60 hover:bg-gray-50 dark:hover:bg-slate-700/40"
                                        >

                                            <td className="px-6 py-5">

                                                <div className="flex items-center gap-3">

                                                    <Monitor className="h-6 w-6 text-gray-800 dark:text-slate-300" />

                                                    <span className="font-medium text-sm text-gray-800 dark:text-white">
                                                        {app.name}
                                                    </span>

                                                </div>

                                            </td>

                                            <td className="px-6 py-5 text-right text-sm font-semibold text-gray-700 dark:text-slate-200">
                                                {formatDuration(app.duration)}
                                            </td>

                                        </tr>

                                    ))}

                                </tbody>

                            </table>

                        </div>
                    )}

                </div>

            </div>

        </div>
    );
}