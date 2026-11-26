const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MAGIC_BYTES = Buffer.from("WCAR"); // WorkComposer Archive
const FORMAT_VERSION = 0x01;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = 4 + 1 + IV_LENGTH + TAG_LENGTH; // 33 bytes

/**
 * Key Provider interface.
 * Production requires an authorized external key custody provider.
 * Throws KEY_PROVIDER_UNAVAILABLE by default to prevent unauthorized key creation.
 */
class KeyProvider {
  async getKeyForUser(userId) {
    const err = new Error(
      `No authorized key management provider configured for user: ${userId}. ` +
      `DEC-11 remains pending organizational authorization.`
    );
    err.code = "KEY_PROVIDER_UNAVAILABLE";
    throw err;
  }
}

/**
 * Validate that a filename is strictly within safe characters and has no path traversal.
 */
function isSafeArchiveRecordId(id) {
  if (!id || typeof id !== "string") return false;
  if (id.includes("..") || id.includes("/") || id.includes("\\")) return false;
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

/**
 * Packages and encrypts an array of screenshot records into an AES-256-GCM .wcar binary archive.
 *
 * @param {Array<Object>} records Array of { id, capturedAt, appName, windowTitle, imageBuffer, meta }
 * @param {Buffer} key 32-byte AES key
 * @param {Object} options Optional metadata
 * @returns {Buffer} Formatted .wcar binary archive
 */
function packArchive(records, key, options = {}) {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error("Invalid encryption key: must be a 32-byte Buffer for AES-256-GCM");
  }
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("Cannot create archive: records array must not be empty");
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const aad = Buffer.concat([MAGIC_BYTES, Buffer.from([FORMAT_VERSION]), iv]);

  // Transform records into serializable format
  const serializableRecords = records.map((r) => {
    if (!isSafeArchiveRecordId(r.id)) {
      throw new Error(`Unsafe record ID in archive: ${r.id}`);
    }
    return {
      id: r.id,
      capturedAt: r.capturedAt || new Date().toISOString(),
      appName: r.appName || "",
      windowTitle: r.windowTitle || "",
      meta: r.meta || {},
      imageBase64: Buffer.isBuffer(r.imageBuffer)
        ? r.imageBuffer.toString("base64")
        : (r.imageBase64 || ""),
    };
  });

  const payload = JSON.stringify({
    format: "WorkComposer-Archive",
    version: FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    recordCount: serializableRecords.length,
    metadata: options.metadata || {},
    records: serializableRecords,
  });

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);

  const ciphertext = Buffer.concat([
    cipher.update(payload, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Result: [MAGIC 4B] [VERSION 1B] [IV 12B] [TAG 16B] [CIPHERTEXT ...]
  return Buffer.concat([MAGIC_BYTES, Buffer.from([FORMAT_VERSION]), iv, authTag, ciphertext]);
}

/**
 * Decrypts and unpacks a .wcar binary archive.
 *
 * @param {Buffer} archiveBuffer Raw .wcar buffer
 * @param {Buffer} key 32-byte AES key
 * @returns {Object} Parsed archive payload with records
 */
function unpackArchive(archiveBuffer, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error("Invalid encryption key: must be a 32-byte Buffer for AES-256-GCM");
  }
  if (!Buffer.isBuffer(archiveBuffer) || archiveBuffer.length < HEADER_LENGTH) {
    const err = new Error("Invalid archive: file too small or not a buffer");
    err.code = "INVALID_ARCHIVE_HEADER";
    throw err;
  }

  const magic = archiveBuffer.subarray(0, 4);
  if (!magic.equals(MAGIC_BYTES)) {
    const err = new Error(`Invalid archive magic bytes: expected 'WCAR', got '${magic.toString()}'`);
    err.code = "INVALID_ARCHIVE_MAGIC";
    throw err;
  }

  const version = archiveBuffer.readUInt8(4);
  if (version !== FORMAT_VERSION) {
    const err = new Error(`Unsupported archive format version: ${version}`);
    err.code = "UNSUPPORTED_ARCHIVE_VERSION";
    throw err;
  }

  const iv = archiveBuffer.subarray(5, 5 + IV_LENGTH);
  const tag = archiveBuffer.subarray(5 + IV_LENGTH, 5 + IV_LENGTH + TAG_LENGTH);
  const ciphertext = archiveBuffer.subarray(HEADER_LENGTH);

  const aad = Buffer.concat([MAGIC_BYTES, Buffer.from([FORMAT_VERSION]), iv]);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);

  let decryptedJson;
  try {
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    decryptedJson = JSON.parse(decrypted.toString("utf8"));
  } catch (decryptErr) {
    const err = new Error("Archive decryption failed: authentication tag mismatch or corrupted ciphertext");
    err.code = "ARCHIVE_DECRYPTION_FAILED";
    err.originalError = decryptErr.message;
    throw err;
  }

  return decryptedJson;
}

