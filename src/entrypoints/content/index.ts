import type {
  ExtensionMessage,
  ExtractPageResponse,
} from '../../types/messages';
import {
  canonicalizeUrl,
  checkUrlGuardrails,
  chunkText,
  distillDocument,
} from '../../lib/content';

function extractCurrentPage(): ExtractPageResponse {
  const url = window.location.href;
  const guard = checkUrlGuardrails(url);
  if (guard.blocked) {
    return { ok: false, error: 'BLOCKED_URL', reason: guard.reason };
  }
  try {
    const result = distillDocument(document, url);
    if (!result.ok) return { ok: false, error: result.error };
    const d = result.data;
    return {
      ok: true,
      canonicalUrl: canonicalizeUrl(url),
      ...d,
      chunks: chunkText(d.textContent),
    };
  } catch (err) {
    return {
      ok: false,
      error: 'EXTRACTION_FAILED',
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  main() {
    chrome.runtime.onMessage.addListener(
      (
        message: ExtensionMessage,
        _sender: chrome.runtime.MessageSender,
        sendResponse: (response?: unknown) => void,
      ) => {
        if (message.type === 'EXTRACT_PAGE') {
          sendResponse(extractCurrentPage());
          return true;
        }

        return false;
      },
    );
  },
});
