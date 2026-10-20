import type {
  ExtensionMessage,
  ExtractPageResponse,
  TabStatusResponse,
} from '../../types/messages';
import {
  checkStorageQuota,
  estimatePayloadBytes,
  getArticleByUrl,
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
    extractPage: tabId =>
      chrome.tabs.sendMessage(tabId, {
        type: 'EXTRACT_PAGE',
      } satisfies ExtensionMessage) as Promise<ExtractPageResponse | undefined>,
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
        console.log('[Second Brain] remember-page result:', r.status),
      );
    }
  });

  chrome.runtime.onMessage.addListener(
    (
      message: ExtensionMessage & { target?: string },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void,
    ) => {
      // Messages routed to the offscreen document are never handled here.
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

        case 'ARTICLE_INDEXED': {
          chrome.tabs
            .query({})
            .then(tabs =>
              Promise.all(
                tabs
                  .filter(
                    t =>
                      t.id !== undefined &&
                      t.url &&
                      canonicalizeUrl(t.url) === message.payload.url,
                  )
                  .map(t =>
                    chrome.action.setBadgeText({
                      tabId: t.id as number,
                      text: '✓',
                    }),
                  ),
              ),
            )
            .catch(() => {});
          return false;
        }

        default:
          break;
      }
      return false;
    },
  );
});
