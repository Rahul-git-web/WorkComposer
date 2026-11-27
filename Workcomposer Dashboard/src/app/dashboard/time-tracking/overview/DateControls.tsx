"use client";
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import DateRangeModalPreview, {
  resolveCalendarRangeState,
  type ReportRangeValue,
} from "./DateRangeModalPreview";
import { useAppTimezone } from "@/hooks/useAppTimezone";
import {
  addDaysInTimezone,
  formatDateForApi,
  isSameDayInTimezone,
} from "@/utils/appTimezone";

type Props = {
  date: Date;
  setDate: Dispatch<SetStateAction<Date>>;
  reportRange?: ReportRangeValue;
  setReportRange: Dispatch<SetStateAction<ReportRangeValue>>;

  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
};

export default function DateControls({
  date,
  setDate,
  reportRange,
  setReportRange,
  onRefresh,
  isRefreshing,
}: Props) {

  const timezone = useAppTimezone();

  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [selectionMeta, setSelectionMeta] = useState<{
    rangeKey: string;
    quickSelect: string;
    groupBy: string;
  } | null>(null);

  const effectiveRange: ReportRangeValue = useMemo(() => {
    if (reportRange?.startDate && reportRange?.endDate) {
      return reportRange;
    }
    return {
      type: "Day",
      startDate: date,
      endDate: date,
    };
  }, [reportRange, date]);

  const activeRangeKey = `${effectiveRange.type}|${formatDateForApi(
    new Date(effectiveRange.startDate),
    timezone
  )}|${formatDateForApi(new Date(effectiveRange.endDate), timezone)}`;

  const resolvedState = useMemo(() => {
    const matchedMeta =
      selectionMeta?.rangeKey === activeRangeKey ? selectionMeta : null;
    return resolveCalendarRangeState(
      effectiveRange,
      timezone,
      date,
      matchedMeta?.quickSelect,
      matchedMeta?.groupBy
    );
  }, [effectiveRange, timezone, date, selectionMeta, activeRangeKey]);

  const dateLabel = resolvedState.label;
  const dateRangeText = resolvedState.rangeText;

  const handlePrev = () => {
    const newDate = addDaysInTimezone(date, -1, timezone);
    const isToday = isSameDayInTimezone(newDate, new Date(), timezone);
    const dateKey = formatDateForApi(newDate, timezone);

    setDate(newDate);
    setSelectionMeta({
      rangeKey: `Day|${dateKey}|${dateKey}`,
      quickSelect: isToday ? "Today" : "Day",
      groupBy: "Days",
    });

    setReportRange({
      type: "Day",
      startDate: newDate,
      endDate: newDate,
    });
  };

  const handleNext = () => {
    const newDate = addDaysInTimezone(date, 1, timezone);
    const isToday = isSameDayInTimezone(newDate, new Date(), timezone);
    const dateKey = formatDateForApi(newDate, timezone);

    setDate(newDate);
    setSelectionMeta({
      rangeKey: `Day|${dateKey}|${dateKey}`,
      quickSelect: isToday ? "Today" : "Day",
      groupBy: "Days",
    });

    setReportRange({
      type: "Day",
      startDate: newDate,
      endDate: newDate,
    });
  };

  return (
    <div className="relative ml-auto flex w-full flex-wrap items-center justify-start gap-3 sm:w-auto sm:justify-end">
      <div className="relative inline-block">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setIsDateModalOpen(true)}
            className="text-sm font-semibold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm px-4 py-2 ring-1 ring-slate-100 dark:ring-0 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200 cursor-pointer"
          >
            {dateLabel}
          </button>

          <button
            type="button"
            onClick={handlePrev}
            className="text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white p-2 rounded-lg hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm transition-all duration-200 cursor-pointer font-medium"
            title="Previous"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() =>
              setIsDateModalOpen(true)
            }
            className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 sm:px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 shadow-sm ring-1 ring-slate-100 dark:ring-0 transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 hover:shadow-md cursor-pointer">
            <span className="truncate font-semibold">{dateRangeText}</span>
            <ChevronRight
              className="w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-200"
            />
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="text-slate-600 dark:text-slate-300 cursor-pointer font-medium hover:text-slate-800 dark:hover:text-white p-2 rounded-lg hover:bg-white dark:hover:bg-slate-800 hover:shadow-sm transition-all duration-200"
            title="Next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-white dark:bg-slate-800 p-2 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        title="Refresh"
      >
        <RefreshCw
          className={`w-5 h-5 ${
            isRefreshing ? "animate-spin" : ""
          }`}
        />
      </button>

      {isDateModalOpen && (
        <DateRangeModalPreview
          initialDate={date}
          reportRange={effectiveRange}
          initialQuickSelect={resolvedState.quickSelect}
          initialGroupBy={resolvedState.groupBy}
          onClose={() =>
            setIsDateModalOpen(false)
          }
          onApply={(newDate, _label, _rangeText, range, meta) => {
            const nextRangeKey = `${range.type}|${formatDateForApi(
              new Date(range.startDate),
              timezone
            )}|${formatDateForApi(new Date(range.endDate), timezone)}`;
            setDate(newDate);
            if (meta) {
              setSelectionMeta({
                rangeKey: nextRangeKey,
                quickSelect: meta.quickSelect,
                groupBy: meta.groupBy,
              });
            }
            setReportRange(range);
          }}
        />
      )}
    </div>
  );
}