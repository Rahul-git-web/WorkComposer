import crypto from "crypto";

const BSON_OBJECTID_REGEX = /^[0-9a-f]{24}$/;

/**
 * Validates whether an ID is a valid 24-character lowercase hexadecimal string.
 */
export function isValid24HexId(id) {
  if (typeof id !== "string") return false;
  return BSON_OBJECTID_REGEX.test(id);
}

/**
 * Normalizes an existing MongoDB _id (BSON ObjectId, string, or Buffer) to a 24-hex string.
 * Preserves the exact original ID.
 */
export function to24HexId(id) {
  if (!id) return null;
  const str = id.toString().trim();
  if (isValid24HexId(str)) {
    return str.toLowerCase();
  }
  return null;
}

/**
 * Generates a deterministic 24-character lowercase hexadecimal ID from a stable seed string.
 * This guarantees idempotency when normalizing subdocuments across resumes/reruns without
 * creating random IDs each time.
 */
export function deterministicId(seed) {
  if (!seed) {
    throw new Error("Seed string is required for deterministic ID generation.");
  }
  // MD5 yields 32 hex characters; take the first 24 to match BSON ObjectId length exactly
  const hash = crypto.createHash("md5").update(String(seed)).digest("hex");
  return hash.substring(0, 24).toLowerCase();
}

export default {
  isValid24HexId,
  to24HexId,
  deterministicId,
};
