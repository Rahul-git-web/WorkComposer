"use client";

import { useEffect, useState } from "react";
import { TimerProvider } from "@/context/TimerContext";
import API from "@/api";
import DashNavbar from "./dashnavbar";
import Sidebar from "./sidebar";
import EditTime from "@/app/dashboard/time-tracking/overview/EditTime";
import DashboardContext, { subscribeDashboardUpdates } from "@/context/DashboardContext";
import { ProjectProvider } from "@/context/ProjectContext";
import { useRouter, usePathname } from "next/navigation";
import Inbox from "@/app/components/Inbox";
import socket from "@/socket/socket";
import OfflineBanner from "@/components/common/OfflineBanner";

export default function DashboardLayout({ children }) {
  const [user, setUser] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const router = useRouter();
  const pathname = usePathname();
  const [showModal, setShowModal] = useState(false);
  const [showInbox, setShowInbox] = useState(false);

  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setShowInbox(false);
  }

  useEffect(() => {
    const open = () => setShowModal(true);
    window.addEventListener("openManualTime", open);

    return () => window.removeEventListener("openManualTime", open);
  }, []);

  useEffect(() => {
    return subscribeDashboardUpdates(refreshUser);
  }, []);

  useEffect(() => {
    const toggleInbox = () => {
      setShowInbox((prev) => !prev);
    };

    window.addEventListener("toggleInbox", toggleInbox);

    return () => {
      window.removeEventListener("toggleInbox", toggleInbox);
    };
  }, []);

  const refreshUser = async () => {
    try {
      setLoadError(null);
      const res = await API.get("/auth/me");
      setUser(res.data);

      const organizationId =
        res.data.organization?._id || res.data.organization;

      if (organizationId) {
        socket.emit("joinOrganization", organizationId);
      }
    } catch (err) {
      if (err?.response?.status === 401) {
        router.replace("/authenticate/login");
        return;
      }
      setLoadError(err?.message || "Connection error");
    }
  };

  useEffect(() => {
    let mounted = true;
    API.get("/auth/me")
      .then((res) => {
        if (!mounted) return;
        setLoadError(null);
        setUser(res.data);

        const organizationId =
          res.data.organization?._id || res.data.organization;

        if (organizationId) {
          socket.emit("joinOrganization", organizationId);
        }
      })
      .catch((err) => {
        if (!mounted) return;
        if (err?.response?.status === 401) {
          router.replace("/authenticate/login");
          return;
        }
        setLoadError(err?.message || "Connection error");
      });
    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!user) return;

    if (
      pathname.startsWith("/dashboard/user-management") &&
      !user.permissions?.includes("manage_users")
    ) {
      router.replace("/dashboard/time-tracking/home");
    }

    const isBillingRoute = pathname.startsWith(
      "/dashboard/settings/account/billings"
    );
    const canManageSettings =
      user.role === "owner" || user.permissions?.includes("manage_settings");
    const canManageBilling =
      canManageSettings || user.permissions?.includes("manage_billing");

    if (
      pathname.startsWith("/dashboard/settings") &&
      pathname !== "/dashboard/settings/profile" &&
      (isBillingRoute ? !canManageBilling : !canManageSettings)
    ) {
      router.replace("/dashboard/settings/profile");
    }

    if (
      pathname.startsWith("/dashboard/time-tracking/screenshots") &&
      user?.screenshotAccess === "none"
    ) {
      router.replace("/dashboard/time-tracking/home");
    }

    if (
      pathname.startsWith("/dashboard/time-tracking/location") &&
      !user.permissions?.includes("manage_users")
    ) {
      router.replace("/dashboard/time-tracking/home");
    }
  }, [pathname, user, router]);

  if (!user) {
    if (loadError) {
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-gray-50 dark:bg-[#090F1D] p-6 text-center">
          <p className="text-base font-semibold text-gray-800 dark:text-white mb-2">Unable to load dashboard</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-sm">Please check your network connection and try again.</p>
          <button
            type="button"
            onClick={() => refreshUser()}
            className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-500 transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-[#090F1D]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <DashboardContext.Provider
      value={{
        user,
        refreshUser,
      }}
    >
      <ProjectProvider>
        <TimerProvider>
          <div
            className={`h-screen transition-all duration-300 ${
              showModal ? "blur-sm brightness-75 scale-[0.98]" : ""
            }`}
          >
            <div className="flex h-full overflow-hidden">
              <Sidebar />
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                <DashNavbar />
                <OfflineBanner />
                <main className="flex-1 overflow-y-auto bg-gray-100 dark:bg-[#090F1D] text-gray-900 dark:text-white transition-colors duration-200">
                  {children}
                </main>
              </div>
            </div>
          </div>

          {showModal && (
            <>
              <div
                onClick={() => setShowModal(false)}
                className="fixed inset-0 z-40 bg-black/30"
              />

              <div className="fixed inset-0 z-50 w-screen overflow-y-auto">
                <EditTime onClose={() => setShowModal(false)} />
              </div>
            </>
          )}

          {showInbox && (
            <>
              <div
                onClick={() => setShowInbox(false)}
                className="fixed inset-0 bg-black/20"
              />

              <div className="fixed top-16 bottom-0 left-72 right-0 z-50 flex overflow-hidden">
                <div className="w-full bg-white dark:bg-[#0F172A] border-l border-gray-200 dark:border-[#22324D] shadow-2xl overflow-y-auto">
                  <Inbox />
                </div>
              </div>
            </>
          )}
        </TimerProvider>
      </ProjectProvider>
    </DashboardContext.Provider>
  );
}
