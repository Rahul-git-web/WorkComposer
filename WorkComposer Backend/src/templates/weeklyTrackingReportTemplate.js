import { escapeHtml, sanitizeHttpUrl } from "../utils/emailSanitizer.js";

const formatDuration = (seconds) => {
  const safeSeconds = Number(seconds) || 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  return `${hours}h ${minutes}m`;
};

export const weeklyTrackingReportTemplate = ({
  user = {},
  report = {},
  startDate = "",
  endDate = "",
}) => {
  const safeFirstName = escapeHtml(user.firstName || "there") || "there";
  const safeStartDate = escapeHtml(startDate);
  const safeEndDate = escapeHtml(endDate);
  const safeAttendance = escapeHtml(report.attendance || "");
  const safeProductivity = Number(report.productivity) || 0;
  const safeScreenshots = Number(report.screenshots) || 0;
  const safeReportUrl = sanitizeHttpUrl(report.reportUrl, "#");
  const appsUsed = Array.isArray(report.appsUsed) ? report.appsUsed : [];
  const urlsVisited = Array.isArray(report.urlsVisited) ? report.urlsVisited : [];
  const projects = Array.isArray(report.projects) ? report.projects : [];
  const tasks = report.tasks || {};

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>Weekly Tracking Report</title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f5f7fb;
    font-family:Arial,Helvetica,sans-serif;
  "
>

<table
  width="100%"
  cellpadding="0"
  cellspacing="0"
  style="background:#f5f7fb;padding:40px 0;"
>
<tr>
<td align="center">

<table
  width="700"
  cellpadding="0"
  cellspacing="0"
  style="
    background:#ffffff;
    border-radius:12px;
    overflow:hidden;
    border:1px solid #e5e7eb;
  "
>

<tr>
<td
  style="
    background:#2563eb;
    color:white;
    padding:28px;
    text-align:center;
  "
>
<h1 style="margin:0;font-size:24px;">
Weekly Tracking Report
</h1>

<p style="margin-top:10px;">
${safeStartDate} - ${safeEndDate}
</p>
</td>
</tr>

<tr>
<td style="padding:30px;">

<h2 style="margin-top:0;">
Hello ${safeFirstName},
</h2>

<p>
Here is your tracking summary for the week.
</p>

<table
  width="100%"
  cellpadding="10"
  cellspacing="0"
  style="
    margin-top:25px;
    border:1px solid #e5e7eb;
    border-radius:8px;
  "
>

<tr style="background:#f9fafb;">
  <th align="left">Attendance</th>
  <td>${safeAttendance}</td>
</tr>

<tr>
  <th align="left">Worked Time</th>
  <td>${formatDuration(report.workedSeconds)}</td>
</tr>

<tr style="background:#f9fafb;">
  <th align="left">Break Time</th>
  <td>${formatDuration(report.breakSeconds)}</td>
</tr>

<tr>
  <th align="left">Idle Time</th>
  <td>${formatDuration(report.idleSeconds)}</td>
</tr>

<tr style="background:#f9fafb;">
  <th align="left">Productivity</th>
  <td>${safeProductivity}%</td>
</tr>

<tr>
  <th align="left">Screenshots</th>
  <td>${safeScreenshots}</td>
</tr>

</table>

<h3 style="margin-top:35px;">
Top Applications
</h3>

<table
  width="100%"
  cellpadding="10"
  cellspacing="0"
  style="
    border:1px solid #e5e7eb;
    border-radius:8px;
  "
>

<tr style="background:#f9fafb;">
  <th align="left">Application</th>
  <th align="right">Duration</th>
</tr>

${
  appsUsed.length
    ? appsUsed
        .map(
          (app) => `
<tr>
  <td>${escapeHtml(app?.appName || "Unknown App")}</td>
  <td align="right">${formatDuration(app?.duration)}</td>
</tr>
`,
        )
        .join("")
    : `
<tr>
<td colspan="2" align="center">
No application usage recorded.
</td>
</tr>
`
}

</table>

<h3 style="margin-top:35px;">
Websites Visited
</h3>

<table
  width="100%"
  cellpadding="10"
  cellspacing="0"
  style="
    border:1px solid #e5e7eb;
    border-radius:8px;
  "
>

${
  urlsVisited.length
    ? urlsVisited
        .map(
          (url) => `
<tr>
  <td>${escapeHtml(url)}</td>
</tr>
`,
        )
        .join("")
    : `
<tr>
<td align="center">
No website activity recorded.
</td>
</tr>
`
}

</table>

<h3 style="margin-top:35px;">
Projects
</h3>

<table
  width="100%"
  cellpadding="10"
  cellspacing="0"
  style="
    border:1px solid #e5e7eb;
    border-radius:8px;
  "
>

${
  projects.length
    ? projects
        .map(
          (project) => `
<tr>
  <td>${escapeHtml(project?.name || "Unnamed Project")}</td>
</tr>
`,
        )
        .join("")
    : `
<tr>
<td align="center">
No projects assigned.
</td>
</tr>
`
}

</table>

<h3 style="margin-top:35px;">
Task Summary
</h3>

<table
  width="100%"
  cellpadding="10"
  cellspacing="0"
  style="
    border:1px solid #e5e7eb;
    border-radius:8px;
  "
>

<tr style="background:#f9fafb;">
  <th align="left">Local Tasks</th>
  <td>${Number(tasks.local) || 0}</td>
</tr>

<tr>
  <th align="left">Jira Tasks</th>
  <td>${Number(tasks.jira) || 0}</td>
</tr>

<tr style="background:#f9fafb;">
  <th align="left">Asana Tasks</th>
  <td>${Number(tasks.asana) || 0}</td>
</tr>

<tr>
  <th align="left">Total Tasks</th>
  <td><strong>${Number(tasks.total) || 0}</strong></td>
</tr>

</table>

<div style="text-align:center;margin-top:40px;">

<a
  href="${safeReportUrl}"
  style="
    display:inline-block;
    background:#2563eb;
    color:#ffffff;
    text-decoration:none;
    padding:14px 30px;
    border-radius:8px;
    font-weight:bold;
  "
>
View Full Report
</a>

</div>

</td>
</tr>

</table>

<hr
  style="
    margin:40px 0 20px;
    border:none;
    border-top:1px solid #e5e7eb;
  "
>

<p
  style="
    text-align:center;
    color:#6b7280;
    font-size:13px;
    margin:0;
  "
>
This email was generated automatically by WorkComposer.
</p>

</td>
</tr>
</table>

</body>
</html>
`;
};