/**
 * Extracts decrypted records from an archive buffer safely into a target directory.
 * Enforces strict path traversal prevention.
 */
function extractArchiveToDir(archiveBuffer, key, targetDir) {
  const payload = unpackArchive(archiveBuffer, key);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const extracted = [];
  for (const record of payload.records || []) {
    if (!isSafeArchiveRecordId(record.id)) {
      const err = new Error(`Path traversal attempt detected in archive record id: ${record.id}`);
      err.code = "PATH_TRAVERSAL_DETECTED";
      throw err;
    }

    const imagePath = path.join(targetDir, `${record.id}.jpg`);
    const metaPath = path.join(targetDir, `${record.id}.json`);

    // Verify resolved path stays strictly within targetDir
    if (!imagePath.startsWith(path.resolve(targetDir)) || !metaPath.startsWith(path.resolve(targetDir))) {
      const err = new Error(`Directory escape attempt: ${record.id}`);
      err.code = "PATH_TRAVERSAL_DETECTED";
      throw err;
    }

    if (record.imageBase64) {
      fs.writeFileSync(imagePath, Buffer.from(record.imageBase64, "base64"));
    }
    fs.writeFileSync(metaPath, JSON.stringify(record, null, 2), "utf8");
    extracted.push({ id: record.id, imagePath, metaPath });
  }

  return {
    recordCount: extracted.length,
    extracted,
  };
}

/**
 * Enforces storage limits on the user's archives directory.
 */
function enforceArchiveQuota(archiveDir, maxQuotaBytes = 50 * 1024 * 1024, maxCount = 5) {
  if (!archiveDir || !fs.existsSync(archiveDir)) return { prunedCount: 0 };

  const files = fs.readdirSync(archiveDir).filter((f) => f.endsWith(".wcar"));
  const items = [];

  for (const f of files) {
    const fPath = path.join(archiveDir, f);
    try {
      const stat = fs.statSync(fPath);
      items.push({ name: f, path: fPath, size: stat.size, mtime: stat.mtimeMs });
    } catch {}
  }

  let totalBytes = items.reduce((sum, item) => sum + item.size, 0);
  let count = items.length;

  if (totalBytes <= maxQuotaBytes && count <= maxCount) {
    return { prunedCount: 0, totalBytes, count };
  }

  // Sort oldest first
  items.sort((a, b) => a.mtime - b.mtime);

  let prunedCount = 0;
  for (const item of items) {
    if (totalBytes <= maxQuotaBytes && count <= maxCount) {
      break;
    }
    try {
      if (fs.existsSync(item.path)) fs.unlinkSync(item.path);
      totalBytes -= item.size;
      count--;
      prunedCount++;
    } catch {}
  }

  return { prunedCount, remainingBytes: totalBytes, remainingCount: count };
}

module.exports = {
  MAGIC_BYTES,
  FORMAT_VERSION,
  KeyProvider,
  packArchive,
  unpackArchive,
  extractArchiveToDir,
  enforceArchiveQuota,
  isSafeArchiveRecordId,
};
