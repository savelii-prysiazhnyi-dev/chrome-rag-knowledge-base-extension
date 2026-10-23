import { useCallback, useEffect, useState } from 'react';
import type {
  ArticleRecord,
  ExtensionMessage,
  SearchResultItem,
} from '../../../types/messages';
import { canonicalizeUrl } from '../../../lib/content';

export interface UseSearchAndRelatedOptions {
  domainFilter?: string;
  starredOnly?: boolean;
}

export interface UseSearchAndRelatedReturn {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  debouncedQuery: string;
  isSearching: boolean;
  searchResults: SearchResultItem[];
  setSearchResults: React.Dispatch<React.SetStateAction<SearchResultItem[]>>;
  isSearchingMode: boolean;
  clearSearch: () => void;
  removeArticleFromResults: (articleId: string) => void;
  updateArticleInResults: (article: ArticleRecord) => void;
  handleSnippetClick: (url: string, snippet?: string) => Promise<void>;
}

export function useSearchAndRelated(
  options: UseSearchAndRelatedOptions = {},
): UseSearchAndRelatedReturn {
  const { domainFilter, starredOnly } = options;

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);

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

  const handleSnippetClick = useCallback(
    async (url: string, _snippet?: string): Promise<void> => {
      if (typeof chrome === 'undefined' || !chrome.tabs) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }

      try {
        const tabs = await chrome.tabs.query({});
        let targetCanonical = url;
        try {
          targetCanonical = canonicalizeUrl(url);
        } catch {
          targetCanonical = url;
        }

        const existingTab = tabs.find(t => {
          if (!t.url) return false;
          if (t.url === url) return true;
          try {
            return canonicalizeUrl(t.url) === targetCanonical;
          } catch {
            return false;
          }
        });

        if (existingTab?.id !== undefined) {
          await chrome.tabs.update(existingTab.id, { active: true });
          if (existingTab.windowId !== undefined && chrome.windows?.update) {
            await chrome.windows
              .update(existingTab.windowId, { focused: true })
              .catch(() => {});
          }
        } else {
          await chrome.tabs.create({ url, active: true });
        }
      } catch {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    },
    [],
  );

  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  const removeArticleFromResults = useCallback((articleId: string) => {
    setSearchResults(prev =>
      prev.filter(item => item.article.id !== articleId),
    );
  }, []);

  const updateArticleInResults = useCallback((article: ArticleRecord) => {
    setSearchResults(prev =>
      prev.map(item =>
        item.article.id === article.id ? { ...item, article } : item,
      ),
    );
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    debouncedQuery,
    isSearching,
    searchResults,
    setSearchResults,
    isSearchingMode: debouncedQuery.length > 0,
    clearSearch,
    removeArticleFromResults,
    updateArticleInResults,
    handleSnippetClick,
  };
}
