/**
 * UI-21 Smoke Test Fixture Helper
 *
 * Provides isolated, synthetic, non-destructive test fixtures for browser smoke tests.
 * All records use deterministic '6a20...' 24-character hexadecimal IDs to guarantee zero
 * collision with real customer records.
 */

import bcrypt from 'bcryptjs';
import '../src/config/db.js';
import { getPrismaClient } from '../src/db/prisma.js';

// Tenant A (Primary Test Organization)
const ORG_A_ID = '6a2000000000000000000001';
const OWNER_A_ID = '6a2000000000000000000011';
const EMPLOYEE_A_ID = '6a2000000000000000000013';
const TEAM_A_ID = '6a2000000000000000000041';
const PROJECT_A_ID = '6a2000000000000000000021';
const TASK_A_ID = '6a2000000000000000000031';
const ADMIN_EMAIL = 'smoke.admin@example.com';
const ADMIN_PASSWORD = 'SmokeTestPass123!';
const EMPLOYEE_EMAIL = 'smoke.employee@example.com';
const EMPLOYEE_PASSWORD = 'SmokeEmployeePass123!';

// Tenant B (Secondary Isolated Organization for Cross-Tenant Denial BST-10)
const ORG_B_ID = '6a2000000000000000000002';
const OWNER_B_ID = '6a2000000000000000000012';
const TEAM_B_ID = '6a2000000000000000000042';
const PROJECT_B_ID = '6a2000000000000000000022';
const TASK_B_ID = '6a2000000000000000000032';
const TENANT_B_EMAIL = 'smoke.tenantb@example.com';
const TENANT_B_PASSWORD = 'SmokeTenantBPass123!';

const SYNTHETIC_USER_IDS = [OWNER_A_ID, EMPLOYEE_A_ID, OWNER_B_ID];
const SYNTHETIC_ORG_IDS = [ORG_A_ID, ORG_B_ID];
const SYNTHETIC_PROJECT_IDS = [PROJECT_A_ID, PROJECT_B_ID];
const SYNTHETIC_TASK_IDS = [TASK_A_ID, TASK_B_ID];
const SYNTHETIC_TEAM_IDS = [TEAM_A_ID, TEAM_B_ID];

export function assertSafeEnvironment() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL SAFETY VIOLATION: smokeFixtures.js cannot run in production (NODE_ENV=production)');
  }

  const dbUrl = process.env.DATABASE_URL || '';
  const isLocalDb =
    dbUrl.includes('localhost') ||
    dbUrl.includes('127.0.0.1') ||
    dbUrl.includes('::1') ||
    dbUrl.includes('test') ||
    dbUrl === '';

  if (!isLocalDb && process.env.ALLOW_REMOTE_TEST_FIXTURES !== 'true') {
    throw new Error(
      'FATAL SAFETY VIOLATION: Target DATABASE_URL does not appear local or test-scoped. Set ALLOW_REMOTE_TEST_FIXTURES=true to override.'
    );
  }

  const allIds = [
    ...SYNTHETIC_USER_IDS,
    ...SYNTHETIC_ORG_IDS,
    ...SYNTHETIC_PROJECT_IDS,
    ...SYNTHETIC_TASK_IDS,
    ...SYNTHETIC_TEAM_IDS,
  ];

  for (const id of allIds) {
    if (!id.startsWith('6a20') || id.length !== 24) {
      throw new Error(`FATAL SAFETY VIOLATION: Non-synthetic fixture ID format '${id}' detected`);
    }
  }
}

export async function cleanupFixtures() {
  assertSafeEnvironment();
  const prisma = getPrismaClient();
  try {
    await prisma.projectTracking.deleteMany({ where: { userId: { in: SYNTHETIC_USER_IDS } } });
    await prisma.session.deleteMany({ where: { userId: { in: SYNTHETIC_USER_IDS } } });
    await prisma.timer.deleteMany({ where: { userId: { in: SYNTHETIC_USER_IDS } } });
    await prisma.task.deleteMany({ where: { id: { in: SYNTHETIC_TASK_IDS } } });
    await prisma.projectUser.deleteMany({ where: { projectId: { in: SYNTHETIC_PROJECT_IDS } } });
    await prisma.project.deleteMany({ where: { id: { in: SYNTHETIC_PROJECT_IDS } } });
    await prisma.user.deleteMany({ where: { id: { in: SYNTHETIC_USER_IDS } } });
    await prisma.team.deleteMany({ where: { id: { in: SYNTHETIC_TEAM_IDS } } });
    await prisma.organization.deleteMany({ where: { id: { in: SYNTHETIC_ORG_IDS } } });
  } catch (err) {
    // Ignore cleanup errors on fresh/empty database
  }
}

