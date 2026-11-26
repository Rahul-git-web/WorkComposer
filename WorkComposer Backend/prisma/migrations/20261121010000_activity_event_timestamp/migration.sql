-- AlterTable
ALTER TABLE "activities" ADD COLUMN "event_timestamp" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "activities_user_id_event_timestamp_idx" ON "activities"("user_id", "event_timestamp");

