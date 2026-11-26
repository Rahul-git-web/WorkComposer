"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import API from "@/api";

const emptySubscribe = () => () => {};
import toast from "react-hot-toast";
import { Search } from 'lucide-react';

interface User {
  _id: string;
  id?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email: string;
  avatar?: string;
  role?: string;
  team?: string;
  status?: string;
  manager?: any;
  managers?: any[];

  managedUsersCount?: number;
  managedTeamsCount?: number;
}

interface UserManagerProps {
  userId: string;
  onClose: () => void;
}

const UserManager = ({
  userId,
  onClose,
}: UserManagerProps) => {
  const [activeTab, setActiveTab] = useState("Users");

  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [teamSearch, setTeamSearch] = useState("");
  const [userTeamFilter, setUserTeamFilter] = useState("");
  const [teams, setTeams] = useState<any[]>([]);
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);


  const getUserTeamName = useCallback((user: User) => {
    return (user.team && String(user.team).trim()) || "Default team";
  }, []);

  const syncTeamsFromUsers = useCallback(
    (nextUserIds: string[], prevTeams: string[], userList: User[]) => {
      const nextSet = new Set(nextUserIds);
      const membersByTeam = new Map<string, string[]>();

      for (const u of userList) {
        const uid = u._id || u.id;
        if (!uid || uid === userId || u.status === "invited") continue;
        const teamName = getUserTeamName(u);
        const list = membersByTeam.get(teamName) || [];
        list.push(uid);
        membersByTeam.set(teamName, list);
      }

      const nextTeams = new Set(prevTeams);
      for (const [teamName, memberIds] of membersByTeam.entries()) {
        if (memberIds.length > 0 && memberIds.every((id) => nextSet.has(id))) {
          nextTeams.add(teamName);
        } else {
          nextTeams.delete(teamName);
        }
      }

      return Array.from(nextTeams);
    },
    [userId, getUserTeamName]
  );

  // FETCH USERS, TEAMS & ASSIGNMENTS

  const loadModalData = useCallback(async () => {
    try {
      setLoading(true);

      const [usersRes, teamsRes, assignmentsRes] = await Promise.all([
        API.get("/users/all-users?limit=1000"),
        API.get("/teams"),
        API.get(`/users/${userId}/manager-assignments`),
      ]);

      const fetchedUsers: User[] = (
        Array.isArray(usersRes.data?.users) ? usersRes.data.users : []
      ).filter((u: User) => u.status !== "invited");

      const fetchedTeams = Array.isArray(teamsRes.data) ? teamsRes.data : [];

      const fetchedUserIds: string[] = Array.isArray(assignmentsRes.data?.userIds)
        ? assignmentsRes.data.userIds.map((id: any) => String(id))
        : [];
      const fetchedTeamNames: string[] = Array.isArray(assignmentsRes.data?.teams)
        ? assignmentsRes.data.teams.filter(Boolean)
        : [];

      setUsers(fetchedUsers);
      setTeams(fetchedTeams);
      setSelectedUsers(fetchedUserIds);
      setSelectedTeams(
        syncTeamsFromUsers(fetchedUserIds, fetchedTeamNames, fetchedUsers)
      );
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to load manager data");
    } finally {
      setLoading(false);
    }
  }, [userId, syncTeamsFromUsers]);

  useEffect(() => {
    loadModalData();
  }, [loadModalData]);

  const assignableUsers = useMemo(() => {
    return users.filter((user) => {
      const currentUserId = user._id || user.id;
      return (
        Boolean(currentUserId) &&
        currentUserId !== userId &&
        user.status !== "invited"
      );
    });
  }, [users, userId]);

  const filteredUsers = useMemo(() => {
    return assignableUsers.filter((user) => {
      const fullName =
        `${user.firstName || ""} ${user.lastName || ""}`.toLowerCase();

      const matchesSearch =
        fullName.includes(search.toLowerCase()) ||
        user.email.toLowerCase().includes(search.toLowerCase());

      const matchesTeam =
        userTeamFilter === "" ||
        userTeamFilter === "All Teams" ||
        getUserTeamName(user) === userTeamFilter;

      return matchesSearch && matchesTeam;
    });
  }, [assignableUsers, search, userTeamFilter, getUserTeamName]);

  const handleUserSelect = (id: string) => {
    const nextUsers = selectedUsers.includes(id)
      ? selectedUsers.filter((uid) => uid !== id)
      : [...selectedUsers, id];
    setSelectedUsers(nextUsers);
    setSelectedTeams((prevTeams) =>
      syncTeamsFromUsers(nextUsers, prevTeams, assignableUsers)
    );
  };

  const handleTeamSelect = (team: string) => {
    const isCurrentlySelected = selectedTeams.includes(team);
    const teamMemberIds = assignableUsers
      .filter((u) => getUserTeamName(u) === team)
      .map((u) => u._id || u.id || "")
      .filter(Boolean);

    if (isCurrentlySelected) {
      const teamMemberSet = new Set(teamMemberIds);
      setSelectedTeams((prev) => prev.filter((t) => t !== team));
      setSelectedUsers((prev) => prev.filter((id) => !teamMemberSet.has(id)));
    } else {
      setSelectedTeams((prev) => (prev.includes(team) ? prev : [...prev, team]));
      setSelectedUsers((prev) => [...new Set([...prev, ...teamMemberIds])]);
    }
  };

  const handleSelectAllUsers = () => {
    const filteredIds = filteredUsers
      .map((u) => u._id || u.id || "")
      .filter(Boolean);
    const filteredSet = new Set(filteredIds);

    const allSelected =
      filteredIds.length > 0 &&
      filteredIds.every((id) => selectedUsers.includes(id));

    const nextUsers = allSelected
      ? selectedUsers.filter((id) => !filteredSet.has(id))
      : [...new Set([...selectedUsers, ...filteredIds])];

    setSelectedUsers(nextUsers);
    setSelectedTeams((prevTeams) =>
      syncTeamsFromUsers(nextUsers, prevTeams, assignableUsers)
    );
  };

  const handleSelectAllTeams = () => {
    const visibleTeams = filteredTeams;
    const allSelected =
      visibleTeams.length > 0 &&
      visibleTeams.every((team) => selectedTeams.includes(team));

    const visibleTeamSet = new Set(visibleTeams);
    const visibleMemberIds = assignableUsers
      .filter((u) => visibleTeamSet.has(getUserTeamName(u)))
      .map((u) => u._id || u.id || "")
      .filter(Boolean);
    const visibleMemberSet = new Set(visibleMemberIds);

    if (allSelected) {
      setSelectedTeams((prev) => prev.filter((t) => !visibleTeamSet.has(t)));
      setSelectedUsers((prev) => prev.filter((id) => !visibleMemberSet.has(id)));
    } else {
      setSelectedTeams((prev) => [...new Set([...prev, ...visibleTeams])]);
      setSelectedUsers((prev) => [...new Set([...prev, ...visibleMemberIds])]);
    }
  };

  const handleCloseModal = useCallback(() => {
    setSearch("");
    setTeamSearch("");
    setUserTeamFilter("");
    onClose();
  }, [onClose]);

  // ASSIGN MANAGER

  const assignUsersToManager = async () => {
    try {
      setSaving(true);

      await API.put(`/users/${userId}/assign-manager`, {
        userIds: selectedUsers,
        teams: selectedTeams,
      });

      toast.success("Users assigned successfully");

      setSelectedUsers([]);
      setSelectedTeams([]);

      handleCloseModal();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to assign users");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCloseModal();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [handleCloseModal]);

  const filteredTeams = useMemo(() => {

    const allTeams = [
      "Default team",
      ...teams.map((team) => team.name),
    ];

    return [...new Set(allTeams)].filter(
      (team): team is string =>
        Boolean(team) &&
        team.toLowerCase().includes(teamSearch.toLowerCase())
    );

  }, [teams, teamSearch]);

  const getAvatar = (avatar?: string) => {
    return avatar?.trim() ? avatar : "";
  };

  const getInitials = (user: User) => {
    if (user.name?.trim()) {
      return user.name
        .trim()
        .split(" ")
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");
    }

    return user.email[0]?.toUpperCase() || "?";
  };


  const manager = users.find((u) => (u._id || u.id) === userId);
  const managerDisplayName = manager
    ? (`${manager.firstName || ""} ${manager.lastName || ""}`.trim() || manager.name || manager.email)
    : "";


  if (!mounted) return null;

  return createPortal(
    <>
      {/* MODAL */}
      <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 overscroll-contain">
        <div className="absolute inset-0 bg-black/50 dark:bg-black/75 backdrop-blur-sm"></div>

        <div
          onClick={handleCloseModal}
          className="absolute inset-0 flex items-center justify-center p-4 overflow-y-auto overscroll-contain"
        >
          <div onClick={(e) =>
            e.stopPropagation()
          }
            className="w-full max-w-2xl rounded-xl bg-white dark:bg-slate-800 border border-transparent dark:border-slate-700 shadow-xl dark:shadow-2xl max-h-[90vh] overflow-y-auto overscroll-contain">
            {/* HEADER */}

            <div className="px-8 pt-8 text-center">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Manager - {managerDisplayName}
              </h2>
            </div>

            {/* CONTENT */}

            <div className="p-6">
              {loading ? (
                <div className="py-12 text-center text-lg font-medium text-gray-600 dark:text-slate-300">
                  Loading users...
                </div>
              ) : (
                <>
              {/* TABS */}

              <div className="border-b border-gray-200 dark:border-slate-700 mb-3">
                <nav className="flex gap-8">
                  <button
                    onClick={() => setActiveTab("Teams")}
                    className={`pb-2 border-b-2 text-sm font-medium ${activeTab === "Teams"
                      ? "border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400"
                      : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
                      }`}
                  >
                    Teams
                  </button>

                  <button
                    onClick={() => setActiveTab("Users")}
                    className={`pb-2 border-b-2 text-sm font-medium ${activeTab === "Users"
                      ? "border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400"
                      : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
                      }`}
                  >
                    Users
                  </button>
                </nav>
              </div>

              {/* USERS TAB */}

              {activeTab === "Users" && (
                <div className="space-y-5">
                  {/* Top */}

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-800 dark:text-slate-200 mb-2"> Search Users </label>

                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search by name or email..."
                          value={search}
                          onChange={(e) =>
                            setSearch(e.target.value)
                          }
                          className="w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 placeholder-gray-400 dark:placeholder-slate-500 px-4 py-2 pl-10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        ></input>

                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-800 dark:text-slate-200 mb-2">Filter by Team</label>

                      <select
                        value={userTeamFilter}
                        onChange={(e) =>
                          setUserTeamFilter(e.target.value)
                        }
                        className="w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">All Teams</option>

                        {filteredTeams.map(
                          (team, index) =>
                            team && (
                              <option
                                key={team}
                                value={team}
                              >
                                {team}
                              </option>
                            )
                        )}
                      </select>
                    </div>
                  </div>

                  {/* SELECTION */}

                  <div className="flex items-center justify-between text-sm">
                    <p className="text-gray-600 dark:text-slate-400">{
                      filteredUsers.filter((user) =>
                        selectedUsers.includes(user._id || (user as any).id)
                      ).length
                    } selected
                    </p>

                    <p className="text-gray-600 dark:text-slate-400">Total: {filteredUsers.length}{" "}
                      {filteredUsers.length === 1 ? "user" : "users"}
                    </p>
                  </div>

                  {/* TABLE */}

                  <div className="rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
                    <table className="min-w-full">

                      {/* HEADER */}

                      <thead className="bg-gray-50 dark:bg-slate-900/60 border-b border-gray-200 dark:border-slate-700">
                        <tr>

                          <th className="px-4 py-4 text-left w-[70%]">
                            <div className="flex items-center gap-3">

                              <input
                                type="checkbox"

                                checked={
                                  filteredUsers.length > 0 &&
                                  filteredUsers.every((user) =>
                                    selectedUsers.includes(user._id || (user as any).id)
                                  )
                                }
                                onChange={handleSelectAllUsers}
                                className="h-3.5 w-3.5 rounded border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                              ></input>

                              <span className="text-sm font-medium text-gray-900 dark:text-slate-200">Select all {filteredUsers.length} on this page</span>
                            </div>
                          </th>

                          <th className="px-4 py-4 text-left text-sm font-semibold text-gray-900 dark:text-slate-200">Team</th>
                        </tr>
                      </thead>

                      {/* BODY  */}

                      <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-100 dark:divide-slate-700/60">
                        {filteredUsers.map((user) =>
                        (
                          <tr
                            key={user._id || user.email}

                            className="hover:bg-gray-50 dark:hover:bg-slate-700/50"
                          >
                            <td className="px-4 py-5">
                              <div className="flex items-center gap-4">
                                <input
                                  type="checkbox"
                                  checked={selectedUsers.includes(user._id || (user as any).id)}
                                  onChange={() =>
                                    handleUserSelect(user._id || (user as any).id)
                                  }
                                  className="h-3.5 w-3.5 rounded border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                                ></input>

                                {getAvatar(user.avatar) ? (
                                  <img
                                    src={getAvatar(user.avatar)}
                                    alt={user.name || user.email}
                                    width={44}
                                    height={44}
                                    className="h-11 w-11 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="h-11 w-11 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-semibold text-sm">
                                    {getInitials(user)}
                                  </div>
                                )}

                                <div>
                                  <p className="text-sm font-semibold text-gray-900 dark:text-white leading-none">
                                    {`${user.firstName || ""} ${user.lastName || ""}`.trim() || user.name || user.email}
                                  </p>

                                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{user.email}</p>
                                  {(() => {
                                    const coManagers = (
                                      Array.isArray(user.managers) && user.managers.length > 0
                                        ? user.managers
                                        : user.manager
                                          ? [user.manager]
                                          : []
                                    )
                                      .filter(
                                        (m: any) =>
                                          m &&
                                          typeof m === "object" &&
                                          (m._id || m.id) !== userId
                                      )
                                      .map(
                                        (m: any) =>
                                          `${m.firstName || ""} ${m.lastName || ""}`.trim() ||
                                          m.email
                                      )
                                      .filter(Boolean);
                                    if (coManagers.length === 0) return null;
                                    return (
                                      <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
                                        Co-managers: {coManagers.join(", ")}
                                      </p>
                                    );
                                  })()}
                                </div>
                              </div>
                            </td>


                            {/* TEAM */}


                            <td className="px-4 py-5 text-gray-500 dark:text-slate-400 text-sm">{user.team || "Default team"}</td>
                          </tr>
                        )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TEAMS TAB */}

              {activeTab === "Teams" && (
                <div className="space-y-5">
                  <span className="text-gray-700 dark:text-slate-200 text-sm font-semibold">Search Teams</span>

                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search teams..."
                      value={teamSearch}
                      onChange={(e) => setTeamSearch(e.target.value)}
                      className="w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 placeholder-gray-400 dark:placeholder-slate-500 px-4 py-2 pl-10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />

                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-slate-400" />
                  </div>

                  {/* Selection Row */}

                  <div className="flex items-center justify-between mb-3 text-sm">
                    <p className="text-gray-600 dark:text-slate-400"> {selectedTeams.length} selected</p>

                    <p className="text-gray-600 dark:text-slate-400">Total: {filteredTeams.length}{" "}
                      {filteredTeams.length === 1 ? "team" : "teams"}
                    </p>
                  </div>

                  <div className="rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">

                      <thead className="bg-gray-50 dark:bg-slate-900/60">
                        <tr className="border-b border-gray-200 dark:border-slate-700">
                          <th className="px-3.5 py-3.5 text-left">
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"

                                checked={
                                  filteredTeams.length > 0 &&
                                  filteredTeams.every((team) =>
                                    selectedTeams.includes(team)
                                  )
                                }
                                onChange={handleSelectAllTeams}
                                className="h-3.5 w-3.5 rounded border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                              />

                              <span className="text-sm font-medium text-gray-900 dark:text-white">
                                Select all {filteredTeams.length} on this page
                              </span>
                            </div>
                          </th>
                        </tr>
                      </thead>

                      <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-100 dark:divide-slate-700/60">
                        {filteredTeams.map(
                          (team, index) =>
                            team && (
                              <tr
                                key={team}
                                className="hover:bg-gray-50 dark:hover:bg-slate-700/50"
                              >
                                <td className="px-4 py-4">
                                  <div className="flex items-center gap-3">
                                    <input
                                      type="checkbox"
                                      checked={selectedTeams.includes(team)}
                                      onChange={() =>
                                        handleTeamSelect(team)
                                      }
                                      className="h-3.5 w-3.5 rounded border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                                    />

                                    <span className="text-sm text-gray-900 dark:text-slate-200">
                                      {team}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            )
                        )}
                      </tbody>

                    </table>
                  </div>
                </div>
              )}

              {/* FOOTER */}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={handleCloseModal}
                  className="rounded-md bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-200 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600"
                >
                  Close
                </button>

                <button
                  onClick={assignUsersToManager}
                  disabled={saving}
                  className={`rounded-md px-4 py-2 text-sm font-medium text-white
                     ${saving ? "bg-indigo-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700"}`
                  }
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div >

    </>,
    document.body
  );
};

export default UserManager;