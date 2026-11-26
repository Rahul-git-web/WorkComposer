"use client";

import Image from "next/image";
import IntegrationCard from "@/components/settings/IntegrationCard";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useOptionalDesktop } from "@/context/DesktopContext";
import API from "@/api";
import SettingsLoading from "@/components/settings/SettingsLoading";
import toast from "react-hot-toast";

type IntegrationStatusMap = {
  jira: boolean;
  asana: boolean;
  slack: boolean;
  keka: boolean;
  bamboohr: boolean;
  storage: boolean;
};

const EMPTY_CONNECTIONS: IntegrationStatusMap = {
  jira: false,
  asana: false,
  slack: false,
  keka: false,
  bamboohr: false,
  storage: false,
};

function normalizeIntegrationStatuses(payload: unknown): IntegrationStatusMap {
  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};

  return {
    jira: record.jira === true,
    asana: record.asana === true,
    slack: record.slack === true,
    keka: record.keka === true,
    bamboohr: record.bamboohr === true,
    storage: record.storage === true,
  };
}

export default function IntegrationsPage() {
  const router = useRouter();
  const desktop = useOptionalDesktop();

  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [connections, setConnections] =
    useState<IntegrationStatusMap>(EMPTY_CONNECTIONS);

  const isMountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const lastFetchedAtRef = useRef(0);
  const requestIdRef = useRef(0);

  const fetchIntegrationStatuses = useCallback(
    async ({ showErrorToast = true, force = false } = {}) => {
      const now = Date.now();
      if (!force) {
        if (inFlightRef.current) return;
        if (now - lastFetchedAtRef.current < 1500) return;
      }

      const requestId = ++requestIdRef.current;
      inFlightRef.current = true;

      try {
        const { data } = await API.get("/integrations/status-summary");
        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }

        setConnections(normalizeIntegrationStatuses(data));
        setStatusError(null);
        lastFetchedAtRef.current = Date.now();
      } catch (err: any) {
        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }

        console.error("INTEGRATION STATUS ERROR:", err);

        const message =
          err.response?.data?.message ||
          "Failed to load integration statuses.";

        setConnections(EMPTY_CONNECTIONS);
        setStatusError(message);

        if (showErrorToast) {
          toast.error(message);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          inFlightRef.current = false;
        }
        if (isMountedRef.current && requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    isMountedRef.current = true;
    fetchIntegrationStatuses({ showErrorToast: true, force: true });

    const handleReturnRefresh = () => {
      if (document.visibilityState === "hidden") return;
      fetchIntegrationStatuses({ showErrorToast: false });
    };

    const handleIntegrationMutation = () => {
      fetchIntegrationStatuses({ showErrorToast: false, force: true });
    };

    window.addEventListener("focus", handleReturnRefresh);
    document.addEventListener("visibilitychange", handleReturnRefresh);
    window.addEventListener("integrationsUpdated", handleIntegrationMutation);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener("focus", handleReturnRefresh);
      document.removeEventListener("visibilitychange", handleReturnRefresh);
      window.removeEventListener("integrationsUpdated", handleIntegrationMutation);
    };
  }, [fetchIntegrationStatuses]);


  const openIntegration = (path: string) => {
    if (desktop) {
      const setting = path.split("/").filter(Boolean).pop();

      if (setting) {
        desktop.setActiveSetting(setting);
      }

      return;
    }

    router.push(path);
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-6">
        <SettingsLoading />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900">
          Integrations
        </h1>

        <p className="mt-2 text-gray-600">
          Connect your favorite tools and manage all integrations in one place.
        </p>
      </div>

      {statusError && (
        <div
          role="alert"
          className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <span>{statusError}</span>
          <button
            type="button"
            onClick={() => fetchIntegrationStatuses({ showErrorToast: true, force: true })}
            className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1 font-medium text-amber-900 transition hover:bg-amber-100"
          >
            Retry
          </button>
        </div>
      )}

      {/* Project Management */}
      <h2 className="mb-6 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Project Management
      </h2>

      <div className="grid grid-cols-2 gap-6">
        <IntegrationCard
          icon={
            <Image
              src="/icons/jira.png"
              alt="Jira"
              width={40}
              height={40}
            />
          }
          title="Jira"
          description="Sync tasks and track time across platforms"
          connected={connections.jira}
          onClick={() =>
            openIntegration(
              "/dashboard/settings/account/integrations/jira"
            )
          }
        />

        <IntegrationCard
          icon={
            <Image
              src="/icons/asana.png"
              alt="Asana"
              width={40}
              height={40}
            />
          }
          title="Asana"
          description="Sync tasks and track time across platforms"
          connected={connections.asana}
          onClick={() =>
            openIntegration(
              "/dashboard/settings/account/integrations/asana"
            )
          }
        />
      </div>

      {/* Communication */}
      <div className="mt-10">
        <h2 className="mb-6 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Communication
        </h2>

        <div className="grid grid-cols-2 gap-6">
          <IntegrationCard
            icon={
              <Image
                src="/icons/slack.png"
                alt="Slack"
                width={40}
                height={40}
              />
            }
            title="Slack"
            description="Get work reports and notifications in Slack"
            connected={connections.slack}
            onClick={() =>
              openIntegration(
                "/dashboard/settings/account/integrations/slack"
              )
            }
          />
        </div>
      </div>

      {/* HR & Payroll */}
      <div className="mt-10">
        <h2 className="mb-6 text-sm font-semibold uppercase tracking-wide text-gray-500">
          HR & Payroll
        </h2>

        <div className="grid grid-cols-2 gap-6">
          <IntegrationCard
            icon={
              <Image
                src="/icons/keka.png"
                alt="Keka HR"
                width={40}
                height={40}
              />
            }
            title="Keka HR"
            description="Sync attendance and employee information with Keka HR."
            connected={connections.keka}
            onClick={() =>
              openIntegration(
                "/dashboard/settings/account/integrations/keka"
              )
            }
          />

          <IntegrationCard
            icon={
              <Image
                src="/icons/bamboohr.png"
                alt="BambooHR"
                width={40}
                height={40}
              />
            }
            title="BambooHR"
            description="Sync employee directory and leave information."
            connected={connections.bamboohr}
            onClick={() =>
              openIntegration(
                "/dashboard/settings/account/integrations/bamboohr"
              )
            }
          />
        </div>
      </div>

      {/* Storage */}
      <div className="mt-10">
        <h2 className="mb-6 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Storage
        </h2>

        <div className="grid grid-cols-2 gap-6">
          <IntegrationCard
            icon={
              <Image
                src="/icons/storage.png"
                alt="External Storage"
                width={40}
                height={40}
              />
            }
            title="External Storage"
            description="Save screenshots and files to your own cloud storage."
            connected={connections.storage}
            onClick={() =>
              openIntegration(
                "/dashboard/settings/account/integrations/storage"
              )
            }
          />
        </div>
      </div>
    </div>
  );
}