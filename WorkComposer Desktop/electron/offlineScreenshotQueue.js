const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const {
  DEFAULT_RETENTION_POLICY,
  SafeRetainPolicy,
} = require("./safeRetainPolicy");

const {
  getFreeDiskSpace,
  assertDiskSpaceReserve,
  setCustomDiskSpaceProvider,
  resetDiskSpaceProvider,
} = require("./diskSpaceProvider");

const {
  MAGIC_BYTES,
  FORMAT_VERSION,
  KeyProvider,
  packArchive,
  unpackArchive,
  extractArchiveToDir,
  enforceArchiveQuota,
  isSafeArchiveRecordId,
} = require("./safeRetainArchive");

// Baseline constants for backward compatibility
const MAX_QUEUE_SIZE = 50;
const MAX_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 30 * 1000; // 30 seconds
const MAX_RETRY_DELAY_MS = 10 * 60 * 1000; // 10 minutes

const MAX_RESCUE_SIZE = 50;
const MAX_RESCUE_BYTES = 50 * 1024 * 1024;
const MAX_DEAD_LETTER_SIZE = 50;
const MAX_DEAD_LETTER_BYTES = 50 * 1024 * 1024;

let baseUserDataPath = null;
let currentPolicy = new SafeRetainPolicy();
let activeBoundUserId = null;

let legacyQueueDir = null;
let legacyRescueDir = null;
let legacyDeadLetterDir = null;

let retryTimer = null;
let isProcessing = false;
let isRecovering = false;

/**
 * Validates and normalizes user IDs into a safe filesystem-compliant directory name.
 * Prevents directory traversal, illegal Windows characters, and directory escape.
 */
function normalizeUserId(userId) {
  if (!userId || typeof userId !== "string") {
    throw new Error("Invalid userId: must be a non-empty string");
  }
  const trimmed = userId.trim();
  if (trimmed.length === 0) {
    throw new Error("Invalid userId: cannot be whitespace only");
  }
  if (
    trimmed.includes("..") ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("\0")
  ) {
    const err = new Error(`Path traversal attempt detected in userId: ${trimmed}`);
    err.code = "PATH_TRAVERSAL_DETECTED";
    throw err;
  }

  // Safe slug check: alphanumeric, hyphen, underscore (max 64 chars)
  if (/^[a-zA-Z0-9_-]{1,64}$/.test(trimmed)) {
    return `u_${trimmed}`;
  }

  // Complex IDs (e.g. email, symbols): deterministic SHA-256 hash
  const hash = crypto.createHash("sha256").update(trimmed).digest("hex").slice(0, 24);
  return `u_h_${hash}`;
}

/**
 * Resolves paths for a specific user partition.
 */
function getUserPaths(userId) {
  if (!baseUserDataPath) {
    throw new Error("Offline queue not initialized");
  }
  const safeSlug = normalizeUserId(userId);
  const userRoot = path.join(baseUserDataPath, "users", safeSlug);

  return {
    userRoot,
    activeQueueDir: path.join(userRoot, "active_queue"),
    rescueDir: path.join(userRoot, "rescued_screenshots"),
    deadLetterDir: path.join(userRoot, "dead_letter_screenshots"),
    archivesDir: path.join(userRoot, "archives"),
    corruptMetadataDir: path.join(userRoot, "corrupt_metadata"),
    tmpDir: path.join(userRoot, ".tmp"),
  };
}

/**
 * Ensures all directories for a user partition exist on disk.
 */
function ensureUserDirectories(userId) {
  const p = getUserPaths(userId);
  for (const dir of [
    p.userRoot,
    p.activeQueueDir,
    p.rescueDir,
    p.deadLetterDir,
    p.archivesDir,
    p.corruptMetadataDir,
    p.tmpDir,
  ]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  return p;
}

/**
 * Helper to discover all user partition directories for a given category.
 * Also includes legacy directory if it exists.
 */
function getPartitionDirs(category, userId = null) {
  if (!baseUserDataPath) return [];

  if (userId) {
    const userPath = getUserPaths(userId);
    let target = userPath.activeQueueDir;
    if (category === "rescue") target = userPath.rescueDir;
    else if (category === "deadLetter") target = userPath.deadLetterDir;
    else if (category === "archives") target = userPath.archivesDir;
    return fs.existsSync(target) ? [target] : [];
  }

  const dirs = [];
  // 1. Legacy directory
  let legacyDir = legacyQueueDir;
  if (category === "rescue") legacyDir = legacyRescueDir;
  else if (category === "deadLetter") legacyDir = legacyDeadLetterDir;

  if (legacyDir && fs.existsSync(legacyDir)) {
    dirs.push(legacyDir);
  }

  // 2. All user partitions under users/
  const usersBase = path.join(baseUserDataPath, "users");
  if (fs.existsSync(usersBase)) {
    try {
      const userFolders = fs.readdirSync(usersBase);
      for (const uf of userFolders) {
        let sub = path.join(usersBase, uf, "active_queue");
        if (category === "rescue") sub = path.join(usersBase, uf, "rescued_screenshots");
        else if (category === "deadLetter") sub = path.join(usersBase, uf, "dead_letter_screenshots");
        else if (category === "archives") sub = path.join(usersBase, uf, "archives");

        if (fs.existsSync(sub)) {
          dirs.push(sub);
        }
      }
    } catch {}
  }

  return dirs;
}

/**
 * Safely writes data to a JSON file atomically using a temporary file.
 */
function safeAtomicWriteJson(targetPath, data) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(
    dir,
    `.tmp_${Date.now()}_${crypto.randomBytes(3).toString("hex")}.tmp`
  );
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmpPath, targetPath);
    return true;
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    throw err;
  }
}

/**
 * Safely copies a file atomically using a temporary file.
 */
