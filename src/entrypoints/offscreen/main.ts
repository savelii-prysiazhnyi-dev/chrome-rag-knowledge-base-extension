import type { ExtensionMessage } from '../../types/messages';
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from './workerMessages';

console.log('[Second Brain] Offscreen Document AI Worker initialized.');

type Routed = ExtensionMessage & { target?: string };

// Dedicated Web Worker running on an isolated background OS thread
const worker = new Worker(new URL('./worker.ts', import.meta.url), {
  type: 'module',
});

// Pass extension runtime configuration (such as local WASM paths) to the worker
const wasmPaths =
  typeof chrome !== 'undefined' && chrome.runtime?.getURL
    ? chrome.runtime.getURL('ort/')
    : undefined;

worker.postMessage({
  type: 'INIT',
  payload: { wasmPaths },
} satisfies MainToWorkerMessage);

const pendingCallbacks = new Map<string, (msg: WorkerToMainMessage) => void>();

worker.addEventListener(
  'message',
  (event: MessageEvent<WorkerToMainMessage>) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'ARTICLE_INDEXED': {
        // Forward completion to background coordinator and UI listeners
        chrome.runtime
          .sendMessage({
            type: 'ARTICLE_INDEXED',
            payload: msg.payload,
          } satisfies ExtensionMessage)
          .catch(() => {});
        break;
      }

      case 'ARTICLE_FAILED': {
        console.error(
          '[Second Brain Offscreen] Article embedding failed in worker:',
          msg.payload,
        );
        break;
      }

      case 'SEARCH_RESULTS':
      case 'ERROR': {
        if (msg.id && pendingCallbacks.has(msg.id)) {
          const cb = pendingCallbacks.get(msg.id);
          pendingCallbacks.delete(msg.id);
          cb?.(msg);
        }
        break;
      }

      case 'INIT_OK':
        break;

      default:
        break;
    }
  },
);

worker.addEventListener('error', err => {
  console.error('[Second Brain Offscreen] Web Worker unhandled error:', err);
  // Clear any pending search requests so callers don't hang
  for (const [id, cb] of pendingCallbacks.entries()) {
    cb({
      type: 'SEARCH_RESULTS',
      id,
      payload: { results: [] },
    });
  }
  pendingCallbacks.clear();
});

chrome.runtime.onMessage.addListener(
  (
    message: Routed,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => {
    // Only handle messages explicitly addressed to this document.
    if (message.target !== 'offscreen') return false;

    switch (message.type) {
      case 'GENERATE_EMBEDDINGS_JOB': {
        const { articleId, textChunks } = message.payload;
        // Ack immediately; background coordinator continues while worker indexes in the background
        sendResponse({ status: 'accepted', articleId });
        const id = crypto.randomUUID();
        worker.postMessage({
          type: 'EMBED_ARTICLE',
          id,
          payload: { articleId, textChunks },
        } satisfies MainToWorkerMessage);
        return true;
      }

      case 'SEARCH_QUERY': {
        const id = crypto.randomUUID();
        pendingCallbacks.set(id, msg => {
          if (msg.type === 'SEARCH_RESULTS') {
            sendResponse({ type: 'SEARCH_RESULTS', payload: msg.payload });
          } else {
            sendResponse({ type: 'SEARCH_RESULTS', payload: { results: [] } });
          }
        });
        worker.postMessage({
          type: 'SEARCH',
          id,
          payload: message.payload,
        } satisfies MainToWorkerMessage);
        return true;
      }

      case 'FIND_RELATED_ARTICLES': {
        const id = crypto.randomUUID();
        pendingCallbacks.set(id, msg => {
          if (msg.type === 'SEARCH_RESULTS') {
            sendResponse({ type: 'SEARCH_RESULTS', payload: msg.payload });
          } else {
            sendResponse({ type: 'SEARCH_RESULTS', payload: { results: [] } });
          }
        });
        worker.postMessage({
          type: 'FIND_RELATED',
          id,
          payload: message.payload,
        } satisfies MainToWorkerMessage);
        return true;
      }

      default:
        break;
    }
    return false;
  },
);
