import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  FileArchive,
  FileText,
  Globe,
  HardDrive,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  bulkDeleteUnstarred,
  checkStorageQuota,
  deleteArticles,
  getAllChunks,
  getArticleChunkCount,
  getArticleContent,
  getDomainCounts,
  listArticles,
  toggleArticleStar,
  updateStorageCap,
} from '../../db';
import {
  buildJsonExportPayload,
  buildMarkdownZipArchive,
  formatArticleMarkdownWithFrontmatter,
  triggerBrowserDownload,
  type ExportArchiveItem,
} from '../../lib/export';
import type {
  ArticleContentRecord,
  ArticleRecord,
  ExtensionMessage,
  StorageQuotaStatus,
} from '../../types/messages';

const CAP_PRESETS_MB = [50, 100, 250, 500, 1024];

function formatBytesToMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function formatDate(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function todayDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function App(): React.JSX.Element {
  // Data state
  const [articles, setArticles] = useState<ArticleRecord[]>([]);
  const [domainCounts, setDomainCounts] = useState<
    Array<{ siteName: string; count: number }>
  >([]);
  const [totalChunks, setTotalChunks] = useState<number>(0);
  const [quotaStatus, setQuotaStatus] = useState<StorageQuotaStatus | null>(
    null,
  );

  // Table filter & selection state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [starredOnly, setStarredOnly] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Storage cap editor state
  const [capInputMB, setCapInputMB] = useState<string>('50');
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Bulk unstarred cleanup controls
  const [isBulkCleanupOpen, setIsBulkCleanupOpen] = useState<boolean>(false);
  const [cleanupAgeDays, setCleanupAgeDays] = useState<string>('30');
  const [cleanupDomain, setCleanupDomain] = useState<string>('all');

  // Export progress state
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Markdown preview modal state (on-demand 3NF content load)
  const [previewArticle, setPreviewArticle] = useState<ArticleRecord | null>(
    null,
  );
  const [previewContent, setPreviewContent] = useState<
    ArticleContentRecord | undefined
  >(undefined);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);

  const loadAllData = useCallback(async () => {
    try {
      const [loadedArticles, domains, chunks, quota] = await Promise.all([
        listArticles(),
        getDomainCounts(),
        getAllChunks(),
        checkStorageQuota(),
      ]);
      setArticles(loadedArticles);
      setDomainCounts(domains);
      setTotalChunks(chunks.length);
      setQuotaStatus(quota);
      setCapInputMB(String(Math.round(quota.maxStorageBytes / (1024 * 1024))));
    } catch (err) {
      console.error('[Second Brain Options] Failed to load data:', err);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadAllData());

    const handleRuntimeMessage = (message: ExtensionMessage) => {
      if (message.type === 'ARTICLE_INDEXED') {
        void loadAllData();
      }
    };
    chrome.runtime?.onMessage?.addListener(handleRuntimeMessage);
    return () => {
      chrome.runtime?.onMessage?.removeListener(handleRuntimeMessage);
    };
  }, [loadAllData]);

  const filteredArticles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return articles.filter(article => {
      if (selectedDomain !== 'all' && article.siteName !== selectedDomain) {
        return false;
      }
      if (starredOnly && !article.isStarred) {
        return false;
      }
      if (!q) return true;
      return (
        article.title.toLowerCase().includes(q) ||
        article.siteName.toLowerCase().includes(q) ||
        article.url.toLowerCase().includes(q) ||
        article.excerpt.toLowerCase().includes(q)
      );
    });
  }, [articles, searchQuery, selectedDomain, starredOnly]);

  const allVisibleSelected =
    filteredArticles.length > 0 &&
    filteredArticles.every(a => selectedIds.has(a.id));

  const handleToggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      const next = new Set(selectedIds);
      for (const a of filteredArticles) {
        next.delete(a.id);
      }
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      for (const a of filteredArticles) {
        next.add(a.id);
      }
      setSelectedIds(next);
    }
  };

  const handleToggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleSaveCap = async (targetMB?: number) => {
    const mb = targetMB ?? Number.parseFloat(capInputMB);
    if (!Number.isFinite(mb) || mb < 10) {
      setStatusBanner('Please enter a valid storage limit (minimum 10 MB).');
      return;
    }

    try {
      if (mb > 50 && chrome.permissions?.request) {
        await chrome.permissions
          .request({ permissions: ['unlimitedStorage'] })
          .catch(() => false);
      }
      const newBytes = Math.round(mb * 1024 * 1024);
      await updateStorageCap(newBytes);
      setCapInputMB(String(Math.round(mb)));
      setStatusBanner(`Storage cap updated to ${Math.round(mb)} MB.`);
      await loadAllData();
    } catch (err) {
      setStatusBanner(
        err instanceof Error ? err.message : 'Failed to update storage cap.',
      );
    }
  };

  const handleToggleStar = async (articleId: string) => {
    try {
      await toggleArticleStar(articleId);
      await loadAllData();
    } catch (err) {
      console.error('[Second Brain Options] Failed to toggle star:', err);
    }
  };

  const handleDeleteIds = async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const deletedCount = await deleteArticles(ids);
      setSelectedIds(prev => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setStatusBanner(
        `Deleted ${deletedCount} article${deletedCount === 1 ? '' : 's'} and all associated vector chunks.`,
      );
      await loadAllData();
    } catch (err) {
      console.error('[Second Brain Options] Delete failed:', err);
    }
  };

  const handleRunBulkUnstarredCleanup = async () => {
    try {
      const days = Number.parseInt(cleanupAgeDays, 10);
      const olderThanMs =
        Number.isFinite(days) && days > 0
          ? days * 24 * 60 * 60 * 1000
          : undefined;
      const siteName = cleanupDomain !== 'all' ? cleanupDomain : undefined;

      const deletedCount = await bulkDeleteUnstarred({
        olderThanMs,
        siteName,
      });
      setStatusBanner(
        deletedCount > 0
          ? `Bulk cleanup removed ${deletedCount} unstarred article${deletedCount === 1 ? '' : 's'}. Starred articles were preserved.`
          : 'No unstarred articles matched the cleanup criteria.',
      );
      setIsBulkCleanupOpen(false);
      await loadAllData();
    } catch (err) {
      console.error('[Second Brain Options] Bulk cleanup failed:', err);
    }
  };

  const handleExportMarkdownZip = async () => {
    if (articles.length === 0 || isExporting) return;
    setIsExporting(true);
    try {
      const items: ExportArchiveItem[] = await Promise.all(
        articles.map(async article => {
          const content = await getArticleContent(article.id);
          return { article, content };
        }),
      );
      const zipBytes = buildMarkdownZipArchive(items);
      triggerBrowserDownload(
        zipBytes,
        `second-brain-export-${todayDateStamp()}.zip`,
        'application/zip',
      );
      setStatusBanner(
        `Exported ${items.length} article${items.length === 1 ? '' : 's'} as Markdown (.zip).`,
      );
    } catch (err) {
      console.error('[Second Brain Options] ZIP export failed:', err);
      setStatusBanner('Failed to generate Markdown .zip export.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportJson = async () => {
    if (articles.length === 0 || isExporting) return;
    setIsExporting(true);
    try {
      const items: ExportArchiveItem[] = await Promise.all(
        articles.map(async article => {
          const [content, chunkCount] = await Promise.all([
            getArticleContent(article.id),
            getArticleChunkCount(article.id),
          ]);
          return { article, content, chunkCount };
        }),
      );
      const jsonPayload = buildJsonExportPayload(items);
      triggerBrowserDownload(
        jsonPayload,
        `second-brain-export-${todayDateStamp()}.json`,
        'application/json',
      );
      setStatusBanner(
        `Exported ${items.length} article${items.length === 1 ? '' : 's'} as JSON backup.`,
      );
    } catch (err) {
      console.error('[Second Brain Options] JSON export failed:', err);
      setStatusBanner('Failed to generate JSON export.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenPreview = async (article: ArticleRecord) => {
    setPreviewArticle(article);
    setPreviewContent(undefined);
    setIsPreviewLoading(true);
    try {
      const content = await getArticleContent(article.id);
      setPreviewContent(content);
    } catch (err) {
      console.error(
        '[Second Brain Options] Failed to load article content:',
        err,
      );
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const usageMB = quotaStatus
    ? formatBytesToMB(
        quotaStatus.indexedDBUsageBytes ?? quotaStatus.currentUsageBytes,
      )
    : '0.0';
  const maxMB = quotaStatus
    ? Math.round(quotaStatus.maxStorageBytes / (1024 * 1024))
    : 50;
  const usagePercent = quotaStatus
    ? Math.min(100, Number((quotaStatus.usageRatio * 100).toFixed(1)))
    : 0;
  const barColor = quotaStatus?.isExceeded
    ? 'bg-rose-600'
    : quotaStatus?.isWarning
      ? 'bg-amber-500'
      : 'bg-indigo-600';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Top Navigation */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
              <Brain className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                Second Brain — Knowledge Manager
              </h1>
              <p className="text-xs text-slate-500">
                Local-first semantic knowledge base, storage budget, and exports
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleExportMarkdownZip()}
              disabled={articles.length === 0 || isExporting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
            >
              <FileArchive className="h-4 w-4 text-indigo-600" />
              <span>Export Markdown (.zip)</span>
            </button>
            <button
              type="button"
              onClick={() => void handleExportJson()}
              disabled={articles.length === 0 || isExporting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
            >
              <Database className="h-4 w-4 text-indigo-600" />
              <span>Export JSON</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {statusBanner && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs font-medium text-indigo-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-indigo-600" />
              <span>{statusBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
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

        {/* Storage Budget Overview Card */}
        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <HardDrive className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  User-Controlled Storage Quota
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  100% on-device IndexedDB storage. By default, Second Brain is
                  capped at a strict 50 MB budget (~1,000–1,500 articles).
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Approved Cap: {maxMB} MB</span>
              </span>
            </div>
          </div>

          {/* Quota Progress Bar */}
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-slate-600">
                Current Usage:{' '}
                <strong className="text-slate-900">{usageMB} MB</strong> of{' '}
                <strong>{maxMB} MB</strong> cap
              </span>
              <span className="text-slate-500">{usagePercent}% utilized</span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>
                <strong>{articles.length}</strong> articles indexed •{' '}
                <strong>{totalChunks}</strong> vector chunks (384-d
                Float32Array)
              </span>
              <span>
                Safety threshold: Warns at 85% • Pauses saves at 100% to request
                expansion
              </span>
            </div>
            {quotaStatus?.modelCacheUsageBytes !== undefined &&
              quotaStatus.modelCacheUsageBytes > 0 && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-400" />
                  <span>
                    On-Device AI Model Cache:{' '}
                    {(quotaStatus.modelCacheUsageBytes / (1024 * 1024)).toFixed(
                      1,
                    )}{' '}
                    MB (stored in browser Cache API, separate from article
                    quota)
                  </span>
                </div>
              )}
          </div>

          {/* Storage Cap Editor */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium text-slate-600">
                Quick Cap Presets:
              </span>
              {CAP_PRESETS_MB.map(preset => (
                <button
                  key={preset}
                  type="button"
                  disabled={Boolean(quotaStatus?.isLowPhysicalDisk)}
                  onClick={() => void handleSaveCap(preset)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    maxMB === preset
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  } disabled:opacity-50`}
                >
                  {preset >= 1024 ? '1 GB' : `${preset} MB`}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor="custom-cap-input"
                className="text-xs font-medium text-slate-600"
              >
                Custom Limit (MB):
              </label>
              <input
                id="custom-cap-input"
                type="number"
                min={10}
                max={10240}
                value={capInputMB}
                onChange={e => setCapInputMB(e.target.value)}
                disabled={Boolean(quotaStatus?.isLowPhysicalDisk)}
                className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-hidden"
              />
              <button
                type="button"
                disabled={Boolean(quotaStatus?.isLowPhysicalDisk)}
                onClick={() => void handleSaveCap()}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Save Cap
              </button>
            </div>
          </div>
        </section>

        {/* Knowledge Base Articles Table Section */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
          {/* Table Controls Bar */}
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] max-w-sm flex-1">
                <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Filter articles by title, domain, or concept..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <select
                value={selectedDomain}
                onChange={e => setSelectedDomain(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:border-indigo-500 focus:bg-white focus:outline-hidden"
              >
                <option value="all">All Domains ({articles.length})</option>
                {domainCounts.map(({ siteName, count }) => (
                  <option key={siteName} value={siteName}>
                    {siteName} ({count})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setStarredOnly(!starredOnly)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  starredOnly
                    ? 'border-amber-400 bg-amber-50 text-amber-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Star
                  className={`h-3.5 w-3.5 ${
                    starredOnly ? 'fill-amber-400 text-amber-400' : ''
                  }`}
                />
                <span>Starred Only</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    void handleDeleteIds(Array.from(selectedIds.values()))
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white shadow-xs hover:bg-rose-700"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete Selected ({selectedIds.size})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsBulkCleanupOpen(prev => !prev)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Trash2 className="h-3.5 w-3.5 text-slate-500" />
                <span>Bulk Cleanup</span>
              </button>
            </div>
          </div>

          {/* Bulk Unstarred Cleanup Drawer */}
          {isBulkCleanupOpen && (
            <div className="border-b border-slate-200 bg-amber-50/60 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                  <span className="font-semibold text-slate-900">
                    Bulk Unstarred Cleanup:
                  </span>
                  <select
                    value={cleanupAgeDays}
                    onChange={e => setCleanupAgeDays(e.target.value)}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs"
                  >
                    <option value="0">All ages</option>
                    <option value="7">Older than 7 days</option>
                    <option value="30">Older than 30 days</option>
                    <option value="90">Older than 90 days</option>
                  </select>
                  <span>from</span>
                  <select
                    value={cleanupDomain}
                    onChange={e => setCleanupDomain(e.target.value)}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs"
                  >
                    <option value="all">All domains</option>
                    {domainCounts.map(({ siteName }) => (
                      <option key={siteName} value={siteName}>
                        {siteName}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-slate-500">
                    (Starred articles are strictly protected)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRunBulkUnstarredCleanup()}
                    className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                  >
                    Purge Unstarred Articles
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBulkCleanupOpen(false)}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Table Layout */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th scope="col" className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      disabled={filteredArticles.length === 0}
                      onChange={handleToggleSelectAllVisible}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Article Title & Domain
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Saved Date
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Reading Time
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Status
                  </th>
                  <th
                    scope="col"
                    className="w-36 px-4 py-3 text-right font-semibold"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredArticles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                          <Download className="h-6 w-6" />
                        </div>
                        <h3 className="mt-3 text-sm font-semibold text-slate-800">
                          {articles.length === 0
                            ? 'No Articles Indexed Yet'
                            : 'No Articles Match Your Filter'}
                        </h3>
                        <p className="mt-1 max-w-sm text-xs text-slate-500">
                          {articles.length === 0 ? (
                            <>
                              Your Second Brain is ready. Start browsing
                              articles on the web and click{' '}
                              <strong className="text-slate-700">
                                Remember
                              </strong>{' '}
                              or press{' '}
                              <kbd className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                                Alt+S
                              </kbd>{' '}
                              to index content locally.
                            </>
                          ) : (
                            'Try clearing your search text, domain dropdown, or Starred filter.'
                          )}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredArticles.map(article => {
                    const isSelected = selectedIds.has(article.id);
                    return (
                      <tr
                        key={article.id}
                        className={`transition-colors hover:bg-slate-50 ${
                          isSelected ? 'bg-indigo-50/40' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectRow(article.id)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="max-w-md px-4 py-3">
                          <div className="flex items-start gap-2.5">
                            {article.faviconUrl ? (
                              <img
                                src={article.faviconUrl}
                                alt=""
                                className="mt-0.5 h-4 w-4 shrink-0 rounded-xs"
                              />
                            ) : (
                              <Globe className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                            )}
                            <div className="min-w-0">
                              <a
                                href={article.url}
                                target="_blank"
                                rel="noreferrer"
                                className="line-clamp-1 font-semibold text-slate-900 hover:text-indigo-600"
                              >
                                {article.title}
                              </a>
                              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                                <span className="font-medium text-slate-600">
                                  {article.siteName}
                                </span>
                                {article.byline && (
                                  <>
                                    <span>•</span>
                                    <span className="truncate">
                                      {article.byline}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {formatDate(article.savedAt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {article.readingTimeMinutes} min read
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              article.status === 'indexed'
                                ? 'bg-emerald-50 text-emerald-700'
                                : article.status === 'indexing'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {article.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void handleToggleStar(article.id)}
                              className={`rounded p-1.5 transition-colors ${
                                article.isStarred
                                  ? 'text-amber-500 hover:bg-amber-50'
                                  : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                              }`}
                              title={
                                article.isStarred
                                  ? 'Unstar article'
                                  : 'Star article'
                              }
                            >
                              <Star
                                className={`h-4 w-4 ${
                                  article.isStarred ? 'fill-amber-400' : ''
                                }`}
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleOpenPreview(article)}
                              className="rounded p-1.5 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                              title="Read Distilled Markdown"
                            >
                              <FileText className="h-4 w-4" />
                            </button>
                            <a
                              href={article.url}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                              title="Open original URL"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                            <button
                              type="button"
                              onClick={() => void handleDeleteIds([article.id])}
                              className="rounded p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                              title="Delete article"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* On-Demand Markdown Reader Preview Modal */}
      {previewArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {previewArticle.title}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {previewArticle.siteName} • Saved{' '}
                  {formatDate(previewArticle.savedAt)} •{' '}
                  {previewArticle.readingTimeMinutes} min read
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewArticle(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {isPreviewLoading ? (
                <p className="text-xs text-slate-500">
                  Loading partitioned Markdown from IndexedDB…
                </p>
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-700">
                  {formatArticleMarkdownWithFrontmatter(
                    previewArticle,
                    previewContent,
                  )}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
