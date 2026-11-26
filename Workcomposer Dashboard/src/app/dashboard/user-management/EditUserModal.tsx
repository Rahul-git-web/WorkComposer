"use client";

import { X, Check } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import API from "@/api";

const emptySubscribe = () => () => {};
import toast from "react-hot-toast";
import { HiOutlinePencil } from "react-icons/hi2";
import { TbSelector } from "react-icons/tb";
import ChangeEmailModal from './ChangeEmailModal';

interface EditUserModalProps {
    user: any;
    setShowEditModal: React.Dispatch<React.SetStateAction<boolean>>;
    setUsers: React.Dispatch<React.SetStateAction<any[]>>;
    availableManagers?: any[];
    onUserUpdated?: () => Promise<void> | void;
}

const extractManagerIdsFromUser = (u: any): string[] => {
    const rawList =
        Array.isArray(u?.managers) && u.managers.length > 0
            ? u.managers
            : u?.manager
              ? [u.manager]
              : [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of rawList) {
        const id =
            typeof item === "object" && item !== null ? item._id || item.id : item;
        if (typeof id === "string" && id && !seen.has(id)) {
            seen.add(id);
            out.push(id);
        }
    }
    return out;
};

const formatManagerLabel = (m: any): string => {
    const fullName = `${m?.firstName ?? ""} ${m?.lastName ?? ""}`.trim();
    return fullName || m?.name || m?.email || "Unknown";
};

