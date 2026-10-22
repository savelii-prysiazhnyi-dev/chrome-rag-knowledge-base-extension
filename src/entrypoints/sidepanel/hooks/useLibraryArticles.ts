import { useCallback, useEffect, useState } from 'react';
import {
  bulkDeleteUnstarred,
  deleteArticles,
  getDomainCounts,
  listArticles,
  toggleArticleStar,
} from '../../../db';
import type { ArticleRecord, ExtensionMessage } from '../../../types/messages';

export interface UseLibraryArticlesOptions {
  onStarToggled?: (updated: ArticleRecord) => void;
  onArticleDeleted?: (articleId: string) => void;
  onDataChange?: () => unknown;
}

export interface UseLibraryArticlesReturn {
  articles: ArticleRecord[];
  domainCounts: Array<{ siteName: string; count: number }>;
  starredOnly: boolean;
  setStarredOnly: React.Dispatch<React.SetStateAction<boolean>>;
  domainFilter: string | undefined;
  setDomainFilter: React.Dispatch<React.SetStateAction<string | undefined>>;
  refreshLibrary: () => Promise<void>;
  toggleStar: (
    articleId: string,
    event?: React.MouseEvent,
  ) => Promise<ArticleRecord | undefined>;
  deleteArticle: (articleId: string, event?: React.MouseEvent) => Promise<void>;
  quickCleanupOldUnstarred: (olderThanMs?: number) => Promise<number>;
  isLoading: boolean;
}

export function useLibraryArticles(
  options: UseLibraryArticlesOptions = {},
): UseLibraryArticlesReturn {
  const { onStarToggled, onArticleDeleted, onDataChange } = options;

  const [articles, setArticles] = useState<ArticleRecord[]>([]);
  const [domainCounts, setDomainCounts] = useState<
    Array<{ siteName: string; count: number }>
  >([]);
  const [starredOnly, setStarredOnly] = useState<boolean>(false);
  const [domainFilter, setDomainFilter] = useState<string | undefined>(
    undefined,
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshLibrary = useCallback(async () => {
    try {
      const [loadedArticles, domains] = await Promise.all([
        listArticles({ domainFilter, starredOnly }),
        getDomainCounts(),
      ]);
      setArticles(loadedArticles);
      setDomainCounts(domains);
    } catch (err) {
      console.error('[useLibraryArticles] Failed to load library:', err);
    } finally {
      setIsLoading(false);
    }
  }, [domainFilter, starredOnly]);

  useEffect(() => {
    void Promise.resolve().then(() => refreshLibrary());

    const handleRuntimeMessage = (message: ExtensionMessage) => {
      if (
        message.type === 'ARTICLE_INDEXED' ||
        message.type === 'DATABASE_UPDATED'
      ) {
        void refreshLibrary();
      }
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    }

    return () => {
      if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
      }
    };
  }, [refreshLibrary]);

  const toggleStar = useCallback(
    async (
      articleId: string,
      event?: React.MouseEvent,
    ): Promise<ArticleRecord | undefined> => {
      event?.stopPropagation();
      try {
        const updated = await toggleArticleStar(articleId);
        if (updated) {
          onStarToggled?.(updated);
        }
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime
            .sendMessage({
              type: 'DATABASE_UPDATED',
              payload: { reason: 'article_starred', articleId },
            } satisfies ExtensionMessage)
            .catch(() => {});
        }
        await refreshLibrary();
        onDataChange?.();
        return updated;
      } catch (err) {
        console.error('[useLibraryArticles] Failed to toggle star:', err);
        return undefined;
      }
    },
    [onDataChange, onStarToggled, refreshLibrary],
  );

  const deleteArticle = useCallback(
    async (articleId: string, event?: React.MouseEvent): Promise<void> => {
      event?.stopPropagation();
      try {
        await deleteArticles([articleId]);
        onArticleDeleted?.(articleId);
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime
            .sendMessage({
              type: 'DATABASE_UPDATED',
              payload: { reason: 'article_deleted', articleId },
            } satisfies ExtensionMessage)
            .catch(() => {});
        }
        await refreshLibrary();
        onDataChange?.();
      } catch (err) {
        console.error('[useLibraryArticles] Failed to delete article:', err);
      }
    },
    [onArticleDeleted, onDataChange, refreshLibrary],
  );

  const quickCleanupOldUnstarred = useCallback(
    async (olderThanMs: number = 30 * 24 * 60 * 60 * 1000): Promise<number> => {
      try {
        const deleted = await bulkDeleteUnstarred({ olderThanMs });
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime
            .sendMessage({
              type: 'DATABASE_UPDATED',
              payload: { reason: 'bulk_cleanup' },
            } satisfies ExtensionMessage)
            .catch(() => {});
        }
        await refreshLibrary();
        onDataChange?.();
        return deleted;
      } catch (err) {
        console.error('[useLibraryArticles] Bulk cleanup failed:', err);
        throw err;
      }
    },
    [onDataChange, refreshLibrary],
  );

  return {
    articles,
    domainCounts,
    starredOnly,
    setStarredOnly,
    domainFilter,
    setDomainFilter,
    refreshLibrary,
    toggleStar,
    deleteArticle,
    quickCleanupOldUnstarred,
    isLoading,
  };
}
