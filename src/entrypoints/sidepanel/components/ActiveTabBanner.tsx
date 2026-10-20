import React from 'react';
import {
  AlertTriangle,
  BookmarkPlus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { formatShortDate } from '../../../lib/utils/format';
import type { ArticleRecord } from '../../../types/messages';

export interface ActiveTabBannerProps {
  savedArticle?: ArticleRecord;
  activeTabUrl: string;
  isSaving: boolean;
  saveError: string | null;
  onSaveOrUpdate: () => void | Promise<void>;
  onRemove: () => void | Promise<void>;
  onDismissError: () => void;
}

export function ActiveTabBanner({
  savedArticle,
  activeTabUrl,
  isSaving,
  saveError,
  onSaveOrUpdate,
  onRemove,
  onDismissError,
}: ActiveTabBannerProps): React.JSX.Element {
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      {savedArticle ? (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
              <span className="truncate text-xs font-semibold text-slate-800">
                Saved in Second Brain
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              Saved {formatShortDate(savedArticle.savedAt)} •{' '}
              {savedArticle.readingTimeMinutes} min read
              {savedArticle.status === 'indexing' ? ' • Indexing…' : ''}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => void onSaveOrUpdate()}
              disabled={isSaving}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 shadow-2xs transition-colors hover:bg-slate-100 disabled:opacity-50"
              title="Re-extract and update this article"
            >
              <RefreshCw
                className={`h-3 w-3 ${isSaving ? 'animate-spin' : ''}`}
              />
              <span>{isSaving ? 'Updating...' : 'Update'}</span>
            </button>
            <button
              type="button"
              onClick={() => void onRemove()}
              disabled={isSaving}
              className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
              title="Remove from Second Brain"
            >
              <Trash2 className="h-3 w-3" />
              <span>Remove</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-400" />
              <span className="text-xs font-medium text-slate-700">
                Not saved yet
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              {activeTabUrl || 'No active web page'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void onSaveOrUpdate()}
            disabled={isSaving}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            <BookmarkPlus className="h-3.5 w-3.5" />
            <span>{isSaving ? 'Saving...' : 'Remember'}</span>
            <kbd className="hidden rounded bg-indigo-700 px-1 py-0.5 text-[9px] font-semibold text-indigo-100 sm:inline">
              Alt+S
            </kbd>
          </button>
        </div>
      )}

      {saveError && (
        <div className="mt-2 flex items-start justify-between gap-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700">
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
            <span>{saveError}</span>
          </div>
          <button
            type="button"
            onClick={onDismissError}
            className="text-rose-500 hover:text-rose-700"
            aria-label="Dismiss error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
