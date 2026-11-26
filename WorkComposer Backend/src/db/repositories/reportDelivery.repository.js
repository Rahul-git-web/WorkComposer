import crypto from "crypto";
import { BaseRepository } from "./base.repository.js";
import { generateId } from "../../utils/idGenerator.js";

/**
 * Report Delivery Repository — PostgreSQL Authoritative Store
 *
 * Implements atomic scheduler idempotency, worker claiming, state transitions,
 * fencing tokens (claim_token & claim_version), lease renewal, and failure tracking.
 */
export class ReportDeliveryRepository extends BaseRepository {
  constructor() {
    super("ReportDelivery");
  }

  /**
   * Atomically claims a report delivery slot for a worker instance.
   *
   * Guarantees:
   * 1. If no record exists for eventKey, creates one in CLAIMED state with claim_token and claim_version = 1.
   * 2. If record exists in SENT state, rejects claim (ALREADY_SENT).
   * 3. If record exists in CLAIMED state and claim has not expired, rejects claim (IN_FLIGHT).
   * 4. If record exists in CLAIMED state but claim has expired (worker crash/timeout),
   *    reclaims the slot, generates a new claim_token, increments claim_version and attempts (RECOVERED).
   * 5. If record exists in FAILED state and attempts < maxAttempts, reclaims the slot (RETRY).
   * 6. Concurrent claim races are serialized by PostgreSQL unique constraint / atomic SQL UPSERT.
   *
   * @param {Object} params
   * @param {string} params.eventKey - Unique deterministic event key
   * @param {string} params.reportType - DAILY_TRACKING | WEEKLY_TRACKING
   * @param {string} params.recipientId - Recipient user ID
   * @param {string} params.recipientEmail - Recipient email address
   * @param {string} [params.recipientRole="employee"] - employee | manager | owner
   * @param {string} [params.organizationId] - Organization ID
   * @param {Date} [params.periodStart] - Start of report period (UTC)
   * @param {Date} [params.periodEnd] - End of report period (UTC)
   * @param {string} [params.dateStr] - Local calendar date string (YYYY-MM-DD)
   * @param {string} [params.claimedBy="worker"] - Worker / process instance ID
   * @param {number} [params.claimDurationMs=300000] - Claim lease duration (default 5 min)
   * @param {number} [params.maxAttempts=3] - Maximum retry attempts before permanent failure
   * @param {Object} [params.metadata] - Optional arbitrary metadata
   * @returns {Promise<{ claimed: boolean, reason?: string, claimToken?: string, claimVersion?: number, recovered?: boolean, retry?: boolean, delivery?: Object }>}
   */
  async claimDelivery(params) {
    const {
      eventKey,
      reportType,
      recipientId,
      recipientEmail,
      recipientRole = "employee",
      organizationId = null,
      periodStart = null,
      periodEnd = null,
      dateStr = null,
      claimedBy = `worker-${process.pid || "default"}`,
      claimDurationMs = 300000,
      maxAttempts = 3,
      metadata = null,
    } = params;

    if (!eventKey || typeof eventKey !== "string") {
      throw new Error("ReportDeliveryRepository.claimDelivery requires a non-empty eventKey");
    }

    const now = new Date();
    const claimExpiresAt = new Date(now.getTime() + claimDurationMs);
    const newId = generateId();
    const claimToken = generateId() + "-" + crypto.randomUUID().slice(0, 8);

    // Atomic PostgreSQL UPSERT claim with fencing tokens (claim_token and claim_version):
    const claimedRows = await this.prisma.$queryRaw`
      INSERT INTO report_deliveries (
        id, event_key, report_type, recipient_id, recipient_email, recipient_role,
        organization_id, period_start, period_end, date_str, status,
        claimed_by, claimed_at, claim_expires_at, claim_token, claim_version,
        attempts, last_attempt_at, created_at, updated_at
      ) VALUES (
        ${newId}, ${eventKey}, ${reportType}, ${String(recipientId)}, ${recipientEmail}, ${recipientRole},
        ${organizationId ? String(organizationId) : null},
        ${periodStart ? new Date(periodStart) : null},
        ${periodEnd ? new Date(periodEnd) : null},
        ${dateStr ? String(dateStr) : null},
        'CLAIMED'::"ReportDeliveryStatus",
        ${claimedBy}, ${now}, ${claimExpiresAt}, ${claimToken}, 1,
        1, ${now}, ${now}, ${now}
      )
      ON CONFLICT (event_key) DO UPDATE
        SET status = 'CLAIMED'::"ReportDeliveryStatus",
            claimed_by = EXCLUDED.claimed_by,
            claimed_at = EXCLUDED.claimed_at,
            claim_expires_at = EXCLUDED.claim_expires_at,
            claim_token = EXCLUDED.claim_token,
            claim_version = report_deliveries.claim_version + 1,
            attempts = report_deliveries.attempts + 1,
            last_attempt_at = EXCLUDED.last_attempt_at,
            updated_at = EXCLUDED.updated_at
        WHERE (report_deliveries.status = 'CLAIMED'::"ReportDeliveryStatus" AND report_deliveries.claim_expires_at < ${now})
           OR (report_deliveries.status = 'FAILED'::"ReportDeliveryStatus" AND report_deliveries.attempts < ${maxAttempts})
      RETURNING *;
    `;

    if (claimedRows && claimedRows.length > 0) {
      const rawRow = claimedRows[0];
      const mappedDelivery = {
        id: rawRow.id,
        eventKey: rawRow.event_key,
        reportType: rawRow.report_type,
        recipientId: rawRow.recipient_id,
        recipientEmail: rawRow.recipient_email,
        recipientRole: rawRow.recipient_role,
        organizationId: rawRow.organization_id,
        periodStart: rawRow.period_start,
        periodEnd: rawRow.period_end,
        dateStr: rawRow.date_str,
        status: rawRow.status,
        claimedBy: rawRow.claimed_by,
        claimedAt: rawRow.claimed_at,
        claimExpiresAt: rawRow.claim_expires_at,
        claimToken: rawRow.claim_token,
        claimVersion: Number(rawRow.claim_version || 1),
        attempts: Number(rawRow.attempts || 1),
        lastAttemptAt: rawRow.last_attempt_at,
        deliveredAt: rawRow.delivered_at,
        lastError: rawRow.last_error,
        errorCategory: rawRow.error_category,
        metadata: rawRow.metadata,
        createdAt: rawRow.created_at,
        updatedAt: rawRow.updated_at,
      };
      return {
        claimed: true,
        claimToken: mappedDelivery.claimToken,
        claimVersion: mappedDelivery.claimVersion,
        recovered: mappedDelivery.attempts > 1,
        retry: mappedDelivery.attempts > 1,
        delivery: this.serialize(mappedDelivery),
      };
    }

    // Row could not be claimed: read current row to determine reason
    const existing = await this.delegate.findUnique({
      where: { eventKey },
    });

    if (!existing) {
      return { claimed: false, reason: "UNKNOWN" };
    }

    if (existing.status === "SENT") {
      return { claimed: false, reason: "ALREADY_SENT", delivery: this.serialize(existing) };
    }

    if (existing.status === "CANCELLED") {
      return { claimed: false, reason: "CANCELLED", delivery: this.serialize(existing) };
    }

    if (
      existing.status === "CLAIMED" &&
      existing.claimExpiresAt &&
      new Date(existing.claimExpiresAt) >= now
    ) {
      return { claimed: false, reason: "IN_FLIGHT", delivery: this.serialize(existing) };
    }

    if (existing.status === "FAILED" && existing.attempts >= maxAttempts) {
      return { claimed: false, reason: "MAX_ATTEMPTS_EXCEEDED", delivery: this.serialize(existing) };
    }

    return { claimed: false, reason: "UNAVAILABLE", delivery: this.serialize(existing) };
  }

