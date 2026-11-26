-- AlterTable
ALTER TABLE "activities" ADD COLUMN "idempotency_key" VARCHAR(128);

-- CreateIndex
CREATE UNIQUE INDEX "activities_idempotency_key_key" ON "activities"("idempotency_key");

