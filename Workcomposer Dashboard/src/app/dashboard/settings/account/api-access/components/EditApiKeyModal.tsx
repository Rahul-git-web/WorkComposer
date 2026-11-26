"use client";

import { useEffect, useState } from "react";

type Props = {
    open: boolean;
    initialName: string;
    onClose: () => void;
    onSave: (name: string) => void;
};

export default function EditApiKeyModal({
    open,
    initialName,
    onClose,
    onSave,
}: Props) {
    const [name, setName] = useState(initialName);
    const [prevProps, setPrevProps] = useState({ open, initialName });

    if (prevProps.open !== open || prevProps.initialName !== initialName) {
        setPrevProps({ open, initialName });
        if (open) {
            setName(initialName);
        }
    }

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/75 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-800 border border-transparent dark:border-slate-700 shadow-2xl p-6 md:p-8"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                    Edit API Key
                </h2>

                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-6 w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                />

                <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                        onClick={onClose}
                        className="rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-6 py-2 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-600"
                    >
                        Cancel
                    </button>

                    <button
                        onClick={() => onSave(name)}
                        className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-500"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}