/**
 * WorkComposer — Local PostgreSQL Backup Script (SEC-23B.2)
 *
 * Provides a reliable, local-only backup workflow for PostgreSQL:
 * 1. Targets strictly local PostgreSQL (localhost:5432 / workcomposer).
 * 2. Employs PostgreSQL custom archive format (-F c) with atomic temporary file renaming.
 * 3. Enforces preflight safety checks (pg_isready, 2 GB free disk space threshold, target verification).
 * 4. Verifies archive Table of Contents (TOC) via `pg_restore -l`.
 * 5. Generates SHA-256 checksum manifest (<archive>.dump.sha256).
 * 6. Redacts all passwords and credentials from logs and error messages.
 * 7. Enforces explicit execution (--run required to create a dump).
 * 8. Never deletes older valid backups automatically.
 *
 * Usage:
 *   node scripts/maintenance/backup-local-db.cjs --dry-run
 *   node scripts/maintenance/backup-local-db.cjs --run [--dest=<path>]
 *   node scripts/maintenance/backup-local-db.cjs --help
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const child_process = require('child_process');
const dotenv = require('dotenv');

// Load environment variables if not already loaded
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DEFAULT_DEST_DIR = 'E:\\WorkComposer\\backups';
const MIN_REQUIRED_DISK_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

/**
 * Mask passwords or sensitive tokens in error messages and logs.
 */
