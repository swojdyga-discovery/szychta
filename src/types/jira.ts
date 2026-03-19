export interface JiraSubtask {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: {
      name: string;
      statusCategory: {
        key: string;
        name: string;
      };
    };
    issuetype?: {
      name: string;
      iconUrl: string;
    };
    priority?: {
      name: string;
      iconUrl: string;
    };
    assignee?: {
      displayName: string;
      avatarUrls?: Record<string, string>;
    };
  };
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: {
      name: string;
      statusCategory: {
        key: string;
        name: string;
      };
    };
    priority?: {
      name: string;
      iconUrl: string;
    };
    issuetype?: {
      name: string;
      iconUrl: string;
    };
    assignee?: {
      displayName: string;
      avatarUrls?: Record<string, string>;
    };
    project?: {
      key: string;
      name: string;
    };
    description?: string | null;
    created: string;
    updated: string;
    subtasks?: JiraSubtask[];
  };
}

export interface JiraSearchResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}


export interface JiraComment {
  id: string;
  body: string;
  author: {
    name: string;
    displayName: string;
  };
  created: string;
}

export interface JiraCommentsResponse {
  comments: JiraComment[];
  total: number;
}

export interface JiraConfig {
  token: string;
}

export interface GitHubConfig {
  token: string;
  username: string; // resolved automatically from GitHub API
}

export interface PullRequestReview {
  prUrl: string;
  prNumber: number;
  repo: string;
  owner: string;
  title: string;
  state: string; // 'open', 'closed', 'merged'
  prAuthor: string; // GitHub login of the PR author
  userApproved: boolean;
  userReviewState: string | null; // 'APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'PENDING', null
  totalApprovals: number;
  totalChangesRequested: number;
  totalCommented: number;
  loading: boolean;
  error?: string;
}

/** Per-PR review stats */
export interface PrReviewInfo {
  prUrl: string;
  prNumber: number;
  repo: string;
  title: string;
  prAuthor: string;
  state: string;
  approvals: number;
  changesRequested: number;
  error?: string;
}

/** Summary of all PR review stats for a single Jira issue (per-PR breakdown) */
export interface IssueReviewSummary {
  prs: PrReviewInfo[];
  loading: boolean;
  error?: string;
}

export interface CodeReviewIssue extends JiraIssue {
  pullRequests: PullRequestReview[];
  prLoading: boolean;
}

/* ── Tempo / Worklog types ── */

export interface TempoWorklog {
  timeSpentSeconds: number;
  started: string; // e.g. "2026-02-10T09:00:00.000+0000"
  comment?: string;
  issue?: {
    key: string;
    summary?: string;
  };
}

export interface TempoMonthSummary {
  /** Total seconds logged this month */
  loggedSeconds: number;
  /** Required seconds this month (business days × 8h) */
  requiredSeconds: number;
  /** Missing seconds (required - logged, min 0) */
  missingSeconds: number;
  /** Business days in this month */
  businessDays: number;
  /** Business days elapsed so far (up to today) */
  businessDaysElapsed: number;
  /** Required seconds up to today */
  requiredSecondsToDate: number;
  /** Missing seconds up to today (required to date - logged, min 0) */
  missingSecondsToDate: number;
  /** Worklogs for the month */
  worklogs: TempoWorklog[];
}

/** Status of the previous month's timesheet */
export interface PreviousMonthStatus {
  /** Month name (e.g. "Luty") */
  monthName: string;
  /** Year */
  year: number;
  /** Total required seconds for the month */
  requiredSeconds: number;
  /** Total logged seconds for the month */
  loggedSeconds: number;
  /** Missing seconds (required - logged, min 0) */
  missingSeconds: number;
}

/** Task the user was involved in recently (based on assignment history) */
export interface RecentTask {
  issueKey: string;
  summary: string;
  status: string;
  statusCategoryKey: string;
  projectKey: string;
  updated: string;
}
