import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  BookmarkPlus,
  Brain,
  Clock,
  Download,
  ExternalLink,
  Globe,
  HardDrive,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  bulkDeleteUnstarred,
  checkStorageQuota,
  deleteArticles,
  getDomainCounts,
  listArticles,
  toggleArticleStar,
  updateStorageCap,
} from '../../db';
import type { SaveTabResult } from '../background/coordinator';
import type {
  ArticleRecord,
  ExtensionMessage,
  StorageQuotaStatus,
  TabStatusResponse,
} from '../../types/messages';

interface SearchResultItem {
  article: ArticleRecord;
  bestSnippet: string;
  chunkIndex: number;
  score: number;
}

function formatBytesToMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function formatShortDate(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function describeSaveError(result: SaveTabResult): string {
  if (result.status === 'incognito_blocked') {
    return 'Saving is disabled in Incognito windows for privacy.';
  }
  if (result.status === 'already_processing') {
    return 'This page is already being indexed.';
  }
  if (result.status === 'no_tab') {
    return 'No active browser tab found.';
  }
  if (result.status === 'extract_failed') {
    switch (result.error) {
      case 'BLOCKED_URL':
        return (
          result.reason ||
          'This URL cannot be indexed (restricted scheme or sensitive domain).'
        );
      case 'NOT_READABLE':
        return 'Could not extract a readable article from this page.';
      case 'TOO_SHORT':
        return 'Page content is too short to index meaningfully.';
      default:
        return result.reason || 'Failed to extract content from this page.';
    }
  }
  if (result.status === 'error') {
    return result.error || 'An unexpected error occurred while saving.';
  }
  return 'Could not save this page.';
}

export default function App(): React.JSX.Element {
  // Active tab state
  const [activeTabId, setActiveTabId] = useState<number | undefined>(undefined);
  const [activeTabUrl, setActiveTabUrl] = useState<string>('');
  const [activeTabTitle, setActiveTabTitle] = useState<string>('');
  const [savedArticle, setSavedArticle] = useState<ArticleRecord | undefined>(
    undefined,
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Library & filter state
  const [articles, setArticles] = useState<ArticleRecord[]>([]);
  const [domainCounts, setDomainCounts] = useState<
    Array<{ siteName: string; count: number }>
  >([]);
  const [starredOnly, setStarredOnly] = useState<boolean>(false);
  const [domainFilter, setDomainFilter] = useState<string | undefined>(
    undefined,
  );

  // Hybrid Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);

  // Proactive Related Past Reading state
  const [relatedArticles, setRelatedArticles] = useState<SearchResultItem[]>(
    [],
  );

  // Storage Quota & Modal state
  const [quotaStatus, setQuotaStatus] = useState<StorageQuotaStatus | null>(
    null,
  );
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState<boolean>(false);
  const [pendingRetrySave, setPendingRetrySave] = useState<boolean>(false);
  const [customCapMB, setCustomCapMB] = useState<string>('250');
  const [quotaFeedback, setQuotaFeedback] = useState<string | null>(null);

  const refreshLibraryAndQuota = useCallback(async () => {
    try {
      const [loadedArticles, domains, quota] = await Promise.all([
        listArticles({ domainFilter, starredOnly }),
        getDomainCounts(),
        checkStorageQuota(),
      ]);
      setArticles(loadedArticles);
      setDomainCounts(domains);
      setQuotaStatus(quota);
    } catch (err) {
      console.error('[Second Brain SidePanel] Failed to load library:', err);
    }
  }, [domainFilter, starredOnly]);

  const refreshActiveTab = useCallback(async () => {
    if (typeof chrome === 'undefined' || !chrome.tabs?.query) return;
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const currentTab = tabs[0];
      setActiveTabId(currentTab?.id);
      const url = currentTab?.url ?? '';
      const title = currentTab?.title ?? '';
      setActiveTabUrl(url);
      setActiveTabTitle(title);

      if (
        url &&
        (url.startsWith('http://') || url.startsWith('https://')) &&
        chrome.runtime?.sendMessage
      ) {
        const response = (await chrome.runtime
          .sendMessage({
            type: 'CHECK_TAB_STATUS',
            payload: { url },
          } satisfies ExtensionMessage)
          .catch(() => undefined)) as TabStatusResponse | undefined;
        setSavedArticle(response?.isSaved ? response.article : undefined);
      } else {
        setSavedArticle(undefined);
      }
    } catch {
      setSavedArticle(undefined);
    }
  }, []);

  // Initial load & library refresh when filters change
  useEffect(() => {
    void Promise.resolve().then(() => refreshLibraryAndQuota());
  }, [refreshLibraryAndQuota]);

  // Active tab & runtime message listeners
  useEffect(() => {
    void Promise.resolve().then(() => refreshActiveTab());

    const handleTabActivated = () => {
      setSaveError(null);
      void refreshActiveTab();
    };

    const handleTabUpdated = (
      _tabId: number,
      changeInfo: { status?: string; url?: string },
    ) => {
      if (changeInfo.status === 'complete' || changeInfo.url) {
        void refreshActiveTab();
      }
    };

    const handleRuntimeMessage = (message: ExtensionMessage) => {
      if (message.type === 'ARTICLE_INDEXED') {
        setIsSaving(false);
        void refreshActiveTab();
        void refreshLibraryAndQuota();
      } else if (message.type === 'STORAGE_QUOTA_EXCEEDED') {
        setIsSaving(false);
        const suggestedMB = Math.round(
          message.payload.suggestedNewCapBytes / (1024 * 1024),
        );
        setCustomCapMB(String(suggestedMB || 250));
        setPendingRetrySave(true);
        setIsQuotaModalOpen(true);
        void refreshLibraryAndQuota();
      }
    };

    chrome.tabs?.onActivated?.addListener(handleTabActivated);
    chrome.tabs?.onUpdated?.addListener(handleTabUpdated);
    chrome.runtime?.onMessage?.addListener(handleRuntimeMessage);

    return () => {
      chrome.tabs?.onActivated?.removeListener(handleTabActivated);
      chrome.tabs?.onUpdated?.removeListener(handleTabUpdated);
      chrome.runtime?.onMessage?.removeListener(handleRuntimeMessage);
    };
  }, [refreshActiveTab, refreshLibraryAndQuota]);

  // Debounce search query (250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Execute hybrid search when debouncedQuery or filters change
  useEffect(() => {
    let cancelled = false;

    (async () => {
      await Promise.resolve();
      if (cancelled) return;

      if (!debouncedQuery) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      try {
        const response = (await chrome.runtime.sendMessage({
          type: 'SEARCH_QUERY',
          payload: {
            query: debouncedQuery,
            topK: 10,
            domainFilter,
            starredOnly,
          },
        } satisfies ExtensionMessage)) as
          | { type: 'SEARCH_RESULTS'; payload: { results: SearchResultItem[] } }
          | undefined;

        if (!cancelled) {
          setSearchResults(response?.payload?.results ?? []);
        }
      } catch {
        if (!cancelled) {
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, domainFilter, starredOnly]);

  // Proactive Related Past Reading strip when active tab changes
  useEffect(() => {
    let cancelled = false;
    const isHttp =
      activeTabUrl.startsWith('http://') || activeTabUrl.startsWith('https://');

    (async () => {
      await Promise.resolve();
      if (cancelled) return;

      if (
        !isHttp ||
        !activeTabTitle.trim() ||
        domainCounts.length === 0 ||
        !chrome.runtime?.sendMessage
      ) {
        setRelatedArticles([]);
        return;
      }

      try {
        const response = (await chrome.runtime.sendMessage({
          type: 'FIND_RELATED_ARTICLES',
          payload: {
            text: activeTabTitle,
            excludeArticleId: savedArticle?.id,
            topK: 3,
          },
        } satisfies ExtensionMessage)) as
          | { type: 'SEARCH_RESULTS'; payload: { results: SearchResultItem[] } }
          | undefined;

        if (!cancelled) {
          const matches = (response?.payload?.results ?? []).filter(
            r => r.score >= 0.2,
          );
          setRelatedArticles(matches.slice(0, 3));
        }
      } catch {
        if (!cancelled) {
          setRelatedArticles([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTabUrl, activeTabTitle, savedArticle?.id, domainCounts.length]);

  const handleSaveOrUpdateActiveTab = async () => {
    setSaveError(null);
    setIsSaving(true);
    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'SAVE_ACTIVE_TAB',
      } satisfies ExtensionMessage)) as SaveTabResult | undefined;

      if (!response) {
        setIsSaving(false);
        return;
      }

      if (response.status === 'indexing') {
        await refreshActiveTab();
        await refreshLibraryAndQuota();
        setIsSaving(false);
      } else if (response.status === 'quota_exceeded') {
        setIsSaving(false);
        setPendingRetrySave(true);
        setIsQuotaModalOpen(true);
        await refreshLibraryAndQuota();
      } else {
        setIsSaving(false);
        setSaveError(describeSaveError(response));
      }
    } catch (err) {
      setIsSaving(false);
      setSaveError(
        err instanceof Error ? err.message : 'Failed to save active tab.',
      );
    }
  };

  const handleRemoveSavedTabArticle = async () => {
    if (!savedArticle) return;
    try {
      await deleteArticles([savedArticle.id]);
      if (activeTabId !== undefined && chrome.action?.setBadgeText) {
        await chrome.action
          .setBadgeText({ tabId: activeTabId, text: '' })
          .catch(() => {});
      }
      setSavedArticle(undefined);
      await refreshLibraryAndQuota();
    } catch (err) {
      console.error('[Second Brain SidePanel] Failed to remove article:', err);
    }
  };

  const handleToggleStar = async (
    articleId: string,
    event: React.MouseEvent,
  ) => {
    event.stopPropagation();
    try {
      const updated = await toggleArticleStar(articleId);
      if (savedArticle?.id === articleId && updated) {
        setSavedArticle(updated);
      }
      setSearchResults(prev =>
        prev.map(item =>
          item.article.id === articleId && updated
            ? { ...item, article: updated }
            : item,
        ),
      );
      await refreshLibraryAndQuota();
    } catch (err) {
      console.error('[Second Brain SidePanel] Failed to toggle star:', err);
    }
  };

  const handleDeleteArticle = async (
    articleId: string,
    event: React.MouseEvent,
  ) => {
    event.stopPropagation();
    try {
      await deleteArticles([articleId]);
      if (savedArticle?.id === articleId) {
        setSavedArticle(undefined);
        if (activeTabId !== undefined && chrome.action?.setBadgeText) {
          await chrome.action
            .setBadgeText({ tabId: activeTabId, text: '' })
            .catch(() => {});
        }
      }
      setSearchResults(prev =>
        prev.filter(item => item.article.id !== articleId),
      );
      setRelatedArticles(prev =>
        prev.filter(item => item.article.id !== articleId),
      );
      await refreshLibraryAndQuota();
    } catch (err) {
      console.error('[Second Brain SidePanel] Failed to delete article:', err);
    }
  };

  const handleOpenArticleAndHighlight = async (
    url: string,
    snippet?: string,
  ) => {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      const tabs = await chrome.tabs.query({});
      const existingTab = tabs.find(t => t.url === url);
      let targetTabId: number | undefined;

      if (existingTab?.id !== undefined) {
        targetTabId = existingTab.id;
        await chrome.tabs.update(targetTabId, { active: true });
      } else {
        const created = await chrome.tabs.create({ url, active: true });
        targetTabId = created.id;
      }

      if (snippet && targetTabId !== undefined) {
        const highlightMsg: ExtensionMessage = {
          type: 'SCROLL_AND_HIGHLIGHT',
          payload: { snippet },
        };
        setTimeout(() => {
          chrome.tabs.sendMessage(targetTabId, highlightMsg).catch(() => {});
        }, 450);
      }
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleOpenKnowledgeManager = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      void chrome.runtime.openOptionsPage();
    }
  };

  const handleExpandStorageCap = async () => {
    const parsedMB = Number.parseFloat(customCapMB);
    if (!Number.isFinite(parsedMB) || parsedMB < 10) {
      setQuotaFeedback('Please enter a valid storage limit (at least 10 MB).');
      return;
    }

    const newBytes = Math.round(parsedMB * 1024 * 1024);
    try {
      if (parsedMB > 50 && chrome.permissions?.request) {
        await chrome.permissions
          .request({ permissions: ['unlimitedStorage'] })
          .catch(() => false);
      }
      await updateStorageCap(newBytes);
      setQuotaFeedback(null);
      setIsQuotaModalOpen(false);
      await refreshLibraryAndQuota();

      if (pendingRetrySave) {
        setPendingRetrySave(false);
        await handleSaveOrUpdateActiveTab();
      }
    } catch (err) {
      setQuotaFeedback(
        err instanceof Error ? err.message : 'Failed to update storage cap.',
      );
    }
  };

  const handleQuickCleanupOldUnstarred = async () => {
    try {
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const deleted = await bulkDeleteUnstarred({ olderThanMs: thirtyDaysMs });
      setQuotaFeedback(
        deleted > 0
          ? `Cleaned up ${deleted} unstarred article${deleted === 1 ? '' : 's'} older than 30 days.`
          : 'No unstarred articles older than 30 days found.',
      );
      await refreshActiveTab();
      await refreshLibraryAndQuota();
    } catch {
      setQuotaFeedback('Failed to run cleanup.');
    }
  };

  const usageMB = quotaStatus
    ? formatBytesToMB(quotaStatus.currentUsageBytes)
    : '0.0';
  const maxMB = quotaStatus
    ? Math.round(quotaStatus.maxStorageBytes / (1024 * 1024))
    : 50;
  const usagePercent = quotaStatus
    ? Math.min(100, Math.round(quotaStatus.usageRatio * 100))
    : 0;
  const quotaBarColor = quotaStatus?.isExceeded
    ? 'bg-rose-600'
    : quotaStatus?.isWarning
      ? 'bg-amber-500'
      : 'bg-indigo-600';

  const isSearchingMode = debouncedQuery.length > 0;

  return (
    <div className="flex h-screen w-full flex-col bg-slate-50 text-slate-800">
      {/* Top Header */}
      <header className="border-b border-slate-200 bg-white px-4 py-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-slate-900">
                Second Brain
              </h1>
              <p className="text-[11px] text-slate-500">Local RAG Assistant</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleOpenKnowledgeManager}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            title="Open Full-Screen Knowledge Manager"
          >
            <span>Manager</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Active Tab Contextual Status Banner */}
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          {savedArticle ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <span className="truncate text-xs font-semibold text-slate-800">
                    Saved in Second Brain
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">
                  Saved {formatShortDate(savedArticle.savedAt)} •{' '}
                  {savedArticle.readingTimeMinutes} min read
                  {savedArticle.status === 'indexing' ? ' • Indexing…' : ''}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleSaveOrUpdateActiveTab()}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 shadow-2xs transition-colors hover:bg-slate-100 disabled:opacity-50"
                  title="Re-extract and update this article"
                >
                  <RefreshCw
                    className={`h-3 w-3 ${isSaving ? 'animate-spin' : ''}`}
                  />
                  <span>{isSaving ? 'Updating...' : 'Update'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleRemoveSavedTabArticle()}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
                  title="Remove from Second Brain"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Remove</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                  <span className="text-xs font-medium text-slate-700">
                    Not saved yet
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">
                  {activeTabUrl || 'No active web page'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleSaveOrUpdateActiveTab()}
                disabled={isSaving}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:opacity-50"
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
                <span>{isSaving ? 'Saving...' : 'Remember'}</span>
                <kbd className="hidden rounded bg-indigo-700 px-1 py-0.5 text-[9px] font-semibold text-indigo-100 sm:inline">
                  Alt+S
                </kbd>
              </button>
            </div>
          )}

          {saveError && (
            <div className="mt-2 flex items-start justify-between gap-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700">
              <div className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                <span>{saveError}</span>
              </div>
              <button
                type="button"
                onClick={() => setSaveError(null)}
                className="text-rose-500 hover:text-rose-700"
                aria-label="Dismiss error"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Proactive Related Past Reading Strip */}
        {relatedArticles.length > 0 && !isSearchingMode && (
          <div className="mt-2.5 rounded-lg border border-indigo-100 bg-indigo-50/60 p-2">
            <div className="flex items-center gap-1 text-[10px] font-semibold tracking-wide text-indigo-700 uppercase">
              <Sparkles className="h-3 w-3" />
              <span>Related Past Reading</span>
            </div>
            <div className="mt-1.5 flex flex-col gap-1">
              {relatedArticles.map(({ article, bestSnippet, score }) => (
                <button
                  key={article.id}
                  type="button"
                  onClick={() =>
                    void handleOpenArticleAndHighlight(article.url, bestSnippet)
                  }
                  className="flex items-center justify-between gap-2 rounded bg-white/90 px-2 py-1 text-left text-[11px] text-slate-700 shadow-2xs transition-colors hover:bg-white hover:text-indigo-700"
                >
                  <span className="truncate font-medium">{article.title}</span>
                  <span className="shrink-0 text-[10px] text-slate-400">
                    {article.siteName} • {Math.round(score * 100)}%
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Search & Filter Bar */}
      <div className="border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by concept or keyword..."
            className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pr-7 pl-9 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills: All, Starred, and Domain Chips */}
        <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={() => {
              setStarredOnly(false);
              setDomainFilter(undefined);
            }}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              !starredOnly && !domainFilter
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setStarredOnly(prev => !prev)}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              starredOnly
                ? 'bg-amber-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            <Star
              className={`h-3 w-3 ${starredOnly ? 'fill-white text-white' : ''}`}
            />
            <span>Starred</span>
          </button>

          {domainCounts.map(({ siteName, count }) => {
            const isActive = domainFilter === siteName;
            return (
              <button
                key={siteName}
                type="button"
                onClick={() => setDomainFilter(isActive ? undefined : siteName)}
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                <span>{siteName}</span>
                <span
                  className={`text-[10px] ${
                    isActive ? 'text-indigo-200' : 'text-slate-400'
                  }`}
                >
                  ({count})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Feed Area */}
      <main className="flex-1 overflow-y-auto p-3">
        {isSearchingMode ? (
          isSearching ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <RefreshCw className="h-5 w-5 animate-spin text-indigo-600" />
              <p className="mt-2 text-xs text-slate-500">
                Running hybrid semantic + lexical search…
              </p>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-6 w-6 text-slate-400" />
              <h3 className="mt-2 text-xs font-semibold text-slate-700">
                No matching passages found
              </h3>
              <p className="mt-1 max-w-xs text-[11px] text-slate-500">
                Try broader concepts or clear active domain/starred filters.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {searchResults.map(({ article, bestSnippet, score }) => (
                <article
                  key={article.id}
                  onClick={() =>
                    void handleOpenArticleAndHighlight(article.url, bestSnippet)
                  }
                  className="group cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-2xs transition-all hover:border-indigo-300 hover:shadow-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                        <Globe className="h-3 w-3 shrink-0 text-slate-400" />
                        <span className="truncate font-medium">
                          {article.siteName}
                        </span>
                        <span>•</span>
                        <span>{formatShortDate(article.savedAt)}</span>
                      </div>
                      <h3 className="mt-1 line-clamp-2 text-xs font-semibold text-slate-900 group-hover:text-indigo-600">
                        {article.title}
                      </h3>
                    </div>
                    <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                      {Math.round(score * 100)}% match
                    </span>
                  </div>

                  <p className="mt-2 line-clamp-3 rounded border-l-2 border-indigo-400 bg-slate-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-600">
                    {bestSnippet}
                  </p>
                </article>
              ))}
            </div>
          )
        ) : articles.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <BookOpen className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-slate-800">
              {starredOnly || domainFilter
                ? 'No Articles Match Filter'
                : 'Your Second Brain is Empty'}
            </h3>
            <p className="mt-1.5 max-w-xs text-xs text-slate-500">
              {starredOnly || domainFilter ? (
                'Try switching back to All articles or clearing the active domain filter.'
              ) : (
                <>
                  Navigate to an interesting article, documentation, or
                  discussion, and click{' '}
                  <span className="font-semibold text-indigo-600">
                    Remember
                  </span>{' '}
                  or press{' '}
                  <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] font-medium text-slate-700">
                    Alt+S
                  </kbd>{' '}
                  to index it locally.
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {articles.map(article => (
              <article
                key={article.id}
                onClick={() => void handleOpenArticleAndHighlight(article.url)}
                className="group cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-2xs transition-all hover:border-slate-300 hover:shadow-xs"
              >
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {article.faviconUrl ? (
                      <img
                        src={article.faviconUrl}
                        alt=""
                        className="h-3.5 w-3.5 shrink-0 rounded-xs"
                      />
                    ) : (
                      <Globe className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    )}
                    <span className="truncate font-medium text-slate-600">
                      {article.siteName}
                    </span>
                    <span>•</span>
                    <span className="shrink-0">
                      {formatShortDate(article.savedAt)}
                    </span>
                    <span>•</span>
                    <span className="inline-flex shrink-0 items-center gap-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      {article.readingTimeMinutes}m
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {article.status !== 'indexed' && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          article.status === 'indexing'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {article.status}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={e => void handleToggleStar(article.id, e)}
                      className={`rounded p-1 transition-colors ${
                        article.isStarred
                          ? 'text-amber-500 hover:bg-amber-50'
                          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                      }`}
                      title={
                        article.isStarred
                          ? 'Unstar article'
                          : 'Star article (protects from bulk cleanup)'
                      }
                    >
                      <Star
                        className={`h-3.5 w-3.5 ${
                          article.isStarred ? 'fill-amber-400' : ''
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={e => void handleDeleteArticle(article.id, e)}
                      className="rounded p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                      title="Delete article"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <h3 className="mt-1.5 line-clamp-2 text-xs font-semibold text-slate-900 group-hover:text-indigo-600">
                  {article.title}
                </h3>

                {article.excerpt && (
                  <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                    {article.excerpt}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </main>

      {/* Footer Storage Quota Dashboard */}
      <footer className="border-t border-slate-200 bg-white px-4 py-3">
        {quotaStatus?.isWarning && (
          <div className="mb-2 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
            <span className="font-medium">
              Storage {usagePercent}% full ({usageMB} / {maxMB} MB)
            </span>
            <button
              type="button"
              onClick={() => setIsQuotaModalOpen(true)}
              className="font-semibold text-amber-900 underline hover:text-amber-700"
            >
              Manage
            </button>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-slate-600">
          <button
            type="button"
            onClick={() => setIsQuotaModalOpen(true)}
            className="flex items-center gap-1.5 hover:text-slate-900"
            title="Configure Storage Budget"
          >
            <HardDrive className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-medium">Storage Quota</span>
          </button>
          <span className="text-[11px] text-slate-500">
            {usageMB} MB / {maxMB} MB limit
          </span>
        </div>

        {/* Storage Bar */}
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${quotaBarColor}`}
            style={{ width: `${usagePercent}%` }}
          />
        </div>

        <div className="mt-2.5 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            {usagePercent}% utilized ({articles.length} articles)
          </span>
          <button
            type="button"
            onClick={handleOpenKnowledgeManager}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
          >
            <Download className="h-3 w-3" />
            <span>Export Data</span>
          </button>
        </div>
      </footer>

      {/* Storage Quota Prompt Modal */}
      {isQuotaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                  <HardDrive className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Storage Quota Gatekeeper
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Using {usageMB} MB of {maxMB} MB approved cap
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsQuotaModalOpen(false);
                  setPendingRetrySave(false);
                  setQuotaFeedback(null);
                }}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {quotaStatus?.isLowPhysicalDisk && (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-700">
                <strong>Low Physical Disk Space:</strong> Less than 500 MB free
                on your hard drive. Quota expansion is blocked until disk space
                is freed.
              </div>
            )}

            {/* Option 1: Allocate More Disk Space */}
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <h3 className="text-xs font-semibold text-slate-800">
                1. Allocate Additional Disk Space
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Set a new maximum local IndexedDB cap (MB):
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={10}
                  max={10240}
                  value={customCapMB}
                  onChange={e => setCustomCapMB(e.target.value)}
                  disabled={Boolean(quotaStatus?.isLowPhysicalDisk)}
                  className="w-24 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:outline-hidden disabled:opacity-50"
                />
                <span className="text-xs text-slate-500">MB</span>
                <button
                  type="button"
                  onClick={() => void handleExpandStorageCap()}
                  disabled={Boolean(quotaStatus?.isLowPhysicalDisk)}
                  className="ml-auto rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Expand Storage Limit
                </button>
              </div>
            </div>

            {/* Option 2: Clean Up Existing Space */}
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <h3 className="text-xs font-semibold text-slate-800">
                2. Clean Up Existing Articles
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Starred articles are always protected from bulk cleanup.
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleQuickCleanupOldUnstarred()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                  <span>Purge Unstarred Older Than 30 Days</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenKnowledgeManager}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Open Full-Screen Knowledge Manager</span>
                </button>
              </div>
            </div>

            {quotaFeedback && (
              <p className="mt-2 text-center text-[11px] font-medium text-indigo-700">
                {quotaFeedback}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
