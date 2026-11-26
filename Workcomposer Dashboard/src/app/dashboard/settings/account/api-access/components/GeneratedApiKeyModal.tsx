"use client";

import { useState } from "react";
import toast from "react-hot-toast";

type Props = {
    open: boolean;
    apiKey: string;
    keyName: string;
    onClose: () => void;
};

export default function GeneratedApiKeyModal({
    open,
    apiKey,
    keyName,
    onClose,
}: Props) {

    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(apiKey);

            setCopied(true);

            toast.success("API key copied to clipboard.");

            setTimeout(() => {
                setCopied(false);
            }, 2000);
        } catch (error) {
            console.error("Failed to copy API key", error);

            toast.error("Failed to copy API key.");
        }
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/75 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-3xl rounded-2xl bg-white dark:bg-slate-800 border border-transparent dark:border-slate-700 shadow-2xl p-6 md:p-8"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                    New API key generation
                </h2>

                <p className="mt-6 text-green-600 dark:text-green-400 font-medium">
                    API Key generated successfully.
                </p>

                <p className="mt-4 text-lg font-medium text-gray-900 dark:text-slate-200">
                    Make sure to copy your API Key now. For security reasons, it won&#39;t be displayed again.
                </p>

                <hr className="my-8 border-gray-200 dark:border-slate-700" />

                <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-center">
                    <span className="font-semibold text-gray-900 dark:text-white md:w-24">
                        {keyName}
                    </span>

                    <div className="flex flex-1 gap-3">
                        <div className="flex-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 px-4 py-3">
                            <code className="break-all text-sm text-gray-900 dark:text-slate-100">
                                {apiKey}
                            </code>
                        </div>

                        <button
                            onClick={handleCopy}
                            className="rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-5 py-3 text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-600"
                        >
                            {copied ? "Copied!" : "Copy"}
                        </button>
                    </div>
                </div>

                <div className="mt-8 flex justify-center">
                    <button
                        onClick={onClose}
                        className="rounded-lg bg-blue-600 px-8 py-3 text-white hover:bg-blue-500"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}