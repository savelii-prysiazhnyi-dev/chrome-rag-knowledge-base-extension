import React from 'react';
import { ExternalLink, FileText, Globe, Star, Trash2 } from 'lucide-react';
import { formatDate } from '../../../lib/utils/format';
import type { ArticleRecord } from '../../../types/messages';

export interface ArticleTableRowProps {
  article: ArticleRecord;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onToggleStar: (id: string) => void | Promise<void>;
  onOpenPreview: (article: ArticleRecord) => void;
  onDelete: (id: string) => void | Promise<void>;
}

export function ArticleTableRow({
  article,
  isSelected,
  onToggleSelect,
  onToggleStar,
  onOpenPreview,
  onDelete,
}: ArticleTableRowProps): React.JSX.Element {
  return (
    <tr
      className={`transition-colors hover:bg-slate-50 ${
        isSelected ? 'bg-indigo-50/40' : ''
      }`}
    >
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(article.id)}
          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
      </td>
      <td className="max-w-md px-4 py-3">
        <div className="flex items-start gap-2.5">
          {article.faviconUrl ? (
            <img
              src={article.faviconUrl}
              alt=""
              className="mt-0.5 h-4 w-4 shrink-0 rounded-xs"
            />
          ) : (
            <Globe className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          )}
          <div className="min-w-0">
            <a
              href={article.url}
              target="_blank"
              rel="noreferrer"
              className="line-clamp-1 font-semibold text-slate-900 hover:text-indigo-600"
            >
              {article.title}
            </a>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="font-medium text-slate-600">
                {article.siteName}
              </span>
              {article.byline && (
                <>
                  <span>•</span>
                  <span className="truncate">{article.byline}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
        {formatDate(article.savedAt)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
        {article.readingTimeMinutes} min read
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
            article.status === 'indexed'
              ? 'bg-emerald-50 text-emerald-700'
              : article.status === 'indexing'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-rose-50 text-rose-700'
          }`}
        >
          {article.status}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => void onToggleStar(article.id)}
            className={`rounded p-1.5 transition-colors ${
              article.isStarred
                ? 'text-amber-500 hover:bg-amber-50'
                : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
            }`}
            title={article.isStarred ? 'Unstar article' : 'Star article'}
          >
            <Star
              className={`h-4 w-4 ${article.isStarred ? 'fill-amber-400' : ''}`}
            />
          </button>
          <button
            type="button"
            onClick={() => onOpenPreview(article)}
            className="rounded p-1.5 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"
            title="Read Distilled Markdown"
          >
            <FileText className="h-4 w-4" />
          </button>
          <a
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            title="Open original URL"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={() => void onDelete(article.id)}
            className="rounded p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
            title="Delete article"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