function redactSecrets(text, secretToMask = null) {
  if (typeof text !== 'string') return text;
  let sanitized = text;

  // Mask specific password if known
  if (secretToMask && typeof secretToMask === 'string' && secretToMask.length > 0) {
    sanitized = sanitized.split(secretToMask).join('***REDACTED***');
  }

  // Mask generic connection strings with passwords: postgresql://user:pass@host...
  sanitized = sanitized.replace(/(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/gi, '$1***REDACTED***$3');

  // Mask PGPASSWORD=...
  sanitized = sanitized.replace(/(PGPASSWORD=)[^\s;&|]+/gi, '$1***REDACTED***');

  return sanitized;
}

/**
 * Format a Date object into YYYYMMDD_HHMMSS string.
 */
function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

/**
 * Parse and validate database connection parameters from DATABASE_URL.
 * Enforces strictly local PostgreSQL targeting (localhost / 127.0.0.1 and database "workcomposer").
 */
function parseDatabaseUrl(rawUrl = process.env.DATABASE_URL) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('DATABASE_URL is not defined in the environment or is invalid.');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (err) {
    throw new Error('DATABASE_URL is not a valid URL format.');
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'postgresql:' && protocol !== 'postgres:') {
    throw new Error(`Invalid protocol '${protocol}'. Only PostgreSQL connection strings are supported.`);
  }

  const hostname = (parsed.hostname || '').toLowerCase();
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    throw new Error(`Target host '${hostname}' is not a local host. Only local PostgreSQL (localhost / 127.0.0.1) is permitted.`);
  }

  const dbName = (parsed.pathname || '').replace(/^\//, '');
  if (dbName !== 'workcomposer') {
    throw new Error(`Target database '${dbName}' is not permitted. Only 'workcomposer' is allowed.`);
  }

  const port = parseInt(parsed.port || '5432', 10);
  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port '${parsed.port}'. Must be between 1 and 65535.`);
  }

  const username = decodeURIComponent(parsed.username || 'postgres');
  const password = parsed.password ? decodeURIComponent(parsed.password) : '';

  return {
    host: hostname,
    port,
    dbName,
    username,
    password
  };
}

/**
 * Verify local PostgreSQL instance availability using pg_isready.
 */
function checkPgIsReady(host, port, execFileFn = child_process.execFile) {
  return new Promise((resolve, reject) => {
    execFileFn('pg_isready', ['-h', host, '-p', String(port)], { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`PostgreSQL is not accepting connections at ${host}:${port}: ${(stderr || error.message).trim()}`));
      }
      resolve({ ok: true, output: (stdout || '').trim() });
    });
  });
}

/**
 * Check free disk space on target destination drive.
 */
function checkDiskSpace(destDir, minBytes = MIN_REQUIRED_DISK_BYTES, statfsFn = fs.statfsSync) {
  const resolved = path.resolve(destDir);
  const root = path.parse(resolved).root;

  let stats;
  try {
    stats = statfsFn(root);
  } catch (err) {
    throw new Error(`Unable to determine disk space for drive '${root}': ${err.message}`);
  }

  const freeBytes = BigInt(stats.bavail) * BigInt(stats.bsize);
  const minRequiredBig = BigInt(minBytes);

  const freeGB = (Number(freeBytes) / (1024 ** 3)).toFixed(2);
  const requiredGB = (minBytes / (1024 ** 3)).toFixed(2);

  if (freeBytes < minRequiredBig) {
    throw new Error(`Insufficient free disk space on drive '${root}'. Available: ${freeGB} GB, Required: ${requiredGB} GB.`);
  }

  return {
    ok: true,
    drive: root,
    freeBytes: Number(freeBytes),
    freeGB: parseFloat(freeGB),
    requiredGB: parseFloat(requiredGB)
  };
}

/**
 * Validate destination path safety.
 * Must resolve to drive E: and must not reside inside WorkComposer Backend source repository.
 */
function validateDestination(destDir = DEFAULT_DEST_DIR) {
  const resolved = path.resolve(destDir);
  const parsed = path.parse(resolved);

  if (parsed.root.toUpperCase().charAt(0) !== 'E') {
    throw new Error(`Backup destination must be on drive E:. Specified drive: '${parsed.root}'.`);
  }

  const backendDir = path.resolve(__dirname, '../../');
  if (resolved.toLowerCase().startsWith(backendDir.toLowerCase())) {
    throw new Error(`Backup destination '${resolved}' must not reside inside the WorkComposer Backend source repository.`);
  }

  return {
    ok: true,
    destination: resolved
  };
}

/**
 * Run preflight validation checks without creating files or directories.
 */
async function runPreflight(options = {}, deps = {}) {
  const rawUrl = options.databaseUrl || process.env.DATABASE_URL;
  const destDir = options.destDir || DEFAULT_DEST_DIR;
  const execFileFn = deps.execFile || child_process.execFile;
  const statfsFn = deps.statfsSync || fs.statfsSync;

  const config = parseDatabaseUrl(rawUrl);
  const destCheck = validateDestination(destDir);
  const diskCheck = checkDiskSpace(destCheck.destination, options.minBytes || MIN_REQUIRED_DISK_BYTES, statfsFn);
  const pgReady = await checkPgIsReady(config.host, config.port, execFileFn);

  return {
    ok: true,
    config: {
      host: config.host,
      port: config.port,
      dbName: config.dbName,
      username: config.username,
      hasPassword: Boolean(config.password)
    },
    destination: destCheck.destination,
    disk: diskCheck,
    pgReady: pgReady.output
  };
}

/**
 * Calculate SHA-256 checksum of a file.
 */
function computeFileSha256(filePath, createReadStreamFn = fs.createReadStream) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStreamFn(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Safely request child process termination with a bounded timeout and escalation.
 * Awaits confirmed process completion ('exit' or 'close' event).
 * If the process does NOT exit within timeoutMs, resolves with { terminated: false, confirmed: false }.
 * NEVER assumes or pretends that a kill signal or expired timeout means the process has exited.
 */
function terminateChildProcess(child, timeoutMs = 3000) {
  if (!child) return Promise.resolve({ terminated: true, confirmed: true });

  const hasExited = (child.exitCode !== null && child.exitCode !== undefined) ||
                    (child.signalCode !== null && child.signalCode !== undefined);
  if (hasExited) {
    return Promise.resolve({
      terminated: true,
      confirmed: true,
      exitCode: child.exitCode,
      signalCode: child.signalCode
    });
  }

  return new Promise((resolve) => {
    let settled = false;
    let escalationTimer = null;
    let fallbackTimer = null;

    const onExit = (code, signal) => {
      if (settled) return;
      settled = true;
      if (escalationTimer) clearTimeout(escalationTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      resolve({
        terminated: true,
        confirmed: true,
        exitCode: code ?? child.exitCode,
        signalCode: signal ?? child.signalCode
      });
    };

    if (typeof child.once === 'function') {
      child.once('close', (code, sig) => onExit(code, sig));
      child.once('exit', (code, sig) => onExit(code, sig));
    } else {
      settled = true;
      return resolve({ terminated: true, confirmed: false });
    }

    try {
      if (typeof child.kill === 'function') {
        child.kill('SIGTERM');
      }
    } catch (_) {
      try {
        if (typeof child.kill === 'function') child.kill();
      } catch (_) {}
    }

    // Halfway through timeoutMs, escalate to SIGKILL
    const halfTimeout = Math.max(1, Math.floor(timeoutMs / 2));
    escalationTimer = setTimeout(() => {
      if (settled) return;
      try {
        if (typeof child.kill === 'function') {
          child.kill('SIGKILL');
        }
      } catch (_) {}
    }, halfTimeout);

    // If full timeout expires and child has STILL not emitted exit/close:
    // DO NOT treat as terminated!
    fallbackTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({
        terminated: false,
        confirmed: false,
        error: new Error(`Child process (PID ${child.pid || 'unknown'}) did not terminate within ${timeoutMs}ms after SIGTERM/SIGKILL escalation`)
      });
    }, timeoutMs);
  });
}

/**
 * Main backup workflow function.
 * Accepts options and injectable dependencies for unit testing.
 */
async function createBackup(options = {}, deps = {}) {
  const execFileFn = deps.execFile || child_process.execFile;
  const statfsFn = deps.statfsSync || fs.statfsSync;
  const mkdirSyncFn = deps.mkdirSync || fs.mkdirSync;
  const existsSyncFn = deps.existsSync || fs.existsSync;
  const statSyncFn = deps.statSync || fs.statSync;
  const renameSyncFn = deps.renameSync || fs.renameSync;
  const unlinkSyncFn = deps.unlinkSync || fs.unlinkSync;
  const writeFileSyncFn = deps.writeFileSync || fs.writeFileSync;
  const createReadStreamFn = deps.createReadStream || fs.createReadStream;
  const processTarget = deps.process || process;

  const destDir = options.destDir || DEFAULT_DEST_DIR;
  const rawUrl = options.databaseUrl || process.env.DATABASE_URL;
  const isDryRun = Boolean(options.dryRun || options.preflightOnly);

  // 1. Run Preflight Safety Checks
  const preflight = await runPreflight({ databaseUrl: rawUrl, destDir, minBytes: options.minBytes }, { execFile: execFileFn, statfsSync: statfsFn });
  const config = parseDatabaseUrl(rawUrl);

  if (isDryRun) {
    return {
      success: true,
      dryRun: true,
      message: 'Preflight safety checks passed. No backup was created.',
      preflight
    };
  }

  // 2. Prepare Destination & Filenames
  const targetDir = preflight.destination;
  mkdirSyncFn(targetDir, { recursive: true });

  const timestamp = options.timestamp || formatTimestamp(new Date());
  const finalFilename = `workcomposer_backup_${timestamp}.dump`;
  const finalPath = path.join(targetDir, finalFilename);
  const nonce = options.nonce || crypto.randomBytes(4).toString('hex');
  const tempFilename = options.tempFilename || `workcomposer_backup_${timestamp}.${process.pid}.${nonce}.dump.tmp`;
  const tempPath = options.tempPath || path.join(targetDir, tempFilename);
  const manifestFilename = `${finalFilename}.sha256`;
  const manifestPath = path.join(targetDir, manifestFilename);
  const lockFilename = `${finalFilename}.publish.lock`;
  const lockPath = path.join(targetDir, lockFilename);

  // Prevent overwriting existing archives, manifests, or active publication locks
  if (existsSyncFn(finalPath)) {
    throw new Error(`Target backup archive already exists: '${finalPath}'. Overwriting is strictly prohibited.`);
  }
  if (existsSyncFn(manifestPath)) {
    throw new Error(`Target backup manifest already exists: '${manifestPath}'. Overwriting is strictly prohibited.`);
  }
  if (existsSyncFn(lockPath)) {
    throw new Error(`Target backup publication lock already exists: '${lockPath}'. Overwriting or concurrent publication is strictly prohibited.`);
  }
  if (options.tempPath && existsSyncFn(options.tempPath)) {
    throw new Error(`Target temporary backup archive already exists: '${options.tempPath}'. Overwriting is strictly prohibited.`);
  }

  let startTime = Date.now();
  let tempCreated = false;
  let lockCreated = false;
  let finalRenamed = false;
  let manifestCreated = false;
  let activeChild = null;
  let activeChildType = null;
  let activeChildTerminated = false;
  let terminationUnconfirmed = false;
  let activeReject = null;
  let isInterrupted = false;
  let interruptionSignal = null;
  let interruptionPromise = null;

  const terminateActive = async (sig) => {
    if (activeChild) {
      const res = await terminateChildProcess(activeChild, deps.childTimeoutMs || 3000);
      if (res && res.terminated && res.confirmed) {
        activeChildTerminated = true;
        activeChild = null;
        activeChildType = null;
      } else {
        activeChildTerminated = false;
        terminationUnconfirmed = true;
        // Do NOT clear activeChild reference until its lifecycle has confirmed completion!
      }
      return res;
    }
    return { terminated: true, confirmed: true };
  };

  const onSignal = (sig) => {
    if (isInterrupted) return interruptionPromise;
    isInterrupted = true;
    interruptionSignal = sig;

    interruptionPromise = (async () => {
      const termRes = await terminateActive(sig);

      if (activeReject) {
        if (terminationUnconfirmed) {
          activeReject(new Error(`Backup aborted: ${activeChildType || 'process'} failed to terminate within timeout following signal ${sig}`));
        } else {
          activeReject(new Error(`Backup aborted: ${activeChildType || 'process'} interrupted by signal ${sig}`));
        }
        activeReject = null;
      }

      let cleanupErr = null;
      try {
        if (lockCreated && existsSyncFn(lockPath)) {
          unlinkSyncFn(lockPath);
        }

        if (terminationUnconfirmed) {
          // CONSERVATIVE CLEANUP:
          // Do NOT unlink temporary archive if child termination could not be confirmed!
          // Deleting an active child's output file risks race corruption or Windows handle lock errors.
          console.warn(`Warning: ${activeChildType || 'child process'} termination could not be confirmed; temporary file '${tempPath}' not deleted to prevent deleting an active file.`);
        } else {
          if (!finalRenamed && tempCreated && existsSyncFn(tempPath)) {
            unlinkSyncFn(tempPath);
          } else if (finalRenamed && !manifestCreated && existsSyncFn(finalPath)) {
            unlinkSyncFn(finalPath);
          }
        }
      } catch (ex) {
        cleanupErr = ex;
      }

      if (cleanupErr) {
        console.warn(`Warning: cleanup failure during ${sig} interruption: ${redactSecrets(cleanupErr.message, config.password)}`);
      }

      const exitCode = 128 + (sig === 'SIGINT' ? 2 : 15);
      if (processTarget && typeof processTarget.exit === 'function' && !deps.noProcessExit) {
        processTarget.exit(exitCode);
      }
    })();

    return interruptionPromise;
  };

  const onSigInt = () => onSignal('SIGINT');
  const onSigTerm = () => onSignal('SIGTERM');

  const registerSignals = !deps.noSignalHandlers && processTarget && typeof processTarget.on === 'function';
  if (registerSignals) {
    processTarget.once('SIGINT', onSigInt);
    processTarget.once('SIGTERM', onSigTerm);
  }

  try {
    if (isInterrupted) {
      throw new Error(`Backup aborted before dump execution: received signal ${interruptionSignal}`);
    }

    // 3. Execute pg_dump custom archive
    const dumpArgs = [
      '-h', config.host,
      '-p', String(config.port),
      '-U', config.username,
      '-d', config.dbName,
      '-F', 'c',
      '--no-owner',
      '--no-privileges',
      '-f', tempPath
    ];

    const childEnv = { ...process.env };
    if (config.password) {
      childEnv.PGPASSWORD = config.password;
    }

    await new Promise((resolve, reject) => {
      let settled = false;
      activeReject = reject;

      const onDumpComplete = (err, stdout, stderr) => {
        if (settled) return;
        settled = true;
        activeChild = null;
        activeChildType = null;
        activeReject = null;

        if (isInterrupted) {
          return reject(new Error(`pg_dump interrupted by signal ${interruptionSignal || 'SIGINT'}`));
        }
        if (err) {
          const detail = stderr ? `${err.message} (${stderr.trim()})` : err.message;
          const sanitizedErr = redactSecrets(detail, config.password);
          return reject(new Error(`pg_dump failed (exit code ${err.code || 1}): ${sanitizedErr.trim()}`));
        }
        tempCreated = true;
        resolve({ stdout, stderr });
      };

      try {
        const child = execFileFn('pg_dump', dumpArgs, { env: childEnv, windowsHide: true }, onDumpComplete);
        activeChild = child;
        activeChildType = 'pg_dump';

        if (child && typeof child.once === 'function') {
          child.once('error', (spawnErr) => {
            if (settled) return;
            settled = true;
            activeChild = null;
            activeChildType = null;
            activeReject = null;
            const sanitizedErr = redactSecrets(spawnErr.message, config.password);
            reject(new Error(`pg_dump spawn error: ${sanitizedErr.trim()}`));
          });
          child.once('close', (code, signal) => {
            if (isInterrupted && !settled) {
              settled = true;
              activeChild = null;
              activeChildType = null;
              activeReject = null;
              reject(new Error(`pg_dump interrupted by signal ${signal || interruptionSignal || 'SIGINT'}`));
            }
          });
        }
      } catch (syncErr) {
        settled = true;
        activeChild = null;
        activeChildType = null;
        activeReject = null;
        reject(syncErr);
      }
    });

    if (isInterrupted) {
      throw new Error(`Backup aborted after pg_dump: received signal ${interruptionSignal}`);
    }

    // 4. Verify Archive Size
    if (!existsSyncFn(tempPath)) {
      throw new Error(`Expected temporary backup archive was not created at '${tempPath}'.`);
    }

    const fileStat = statSyncFn(tempPath);
    if (fileStat.size === 0) {
      throw new Error(`Created backup archive at '${tempPath}' is empty (0 bytes).`);
    }

    if (isInterrupted) {
      throw new Error(`Backup aborted before TOC verification: received signal ${interruptionSignal}`);
    }

    // 5. Verify Table of Contents via pg_restore --list
    await new Promise((resolve, reject) => {
      let settled = false;
      activeReject = reject;

      const onRestoreComplete = (err, stdout, stderr) => {
        if (settled) return;
        settled = true;
        activeChild = null;
        activeChildType = null;
        activeReject = null;

        if (isInterrupted) {
          return reject(new Error(`pg_restore TOC verification interrupted by signal ${interruptionSignal || 'SIGINT'}`));
        }
        if (err) {
          const detail = stderr ? `${err.message} (${stderr.trim()})` : err.message;
          const sanitizedErr = redactSecrets(detail, config.password);
          return reject(new Error(`pg_restore TOC verification failed: ${sanitizedErr.trim()}`));
        }
        const output = stdout || '';
        if (output.trim().length === 0) {
          return reject(new Error('pg_restore TOC verification returned empty table of contents.'));
        }
        resolve({ stdout: output });
      };

      try {
        const restoreChild = execFileFn('pg_restore', ['-l', tempPath], { env: childEnv, windowsHide: true }, onRestoreComplete);
        activeChild = restoreChild;
        activeChildType = 'pg_restore';

        if (restoreChild && typeof restoreChild.once === 'function') {
          restoreChild.once('error', (spawnErr) => {
            if (settled) return;
            settled = true;
            activeChild = null;
            activeChildType = null;
            activeReject = null;
            const sanitizedErr = redactSecrets(spawnErr.message, config.password);
            reject(new Error(`pg_restore spawn error: ${sanitizedErr.trim()}`));
          });
          restoreChild.once('close', (code, signal) => {
            if (isInterrupted && !settled) {
              settled = true;
              activeChild = null;
              activeChildType = null;
              activeReject = null;
              reject(new Error(`pg_restore TOC verification interrupted by signal ${signal || interruptionSignal || 'SIGINT'}`));
            }
          });
        }
      } catch (syncErr) {
        settled = true;
        activeChild = null;
        activeChildType = null;
        activeReject = null;
        reject(syncErr);
      }
    });

    if (isInterrupted) {
      throw new Error(`Backup aborted before checksum calculation: received signal ${interruptionSignal}`);
    }

    // 6. Calculate SHA-256 Checksum
    const sha256 = await computeFileSha256(tempPath, createReadStreamFn);

    if (isInterrupted) {
      throw new Error(`Backup aborted before archive publication: received signal ${interruptionSignal}`);
    }

    // 7. Atomic Publication with Exclusive Lock
    const lockContent = `${process.pid}\n`;
    try {
      writeFileSyncFn(lockPath, lockContent, { encoding: 'utf8', flag: 'wx' });
      lockCreated = true;
    } catch (lockErr) {
      throw new Error(`Target backup publication lock could not be acquired for '${finalPath}': ${lockErr.message}. Publication aborted to prevent overwrite collision.`);
    }

    try {
      if (existsSyncFn(finalPath)) {
        throw new Error(`Target backup archive already exists prior to rename: '${finalPath}'. Publication aborted to prevent overwrite.`);
      }
      if (existsSyncFn(manifestPath)) {
        throw new Error(`Target backup manifest already exists prior to rename: '${manifestPath}'. Publication aborted to prevent overwrite.`);
      }

      renameSyncFn(tempPath, finalPath);
      finalRenamed = true;

      if (isInterrupted) {
        throw new Error(`Backup aborted after rename prior to manifest write: received signal ${interruptionSignal}`);
      }

      // 8. Write Checksum Manifest Exclusively (fails if manifest exists)
      const manifestContent = `${sha256}  ${finalFilename}\n`;
      try {
        writeFileSyncFn(manifestPath, manifestContent, { encoding: 'utf8', flag: 'wx' });
        manifestCreated = true;
      } catch (manifestErr) {
        let cleanupErr = null;
        try {
          if (finalRenamed && !manifestCreated && existsSyncFn(finalPath)) {
            unlinkSyncFn(finalPath);
          }
        } catch (cleanupEx) {
          cleanupErr = cleanupEx;
        }
        const msg = `Manifest generation failed after archive rename: ${manifestErr.message}` +
          (cleanupErr ? ` (Warning: failed to clean up unmanifested archive '${finalPath}': ${cleanupErr.message})` : '');
        throw new Error(msg);
      }
    } finally {
      if (lockCreated && existsSyncFn(lockPath)) {
        try {
          unlinkSyncFn(lockPath);
        } catch (_) {}
      }
    }

    const durationMs = Date.now() - startTime;

    return {
      success: true,
      dryRun: false,
      archivePath: finalPath,
      filename: finalFilename,
      sizeBytes: fileStat.size,
      sizeKB: (fileStat.size / 1024).toFixed(2),
      sha256,
      manifestPath,
      dbName: config.dbName,
      host: config.host,
      timestamp,
      durationMs
    };
  } catch (err) {
    if (interruptionPromise) {
      await interruptionPromise;
    }

    let cleanupErr = null;
    try {
      if (lockCreated && existsSyncFn(lockPath)) {
        unlinkSyncFn(lockPath);
      }
    } catch (lockEx) {
      cleanupErr = lockEx;
    }

    if (terminationUnconfirmed) {
      console.warn(`Warning: ${activeChildType || 'child process'} termination could not be confirmed; temporary file '${tempPath}' not deleted to prevent deleting an active file.`);
    } else {
      if (!finalRenamed && existsSyncFn(tempPath)) {
        try {
          unlinkSyncFn(tempPath);
        } catch (ex) {
          cleanupErr = cleanupErr || ex;
        }
      }
      if (finalRenamed && !manifestCreated && existsSyncFn(finalPath)) {
        try {
          unlinkSyncFn(finalPath);
        } catch (ex) {
          cleanupErr = cleanupErr || ex;
        }
      }
    }

    const baseMsg = redactSecrets(err.message, config.password);
    const fullMsg = cleanupErr
      ? `${baseMsg} (Warning: failed to clean up artifact: ${redactSecrets(cleanupErr.message, config.password)})`
      : baseMsg;
    throw new Error(fullMsg);
  } finally {
    if (registerSignals && typeof processTarget.removeListener === 'function') {
      processTarget.removeListener('SIGINT', onSigInt);
      processTarget.removeListener('SIGTERM', onSigTerm);
    }
  }
}

/**
 * CLI Argument parser
 */
function parseArgs(args = process.argv.slice(2)) {
  let isRun = false;
  let isDryRun = false;
  let isHelp = false;
  let destDir = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--run') {
      isRun = true;
    } else if (arg === '--dry-run' || arg === '--preflight-only') {
      isDryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      isHelp = true;
    } else if (arg.startsWith('--dest=')) {
      destDir = arg.split('=')[1];
    } else if (arg === '--dest') {
      i++;
      if (i >= args.length || args[i].startsWith('--')) {
        throw new Error('Option --dest requires a directory path.');
      }
      destDir = args[i];
    } else {
      throw new Error(`Unrecognized CLI argument: "${arg}". Use --help for usage.`);
    }
  }

  return { isRun, isDryRun, isHelp, destDir };
}

/**
 * CLI Main Entry Point
 */
async function main() {
  const { isRun, isDryRun, isHelp, destDir } = parseArgs();

  if (isHelp || (!isRun && !isDryRun)) {
    console.log(`
WorkComposer Local PostgreSQL Backup Tool (SEC-23B.2)
======================================================
Usage:
  node scripts/maintenance/backup-local-db.cjs --dry-run
      Runs preflight safety checks (connection, database name, disk space).
      Does NOT create backup directories or dump files.

  node scripts/maintenance/backup-local-db.cjs --run [--dest=<path>]
      Executes an authorized local PostgreSQL backup to the destination directory.
      Creates a timestamped .dump custom archive and .dump.sha256 checksum manifest.

Options:
  --run             Explicitly execute the backup operation.
  --dry-run         Run preflight checks only without creating any files.
  --dest=<path>     Custom destination directory on drive E: (default: E:\\WorkComposer\\backups).
  --help, -h        Show this help message.
`);
    if (!isHelp) {
      console.log('Notice: Neither --run nor --dry-run was specified. Running preflight checks only.\n');
      const preflight = await runPreflight({ destDir });
      console.log('Preflight status:', JSON.stringify(preflight, null, 2));
    }
    return;
  }

  if (isDryRun) {
    console.log('=== WORKCOMPOSER LOCAL BACKUP PREFLIGHT AUDIT ===');
    const result = await createBackup({ dryRun: true, destDir });
    console.log('Preflight Status: PASS');
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (isRun) {
    console.log('=== WORKCOMPOSER LOCAL BACKUP EXECUTION ===');
    const result = await createBackup({ dryRun: false, destDir });
    console.log('Backup Result: SUCCESS');
    console.log(JSON.stringify(result, null, 2));
  }
}

// Export functions for testability
module.exports = {
  DEFAULT_DEST_DIR,
  MIN_REQUIRED_DISK_BYTES,
  redactSecrets,
  formatTimestamp,
  parseDatabaseUrl,
  checkPgIsReady,
  checkDiskSpace,
  validateDestination,
  runPreflight,
  computeFileSha256,
  createBackup,
  terminateChildProcess,
  parseArgs
};

// Safe execution entry point
if (require.main === module) {
  main().catch((err) => {
    console.error('BACKUP SCRIPT ERROR:', redactSecrets(err.message || String(err)));
    process.exit(1);
  });
}