function safeAtomicCopy(sourcePath, targetPath) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(
    dir,
    `.tmp_${Date.now()}_${crypto.randomBytes(3).toString("hex")}.tmp`
  );
  try {
    fs.copyFileSync(sourcePath, tmpPath);
    fs.renameSync(tmpPath, targetPath);
    return true;
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    throw err;
  }
}

/**
 * Validates basic JPEG image buffer integrity (non-empty & JPEG magic bytes).
 */
function validateJpegBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return false;
  return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/**
 * Configure the offline queue and related directories within app userData.
 * Idempotent: safely handles duplicate calls without data loss.
 *
 * @param {string} userDataPath Path to Electron app userData
 * @param {Object} options Configuration overrides (policy, userId, diskProvider)
 */
function initOfflineQueue(userDataPath, options = {}) {
  if (!userDataPath || typeof userDataPath !== "string") {
    throw new Error("userDataPath is required to initialize offline queue");
  }

  baseUserDataPath = userDataPath;
  currentPolicy = new SafeRetainPolicy(options.policy || {});

  if (options.diskSpaceProvider) {
    setCustomDiskSpaceProvider(options.diskSpaceProvider);
  }

  // Legacy fallback directories (for backward compatibility)
  legacyQueueDir = path.join(userDataPath, "offline_screenshots");
  legacyRescueDir = path.join(userDataPath, "rescued_screenshots");
  legacyDeadLetterDir = path.join(userDataPath, "dead_letter_screenshots");

  if (!fs.existsSync(legacyQueueDir)) fs.mkdirSync(legacyQueueDir, { recursive: true });
  if (!fs.existsSync(legacyRescueDir)) fs.mkdirSync(legacyRescueDir, { recursive: true });
  if (!fs.existsSync(legacyDeadLetterDir)) fs.mkdirSync(legacyDeadLetterDir, { recursive: true });

  // Common quarantine directories
  const quarantineDir = path.join(userDataPath, "legacy_quarantine");
  const orphansDir = path.join(userDataPath, "unassigned_orphans");
  if (!fs.existsSync(quarantineDir)) fs.mkdirSync(quarantineDir, { recursive: true });
  if (!fs.existsSync(orphansDir)) fs.mkdirSync(orphansDir, { recursive: true });

  // Migrate any existing legacy queue records
  migrateLegacyQueues(userDataPath);

  if (options.userId) {
    activeBoundUserId = options.userId;
    ensureUserDirectories(options.userId);
    reconcileQueueStorage(options.userId);
    enforceQueueBounds(options.userId);
    enforceRescueBounds(options.userId);
    enforceDeadLetterBounds(options.userId);
  } else {
    purgeExpiredItems();
    enforceRescueBounds();
    enforceDeadLetterBounds();
  }

  return legacyQueueDir;
}

function isInitialized() {
  return Boolean(baseUserDataPath && fs.existsSync(baseUserDataPath));
}

function getBaseUserDataPath() {
  return baseUserDataPath;
}

function getQueueDir(userId = null) {
  const targetUser = userId || activeBoundUserId;
  if (targetUser && currentPolicy.userPartitioning && baseUserDataPath) {
    return getUserPaths(targetUser).activeQueueDir;
  }
  return legacyQueueDir;
}

function getRescueDir(userId = null) {
  const targetUser = userId || activeBoundUserId;
  if (targetUser && currentPolicy.userPartitioning && baseUserDataPath) {
    return getUserPaths(targetUser).rescueDir;
  }
  return legacyRescueDir;
}

function getDeadLetterDir(userId = null) {
  const targetUser = userId || activeBoundUserId;
  if (targetUser && currentPolicy.userPartitioning && baseUserDataPath) {
    return getUserPaths(targetUser).deadLetterDir;
  }
  return legacyDeadLetterDir;
}

function getArchivesDir(userId = null) {
  const targetUser = userId || activeBoundUserId;
  if (targetUser && currentPolicy.userPartitioning && baseUserDataPath) {
    return getUserPaths(targetUser).archivesDir;
  }
  return null;
}

function getRetentionPolicy() {
  return currentPolicy;
}

function setRetentionPolicy(policyConfig) {
  currentPolicy = new SafeRetainPolicy(policyConfig);
  return currentPolicy;
}

function getUserIdFromToken(token) {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload.userId || payload.id || null;
  } catch {
    return null;
  }
}

function isSafeFilename(filename) {
  if (!filename || typeof filename !== "string") return false;
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) return false;
  return /^shot_[a-zA-Z0-9_-]+\.(jpg|json)$/.test(filename);
}

function isSafeRescueFilename(filename) {
  if (!filename || typeof filename !== "string") return false;
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) return false;
  return /^rescue_[a-zA-Z0-9_-]+\.(jpg|json)$/.test(filename);
}

function isSafeDeadLetterFilename(filename) {
  if (!filename || typeof filename !== "string") return false;
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) return false;
  return /^dead_[a-zA-Z0-9_-]+\.(jpg|json)$/.test(filename);
}

function resetQueueState() {
  clearRetryTimer();
  baseUserDataPath = null;
  activeBoundUserId = null;
  currentPolicy = new SafeRetainPolicy();
  legacyQueueDir = null;
  legacyRescueDir = null;
  legacyDeadLetterDir = null;
  isProcessing = false;
  isRecovering = false;
  resetDiskSpaceProvider();
}

/**
 * Safe, idempotent backward-compatibility migration of legacy shared queue items.
 */
