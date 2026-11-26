import {
  userRepository,
  notificationRepository,
  reportDeliveryRepository,
} from "../db/repositories/index.js";
import { buildDailyReport } from "./reportBuilder.service.js";
import { getTrackingReportRecipients } from "./reportRecipient.service.js";
import { extractManagerIds } from "../security/policyEvaluator.js";
import sendEmail from "../utils/sendEmail.js";
import { dailyTrackingReportTemplate } from "../templates/dailyTrackingReportTemplate.js";
import { dailyTeamTrackingReportTemplate } from "../templates/dailyTeamTrackingReportTemplate.js";
import { dailyOrganizationTrackingReportTemplate } from "../templates/dailyOrganizationTrackingReportTemplate.js";
import { resolveUserTimezone, getTodayInTimezone } from "../utils/timezone.js";
import {
  categorizeSchedulerError,
  createSafeDiagnostic,
  deriveReportIdempotencyKey,
} from "../utils/schedulerError.js";

/**
 * Dispatches daily tracking reports with atomic PostgreSQL claiming,
 * per-recipient error boundaries, and idempotent delivery guarantees.
 *
 * @param {string} [date] - Override target report date (YYYY-MM-DD)
 * @param {string} [targetOrgId] - Optional organization filter
 * @returns {Promise<{ delivered: number, skipped: number, failed: number }>}
 */
