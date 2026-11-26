const fs = require("fs");
const path = require("path");

let customProvider = null;

/**
 * Returns available free disk space in bytes for the volume containing targetPath.
 * Uses native fs.statfsSync (Node 19.6+) or custom provider when set.
 */
function getFreeDiskSpace(targetPath) {
  if (typeof customProvider === "function") {
    return customProvider(targetPath);
  }

  try {
    const checkPath = fs.existsSync(targetPath) ? targetPath : path.dirname(targetPath);
    if (typeof fs.statfsSync === "function") {
      const stats = fs.statfsSync(checkPath);
      // bavail: free blocks available to unprivileged users
      // bsize: block size in bytes
      return Number(stats.bavail) * Number(stats.bsize);
    }
  } catch {
    // If statfs fails (e.g. permission/virtual fs), return safe high number to avoid false-positive crash
  }

  return Infinity;
}

/**
 * Checks whether free space meets the required reserve.
 * Returns { ok: true, freeBytes } or throws INSUFFICIENT_HOST_STORAGE error.
 */
function assertDiskSpaceReserve(targetPath, reserveBytes = 500 * 1024 * 1024) {
  const freeBytes = getFreeDiskSpace(targetPath);
  if (freeBytes < reserveBytes) {
    const err = new Error(
      `[INSUFFICIENT_HOST_STORAGE] Insufficient host storage: ${Math.round(freeBytes / (1024 * 1024))} MB available, ` +
      `${Math.round(reserveBytes / (1024 * 1024))} MB reserve required`
    );
    err.code = "INSUFFICIENT_HOST_STORAGE";
    err.freeBytes = freeBytes;
    err.reserveBytes = reserveBytes;
    throw err;
  }
  return { ok: true, freeBytes, reserveBytes };
}

/**
 * Set a custom provider function for deterministic testing.
 * @param {Function|null} providerFn (targetPath) => freeBytes
 */
function setCustomDiskSpaceProvider(providerFn) {
  customProvider = providerFn;
}

/**
 * Reset to default filesystem provider.
 */
function resetDiskSpaceProvider() {
  customProvider = null;
}

module.exports = {
  getFreeDiskSpace,
  assertDiskSpaceReserve,
  setCustomDiskSpaceProvider,
  resetDiskSpaceProvider,
};
