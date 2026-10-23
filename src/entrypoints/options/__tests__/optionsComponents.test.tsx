// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { OptionsHeader } from '../components/OptionsHeader';
import { StorageOverviewCard } from '../components/StorageOverviewCard';
import { ArticlesTable } from '../components/ArticlesTable';
import { ArticleTableRow } from '../components/ArticleTableRow';
import { MarkdownPreviewModal } from '../components/MarkdownPreviewModal';
import type {
  ArticleRecord,
  ArticleContentRecord,
  StorageQuotaStatus,
} from '../../../types/messages';

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('Options Modernized Components', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    container.remove();
  });

  describe('OptionsHeader', () => {
    it('renders "Second Brain — Full Library", updated subtitle, and cyan export icons without Brain icon container', () => {
      const onExportZip = vi.fn();
      const onExportJson = vi.fn();
      const root = createRoot(container);

      act(() => {
        root.render(
          React.createElement(OptionsHeader, {
            articlesCount: 5,
            isExporting: false,
            onExportMarkdownZip: onExportZip,
            onExportJson: onExportJson,
          }),
        );
      });

      expect(container.textContent).toContain('Second Brain — Full Library');
      expect(container.textContent).toContain(
        'Semantic knowledge base in your browser, storage budget, and exports',
      );
      expect(container.textContent).not.toContain('Knowledge Manager');
      expect(container.innerHTML).not.toContain('bg-indigo-600');

      const buttons = Array.from(container.querySelectorAll('button'));
      expect(buttons).toHaveLength(2);

      const zipBtn = buttons[0];
      const jsonBtn = buttons[1];
      expect(zipBtn).toBeDefined();
      expect(jsonBtn).toBeDefined();
      if (!zipBtn || !jsonBtn) return;

      expect(zipBtn.textContent).toContain('Export Markdown (.zip)');
      expect(jsonBtn.textContent).toContain('Export JSON');

      const zipIcon = zipBtn.querySelector('svg');
      const jsonIcon = jsonBtn.querySelector('svg');
      expect(zipIcon?.getAttribute('class')).toContain('text-cyan-700');
      expect(jsonIcon?.getAttribute('class')).toContain('text-cyan-700');

      act(() => {
        zipBtn.click();
      });
      expect(onExportZip).toHaveBeenCalledTimes(1);

      act(() => {
        jsonBtn.click();
      });
      expect(onExportJson).toHaveBeenCalledTimes(1);
    });
  });

  describe('StorageOverviewCard', () => {
    const mockQuotaStatus: StorageQuotaStatus = {
      currentUsageBytes: 10 * 1024 * 1024,
      indexedDBUsageBytes: 10 * 1024 * 1024,
      modelCacheUsageBytes: 24 * 1024 * 1024,
      maxStorageBytes: 50 * 1024 * 1024,
      browserQuotaBytes: 1024 * 1024 * 1024,
      freePhysicalDiskBytes: 10 * 1024 * 1024 * 1024,
      canSave: true,
      usageRatio: 0.2,
      isWarning: false,
      isExceeded: false,
      isLowPhysicalDisk: false,
      suggestedNewCapBytes: 100 * 1024 * 1024,
    };

    it('renders clean title, subtitle, progress bar, presets, and save limit button without technical jargon', () => {
      const onSaveCap = vi.fn();
      const setCapInputMB = vi.fn();
      const root = createRoot(container);

      act(() => {
        root.render(
          React.createElement(StorageOverviewCard, {
            quotaStatus: mockQuotaStatus,
            articlesCount: 12,
            totalChunks: 60,
            capInputMB: '50',
            setCapInputMB,
            onSaveCap,
          }),
        );
      });

      // Title & Subtitle
      expect(container.textContent).toContain('Storage Usage');
      expect(container.textContent).not.toContain(
        'User-Controlled Storage Quota',
      );
      expect(container.textContent).toContain(
        'All saved articles and search data are stored locally on your device.',
      );
      expect(container.textContent).not.toContain('IndexedDB');
      expect(container.textContent).not.toContain('strict 50 MB budget');

      // Jargon and redundant badge removed
      expect(container.textContent).not.toContain('Approved Cap');
      expect(container.textContent).not.toContain('On-Device AI Model Cache');
      expect(container.textContent).not.toContain('384-d Float32Array');
      expect(container.textContent).not.toContain('Safety threshold');

      const iconBox = container.querySelector('.rounded-xl.bg-cyan-50');
      expect(iconBox).not.toBeNull();
      expect(iconBox?.className).toContain('text-cyan-700');

      // Progress bar has bg-cyan-700
      const progressBar = container.querySelector('.bg-cyan-700.rounded-full');
      expect(progressBar).not.toBeNull();

      // Progress bar details
      expect(container.textContent).toContain(
        'Current Usage: 10.0 MB of 50 MB limit',
      );
      expect(container.textContent).toContain('20% used');
      expect(container.textContent).not.toContain('utilized');
      expect(container.textContent).toContain('12 saved articles');

      // Preset limits & Custom limit
      expect(container.textContent).toContain('Preset limits:');
      expect(container.textContent).not.toContain('Quick Cap Presets:');
      expect(container.textContent).toContain('Custom limit (MB):');

      // Active preset button for 50 MB
      const buttons = Array.from(container.querySelectorAll('button'));
      const activePreset = buttons.find(b => b.textContent?.trim() === '50 MB');
      expect(activePreset).toBeDefined();
      expect(activePreset?.className).toContain('bg-cyan-700');
      expect(activePreset?.className).toContain('text-white');
      expect(activePreset?.className).toContain('hover:bg-cyan-800');

      // Save limit button
      const saveLimitBtn = buttons.find(
        b => b.textContent?.trim() === 'Save limit',
      );
      expect(saveLimitBtn).toBeDefined();
      expect(saveLimitBtn?.className).toContain('bg-cyan-700');
      expect(saveLimitBtn?.className).toContain('hover:bg-cyan-800');
      expect(saveLimitBtn?.className).toContain('text-white');
      expect(buttons.some(b => b.textContent?.trim() === 'Save Cap')).toBe(
        false,
      );

      // Custom Limit input has conservative slate focus
      const customInput = container.querySelector('#custom-cap-input');
      expect(customInput?.className).toContain('focus:border-slate-400');
      expect(customInput?.className).toContain('focus:ring-slate-300/60');
      expect(customInput?.className).not.toContain('focus:border-indigo-500');

      act(() => {
        saveLimitBtn?.click();
      });
      expect(onSaveCap).toHaveBeenCalledTimes(1);
    });

    it('renders singular saved article count correctly', () => {
      const root = createRoot(container);
      act(() => {
        root.render(
          React.createElement(StorageOverviewCard, {
            quotaStatus: mockQuotaStatus,
            articlesCount: 1,
            capInputMB: '50',
            setCapInputMB: vi.fn(),
            onSaveCap: vi.fn(),
          }),
        );
      });
      expect(container.textContent).toContain('1 saved article');
      expect(container.textContent).not.toContain('1 saved articles');
    });
  });

  describe('ArticlesTable', () => {
    const mockArticles: ArticleRecord[] = [
      {
        id: 'art-1',
        url: 'https://example.com/art-1',
        title: 'Article 1',
        excerpt: 'Test excerpt',
        siteName: 'example.com',
        savedAt: Date.now(),
        updatedAt: Date.now(),
        readingTimeMinutes: 3,
        isStarred: false,
        status: 'indexed',
      },
    ];

    it('renders conservative input/select focus styles and cyan master checkbox', () => {
      const onToggleSelectAll = vi.fn();
      const root = createRoot(container);

      act(() => {
        root.render(
          React.createElement(ArticlesTable, {
            articles: mockArticles,
            filteredArticles: mockArticles,
            domainCounts: [{ siteName: 'example.com', count: 1 }],
            searchQuery: '',
            setSearchQuery: vi.fn(),
            selectedDomain: 'all',
            setSelectedDomain: vi.fn(),
            starredOnly: false,
            setStarredOnly: vi.fn(),
            selectedIds: new Set<string>(),
            allVisibleSelected: false,
            onToggleSelectAll,
            onToggleSelectRow: vi.fn(),
            onDeleteSelected: vi.fn(),
            isBulkCleanupOpen: false,
            onToggleBulkCleanup: vi.fn(),
            cleanupAgeDays: '0',
            setCleanupAgeDays: vi.fn(),
            cleanupDomain: 'all',
            setCleanupDomain: vi.fn(),
            onRunBulkCleanup: vi.fn(),
            onCloseBulkCleanup: vi.fn(),
            onToggleStar: vi.fn(),
            onOpenPreview: vi.fn(),
            onDeleteArticle: vi.fn(),
          }),
        );
      });

      const searchInput = container.querySelector('input[type="text"]');
      expect(searchInput?.className).toContain('focus:border-slate-400');
      expect(searchInput?.className).toContain('focus:ring-slate-300/60');
      expect(searchInput?.className).not.toContain('focus:border-indigo-500');

      const domainSelect = container.querySelector('select');
      expect(domainSelect?.className).toContain('focus:border-slate-400');
      expect(domainSelect?.className).not.toContain('focus:border-indigo-500');

      const masterCheckbox = container.querySelector(
        'thead input[type="checkbox"]',
      );
      expect(masterCheckbox?.className).toContain('text-cyan-700');
      expect(masterCheckbox?.className).toContain('focus:ring-cyan-600');
      expect(masterCheckbox?.className).not.toContain('text-indigo-600');

      act(() => {
        (masterCheckbox as HTMLInputElement).click();
      });
      expect(onToggleSelectAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('ArticleTableRow', () => {
    const mockArticle: ArticleRecord = {
      id: 'art-1',
      url: 'https://example.com/art-1',
      title: 'Article 1',
      excerpt: 'Test excerpt',
      siteName: 'example.com',
      savedAt: Date.now(),
      updatedAt: Date.now(),
      readingTimeMinutes: 4,
      isStarred: false,
      status: 'indexed',
    };

    it('renders cyan-50/30 when selected, cyan checkbox, conservative title hover, and conservative preview hover', () => {
      const onOpenPreview = vi.fn();
      const onToggleSelect = vi.fn();
      const root = createRoot(container);

      act(() => {
        root.render(
          React.createElement(
            'table',
            null,
            React.createElement(
              'tbody',
              null,
              React.createElement(ArticleTableRow, {
                article: mockArticle,
                isSelected: true,
                onToggleSelect,
                onToggleStar: vi.fn(),
                onOpenPreview,
                onDelete: vi.fn(),
              }),
            ),
          ),
        );
      });

      const tr = container.querySelector('tr');
      expect(tr?.className).toContain('bg-cyan-50/30');
      expect(tr?.className).not.toContain('bg-indigo-50/40');

      const checkbox = container.querySelector('input[type="checkbox"]');
      expect(checkbox?.className).toContain('text-cyan-700');
      expect(checkbox?.className).toContain('focus:ring-cyan-600');

      const titleLink = container.querySelector('a');
      expect(titleLink?.className).toContain('hover:text-slate-900');
      expect(titleLink?.className).not.toContain('hover:text-indigo-600');

      const previewBtn = container.querySelector(
        'button[title="Read Distilled Markdown"]',
      );
      expect(previewBtn?.className).toContain('hover:bg-slate-100');
      expect(previewBtn?.className).toContain('hover:text-slate-800');
      expect(previewBtn?.className).not.toContain('hover:bg-indigo-50');

      act(() => {
        (previewBtn as HTMLButtonElement).click();
      });
      expect(onOpenPreview).toHaveBeenCalledWith(mockArticle);
    });
  });

  describe('MarkdownPreviewModal', () => {
    const mockArticle: ArticleRecord = {
      id: 'art-1',
      url: 'https://example.com/art-1',
      title: 'Article 1',
      excerpt: 'Test excerpt',
      siteName: 'example.com',
      savedAt: 1700000000000,
      updatedAt: 1700000000000,
      readingTimeMinutes: 2,
      isStarred: false,
      status: 'indexed',
    };

    const mockContent: ArticleContentRecord = {
      articleId: 'art-1',
      contentMarkdown: '# Test content\n\nThis is a test article.',
      contentText: 'Test content This is a test article.',
    };

    it('renders conservative slate hover styles on copy and close buttons', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const onClose = vi.fn();
      const root = createRoot(container);

      act(() => {
        root.render(
          React.createElement(MarkdownPreviewModal, {
            article: mockArticle,
            content: mockContent,
            isLoading: false,
            onClose,
          }),
        );
      });

      const copyBtn = container.querySelector(
        'button[title="Copy Markdown with YAML frontmatter"]',
      );
      expect(copyBtn?.className).toContain('hover:bg-slate-50');
      expect(copyBtn?.className).toContain('hover:text-slate-900');

      const closeBtn = container.querySelector(
        'button[aria-label="Close modal"]',
      );
      expect(closeBtn?.className).toContain('hover:bg-slate-100');
      expect(closeBtn?.className).toContain('hover:text-slate-700');

      await act(async () => {
        (copyBtn as HTMLButtonElement).click();
      });

      expect(writeTextMock).toHaveBeenCalledTimes(1);
      expect(copyBtn?.textContent).toContain('Copied');

      act(() => {
        (closeBtn as HTMLButtonElement).click();
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
