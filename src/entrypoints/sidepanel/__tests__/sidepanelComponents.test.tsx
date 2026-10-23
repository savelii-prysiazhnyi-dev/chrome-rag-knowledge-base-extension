// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { SidePanelHeader } from '../components/SidePanelHeader';
import { ActiveTabBanner } from '../components/ActiveTabBanner';
import { DomainFilterPills } from '../components/DomainFilterPills';
import { SearchResultCard } from '../components/SearchResultCard';
import { StorageFooter } from '../components/StorageFooter';
import { StorageQuotaModal } from '../components/StorageQuotaModal';
import type {
  ArticleRecord,
  SearchResultItem,
  StorageQuotaStatus,
} from '../../../types/messages';

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('Side Panel Modernized Components', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    container.remove();
  });

  describe('SidePanelHeader', () => {
    it('renders "Second Brain", new subtitle, and "Full Library" button without brain icon', () => {
      const onOpen = vi.fn();
      const root = createRoot(container);

      act(() => {
        root.render(
          React.createElement(SidePanelHeader, {
            onOpenKnowledgeManager: onOpen,
          }),
        );
      });

      expect(container.textContent).toContain('Second Brain');
      expect(container.textContent).toContain(
        'Semantic knowledge base in your browser',
      );
      expect(container.textContent).not.toContain('Local RAG Assistant');

      const fullLibraryBtn = container.querySelector('button');
      expect(fullLibraryBtn).not.toBeNull();
      expect(fullLibraryBtn?.textContent).toContain('Full Library');
      expect(fullLibraryBtn?.textContent).not.toContain('Manager');

      act(() => {
        fullLibraryBtn?.click();
      });
      expect(onOpen).toHaveBeenCalledTimes(1);
    });
  });

  describe('ActiveTabBanner', () => {
    it('renders URL link & copy component and copies URL to clipboard with hint', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const root = createRoot(container);
      act(() => {
        root.render(
          React.createElement(ActiveTabBanner, {
            activeTabUrl: 'https://example.com/article-1',
            isSaving: false,
            saveError: null,
            onSaveOrUpdate: vi.fn(),
            onRemove: vi.fn(),
            onDismissError: vi.fn(),
          }),
        );
      });

      expect(container.textContent).toContain('https://example.com/article-1');
      expect(container.textContent).toContain('Remember this page');
      expect(container.textContent).not.toContain('Not saved yet');

      const copyBtn = container.querySelector('button');
      await act(async () => {
        copyBtn?.click();
      });

      expect(writeTextMock).toHaveBeenCalledWith(
        'https://example.com/article-1',
      );
      expect(container.textContent).toContain('Copied!');
      const badge = container.querySelector('span.shrink-0');
      expect(badge?.className).toContain('bg-slate-200/80');
      expect(badge?.className).toContain('text-slate-700');
    });

    it('renders saved state with reading time and indexing indicator, and equal-width buttons', () => {
      const mockArticle: ArticleRecord = {
        id: '123',
        url: 'https://example.com/article-1',
        title: 'Article 1',
        excerpt: 'Test excerpt',
        siteName: 'example.com',
        savedAt: Date.now(),
        updatedAt: Date.now(),
        readingTimeMinutes: 5,
        isStarred: false,
        status: 'indexing',
      };

      const onSaveOrUpdate = vi.fn();
      const onRemove = vi.fn();

      const root = createRoot(container);
      act(() => {
        root.render(
          React.createElement(ActiveTabBanner, {
            savedArticle: mockArticle,
            activeTabUrl: 'https://example.com/article-1',
            isSaving: false,
            saveError: null,
            onSaveOrUpdate,
            onRemove,
            onDismissError: vi.fn(),
          }),
        );
      });

      expect(container.textContent).toContain('This page is saved');
      expect(container.textContent).toContain('5 min read');
      expect(container.textContent).toContain('Indexing…');

      const buttons = Array.from(container.querySelectorAll('button'));
      const updateBtn = buttons.find(b => b.textContent?.includes('Update'));
      const deleteBtn = buttons.find(b => b.textContent?.includes('Delete'));

      expect(updateBtn).toBeDefined();
      expect(deleteBtn).toBeDefined();
      expect(updateBtn?.className).toContain('flex-1');
      expect(deleteBtn?.className).toContain('flex-1');
      expect(updateBtn?.className).toContain('bg-cyan-700');
      expect(deleteBtn?.className).toContain('border-slate-200');

      act(() => {
        updateBtn?.click();
      });
      expect(onSaveOrUpdate).toHaveBeenCalledTimes(1);

      act(() => {
        deleteBtn?.click();
      });
      expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it('displays error banner and dismisses it', () => {
      const onDismissError = vi.fn();
      const root = createRoot(container);
      act(() => {
        root.render(
          React.createElement(ActiveTabBanner, {
            activeTabUrl: 'https://example.com/article-1',
            isSaving: false,
            saveError: 'Extraction failed: paywalled page',
            onSaveOrUpdate: vi.fn(),
            onRemove: vi.fn(),
            onDismissError,
          }),
        );
      });

      expect(container.textContent).toContain(
        'Extraction failed: paywalled page',
      );
      const dismissBtn = container.querySelector(
        'button[aria-label="Dismiss error"]',
      );
      expect(dismissBtn).not.toBeNull();

      act(() => {
        (dismissBtn as HTMLButtonElement).click();
      });
      expect(onDismissError).toHaveBeenCalledTimes(1);
    });
  });

  describe('DomainFilterPills', () => {
    it('renders All, Starred, and single Domain dropdown button', () => {
      const onSelectAll = vi.fn();
      const onToggleStarred = vi.fn();
      const onSelectDomain = vi.fn();

      const root = createRoot(container);
      act(() => {
        root.render(
          React.createElement(DomainFilterPills, {
            starredOnly: false,
            domainCounts: [
              { siteName: 'github.com', count: 4 },
              { siteName: 'docs.rs', count: 2 },
            ],
            onSelectAll,
            onToggleStarred,
            onSelectDomain,
          }),
        );
      });

      expect(container.textContent).toContain('All');
      expect(container.textContent).toContain('Starred');
      expect(container.textContent).toContain('Domain');
      // Initially, dropdown items are not rendered
      expect(container.textContent).not.toContain('github.com (4)');

      const buttons = Array.from(container.querySelectorAll('button'));
      const allBtn = buttons.find(b => b.textContent?.trim() === 'All');
      expect(allBtn?.className).toContain('bg-cyan-700');
      expect(allBtn?.className).toContain('text-white');

      const domainBtn = buttons.find(b => b.textContent?.includes('Domain'));
      expect(domainBtn).toBeDefined();

      // Click domain button to expand dropdown
      act(() => {
        domainBtn?.click();
      });

      expect(container.textContent).toContain('github.com');
      expect(container.textContent).toContain('(4)');
      expect(container.textContent).toContain('docs.rs');
      expect(container.textContent).toContain('(2)');

      // Select github.com
      const menuButtons = Array.from(container.querySelectorAll('button'));
      const githubOption = menuButtons.find(b =>
        b.textContent?.includes('github.com'),
      );
      act(() => {
        githubOption?.click();
      });

      expect(onSelectDomain).toHaveBeenCalledWith('github.com');
    });

    it('renders selected domain in active cyan pill style and allows clearing', () => {
      const onSelectDomain = vi.fn();
      const root = createRoot(container);

      act(() => {
        root.render(
          React.createElement(DomainFilterPills, {
            starredOnly: false,
            domainFilter: 'github.com',
            domainCounts: [
              { siteName: 'github.com', count: 4 },
              { siteName: 'docs.rs', count: 2 },
            ],
            onSelectAll: vi.fn(),
            onToggleStarred: vi.fn(),
            onSelectDomain,
          }),
        );
      });

      expect(container.textContent).toContain('github.com');
      const clearBtn = container.querySelector(
        'button[aria-label="Clear domain filter"]',
      );
      expect(clearBtn).not.toBeNull();

      act(() => {
        (clearBtn as HTMLButtonElement).click();
      });
      expect(onSelectDomain).toHaveBeenCalledWith('');
    });
  });

  describe('SearchResultCard', () => {
    it('renders favicon, siteName, date, excerpt, text-only match %, and no bestSnippet block', () => {
      const mockResult: SearchResultItem = {
        article: {
          id: 'art-1',
          url: 'https://github.com/features/actions',
          title: 'GitHub Actions Documentation',
          siteName: 'github.com',
          faviconUrl: 'https://github.com/favicon.ico',
          excerpt: 'Automate workflows and CI/CD directly inside your repo.',
          savedAt: Date.now(),
          updatedAt: Date.now(),
          readingTimeMinutes: 3,
          isStarred: true,
          status: 'indexed',
        },
        bestSnippet:
          'UNWANTED_RAW_SNIPPET: Custom workflows can be configured in yaml.',
        chunkIndex: 0,
        score: 0.88,
      };

      const onClick = vi.fn();
      const root = createRoot(container);

      act(() => {
        root.render(
          React.createElement(SearchResultCard, {
            result: mockResult,
            onClick,
          }),
        );
      });

      expect(container.textContent).toContain('GitHub Actions Documentation');
      expect(container.textContent).toContain('github.com');
      expect(container.textContent).toContain(
        'Automate workflows and CI/CD directly inside your repo.',
      );
      expect(container.textContent).toContain('88% match');
      // Should NOT contain the bestSnippet passage
      expect(container.textContent).not.toContain('UNWANTED_RAW_SNIPPET');

      // Favicon image exists
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toBe('https://github.com/favicon.ico');

      const card = container.querySelector('article');
      act(() => {
        card?.click();
      });
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('StorageFooter', () => {
    const mockQuotaStatus: StorageQuotaStatus = {
      currentUsageBytes: 15 * 1024 * 1024,
      indexedDBUsageBytes: 15 * 1024 * 1024,
      modelCacheUsageBytes: 0,
      maxStorageBytes: 50 * 1024 * 1024,
      browserQuotaBytes: 1024 * 1024 * 1024,
      freePhysicalDiskBytes: 10 * 1024 * 1024 * 1024,
      canSave: true,
      usageRatio: 0.3,
      isWarning: false,
      isExceeded: false,
      isLowPhysicalDisk: false,
      suggestedNewCapBytes: 100 * 1024 * 1024,
    };

    it('renders "Storage" label and button with "Configure Storage Limit" title', () => {
      const onOpenQuotaModal = vi.fn();
      const onOpenKnowledgeManager = vi.fn();
      const root = createRoot(container);

      act(() => {
        root.render(
          React.createElement(StorageFooter, {
            quotaStatus: mockQuotaStatus,
            articlesCount: 5,
            onOpenQuotaModal,
            onOpenKnowledgeManager,
          }),
        );
      });

      expect(container.textContent).toContain('Storage');
      expect(container.textContent).not.toContain('Storage Quota');

      const configButton = container.querySelector<HTMLButtonElement>(
        'button[title="Configure Storage Limit"]',
      );
      expect(configButton).not.toBeNull();
      expect(
        container.querySelector('button[title="Configure Storage Budget"]'),
      ).toBeNull();

      expect(container.textContent).toContain('15.0 MB / 50 MB limit');

      act(() => {
        configButton?.click();
      });
      expect(onOpenQuotaModal).toHaveBeenCalledTimes(1);
    });
  });

  describe('StorageQuotaModal', () => {
    const mockQuotaStatus: StorageQuotaStatus = {
      currentUsageBytes: 50 * 1024 * 1024,
      indexedDBUsageBytes: 50 * 1024 * 1024,
      modelCacheUsageBytes: 0,
      maxStorageBytes: 50 * 1024 * 1024,
      browserQuotaBytes: 1024 * 1024 * 1024,
      freePhysicalDiskBytes: 10 * 1024 * 1024 * 1024,
      canSave: false,
      usageRatio: 1.0,
      isWarning: true,
      isExceeded: true,
      isLowPhysicalDisk: false,
      suggestedNewCapBytes: 100 * 1024 * 1024,
    };

    it('renders "Storage Limit Reached" title and user-friendly labels without technical jargon', () => {
      const onClose = vi.fn();
      const onExpandCap = vi.fn();
      const onQuickCleanup = vi.fn();
      const onOpenKnowledgeManager = vi.fn();
      const setCustomCapMB = vi.fn();
      const root = createRoot(container);

      act(() => {
        root.render(
          React.createElement(StorageQuotaModal, {
            isOpen: true,
            onClose,
            quotaStatus: mockQuotaStatus,
            customCapMB: '100',
            setCustomCapMB,
            onExpandCap,
            onQuickCleanup,
            onOpenKnowledgeManager,
            quotaFeedback: null,
          }),
        );
      });

      expect(container.textContent).toContain('Storage Limit Reached');
      expect(container.textContent).not.toContain('Storage Quota Gatekeeper');

      expect(container.textContent).toContain('Using 50.0 MB of 50 MB limit');
      expect(container.textContent).not.toContain('approved cap');

      expect(container.textContent).toContain('Set a new storage limit (MB):');
      expect(container.textContent).not.toContain(
        'Set a new maximum local IndexedDB cap',
      );
    });
  });
});
