/**
 * WorkComposer - Team Attendance Status Computation Engine
 *
 * Implements deterministic attendance status evaluation for Team Home.
 * Shared between TeamAttendanceOverview (summary counts) and TeamMembersTable (individual rows)
 * to guarantee 100% mathematical and status parity.
 *
 * Business Rules:
 * 1. An employee is "Present" if they have positive work seconds, a punch time, or are currently tracking.
 * 2. If present on a scheduled working day with an enabled shift:
 *    - If first punch-in > shift startTime -> "Late"
 *    - Else -> "On Time" (Present)
 * 3. If NOT present:
 *    - If today is a non-working schedule day -> "Day Off"
 *    - If today is a working day:
 *      - If current clock time < shift startTime -> "Shift Not Started" (Upcoming)
 *      - If current clock time >= shift startTime -> "Absent"
 *
 * Known Architectural Scope & Invariants:
 * - No configurable grace-period model.
 * - No Leave model or Holiday schema in backend.
 * - No backend operational status engine exists (backend stores only raw sessions and timestamps).
 */

export type EmployeeAttendanceStatus =
  | "on_time"
  | "late"
  | "absent"
  | "upcoming"
  | "day_off";

export interface ShiftScheduleConfig {
  isShiftEnabled: boolean;
  isWorkingDay: boolean;
  shiftStart: string;
  shiftStartMinutes: number;
  currentClockTime: string;
  currentMinutes: number;
}

export interface EmployeeAttendanceRecord {
  workSeconds?: number;
  startTime?: string | null;
  finishTime?: string | null;
  isTracking?: boolean;
}

/**
 * Parses clock string (e.g. "09:15 AM", "14:30", "9:00pm") into minutes from midnight.
 */
export function parseClockToMinutes(clockStr?: string | null): number | null {
  if (!clockStr || typeof clockStr !== "string") return null;
  const match = clockStr.match(/(\d+):(\d+)(?:\s*(AM|PM))?/i);
  if (!match || !match[1] || !match[2]) return null;

  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3]?.toUpperCase();

  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;

  return h * 60 + m;
}

/**
 * Resolves the effective shift configuration for today in the given timezone.
 */
export function resolveTodayShiftConfig(
  effectiveSettings: any,
  timezone: string
): ShiftScheduleConfig {
  const shift = effectiveSettings?.shift;
  const isShiftEnabled = shift?.enabled !== false;
  const rawSchedule = shift?.schedule;

  const scheduleList: any[] = Array.isArray(rawSchedule)
    ? rawSchedule
    : typeof rawSchedule === "object" && rawSchedule !== null
    ? Object.entries(rawSchedule).map(([dayKey, dayVal]: [string, any]) => ({
        day: dayKey,
        ...(typeof dayVal === "object" ? dayVal : {}),
      }))
    : [];

  const dayOfWeek = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: timezone,
  }).format(new Date());

  const todaySchedule = scheduleList.find(
    (s: any) => s.day?.toLowerCase() === dayOfWeek.toLowerCase()
  );

  const isWorkingDay = todaySchedule
    ? todaySchedule.enabled !== false
    : dayOfWeek !== "Saturday" && dayOfWeek !== "Sunday";

  const shiftStart = todaySchedule?.startTime || "09:00";

  const currentClockTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());

  const shiftStartMinutes = parseClockToMinutes(shiftStart) ?? 540;
  const currentMinutes = parseClockToMinutes(currentClockTime) ?? 720;

  return {
    isShiftEnabled,
    isWorkingDay,
    shiftStart,
    shiftStartMinutes,
    currentClockTime,
    currentMinutes,
  };
}

/**
 * Computes individual employee attendance status based on shift baseline.
 */
export function computeEmployeeAttendanceStatus(
  emp: EmployeeAttendanceRecord,
  config: ShiftScheduleConfig
): EmployeeAttendanceStatus {
  const work = Number(emp.workSeconds) || 0;
  const hasPunched = work > 0 || Boolean(emp.startTime) || Boolean(emp.isTracking);

  if (hasPunched) {
    if (config.isShiftEnabled && config.isWorkingDay && emp.startTime) {
      const punchMinutes = parseClockToMinutes(emp.startTime);
      if (punchMinutes !== null && punchMinutes > config.shiftStartMinutes) {
        return "late";
      }
      return "on_time";
    }
    return "on_time";
  }

  if (!config.isWorkingDay) {
    return "day_off";
  }

  if (config.currentMinutes < config.shiftStartMinutes) {
    return "upcoming";
  }

  return "absent";
}

export interface AttendanceStatusBadgeMeta {
  label: string;
  badgeClasses: string;
  dotClasses: string;
}

/**
 * Returns accessible label and THEME-107D compliant styling tokens for an attendance status.
 */
export function getAttendanceStatusBadgeMeta(
  status: EmployeeAttendanceStatus
): AttendanceStatusBadgeMeta {
  switch (status) {
    case "on_time":
      return {
        label: "On Time",
        badgeClasses:
          "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/70",
        dotClasses: "bg-emerald-500",
      };
    case "late":
      return {
        label: "Late",
        badgeClasses:
          "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/70",
        dotClasses: "bg-amber-500",
      };
    case "absent":
      return {
        label: "Absent",
        badgeClasses:
          "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/70",
        dotClasses: "bg-rose-500",
      };
    case "upcoming":
      return {
        label: "Shift Not Started",
        badgeClasses:
          "bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-800/70",
        dotClasses: "bg-sky-500",
      };
    case "day_off":
      return {
        label: "Day Off",
        badgeClasses:
          "bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700/70",
        dotClasses: "bg-slate-400",
      };
  }
}

