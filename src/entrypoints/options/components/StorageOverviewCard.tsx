import React from 'react';
import { HardDrive } from 'lucide-react';
import { formatBytesToMB } from '../../../lib/utils/format';
import type { StorageQuotaStatus } from '../../../types/messages';

const CAP_PRESETS_MB = [50, 100, 250, 500, 1024];

export interface StorageOverviewCardProps {
  quotaStatus: StorageQuotaStatus | null;
  articlesCount: number;
  totalChunks?: number;
  capInputMB: string;
  setCapInputMB: (val: string) => void;
  onSaveCap: (targetMB?: number) => void | Promise<void>;
}

export function StorageOverviewCard({
  quotaStatus,
  articlesCount,
  capInputMB,
  setCapInputMB,
  onSaveCap,
}: StorageOverviewCardProps): React.JSX.Element {
  const usageMB = quotaStatus
    ? formatBytesToMB(
        quotaStatus.indexedDBUsageBytes ?? quotaStatus.currentUsageBytes,
      )
    : '0.0';
  const maxMB = quotaStatus
    ? Math.round(quotaStatus.maxStorageBytes / (1024 * 1024))
    : 50;
  const usagePercent = quotaStatus
    ? Math.min(100, Number((quotaStatus.usageRatio * 100).toFixed(1)))
    : 0;
  const barColor = quotaStatus?.isExceeded
    ? 'bg-rose-600'
    : quotaStatus?.isWarning
      ? 'bg-amber-500'
      : 'bg-cyan-700';

  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
          <HardDrive className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Storage Usage
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            All saved articles and search data are stored locally on your
            device.
          </p>
        </div>
      </div>

      {/* Quota Progress Bar */}
      <div className="mt-6">
        <div className="flex items-center justify-between text-xs font-medium">
          <span className="text-slate-600">
            Current Usage:{' '}
            <strong className="text-slate-900">{usageMB} MB</strong> of{' '}
            <strong>{maxMB} MB</strong> limit
          </span>
          <span className="text-slate-500">{usagePercent}% used</span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${usagePercent}%` }}
          />
        </div>
        <div className="mt-2 text-[11px] text-slate-500">
          <strong>{articlesCount}</strong> saved article
          {articlesCount === 1 ? '' : 's'}
        </div>
      </div>

      {/* Storage Cap Editor */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-slate-600">
            Preset limits:
          </span>
          {CAP_PRESETS_MB.map(preset => (
            <button
              key={preset}
              type="button"
              disabled={Boolean(quotaStatus?.isLowPhysicalDisk)}
              onClick={() => void onSaveCap(preset)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                maxMB === preset
                  ? 'bg-cyan-700 text-white hover:bg-cyan-800'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              } disabled:opacity-50`}
            >
              {preset >= 1024 ? '1 GB' : `${preset} MB`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="custom-cap-input"
            className="text-xs font-medium text-slate-600"
          >
            Custom limit (MB):
          </label>
          <input
            id="custom-cap-input"
            type="number"
            min={10}
            max={10240}
            value={capInputMB}
            onChange={e => setCapInputMB(e.target.value)}
            disabled={Boolean(quotaStatus?.isLowPhysicalDisk)}
            className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-slate-400 focus:bg-white focus:ring-1 focus:ring-slate-300/60 focus:outline-hidden"
          />
          <button
            type="button"
            disabled={Boolean(quotaStatus?.isLowPhysicalDisk)}
            onClick={() => void onSaveCap()}
            className="rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-800 disabled:opacity-50"
          >
            Save limit
          </button>
        </div>
      </div>
    </section>
  );
}
