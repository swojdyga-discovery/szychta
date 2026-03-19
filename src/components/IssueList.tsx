import { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import type { JiraIssue, JiraSubtask, JiraConfig, GitHubConfig, IssueReviewSummary, PrReviewInfo } from '../types/jira';
import { fetchIssueReviewSummary } from '../services/githubApi';
import { JIRA_BASE_URL } from '../services/jiraApi';
import { getLoadingText } from '../utils/text';

interface IssueListProps {
  issues: JiraIssue[];
  total: number;
  config: JiraConfig;
  ghConfig?: GitHubConfig | null;
  allowedRepos?: string[];
  gorolMode?: boolean;
}

const FINISHED_STATUSES = ['done', 'rejected', 'odrzucone', 'released'];

function isFinished(issue: JiraIssue): boolean {
  return FINISHED_STATUSES.includes(issue.fields.status.name.toLowerCase());
}

function isCodeReview(issue: JiraIssue): boolean {
  return issue.fields.status.name.toLowerCase() === 'code review';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusClass(statusName: string): string {
  const lower = statusName.toLowerCase();
  if (lower === 'done') return 'status-done';
  if (lower === 'rejected' || lower === 'odrzucone') return 'status-rejected';
  if (lower === 'released') return 'status-done';
  if (lower.includes('in progress') || lower.includes('w toku')) return 'status-in-progress';
  if (lower.includes('to do') || lower.includes('open') || lower.includes('nowe')) return 'status-todo';
  if (lower.includes('review') || lower.includes('test')) return 'status-review';
  if (lower.includes('blocked') || lower.includes('zablokow')) return 'status-blocked';
  return 'status-default';
}

function PrBadge({ pr }: { pr: PrReviewInfo }) {
  if (pr.error) {
    return (
      <span className="cr-inline-badge cr-inline-error" title={pr.error}>
        PR #{pr.prNumber}: błąd
      </span>
    );
  }

  const isClosed = pr.state === 'closed';
  const approvalsOk = pr.approvals >= 2;
  const repoShort = pr.repo.split('/').pop() || pr.repo;

  return (
    <a
      href={pr.prUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`cr-pr-row cr-pr-link ${isClosed ? 'cr-pr-closed' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="cr-pr-name" title={`${pr.repo} #${pr.prNumber}`}>
        {repoShort} #{pr.prNumber}
      </span>
      {isClosed && (
        <span className="cr-inline-badge cr-inline-closed">Closed</span>
      )}
      {pr.changesRequested > 0 && !isClosed && (
        <span className="cr-inline-badge cr-inline-changes">
          Changes: {pr.changesRequested}
        </span>
      )}
      {!isClosed && (
        <span className={`cr-inline-badge ${approvalsOk ? 'cr-inline-approvals-ok' : 'cr-inline-approvals-low'}`}>
          Approvals: {pr.approvals}
        </span>
      )}
    </a>
  );
}

function CrStatusBadge({ summary, gorolMode }: { summary: IssueReviewSummary | undefined; gorolMode?: boolean }) {
  // Always render reserved-height container to prevent layout jumps
  if (!summary || summary.loading) {
    return (
      <div className="cr-inline-badges cr-inline-badges--reserved">
        <span className="cr-inline-badge cr-inline-loading">{getLoadingText(gorolMode)}</span>
      </div>
    );
  }

  if (summary.error) {
    return (
      <div className="cr-inline-badges cr-inline-badges--reserved">
        <span className="cr-inline-badge cr-inline-error" title={summary.error}>CR: błąd</span>
      </div>
    );
  }

  return (
    <div className="cr-inline-badges cr-inline-badges--reserved">
      {summary.prs.length === 0 ? (
        <span className="cr-inline-badge cr-inline-none">Brak PR</span>
      ) : (
        summary.prs.map((pr) => (
          <PrBadge key={pr.prUrl} pr={pr} />
        ))
      )}
    </div>
  );
}

function SubtaskRow({ subtask, browseUrl }: { subtask: JiraSubtask; browseUrl: string }) {
  const isDone = subtask.fields.status.statusCategory.key === 'done';

  return (
    <a
      href={`${browseUrl}/browse/${subtask.key}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`subtask-row ${isDone ? 'subtask-done' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      {subtask.fields.issuetype?.iconUrl && (
        <img
          src={subtask.fields.issuetype.iconUrl}
          alt={subtask.fields.issuetype.name}
          className="subtask-type-icon"
          title={subtask.fields.issuetype?.name}
        />
      )}
      <span className="subtask-key">{subtask.key}</span>
      <span className={`subtask-summary ${isDone ? 'subtask-summary-done' : ''}`}>
        {subtask.fields.summary}
      </span>
      <span className={`subtask-status ${getStatusClass(subtask.fields.status.name)}`}>
        {subtask.fields.status.name}
      </span>
    </a>
  );
}

function IssueCard({
  issue,
  browseUrl,
  crSummary,
  gorolMode,
}: {
  issue: JiraIssue;
  browseUrl: string;
  crSummary?: IssueReviewSummary;
  gorolMode?: boolean;
}) {
  const showCr = isCodeReview(issue);
  const subtasks = issue.fields.subtasks;
  const hasSubtasks = subtasks && subtasks.length > 0;

  return (
    <div className={`issue-card-wrapper ${hasSubtasks ? 'issue-card-with-subtasks' : ''}`}>
      <a
        href={`${browseUrl}/browse/${issue.key}`}
        target="_blank"
        rel="noopener noreferrer"
        className="issue-card"
      >
        <div className="issue-card-header">
          <div className="issue-key-row">
            {issue.fields.issuetype?.iconUrl && (
              <img
                src={issue.fields.issuetype.iconUrl}
                alt={issue.fields.issuetype.name}
                className="issue-type-icon"
                title={issue.fields.issuetype?.name}
              />
            )}
            <span className="issue-key">{issue.key}</span>
            {issue.fields.priority?.iconUrl && (
              <img
                src={issue.fields.priority.iconUrl}
                alt={issue.fields.priority.name}
                className="priority-icon"
                title={issue.fields.priority?.name}
              />
            )}
          </div>
          <span className={`status-badge ${getStatusClass(issue.fields.status.name)}`}>
            {issue.fields.status.name}
          </span>
        </div>
        <h3 className="issue-summary">{issue.fields.summary}</h3>
        {showCr && <CrStatusBadge summary={crSummary} gorolMode={gorolMode} />}
        <div className="issue-meta">
          {issue.fields.project && (
            <span className="meta-item project-name">
              {issue.fields.project.name}
            </span>
          )}
          <span className="meta-item">
            Zaktualizowano: {formatDate(issue.fields.updated)}
          </span>
        </div>
      </a>
      {hasSubtasks && (
        <div className="subtask-list">
          <div className="subtask-list-header">
            Podzadania
            <span className="subtask-count">
              {subtasks.filter((s) => s.fields.status.statusCategory.key === 'done').length}/{subtasks.length}
            </span>
          </div>
          {subtasks.map((subtask) => (
            <SubtaskRow key={subtask.id} subtask={subtask} browseUrl={browseUrl} />
          ))}
        </div>
      )}
    </div>
  );
}

function getPrLinksToReview(
  crSummaries: Record<string, IssueReviewSummary>,
  codeReviewIssues: JiraIssue[],
): string[] {
  if (codeReviewIssues.length === 0) return [];

  for (const issue of codeReviewIssues) {
    const s = crSummaries[issue.key];
    if (!s || s.loading) return [];
  }

  const links: string[] = [];
  for (const issue of codeReviewIssues) {
    const summary = crSummaries[issue.key];
    for (const pr of summary.prs) {
      if (!pr.error && pr.approvals < 2 && pr.state !== 'closed') {
        links.push(pr.prUrl);
      }
    }
  }
  return links;
}

export function IssueList({ issues, config, ghConfig, allowedRepos, gorolMode }: IssueListProps) {
  const browseUrl = JIRA_BASE_URL;
  const [crSummaries, setCrSummaries] = useState<Record<string, IssueReviewSummary>>({});
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { active, finished } = useMemo(() => {
    const active: JiraIssue[] = [];
    const finished: JiraIssue[] = [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const issue of issues) {
      if (isFinished(issue)) {
        // Only show finished tasks updated in the last 30 days
        const updatedDate = new Date(issue.fields.updated);
        if (updatedDate >= thirtyDaysAgo) {
          finished.push(issue);
        }
      } else {
        active.push(issue);
      }
    }
    return { active, finished };
  }, [issues]);

  // Issues in "Code Review" status that need CR data fetched
  const codeReviewIssues = useMemo(
    () => active.filter(isCodeReview),
    [active]
  );

  const loadCrSummaries = useCallback(async () => {
    if (!ghConfig || codeReviewIssues.length === 0) {
      setCrSummaries({});
      return;
    }

    // Mark all as loading, reset old entries
    const loadingEntries: Record<string, IssueReviewSummary> = {};
    for (const issue of codeReviewIssues) {
      loadingEntries[issue.key] = {
        prs: [],
        loading: true,
      };
    }
    setCrSummaries(loadingEntries);

    // Fetch all in parallel (pass description to avoid extra API call)
    const results = await Promise.all(
      codeReviewIssues.map(async (issue) => {
        const summary = await fetchIssueReviewSummary(config, ghConfig, issue.key, issue.fields.description, allowedRepos);
        return { key: issue.key, summary };
      })
    );

    const newEntries: Record<string, IssueReviewSummary> = {};
    for (const { key, summary } of results) {
      newEntries[key] = summary;
    }
    setCrSummaries((prev) => ({ ...prev, ...newEntries }));
  }, [ghConfig, config, codeReviewIssues, allowedRepos]);

  useEffect(() => {
    loadCrSummaries();
  }, [loadCrSummaries]);

  const prLinksToReview = getPrLinksToReview(crSummaries, codeReviewIssues);

  const handleCopyPrLinks = async () => {
    if (prLinksToReview.length === 0) return;
    try {
      const text = 'Prośba o CR:\n' + prLinksToReview.map((link) => `- ${link}`).join('\n');
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard API may fail in insecure context */ }
  };

  return (
    <div className="issue-list-content">
      {issues.length === 0 ? (
        <div className="empty-state">
          <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2>Brak tasków!</h2>
          <p>Nie masz żadnych przypisanych tasków.</p>
        </div>
      ) : (
        <div className="board-columns">
          {/* Kolumna: Aktywne taski */}
          <div className="board-column">
            <div className="column-header">
              <h2>Taski</h2>
              <div className="column-header-actions">
                <button
                  className="btn-copy-pr-links"
                  onClick={handleCopyPrLinks}
                  title={prLinksToReview.join('\n')}
                  disabled={prLinksToReview.length === 0}
                  style={prLinksToReview.length === 0 ? { visibility: 'hidden' } : undefined}
                >
                  {copied
                    ? '✓ Skopiowano!'
                    : `Kopiuj linki do PR (${prLinksToReview.length})`}
                </button>
                <span className="column-count">{active.length}</span>
              </div>
            </div>
            <div className="column-cards">
              {active.length === 0 ? (
                <p className="column-empty">Brak aktywnych tasków</p>
              ) : (
                active.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    browseUrl={browseUrl}
                    crSummary={crSummaries[issue.key]}
                    gorolMode={gorolMode}
                  />
                ))
              )}
            </div>
          </div>

          {/* Kolumna: Zakończone / Odrzucone */}
          <div className="board-column column-finished">
            <div className="column-header">
              <h2>{gorolMode ? 'Zakończone' : 'Urobek'}</h2>
              <span className="column-count">{finished.length}</span>
            </div>
            <div className="column-cards">
              {finished.length === 0 ? (
                <p className="column-empty">Brak zakończonych tasków</p>
              ) : (
                finished.map((issue) => (
                  <IssueCard key={issue.id} issue={issue} browseUrl={browseUrl} />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Keep type export to not break anything
export type { IssueListProps };
