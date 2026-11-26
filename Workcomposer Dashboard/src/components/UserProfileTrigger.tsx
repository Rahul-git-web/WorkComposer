"use client";

import { useState, useRef } from "react";
import API from "@/api";
import UserProfileModal from "@/components/UserProfilemodal";
import { mapUserToProfileData } from "@/utils/mapUserToProfileData";
import toast from "react-hot-toast";

type Props = {
    user: any;
    children: React.ReactNode;
    className?: string;
    trackingStatus?: string;
};

export default function UserProfileTrigger({
    user,
    children,
    className = "",
    trackingStatus,
}: Props) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [profileUser, setProfileUser] = useState<any>(null);
    const activeRequestIdRef = useRef<number>(0);

    if (!user) {
        return <>{children}</>;
    }

    const userId = user._id || user.id;

    const handleOpenProfile = async () => {
        if (!userId || loading) return;

        const requestId = ++activeRequestIdRef.current;

        // Open immediately so there is no delayed mount/flicker.
        setOpen(true);
        setLoading(true);

        try {
            const { data } = await API.get(
                `/users/profile/${userId}`
            );

            // Guard against late out-of-order responses
            if (requestId === activeRequestIdRef.current) {
                const resolvedProfile = data
                    ? {
                        ...data,
                        managers:
                            Array.isArray(data.managers) && data.managers.length > 0
                                ? data.managers
                                : Array.isArray(user?.managers) && user.managers.length > 0
                                    ? user.managers
                                    : data.manager
                                        ? [data.manager]
                                        : [],
                    }
                    : data;
                setProfileUser(resolvedProfile);
            }
        } catch (error: any) {
            if (requestId === activeRequestIdRef.current) {
                setOpen(false);
                setProfileUser(null);

                // Informative, non-intrusive feedback for permission-denied errors
                if (error?.response?.status === 403) {
                    const message =
                        error?.response?.data?.message ||
                        "You do not have permission to view this profile.";
                    toast.error(message);
                } else if (error?.response?.status === 404) {
                    toast.error("User profile not found.");
                } else {
                    console.error(
                        "FAILED TO FETCH USER PROFILE:",
                        error?.response?.data || error
                    );
                    toast.error("Failed to load user profile.");
                }
            }
        } finally {
            if (requestId === activeRequestIdRef.current) {
                setLoading(false);
            }
        }
    };

    const handleClose = () => {
        // Increment requestId to cancel any in-flight response from applying
        activeRequestIdRef.current++;
        setOpen(false);
        setProfileUser(null);
        setLoading(false);
    };

    return (
        <>
            <button
                type="button"
                onClick={handleOpenProfile}
                disabled={loading}
                className={`${className} ${loading ? "cursor-wait" : ""}`}
                title="View profile"
            >
                {children}
            </button>

            <UserProfileModal
                open={open}
                onClose={handleClose}
                loading={loading}
                user={
                    profileUser
                        ? mapUserToProfileData(profileUser, trackingStatus)
                        : undefined
                }
            />
        </>
    );
}
