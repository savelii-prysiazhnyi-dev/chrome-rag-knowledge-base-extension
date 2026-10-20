import type { ExtensionMessage } from '../../types/messages';
import {
  getAllChunks,
  getDB,
  markArticleFailed,
  saveArticleChunks,
} from '../../db';
import { Embedder } from '../../lib/embeddings';
import { loadTransformersExtractor } from '../../lib/embeddings/transformersPipeline';
import { rankChunksToArticles } from '../../lib/search';

console.log('[Second Brain] Offscreen Document AI Worker initialized.');

// Lazy singleton: the model is only loaded on the first job/query.
const embedder = new Embedder(loadTransformersExtractor);

type Routed = ExtensionMessage & { target?: string };

async function handleJob(
  articleId: string,
  textChunks: string[],
): Promise<void> {
  try {
    const vectors = await embedder.embed(textChunks);
    await saveArticleChunks(
      articleId,
      textChunks.map((text, chunkIndex) => ({
        chunkIndex,
        text,
        vector: vectors[chunkIndex] as Float32Array,
      })),
    );
    const db = await getDB();
    const article = await db.get('articles', articleId);
    // Guard: background may not be listening (no receiver) — never throw.
    chrome.runtime
      .sendMessage({
        type: 'ARTICLE_INDEXED',
        payload: { articleId, url: article?.url ?? '' },
      } satisfies ExtensionMessage)
      .catch(() => {});
  } catch (err) {
    console.error('[Second Brain Offscreen] Embedding job failed:', err);
    await markArticleFailed(articleId).catch(() => {});
  }
}

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
        // Ack immediately; indexing outcome is reported via ARTICLE_INDEXED / IDB status.
        sendResponse({ status: 'accepted', articleId });
        void handleJob(articleId, textChunks);
        return true;
      }

      case 'SEARCH_QUERY': {
        const { query, topK, domainFilter, starredOnly } = message.payload;
        (async () => {
          try {
            const queryVector = await embedder.embedOne(query);
            const db = await getDB();
            const [chunks, articles] = await Promise.all([
              getAllChunks(),
              db.getAll('articles'),
            ]);
            const results = rankChunksToArticles({
              queryVector,
              queryText: query,
              chunks,
              articles,
              topK,
              domainFilter,
              starredOnly,
            });
            sendResponse({ type: 'SEARCH_RESULTS', payload: { results } });
          } catch (err) {
            console.error('[Second Brain Offscreen] Search failed:', err);
            sendResponse({ type: 'SEARCH_RESULTS', payload: { results: [] } });
          }
        })();
        return true;
      }

      default:
        break;
    }
    return false;
  },
);
