import { getDB } from './client';
import { estimatePayloadBytes } from './quota';
import type {
  ArticleRecord,
  ArticleContentRecord,
  ChunkRecord,
} from '../types/messages';

/**
 * Atomically inserts or updates an article and its vertically partitioned content record.
 * If the article already exists by id or canonical url:
 * - Preserves original isStarred status
 * - Preserves original savedAt timestamp
 * - Updates updatedAt timestamp
 * - Replaces full text/Markdown in article_contents
 * - Cascades deletion of any existing chunks via by_articleId to prevent stale vectors
 */
export async function upsertArticleWithContent(
  article: Omit<ArticleRecord, 'status'>,
  content: Omit<ArticleContentRecord, 'articleId'>,
  status?: ArticleRecord['status'],
): Promise<ArticleRecord> {
  const db = await getDB();
  const tx = db.transaction(
    ['articles', 'article_contents', 'chunks'],
    'readwrite',
  );
  const articlesStore = tx.objectStore('articles');
  const contentsStore = tx.objectStore('article_contents');
  const chunksStore = tx.objectStore('chunks');

  // Look up existing record by primary key (id) or unique canonical url index
  let existing = await articlesStore.get(article.id);
  if (!existing && article.url) {
    existing = await articlesStore.index('by_url').get(article.url);
  }

  const now = Date.now();
  const finalSavedAt = existing ? existing.savedAt : article.savedAt || now;
  const finalIsStarred = existing
    ? existing.isStarred
    : (article.isStarred ?? false);
  const finalStatus: ArticleRecord['status'] =
    status ?? (existing ? existing.status : 'indexing');
  const finalBytes = article.bytes ?? existing?.bytes;

  // If existing record was found by URL but had a different ID, clean up the old ID
  if (existing && existing.id !== article.id) {
    await articlesStore.delete(existing.id);
    await contentsStore.delete(existing.id);
    const oldKeys = await chunksStore
      .index('by_articleId')
      .getAllKeys(existing.id);
    for (const key of oldKeys) {
      await chunksStore.delete(key);
    }
  }

  // Clear existing child chunks for the target articleId so no stale chunks remain
  const targetOldChunkKeys = await chunksStore
    .index('by_articleId')
    .getAllKeys(article.id);
  for (const key of targetOldChunkKeys) {
    await chunksStore.delete(key);
  }

  const record: ArticleRecord = {
    ...article,
    savedAt: finalSavedAt,
    updatedAt: now,
    isStarred: finalIsStarred,
    status: finalStatus,
    ...(finalBytes !== undefined ? { bytes: finalBytes } : {}),
  };

  await articlesStore.put(record);

  const contentRecord: ArticleContentRecord = {
    articleId: record.id,
    contentText: content.contentText,
    contentMarkdown: content.contentMarkdown,
  };
  await contentsStore.put(contentRecord);

  await tx.done;
  return record;
}

/**
 * Atomically replaces all vector chunk embeddings for an article and marks the article status as 'indexed'.
 */
export async function saveArticleChunks(
  articleId: string,
  chunks: Array<{ chunkIndex: number; text: string; vector: Float32Array }>,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['articles', 'chunks'], 'readwrite');
  const articlesStore = tx.objectStore('articles');
  const chunksStore = tx.objectStore('chunks');

  const article = await articlesStore.get(articleId);
  if (!article) {
    throw new Error(`Article with id "${articleId}" not found`);
  }

  // Remove existing chunks for this article
  const existingChunkKeys = await chunksStore
    .index('by_articleId')
    .getAllKeys(articleId);
  for (const key of existingChunkKeys) {
    await chunksStore.delete(key);
  }

  // Insert all new chunk records
  for (const chunk of chunks) {
    const chunkRecord: ChunkRecord = {
      id: `${articleId}_chunk_${chunk.chunkIndex}`,
      articleId,
      chunkIndex: chunk.chunkIndex,
      text: chunk.text,
      vector: chunk.vector,
    };
    await chunksStore.put(chunkRecord);
  }

  // Transition article status to indexed
  article.status = 'indexed';
  article.updatedAt = Date.now();
  await articlesStore.put(article);

  await tx.done;
}

