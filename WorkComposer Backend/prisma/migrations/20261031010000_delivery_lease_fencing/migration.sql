-- AlterTable
ALTER TABLE "report_deliveries" ADD COLUMN "claim_token" VARCHAR(64);
ALTER TABLE "report_deliveries" ADD COLUMN "claim_version" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "report_deliveries_claim_token_idx" ON "report_deliveries"("claim_token");
