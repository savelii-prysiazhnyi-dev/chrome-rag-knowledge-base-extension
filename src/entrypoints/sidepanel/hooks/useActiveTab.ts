import { useCallback, useEffect, useState } from 'react';
import { deleteArticles } from '../../../db';
import type { SaveTabResult } from '../../background/coordinator';
import type {
  ArticleRecord,
  ExtensionMessage,
  TabStatusResponse,
} from '../../../types/messages';

export function describeSaveError(result: SaveTabResult): string {
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

export interface UseActiveTabOptions {
  onArticleIndexed?: (payload: { articleId: string; url: string }) => void;
  onQuotaExceeded?: (suggestedNewCapBytes: number) => void;
  onDataChange?: () => unknown;
}

export interface UseActiveTabReturn {
  activeTabId: number | undefined;
  activeTabUrl: string;
  activeTabTitle: string;
  savedArticle: ArticleRecord | undefined;
  setSavedArticle: React.Dispatch<
    React.SetStateAction<ArticleRecord | undefined>
  >;
  isSaving: boolean;
  saveError: string | null;
  setSaveError: React.Dispatch<React.SetStateAction<string | null>>;
  isSaved: boolean;
  refreshActiveTab: () => Promise<void>;
  rememberTab: () => Promise<SaveTabResult | undefined>;
  updateTab: () => Promise<SaveTabResult | undefined>;
  removeTab: () => Promise<void>;
}

export function useActiveTab(
  options: UseActiveTabOptions = {},
): UseActiveTabReturn {
  const { onArticleIndexed, onQuotaExceeded, onDataChange } = options;

  const [activeTabId, setActiveTabId] = useState<number | undefined>(undefined);
  const [activeTabUrl, setActiveTabUrl] = useState<string>('');
  const [activeTabTitle, setActiveTabTitle] = useState<string>('');
  const [savedArticle, setSavedArticle] = useState<ArticleRecord | undefined>(
    undefined,
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  const saveOrUpdateTab = useCallback(async (): Promise<
    SaveTabResult | undefined
  > => {
    setSaveError(null);
    setIsSaving(true);
    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'SAVE_ACTIVE_TAB',
      } satisfies ExtensionMessage)) as SaveTabResult | undefined;

      if (!response) {
        setIsSaving(false);
        return undefined;
      }

      if (response.status === 'indexing') {
        await refreshActiveTab();
        onDataChange?.();
        setIsSaving(false);
      } else if (response.status === 'quota_exceeded') {
        setIsSaving(false);
        onQuotaExceeded?.(250 * 1024 * 1024);
        onDataChange?.();
      } else {
        setIsSaving(false);
        setSaveError(describeSaveError(response));
      }
      return response;
    } catch (err) {
      setIsSaving(false);
      setSaveError(
        err instanceof Error ? err.message : 'Failed to save active tab.',
      );
      return undefined;
    }
  }, [onDataChange, onQuotaExceeded, refreshActiveTab]);

  const removeTab = useCallback(async (): Promise<void> => {
    if (!savedArticle) return;
    try {
      await deleteArticles([savedArticle.id]);
      if (activeTabId !== undefined && chrome.action?.setBadgeText) {
        await chrome.action
          .setBadgeText({ tabId: activeTabId, text: '' })
          .catch(() => {});
      }
      setSavedArticle(undefined);
      onDataChange?.();
    } catch (err) {
      console.error('[useActiveTab] Failed to remove article:', err);
    }
  }, [activeTabId, onDataChange, savedArticle]);

  // Tab activation, update, and runtime message listeners
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
        onArticleIndexed?.(message.payload);
        onDataChange?.();
      } else if (message.type === 'STORAGE_QUOTA_EXCEEDED') {
        setIsSaving(false);
        onQuotaExceeded?.(message.payload.suggestedNewCapBytes);
        onDataChange?.();
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
  }, [onArticleIndexed, onDataChange, onQuotaExceeded, refreshActiveTab]);

  return {
    activeTabId,
    activeTabUrl,
    activeTabTitle,
    savedArticle,
    setSavedArticle,
    isSaving,
    saveError,
    setSaveError,
    isSaved: Boolean(savedArticle),
    refreshActiveTab,
    rememberTab: saveOrUpdateTab,
    updateTab: saveOrUpdateTab,
    removeTab,
  };
}
