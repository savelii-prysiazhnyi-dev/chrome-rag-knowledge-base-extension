import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Star, X } from 'lucide-react';

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
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    if (!isDropdownOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDropdownOpen]);

  const hasDomains = domainCounts.length > 0;

  return (
    <div className="relative mt-2.5 flex items-center gap-1.5 pb-0.5">
      {/* All Articles Pill */}
      <button
        type="button"
        onClick={() => {
          setIsDropdownOpen(false);
          onSelectAll();
        }}
        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
          !starredOnly && !domainFilter
            ? 'bg-cyan-700 text-white shadow-2xs hover:bg-cyan-800'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
        }`}
      >
        All
      </button>

      {/* Starred Articles Pill */}
      <button
        type="button"
        onClick={() => {
          setIsDropdownOpen(false);
          onToggleStarred();
        }}
        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
          starredOnly
            ? 'bg-amber-500 text-white'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
        }`}
      >
        <Star
          className={`h-3 w-3 ${starredOnly ? 'fill-white text-white' : ''}`}
        />
        <span>Starred</span>
      </button>

      {/* Unified Domain Dropdown Button */}
      <div className="relative inline-block" ref={dropdownRef}>
        {domainFilter ? (
          <div className="inline-flex shrink-0 items-center overflow-hidden rounded-full bg-cyan-700 text-white shadow-2xs transition-colors hover:bg-cyan-800">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(prev => !prev)}
              className="inline-flex items-center gap-1 py-1 pr-1 pl-2.5 text-[11px] font-medium"
              title={`Filtering by ${domainFilter}. Click to switch domain.`}
            >
              <span className="max-w-[130px] truncate">{domainFilter}</span>
              <ChevronDown
                className={`h-3 w-3 text-cyan-100 transition-transform ${
                  isDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onSelectDomain('');
                setIsDropdownOpen(false);
              }}
              className="mr-1 rounded-full p-0.5 text-cyan-100 hover:bg-cyan-900/40 hover:text-white"
              title="Clear domain filter"
              aria-label="Clear domain filter"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={!hasDomains}
            onClick={() => setIsDropdownOpen(prev => !prev)}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              hasDomains
                ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                : 'cursor-not-allowed bg-slate-50 text-slate-400'
            }`}
            title={hasDomains ? 'Filter by domain' : 'No domains available yet'}
          >
            <span>Domain</span>
            <ChevronDown
              className={`h-3 w-3 text-slate-400 transition-transform ${
                isDropdownOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        )}

        {/* Dropdown Menu */}
        {isDropdownOpen && hasDomains && (
          <div className="absolute top-full left-0 z-30 mt-1 max-h-56 min-w-44 max-w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5">
            {domainFilter && (
              <button
                type="button"
                onClick={() => {
                  onSelectDomain('');
                  setIsDropdownOpen(false);
                }}
                className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-1.5 text-left text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <span>Clear domain filter</span>
                <X className="h-3 w-3 text-slate-400" />
              </button>
            )}
            {domainCounts.map(({ siteName, count }) => {
              const isSelected = domainFilter === siteName;
              return (
                <button
                  key={siteName}
                  type="button"
                  onClick={() => {
                    onSelectDomain(isSelected ? '' : siteName);
                    setIsDropdownOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors hover:bg-slate-100 hover:text-slate-900 ${
                    isSelected
                      ? 'bg-slate-100 font-medium text-slate-800'
                      : 'text-slate-700'
                  }`}
                >
                  <span className="truncate">{siteName}</span>
                  <span
                    className={`ml-2 shrink-0 text-[10px] ${
                      isSelected
                        ? 'font-medium text-slate-600'
                        : 'text-slate-400'
                    }`}
                  >
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