function migrateLegacyQueues(userDataPath) {
  if (!userDataPath || !fs.existsSync(userDataPath)) return { migrated: 0, quarantined: 0 };

  let migratedCount = 0;
  let quarantinedCount = 0;
  const legacyDir = path.join(userDataPath, "offline_screenshots");
  const quarantineDir = path.join(userDataPath, "legacy_quarantine");

  if (!fs.existsSync(legacyDir)) return { migrated: 0, quarantined: 0 };

  const files = fs.readdirSync(legacyDir);
  const metaFiles = files.filter((f) => f.endsWith(".json") && isSafeFilename(f));

  for (const metaFile of metaFiles) {
    const metaPath = path.join(legacyDir, metaFile);
    const baseName = metaFile.replace(/\.json$/, "");
    const imagePath = path.join(legacyDir, `${baseName}.jpg`);

    try {
      const raw = fs.readFileSync(metaPath, "utf8");
      const meta = JSON.parse(raw);

      if (meta.userId && typeof meta.userId === "string" && meta.userId.trim().length > 0) {
        let safeSlug;
        try {
          safeSlug = normalizeUserId(meta.userId);
        } catch {
          safeSlug = null;
        }

        if (safeSlug) {
          const userQueue = path.join(userDataPath, "users", safeSlug, "active_queue");
          if (!fs.existsSync(userQueue)) fs.mkdirSync(userQueue, { recursive: true });

          const targetImg = path.join(userQueue, `${baseName}.jpg`);
          const targetMeta = path.join(userQueue, `${baseName}.json`);

          if (fs.existsSync(imagePath)) fs.renameSync(imagePath, targetImg);
          fs.renameSync(metaPath, targetMeta);
          migratedCount++;
          continue;
        }
      }

      const qTargetImg = path.join(quarantineDir, `${baseName}.jpg`);
      const qTargetMeta = path.join(quarantineDir, `${baseName}.json`);

      if (fs.existsSync(imagePath)) fs.renameSync(imagePath, qTargetImg);
      fs.renameSync(metaPath, qTargetMeta);
      quarantinedCount++;
    } catch {
      try {
        if (fs.existsSync(metaPath)) {
          fs.renameSync(metaPath, path.join(quarantineDir, `${baseName}.json`));
        }
        if (fs.existsSync(imagePath)) {
          fs.renameSync(imagePath, path.join(quarantineDir, `${baseName}.jpg`));
        }
        quarantinedCount++;
      } catch {}
    }
  }

  return { migrated: migratedCount, quarantined: quarantinedCount };
}

/**
 * Reconciles storage consistency.
 */
function reconcileQueueStorage(userId = null) {
  const targetDir = getQueueDir(userId);
  if (!targetDir || !fs.existsSync(targetDir)) return { orphans: 0, dangling: 0, corrupt: 0 };

  const orphansDir = baseUserDataPath
    ? path.join(baseUserDataPath, "unassigned_orphans")
    : path.join(targetDir, "unassigned_orphans");
  const corruptDir = path.join(path.dirname(targetDir), "corrupt_metadata");

  if (!fs.existsSync(orphansDir)) fs.mkdirSync(orphansDir, { recursive: true });
  if (!fs.existsSync(corruptDir)) fs.mkdirSync(corruptDir, { recursive: true });

  const files = fs.readdirSync(targetDir);
  let orphanCount = 0;
  let danglingCount = 0;
  let corruptCount = 0;

  const now = Date.now();
  for (const f of files.filter((f) => f.startsWith(".tmp"))) {
    const fPath = path.join(targetDir, f);
    try {
      const stat = fs.statSync(fPath);
      if (now - stat.mtimeMs > 5 * 60 * 1000) {
        fs.unlinkSync(fPath);
      }
    } catch {}
  }

  const jpgFiles = files.filter((f) => f.endsWith(".jpg") && isSafeFilename(f));
  for (const jpg of jpgFiles) {
    const baseName = jpg.replace(/\.jpg$/, "");
    const metaPath = path.join(targetDir, `${baseName}.json`);

    if (!fs.existsSync(metaPath)) {
      const orphanTarget = path.join(orphansDir, `orphan_${Date.now()}_${jpg}`);
      try {
        fs.renameSync(path.join(targetDir, jpg), orphanTarget);
        orphanCount++;
      } catch {}
    }
  }

  const metaFiles = files.filter((f) => f.endsWith(".json") && isSafeFilename(f));
  for (const meta of metaFiles) {
    const baseName = meta.replace(/\.json$/, "");
    const imgPath = path.join(targetDir, `${baseName}.jpg`);
    const metaPath = path.join(targetDir, meta);

    if (!fs.existsSync(imgPath)) {
      try {
        fs.unlinkSync(metaPath);
        danglingCount++;
      } catch {}
      continue;
    }

    try {
      const raw = fs.readFileSync(metaPath, "utf8");
      JSON.parse(raw);
    } catch {
      try {
        fs.renameSync(metaPath, path.join(corruptDir, meta));
        if (fs.existsSync(imgPath)) {
          fs.renameSync(imgPath, path.join(corruptDir, `${baseName}.jpg`));
        }
        corruptCount++;
      } catch {}
    }
  }

  return { orphans: orphanCount, dangling: danglingCount, corrupt: corruptCount };
}

/**
 * Enforce storage limits (item count and total bytes) on rescued screenshots.
 */
