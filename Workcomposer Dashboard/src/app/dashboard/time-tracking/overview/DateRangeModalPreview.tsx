"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Check,
  Globe,
} from 'lucide-react';
import { useAppTimezone } from "@/hooks/useAppTimezone";
import useDesktopNavigation from "@/hooks/useDesktopNavigation";
import {
  createDateInTimezone,
  getDatePartsInTimezone,
} from "@/utils/appTimezone";

export type ReportRangeValue = {
  type: string;
  startDate: Date;
  endDate: Date;
};

const MONTHS_LIST = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  days: number
) {
  const utcDate = new Date(Date.UTC(year, month, day));
  utcDate.setUTCDate(utcDate.getUTCDate() + days);

  return {
    year: utcDate.getUTCFullYear(),
    month: utcDate.getUTCMonth(),
    day: utcDate.getUTCDate(),
  };
}

function formatCalendarDate(
  year: number,
  month: number,
  day: number
) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(
    day
  ).padStart(2, "0")}`;
}

function formatDisplayDate(date: Date, timezone: string) {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: timezone,
  });
}

function toSafeDate(value?: Date | string | null, fallback?: Date): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return fallback || new Date();
}

export function resolveCalendarRangeState(
  reportRange: ReportRangeValue | undefined,
  timezone: string,
  initialDate?: Date,
  preferredQuickSelect?: string,
  preferredGroupBy?: string
) {
  const now = new Date();
  const todayParts = getDatePartsInTimezone(now, timezone);
  const todayDate = createDateInTimezone(
    todayParts.year,
    todayParts.month,
    todayParts.day,
    timezone
  );
  const todayKey = formatCalendarDate(
    todayParts.year,
    todayParts.month,
    todayParts.day
  );

  const fallbackDate = toSafeDate(initialDate, todayDate);
  const startDate = toSafeDate(reportRange?.startDate, fallbackDate);
  const endDate = toSafeDate(reportRange?.endDate, startDate);

  const startParts = getDatePartsInTimezone(startDate, timezone);
  const endParts = getDatePartsInTimezone(endDate, timezone);
  const startKey = formatCalendarDate(
    startParts.year,
    startParts.month,
    startParts.day
  );
  const endKey = formatCalendarDate(
    endParts.year,
    endParts.month,
    endParts.day
  );

  const yesterdayParts = addCalendarDays(
    todayParts.year,
    todayParts.month,
    todayParts.day,
    -1
  );
  const yesterdayKey = formatCalendarDate(
    yesterdayParts.year,
    yesterdayParts.month,
    yesterdayParts.day
  );

  const todayUtc = new Date(
    Date.UTC(todayParts.year, todayParts.month, todayParts.day)
  );
  const dayOfWeek = todayUtc.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const thisWeekMonParts = addCalendarDays(
    todayParts.year,
    todayParts.month,
    todayParts.day,
    mondayOffset
  );
  const thisWeekMonKey = formatCalendarDate(
    thisWeekMonParts.year,
    thisWeekMonParts.month,
    thisWeekMonParts.day
  );

  const lastWeekMonParts = addCalendarDays(
    todayParts.year,
    todayParts.month,
    todayParts.day,
    mondayOffset - 7
  );
  const lastWeekSunParts = addCalendarDays(
    lastWeekMonParts.year,
    lastWeekMonParts.month,
    lastWeekMonParts.day,
    6
  );
  const lastWeekMonKey = formatCalendarDate(
    lastWeekMonParts.year,
    lastWeekMonParts.month,
    lastWeekMonParts.day
  );
  const lastWeekSunKey = formatCalendarDate(
    lastWeekSunParts.year,
    lastWeekSunParts.month,
    lastWeekSunParts.day
  );

  const thisMonthDays = new Date(
    Date.UTC(todayParts.year, todayParts.month + 1, 0)
  ).getUTCDate();
  const thisMonthStartKey = formatCalendarDate(
    todayParts.year,
    todayParts.month,
    1
  );
  const thisMonthEndKey = formatCalendarDate(
    todayParts.year,
    todayParts.month,
    thisMonthDays
  );

  const lastMonthEndParts = addCalendarDays(
    todayParts.year,
    todayParts.month,
    1,
    -1
  );
  const lastMonthStartKey = formatCalendarDate(
    lastMonthEndParts.year,
    lastMonthEndParts.month,
    1
  );
  const lastMonthEndKey = formatCalendarDate(
    lastMonthEndParts.year,
    lastMonthEndParts.month,
    lastMonthEndParts.day
  );

  const last7Parts = addCalendarDays(
    todayParts.year,
    todayParts.month,
    todayParts.day,
    -6
  );
  const last14Parts = addCalendarDays(
    todayParts.year,
    todayParts.month,
    todayParts.day,
    -13
  );
  const last30Parts = addCalendarDays(
    todayParts.year,
    todayParts.month,
    todayParts.day,
    -29
  );
  const last7Key = formatCalendarDate(
    last7Parts.year,
    last7Parts.month,
    last7Parts.day
  );
  const last14Key = formatCalendarDate(
    last14Parts.year,
    last14Parts.month,
    last14Parts.day
  );
  const last30Key = formatCalendarDate(
    last30Parts.year,
    last30Parts.month,
    last30Parts.day
  );

  const rawType = reportRange?.type || "Day";
  let dateRangeType = "Day";
  let quickSelect = "";
  let label = rawType;
  let groupBy = "Days";

  if (
    startKey === lastMonthStartKey &&
    endKey === lastMonthEndKey &&
    rawType !== "Custom"
  ) {
    dateRangeType = "Month";
    quickSelect = "Last month";
    label = "Last month";
    groupBy = "Months";
  } else if (
    startKey === thisMonthStartKey &&
    endKey === thisMonthEndKey &&
    rawType === "Month"
  ) {
    dateRangeType = "Month";
    quickSelect = "This month";
    label = "This month";
    groupBy = "Months";
  } else if (
    rawType === "Month" ||
    (rawType !== "Custom" &&
      rawType !== "Year" &&
      startParts.year === endParts.year &&
      startParts.month === endParts.month &&
      startParts.day === 1 &&
      endParts.day ===
      new Date(Date.UTC(startParts.year, startParts.month + 1, 0)).getUTCDate() &&
      startKey !== endKey)
  ) {
    dateRangeType = "Month";
    quickSelect = "Month";
    label = "Month";
    groupBy = "Months";
  } else if (
    rawType === "Year" ||
    (rawType !== "Custom" &&
      startParts.year === endParts.year &&
      startParts.month === 0 &&
      startParts.day === 1 &&
      endParts.month === 11 &&
      endParts.day === 31)
  ) {
    dateRangeType = "Year";
    quickSelect = "Year";
    label = "Year";
    groupBy = "Months";
  } else if (startKey === lastWeekMonKey && endKey === lastWeekSunKey) {
    dateRangeType = "Week";
    quickSelect = "Last week (Mon - Sun)";
    label = "Last week";
    groupBy = "Days";
  } else if (
    startKey === thisWeekMonKey &&
    endKey === todayKey &&
    (rawType === "Week" || startKey !== endKey)
  ) {
    dateRangeType = "Week";
    quickSelect = "This week (Mon - Today)";
    label = "This week";
    groupBy = "Days";
  } else if (startKey === last7Key && endKey === todayKey) {
    dateRangeType = "Custom";
    quickSelect = "Last 7 days";
    label = "Last 7 days";
    groupBy = "Days";
  } else if (startKey === last14Key && endKey === todayKey) {
    dateRangeType = "Custom";
    quickSelect = "Last 14 days";
    label = "Last 14 days";
    groupBy = "Days";
  } else if (startKey === last30Key && endKey === todayKey) {
    dateRangeType = "Custom";
    quickSelect = "Last 30 days";
    label = "Last 30 days";
    groupBy = "Days";
  } else if (rawType === "Week") {
    dateRangeType = "Week";
    quickSelect = "Week";
    label = "Week";
    groupBy = "Days";
  } else if (
    (rawType === "Day" || rawType === "Today" || startKey === endKey) &&
    rawType !== "Custom"
  ) {
    dateRangeType = "Day";
    if (startKey === todayKey) {
      quickSelect = "Today";
      label = "Today";
    } else if (startKey === yesterdayKey) {
      quickSelect = "Yesterday";
      label = "Yesterday";
    } else {
      quickSelect = "";
      label = "Day";
    }
    groupBy = "Days";
  } else {
    dateRangeType = "Custom";
    quickSelect = "Custom";
    label = rawType && rawType !== "Day" ? rawType : "Custom";
    groupBy = "Days";
  }

  if (
    preferredQuickSelect &&
    preferredQuickSelect === quickSelect
  ) {
    quickSelect = preferredQuickSelect;
  }
  if (
    preferredGroupBy &&
    ["Days", "Weeks", "Months"].includes(preferredGroupBy)
  ) {
    groupBy = preferredGroupBy;
  }

  let rangeText = formatDisplayDate(startDate, timezone);
  if (dateRangeType === "Month") {
    rangeText = `${MONTHS_LIST[startParts.month]} ${startParts.year}`;
  } else if (dateRangeType === "Year") {
    rangeText = `${startParts.year}`;
  } else if (dateRangeType === "Week" || dateRangeType === "Custom") {
    rangeText =
      startKey === endKey
        ? formatDisplayDate(startDate, timezone)
        : `${formatDisplayDate(startDate, timezone)} - ${formatDisplayDate(
          endDate,
          timezone
        )}`;
  }

  return {
    dateRangeType,
    quickSelect,
    label,
    rangeText,
    groupBy,
    startDate,
    endDate,
    startParts,
    endParts,
    selectedWeek: `${startKey},${endKey}`,
  };
}

interface DateRangeModalPreviewProps {
  onClose?: () => void;
  onApply?: (
    date: Date,
    label: string,
    rangeText: string,
    range: ReportRangeValue,
    meta?: {
      quickSelect: string;
      groupBy: string;
    }
  ) => void;
  initialDate?: Date;
  reportRange?: ReportRangeValue;
  initialQuickSelect?: string;
  initialGroupBy?: string;
}

export default function DateRangeModalPreview({
  onClose,
  onApply,
  initialDate,
  reportRange,
  initialQuickSelect,
  initialGroupBy,
}: DateRangeModalPreviewProps) {

  const timezone = useAppTimezone();
  const { isDesktop, navigateToSetting } = useDesktopNavigation();

  const getTimezoneDateParts = (date: Date = new Date()) => {
    return getDatePartsInTimezone(date, timezone);
  };

  const getTimezoneDate = (
    year: number,
    month: number,
    day: number
  ) => {
    return createDateInTimezone(
      year,
      month,
      day,
      timezone
    );
  };

  const hydrated = useMemo(
    () =>
      resolveCalendarRangeState(
        reportRange,
        timezone,
        initialDate,
        initialQuickSelect,
        initialGroupBy
      ),
    [reportRange, timezone, initialDate, initialQuickSelect, initialGroupBy]
  );

  // Active quick select state
  const [selectedQuickSelect, setSelectedQuickSelect] = useState(
    hydrated.quickSelect
  );

  // Active date range type state
  const [selectedDateRangeType, setSelectedDateRangeType] = useState(
    hydrated.dateRangeType
  );

  // Selected week state
  const getCurrentWeek = () => {
    const todayParts = getTimezoneDateParts(hydrated.startDate);
    const todayUtc = new Date(
      Date.UTC(todayParts.year, todayParts.month, todayParts.day)
    );
    const dayOfWeek = todayUtc.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const mondayParts = addCalendarDays(
      todayParts.year,
      todayParts.month,
      todayParts.day,
      mondayOffset
    );
    const sundayParts = addCalendarDays(
      mondayParts.year,
      mondayParts.month,
      mondayParts.day,
      6
    );

    return `${formatCalendarDate(
      mondayParts.year,
      mondayParts.month,
      mondayParts.day
    )},${formatCalendarDate(
      sundayParts.year,
      sundayParts.month,
      sundayParts.day
    )}`;
  };

  const [selectedWeek, setSelectedWeek] = useState(
    hydrated.dateRangeType === "Week"
      ? hydrated.selectedWeek
      : getCurrentWeek()
  );

  // Generate weeks list dynamically for Week selector view (in org timezone)
  const generateWeeks = () => {
    const weeks = [];

    const todayParts = getTimezoneDateParts(new Date());
    const todayUtc = new Date(
      Date.UTC(todayParts.year, todayParts.month, todayParts.day)
    );
    const offsetToSunday = (7 - todayUtc.getUTCDay()) % 7;
    const currentSundayParts = addCalendarDays(
      todayParts.year,
      todayParts.month,
      todayParts.day,
      offsetToSunday
    );

    for (let i = 0; i < 40; i++) {
      const endParts = addCalendarDays(
        currentSundayParts.year,
        currentSundayParts.month,
        currentSundayParts.day,
        -i * 7
      );
      const startParts = addCalendarDays(
        endParts.year,
        endParts.month,
        endParts.day,
        -6
      );

      const startShort = (MONTHS_LIST[startParts.month] ?? "").slice(0, 3);
      const endShort = (MONTHS_LIST[endParts.month] ?? "").slice(0, 3);
      const label =
        `${String(startParts.day).padStart(2, "0")} ${startShort}` +
        ` - ` +
        `${String(endParts.day).padStart(2, "0")} ${endShort} ${endParts.year}`;

      const value = `${formatCalendarDate(
        startParts.year,
        startParts.month,
        startParts.day
      )},${formatCalendarDate(
        endParts.year,
        endParts.month,
        endParts.day
      )}`;

      weeks.push({
        label,
        value,
      });
    }

    return weeks;
  };

  // Active group by state
  const [selectedGroupBy, setSelectedGroupBy] = useState(hydrated.groupBy);

  // Selected start and end dates
  const [startDate, setStartDate] = useState<Date>(hydrated.startDate);
  const [endDate, setEndDate] = useState<Date>(hydrated.endDate);

  // Calendar states for Start & End calendars in Custom mode
  const [startCalMonth, setStartCalMonth] = useState(hydrated.startParts.month);
  const [startCalYear, setStartCalYear] = useState(hydrated.startParts.year);

  const [endCalMonth, setEndCalMonth] = useState(hydrated.endParts.month);
  const [endCalYear, setEndCalYear] = useState(hydrated.endParts.year);

  // Calendar state (current year and month)
  const [currentYear, setCurrentYear] = useState(hydrated.startParts.year);
  const [currentMonth, setCurrentMonth] = useState(hydrated.startParts.month);

  // Selected date state
  const [selectedDate, setSelectedDate] = useState<Date>(hydrated.startDate);

  const committedRangeKey = `${hydrated.dateRangeType}|${hydrated.selectedWeek}|${hydrated.quickSelect}|${hydrated.groupBy}|${timezone}`;
  const lastCommittedKeyRef = useRef(committedRangeKey);

  useEffect(() => {
    if (lastCommittedKeyRef.current === committedRangeKey) {
      return;
    }
    lastCommittedKeyRef.current = committedRangeKey;
    setSelectedQuickSelect(hydrated.quickSelect);
    setSelectedDateRangeType(hydrated.dateRangeType);
    setSelectedGroupBy(hydrated.groupBy);
    setStartDate(hydrated.startDate);
    setEndDate(hydrated.endDate);
    setStartCalMonth(hydrated.startParts.month);
    setStartCalYear(hydrated.startParts.year);
    setEndCalMonth(hydrated.endParts.month);
    setEndCalYear(hydrated.endParts.year);
    setCurrentYear(hydrated.startParts.year);
    setCurrentMonth(hydrated.startParts.month);
    setSelectedDate(hydrated.startDate);
    if (hydrated.dateRangeType === "Week") {
      setSelectedWeek(hydrated.selectedWeek);
    }
  }, [committedRangeKey, hydrated]);

  const quickSelectItems = [
    'Today',
    'Yesterday',
    'This week (Mon - Today)',
    'Last 7 days',
    'Last week (Mon - Sun)',
    'Last 14 days',
    'This month',
    'Last 30 days',
    'Last month',
  ];

  const monthsList = MONTHS_LIST;

  // Helper to handle Quick Select clicks
  const handleQuickSelect = (item: string) => {
    setSelectedQuickSelect(item);

    const todayParts = getTimezoneDateParts();

    const today = getTimezoneDate(
      todayParts.year,
      todayParts.month,
      todayParts.day
    );

    if (item === "Today") {
      setSelectedDateRangeType("Day");

      setSelectedDate(today);

      setCurrentMonth(todayParts.month);
      setCurrentYear(todayParts.year);

    } else if (item === "Yesterday") {
      const yesterdayParts = addCalendarDays(
        todayParts.year,
        todayParts.month,
        todayParts.day,
        -1
      );

      const yesterday = getTimezoneDate(
        yesterdayParts.year,
        yesterdayParts.month,
        yesterdayParts.day
      );

      setSelectedDateRangeType("Day");

      setSelectedDate(yesterday);

      setCurrentMonth(yesterdayParts.month);
      setCurrentYear(yesterdayParts.year);

    } else if (item === "This week (Mon - Today)") {
      setSelectedDateRangeType("Week");

      const todayUtc = new Date(
        Date.UTC(
          todayParts.year,
          todayParts.month,
          todayParts.day
        )
      );

      const dayOfWeek = todayUtc.getUTCDay();

      const mondayOffset =
        dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

      const mondayParts = addCalendarDays(
        todayParts.year,
        todayParts.month,
        todayParts.day,
        mondayOffset
      );

      const sundayParts = {
        year: todayParts.year,
        month: todayParts.month,
        day: todayParts.day,
      };

      setSelectedWeek(
        `${formatCalendarDate(
          mondayParts.year,
          mondayParts.month,
          mondayParts.day
        )},${formatCalendarDate(
          sundayParts.year,
          sundayParts.month,
          sundayParts.day
        )}`
      );

    } else if (item === "Last week (Mon - Sun)") {
      setSelectedDateRangeType("Week");

      const todayUtc = new Date(
        Date.UTC(
          todayParts.year,
          todayParts.month,
          todayParts.day
        )
      );

      const dayOfWeek = todayUtc.getUTCDay();

      const mondayOffset =
        dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

      const lastMondayParts = addCalendarDays(
        todayParts.year,
        todayParts.month,
        todayParts.day,
        mondayOffset - 7
      );

      const lastSundayParts = addCalendarDays(
        lastMondayParts.year,
        lastMondayParts.month,
        lastMondayParts.day,
        6
      );

      setSelectedWeek(
        `${formatCalendarDate(
          lastMondayParts.year,
          lastMondayParts.month,
          lastMondayParts.day
        )},${formatCalendarDate(
          lastSundayParts.year,
          lastSundayParts.month,
          lastSundayParts.day
        )}`
      );

    } else if (
      item === "Last 7 days" ||
      item === "Last 14 days" ||
      item === "Last 30 days"
    ) {
      setSelectedDateRangeType("Custom");

      const days =
        item === "Last 7 days"
          ? 6
          : item === "Last 14 days"
            ? 13
            : 29;

      const startParts = addCalendarDays(
        todayParts.year,
        todayParts.month,
        todayParts.day,
        -days
      );

      const start = getTimezoneDate(
        startParts.year,
        startParts.month,
        startParts.day
      );

      const end = today;

      setStartDate(start);
      setEndDate(end);

      setStartCalMonth(startParts.month);
      setStartCalYear(startParts.year);

      setEndCalMonth(todayParts.month);
      setEndCalYear(todayParts.year);

    } else if (item === "This month") {
      setSelectedDateRangeType("Month");
      setSelectedGroupBy("Months");

      setCurrentMonth(todayParts.month);
      setCurrentYear(todayParts.year);

    } else if (item === "Last month") {
      setSelectedDateRangeType("Month");
      setSelectedGroupBy("Months");

      const lastMonth = addCalendarDays(
        todayParts.year,
        todayParts.month,
        1,
        -1
      );

      setCurrentMonth(lastMonth.month);
      setCurrentYear(lastMonth.year);
    }
  };
  // Generate calendar grid for any selected month & year
  const getCalendarDaysFor = (year: number, month: number) => {
    // First day of the current month
    const firstDayOfMonth = new Date(year, month, 1);
    // Day of the week of first day (0-6, Sunday is 0)
    const startDayOfWeek = firstDayOfMonth.getDay();

    // Number of days in the current month
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Number of days in previous month
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();

    const days = [];

    // Add days from the previous month
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({
        day: daysInPrevMonth - i,
        month: prevMonth,
        year: prevYear,
        isCurrentMonth: false,
      });
    }

    // Add days of the current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        day: i,
        month: month,
        year: year,
        isCurrentMonth: true,
      });
    }

    // Add days from the next month to fill up a standard 6-row (42 days) calendar
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        day: i,
        month: nextMonth,
        year: nextYear,
        isCurrentMonth: false,
      });
    }

    return days;
  };

  // Generate calendar grid for the selected month & year
  const getCalendarDays = () => getCalendarDaysFor(currentYear, currentMonth);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  const isSameDay = (d1: Date, year: number, month: number, day: number) => {
    const parts = getTimezoneDateParts(d1);
    return parts.year === year && parts.month === month && parts.day === day;
  };

  const todayCalendarParts = getTimezoneDateParts(new Date());
  const currentTimezoneYear = todayCalendarParts.year;
  const years = Array.from(
    { length: 50 },
    (_, i) => currentTimezoneYear - i
  );

  const isTodayCell = (year: number, month: number, day: number) =>
    year === todayCalendarParts.year &&
    month === todayCalendarParts.month &&
    day === todayCalendarParts.day;

  const customStartParts = getTimezoneDateParts(startDate);
  const customEndParts = getTimezoneDateParts(endDate);
  const customStartKey = formatCalendarDate(
    customStartParts.year,
    customStartParts.month,
    customStartParts.day
  );
  const customEndKey = formatCalendarDate(
    customEndParts.year,
    customEndParts.month,
    customEndParts.day
  );
  const customMinKey =
    customStartKey <= customEndKey ? customStartKey : customEndKey;
  const customMaxKey =
    customStartKey <= customEndKey ? customEndKey : customStartKey;

  const formatPreviewDate = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: timezone,
    });

  const stagedPreviewText = (() => {
    if (selectedDateRangeType === "Week") {
      const [start, end] = selectedWeek.split(",");
      if (start && end) {
        const sParts = start.split("-").map(Number);
        const eParts = end.split("-").map(Number);
        if (
          sParts.length === 3 &&
          eParts.length === 3 &&
          !sParts.some(Number.isNaN) &&
          !eParts.some(Number.isNaN)
        ) {
          const sDate = createDateInTimezone(
            sParts[0]!,
            sParts[1]! - 1,
            sParts[2]!,
            timezone
          );
          const eDate = createDateInTimezone(
            eParts[0]!,
            eParts[1]! - 1,
            eParts[2]!,
            timezone
          );
          return `${formatPreviewDate(sDate)} – ${formatPreviewDate(eDate)}`;
        }
      }
    }
    if (selectedDateRangeType === "Month") {
      const monthStart = createDateInTimezone(currentYear, currentMonth, 1, timezone);
      const lastDay = new Date(Date.UTC(currentYear, currentMonth + 1, 0)).getUTCDate();
      const monthEnd = createDateInTimezone(currentYear, currentMonth, lastDay, timezone);
      return `${formatPreviewDate(monthStart)} – ${formatPreviewDate(monthEnd)}`;
    }
    if (selectedDateRangeType === "Year") {
      return `Jan 1, ${currentYear} – Dec 31, ${currentYear}`;
    }
    if (selectedDateRangeType === "Custom") {
      return customStartKey === customEndKey
        ? formatPreviewDate(startDate)
        : `${formatPreviewDate(startDate)} – ${formatPreviewDate(endDate)}`;
    }
    return formatPreviewDate(selectedDate);
  })();

  const customCalendars = [
    {
      title: "Start Date",
      calMonth: startCalMonth,
      setCalMonth: setStartCalMonth,
      calYear: startCalYear,
      setCalYear: setStartCalYear,
      selectedVal: startDate,
      onPick: (picked: Date) => {
        setStartDate(picked);
        setSelectedQuickSelect("Custom");
      },
    },
    {
      title: "End Date",
      calMonth: endCalMonth,
      setCalMonth: setEndCalMonth,
      calYear: endCalYear,
      setCalYear: setEndCalYear,
      selectedVal: endDate,
      onPick: (picked: Date) => {
        setEndDate(picked);
        setSelectedQuickSelect("Custom");
      },
    },
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/50 dark:bg-black/70 backdrop-blur-xs transition-all duration-300">
      <div className="bg-white dark:bg-[#0F172A] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#22324D] overflow-hidden w-full max-w-4xl max-h-[90vh] flex flex-col transition-all duration-300">

        {/* Top Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-[#0F172A] border-b border-slate-200 dark:border-[#22324D] px-6 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-indigo-200/80 dark:border-indigo-800/60 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <CalendarDays className="w-4 h-4" />
            </div>
            <div className="flex flex-wrap items-center gap-2.5 min-w-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white truncate">
                Select Date Range
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-[#22324D] bg-slate-50 dark:bg-[#1E293B] px-2.5 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                <Globe className="w-3 h-3 text-indigo-500 dark:text-indigo-400 shrink-0" />
                <span className="truncate">{timezone}</span>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1E293B] focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition duration-150 cursor-pointer shrink-0"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Columns */}
        <div className="flex flex-col lg:flex-row lg:divide-x divide-slate-200 dark:divide-[#22324D] overflow-y-auto flex-1 min-h-0">

          {/* Left Column: Quick Select */}
          <div className="w-full lg:w-[270px] shrink-0 p-5 bg-slate-50/80 dark:bg-[#0B1221] overflow-y-auto">
            <h3 className="text-[11px] font-bold mb-3 px-2 text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Quick Select
            </h3>

            <ul className="space-y-1">
              {quickSelectItems.map((item, index) => {
                const isActive = selectedQuickSelect === item;
                return (
                  <li key={index}>
                    <button
                      type="button"
                      onClick={() => handleQuickSelect(item)}
                      className={`group relative w-full flex items-center justify-between gap-2 text-left text-sm px-3 py-2 rounded-xl transition-all duration-150 font-medium cursor-pointer border ${isActive
                        ? 'bg-indigo-50/90 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200/80 dark:border-indigo-800/60 font-semibold shadow-2xs'
                        : 'border-transparent text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-[#1E293B] hover:text-slate-900 dark:hover:text-white'
                        }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`h-4 w-1 rounded-full shrink-0 transition-colors ${isActive
                            ? 'bg-indigo-600 dark:bg-indigo-400'
                            : 'bg-transparent group-hover:bg-slate-300 dark:group-hover:bg-slate-600'
                            }`}
                        />
                        <span className="truncate">{item}</span>
                      </span>
                      {isActive && (
                        <Check className="w-3.5 h-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Right Column: Calendar & Controls */}
          <div className="flex-1 min-w-0 p-6 space-y-5 bg-white dark:bg-[#0F172A] overflow-y-auto">

            {/* Date Range Type Selector */}
            <div className="space-y-2.5">
              <h3 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Date Range
              </h3>
              <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 dark:bg-[#1E293B] p-1 border border-slate-200/80 dark:border-[#22324D]">
                {['Day', 'Week', 'Month', 'Year', 'Custom'].map((item) => {
                  const isActive = selectedDateRangeType === item;
                  return (
                    <button
                      type="button"
                      key={item}
                      onClick={() => {
                        setSelectedDateRangeType(item);
                        setSelectedQuickSelect(item);

                        if (item === "Year" || item === "Month") {
                          setSelectedGroupBy("Months");
                        } else if (item === "Day" || item === "Week" || item === "Custom") {
                          setSelectedGroupBy("Days");
                        }
                      }}
                      className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150 cursor-pointer ${isActive
                        ? 'bg-white dark:bg-[#0F172A] text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200/80 dark:border-[#22324D]'
                        : 'border border-transparent text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                        }`}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Calendar Container or Week Selector or Custom Selector */}
            {selectedDateRangeType === 'Week' ? (
              <div className="bg-slate-50/80 dark:bg-[#111C33] rounded-xl p-4 border border-slate-200/80 dark:border-[#22324D]">
                <fieldset className="space-y-1.5 bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-[#22324D] rounded-xl p-3 min-h-[330px] max-h-[330px] overflow-y-auto">
                  <legend className="sr-only">Select Week</legend>
                  {generateWeeks().map((week, idx) => {
                    const isChecked = selectedWeek === week.value;
                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          setSelectedWeek(week.value)
                          setSelectedQuickSelect("Week")
                        }}
                        className={`group flex items-center gap-3 cursor-pointer rounded-lg px-3 py-2 transition-all duration-150 ${isChecked
                          ? 'bg-indigo-50/80 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                          : 'hover:bg-slate-50 dark:hover:bg-[#1E293B]'
                          }`}
                      >
                        <div className="flex h-5 shrink-0 items-center">
                          <div className="grid size-4 grid-cols-1">
                            <input
                              id={`week-${week.value}`}
                              name="selected-week"
                              type="radio"
                              checked={isChecked}
                              onChange={() => {
                                setSelectedWeek(week.value)
                                setSelectedQuickSelect("Week")
                              }}
                              className="col-start-1 row-start-1 appearance-none rounded-md border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-[#1E293B] checked:border-indigo-600 checked:bg-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 hover:border-indigo-400 transition-all duration-150 cursor-pointer"
                              value={week.value}
                            />
                            <svg
                              className={`pointer-events-none col-start-1 row-start-1 size-3 self-center justify-self-center stroke-white transition-opacity duration-150 ${isChecked ? 'opacity-100' : 'opacity-0'}`}
                              viewBox="0 0 14 14"
                              fill="none"
                            >
                              <path d="M3 8L6 11L11 3.5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path>
                            </svg>
                          </div>
                        </div>
                        <div className="text-sm">
                          <label
                            htmlFor={`week-${week.value}`}
                            className={`cursor-pointer ${isChecked ? 'font-semibold text-indigo-700 dark:text-indigo-300' : 'font-medium text-slate-700 dark:text-slate-200'}`}
                          >
                            {week.label}
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </fieldset>
              </div>
            ) : selectedDateRangeType === 'Month' ? (
              /* Month and Year dual list selector */
              <div className="bg-slate-50/80 dark:bg-[#111C33] rounded-xl p-4 border border-slate-200/80 dark:border-[#22324D]">
                <div className="flex flex-col lg:flex-row gap-4 bg-white dark:bg-[#0F172A] rounded-xl p-4 border border-slate-200/80 dark:border-[#22324D] shadow-2xs" style={{ minHeight: '330px', maxHeight: '330px' }}>

                  {/* Year fieldset */}
                  <fieldset className="w-full lg:w-1/2 space-y-2.5">
                    <legend className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-2">Year</legend>
                    <div className="space-y-1 max-h-[255px] overflow-y-auto pr-1">
                      {years.map((yr) => {
                        const isDisabled = false;
                        const isChecked = currentYear === yr;
                        return (
                          <div
                            key={yr}
                            onClick={() => {
                              if (!isDisabled) {
                                setCurrentYear(yr);
                                setSelectedQuickSelect("Month");
                              }
                            }}
                            className={`group flex items-center gap-3 cursor-pointer rounded-lg px-2.5 py-2 transition-all duration-150 ${isChecked
                              ? 'bg-indigo-50/80 dark:bg-indigo-950/50'
                              : 'hover:bg-slate-50 dark:hover:bg-[#1E293B]'
                              } ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}
                          >
                            <div className="flex h-5 shrink-0 items-center">
                              <div className="grid size-4 grid-cols-1">
                                <input
                                  id={`year-${yr}`}
                                  name="year"
                                  type="radio"
                                  checked={isChecked}
                                  disabled={isDisabled}
                                  onChange={() => { }}
                                  className="col-start-1 row-start-1 appearance-none rounded-md border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-[#1E293B] checked:border-indigo-600 checked:bg-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:border-slate-200 disabled:bg-slate-100 hover:border-indigo-400 transition-all duration-150 cursor-pointer"
                                  value={yr}
                                />
                                <svg
                                  className={`pointer-events-none col-start-1 row-start-1 size-3 self-center justify-self-center stroke-white transition-opacity duration-150 ${isChecked ? 'opacity-100' : 'opacity-0'}`}
                                  viewBox="0 0 14 14"
                                  fill="none"
                                >
                                  <path d="M3 8L6 11L11 3.5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path>
                                </svg>
                              </div>
                            </div>
                            <label htmlFor={`year-${yr}`} className={`text-sm select-none cursor-pointer ${isChecked ? 'font-semibold text-indigo-700 dark:text-indigo-300' : 'font-medium text-slate-700 dark:text-slate-200'}`}>
                              {yr}
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </fieldset>

                  {/* Month fieldset */}
                  <fieldset className="w-full lg:w-1/2 space-y-2.5">
                    <legend className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-2">Month</legend>
                    <div className="space-y-1 max-h-[255px] overflow-y-auto pr-1">
                      {monthsList.map((monthName, index) => {
                        const monthVal = index; // 0-indexed month
                        const isChecked = currentMonth === monthVal;
                        return (
                          <div
                            key={monthVal}
                            onClick={() => {
                              setCurrentMonth(monthVal);
                              setSelectedQuickSelect("Month");
                            }}
                            className={`group flex items-center gap-3 cursor-pointer rounded-lg px-2.5 py-2 transition-all duration-150 ${isChecked
                              ? 'bg-indigo-50/80 dark:bg-indigo-950/50'
                              : 'hover:bg-slate-50 dark:hover:bg-[#1E293B]'
                              }`}
                          >
                            <div className="flex h-5 shrink-0 items-center">
                              <div className="grid size-4 grid-cols-1">
                                <input
                                  id={`month-${currentYear}-${monthVal + 1}`}
                                  name="month"
                                  type="radio"
                                  checked={isChecked}
                                  onChange={() => { }}
                                  className="col-start-1 row-start-1 appearance-none rounded-md border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-[#1E293B] checked:border-indigo-600 checked:bg-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 hover:border-indigo-400 transition-all duration-150 cursor-pointer"
                                  value={`${currentYear}-${monthVal + 1}`}
                                />
                                <svg
                                  className={`pointer-events-none col-start-1 row-start-1 size-3 self-center justify-self-center stroke-white transition-opacity duration-150 ${isChecked ? 'opacity-100' : 'opacity-0'}`}
                                  viewBox="0 0 14 14"
                                  fill="none"
                                >
                                  <path d="M3 8L6 11L11 3.5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path>
                                </svg>
                              </div>
                            </div>
                            <label htmlFor={`month-${currentYear}-${monthVal + 1}`} className={`text-sm select-none cursor-pointer ${isChecked ? 'font-semibold text-indigo-700 dark:text-indigo-300' : 'font-medium text-slate-700 dark:text-slate-200'}`}>
                              {monthName}
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </fieldset>

                </div>
              </div>
            ) : selectedDateRangeType === 'Year' ? (

              <div className="bg-slate-50/80 dark:bg-[#111C33] rounded-xl p-4 border border-slate-200/80 dark:border-[#22324D]">
                <fieldset className="space-y-1 bg-white dark:bg-[#0F172A] border border-slate-200/80 dark:border-[#22324D] rounded-xl p-3 max-h-[330px] overflow-y-auto">

                  {years.map((yr) => {
                    const isChecked = currentYear === yr;

                    return (
                      <div
                        key={yr}
                        onClick={() => {
                          setCurrentYear(yr);
                          setSelectedQuickSelect("Year");
                        }}
                        className={`group flex items-center gap-3 cursor-pointer rounded-lg px-3 py-2 transition-all duration-150 ${isChecked
                          ? 'bg-indigo-50/80 dark:bg-indigo-950/50'
                          : 'hover:bg-slate-50 dark:hover:bg-[#1E293B]'
                          }`}
                      >
                        <div className="flex h-5 shrink-0 items-center">
                          <div className="grid size-4 grid-cols-1">
                            <input
                              type="radio"
                              checked={isChecked}
                              onChange={() => { }}
                              className="col-start-1 row-start-1 appearance-none rounded-md border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-[#1E293B] checked:border-indigo-600 checked:bg-indigo-600"
                            />

                            <svg
                              className={`pointer-events-none col-start-1 row-start-1 size-3 self-center justify-self-center stroke-white ${isChecked ? "opacity-100" : "opacity-0"
                                }`}
                              viewBox="0 0 14 14"
                              fill="none"
                            >
                              <path
                                d="M3 8L6 11L11 3.5"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </div>
                        </div>

                        <label className={`text-sm cursor-pointer ${isChecked ? 'font-semibold text-indigo-700 dark:text-indigo-300' : 'font-medium text-slate-700 dark:text-slate-200'}`}>
                          {yr}
                        </label>
                      </div>
                    );
                  })}
                </fieldset>
              </div>
            ) : selectedDateRangeType === 'Custom' ? (
              /* Custom double side-by-side calendar with connected range highlights */
              <div className="bg-slate-50/80 dark:bg-[#111C33] rounded-xl p-4 border border-slate-200/80 dark:border-[#22324D]">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                  {customCalendars.map((cal) => (
                    <div
                      key={cal.title}
                      className="bg-white dark:bg-[#0F172A] rounded-xl p-4 border border-slate-200/80 dark:border-[#22324D] shadow-2xs"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          {cal.title}
                        </h5>
                        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                          {formatPreviewDate(cal.selectedVal)}
                        </span>
                      </div>

                      <div className="w-full text-sm">
                        <div className="flex items-center justify-between mb-3">
                          <button
                            type="button"
                            onClick={() => {
                              if (cal.calMonth === 0) {
                                cal.setCalMonth(11);
                                cal.setCalYear((prev) => prev - 1);
                              } else {
                                cal.setCalMonth((prev) => prev - 1);
                              }
                            }}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-[#22324D] bg-white dark:bg-[#1E293B] text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#273549] hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
                            aria-label={`Previous ${cal.title} month`}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <div className="flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-100">
                            <span>{monthsList[cal.calMonth]}</span>
                            <span>{cal.calYear}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (cal.calMonth === 11) {
                                cal.setCalMonth(0);
                                cal.setCalYear((prev) => prev + 1);
                              } else {
                                cal.setCalMonth((prev) => prev + 1);
                              }
                            }}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-[#22324D] bg-white dark:bg-[#1E293B] text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#273549] hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
                            aria-label={`Next ${cal.title} month`}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-7 text-center font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 text-[11px] mb-2">
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                            <div key={d} className="pb-1">{d}</div>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 text-center text-sm gap-y-1">
                          {getCalendarDaysFor(cal.calYear, cal.calMonth).map((dayObj, index) => {
                            const isSelected = isSameDay(cal.selectedVal, dayObj.year, dayObj.month, dayObj.day);
                            const cellKey = formatCalendarDate(dayObj.year, dayObj.month, dayObj.day);
                            const hasSpan = customMinKey !== customMaxKey;
                            const isStartCap = hasSpan && cellKey === customMinKey;
                            const isEndCap = hasSpan && cellKey === customMaxKey;
                            const isInRange = hasSpan && cellKey > customMinKey && cellKey < customMaxKey;
                            const isToday = isTodayCell(dayObj.year, dayObj.month, dayObj.day);

                            return (
                              <div
                                key={index}
                                className={`relative flex items-center justify-center py-0.5 ${isInRange
                                  ? 'bg-indigo-50 dark:bg-indigo-950/50'
                                  : isStartCap
                                    ? 'bg-gradient-to-r from-transparent via-indigo-50 to-indigo-50 dark:via-indigo-950/50 dark:to-indigo-950/50'
                                    : isEndCap
                                      ? 'bg-gradient-to-l from-transparent via-indigo-50 to-indigo-50 dark:via-indigo-950/50 dark:to-indigo-950/50'
                                      : ''
                                  }`}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    cal.onPick(
                                      createDateInTimezone(
                                        dayObj.year,
                                        dayObj.month,
                                        dayObj.day,
                                        timezone
                                      )
                                    )
                                  }
                                  className={`relative w-8 h-8 flex items-center justify-center rounded-full transition-all duration-150 cursor-pointer ${isSelected
                                    ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                                    : isStartCap || isEndCap
                                      ? 'bg-indigo-100 dark:bg-indigo-900/70 text-indigo-700 dark:text-indigo-200 font-semibold'
                                      : isInRange
                                        ? 'text-indigo-700 dark:text-indigo-200 font-medium hover:bg-indigo-100/80 dark:hover:bg-indigo-900/60'
                                        : isToday
                                          ? 'ring-1 ring-indigo-500/70 dark:ring-indigo-400/60 text-indigo-600 dark:text-indigo-400 font-bold hover:bg-indigo-50 dark:hover:bg-indigo-950/50'
                                          : dayObj.isCurrentMonth
                                            ? 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1E293B]'
                                            : 'text-slate-300 dark:text-slate-600 hover:bg-slate-100/60 dark:hover:bg-[#1E293B]/60'
                                    }`}
                                >
                                  {dayObj.day}
                                  {isToday && !isSelected && (
                                    <span className="absolute bottom-1 h-1 w-1 rounded-full bg-indigo-500 dark:bg-indigo-400" />
                                  )}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Calendar Container */
              <div className="bg-slate-50/80 dark:bg-[#111C33] rounded-xl p-4 border border-slate-200/80 dark:border-[#22324D]">
                <div className="bg-white dark:bg-[#0F172A] rounded-xl p-5 max-w-md mx-auto shadow-2xs border border-slate-200/80 dark:border-[#22324D]">

                  {/* Calendar Header */}
                  <div className="flex items-center justify-between mb-4 px-1">
                    <button
                      type="button"
                      onClick={handlePrevMonth}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-[#22324D] bg-white dark:bg-[#1E293B] text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#273549] hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <h2 className="font-semibold text-slate-800 dark:text-slate-100 text-sm tracking-wide">
                      {monthsList[currentMonth]} {currentYear}
                    </h2>

                    <button
                      type="button"
                      onClick={handleNextMonth}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-[#22324D] bg-white dark:bg-[#1E293B] text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#273549] hover:text-slate-800 dark:hover:text-white transition cursor-pointer"
                      aria-label="Next month"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Week Days Headers */}
                  <div className="grid grid-cols-7 text-center text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2.5 gap-1">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(
                      (day) => (
                        <div key={day} className="py-1">
                          {day}
                        </div>
                      )
                    )}
                  </div>

                  {/* Days Grid */}
                  <div className="grid grid-cols-7 text-center text-sm gap-1">
                    {getCalendarDays().map((dayObj, index) => {
                      const isSelected = isSameDay(selectedDate, dayObj.year, dayObj.month, dayObj.day);
                      const isToday = isTodayCell(dayObj.year, dayObj.month, dayObj.day);

                      return (
                        <button
                          type="button"
                          key={index}
                          onClick={() => {
                            const clicked = createDateInTimezone(
                              dayObj.year,
                              dayObj.month,
                              dayObj.day,
                              timezone
                            );
                            setSelectedDate(clicked);
                            const todayParts = getTimezoneDateParts(new Date());
                            const yesterdayParts = addCalendarDays(
                              todayParts.year,
                              todayParts.month,
                              todayParts.day,
                              -1
                            );
                            if (
                              dayObj.year === todayParts.year &&
                              dayObj.month === todayParts.month &&
                              dayObj.day === todayParts.day
                            ) {
                              setSelectedQuickSelect("Today");
                            } else if (
                              dayObj.year === yesterdayParts.year &&
                              dayObj.month === yesterdayParts.month &&
                              dayObj.day === yesterdayParts.day
                            ) {
                              setSelectedQuickSelect("Yesterday");
                            } else {
                              setSelectedQuickSelect("Day");
                            }
                          }}
                          className={`relative w-9 h-9 flex items-center justify-center rounded-full mx-auto transition-all duration-150 cursor-pointer ${isSelected
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm ring-2 ring-indigo-200 dark:ring-indigo-900/70'
                            : isToday
                              ? 'ring-1 ring-indigo-500/70 dark:ring-indigo-400/60 text-indigo-600 dark:text-indigo-400 font-bold hover:bg-indigo-50 dark:hover:bg-indigo-950/50'
                              : dayObj.isCurrentMonth
                                ? 'text-slate-800 dark:text-slate-200 font-medium hover:bg-slate-100 dark:hover:bg-[#1E293B]'
                                : 'text-slate-300 dark:text-slate-600 font-normal hover:bg-slate-100/60 dark:hover:bg-[#1E293B]/60'
                            }`}
                        >
                          {dayObj.day}
                          {isToday && !isSelected && (
                            <span className="absolute bottom-1 h-1 w-1 rounded-full bg-indigo-500 dark:bg-indigo-400" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Group By Option */}
            <div className="bg-slate-50/80 dark:bg-[#111C33] rounded-xl p-4 border border-slate-200/80 dark:border-[#22324D]">
              <h4 className="text-[11px] font-bold mb-2.5 text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Group By
              </h4>

              <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 dark:bg-[#1E293B] p-1 border border-slate-200/80 dark:border-[#22324D]">
                {['Days', 'Weeks', 'Months'].map((item) => {
                  const isActive = selectedGroupBy === item;
                  return (
                    <button
                      type="button"
                      key={item}
                      onClick={() => setSelectedGroupBy(item)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150 cursor-pointer ${isActive
                        ? 'bg-white dark:bg-[#0F172A] text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200/80 dark:border-[#22324D]'
                        : 'border border-transparent text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                        }`}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Report Timezone — read only, sourced from the user's real Settings.
                (Previously this was a second, disconnected timezone picker that
                didn't match the real app timezone and wasn't saved anywhere.) */}
            <div className="bg-slate-50/80 dark:bg-[#111C33] rounded-xl p-4 border border-slate-200/80 dark:border-[#22324D]">
              <h4 className="text-[11px] font-bold mb-2.5 text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Report Timezone
              </h4>

              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] text-sm font-medium text-slate-700 dark:text-slate-200">
                <span className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                  <span>{timezone}</span>
                </span>
                <a
                  href="/dashboard/settings/profile"
                  onClick={(e) => {
                    if (isDesktop) {
                      e.preventDefault();
                      onClose?.();
                      navigateToSetting("profile", "/dashboard/settings/profile");
                    }
                  }}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer"
                >
                  Change in Settings
                </a>
              </div>
            </div>


          </div>


        </div>
        <div className="sticky bottom-0 bg-white dark:bg-[#0F172A] border-t border-slate-200 dark:border-[#22324D] px-6 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-lg bg-slate-50 dark:bg-[#1E293B] border border-slate-200/80 dark:border-[#22324D] px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 min-w-0">
            <CalendarDays className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
            <span className="text-slate-500 dark:text-slate-400 shrink-0">Selected:</span>
            <span className="font-semibold text-slate-900 dark:text-white truncate">
              {stagedPreviewText}
            </span>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-[#22324D] bg-white dark:bg-[#1E293B] text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#273549] transition cursor-pointer"
            >
              Cancel
            </button>

          <button
            onClick={() => {


              let range = {
                type: "Day",
                startDate: selectedDate,
                endDate: selectedDate,
              };


              let appliedDate = selectedDate;

              let rangeText = formatDisplayDate(selectedDate, timezone);

              if (selectedDateRangeType === "Day") {
                const selectedParts = getTimezoneDateParts(selectedDate);
                const selectedDay = createDateInTimezone(
                  selectedParts.year,
                  selectedParts.month,
                  selectedParts.day,
                  timezone
                );

                appliedDate = selectedDay;

                range = {
                  type: "Day",
                  startDate: selectedDay,
                  endDate: selectedDay,
                };

                rangeText = formatDisplayDate(selectedDay, timezone);
              }

              // Week ranges
              if (selectedDateRangeType === "Week") {
                const [start, end] = selectedWeek.split(",");

                if (!start || !end) {
                  return;
                }

                const startParts = start.split("-").map(Number);
                const endParts = end.split("-").map(Number);

                if (
                  startParts.length !== 3 ||
                  endParts.length !== 3 ||
                  startParts.some(Number.isNaN) ||
                  endParts.some(Number.isNaN)
                ) {
                  return;
                }

                const [startYear, startMonth, startDay] = startParts as [
                  number,
                  number,
                  number
                ];

                const [endYear, endMonth, endDay] = endParts as [
                  number,
                  number,
                  number
                ];

                const weekStart = createDateInTimezone(
                  startYear,
                  startMonth - 1,
                  startDay,
                  timezone
                );

                const weekEnd = createDateInTimezone(
                  endYear,
                  endMonth - 1,
                  endDay,
                  timezone
                );

                range = {
                  type: "Week",
                  startDate: weekStart,
                  endDate: weekEnd,
                };

                appliedDate = weekStart;

                rangeText =
                  `${weekStart.toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    timeZone: timezone,
                  })} - ${weekEnd.toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    timeZone: timezone,
                  })}`;
              }

              // Month range
              if (selectedDateRangeType === "Month") {
                const firstDay = createDateInTimezone(
                  currentYear,
                  currentMonth,
                  1,
                  timezone
                );

                const lastCalendarDay = new Date(
                  Date.UTC(currentYear, currentMonth + 1, 0)
                ).getUTCDate();

                const lastDay = createDateInTimezone(
                  currentYear,
                  currentMonth,
                  lastCalendarDay,
                  timezone
                );

                appliedDate = firstDay;

                range = {
                  type: "Month",
                  startDate: firstDay,
                  endDate: lastDay,
                };

                rangeText = `${monthsList[currentMonth]} ${currentYear}`;
              }

              // Year Range
              if (selectedDateRangeType === "Year") {
                const firstDay = createDateInTimezone(
                  currentYear,
                  0,
                  1,
                  timezone
                );

                const lastDay = createDateInTimezone(
                  currentYear,
                  11,
                  31,
                  timezone
                );

                appliedDate = firstDay;

                range = {
                  type: "Year",
                  startDate: firstDay,
                  endDate: lastDay,
                };

                rangeText = currentYear.toString();
              }
              // Custom ranges
              if (selectedDateRangeType === "Custom") {
                const startParts = getTimezoneDateParts(startDate);
                const endParts = getTimezoneDateParts(endDate);
                const customStart = createDateInTimezone(
                  startParts.year,
                  startParts.month,
                  startParts.day,
                  timezone
                );

                const customEnd = createDateInTimezone(
                  endParts.year,
                  endParts.month,
                  endParts.day,
                  timezone
                );

                appliedDate = customStart;

                range = {
                  type: "Custom",
                  startDate: customStart,
                  endDate: customEnd,
                };

                rangeText =
                  `${customStart.toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    timeZone: timezone,
                  })} - ${customEnd.toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    timeZone: timezone,
                  })}`;
              }

              let label = selectedQuickSelect;

              if (selectedDateRangeType === "Month") {
                if (
                  selectedQuickSelect === "Last month" ||
                  selectedQuickSelect === "This month"
                ) {
                  label = selectedQuickSelect;
                } else {
                  label = "Month";
                }
              }

              if (selectedDateRangeType === "Year") {
                label = "Year";
              }

              if (
                selectedDateRangeType === "Custom" &&
                selectedQuickSelect !== "Last 7 days" &&
                selectedQuickSelect !== "Last 14 days" &&
                selectedQuickSelect !== "Last 30 days"
              ) {
                label = "Custom";
              }

              if (selectedDateRangeType === "Week") {
                switch (selectedQuickSelect) {
                  case "This week (Mon - Today)":
                    label = "This week";
                    break;

                  case "Last week (Mon - Sun)":
                    label = "Last week";
                    break;

                  default:
                    label = "Week";
                }
              }

              if (selectedDateRangeType === "Day" && !label) {
                label = "Day";
              }

              onApply?.(
                appliedDate,
                label,
                rangeText,
                range,
                {
                  quickSelect: selectedQuickSelect,
                  groupBy: selectedGroupBy,
                }
              );

              onClose?.();
            }}
            className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-semibold text-white shadow-sm shadow-indigo-500/20 transition cursor-pointer"
          >
            Apply
          </button>
          </div>
        </div>
      </div>
    </div >
  );
}