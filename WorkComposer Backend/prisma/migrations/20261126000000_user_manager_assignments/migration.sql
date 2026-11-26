-- CreateTable: user_manager_assignments
CREATE TABLE IF NOT EXISTS "user_manager_assignments" (
    "id" VARCHAR(24) NOT NULL,
    "organization_id" VARCHAR(24) NOT NULL,
    "user_id" VARCHAR(24) NOT NULL,
    "manager_id" VARCHAR(24) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_manager_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique (user_id, manager_id)
CREATE UNIQUE INDEX IF NOT EXISTS "user_manager_assignments_user_id_manager_id_key"
ON "user_manager_assignments"("user_id", "manager_id");

-- CreateIndex: (organization_id, manager_id)
CREATE INDEX IF NOT EXISTS "user_manager_assignments_organization_id_manager_id_idx"
ON "user_manager_assignments"("organization_id", "manager_id");

-- CreateIndex: (user_id)
CREATE INDEX IF NOT EXISTS "user_manager_assignments_user_id_idx"
ON "user_manager_assignments"("user_id");

-- AddForeignKey: organization_id -> organizations(id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_manager_assignments_organization_id_fkey'
    ) THEN
        ALTER TABLE "user_manager_assignments"
        ADD CONSTRAINT "user_manager_assignments_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: user_id -> users(id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_manager_assignments_user_id_fkey'
    ) THEN
        ALTER TABLE "user_manager_assignments"
        ADD CONSTRAINT "user_manager_assignments_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: manager_id -> users(id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_manager_assignments_manager_id_fkey'
    ) THEN
        ALTER TABLE "user_manager_assignments"
        ADD CONSTRAINT "user_manager_assignments_manager_id_fkey"
        FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Idempotent backfill from legacy scalar users.manager_id
INSERT INTO "user_manager_assignments" ("id", "organization_id", "user_id", "manager_id", "created_at")
SELECT
    substr(md5(u."id" || ':' || u."manager_id"), 1, 24),
    u."organization_id",
    u."id",
    u."manager_id",
    CURRENT_TIMESTAMP
FROM "users" u
WHERE u."manager_id" IS NOT NULL
  AND u."manager_id" <> u."id"
ON CONFLICT ("user_id", "manager_id") DO NOTHING;

