import cron from "node-cron";
import {
  integrationRepository,
  organizationRepository,
  userRepository,
} from "../db/repositories/index.js";
import { notifyWeeklySummary } from "./notification.service.js";
import {
  resolveUserTimezone,
  getTodayInTimezone,
  getZonedDayRange,
  isValidTimezone,
  normalizeTimezone,
  DEFAULT_TIMEZONE,
} from "../utils/timezone.js";

export const startWeeklySummaryScheduler = () => {
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

          const now = new Date();
          const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            weekday: "short",
            hour: "numeric",
            hour12: false,
          });

          const parts = formatter.formatToParts(now);
          const weekday = parts.find((p) => p.type === "weekday")?.value;
          const hour = parseInt(
            parts.find((p) => p.type === "hour")?.value || "0",
            10,
          );

          // Monday 8:00 PM or later
          if (weekday !== "Mon" || hour < 20) {
            continue;
          }

          // Idempotency: Prevent duplicate weekly summary for current Monday cycle
          const todayStr = getTodayInTimezone(timezone);
          const { start: mondayStart } = getZonedDayRange(todayStr, timezone);

          if (
            integration.lastWeeklySummarySent &&
            new Date(integration.lastWeeklySummarySent) >= mondayStart
          ) {
            continue;
          }

          await notifyWeeklySummary(orgId);

          await integrationRepository.findByIdAndUpdate(integration.id, {
            lastWeeklySummarySent: new Date(),
          });
        } catch (err) {
          console.error(
            `Failed to evaluate weekly summary for integration ${integration.id}:`,
            err.message,
          );
        }
      }
    } catch (error) {
      console.error("Weekly summary scheduler error:", error);
    }
  });
};