export const sendDailyTrackingReports = async (date = null, targetOrgId = null) => {
  const summary = { delivered: 0, skipped: 0, failed: 0 };

  try {
    const userFilter = { isVerified: true };
    if (targetOrgId) {
      userFilter.organization = targetOrgId;
    }

    const users = await userRepository.find(userFilter, {
      populateOrganization: true,
    });

    const employeeReports = [];
    const managerReports = new Map();
    const ownerReports = new Map();

    for (const user of users) {
      const emailReportSettings = {
        ...(user.organization?.emailReports || {}),
        ...Object.fromEntries(
          Object.entries(user.emailReportSettings || {}).filter(
            ([, value]) => value !== null && value !== undefined,
          ),
        ),
      };

      if (!emailReportSettings.dailyTrackingReports) {
        continue;
      }
      const recipients = await getTrackingReportRecipients(user);

      if (!recipients.length) {
        continue;
      }

      const timezone = resolveUserTimezone(user);
      const userDate = date || getTodayInTimezone(timezone);
      const userId = String(user._id || user.id);
      const orgId = String(
        user.organization?.id || user.organization?._id || user.organization || user.organizationId || "",
      );

      const eventKey = `daily-tracking:${userId}:${userDate}`;

      // Check if already successfully sent to skip redundant calculation
      const existingDelivery = await reportDeliveryRepository.findByEventKey(eventKey);
      if (existingDelivery && existingDelivery.status === "SENT") {
        summary.skipped++;
        continue;
      }

      const report = await buildDailyReport(userId, userDate, { timezone, user });

      employeeReports.push({
        user,
        report,
        userDate,
        orgId,
      });

      const assignedManagerIds = extractManagerIds(user);
      for (const managerId of assignedManagerIds) {
        if (!managerReports.has(managerId)) {
          managerReports.set(managerId, []);
        }

        managerReports.get(managerId).push({
          user,
          report,
          userDate,
          orgId,
        });
      }

      if (orgId) {
        const owners = await userRepository.find({
          organization: orgId,
          role: { in: ["owner", "admin"] },
        });

        for (const owner of owners) {
          const ownerId = String(owner._id || owner.id);

          if (!ownerReports.has(ownerId)) {
            ownerReports.set(ownerId, []);
          }
          ownerReports.get(ownerId).push({
            user,
            report,
            userDate,
            orgId,
          });
        }
      }
    }

    // 1. Deliver employee reports with atomic claiming & per-recipient isolation
    for (const { user, report, userDate, orgId } of employeeReports) {
      const userId = String(user._id || user.id);
      const eventKey = `daily-tracking:${userId}:${userDate}`;
      const idempotencyKey = deriveReportIdempotencyKey(eventKey);

      const claim = await reportDeliveryRepository.claimDelivery({
        eventKey,
        reportType: "DAILY_TRACKING",
        recipientId: userId,
        recipientEmail: user.email,
        recipientRole: "employee",
        organizationId: orgId || null,
        dateStr: userDate,
      });

      if (!claim.claimed) {
        summary.skipped++;
        continue;
      }

      // Pre-send validation: ensure worker still owns lease before initiating network call
      const preCheck = await reportDeliveryRepository.checkOwnership(claim.delivery.id, claim.claimToken);
      if (!preCheck.hasOwnership) {
        console.warn(
          `[DailyTrackingReport] Claim ownership lost before email submission for ${eventKey}: ${preCheck.reason}`,
        );
        summary.skipped++;
        continue;
      }

      try {
        const html = dailyTrackingReportTemplate({
          user,
          report,
          date: userDate,
        });

        const providerRes = await sendEmail(user.email, `Daily Tracking Report - ${userDate}`, html, {
          idempotencyKey,
        });

        const markRes = await reportDeliveryRepository.markSuccess(claim.delivery.id, {
          claimToken: claim.claimToken,
          deliveredAt: new Date(),
          metadata: {
            messageId: providerRes?.messageId || "sent",
            idempotencyKey,
            alreadyDelivered: providerRes?.alreadyDelivered || false,
          },
        });

        if (markRes?.lostOwnership) {
          console.warn(
            `[DailyTrackingReport] Worker lost claim ownership for ${claim.delivery.id} before database acknowledgment. Notification suppressed.`,
          );
          continue;
        }

        await notificationRepository.create({
          recipient: userId,
          organization: orgId || null,
          type: "DAILY_TRACKING_REPORT",
          title: `Daily Tracking Report - ${userDate}`,
          message: `Daily tracking report delivered for ${userDate}`,
          entityType: "tracking",
          metadata: {
            eventKey,
            date: userDate,
          },
        });

        summary.delivered++;
      } catch (err) {
        const errorCategory = categorizeSchedulerError(err);
        await reportDeliveryRepository.markFailure(claim.delivery.id, {
          claimToken: claim.claimToken,
          error: err,
          errorCategory,
        });
        const diagnostic = createSafeDiagnostic({
          recipientId: userId,
          eventKey,
          reportPeriod: userDate,
          category: errorCategory,
          error: err,
          attempt: claim.delivery?.attempts || 1,
        });
        console.error("[DailyTrackingReport] Employee delivery failed:", diagnostic);
        summary.failed++;
      }
    }

    // 2. Deliver manager reports with atomic claiming & per-recipient isolation
    for (const [managerId, reports] of managerReports) {
      try {
        const manager = await userRepository.findById(managerId);

        if (!manager || !reports.length) {
          continue;
        }

        const reportDate = reports[0].userDate;
        const orgId = reports[0].orgId;
        const managerEventKey = `daily-team-tracking:${managerId}:${reportDate}`;
        const managerIdempotencyKey = deriveReportIdempotencyKey(managerEventKey);

        const claim = await reportDeliveryRepository.claimDelivery({
          eventKey: managerEventKey,
          reportType: "DAILY_TEAM_TRACKING",
          recipientId: managerId,
          recipientEmail: manager.email,
          recipientRole: "manager",
          organizationId: orgId || null,
          dateStr: reportDate,
        });

        if (!claim.claimed) {
          summary.skipped++;
          continue;
        }

        const preCheck = await reportDeliveryRepository.checkOwnership(claim.delivery.id, claim.claimToken);
        if (!preCheck.hasOwnership) {
          console.warn(
            `[DailyTrackingReport] Manager claim ownership lost before email submission for ${managerEventKey}: ${preCheck.reason}`,
          );
          summary.skipped++;
          continue;
        }

        try {
          const reportRows = reports
            .map(
              ({ user, report }) => `
<tr>
  <td>${user.firstName} ${user.lastName}</td>
  <td align="center">${report.attendance}</td>
  <td align="center">${Math.floor(
    report.workedSeconds / 3600,
  )}h ${Math.floor((report.workedSeconds % 3600) / 60)}m</td>
  <td align="center">${report.productivity}%</td>
</tr>
`,
            )
            .join("");

          const html = dailyTeamTrackingReportTemplate({
            manager,
            reports: reportRows,
            date: reportDate,
          });

          const providerRes = await sendEmail(
            manager.email,
            `Daily Team Tracking Report - ${reportDate}`,
            html,
            { idempotencyKey: managerIdempotencyKey },
          );

          const markRes = await reportDeliveryRepository.markSuccess(claim.delivery.id, {
            claimToken: claim.claimToken,
            deliveredAt: new Date(),
            metadata: {
              messageId: providerRes?.messageId || "sent",
              idempotencyKey: managerIdempotencyKey,
              alreadyDelivered: providerRes?.alreadyDelivered || false,
            },
          });

          if (markRes?.lostOwnership) {
            console.warn(
              `[DailyTrackingReport] Manager delivery ${claim.delivery.id} lost ownership before database acknowledgment.`,
            );
            continue;
          }

          await notificationRepository.create({
            recipient: managerId,
            organization: orgId || null,
            type: "DAILY_TEAM_TRACKING_REPORT",
            title: `Daily Team Tracking Report - ${reportDate}`,
            message: `Daily team tracking report delivered for ${reportDate}`,
            entityType: "tracking",
            metadata: {
              eventKey: managerEventKey,
              date: reportDate,
            },
          });

          summary.delivered++;
        } catch (managerErr) {
          const errorCategory = categorizeSchedulerError(managerErr);
          await reportDeliveryRepository.markFailure(claim.delivery.id, {
            claimToken: claim.claimToken,
            error: managerErr,
            errorCategory,
          });
          const diagnostic = createSafeDiagnostic({
            recipientId: managerId,
            eventKey: managerEventKey,
            reportPeriod: reportDate,
            category: errorCategory,
            error: managerErr,
            attempt: claim.delivery?.attempts || 1,
          });
          console.error("[DailyTrackingReport] Manager delivery failed:", diagnostic);
          summary.failed++;
        }
      } catch (outerManagerErr) {
        console.error(`[DailyTrackingReport] Error processing manager ${managerId}:`, outerManagerErr);
        summary.failed++;
      }
    }

    // 3. Deliver owner reports with atomic claiming & per-recipient isolation
    for (const [ownerId, reports] of ownerReports) {
      try {
        const owner = await userRepository.findById(ownerId);

        if (!owner || !reports.length) {
          continue;
        }

        const reportDate = reports[0].userDate;
        const orgId = reports[0].orgId;
        const ownerEventKey = `daily-org-tracking:${ownerId}:${reportDate}`;
        const ownerIdempotencyKey = deriveReportIdempotencyKey(ownerEventKey);

        const claim = await reportDeliveryRepository.claimDelivery({
          eventKey: ownerEventKey,
          reportType: "DAILY_ORG_TRACKING",
          recipientId: ownerId,
          recipientEmail: owner.email,
          recipientRole: "owner",
          organizationId: orgId || null,
          dateStr: reportDate,
        });

        if (!claim.claimed) {
          summary.skipped++;
          continue;
        }

        const preCheck = await reportDeliveryRepository.checkOwnership(claim.delivery.id, claim.claimToken);
        if (!preCheck.hasOwnership) {
          console.warn(
            `[DailyTrackingReport] Owner claim ownership lost before email submission for ${ownerEventKey}: ${preCheck.reason}`,
          );
          summary.skipped++;
          continue;
        }

        try {
          const reportRows = reports
            .map(
              ({ user, report }) => `
<tr>
  <td>${user.firstName} ${user.lastName}</td>
  <td align="center">${report.attendance}</td>
  <td align="center">
    ${Math.floor(report.workedSeconds / 3600)}h
    ${Math.floor((report.workedSeconds % 3600) / 60)}m
  </td>
  <td align="center">${report.productivity}%</td>
</tr>
`,
            )
            .join("");

          const html = dailyOrganizationTrackingReportTemplate({
            owner,
            reports: reportRows,
            date: reportDate,
          });

          const providerRes = await sendEmail(
            owner.email,
            `Daily Organization Tracking Report - ${reportDate}`,
            html,
            { idempotencyKey: ownerIdempotencyKey },
          );

          const markRes = await reportDeliveryRepository.markSuccess(claim.delivery.id, {
            claimToken: claim.claimToken,
            deliveredAt: new Date(),
            metadata: {
              messageId: providerRes?.messageId || "sent",
              idempotencyKey: ownerIdempotencyKey,
              alreadyDelivered: providerRes?.alreadyDelivered || false,
            },
          });

          if (markRes?.lostOwnership) {
            console.warn(
              `[DailyTrackingReport] Owner delivery ${claim.delivery.id} lost ownership before database acknowledgment.`,
            );
            continue;
          }

          await notificationRepository.create({
            recipient: ownerId,
            organization: orgId || null,
            type: "DAILY_ORG_TRACKING_REPORT",
            title: `Daily Organization Tracking Report - ${reportDate}`,
            message: `Daily organization tracking report delivered for ${reportDate}`,
            entityType: "tracking",
            metadata: {
              eventKey: ownerEventKey,
              date: reportDate,
            },
          });

          summary.delivered++;
        } catch (ownerErr) {
          const errorCategory = categorizeSchedulerError(ownerErr);
          await reportDeliveryRepository.markFailure(claim.delivery.id, {
            claimToken: claim.claimToken,
            error: ownerErr,
            errorCategory,
          });
          const diagnostic = createSafeDiagnostic({
            recipientId: ownerId,
            eventKey: ownerEventKey,
            reportPeriod: reportDate,
            category: errorCategory,
            error: ownerErr,
            attempt: claim.delivery?.attempts || 1,
          });
          console.error("[DailyTrackingReport] Owner delivery failed:", diagnostic);
          summary.failed++;
        }
      } catch (outerOwnerErr) {
        console.error(`[DailyTrackingReport] Error processing owner ${ownerId}:`, outerOwnerErr);
        summary.failed++;
      }
    }
  } catch (err) {
    console.error("Daily Tracking Report Global Error:", err);
  }

  return summary;
};

export default {
  sendDailyTrackingReports,
};
