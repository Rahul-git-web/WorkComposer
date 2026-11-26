"use client"

import { HiOutlineClipboardDocumentList } from "react-icons/hi2";
import TaskDetailsModal from "./TaskDetailsModal";
import { useState } from "react";

type Props = {
    project: any;
    reportRange: any;
    onBack: () => void;
};

const ViewTaskModal = ({
    project,
    reportRange,
    onBack,
}: Props) => {

    const [selectedTask, setSelectedTask] = useState<any>(null);
    const [showTaskDetails, setShowTaskDetails] = useState(false);

    return (
        <>
            <div className='px-6 py-6 sm:px-8'>
                <div className='divide-y divide-gray-200 dark:divide-slate-700 overflow-hidden bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm'>
                    <div className='px-3 py-2 sm:px-5 bg-white dark:bg-slate-800 shadow-sm border-b border-gray-200 dark:border-slate-700'>
                        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2'>
                            <h2 className='text-lg font-bold text-gray-800 dark:text-slate-300'> Project:{" "}
                                <span className='text-gray-900 dark:text-white'>
                                    {project.name}
                                </span>
                            </h2>
                            <button
                                onClick={onBack}
                                className='inline-flex items-center px-3 py-1.5 border border-indigo-500 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 rounded-md cursor-pointer font-medium text-sm transition-colors duration-150 shadow-sm'
                            >
                                ← Back to projects
                            </button>
                        </div>
                    </div>

                    <div className="px-2 py-4 sm:px-4">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                            <thead className="bg-white dark:bg-slate-800">
                                <tr>
                                    <th scope="col" className="py-3.5 pr-3 pl-4 text-left text-sm font-semibold text-gray-900 dark:text-white sm:pl-6">Task name</th>
                                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">Users</th>
                                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">Duration</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                                {project.records.length > 0 ? (
                                    project.records.map((record: any) => (
                                        <tr
                                            key={record._id}
                                            onClick={() => {
                                                setSelectedTask(record.task);
                                                setShowTaskDetails(true);
                                            }}
                                            className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors duration-150"
                                        >
                                            <td className="py-4 pr-3 pl-6 text-sm font-medium whitespace-nowrap text-gray-900 dark:text-slate-200">
                                                <span className="truncate max-w-xs">
                                                    <span className="truncate max-w-xs">
                                                        {record.task?.title || "No Task"}
                                                    </span>
                                                </span>
                                            </td>

                                            <td className="px-3 py-4">
                                                <div className="flex items-center">
                                                    <span className="text-sm text-gray-700 dark:text-slate-300">
                                                        {record.user
                                                            ? `${record.user.firstName} ${record.user.lastName}`
                                                            : "Unknown User"}
                                                    </span>
                                                </div>
                                            </td>

                                            <td className="px-3 py-4 text-sm whitespace-nowrap text-gray-500 dark:text-slate-400">
                                                <span className="font-medium text-gray-900 dark:text-slate-200">
                                                    {Math.floor(record.duration / 3600)}h{" "}
                                                    {Math.floor((record.duration % 3600) / 60)}m
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={3} className="py-10 text-center">
                                            <HiOutlineClipboardDocumentList className="h-12 w-12 mx-auto text-gray-300 dark:text-slate-600 mb-3" />
                                            <p className="text-gray-500 dark:text-slate-300 text-lg font-semibold">
                                                No tasks available
                                            </p>
                                            <p className="text-sm text-gray-400 dark:text-slate-400 mt-1">
                                                Tasks will appear here once they are created and tracked.
                                            </p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <TaskDetailsModal
                open={showTaskDetails}
                task={selectedTask}
                startDate={reportRange.startDate.toISOString().split("T")[0]}
                endDate={reportRange.endDate.toISOString().split("T")[0]}
                onClose={() => {
                    setShowTaskDetails(false);
                    setSelectedTask(null);
                }}
            />
        </>
    )
}

export default ViewTaskModal
