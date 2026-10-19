import type { ExtensionMessage } from '../../types/messages';

console.log('[Second Brain] Offscreen Document AI Worker initialized.');

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) => {
    switch (message.type) {
      case 'GENERATE_EMBEDDINGS_JOB': {
        console.log(
          '[Second Brain Offscreen] Received GENERATE_EMBEDDINGS_JOB for article:',
          message.payload.articleId,
          `with ${message.payload.textChunks.length} chunks.`,
        );
        sendResponse({
          status: 'acknowledged',
          articleId: message.payload.articleId,
        });
        return true;
      }

      case 'SEARCH_QUERY': {
        console.log(
          '[Second Brain Offscreen] Received SEARCH_QUERY:',
          message.payload.query,
        );
        sendResponse({ results: [] });
        return true;
      }

      default:
        break;
    }

    return false;
  },
);
