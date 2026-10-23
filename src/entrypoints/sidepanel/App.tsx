import React, { useCallback, useState } from 'react';
import { BookOpen, RefreshCw, Search } from 'lucide-react';
import { useStorageQuota } from '../../hooks/useStorageQuota';
import { useActiveTab } from './hooks/useActiveTab';
import { useLibraryArticles } from './hooks/useLibraryArticles';
import { useSearchAndRelated } from './hooks/useSearchAndRelated';
import { SidePanelHeader } from './components/SidePanelHeader';
import { ActiveTabBanner } from './components/ActiveTabBanner';
import { SearchBar } from './components/SearchBar';
import { DomainFilterPills } from './components/DomainFilterPills';
import { ArticleCard } from './components/ArticleCard';
import { SearchResultCard } from './components/SearchResultCard';
import { StorageFooter } from './components/StorageFooter';
import { StorageQuotaModal } from './components/StorageQuotaModal';
import type { ArticleRecord } from '../../types/messages';

export default function App(): React.JSX.Element {
  const { quotaStatus, refreshQuota, updateCap } = useStorageQuota();

  // Storage Quota Modal state
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState<boolean>(false);
  const [pendingRetrySave, setPendingRetrySave] = useState<boolean>(false);
  const [customCapMB, setCustomCapMB] = useState<string>('250');
  const [quotaFeedback, setQuotaFeedback] = useState<string | null>(null);

  const handleQuotaExceeded = useCallback((suggestedCapBytes: number) => {
    const suggestedMB = Math.round(suggestedCapBytes / (1024 * 1024));
    setCustomCapMB(String(suggestedMB || 250));
    setPendingRetrySave(true);
    setIsQuotaModalOpen(true);
  }, []);

  const handleOpenKnowledgeManager = useCallback(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      void chrome.runtime.openOptionsPage();
    }
  }, []);

  const activeTab = useActiveTab({
    onQuotaExceeded: handleQuotaExceeded,
    onDataChange: () => {
      void refreshQuota();
    },
  });

  const library = useLibraryArticles({
    onStarToggled: (updated: ArticleRecord) => {
      if (activeTab.savedArticle?.id === updated.id) {
        activeTab.setSavedArticle(updated);
      }
      search.updateArticleInResults(updated);
    },
    onArticleDeleted: (articleId: string) => {
      if (activeTab.savedArticle?.id === articleId) {
        activeTab.setSavedArticle(undefined);
        if (
          activeTab.activeTabId !== undefined &&
          chrome.action?.setBadgeText
        ) {
          void chrome.action
            .setBadgeText({ tabId: activeTab.activeTabId, text: '' })
            .catch(() => {});
        }
      }
      search.removeArticleFromResults(articleId);
    },
    onDataChange: () => {
      void refreshQuota();
    },
  });

  const search = useSearchAndRelated({
    domainFilter: library.domainFilter,
    starredOnly: library.starredOnly,
  });

  const handleExpandStorageCap = async () => {
    const parsedMB = Number.parseFloat(customCapMB);
    if (!Number.isFinite(parsedMB) || parsedMB < 10) {
      setQuotaFeedback('Please enter a valid storage limit (at least 10 MB).');
      return;
    }

    const newBytes = Math.round(parsedMB * 1024 * 1024);
    try {
      await updateCap(newBytes);
      setQuotaFeedback(null);
      setIsQuotaModalOpen(false);
      await library.refreshLibrary();

      if (pendingRetrySave) {
        setPendingRetrySave(false);
        await activeTab.rememberTab();
      }
    } catch (err) {
      setQuotaFeedback(
        err instanceof Error ? err.message : 'Failed to update storage cap.',
      );
    }
  };

  const handleQuickCleanup = async () => {
    try {
      const deleted = await library.quickCleanupOldUnstarred();
      setQuotaFeedback(
        deleted > 0
          ? `Cleaned up ${deleted} unstarred article${deleted === 1 ? '' : 's'} older than 30 days.`
          : 'No unstarred articles older than 30 days found.',
      );
      await activeTab.refreshActiveTab();
      await refreshQuota();
    } catch {
      setQuotaFeedback('Failed to run cleanup.');
    }
  };

  const handleRemoveActiveTab = async () => {
    const removedId = activeTab.savedArticle?.id;
    await activeTab.removeTab();
    if (removedId) {
      search.removeArticleFromResults(removedId);
      await library.refreshLibrary();
      await refreshQuota();
    }
  };

  return (
    <div className="flex h-screen w-full flex-col bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200/80 bg-white px-4 pt-3 pb-3">
        <SidePanelHeader onOpenKnowledgeManager={handleOpenKnowledgeManager} />
        <div className="mx-auto my-2.5 h-px w-3/5 bg-slate-200" />
        <ActiveTabBanner
          savedArticle={activeTab.savedArticle}
          activeTabUrl={activeTab.activeTabUrl}
          isSaving={activeTab.isSaving}
          saveError={activeTab.saveError}
          onSaveOrUpdate={() => void activeTab.rememberTab()}
          onRemove={() => void handleRemoveActiveTab()}
          onDismissError={() => activeTab.setSaveError(null)}
        />
      </header>

      <div className="border-b border-slate-200 bg-white px-4 pt-0.5 pb-3">
        <SearchBar
          value={search.searchQuery}
          onChange={search.setSearchQuery}
          onClear={search.clearSearch}
        />
        <DomainFilterPills
          starredOnly={library.starredOnly}
          domainFilter={library.domainFilter}
          domainCounts={library.domainCounts}
          onSelectAll={() => {
            library.setStarredOnly(false);
            library.setDomainFilter(undefined);
          }}
          onToggleStarred={() => library.setStarredOnly(prev => !prev)}
          onSelectDomain={domain =>
            library.setDomainFilter(
              !domain || library.domainFilter === domain ? undefined : domain,
            )
          }
        />
      </div>

      <main className="flex-1 overflow-y-auto p-3">
        {search.isSearchingMode ? (
          search.isSearching ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <RefreshCw className="h-5 w-5 animate-spin text-cyan-700" />
              <p className="mt-2 text-xs text-slate-500">
                Running hybrid semantic + lexical search…
              </p>
            </div>
          ) : search.searchResults.length === 0 ? (
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
              {search.searchResults.map(result => (
                <SearchResultCard
                  key={result.article.id}
                  result={result}
                  onClick={() =>
                    void search.handleSnippetClick(result.article.url)
                  }
                />
              ))}
            </div>
          )
        ) : library.articles.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <BookOpen className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-slate-800">
              {library.starredOnly || library.domainFilter
                ? 'No Articles Match Filter'
                : 'Your Second Brain is Empty'}
            </h3>
            <p className="mt-1.5 max-w-xs text-xs text-slate-500">
              {library.starredOnly || library.domainFilter ? (
                'Try switching back to All articles or clearing the active domain filter.'
              ) : (
                <>
                  Navigate to an interesting article, documentation, or
                  discussion, and click{' '}
                  <span className="font-semibold text-cyan-700">Remember</span>{' '}
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
            {library.articles.map(article => (
              <ArticleCard
                key={article.id}
                article={article}
                onClick={() => void search.handleSnippetClick(article.url)}
                onToggleStar={e => void library.toggleStar(article.id, e)}
                onDelete={e => void library.deleteArticle(article.id, e)}
              />
            ))}
          </div>
        )}
      </main>

      <StorageFooter
        quotaStatus={quotaStatus}
        articlesCount={library.articles.length}
        onOpenQuotaModal={() => setIsQuotaModalOpen(true)}
        onOpenKnowledgeManager={handleOpenKnowledgeManager}
      />

      <StorageQuotaModal
        isOpen={isQuotaModalOpen}
        onClose={() => {
          setIsQuotaModalOpen(false);
          setPendingRetrySave(false);
          setQuotaFeedback(null);
        }}
        quotaStatus={quotaStatus}
        customCapMB={customCapMB}
        setCustomCapMB={setCustomCapMB}
        onExpandCap={handleExpandStorageCap}
        onQuickCleanup={handleQuickCleanup}
        onOpenKnowledgeManager={handleOpenKnowledgeManager}
        quotaFeedback={quotaFeedback}
      />
    </div>
  );
}
