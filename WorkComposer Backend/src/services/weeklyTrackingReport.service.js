import {
  userRepository,
  notificationRepository,
  reportDeliveryRepository,
} from "../db/repositories/index.js";
import { buildWeeklyReport } from "./weeklyReportBuilder.service.js";
import { getTrackingReportRecipients } from "./reportRecipient.service.js";
import sendEmail from "../utils/sendEmail.js";
import { weeklyTrackingReportTemplate } from "../templates/weeklyTrackingReportTemplate.js";
import { weeklyTeamTrackingReportTemplate } from "../templates/weeklyTeamTrackingReportTemplate.js";
import { weeklyOrganizationTrackingReportTemplate } from "../templates/weeklyOrganizationTrackingReportTemplate.js";
import { resolveUserTimezone, getTodayInTimezone } from "../utils/timezone.js";
import {
  categorizeSchedulerError,
  createSafeDiagnostic,
  deriveReportIdempotencyKey,
} from "../utils/schedulerError.js";

/**
 * Dispatches weekly tracking reports with atomic PostgreSQL claiming,
 * per-recipient error boundaries, and idempotent delivery guarantees.
 *
 * @param {string} [startDate] - Week start date (YYYY-MM-DD, Monday)
 * @param {string} [endDate] - Week end date (YYYY-MM-DD, Sunday)
 * @param {string} [targetOrgId] - Optional organization filter
 * @returns {Promise<{ delivered: number, skipped: number, failed: number }>}
 */