/**
 * Marks an article ingestion status as 'failed'.
 */
export async function markArticleFailed(articleId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('articles', 'readwrite');
  const store = tx.objectStore('articles');
  const article = await store.get(articleId);
  if (article) {
    article.status = 'failed';
    article.updatedAt = Date.now();
    await store.put(article);
  }
  await tx.done;
}

/**
 * Retrieves an article metadata record by its ID.
 */
export async function getArticleById(
  articleId: string,
): Promise<ArticleRecord | undefined> {
  const db = await getDB();
  return db.get('articles', articleId);
}

/**
 * Retrieves an article metadata record by its canonical URL.
 */
export async function getArticleByUrl(
  url: string,
): Promise<ArticleRecord | undefined> {
  const db = await getDB();
  return db.getFromIndex('articles', 'by_url', url);
}

/**
 * Retrieves an article's full text and Markdown from the vertically partitioned content store.
 */
export async function getArticleContent(
  articleId: string,
): Promise<ArticleContentRecord | undefined> {
  const db = await getDB();
  return db.get('article_contents', articleId);
}

/**
 * Counts chunks for an article directly via the by_articleId index in O(log N) time (strict 3NF).
 */
export async function getArticleChunkCount(articleId: string): Promise<number> {
  const db = await getDB();
  return db.countFromIndex('chunks', 'by_articleId', articleId);
}

/**
 * Retrieves all chunk records for an article, ordered by chunkIndex ascending.
 */
export async function getChunksByArticleId(
  articleId: string,
): Promise<ChunkRecord[]> {
  const db = await getDB();
  const chunks = await db.getAllFromIndex('chunks', 'by_articleId', articleId);
  return chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
}

/**
 * Retrieves all chunk records across the entire knowledge base for vector search scans.
 */
export async function getAllChunks(): Promise<ChunkRecord[]> {
  const db = await getDB();
  return db.getAll('chunks');
}

/**
 * Lists articles in reverse-chronological order (savedAt descending),
 * supporting optional domain filtering and starred-only filtering.
 */
export async function listArticles(options?: {
  domainFilter?: string;
  starredOnly?: boolean;
}): Promise<ArticleRecord[]> {
  const db = await getDB();
  const tx = db.transaction('articles', 'readonly');
  const store = tx.objectStore('articles');
  const index = store.index('by_savedAt');

  const results: ArticleRecord[] = [];
  let cursor = await index.openCursor(null, 'prev');

  while (cursor) {
    const article = cursor.value;
    const matchesDomain =
      !options?.domainFilter ||
      article.siteName.toLowerCase() === options.domainFilter.toLowerCase();
    const matchesStarred = !options?.starredOnly || article.isStarred === true;

    if (matchesDomain && matchesStarred) {
      results.push(article);
    }
    cursor = await cursor.continue();
  }

  await tx.done;
  return results;
}

/**
 * Aggregates article counts per site/domain, sorted by count descending.
 */
export async function getDomainCounts(): Promise<
  Array<{ siteName: string; count: number }>
> {
  const db = await getDB();
  const articles = await db.getAll('articles');
  const countMap = new Map<string, number>();

  for (const article of articles) {
    const domain = article.siteName?.trim();
    if (domain) {
      countMap.set(domain, (countMap.get(domain) || 0) + 1);
    }
  }

  return Array.from(countMap.entries())
    .map(([siteName, count]) => ({ siteName, count }))
    .sort((a, b) => b.count - a.count || a.siteName.localeCompare(b.siteName));
}

/**
 * Toggles or explicitly sets an article's isStarred pinned status.
 */
export async function toggleArticleStar(
  articleId: string,
  isStarred?: boolean,
): Promise<ArticleRecord | undefined> {
  const db = await getDB();
  const tx = db.transaction('articles', 'readwrite');
  const store = tx.objectStore('articles');
  const article = await store.get(articleId);

  if (!article) {
    await tx.done;
    return undefined;
  }

  article.isStarred = isStarred !== undefined ? isStarred : !article.isStarred;
  article.updatedAt = Date.now();
  await store.put(article);
  await tx.done;
  return article;
}

