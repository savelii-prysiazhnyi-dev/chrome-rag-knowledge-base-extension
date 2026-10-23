import React from 'react';
import { ExternalLink, HardDrive, Trash2, X } from 'lucide-react';
import { formatBytesToMB } from '../../../lib/utils/format';
import type { StorageQuotaStatus } from '../../../types/messages';

export interface StorageQuotaModalProps {
  isOpen: boolean;
  onClose: () => void;
  quotaStatus: StorageQuotaStatus | null;
  customCapMB: string;
  setCustomCapMB: (value: string) => void;
  onExpandCap: () => void | Promise<void>;
  onQuickCleanup: () => void | Promise<void>;
  onOpenKnowledgeManager: () => void;
  quotaFeedback: string | null;
}

export function StorageQuotaModal({
  isOpen,
  onClose,
  quotaStatus,
  customCapMB,
  setCustomCapMB,
  onExpandCap,
  onQuickCleanup,
  onOpenKnowledgeManager,
  quotaFeedback,
}: StorageQuotaModalProps): React.JSX.Element | null {
  if (!isOpen) return null;

  const usageMB = quotaStatus
    ? formatBytesToMB(
        quotaStatus.indexedDBUsageBytes ?? quotaStatus.currentUsageBytes,
      )
    : '0.0';
  const maxMB = quotaStatus
    ? Math.round(quotaStatus.maxStorageBytes / (1024 * 1024))
    : 50;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <HardDrive className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Storage Quota Gatekeeper
              </h2>
              <p className="text-[11px] text-slate-500">
                Using {usageMB} MB of {maxMB} MB approved cap
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {quotaStatus?.isLowPhysicalDisk && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-700">
            <strong>Low Physical Disk Space:</strong> Less than 500 MB free on
            your hard drive. Quota expansion is blocked until disk space is
            freed.
          </div>
        )}

        {/* Option 1: Allocate More Disk Space */}
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <h3 className="text-xs font-semibold text-slate-800">
            1. Allocate Additional Disk Space
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Set a new maximum local IndexedDB cap (MB):
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={10}
              max={10240}
              value={customCapMB}
              onChange={e => setCustomCapMB(e.target.value)}
              disabled={Boolean(quotaStatus?.isLowPhysicalDisk)}
              className="w-24 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-cyan-600 focus:outline-hidden disabled:opacity-50"
            />
            <span className="text-xs text-slate-500">MB</span>
            <button
              type="button"
              onClick={() => void onExpandCap()}
              disabled={Boolean(quotaStatus?.isLowPhysicalDisk)}
              className="ml-auto rounded-md bg-cyan-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-800 disabled:opacity-50"
            >
              Expand Storage Limit
            </button>
          </div>
        </div>

        {/* Option 2: Clean Up Existing Space */}
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <h3 className="text-xs font-semibold text-slate-800">
            2. Clean Up Existing Articles
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Starred articles are always protected from bulk cleanup.
          </p>
          <div className="mt-2 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => void onQuickCleanup()}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              <Trash2 className="h-3.5 w-3.5 text-rose-500" />
              <span>Purge Unstarred Older Than 30 Days</span>
            </button>
            <button
              type="button"
              onClick={onOpenKnowledgeManager}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-cyan-700 hover:bg-cyan-50"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Open Full-Screen Knowledge Manager</span>
            </button>
          </div>
        </div>

        {quotaFeedback && (
          <p className="mt-2 text-center text-[11px] font-medium text-cyan-800">
            {quotaFeedback}
          </p>
        )}
      </div>
    </div>
  );
}
