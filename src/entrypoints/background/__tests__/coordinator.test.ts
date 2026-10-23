import { describe, it, expect, vi } from 'vitest';
import { createCoordinator, type CoordinatorDeps } from '../coordinator';
import type { ExtractPageResponse } from '../../../types/messages';

const okPage: ExtractPageResponse = {
  ok: true,
  canonicalUrl: 'https://a.com/x',
  title: 'T',
  siteName: 'a.com',
  excerpt: 'e',
  textContent: 'text',
  markdown: 'md',
  wordCount: 1,
  readingTimeMinutes: 1,
  chunks: [
    { chunkIndex: 0, text: 'c0' },
    { chunkIndex: 1, text: 'c1' },
  ],
};

function setup(over: Partial<CoordinatorDeps> = {}) {
  const deps: CoordinatorDeps = {
    getTab: vi.fn(async () => ({
      id: 1,
      incognito: false,
      favIconUrl: 'f.ico',
    })),
    extractPage: vi.fn(async () => okPage),
    hashUrl: vi.fn(async () => 'hash'),
    estimatePayloadBytes: vi.fn(() => 100),
    checkStorageQuota: vi.fn(async () => ({
      canSave: true,
      currentUsageBytes: 0,
      maxStorageBytes: 1000,
      suggestedNewCapBytes: 2000,
    })) as never,
    upsertArticleWithContent: vi.fn(async a => ({
      ...a,
      status: 'indexing' as const,
    })),
    ensureOffscreenDocument: vi.fn(async () => {}),
    sendToOffscreen: vi.fn(async () => ({})),
    emit: vi.fn(),
    ...over,
  };
  return { deps, c: createCoordinator(deps) };
}

describe('coordinator.saveTab', () => {
  it('runs the happy path', async () => {
    const { deps, c } = setup();
    const r = await c.saveTab(1);
    expect(r).toEqual({ status: 'indexing', articleId: 'hash' });
    expect(deps.emit).toHaveBeenCalledWith({
      type: 'SAVE_STARTED',
      payload: { tabId: 1, url: undefined },
    });
    const [article, , status] = vi.mocked(deps.upsertArticleWithContent).mock
      .calls[0]!;
    expect(article.faviconUrl).toBe('f.ico');
    expect(article.id).toBe('hash');
    expect(article.bytes).toBe(100);
    expect(status).toBe('indexing');
    expect(deps.emit).toHaveBeenCalledWith({
      type: 'DATABASE_UPDATED',
      payload: { reason: 'article_saved', articleId: 'hash' },
    });
    expect(deps.sendToOffscreen).toHaveBeenCalledWith({
      type: 'GENERATE_EMBEDDINGS_JOB',
      target: 'offscreen',
      payload: { articleId: 'hash', textChunks: ['c0', 'c1'] },
    });
    expect(c.activeIngestions.size).toBe(0);
  });

  it('blocks duplicates in flight and releases lock after', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    const { c } = setup({
      ensureOffscreenDocument: async () => {
        await gate;
      },
    });
    const first = c.saveTab(1);
    expect(await c.saveTab(1)).toEqual({ status: 'already_processing' });
    release();
    expect((await first).status).toBe('indexing');
    expect((await c.saveTab(1)).status).toBe('indexing');
  });

  it('releases lock on error', async () => {
    const { deps, c } = setup({
      getTab: async () => {
        throw new Error('gone');
      },
    });
    expect(await c.saveTab(1)).toEqual({ status: 'error', error: 'gone' });
    expect(deps.emit).toHaveBeenCalledWith({
      type: 'SAVE_FAILED',
      payload: { tabId: 1, result: { status: 'error', error: 'gone' } },
    });
    expect(c.activeIngestions.size).toBe(0);
  });

  it('blocks incognito', async () => {
    const { deps, c } = setup({
      getTab: async () => ({ id: 1, incognito: true }),
    });
    expect(await c.saveTab(1)).toEqual({ status: 'incognito_blocked' });
    expect(deps.emit).toHaveBeenCalledWith({
      type: 'SAVE_FAILED',
      payload: { tabId: 1, result: { status: 'incognito_blocked' } },
    });
    expect(deps.extractPage).not.toHaveBeenCalled();
  });

  it('maps extraction errors', async () => {
    const { deps, c } = setup({
      extractPage: async () => ({ ok: false, error: 'TOO_SHORT' }),
    });
    const r = await c.saveTab(1);
    expect(r).toMatchObject({ status: 'extract_failed', error: 'TOO_SHORT' });
    expect(deps.emit).toHaveBeenCalledWith({
      type: 'SAVE_STARTED',
      payload: { tabId: 1, url: undefined },
    });
    expect(deps.emit).toHaveBeenCalledWith({
      type: 'SAVE_FAILED',
      payload: { tabId: 1, result: r },
    });
    expect(deps.upsertArticleWithContent).not.toHaveBeenCalled();
  });

  it('emits SAVE_FAILED when extraction returns no response', async () => {
    const { deps, c } = setup({
      extractPage: async () => undefined,
    });
    const r = await c.saveTab(1);
    expect(r).toMatchObject({
      status: 'extract_failed',
      error: 'EXTRACTION_FAILED',
      reason: 'No response from content script',
    });
    expect(deps.emit).toHaveBeenCalledWith({
      type: 'SAVE_STARTED',
      payload: { tabId: 1, url: undefined },
    });
    expect(deps.emit).toHaveBeenCalledWith({
      type: 'SAVE_FAILED',
      payload: { tabId: 1, result: r },
    });
  });

  it('stops without writes when quota exceeded', async () => {
    const { deps, c } = setup({
      checkStorageQuota: (async () => ({
        canSave: false,
        currentUsageBytes: 9,
        maxStorageBytes: 10,
        suggestedNewCapBytes: 20,
      })) as never,
    });
    expect(await c.saveTab(1)).toEqual({ status: 'quota_exceeded' });
    expect(deps.emit).toHaveBeenCalledWith({
      type: 'SAVE_STARTED',
      payload: { tabId: 1, url: undefined },
    });
    expect(deps.emit).toHaveBeenCalledWith({
      type: 'STORAGE_QUOTA_EXCEEDED',
      payload: {
        currentUsageBytes: 9,
        maxStorageBytes: 10,
        requiredBytes: 100,
        suggestedNewCapBytes: 20,
      },
    });
    expect(deps.emit).toHaveBeenCalledWith({
      type: 'SAVE_FAILED',
      payload: { tabId: 1, result: { status: 'quota_exceeded' } },
    });
    expect(deps.upsertArticleWithContent).not.toHaveBeenCalled();
    expect(deps.sendToOffscreen).not.toHaveBeenCalled();
  });

  it('handles missing tab id', async () => {
    const { c } = setup();
    expect(await c.saveTab(undefined)).toEqual({ status: 'no_tab' });
  });
});
