"use client";

import API from "@/api";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";

const emptySubscribe = () => () => {};

const EditTeamModal = ({
    editingTeam,
    setShowEditModal,
    fetchTeams,
}: any) => {

    const [teamName, setTeamName] = useState("");
    const [loading, setLoading] = useState(false);
    const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

    useEffect(() => {
        if (editingTeam) {
            setTeamName(editingTeam.name);
        }
    }, [editingTeam]);

    const handleUpdate = async () => {
        try {
            if (!teamName.trim()) {
                return;
            }

            setLoading(true);
            const teamId = editingTeam._id || editingTeam.id;
            await API.put(`/teams/${teamId}`, {
                name: teamName.trim(),
            });

            toast.success("Team updated successfully");
            fetchTeams();
            setShowEditModal(false);
        } catch (err: any) {
            console.error(err);
            toast.error(err?.response?.data?.message || "Failed to update team");
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
                    onClick={() => setShowEditModal(false)}
                    className='fixed inset-0 z-50 overflow-y-auto overscroll-contain'>
                    <div className='flex min-h-full items-center justify-center p-4'>
                        <div
                            onClick={(e) => e.stopPropagation()}
                            className='w-full max-w-md rounded-lg bg-white dark:bg-slate-800 border border-transparent dark:border-slate-700 p-6 shadow-xl dark:shadow-2xl'>
                            <h2 className='text-lg font-medium text-gray-900 dark:text-white'>Edit Team</h2>

                            <div className='mt-4'>
                                <input
                                    type='text'
                                    value={teamName}
                                    onChange={(e) =>
                                        setTeamName(e.target.value)
                                    }
                                    className='block w-full rounded-md bg-white dark:bg-slate-900 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 border border-gray-300 dark:border-slate-600 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-indigo-600 dark:focus:outline-indigo-400' placeholder='Team name'></input>

                            </div>

                            <div className='mt-6 flex justify-end space-x-2'>
                                <button
                                    onClick={() =>
                                        setShowEditModal(false)
                                    }
                                    className='px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 rounded hover:bg-gray-300 dark:hover:bg-slate-600 font-semibold cursor-pointer'>Cancel</button>
                                <button
                                    onClick={handleUpdate}
                                    disabled={!teamName.trim() || loading}
                                    className='px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:opacity-50 font-semibold cursor-pointer'>
                                    {loading ? "Updating..." : "Update"}
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

export default EditTeamModal