function enforceRescueBounds(userId = null) {
  const dirs = getPartitionDirs("rescue", userId);
  const maxCount = currentPolicy.rescueMaxCount;
  const maxBytes = currentPolicy.rescueMaxBytes;

  for (const rDir of dirs) {
    try {
      const files = fs.readdirSync(rDir);
      const metaFiles = files.filter((f) => f.endsWith(".json") && isSafeRescueFilename(f));
      const items = [];

      for (const metaFile of metaFiles) {
        const metaPath = path.join(rDir, metaFile);
        const baseName = metaFile.replace(/\.json$/, "");
        const imagePath = path.join(rDir, `${baseName}.jpg`);
        try {
          const raw = fs.readFileSync(metaPath, "utf8");
          const record = JSON.parse(raw);
          const imgStat = fs.existsSync(imagePath) ? fs.statSync(imagePath) : { size: 0 };
          const metaStat = fs.statSync(metaPath);
          items.push({
            id: record.id || baseName,
            rescuedAt: new Date(record.rescuedAt || 0).getTime() || Date.now(),
            metaPath,
            imagePath,
            sizeBytes: imgStat.size + metaStat.size,
          });
        } catch {}
      }

      let totalBytes = items.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);
      let totalCount = items.length;

      if (totalCount <= maxCount && totalBytes <= maxBytes) {
        continue;
      }

      items.sort((a, b) => (a.rescuedAt || 0) - (b.rescuedAt || 0));

      for (const item of items) {
        if (totalCount <= maxCount && totalBytes <= maxBytes) {
          break;
        }

        console.warn(
          `[RESCUE STORAGE BOUNDS] Evicting oldest rescued item ${item.id} to enforce storage limit ` +
          `(${totalCount} items / ${maxCount} max, ${totalBytes} bytes / ${maxBytes} max)`
        );

        try {
          if (fs.existsSync(item.metaPath)) fs.unlinkSync(item.metaPath);
          if (fs.existsSync(item.imagePath)) fs.unlinkSync(item.imagePath);
          totalCount--;
          totalBytes -= (item.sizeBytes || 0);
        } catch {}
      }
    } catch {}
  }
}

/**
 * Enforce storage limits (item count and total bytes) on dead-letter screenshots.
 */
function enforceDeadLetterBounds(userId = null) {
  const dirs = getPartitionDirs("deadLetter", userId);
  const maxCount = currentPolicy.deadLetterMaxCount;
  const maxBytes = currentPolicy.deadLetterMaxBytes;

  for (const dlDir of dirs) {
    try {
      const files = fs.readdirSync(dlDir);
      const metaFiles = files.filter((f) => f.endsWith(".json") && isSafeDeadLetterFilename(f));
      const items = [];

      for (const metaFile of metaFiles) {
        const metaPath = path.join(dlDir, metaFile);
        const baseName = metaFile.replace(/\.json$/, "");
        const imagePath = path.join(dlDir, `${baseName}.jpg`);
        try {
          const raw = fs.readFileSync(metaPath, "utf8");
          const record = JSON.parse(raw);
          const imgStat = fs.existsSync(imagePath) ? fs.statSync(imagePath) : { size: 0 };
          const metaStat = fs.statSync(metaPath);
          items.push({
            id: record.id || baseName,
            exhaustedAt: new Date(record.exhaustedAt || 0).getTime() || Date.now(),
            metaPath,
            imagePath,
            sizeBytes: imgStat.size + metaStat.size,
          });
        } catch {}
      }

      let totalBytes = items.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);
      let totalCount = items.length;

      if (totalCount <= maxCount && totalBytes <= maxBytes) {
        continue;
      }

      items.sort((a, b) => (a.exhaustedAt || 0) - (b.exhaustedAt || 0));

      for (const item of items) {
        if (totalCount <= maxCount && totalBytes <= maxBytes) {
          break;
        }

        console.warn(
          `[DEAD LETTER STORAGE BOUNDS] Evicting oldest dead letter item ${item.id} to enforce storage limit ` +
          `(${totalCount} items / ${maxCount} max, ${totalBytes} bytes / ${maxBytes} max)`
        );

        try {
          if (fs.existsSync(item.metaPath)) fs.unlinkSync(item.metaPath);
          if (fs.existsSync(item.imagePath)) fs.unlinkSync(item.imagePath);
          totalCount--;
          totalBytes -= (item.sizeBytes || 0);
        } catch {}
      }
    } catch {}
  }
}

/**
 * Moves an exhausted offline screenshot to dead-letter storage.
 */
function moveToDeadLetter(item, reason = "MAX_RETRIES_EXCEEDED", userId = null) {
  try {
    const targetUserId = userId || item.userId || item.meta?.userId;
    const dlDir = getDeadLetterDir(targetUserId);
    if (!dlDir) return false;
    if (!fs.existsSync(dlDir)) {
      fs.mkdirSync(dlDir, { recursive: true });
    }
    enforceDeadLetterBounds(targetUserId);

    const deadId = `dead_${item.id || Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const targetImage = path.join(dlDir, `${deadId}.jpg`);
    const targetMeta = path.join(dlDir, `${deadId}.json`);

    if (item.imagePath && fs.existsSync(item.imagePath)) {
      safeAtomicCopy(item.imagePath, targetImage);
    }

    const deadRecord = {
      id: item.id || deadId,
      deadId,
      reason,
      exhaustedAt: new Date().toISOString(),
      retryCount: item.meta?.retryCount || 0,
      metadata: item.meta || {},
    };

    safeAtomicWriteJson(targetMeta, deadRecord);

    try { if (item.imagePath && fs.existsSync(item.imagePath)) fs.unlinkSync(item.imagePath); } catch {}
    try { if (item.metaPath && fs.existsSync(item.metaPath)) fs.unlinkSync(item.metaPath); } catch {}

    enforceDeadLetterBounds(targetUserId);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Safely rescues a screenshot file if offline queue enqueueing fails.
 */
function rescueScreenshot(sourceFilePath, metadata, reason, fallbackUserDataPath) {
  try {
    if (!sourceFilePath || !fs.existsSync(sourceFilePath)) return null;

    const userId = metadata?.userId || activeBoundUserId;
    let rDir = null;

    if (userId && currentPolicy.userPartitioning && baseUserDataPath) {
      rDir = getUserPaths(userId).rescueDir;
    } else {
      const baseDir = fallbackUserDataPath || baseUserDataPath || (legacyQueueDir ? path.dirname(legacyQueueDir) : require("os").tmpdir());
      rDir = path.join(baseDir, "rescued_screenshots");
    }

    if (!fs.existsSync(rDir)) {
      fs.mkdirSync(rDir, { recursive: true });
    }

    enforceRescueBounds(userId);

    const rescueId = `rescue_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const targetImage = path.join(rDir, `${rescueId}.jpg`);
    const targetMeta = path.join(rDir, `${rescueId}.json`);

    safeAtomicCopy(sourceFilePath, targetImage);

    const rescueRecord = {
      id: rescueId,
      reason: reason ? String(reason) : "ENQUEUE_FAILURE",
      rescuedAt: new Date().toISOString(),
      metadata: metadata || {},
    };

    safeAtomicWriteJson(targetMeta, rescueRecord);

    enforceRescueBounds(userId);

    return { rescueId, targetImage, targetMeta };
  } catch {
    return null;
  }
}

