import React from 'react';
import { Download, HardDrive } from 'lucide-react';
import { formatBytesToMB } from '../../../lib/utils/format';
import type { StorageQuotaStatus } from '../../../types/messages';

export interface StorageFooterProps {
  quotaStatus: StorageQuotaStatus | null;
  articlesCount: number;
  onOpenQuotaModal: () => void;
  onOpenKnowledgeManager: () => void;
}

export function StorageFooter({
  quotaStatus,
  articlesCount,
  onOpenQuotaModal,
  onOpenKnowledgeManager,
}: StorageFooterProps): React.JSX.Element {
  const usageMB = quotaStatus
    ? formatBytesToMB(
        quotaStatus.indexedDBUsageBytes ?? quotaStatus.currentUsageBytes,
      )
    : '0.0';
  const maxMB = quotaStatus
    ? Math.round(quotaStatus.maxStorageBytes / (1024 * 1024))
    : 50;
  const usagePercent = quotaStatus
    ? Math.min(100, Math.round(quotaStatus.usageRatio * 100))
    : 0;
  const quotaBarColor = quotaStatus?.isExceeded
    ? 'bg-rose-600'
    : quotaStatus?.isWarning
      ? 'bg-amber-500'
      : 'bg-cyan-700';

  return (
    <footer className="border-t border-slate-200 bg-white px-4 py-3">
      {quotaStatus?.isWarning && (
        <div className="mb-2 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
          <span className="font-medium">
            Storage {usagePercent}% full ({usageMB} / {maxMB} MB)
          </span>
          <button
            type="button"
            onClick={onOpenQuotaModal}
            className="font-semibold text-amber-900 underline hover:text-amber-700"
          >
            Manage
          </button>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-600">
        <button
          type="button"
          onClick={onOpenQuotaModal}
          className="flex items-center gap-1.5 hover:text-slate-900"
          title="Configure Storage Limit"
        >
          <HardDrive className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-medium">Storage</span>
        </button>
        <span className="text-[11px] text-slate-500">
          {usageMB} MB / {maxMB} MB limit
        </span>
      </div>

      {/* Storage Bar */}
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${quotaBarColor}`}
          style={{ width: `${usagePercent}%` }}
        />
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-[11px] text-slate-400">
          {usagePercent}% utilized ({articlesCount} articles)
        </span>
        <button
          type="button"
          onClick={onOpenKnowledgeManager}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-700 hover:text-cyan-800"
        >
          <Download className="h-3 w-3" />
          <span>Export Data</span>
        </button>
      </div>
    </footer>
  );
}
