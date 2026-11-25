"use client";

import API from "@/api";
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";

const emptySubscribe = () => () => {};

const DeleteTeamModal = ({
    selectedTeam,
    setShowDeleteModal,
    fetchTeams,
}: any) => {
    const [loading, setLoading] = useState(false);
    const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

    const handleDelete = async () => {
        try {
            setLoading(true);
            const teamId = selectedTeam._id || selectedTeam.id;
            await API.delete(`/teams/${teamId}`);

            toast.success("Team deleted successfully");
            fetchTeams();

            setShowDeleteModal(false);
        } catch (err: any) {
            console.error(err);
            toast.error(err?.response?.data?.message || "Failed to delete team");
        } finally {
            setLoading(false);
        }
    };

    if (!mounted) return null;

    return createPortal(
        <>
            <div role='dialog' className='relative z-50' aria-modal='true'>
                <div className='fixed inset-0 bg-black/50 backdrop-blur-sm'></div>
                <div
                    onClick={() => setShowDeleteModal(false)}
                    className='fixed inset-0 z-50 overflow-y-auto overscroll-contain'>
                    <div className='flex min-h-full items-center justify-center p-4'>
                        <div
                            onClick={(e) => e.stopPropagation()}
                            className='w-full max-w-sm rounded-lg bg-white dark:bg-slate-800 border border-transparent dark:border-slate-700 p-6 shadow-xl dark:shadow-2xl'>
                            <h2 className='text-lg font-medium text-gray-900 dark:text-white'>Delete Team</h2>
                            <p className='mt-2 text-sm text-gray-500 dark:text-slate-400'>Are you sure delete {" "}
                                <span className="font-semibold text-gray-700 dark:text-slate-200">{selectedTeam?.name}</span>
                                ?</p>
                            <div className='mt-6 flex justify-end space-x-2'>
                                <button
                                    onClick={() =>
                                        setShowDeleteModal(false)
                                    }
                                    className='px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 rounded hover:bg-gray-300 dark:hover:bg-slate-600 font-semibold cursor-pointer'>Cancel</button>
                                <button
                                    onClick={handleDelete}
                                    disabled={loading}
                                    className='px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500 disabled:opacity-50 font-semibold cursor-pointer'>
                                    {loading ? "Deleting..." : "Delete"}
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

export default DeleteTeamModal
