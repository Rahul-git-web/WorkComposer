-- AlterTable: add optional telemetry JSONB column to activities
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "telemetry" JSONB;

-- CreateTable: intelligence_observations
CREATE TABLE IF NOT EXISTS "intelligence_observations" (
    "id" VARCHAR(64) NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "employee_id" VARCHAR(24) NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "window_end" TIMESTAMPTZ(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "evidence" JSONB NOT NULL,
    "rule_id" VARCHAR(64) NOT NULL,
    "rule_version" VARCHAR(16) NOT NULL,
    "explanation" TEXT NOT NULL,
    "limitations" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intelligence_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: organization + employee + windowStart
CREATE INDEX IF NOT EXISTS "intelligence_observations_org_emp_window_idx" 
ON "intelligence_observations"("organization_id", "employee_id", "window_start");

-- CreateIndex: employee + windowStart + windowEnd
CREATE INDEX IF NOT EXISTS "intelligence_observations_emp_window_idx" 
ON "intelligence_observations"("employee_id", "window_start", "window_end");

-- AddForeignKey: organization
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'intelligence_observations_organization_id_fkey'
    ) THEN
        ALTER TABLE "intelligence_observations" 
        ADD CONSTRAINT "intelligence_observations_organization_id_fkey" 
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: employee
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'intelligence_observations_employee_id_fkey'
    ) THEN
        ALTER TABLE "intelligence_observations" 
        ADD CONSTRAINT "intelligence_observations_employee_id_fkey" 
        FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

