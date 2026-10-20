import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { useStorageQuota } from '../../hooks/useStorageQuota';
import { useKnowledgeManager } from './hooks/useKnowledgeManager';
import { OptionsHeader } from './components/OptionsHeader';
import { StorageOverviewCard } from './components/StorageOverviewCard';
import { ArticlesTable } from './components/ArticlesTable';
import { MarkdownPreviewModal } from './components/MarkdownPreviewModal';

export default function App(): React.JSX.Element {
  const { quotaStatus, refreshQuota, updateCap } = useStorageQuota();
  const km = useKnowledgeManager({ onDataChange: refreshQuota });

  const [capInputMB, setCapInputMB] = useState<string>('50');

  useEffect(() => {
    if (quotaStatus) {
      const mb = String(
        Math.round(quotaStatus.maxStorageBytes / (1024 * 1024)),
      );
      void Promise.resolve().then(() => setCapInputMB(mb));
    }
  }, [quotaStatus]);

  const handleSaveCap = async (targetMB?: number) => {
    const mb = targetMB ?? Number.parseFloat(capInputMB);
    if (!Number.isFinite(mb) || mb < 10) {
      km.setStatusBanner('Please enter a valid storage limit (minimum 10 MB).');
      return;
    }

    try {
      const newBytes = Math.round(mb * 1024 * 1024);
      await updateCap(newBytes);
      setCapInputMB(String(Math.round(mb)));
      km.setStatusBanner(`Storage cap updated to ${Math.round(mb)} MB.`);
    } catch (err) {
      km.setStatusBanner(
        err instanceof Error ? err.message : 'Failed to update storage cap.',
      );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <OptionsHeader
        articlesCount={km.articles.length}
        isExporting={km.isExporting}
        onExportMarkdownZip={km.handleExportZip}
        onExportJson={km.handleExportJson}
      />

      <main className="mx-auto max-w-7xl px-6 py-8">
        {km.statusBanner && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs font-medium text-indigo-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-indigo-600" />
              <span>{km.statusBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => km.setStatusBanner(null)}
              className="text-indigo-500 hover:text-indigo-800"
              aria-label="Close notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {quotaStatus?.isLowPhysicalDisk && (
          <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>
              <strong>Critical Low Disk Space:</strong> Less than 500 MB of
              physical disk space remains on your drive. New saves and quota
              expansions are paused to protect system stability.
            </span>
          </div>
        )}

        <StorageOverviewCard
          quotaStatus={quotaStatus}
          articlesCount={km.articles.length}
          totalChunks={km.totalChunks}
          capInputMB={capInputMB}
          setCapInputMB={setCapInputMB}
          onSaveCap={handleSaveCap}
        />

        <ArticlesTable
          articles={km.articles}
          filteredArticles={km.filteredArticles}
          domainCounts={km.domainCounts}
          searchQuery={km.searchQuery}
          setSearchQuery={km.setSearchQuery}
          selectedDomain={km.selectedDomain}
          setSelectedDomain={km.setSelectedDomain}
          starredOnly={km.starredOnly}
          setStarredOnly={km.setStarredOnly}
          selectedIds={km.selectedIds}
          allVisibleSelected={km.allVisibleSelected}
          onToggleSelectAll={km.toggleSelectAllVisible}
          onToggleSelectRow={km.toggleSelectRow}
          onDeleteSelected={km.deleteSelectedArticles}
          isBulkCleanupOpen={km.isBulkCleanupOpen}
          onToggleBulkCleanup={() => km.setIsBulkCleanupOpen(prev => !prev)}
          cleanupAgeDays={km.cleanupAgeDays}
          setCleanupAgeDays={km.setCleanupAgeDays}
          cleanupDomain={km.cleanupDomain}
          setCleanupDomain={km.setCleanupDomain}
          onRunBulkCleanup={km.handleBulkCleanup}
          onCloseBulkCleanup={() => km.setIsBulkCleanupOpen(false)}
          onToggleStar={km.toggleStar}
          onOpenPreview={km.openPreview}
          onDeleteArticle={id => km.deleteArticlesByIds([id])}
        />
      </main>

      <MarkdownPreviewModal
        article={km.previewArticle}
        content={km.previewContent}
        isLoading={km.isPreviewLoading}
        onClose={km.closePreview}
      />
    </div>
  );
}
