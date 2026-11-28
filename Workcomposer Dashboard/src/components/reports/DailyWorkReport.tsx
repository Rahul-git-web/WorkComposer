"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import {
  CheckCircle2,
  Clock,
  Copy,
  Mail,
  AlertCircle,
  Printer,
  X,
  Briefcase,
  AppWindow,
} from "lucide-react";

type DailyWorkReportProps = {
  report: any;
  emailSent?: boolean | null;
  onClose: () => void;
};

export default function DailyWorkReport({
  report,
  emailSent = null,
  onClose,
}: DailyWorkReportProps) {
  const [copied, setCopied] = useState(false);

  const summary = report?.summary || {};
  const activity = report?.activity || {};
  const shift = report?.shift || null;
  const productivity = report?.productivity || null;
  const manualTime = report?.manualTime || null;
  const projects = Array.isArray(report?.projects) ? report.projects : [];
  const tasks = Array.isArray(report?.tasks) ? report.tasks : [];
  const appsUsed = Array.isArray(report?.appsUsed) ? report.appsUsed : [];
  const sessions = Array.isArray(report?.sessions) ? report.sessions : [];

  const activityScore = Math.min(
    100,
    Math.max(0, Number(activity.activityScore) || 0),
  );

  const shiftPercent =
    shift?.hasShift && shift.expectedSeconds > 0
      ? Math.min(
          100,
          Math.round(((summary.workSeconds || 0) / shift.expectedSeconds) * 100),
        )
      : 0;

  const handleCopySummary = async () => {
    const lines = [
      `Daily Work Report — ${report?.date || "--"}${report?.timezone ? ` (${report.timezone})` : ""}`,
      `Employee: ${report?.user?.name || "--"}`,
      `Start: ${summary.startTime || "--"} | Finish: ${summary.finishTime || "--"}`,
      `Worked: ${summary.workTime || "0h 0m"} | Break: ${summary.breakTime || "0h 0m"} | Active: ${summary.activeTime || "0h 0m"}`,
      shift?.hasShift
        ? `Shift Target (${shift.scheduledStart}-${shift.scheduledEnd}): ${shift.expectedTime} (${shift.varianceTime})`
        : null,
      `Activity Score: ${activityScore}% (${activity.screenshotCount ?? 0} screenshots)`,
      projects.length
        ? `Projects: ${projects.map((p: any) => `${p.name} (${p.time})`).join(", ")}`
        : null,
      tasks.length
        ? `Tasks:\n${tasks.map((t: any) => `- ${t.task?.title || "Untitled Task"} (${t.project?.name || "No Project"}): ${t.time || "0h 0m"}`).join("\n")}`
        : "Tasks: None recorded",
    ].filter(Boolean);

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      toast.success("Day summary copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Unable to copy summary");
    }
  };

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-3 sm:p-5">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-gray-200 dark:border-[#263852] bg-white dark:bg-[#16253D] text-gray-900 dark:text-white shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 dark:border-[#263852] px-5 py-4 sm:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                End-of-Day Summary
              </h2>

              {emailSent === true && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  <Mail className="h-3 w-3" />
                  Emailed to {report?.user?.email || "you"}
                </span>
              )}

              {emailSent === false && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                  <AlertCircle className="h-3 w-3" />
                  Saved (email delivery failed)
                </span>
              )}
            </div>

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {report?.date || "--"}{" "}
              {report?.timezone ? `• ${report.timezone}` : ""}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopySummary}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-[#263852] bg-gray-50 dark:bg-[#111E33] px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#1E314D] transition-colors cursor-pointer"
            >
              {copied ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy Summary"}
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-[#263852] bg-gray-50 dark:bg-[#111E33] px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#1E314D] transition-colors cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close summary"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#243447] hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-5 overflow-y-auto p-5 sm:p-6">
          {/* User */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-[#263852] bg-gray-50 dark:bg-[#111E33] p-4">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {report?.user?.name || "Team Member"}
              </p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {report?.user?.email}
              </p>
            </div>

            {summary.totalSpanTime && (
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Day Span
                </p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {summary.totalSpanTime}
                </p>
              </div>
            )}
          </div>

          {/* Summary */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Work Summary
            </h3>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ReportStat label="Start" value={summary.startTime || "--"} />
              <ReportStat label="Finish" value={summary.finishTime || "--"} />
              <ReportStat label="Work Time" value={summary.workTime || "0h 0m"} highlight="indigo" />
              <ReportStat label="Break Time" value={summary.breakTime || "0h 0m"} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <ReportStat label="Active Time" value={summary.activeTime || "0h 0m"} highlight="emerald" />
              <ReportStat label="Idle Time" value={summary.idleTime || "0h 0m"} />
              <ReportStat label="Approved Manual" value={manualTime?.approvedTime || summary.manualApprovedTime || "0h 0m"} />
            </div>
          </div>

          {/* Shift Adherence */}
          {shift?.hasShift && (
            <div className="rounded-xl border border-gray-200 dark:border-[#263852] bg-gray-50 dark:bg-[#111E33] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    Shift Target ({shift.scheduledStart} – {shift.scheduledEnd})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Expected {shift.expectedTime}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      shift.status === "overtime"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                        : shift.status === "undertime"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                          : "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
                    }`}
                  >
                    {shift.varianceTime}
                  </span>
                </div>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-[#243447]">
                <div
                  className={`h-full rounded-full transition-all ${
                    shift.status === "overtime"
                      ? "bg-emerald-500"
                      : shift.status === "undertime"
                        ? "bg-amber-500"
                        : "bg-indigo-600"
                  }`}
                  style={{ width: `${shiftPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Activity */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Activity
            </h3>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ReportStat label="Key Presses" value={(activity.keyPresses ?? 0).toLocaleString()} />
              <ReportStat label="Mouse Clicks" value={(activity.mouseClicks ?? 0).toLocaleString()} />
              <ReportStat label="Mouse Moves" value={(activity.mouseMoves ?? 0).toLocaleString()} />
              <ReportStat label="Screenshots" value={(activity.screenshotCount ?? 0).toLocaleString()} />
            </div>

            <div className="mt-3 rounded-xl border border-gray-200 dark:border-[#263852] bg-gray-50 dark:bg-[#111E33] p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Activity Score
                </span>

                <span className="text-lg font-bold text-emerald-600 dark:text-green-400">
                  {activityScore}%
                </span>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-[#243447]">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${activityScore}%` }}
                />
              </div>
            </div>
          </div>

          {/* Projects Rollup */}
          {projects.length > 0 && (
            <div>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <Briefcase className="h-3.5 w-3.5" />
                Projects ({projects.length})
              </h3>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {projects.map((proj: any) => (
                  <div
                    key={proj.id || proj.name}
                    className="rounded-xl border border-gray-200 dark:border-[#263852] bg-gray-50 dark:bg-[#111E33] p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {proj.name}
                      </span>
                      <span className="text-xs font-semibold text-indigo-600 dark:text-blue-400">
                        {proj.time} ({proj.percentage}%)
                      </span>
                    </div>

                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-[#243447]">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{ width: `${Math.min(100, Math.max(4, proj.percentage || 0))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Productivity & Top Apps */}
          {(appsUsed.length > 0 || (productivity && productivity.totalUsageSeconds > 0)) && (
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <AppWindow className="h-3.5 w-3.5" />
                  Apps & Productivity
                </h3>

                {productivity?.totalUsageSeconds > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 font-medium">
                      Productive {productivity.productiveTime} ({productivity.score}%)
                    </span>
                    <span className="rounded-full bg-gray-200 text-gray-700 dark:bg-slate-800 dark:text-gray-300 px-2 py-0.5 font-medium">
                      Neutral {productivity.neutralTime}
                    </span>
                    {productivity.unproductiveSeconds > 0 && (
                      <span className="rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 px-2 py-0.5 font-medium">
                        Unproductive {productivity.unproductiveTime}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {appsUsed.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#263852]">
                  {appsUsed.slice(0, 8).map((app: any, idx: number) => (
                    <div
                      key={`${app.appName}-${idx}`}
                      className="flex items-center justify-between border-b border-gray-200 dark:border-[#263852] bg-gray-50 dark:bg-[#111E33] px-4 py-2.5 last:border-b-0"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                          {app.appName}
                        </span>
                        <span className="rounded bg-gray-200 dark:bg-[#243447] px-1.5 py-0.5 text-[10px] font-medium capitalize text-gray-600 dark:text-gray-300">
                          {app.classification || "neutral"}
                        </span>
                      </div>

                      <span className="shrink-0 text-xs font-semibold text-gray-700 dark:text-gray-300">
                        {app.time} ({app.percentage}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tasks */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Tasks {report?.taskStats?.completedTodayCount ? `• ${report.taskStats.completedTodayCount} Completed` : ""}
            </h3>

            {tasks.length > 0 ? (
              <div className="space-y-2">
                {tasks.map((item: any, index: number) => (
                  <div
                    key={`${item.task?._id || "task"}-${index}`}
                    className="rounded-xl border border-gray-200 dark:border-[#263852] bg-gray-50 dark:bg-[#111E33] p-4"
                  >
                    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {item.task?.title || "Untitled Task"}
                          </p>
                          {item.task?.status && (
                            <span className="rounded-full bg-gray-200 dark:bg-[#243447] px-2 py-0.5 text-[10px] font-medium capitalize text-gray-700 dark:text-gray-300">
                              {item.task.status}
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {item.project?.name || "No Project"}
                        </p>
                      </div>

                      <span className="text-sm font-semibold text-indigo-600 dark:text-blue-400">
                        {item.time || "0h 0m"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 dark:border-[#263852] bg-gray-50 dark:bg-[#111E33] p-4 text-sm text-gray-500 dark:text-gray-400">
                No task activity recorded today.
              </div>
            )}
          </div>

          {/* Sessions */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Session Timeline ({sessions.length})
            </h3>

            <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#263852]">
              <div className="max-h-64 overflow-y-auto">
                {sessions.length > 0 ? (
                  sessions.map((session: any, index: number) => (
                    <div
                      key={session.id || index}
                      className="flex flex-col gap-2 border-b border-gray-200 dark:border-[#263852] bg-gray-50 dark:bg-[#111E33] px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            session.type === "work"
                              ? "bg-green-500"
                              : "bg-orange-400"
                          }`}
                        />

                        <div>
                          <p className="text-sm font-medium capitalize text-gray-900 dark:text-white">
                            {session.type}
                          </p>

                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {session.startTime || "--"} → {session.endTime || "--"}
                          </p>
                        </div>
                      </div>

                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {session.time}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="bg-gray-50 dark:bg-[#111E33] px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                    No sessions recorded today.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-gray-200 dark:border-[#263852] bg-white dark:bg-[#16253D] px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-indigo-600 dark:bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 dark:hover:bg-blue-700 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: "indigo" | "emerald";
}) {
  const valueClass =
    highlight === "indigo"
      ? "text-indigo-600 dark:text-blue-400"
      : highlight === "emerald"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-gray-900 dark:text-white";

  return (
    <div className="rounded-xl border border-gray-200 dark:border-[#263852] bg-gray-50 dark:bg-[#111E33] p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-2 truncate text-base font-semibold ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}
