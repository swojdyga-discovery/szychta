import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchTempoMonthSummary, fetchPreviousMonthStatus, fetchRecentTasks, JIRA_BASE_URL } from '../services/jiraApi';
import type { JiraConfig, TempoMonthSummary, PreviousMonthStatus, RecentTask } from '../types/jira';
import { getLoadingText } from '../utils/text';

function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
  } catch {
    return dateStr;
  }
}

const MONTH_NAMES = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
];

function getRecentStatusClass(categoryKey: string): string {
  switch (categoryKey) {
    case 'done': return 'tempo-status-done';
    case 'indeterminate': return 'tempo-status-in-progress';
    case 'new': return 'tempo-status-todo';
    default: return 'tempo-status-default';
  }
}

export function TempoTab({ config, gorolMode }: { config: JiraConfig; gorolMode?: boolean }) {
  const [summary, setSummary] = useState<TempoMonthSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [prevMonth, setPrevMonth] = useState<PreviousMonthStatus | null>(null);
  const [prevMonthLoading, setPrevMonthLoading] = useState(true);
  const [prevMonthError, setPrevMonthError] = useState<string | null>(null);

  const [recentTasksRaw, setRecentTasksRaw] = useState<RecentTask[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState<string | null>(null);

  // Filter out completed tasks — user doesn't want to see them at all
  const recentTasks = useMemo(
    () => recentTasksRaw.filter((t) => t.statusCategoryKey !== 'done'),
    [recentTasksRaw]
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchTempoMonthSummary(config);
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nieznany błąd');
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  const loadPrevMonth = useCallback(async () => {
    setPrevMonthLoading(true);
    setPrevMonthError(null);
    try {
      const data = await fetchPreviousMonthStatus(config);
      setPrevMonth(data);
    } catch (err) {
      setPrevMonthError(err instanceof Error ? err.message : 'Nieznany błąd');
    } finally {
      setPrevMonthLoading(false);
    }
  }, [config]);

  const loadRecentTasks = useCallback(async () => {
    setRecentLoading(true);
    setRecentError(null);
    try {
      const tasks = await fetchRecentTasks(config, 30);
      setRecentTasksRaw(tasks);
    } catch (err) {
      setRecentError(err instanceof Error ? err.message : 'Nieznany błąd');
    } finally {
      setRecentLoading(false);
    }
  }, [config]);

  useEffect(() => {
    loadData();
    loadPrevMonth();
    loadRecentTasks();
  }, [loadData, loadPrevMonth, loadRecentTasks]);

  const now = new Date();
  const monthName = MONTH_NAMES[now.getMonth()];
  const year = now.getFullYear();

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
        <button className="btn-primary" style={{ width: 'auto' }} onClick={loadData}>
          Ponów
        </button>
      </div>
    );
  }

  if (!summary) return null;

  const progressPercent = summary.requiredSecondsToDate > 0
    ? Math.min(100, Math.round((summary.loggedSeconds / summary.requiredSecondsToDate) * 100))
    : 0;
  const overallPercent = summary.requiredSeconds > 0
    ? Math.min(100, Math.round((summary.loggedSeconds / summary.requiredSeconds) * 100))
    : 0;

  const isBehind = summary.missingSecondsToDate > 0;
  const isAhead = summary.loggedSeconds > summary.requiredSecondsToDate;

  return (
    <div className="tempo-container">
      {/* Summary cards */}
      <div className="tempo-header">
        <h2 className="tempo-title">{monthName} {year}</h2>
        <a
          className="tempo-jira-link"
          href={`${JIRA_BASE_URL}/secure/Tempo.jspa#/my-work/week?type=LIST`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Otwórz Tempo w Jira ↗
        </a>
      </div>

      {/* Previous month status */}
      <div className={
        prevMonthLoading
          ? 'tempo-prev-month-loading'
          : prevMonth && prevMonth.missingSeconds > 0
            ? 'tempo-prev-month-alert'
            : 'tempo-prev-month-ok'
      }>
        {prevMonthLoading ? (
          <>
            <div className="loading-spinner-lg" style={{ width: 16, height: 16, borderWidth: 2 }} />
            <span>{getLoadingText(gorolMode)}</span>
          </>
        ) : prevMonthError ? (
          <span>⚠️ Nie udało się pobrać danych z poprzedniego miesiąca</span>
        ) : prevMonth && prevMonth.missingSeconds > 0 ? (
          <span>⚠️ {prevMonth.monthName} {prevMonth.year} — brakuje {formatHours(prevMonth.missingSeconds)} ({formatHours(prevMonth.loggedSeconds)}&nbsp;/&nbsp;{formatHours(prevMonth.requiredSeconds)})</span>
        ) : prevMonth ? (
          <span>✅ {prevMonth.monthName} {prevMonth.year} — godziny kompletne</span>
        ) : null}
      </div>

      <div className="tempo-stats-grid">
        {/* Main "missing" card */}
        <div className={`tempo-stat-card tempo-stat-main ${isBehind ? 'tempo-stat-behind' : 'tempo-stat-ok'}`}>
          <div className="tempo-stat-label">
            {isBehind ? 'Brakuje (do dziś)' : 'Status'}
          </div>
          <div className="tempo-stat-value">
            {isBehind
              ? formatHours(summary.missingSecondsToDate)
              : isAhead
                ? `+${formatHours(summary.loggedSeconds - summary.requiredSecondsToDate)} nadgodzin`
                : 'Na bieżąco ✓'
            }
          </div>
          <div className="tempo-progress-bar">
            <div
              className={`tempo-progress-fill ${isBehind ? 'tempo-fill-behind' : 'tempo-fill-ok'}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="tempo-stat-detail">
            {formatHours(summary.loggedSeconds)} / {formatHours(summary.requiredSecondsToDate)} (do dziś)
          </div>
        </div>

        {/* Logged */}
        <div className="tempo-stat-card">
          <div className="tempo-stat-label">Zalogowane</div>
          <div className="tempo-stat-value">{formatHours(summary.loggedSeconds)}</div>
          <div className="tempo-stat-detail">{overallPercent}% miesiąca</div>
        </div>

        {/* Required total */}
        <div className="tempo-stat-card">
          <div className="tempo-stat-label">Wymagane (cały miesiąc)</div>
          <div className="tempo-stat-value">{formatHours(summary.requiredSeconds)}</div>
          <div className="tempo-stat-detail">{summary.businessDays} dni roboczych</div>
        </div>

        {/* Missing total */}
        <div className="tempo-stat-card">
          <div className="tempo-stat-label">Brakuje (cały miesiąc)</div>
          <div className="tempo-stat-value">{formatHours(summary.missingSeconds)}</div>
          <div className="tempo-stat-detail">
            {summary.businessDays - summary.businessDaysElapsed} dni roboczych pozostało
          </div>
        </div>
      </div>

      {/* Recent tasks (last 30 days) */}
      <div className="tempo-recent-section">
        <h3 className="tempo-section-title">
          Twoje taski z ostatnich 30 dni
          {!recentLoading && !recentError && recentTasks.length > 0 && (
            <span className="tempo-recent-count">{recentTasks.length}</span>
          )}
        </h3>
        <p className="tempo-recent-hint">
          Taski, do których byłeś przypisany — pomocne przy uzupełnianiu czasu pracy.
        </p>

        {recentLoading && (
          <div className="tempo-recent-loading">
            <div className="loading-spinner-lg" style={{ width: 24, height: 24, borderWidth: 2 }} />
            <span>{getLoadingText(gorolMode)}</span>
          </div>
        )}

        {recentError && (
          <div className="tempo-recent-error">
            <span>{recentError}</span>
            <button className="btn-secondary" style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }} onClick={loadRecentTasks}>
              Ponów
            </button>
          </div>
        )}

        {!recentLoading && !recentError && recentTasks.length === 0 && (
          <p className="column-empty">Brak tasków z ostatnich 30 dni</p>
        )}

        {!recentLoading && !recentError && recentTasks.length > 0 && (
          <div className="tempo-recent-list">
            {recentTasks.map((task) => {
              const browseUrl = `${JIRA_BASE_URL}/browse/${task.issueKey}`;

              return (
                <a
                  key={task.issueKey}
                  className="tempo-recent-card"
                  href={browseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className="tempo-recent-card-header">
                    <div className="tempo-recent-key-group">
                      <span className="tempo-entry-key">{task.issueKey}</span>
                      {task.projectKey && (
                        <span className="tempo-recent-project">{task.projectKey}</span>
                      )}
                    </div>
                    <span className={`tempo-recent-status ${getRecentStatusClass(task.statusCategoryKey)}`}>
                      {task.status}
                    </span>
                  </div>
                  {task.summary && (
                    <div className="tempo-recent-summary">{task.summary}</div>
                  )}
                  <div className="tempo-recent-meta">
                    <span className="tempo-recent-dates">
                      Aktualizacja: {formatDate(task.updated)}
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
