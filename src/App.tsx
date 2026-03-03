import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { IssueList } from './components/IssueList';
import { CodeReviewList } from './components/CodeReviewList';
import { TempoTab } from './components/TempoTab';
import { fetchAllMyIssues } from './services/jiraApi';
import { fetchGitHubUsername, fetchUserRepos } from './services/githubApi';
import type { JiraConfig, GitHubConfig, JiraIssue } from './types/jira';
import { getLoadingText } from './utils/text';
import './App.css';

type TabType = 'tasks' | 'codereview' | 'tempo';

/* ── Unified config modal (Jira token + GitHub token + repo selection) ── */
function ConfigModal({
  initialJiraToken,
  initialGhToken,
  initialSelectedRepos,
  onSave,
  onClose,
  canClose,
  isSaving,
  saveError,
  gorolMode,
}: {
  initialJiraToken: string;
  initialGhToken: string;
  initialSelectedRepos: string[];
  onSave: (jiraToken: string, ghToken: string, selectedRepos: string[]) => void;
  onClose: () => void;
  canClose: boolean;
  isSaving: boolean;
  saveError: string | null;
  gorolMode?: boolean;
}) {
  const [jiraToken, setJiraToken] = useState(initialJiraToken);
  const [ghToken, setGhToken] = useState(initialGhToken);

  // Repo selection state
  const [availableRepos, setAvailableRepos] = useState<string[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set(initialSelectedRepos));
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);
  const [reposLoaded, setReposLoaded] = useState(false);
  const [repoFilter, setRepoFilter] = useState('');

  const loadRepos = useCallback(async (token: string) => {
    if (!token) return;
    setReposLoading(true);
    setReposError(null);
    try {
      const repos = await fetchUserRepos(token);
      setAvailableRepos(repos);
      setReposLoaded(true);
    } catch (err) {
      setReposError(err instanceof Error ? err.message : 'Nie udało się pobrać repozytoriów');
    } finally {
      setReposLoading(false);
    }
  }, []);

  // Auto-load repos if we already have a token
  useEffect(() => {
    if (initialGhToken && !reposLoaded) {
      loadRepos(initialGhToken);
    }
  }, [initialGhToken, reposLoaded, loadRepos]);

  const toggleRepo = (repo: string) => {
    setSelectedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(repo)) {
        next.delete(repo);
      } else {
        next.add(repo);
      }
      return next;
    });
  };

  const filteredRepos = repoFilter
    ? availableRepos.filter((r) => r.toLowerCase().includes(repoFilter.toLowerCase()))
    : availableRepos;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(jiraToken, ghToken, Array.from(selectedRepos));
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (canClose && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={handleOverlayClick}>
      <div className="modal-content modal-config">
        <h2>Konfiguracja</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="cfg-jira-token">Jira Token</label>
            <p className="config-hint">
              Wejdź na swój{' '}
              <a href="https://jira.pl.grupa.iti/secure/ViewProfile.jspa" target="_blank" rel="noopener noreferrer">
                profil w Jira
              </a>
              , utwórz osobisty token dostępu i wklej go poniżej.
            </p>
            <input
              id="cfg-jira-token"
              type="password"
              value={jiraToken}
              onChange={(e) => setJiraToken(e.target.value)}
              placeholder="Personal Access Token"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="cfg-gh-token">GitHub Token</label>
            <p className="config-hint">
              Wejdź na{' '}
              <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer">
                GitHub → Settings → Tokens
              </a>
              , utwórz Personal Access Token (classic) z zaznaczonym scope <strong>repo</strong>, a następnie na liście tokenów kliknij <strong>Configure SSO</strong> i autoryzuj dostęp do repo organizacji. Wklej token poniżej.
            </p>
            <div className="config-gh-row">
              <input
                id="cfg-gh-token"
                type="password"
                value={ghToken}
                onChange={(e) => setGhToken(e.target.value)}
                placeholder="Personal Access Token"
                required
              />
              {ghToken && !reposLoaded && !reposLoading && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ flexShrink: 0 }}
                  onClick={() => loadRepos(ghToken)}
                >
                  Pobierz repozytoria
                </button>
              )}
            </div>
          </div>

          {/* Repo selection */}
          <div className="form-group">
            <label>
              Repozytoria do Code Review
              {selectedRepos.size > 0 && (
                <span className="config-repo-count">{selectedRepos.size} wybranych</span>
              )}
            </label>

            {!reposLoaded && !reposLoading && !reposError && (
              <p className="config-repo-hint">
                Podaj GitHub Token i kliknij „Pobierz repozytoria", aby wybrać które repozytoria mają być widoczne w panelu Code Review.
              </p>
            )}

            {reposLoading && (
              <div className="config-repo-loading">
                <div className="loading-spinner-lg" style={{ width: 18, height: 18, borderWidth: 2 }} />
                <span>{getLoadingText(gorolMode)}</span>
              </div>
            )}

            {reposError && (
              <div className="config-repo-error">
                <span>{reposError}</span>
                <button type="button" className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => loadRepos(ghToken)}>
                  Ponów
                </button>
              </div>
            )}

            {reposLoaded && !reposLoading && (
              <>
                <input
                  type="text"
                  className="config-repo-filter"
                  placeholder="Szukaj repozytoriów..."
                  value={repoFilter}
                  onChange={(e) => setRepoFilter(e.target.value)}
                />
                <div className="config-repo-list">
                  {filteredRepos.length === 0 && (
                    <p className="config-repo-empty">Brak pasujących repozytoriów</p>
                  )}
                  {filteredRepos.map((repo) => (
                    <label key={repo} className={`config-repo-item ${selectedRepos.has(repo) ? 'config-repo-selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={selectedRepos.has(repo)}
                        onChange={() => toggleRepo(repo)}
                      />
                      <span className="config-repo-check">{selectedRepos.has(repo) ? '✓' : ''}</span>
                      <span className="config-repo-name">{repo}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="config-proxy-hint">
            <strong>⚡ CORS Proxy</strong>
            <p>
              Jira nie jest dostępna bezpośrednio z przeglądarki. Uruchom lokalny proxy poleceniem:
            </p>
            <code className="config-proxy-cmd">
              NODE_TLS_REJECT_UNAUTHORIZED=0 npx local-cors-proxy --proxyUrl https://jira.pl.grupa.iti
            </code>
          </div>

          {saveError && (
            <div className="config-error">
              <p>{saveError}</p>
            </div>
          )}

          <div className="modal-actions">
            {canClose && (
              <button type="button" className="btn-secondary" onClick={onClose}>
                Anuluj
              </button>
            )}
            <button
              type="submit"
              className="btn-primary"
              disabled={isSaving}
            >
              {isSaving ? 'Zapisywanie...' : 'Zapisz'}
            </button>
          </div>

          <p className="config-footer-note">
            🔒 Wszystkie tokeny są zapisywane wyłącznie w przeglądarce użytkownika (przynajmniej AI tak obiecał)
          </p>
        </form>
      </div>
    </div>
  );
}

/* ── Helpers to read / write localStorage ── */
function loadJiraConfig(): JiraConfig | null {
  const token = localStorage.getItem('jira_token');
  if (token) return { token };
  return null;
}

function loadGhConfig(): GitHubConfig | null {
  const username = localStorage.getItem('gh_username');
  const token = localStorage.getItem('gh_token');
  if (username && token) return { username, token };
  return null;
}

function loadSelectedRepos(): string[] {
  try {
    const raw = localStorage.getItem('selected_repos');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function hasAllConfigs(): boolean {
  return !!(
    localStorage.getItem('jira_token') &&
    localStorage.getItem('gh_token') &&
    localStorage.getItem('gh_username')
  );
}

/* ── App ── */
function App() {
  const [jiraConfig, setJiraConfig] = useState<JiraConfig | null>(loadJiraConfig);
  const [ghConfig, setGhConfig] = useState<GitHubConfig | null>(loadGhConfig);
  const [selectedRepos, setSelectedRepos] = useState<string[]>(loadSelectedRepos);
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('tasks');
  const [refreshKey, setRefreshKey] = useState(0);
  const [gorolMode, setGorolMode] = useState(() => localStorage.getItem('gorolMode') === 'true');

  // Config modal state
  const [showConfigModal, setShowConfigModal] = useState(!hasAllConfigs());
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const didAutoLoad = useRef(false);

  /* ── Load issues from Jira ── */
  const loadIssues = useCallback(async (cfg: JiraConfig) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAllMyIssues(cfg);
      setIssues(data.issues);
      setTotal(data.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nieznany błąd';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /* ── Save config from modal ── */
  const handleConfigSave = useCallback(
    async (jiraToken: string, ghToken: string, repos: string[]) => {
      setConfigSaving(true);
      setConfigError(null);

      try {
        // Auto-resolve GitHub username from token
        const ghUsername = await fetchGitHubUsername(ghToken);

        // Persist to localStorage
        localStorage.setItem('jira_token', jiraToken);
        localStorage.setItem('gh_token', ghToken);
        localStorage.setItem('gh_username', ghUsername);
        localStorage.setItem('selected_repos', JSON.stringify(repos));

        const jiraCfg: JiraConfig = { token: jiraToken };
        const ghCfg: GitHubConfig = { username: ghUsername, token: ghToken };

        setJiraConfig(jiraCfg);
        setGhConfig(ghCfg);
        setSelectedRepos(repos);
        setShowConfigModal(false);

        // Reload issues with new config
        loadIssues(jiraCfg);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Nieznany błąd';
        setConfigError(`Nie udało się zweryfikować tokena GitHub: ${message}`);
      } finally {
        setConfigSaving(false);
      }
    },
    [loadIssues]
  );

  /* ── Auto-load issues on first mount when config exists ── */
  useEffect(() => {
    if (didAutoLoad.current) return;
    didAutoLoad.current = true;

    if (jiraConfig) {
      loadIssues(jiraConfig);
    }
  }, [jiraConfig, loadIssues]);

  /* ── Issue keys for board detection ── */
  const myIssueKeys = useMemo(() => issues.map((issue) => issue.key), [issues]);

  const dataReady = jiraConfig !== null && !isLoading && !error;
  const showEmpty = jiraConfig === null && !showConfigModal;

  return (
    <div className="app-container">
      {/* Header — always visible */}
      <header className="app-header">
        <div className="header-top-row">
          <h1>⛏️ Szychta</h1>
          <div className="header-actions">
            <button
              className="btn-refresh"
              onClick={() => {
                if (activeTab === 'tasks' && jiraConfig) {
                  loadIssues(jiraConfig);
                }
                setRefreshKey((k) => k + 1);
              }}
              title="Odśwież aktualną zakładkę"
            >
              ↻ Odśwież
            </button>
            <button
              className={`btn-gorol ${gorolMode ? 'btn-gorol-active' : ''}`}
              onClick={() => {
                const next = !gorolMode;
                setGorolMode(next);
                localStorage.setItem('gorolMode', String(next));
              }}
              title={gorolMode ? 'Wyłącz tryb gorola' : 'Włącz tryb gorola'}
            >
              {gorolMode ? '🛟 Tryb gorola' : '🛟 Tryb gorola'}
            </button>
            <button
              className="btn-config"
              onClick={() => { setConfigError(null); setShowConfigModal(true); }}
              title="Konfiguracja"
            >
              ⚙ Konfiguracja
            </button>
          </div>
        </div>
        <nav className="tab-nav">
          <button
            className={`tab-btn ${activeTab === 'tasks' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('tasks')}
          >
            {gorolMode ? 'Taski' : 'Fedrowanie'}
          </button>
          <button
            className={`tab-btn ${activeTab === 'codereview' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('codereview')}
          >
            {gorolMode ? 'Code Review' : 'Nadzór'}
          </button>
          <button
            className={`tab-btn ${activeTab === 'tempo' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('tempo')}
          >
            {gorolMode ? 'Tempo' : 'Ewidencja szychty'}
          </button>
        </nav>
      </header>

      {/* Loading state */}
      {isLoading && (
        <div className="loading-container" style={{ minHeight: 'calc(100vh - 100px)' }}>
          <div className="loading-spinner-lg" />
          <p style={{ color: 'var(--color-text-secondary)' }}>{getLoadingText(gorolMode)}</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="cr-error-state" style={{ minHeight: 'calc(100vh - 100px)' }}>
          <p className="cr-error-text">{error}</p>
          <div className="error-actions">
            <button
              className="btn-secondary"
              onClick={() => jiraConfig && loadIssues(jiraConfig)}
            >
              Ponów
            </button>
            <button
              className="btn-secondary"
              onClick={() => setShowConfigModal(true)}
            >
              Zmień konfigurację
            </button>
          </div>
        </div>
      )}

      {/* No config — prompt user */}
      {showEmpty && (
        <div className="empty-state" style={{ minHeight: 'calc(100vh - 100px)' }}>
          <h2>Brak konfiguracji</h2>
          <p>Kliknij przycisk „⚙ Konfiguracja" w nagłówku, aby podać dane logowania.</p>
        </div>
      )}

      {/* My Tasks tab */}
      {activeTab === 'tasks' && dataReady && (
        <IssueList
          issues={issues}
          total={total}
          config={jiraConfig}
          ghConfig={ghConfig}
          allowedRepos={selectedRepos}
          gorolMode={gorolMode}
        />
      )}

      {/* Code Review tab */}
      {activeTab === 'codereview' && dataReady && jiraConfig && ghConfig && (
        <CodeReviewList
          key={refreshKey}
          jiraConfig={jiraConfig}
          ghConfig={ghConfig}
          myIssueKeys={myIssueKeys}
          allowedRepos={selectedRepos}
          gorolMode={gorolMode}
        />
      )}

      {activeTab === 'codereview' && dataReady && (!ghConfig || !ghConfig.token) && (
        <div className="empty-state">
          <h2>Brak konfiguracji GitHub</h2>
          <p>Kliknij przycisk „⚙ Konfiguracja" w nagłówku, aby podać dane GitHub.</p>
        </div>
      )}

      {/* Tempo tab */}
      {activeTab === 'tempo' && dataReady && jiraConfig && (
        <TempoTab key={refreshKey} config={jiraConfig} gorolMode={gorolMode} />
      )}

      {/* Config modal */}
      {showConfigModal && (
        <ConfigModal
          initialJiraToken={jiraConfig?.token || localStorage.getItem('jira_token') || ''}
          initialGhToken={ghConfig?.token || localStorage.getItem('gh_token') || ''}
          initialSelectedRepos={selectedRepos}
          onSave={handleConfigSave}
          onClose={() => setShowConfigModal(false)}
          canClose={hasAllConfigs()}
          isSaving={configSaving}
          saveError={configError}
          gorolMode={gorolMode}
        />
      )}
    </div>
  );
}

export default App;
