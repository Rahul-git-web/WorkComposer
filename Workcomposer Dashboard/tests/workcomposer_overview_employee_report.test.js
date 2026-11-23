import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatDateForApi, getAppTimezone } from '../src/utils/appTimezone.ts';
import { isTeamReportAccess } from '../src/utils/reportAccess.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DASHBOARD_DIR = path.resolve(__dirname, '..');

const OVERVIEW_HEADER_PATH = path.join(
  DASHBOARD_DIR,
  'src/app/dashboard/time-tracking/overview/OverviewHeader.tsx'
);
const OVERVIEW_CONTENT_PATH = path.join(
  DASHBOARD_DIR,
  'src/app/dashboard/time-tracking/overview/OverviewContent.tsx'
);
const DAILY_TIMELINE_PATH = path.join(
  DASHBOARD_DIR,
  'src/app/dashboard/time-tracking/overview/components/DailyActivityTimeline.tsx'
);
const USER_ANALYTICS_PATH = path.join(
  DASHBOARD_DIR,
  'src/app/dashboard/time-tracking/overview/components/UserAnalyticsSection.tsx'
);

test('WORKCOMPOSER — Phase 1: Employee My Report Overview Refinements', async (t) => {
  await t.test('1. OverviewHeader dynamically formats timezone without hardcoded Asia/Calcutta string', () => {
    const src = fs.readFileSync(OVERVIEW_HEADER_PATH, 'utf-8');
    assert.ok(
      !src.includes('Timezone: Asia/Calcutta (UTC+05:30)'),
      'OverviewHeader must NOT contain hardcoded "Timezone: Asia/Calcutta (UTC+05:30)" string'
    );
    assert.ok(
      src.includes('getAppTimezone'),
      'OverviewHeader must import and call getAppTimezone'
    );
    assert.ok(
      src.includes('effectiveTimezone'),
      'OverviewHeader must compute effectiveTimezone'
    );
    assert.ok(
      src.includes('timezoneDisplay'),
      'OverviewHeader must render dynamic timezoneDisplay'
    );
  });

  await t.test('2. DailyActivityTimeline uses formatDateForApi in configured timezone (no naive toISOString UTC slicing)', () => {
    const src = fs.readFileSync(DAILY_TIMELINE_PATH, 'utf-8');
    assert.ok(
      !src.includes('.toISOString().split("T")[0]'),
      'DailyActivityTimeline must NOT use naive .toISOString().split("T")[0]'
    );
    assert.ok(
      src.includes('formatDateForApi'),
      'DailyActivityTimeline must use formatDateForApi'
    );
    assert.ok(
      src.includes('useAppTimezone'),
      'DailyActivityTimeline must consume useAppTimezone'
    );
  });

  await t.test('3. Date formatting parity across late evening / morning hours', () => {
    // 11:45 PM in Asia/Kolkata (+05:30) on 2026-11-21 is 18:15 UTC on 2026-11-21
    const lateEveningIST = new Date('2026-11-21T18:15:00.000Z');
    const formattedIST = formatDateForApi(lateEveningIST, 'Asia/Kolkata');
    assert.strictEqual(formattedIST, '2026-11-21');

    // 01:15 AM in Asia/Kolkata on 2026-11-22 is 19:45 UTC on 2026-11-21 (UTC is 21st, IST is 22nd)
    const earlyMorningIST = new Date('2026-11-21T19:45:00.000Z');
    const formattedMorning = formatDateForApi(earlyMorningIST, 'Asia/Kolkata');
    assert.strictEqual(formattedMorning, '2026-11-22', 'Must resolve to Nov 22 in Asia/Kolkata');
  });

  await t.test('4. OverviewContent renders "My Report" and Personal View badge for non-team users', () => {
    const src = fs.readFileSync(OVERVIEW_CONTENT_PATH, 'utf-8');
    assert.ok(
      src.includes('isTeamReport ? "Team Report" : "My Report"'),
      'OverviewContent must toggle between Team Report and My Report'
    );
    assert.ok(
      src.includes('Personal View'),
      'OverviewContent must render Personal View indicator when in personal mode'
    );
    assert.ok(
      src.includes('rounded-2xl'),
      'OverviewContent must use rounded-2xl modern card borders'
    );
    assert.ok(
      src.includes('dark:border-[#22324D]'),
      'OverviewContent must use dark:border-[#22324D] token'
    );
  });

  await t.test('5. RBAC invariant: employee role: "user" fails closed to personal mode', () => {
    const regularEmployee = { role: 'user', reportAccess: 'own' };
    assert.strictEqual(isTeamReportAccess(regularEmployee), false, 'Employee with reportAccess: "own" must resolve to personal mode');

    const restrictedEmployee = { role: 'user', reportAccess: 'none' };
    assert.strictEqual(isTeamReportAccess(restrictedEmployee), false, 'Employee with reportAccess: "none" must resolve to personal mode');

    const unconfiguredEmployee = { role: 'user' };
    assert.strictEqual(isTeamReportAccess(unconfiguredEmployee), false, 'Unconfigured employee must resolve to personal mode');

    const teamManager = { role: 'manager', reportAccess: 'managed' };
    assert.strictEqual(isTeamReportAccess(teamManager), true, 'Manager with managed scope must resolve to team mode');

    const orgOwner = { role: 'owner' };
    assert.strictEqual(isTeamReportAccess(orgOwner), true, 'Owner must resolve to team mode');
  });

  await t.test('6. UserAnalyticsSection maintains testids and responsive card structure', () => {
    const src = fs.readFileSync(USER_ANALYTICS_PATH, 'utf-8');
    assert.ok(src.includes('data-testid="user-analytics-loading"'));
    assert.ok(src.includes('data-testid="user-analytics-error"'));
    assert.ok(src.includes('data-testid="user-no-tracking-data"'));
    assert.ok(src.includes('data-testid="user-analytics-cards"'));
    assert.ok(src.includes('dark:border-[#22324D]'));
    assert.ok(src.includes('dark:bg-[#0F172A]'));
  });

  await t.test('7. 4-card KPI strip presence in OverviewContent', () => {
    const src = fs.readFileSync(OVERVIEW_CONTENT_PATH, 'utf-8');
    assert.ok(src.includes('data-testid="overview-team-kpi-strip"'), 'KPI strip container must exist');
    assert.ok(src.includes('ACTIVITY (RANGE)'), 'Must include ACTIVITY (RANGE) KPI card');
    assert.ok(src.includes('WORKED (RANGE)'), 'Must include WORKED (RANGE) KPI card');
    assert.ok(src.includes('BREAK (RANGE)'), 'Must include BREAK (RANGE) KPI card');
    assert.ok(src.includes('COVERAGE (RANGE)'), 'Must include COVERAGE (RANGE) KPI card');
  });

  await t.test('8. 9-column headers defined for desktop table', () => {
    const src = fs.readFileSync(OVERVIEW_CONTENT_PATH, 'utf-8');
    assert.ok(src.includes('Person'));
    assert.ok(src.includes('STATUS NOW'));
    assert.ok(src.includes('Worked'));
    assert.ok(src.includes('Break'));
    assert.ok(src.includes('Activity'));
    assert.ok(src.includes('Prod'));
    assert.ok(src.includes('TREND'));
  });

  await t.test('9. Expanded action bar and timezone-aware daily details banner', () => {
    const src = fs.readFileSync(OVERVIEW_CONTENT_PATH, 'utf-8');
    assert.ok(src.includes('View profile'), 'Expanded action bar must contain View profile trigger');
    assert.ok(src.includes('Add / edit time'), 'Expanded action bar must contain Add / edit time button');
    assert.ok(src.includes('Daily details:'), 'Must contain Daily details banner');
    assert.ok(src.includes('to boundary'), 'Must state boundary in banner');
  });

  await t.test('10. Tabular activity history with DAY, WORKED, BREAK columns', () => {
    const src = fs.readFileSync(DAILY_TIMELINE_PATH, 'utf-8');
    assert.ok(src.includes('Days/periods with recorded time in this detail window'), 'Must render tabular header');
    assert.ok(src.includes('>\n                  DAY\n                </th>') || src.includes('DAY'), 'Must render DAY column header');
    assert.ok(src.includes('WORKED'), 'Must render WORKED column header');
    assert.ok(src.includes('BREAK'), 'Must render BREAK column header');
    assert.ok(src.includes('font-mono tabular-nums'), 'Must format durations with font-mono tabular-nums');
  });

  await t.test('11. Client-side PapaParse CSV export handler', () => {
    const src = fs.readFileSync(OVERVIEW_CONTENT_PATH, 'utf-8');
    assert.ok(src.includes('Papa.unparse'), 'Must call Papa.unparse for CSV serialization');
    assert.ok(src.includes('text/csv'), 'Must generate text/csv blob');
    assert.ok(src.includes('workcomposer-report-'), 'Must specify download filename pattern');
  });

  await t.test('12. Productivity card ratio breakdown and color badges in UserAnalyticsSection', () => {
    const src = fs.readFileSync(USER_ANALYTICS_PATH, 'utf-8');
    assert.ok(src.includes('Productivity'), 'Must render Productivity card title');
    assert.ok(src.includes('Ratio Breakdown'), 'Must display Ratio Breakdown progress');
    assert.ok(src.includes('bg-emerald-500'), 'Must color productive time emerald-500');
    assert.ok(src.includes('bg-rose-500'), 'Must color unproductive time rose-500');
  });
});

