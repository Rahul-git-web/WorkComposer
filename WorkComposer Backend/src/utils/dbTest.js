import prisma from "../config/prisma.js";

/**
 * Isolated database connectivity test for PostgreSQL + Prisma.
 * Verifies whether the PostgreSQL connection string in DATABASE_URL is reachable.
 *
 * NOTE: Isolated test utility; does NOT alter active Mongoose connection or server routes.
 */
export async function testPostgresConnection() {
  if (!process.env.DATABASE_URL) {
    return {
      connected: false,
      message: "DATABASE_URL environment variable is not configured.",
    };
  }

  try {
    const result = await prisma.$queryRaw`SELECT 1 as result`;
    return {
      connected: true,
      message: "PostgreSQL connection successful via Prisma.",
      result,
    };
  } catch (error) {
    return {
      connected: false,
      message: `Failed to connect to PostgreSQL: ${error.message}`,
    };
  }
}

// If run directly from CLI (e.g. node src/utils/dbTest.js)
if (process.argv[1]?.endsWith("dbTest.js")) {
  testPostgresConnection()
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
      process.exit(res.connected ? 0 : 1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export default testPostgresConnection;
