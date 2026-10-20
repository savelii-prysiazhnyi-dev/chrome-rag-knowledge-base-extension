import React from 'react';
import { Globe } from 'lucide-react';
import { formatShortDate } from '../../../lib/utils/format';
import type { SearchResultItem } from '../../../types/messages';

export interface SearchResultCardProps {
  result: SearchResultItem;
  onClick: () => void | Promise<void>;
}

export function SearchResultCard({
  result,
  onClick,
}: SearchResultCardProps): React.JSX.Element {
  const { article, bestSnippet, score } = result;

  return (
    <article
      onClick={() => void onClick()}
      className="group cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-2xs transition-all hover:border-indigo-300 hover:shadow-xs"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Globe className="h-3 w-3 shrink-0 text-slate-400" />
            <span className="truncate font-medium">{article.siteName}</span>
            <span>•</span>
            <span>{formatShortDate(article.savedAt)}</span>
          </div>
          <h3 className="mt-1 line-clamp-2 text-xs font-semibold text-slate-900 group-hover:text-indigo-600">
            {article.title}
          </h3>
        </div>
        <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
          {Math.round(score * 100)}% match
        </span>
      </div>

      <p className="mt-2 line-clamp-3 rounded border-l-2 border-indigo-400 bg-slate-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-600">
        {bestSnippet}
      </p>
    </article>
  );
}
