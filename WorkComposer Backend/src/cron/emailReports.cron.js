import cron from "node-cron";
import {
  organizationRepository,
  userRepository,
} from "../db/repositories/index.js";
import {
  checkDailyWarning,
  checkWeeklyWarning,
} from "../services/emailReport.service.js";
import { sendDailyTrackingReports } from "../services/trackingReport.service.js";
import { sendWeeklyTrackingReports } from "../services/weeklyTrackingReport.service.js";
import {
  isValidTimezone,
  normalizeTimezone,
  getTodayInTimezone,
  DEFAULT_TIMEZONE,
} from "../utils/timezone.js";

export const DEFAULT_CATCHUP_HORIZON_DAYS = 2; // Bounded 48-hour recovery horizon
export const DEFAULT_CATCHUP_HORIZON_WEEKS = 1; // Bounded 1-week recovery horizon

/**
 * Derives candidate calendar dates for daily reports in the organization's timezone.
 *
 * Candidate dates include:
 * 1. Today's date: ONLY if localHour >= 23 (day-close closing window).
 * 2. Closed past dates within the catch-up horizon (e.g. yesterday, 2 days ago).
 *
 * Future dates are strictly excluded.
 *
 * @param {string} orgTimezone - Validated IANA timezone
 * @param {Date} [evalNow] - Evaluation instant
 * @param {number} [horizonDays=2] - Catch-up horizon in days (clamped 1..7)
 * @returns {Array<{ dateStr: string, isTodayClose: boolean, isCatchUp: boolean }>}
 */
export function getCandidateDailyDates(
  orgTimezone,
  evalNow = new Date(),
  horizonDays = DEFAULT_CATCHUP_HORIZON_DAYS,
) {
  const envHorizon = parseInt(process.env.REPORT_CATCHUP_HORIZON_DAYS || "", 10);
  const activeHorizon = !isNaN(envHorizon) ? envHorizon : horizonDays;
  const clampedHorizon = Math.max(1, Math.min(activeHorizon, 7));

  const todayStr = getTodayInTimezone(orgTimezone, evalNow);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: orgTimezone,
    hour: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(evalNow);
  const localHour = parseInt(
    parts.find((p) => p.type === "hour")?.value || "0",
    10,
  );

  const candidates = [];

  // 1. If currently at or past 23:00, today's close window is active
  if (localHour >= 23) {
    candidates.push({ dateStr: todayStr, isTodayClose: true, isCatchUp: false });
  }

  // 2. Closed past days within catch-up horizon
  const [year, month, day] = todayStr.split("-").map(Number);
  for (let offset = 1; offset <= clampedHorizon; offset++) {
    const pastUtc = new Date(Date.UTC(year, month - 1, day - offset));
    const pastDateStr = pastUtc.toISOString().split("T")[0];
    candidates.push({ dateStr: pastDateStr, isTodayClose: false, isCatchUp: true });
  }

  return candidates;
}

/**
 * Derives candidate weekly report periods in the organization's timezone.
 *
 * Weekly reports cover Monday 00:00 through Sunday 23:59:59.
 *
 * Candidate weeks include:
 * 1. Current week closing: If localWeekday === "Sunday" AND localHour >= 23.
 * 2. Prior closed week: If current day is Monday, Tuesday, or Wednesday (within catch-up horizon).
 *
 * @param {string} orgTimezone - Validated IANA timezone
 * @param {Date} [evalNow] - Evaluation instant
 * @param {number} [horizonWeeks=1] - Catch-up horizon in weeks (clamped 1..2)
 * @returns {Array<{ startDate: string, endDate: string, isCatchUp: boolean }>}
 */
export function getCandidateWeeklyPeriods(
  orgTimezone,
  evalNow = new Date(),
  horizonWeeks = DEFAULT_CATCHUP_HORIZON_WEEKS,
) {
  const envWeeks = parseInt(process.env.WEEKLY_CATCHUP_WEEKS || "", 10);
  const activeHorizon = !isNaN(envWeeks) ? envWeeks : horizonWeeks;
  const clampedHorizon = Math.max(1, Math.min(activeHorizon, 2));

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: orgTimezone,
    weekday: "long",
    hour: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(evalNow);
  const localWeekday = parts.find((p) => p.type === "weekday")?.value;
  const localHour = parseInt(
    parts.find((p) => p.type === "hour")?.value || "0",
    10,
  );

  const todayStr = getTodayInTimezone(orgTimezone, evalNow);
  const [year, month, day] = todayStr.split("-").map(Number);
  const calendarUtc = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = calendarUtc.getUTCDay(); // 0 for Sunday
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const currentMondayUtc = new Date(calendarUtc);
  currentMondayUtc.setUTCDate(calendarUtc.getUTCDate() + diffToMonday);
  const currentSundayUtc = new Date(currentMondayUtc);
  currentSundayUtc.setUTCDate(currentMondayUtc.getUTCDate() + 6);

  const candidates = [];

  // 1. Current week closing on Sunday at or after 23:00
  if (localWeekday === "Sunday" && localHour >= 23) {
    candidates.push({
      startDate: currentMondayUtc.toISOString().split("T")[0],
      endDate: currentSundayUtc.toISOString().split("T")[0],
      isCatchUp: false,
    });
  }

  // 2. Prior closed week catch-up on Monday through Wednesday
  if (["Monday", "Tuesday", "Wednesday"].includes(localWeekday)) {
    for (let w = 1; w <= clampedHorizon; w++) {
      const priorMondayUtc = new Date(currentMondayUtc);
      priorMondayUtc.setUTCDate(currentMondayUtc.getUTCDate() - 7 * w);
      const priorSundayUtc = new Date(priorMondayUtc);
      priorSundayUtc.setUTCDate(priorMondayUtc.getUTCDate() + 6);

      candidates.push({
        startDate: priorMondayUtc.toISOString().split("T")[0],
        endDate: priorSundayUtc.toISOString().split("T")[0],
        isCatchUp: true,
      });
    }
  }

  return candidates;
}

