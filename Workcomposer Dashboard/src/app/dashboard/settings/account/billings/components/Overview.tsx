"use client";

import { useState } from "react";
import { useBillingOverview } from "../hooks/useBillingOverview";
import EditBillingProfileModal from "./EditBillingProfileModal";
import {
    CreditCard,
    Building2,
    BadgeCheck,
    AlertTriangle,
} from "lucide-react";

type OverviewProps = {
    onManageSubscription?: () => void;
    onManagePayment?: () => void;
};

export default function Overview({
    onManageSubscription,
    onManagePayment,
}: OverviewProps = {}) {
    const {
        loading,
        subscription,
        billingProfile,
        paymentMethod,
        fetchOverview,
    } = useBillingOverview();

    const [editBillingOpen, setEditBillingOpen] = useState(false);

    const navigateToBillingTab = (tabLabel: string, fallbackCallback?: () => void) => {
        if (fallbackCallback) {
            fallbackCallback();
            return;
        }
        const tabBtn = Array.from(document.querySelectorAll("button")).find(
            (btn) => btn.textContent?.trim() === tabLabel
        );
        if (tabBtn) {
            tabBtn.click();
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    };

    if (loading) {
        return (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                {[1, 2, 3].map((item) => (
                    <div
                        key={item}
                        className="h-72 animate-pulse rounded-2xl bg-gray-200 dark:bg-slate-800"
                    />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-6 bg-gray-50 dark:bg-transparent min-h-screen p-6">

            {!paymentMethod?.last4 && (
                <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-3">
                    <div className="flex items-start gap-4">

                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
                            <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                        </div>

                        <div className="flex-1">
                            <h3 className="text-md font-semibold text-red-900 dark:text-red-300">
                                Payment Method Required
                            </h3>

                            <p className="mt-0.5 text-sm text-red-700 dark:text-red-400">
                                Add a payment method to keep your subscription active and enable automatic renewals.
                            </p>
                        </div>

                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">

                <div className="flex h-full flex-col rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <BadgeCheck className="h-5 w-5 text-green-600" />
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                Current Plan
                            </h3>
                        </div>

                        <span className="rounded-full bg-green-100 dark:bg-green-950/40 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-400 capitalize">
                            {subscription?.status ?? "Unknown"}
                        </span>
                    </div>

                    <div className="mt-6 flex-1 space-y-6">

                        <div>
                            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Plan
                            </p>

                            <span className="inline-flex rounded-full bg-gray-100 dark:bg-slate-800 px-3 py-1 text-sm font-medium text-gray-800 dark:text-gray-200 capitalize">
                                {subscription?.plan}
                            </span>
                        </div>

                        <div>
                            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Billing Cycle
                            </p>


                            <span className="inline-flex rounded-full bg-gray-100 dark:bg-slate-800 px-3 py-1 text-sm font-medium text-gray-800 dark:text-gray-200 capitalize">
                                {subscription?.billingCycle}
                            </span>
                        </div>

                    </div>

                    <button
                        type="button"
                        onClick={() =>
                            navigateToBillingTab("Subscription", onManageSubscription)
                        }
                        className="mt-6 w-full bg-indigo-700 text-white rounded-lg border border-transparent px-4 py-2 text-sm font-medium transition hover:bg-indigo-500"
                    >
                        Manage Subscription
                    </button>
                </div>

                <div className="flex h-full flex-col rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CreditCard className="h-5 w-5 text-blue-600" />
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                Payment Method
                            </h3>
                        </div>
                    </div>

                    {paymentMethod?.last4 ? (
                        <div className="mt-6 flex-1 space-y-6">

                            <div>
                                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    Card
                                </p>

                                <p className="mt-1 font-medium capitalize text-gray-900 dark:text-white">
                                    {paymentMethod.brand} •••• {paymentMethod.last4}
                                </p>
                            </div>

                            <div>
                                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    Expires
                                </p>

                                <p className="mt-1 text-gray-800 dark:text-gray-200">
                                    {paymentMethod.expiryMonth}/{paymentMethod.expiryYear}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() =>
                                    navigateToBillingTab("Payment & Billing", onManagePayment)
                                }
                                className="mt-4 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition hover:bg-gray-50 dark:hover:bg-slate-800"
                            >
                                Update Payment Method
                            </button>

                        </div>
                    ) : (
                        <div className="mt-6">

                            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                No payment method has been added yet.
                            </p>

                            <button
                                type="button"
                                onClick={() =>
                                    navigateToBillingTab("Payment & Billing", onManagePayment)
                                }
                                className="mt-6 w-full rounded-lg bg-black dark:bg-white dark:text-black px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 dark:hover:bg-gray-200"
                            >
                                Add Payment Method
                            </button>

                        </div>
                    )}
                </div>

                <div className="flex h-full flex-col rounded-2xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Building2 className="h-5 w-5 text-purple-600" />
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                Billing Details
                            </h3>
                        </div>
                    </div>

                    <div className="mt-6 flex-1 space-y-6">

                        <div>
                            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Company
                            </p>

                            <p className="text-gray-400 italic">
                                {billingProfile?.companyName || "Not provided"}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Billing Email
                            </p>

                            <p className="text-gray-400 italic">
                                {billingProfile?.email || "Not provided"}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Address
                            </p>

                            <p className="text-gray-400 italic">
                                {billingProfile?.address || "Not provided"}
                            </p>
                        </div>

                        <div>
                            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Country
                            </p>

                            <p className="text-gray-400 italic">
                                {billingProfile?.country || "Not provided"}
                            </p>
                        </div>

                    </div>

                    <button
                        type="button"
                        onClick={() => setEditBillingOpen(true)}
                        className="mt-6 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition hover:bg-gray-50 dark:hover:bg-slate-800"
                    >
                        Edit Billing Details
                    </button>
                </div>

            </div>

            <EditBillingProfileModal
                open={editBillingOpen}
                onClose={() => setEditBillingOpen(false)}
                billingProfile={billingProfile}
                onUpdated={() => {
                    fetchOverview();
                }}
            />

        </div>
    );
}