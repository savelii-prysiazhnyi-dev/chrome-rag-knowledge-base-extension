import React, { useCallback, useState } from 'react';
import { AlertTriangle, Link2, X } from 'lucide-react';
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
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopyUrl = useCallback(async () => {
    if (!activeTabUrl) return;
    try {
      await navigator.clipboard.writeText(activeTabUrl);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.warn('Failed to copy active tab URL', err);
    }
  }, [activeTabUrl]);

  return (
    <div className="mt-2.5 flex flex-col gap-2">
      {/* Active Tab Link & Copy Component */}
      <button
        type="button"
        onClick={() => void handleCopyUrl()}
        disabled={!activeTabUrl}
        className="group flex w-full items-center justify-between gap-2 rounded-full border border-slate-200 bg-slate-50/80 px-2.5 py-1 text-left text-xs transition-colors hover:border-slate-300 hover:bg-slate-100/70 disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:bg-slate-50/80"
        title={activeTabUrl ? 'Click to copy page URL' : undefined}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-cyan-700" />
          <span className="truncate font-mono text-[11px] text-slate-600">
            {activeTabUrl || 'No active web page'}
          </span>
        </div>
        {copied && (
          <span className="shrink-0 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-semibold text-cyan-800">
            Copied!
          </span>
        )}
      </button>

      {/* De-unified Status & Actions Row */}
      <div className="flex items-center justify-between gap-2">
        {/* Status part */}
        <div className="flex min-w-0 items-center gap-1.5">
          {savedArticle ? (
            <>
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
              <span className="truncate text-xs text-slate-700">
                <span className="font-medium text-slate-900">
                  Saved in Second Brain
                </span>
                <span className="text-slate-500">
                  {' • '}
                  {savedArticle.readingTimeMinutes} min read
                  {savedArticle.status === 'indexing' ? ' • Indexing…' : ''}
                </span>
              </span>
            </>
          ) : (
            <>
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-400" />
              <span className="text-xs font-medium text-slate-700">
                Not saved yet
              </span>
            </>
          )}
        </div>

        {/* Action Buttons part: simple, text-only */}
        <div className="flex shrink-0 items-center gap-1.5">
          {savedArticle ? (
            <>
              <button
                type="button"
                onClick={() => void onSaveOrUpdate()}
                disabled={isSaving}
                className="rounded-md bg-cyan-700 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-cyan-800 disabled:opacity-50"
                title="Update article in Second Brain"
              >
                {isSaving ? 'Updating...' : 'Update'}
              </button>
              <button
                type="button"
                onClick={() => void onRemove()}
                disabled={isSaving}
                className="rounded px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                title="Delete from Second Brain"
              >
                Delete
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void onSaveOrUpdate()}
              disabled={isSaving || !activeTabUrl}
              className="rounded-md bg-cyan-700 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-cyan-800 disabled:opacity-50"
              title="Remember article in Second Brain"
            >
              {isSaving ? 'Saving...' : 'Remember'}
            </button>
          )}
        </div>
      </div>

      {/* Save Error Dismiss Banner */}
      {saveError && (
        <div className="mt-0.5 flex items-start justify-between gap-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] text-rose-700">
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
