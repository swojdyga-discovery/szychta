import type { JiraConfig, JiraSearchResponse, JiraCommentsResponse, TempoWorklog, TempoMonthSummary, RecentTask, PreviousMonthStatus } from '../types/jira';

function buildJql(): string {
  return `assignee = currentUser() ORDER BY updated DESC`;
}

function buildCodeReviewJql(): string {
  return `status = "Code Review" ORDER BY updated DESC`;
}

/** Hardcoded Jira Server base URL */
export const JIRA_BASE_URL = 'https://jira.pl.grupa.iti';

/**
 * Builds the API URL. Requests go through local CORS proxy at localhost:8010.
 */
function buildApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `http://localhost:8010/proxy${cleanPath}`;
}

export async function fetchMyIssues(
  config: JiraConfig,
  startAt = 0,
  maxResults = 50
): Promise<JiraSearchResponse> {
  const jql = buildJql();
  const params = new URLSearchParams({
    jql,
    startAt: String(startAt),
    maxResults: String(maxResults),
    fields: 'summary,status,priority,issuetype,assignee,project,created,updated,description',
  });

  const url = `${buildApiUrl('/rest/api/2/search')}?${params.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jira API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function fetchAllMyIssues(
  config: JiraConfig
): Promise<JiraSearchResponse> {
  const pageSize = 50;
  let startAt = 0;
  let allIssues: JiraSearchResponse['issues'] = [];
  let total = 0;

  do {
    const response = await fetchMyIssues(config, startAt, pageSize);
    allIssues = [...allIssues, ...response.issues];
    total = response.total;
    startAt += pageSize;
  } while (startAt < total);

  return {
    startAt: 0,
    maxResults: total,
    total,
    issues: allIssues,
  };
}

export async function fetchCodeReviewIssues(
  config: JiraConfig,
  startAt = 0,
  maxResults = 50
): Promise<JiraSearchResponse> {
  const jql = buildCodeReviewJql();
  const params = new URLSearchParams({
    jql,
    startAt: String(startAt),
    maxResults: String(maxResults),
    fields: 'summary,status,priority,issuetype,assignee,project,created,updated,description',
  });

  const url = `${buildApiUrl('/rest/api/2/search')}?${params.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jira API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function fetchAllCodeReviewIssues(
  config: JiraConfig
): Promise<JiraSearchResponse> {
  const pageSize = 50;
  let startAt = 0;
  let allIssues: JiraSearchResponse['issues'] = [];
  let total = 0;

  do {
    const response = await fetchCodeReviewIssues(config, startAt, pageSize);
    allIssues = [...allIssues, ...response.issues];
    total = response.total;
    startAt += pageSize;
  } while (startAt < total);

  return {
    startAt: 0,
    maxResults: total,
    total,
    issues: allIssues,
  };
}

/**
 * Fetches sprint info for a given Jira issue key via the Agile API.
 * Returns sprint IDs (both active and closed) that the issue belongs to.
 */
export async function fetchIssueSprintIds(
  config: JiraConfig,
  issueKey: string
): Promise<number[]> {
  const url = `${buildApiUrl(`/rest/agile/1.0/issue/${issueKey}`)}?fields=sprint,closedSprints`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) return [];

    const data = await response.json();
    const ids: number[] = [];

    // Active sprint
    if (data.fields?.sprint?.id) {
      ids.push(data.fields.sprint.id);
    }

    // Closed sprints
    if (Array.isArray(data.fields?.closedSprints)) {
      for (const s of data.fields.closedSprints) {
        if (s.id) ids.push(s.id);
      }
    }

    return ids;
  } catch {
    return [];
  }
}

/**
 * Given a set of issue keys (user's tasks), fetches their sprint IDs.
 * Then finds the board(s) those sprints belong to.
 * Returns the unique board IDs.
 */