export const sendWeeklyTrackingReports = async (
  startDate = null,
  endDate = null,
  targetOrgId = null,
) => {
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

      if (!emailReportSettings.weeklyTrackingReports) {
        continue;
      }
      const recipients = await getTrackingReportRecipients(user);

      if (!recipients.length) {
        continue;
      }

      const timezone = resolveUserTimezone(user);
      let userStartDate = startDate;
      let userEndDate = endDate;

      if (!userStartDate || !userEndDate) {
        const todayDate = getTodayInTimezone(timezone);
        const [year, month, day] = todayDate.split("-").map(Number);
        const calendarUtc = new Date(Date.UTC(year, month - 1, day));
        const dayOfWeek = calendarUtc.getUTCDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const mondayUtc = new Date(calendarUtc);
        mondayUtc.setUTCDate(calendarUtc.getUTCDate() + diffToMonday);
        const sundayUtc = new Date(mondayUtc);
        sundayUtc.setUTCDate(mondayUtc.getUTCDate() + 6);
        userStartDate = mondayUtc.toISOString().split("T")[0];
        userEndDate = sundayUtc.toISOString().split("T")[0];
      }

      const userId = String(user._id || user.id);
      const orgId = String(
        user.organization?.id || user.organization?._id || user.organization || user.organizationId || "",
      );

      const eventKey = `weekly-tracking:${userId}:${userStartDate}:${userEndDate}`;

      // Check if already successfully sent to skip redundant calculation
      const existingDelivery = await reportDeliveryRepository.findByEventKey(eventKey);
      if (existingDelivery && existingDelivery.status === "SENT") {
        summary.skipped++;
        continue;
      }

      const report = await buildWeeklyReport(userId, userStartDate, userEndDate, {
        timezone,
        user,
      });

      employeeReports.push({
        user,
        report,
        startDate: userStartDate,
        endDate: userEndDate,
        orgId,
      });

      if (user.manager) {
        const managerId = String(user.manager._id || user.manager.id || user.manager);

        if (!managerReports.has(managerId)) {
          managerReports.set(managerId, []);
        }

        managerReports.get(managerId).push({
          user,
          report,
          startDate: userStartDate,
          endDate: userEndDate,
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
            startDate: userStartDate,
            endDate: userEndDate,
            orgId,
          });
        }
      }
    }

    // 1. Deliver employee reports with atomic claiming & per-recipient isolation
    for (const { user, report, startDate: sDate, endDate: eDate, orgId } of employeeReports) {
      const userId = String(user._id || user.id);
      const eventKey = `weekly-tracking:${userId}:${sDate}:${eDate}`;
      const idempotencyKey = deriveReportIdempotencyKey(eventKey);

      const claim = await reportDeliveryRepository.claimDelivery({
        eventKey,
        reportType: "WEEKLY_TRACKING",
        recipientId: userId,
        recipientEmail: user.email,
        recipientRole: "employee",
        organizationId: orgId || null,
        dateStr: `${sDate}:${eDate}`,
      });

      if (!claim.claimed) {
        summary.skipped++;
        continue;
      }

      const preCheck = await reportDeliveryRepository.checkOwnership(claim.delivery.id, claim.claimToken);
      if (!preCheck.hasOwnership) {
        console.warn(
          `[WeeklyTrackingReport] Claim ownership lost before email submission for ${eventKey}: ${preCheck.reason}`,
        );
        summary.skipped++;
        continue;
      }

      try {
        const html = weeklyTrackingReportTemplate({
          user,
          report,
          startDate: sDate,
          endDate: eDate,
        });

        const providerRes = await sendEmail(
          user.email,
          `Weekly Tracking Report - ${sDate} - ${eDate}`,
          html,
          { idempotencyKey },
        );

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
            `[WeeklyTrackingReport] Worker lost claim ownership for ${claim.delivery.id} before database acknowledgment. Notification suppressed.`,
          );
          continue;
        }

        await notificationRepository.create({
          recipient: userId,
          organization: orgId || null,
          type: "WEEKLY_TRACKING_REPORT",
          title: `Weekly Tracking Report - ${sDate} - ${eDate}`,
          message: `Weekly tracking report delivered for ${sDate} to ${eDate}`,
          entityType: "tracking",
          metadata: {
            eventKey,
            startDate: sDate,
            endDate: eDate,
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
          reportPeriod: `${sDate}_${eDate}`,
          category: errorCategory,
          error: err,
          attempt: claim.delivery?.attempts || 1,
        });
        console.error("[WeeklyTrackingReport] Employee delivery failed:", diagnostic);
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

        const { startDate: sDate, endDate: eDate, orgId } = reports[0];
        const managerEventKey = `weekly-team-tracking:${managerId}:${sDate}:${eDate}`;
        const managerIdempotencyKey = deriveReportIdempotencyKey(managerEventKey);

        const claim = await reportDeliveryRepository.claimDelivery({
          eventKey: managerEventKey,
          reportType: "WEEKLY_TEAM_TRACKING",
          recipientId: managerId,
          recipientEmail: manager.email,
          recipientRole: "manager",
          organizationId: orgId || null,
          dateStr: `${sDate}:${eDate}`,
        });

        if (!claim.claimed) {
          summary.skipped++;
          continue;
        }

        const preCheck = await reportDeliveryRepository.checkOwnership(claim.delivery.id, claim.claimToken);
        if (!preCheck.hasOwnership) {
          console.warn(
            `[WeeklyTrackingReport] Manager claim ownership lost before email submission for ${managerEventKey}: ${preCheck.reason}`,
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

          const html = weeklyTeamTrackingReportTemplate({
            manager,
            reports: reportRows,
            startDate: sDate,
            endDate: eDate,
          });

          const providerRes = await sendEmail(
            manager.email,
            `Weekly Team Tracking Report - ${sDate} - ${eDate}`,
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
              `[WeeklyTrackingReport] Manager delivery ${claim.delivery.id} lost ownership before database acknowledgment.`,
            );
            continue;
          }

          await notificationRepository.create({
            recipient: managerId,
            organization: orgId || null,
            type: "WEEKLY_TEAM_TRACKING_REPORT",
            title: `Weekly Team Tracking Report - ${sDate} - ${eDate}`,
            message: `Weekly team tracking report delivered for ${sDate} to ${eDate}`,
            entityType: "tracking",
            metadata: {
              eventKey: managerEventKey,
              startDate: sDate,
              endDate: eDate,
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
            reportPeriod: `${sDate}_${eDate}`,
            category: errorCategory,
            error: managerErr,
            attempt: claim.delivery?.attempts || 1,
          });
          console.error("[WeeklyTrackingReport] Manager delivery failed:", diagnostic);
          summary.failed++;
        }
      } catch (outerManagerErr) {
        console.error(`[WeeklyTrackingReport] Error processing manager ${managerId}:`, outerManagerErr);
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

        const { startDate: sDate, endDate: eDate, orgId } = reports[0];
        const ownerEventKey = `weekly-org-tracking:${ownerId}:${sDate}:${eDate}`;
        const ownerIdempotencyKey = deriveReportIdempotencyKey(ownerEventKey);

        const claim = await reportDeliveryRepository.claimDelivery({
          eventKey: ownerEventKey,
          reportType: "WEEKLY_ORG_TRACKING",
          recipientId: ownerId,
          recipientEmail: owner.email,
          recipientRole: "owner",
          organizationId: orgId || null,
          dateStr: `${sDate}:${eDate}`,
        });

        if (!claim.claimed) {
          summary.skipped++;
          continue;
        }

        const preCheck = await reportDeliveryRepository.checkOwnership(claim.delivery.id, claim.claimToken);
        if (!preCheck.hasOwnership) {
          console.warn(
            `[WeeklyTrackingReport] Owner claim ownership lost before email submission for ${ownerEventKey}: ${preCheck.reason}`,
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

          const html = weeklyOrganizationTrackingReportTemplate({
            owner,
            reports: reportRows,
            startDate: sDate,
            endDate: eDate,
          });

          const providerRes = await sendEmail(
            owner.email,
            `Weekly Organization Tracking Report - ${sDate} - ${eDate}`,
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
              `[WeeklyTrackingReport] Owner delivery ${claim.delivery.id} lost ownership before database acknowledgment.`,
            );
            continue;
          }

          await notificationRepository.create({
            recipient: ownerId,
            organization: orgId || null,
            type: "WEEKLY_ORG_TRACKING_REPORT",
            title: `Weekly Organization Tracking Report - ${sDate} - ${eDate}`,
            message: `Weekly organization tracking report delivered for ${sDate} to ${eDate}`,
            entityType: "tracking",
            metadata: {
              eventKey: ownerEventKey,
              startDate: sDate,
              endDate: eDate,
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
            reportPeriod: `${sDate}_${eDate}`,
            category: errorCategory,
            error: ownerErr,
            attempt: claim.delivery?.attempts || 1,
          });
          console.error("[WeeklyTrackingReport] Owner delivery failed:", diagnostic);
          summary.failed++;
        }
      } catch (outerOwnerErr) {
        console.error(`[WeeklyTrackingReport] Error processing owner ${ownerId}:`, outerOwnerErr);
        summary.failed++;
      }
    }
  } catch (err) {
    console.error("Weekly Tracking Report Global Error:", err);
  }

  return summary;
};

export default {
  sendWeeklyTrackingReports,
};
