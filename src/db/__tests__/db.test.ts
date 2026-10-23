import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getDB,
  closeDB,
  resetDB,
  upsertArticleWithContent,
  saveArticleChunks,
  markArticleFailed,
  getArticleById,
  getArticleByUrl,
  getArticleContent,
  getArticleChunkCount,
  getChunksByArticleId,
  getAllChunks,
  listArticles,
  getDomainCounts,
  toggleArticleStar,
  deleteArticles,
  bulkDeleteUnstarred,
  getStorageSettings,
  updateStorageCap,
  resetStorageSettingsForTesting,
  estimatePayloadBytes,
  getLogicalStorageUsage,
  checkStorageQuota,
  LOW_PHYSICAL_DISK_BYTES,
  DEFAULT_SUGGESTED_EXPANSION_BYTES,
  type ExtendedStorageEstimate,
} from '../index';
import type { ArticleRecord, ArticleContentRecord } from '../../types/messages';

function mockNavigatorStorage(
  estimateFn: () => Promise<
    Partial<ExtendedStorageEstimate> & { usage?: number; quota?: number }
  >,
) {
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      storage: {
        estimate: estimateFn,
      },
    },
    configurable: true,
    writable: true,
  });
}

describe('Second Brain DB & Quota Gatekeeper', () => {
  beforeEach(async () => {
    await resetDB();
    resetStorageSettingsForTesting();
    // Default navigator.storage mock for testing
    mockNavigatorStorage(async () => ({
      usage: 5 * 1024 * 1024, // 5 MB
      quota: 50 * 1024 * 1024 * 1024, // 50 GB
    }));
  });

  afterEach(async () => {
    await closeDB();
  });

  describe('3NF Schema & Vertical Partitioning', () => {
    it('initializes stores and indexes according to schema specification', async () => {
      const db = await getDB();
      expect(db.objectStoreNames.contains('articles')).toBe(true);
      expect(db.objectStoreNames.contains('article_contents')).toBe(true);
      expect(db.objectStoreNames.contains('chunks')).toBe(true);

      const tx = db.transaction(['articles', 'chunks'], 'readonly');
      const articlesStore = tx.objectStore('articles');
      expect(articlesStore.indexNames.contains('by_url')).toBe(true);
      expect(articlesStore.indexNames.contains('by_siteName')).toBe(true);
      expect(articlesStore.indexNames.contains('by_savedAt')).toBe(true);
      expect(articlesStore.indexNames.contains('by_isStarred')).toBe(true);

      const chunksStore = tx.objectStore('chunks');
      expect(chunksStore.indexNames.contains('by_articleId')).toBe(true);
      await tx.done;
    });

    it('partitions metadata in articles and heavy text in article_contents', async () => {
      const article: Omit<ArticleRecord, 'status'> = {
        id: 'art-001',
        url: 'https://golang.org/doc/effective_go',
        title: 'Effective Go',
        byline: 'Go Team',
        excerpt: 'Tips for writing clear, idiomatic Go code.',
        siteName: 'golang.org',
        faviconUrl: 'https://golang.org/favicon.ico',
        savedAt: 1000,
        updatedAt: 1000,
        readingTimeMinutes: 12,
        isStarred: false,
      };

      const content: Omit<ArticleContentRecord, 'articleId'> = {
        contentText: 'Full plain text of Effective Go...',
        contentMarkdown: '# Effective Go\n\nFull markdown text...',
      };

      const saved = await upsertArticleWithContent(article, content);
      expect(saved.id).toBe('art-001');
      expect(saved.status).toBe('indexing');

      // Metadata lookup contains no full text
      const meta = await getArticleById('art-001');
      expect(meta).toBeDefined();
      expect(meta?.title).toBe('Effective Go');
      expect(
        (meta as unknown as Record<string, unknown>).contentText,
      ).toBeUndefined();

      // Content lookup contains partitioned full text
      const fullContent = await getArticleContent('art-001');
      expect(fullContent).toBeDefined();
      expect(fullContent?.articleId).toBe('art-001');
      expect(fullContent?.contentText).toBe(
        'Full plain text of Effective Go...',
      );
      expect(fullContent?.contentMarkdown).toBe(
        '# Effective Go\n\nFull markdown text...',
      );
    });

    it('queries chunk counts in O(log N) 3NF without deserializing chunk bodies', async () => {
      const article: Omit<ArticleRecord, 'status'> = {
        id: 'art-002',
        url: 'https://react.dev/learn',
        title: 'React Documentation',
        excerpt: 'The library for web and native user interfaces.',
        siteName: 'react.dev',
        savedAt: 2000,
        updatedAt: 2000,
        readingTimeMinutes: 8,
        isStarred: true,
      };

      const content: Omit<ArticleContentRecord, 'articleId'> = {
        contentText: 'React content...',
        contentMarkdown: '# React...',
      };

      await upsertArticleWithContent(article, content);
      expect(await getArticleChunkCount('art-002')).toBe(0);

      // Add 3 chunks
      const v1 = new Float32Array(384).fill(0.1);
      const v2 = new Float32Array(384).fill(0.2);
      const v3 = new Float32Array(384).fill(0.3);

      await saveArticleChunks('art-002', [
        { chunkIndex: 0, text: 'First paragraph', vector: v1 },
        { chunkIndex: 1, text: 'Second paragraph', vector: v2 },
        { chunkIndex: 2, text: 'Third paragraph', vector: v3 },
      ]);

      const count = await getArticleChunkCount('art-002');
      expect(count).toBe(3);

      const updated = await getArticleById('art-002');
      expect(updated?.status).toBe('indexed');
    });
  });

  describe('Vector Persistence (Float32Array binary embeddings)', () => {
    it('persists and retrieves 384-dimensional binary Float32Array vectors intact', async () => {
      const article: Omit<ArticleRecord, 'status'> = {
        id: 'art-vec-1',
        url: 'https://example.com/vector-test',
        title: 'Vector Test',
        excerpt: 'Testing Float32Array serialization.',
        siteName: 'example.com',
        savedAt: 3000,
        updatedAt: 3000,
        readingTimeMinutes: 2,
        isStarred: false,
      };

      await upsertArticleWithContent(article, {
        contentText: 'Vector text',
        contentMarkdown: '# Vector',
      });

      // Construct a realistic normalized 384-dimensional vector
      const vector = new Float32Array(384);
      for (let i = 0; i < 384; i++) {
        vector[i] = Math.sin(i * 0.1);
      }

      await saveArticleChunks('art-vec-1', [
        { chunkIndex: 0, text: 'Vector chunk passage', vector },
      ]);

      const chunks = await getChunksByArticleId('art-vec-1');
      expect(chunks).toHaveLength(1);
      expect(chunks[0]?.id).toBe('art-vec-1_chunk_0');
      expect(chunks[0]?.vector).toBeInstanceOf(Float32Array);
      expect(chunks[0]?.vector.length).toBe(384);

      // Check precise float representations
      for (let i = 0; i < 384; i++) {
        expect(chunks[0]?.vector[i]).toBeCloseTo(Math.sin(i * 0.1), 5);
      }

      // Check getAllChunks includes this vector
      const all = await getAllChunks();
      expect(all).toHaveLength(1);
      expect(all[0]?.vector.byteLength).toBe(384 * 4); // 1,536 bytes
    });
  });

  describe('Re-Indexing & Update Flow', () => {
    it('preserves isStarred and original savedAt while replacing chunks and contents', async () => {
      const initialSavedAt = 1600000000000;
      const article: Omit<ArticleRecord, 'status'> = {
        id: 'art-reindex-1',
        url: 'https://wxt.dev/guide',
        title: 'Original WXT Guide',
        excerpt: 'First excerpt',
        siteName: 'wxt.dev',
        savedAt: initialSavedAt,
        updatedAt: initialSavedAt,
        readingTimeMinutes: 5,
        isStarred: true, // Starred!
      };

      await upsertArticleWithContent(article, {
        contentText: 'Version 1 content',
        contentMarkdown: '# Version 1',
      });

      // Add 2 initial chunks
      await saveArticleChunks('art-reindex-1', [
        { chunkIndex: 0, text: 'Old chunk 0', vector: new Float32Array(384) },
        { chunkIndex: 1, text: 'Old chunk 1', vector: new Float32Array(384) },
      ]);

      expect(await getArticleChunkCount('art-reindex-1')).toBe(2);

      // User triggers re-index ([Update] flow)
      const updatedArticle: Omit<ArticleRecord, 'status'> = {
        id: 'art-reindex-1',
        url: 'https://wxt.dev/guide',
        title: 'Updated WXT Guide (v2)',
        excerpt: 'New excerpt',
        siteName: 'wxt.dev',
        savedAt: 9999999999999, // Should be ignored and preserved as initialSavedAt!
        updatedAt: 9999999999999,
        readingTimeMinutes: 6,
        isStarred: false, // Should be preserved as true!
      };

      const reindexed = await upsertArticleWithContent(updatedArticle, {
        contentText: 'Version 2 content updated',
        contentMarkdown: '# Version 2 Updated',
      });

      expect(reindexed.savedAt).toBe(initialSavedAt);
      expect(reindexed.isStarred).toBe(true);
      expect(reindexed.title).toBe('Updated WXT Guide (v2)');

      // Old chunks should be cleared before new embeddings are saved
      expect(await getArticleChunkCount('art-reindex-1')).toBe(0);

      // Content was updated
      const content = await getArticleContent('art-reindex-1');
      expect(content?.contentText).toBe('Version 2 content updated');

      // Now save 1 new chunk
      await saveArticleChunks('art-reindex-1', [
        {
          chunkIndex: 0,
          text: 'Brand new chunk 0',
          vector: new Float32Array(384),
        },
      ]);

      expect(await getArticleChunkCount('art-reindex-1')).toBe(1);
      const chunks = await getChunksByArticleId('art-reindex-1');
      expect(chunks[0]?.text).toBe('Brand new chunk 0');
    });

    it('finds existing article by canonical URL when re-indexing', async () => {
      const canonicalUrl = 'https://example.com/unique-article';
      await upsertArticleWithContent(
        {
          id: 'old-hash-id',
          url: canonicalUrl,
          title: 'Article V1',
          excerpt: 'Excerpt 1',
          siteName: 'example.com',
          savedAt: 5000,
          updatedAt: 5000,
          readingTimeMinutes: 3,
          isStarred: true,
        },
        { contentText: 'Text 1', contentMarkdown: '# Markdown 1' },
      );

      // Re-index with new hash id
      await upsertArticleWithContent(
        {
          id: 'new-hash-id',
          url: canonicalUrl,
          title: 'Article V2',
          excerpt: 'Excerpt 2',
          siteName: 'example.com',
          savedAt: 9000,
          updatedAt: 9000,
          readingTimeMinutes: 4,
          isStarred: false,
        },
        { contentText: 'Text 2', contentMarkdown: '# Markdown 2' },
      );

      const byUrl = await getArticleByUrl(canonicalUrl);
      expect(byUrl).toBeDefined();
      expect(byUrl?.id).toBe('new-hash-id');
      expect(byUrl?.isStarred).toBe(true); // Preserved from V1
      expect(byUrl?.savedAt).toBe(5000); // Preserved from V1
      expect(await getArticleById('old-hash-id')).toBeUndefined();
    });
  });

  describe('Atomic Cascading Deletions', () => {
    it('deletes parent article, partitioned content, and all child chunks in one transaction', async () => {
      // Create article 1 with 2 chunks
      await upsertArticleWithContent(
        {
          id: 'del-1',
          url: 'https://site.com/art1',
          title: 'Article 1',
          excerpt: 'Excerpt 1',
          siteName: 'site.com',
          savedAt: 1000,
          updatedAt: 1000,
          readingTimeMinutes: 2,
          isStarred: false,
        },
        { contentText: 'Content 1', contentMarkdown: '# Content 1' },
      );
      await saveArticleChunks('del-1', [
        { chunkIndex: 0, text: 'Chunk 1-0', vector: new Float32Array(384) },
        { chunkIndex: 1, text: 'Chunk 1-1', vector: new Float32Array(384) },
      ]);

      // Create article 2 with 1 chunk
      await upsertArticleWithContent(
        {
          id: 'del-2',
          url: 'https://site.com/art2',
          title: 'Article 2',
          excerpt: 'Excerpt 2',
          siteName: 'site.com',
          savedAt: 2000,
          updatedAt: 2000,
          readingTimeMinutes: 2,
          isStarred: false,
        },
        { contentText: 'Content 2', contentMarkdown: '# Content 2' },
      );
      await saveArticleChunks('del-2', [
        { chunkIndex: 0, text: 'Chunk 2-0', vector: new Float32Array(384) },
      ]);

      expect(await getAllChunks()).toHaveLength(3);

      // Delete article 1
      const deletedCount = await deleteArticles(['del-1']);
      expect(deletedCount).toBe(1);

      // Verify article 1 completely eradicated with 0 orphaned vectors
      expect(await getArticleById('del-1')).toBeUndefined();
      expect(await getArticleContent('del-1')).toBeUndefined();
      expect(await getChunksByArticleId('del-1')).toHaveLength(0);
      expect(await getArticleChunkCount('del-1')).toBe(0);

      // Verify article 2 is completely intact
      expect(await getArticleById('del-2')).toBeDefined();
      expect(await getArticleContent('del-2')).toBeDefined();
      expect(await getChunksByArticleId('del-2')).toHaveLength(1);
      expect(await getAllChunks()).toHaveLength(1);
    });

    it('safely handles non-existent IDs during deleteArticles', async () => {
      const deleted = await deleteArticles([
        'non-existent-id-1',
        'non-existent-id-2',
      ]);
      expect(deleted).toBe(0);
    });
  });

  describe('bulkDeleteUnstarred with Starred Protection', () => {
    it('deletes unstarred matching age cutoff while strictly protecting starred articles', async () => {
      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;
      const THIRTY_DAYS = 30 * ONE_DAY;

      // Old unstarred article (35 days old) -> should be deleted
      await upsertArticleWithContent(
        {
          id: 'old-unstarred',
          url: 'https://site.com/old-unstarred',
          title: 'Old Unstarred',
          excerpt: '...',
          siteName: 'site.com',
          savedAt: now - 35 * ONE_DAY,
          updatedAt: now - 35 * ONE_DAY,
          readingTimeMinutes: 1,
          isStarred: false,
        },
        { contentText: 'old text', contentMarkdown: '# old' },
      );
      await saveArticleChunks('old-unstarred', [
        { chunkIndex: 0, text: 'old chunk', vector: new Float32Array(384) },
      ]);

      // Old STARRED article (35 days old) -> MUST BE PROTECTED!
      await upsertArticleWithContent(
        {
          id: 'old-starred',
          url: 'https://site.com/old-starred',
          title: 'Old Starred',
          excerpt: '...',
          siteName: 'site.com',
          savedAt: now - 35 * ONE_DAY,
          updatedAt: now - 35 * ONE_DAY,
          readingTimeMinutes: 1,
          isStarred: true,
        },
        { contentText: 'starred text', contentMarkdown: '# starred' },
      );
      await saveArticleChunks('old-starred', [
        { chunkIndex: 0, text: 'starred chunk', vector: new Float32Array(384) },
      ]);

      // Recent unstarred article (2 days old) -> MUST NOT BE DELETED by 30-day cutoff
      await upsertArticleWithContent(
        {
          id: 'recent-unstarred',
          url: 'https://site.com/recent-unstarred',
          title: 'Recent Unstarred',
          excerpt: '...',
          siteName: 'site.com',
          savedAt: now - 2 * ONE_DAY,
          updatedAt: now - 2 * ONE_DAY,
          readingTimeMinutes: 1,
          isStarred: false,
        },
        { contentText: 'recent text', contentMarkdown: '# recent' },
      );

      // Perform bulk cleanup: older than 30 days
      const deleted = await bulkDeleteUnstarred({ olderThanMs: THIRTY_DAYS });
      expect(deleted).toBe(1);

      // Check results
      expect(await getArticleById('old-unstarred')).toBeUndefined();
      expect(await getArticleChunkCount('old-unstarred')).toBe(0);

      // Protected starred article remains
      expect(await getArticleById('old-starred')).toBeDefined();
      expect(await getArticleChunkCount('old-starred')).toBe(1);

      // Recent unstarred article remains
      expect(await getArticleById('recent-unstarred')).toBeDefined();
    });

    it('deletes unstarred matching siteName filter', async () => {
      // Unstarred on target domain
      await upsertArticleWithContent(
        {
          id: 'domain-unstarred',
          url: 'https://spam.com/1',
          title: 'Spam 1',
          excerpt: '...',
          siteName: 'spam.com',
          savedAt: 1000,
          updatedAt: 1000,
          readingTimeMinutes: 1,
          isStarred: false,
        },
        { contentText: 'spam text', contentMarkdown: '# spam' },
      );

      // Starred on target domain -> MUST BE PROTECTED!
      await upsertArticleWithContent(
        {
          id: 'domain-starred',
          url: 'https://spam.com/starred',
          title: 'Favorite on Spam Domain',
          excerpt: '...',
          siteName: 'spam.com',
          savedAt: 1000,
          updatedAt: 1000,
          readingTimeMinutes: 1,
          isStarred: true,
        },
        { contentText: 'fav text', contentMarkdown: '# fav' },
      );

      // Unstarred on different domain -> MUST BE PROTECTED!
      await upsertArticleWithContent(
        {
          id: 'good-unstarred',
          url: 'https://good.com/1',
          title: 'Good 1',
          excerpt: '...',
          siteName: 'good.com',
          savedAt: 1000,
          updatedAt: 1000,
          readingTimeMinutes: 1,
          isStarred: false,
        },
        { contentText: 'good text', contentMarkdown: '# good' },
      );

      const deleted = await bulkDeleteUnstarred({ siteName: 'spam.com' });
      expect(deleted).toBe(1);

      expect(await getArticleById('domain-unstarred')).toBeUndefined();
      expect(await getArticleById('domain-starred')).toBeDefined();
      expect(await getArticleById('good-unstarred')).toBeDefined();
    });
  });

  describe('Feed Queries, Star Toggles & Status Management', () => {
    it('lists articles in reverse-chronological order and applies domain and starred filters', async () => {
      await upsertArticleWithContent(
        {
          id: 'a1',
          url: 'https://a.com/1',
          title: 'A1',
          excerpt: '',
          siteName: 'a.com',
          savedAt: 100,
          updatedAt: 100,
          readingTimeMinutes: 1,
          isStarred: false,
        },
        { contentText: '', contentMarkdown: '' },
      );

      await upsertArticleWithContent(
        {
          id: 'a2',
          url: 'https://b.com/2',
          title: 'A2',
          excerpt: '',
          siteName: 'b.com',
          savedAt: 300,
          updatedAt: 300,
          readingTimeMinutes: 1,
          isStarred: true,
        },
        { contentText: '', contentMarkdown: '' },
      );

      await upsertArticleWithContent(
        {
          id: 'a3',
          url: 'https://a.com/3',
          title: 'A3',
          excerpt: '',
          siteName: 'a.com',
          savedAt: 200,
          updatedAt: 200,
          readingTimeMinutes: 1,
          isStarred: true,
        },
        { contentText: '', contentMarkdown: '' },
      );

      // Reverse chronological: a2 (300), a3 (200), a1 (100)
      const all = await listArticles();
      expect(all.map(a => a.id)).toEqual(['a2', 'a3', 'a1']);

      // Filter by domain a.com -> a3 (200), a1 (100)
      const aDomain = await listArticles({ domainFilter: 'a.com' });
      expect(aDomain.map(a => a.id)).toEqual(['a3', 'a1']);

      // Filter by starred only -> a2 (300), a3 (200)
      const starred = await listArticles({ starredOnly: true });
      expect(starred.map(a => a.id)).toEqual(['a2', 'a3']);

      // Combined filter
      const starredADomain = await listArticles({
        domainFilter: 'a.com',
        starredOnly: true,
      });
      expect(starredADomain.map(a => a.id)).toEqual(['a3']);
    });

    it('aggregates domain counts sorted descending', async () => {
      const dummy = {
        excerpt: '',
        savedAt: 1000,
        updatedAt: 1000,
        readingTimeMinutes: 1,
        isStarred: false,
      };

      await upsertArticleWithContent(
        {
          ...dummy,
          id: '1',
          url: 'https://site-a.org/1',
          title: '1',
          siteName: 'site-a.org',
        },
        { contentText: '', contentMarkdown: '' },
      );
      await upsertArticleWithContent(
        {
          ...dummy,
          id: '2',
          url: 'https://site-b.org/2',
          title: '2',
          siteName: 'site-b.org',
        },
        { contentText: '', contentMarkdown: '' },
      );
      await upsertArticleWithContent(
        {
          ...dummy,
          id: '3',
          url: 'https://site-b.org/3',
          title: '3',
          siteName: 'site-b.org',
        },
        { contentText: '', contentMarkdown: '' },
      );

      const counts = await getDomainCounts();
      expect(counts).toEqual([
        { siteName: 'site-b.org', count: 2 },
        { siteName: 'site-a.org', count: 1 },
      ]);
    });

    it('toggles article starred state and updates status to failed', async () => {
      await upsertArticleWithContent(
        {
          id: 'status-test',
          url: 'https://status.test/1',
          title: 'Status Test',
          excerpt: '',
          siteName: 'status.test',
          savedAt: 1000,
          updatedAt: 1000,
          readingTimeMinutes: 1,
          isStarred: false,
        },
        { contentText: '', contentMarkdown: '' },
      );

      const toggled = await toggleArticleStar('status-test');
      expect(toggled?.isStarred).toBe(true);

      const explicitlyFalse = await toggleArticleStar('status-test', false);
      expect(explicitlyFalse?.isStarred).toBe(false);

      await markArticleFailed('status-test');
      const failed = await getArticleById('status-test');
      expect(failed?.status).toBe('failed');
    });
  });

  describe('Two-Layer Storage Quota Gatekeeper', () => {
    it('manages default settings and cap expansion', async () => {
      const settings = await getStorageSettings();
      expect(settings.maxStorageBytes).toBe(50 * 1024 * 1024); // 50 MB
      expect(settings.warnThresholdRatio).toBe(0.85);
      expect(settings.hasGrantedDiskExpansion).toBe(false);

      const updated = await updateStorageCap(250 * 1024 * 1024);
      expect(updated.maxStorageBytes).toBe(250 * 1024 * 1024);
      expect(updated.hasGrantedDiskExpansion).toBe(true);
    });

    it('accurately estimates payload byte size including 1,536-byte vector per chunk', () => {
      const article: Omit<ArticleRecord, 'status'> = {
        id: 'test-hash-id',
        url: 'https://example.com/article',
        title: 'Sample Article',
        byline: 'Author Name',
        excerpt: 'Short excerpt describing the article.',
        siteName: 'example.com',
        faviconUrl: 'https://example.com/favicon.ico',
        savedAt: 1000,
        updatedAt: 1000,
        readingTimeMinutes: 5,
        isStarred: false,
      };

      const content: Omit<ArticleContentRecord, 'articleId'> = {
        contentText: 'Paragraph 1\nParagraph 2',
        contentMarkdown: '# Sample Article\n\nParagraph 1\n\nParagraph 2',
      };

      const chunks = ['First chunk passage...', 'Second chunk passage...'];

      const bytes = estimatePayloadBytes(article, content, chunks);

      // Expected calculation:
      // 2 chunks * (1,536 vector bytes + 128 overhead) = 3,328 bytes for vectors/chunk overhead alone
      // + text lengths + metadata overhead
      expect(bytes).toBeGreaterThan(3500);
      expect(bytes).toBeLessThan(10000);
    });

    describe('Logical Storage Footprint Tracking', () => {
      it('returns 0 when no articles exist', async () => {
        const usage = await getLogicalStorageUsage();
        expect(usage).toBe(0);
      });

      it('returns exact byte footprint when articles with chunks exist', async () => {
        const art1: Omit<ArticleRecord, 'status'> = {
          id: 'art-footprint-1',
          url: 'https://example.com/1',
          title: 'Article 1',
          excerpt: 'Excerpt 1',
          siteName: 'example.com',
          savedAt: 1000,
          updatedAt: 1000,
          readingTimeMinutes: 2,
          isStarred: false,
          bytes: 4096,
        };
        const art2: Omit<ArticleRecord, 'status'> = {
          id: 'art-footprint-2',
          url: 'https://example.com/2',
          title: 'Article 2',
          excerpt: 'Excerpt 2',
          siteName: 'example.com',
          savedAt: 1000,
          updatedAt: 1000,
          readingTimeMinutes: 3,
          isStarred: false,
          bytes: 8192,
        };
        const content: Omit<ArticleContentRecord, 'articleId'> = {
          contentText: 'Text',
          contentMarkdown: '# Text',
        };

        await upsertArticleWithContent(art1, content);
        await upsertArticleWithContent(art2, content);

        const totalUsage = await getLogicalStorageUsage();
        expect(totalUsage).toBe(12288); // 4096 + 8192
      });

      it('returns 0 after articles are deleted via deleteArticles or bulkDeleteUnstarred', async () => {
        const art1: Omit<ArticleRecord, 'status'> = {
          id: 'art-del-1',
          url: 'https://example.com/del-1',
          title: 'Delete 1',
          excerpt: 'Excerpt',
          siteName: 'example.com',
          savedAt: 1000,
          updatedAt: 1000,
          readingTimeMinutes: 1,
          isStarred: false,
          bytes: 2048,
        };
        const art2: Omit<ArticleRecord, 'status'> = {
          id: 'art-del-2',
          url: 'https://example.com/del-2',
          title: 'Delete 2',
          excerpt: 'Excerpt',
          siteName: 'example.com',
          savedAt: 1000,
          updatedAt: 1000,
          readingTimeMinutes: 1,
          isStarred: false,
          bytes: 3072,
        };
        const content = { contentText: 'Text', contentMarkdown: '# Text' };

        await upsertArticleWithContent(art1, content);
        await upsertArticleWithContent(art2, content);
        expect(await getLogicalStorageUsage()).toBe(5120);

        await deleteArticles(['art-del-1']);
        expect(await getLogicalStorageUsage()).toBe(3072);

        await deleteArticles(['art-del-2']);
        expect(await getLogicalStorageUsage()).toBe(0);

        // Test bulkDeleteUnstarred
        await upsertArticleWithContent(
          {
            ...art1,
            id: 'art-bulk',
            url: 'https://example.com/bulk',
            bytes: 5000,
          },
          content,
        );
        expect(await getLogicalStorageUsage()).toBe(5000);
        await bulkDeleteUnstarred({});
        expect(await getLogicalStorageUsage()).toBe(0);
      });

      it('computes fallback byte size for legacy articles where bytes was omitted and caches back to store', async () => {
        const legacyArt: Omit<ArticleRecord, 'status'> = {
          id: 'art-legacy-1',
          url: 'https://legacy.example.com/item',
          title: 'Legacy Article Without Bytes',
          excerpt: 'Legacy excerpt text.',
          siteName: 'legacy.example.com',
          savedAt: 1000,
          updatedAt: 1000,
          readingTimeMinutes: 4,
          isStarred: false,
        };
        const legacyContent: Omit<ArticleContentRecord, 'articleId'> = {
          contentText: 'Full body of legacy article.',
          contentMarkdown: '# Full body of legacy article.',
        };
        await upsertArticleWithContent(legacyArt, legacyContent);
        await saveArticleChunks('art-legacy-1', [
          {
            chunkIndex: 0,
            text: 'First legacy chunk',
            vector: new Float32Array(384),
          },
          {
            chunkIndex: 1,
            text: 'Second legacy chunk',
            vector: new Float32Array(384),
          },
        ]);

        const expectedEstimated = estimatePayloadBytes(
          legacyArt,
          legacyContent,
          ['First legacy chunk', 'Second legacy chunk'],
        );

        const computedUsage = await getLogicalStorageUsage();
        expect(computedUsage).toBe(expectedEstimated);
        expect(computedUsage).toBeGreaterThan(0);

        // Verify that bytes was cached back onto the ArticleRecord in IndexedDB
        const stored = await getArticleById('art-legacy-1');
        expect(stored?.bytes).toBe(expectedEstimated);

        // Subsequent call uses the cached bytes directly
        const secondCallUsage = await getLogicalStorageUsage();
        expect(secondCallUsage).toBe(expectedEstimated);
      });
    });

    describe('checkStorageQuota with Logical Storage Tracking', () => {
      it('returns currentUsageBytes: 0 and usageRatio: 0 when 0 articles are saved', async () => {
        // Physical LevelDB has 10 MB on disk (WAL logs, SSTables)
        mockNavigatorStorage(async () => ({
          usage: 10 * 1024 * 1024,
          quota: 50 * 1024 * 1024 * 1024,
          usageDetails: {
            indexedDB: 10 * 1024 * 1024,
            caches: 24 * 1024 * 1024,
          },
        }));

        const quota = await checkStorageQuota();
        // Baseline must be strictly 0.0 MB / 0% utilized
        expect(quota.currentUsageBytes).toBe(0);
        expect(quota.usageRatio).toBe(0);
        expect(quota.isWarning).toBe(false);
        expect(quota.isExceeded).toBe(false);
        expect(quota.canSave).toBe(true);
        // Physical metrics retained for diagnostic transparency
        expect(quota.indexedDBUsageBytes).toBe(10 * 1024 * 1024);
        expect(quota.modelCacheUsageBytes).toBe(24 * 1024 * 1024);
      });

      it('accurately tracks currentUsageBytes and usageRatio when articles are saved', async () => {
        await upsertArticleWithContent(
          {
            id: 'tracked-art',
            url: 'https://example.com/tracked',
            title: 'Tracked Article',
            excerpt: '',
            siteName: 'example.com',
            savedAt: 1000,
            updatedAt: 1000,
            readingTimeMinutes: 1,
            isStarred: false,
            bytes: 10 * 1024 * 1024, // 10 MB logical data
          },
          { contentText: '', contentMarkdown: '' },
        );

        const quota = await checkStorageQuota(50 * 1024); // requesting 50 KB
        expect(quota.currentUsageBytes).toBe(10 * 1024 * 1024);
        expect(quota.maxStorageBytes).toBe(50 * 1024 * 1024);
        expect(quota.usageRatio).toBeCloseTo(0.2, 2);
        expect(quota.isWarning).toBe(false);
        expect(quota.isExceeded).toBe(false);
        expect(quota.isLowPhysicalDisk).toBe(false);
        expect(quota.canSave).toBe(true);
        expect(quota.suggestedNewCapBytes).toBe(
          DEFAULT_SUGGESTED_EXPANSION_BYTES,
        );
      });

      it('triggers warning at 85% usage threshold', async () => {
        // 43 MB used out of 50 MB cap = 86% (> 85%)
        await upsertArticleWithContent(
          {
            id: 'warn-art',
            url: 'https://example.com/warn',
            title: 'Warning Article',
            excerpt: '',
            siteName: 'example.com',
            savedAt: 1000,
            updatedAt: 1000,
            readingTimeMinutes: 1,
            isStarred: false,
            bytes: 43 * 1024 * 1024,
          },
          { contentText: '', contentMarkdown: '' },
        );

        const quota = await checkStorageQuota();
        expect(quota.currentUsageBytes).toBe(43 * 1024 * 1024);
        expect(quota.usageRatio).toBeGreaterThan(0.85);
        expect(quota.isWarning).toBe(true);
        expect(quota.isExceeded).toBe(false);
        expect(quota.canSave).toBe(true);
      });

      it('blocks save and signals quota exceeded when cap is reached', async () => {
        // 50 MB used out of 50 MB cap
        await upsertArticleWithContent(
          {
            id: 'full-art',
            url: 'https://example.com/full',
            title: 'Full Article',
            excerpt: '',
            siteName: 'example.com',
            savedAt: 1000,
            updatedAt: 1000,
            readingTimeMinutes: 1,
            isStarred: false,
            bytes: 50 * 1024 * 1024,
          },
          { contentText: '', contentMarkdown: '' },
        );

        const quota = await checkStorageQuota(1024); // requesting 1 KB
        expect(quota.currentUsageBytes).toBe(50 * 1024 * 1024);
        expect(quota.isExceeded).toBe(true);
        expect(quota.canSave).toBe(false);
        expect(quota.suggestedNewCapBytes).toBe(
          DEFAULT_SUGGESTED_EXPANSION_BYTES,
        );

        // Expand cap to 250 MB
        await updateStorageCap(quota.suggestedNewCapBytes);

        const afterExpansion = await checkStorageQuota(1024);
        expect(afterExpansion.isExceeded).toBe(false);
        expect(afterExpansion.canSave).toBe(true);
        expect(afterExpansion.maxStorageBytes).toBe(250 * 1024 * 1024);
        // Double cap for next expansion suggestion
        expect(afterExpansion.suggestedNewCapBytes).toBe(500 * 1024 * 1024);
      });

      it('preserves hardware safety limit when physical disk has < 500 MB free', async () => {
        // Pool quota: 600 MB, usage: 200 MB -> remaining disk: 400 MB (< 500 MB)
        mockNavigatorStorage(async () => ({
          usage: 200 * 1024 * 1024,
          quota: 600 * 1024 * 1024,
        }));

        const quota = await checkStorageQuota();
        expect(quota.freePhysicalDiskBytes).toBe(400 * 1024 * 1024);
        expect(quota.freePhysicalDiskBytes).toBeLessThan(
          LOW_PHYSICAL_DISK_BYTES,
        );
        expect(quota.isLowPhysicalDisk).toBe(true);
        expect(quota.canSave).toBe(false);
      });

      it('falls back to physical usage when getLogicalStorageUsage fails', async () => {
        const client = await import('../client');
        const spy = vi
          .spyOn(client, 'getDB')
          .mockRejectedValueOnce(new Error('IndexedDB unavailable'));

        mockNavigatorStorage(async () => ({
          usage: 12 * 1024 * 1024,
          quota: 50 * 1024 * 1024 * 1024,
          usageDetails: {
            indexedDB: 12 * 1024 * 1024,
          },
        }));

        const quota = await checkStorageQuota();
        expect(quota.currentUsageBytes).toBe(12 * 1024 * 1024);
        expect(quota.indexedDBUsageBytes).toBe(12 * 1024 * 1024);

        spy.mockRestore();
      });
    });
  });
});
