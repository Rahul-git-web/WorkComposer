-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('owner', 'admin', 'manager', 'user');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('todo', 'in-progress', 'completed');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "ProjectProvider" AS ENUM ('workcomposer', 'jira', 'asana');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('jira', 'asana', 'slack', 'keka', 'bamboohr', 'storage');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('work', 'break');

-- CreateEnum
CREATE TYPE "SessionSource" AS ENUM ('tracking', 'manual');

-- CreateEnum
CREATE TYPE "TimerStatus" AS ENUM ('running', 'stopped');

-- CreateEnum
CREATE TYPE "ProductivityLevel" AS ENUM ('productive', 'neutral', 'unproductive', 'blacklisted');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('standard', 'premium', 'enterprise');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('monthly', 'annual');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'trial', 'suspended', 'cancelled');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('paid', 'pending', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "AuditCategory" AS ENUM ('Users', 'Teams', 'Roles', 'Desktop App', 'Organization', 'Settings', 'Billing', 'Storage', 'Projects', 'Tasks', 'HR Leave Types', 'Devices');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('attendance-overview', 'attendance-detailed', 'productivity', 'usage', 'project-user', 'project', 'manual-work-time', 'manual-break-time', 'removed-time', 'daily-work');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('processing', 'done', 'failed');

-- CreateEnum
CREATE TYPE "DesktopSyncStatus" AS ENUM ('synced', 'syncing', 'offline');

-- CreateTable
CREATE TABLE "users" (
    "id" VARCHAR(24) NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "two_factor_code" TEXT,
    "two_factor_expires" TIMESTAMPTZ(3),
    "jira_account_id" TEXT,
    "asana_account_id" TEXT,
    "bamboohr_employee_id" TEXT,
    "slack_user_id" TEXT,
    "avatar" TEXT NOT NULL DEFAULT '',
    "organization_id" VARCHAR(24) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "report_timezone" TEXT DEFAULT 'Browser timezone',
    "role_ref" VARCHAR(24),
    "team_id" VARCHAR(24),
    "report_team_id" VARCHAR(24),
    "manager_id" VARCHAR(24),
    "weekly_report" BOOLEAN NOT NULL DEFAULT true,
    "daily_report" BOOLEAN NOT NULL DEFAULT false,
    "break_start_time" TIMESTAMPTZ(3),
    "password" TEXT,
    "google_id" TEXT,
    "microsoft_id" TEXT,
    "apple_id" TEXT,
    "auth_provider" TEXT NOT NULL DEFAULT 'local',
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "verification_token" TEXT,
    "verification_token_expire" TIMESTAMPTZ(3),
    "reset_token" TEXT,
    "reset_token_expire" TIMESTAMPTZ(3),
    "last_daily_warning_email" TIMESTAMPTZ(3),
    "last_weekly_warning_email" TIMESTAMPTZ(3),
    "workspace_id" VARCHAR(24),
    "app_update_settings" JSONB,
    "tracking_settings" JSONB,
    "screen_capture_settings" JSONB,
    "manual_time_settings" JSONB,
    "shift_settings" JSONB,
    "notification_settings" JSONB,
    "email_report_settings" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_devices" (
    "id" VARCHAR(24) NOT NULL,
    "user_id" VARCHAR(24) NOT NULL,
    "device_id" TEXT NOT NULL,
    "ip" TEXT,
    "location" TEXT,
    "platform" TEXT,
    "app_version" TEXT,
    "hostname" TEXT,
    "login_time" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sync" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "is_tracking" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_refresh_tokens" (
    "id" VARCHAR(24) NOT NULL,
    "user_id" VARCHAR(24) NOT NULL,
    "token" TEXT NOT NULL,
    "device_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" VARCHAR(24) NOT NULL,
    "name" TEXT NOT NULL,
    "owner_id" VARCHAR(24),
    "logo" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "two_factor" JSONB,
    "app_updates" JSONB,
    "email_reports" JSONB,
    "task_management" JSONB,
    "notifications" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" VARCHAR(24) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "organization_id" VARCHAR(24) NOT NULL,
    "created_by_id" VARCHAR(24),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" VARCHAR(24) NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "permissions" TEXT[],
    "report_access" TEXT NOT NULL DEFAULT 'none',
    "screenshot_access" TEXT NOT NULL DEFAULT 'none',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" VARCHAR(24) NOT NULL,
    "name" TEXT NOT NULL,
    "jira_project_id" TEXT,
    "jira_project_key" TEXT,
    "asana_project_id" TEXT,
    "asana_webhook_id" TEXT,
    "provider" "ProjectProvider" NOT NULL DEFAULT 'workcomposer',
    "teams" TEXT[],
    "organization_id" VARCHAR(24) NOT NULL,
    "created_by_id" VARCHAR(24),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_users" (
    "project_id" VARCHAR(24) NOT NULL,
    "user_id" VARCHAR(24) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_users_pkey" PRIMARY KEY ("project_id","user_id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" VARCHAR(24) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'todo',
    "priority" "TaskPriority" NOT NULL DEFAULT 'medium',
    "project_id" VARCHAR(24),
    "jira_issue_id" TEXT,
    "jira_issue_key" TEXT,
    "asana_task_id" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'local',
    "assigned_to_id" VARCHAR(24),
    "assigned_by_id" VARCHAR(24),
    "due_date" TIMESTAMPTZ(3),
    "organization_id" VARCHAR(24) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by_id" VARCHAR(24),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" VARCHAR(24) NOT NULL,
    "user_id" VARCHAR(24) NOT NULL,
    "project_id" VARCHAR(24),
    "task_id" VARCHAR(24),
    "start_time" TIMESTAMPTZ(3),
    "end_time" TIMESTAMPTZ(3),
    "duration" DOUBLE PRECISION,
    "screenshots" INTEGER,
    "date" TEXT,
    "team" TEXT NOT NULL DEFAULT 'Default team',
    "type" "SessionType" NOT NULL DEFAULT 'work',
    "source" "SessionSource" NOT NULL DEFAULT 'tracking',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timers" (
    "id" VARCHAR(24) NOT NULL,
    "user_id" VARCHAR(24) NOT NULL,
    "project_id" VARCHAR(24),
    "task_id" VARCHAR(24),
    "start_time" TIMESTAMPTZ(3),
    "end_time" TIMESTAMPTZ(3),
    "duration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "TimerStatus" NOT NULL DEFAULT 'stopped',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "timers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screenshots" (
    "id" VARCHAR(24) NOT NULL,
    "user_id" VARCHAR(24) NOT NULL,
    "project_id" VARCHAR(24),
    "task_id" VARCHAR(24),
    "image_url" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "captured_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "app_name" TEXT NOT NULL DEFAULT '',
    "window_title" TEXT NOT NULL DEFAULT '',
    "key_presses" INTEGER NOT NULL DEFAULT 0,
    "mouse_clicks" INTEGER NOT NULL DEFAULT 0,
    "mouse_moves" INTEGER NOT NULL DEFAULT 0,
    "activity_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "screenshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" VARCHAR(24) NOT NULL,
    "user_id" VARCHAR(24) NOT NULL,
    "project_id" VARCHAR(24),
    "task_id" VARCHAR(24),
    "date" TEXT NOT NULL,
    "key_presses" INTEGER NOT NULL DEFAULT 0,
    "mouse_clicks" INTEGER NOT NULL DEFAULT 0,
    "mouse_moves" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_usages" (
    "id" VARCHAR(24) NOT NULL,
    "user_id" VARCHAR(24) NOT NULL,
    "app_name" TEXT NOT NULL,
    "window_title" TEXT NOT NULL DEFAULT '',
    "duration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "date" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "app_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_logs" (
    "id" VARCHAR(24) NOT NULL,
    "user_id" VARCHAR(24) NOT NULL,
    "project_id" VARCHAR(24),
    "task_id" VARCHAR(24),
    "app_name" TEXT NOT NULL,
    "window_title" TEXT NOT NULL DEFAULT '',
    "start_time" TIMESTAMPTZ(3) NOT NULL,
    "end_time" TIMESTAMPTZ(3) NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "date" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_trackings" (
    "id" VARCHAR(24) NOT NULL,
    "user_id" VARCHAR(24) NOT NULL,
    "project_id" VARCHAR(24) NOT NULL,
    "task_id" VARCHAR(24),
    "start_time" TIMESTAMPTZ(3) NOT NULL,
    "end_time" TIMESTAMPTZ(3) NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "date" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_trackings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" VARCHAR(24) NOT NULL,
    "user_id" VARCHAR(24) NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "date" TIMESTAMPTZ(3) NOT NULL,
    "work_time" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "break_time" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "start_time" TIMESTAMPTZ(3),
    "finish_time" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_classifications" (
    "id" VARCHAR(24) NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "app_name" TEXT NOT NULL,
    "productivity" "ProductivityLevel" NOT NULL DEFAULT 'neutral',
    "prevent_break_mode" BOOLEAN NOT NULL DEFAULT false,
    "disable_idle_calculation" BOOLEAN NOT NULL DEFAULT false,
    "excludedTeams" TEXT[],
    "excludedUsers" TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "app_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_time_requests" (
    "id" VARCHAR(24) NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "requested_by_id" VARCHAR(24) NOT NULL,
    "project_id" VARCHAR(24),
    "task_id" VARCHAR(24),
    "type" "SessionType" NOT NULL,
    "start_time" TIMESTAMPTZ(3) NOT NULL,
    "end_time" TIMESTAMPTZ(3) NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "date" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'pending',
    "manager_comment" TEXT NOT NULL DEFAULT '',
    "approved_by_id" VARCHAR(24),
    "approved_at" TIMESTAMPTZ(3),
    "report_id" VARCHAR(24),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "manual_time_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" VARCHAR(24) NOT NULL,
    "task_id" VARCHAR(24) NOT NULL,
    "user_id" VARCHAR(24) NOT NULL,
    "content" TEXT NOT NULL,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "readBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" VARCHAR(24) NOT NULL,
    "recipient_id" VARCHAR(24) NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" VARCHAR(24),
    "metadata" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" VARCHAR(24) NOT NULL,
    "user_id" VARCHAR(24) NOT NULL,
    "type" "ReportType" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'processing',
    "file_url" TEXT NOT NULL DEFAULT '',
    "generated_at" TIMESTAMPTZ(3),
    "start_date" TEXT NOT NULL DEFAULT '',
    "end_date" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" VARCHAR(24) NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'standard',
    "billing_cycle" "BillingCycle" NOT NULL DEFAULT 'monthly',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'trial',
    "stripe_customer_id" TEXT NOT NULL DEFAULT '',
    "stripe_subscription_id" TEXT NOT NULL DEFAULT '',
    "stripe_price_id" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "starts_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),
    "trial_ends_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_profiles" (
    "id" VARCHAR(24) NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "company_name" TEXT NOT NULL DEFAULT '',
    "contact_name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "postal_code" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "tax_id" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "billing_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" VARCHAR(24) NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'pending',
    "billing_period_start" TIMESTAMPTZ(3),
    "billing_period_end" TIMESTAMPTZ(3),
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ(3),
    "pdf_url" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" VARCHAR(24) NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "brand" TEXT NOT NULL DEFAULT '',
    "last4" TEXT NOT NULL DEFAULT '',
    "expiry_month" INTEGER,
    "expiry_year" INTEGER,
    "cardholder_name" TEXT NOT NULL DEFAULT '',
    "is_default" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" VARCHAR(24) NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_preview" TEXT NOT NULL,
    "created_by_id" VARCHAR(24),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMPTZ(3),
    "last_used_ip" TEXT,
    "revoked_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_logs" (
    "id" VARCHAR(24) NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "api_key_id" VARCHAR(24),
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "response_time" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "api_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" VARCHAR(24) NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "performed_by_id" VARCHAR(24),
    "category" "AuditCategory" NOT NULL,
    "activity" TEXT NOT NULL,
    "details" JSONB,
    "ip_address" TEXT NOT NULL DEFAULT '',
    "platform" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites" (
    "id" VARCHAR(24) NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "team_id" VARCHAR(24),
    "token" TEXT NOT NULL,
    "expire_at" TIMESTAMPTZ(3) NOT NULL,
    "invited_by_id" VARCHAR(24),
    "organization_id" VARCHAR(24) NOT NULL,
    "is_accepted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" VARCHAR(24) NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "user_id" VARCHAR(24) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "country" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "postal_code" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "ip_address" TEXT NOT NULL DEFAULT '',
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_statuses" (
    "id" VARCHAR(24) NOT NULL,
    "user_id" VARCHAR(24) NOT NULL,
    "status" "DesktopSyncStatus" NOT NULL DEFAULT 'synced',
    "last_sync" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pending_uploads" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sync_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_tracking_settings" (
    "id" VARCHAR(24) NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "tracking" JSONB,
    "screen_capture" JSONB,
    "manual_time" JSONB,
    "shift" JSONB,
    "productivity" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "time_tracking_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_changes" (
    "id" VARCHAR(24) NOT NULL,
    "user_id" VARCHAR(24) NOT NULL,
    "new_email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expire_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "email_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" VARCHAR(24) NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "api_key" TEXT,
    "subdomain" TEXT,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "cloud_id" TEXT,
    "client_secret" TEXT,
    "site_url" TEXT,
    "workspace_name" TEXT,
    "account_id" TEXT,
    "workspace_id" TEXT,
    "slack_channel_id" TEXT,
    "slack_channel_name" TEXT,
    "notifications" JSONB,
    "last_daily_summary_sent" TIMESTAMPTZ(3),
    "last_weekly_summary_sent" TIMESTAMPTZ(3),
    "user_id" TEXT,
    "email" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");

-- CreateIndex
CREATE INDEX "users_team_id_idx" ON "users"("team_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_devices_user_id_device_id_key" ON "user_devices"("user_id", "device_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_refresh_tokens_token_key" ON "user_refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "user_refresh_tokens_user_id_idx" ON "user_refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_name_key" ON "organizations"("name");

-- CreateIndex
CREATE INDEX "projects_organization_id_idx" ON "projects"("organization_id");

-- CreateIndex
CREATE INDEX "tasks_project_id_idx" ON "tasks"("project_id");

-- CreateIndex
CREATE INDEX "tasks_organization_id_idx" ON "tasks"("organization_id");

-- CreateIndex
CREATE INDEX "tasks_assigned_to_id_idx" ON "tasks"("assigned_to_id");

-- CreateIndex
CREATE INDEX "tasks_deleted_idx" ON "tasks"("deleted");

-- CreateIndex
CREATE INDEX "sessions_user_id_date_idx" ON "sessions"("user_id", "date");

-- CreateIndex
CREATE INDEX "sessions_start_time_end_time_idx" ON "sessions"("start_time", "end_time");

-- CreateIndex
CREATE INDEX "timers_user_id_idx" ON "timers"("user_id");

-- CreateIndex
CREATE INDEX "screenshots_user_id_captured_at_idx" ON "screenshots"("user_id", "captured_at");

-- CreateIndex
CREATE INDEX "activities_user_id_date_idx" ON "activities"("user_id", "date");

-- CreateIndex
CREATE INDEX "app_usages_user_id_date_idx" ON "app_usages"("user_id", "date");

-- CreateIndex
CREATE INDEX "usage_logs_user_id_date_idx" ON "usage_logs"("user_id", "date");

-- CreateIndex
CREATE INDEX "project_trackings_user_id_project_id_date_idx" ON "project_trackings"("user_id", "project_id", "date");

-- CreateIndex
CREATE INDEX "attendances_user_id_date_idx" ON "attendances"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "app_classifications_organization_id_app_name_key" ON "app_classifications"("organization_id", "app_name");

-- CreateIndex
CREATE INDEX "manual_time_requests_requested_by_id_idx" ON "manual_time_requests"("requested_by_id");

-- CreateIndex
CREATE INDEX "manual_time_requests_organization_id_idx" ON "manual_time_requests"("organization_id");

-- CreateIndex
CREATE INDEX "comments_task_id_idx" ON "comments"("task_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_read_created_at_idx" ON "notifications"("recipient_id", "read", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organization_id_key" ON "subscriptions"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_profiles_organization_id_key" ON "billing_profiles"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_organization_id_issued_at_idx" ON "invoices"("organization_id", "issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_organization_id_key" ON "payment_methods"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_organization_id_idx" ON "api_keys"("organization_id");

-- CreateIndex
CREATE INDEX "api_logs_organization_id_idx" ON "api_logs"("organization_id");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_performed_by_id_created_at_idx" ON "audit_logs"("performed_by_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_key" ON "invites"("token");

-- CreateIndex
CREATE INDEX "locations_user_id_recorded_at_idx" ON "locations"("user_id", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "sync_statuses_user_id_key" ON "sync_statuses"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "time_tracking_settings_organization_id_key" ON "time_tracking_settings"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_changes_token_key" ON "email_changes"("token");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_report_team_id_fkey" FOREIGN KEY ("report_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_ref_fkey" FOREIGN KEY ("role_ref") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_refresh_tokens" ADD CONSTRAINT "user_refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_users" ADD CONSTRAINT "project_users_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_users" ADD CONSTRAINT "project_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timers" ADD CONSTRAINT "timers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timers" ADD CONSTRAINT "timers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timers" ADD CONSTRAINT "timers_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_usages" ADD CONSTRAINT "app_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_trackings" ADD CONSTRAINT "project_trackings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_trackings" ADD CONSTRAINT "project_trackings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_trackings" ADD CONSTRAINT "project_trackings_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_classifications" ADD CONSTRAINT "app_classifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_time_requests" ADD CONSTRAINT "manual_time_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_time_requests" ADD CONSTRAINT "manual_time_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_time_requests" ADD CONSTRAINT "manual_time_requests_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_time_requests" ADD CONSTRAINT "manual_time_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_time_requests" ADD CONSTRAINT "manual_time_requests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_time_requests" ADD CONSTRAINT "manual_time_requests_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_logs" ADD CONSTRAINT "api_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_logs" ADD CONSTRAINT "api_logs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_statuses" ADD CONSTRAINT "sync_statuses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_tracking_settings" ADD CONSTRAINT "time_tracking_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_changes" ADD CONSTRAINT "email_changes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ==============================================================================
-- PARTIAL UNIQUE INDEXES (Verified in Phase 1.5 audit)
-- ==============================================================================

-- 1. Enforce only ONE running timer per user (matches Mongoose partialFilterExpression)
CREATE UNIQUE INDEX "timers_user_running_idx"
ON "timers"("user_id")
WHERE "status" = 'running';

-- 2. OAuth sparse unique indexes (permits multiple nulls and empty strings)
CREATE UNIQUE INDEX "users_google_id_sparse_idx"
ON "users"("google_id")
WHERE "google_id" IS NOT NULL
  AND "google_id" != '';

CREATE UNIQUE INDEX "users_microsoft_id_sparse_idx"
ON "users"("microsoft_id")
WHERE "microsoft_id" IS NOT NULL
  AND "microsoft_id" != '';

CREATE UNIQUE INDEX "users_apple_id_sparse_idx"
ON "users"("apple_id")
WHERE "apple_id" IS NOT NULL
  AND "apple_id" != '';

-- 3. Stripe Subscription sparse unique index
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_sparse_idx"
ON "subscriptions"("stripe_subscription_id")
WHERE "stripe_subscription_id" IS NOT NULL
  AND "stripe_subscription_id" != '';

