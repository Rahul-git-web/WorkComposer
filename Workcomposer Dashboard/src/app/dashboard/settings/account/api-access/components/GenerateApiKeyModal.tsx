"use client";

import { useState } from "react";

type Props = {
    open: boolean;
    onClose: () => void;
    onGenerate: (name: string) => void;
};

export default function GenerateApiKeyModal({
    open,
    onClose,
    onGenerate,
}: Props) {

    const [apiKeyName, setApiKeyName] = useState("");
    const [error, setError] = useState("");

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
                    New API key generation
                </h2>

                <input
                    type="text"
                    placeholder="Please type API key name"
                    value={apiKeyName}
                    onChange={(e) => {
                        setApiKeyName(e.target.value);

                        if (error) {
                            setError("");
                        }
                    }}
                    className="mt-6 w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                />

                {error && (
                    <p className="mt-2 text-sm text-red-500 dark:text-red-400">
                        {error}
                    </p>
                )}

                <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                        onClick={() => {
                            setApiKeyName("");
                            setError("");
                            onClose();
                        }}
                        className="rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-6 py-2 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-600"
                    >
                        Cancel
                    </button>

                    <button
                        onClick={() => {
                            if (!apiKeyName.trim()) {
                                setError("API key name is required.");
                                return;
                            }

                            onGenerate(apiKeyName.trim());

                            setApiKeyName("");
                            setError("");
                            onClose();
                        }}
                        className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-500"
                    >
                        Generate
                    </button>
                </div>
            </div>
        </div>
    );
}