/**
 * Pure recursive serialization utility for API responses.
 *
 * Guarantees zero regression and seamless client compatibility:
 * 1. Preserves existing 'id'
 * 2. Exposes '_id' matching 'id' whenever an object has a 24-hex string 'id'
 * 3. Recursively processes nested arrays and plain objects
 * 4. Converts Prisma Decimal instances (from Decimal.js) to primitive JavaScript numbers
 * 5. Preserves Date instances, null, undefined, and primitive values
 * 6. Pure function: creates new objects and arrays without mutating source objects
 *
 * NOTE: Isolated utility for Prisma query outputs; not integrated into Express request pipeline in Phase 2.
 *
 * @param {any} data
 * @returns {any} Serialized clone
 */
export function serializeApiResponse(data) {
  // Handle null, undefined, and non-object primitives directly
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== "object") {
    return data;
  }

  // Preserve Date instances
  if (data instanceof Date) {
    return data;
  }

  // Handle MongoDB / Mongoose ObjectId instances
  if (data._bsontype === "ObjectID" || (data.constructor && data.constructor.name === "ObjectId") || (typeof data.toHexString === "function")) {
    return data.toString();
  }

  // Convert Prisma Decimal (Decimal.js) instances to primitive numbers
  if (typeof data.toNumber === "function") {
    return data.toNumber();
  }

  // Recursively process Arrays
  if (Array.isArray(data)) {
    return data.map(serializeApiResponse);
  }

  // Process plain objects
  const serialized = {};
  for (const [key, value] of Object.entries(data)) {
    serialized[key] = serializeApiResponse(value);
  }

  // Ensure both 'id' and '_id' are available on 24-hex models
  if (
    typeof serialized.id === "string" &&
    serialized.id.length === 24 &&
    serialized._id === undefined
  ) {
    serialized._id = serialized.id;
  } else if (
    typeof serialized._id === "string" &&
    serialized._id.length === 24 &&
    serialized.id === undefined
  ) {
    serialized.id = serialized._id;
  }

  return serialized;
}

export default serializeApiResponse;