export async function findMyBoardIds(
  config: JiraConfig,
  myIssueKeys: string[]
): Promise<number[]> {
  // Take a sample of user's issues (up to 10) to find sprint IDs
  const sample = myIssueKeys.slice(0, 10);
  const sprintIds = new Set<number>();

  await Promise.all(
    sample.map(async (key) => {
      const ids = await fetchIssueSprintIds(config, key);
      for (const id of ids) sprintIds.add(id);
    })
  );

  if (sprintIds.size === 0) return [];

  // For each sprint, find its board via /rest/agile/1.0/board?type=scrum (checking all boards)
  // Actually, sprints belong to a single board. We can find the board by checking
  // /rest/agile/1.0/sprint/{sprintId} which returns the board (originBoardId)
  const boardIds = new Set<number>();

  await Promise.all(
    Array.from(sprintIds).map(async (sprintId) => {
      const url = `${buildApiUrl(`/rest/agile/1.0/sprint/${sprintId}`)}`;
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${config.token}`,
            Accept: 'application/json',
          },
        });
        if (!response.ok) return;
        const data = await response.json();
        if (data.originBoardId) {
          boardIds.add(data.originBoardId);
        }
      } catch {
        // ignore
      }
    })
  );

  return Array.from(boardIds);
}

/**
 * Fetch Code Review issues from a specific Jira Agile board.
 */
export async function fetchBoardCodeReviewIssues(
  config: JiraConfig,
  boardId: number,
  startAt = 0,
  maxResults = 50
): Promise<JiraSearchResponse> {
  const jql = `status = "Code Review" ORDER BY updated DESC`;
  const params = new URLSearchParams({
    jql,
    startAt: String(startAt),
    maxResults: String(maxResults),
    fields: 'summary,status,priority,issuetype,assignee,project,created,updated,description',
  });

  const url = `${buildApiUrl(`/rest/agile/1.0/board/${boardId}/issue`)}?${params.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jira Agile API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Fetch ALL Code Review issues from a specific board (paginated).
 */
export async function fetchAllBoardCodeReviewIssues(
  config: JiraConfig,
  boardId: number
): Promise<JiraSearchResponse> {
  const pageSize = 50;
  let startAt = 0;
  let allIssues: JiraSearchResponse['issues'] = [];
  let total = 0;

  do {
    const response = await fetchBoardCodeReviewIssues(config, boardId, startAt, pageSize);
    allIssues = [...allIssues, ...response.issues];
    total = response.total;
    startAt += pageSize;
  } while (startAt < total);

  return {
    startAt: 0,
    maxResults: total,
    total,
    issues: allIssues,
  };
}

export async function fetchIssueDescription(
  config: JiraConfig,
  issueKey: string
): Promise<string> {
  const url = `${buildApiUrl(`/rest/api/2/issue/${issueKey}`)}?fields=description`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return ''; // Silently return empty if we can't fetch description
  }

  const data = await response.json();
  return data.fields?.description || '';
}

export async function fetchIssueComments(
  config: JiraConfig,
  issueKey: string
): Promise<JiraCommentsResponse> {
  const url = buildApiUrl(`/rest/api/2/issue/${issueKey}/comment`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jira API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/* ── Tempo / Worklog helpers ── */

/**
 * Returns the Jira username of the currently authenticated user.
 */
export async function fetchCurrentJiraUser(config: JiraConfig): Promise<string> {
  const url = buildApiUrl('/rest/api/2/myself');

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Nie udało się pobrać danych użytkownika Jira (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  // Jira Server returns "name" (username), Jira Cloud returns "accountId"
  return data.name || data.key || data.accountId;
}

/**
 * Counts business days (Mon-Fri) in a date range [start, end] inclusive.
 */
function countBusinessDays(start: Date, end: Date): number {
  let count = 0;
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setHours(0, 0, 0, 0);

  while (d <= endDate) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }

  return count;
}

/**
 * Fetches worklogs for the current month using the Tempo Timesheets REST API.
 * Falls back to Jira's own worklog search if Tempo is not available.
 */
export async function fetchTempoMonthSummary(
  config: JiraConfig
): Promise<TempoMonthSummary> {
  const username = await fetchCurrentJiraUser(config);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based

  // First & last day of current month
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const dateFrom = formatDate(firstDay);
  const dateTo = formatDate(lastDay);

  // Business days
  const businessDays = countBusinessDays(firstDay, lastDay);

  // Business days elapsed (up to today, or last day if month has ended)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const effectiveEnd = today < lastDay ? today : lastDay;
  const businessDaysElapsed = countBusinessDays(firstDay, effectiveEnd);

  // 8 hours per business day
  const requiredSeconds = businessDays * 8 * 3600;
  const requiredSecondsToDate = businessDaysElapsed * 8 * 3600;

  // Try Tempo REST API first
  let worklogs: TempoWorklog[] = [];

  try {
    worklogs = await fetchTempoWorklogs(config, username, dateFrom, dateTo);
  } catch {
    // Tempo plugin may not be available — try Jira's built-in worklog search
    try {
      worklogs = await fetchJiraWorklogs(config, username, dateFrom, dateTo);
    } catch (err2) {
      throw new Error(
        `Nie udało się pobrać worklogów: ${err2 instanceof Error ? err2.message : 'Nieznany błąd'}`
      );
    }
  }

  const loggedSeconds = worklogs.reduce((sum, w) => sum + w.timeSpentSeconds, 0);

  return {
    loggedSeconds,
    requiredSeconds,
    missingSeconds: Math.max(0, requiredSeconds - loggedSeconds),
    businessDays,
    businessDaysElapsed,
    requiredSecondsToDate,
    missingSecondsToDate: Math.max(0, requiredSecondsToDate - loggedSeconds),
    worklogs,
  };
}

const MONTH_NAMES_PL = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
];

/**
 * Fetches the previous month's timesheet status:
 * - hours logged vs required
 * - approval status (via Tempo timesheet-approval API)
 */
export async function fetchPreviousMonthStatus(
  config: JiraConfig
): Promise<PreviousMonthStatus> {
  const username = await fetchCurrentJiraUser(config);

  const now = new Date();
  let prevMonth = now.getMonth() - 1; // 0-based
  let prevYear = now.getFullYear();
  if (prevMonth < 0) {
    prevMonth = 11;
    prevYear -= 1;
  }

  const firstDay = new Date(prevYear, prevMonth, 1);
  const lastDay = new Date(prevYear, prevMonth + 1, 0);

  const dateFrom = formatDate(firstDay);
  const dateTo = formatDate(lastDay);

  // Business days & required hours
  const businessDays = countBusinessDays(firstDay, lastDay);
  const requiredSeconds = businessDays * 8 * 3600;

  // Fetch worklogs for previous month
  let worklogs: TempoWorklog[] = [];
  try {
    worklogs = await fetchTempoWorklogs(config, username, dateFrom, dateTo);
  } catch {
    try {
      worklogs = await fetchJiraWorklogs(config, username, dateFrom, dateTo);
    } catch {
      // If we can't fetch worklogs, assume 0 logged
    }
  }

  const loggedSeconds = worklogs.reduce((sum, w) => sum + w.timeSpentSeconds, 0);

  return {
    monthName: MONTH_NAMES_PL[prevMonth],
    year: prevYear,
    requiredSeconds,
    loggedSeconds,
    missingSeconds: Math.max(0, requiredSeconds - loggedSeconds),
  };
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Fetch worklogs via Tempo Timesheets REST API (Jira Server plugin).
 */
async function fetchTempoWorklogs(
  config: JiraConfig,
  username: string,
  dateFrom: string,
  dateTo: string
): Promise<TempoWorklog[]> {
  const params = new URLSearchParams({
    dateFrom,
    dateTo,
    username,
  });

  const url = `${buildApiUrl('/rest/tempo-timesheets/4/worklogs')}?${params.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Tempo API error (${response.status})`);
  }

  const data = await response.json();

  // Tempo returns an array of worklog objects directly
  const rawItems: Array<Record<string, unknown>> = Array.isArray(data) ? data : (data.worklogs || data.results || []);

  return rawItems.map((item) => ({
    timeSpentSeconds: (item.timeSpentSeconds || item.billedSeconds || 0) as number,
    started: (item.started || item.dateStarted || '') as string,
    comment: (item.comment || item.description || '') as string,
    issue: item.issue
      ? {
          key: ((item.issue as Record<string, unknown>).key || '') as string,
          summary: ((item.issue as Record<string, unknown>).summary || '') as string,
        }
      : undefined,
  }));
}

/**
 * Fallback: fetch worklogs using Jira's standard search + worklog endpoint.
 * Finds issues with worklogs by this user in the date range,
 * then reads each issue's worklogs.
 */
async function fetchJiraWorklogs(
  config: JiraConfig,
  username: string,
  dateFrom: string,
  dateTo: string
): Promise<TempoWorklog[]> {
  // Find issues where this user logged work in the date range
  const jql = `worklogAuthor = "${username}" AND worklogDate >= "${dateFrom}" AND worklogDate <= "${dateTo}"`;
  const params = new URLSearchParams({
    jql,
    fields: 'summary',
    maxResults: '200',
  });

  const url = `${buildApiUrl('/rest/api/2/search')}?${params.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Jira worklog search error (${response.status})`);
  }

  const searchData: JiraSearchResponse = await response.json();
  const fromTime = new Date(dateFrom).getTime();
  const toTime = new Date(dateTo + 'T23:59:59').getTime();

  const allWorklogs: TempoWorklog[] = [];

  // For each issue, fetch worklogs
  await Promise.all(
    searchData.issues.map(async (issue) => {
      const wlUrl = buildApiUrl(`/rest/api/2/issue/${issue.key}/worklog`);
      try {
        const wlResp = await fetch(wlUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${config.token}`,
            Accept: 'application/json',
          },
        });

        if (!wlResp.ok) return;

        const wlData = await wlResp.json();
        const items: Array<Record<string, unknown>> = wlData.worklogs || [];

        for (const wl of items) {
          const author = wl.author as Record<string, string> | undefined;
          const authorName = author?.name || author?.key || '';
          const started = (wl.started || '') as string;
          const startTime = new Date(started).getTime();

          if (
            authorName === username &&
            startTime >= fromTime &&
            startTime <= toTime
          ) {
            allWorklogs.push({
              timeSpentSeconds: (wl.timeSpentSeconds || 0) as number,
              started,
              comment: (wl.comment || '') as string,
              issue: {
                key: issue.key,
                summary: issue.fields.summary,
              },
            });
          }
        }
      } catch {
        // skip
      }
    })
  );

  return allWorklogs;
}

/**
 * Fetches tasks the user was involved in during the last N days (default 30).
 * Uses JQL `assignee WAS currentUser() DURING(...)` to only return tasks
 * where the user was assigned within the specified time window (not just
 * "ever assigned + recently updated"). Falls back to `assignee = currentUser()`
 * if the WAS/DURING query is not supported by the Jira instance.
 */
export async function fetchRecentTasks(
  config: JiraConfig,
  days = 30
): Promise<RecentTask[]> {
  // Primary JQL — DURING limits the WAS check to the last N days only
  const jqlWas = `assignee WAS currentUser() DURING (startOfDay(-${days}d), now()) ORDER BY updated DESC`;
  // Fallback JQL — simpler, works on all Jira versions
  const jqlFallback = `assignee = currentUser() AND updated >= -${days}d ORDER BY updated DESC`;

  let allIssues: JiraSearchResponse['issues'] = [];

  for (const jql of [jqlWas, jqlFallback]) {
    try {
      allIssues = await fetchAllIssuesByJql(config, jql);
      break; // success — no need for fallback
    } catch {
      if (jql === jqlFallback) {
        throw new Error('Nie udało się pobrać ostatnich zadań');
      }
      // WAS query failed — try fallback
    }
  }

  return allIssues.map((issue) => ({
    issueKey: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status.name,
    statusCategoryKey: issue.fields.status.statusCategory.key,
    projectKey: issue.fields.project?.key || '',
    updated: issue.fields.updated,
  }));
}

/**
 * Generic paginated fetch for any JQL query. Returns all matching issues.
 */
async function fetchAllIssuesByJql(
  config: JiraConfig,
  jql: string
): Promise<JiraSearchResponse['issues']> {
  const pageSize = 50;
  let startAt = 0;
  let allIssues: JiraSearchResponse['issues'] = [];
  let total = 0;

  do {
    const params = new URLSearchParams({
      jql,
      startAt: String(startAt),
      maxResults: String(pageSize),
      fields: 'summary,status,priority,issuetype,assignee,project,created,updated',
    });

    const url = `${buildApiUrl('/rest/api/2/search')}?${params.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jira API error (${response.status}): ${errorText}`);
    }

    const data: JiraSearchResponse = await response.json();
    allIssues = [...allIssues, ...data.issues];
    total = data.total;
    startAt += pageSize;
  } while (startAt < total);

  return allIssues;
}
