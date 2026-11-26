import "dotenv/config";
import crypto from "crypto";
import { pathToFileURL } from "url";
import { PrismaClient } from "@prisma/client";

/**
 * Idempotent backfill script to populate UserManagerAssignment records
 * from legacy scalar User.managerId values.
 */
export async function backfillUserManagerAssignments(prisma = new PrismaClient()) {
  const shouldDisconnect = arguments.length === 0;
  try {
    const users = await prisma.user.findMany({
      where: { managerId: { not: null } },
      select: { id: true, organizationId: true, managerId: true },
    });

    const rows = [];
    for (const u of users) {
      if (!u.managerId || u.managerId === u.id) continue;
      const id = crypto
        .createHash("md5")
        .update(`${u.id}:${u.managerId}`)
        .digest("hex")
        .slice(0, 24);
      rows.push({
        id,
        organizationId: u.organizationId,
        userId: u.id,
        managerId: u.managerId,
      });
    }

    if (rows.length === 0) {
      return { scanned: users.length, inserted: 0 };
    }

    const res = await prisma.userManagerAssignment.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return { scanned: users.length, inserted: res?.count ?? 0 };
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect();
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  backfillUserManagerAssignments()
    .then((res) => {
      console.log("[Backfill] UserManagerAssignment complete:", res);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[Backfill] UserManagerAssignment failed:", err);
      process.exit(1);
    });
}

