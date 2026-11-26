import cron from "node-cron";
import {
  integrationRepository,
  organizationRepository,
  userRepository,
} from "../db/repositories/index.js";
import { notifyDailySummary } from "./notification.service.js";
import {
  resolveUserTimezone,
  getTodayInTimezone,
  getDateInTimezone,
  isValidTimezone,
  normalizeTimezone,
  DEFAULT_TIMEZONE,
} from "../utils/timezone.js";

export const startDailySummaryScheduler = () => {
  cron.schedule("*/15 * * * *", async () => {
    try {
      const integrations = await integrationRepository.find({
        provider: "slack",
        connected: true,
      });

      for (const integration of integrations) {
        try {
          const orgId = integration.organization || integration.organizationId;
          if (!orgId) continue;

          const organization = await organizationRepository.findById(orgId);
          if (!organization) continue;

          const owner = await userRepository.findOne({
            organization: orgId,
            role: "owner",
          });

          const timezone = owner
            ? resolveUserTimezone(owner)
            : (organization.timezone && isValidTimezone(organization.timezone)
                ? normalizeTimezone(organization.timezone)
                : DEFAULT_TIMEZONE);

          const today = getTodayInTimezone(timezone);

          if (integration.lastDailySummarySent) {
            const lastSentDate = getDateInTimezone(
              integration.lastDailySummarySent,
              timezone,
            );
            if (lastSentDate === today) {
              continue;
            }
          }

          const localHour = parseInt(
            new Intl.DateTimeFormat("en-US", {
              timeZone: timezone,
              hour: "numeric",
              hour12: false,
            }).format(new Date()),
            10,
          );

          if (localHour >= 20) {
            await notifyDailySummary(orgId);

            await integrationRepository.findByIdAndUpdate(integration.id, {
              lastDailySummarySent: new Date(),
            });
          }
        } catch (err) {
          console.error(
            `Failed to evaluate daily summary for integration ${integration.id}:`,
            err.message,
          );
        }
      }
    } catch (err) {
      console.error("[Scheduler] Daily Summary scheduler failed:", err);
    }
  });
};
