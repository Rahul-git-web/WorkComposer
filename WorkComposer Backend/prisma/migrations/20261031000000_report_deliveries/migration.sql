-- CreateEnum
CREATE TYPE "ReportDeliveryStatus" AS ENUM ('PENDING', 'CLAIMED', 'SENT', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "report_deliveries" (
    "id" VARCHAR(24) NOT NULL,
    "event_key" VARCHAR(191) NOT NULL,
    "report_type" VARCHAR(50) NOT NULL,
    "recipient_id" VARCHAR(24) NOT NULL,
    "recipient_email" VARCHAR(255) NOT NULL,
    "recipient_role" VARCHAR(50) NOT NULL DEFAULT 'employee',
    "organization_id" VARCHAR(24),
    "period_start" TIMESTAMPTZ(3),
    "period_end" TIMESTAMPTZ(3),
    "date_str" VARCHAR(50),
    "status" "ReportDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "claimed_by" VARCHAR(100),
    "claimed_at" TIMESTAMPTZ(3),
    "claim_expires_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "error_category" VARCHAR(50),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "report_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "report_deliveries_event_key_key" ON "report_deliveries"("event_key");

-- CreateIndex
CREATE INDEX "report_deliveries_recipient_id_status_idx" ON "report_deliveries"("recipient_id", "status");

-- CreateIndex
CREATE INDEX "report_deliveries_organization_id_status_idx" ON "report_deliveries"("organization_id", "status");

-- CreateIndex
CREATE INDEX "report_deliveries_status_claim_expires_at_idx" ON "report_deliveries"("status", "claim_expires_at");
