import type {
  ExtensionMessage,
  ExtractPageResponse,
  TabStatusResponse,
} from '../../types/messages';
import {
  checkStorageQuota,
  deleteArticles,
  estimatePayloadBytes,
  getArticleByUrl,
  updateStorageCap,
  upsertArticleWithContent,
} from '../../db';
import { canonicalizeUrl, hashUrl } from '../../lib/content';
import { createCoordinator } from './coordinator';

const OFFSCREEN_PATH = 'offscreen.html';

let offscreenCreating: Promise<void> | null = null;

/**
 * Ensures exactly one offscreen document exists. Uses chrome.runtime.getContexts
 * to detect an existing document and a singleton promise to serialize creation.
 */
async function ensureOffscreenDocument(): Promise<void> {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
    documentUrls: [url],
  });
  if (existing.length > 0) return;
  if (!offscreenCreating) {
    offscreenCreating = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_PATH,
        reasons: ['WORKERS' as chrome.offscreen.Reason],
        justification:
          'Run on-device embedding model inference (WebGPU/WASM) and hybrid vector search.',
      })
      .finally(() => {
        offscreenCreating = null;
      });
  }
  await offscreenCreating;
}

/**
 * Synchronizes the toolbar action badge ('✓' when indexed, '' otherwise) for a given tab.
 */
async function syncTabBadge(tabId: number, url?: string): Promise<void> {
  if (!chrome.action?.setBadgeText) return;

  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    await chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
    return;
  }

  try {
    const canonical = canonicalizeUrl(url);
    const article = await getArticleByUrl(canonical);
    const isIndexed = article?.status === 'indexed';
    if (isIndexed && chrome.action.setBadgeBackgroundColor) {
      await chrome.action
        .setBadgeBackgroundColor({ tabId, color: '#10b981' })
        .catch(() => {});
    }
    await chrome.action
      .setBadgeText({ tabId, text: isIndexed ? '✓' : '' })
      .catch(() => {});
  } catch {
    await chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  }
}

/**
 * Refreshes toolbar badges across all open browser tabs.
 */
async function syncAllTabBadges(): Promise<void> {
  if (!chrome.tabs?.query) return;
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(
      tabs
        .filter(
          (t): t is chrome.tabs.Tab & { id: number } => t.id !== undefined,
        )
        .map(t => syncTabBadge(t.id, t.url)),
    );
  } catch {
    // Ignore tab query errors
  }
}

export default defineBackground(() => {
  console.log('[Second Brain] Background Service Worker initialized.');

  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error: unknown) => {
        console.error(
          '[Second Brain] Failed to set sidePanel behavior:',
          error,
        );
      });
  }

  const coordinator = createCoordinator({
    getTab: tabId => chrome.tabs.get(tabId),
    extractPage: async tabId => {
      const msg: ExtensionMessage = { type: 'EXTRACT_PAGE' };
      try {
        return (await chrome.tabs.sendMessage(tabId, msg)) as
          ExtractPageResponse | undefined;
      } catch {
        // Tab was likely open before the extension was installed or reloaded.
        // Dynamically inject the content script and retry once.
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content-scripts/content.js'],
        });
        return (await chrome.tabs.sendMessage(tabId, msg)) as
          ExtractPageResponse | undefined;
      }
    },
    hashUrl,
    estimatePayloadBytes,
    checkStorageQuota,
    upsertArticleWithContent,
    ensureOffscreenDocument,
    sendToOffscreen: message => chrome.runtime.sendMessage(message),
    emit: message => {
      // No receiver (side panel closed) is expected; swallow the error.
      chrome.runtime.sendMessage(message).catch(() => {});
    },
  });

  async function saveActiveTab() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return coordinator.saveTab(tab?.id);
  }

  // Keyboard shortcut ('Alt+S' / 'remember-page') shares the same coordinator.
  chrome.commands.onCommand.addListener((command: string) => {
    if (command === 'remember-page') {
      void saveActiveTab().then(r =>
        console.log('[Second Brain] remember-page result:', r),
      );
    }
  });

  // Tab lifecycle listeners for live ✓ badge synchronization
  if (chrome.tabs?.onActivated) {
    chrome.tabs.onActivated.addListener(({ tabId }) => {
      chrome.tabs
        .get(tabId)
        .then(tab => syncTabBadge(tabId, tab.url))
        .catch(() => {});
    });
  }

  if (chrome.tabs?.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' || changeInfo.url) {
        void syncTabBadge(tabId, changeInfo.url ?? tab.url);
      }
    });
  }

  chrome.runtime.onMessage.addListener(
    (
      message: ExtensionMessage & { target?: string },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void,
    ) => {
      // Messages explicitly routed to the offscreen document are ignored by background.
      if (message.target === 'offscreen') return false;

      switch (message.type) {
        case 'CHECK_TAB_STATUS': {
          getArticleByUrl(canonicalizeUrl(message.payload.url))
            .then(article => {
              const response: TabStatusResponse = article
                ? { isSaved: true, article }
                : { isSaved: false };
              sendResponse(response);
            })
            .catch(() => sendResponse({ isSaved: false }));
          return true;
        }

        case 'SAVE_ACTIVE_TAB': {
          saveActiveTab()
            .then(sendResponse)
            .catch((e: unknown) =>
              sendResponse({ status: 'error', error: String(e) }),
            );
          return true;
        }

        case 'SEARCH_QUERY':
        case 'FIND_RELATED_ARTICLES': {
          (async () => {
            try {
              await ensureOffscreenDocument();
              const response: unknown = await chrome.runtime.sendMessage({
                ...message,
                target: 'offscreen',
              });
              sendResponse(
                response ?? {
                  type: 'SEARCH_RESULTS',
                  payload: { results: [] },
                },
              );
            } catch (err) {
              console.error(
                '[Second Brain] Offscreen search routing failed:',
                err,
              );
              sendResponse({
                type: 'SEARCH_RESULTS',
                payload: { results: [] },
              });
            }
          })();
          return true;
        }

        case 'DELETE_ARTICLES': {
          deleteArticles(message.payload.articleIds)
            .then(async deletedCount => {
              await syncAllTabBadges();
              sendResponse({ ok: true, deletedCount });
            })
            .catch((e: unknown) =>
              sendResponse({ ok: false, error: String(e) }),
            );
          return true;
        }

        case 'UPDATE_STORAGE_CAP': {
          updateStorageCap(message.payload.newMaxStorageBytes)
            .then(settings => sendResponse({ ok: true, settings }))
            .catch((e: unknown) =>
              sendResponse({ ok: false, error: String(e) }),
            );
          return true;
        }

        case 'ARTICLE_INDEXED': {
          void syncAllTabBadges();
          return false;
        }

        default:
          break;
      }
      return false;
    },
  );
});
