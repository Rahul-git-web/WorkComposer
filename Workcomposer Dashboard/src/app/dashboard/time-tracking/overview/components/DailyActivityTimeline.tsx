"use client";

import { useEffect, useState } from "react";
import API from "@/api";
import { useAppTimezone } from "@/hooks/useAppTimezone";
import { formatDateForApi } from "@/utils/appTimezone";

type Props = {
  userId: string;
  reportRange: {
    type: string;
    startDate: Date;
    endDate: Date;
  };
};

export default function DailyActivityTimeline({
  userId,
  reportRange,
}: Props) {
  const timezone = useAppTimezone();

  type TimelineItem = {
    date: string;
    workTime: string;
    breakTime: string;
  };

  const [timeline, setTimeline] = useState<TimelineItem[]>([]);

  useEffect(() => {
    const fetchTimeline = async () => {
      try {
        const startDate = formatDateForApi(reportRange.startDate, timezone);
        const endDate = formatDateForApi(reportRange.endDate, timezone);

        const { data } = await API.get(
          `/activity/timeline/${userId}?startDate=${startDate}&endDate=${endDate}`
        );

        setTimeline(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
      }
    };

    fetchTimeline();
  }, [userId, reportRange.startDate, reportRange.endDate, timezone]);

  const getDotColor = (workTime: string) => {
    const [hours] = workTime.split("h");
    const totalHours = Number(hours);

    if (totalHours >= 6) return "bg-emerald-500";
    if (totalHours >= 2) return "bg-amber-500";
    return "bg-rose-500";
  };

  return (
    <div className="mt-2 w-full min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">
          Days/periods with recorded time in this detail window
        </h4>
        {timeline.length > 0 && (
          <span className="text-xs font-medium text-gray-400 dark:text-slate-500">
            {timeline.length} {timeline.length === 1 ? "day" : "days"} recorded
          </span>
        )}
      </div>

      {timeline.length === 0 ? (
        <div className="p-4 rounded-xl border border-dashed border-gray-200 dark:border-[#22324D] text-center text-xs text-gray-400 dark:text-slate-500">
          No recorded time periods in this detail window.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-[#22324D] bg-white dark:bg-[#0F172A] shadow-2xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-[#22324D] bg-gray-50/80 dark:bg-[#1E293B]/70 text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                <th scope="col" className="px-4 py-2.5">
                  DAY
                </th>
                <th scope="col" className="px-4 py-2.5 text-right">
                  WORKED
                </th>
                <th scope="col" className="px-4 py-2.5 text-right">
                  BREAK
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#22324D]/60 text-xs">
              {timeline.map((item, index) => (
                <tr
                  key={index}
                  className="hover:bg-gray-50/50 dark:hover:bg-[#1E293B]/30 transition-colors"
                >
                  <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-slate-200 flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${getDotColor(
                        item.workTime
                      )}`}
                    />
                    <span>{item.date}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-gray-900 dark:text-white">
                    {item.workTime}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                    {item.breakTime}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