  /**
   * Renews/extends the claim lease for an active worker (heartbeat mechanism).
   * Guarantees that only the worker holding the matching claimToken can extend the lease.
   *
   * @param {string} id - Report delivery record ID
   * @param {Object} details
   * @param {string} details.claimToken - Active ownership claim token
   * @param {number} [details.extensionMs=300000] - Additional lease duration in ms
   * @returns {Promise<{ extended: boolean, claimExpiresAt?: Date, reason?: string }>}
   */
  async extendLease(id, details = {}) {
    const idStr = this.toIdString(id);
    const { claimToken, extensionMs = 300000 } = details;

    if (!claimToken) {
      throw new Error("ReportDeliveryRepository.extendLease requires claimToken");
    }

    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + extensionMs);

    const updatedRows = await this.prisma.$queryRaw`
      UPDATE report_deliveries
      SET claim_expires_at = ${newExpiresAt},
          updated_at = ${now}
      WHERE id = ${idStr}
        AND claim_token = ${claimToken}
        AND status = 'CLAIMED'::"ReportDeliveryStatus"
      RETURNING *;
    `;

    if (updatedRows && updatedRows.length > 0) {
      return {
        extended: true,
        claimExpiresAt: newExpiresAt,
      };
    }

    return {
      extended: false,
      reason: "LOST_OWNERSHIP",
    };
  }

  /**
   * Pre-delivery ownership validation check.
   * Enables workers to verify they still own the claim prior to performing external operations.
   *
   * @param {string} id - Report delivery record ID
   * @param {string} claimToken - Expected claim token
   * @returns {Promise<{ hasOwnership: boolean, reason?: string, currentWorker?: string }>}
   */
  async checkOwnership(id, claimToken) {
    const idStr = this.toIdString(id);
    if (!claimToken) return { hasOwnership: false, reason: "MISSING_CLAIM_TOKEN" };

    const record = await this.delegate.findUnique({
      where: { id: idStr },
    });

    if (!record) return { hasOwnership: false, reason: "NOT_FOUND" };
    if (record.status !== "CLAIMED") {
      return { hasOwnership: false, reason: "NOT_CLAIMED", status: record.status };
    }
    if (record.claimToken !== claimToken) {
      return {
        hasOwnership: false,
        reason: "RECLAIMED_BY_ANOTHER_WORKER",
        currentWorker: record.claimedBy,
        currentVersion: record.claimVersion,
      };
    }
    if (record.claimExpiresAt && new Date(record.claimExpiresAt) < new Date()) {
      return { hasOwnership: false, reason: "LEASE_EXPIRED" };
    }

    return { hasOwnership: true, record: this.serialize(record) };
  }

  /**
   * Marks a claimed delivery as successfully sent by the email provider.
   * If claimToken is supplied, enforces a conditional update to ensure an expired
   * worker whose lease was reclaimed cannot overwrite the state of a newer worker.
   *
   * @param {string} id - Report delivery record ID
   * @param {Object} [details]
   * @param {string} [details.claimToken] - Active claim token (fencing)
   * @param {Date} [details.deliveredAt] - Instant of successful dispatch
   * @param {Object} [details.metadata] - Provider response (e.g. messageId)
   * @returns {Promise<{ success: boolean, lostOwnership?: boolean, delivery?: Object, [key: string]: any }>}
   */
  async markSuccess(id, details = {}) {
    const idStr = this.toIdString(id);
    const { claimToken, metadata } = details;
    const deliveredAt = details.deliveredAt ? new Date(details.deliveredAt) : new Date();
    const now = new Date();
    const metadataJson = metadata !== undefined && metadata !== null ? JSON.stringify(metadata) : null;

    if (claimToken) {
      const updatedRows = await this.prisma.$queryRaw`
        UPDATE report_deliveries
        SET status = 'SENT'::"ReportDeliveryStatus",
            delivered_at = ${deliveredAt},
            claim_expires_at = NULL,
            last_error = NULL,
            error_category = NULL,
            metadata = ${metadataJson}::jsonb,
            updated_at = ${now}
        WHERE id = ${idStr}
          AND claim_token = ${claimToken}
          AND status = 'CLAIMED'::"ReportDeliveryStatus"
        RETURNING *;
      `;

      if (!updatedRows || updatedRows.length === 0) {
        const existing = await this.delegate.findUnique({ where: { id: idStr } });
        return {
          success: false,
          lostOwnership: true,
          reason: "LOST_OWNERSHIP",
          currentStatus: existing?.status,
          currentWorker: existing?.claimedBy,
          currentVersion: existing?.claimVersion,
        };
      }

      const rawRow = updatedRows[0];
      const serialized = this.serialize({
        id: rawRow.id,
        eventKey: rawRow.event_key,
        reportType: rawRow.report_type,
        status: rawRow.status,
        deliveredAt: rawRow.delivered_at,
        claimToken: rawRow.claim_token,
        claimVersion: Number(rawRow.claim_version || 1),
        metadata: rawRow.metadata,
      });
      return {
        success: true,
        lostOwnership: false,
        delivery: serialized,
        ...serialized,
      };
    }

    // Unconditional fallback when no claimToken passed
    const updated = await this.delegate.update({
      where: { id: idStr },
      data: {
        status: "SENT",
        deliveredAt,
        claimExpiresAt: null,
        lastError: null,
        errorCategory: null,
        metadata: metadata !== undefined ? metadata : undefined,
      },
    });

    const serialized = this.serialize(updated);
    return {
      success: true,
      lostOwnership: false,
      delivery: serialized,
      ...serialized,
    };
  }

  /**
   * Marks a delivery attempt as failed, recording error details and classification.
   * If claimToken is supplied, ensures an expired worker cannot overwrite newer state.
   *
   * @param {string} id - Report delivery record ID
   * @param {Object} details
   * @param {string} [details.claimToken] - Active claim token (fencing)
   * @param {Error|string} details.error - Error thrown by provider or process
   * @param {string} [details.errorCategory="UNKNOWN"] - RATE_LIMIT | TIMEOUT | INVALID_RECIPIENT | TRANSIENT | PERMANENT
   * @param {Object} [details.metadata]
   * @returns {Promise<{ success: boolean, lostOwnership?: boolean, delivery?: Object, [key: string]: any }>}
   */
  async markFailure(id, details = {}) {
    const idStr = this.toIdString(id);
    const { claimToken, metadata } = details;
    const err = details.error;
    const errorMsg = typeof err === "string" ? err : err?.message || "Unknown delivery error";
    const errorCategory = details.errorCategory || "UNKNOWN";
    const now = new Date();
    const metadataJson = metadata !== undefined && metadata !== null ? JSON.stringify(metadata) : null;

    if (claimToken) {
      const updatedRows = await this.prisma.$queryRaw`
        UPDATE report_deliveries
        SET status = 'FAILED'::"ReportDeliveryStatus",
            last_error = ${errorMsg.slice(0, 2000)},
            error_category = ${errorCategory},
            claim_expires_at = NULL,
            metadata = ${metadataJson}::jsonb,
            updated_at = ${now}
        WHERE id = ${idStr}
          AND claim_token = ${claimToken}
          AND status = 'CLAIMED'::"ReportDeliveryStatus"
        RETURNING *;
      `;

      if (!updatedRows || updatedRows.length === 0) {
        return {
          success: false,
          lostOwnership: true,
          reason: "LOST_OWNERSHIP",
        };
      }

      const rawRow = updatedRows[0];
      const serialized = this.serialize({
        id: rawRow.id,
        eventKey: rawRow.event_key,
        status: rawRow.status,
        lastError: rawRow.last_error,
        errorCategory: rawRow.error_category,
      });
      return {
        success: true,
        lostOwnership: false,
        delivery: serialized,
        ...serialized,
      };
    }

    const updated = await this.delegate.update({
      where: { id: idStr },
      data: {
        status: "FAILED",
        lastError: errorMsg.slice(0, 2000), // bounded error text
        errorCategory,
        claimExpiresAt: null,
        metadata: metadata !== undefined ? metadata : undefined,
      },
    });

    const serialized = this.serialize(updated);
    return {
      success: true,
      lostOwnership: false,
      delivery: serialized,
      ...serialized,
    };
  }

  /**
   * Retrieves a report delivery record by its deterministic event key.
   *
   * @param {string} eventKey
   * @returns {Promise<Object|null>}
   */
  async findByEventKey(eventKey) {
    if (!eventKey) return null;
    const record = await this.delegate.findUnique({
      where: { eventKey },
    });
    return record ? this.serialize(record) : null;
  }

  /**
   * Finds deliveries matching a filter query (useful for status inspection and catchup audits).
   *
   * @param {Object} filter
   * @param {Object} [options]
   * @returns {Promise<Array<Object>>}
   */
  async findDeliveries(filter = {}, options = {}) {
    const where = {};
    if (filter.recipientId) where.recipientId = String(filter.recipientId);
    if (filter.organizationId) where.organizationId = String(filter.organizationId);
    if (filter.reportType) where.reportType = String(filter.reportType);
    if (filter.status) where.status = filter.status;
    if (filter.dateStr) where.dateStr = String(filter.dateStr);

    const queryOptions = { where };
    if (options.orderBy) queryOptions.orderBy = options.orderBy;
    if (options.take) queryOptions.take = Number(options.take);
    if (options.skip) queryOptions.skip = Number(options.skip);

    const records = await this.delegate.findMany(queryOptions);
    return records.map((r) => this.serialize(r));
  }

  /**
   * Releases an active claim without recording a delivery attempt failure.
   * Useful when an evaluation aborts cleanly before any email attempt.
   *
   * @param {string} id
   */
  async releaseClaim(id) {
    const idStr = this.toIdString(id);
    const updated = await this.delegate.update({
      where: { id: idStr },
      data: {
        status: "PENDING",
        claimExpiresAt: null,
        claimedBy: null,
      },
    });
    return this.serialize(updated);
  }
}

export const reportDeliveryRepository = new ReportDeliveryRepository();
export default reportDeliveryRepository;
