// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useStorageQuota } from '../useStorageQuota';
import { useLibraryArticles } from '../../entrypoints/sidepanel/hooks/useLibraryArticles';
import { useActiveTab } from '../../entrypoints/sidepanel/hooks/useActiveTab';
import { useKnowledgeManager } from '../../entrypoints/options/hooks/useKnowledgeManager';
import * as db from '../../db';

// Enable React act environment for clean test output
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../db', () => ({
  checkStorageQuota: vi.fn(async () => ({
    currentUsageBytes: 1024,
    maxStorageBytes: 50 * 1024 * 1024,
    browserQuotaBytes: 10 * 1024 * 1024 * 1024,
    freePhysicalDiskBytes: 10 * 1024 * 1024 * 1024,
    usageRatio: 0.00002,
    isWarning: false,
    isExceeded: false,
    isLowPhysicalDisk: false,
    canSave: true,
    suggestedNewCapBytes: 250 * 1024 * 1024,
  })),
  updateStorageCap: vi.fn(async (newCap: number) => ({
    maxStorageBytes: newCap,
    warnThresholdRatio: 0.85,
    hasGrantedDiskExpansion: true,
  })),
  listArticles: vi.fn(async () => [
    {
      id: 'art-1',
      url: 'https://example.com/1',
      title: 'Article 1',
      excerpt: 'Excerpt 1',
      siteName: 'example.com',
      savedAt: 1000,
      updatedAt: 1000,
      readingTimeMinutes: 2,
      isStarred: false,
      status: 'indexed' as const,
    },
  ]),
  getDomainCounts: vi.fn(async () => [{ siteName: 'example.com', count: 1 }]),
  getAllChunks: vi.fn(async () => []),
  getArticleContent: vi.fn(async () => ({
    articleId: 'art-1',
    contentText: 'Text',
    contentMarkdown: 'MD',
  })),
  getArticleChunkCount: vi.fn(async () => 0),
  toggleArticleStar: vi.fn(async (id: string) => ({
    id,
    url: 'https://example.com/1',
    title: 'Article 1',
    excerpt: 'Excerpt 1',
    siteName: 'example.com',
    savedAt: 1000,
    updatedAt: 1000,
    readingTimeMinutes: 2,
    isStarred: true,
    status: 'indexed' as const,
  })),
  deleteArticles: vi.fn(async (ids: string[]) => ids.length),
  bulkDeleteUnstarred: vi.fn(async () => 3),
}));

