"use client";

import React, { useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom';
import API from "@/api";
import toast from 'react-hot-toast';

const emptySubscribe = () => () => {};

interface CreateTeamModalPropa {
    setShowTeamModal: React.Dispatch<React.SetStateAction<boolean>>;
    fetchTeams: () => void;
    editingTeam: any;
    setEditingTeam: React.Dispatch<React.SetStateAction<any>>;
}

const CreateTeamModal = ({
    setShowTeamModal,
    fetchTeams
}: CreateTeamModalPropa) => {
    const [teamName, setTeamName] = useState("");
    const [loading, setLoading] = useState(false);
    const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

    const handleCreateTeam = async () => {
        if (!teamName.trim()) {
            alert("Team name is required");
            return;
        }

        try {
            setLoading(true);
            await API.post("/teams", {
                name: teamName,
            });

            toast.success("Team created successfully");

            fetchTeams();

            setShowTeamModal(false);
        } catch (err: any) {
            console.error(err);

            toast.error(err?.response?.data?.message || "Failed to create team")
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
                    onClick={() => setShowTeamModal(false)}
                    className='fixed inset-0 z-50 overflow-y-auto overscroll-contain'>
                    <div className='flex min-h-full items-center justify-center p-4'>
                        <div
                            onClick={(e) => e.stopPropagation()}
                            className='w-full max-w-md rounded-lg bg-white dark:bg-slate-800 border border-transparent dark:border-slate-700 p-6 shadow-xl dark:shadow-2xl'>
                            <h2 className='text-lg font-medium text-gray-900 dark:text-white'>Create a new Team</h2>
                            <div className='mt-4'>
                                <input
                                    type='text'
                                    value={teamName}
                                    onChange={(e) =>
                                        setTeamName(e.target.value)
                                    }
                                    placeholder='Team name' className='w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 placeholder-gray-400 dark:placeholder-slate-500 rounded px-3 py-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400'></input>
                            </div>

                            <div className='mt-6 flex justify-end space-x-2'>
                                <button
                                    onClick={() =>
                                        setShowTeamModal(false)
                                    }
                                    className='px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 rounded hover:bg-gray-300 dark:hover:bg-slate-600 font-semibold cursor-pointer'>Cancel</button>
                                <button
                                    onClick={handleCreateTeam}
                                    className='px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:opacity-50 font-semibold cursor-pointer'>{loading ? "Creating..." : "Create"}</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>,
        document.body
    )
}

export default CreateTeamModal
