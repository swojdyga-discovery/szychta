import { useEffect, useState, useCallback } from 'react';
import type { JiraIssue, JiraConfig, GitHubConfig, CodeReviewIssue, PullRequestReview } from '../types/jira';
import { fetchAllCodeReviewIssues, fetchIssueComments, findMyBoardIds, fetchAllBoardCodeReviewIssues, JIRA_BASE_URL } from '../services/jiraApi';
import { extractPrUrls, checkPrReviewStatus } from '../services/githubApi';
import { getLoadingText } from '../utils/text';

interface CodeReviewListProps {
  jiraConfig: JiraConfig;
  ghConfig: GitHubConfig;
  myIssueKeys: string[];
  allowedRepos: string[];
  gorolMode?: boolean;
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

function ReviewBadge({ pr, gorolMode }: { pr: PullRequestReview; gorolMode?: boolean }) {
  if (pr.loading) {
    return <span className="review-badge review-loading">{getLoadingText(gorolMode)}</span>;
  }
  if (pr.error) {
    return <span className="review-badge review-error" title={pr.error}>Błąd</span>;
  }
  if (pr.userApproved) {
    return <span className="review-badge review-approved">✓ Approved</span>;
  }
  if (pr.userReviewState === 'CHANGES_REQUESTED') {
    return <span className="review-badge review-changes">⟳ Changes Requested</span>;
  }
  if (pr.userReviewState === 'COMMENTED') {
    return <span className="review-badge review-commented">💬 Commented</span>;
  }
  return <span className="review-badge review-pending">⏳ Do review</span>;
}

function PrCard({ pr, gorolMode }: { pr: PullRequestReview; gorolMode?: boolean }) {
  const isClosed = pr.state === 'closed';

  return (
    <a
      href={pr.prUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`pr-card ${isClosed ? 'pr-card-closed' : ''}`}
    >
      <div className="pr-card-header">
        <span className="pr-repo">{pr.repo}</span>
        <ReviewBadge pr={pr} gorolMode={gorolMode} />
      </div>
      <div className="pr-title">
        <span className="pr-number">#{pr.prNumber}</span> {pr.title}
      </div>
      <div className="pr-stats">
        {pr.state && (
          <span className={`pr-state pr-state-${pr.state}`}>
            {pr.state === 'merged' ? 'Merged' : pr.state === 'open' ? 'Open' : pr.state === 'closed' ? 'Closed' : pr.state}
          </span>
        )}
        {!pr.loading && !pr.error && (
          <>
            <span className={`pr-stat-badge ${pr.totalApprovals >= 2 ? 'pr-stat-ok' : 'pr-stat-low'}`}>
              ✓ {pr.totalApprovals} {pr.totalApprovals === 1 ? 'approval' : 'approvals'}
            </span>
            {pr.totalChangesRequested > 0 && (
              <span className="pr-stat-badge pr-stat-changes">
                ⟳ {pr.totalChangesRequested} changes requested
              </span>
            )}
            {pr.totalCommented > 0 && (
              <span className="pr-stat-badge pr-stat-commented">
                💬 {pr.totalCommented} {gorolMode ? (pr.totalCommented === 1 ? 'komentarz' : 'komentarze') : (pr.totalCommented === 1 ? 'wąt' : 'wąty')}
              </span>
            )}
          </>
        )}
      </div>
    </a>
  );
}

function CodeReviewIssueCard({ issue, browseUrl, gorolMode }: { issue: CodeReviewIssue; browseUrl: string; gorolMode?: boolean }) {
  const activePrs = issue.pullRequests.filter((pr) => pr.state !== 'closed');

  const needsReview = activePrs.some(
    (pr) => !pr.loading && !pr.error && !pr.userApproved && pr.userReviewState !== 'CHANGES_REQUESTED'
  );

  const allApproved = activePrs.length > 0 && activePrs.every(
    (pr) => pr.userApproved
  );

  return (
    <div className={`cr-issue-card ${needsReview ? 'cr-needs-review' : ''} ${allApproved ? 'cr-all-approved' : ''}`}>
      <div className="cr-issue-header">
        <a
          href={`${browseUrl}/browse/${issue.key}`}
          target="_blank"
          rel="noopener noreferrer"
          className="cr-issue-link"
        >
          <div className="issue-key-row">
            {issue.fields.issuetype?.iconUrl && (
              <img
                src={issue.fields.issuetype.iconUrl}
                alt={issue.fields.issuetype?.name || ''}
                className="issue-type-icon"
                title={issue.fields.issuetype?.name}
              />
            )}
            <span className="issue-key">{issue.key}</span>
            {issue.fields.priority?.iconUrl && (
              <img
                src={issue.fields.priority.iconUrl}
                alt={issue.fields.priority?.name || ''}
                className="priority-icon"
                title={issue.fields.priority?.name}
              />
            )}
          </div>
        </a>
        <div className="cr-status-group">
          {needsReview && (
            <span className="cr-action-badge cr-action-needed">Wymaga review</span>
          )}
          {allApproved && (
            <span className="cr-action-badge cr-action-done">Approved ✓</span>
          )}
        </div>
      </div>

      <h3 className="issue-summary">
        <a
          href={`${browseUrl}/browse/${issue.key}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit', textDecoration: 'none' }}
        >
          {issue.fields.summary}
        </a>
      </h3>

      <div className="issue-meta" style={{ marginBottom: '0.75rem' }}>
        {issue.fields.project && (
          <span className="meta-item project-name">{issue.fields.project.name}</span>
        )}
        {issue.fields.assignee && (
          <span className="meta-item">{issue.fields.assignee.displayName}</span>
        )}
        <span className="meta-item">
          Zaktualizowano: {formatDate(issue.fields.updated)}
        </span>
      </div>

      {issue.prLoading ? (
        <div className="pr-loading">
          <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
          <span>{getLoadingText(gorolMode)}</span>
        </div>
      ) : issue.pullRequests.length === 0 ? (
        <div className="pr-empty">Brak linków do PR-ów w komentarzach</div>
      ) : (
        <div className="pr-list">
          {issue.pullRequests.map((pr) => (
            <PrCard key={pr.prUrl} pr={pr} gorolMode={gorolMode} />
          ))}
        </div>
      )}
    </div>
  );
}

export function CodeReviewList({ jiraConfig, ghConfig, myIssueKeys, allowedRepos, gorolMode }: CodeReviewListProps) {
  const [myBoardIssues, setMyBoardIssues] = useState<CodeReviewIssue[]>([]);
  const [otherTeamIssues, setOtherTeamIssues] = useState<CodeReviewIssue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const browseUrl = JIRA_BASE_URL;

  /**
   * Process a list of Jira issues: fetch comments, extract PRs, check reviews.
   * Returns only issues that have matching PRs from ALLOWED_REPOS.
   */
  const processIssues = useCallback(async (issues: JiraIssue[]): Promise<CodeReviewIssue[]> => {
    const results = await Promise.all(
      issues.map(async (issue: JiraIssue) => {
        try {
          const commentsData = await fetchIssueComments(jiraConfig, issue.key);
          const allCommentText = commentsData.comments.map((c) => c.body).join('\n');
          const descriptionText = issue.fields.description || '';
          const allText = `${descriptionText}\n${allCommentText}`;
          const allPrLinks = extractPrUrls(allText);

          const prLinks = allowedRepos.length > 0
            ? allPrLinks.filter((pr) =>
                allowedRepos.some((allowed) => {
                  const [allowedOwner, allowedRepo] = allowed.split('/');
                  return pr.owner === allowedOwner && pr.repo === allowedRepo;
                })
              )
            : allPrLinks;

          if (prLinks.length === 0) {
            return { issue, pullRequests: [] as PullRequestReview[], hasAllowedPrs: false };
          }

          const prStatuses = await Promise.all(
            prLinks.map((pr) =>
              checkPrReviewStatus(ghConfig, pr.owner, pr.repo, pr.prNumber, pr.url)
            )
          );

          // Filter out PRs where the logged-in user is the author
          // and filter out already merged PRs
          const filteredPrs = prStatuses.filter(
            (pr) =>
              pr.prAuthor.toLowerCase() !== ghConfig.username.toLowerCase() &&
              pr.state !== 'merged'
          );

          if (filteredPrs.length === 0) {
            return { issue, pullRequests: [] as PullRequestReview[], hasAllowedPrs: false };
          }

          return { issue, pullRequests: filteredPrs, hasAllowedPrs: true };
        } catch (innerErr) {
          console.error(`Error processing ${issue.key}:`, innerErr);
          return { issue, pullRequests: [] as PullRequestReview[], hasAllowedPrs: false };
        }
      })
    );

    return results
      .filter((r) => r.hasAllowedPrs)
      .map((r) => ({
        ...r.issue,
        pullRequests: r.pullRequests,
        prLoading: false,
      }));
  }, [jiraConfig, ghConfig, allowedRepos]);

  const loadCodeReviewIssues = useCallback(async () => {
    if (allowedRepos.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      // 1) Find board IDs from user's issue sprints → sprint → originBoardId
      let myBoardIssueKeys = new Set<string>();
      let myBoardRaw: JiraIssue[] = [];

      if (myIssueKeys.length > 0) {
        const boardIds = await findMyBoardIds(jiraConfig, myIssueKeys);
        console.log('[CR] Found board IDs from sprints:', boardIds);

        // 2) Fetch CR issues from user's boards (= "my board")
        for (const boardId of boardIds) {
          try {
            const boardData = await fetchAllBoardCodeReviewIssues(jiraConfig, boardId);
            console.log(`[CR] Board ${boardId}: ${boardData.issues.length} CR issues`);
            for (const issue of boardData.issues) {
              if (!myBoardIssueKeys.has(issue.key)) {
                myBoardIssueKeys.add(issue.key);
                myBoardRaw.push(issue);
              }
            }
          } catch (e) {
            console.error(`Error fetching board ${boardId}:`, e);
          }
        }
      }

      // 3) Fetch ALL CR issues (to find "other teams")
      const allData = await fetchAllCodeReviewIssues(jiraConfig);
      const otherRaw = allData.issues.filter((issue) => !myBoardIssueKeys.has(issue.key));

      console.log(`[CR] My board: ${myBoardRaw.length} issues, Other: ${otherRaw.length} issues`);

      // 4) Process both sets in parallel: fetch comments, PRs, reviews
      const [myProcessed, otherProcessed] = await Promise.all([
        processIssues(myBoardRaw),
        processIssues(otherRaw),
      ]);

      setMyBoardIssues(myProcessed);
      setOtherTeamIssues(otherProcessed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nieznany błąd';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [jiraConfig, ghConfig, myIssueKeys, processIssues, allowedRepos]);

  useEffect(() => {
    loadCodeReviewIssues();
  }, [loadCodeReviewIssues]);

  // My board: split into needs review vs approved (ignore closed PRs)
  const myNeedsReview = myBoardIssues.filter((issue) => {
    const active = issue.pullRequests.filter((pr) => pr.state !== 'closed');
    return active.some((pr) => !pr.userApproved);
  });
  const myApproved = myBoardIssues.filter((issue) => {
    const active = issue.pullRequests.filter((pr) => pr.state !== 'closed');
    return active.length > 0 && active.every((pr) => pr.userApproved);
  });

  // Other teams: split into needs review vs approved (ignore closed PRs)
  const otherNeedsReview = otherTeamIssues.filter((issue) => {
    const active = issue.pullRequests.filter((pr) => pr.state !== 'closed');
    return active.some((pr) => !pr.userApproved);
  });
  const totalAll = myBoardIssues.length + otherTeamIssues.length;

  if (allowedRepos.length === 0) {
    return (
      <div className="cr-container">
        <div className="empty-state">
          <h2>Nie wybrano repozytoriów</h2>
          <p>Przejdź do ⚙ Konfiguracja i wybierz repozytoria, które mają być widoczne w panelu Code Review.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="cr-loading-state">
        <div className="loading-spinner-lg" />
        <p>{getLoadingText(gorolMode)}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cr-error-state">
        <p className="cr-error-text">{error}</p>
        <button className="btn-primary" onClick={loadCodeReviewIssues} style={{ width: 'auto' }}>
          Ponów
        </button>
      </div>
    );
  }

  if (totalAll === 0) {
    return (
      <div className="cr-container">
        <div className="empty-state">
          <h2>Brak tasków w Code Review</h2>
          <p>Nie ma tasków z PR-ami z wybranych repozytoriów{allowedRepos.length > 0 ? `: ${allowedRepos.join(', ')}` : ''}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cr-container">
      <div className="cr-columns cr-columns-3">
        {/* Kolumna 1: Mój board — wymaga review */}
        <div className="board-column cr-column-pending">
          <div className="column-header">
            <h2>{gorolMode ? 'Code Review w zespole' : 'Czeko na sztajgra'}</h2>
            <span className="column-count">{myNeedsReview.length}</span>
          </div>
          <div className="column-cards">
            {myNeedsReview.length === 0 ? (
              <p className="column-empty">{gorolMode ? 'Wszystkie PR-y przejrzane! 🎉' : 'Przodek czysty 🎉'}</p>
            ) : (
              myNeedsReview.map((issue) => (
                <CodeReviewIssueCard key={issue.id} issue={issue} browseUrl={browseUrl} gorolMode={gorolMode} />
              ))
            )}
            {myApproved.length > 0 && (
              <>
                <div className="column-subsection-header">Przejrzane</div>
                {myApproved.map((issue) => (
                  <CodeReviewIssueCard key={issue.id} issue={issue} browseUrl={browseUrl} gorolMode={gorolMode} />
                ))}
              </>
            )}
          </div>
        </div>

        {/* Kolumna 2: Inne zespoły — wymaga review */}
        <div className="board-column cr-column-other">
          <div className="column-header">
            <h2>{gorolMode ? 'Code Review w innych zespołach' : 'Z inkszej gruby'}</h2>
            <span className="column-count">{otherNeedsReview.length}</span>
          </div>
          <div className="column-cards">
            {otherNeedsReview.length === 0 ? (
              <p className="column-empty">Brak tasków z innych zespołów</p>
            ) : (
              otherNeedsReview.map((issue) => (
                <CodeReviewIssueCard key={issue.id} issue={issue} browseUrl={browseUrl} gorolMode={gorolMode} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
