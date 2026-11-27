"use client";

import { useState } from "react";
import { Pencil, Plus, CreditCard } from "lucide-react";
import toast from "react-hot-toast";
import { useBillingOverview } from "../hooks/useBillingOverview";
import EditBillingProfileModal from "./EditBillingProfileModal";

export default function PaymentBilling() {
    const {
        loading,
        billingProfile,
        paymentMethod,
        fetchOverview,
    } = useBillingOverview();

    const [editBillingOpen, setEditBillingOpen] = useState(false);

    if (loading) {
        return (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
                <div className="h-72 animate-pulse rounded-3xl bg-gray-200 dark:bg-slate-800 xl:col-span-3" />
                <div className="h-72 animate-pulse rounded-3xl bg-gray-200 dark:bg-slate-800 xl:col-span-2" />
            </div>
        );
    }

    return (
        <div className="grid gap-8 xl:grid-cols-5">

            {/* Billing */}

            <div className="flex min-h-[340px] flex-col rounded-3xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-8 shadow-sm lg:col-span-3">

                <div className="flex items-start justify-between">

                    <div>

                        <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">
                            Billing information
                        </h2>

                        <p className="mt-2 text-gray-500 dark:text-slate-400">
                            Shown on your invoices and tax receipts.
                        </p>

                    </div>

                    <button
                        onClick={() => setEditBillingOpen(true)}
                        className="flex items-center gap-2 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    >

                        <Pencil className="h-4 w-4" />

                        Edit

                    </button>

                </div>

                <div className="mt-12 space-y-3">

                    <p className="text-xl font-semibold text-gray-900 dark:text-white">
                        {billingProfile?.companyName || "Company Name"}
                    </p>

                    <p className="text-gray-600 dark:text-slate-300">
                        {billingProfile?.address || "Address"}
                    </p>

                    <p className="text-gray-600 dark:text-slate-300">
                        {billingProfile?.city}
                        {billingProfile?.city && ", "}
                        {billingProfile?.state}
                        {billingProfile?.postalCode && `, ${billingProfile.postalCode}`}
                        {billingProfile?.country && `, ${billingProfile.country}`}
                    </p>

                    <p className="text-gray-600 dark:text-slate-300">
                        {billingProfile?.contactName}
                        {billingProfile?.contactName && " · "}
                        {billingProfile?.email}
                    </p>

                </div>

            </div>

            {/* Payment */}

            <div className="flex min-h-[340px] flex-col rounded-3xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-8 shadow-sm lg:col-span-2">

                <div>

                    <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">
                        Payment methods
                    </h2>

                    <p className="mt-2 text-gray-500 dark:text-slate-400">
                        Cards we can charge automatically for your subscription.
                    </p>

                </div>

                <div className="flex h-full flex-col items-center justify-center pt-20">

                    {paymentMethod?.last4 ? (

                        <>
                            <div className="rounded-2xl border border-gray-200 dark:border-[#22324D] bg-gray-50 dark:bg-[#1E293B] p-5 w-full">

                                <p className="font-semibold capitalize text-gray-900 dark:text-white">
                                    {paymentMethod.brand}
                                </p>

                                <p className="mt-2 text-gray-600 dark:text-slate-300">
                                    •••• •••• •••• {paymentMethod.last4}
                                </p>

                                <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
                                    Expires {paymentMethod.expiryMonth}/{paymentMethod.expiryYear}
                                </p>

                            </div>

                        </>

                    ) : (

                        <>

                            <div className="mb-6 rounded-full bg-blue-50 dark:bg-blue-950/50 p-5">

                                <CreditCard className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                            </div>
                            <p className="mb-8 text-center text-lg text-gray-500 dark:text-slate-400">
                                No Debit/Credit Cards attached to your account yet.
                            </p>

                            <button
                                type="button"
                                onClick={() => {
                                    const subTab = Array.from(document.querySelectorAll("button")).find(
                                        (btn) => btn.textContent?.trim() === "Subscription"
                                    );
                                    if (subTab) {
                                        subTab.click();
                                        window.scrollTo({ top: 0, behavior: "smooth" });
                                    }
                                    toast("Select a plan or complete Stripe checkout to attach a payment card.");
                                }}
                                className="flex items-center gap-2 rounded-xl border border-blue-600 dark:border-blue-500 px-6 py-3 font-medium text-blue-600 dark:text-blue-400 transition hover:bg-blue-50 dark:hover:bg-blue-950/30 cursor-pointer"
                            >

                                <Plus className="h-5 w-5" />

                                Add Debit/Credit Card

                            </button>

                        </>

                    )}

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