/**
 * Evaluates and executes daily and weekly email reports for a given organization
 * based on its local wall-clock time in its configured IANA timezone and bounded
 * catch-up policy.
 *
 * @param {Object} org - Organization document
 * @param {Date} [evalNow] - Evaluation instant (defaults to current Date)
 * @returns {Promise<{ dailyEvaluated: number, weeklyEvaluated: number, dailyRan: boolean, weeklyRan: boolean }>}
 */
export const processOrganizationEmailReports = async (org, evalNow = new Date()) => {
  const result = {
    dailyEvaluated: 0,
    weeklyEvaluated: 0,
    dailyRan: false,
    weeklyRan: false,
  };
  const orgId = String(org._id || org.id);
  const orgTimezone =
    org.timezone && isValidTimezone(org.timezone)
      ? normalizeTimezone(org.timezone)
      : DEFAULT_TIMEZONE;

  const orgUsers = await userRepository.find({ organization: orgId });

  // 1. Daily Reports: Evaluate today-close (if >= 23:00) and closed past days within catch-up horizon
  const dailyCandidates = getCandidateDailyDates(orgTimezone, evalNow);
  for (const candidate of dailyCandidates) {
    result.dailyEvaluated++;

    // Only run daily warning check on today's active closing window
    if (candidate.isTodayClose) {
      result.dailyRan = true;
      for (const user of orgUsers) {
        const userId = user._id || user.id;
        try {
          await checkDailyWarning(userId);
        } catch (warnErr) {
          console.error(`[EmailReportsCron] Daily warning error for ${userId}:`, warnErr);
        }
      }
    }

    if (candidate.isCatchUp) {
      console.log(
        `[EmailReportsCatchUp] Evaluating catch-up daily report for org ${orgId} on ${candidate.dateStr}`,
      );
    }

    await sendDailyTrackingReports(candidate.dateStr, orgId);
  }

  // 2. Weekly Reports: Evaluate Sunday close (if >= 23:00) and missed prior week (Mon-Wed catch-up)
  const weeklyCandidates = getCandidateWeeklyPeriods(orgTimezone, evalNow);
  for (const candidate of weeklyCandidates) {
    result.weeklyEvaluated++;

    if (!candidate.isCatchUp) {
      result.weeklyRan = true;
      for (const user of orgUsers) {
        const userId = user._id || user.id;
        try {
          await checkWeeklyWarning(userId);
        } catch (warnErr) {
          console.error(`[EmailReportsCron] Weekly warning error for ${userId}:`, warnErr);
        }
      }
    } else {
      console.log(
        `[EmailReportsCatchUp] Evaluating catch-up weekly report for org ${orgId} for ${candidate.startDate} to ${candidate.endDate}`,
      );
    }

    await sendWeeklyTrackingReports(
      candidate.startDate,
      candidate.endDate,
      orgId,
    );
  }

  return result;
};

/**
 * Sweeps all organizations and evaluates timezone-aware report delivery.
 * Scheduled to run every 15 minutes.
 *
 * @param {Date} [evalNow]
 */
export const runEmailReportSweep = async (evalNow = new Date()) => {
  try {
    const organizations = await organizationRepository.find();

    for (const org of organizations) {
      try {
        await processOrganizationEmailReports(org, evalNow);
      } catch (err) {
        console.error(
          `[EmailReportsCron] Error processing organization ${org.id || org._id}:`,
          err,
        );
      }
    }
  } catch (err) {
    console.error("[EmailReportsCron] Error during organization sweep:", err);
  }
};

/**
 * Explicit startup recovery sweep to recover any missed periods after downtime.
 *
 * @param {Date} [evalNow]
 */
export const runEmailReportStartupRecovery = async (evalNow = new Date()) => {
  console.log("[EmailReportsCron] Running startup missed-report recovery check...");
  await runEmailReportSweep(evalNow);
};

// Periodic sweep every 15 minutes
export const startEmailReportsCron = () => {
  return cron.schedule("*/15 * * * *", async () => {
    await runEmailReportSweep();
  });
};

const isTestEnv =
  process.env.NODE_ENV === "test" ||
  process.env.NODE_ENV === "testing" ||
  Boolean(process.env.NODE_TEST_CONTEXT) ||
  Boolean(process.argv.find((arg) => typeof arg === "string" && arg.includes("test")));

if (!isTestEnv && process.env.DISABLE_CRON !== "true") {
  runEmailReportStartupRecovery().catch((err) =>
    console.error("[EmailReportsCron] Startup recovery error:", err),
  );
  startEmailReportsCron();
}

export default {
  processOrganizationEmailReports,
  runEmailReportSweep,
  runEmailReportStartupRecovery,
  startEmailReportsCron,
  getCandidateDailyDates,
  getCandidateWeeklyPeriods,
};
