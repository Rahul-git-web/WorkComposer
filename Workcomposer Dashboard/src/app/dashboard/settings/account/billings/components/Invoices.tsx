"use client";

import { useInvoices } from "../hooks/useInvoices";
import { FileText, Download } from "lucide-react";

export default function Invoices() {
    const {
        loading,
        invoices,
    } = useInvoices();

    if (loading) {
        return (
            <div className="rounded-3xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] p-8 text-gray-700 dark:text-slate-300">
                Loading invoices...
            </div>
        );
    }

    return (
        <div className="space-y-6">

            <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    Invoices
                </h2>

                <p className="text-gray-500 dark:text-slate-400">
                    View and download your billing history.
                </p>
            </div>

            {invoices.length === 0 ? (

                <div className="rounded-3xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] shadow-sm">

                    <div className="flex min-h-[180px] flex-col items-center justify-center px-6 py-12">

                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-slate-800">
                            <FileText
                                className="h-5 w-5 text-gray-500 dark:text-slate-400"
                                strokeWidth={1.8}
                            />
                        </div>

                        <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
                            No invoices yet
                        </h3>

                        <p className="max-w-sm text-center text-sm text-gray-500 dark:text-slate-400">
                            Your invoices will appear here once they&apos;re issued.
                        </p>

                    </div>

                </div>

            ) : (

                <div className="overflow-hidden rounded-3xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] shadow-sm">

                    <div className="overflow-x-auto">

                        <table className="w-full min-w-[900px]">

                            <thead className="border-b border-gray-200 dark:border-[#22324D] bg-gray-50 dark:bg-[#1E293B]">

                                <tr>

                                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                                        Invoice
                                    </th>

                                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                                        Billing period
                                    </th>

                                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                                        Issued
                                    </th>

                                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                                        Amount
                                    </th>

                                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                                        Status
                                    </th>

                                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                                        Action
                                    </th>

                                </tr>

                            </thead>

                            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">

                                {invoices.map((invoice) => (

                                    <tr
                                        key={invoice._id}
                                        className="transition hover:bg-gray-50 dark:hover:bg-slate-800/40"
                                    >

                                        <td className="px-6 py-5">

                                            <div className="flex items-center gap-3">

                                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 dark:bg-slate-800">
                                                    <FileText className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                                                </div>

                                                <div>
                                                    <p className="font-medium text-gray-900 dark:text-white">
                                                        {invoice.invoiceNumber}
                                                    </p>

                                                    <p className="text-xs text-gray-500 dark:text-slate-400">
                                                        {invoice.currency}
                                                    </p>
                                                </div>

                                            </div>

                                        </td>

                                        <td className="px-6 py-5 text-sm text-gray-600 dark:text-slate-300">

                                            {invoice.billingPeriodStart &&
                                            invoice.billingPeriodEnd ? (
                                                <>
                                                    {formatDate(invoice.billingPeriodStart)}
                                                    {" – "}
                                                    {formatDate(invoice.billingPeriodEnd)}
                                                </>
                                            ) : (
                                                "—"
                                            )}

                                        </td>

                                        <td className="px-6 py-5 text-sm text-gray-600 dark:text-slate-300">
                                            {formatDate(invoice.issuedAt)}
                                        </td>

                                        <td className="px-6 py-5 text-sm font-semibold text-gray-900 dark:text-white">
                                            {formatAmount(
                                                invoice.amount,
                                                invoice.currency
                                            )}
                                        </td>

                                        <td className="px-6 py-5">

                                            <span
                                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${getStatusClasses(
                                                    invoice.status
                                                )}`}
                                            >
                                                {invoice.status}
                                            </span>

                                        </td>

                                        <td className="px-6 py-5 text-right">

                                            {invoice.pdfUrl ? (

                                                <a
                                                    href={invoice.pdfUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-slate-200 transition hover:bg-gray-50 dark:hover:bg-slate-700"
                                                >
                                                    <Download className="h-4 w-4" />
                                                    Download
                                                </a>

                                            ) : (

                                                <span className="text-sm text-gray-400 dark:text-slate-500">
                                                    —
                                                </span>

                                            )}

                                        </td>

                                    </tr>

                                ))}

                            </tbody>

                        </table>

                    </div>

                </div>

            )}

        </div>
    );
}

function formatDate(date: string) {
    if (!date) {
        return "—";
    }

    return new Date(date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function formatAmount(amount: number, currency: string) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: currency || "INR",
        minimumFractionDigits: 2,
    }).format(amount);
}

function getStatusClasses(status: string) {
    switch (status?.toLowerCase()) {
        case "paid":
            return "bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300";

        case "pending":
            return "bg-yellow-100 dark:bg-yellow-950/50 text-yellow-700 dark:text-yellow-300";

        case "failed":
            return "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300";

        case "refunded":
            return "bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300";

        default:
            return "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300";
    }
}