"use client"

import API from "@/api";
import { Check } from 'lucide-react';
import { TbSelector } from "react-icons/tb";
import Image from "next/image";
import { useEffect, useRef, useState } from 'react';

interface NewTaskProps {
    setShowNewTaskModal: React.Dispatch<
        React.SetStateAction<boolean>
    >;

    fetchTasks: () => Promise<void>;
}

const NewTask = ({
    setShowNewTaskModal,
    fetchTasks,
}: NewTaskProps) => {

    const formRef = useRef<HTMLFormElement>(null);

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [dueDate, setDueDate] = useState("");

    const [selectedProject, setSelectedProject] = useState("");

    const [selectedPriority, setSelectedPriority] = useState("Medium");

    const [selectedStatus, setSelectedStatus] = useState("Todo");

    const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);

    const [projectOpen, setProjectOpen] = useState(false);
    const [priorityOpen, setPriorityOpen] = useState(false);
    const [statusOpen, setStatusOpen] = useState(false);
    const [assigneeOpen, setAssigneeOpen] = useState(false);
    const [assigneeSearch, setAssigneeSearch] = useState("");
    const [users, setUsers] = useState<any[]>([]);

    const [projects, setProjects] = useState<any[]>([]);

    useEffect(() => {
        let mounted = true;
        API.get("/users")
            .then((res) => {
                if (mounted) setUsers(res.data);
            })
            .catch((err) => console.error(err));

        API.get("/projects")
            .then((res) => {
                if (!mounted) return;
                const uniqueProjects = Array.from(
                    new Map(
                        res.data.map((project: any) => [project._id, project])
                    ).values()
                );
                setProjects(uniqueProjects);
            })
            .catch((err) => console.error(err));

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (formRef.current && !formRef.current.contains(e.target as Node)) {
                setProjectOpen(false);
                setPriorityOpen(false);
                setStatusOpen(false);
                setAssigneeOpen(false);
                setAssigneeSearch("");
            }
        };

        document.addEventListener("mousedown", handleClickOutside);

        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, []);


    const priorities = [
        "Low",
        "Medium",
        "High",
    ];

    const statuses = [
        "Todo",
        "In Progress",
        "Completed",
    ];


    const toggleAssignee = (assignee: string) => {
        setSelectedAssignees((prev) =>
            prev.includes(assignee)
                ? prev.filter((item) => item !== assignee)
                : [...prev, assignee]
        );
    };

    const filteredUsers = users.filter((user) => {
        const fullName = `${user.firstName || ""} ${user.lastName || ""}`.toLowerCase();
        return fullName.includes(assigneeSearch.toLowerCase());
    });

    const handleCreateTask = async (
        e: React.FormEvent
    ) => {
        e.preventDefault();

        try {
            await API.post("/tasks", {
                title,
                description,
                dueDate,
                project:
                    selectedProject,

                priority: selectedPriority.toLowerCase(),

                status: selectedStatus
                    .toLowerCase()
                    .replace(" ", "-"),

                assignedTo:
                    selectedAssignees.length > 0
                        ? selectedAssignees[0]
                        : null,
            });

            await fetchTasks();

            setShowNewTaskModal(false);

        } catch (err) {
            console.error(err);
        }
    };

    const allProjects = projects;

    return (
        <>
            <div role="dialog" className="relative z-[100]">
                <div className="fixed inset-0 bg-gray-500/75 dark:bg-black/75 backdrop-blur-sm transition-opacity"></div>
                <div
                    onClick={() =>
                        setShowNewTaskModal(false)
                    }
                    className="fixed inset-0 z-50 w-screen overflow-y-auto">
                    <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                        <div
                            onClick={(e) =>
                                e.stopPropagation()
                            }
                            className="relative transform rounded-lg bg-white dark:bg-slate-800 border border-transparent dark:border-slate-700 px-4 pt-5 pb-4 text-left shadow-xl dark:shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-2xl">
                            <header className="text-lg font-semibold text-gray-900 dark:text-white">New Task</header>
                            <div className="mt-4">
                                <form
                                    ref={formRef}
                                    onSubmit={handleCreateTask}
                                    className="space-y-6">
                                    <div>
                                        <label htmlFor="title" className="block text-sm/6 font-medium text-gray-900 dark:text-slate-200">Title</label>
                                        <div className="mt-2">
                                            <input
                                                id="title"
                                                value={title}
                                                onChange={(e) =>
                                                    setTitle(e.target.value)
                                                }
                                                type="text"
                                                placeholder="Enter task title"
                                                className="block w-full rounded-md bg-white dark:bg-slate-900 px-3 py-1.5 text-base text-gray-900 dark:text-slate-100 outline-1 -outline-offset-1 outline-gray-300 dark:outline-slate-700 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"></input>
                                        </div>
                                    </div>

                                    <div>
                                        <label htmlFor="description" className="block text-sm/6 font-medium text-gray-900 dark:text-slate-200">Description</label>
                                        <div className="mt-2">
                                            <textarea
                                                value={description}
                                                onChange={(e) =>
                                                    setDescription(e.target.value)
                                                }
                                                id="description"
                                                rows={4}
                                                placeholder="Enter task description"
                                                className="block w-full rounded-md bg-white dark:bg-slate-900 px-3 py-1.5 text-base text-gray-900 dark:text-slate-100 outline-1 -outline-offset-1 outline-gray-300 dark:outline-slate-700 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"></textarea>
                                        </div>
                                    </div>



                                    <div>
                                        <label className="block text-sm/6 font-medium text-gray-900 dark:text-slate-200">Select Project</label>
                                        <div className="relative mt-2">
                                            <button
                                                onClick={() => {
                                                    setProjectOpen(!projectOpen);
                                                    setPriorityOpen(false);
                                                    setStatusOpen(false);
                                                    setAssigneeOpen(false);
                                                    setAssigneeSearch("");
                                                }}
                                                type="button"
                                                aria-haspopup='listbox' aria-expanded='true' className="grid w-full cursor-default grid-cols-1 rounded-md bg-white dark:bg-slate-900 py-1.5 pr-2 pl-3 text-left text-gray-900 dark:text-slate-100 outline-1 -outline-offset-1 outline-gray-300 dark:outline-slate-700 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6">
                                                <span className="col-start-1 row-start-1 truncate pr-6">{allProjects.find(
                                                    (project) => project._id === selectedProject
                                                )?.name || "Select Project"}</span>
                                                <TbSelector className='col-start-1 row-start-1 size-5 self-center justify-self-end text-gray-500 dark:text-slate-400 sm:size-4' />
                                            </button>

                                            {projectOpen && (
                                                <ul aria-orientation='vertical' role='listbox' className='absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-slate-800 py-1 text-base shadow-lg ring-1 ring-black/5 dark:ring-slate-700 focus:outline-none sm:text-sm'>
                                                    {allProjects.map((project) => (
                                                        <li
                                                            key={project._id}
                                                            onClick={() => {
                                                                setSelectedProject(project._id);
                                                                setProjectOpen(false);
                                                            }}
                                                            role='option'
                                                            className='relative cursor-pointer py-2 pr-9 pl-3 select-none hover:bg-gray-50 dark:hover:bg-slate-700/60'
                                                        >
                                                            <span
                                                                className={`block truncate ${selectedProject === project._id
                                                                    ? "font-semibold text-gray-900 dark:text-white"
                                                                    : "font-normal text-gray-700 dark:text-slate-300"
                                                                    }`}
                                                            >
                                                                {project.name}
                                                            </span>

                                                            {selectedProject === project._id && (
                                                                <span className='text-indigo-600 dark:text-indigo-400 absolute inset-y-0 right-0 flex items-center pr-4'>
                                                                    <Check className='size-5' />
                                                                </span>
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <label className='block text-sm/6 font-medium text-gray-900 dark:text-slate-200'>Priority</label>
                                        <div className='relative mt-2'>
                                            <button
                                                onClick={() => {
                                                    setPriorityOpen(!priorityOpen);
                                                    setProjectOpen(false);
                                                    setStatusOpen(false);
                                                    setAssigneeOpen(false);
                                                    setAssigneeSearch("");
                                                }}
                                                type='button'
                                                aria-haspopup='listbox'
                                                aria-expanded='true'
                                                className='grid w-full cursor-default grid-cols-1 rounded-md bg-white dark:bg-slate-900 py-1.5 pr-2 pl-3 text-left text-gray-900 dark:text-slate-100 outline-1 -outline-offset-1 outline-gray-300 dark:outline-slate-700 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6'>
                                                <span className='col-start-1 row-start-1 truncate pr-6'>{selectedPriority}</span>
                                                <TbSelector className='col-start-1 row-start-1 size-5 self-center justify-self-end text-gray-500 dark:text-slate-400 sm:size-4' />
                                            </button>

                                            {priorityOpen && (
                                                <ul aria-orientation='vertical' role='listbox' className='absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-slate-800 py-1 text-base shadow-lg ring-1 ring-black/5 dark:ring-slate-700 focus:outline-none sm:text-sm'>
                                                    {priorities.map((priority) => (
                                                        <li
                                                            key={priority}
                                                            onClick={() => {
                                                                setSelectedPriority(priority);
                                                                setPriorityOpen(false);
                                                            }}
                                                            role='option'
                                                            className='relative cursor-pointer py-2 pr-9 pl-3 select-none hover:bg-gray-50 dark:hover:bg-slate-700/60'
                                                        >
                                                            <span
                                                                className={`block truncate ${selectedPriority === priority
                                                                    ? "font-semibold text-gray-900 dark:text-white"
                                                                    : "font-normal text-gray-700 dark:text-slate-300"
                                                                    }`}
                                                            >
                                                                {priority}
                                                            </span>

                                                            {selectedPriority === priority && (
                                                                <span className='text-indigo-600 dark:text-indigo-400 absolute inset-y-0 right-0 flex items-center pr-4'>
                                                                    <Check className='size-5' />
                                                                </span>
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm/6 font-medium text-gray-900 dark:text-slate-200">
                                            Status
                                        </label>

                                        <div className="relative mt-2">
                                            <button
                                                onClick={() => {
                                                    setStatusOpen(!statusOpen);
                                                    setProjectOpen(false);
                                                    setPriorityOpen(false);
                                                    setAssigneeOpen(false);
                                                    setAssigneeSearch("");
                                                }}
                                                type="button"
                                                className="grid w-full cursor-default grid-cols-1 rounded-md bg-white dark:bg-slate-900 py-1.5 pr-2 pl-3 text-left text-gray-900 dark:text-slate-100 outline-1 -outline-offset-1 outline-gray-300 dark:outline-slate-700 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                                            >
                                                <span className="col-start-1 row-start-1 truncate pr-6">
                                                    {selectedStatus}
                                                </span>

                                                <TbSelector className="col-start-1 row-start-1 size-5 self-center justify-self-end text-gray-500 dark:text-slate-400 sm:size-4" />
                                            </button>

                                            {statusOpen && (
                                                <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-slate-800 py-1 text-base shadow-lg ring-1 ring-black/5 dark:ring-slate-700 sm:text-sm">

                                                    {statuses.map((status) => (
                                                        <li
                                                            key={status}
                                                            onClick={() => {
                                                                setSelectedStatus(status);
                                                                setStatusOpen(false);
                                                            }}
                                                            className="relative cursor-pointer py-2 pr-9 pl-3 hover:bg-gray-50 dark:hover:bg-slate-700/60"
                                                        >
                                                            <span
                                                                className={`block truncate ${selectedStatus === status
                                                                    ? "font-semibold text-gray-900 dark:text-white"
                                                                    : "font-normal text-gray-700 dark:text-slate-300"
                                                                    }`}
                                                            >
                                                                {status}
                                                            </span>

                                                            {selectedStatus === status && (
                                                                <span className="text-indigo-600 dark:text-indigo-400 absolute inset-y-0 right-0 flex items-center pr-4">
                                                                    <Check className="size-5" />
                                                                </span>
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm/6 font-medium text-gray-900 dark:text-slate-200">
                                            Due Date
                                        </label>

                                        <div className="mt-2">
                                            <input
                                                type="date"
                                                value={dueDate}
                                                onChange={(e) =>
                                                    setDueDate(e.target.value)
                                                }
                                                className="block w-full rounded-md bg-white dark:bg-slate-900 px-3 py-1.5 text-base text-gray-900 dark:text-slate-100 outline-1 outline-gray-300 dark:outline-slate-700 focus:outline-2 focus:outline-indigo-600 sm:text-sm/6"
                                            />
                                        </div>
                                    </div>

                                    <div className='relative'>
                                        <label className='block text-sm/6 font-medium text-gray-900 dark:text-slate-200'>Assignee</label>
                                        <div className='relative mt-2'>
                                            <input aria-expanded='true' aria-autocomplete='list' role='combobox' type='text' className='w-full rounded-md bg-white dark:bg-slate-900 px-3 py-1.5 text-base text-gray-900 dark:text-slate-100 outline-1 -outline-offset-1 outline-gray-300 dark:outline-slate-700 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6'
                                                value={
                                                    selectedAssignees.length === 0
                                                        ? ""
                                                        : users
                                                            .filter((user) =>
                                                                selectedAssignees.includes(user._id)
                                                            )
                                                            .map((user) =>
                                                                `${user.firstName} ${user.lastName}`
                                                            )
                                                            .join(", ")
                                                }
                                                readOnly
                                                placeholder='Select assignee'></input>
                                            <button
                                                onClick={() => {
                                                    setAssigneeOpen(!assigneeOpen);
                                                    setProjectOpen(false);
                                                    setPriorityOpen(false);
                                                    setStatusOpen(false);
                                                    if (assigneeOpen) setAssigneeSearch("");
                                                }}
                                                type='button'
                                                aria-haspopup='listbox'
                                                className='absolute inset-y-0 right-0 flex items-center pr-2'>
                                                <TbSelector className='col-start-1 row-start-1 size-5 self-center justify-self-end text-gray-500 dark:text-slate-400 sm:size-4' />
                                            </button>

                                            {assigneeOpen && (
                                                <div className='absolute z-50 mt-1 w-full overflow-hidden rounded-md bg-white dark:bg-slate-800 shadow-lg ring-1 ring-black/5 dark:ring-slate-700 focus:outline-none'>
                                                    <div className='sticky top-0 border-b border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-2'>
                                                        <input
                                                            type='text'
                                                            autoFocus
                                                            value={assigneeSearch}
                                                            onChange={(e) => setAssigneeSearch(e.target.value)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            placeholder='Search users...'
                                                            className='block w-full rounded-md border-0 bg-gray-50 dark:bg-slate-900 px-2.5 py-1.5 text-sm text-gray-900 dark:text-slate-100 outline-1 -outline-offset-1 outline-gray-200 dark:outline-slate-700 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600'
                                                        />
                                                    </div>

                                                    <ul role='listbox' className='max-h-60 overflow-auto py-1 text-base sm:text-sm'>
                                                        <li
                                                            onClick={() => {
                                                                setSelectedAssignees([]);
                                                            }}
                                                            className='relative cursor-pointer py-2 pr-9 pl-3 hover:bg-gray-50 dark:hover:bg-slate-700/60'
                                                        >
                                                            <span className='font-medium text-gray-900 dark:text-slate-200'>
                                                                - No Assignee -
                                                            </span>

                                                            {selectedAssignees.length === 0 && (
                                                                <span className='text-indigo-600 dark:text-indigo-400 absolute inset-y-0 right-0 flex items-center pr-4'>
                                                                    <Check className='h-5 w-5' />
                                                                </span>
                                                            )}
                                                        </li>

                                                        {filteredUsers.length === 0 ? (
                                                            <li className='px-3 py-4 text-center text-sm text-gray-400 dark:text-slate-500'>
                                                                No users found
                                                            </li>
                                                        ) : (
                                                            filteredUsers.map((user) => (
                                                                <li
                                                                    key={user._id}
                                                                    onClick={() => toggleAssignee(user._id)}
                                                                    className='relative cursor-pointer py-2 pr-9 pl-3 hover:bg-gray-50 dark:hover:bg-slate-700/60'
                                                                >
                                                                    <div className='flex items-center'>
                                                                        {user.avatar?.trim() ? (
                                                                            <Image
                                                                                src={user.avatar}
                                                                                alt={`${user.firstName} ${user.lastName}`}
                                                                                width={24}
                                                                                height={24}
                                                                                unoptimized
                                                                                className="h-6 w-6 rounded-full object-cover"
                                                                            />
                                                                        ) : (
                                                                            <div className="h-6 w-6 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-semibold">
                                                                                {user.firstName?.charAt(0).toUpperCase()}
                                                                            </div>
                                                                        )}

                                                                        <span
                                                                            className={`ml-3 truncate ${selectedAssignees.includes(user._id)
                                                                                ? "font-semibold text-gray-900 dark:text-white"
                                                                                : "font-normal text-gray-700 dark:text-slate-300"
                                                                                }`}
                                                                        >
                                                                            {user.firstName} {user.lastName}
                                                                        </span>
                                                                    </div>

                                                                    {selectedAssignees.includes(user._id) && (
                                                                        <span className='text-indigo-600 dark:text-indigo-400 absolute inset-y-0 right-0 flex items-center pr-4'>
                                                                            <Check className='h-5 w-5' />
                                                                        </span>
                                                                    )}
                                                                </li>
                                                            ))
                                                        )}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className='text-center'>
                                        <button type='submit' className='inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50'>Create Task</button>
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

export default NewTask
