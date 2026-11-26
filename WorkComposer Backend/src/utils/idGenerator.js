import crypto from "crypto";

let counter = Math.floor(Math.random() * 0xffffff);

/**
 * Generates a genuine 24-character hexadecimal BSON-compatible ObjectId string.
 * Structure:
 * - 4-byte timestamp (seconds since Unix epoch)
 * - 5-byte random value (machine/process unique)
 * - 3-byte incrementing counter
 *
 * Guaranteed to match /^[0-9a-f]{24}$/
 *
 * @returns {string} 24-character hex string
 */
export function generateId() {
  const timestamp = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, "0");

  const random = crypto.randomBytes(5).toString("hex");

  counter = (counter + 1) & 0xffffff;
  const increment = counter.toString(16).padStart(6, "0");

  const id = timestamp + random + increment;
  return id;
}

/**
 * Validates whether a string is a valid 24-character hexadecimal ObjectId.
 *
 * @param {any} id
 * @returns {boolean}
 */
export function isValidId(id) {
  return typeof id === "string" && /^[0-9a-f]{24}$/i.test(id);
}

export default generateId;
