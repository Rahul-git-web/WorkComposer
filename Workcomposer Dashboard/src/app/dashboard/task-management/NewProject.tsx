"use client"

import API from "@/api";
import { AiOutlineFileText } from "react-icons/ai";
import { FaUsers } from "react-icons/fa";
import { HiOutlineUsers } from "react-icons/hi2";
import { CiUser } from "react-icons/ci";
import { HiOutlineInformationCircle } from "react-icons/hi2";
import { MdOutlineCheckBoxOutlineBlank } from "react-icons/md";
import { TbSelector } from "react-icons/tb";
import { Check, Search } from 'lucide-react';
import { useEffect, useState } from "react";
import Image from "next/image";
import { createPortal } from 'react-dom';
import toast from "react-hot-toast";


const NewProject = ({
    setShowProjectModal,
    editingProject,
    fetchProjects,
}: {
    setShowProjectModal: React.Dispatch<React.SetStateAction<boolean>>;
    editingProject?: any;
    fetchProjects: () => Promise<void>;
}) => {

    const [activeTab, setActiveTab] = useState("details");
    const [projectName, setProjectName] = useState("");

    const [accessTab, setAccessTab] = useState("teams");
    const [teamSearch, setTeamSearch] = useState("");
    const [userSearch, setUserSearch] = useState("");
    const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

    const [teams, setTeams] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);

    const [selectedFilterTeam, setSelectedFilterTeam] = useState("All Teams");
    const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);
    const [saving, setSaving] = useState(false);


    useEffect(() => {
        if (editingProject) {

            setProjectName(editingProject.name || "");

            setSelectedTeams(editingProject.teams || []);

            setSelectedUsers(
                (editingProject.users || []).map((user: any) => user._id || user.id)
            );
        }
    }, [editingProject]);

    useEffect(() => {

        const fetchData = async () => {
            try {
                const [teamsRes, usersRes] = await Promise.all([
                    API.get("/teams"),
                    API.get("/users/all-users")
                ]);
                setTeams(teamsRes.data || []);

                const usersData = usersRes.data?.users || usersRes.data || [];

                setUsers(usersData);
            } catch (err) {
                console.error(err);
            }
        };
        fetchData();
    }, []);


    const filteredTeams = teams.filter((team) =>
        team.name.toLowerCase().includes(teamSearch.toLowerCase())
    );

    const filteredUsers = users.filter((user) => {

        const matchesSearch =
            `${user.firstName || ""} ${user.lastName || ""} ${user.email}`
                .toLowerCase()
                .includes(userSearch.toLowerCase());

        const matchesTeam =
            selectedFilterTeam === "All Teams"
                ? true
                : user.team === selectedFilterTeam;

        return matchesSearch && matchesTeam;
    });

    const toggleTeam = (team: string) => {
        setSelectedTeams((prev) =>
            prev.includes(team)
                ? prev.filter((t) => t !== team)
                : [...prev, team]
        );
    };

    const toggleUser = (userId: string) => {
        setSelectedUsers((prev) =>
            prev.includes(userId)
                ? prev.filter((u) => u !== userId)
                : [...prev, userId]
        );
    };


    if (typeof window === "undefined") return null;

    return createPortal(
        <div role='dialog' className='relative z-50'>
            <div className='fixed inset-0 bg-gray-500/75 dark:bg-black/75 backdrop-blur-sm transition-opacity'></div>
            <div className='fixed inset-0 z-50 w-screen overflow-y-auto'
                onClick={() =>
                    setShowProjectModal(false)
                }
            >
                <div className='flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0'>
                    <div
                        onClick={(e) =>
                            e.stopPropagation()
                        }
                        className='relative transform rounded-lg bg-white dark:bg-slate-800 border border-transparent dark:border-slate-700 px-4 pt-5 pb-4 text-left shadow-xl dark:shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-[900px]'>

                        <form
                            onSubmit={async (e) => {
                                e.preventDefault();

                                const newProject = {
                                    name: projectName,
                                    teams: selectedTeams,
                                    users: selectedUsers,
                                };

                                try {
                                    setSaving(true);
                                    if (editingProject) {
                                        const projectId = editingProject._id || editingProject.id;
                                        await API.put(`/projects/${projectId}`, newProject);
                                        toast.success("Project updated successfully");
                                    } else {
                                        await API.post("/projects", newProject);
                                        toast.success("Project created successfully");
                                    }

                                    await fetchProjects();
                                    setShowProjectModal(false);
                                }
                                catch (err: any) {
                                    console.error(err);
                                    toast.error(err?.response?.data?.message || "Failed to save project");
                                } finally {
                                    setSaving(false);
                                }
                            }
                            }
                        >
                            <div className='flex items-center justify-between mb-6'>
                                <div>
                                    <h2 className='text-2xl font-bold text-gray-900 dark:text-white'>{editingProject ? "Edit Project" : "New Project Setup"}</h2>
                                    <p className='mt-1 text-sm text-gray-600 dark:text-slate-400'>{editingProject ? "Update project information and manage team access permissions" : "Define your project and manage team access permission"}</p>
                                </div>
                            </div>

                            <div className='flex gap-6'>
                                <nav className='w-64 flex-shrink-0 bg-gray-50 dark:bg-slate-900/50 p-6 border-r border-gray-200 dark:border-slate-700 rounded-l-lg' aria-label='Project sections'>
                                    <ul role='list' className='space-y-2'>
                                        <li>
                                            <button
                                                type='button'
                                                onClick={() =>
                                                    setActiveTab("details")
                                                }
                                                className={`group flex items-center gap-x-3 px-3 py-2.5 text-sm font-medium w-full transition-all rounded-md ${activeTab === "details"
                                                    ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold"
                                                    : "text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400"
                                                    }`} >
                                                <AiOutlineFileText className="text-indigo-600 dark:text-indigo-400 h-5 w-5 flex-shrink-0 transition-colors" />
                                                Project Details
                                            </button>
                                        </li>

                                        <li>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setActiveTab("access")
                                                }
                                                className={`group flex items-center gap-x-3 px-3 py-2.5 text-sm font-medium w-full transition-all rounded-md ${activeTab === "access"
                                                    ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold"
                                                    : "text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-indigo-600 dark:hover:text-indigo-400"
                                                    }`}>
                                                <FaUsers className="text-gray-400 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 h-5 w-5 flex-shrink-0 transition-colors" />
                                                Access & Permissions
                                            </button>
                                        </li>
                                    </ul>
                                </nav>

                                <div className="flex-1 min-w-0 px-6 min-h-[500px] max-h-[500px] overflow-y-auto">

                                    {activeTab === "details" && (
                                        <div className="space-y-5">
                                            <div>
                                                <label htmlFor="title" className="block text-sm font-medium text-gray-900 dark:text-slate-200 mb-1.5">
                                                    Project Name
                                                    <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    id="title"
                                                    type="text"
                                                    value={projectName}
                                                    onChange={(e) =>
                                                        setProjectName(e.target.value)
                                                    }
                                                    placeholder="Enter project name (e.g., Website ui modification 2026)"
                                                    required
                                                    className="block w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm px-4 py-2.5 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-20 transition-all"></input>
                                                <p className="mt-1.5 text-xs text-gray-500 dark:text-slate-400">Provide a unique and descriptive name to identify this project</p>
                                            </div>
                                        </div>
                                    )}


                                    {activeTab === "access" && (
                                        <div className="space-y-5">
                                            <div className="sticky top-0 bg-white dark:bg-slate-800 z-[100] mb-1.5">
                                                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-3">Access & Permissions</label>
                                                <div className="flex gap-6 border-b border-gray-200 dark:border-slate-700">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setAccessTab("teams")
                                                        }
                                                        className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-all ${accessTab === "teams"
                                                            ? "border-indigo-600 dark:border-indigo-400 text-indigo-700 dark:text-indigo-300 font-semibold"
                                                            : "border-transparent text-gray-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300"
                                                            }`}>
                                                        <HiOutlineUsers className="h-5 w-5" />
                                                        <span>Team-Based Access</span>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setAccessTab("users")
                                                        }
                                                        className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-all focus:outline-none ${accessTab === "users"
                                                            ? "border-indigo-600 dark:border-indigo-400 text-indigo-700 dark:text-indigo-300 font-semibold"
                                                            : "border-transparent text-gray-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300"
                                                            }`}>
                                                        <CiUser className="h-5 w-5" />
                                                        <span>Individual User Access</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {accessTab === "teams" && (
                                                <div>
                                                    <div>
                                                        <div className="flex items-start gap-2 mb-3 py-2">
                                                            <HiOutlineInformationCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                                            <p className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed">Grant project access to entire teams. All current and future team members will automatically receive access permissions.</p>
                                                        </div>

                                                        <div className="space-y-4">
                                                            <div>
                                                                <label htmlFor="team-search" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1"> Search Teams </label>
                                                                <div className="relative">
                                                                    <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400 dark:text-slate-400" />
                                                                    <input
                                                                        id="team-search"
                                                                        value={teamSearch}
                                                                        onChange={(e) =>
                                                                            setTeamSearch(e.target.value)
                                                                        }
                                                                        type="text"
                                                                        placeholder={
                                                                            accessTab === "teams"
                                                                                ? "Search teams..."
                                                                                : "Search users"
                                                                        }
                                                                        className="w-full pl-10 pr-3 py-2 rounded-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 placeholder-gray-400 dark:placeholder-slate-500 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"></input>
                                                                </div>
                                                            </div>

                                                            <div className="flex justify-between items-center text-sm text-gray-600 dark:text-slate-400">
                                                                <span>{selectedTeams.length} selected</span>
                                                                <span>Total: {filteredTeams.length} teams</span>
                                                            </div>

                                                            <div className="rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
                                                                <div className="max-h-80 overflow-y-auto">
                                                                    <div className="flex items-center px-4 py-3 bg-gray-50 dark:bg-slate-900/60 border-b border-gray-200 dark:border-slate-700 sticky top-0 z-10">
                                                                        <div className="flex gap-3 items-center">
                                                                            <div className="flex h-6 shrink-0 items-center">
                                                                                <div className="group grid size-4 grid-cols-1">
                                                                                    <input
                                                                                        id="select-all-teams"
                                                                                        type="checkbox"
                                                                                        checked={
                                                                                            filteredTeams.length > 0 &&
                                                                                            filteredTeams.every((team) =>

                                                                                                selectedTeams.includes(team.name)
                                                                                            )
                                                                                        }
                                                                                        onChange={(e) => {
                                                                                            if (e.target.checked) {

                                                                                                setSelectedTeams(filteredTeams.map((team) => team.name));
                                                                                            } else {
                                                                                                setSelectedTeams([])
                                                                                            }
                                                                                        }}
                                                                                        className="col-start-1 row-start-1 appearance-none rounded-sm border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 checked:border-indigo-600 checked:bg-indigo-600 indeterminate:border-indigo-600 indeterminate:bg-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:border-gray-300 dark:disabled:border-slate-700 disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:checked:bg-gray-100 dark:disabled:checked:bg-slate-800 forced-colors:appearance-auto"></input>
                                                                                    <MdOutlineCheckBoxOutlineBlank className="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-disabled:stroke-gray-950/25 dark:group-has-disabled:stroke-white/25" />
                                                                                </div>
                                                                            </div>

                                                                            <div className="text-sm/6">
                                                                                <label htmlFor="select-all-teams" className="font-medium text-gray-900 dark:text-slate-200">Select all {filteredTeams.length} on this page</label>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="divide-y divide-gray-100 dark:divide-slate-700/60">

                                                                        {filteredTeams.map((team) => (
                                                                            <div
                                                                                key={team._id || team.id}
                                                                                className="flex items-center px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                                                                            >
                                                                                <div className="flex gap-3 items-center">
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        checked={selectedTeams.includes(team.name)}
                                                                                        onChange={() => toggleTeam(team.name)}
                                                                                        className="h-4 w-4 rounded border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                                                                                    />

                                                                                    <label
                                                                                        className={`text-sm cursor-pointer ${selectedTeams.includes(team.name)
                                                                                            ? "font-semibold text-gray-900 dark:text-white"
                                                                                            : "text-gray-700 dark:text-slate-300"
                                                                                            }`}
                                                                                    >
                                                                                        {team.name}
                                                                                    </label>
                                                                                </div>
                                                                            </div>
                                                                        ))}

                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}


                                            {accessTab === "users" && (
                                                <div>
                                                    <div className="flex items-start gap-2 mb-3 py-2">
                                                        <HiOutlineInformationCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                                        <p className="text-xs text-gray-600 dark:text-slate-400 leading-relaxed">Grant project access to specific individual users. Select users who need direct access to this project.</p>
                                                    </div>

                                                    <div className="space-y-4">
                                                        <div className="flex flex-col md:flex-row md:items-end gap-4">
                                                            <div className="flex-1">
                                                                <label htmlFor="user-search" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Search Users</label>
                                                                <div className="relative">
                                                                    <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400 dark:text-slate-400" />
                                                                    <input
                                                                        id="user-search"
                                                                        value={userSearch}
                                                                        onChange={(e) =>
                                                                            setUserSearch(e.target.value)
                                                                        }
                                                                        type="text"
                                                                        placeholder="Search by name or email..."
                                                                        className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 placeholder-gray-400 dark:placeholder-slate-500 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"></input>
                                                                </div>
                                                            </div>

                                                            <div className="flex-1">
                                                                <label
                                                                    htmlFor="team-filter"
                                                                    className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1"
                                                                >
                                                                    Filter by Team
                                                                </label>

                                                                <div className="relative">

                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            setTeamDropdownOpen(!teamDropdownOpen)
                                                                        }
                                                                        className="relative w-full cursor-default rounded-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 py-2 pl-3 pr-10 text-left shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                                                    >
                                                                        <span className="block truncate">
                                                                            {selectedFilterTeam}
                                                                        </span>

                                                                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                                                            <TbSelector className="h-5 w-5 text-gray-400 dark:text-slate-400" />
                                                                        </span>
                                                                    </button>

                                                                    {teamDropdownOpen && (
                                                                        <div className="absolute z-20 mt-1 w-full rounded-md bg-white dark:bg-slate-800 shadow-lg border border-gray-200 dark:border-slate-700 max-h-60 overflow-auto">

                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    setSelectedFilterTeam("All Teams");
                                                                                    setTeamDropdownOpen(false);
                                                                                }}
                                                                                className="w-full text-left px-4 py-2 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm"
                                                                            >
                                                                                All Teams
                                                                            </button>

                                                                            {teams.map((team) => (
                                                                                <button
                                                                                    key={team._id || team.id}
                                                                                    type="button"
                                                                                    onClick={() => {
                                                                                        setSelectedFilterTeam(team.name);
                                                                                        setTeamDropdownOpen(false);
                                                                                    }}
                                                                                    className="w-full text-left px-4 py-2 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-900 dark:text-slate-100 text-sm"
                                                                                >
                                                                                    {team.name}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex justify-between items-center text-sm text-gray-600 dark:text-slate-400">
                                                            <span>{selectedUsers.length} selected</span>
                                                            <span>Total: {filteredUsers.length} users</span>
                                                        </div>

                                                        <div className="rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
                                                            <div className="max-h-[400px] overflow-y-auto">
                                                                <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700 bg-white dark:bg-slate-800 text-sm">
                                                                    <thead className="bg-gray-50 dark:bg-slate-900/60 sticky top-0 z-10">
                                                                        <tr>
                                                                            <th className="px-4 py-3 text-left">
                                                                                <div className="flex gap-3 items-center">
                                                                                    <div className="flex h-6 shrink-0 items-center">
                                                                                        <div className="group grid size-4 grid-cols-1">
                                                                                            <input
                                                                                                id="select-all-users"
                                                                                                type="checkbox"
                                                                                                checked={
                                                                                                    filteredUsers.length > 0 &&
                                                                                                    filteredUsers.every((user) =>

                                                                                                        selectedUsers.includes(user._id)
                                                                                                    )
                                                                                                }
                                                                                                onChange={(e) => {
                                                                                                    if (e.target.checked) {

                                                                                                        setSelectedUsers(filteredUsers.map((user) => user._id));
                                                                                                    } else {
                                                                                                        setSelectedUsers([])
                                                                                                    }
                                                                                                }}
                                                                                                                                className="col-start-1 row-start-1 appearance-none rounded-sm border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 checked:border-indigo-600 checked:bg-indigo-600 indeterminate:border-indigo-600 indeterminate:bg-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:border-gray-300 dark:disabled:border-slate-700 disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:checked:bg-gray-100 dark:disabled:checked:bg-slate-800 forced-colors:appearance-auto"></input>
                                                                                            <MdOutlineCheckBoxOutlineBlank className="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-disabled:stroke-gray-950/25 dark:group-has-disabled:stroke-white/25" />
                                                                                        </div>
                                                                                    </div>

                                                                                    <div className="text-sm/6">
                                                                                        <label htmlFor="select-all-users" className="font-medium text-gray-900 dark:text-slate-200">Select all {filteredUsers.length} on this page</label>

                                                                                    </div>
                                                                                </div>
                                                                            </th>

                                                                            <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">Team</th>
                                                                        </tr>
                                                                    </thead>

                                                                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">

                                                                        {filteredUsers.map((user) => {
                                                                            const userId = user._id || user.id;
                                                                            return (
                                                                            <tr
                                                                                key={userId}
                                                                                className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                                                                            >
                                                                                <td className="px-4 py-3">
                                                                                    <div className="flex gap-3 items-center">
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={selectedUsers.includes(userId)}
                                                                                            onChange={() => toggleUser(userId)}
                                                                                            className="h-4 w-4 rounded border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                                                                                        />

                                                                                        <div className="flex items-center gap-3">
                                                                                            {user.avatar?.trim() ? (
                                                                                                <Image
                                                                                                    src={user.avatar}
                                                                                                    alt={`${user.firstName} ${user.lastName}`}
                                                                                                    width={32}
                                                                                                    height={32}
                                                                                                    unoptimized
                                                                                                    className="h-8 w-8 rounded-full object-cover"
                                                                                                />
                                                                                            ) : (
                                                                                                <div className="h-8 w-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-sm font-semibold">
                                                                                                    {user.firstName?.charAt(0).toUpperCase()}
                                                                                                </div>
                                                                                            )}

                                                                                            <div>
                                                                                                <div
                                                                                                    className={
                                                                                                        selectedUsers.includes(user._id)
                                                                                                            ? "font-semibold text-gray-900 dark:text-white"
                                                                                                            : "text-gray-700 dark:text-slate-300"
                                                                                                    }
                                                                                                >
                                                                                                    {user.firstName} {user.lastName}
                                                                                                </div>

                                                                                                <div className="text-xs text-gray-500 dark:text-slate-400">
                                                                                                    {user.email}
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                </td>

                                                                                <td className="px-4 py-3 text-gray-600 dark:text-slate-400">
                                                                                    {user.team || "Default team"}
                                                                                </td>
                                                                            </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>


                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-slate-700">
                                <button
                                    type="submit"
                                    disabled={!projectName.trim() || saving}
                                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                                    <Check className="w-4 h-4" />
                                    <span>{saving ? "Saving..." : (editingProject ? "Update Project" : "Create New Project")}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div >
        </div>,
        document.body
    )
}

export default NewProject