export async function seedFixtures() {
  assertSafeEnvironment();
  const prisma = getPrismaClient();
  await cleanupFixtures();

  const hashedAdminPass = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const hashedEmpPass = await bcrypt.hash(EMPLOYEE_PASSWORD, 10);
  const hashedTenantBPass = await bcrypt.hash(TENANT_B_PASSWORD, 10);

  // ==========================================
  // Tenant A: Primary Organization
  // ==========================================
  await prisma.organization.create({
    data: {
      id: ORG_A_ID,
      name: 'UI21 Smoke Test Org Alpha',
      timezone: 'UTC',
    },
  });

  await prisma.team.create({
    data: {
      id: TEAM_A_ID,
      name: 'Smoke Team Alpha',
      organizationId: ORG_A_ID,
    },
  });

  // Owner User (All Permissions)
  await prisma.user.create({
    data: {
      id: OWNER_A_ID,
      firstName: 'Smoke',
      lastName: 'Admin',
      email: ADMIN_EMAIL,
      password: hashedAdminPass,
      role: 'owner',
      isVerified: true,
      isArchived: false,
      organizationId: ORG_A_ID,
      teamId: TEAM_A_ID,
    },
  });

  // Employee User (No manage_users, no manage_settings)
  await prisma.user.create({
    data: {
      id: EMPLOYEE_A_ID,
      firstName: 'Smoke',
      lastName: 'Employee',
      email: EMPLOYEE_EMAIL,
      password: hashedEmpPass,
      role: 'user',
      isVerified: true,
      isArchived: false,
      organizationId: ORG_A_ID,
      teamId: TEAM_A_ID,
    },
  });

  await prisma.project.create({
    data: {
      id: PROJECT_A_ID,
      name: 'Smoke Project Alpha',
      organizationId: ORG_A_ID,
    },
  });

  await prisma.task.create({
    data: {
      id: TASK_A_ID,
      title: 'Smoke Task Alpha 1',
      projectId: PROJECT_A_ID,
      organizationId: ORG_A_ID,
      assignedToId: OWNER_A_ID,
    },
  });

  // ==========================================
  // Tenant B: Isolated Organization for BST-10
  // ==========================================
  await prisma.organization.create({
    data: {
      id: ORG_B_ID,
      name: 'UI21 Smoke Test Org Beta',
      timezone: 'UTC',
    },
  });

  await prisma.team.create({
    data: {
      id: TEAM_B_ID,
      name: 'Smoke Team Beta',
      organizationId: ORG_B_ID,
    },
  });

  await prisma.user.create({
    data: {
      id: OWNER_B_ID,
      firstName: 'TenantB',
      lastName: 'Owner',
      email: TENANT_B_EMAIL,
      password: hashedTenantBPass,
      role: 'owner',
      isVerified: true,
      isArchived: false,
      organizationId: ORG_B_ID,
      teamId: TEAM_B_ID,
    },
  });

  await prisma.project.create({
    data: {
      id: PROJECT_B_ID,
      name: 'Confidential Tenant B Project',
      organizationId: ORG_B_ID,
    },
  });

  await prisma.task.create({
    data: {
      id: TASK_B_ID,
      title: 'Confidential Task Beta 1',
      projectId: PROJECT_B_ID,
      organizationId: ORG_B_ID,
      assignedToId: OWNER_B_ID,
    },
  });

  return {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    admin: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      userId: OWNER_A_ID,
      orgId: ORG_A_ID,
      projectId: PROJECT_A_ID,
      taskId: TASK_A_ID,
    },
    employee: {
      email: EMPLOYEE_EMAIL,
      password: EMPLOYEE_PASSWORD,
      userId: EMPLOYEE_A_ID,
      orgId: ORG_A_ID,
    },
    tenantB: {
      email: TENANT_B_EMAIL,
      password: TENANT_B_PASSWORD,
      userId: OWNER_B_ID,
      orgId: ORG_B_ID,
      projectId: PROJECT_B_ID,
      taskId: TASK_B_ID,
    },
  };
}

if (process.argv[2] === 'seed') {
  seedFixtures()
    .then((res) => {
      console.log(JSON.stringify(res));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
} else if (process.argv[2] === 'cleanup') {
  cleanupFixtures()
    .then(() => {
      console.log(JSON.stringify({ cleaned: true }));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
} else if (process.argv[2] === 'check-timer') {
  const userId = process.argv[3] || OWNER_A_ID;
  const prisma = getPrismaClient();
  prisma.timer.findMany({ where: { userId } })
    .then((timers) => {
      console.log(JSON.stringify({ count: timers.length, timers }));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
