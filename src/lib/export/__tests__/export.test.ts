import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import {
  buildJsonExportPayload,
  buildMarkdownZipArchive,
  formatArticleMarkdownWithFrontmatter,
  sanitizeExportFilename,
} from '../index';
import type {
  ArticleContentRecord,
  ArticleRecord,
} from '../../../types/messages';

const sampleArticle: ArticleRecord = {
  id: 'a1b2c3d4e5f600112233445566778899',
  url: 'https://go.dev/blog/race-detector',
  title: 'Introducing the Go Race Detector: A Guide!',
  byline: 'Dmitry Vyukov & Andrew Gerrand',
  excerpt: 'Race conditions are among the most insidious bugs.',
  siteName: 'go.dev',
  savedAt: Date.UTC(2026, 9, 14, 12, 0, 0),
  updatedAt: Date.UTC(2026, 9, 15, 8, 30, 0),
  readingTimeMinutes: 7,
  isStarred: true,
  status: 'indexed',
};

const sampleContent: ArticleContentRecord = {
  articleId: sampleArticle.id,
  contentText: 'Race conditions are among the most insidious bugs in Go.',
  contentMarkdown:
    '# Introducing the Go Race Detector\n\nRace conditions are among the most insidious bugs in `Go`.',
};

describe('export utilities (src/lib/export)', () => {
  it('formats article Markdown with YAML frontmatter and body', () => {
    const md = formatArticleMarkdownWithFrontmatter(
      sampleArticle,
      sampleContent,
    );

    expect(md).toContain('---\n');
    expect(md).toContain(
      'title: "Introducing the Go Race Detector: A Guide!"\n',
    );
    expect(md).toContain('url: "https://go.dev/blog/race-detector"\n');
    expect(md).toContain('siteName: "go.dev"\n');
    expect(md).toContain('byline: "Dmitry Vyukov & Andrew Gerrand"\n');
    expect(md).toContain('savedAt: "2026-10-14T12:00:00.000Z"\n');
    expect(md).toContain('updatedAt: "2026-10-15T08:30:00.000Z"\n');
    expect(md).toContain('readingTimeMinutes: 7\n');
    expect(md).toContain('isStarred: true\n');
    expect(md).toContain('# Introducing the Go Race Detector');
  });

  it('falls back to contentText or excerpt when contentMarkdown is empty', () => {
    const textOnly = formatArticleMarkdownWithFrontmatter(sampleArticle, {
      articleId: sampleArticle.id,
      contentText: 'Plain text fallback body.',
      contentMarkdown: '',
    });
    expect(textOnly).toContain('Plain text fallback body.');

    const excerptOnly = formatArticleMarkdownWithFrontmatter(sampleArticle);
    expect(excerptOnly).toContain(
      'Race conditions are among the most insidious bugs.',
    );
  });

  it('sanitizes export filenames into clean slugs with 8-char ID suffix', () => {
    const filename = sanitizeExportFilename(
      sampleArticle.title,
      sampleArticle.id,
    );
    expect(filename).toBe(
      'introducing-the-go-race-detector-a-guide-a1b2c3d4.md',
    );

    const fallbackFilename = sanitizeExportFilename('!!!', '');
    expect(fallbackFilename).toBe('untitled-00000000.md');
  });

  it('builds a valid .zip archive containing Markdown files and index.json', () => {
    const zipBytes = buildMarkdownZipArchive([
      { article: sampleArticle, content: sampleContent },
    ]);

    expect(zipBytes).toBeInstanceOf(Uint8Array);
    expect(zipBytes.byteLength).toBeGreaterThan(0);

    const unzipped = unzipSync(zipBytes);
    const expectedFilename =
      'introducing-the-go-race-detector-a-guide-a1b2c3d4.md';

    expect(Object.keys(unzipped)).toContain(expectedFilename);
    expect(Object.keys(unzipped)).toContain('index.json');

    const mdContent = strFromU8(unzipped[expectedFilename] as Uint8Array);
    expect(mdContent).toContain('# Introducing the Go Race Detector');

    const manifest = JSON.parse(
      strFromU8(unzipped['index.json'] as Uint8Array),
    ) as {
      totalArticles: number;
      articles: Array<{ id: string; fileName: string }>;
    };
    expect(manifest.totalArticles).toBe(1);
    expect(manifest.articles[0]?.id).toBe(sampleArticle.id);
    expect(manifest.articles[0]?.fileName).toBe(expectedFilename);
  });

  it('builds a structured JSON export payload with metadata, content, and chunkCount', () => {
    const jsonString = buildJsonExportPayload([
      { article: sampleArticle, content: sampleContent, chunkCount: 5 },
    ]);

    const parsed = JSON.parse(jsonString) as {
      version: string;
      totalArticles: number;
      articles: Array<{
        id: string;
        chunkCount: number;
        contentMarkdown: string;
        contentText: string;
      }>;
    };

    expect(parsed.version).toBe('1.0.0');
    expect(parsed.totalArticles).toBe(1);
    expect(parsed.articles[0]?.id).toBe(sampleArticle.id);
    expect(parsed.articles[0]?.chunkCount).toBe(5);
    expect(parsed.articles[0]?.contentMarkdown).toContain(
      '# Introducing the Go Race Detector',
    );
    expect(parsed.articles[0]?.contentText).toBe(sampleContent.contentText);
  });
});
