import React from 'react';

export interface BulkCleanupDrawerProps {
  isOpen: boolean;
  cleanupAgeDays: string;
  setCleanupAgeDays: (val: string) => void;
  cleanupDomain: string;
  setCleanupDomain: (val: string) => void;
  domainCounts: Array<{ siteName: string; count: number }>;
  onRunCleanup: () => void | Promise<unknown>;
  onCancel: () => void;
}

export function BulkCleanupDrawer({
  isOpen,
  cleanupAgeDays,
  setCleanupAgeDays,
  cleanupDomain,
  setCleanupDomain,
  domainCounts,
  onRunCleanup,
  onCancel,
}: BulkCleanupDrawerProps): React.JSX.Element | null {
  if (!isOpen) return null;

  return (
    <div className="border-b border-slate-200 bg-amber-50/60 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
          <span className="font-semibold text-slate-900">
            Bulk Unstarred Cleanup:
          </span>
          <select
            value={cleanupAgeDays}
            onChange={e => setCleanupAgeDays(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs"
          >
            <option value="0">All ages</option>
            <option value="7">Older than 7 days</option>
            <option value="30">Older than 30 days</option>
            <option value="90">Older than 90 days</option>
          </select>
          <span>from</span>
          <select
            value={cleanupDomain}
            onChange={e => setCleanupDomain(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs"
          >
            <option value="all">All domains</option>
            {domainCounts.map(({ siteName }) => (
              <option key={siteName} value={siteName}>
                {siteName}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-slate-500">
            (Starred articles are strictly protected)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void onRunCleanup()}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
          >
            Purge Unstarred Articles
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
