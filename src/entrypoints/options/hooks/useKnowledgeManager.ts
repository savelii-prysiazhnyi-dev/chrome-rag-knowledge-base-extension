import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  bulkDeleteUnstarred,
  deleteArticles,
  getAllChunks,
  getArticleChunkCount,
  getArticleContent,
  getDomainCounts,
  listArticles,
  toggleArticleStar,
} from '../../../db';
import {
  buildJsonExportPayload,
  buildMarkdownZipArchive,
  triggerBrowserDownload,
  type ExportArchiveItem,
} from '../../../lib/export';
import { todayDateStamp } from '../../../lib/utils/format';
import type {
  ArticleContentRecord,
  ArticleRecord,
  ExtensionMessage,
} from '../../../types/messages';

export interface UseKnowledgeManagerOptions {
  onDataChange?: () => unknown;
}

export function useKnowledgeManager(options: UseKnowledgeManagerOptions = {}) {
  const { onDataChange } = options;

  // Data state
  const [articles, setArticles] = useState<ArticleRecord[]>([]);
  const [domainCounts, setDomainCounts] = useState<
    Array<{ siteName: string; count: number }>
  >([]);
  const [totalChunks, setTotalChunks] = useState<number>(0);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Table filter & selection state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [starredOnly, setStarredOnly] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk unstarred cleanup controls
  const [isBulkCleanupOpen, setIsBulkCleanupOpen] = useState<boolean>(false);
  const [cleanupAgeDays, setCleanupAgeDays] = useState<string>('30');
  const [cleanupDomain, setCleanupDomain] = useState<string>('all');

  // Export progress state
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Markdown preview modal state
  const [previewArticle, setPreviewArticle] = useState<ArticleRecord | null>(
    null,
  );
  const [previewContent, setPreviewContent] = useState<
    ArticleContentRecord | undefined
  >(undefined);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);

  const loadAllData = useCallback(async () => {
    try {
      const [loadedArticles, domains, chunks] = await Promise.all([
        listArticles(),
        getDomainCounts(),
        getAllChunks(),
      ]);
      setArticles(loadedArticles);
      setDomainCounts(domains);
      setTotalChunks(chunks.length);
    } catch (err) {
      console.error('[useKnowledgeManager] Failed to load data:', err);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadAllData());

    const handleRuntimeMessage = (message: ExtensionMessage) => {
      if (message.type === 'ARTICLE_INDEXED') {
        void loadAllData();
        void onDataChange?.();
      }
    };
    chrome.runtime?.onMessage?.addListener(handleRuntimeMessage);
    return () => {
      chrome.runtime?.onMessage?.removeListener(handleRuntimeMessage);
    };
  }, [loadAllData, onDataChange]);

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

  const toggleSelectAllVisible = useCallback(() => {
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
  }, [allVisibleSelected, filteredArticles, selectedIds]);

  const toggleSelectRow = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleStar = useCallback(
    async (articleId: string) => {
      try {
        await toggleArticleStar(articleId);
        await loadAllData();
        void onDataChange?.();
      } catch (err) {
        console.error('[useKnowledgeManager] Failed to toggle star:', err);
      }
    },
    [loadAllData, onDataChange],
  );

  const deleteArticlesByIds = useCallback(
    async (ids: string[]) => {
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
        void onDataChange?.();
      } catch (err) {
        console.error('[useKnowledgeManager] Delete failed:', err);
      }
    },
    [loadAllData, onDataChange],
  );

  const deleteSelectedArticles = useCallback(async () => {
    await deleteArticlesByIds(Array.from(selectedIds.values()));
  }, [deleteArticlesByIds, selectedIds]);

  const handleBulkCleanup = useCallback(async (): Promise<number> => {
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
      void onDataChange?.();
      return deletedCount;
    } catch (err) {
      console.error('[useKnowledgeManager] Bulk cleanup failed:', err);
      throw err;
    }
  }, [cleanupAgeDays, cleanupDomain, loadAllData, onDataChange]);

  const handleExportZip = useCallback(async () => {
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
      console.error('[useKnowledgeManager] ZIP export failed:', err);
      setStatusBanner('Failed to generate Markdown .zip export.');
    } finally {
      setIsExporting(false);
    }
  }, [articles, isExporting]);

  const handleExportJson = useCallback(async () => {
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
      console.error('[useKnowledgeManager] JSON export failed:', err);
      setStatusBanner('Failed to generate JSON export.');
    } finally {
      setIsExporting(false);
    }
  }, [articles, isExporting]);

  const openPreview = useCallback(async (article: ArticleRecord) => {
    setPreviewArticle(article);
    setPreviewContent(undefined);
    setIsPreviewLoading(true);
    try {
      const content = await getArticleContent(article.id);
      setPreviewContent(content);
    } catch (err) {
      console.error('[useKnowledgeManager] Failed to load content:', err);
    } finally {
      setIsPreviewLoading(false);
    }
  }, []);

  const closePreview = useCallback(() => {
    setPreviewArticle(null);
    setPreviewContent(undefined);
  }, []);

  return {
    articles,
    domainCounts,
    totalChunks,
    statusBanner,
    setStatusBanner,
    searchQuery,
    setSearchQuery,
    selectedDomain,
    setSelectedDomain,
    starredOnly,
    setStarredOnly,
    filteredArticles,
    selectedIds,
    allVisibleSelected,
    toggleSelectRow,
    toggleSelectAllVisible,
    clearSelection,
    toggleStar,
    deleteArticlesByIds,
    deleteSelectedArticles,
    isBulkCleanupOpen,
    setIsBulkCleanupOpen,
    cleanupAgeDays,
    setCleanupAgeDays,
    cleanupDomain,
    setCleanupDomain,
    handleBulkCleanup,
    isExporting,
    handleExportZip,
    handleExportJson,
    previewArticle,
    previewContent,
    isPreviewLoading,
    openPreview,
    closePreview,
    loadAllData,
  };
}
