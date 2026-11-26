"use client";

import { Suspense, useContext } from "react";
import DashboardContext from "@/context/DashboardContext";
import { useDesktop } from "@/context/DesktopContext";
import SettingsLoading from "@/components/settings/SettingsLoading";
import ProfilePage from "@/app/dashboard/settings/profile/page";
import OrganizationProfilePage from "@/app/dashboard/settings/organization-profile/page";
import SecurityModule from "@/app/dashboard/settings/account/security/SecurityModule";
import RolesPrivilegesPage from "@/app/dashboard/settings/account/roles-privilages/page";
import IntegrationsPage from "@/app/dashboard/settings/account/integrations/page";
import JiraPage from "@/app/dashboard/settings/account/integrations/jira/page";
import AsanaPage from "@/app/dashboard/settings/account/integrations/asana/page";
import SlackIntegrationPage from "@/app/dashboard/settings/account/integrations/slack/page";
import KekaIntegrationPage from "@/app/dashboard/settings/account/integrations/keka/page";
import BambooHRIntegrationPage from "@/app/dashboard/settings/account/integrations/bamboohr/page";
import ExternalStoragePage from "@/app/dashboard/settings/account/integrations/storage/page";
import ApiAccessPage from "@/app/dashboard/settings/account/api-access/page";
import BillingsPage from "@/app/dashboard/settings/account/billings/page";

import TrackingPage from "@/app/dashboard/settings/time-tracking/tracking/page";
import ScreenCapturePage from "@/app/dashboard/settings/time-tracking/screen-capture/page";
import ManualTimePage from "@/app/dashboard/settings/time-tracking/manual-time/page";
import ProductivityPage from "@/app/dashboard/settings/time-tracking/productivity/page";
import ShiftsPage from "@/app/dashboard/settings/time-tracking/shifts/page";
import EmailReportsPage from "@/app/dashboard/settings/time-tracking/email-reports/page";
import TrackingNotificationsPage from "@/app/dashboard/settings/time-tracking/notifications/page";

import ProjectsPage from "@/app/dashboard/settings/task-management/projects/page";

const INTEGRATION_PROVIDER_SETTINGS = new Set([
    "jira",
    "asana",
    "slack",
    "keka",
    "bamboohr",
    "storage",
]);

const MANAGE_SETTINGS_PROTECTED = new Set([
    "organization-profile",
    "security",
    "roles-privilages",
    "integrations",
    "api-access",
    "tracking",
    "screen-capture",
    "manual-time",
    "productivity",
    "shifts",
    "email-reports",
    "notifications",
    "projects",
    ...INTEGRATION_PROVIDER_SETTINGS,
]);

const MANAGE_BILLING_PROTECTED = new Set(["billings"]);

export default function SettingsModule() {

    const { activeSetting, setActiveSetting } = useDesktop();
    const dashboard = useContext(DashboardContext);

    if (!dashboard?.user || dashboard?.loading) {
        return <SettingsLoading />;
    }

    const canManageSettings = Boolean(
        dashboard.user.role === "owner" ||
        dashboard.user.permissions?.includes("manage_settings")
    );
    const canManageBilling = Boolean(
        canManageSettings ||
        dashboard.user.permissions?.includes("manage_billing")
    );

    if (MANAGE_BILLING_PROTECTED.has(activeSetting) && !canManageBilling) {
        return <ProfilePage />;
    }

    if (
        MANAGE_SETTINGS_PROTECTED.has(activeSetting) &&
        !canManageSettings
    ) {
        return <ProfilePage />;
    }

    const pages: Record<string, React.ReactNode> = {
        profile: <ProfilePage />,

        "organization-profile": <OrganizationProfilePage />,
        security: <SecurityModule />,
        "roles-privilages": <RolesPrivilegesPage />,
        integrations: <IntegrationsPage />,
        jira: (
            <Suspense key="jira" fallback={<SettingsLoading />}>
                <JiraPage />
            </Suspense>
        ),
        asana: (
            <Suspense key="asana" fallback={<SettingsLoading />}>
                <AsanaPage />
            </Suspense>
        ),
        slack: (
            <Suspense key="slack" fallback={<SettingsLoading />}>
                <SlackIntegrationPage />
            </Suspense>
        ),
        keka: <KekaIntegrationPage key="keka" />,
        bamboohr: <BambooHRIntegrationPage key="bamboohr" />,
        storage: <ExternalStoragePage key="storage" />,
        "api-access": <ApiAccessPage />,
        billings: (
            <Suspense key="billings" fallback={<SettingsLoading />}>
                <BillingsPage />
            </Suspense>
        ),

        tracking: <TrackingPage />,
        "screen-capture": <ScreenCapturePage />,
        "manual-time": <ManualTimePage />,
        productivity: <ProductivityPage />,
        shifts: <ShiftsPage />,
        "email-reports": <EmailReportsPage />,
        notifications: <TrackingNotificationsPage />,

        projects: <ProjectsPage />,
    };

    if (Object.prototype.hasOwnProperty.call(pages, activeSetting)) {
        return pages[activeSetting];
    }

    return (
        <div className="max-w-3xl mx-auto px-6 py-10">
            <div
                role="alert"
                className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950"
            >
                <h2 className="text-lg font-semibold">
                    Settings page unavailable
                </h2>
                <p className="mt-2 text-sm text-amber-900">
                    The requested settings view (<code>{activeSetting}</code>) is not registered.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                    {canManageSettings && (
                        <button
                            type="button"
                            onClick={() => setActiveSetting("integrations")}
                            className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-950 transition hover:bg-amber-100"
                        >
                            Back to Integrations
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setActiveSetting("profile")}
                        className="rounded-lg bg-amber-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-800"
                    >
                        Go to Profile
                    </button>
                </div>
            </div>
        </div>
    );
}