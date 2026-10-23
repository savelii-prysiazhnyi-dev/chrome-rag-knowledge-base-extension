import type {
  ArticleContentRecord,
  ArticleRecord,
  ExtensionMessage,
  ExtractPageResponse,
  SaveTabResult,
  StorageQuotaStatus,
} from '../../types/messages';

export type { SaveTabResult };

export interface TabLike {
  id?: number;
  url?: string;
  incognito?: boolean;
  favIconUrl?: string;
}

/** Injected dependencies so the flow is unit-testable without chrome/IDB. */
export interface CoordinatorDeps {
  getTab(tabId: number): Promise<TabLike>;
  extractPage(tabId: number): Promise<ExtractPageResponse | undefined>;
  hashUrl(url: string): Promise<string>;
  estimatePayloadBytes(
    article: Omit<ArticleRecord, 'status'>,
    content: Omit<ArticleContentRecord, 'articleId'>,
    chunks: string[],
  ): number;
  checkStorageQuota(requiredBytes: number): Promise<StorageQuotaStatus>;
  upsertArticleWithContent(
    article: Omit<ArticleRecord, 'status'>,
    content: Omit<ArticleContentRecord, 'articleId'>,
    status?: ArticleRecord['status'],
  ): Promise<ArticleRecord>;
  ensureOffscreenDocument(): Promise<void>;
  sendToOffscreen(message: ExtensionMessage): Promise<unknown>;
  emit(message: ExtensionMessage): void;
}

/**
 * In-memory in-flight lock keyed by tabId. By design it is NOT persisted: if the
 * MV3 service worker restarts mid-flight the lock is lost, which is harmless
 * because `upsertArticleWithContent` is idempotent and re-saving simply
 * re-indexes. A stuck lock can never outlive the worker.
 */
export function createCoordinator(deps: CoordinatorDeps) {
  const activeIngestions = new Set<number>();

  async function run(tabId: number): Promise<SaveTabResult> {
    const tab = await deps.getTab(tabId);
    if (tab.incognito) {
      const result: SaveTabResult = { status: 'incognito_blocked' };
      deps.emit({ type: 'SAVE_FAILED', payload: { tabId, result } });
      return result;
    }

    deps.emit({ type: 'SAVE_STARTED', payload: { tabId, url: tab.url } });

    const extracted = await deps.extractPage(tabId);
    if (!extracted) {
      const result: SaveTabResult = {
        status: 'extract_failed',
        error: 'EXTRACTION_FAILED',
        reason: 'No response from content script',
      };
      deps.emit({ type: 'SAVE_FAILED', payload: { tabId, result } });
      return result;
    }
    if (!extracted.ok) {
      const result: SaveTabResult = {
        status: 'extract_failed',
        error: extracted.error,
        reason: extracted.reason,
      };
      deps.emit({ type: 'SAVE_FAILED', payload: { tabId, result } });
      return result;
    }

    const id = await deps.hashUrl(extracted.canonicalUrl);
    const now = Date.now();
    const content: Omit<ArticleContentRecord, 'articleId'> = {
      contentText: extracted.textContent,
      contentMarkdown: extracted.markdown,
    };
    const textChunks = extracted.chunks.map(c => c.text);

    const articleDraft: Omit<ArticleRecord, 'status'> = {
      id,
      url: extracted.canonicalUrl,
      title: extracted.title,
      byline: extracted.byline,
      excerpt: extracted.excerpt,
      siteName: extracted.siteName,
      faviconUrl: tab.favIconUrl,
      savedAt: now,
      updatedAt: now,
      readingTimeMinutes: extracted.readingTimeMinutes,
      isStarred: false,
    };
    const required = deps.estimatePayloadBytes(
      articleDraft,
      content,
      textChunks,
    );
    const article: Omit<ArticleRecord, 'status'> = {
      ...articleDraft,
      bytes: required,
    };
    const quota = await deps.checkStorageQuota(required);
    if (!quota.canSave) {
      deps.emit({
        type: 'STORAGE_QUOTA_EXCEEDED',
        payload: {
          currentUsageBytes: quota.currentUsageBytes,
          maxStorageBytes: quota.maxStorageBytes,
          requiredBytes: required,
          suggestedNewCapBytes: quota.suggestedNewCapBytes,
        },
      });
      const result: SaveTabResult = { status: 'quota_exceeded' };
      deps.emit({ type: 'SAVE_FAILED', payload: { tabId, result } });
      return result;
    }

    await deps.upsertArticleWithContent(article, content, 'indexing');
    deps.emit({
      type: 'DATABASE_UPDATED',
      payload: { reason: 'article_saved', articleId: id },
    });
    await deps.ensureOffscreenDocument();
    await deps.sendToOffscreen({
      type: 'GENERATE_EMBEDDINGS_JOB',
      target: 'offscreen',
      payload: { articleId: id, textChunks },
    });
    return { status: 'indexing', articleId: id };
  }

  async function saveTab(tabId: number | undefined): Promise<SaveTabResult> {
    if (tabId === undefined) return { status: 'no_tab' };
    if (activeIngestions.has(tabId)) return { status: 'already_processing' };
    activeIngestions.add(tabId);
    try {
      return await run(tabId);
    } catch (err) {
      const result: SaveTabResult = {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
      deps.emit({ type: 'SAVE_FAILED', payload: { tabId, result } });
      return result;
    } finally {
      activeIngestions.delete(tabId);
    }
  }

  return { saveTab, activeIngestions };
}
