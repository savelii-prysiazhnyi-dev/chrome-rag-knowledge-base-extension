import React, { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { formatArticleMarkdownWithFrontmatter } from '../../../lib/export';
import { formatDate } from '../../../lib/utils/format';
import type {
  ArticleContentRecord,
  ArticleRecord,
} from '../../../types/messages';

export interface MarkdownPreviewModalProps {
  article: ArticleRecord | null;
  content: ArticleContentRecord | undefined;
  isLoading: boolean;
  onClose: () => void;
}

export function MarkdownPreviewModal({
  article,
  content,
  isLoading,
  onClose,
}: MarkdownPreviewModalProps): React.JSX.Element | null {
  const [copied, setCopied] = useState(false);

  if (!article) return null;

  const markdownText = formatArticleMarkdownWithFrontmatter(article, content);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdownText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[MarkdownPreviewModal] Copy failed:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {article.title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {article.siteName} • Saved {formatDate(article.savedAt)} •{' '}
              {article.readingTimeMinutes} min read
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleCopy()}
              disabled={isLoading}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
              title="Copy Markdown with YAML frontmatter"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-slate-500" />
                  <span>Copy</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <p className="text-xs text-slate-500">
              Loading partitioned Markdown from IndexedDB…
            </p>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-700">
              {markdownText}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