const EditUserModal = ({
    user,
    setShowEditModal,
    setUsers,
    availableManagers,
    onUserUpdated,
}: EditUserModalProps) => {

    const targetUserId = user?.id || user?._id || "";
    const initialManagerIds = extractManagerIdsFromUser(user);
    const [loading, setLoading] = useState(false);
    const [firstName, setFirstName] = useState(user?.firstName || "");
    const [lastName, setLastName] = useState(user?.lastName || "");
    const [team, setTeam] = useState(user?.team || "Default team");
    const [teamDropdown, setTeamDropdown] = useState(false);
    const [managerDropdown, setManagerDropdown] = useState(false);
    const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>(initialManagerIds);
    const [managerCandidates, setManagerCandidates] = useState<any[]>(
        Array.isArray(availableManagers) ? availableManagers : []
    );
    const [showChangeEmailModal, setShowChangeEmailModal] = useState(false);
    const [teams, setTeams] = useState<any[]>([]);
    const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

    const eligibleManagers = managerCandidates.filter((candidate: any) => {
        const cid = candidate?._id || candidate?.id;
        if (!cid || cid === targetUserId) return false;
        if (candidate?.isArchived || candidate?.status === "archived") return false;
        const roleLower = (candidate?.role || "").toLowerCase();
        return roleLower === "manager" || roleLower === "admin" || roleLower === "owner";
    });

    const toggleManagerSelection = (managerId: string) => {
        setSelectedManagerIds((prev) =>
            prev.includes(managerId)
                ? prev.filter((id) => id !== managerId)
                : [...prev, managerId]
        );
    };

    const handleSave = async () => {

        try {

            setLoading(true);

            const res = await API.put(
                `/users/${targetUserId}`,
                {
                    firstName,
                    lastName,
                    team,
                }
            );

            const isOwnerTarget = (user?.role || "").toLowerCase() === "owner";
            const originalManagerIds = extractManagerIdsFromUser(user);
            const managersChanged =
                selectedManagerIds.length !== originalManagerIds.length ||
                selectedManagerIds.some((id, idx) => id !== originalManagerIds[idx]);

            if (!isOwnerTarget && managersChanged) {
                await API.put(`/users/${targetUserId}/assign-manager`, {
                    managerIds: selectedManagerIds,
                });
            }

            const selectedManagerObjects = selectedManagerIds
                .map((id) =>
                    eligibleManagers.find((m: any) => (m._id || m.id) === id)
                )
                .filter(Boolean);

            setUsers((prev: any) =>
                prev.map((u: any) =>
                    (u.id || u._id) === targetUserId
                        ? {
                            ...u,
                            ...res.data.user,
                            ...(isOwnerTarget
                                ? {}
                                : {
                                      managers: selectedManagerObjects,
                                      manager: selectedManagerObjects[0] || null,
                                  }),
                        }
                        : u
                )
            );

            if (onUserUpdated) {
                await onUserUpdated();
            }

            toast.success("User updated successfully");
            setShowEditModal(false);

        } catch (err: any) {

            console.error(err);
            toast.error(err?.response?.data?.message || "Failed to update user");

        } finally {

            setLoading(false);
        }
    };

    const fetchTeams = async () => {
        try {
            const res = await API.get("/teams");
            setTeams(res.data || []);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchTeams();
        if (!Array.isArray(availableManagers) || availableManagers.length === 0) {
            API.get("/users/all-users")
                .then((res) => {
                    if (Array.isArray(res.data?.users)) {
                        setManagerCandidates(res.data.users);
                    }
                })
                .catch((err) => console.error(err));
        }
    }, [availableManagers]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (!(e.target as HTMLElement).closest(".dropdown")) {
                setTeamDropdown(false);
                setManagerDropdown(false);
            }
        };

        window.addEventListener("click", handleClickOutside);
        return () => window.removeEventListener("click", handleClickOutside);
    }, []);

    if (!mounted) return null;

    return createPortal(
        <>
            <div role="dialog" className="relative z-50" aria-modal='true'>
                <div className="fixed inset-0 bg-gray-500/75 dark:bg-black/75 backdrop-blur-sm transition-opacity"></div>
                <div
                    onClick={() => setShowEditModal(false)}
                    className="fixed inset-0 z-50 overflow-y-auto overscroll-contain">
                    <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                        <div
                            onClick={(e) => e.stopPropagation()}
                            className="relative transform rounded-lg bg-white dark:bg-slate-800 border border-transparent dark:border-slate-700 px-4 pt-5 pb-4 text-left shadow-xl dark:shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-xl sm:p-6 space-y-5">

                            <div className="flex justify-between items-center">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Edit User</h2>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setShowEditModal(false)
                                    }
                                    className="text-gray-400 dark:text-slate-400 hover:text-gray-500 dark:hover:text-slate-200 focus:outline-none">
                                    <X className='h-6 w-6' />
                                </button>
                            </div>

                            <div className='border-t border-gray-200 dark:border-slate-700 my-5'></div>
                            <div>
                                <label htmlFor='email' className='block text-sm font-medium text-gray-700 dark:text-slate-300'>Email</label>
                                <div className='mt-1 flex gap-2'>
                                    <input
                                        type='email'
                                        value={user?.email || ""}
                                        className='w-full rounded-md border-0 py-2 px-3 text-gray-900 dark:text-slate-100 bg-gray-50 dark:bg-slate-900 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-700 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm' readOnly></input>
                                    <button
                                        type='button'
                                        onClick={() =>
                                            setShowChangeEmailModal(true)
                                        }
                                        className='shrink-0 inline-flex items-center font-semibold cursor-pointer gap-1 px-3 py-2 rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors duration-200'>
                                        <HiOutlinePencil className='w-4 h-4' />
                                        Change Email
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label htmlFor='first-name' className='block text-sm font-medium text-gray-700 dark:text-slate-300'>First Name</label>
                                <input
                                    id='first-name'
                                    type='text'
                                    value={firstName}
                                    onChange={(e) =>
                                        setFirstName(e.target.value)
                                    }
                                    className='mt-1 block w-full rounded-md border-0 py-2 px-3 text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-900 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-700 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm'></input>
                            </div>

                            <div>
                                <label htmlFor='last-name' className='block text-sm font-medium text-gray-700 dark:text-slate-300'>Last Name</label>
                                <input
                                    id='last-name'
                                    type='text'
                                    value={lastName}
                                    onChange={(e) =>
                                        setLastName(e.target.value)
                                    }
                                    className='mt-1 block w-full rounded-md border-0 py-2 px-3 text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-900 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-700 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm'></input>
                            </div>

                            <div>
                                <label htmlFor='team' className='block text-sm font-medium text-gray-700 dark:text-slate-300'>Team
                                    <span className='text-gray-400 dark:text-slate-400 text-xs'> – team, office, location or anything that would help grouping</span>
                                </label>
                                <div>
                                    <div className='relative mt-2 dropdown'>
                                        <button
                                            type='button'
                                            onClick={() =>
                                                setTeamDropdown(!teamDropdown)
                                            }
                                            aria-haspopup='listbox' aria-expanded={teamDropdown} className='relative w-full cursor-default rounded-md border-0 py-2 px-3 text-left text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-900 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-700 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm'>
                                            <span className='block truncate pr-6'>{team}</span>
                                            <span className='pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2'>
                                                <TbSelector className='h-4 w-4 text-gray-400 dark:text-slate-400' />
                                            </span>
                                        </button>

                                        {teamDropdown && (
                                            <ul aria-orientation='vertical' role='listbox' className='absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-slate-800 py-1 text-base shadow-lg ring-1 ring-black/5 dark:ring-slate-700 focus:outline-none sm:text-sm'>

                                                {["Default team", ...teams.map((t: any) => t.name)].map(
                                                    (teamName) => (
                                                        <li
                                                            key={teamName}
                                                            onClick={() => {
                                                                setTeam(teamName);
                                                                setTeamDropdown(false);
                                                            }}
                                                            className='text-gray-900 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 relative cursor-pointer select-none py-2 pl-3 pr-9'
                                                            role='option'
                                                        >
                                                            <span className='font-medium block truncate'>
                                                                {teamName}
                                                            </span>

                                                            {team === teamName && (
                                                                <span className='text-indigo-600 dark:text-indigo-400 absolute inset-y-0 right-0 flex items-center pr-4'>
                                                                    <Check className='h-5 w-5' />
                                                                </span>
                                                            )}
                                                        </li>
                                                    )
                                                )}

                                            </ul>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {(user?.role || "").toLowerCase() !== "owner" && (
                                <div>
                                    <label className='block text-sm font-medium text-gray-700 dark:text-slate-300'>
                                        Assigned Managers
                                        <span className='text-gray-400 dark:text-slate-400 text-xs'> – select one or more managers</span>
                                    </label>
                                    <div className='relative mt-2 dropdown'>
                                        <button
                                            type='button'
                                            onClick={() => {
                                                setManagerDropdown((prev) => !prev);
                                                setTeamDropdown(false);
                                            }}
                                            aria-haspopup='listbox'
                                            aria-expanded={managerDropdown}
                                            className='relative w-full cursor-pointer rounded-md border-0 py-2 px-3 text-left text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-900 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-700 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm'
                                        >
                                            <span className='block truncate pr-6'>
                                                {selectedManagerIds.length === 0
                                                    ? "No manager assigned"
                                                    : selectedManagerIds
                                                          .map((id) => {
                                                              const m = eligibleManagers.find((cand: any) => (cand._id || cand.id) === id);
                                                              return m ? formatManagerLabel(m) : "";
                                                          })
                                                          .filter(Boolean)
                                                          .join(", ") || `${selectedManagerIds.length} manager(s) selected`}
                                            </span>
                                            <span className='pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2'>
                                                <TbSelector className='h-4 w-4 text-gray-400 dark:text-slate-400' />
                                            </span>
                                        </button>

                                        {managerDropdown && (
                                            <div
                                                role='listbox'
                                                aria-multiselectable='true'
                                                className='absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md bg-white dark:bg-slate-800 py-1 text-base shadow-lg ring-1 ring-black/5 dark:ring-slate-700 focus:outline-none sm:text-sm'
                                            >
                                                {eligibleManagers.length === 0 ? (
                                                    <div className='px-3 py-2 text-xs text-gray-500 dark:text-slate-400'>
                                                        No eligible managers available
                                                    </div>
                                                ) : (
                                                    eligibleManagers.map((mgr: any) => {
                                                        const mgrId = mgr._id || mgr.id;
                                                        const checked = selectedManagerIds.includes(mgrId);
                                                        return (
                                                            <label
                                                                key={mgrId}
                                                                className='flex items-center justify-between cursor-pointer select-none py-2 px-3 text-gray-900 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700'
                                                            >
                                                                <span className='flex items-center gap-2.5 min-w-0'>
                                                                    <input
                                                                        type='checkbox'
                                                                        checked={checked}
                                                                        onChange={() => toggleManagerSelection(mgrId)}
                                                                        className='h-4 w-4 rounded border-gray-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-600 bg-white dark:bg-slate-900'
                                                                    />
                                                                    <span className='truncate font-medium'>
                                                                        {formatManagerLabel(mgr)}
                                                                    </span>
                                                                    <span className='text-xs text-gray-400 dark:text-slate-400 capitalize shrink-0'>
                                                                        ({mgr.role})
                                                                    </span>
                                                                </span>
                                                            </label>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label htmlFor='user-id' className='block text-sm font-medium text-gray-700 dark:text-slate-300'>User ID</label>
                                <input
                                    id='user-id'
                                    type='text'
                                    value={user?.id || user?._id || ""}
                                    readOnly className='mt-1 block w-full rounded-md border-0 py-2 px-3 text-gray-900 dark:text-slate-100 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-700 bg-gray-50 dark:bg-slate-900 sm:text-sm'></input>
                            </div>

                            <div>
                                <label htmlFor='external-id' className='block text-sm font-medium text-gray-700 dark:text-slate-300'>External ID (optional)</label>
                                <input id='external-id' type='text' placeholder='ID of the user in your organization' className='mt-1 block w-full rounded-md border-0 py-2 px-3 text-gray-900 dark:text-slate-100 bg-white dark:bg-slate-900 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-700 placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm'></input>
                            </div>

                            <div className='pt-5 flex justify-end gap-3'>
                                <button
                                    type='button'
                                    onClick={() =>
                                        setShowEditModal(false)
                                    }
                                    className='rounded-md bg-white dark:bg-slate-700 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-200 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800'>Cancel</button>
                                <button
                                    type='button'
                                    onClick={handleSave}
                                    disabled={loading}
                                    className='rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 transition-colors duration-200'>Save</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showChangeEmailModal && (
                <ChangeEmailModal
                    user={user}
                    setUsers={setUsers}
                    setShowChangeEmailModal={
                        setShowChangeEmailModal
                    }
                />
            )}
        </>,
        document.body
    )
}

export default EditUserModal
