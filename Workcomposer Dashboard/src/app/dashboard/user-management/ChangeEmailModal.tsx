"use client";

import { MdEmail } from "react-icons/md";
import { X } from 'lucide-react';
import type React from "react";
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import API from "@/api";

const emptySubscribe = () => () => {};

interface ChangeEmailModalProps {
    user: any;
    setShowChangeEmailModal: React.Dispatch<React.SetStateAction<boolean>
    >;
    setUsers: React.Dispatch<React.SetStateAction<any[]>
    >;
}

const ChangeEmailModal = ({
    user,
    setShowChangeEmailModal,
    setUsers,
}: ChangeEmailModalProps) => {

    const [email, setEmail] = useState(user?.email || "");
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

    const handleChangeEmail = async () => {
        try {
            setLoading(true);

            setErrorMessage("");
            setSuccessMessage("");

            if (!email.trim()) {
                setErrorMessage("Email is required");

                return;
            }
          

            const res = await API.put(`/users/${user._id || user.id}/email-request`, {
                newEmail: email,
            }
            );

            alert("verification email sent successfully")

            setShowChangeEmailModal(false);

            setSuccessMessage(res.data.message || "Verification email sent successfully");

            setTimeout(() => {
                setShowChangeEmailModal(false);
            }, 1200);
        } catch (err: any) {
            console.error(err);
            setErrorMessage(err?.response?.data?.message || "Failed to update email");
        } finally {
            setLoading(false);
        }
    };


    if (!mounted) return null;

    return createPortal(
        <>
            <div role='dialog' className='relative z-50' aria-modal='true'>
                <div className='fixed inset-0 bg-gray-500/75 dark:bg-black/75 backdrop-blur-sm transition-opacity'></div>
                <div
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowChangeEmailModal(false);
                    }}
                    className='fixed inset-0 z-50 overflow-y-auto overscroll-contain'>
                    <div className='flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0'>
                        <div
                            onClick={(e) => e.stopPropagation()}
                            className='relative transform rounded-lg bg-white dark:bg-slate-800 border border-transparent dark:border-slate-700 px-4 pt-5 pb-4 text-left shadow-xl dark:shadow-2xl transition-all sm:my-8 sm:w-full w-full max-w-lg p-6'>

                            <div className='flex justify-between items-center'>
                                <h2 className='text-xl font-semibold text-gray-900 dark:text-white'>Change Email</h2>
                                <button
                                    type='button'
                                    onClick={() =>
                                        setShowChangeEmailModal(false)
                                    }
                                    className='text-gray-400 dark:text-slate-400 hover:text-gray-500 dark:hover:text-slate-200 focus:outline-none'>
                                    <X className='h-6 w-6' />
                                </button>
                            </div>

                            <div className='border-t border-gray-200 dark:border-slate-700 my-5'></div>
                            <div className='text-sm text-gray-700 dark:text-slate-300 space-y-4'>
                                <p> Enter the new email address for the user. A verification email will be sent. The user must confirm via the verification link. </p>
                                <p className='italic text-gray-500 dark:text-slate-400'>Note: The change is not complete until verified.</p>
                            </div>

                            {successMessage && (
                                <div className="mt-4 rounded-md bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900/60 px-4 py-3 text-sm text-green-700 dark:text-green-300">
                                    {successMessage}
                                </div>
                            )}

                            {errorMessage && (
                                <div className="mt-4 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                                    {errorMessage}
                                </div>
                            )}

                            <form className='mt-5'>
                                <div className='mb-4'>
                                    <label htmlFor='new-email' className='block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1'>Email Address</label>
                                    <input
                                        id='new-email'
                                        type='email'
                                        required
                                        value={email}
                                        onChange={(e) =>
                                            setEmail(e.target.value)
                                        }
                                        className='block w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 placeholder-gray-400 dark:placeholder-slate-500 shadow-sm focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-indigo-500 dark:focus:ring-indigo-400' placeholder='newuser@example.com'></input>
                                </div>
                            </form>

                            <div className='mt-8 flex justify-end gap-3'>
                                <button
                                    type='button'
                                    onClick={() =>
                                        setShowChangeEmailModal(false)
                                    }
                                    className='rounded-md bg-white dark:bg-slate-700 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-200 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800'>Cancel</button>
                                <button
                                    type='button'
                                    disabled={loading}
                                    onClick={handleChangeEmail}
                                    className='rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 transition-colors duration-200'>
                                    <MdEmail className="h-5 w-5 mr-1.5 inline-block" />
                                    {
                                        loading ? "Sending..." : "Confirm and Send"
                                    }
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

export default ChangeEmailModal
