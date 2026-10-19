import type { ExtensionMessage, TabStatusResponse } from '../../types/messages';

export default defineBackground(() => {
  console.log('[Second Brain] Background Service Worker initialized.');

  // Configure Chrome action click to automatically open the Side Panel
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

  // Keyboard shortcut listener ('Alt+S' / 'remember-page')
  chrome.commands.onCommand.addListener((command: string) => {
    console.log(`[Second Brain] Command received: ${command}`);
    if (command === 'remember-page') {
      chrome.tabs.query(
        { active: true, currentWindow: true },
        (tabs: chrome.tabs.Tab[]) => {
          const activeTab = tabs[0];
          if (!activeTab?.id) return;
          console.log(
            `[Second Brain] Triggering remember-page for tab ${activeTab.id}: ${activeTab.url ?? 'unknown'}`,
          );
          chrome.tabs
            .sendMessage(activeTab.id, { type: 'INDEX_CURRENT_TAB' })
            .catch((error: unknown) => {
              console.warn(
                '[Second Brain] Could not reach content script on tab:',
                activeTab.id,
                error,
              );
            });
        },
      );
    }
  });

  // Runtime message coordinator
  chrome.runtime.onMessage.addListener(
    (
      message: ExtensionMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void,
    ) => {
      console.log(
        '[Second Brain] Message received in background:',
        message.type,
      );

      switch (message.type) {
        case 'CHECK_TAB_STATUS': {
          // Baseline implementation for Phase 1: returns not saved yet
          const response: TabStatusResponse = {
            isSaved: false,
          };
          sendResponse(response);
          return true;
        }

        case 'INDEX_CURRENT_TAB': {
          chrome.tabs.query(
            { active: true, currentWindow: true },
            (tabs: chrome.tabs.Tab[]) => {
              const activeTab = tabs[0];
              if (activeTab?.id) {
                chrome.tabs
                  .sendMessage(activeTab.id, { type: 'INDEX_CURRENT_TAB' })
                  .then(() => {
                    sendResponse({ status: 'dispatched' });
                  })
                  .catch((err: unknown) => {
                    console.warn(
                      '[Second Brain] Failed to send INDEX_CURRENT_TAB to tab:',
                      err,
                    );
                    sendResponse({ status: 'error', error: String(err) });
                  });
              } else {
                sendResponse({ status: 'no_active_tab' });
              }
            },
          );
          return true; // Keep channel open for async response
        }

        default:
          break;
      }

      return false;
    },
  );
});
