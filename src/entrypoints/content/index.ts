import type { ExtensionMessage } from '../../types/messages';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  main() {
    console.log(
      '[Second Brain] Content script loaded on:',
      window.location.href,
    );

    chrome.runtime.onMessage.addListener(
      (
        message: ExtensionMessage,
        _sender: chrome.runtime.MessageSender,
        sendResponse: (response?: unknown) => void,
      ) => {
        if (message.type === 'INDEX_CURRENT_TAB') {
          console.log(
            '[Second Brain] Content script received INDEX_CURRENT_TAB. Ready for Phase 3 Readability extraction.',
          );
          sendResponse({
            status: 'ready_for_extraction',
            url: window.location.href,
          });
          return true;
        }

        if (message.type === 'SCROLL_AND_HIGHLIGHT') {
          console.log(
            '[Second Brain] Content script received SCROLL_AND_HIGHLIGHT snippet:',
            message.payload.snippet,
          );
          sendResponse({ status: 'received' });
          return true;
        }

        return false;
      },
    );
  },
});