/**
 * Atomically deletes articles, their content records, and all child chunks in a single transaction.
 * Leaves 0 orphaned vectors.
 */
export async function deleteArticles(articleIds: string[]): Promise<number> {
  if (articleIds.length === 0) return 0;

  const db = await getDB();
  const tx = db.transaction(
    ['articles', 'article_contents', 'chunks'],
    'readwrite',
  );
  const articlesStore = tx.objectStore('articles');
  const contentsStore = tx.objectStore('article_contents');
  const chunksStore = tx.objectStore('chunks');

  let deletedCount = 0;
  for (const id of articleIds) {
    const article = await articlesStore.get(id);
    if (article) {
      await articlesStore.delete(id);
      await contentsStore.delete(id);
      const chunkKeys = await chunksStore.index('by_articleId').getAllKeys(id);
      for (const key of chunkKeys) {
        await chunksStore.delete(key);
      }
      deletedCount++;
    }
  }

  await tx.done;
  return deletedCount;
}

/**
 * Bulk deletes unstarred articles matching an age cutoff and/or siteName filter.
 * Strictly protects articles where isStarred === true.
 * Cascades across articles, article_contents, and chunks in a single atomic transaction.
 */
export async function bulkDeleteUnstarred(filter: {
  olderThanMs?: number;
  siteName?: string;
}): Promise<number> {
  const db = await getDB();
  const tx = db.transaction(
    ['articles', 'article_contents', 'chunks'],
    'readwrite',
  );
  const articlesStore = tx.objectStore('articles');
  const contentsStore = tx.objectStore('article_contents');
  const chunksStore = tx.objectStore('chunks');

  const cutoff =
    filter.olderThanMs !== undefined
      ? Date.now() - filter.olderThanMs
      : undefined;
  const articles = await articlesStore.getAll();
  let deletedCount = 0;

  for (const article of articles) {
    // Strictly protect starred articles
    if (article.isStarred) continue;

    const matchesAge = cutoff === undefined || article.savedAt < cutoff;
    const matchesSite =
      filter.siteName === undefined ||
      article.siteName.toLowerCase() === filter.siteName.toLowerCase();

    if (matchesAge && matchesSite) {
      await articlesStore.delete(article.id);
      await contentsStore.delete(article.id);
      const chunkKeys = await chunksStore
        .index('by_articleId')
        .getAllKeys(article.id);
      for (const key of chunkKeys) {
        await chunksStore.delete(key);
      }
      deletedCount++;
    }
  }

  await tx.done;
  return deletedCount;
}

/**
 * Computes the total logical storage footprint in bytes across all saved articles,
 * vertically partitioned content, and vector embeddings.
 * Returns 0 if no articles exist.
 * Uses cached article.bytes when available; otherwise dynamically computes
 * and backfills article.bytes for legacy records.
 */
export async function getLogicalStorageUsage(): Promise<number> {
  const db = await getDB();
  const articles = await db.getAll('articles');
  if (articles.length === 0) {
    return 0;
  }

  let totalBytes = 0;
  const backfillArticles: Array<{ id: string; bytes: number }> = [];

  for (const article of articles) {
    if (typeof article.bytes === 'number' && article.bytes > 0) {
      totalBytes += article.bytes;
    } else {
      const content = await db.get('article_contents', article.id);
      const chunks = await db.getAllFromIndex(
        'chunks',
        'by_articleId',
        article.id,
      );
      const textChunks = chunks.map(c => c.text);
      const computedBytes = estimatePayloadBytes(
        article,
        content ?? { contentText: '', contentMarkdown: '' },
        textChunks,
      );
      totalBytes += computedBytes;
      backfillArticles.push({ id: article.id, bytes: computedBytes });
    }
  }

  if (backfillArticles.length > 0) {
    try {
      const tx = db.transaction('articles', 'readwrite');
      const store = tx.objectStore('articles');
      for (const item of backfillArticles) {
        const current = await store.get(item.id);
        if (current) {
          current.bytes = item.bytes;
          await store.put(current);
        }
      }
      await tx.done;
    } catch {
      // Best-effort backfill caching; ignore transaction failure in read-only / restricted contexts
    }
  }

  return totalBytes;
}
