"use client";

import { useState } from "react";
import API from "@/api";
import toast from "react-hot-toast";

const DeleteProject = ({
    selectedProject,
    setShowDeleteProjectModal,
    fetchProjects,
}: {
    selectedProject: any;
    setShowDeleteProjectModal: React.Dispatch<React.SetStateAction<boolean>>;
    fetchProjects: () => Promise<void>;
}) => {
    const [loading, setLoading] = useState(false);

    const handleDelete = async (
        e: React.FormEvent
    ) => {
        e.preventDefault();

        const projectId = selectedProject?._id || selectedProject?.id;
        if (!projectId) {
            toast.error("Project ID is missing");
            return;
        }

        try {
            setLoading(true);
            await API.delete(`/projects/${projectId}`);
            toast.success("Project deleted successfully");
            await fetchProjects();
            setShowDeleteProjectModal(false);
        } catch (err: any) {
            console.error(err);
            toast.error(err?.response?.data?.message || "Failed to delete project");
        } finally {
            setLoading(false);
        }
    };
    return (
        <>
            <div role="dialog" className="relative z-50">
                <div className="fixed inset-0 bg-gray-500/75 dark:bg-black/75 backdrop-blur-sm transition-opacity"></div>
                <div
                    onClick={() =>
                        setShowDeleteProjectModal(false)
                    }
                    className="fixed inset-0 z-50 w-screen overflow-y-auto">
                    <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                        <div
                            onClick={(e) =>
                                e.stopPropagation()
                            }
                            className="relative transform rounded-lg bg-white dark:bg-slate-800 border border-transparent dark:border-slate-700 px-4 pt-5 pb-4 text-left shadow-xl dark:shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-md">

                            <header className="text-lg font-semibold text-gray-900 dark:text-white">Delete Project</header>
                            <div className="mt-4">
                                <form
                                    onSubmit={handleDelete}
                                    className="space-y-4 text-center px-4 sm:px-6">
                                    <p className="text-base text-gray-900 dark:text-white font-medium"> Are you sure you want to delete this project? </p>
                                    <p className="text-sm text-gray-600 dark:text-slate-400"> You are going to delete{" "}
                                        <span className="font-semibold text-red-600 dark:text-red-400">{selectedProject?.taskCount || 0}</span> {" "}
                                        open task(s).
                                    </p>
                                    <div className="pt-4">
                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className="inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50"
                                        >
                                            {loading ? "Deleting..." : "Delete Project"}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

export default DeleteProject