/**
 * List all valid rescued screenshot items across user partitions or specific user.
 */
function listRescuedItems(userId = null) {
  const dirs = getPartitionDirs("rescue", userId);
  const items = [];

  for (const rDir of dirs) {
    if (!fs.existsSync(rDir)) continue;
    const files = fs.readdirSync(rDir);
    const metaFiles = files.filter((f) => f.endsWith(".json") && isSafeRescueFilename(f));

    for (const metaFile of metaFiles) {
      const metaPath = path.join(rDir, metaFile);
      const baseName = metaFile.replace(/\.json$/, "");
      const imagePath = path.join(rDir, `${baseName}.jpg`);

      if (!fs.existsSync(imagePath)) continue;

      try {
        const raw = fs.readFileSync(metaPath, "utf8");
        const record = JSON.parse(raw);
        const imgStat = fs.statSync(imagePath);
        const metaStat = fs.statSync(metaPath);

        items.push({
          id: record.id || baseName,
          rescueId: baseName,
          userId: record.metadata?.userId || null,
          rescuedAt: new Date(record.rescuedAt || 0).getTime() || Date.now(),
          reason: record.reason || "UNKNOWN",
          metadata: record.metadata || {},
          metaPath,
          imagePath,
          sizeBytes: imgStat.size + metaStat.size,
        });
      } catch {}
    }
  }

  return items;
}

/**
 * List all items currently in dead-letter storage across partitions or specific user.
 */
function listDeadLetterItems(userId = null) {
  const dirs = getPartitionDirs("deadLetter", userId);
  const items = [];

  for (const dlDir of dirs) {
    if (!fs.existsSync(dlDir)) continue;
    const files = fs.readdirSync(dlDir);
    const metaFiles = files.filter((f) => f.endsWith(".json") && isSafeDeadLetterFilename(f));

    for (const metaFile of metaFiles) {
      const metaPath = path.join(dlDir, metaFile);
      const baseName = metaFile.replace(/\.json$/, "");
      const imagePath = path.join(dlDir, `${baseName}.jpg`);

      if (!fs.existsSync(imagePath)) continue;

      try {
        const raw = fs.readFileSync(metaPath, "utf8");
        const record = JSON.parse(raw);
        const imgStat = fs.statSync(imagePath);
        const metaStat = fs.statSync(metaPath);

        items.push({
          id: record.id || baseName,
          deadId: record.deadId || baseName,
          userId: record.metadata?.userId || null,
          exhaustedAt: new Date(record.exhaustedAt || 0).getTime() || Date.now(),
          reason: record.reason || "UNKNOWN",
          metadata: record.metadata || {},
          metaPath,
          imagePath,
          sizeBytes: imgStat.size + metaStat.size,
        });
      } catch {}
    }
  }

  return items;
}

/**
 * Controlled recovery: re-enqueues rescued items.
 */
async function recoverRescuedScreenshots(options = {}) {
  const currentUserId = options.currentUserId || activeBoundUserId || null;

  if (isRecovering) {
    return { recoveredCount: 0, inFlight: true };
  }

  isRecovering = true;
  let recoveredCount = 0;
  let skippedCount = 0;

  try {
    const rescued = listRescuedItems(null);
    rescued.sort((a, b) => a.rescuedAt - b.rescuedAt);

    for (const item of rescued) {
      if (currentUserId && item.userId && item.userId !== currentUserId) {
        skippedCount++;
        continue;
      }

      try {
        enqueueScreenshot(item.imagePath, {
          ...item.metadata,
          userId: item.userId || currentUserId,
          capturedAt: item.metadata.capturedAt || new Date(item.rescuedAt).toISOString(),
          retryCount: 0,
        });

        try { if (fs.existsSync(item.imagePath)) fs.unlinkSync(item.imagePath); } catch {}
        try { if (fs.existsSync(item.metaPath)) fs.unlinkSync(item.metaPath); } catch {}
        recoveredCount++;
      } catch (enqueueErr) {}
    }
  } finally {
    isRecovering = false;
  }

  return { recoveredCount, skippedCount };
}

/**
 * Administrative recovery: allows re-enqueueing items from dead-letter storage.
 */
async function recoverDeadLetterScreenshots(options = {}) {
  const currentUserId = options.currentUserId || activeBoundUserId || null;

  let recoveredCount = 0;
  let skippedCount = 0;
  const deadItems = listDeadLetterItems(null);

  for (const item of deadItems) {
    if (currentUserId && item.userId && item.userId !== currentUserId) {
      skippedCount++;
      continue;
    }

    try {
      enqueueScreenshot(item.imagePath, {
        ...item.metadata,
        userId: item.userId || currentUserId,
        retryCount: 0,
      });

      try { if (fs.existsSync(item.imagePath)) fs.unlinkSync(item.imagePath); } catch {}
      try { if (fs.existsSync(item.metaPath)) fs.unlinkSync(item.metaPath); } catch {}
      recoveredCount++;
    } catch {}
  }

  return { recoveredCount, skippedCount };
}

