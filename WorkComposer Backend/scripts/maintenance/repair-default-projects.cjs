/**
 * WorkComposer — Default Project Maintenance and Repair Script (SEC-20J)
 *
 * Safely identifies and optionally repairs organizations missing a Default Project,
 * and adopts historical orphan tasks within strict tenant boundaries.
 *
 * Operational rules:
 * 1. DRY-RUN BY DEFAULT: No writes are performed unless --commit is explicitly passed.
 * 2. TENANT ISOLATION: Processes each organization independently. Never crosses tenant boundaries.
 * 3. SAFE CREATOR RESOLUTION: Resolves createdById from existing owner/admin/user.
 *    If no user exists in the organization, skips that organization safely without mutating.
 * 4. TRANSACTIONAL REPAIR: Uses existing runTransaction infrastructure. Rechecks inside transaction.
 * 5. SAFE LOGGING: Does not print tokens, passwords, or credentials.
 *
 * Usage:
 *   node scripts/maintenance/repair-default-projects.cjs --org <24-hex-id> [--commit] [--dry-run] [--json]
 *   node scripts/maintenance/repair-default-projects.cjs --all [--commit] [--dry-run] [--json]
 */

const path = require('path');
const dotenv = require('dotenv');

// Load environment variables if not already loaded
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Parse and validate CLI arguments.
 * Throws an Error with a descriptive message if arguments are malformed or conflicting.
 */
function parseArgs(args = process.argv.slice(2)) {
  let isAll = false;
  let orgId = null;
  let isCommit = false;
  let isDryRunExplicit = false;
  let isJson = false;
  let isHelp = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--all') {
      isAll = true;
    } else if (arg === '--org') {
      i++;
      if (i >= args.length || args[i].startsWith('--')) {
        throw new Error('Option --org requires a valid 24-character hexadecimal organization ID.');
      }
      orgId = args[i];
    } else if (arg.startsWith('--org=')) {
      orgId = arg.split('=')[1];
    } else if (arg === '--commit') {
      isCommit = true;
    } else if (arg === '--dry-run') {
      isDryRunExplicit = true;
    } else if (arg === '--json') {
      isJson = true;
    } else if (arg === '--help' || arg === '-h') {
      isHelp = true;
    } else {
      throw new Error(`Unrecognized CLI argument: "${arg}". Use --help for usage information.`);
    }
  }

  if (isHelp) {
    return { isHelp: true };
  }

  // Mutually exclusive scope validation
  if (isAll && orgId) {
    throw new Error('Conflicting arguments: Cannot specify both --all and --org.');
  }

  if (!isAll && !orgId) {
    throw new Error('Missing target scope: Must specify either --all or --org <organizationId>.');
  }

  // Organization ID validation (24 hex characters)
  if (orgId && !/^[0-9a-fA-F]{24}$/.test(orgId)) {
    throw new Error(`Invalid organization ID: "${orgId}". Expected a 24-character hexadecimal ObjectId.`);
  }

  return {
    isAll,
    orgId,
    isCommit,
    isDryRun: !isCommit, // Dry-run is strictly enforced unless --commit is supplied
    isJson,
    isHelp: false,
  };
}

/**
 * Print help documentation.
 */
function printHelp() {
  console.log(`
WorkComposer Default Project Maintenance & Repair Script (SEC-20J)

Usage:
  node scripts/maintenance/repair-default-projects.cjs --org <id> [options]
  node scripts/maintenance/repair-default-projects.cjs --all [options]

Scope (Required, mutually exclusive):
  --org <id>    Target a specific organization by its 24-character hexadecimal ID.
  --all         Scan all organizations in the PostgreSQL database.

Operation Mode:
  --dry-run     Inspect and preview planned changes without writing (DEFAULT).
  --commit      Execute transactional mutations to create missing Default Projects and adopt orphan tasks.

Output Options:
  --json        Output results in structured JSON format.
  --help, -h    Display this help text.
`);
}

/**
 * Lazily load backend ESM dependencies (Prisma, transaction runner, models).
 */
let cachedDeps = null;
async function loadDependencies() {
  if (cachedDeps) return cachedDeps;

  const prismaModule = await import('../../src/db/prisma.js');
  const transactionModule = await import('../../src/db/transaction.js');
  const projectController = await import('../../src/controllers/project.controller.js');
  const projectModel = await import('../../src/models/project.model.js');
  const taskModel = await import('../../src/models/task.model.js');
  const userModel = await import('../../src/models/user.model.js');
  const orgModel = await import('../../src/models/organization.model.js');

  cachedDeps = {
    prisma: prismaModule.getPrismaClient(),
    runTransaction: transactionModule.runTransaction,
    initializeDefaultProject: projectController.initializeDefaultProject,
    Project: projectModel.default,
    Task: taskModel.default,
    User: userModel.default,
    Organization: orgModel.default,
  };

  return cachedDeps;
}

