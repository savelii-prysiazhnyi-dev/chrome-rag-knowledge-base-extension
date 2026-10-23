// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useActiveTab } from '../useActiveTab';

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../../../db', () => ({
  deleteArticles: vi.fn(async () => 1),
  getArticleById: vi.fn(async (id: string) => ({
    id,
    url: 'https://example.com/1',
    status: 'indexed',
  })),
}));

describe('useActiveTab — Per-Tab Saving State & Ingestion Isolation', () => {
  let runtimeMessageListeners: Array<(msg: unknown) => void> = [];
  let tabActivatedListeners: Array<(activeInfo: { tabId: number }) => void> =
    [];
  let currentTabs: Array<{ id: number; url: string; title: string }> = [];
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMessageListeners = [];
    tabActivatedListeners = [];
    currentTabs = [
      { id: 10, url: 'https://example.com/tab-10', title: 'Tab 10' },
    ];
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
            const url = (msg as unknown as { payload: { url: string } }).payload
              .url;
            if (url === 'https://example.com/tab-10') {
              return {
                isSaved: true,
                article: {
                  id: 'art-10',
                  url: 'https://example.com/tab-10',
                  title: 'Tab 10',
                  status: 'indexing',
                  readingTimeMinutes: 3,
                },
              };
            }
            return { isSaved: false };
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
      tabs: {
        query: vi.fn(async () => currentTabs),
        onActivated: {
          addListener: vi.fn((fn: (activeInfo: { tabId: number }) => void) => {
            tabActivatedListeners.push(fn);
          }),
          removeListener: vi.fn(
            (fn: (activeInfo: { tabId: number }) => void) => {
              const idx = tabActivatedListeners.indexOf(fn);
              if (idx !== -1) tabActivatedListeners.splice(idx, 1);
            },
          ),
        },
        onUpdated: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      action: {
        setBadgeText: vi.fn(async () => {}),
        setIcon: vi.fn(async () => {}),
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

  it('scopes isSaving per tab so switching to another tab enables Remember immediately', async () => {
    const hook = renderTestHook(() => useActiveTab());

    await act(async () => {
      await Promise.resolve();
    });

    expect(hook.result.activeTabId).toBe(10);
    expect(hook.result.isSaving).toBe(false);

    // Tab 10 starts saving
    await act(async () => {
      for (const listener of runtimeMessageListeners) {
        listener({
          type: 'SAVE_STARTED',
          payload: { tabId: 10, url: 'https://example.com/tab-10' },
        });
      }
    });

    expect(hook.result.isSaving).toBe(true);

    // Switch to Tab 20 (not saving)
    currentTabs = [
      { id: 20, url: 'https://example.com/tab-20', title: 'Tab 20' },
    ];
    await act(async () => {
      for (const listener of tabActivatedListeners) {
        listener({ tabId: 20 });
      }
      await Promise.resolve();
    });

    expect(hook.result.activeTabId).toBe(20);
    // Tab 20 is NOT saving — "Remember this page" button is enabled!
    expect(hook.result.isSaving).toBe(false);

    // Switch back to Tab 10
    currentTabs = [
      { id: 10, url: 'https://example.com/tab-10', title: 'Tab 10' },
    ];
    await act(async () => {
      for (const listener of tabActivatedListeners) {
        listener({ tabId: 10 });
      }
      await Promise.resolve();
    });

    expect(hook.result.activeTabId).toBe(10);
    // Tab 10 is still saving
    expect(hook.result.isSaving).toBe(true);

    // Tab 10 completes extraction and database update
    await act(async () => {
      for (const listener of runtimeMessageListeners) {
        listener({
          type: 'DATABASE_UPDATED',
          payload: { reason: 'article_saved', articleId: 'art-10' },
        });
      }
    });

    expect(hook.result.isSaving).toBe(false);
    expect(hook.result.savedArticle?.status).toBe('indexing');

    hook.unmount();
  });

  it('does not leak SAVE_FAILED error from background tab to current active tab', async () => {
    const hook = renderTestHook(() => useActiveTab());

    await act(async () => {
      await Promise.resolve();
    });

    // Tab 10 starts saving
    await act(async () => {
      for (const listener of runtimeMessageListeners) {
        listener({
          type: 'SAVE_STARTED',
          payload: { tabId: 10, url: 'https://example.com/tab-10' },
        });
      }
    });

    // Switch to Tab 20
    currentTabs = [
      { id: 20, url: 'https://example.com/tab-20', title: 'Tab 20' },
    ];
    await act(async () => {
      for (const listener of tabActivatedListeners) {
        listener({ tabId: 20 });
      }
      await Promise.resolve();
    });

    // Tab 10 fails in background
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

    // Tab 20 is active: saveError should NOT be polluted with Tab 10 error!
    expect(hook.result.saveError).toBeNull();
    expect(hook.result.isSaving).toBe(false);

    hook.unmount();
  });

  it('triggers onArticleIndexed and refreshes only when matching active tab', async () => {
    const onArticleIndexed = vi.fn();
    const onDataChange = vi.fn();

    const hook = renderTestHook(() =>
      useActiveTab({ onArticleIndexed, onDataChange }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Article indexed for Tab 99 (not active)
    await act(async () => {
      for (const listener of runtimeMessageListeners) {
        listener({
          type: 'ARTICLE_INDEXED',
          payload: { articleId: 'art-99', url: 'https://example.com/tab-99' },
        });
      }
    });

    expect(onArticleIndexed).toHaveBeenCalledWith({
      articleId: 'art-99',
      url: 'https://example.com/tab-99',
    });
    expect(onDataChange).toHaveBeenCalled();

    // Now article indexed for active tab 10
    await act(async () => {
      for (const listener of runtimeMessageListeners) {
        listener({
          type: 'ARTICLE_INDEXED',
          payload: { articleId: 'art-10', url: 'https://example.com/tab-10' },
        });
      }
    });

    expect(onArticleIndexed).toHaveBeenCalledWith({
      articleId: 'art-10',
      url: 'https://example.com/tab-10',
    });

    hook.unmount();
  });
});
