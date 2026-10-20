import React from 'react';
import { Sparkles } from 'lucide-react';
import type { SearchResultItem } from '../../../types/messages';

export interface RelatedArticlesStripProps {
  relatedArticles: SearchResultItem[];
  onArticleClick: (url: string, snippet?: string) => void | Promise<void>;
}

export function RelatedArticlesStrip({
  relatedArticles,
  onArticleClick,
}: RelatedArticlesStripProps): React.JSX.Element | null {
  if (relatedArticles.length === 0) return null;

  return (
    <div className="mt-2.5 rounded-lg border border-indigo-100 bg-indigo-50/60 p-2">
      <div className="flex items-center gap-1 text-[10px] font-semibold tracking-wide text-indigo-700 uppercase">
        <Sparkles className="h-3 w-3" />
        <span>Related Past Reading</span>
      </div>
      <div className="mt-1.5 flex flex-col gap-1">
        {relatedArticles.map(({ article, bestSnippet, score }) => (
          <button
            key={article.id}
            type="button"
            onClick={() => void onArticleClick(article.url, bestSnippet)}
            className="flex items-center justify-between gap-2 rounded bg-white/90 px-2 py-1 text-left text-[11px] text-slate-700 shadow-2xs transition-colors hover:bg-white hover:text-indigo-700"
          >
            <span className="truncate font-medium">{article.title}</span>
            <span className="shrink-0 text-[10px] text-slate-400">
              {article.siteName} • {Math.round(score * 100)}%
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
