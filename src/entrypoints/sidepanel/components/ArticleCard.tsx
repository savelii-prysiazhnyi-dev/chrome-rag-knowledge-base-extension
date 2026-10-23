import React from 'react';
import { Clock, Globe, Star, Trash2 } from 'lucide-react';
import { formatShortDate } from '../../../lib/utils/format';
import type { ArticleRecord } from '../../../types/messages';

export interface ArticleCardProps {
  article: ArticleRecord;
  onClick: () => void | Promise<void>;
  onToggleStar: (e: React.MouseEvent) => void | Promise<unknown>;
  onDelete: (e: React.MouseEvent) => void | Promise<void>;
}

export function ArticleCard({
  article,
  onClick,
  onToggleStar,
  onDelete,
}: ArticleCardProps): React.JSX.Element {
  return (
    <article
      onClick={() => void onClick()}
      className="group cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-2xs transition-all hover:border-slate-300 hover:shadow-xs"
    >
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <div className="flex min-w-0 items-center gap-1.5">
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
          <span>•</span>
          <span className="inline-flex shrink-0 items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {article.readingTimeMinutes}m
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {article.status !== 'indexed' && (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                article.status === 'indexing'
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-rose-50 text-rose-700'
              }`}
            >
              {article.status}
            </span>
          )}
          <button
            type="button"
            onClick={e => void onToggleStar(e)}
            className={`rounded p-1 transition-colors ${
              article.isStarred
                ? 'text-amber-500 hover:bg-amber-50'
                : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
            }`}
            title={
              article.isStarred
                ? 'Unstar article'
                : 'Star article (protects from bulk cleanup)'
            }
          >
            <Star
              className={`h-3.5 w-3.5 ${
                article.isStarred ? 'fill-amber-400' : ''
              }`}
            />
          </button>
          <button
            type="button"
            onClick={e => void onDelete(e)}
            className="rounded p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
            title="Delete article"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <h3 className="mt-1.5 line-clamp-2 text-xs font-semibold text-slate-900 group-hover:text-cyan-700">
        {article.title}
      </h3>

      {article.excerpt && (
        <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
          {article.excerpt}
        </p>
      )}
    </article>
  );
}
