"use client";

import API from "@/api";
import { CiDesktop } from "react-icons/ci";
import { TbLogout } from "react-icons/tb";
import { X } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const emptySubscribe = () => () => {};

interface DeviceModalProps {
    user: any;
    setShowDeviceModal: React.Dispatch<React.SetStateAction<boolean>
    >;
}


const DeviceModal = ({
    user,
    setShowDeviceModal,
}: DeviceModalProps) => {

    const [devices, setDevices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

    const formatLocalDateTime = (value: string | Date) => {
    if (!value) return "-";

    return new Date(value).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    });
};

    useEffect(() => {
        const fetchDevices = async () => {

            try {
                const res = await API.get(`/users/${user._id || user.id}/devices`);

               setDevices(res.data.devices || []);

            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        if (user) {
            fetchDevices();
        }
    }, [user])

    const handleLogoutDevice = async (deviceId: string) => {
        try {
            if (!deviceId) {
                console.error("Device ID is missing");
                return;
            }

            const userId = user._id || user.id;

            await API.post(
                `/users/${userId}/devices/${deviceId}/logout`
            );

            // Remove the signed-out device from the displayed list
            setDevices((prev) =>
                prev.filter(
                    (device) => device.deviceId !== deviceId
                )
            );

        } catch (err: any) {
            console.error(
                "DEVICE LOGOUT ERROR:",
                err.response?.data || err
            );
        }
    };
    if (!mounted) return null;

    return createPortal(
        <>
            <div role='dialog' aria-modal='true' className='relative z-50'>
                <div className='fixed inset-0 bg-gray-500/75 dark:bg-black/75 backdrop-blur-sm transition-opacity'></div>
                <div
                    onClick={() =>
                        setShowDeviceModal(false)
                    }
                    className='fixed inset-0 z-50 overflow-y-auto overscroll-contain'>
                    <div className='flex min-h-full items-center justify-center p-4 text-center sm:p-6'>
                        <div
                            onClick={(e) => e.stopPropagation()}
                            className='w-full max-w-3xl transform overflow-hidden rounded-lg bg-white dark:bg-slate-800 border border-transparent dark:border-slate-700 p-6 text-left align-middle shadow-xl dark:shadow-2xl transition-all'>
                            <div className="flex items-center justify-between">
                                <h2 className='text-lg font-semibold leading-6 text-gray-900 dark:text-white'> Device - {user?.email}</h2>

                                <button
                                    onClick={() =>
                                        setShowDeviceModal(false)
                                    }
                                    className='text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-200'
                                >
                                    <X className='h-5 w-5' />
                                </button>
                            </div>
                            <div className='mt-4 space-y-4'>
                                {loading ? (

                                    <p className="text-sm text-gray-500 dark:text-slate-400">
                                        Loading devices...
                                    </p>

                                ) : devices.length === 0 ? (

                                    <p className="text-sm text-gray-500 dark:text-slate-400">
                                        No devices found
                                    </p>

                                ) : (

                                    devices.map((device: any) => (
                                        <div
                                            key={device.deviceId}
                                            className='rounded-md border border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/50 p-4 shadow-sm'>
                                            <div className='flex justify-between items-center mb-3'>
                                                <div className='text-sm font-medium text-gray-800 dark:text-slate-100 flex items-center gap-2'>
                                                    <CiDesktop className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
                                                    {device.ip} | {device.location}
                                                </div>

                                                <button
                                                    onClick={() =>
                                                        handleLogoutDevice(device.deviceId)
                                                    }
                                                    className="inline-flex items-center gap-2 rounded-md border border-red-600 dark:border-red-500 px-3 py-1.5 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40">
                                                    <TbLogout className="h-5 w-5" />
                                                    Sign out now
                                                </button>
                                            </div>

                                            <p className="text-sm text-gray-600 dark:text-slate-300">
                                                <b>Hostname:</b>{" "}
                                                {device.hostname} |
                                                <b className="ml-2">Platform:</b>{" "}
                                                {device.platform} |
                                                <b className="ml-2">App Version:</b> {" "}
                                                {device.appVersion}
                                            </p>

                                            <p className="text-sm text-gray-600 dark:text-slate-300 mt-2">
                                                <b>Login Time:</b>{" "}
                                                {formatLocalDateTime(device.loginTime)} |
                                                <b className="ml-2">Last Sync:</b>{" "}
                                               {formatLocalDateTime(device.lastSync)}
                                            </p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>,
        document.body
    )
}

export default DeviceModal
