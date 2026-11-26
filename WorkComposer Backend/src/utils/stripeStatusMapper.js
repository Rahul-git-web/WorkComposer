/**
 * WorkComposer — Stripe Status Mapper & Monetary Utility
 *
 * Normalizes Stripe status strings and minor-unit amounts into valid
 * PostgreSQL / Prisma enum values and decimal amounts.
 *
 * PostgreSQL Enums:
 * - SubscriptionStatus: 'active' | 'trial' | 'suspended' | 'cancelled'
 * - InvoiceStatus: 'paid' | 'pending' | 'failed' | 'refunded'
 */

const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
  "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);

const THREE_DECIMAL_CURRENCIES = new Set([
  "BHD", "JOD", "KWD", "OMR", "TND",
]);

/**
 * Maps Stripe subscription statuses to Prisma SubscriptionStatus enum values.
 *
 * Stripe statuses:
 * - 'active' -> 'active'
 * - 'trialing' -> 'trial'
 * - 'past_due', 'unpaid', 'paused', 'incomplete' -> 'suspended'
 * - 'canceled', 'cancelled', 'incomplete_expired' -> 'cancelled'
 * - Unknown/unsupported statuses -> 'suspended' (fail-closed, never grants misleading active access)
 *
 * @param {string|null|undefined} stripeStatus
 * @returns {"active"|"trial"|"suspended"|"cancelled"}
 */
export function mapStripeSubscriptionStatus(stripeStatus) {
  if (!stripeStatus) return "trial";
  const s = String(stripeStatus).trim().toLowerCase();
  switch (s) {
    case "active":
      return "active";
    case "trialing":
    case "trial":
      return "trial";
    case "canceled":
    case "cancelled":
    case "incomplete_expired":
      return "cancelled";
    case "past_due":
    case "unpaid":
    case "paused":
    case "incomplete":
    case "suspended":
      return "suspended";
    default:
      console.warn(`[StripeStatusMapper] Unrecognized subscription status "${stripeStatus}", mapped fail-closed to "suspended"`);
      return "suspended";
  }
}

/**
 * Maps Stripe invoice statuses to Prisma InvoiceStatus enum values.
 *
 * Stripe invoice statuses:
 * - 'paid' -> 'paid'
 * - 'open', 'draft' -> 'pending'
 * - 'uncollectible', 'failed' -> 'failed'
 * - 'void' -> 'failed' (voided invoices were cancelled before collection; mapping to 'failed' avoids falsely labeling an unpaid invoice as 'refunded')
 * - 'refunded' -> 'refunded' (internal application status)
 * - Unknown/unsupported statuses -> 'pending' (fail-closed)
 *
 * @param {string|null|undefined} stripeStatus
 * @returns {"paid"|"pending"|"failed"|"refunded"}
 */
export function mapStripeInvoiceStatus(stripeStatus) {
  if (!stripeStatus) return "pending";
  const s = String(stripeStatus).trim().toLowerCase();
  switch (s) {
    case "paid":
      return "paid";
    case "open":
    case "draft":
      return "pending";
    case "uncollectible":
    case "failed":
    case "void":
      return "failed";
    case "refunded":
      return "refunded";
    default:
      console.warn(`[StripeStatusMapper] Unrecognized invoice status "${stripeStatus}", mapped fail-closed to "pending"`);
      return "pending";
  }
}

/**
 * Converts Stripe monetary minor units (cents, yen, etc.) to standard currency amounts.
 * Accurately handles:
 * - Zero-decimal currencies (JPY, KRW, VND, etc. where 1000 units = 1000)
 * - Three-decimal currencies (BHD, KWD, OMR, etc. divided by 1000)
 * - Standard currencies (USD, EUR, GBP, etc. divided by 100)
 *
 * Uses exact integer minor unit rounding before division to prevent IEEE 754 floating-point drift.
 * Handles negative values (credits/reversals) and large values safely.
 *
 * @param {number|string|null|undefined} amountInMinorUnits
 * @param {string} [currency="USD"]
 * @returns {number}
 */
export function convertStripeAmountToStandard(amountInMinorUnits, currency = "USD") {
  if (amountInMinorUnits === null || amountInMinorUnits === undefined || isNaN(amountInMinorUnits)) {
    return 0;
  }
  const rawNum = Number(amountInMinorUnits);
  if (!Number.isFinite(rawNum)) {
    return 0;
  }
  const curr = String(currency).trim().toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(curr)) {
    return Math.round(rawNum);
  }
  if (THREE_DECIMAL_CURRENCIES.has(curr)) {
    return Math.round(rawNum) / 1000;
  }
  return Math.round(rawNum) / 100;
}

export default {
  mapStripeSubscriptionStatus,
  mapStripeInvoiceStatus,
  convertStripeAmountToStandard,
};
