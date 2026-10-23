/// <reference lib="webworker" />
import {
  getAllChunks,
  getDB,
  markArticleFailed,
  saveArticleChunks,
} from '../../db';
import { Embedder } from '../../lib/embeddings';
import {
  loadTransformersExtractor,
  setWasmPaths,
} from '../../lib/embeddings/transformersPipeline';
import { rankChunksToArticles } from '../../lib/search';
import { JobQueue } from './jobQueue';
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from './workerMessages';

console.log('[Second Brain Worker] Dedicated Web Worker initialized.');

const queue = new JobQueue();
const embedder = new Embedder(loadTransformersExtractor);

function postToMain(msg: WorkerToMainMessage): void {
  self.postMessage(msg);
}

self.addEventListener('message', (event: MessageEvent<MainToWorkerMessage>) => {
  const message = event.data;
  if (!message || !message.type) return;

  switch (message.type) {
    case 'INIT': {
      if (message.payload.wasmPaths) {
        setWasmPaths(message.payload.wasmPaths);
      }
      postToMain({ type: 'INIT_OK' });
      break;
    }

    case 'EMBED_ARTICLE': {
      const { id, payload } = message;
      const { articleId, textChunks } = payload;

      queue.enqueueEmbeddingJob({
        id,
        articleId,
        textChunks,
        embedBatch: (batch: string[]) => embedder.embed(batch),
        onComplete: async (vectors: Float32Array[]) => {
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
          postToMain({
            type: 'ARTICLE_INDEXED',
            id,
            payload: {
              articleId,
              url: article?.url ?? '',
            },
          });
        },
        onError: async (err: unknown) => {
          console.error(
            `[Second Brain Worker] Embedding job failed for article "${articleId}":`,
            err,
          );
          await markArticleFailed(articleId).catch(() => {});
          postToMain({
            type: 'ARTICLE_FAILED',
            id,
            payload: {
              articleId,
              error: err instanceof Error ? err.message : String(err),
            },
          });
        },
      });
      break;
    }

    case 'SEARCH': {
      const { id, payload } = message;
      void queue.enqueueHighPriority(id, async () => {
        try {
          const { query, topK, domainFilter, starredOnly } = payload;
          if (!query?.trim()) {
            postToMain({
              type: 'SEARCH_RESULTS',
              id,
              payload: { results: [] },
            });
            return;
          }

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
          postToMain({
            type: 'SEARCH_RESULTS',
            id,
            payload: { results },
          });
        } catch (err) {
          console.error('[Second Brain Worker] Search failed:', err);
          postToMain({
            type: 'SEARCH_RESULTS',
            id,
            payload: { results: [] },
          });
        }
      });
      break;
    }

    case 'FIND_RELATED': {
      const { id, payload } = message;
      void queue.enqueueHighPriority(id, async () => {
        try {
          const { text, excludeArticleId, topK = 3 } = payload;
          if (!text?.trim()) {
            postToMain({
              type: 'SEARCH_RESULTS',
              id,
              payload: { results: [] },
            });
            return;
          }

          const queryVector = await embedder.embedOne(text);
          const db = await getDB();
          const [chunks, allArticles] = await Promise.all([
            getAllChunks(),
            db.getAll('articles'),
          ]);
          const articles = excludeArticleId
            ? allArticles.filter(a => a.id !== excludeArticleId)
            : allArticles;
          const results = rankChunksToArticles({
            queryVector,
            queryText: text,
            chunks,
            articles,
            topK,
          });
          postToMain({
            type: 'SEARCH_RESULTS',
            id,
            payload: { results },
          });
        } catch (err) {
          console.error(
            '[Second Brain Worker] Find related articles failed:',
            err,
          );
          postToMain({
            type: 'SEARCH_RESULTS',
            id,
            payload: { results: [] },
          });
        }
      });
      break;
    }

    default:
      break;
  }
});
