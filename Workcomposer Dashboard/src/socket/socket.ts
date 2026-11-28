"use client";

import { io, Socket } from "socket.io-client";

const socket: Socket = io(
    process.env.NEXT_PUBLIC_SOCKET_URL ||
        "http://localhost:5000",
    {
        withCredentials: true,
        autoConnect: false,
    }
);

/**
 * Disconnect socket and clear authentication payload.
 */
export const disconnectSocket = () => {
    if (typeof window === "undefined") {
        return;
    }

    try {
        socket.auth = {};
        if (socket.connected) {
            socket.disconnect();
        }
    } catch (err) {
        console.error("SOCKET DISCONNECT ERROR:", err);
    }
};

/**
 * Reconnect Socket.IO with a specific access token or resolve from Electron / localStorage.
 */
export const reconnectSocketWithToken = async (explicitToken?: string) => {
    if (typeof window === "undefined") {
        return;
    }

    let token: string | null = explicitToken || null;

    /*
     * Electron resolution if explicit token not provided
     */
    if (!token && window.electronAPI?.getToken) {
        try {
            token = await window.electronAPI.getToken();
        } catch (error) {
            console.error(
                "FAILED TO GET ELECTRON TOKEN:",
                error
            );
        }
    }

    /*
     * Web fallback resolution if explicit token not provided
     */
    if (!token && !window.electronAPI && typeof localStorage !== "undefined") {
        token =
            localStorage.getItem("accessToken") ||
            localStorage.getItem("token");
    }

    if (socket.connected) {
        socket.disconnect();
    }

    if (!token && window.electronAPI) {
        socket.auth = {};
        console.warn(
            "SOCKET: NO AUTH TOKEN AVAILABLE"
        );
        return;
    }

    socket.auth = token ? { token } : {};

    socket.connect();
};

export const initializeSocket = async () => {
    await reconnectSocketWithToken();
};

/*
 * Socket connected
 */
socket.on("connect", () => {
    console.info(
        "FRONTEND SOCKET CONNECTED:",
        socket.id
    );
});

/*
 * Socket disconnected
 */
socket.on("disconnect", (reason) => {
    console.info(
        "FRONTEND SOCKET DISCONNECTED:",
        reason
    );
});

/*
 * Socket connection error
 */
socket.on("connect_error", (error) => {
    if (
        error.message === "TOKEN_EXPIRED" ||
        error.message === "Unauthorized"
    ) {
        console.warn(
            "SOCKET AUTH FAILED:",
            error.message
        );

        /*
         * Stop Socket.IO from repeatedly
         * reconnecting with the expired token.
         */
        socket.disconnect();

        return;
    }

    console.error(
        "SOCKET CONNECT ERROR:",
        error.message
    );
});

/*
 * Electron token refresh listener
 */
if (
    typeof window !== "undefined" &&
    window.electronAPI?.onTokenRefreshed
) {
    window.electronAPI.onTokenRefreshed((newToken) => {
        if (!newToken) {
            console.warn(
                "SOCKET: TOKEN REFRESH FAILED"
            );
            disconnectSocket();
            return;
        }

        console.info(
            "SOCKET: TOKEN REFRESHED"
        );

        void reconnectSocketWithToken(newToken);
    });
}

/*
 * Electron logout listener
 */
if (
    typeof window !== "undefined" &&
    window.electronAPI?.onElectronLoggedOut
) {
    window.electronAPI.onElectronLoggedOut(() => {
        disconnectSocket();
    });
}

/*
 * Electron device remote sign-out listener
 */
if (
    typeof window !== "undefined" &&
    window.electronAPI?.onDeviceSignedOut
) {
    window.electronAPI.onDeviceSignedOut(() => {
        disconnectSocket();
    });
}

/*
 * Initialize after the browser/Electron window exists.
 */
if (typeof window !== "undefined") {
    void initializeSocket();
}

export default socket;
