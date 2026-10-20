import { strToU8, zipSync } from 'fflate';
import type { ArticleContentRecord, ArticleRecord } from '../../types/messages';

export interface ExportArchiveItem {
  article: ArticleRecord;
  content?: ArticleContentRecord;
  chunkCount?: number;
}

function escapeYamlString(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * Formats an article and its partitioned content into a standalone Markdown document
 * with structured YAML frontmatter.
 */
export function formatArticleMarkdownWithFrontmatter(
  article: ArticleRecord,
  content?: ArticleContentRecord,
): string {
  const savedAtIso = new Date(article.savedAt).toISOString();
  const updatedAtIso = new Date(article.updatedAt).toISOString();
  const lines: string[] = [
    '---',
    `title: ${escapeYamlString(article.title || 'Untitled')}`,
    `url: ${escapeYamlString(article.url)}`,
    `siteName: ${escapeYamlString(article.siteName || '')}`,
  ];

  if (article.byline) {
    lines.push(`byline: ${escapeYamlString(article.byline)}`);
  }

  lines.push(
    `savedAt: "${savedAtIso}"`,
    `updatedAt: "${updatedAtIso}"`,
    `readingTimeMinutes: ${article.readingTimeMinutes}`,
    `isStarred: ${article.isStarred}`,
    '---',
    '',
  );

  const body = (
    content?.contentMarkdown ||
    content?.contentText ||
    article.excerpt ||
    ''
  ).trim();

  return `${lines.join('\n')}${body}\n`;
}

/**
 * Produces a filesystem-safe slug filename `${slug}-${id.slice(0, 8)}.md`.
 */
export function sanitizeExportFilename(title: string, id: string): string {
  const rawSlug = (title || 'untitled')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');

  const slug = rawSlug || 'untitled';
  const shortId = (id || '00000000')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 8)
    .toLowerCase();

  return `${slug}-${shortId || '00000000'}.md`;
}

/**
 * Builds an in-memory .zip archive containing one Markdown (.md) file per article
 * with YAML frontmatter plus an index.json manifest.
 */
export function buildMarkdownZipArchive(
  items: ExportArchiveItem[],
): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const manifestArticles: Array<{
    id: string;
    fileName: string;
    title: string;
    url: string;
    siteName: string;
    savedAt: string;
    isStarred: boolean;
  }> = [];

  for (const { article, content } of items) {
    const fileName = sanitizeExportFilename(article.title, article.id);
    const markdown = formatArticleMarkdownWithFrontmatter(article, content);
    files[fileName] = strToU8(markdown);
    manifestArticles.push({
      id: article.id,
      fileName,
      title: article.title,
      url: article.url,
      siteName: article.siteName,
      savedAt: new Date(article.savedAt).toISOString(),
      isStarred: article.isStarred,
    });
  }

  const indexManifest = {
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
    totalArticles: items.length,
    articles: manifestArticles,
  };

  files['index.json'] = strToU8(`${JSON.stringify(indexManifest, null, 2)}\n`);

  return zipSync(files, { level: 6 });
}

/**
 * Builds a structured JSON backup string containing full article metadata and content.
 */
export function buildJsonExportPayload(items: ExportArchiveItem[]): string {
  const payload = {
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
    totalArticles: items.length,
    articles: items.map(({ article, content, chunkCount }) => ({
      ...article,
      chunkCount: chunkCount ?? 0,
      contentText: content?.contentText ?? '',
      contentMarkdown: content?.contentMarkdown ?? '',
    })),
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}

/**
 * Triggers a browser file download from binary bytes or string content.
 */
export function triggerBrowserDownload(
  data: Uint8Array | string,
  filename: string,
  mimeType: string,
): void {
  const blobPart: BlobPart =
    typeof data === 'string'
      ? data
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
  const blob = new Blob([blobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
