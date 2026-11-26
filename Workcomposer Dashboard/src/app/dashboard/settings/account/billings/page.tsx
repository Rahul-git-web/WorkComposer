"use client";

import { useState } from "react";
import Overview from "./components/Overview";
import Subscription from "./components/Subscription";
import PaymentBilling from "./components/PaymentBilling";
import Invoices from "./components/Invoices";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import API from "@/api";

export default function BillingPage() {
    const [activeTab, setActiveTab] = useState("overview");

    const searchParams = useSearchParams();

    useEffect(() => {
        const checkoutStatus =
            searchParams.get("checkout");

        const sessionId =
            searchParams.get("session_id");

        if (
            checkoutStatus !== "success" ||
            !sessionId
        ) {
            return;
        }

        const syncCheckout = async () => {
            try {
                const response = await API.post(
                    "/billing/sync-checkout-session",
                    {
                        sessionId,
                    }
                );

                // Remove checkout parameters from URL
                window.history.replaceState(
                    {},
                    "",
                    window.location.pathname
                );

            } catch (error: any) {
                console.error(
                    "STRIPE CHECKOUT SYNC ERROR:",
                    error.response?.data || error
                );
            }
        };

        syncCheckout();
    }, [searchParams]);

    return (
        <div className="space-y-6 p-10">

            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Billing & Usage
                </h1>

                <p className="mt-1 text-gray-500 dark:text-gray-400">
                    Manage your subscription, payment methods and invoices.
                </p>
            </div>

            {/* Tabs */}

            <div className="border-b border-gray-200 dark:border-gray-800">
                <nav className="flex gap-8">

                    <button
                        onClick={() => setActiveTab("overview")}
                        className={`pb-3 text-sm font-medium transition ${activeTab === "overview"
                            ? "text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400 font-semibold"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        }`}
                    >
                        Overview
                    </button>

                    <button
                        onClick={() => setActiveTab("subscription")}
                        className={`pb-3 text-sm font-medium transition ${activeTab === "subscription"
                            ? "text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400 font-semibold"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        }`}
                    >
                        Subscription
                    </button>

                    <button
                        onClick={() => setActiveTab("payment")}
                        className={`pb-3 text-sm font-medium transition ${activeTab === "payment"
                            ? "text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400 font-semibold"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        }`}
                    >
                        Payment & Billing
                    </button>

                    <button
                        onClick={() => setActiveTab("invoices")}
                        className={`pb-3 text-sm font-medium transition ${activeTab === "invoices"
                            ? "text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400 font-semibold"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        }`}
                    >
                        Invoices
                    </button>

                </nav>
            </div>

            {/* Content */}

            {activeTab === "overview" && (
                <Overview />
            )}

            {activeTab === "subscription" && (
                <Subscription />
            )}

            {activeTab === "payment" && (
                <PaymentBilling />
            )}

            {activeTab === "invoices" && (
                <Invoices />
            )}

        </div>
    );
}
