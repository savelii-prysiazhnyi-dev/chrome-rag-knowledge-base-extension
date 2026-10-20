import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';
import TurndownService from 'turndown';

export interface DistilledDocument {
  title: string;
  byline?: string;
  siteName: string;
  excerpt: string;
  textContent: string;
  markdown: string;
  wordCount: number;
  readingTimeMinutes: number;
}

export type DistillFailureCode = 'NOT_READABLE' | 'TOO_SHORT';

export type DistillResult =
  | { ok: true; data: DistilledDocument }
  | { ok: false; error: DistillFailureCode };

export interface DistillOptions {
  minWords?: number;
}

const WORDS_PER_MINUTE = 200;

/**
 * Extracts the main article from a document without mutating it:
 * clone -> Readability -> DOMPurify -> Turndown.
 */
export function distillDocument(
  doc: Document,
  url: string,
  options: DistillOptions = {},
): DistillResult {
  const minWords = options.minWords ?? 50;
  const clone = doc.cloneNode(true) as Document;

  let article: ReturnType<Readability['parse']>;
  try {
    article = new Readability(clone).parse();
  } catch {
    return { ok: false, error: 'NOT_READABLE' };
  }
  if (!article || !article.content) return { ok: false, error: 'NOT_READABLE' };

  const cleanHtml = DOMPurify.sanitize(article.content, {
    FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed'],
  });

  const container = doc.implementation.createHTMLDocument('');
  container.body.innerHTML = cleanHtml;
  const textContent = (container.body.textContent ?? '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();

  const wordCount = textContent.split(/\s+/).filter(Boolean).length;
  if (wordCount < minWords) return { ok: false, error: 'TOO_SHORT' };

  const markdown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  })
    .turndown(cleanHtml)
    .trim();

  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    /* ignore */
  }

  return {
    ok: true,
    data: {
      title: (article.title || doc.title || host).trim(),
      byline: article.byline?.trim() || undefined,
      siteName: article.siteName?.trim() || host,
      excerpt: (article.excerpt?.trim() || textContent.slice(0, 200)).slice(
        0,
        300,
      ),
      textContent,
      markdown,
      wordCount,
      readingTimeMinutes: Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE)),
    },
  };
}