/**
 * Purge items that exceed the retention duration (24h) or max retries (5).
 */
function purgeExpiredItems(userId = null) {
  const dirs = getPartitionDirs("active", userId);

  for (const targetDir of dirs) {
    if (!fs.existsSync(targetDir)) continue;
    try {
      const files = fs.readdirSync(targetDir);
      const metaFiles = files.filter((f) => f.endsWith(".json") && isSafeFilename(f));
      const now = Date.now();

      for (const metaFile of metaFiles) {
        const metaPath = path.join(targetDir, metaFile);
        const baseName = metaFile.replace(/\.json$/, "");
        const imagePath = path.join(targetDir, `${baseName}.jpg`);

        try {
          const raw = fs.readFileSync(metaPath, "utf8");
          const meta = JSON.parse(raw);

          const capturedMs = meta.capturedAt ? new Date(meta.capturedAt).getTime() : NaN;
          const age = isNaN(capturedMs) ? 0 : (now - capturedMs);
          const retries = Number(meta.retryCount || 0);

          if (age > MAX_RETENTION_MS || retries >= MAX_RETRIES) {
            const reason = retries >= MAX_RETRIES ? "MAX_RETRIES_EXCEEDED" : "RETENTION_EXPIRED";
            moveToDeadLetter(
              { id: meta.id || baseName, imagePath, metaPath, meta, userId: meta.userId },
              reason,
              meta.userId || userId
            );
          }
        } catch {
          try {
            if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
            if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
          } catch {}
        }
      }
    } catch {}
  }
}

/**
 * Enforces maximum queue bounds.
 */
function enforceQueueBounds(userId = null) {
  const dirs = getPartitionDirs("active", userId);
  const maxCount = currentPolicy.activeQueueMaxCount;

  for (const targetDir of dirs) {
    if (!fs.existsSync(targetDir)) continue;
    try {
      const files = fs.readdirSync(targetDir);
      const metaFiles = files.filter((f) => f.endsWith(".json") && isSafeFilename(f));
      const items = [];

      for (const metaFile of metaFiles) {
        const metaPath = path.join(targetDir, metaFile);
        const baseName = metaFile.replace(/\.json$/, "");
        const imagePath = path.join(targetDir, `${baseName}.jpg`);
        if (!fs.existsSync(imagePath)) continue;

        try {
          const raw = fs.readFileSync(metaPath, "utf8");
          const meta = JSON.parse(raw);
          items.push({
            id: meta.id || baseName,
            userId: meta.userId,
            capturedAt: new Date(meta.capturedAt).getTime() || Date.now(),
            metaPath,
            imagePath,
            meta,
          });
        } catch {}
      }

      if (items.length <= maxCount) continue;

      items.sort((a, b) => (a.capturedAt || 0) - (b.capturedAt || 0));

      const excessCount = items.length - maxCount;
      for (let i = 0; i < excessCount; i++) {
        const item = items[i];
        moveToDeadLetter(item, "QUEUE_CAPACITY_EXCEEDED", item.userId || userId);
      }
    } catch {}
  }
}

/**
 * List all valid queued screenshot items across partitions or for specific user.
 */
function listQueueItems(userId = null) {
  const dirs = getPartitionDirs("active", userId);
  const items = [];

  for (const targetDir of dirs) {
    if (!fs.existsSync(targetDir)) continue;
    const files = fs.readdirSync(targetDir);
    const metaFiles = files.filter((f) => f.endsWith(".json") && isSafeFilename(f));

    for (const metaFile of metaFiles) {
      const metaPath = path.join(targetDir, metaFile);
      const baseName = metaFile.replace(/\.json$/, "");
      const imagePath = path.join(targetDir, `${baseName}.jpg`);

      if (!fs.existsSync(imagePath)) {
        try { fs.unlinkSync(metaPath); } catch {}
        continue;
      }

      try {
        const raw = fs.readFileSync(metaPath, "utf8");
        const meta = JSON.parse(raw);
        const imgStat = fs.statSync(imagePath);
        const metaStat = fs.statSync(metaPath);

        items.push({
          id: meta.id || baseName,
          userId: meta.userId,
          capturedAt: new Date(meta.capturedAt).getTime() || Date.now(),
          retryCount: Number(meta.retryCount || 0),
          sizeBytes: imgStat.size + metaStat.size,
          metaPath,
          imagePath,
          meta,
        });
      } catch {
        try {
          if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
          if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
        } catch {}
      }
    }
  }

  return items;
}

/**
 * Evaluates whether screenshot capture is safe to proceed based on storage and backpressure.
 * @param {string|null} userId
 * @returns {{ ok: boolean, status: string, reason?: string, warning?: string, freeBytes?: number, reserveBytes?: number, count?: number, maxCount?: number }}
 */
function evaluateCaptureReadiness(userId = null) {
  const targetUser = userId || activeBoundUserId;
  const targetDir = getQueueDir(targetUser);

  // 1. Assert host storage reserve
  try {
    if (targetDir) {
      assertDiskSpaceReserve(targetDir, currentPolicy.diskReserveBytes);
    }
  } catch (err) {
    if (err.code === "INSUFFICIENT_HOST_STORAGE") {
      return {
        ok: false,
        status: "PAUSE",
        reason: "INSUFFICIENT_HOST_STORAGE",
        warning: err.message,
        freeBytes: err.freeBytes,
        reserveBytes: err.reserveBytes,
      };
    }
    throw err;
  }

  // 2. Adaptive backpressure evaluation if enabled
  if (currentPolicy.enableAdaptiveBackpressure) {
    const items = listQueueItems(targetUser);
    const totalBytes = items.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);
    const bp = currentPolicy.evaluateBackpressure(items.length, totalBytes);

    if (bp.status === "PAUSE") {
      return {
        ok: false,
        status: "PAUSE",
        reason: "OFFLINE_QUEUE_FULL",
        warning: bp.warning,
        usagePercent: bp.usagePercent,
        count: items.length,
        maxCount: currentPolicy.activeQueueMaxCount,
      };
    }

    if (bp.status === "THROTTLE") {
      return {
        ok: true,
        status: "THROTTLE",
        reason: "THROTTLE",
        warning: bp.warning,
        usagePercent: bp.usagePercent,
        count: items.length,
        maxCount: currentPolicy.activeQueueMaxCount,
      };
    }
  }

  return { ok: true, status: "NORMAL" };
}

