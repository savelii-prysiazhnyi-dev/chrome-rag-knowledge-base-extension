import React from 'react';
import { Star } from 'lucide-react';

export interface DomainFilterPillsProps {
  starredOnly: boolean;
  domainFilter?: string;
  domainCounts: Array<{ siteName: string; count: number }>;
  onSelectAll: () => void;
  onToggleStarred: () => void;
  onSelectDomain: (domain: string) => void;
}

export function DomainFilterPills({
  starredOnly,
  domainFilter,
  domainCounts,
  onSelectAll,
  onToggleStarred,
  onSelectDomain,
}: DomainFilterPillsProps): React.JSX.Element {
  return (
    <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-0.5">
      <button
        type="button"
        onClick={onSelectAll}
        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
          !starredOnly && !domainFilter
            ? 'bg-slate-900 text-white'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
        }`}
      >
        All
      </button>
      <button
        type="button"
        onClick={onToggleStarred}
        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
          starredOnly
            ? 'bg-amber-500 text-white'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
        }`}
      >
        <Star
          className={`h-3 w-3 ${starredOnly ? 'fill-white text-white' : ''}`}
        />
        <span>Starred</span>
      </button>

      {domainCounts.map(({ siteName, count }) => {
        const isActive = domainFilter === siteName;
        return (
          <button
            key={siteName}
            type="button"
            onClick={() => onSelectDomain(siteName)}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              isActive
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            <span>{siteName}</span>
            <span
              className={`text-[10px] ${
                isActive ? 'text-indigo-200' : 'text-slate-400'
              }`}
            >
              ({count})
            </span>
          </button>
        );
      })}
    </div>
  );
}