describe('Cross-Window Real-Time Synchronization', () => {
  let runtimeMessageListeners: Array<(msg: unknown) => void> = [];
  let storageChangedListeners: Array<
    (changes: unknown, areaName: string) => void
  > = [];
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMessageListeners = [];
    storageChangedListeners = [];
    container = document.createElement('div');
    document.body.appendChild(container);

    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: {
        sendMessage: vi.fn(async (msg: unknown) => {
          if (
            typeof msg === 'object' &&
            msg !== null &&
            'type' in msg &&
            (msg as { type: string }).type === 'CHECK_TAB_STATUS'
          ) {
            return {
              isSaved: true,
              article: {
                id: 'art-1',
                url: 'https://example.com/1',
                title: 'Article 1',
                status: 'indexed',
              },
            };
          }
          return undefined;
        }),
        onMessage: {
          addListener: vi.fn((fn: (msg: unknown) => void) => {
            runtimeMessageListeners.push(fn);
          }),
          removeListener: vi.fn((fn: (msg: unknown) => void) => {
            const idx = runtimeMessageListeners.indexOf(fn);
            if (idx !== -1) runtimeMessageListeners.splice(idx, 1);
          }),
        },
      },
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          set: vi.fn(async () => {}),
        },
        onChanged: {
          addListener: vi.fn(
            (fn: (changes: unknown, areaName: string) => void) => {
              storageChangedListeners.push(fn);
            },
          ),
          removeListener: vi.fn(
            (fn: (changes: unknown, areaName: string) => void) => {
              const idx = storageChangedListeners.indexOf(fn);
              if (idx !== -1) storageChangedListeners.splice(idx, 1);
            },
          ),
        },
      },
      tabs: {
        query: vi.fn(async () => [
          { id: 10, url: 'https://example.com/1', title: 'Article 1' },
        ]),
        get: vi.fn(async () => ({
          id: 10,
          url: 'https://example.com/1',
        })),
        onActivated: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
        onUpdated: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      action: {
        setBadgeText: vi.fn(async () => {}),
      },
      permissions: {
        request: vi.fn(async () => true),
      },
    };
  });

  afterEach(() => {
    container.remove();
  });

  function renderTestHook<T>(hookFn: () => T) {
    let result!: { current: T };
    const root = createRoot(container);

    function TestComponent() {
      result = { current: hookFn() };
      return null;
    }

    act(() => {
      root.render(React.createElement(TestComponent));
    });

    return {
      get result() {
        return result.current;
      },
      unmount: () => {
        act(() => {
          root.unmount();
        });
      },
    };
  }

  describe('useStorageQuota', () => {
    it('broadcasts DATABASE_UPDATED with cap_updated when updateCap is called', async () => {
      const hook = renderTestHook(() => useStorageQuota());
      await act(async () => {
        await hook.result.updateCap(100 * 1024 * 1024);
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'DATABASE_UPDATED',
        payload: { reason: 'cap_updated' },
      });
      expect(db.updateStorageCap).toHaveBeenCalledWith(100 * 1024 * 1024);
      hook.unmount();
    });

    it('refreshes quota when receiving DATABASE_UPDATED runtime message', async () => {
      const hook = renderTestHook(() => useStorageQuota());
      vi.mocked(db.checkStorageQuota).mockClear();

      await act(async () => {
        for (const listener of runtimeMessageListeners) {
          listener({
            type: 'DATABASE_UPDATED',
            payload: { reason: 'article_saved', articleId: 'art-2' },
          });
        }
      });

      expect(db.checkStorageQuota).toHaveBeenCalled();
      hook.unmount();
    });

    it('refreshes quota when chrome.storage.local changes maxStorageBytes', async () => {
      const hook = renderTestHook(() => useStorageQuota());
      vi.mocked(db.checkStorageQuota).mockClear();

      await act(async () => {
        for (const listener of storageChangedListeners) {
          listener({ maxStorageBytes: { newValue: 100 } }, 'local');
        }
      });

      expect(db.checkStorageQuota).toHaveBeenCalled();
      hook.unmount();
    });
  });

  describe('useLibraryArticles', () => {
    it('refreshes articles when receiving DATABASE_UPDATED message', async () => {
      const hook = renderTestHook(() => useLibraryArticles());
      vi.mocked(db.listArticles).mockClear();

      await act(async () => {
        for (const listener of runtimeMessageListeners) {
          listener({
            type: 'DATABASE_UPDATED',
            payload: { reason: 'article_saved', articleId: 'art-2' },
          });
        }
      });

      expect(db.listArticles).toHaveBeenCalled();
      hook.unmount();
    });

    it('broadcasts DATABASE_UPDATED on toggleStar', async () => {
      const hook = renderTestHook(() => useLibraryArticles());

      await act(async () => {
        await hook.result.toggleStar('art-1');
      });

      expect(db.toggleArticleStar).toHaveBeenCalledWith('art-1');
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'DATABASE_UPDATED',
        payload: { reason: 'article_starred', articleId: 'art-1' },
      });
      hook.unmount();
    });

    it('broadcasts DATABASE_UPDATED on deleteArticle', async () => {
      const hook = renderTestHook(() => useLibraryArticles());

      await act(async () => {
        await hook.result.deleteArticle('art-1');
      });

      expect(db.deleteArticles).toHaveBeenCalledWith(['art-1']);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'DATABASE_UPDATED',
        payload: { reason: 'article_deleted', articleId: 'art-1' },
      });
      hook.unmount();
    });

    it('broadcasts DATABASE_UPDATED on quickCleanupOldUnstarred', async () => {
      const hook = renderTestHook(() => useLibraryArticles());

      await act(async () => {
        await hook.result.quickCleanupOldUnstarred();
      });

      expect(db.bulkDeleteUnstarred).toHaveBeenCalled();
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'DATABASE_UPDATED',
        payload: { reason: 'bulk_cleanup' },
      });
      hook.unmount();
    });
  });

  describe('useKnowledgeManager', () => {
    it('refreshes all data when receiving DATABASE_UPDATED message', async () => {
      const hook = renderTestHook(() => useKnowledgeManager());
      vi.mocked(db.listArticles).mockClear();

      await act(async () => {
        for (const listener of runtimeMessageListeners) {
          listener({
            type: 'DATABASE_UPDATED',
            payload: { reason: 'article_saved', articleId: 'art-3' },
          });
        }
      });

      expect(db.listArticles).toHaveBeenCalled();
      hook.unmount();
    });

    it('broadcasts DATABASE_UPDATED on toggleStar', async () => {
      const hook = renderTestHook(() => useKnowledgeManager());

      await act(async () => {
        await hook.result.toggleStar('art-1');
      });

      expect(db.toggleArticleStar).toHaveBeenCalledWith('art-1');
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'DATABASE_UPDATED',
        payload: { reason: 'article_starred', articleId: 'art-1' },
      });
      hook.unmount();
    });

    it('broadcasts DATABASE_UPDATED on deleteArticlesByIds', async () => {
      const hook = renderTestHook(() => useKnowledgeManager());

      await act(async () => {
        await hook.result.deleteArticlesByIds(['art-1']);
      });

      expect(db.deleteArticles).toHaveBeenCalledWith(['art-1']);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'DATABASE_UPDATED',
        payload: { reason: 'article_deleted', articleId: 'art-1' },
      });
      hook.unmount();
    });

    it('broadcasts DATABASE_UPDATED on handleBulkCleanup', async () => {
      const hook = renderTestHook(() => useKnowledgeManager());

      await act(async () => {
        await hook.result.handleBulkCleanup();
      });

      expect(db.bulkDeleteUnstarred).toHaveBeenCalled();
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'DATABASE_UPDATED',
        payload: { reason: 'bulk_cleanup' },
      });
      hook.unmount();
    });
  });

  describe('useActiveTab', () => {
    it('refreshes active tab status when receiving DATABASE_UPDATED message', async () => {
      const hook = renderTestHook(() => useActiveTab());

      await act(async () => {
        for (const listener of runtimeMessageListeners) {
          listener({
            type: 'DATABASE_UPDATED',
            payload: { reason: 'article_saved', articleId: 'art-1' },
          });
        }
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'CHECK_TAB_STATUS',
        payload: { url: 'https://example.com/1' },
      });
      hook.unmount();
    });

    it('broadcasts DATABASE_UPDATED on removeTab', async () => {
      const hook = renderTestHook(() => useActiveTab());

      // Give initial refreshActiveTab promise a tick to resolve and set savedArticle
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        await hook.result.removeTab();
      });

      expect(db.deleteArticles).toHaveBeenCalledWith(['art-1']);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'DATABASE_UPDATED',
        payload: { reason: 'article_deleted', articleId: 'art-1' },
      });
      hook.unmount();
    });

    it('enters saving loading state on SAVE_STARTED and clears on DATABASE_UPDATED', async () => {
      const hook = renderTestHook(() => useActiveTab());

      await act(async () => {
        await Promise.resolve();
      });

      expect(hook.result.isSaving).toBe(false);

      await act(async () => {
        for (const listener of runtimeMessageListeners) {
          listener({
            type: 'SAVE_STARTED',
            payload: { tabId: 10, url: 'https://example.com/1' },
          });
        }
      });

      expect(hook.result.isSaving).toBe(true);
      expect(hook.result.saveError).toBeNull();

      await act(async () => {
        for (const listener of runtimeMessageListeners) {
          listener({
            type: 'DATABASE_UPDATED',
            payload: { reason: 'article_saved', articleId: 'art-1' },
          });
        }
      });

      expect(hook.result.isSaving).toBe(false);
      hook.unmount();
    });

    it('clears saving state and sets saveError on SAVE_FAILED', async () => {
      const hook = renderTestHook(() => useActiveTab());

      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        for (const listener of runtimeMessageListeners) {
          listener({
            type: 'SAVE_STARTED',
            payload: { tabId: 10, url: 'https://example.com/1' },
          });
        }
      });

      expect(hook.result.isSaving).toBe(true);

      await act(async () => {
        for (const listener of runtimeMessageListeners) {
          listener({
            type: 'SAVE_FAILED',
            payload: {
              tabId: 10,
              result: {
                status: 'extract_failed',
                error: 'NOT_READABLE',
              },
            },
          });
        }
      });

      expect(hook.result.isSaving).toBe(false);
      expect(hook.result.saveError).toBe(
        'Could not extract a readable article from this page.',
      );
      hook.unmount();
    });

    it('triggers saveOrUpdateTab on Alt+S keyboard event', async () => {
      const hook = renderTestHook(() => useActiveTab());

      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        const event = new KeyboardEvent('keydown', {
          key: 's',
          altKey: true,
          bubbles: true,
          cancelable: true,
        });
        window.dispatchEvent(event);
      });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'SAVE_ACTIVE_TAB',
      });
      hook.unmount();
    });

    it('ignores keydown when Alt is not pressed or other modifiers are active', async () => {
      const hook = renderTestHook(() => useActiveTab());

      await act(async () => {
        await Promise.resolve();
      });

      vi.mocked(chrome.runtime.sendMessage).mockClear();

      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 's',
            altKey: false,
            bubbles: true,
          }),
        );
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 's',
            altKey: true,
            ctrlKey: true,
            bubbles: true,
          }),
        );
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 's',
            altKey: true,
            metaKey: true,
            bubbles: true,
          }),
        );
      });

      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith({
        type: 'SAVE_ACTIVE_TAB',
      });
      hook.unmount();
    });
  });
});