/**
 * Queue a screenshot that failed initial upload or was taken while offline.
 */
function enqueueScreenshot(sourceFilePath, metadata, options = {}) {
  if (!isInitialized()) {
    throw new Error("Offline queue not initialized");
  }

  if (!fs.existsSync(sourceFilePath)) {
    throw new Error(`Source file does not exist: ${sourceFilePath}`);
  }

  const userId = metadata?.userId || activeBoundUserId;
  let targetDir = getQueueDir(userId);

  if (userId && currentPolicy.userPartitioning && baseUserDataPath) {
    const userPaths = ensureUserDirectories(userId);
    targetDir = userPaths.activeQueueDir;
  }

  // 1. Assert host storage reserve before writing
  assertDiskSpaceReserve(targetDir, currentPolicy.diskReserveBytes);

  // 2. Evaluate adaptive backpressure if enabled
  if (currentPolicy.enableAdaptiveBackpressure) {
    const currentItems = listQueueItems(userId);
    const currentBytes = currentItems.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);
    const bp = currentPolicy.evaluateBackpressure(currentItems.length, currentBytes);

    if (bp.status === "PAUSE") {
      currentPolicy.logRetentionDecision(targetDir, "POLICY_BACKPRESSURE_PAUSE", {
        activeCount: currentItems.length,
        maxCount: currentPolicy.activeQueueMaxCount,
        warning: bp.warning,
      });
      const err = new Error(
        `[OFFLINE_QUEUE_FULL] Offline queue buffer full (${currentItems.length}/${currentPolicy.activeQueueMaxCount}). ` +
        `Adaptive backpressure requested capture pause.`
      );
      err.code = "OFFLINE_QUEUE_FULL";
      err.backpressure = true;
      throw err;
    }
  }

  purgeExpiredItems(userId);
  enforceQueueBounds(userId);

  const id = options.id || metadata.id || `shot_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const targetImagePath = path.join(targetDir, `${id}.jpg`);
  const targetMetaPath = path.join(targetDir, `${id}.json`);

  if (fs.existsSync(targetImagePath) && fs.existsSync(targetMetaPath)) {
    return { id, targetImagePath, targetMetaPath, duplicate: true };
  }

  const sourceBuffer = fs.readFileSync(sourceFilePath);
  if (sourceBuffer.length >= 4 && !validateJpegBuffer(sourceBuffer)) {
    if (sourceBuffer.length === 0) {
      throw new Error("Image buffer is empty: zero bytes");
    }
  }

  const metaRecord = {
    id,
    userId: metadata.userId || null,
    capturedAt: metadata.capturedAt || new Date().toISOString(),
    appName: metadata.appName || "",
    windowTitle: metadata.windowTitle || "",
    keyPresses: Number(metadata.keyPresses || 0),
    mouseClicks: Number(metadata.mouseClicks || 0),
    mouseMoves: Number(metadata.mouseMoves || 0),
    activityScore: Number(metadata.activityScore || 0),
    project: metadata.project || "",
    task: metadata.task || "",
    retryCount: Number(metadata.retryCount || 0),
    enqueuedAt: new Date().toISOString(),
  };

  safeAtomicCopy(sourceFilePath, targetImagePath);
  safeAtomicWriteJson(targetMetaPath, metaRecord);

  enforceQueueBounds(userId);
  return { id, targetImagePath, targetMetaPath };
}

function getBackoffDelay(retryCount) {
  const exponent = Math.min(retryCount, 6);
  const delay = BASE_RETRY_DELAY_MS * Math.pow(2, exponent);
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

function scheduleRetry(processCallback, delayMs = BASE_RETRY_DELAY_MS) {
  clearRetryTimer();
  retryTimer = setTimeout(async () => {
    retryTimer = null;
    if (typeof processCallback === "function") {
      try {
        await processCallback();
      } catch {}
    }
  }, delayMs);
  return retryTimer;
}

function clearRetryTimer() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

async function processQueue(uploaderFn, authContext) {
  if (isProcessing) {
    return { processed: 0, inFlight: true };
  }

  const { token, currentUserId } = authContext || {};
  if (!token || !currentUserId) {
    return { processed: 0, reason: "NOT_AUTHENTICATED" };
  }

  isProcessing = true;
  let successCount = 0;
  let hasFailures = false;
  let minNextDelay = MAX_RETRY_DELAY_MS;

  try {
    purgeExpiredItems(currentUserId);
    const items = listQueueItems(currentUserId);

    items.sort((a, b) => a.capturedAt - b.capturedAt);

    for (const item of items) {
      if (!item.userId || item.userId !== currentUserId) {
        continue;
      }

      try {
        const uploadResult = await uploaderFn({
          imagePath: item.imagePath,
          meta: item.meta,
          token,
        });

        if (uploadResult === true) {
          try {
            if (fs.existsSync(item.imagePath)) fs.unlinkSync(item.imagePath);
            if (fs.existsSync(item.metaPath)) fs.unlinkSync(item.metaPath);
            successCount++;
          } catch {}
        } else {
          hasFailures = true;
          item.meta.retryCount = (item.meta.retryCount || 0) + 1;
          item.meta.lastAttemptAt = new Date().toISOString();

          if (item.meta.retryCount >= MAX_RETRIES) {
            moveToDeadLetter(item, "MAX_RETRIES_EXCEEDED", currentUserId);
          } else {
            safeAtomicWriteJson(item.metaPath, item.meta);
            const delay = getBackoffDelay(item.meta.retryCount);
            if (delay < minNextDelay) minNextDelay = delay;
          }
        }
      } catch (uploadErr) {
        hasFailures = true;
        item.meta.retryCount = (item.meta.retryCount || 0) + 1;
        item.meta.lastAttemptAt = new Date().toISOString();

        if (item.meta.retryCount >= MAX_RETRIES) {
          moveToDeadLetter(item, "MAX_RETRIES_EXCEEDED", currentUserId);
        } else {
          try {
            safeAtomicWriteJson(item.metaPath, item.meta);
          } catch {}
          const delay = getBackoffDelay(item.meta.retryCount);
          if (delay < minNextDelay) minNextDelay = delay;
        }
      }
    }
  } finally {
    isProcessing = false;
  }

  return {
    processed: successCount,
    hasFailures,
    nextDelayMs: hasFailures ? minNextDelay : null,
  };
}

async function archiveDeadLetterScreenshots(userId, keyProvider, options = {}) {
  if (!currentPolicy.enableEncryptedArchive) {
    const err = new Error("Encrypted archives disabled: DEC-11 remains pending authorization");
    err.code = "ENCRYPTED_ARCHIVE_DISABLED";
    throw err;
  }
  if (!keyProvider || typeof keyProvider.getKeyForUser !== "function") {
    const err = new Error(
      "[KEY_PROVIDER_UNAVAILABLE] No key provider configured: DEC-11 remains pending authorization"
    );
    err.code = "KEY_PROVIDER_UNAVAILABLE";
    throw err;
  }

  const safeSlug = normalizeUserId(userId);
  const userPaths = ensureUserDirectories(userId);
  const key = await keyProvider.getKeyForUser(userId);

  if (!Buffer.isBuffer(key) || key.length !== 32) {
    const err = new Error("Invalid key returned by key provider: must be 32-byte Buffer");
    err.code = "INVALID_KEY_LENGTH";
    throw err;
  }

  const deadItems = listDeadLetterItems(userId);
  if (deadItems.length === 0) {
    return { archivedCount: 0, archivePath: null };
  }

  const recordsToArchive = [];
  for (const item of deadItems) {
    let imgBuf = Buffer.alloc(0);
    try {
      if (fs.existsSync(item.imagePath)) {
        imgBuf = fs.readFileSync(item.imagePath);
      }
    } catch {}

    recordsToArchive.push({
      id: item.id || item.deadId,
      capturedAt: item.metadata?.capturedAt || new Date(item.exhaustedAt).toISOString(),
      appName: item.metadata?.appName || "",
      windowTitle: item.metadata?.windowTitle || "",
      meta: item.metadata || {},
      imageBuffer: imgBuf,
    });
  }

  const archiveBuffer = packArchive(recordsToArchive, key, options);
  const archiveName = `archive_${Date.now()}_${crypto.randomBytes(3).toString("hex")}.wcar`;
  const targetArchive = path.join(userPaths.archivesDir, archiveName);

  fs.writeFileSync(targetArchive, archiveBuffer);

  for (const item of deadItems) {
    try { if (fs.existsSync(item.imagePath)) fs.unlinkSync(item.imagePath); } catch {}
    try { if (fs.existsSync(item.metaPath)) fs.unlinkSync(item.metaPath); } catch {}
  }

  enforceArchiveQuota(userPaths.archivesDir, currentPolicy.archiveQuotaBytes);

  return {
    archivedCount: recordsToArchive.length,
    archivePath: targetArchive,
    archiveSizeBytes: archiveBuffer.length,
  };
}

module.exports = {
  initOfflineQueue,
  isInitialized,
  getBaseUserDataPath,
  getQueueDir,
  getRescueDir,
  getDeadLetterDir,
  getArchivesDir,
  getUserIdFromToken,
  isSafeFilename,
  isSafeRescueFilename,
  isSafeDeadLetterFilename,
  normalizeUserId,
  getUserPaths,
  ensureUserDirectories,
  migrateLegacyQueues,
  reconcileQueueStorage,
  getRetentionPolicy,
  setRetentionPolicy,
  enqueueScreenshot,
  evaluateCaptureReadiness,
  rescueScreenshot,
  listRescuedItems,
  listDeadLetterItems,
  recoverRescuedScreenshots,
  recoverDeadLetterScreenshots,
  moveToDeadLetter,
  enforceRescueBounds,
  enforceDeadLetterBounds,
  resetQueueState,
  listQueueItems,
  purgeExpiredItems,
  enforceQueueBounds,
  processQueue,
  scheduleRetry,
  clearRetryTimer,
  getBackoffDelay,
  archiveDeadLetterScreenshots,
  extractArchiveToDir,
  packArchive,
  unpackArchive,
  KeyProvider,
  setCustomDiskSpaceProvider,
  resetDiskSpaceProvider,
  assertDiskSpaceReserve,
  getFreeDiskSpace,
  MAX_QUEUE_SIZE,
  MAX_RETENTION_MS,
  MAX_RETRIES,
  BASE_RETRY_DELAY_MS,
  MAX_RETRY_DELAY_MS,
  MAX_RESCUE_SIZE,
  MAX_RESCUE_BYTES,
  MAX_DEAD_LETTER_SIZE,
  MAX_DEAD_LETTER_BYTES,
  DEFAULT_RETENTION_POLICY,
  SafeRetainPolicy,
};
