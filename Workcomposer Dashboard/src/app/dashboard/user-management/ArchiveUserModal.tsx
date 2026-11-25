"use client";

import { X } from 'lucide-react';
import { HiMiniArchiveBoxXMark } from "react-icons/hi2";
import type React from "react";
import API from "@/api";
import { useState, useSyncExternalStore } from 'react';
import { createPortal } from "react-dom";

const emptySubscribe = () => () => {};

interface ArchiveUserModalProps {
    user: any;

    setShowArchiveModal: React.Dispatch<React.SetStateAction<boolean>
    >;

    setUsers: React.Dispatch<React.SetStateAction<any[]>
    >;
}

const ArchiveUserModal = ({
    user,
    setShowArchiveModal,
    setUsers,
}: ArchiveUserModalProps) => {

    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

    const handleArchiveUser = async () => {

        try {

            setLoading(true);

            setErrorMessage("");

            await API.put(
                `/users/${user._id || user.id}/archive`
            );

            setUsers((prev: any) =>
                prev.map(
                    (u: any) =>
                        (u._id || u.id) ===
                            (user._id || user.id)
                            ? {
                                ...u,
                                isArchived: true,
                                status: "archived"
                            } : u
                )
            );

            alert("User archived successfully");

            setShowArchiveModal(false);

        } catch (err: any) {

            console.error(err);

            setErrorMessage(
                err?.response?.data?.message ||
                "Failed to archive user"
            );

        } finally {

            setLoading(false);
        }
    };

    if (!mounted) return null;

    return createPortal(
        <>
            <div role='dialog' aria-modal='true' className='relative z-50'>
                <div className='fixed inset-0 bg-gray-500/75 dark:bg-black/75 backdrop-blur-sm transition-opacity'></div>
                <div
                    onClick={() => setShowArchiveModal(false)}
                    className='fixed inset-0 z-50 overflow-y-auto overscroll-contain'>
                    <div className='flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0'>
                        <div
                            onClick={(e) => e.stopPropagation()}
                            className='relative transform rounded-lg bg-white dark:bg-slate-800 border border-transparent dark:border-slate-700 px-4 pt-5 pb-4 text-left shadow-xl dark:shadow-2xl transition-all sm:my-8 sm:w-full w-full max-w-lg p-6'>

                            <div className='flex justify-between items-center'>
                                <h2 className='text-xl font-semibold text-gray-900 dark:text-white'>Archive User</h2>

                                <button
                                    type='button'
                                    onClick={() =>
                                        setShowArchiveModal(false)
                                    }
                                    className='text-gray-400 dark:text-slate-400 hover:text-gray-500 dark:hover:text-slate-200 focus:outline-none'>
                                    <X className='h-6 w-6' />
                                </button>
                            </div>

                            <div className='border-t border-gray-200 dark:border-slate-700 my-5'></div>

                            {errorMessage && (
                                <div className='mt-4 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 px-4 py-3 text-sm text-red-700 dark:text-red-300'>
                                    {errorMessage}
                                </div>
                            )}

                            <div className='text-sm text-gray-700 dark:text-slate-300 space-y-4'>
                                <p> Archiving a user keeps their data for one year, after which it is permanently deleted. There are no charges for archived accounts. You can access their tracking data and reports for one year. Archived users cannot sign in or track time. </p>
                                <p className='font-semibold text-gray-900 dark:text-white'> Are you certain you want to archive this user? </p>
                            </div>

                            <div className='mt-8 flex justify-end gap-3'>
                                <button
                                    type='button'
                                    onClick={() =>
                                        setShowArchiveModal(false)
                                    }
                                    className='rounded-md bg-white dark:bg-slate-700 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-200 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800'>Cancel</button>
                                <button
                                    type='button'
                                    onClick={handleArchiveUser}
                                    disabled={loading}
                                    className='rounded-md bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 transition-colors duration-200'>
                                    <HiMiniArchiveBoxXMark className='h-5 w-5 mr-1.5 inline-block' />
                                    {loading ? "Archiving..." : "Archive User"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>,
        document.body
    )
}

export default ArchiveUserModal
