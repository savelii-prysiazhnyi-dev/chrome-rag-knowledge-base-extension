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
  const { article, score } = result;

  return (
    <article
      onClick={() => void onClick()}
      className="group cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-2xs transition-all hover:border-slate-300 hover:bg-slate-50/30 hover:shadow-xs"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            {article.faviconUrl ? (
              <img
                src={article.faviconUrl}
                alt=""
                className="h-3.5 w-3.5 shrink-0 rounded-xs"
              />
            ) : (
              <Globe className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            )}
            <span className="truncate font-medium text-slate-600">
              {article.siteName}
            </span>
            <span>•</span>
            <span className="shrink-0">{formatShortDate(article.savedAt)}</span>
          </div>
          <h3 className="mt-1 line-clamp-2 text-xs font-semibold text-slate-800 transition-colors group-hover:text-slate-900">
            {article.title}
          </h3>
        </div>
        <span className="shrink-0 text-[11px] font-semibold text-cyan-700">
          {Math.round(score * 100)}% match
        </span>
      </div>

      {article.excerpt && (
        <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
          {article.excerpt}
        </p>
      )}
    </article>
  );
}
