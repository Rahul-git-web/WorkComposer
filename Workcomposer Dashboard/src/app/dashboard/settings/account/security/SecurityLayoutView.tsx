"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BsLock } from "react-icons/bs";
import { IoArrowUpCircleOutline, IoSearchCircleOutline } from "react-icons/io5";

export type SecurityLayoutProps = {
    children: React.ReactNode;
    desktop?: boolean;
    activeSecurityTab?: string;
    setActiveSecurityTab?: React.Dispatch<React.SetStateAction<string>>;
};

export default function SecurityLayoutView({
    children,
    desktop = false,
    activeSecurityTab,
    setActiveSecurityTab,
}: SecurityLayoutProps) {
    const pathname = usePathname();
    const router = useRouter();

    const isActive = (key: string, path: string) =>
        desktop
            ? activeSecurityTab === key
            : pathname.includes(path);

    const mobileSelectValue = desktop
        ? activeSecurityTab || "two-factor"
        : pathname.includes("/app-update")
        ? "app-update"
        : pathname.includes("/audit-log")
        ? "audit-log"
        : "two-factor";

    const handleMobileTabChange = (tabKey: string) => {
        if (desktop) {
            setActiveSecurityTab?.(tabKey);
            return;
        }
        router.push(`/dashboard/settings/account/security/${tabKey}`);
    };

    return (
        <div className="py-10 flex-1">
            <div className="mx-auto w-full max-w-[1700px] px-4 sm:px-6 lg:px-8">
                <div className="min-h-[calc(100vh-250px)] px-2 sm:px-4">

                    {/* Mobile tabs will come here */}
                    <div className="sm:hidden mb-6 px-6">
                        <div className="relative">
                            <select
                                value={mobileSelectValue}
                                onChange={(e) => handleMobileTabChange(e.target.value)}
                                className="w-full appearance-none rounded-md bg-wc-surface-2 py-3 pr-10 pl-4 text-base border border-wc-border focus:outline-none focus:ring-2 focus:ring-wc-primary focus:border-wc-primary text-gray-900 dark:text-white"
                            >
                                <option value="two-factor">
                                    Two Factor Authentication
                                </option>

                                <option value="app-update">
                                    App Updates
                                </option>

                                <option value="audit-log">
                                    Audit Log
                                </option>
                            </select>
                        </div>
                    </div>

                    {/* Desktop tabs */}
                    <div className="hidden sm:block mb-6 px-6">
                        <nav
                            className="flex gap-6 border-b border-gray-200 dark:border-slate-800"
                            aria-label="Tabs"
                        >
                            {desktop ? (
                                <button
                                    type="button"
                                    onClick={() =>
                                        setActiveSecurityTab?.("two-factor")
                                    }
                                    className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${isActive("two-factor", "/two-factor")
                                        ? "border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold"
                                        : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300 dark:hover:border-slate-700"
                                        }`}
                                >
                                    <BsLock className="w-4 h-4" />
                                    Two Factor Authentication
                                </button>
                            ) : (
                                <Link
                                    href="/dashboard/settings/account/security/two-factor"
                                    className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${isActive("two-factor", "/two-factor")
                                        ? "border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold"
                                        : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300 dark:hover:border-slate-700"
                                        }`}
                                >
                                    <BsLock className="w-4 h-4" />
                                    Two Factor Authentication
                                </Link>
                            )}

                            {desktop ? (
                                <button
                                    type="button"
                                    onClick={() =>
                                        setActiveSecurityTab?.("app-update")
                                    }
                                    className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${isActive("app-update", "/app-update")
                                        ? "border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold"
                                        : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300 dark:hover:border-slate-700"
                                        }`}
                                >
                                    <IoArrowUpCircleOutline className="w-4 h-4" />
                                    App Updates
                                </button>
                            ) : (
                                <Link
                                    href="/dashboard/settings/account/security/app-update"
                                    className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${isActive("app-update", "/app-update")
                                        ? "border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold"
                                        : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300 dark:hover:border-slate-700"
                                        }`}
                                >
                                    <IoArrowUpCircleOutline className="w-4 h-4" />
                                    App Updates
                                </Link>
                            )}

                            {desktop ? (
                                <button
                                    type="button"
                                    onClick={() =>
                                        setActiveSecurityTab?.("audit-log")
                                    }
                                    className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${isActive("audit-log", "/audit-log")
                                            ? "border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold"
                                            : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300 dark:hover:border-slate-700"
                                        }`}
                                >
                                    <IoSearchCircleOutline className="w-4 h-4" />
                                    Audit Log
                                </button>
                            ) : (
                                <Link
                                    href="/dashboard/settings/account/security/audit-log"
                                    className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${isActive("audit-log", "/audit-log")
                                            ? "border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 font-semibold"
                                            : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300 dark:hover:border-slate-700"
                                        }`}
                                >
                                    <IoSearchCircleOutline className="w-4 h-4" />
                                    Audit Log
                                </Link>
                            )}

                        </nav>
                    </div>

                    {children}

                </div>
            </div>
        </div>
    );
}