/**
 * Resolve a safe createdById user for the organization without guessing or inventing semantics.
 * Priority: Owner -> Admin -> Manager -> User.
 * If no user exists in the organization, returns null.
 */
async function resolveSafeCreator(orgId, prisma) {
  // Query users belonging strictly to this organization
  const users = await prisma.user.findMany({
    where: { organizationId: orgId },
    select: { id: true, role: true, email: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!users || users.length === 0) {
    return null;
  }

  // 1. Prefer user with 'owner' role
  const owner = users.find((u) => u.role === 'owner');
  if (owner) return { id: owner.id, role: 'owner' };

  // 2. Next prefer user with 'admin' role
  const admin = users.find((u) => u.role === 'admin');
  if (admin) return { id: admin.id, role: 'admin' };

  // 3. Fallback to first active user
  const firstUser = users[0];
  return { id: firstUser.id, role: firstUser.role };
}

/**
 * Inspect an organization in read-only mode to determine repair requirements.
 */
async function inspectOrganization(org, deps) {
  const { prisma } = deps;

  const [existingDefault, orphanTasks, creator] = await Promise.all([
    prisma.project.findFirst({
      where: { organizationId: org.id, name: 'Default Project' },
      select: { id: true, name: true, createdById: true },
    }),
    prisma.task.count({
      where: { organizationId: org.id, projectId: null },
    }),
    resolveSafeCreator(org.id, prisma),
  ]);

  const hasDefault = Boolean(existingDefault);

  if (hasDefault && orphanTasks === 0) {
    return {
      orgId: org.id,
      orgName: org.name,
      status: 'HEALTHY',
      action: 'NO_OP',
      defaultProjectId: existingDefault.id,
      orphanTasks: 0,
      creatorId: existingDefault.createdById,
      message: 'Default Project exists and no orphan tasks found.',
    };
  }

  if (hasDefault && orphanTasks > 0) {
    return {
      orgId: org.id,
      orgName: org.name,
      status: 'NEEDS_ORPHAN_ADOPTION',
      action: 'ADOPT_ORPHANS',
      defaultProjectId: existingDefault.id,
      orphanTasks,
      creatorId: existingDefault.createdById,
      message: `Default Project exists; ${orphanTasks} orphan task(s) require adoption.`,
    };
  }

  // Missing Default Project
  if (!creator) {
    return {
      orgId: org.id,
      orgName: org.name,
      status: 'UNRESOLVABLE_CREATOR',
      action: 'SKIP',
      defaultProjectId: null,
      orphanTasks,
      creatorId: null,
      message: 'Default Project missing, but no user exists in organization to assign as project creator. Skipped safely.',
    };
  }

  return {
    orgId: org.id,
    orgName: org.name,
    status: 'NEEDS_DEFAULT_PROJECT',
    action: 'CREATE_AND_ADOPT',
    defaultProjectId: null,
    orphanTasks,
    creatorId: creator.id,
    creatorRole: creator.role,
    message: `Default Project missing; plan to create Default Project (creator: ${creator.id}) and adopt ${orphanTasks} orphan task(s).`,
  };
}

/**
 * Execute repair for a single organization inside an isolated transaction.
 */
async function repairOrganization(org, plan, deps, isCommit) {
  const { prisma, runTransaction, initializeDefaultProject } = deps;

  // Dry-run mode: do not write to database
  if (!isCommit) {
    return {
      ...plan,
      executed: false,
      committed: false,
      result: 'DRY_RUN_PREVIEW',
    };
  }

  // If organization is healthy, no action needed
  if (plan.action === 'NO_OP') {
    return {
      ...plan,
      executed: true,
      committed: true,
      result: 'NO_OP',
    };
  }

  // If creator cannot be resolved, skip without writing
  if (plan.action === 'SKIP') {
    return {
      ...plan,
      executed: false,
      committed: false,
      result: 'SKIPPED_UNRESOLVABLE_CREATOR',
    };
  }

  // Execute transactional mutation via initializeDefaultProject
  try {
    const repairResult = await runTransaction(async (tx) => {
      // Concurrency safety: acquire row-level lock on the Organization record in PostgreSQL
      // to serialize concurrent executions on the same tenant and prevent duplicate Default Projects.
      if (tx && typeof tx.$queryRaw === 'function') {
        await tx.$queryRaw`SELECT id FROM "organizations" WHERE id = ${org.id} FOR UPDATE`;
      }

      return await initializeDefaultProject({
        organizationId: org.id,
        userId: plan.creatorId,
      });
    });

    return {
      orgId: org.id,
      orgName: org.name,
      status: 'REPAIRED',
      action: plan.action,
      defaultProjectId: repairResult.defaultProject?._id || repairResult.defaultProject?.id,
      adoptedTasks: repairResult.adoptedTaskCount || 0,
      executed: true,
      committed: true,
      result: 'SUCCESS',
      message: `Successfully initialized Default Project (${repairResult.defaultProject?.id}) and adopted ${repairResult.adoptedTaskCount} task(s).`,
    };
  } catch (err) {
    return {
      orgId: org.id,
      orgName: org.name,
      status: 'FAILED',
      action: plan.action,
      executed: true,
      committed: false,
      result: 'TRANSACTION_ROLLBACK',
      error: err.message,
      message: `Repair failed and transaction rolled back: ${err.message}`,
    };
  }
}

/**
 * Main coordinator function.
 */
async function runRepair(options = {}, customDeps = null) {
  const deps = customDeps || (await loadDependencies());
  const { prisma } = deps;

  const isCommit = Boolean(options.isCommit);
  const isJson = Boolean(options.isJson);

  // Retrieve target organizations
  let orgs = [];
  if (options.orgId) {
    const org = await prisma.organization.findUnique({
      where: { id: options.orgId },
      select: { id: true, name: true },
    });
    if (!org) {
      throw new Error(`Target organization not found with ID: "${options.orgId}".`);
    }
    orgs = [org];
  } else if (options.isAll) {
    orgs = await prisma.organization.findMany({
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
  } else {
    throw new Error('Must specify either orgId or isAll.');
  }

  const results = [];
  const summary = {
    mode: isCommit ? 'COMMIT' : 'DRY_RUN',
    totalOrgs: orgs.length,
    healthy: 0,
    needsRepair: 0,
    repaired: 0,
    skipped: 0,
    failed: 0,
  };

  for (const org of orgs) {
    const plan = await inspectOrganization(org, deps);
    const outcome = await repairOrganization(org, plan, deps, isCommit);
    results.push(outcome);

    if (outcome.status === 'HEALTHY' || outcome.action === 'NO_OP') {
      summary.healthy++;
    } else if (outcome.status === 'UNRESOLVABLE_CREATOR' || outcome.result === 'SKIPPED_UNRESOLVABLE_CREATOR') {
      summary.skipped++;
    } else if (outcome.status === 'FAILED') {
      summary.failed++;
    } else if (isCommit && outcome.status === 'REPAIRED') {
      summary.repaired++;
    } else {
      summary.needsRepair++;
    }
  }

  return { summary, results };
}

/**
 * Format and print human-readable CLI report.
 */
function printReport(report, isJson = false) {
  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const { summary, results } = report;
  console.log('\n======================================================');
  console.log(`WORKCOMPOSER DEFAULT PROJECT MAINTENANCE REPORT [${summary.mode}]`);
  console.log('======================================================');
  console.log(`Target Organizations Scanned : ${summary.totalOrgs}`);
  console.log(`Healthy (No Action Needed)   : ${summary.healthy}`);
  if (summary.mode === 'DRY_RUN') {
    console.log(`Organizations Needing Action : ${summary.needsRepair}`);
  } else {
    console.log(`Successfully Repaired        : ${summary.repaired}`);
  }
  console.log(`Skipped (Unresolvable Creator): ${summary.skipped}`);
  console.log(`Failed (Rolled Back)         : ${summary.failed}`);
  console.log('------------------------------------------------------');

  for (const r of results) {
    const prefix = `[Org: ${r.orgId}] "${r.orgName}"`;
    if (r.status === 'HEALTHY' || r.action === 'NO_OP') {
      console.log(`${prefix} -> OK (Default Project: ${r.defaultProjectId}, 0 orphan tasks)`);
    } else if (r.status === 'REPAIRED') {
      console.log(`${prefix} -> REPAIRED (Default Project: ${r.defaultProjectId}, adopted ${r.adoptedTasks} tasks)`);
    } else if (r.status === 'UNRESOLVABLE_CREATOR' || r.result === 'SKIPPED_UNRESOLVABLE_CREATOR') {
      console.log(`${prefix} -> SKIPPED (${r.message})`);
    } else if (r.status === 'FAILED') {
      console.error(`${prefix} -> FAILED: ${r.message}`);
    } else {
      console.log(`${prefix} -> PREVIEW (${r.message})`);
    }
  }

  console.log('======================================================\n');
  if (summary.mode === 'DRY_RUN' && summary.needsRepair > 0) {
    console.log('Note: Dry-run completed with zero writes. Run with --commit to execute planned changes.\n');
  }
}

/**
 * CLI Entrypoint.
 */
async function main() {
  try {
    const options = parseArgs();
    if (options.isHelp) {
      printHelp();
      process.exit(0);
    }

    const report = await runRepair(options);
    printReport(report, options.isJson);

    // If any tenant failed during commit, exit with code 1
    if (report.summary.failed > 0) {
      process.exit(1);
    }

    process.exit(0);
  } catch (err) {
    console.error(`\nCLI Error: ${err.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  printHelp,
  loadDependencies,
  resolveSafeCreator,
  inspectOrganization,
  repairOrganization,
  runRepair,
  printReport,
};
