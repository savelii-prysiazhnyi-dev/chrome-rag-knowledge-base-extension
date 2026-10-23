import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  syncTabBadge,
  syncAllTabBadges,
  ICONS_ACTIVE,
  ICONS_INACTIVE,
} from '../index';
import * as db from '../../../db';

vi.mock('../../../db', () => ({
  getArticleByUrl: vi.fn(),
  checkStorageQuota: vi.fn(),
  deleteArticles: vi.fn(),
  estimatePayloadBytes: vi.fn(),
  updateStorageCap: vi.fn(),
  upsertArticleWithContent: vi.fn(),
}));

describe('syncTabBadge and dynamic icon switching', () => {
  let mockSetIcon: ReturnType<typeof vi.fn>;
  let mockSetBadgeText: ReturnType<typeof vi.fn>;
  let mockSetBadgeBackgroundColor: ReturnType<typeof vi.fn>;
  let mockTabsQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSetIcon = vi.fn().mockResolvedValue(undefined);
    mockSetBadgeText = vi.fn().mockResolvedValue(undefined);
    mockSetBadgeBackgroundColor = vi.fn().mockResolvedValue(undefined);
    mockTabsQuery = vi.fn().mockResolvedValue([]);

    (globalThis as unknown as { chrome: unknown }).chrome = {
      action: {
        setIcon: mockSetIcon,
        setBadgeText: mockSetBadgeText,
        setBadgeBackgroundColor: mockSetBadgeBackgroundColor,
      },
      tabs: {
        query: mockTabsQuery,
      },
    };
  });

  it('sets inactive icon and clears badge for non-http/https URLs', async () => {
    await syncTabBadge(1, 'chrome://extensions');

    expect(mockSetIcon).toHaveBeenCalledWith({
      tabId: 1,
      path: ICONS_INACTIVE,
    });
    expect(mockSetBadgeText).toHaveBeenCalledWith({
      tabId: 1,
      text: '',
    });
    expect(mockSetBadgeBackgroundColor).not.toHaveBeenCalled();
    expect(db.getArticleByUrl).not.toHaveBeenCalled();
  });

  it('sets inactive icon and clears badge when url is undefined or empty', async () => {
    await syncTabBadge(2, undefined);

    expect(mockSetIcon).toHaveBeenCalledWith({
      tabId: 2,
      path: ICONS_INACTIVE,
    });
    expect(mockSetBadgeText).toHaveBeenCalledWith({
      tabId: 2,
      text: '',
    });
    expect(db.getArticleByUrl).not.toHaveBeenCalled();
  });

  it('sets active cyan icon, green background, and checkmark badge when article is indexed', async () => {
    vi.mocked(db.getArticleByUrl).mockResolvedValueOnce({
      id: 'art-123',
      url: 'https://example.com/article',
      status: 'indexed',
      title: 'Example Article',
      excerpt: 'Excerpt',
      siteName: 'example.com',
      savedAt: 1000,
      updatedAt: 1000,
      readingTimeMinutes: 2,
      isStarred: false,
    });

    await syncTabBadge(3, 'https://example.com/article');

    expect(db.getArticleByUrl).toHaveBeenCalledWith(
      'https://example.com/article',
    );
    expect(mockSetIcon).toHaveBeenCalledWith({
      tabId: 3,
      path: ICONS_ACTIVE,
    });
    expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({
      tabId: 3,
      color: '#10b981',
    });
    expect(mockSetBadgeText).toHaveBeenCalledWith({
      tabId: 3,
      text: '✓',
    });
  });

  it('sets inactive icon and clears badge when article is not found in database', async () => {
    vi.mocked(db.getArticleByUrl).mockResolvedValueOnce(undefined);

    await syncTabBadge(4, 'https://example.com/not-saved');

    expect(db.getArticleByUrl).toHaveBeenCalledWith(
      'https://example.com/not-saved',
    );
    expect(mockSetIcon).toHaveBeenCalledWith({
      tabId: 4,
      path: ICONS_INACTIVE,
    });
    expect(mockSetBadgeText).toHaveBeenCalledWith({
      tabId: 4,
      text: '',
    });
    expect(mockSetBadgeBackgroundColor).not.toHaveBeenCalled();
  });

  it('sets inactive icon and clears badge when article is pending or indexing', async () => {
    vi.mocked(db.getArticleByUrl).mockResolvedValueOnce({
      id: 'art-indexing',
      url: 'https://example.com/indexing',
      status: 'indexing',
      title: 'Indexing Article',
      excerpt: 'Excerpt',
      siteName: 'example.com',
      savedAt: 1000,
      updatedAt: 1000,
      readingTimeMinutes: 2,
      isStarred: false,
    });

    await syncTabBadge(5, 'https://example.com/indexing');

    expect(mockSetIcon).toHaveBeenCalledWith({
      tabId: 5,
      path: ICONS_INACTIVE,
    });
    expect(mockSetBadgeText).toHaveBeenCalledWith({
      tabId: 5,
      text: '',
    });
  });

  it('gracefully falls back to inactive icon and clears badge when getArticleByUrl throws', async () => {
    vi.mocked(db.getArticleByUrl).mockRejectedValueOnce(
      new Error('DB read error'),
    );

    await syncTabBadge(6, 'https://example.com/error');

    expect(mockSetIcon).toHaveBeenCalledWith({
      tabId: 6,
      path: ICONS_INACTIVE,
    });
    expect(mockSetBadgeText).toHaveBeenCalledWith({
      tabId: 6,
      text: '',
    });
  });

  it('does not throw when chrome.action is missing or partial', async () => {
    (globalThis as unknown as { chrome: unknown }).chrome = {};

    await expect(
      syncTabBadge(7, 'https://example.com/test'),
    ).resolves.not.toThrow();
  });

  it('syncAllTabBadges queries tabs and updates each tab', async () => {
    mockTabsQuery.mockResolvedValueOnce([
      { id: 101, url: 'https://site-a.com' },
      { id: 102, url: 'https://site-b.com' },
      { id: undefined, url: 'https://site-c.com' },
    ]);

    vi.mocked(db.getArticleByUrl).mockImplementation(async url => {
      if (url.includes('site-a.com')) {
        return {
          id: 'art-a',
          url: 'https://site-a.com/',
          status: 'indexed',
          title: 'Site A',
          excerpt: '',
          siteName: 'site-a.com',
          savedAt: 1,
          updatedAt: 1,
          readingTimeMinutes: 1,
          isStarred: false,
        };
      }
      return undefined;
    });

    await syncAllTabBadges();

    expect(mockTabsQuery).toHaveBeenCalledWith({});
    expect(mockSetIcon).toHaveBeenCalledWith({
      tabId: 101,
      path: ICONS_ACTIVE,
    });
    expect(mockSetBadgeText).toHaveBeenCalledWith({
      tabId: 101,
      text: '✓',
    });
    expect(mockSetIcon).toHaveBeenCalledWith({
      tabId: 102,
      path: ICONS_INACTIVE,
    });
    expect(mockSetBadgeText).toHaveBeenCalledWith({
      tabId: 102,
      text: '',
    });
  });
});
