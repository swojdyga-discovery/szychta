import type { GitHubConfig, PullRequestReview, IssueReviewSummary, PrReviewInfo, JiraConfig } from '../types/jira';
import { fetchIssueComments, fetchIssueDescription } from './jiraApi';

/**
 * Fetches the authenticated GitHub user's login name using their token.
 * This avoids requiring the user to manually enter their username.
 */
export async function fetchGitHubUsername(token: string): Promise<string> {
  const url = buildGitHubUrl('/user');
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.login;
}

/**
 * Fetches all repositories the authenticated user has access to.
 * Returns a list of "owner/repo" strings, sorted alphabetically.
 */
export async function fetchUserRepos(token: string): Promise<string[]> {
  const allRepos: string[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = buildGitHubUrl(`/user/repos?per_page=${perPage}&page=${page}&sort=full_name&affiliation=owner,collaborator,organization_member`);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GitHub API error (${response.status}): ${errorText}`);
    }

    const data: { full_name: string }[] = await response.json();
    if (data.length === 0) break;

    for (const repo of data) {
      allRepos.push(repo.full_name);
    }

    if (data.length < perPage) break;
    page++;
  }

  return allRepos.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * Builds the GitHub API URL. Requests go directly to api.github.com.
 */
function buildGitHubUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `https://api.github.com${cleanPath}`;
}

/**
 * Extracts GitHub PR URLs from text (Jira comment body).
 * Matches patterns like:
 *   https://github.com/owner/repo/pull/123
 */
export function extractPrUrls(text: string): { owner: string; repo: string; prNumber: number; url: string }[] {
  // Match GitHub PR URLs — capture owner and repo as word characters + hyphens + underscores
  const regex = /https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/g;
  const results: { owner: string; repo: string; prNumber: number; url: string }[] = [];
  const seen = new Set<string>();

  let match;
  while ((match = regex.exec(text)) !== null) {
    const key = `${match[1]}/${match[2]}/${match[3]}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({
        owner: match[1],
        repo: match[2],
        prNumber: parseInt(match[3], 10),
        url: match[0],
      });
    }
  }

  return results;
}

interface GitHubPrResponse {
  title: string;
  state: string;
  merged: boolean;
  user: {
    login: string;
  };
}

interface GitHubReviewResponse {
  user: {
    login: string;
  };
  state: string; // APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED, PENDING
}

/**
 * Check if the user has approved a specific PR.
 * Returns PullRequestReview info.
 */
export async function checkPrReviewStatus(
  ghConfig: GitHubConfig,
  owner: string,
  repo: string,
  prNumber: number,
  prUrl: string
): Promise<PullRequestReview> {
  try {
    // Fetch PR details
    const prResponse = await fetch(
      buildGitHubUrl(`/repos/${owner}/${repo}/pulls/${prNumber}`),
      {
        headers: {
          Authorization: `Bearer ${ghConfig.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
        cache: 'no-store',
      }
    );

    if (!prResponse.ok) {
      const errorText = await prResponse.text();
      return {
        prUrl,
        prNumber,
        repo: `${owner}/${repo}`,
        owner,
        title: `PR #${prNumber}`,
        state: 'unknown',
        prAuthor: '',
        userApproved: false,
        userReviewState: null,
        totalApprovals: 0,
        totalChangesRequested: 0,
        totalCommented: 0,
        loading: false,
        error: `GitHub API error (${prResponse.status}): ${errorText}`,
      };
    }

    const prData: GitHubPrResponse = await prResponse.json();
    const prState = prData.merged ? 'merged' : prData.state;
    const prAuthor = prData.user?.login || '';

    // Fetch reviews
    const reviewsResponse = await fetch(
      buildGitHubUrl(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`),
      {
        headers: {
          Authorization: `Bearer ${ghConfig.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
        cache: 'no-store',
      }
    );

    let userReviewState: string | null = null;
    let userApproved = false;
    let totalApprovals = 0;
    let totalChangesRequested = 0;
    let totalCommented = 0;

    if (reviewsResponse.ok) {
      const reviews: GitHubReviewResponse[] = await reviewsResponse.json();

      // Build latest review state per user
      const latestPerUser = new Map<string, string>();
      for (const review of reviews) {
        const login = review.user.login.toLowerCase();
        if (review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED' || review.state === 'COMMENTED') {
          latestPerUser.set(login, review.state);
        }
      }

      // Count totals from latest states
      for (const state of latestPerUser.values()) {
        if (state === 'APPROVED') totalApprovals++;
        if (state === 'CHANGES_REQUESTED') totalChangesRequested++;
        if (state === 'COMMENTED') totalCommented++;
      }

      // Find the latest review from this user
      const userReviews = reviews.filter(
        (r) => r.user.login.toLowerCase() === ghConfig.username.toLowerCase()
      );

      if (userReviews.length > 0) {
        const latestReview = userReviews[userReviews.length - 1];
        userReviewState = latestReview.state;
        userApproved = latestReview.state === 'APPROVED';
      }
    }

    return {
      prUrl,
      prNumber,
      repo: `${owner}/${repo}`,
      owner,
      title: prData.title,
      state: prState,
      prAuthor,
      userApproved,
      userReviewState,
      totalApprovals,
      totalChangesRequested,
      totalCommented,
      loading: false,
    };
  } catch (err) {
    return {
      prUrl,
      prNumber,
      repo: `${owner}/${repo}`,
      owner,
      title: `PR #${prNumber}`,
      state: 'unknown',
      prAuthor: '',
      userApproved: false,
      userReviewState: null,
      totalApprovals: 0,
      totalChangesRequested: 0,
      totalCommented: 0,
      loading: false,
      error: err instanceof Error ? err.message : 'Nieznany błąd',
    };
  }
}

/**
 * Fetches per-PR review summary for all PRs found in Jira issue comments/description.
 * Each PR is tracked individually (approvals, changes_requested).
 * Used to show CR status badges on task cards in the "Moje Taski" tab.
 *
 * @param allowedRepos — list of "owner/repo" strings to filter PRs by.
 */
export async function fetchIssueReviewSummary(
  jiraConfig: JiraConfig,
  ghConfig: GitHubConfig,
  issueKey: string,
  issueDescription?: string | null,
  allowedRepos?: string[]
): Promise<IssueReviewSummary> {
  try {
    // Fetch comments and (optionally) description
    const [commentsData, descriptionText] = await Promise.all([
      fetchIssueComments(jiraConfig, issueKey),
      issueDescription != null
        ? Promise.resolve(issueDescription)
        : fetchIssueDescription(jiraConfig, issueKey),
    ]);
    const allCommentText = commentsData.comments.map((c) => c.body).join('\n');
    const allText = `${descriptionText}\n${allCommentText}`;
    const allPrLinks = extractPrUrls(allText);

    // Filter only allowed repos — if none selected, no PRs pass
    if (!allowedRepos || allowedRepos.length === 0) {
      return { prs: [], loading: false };
    }

    const prLinks = allPrLinks.filter((pr) =>
      allowedRepos.some((allowed) => {
        const [allowedOwner, allowedRepo] = allowed.split('/');
        return pr.owner === allowedOwner && pr.repo === allowedRepo;
      })
    );

    if (prLinks.length === 0) {
      return { prs: [], loading: false };
    }

    const prStatuses = await Promise.all(
      prLinks.map((pr) =>
        checkPrReviewStatus(ghConfig, pr.owner, pr.repo, pr.prNumber, pr.url)
      )
    );

    // Build per-PR review info (no author filtering here — used for "Moje Taski" badges)
    const prs: PrReviewInfo[] = prStatuses.map((pr) => ({
      prUrl: pr.prUrl,
      prNumber: pr.prNumber,
      repo: pr.repo,
      title: pr.title,
      prAuthor: pr.prAuthor,
      state: pr.state,
      approvals: pr.totalApprovals,
      changesRequested: pr.totalChangesRequested,
      error: pr.error,
    }));

    return { prs, loading: false };
  } catch (err) {
    console.error(`[CRSummary] ${issueKey}: ERROR:`, err);
    return {
      prs: [],
      loading: false,
      error: err instanceof Error ? err.message : 'Nieznany błąd',
    };
  }
}
