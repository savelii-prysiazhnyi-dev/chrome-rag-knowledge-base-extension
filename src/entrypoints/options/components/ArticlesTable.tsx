import React from 'react';
import { Download, Search, Star, Trash2 } from 'lucide-react';
import { ArticleTableRow } from './ArticleTableRow';
import { BulkCleanupDrawer } from './BulkCleanupDrawer';
import type { ArticleRecord } from '../../../types/messages';

export interface ArticlesTableProps {
  articles: ArticleRecord[];
  filteredArticles: ArticleRecord[];
  domainCounts: Array<{ siteName: string; count: number }>;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  selectedDomain: string;
  setSelectedDomain: (val: string) => void;
  starredOnly: boolean;
  setStarredOnly: (val: boolean) => void;
  selectedIds: Set<string>;
  allVisibleSelected: boolean;
  onToggleSelectAll: () => void;
  onToggleSelectRow: (id: string) => void;
  onDeleteSelected: () => void | Promise<void>;
  isBulkCleanupOpen: boolean;
  onToggleBulkCleanup: () => void;
  cleanupAgeDays: string;
  setCleanupAgeDays: (val: string) => void;
  cleanupDomain: string;
  setCleanupDomain: (val: string) => void;
  onRunBulkCleanup: () => void | Promise<unknown>;
  onCloseBulkCleanup: () => void;
  onToggleStar: (id: string) => void | Promise<void>;
  onOpenPreview: (article: ArticleRecord) => void;
  onDeleteArticle: (id: string) => void | Promise<void>;
}

export function ArticlesTable({
  articles,
  filteredArticles,
  domainCounts,
  searchQuery,
  setSearchQuery,
  selectedDomain,
  setSelectedDomain,
  starredOnly,
  setStarredOnly,
  selectedIds,
  allVisibleSelected,
  onToggleSelectAll,
  onToggleSelectRow,
  onDeleteSelected,
  isBulkCleanupOpen,
  onToggleBulkCleanup,
  cleanupAgeDays,
  setCleanupAgeDays,
  cleanupDomain,
  setCleanupDomain,
  onRunBulkCleanup,
  onCloseBulkCleanup,
  onToggleStar,
  onOpenPreview,
  onDeleteArticle,
}: ArticlesTableProps): React.JSX.Element {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
      {/* Table Controls Bar */}
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] max-w-sm flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filter articles by title, domain, or concept..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
            />
          </div>

          <select
            value={selectedDomain}
            onChange={e => setSelectedDomain(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:border-indigo-500 focus:bg-white focus:outline-hidden"
          >
            <option value="all">All Domains ({articles.length})</option>
            {domainCounts.map(({ siteName, count }) => (
              <option key={siteName} value={siteName}>
                {siteName} ({count})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setStarredOnly(!starredOnly)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              starredOnly
                ? 'border-amber-400 bg-amber-50 text-amber-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Star
              className={`h-3.5 w-3.5 ${
                starredOnly ? 'fill-amber-400 text-amber-400' : ''
              }`}
            />
            <span>Starred Only</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => void onDeleteSelected()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white shadow-xs hover:bg-rose-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete Selected ({selectedIds.size})</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleBulkCleanup}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Trash2 className="h-3.5 w-3.5 text-slate-500" />
            <span>Bulk Cleanup</span>
          </button>
        </div>
      </div>

      {/* Bulk Unstarred Cleanup Drawer */}
      <BulkCleanupDrawer
        isOpen={isBulkCleanupOpen}
        cleanupAgeDays={cleanupAgeDays}
        setCleanupAgeDays={setCleanupAgeDays}
        cleanupDomain={cleanupDomain}
        setCleanupDomain={setCleanupDomain}
        domainCounts={domainCounts}
        onRunCleanup={onRunBulkCleanup}
        onCancel={onCloseBulkCleanup}
      />

      {/* Table Layout */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <tr>
              <th scope="col" className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  disabled={filteredArticles.length === 0}
                  onChange={onToggleSelectAll}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Article Title & Domain
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Saved Date
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Reading Time
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Status
              </th>
              <th
                scope="col"
                className="w-36 px-4 py-3 text-right font-semibold"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredArticles.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <Download className="h-6 w-6" />
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-slate-800">
                      {articles.length === 0
                        ? 'No Articles Indexed Yet'
                        : 'No Articles Match Your Filter'}
                    </h3>
                    <p className="mt-1 max-w-sm text-xs text-slate-500">
                      {articles.length === 0 ? (
                        <>
                          Your Second Brain is ready. Start browsing articles on
                          the web and click{' '}
                          <strong className="text-slate-700">Remember</strong>{' '}
                          or press{' '}
                          <kbd className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                            Alt+S
                          </kbd>{' '}
                          to index content locally.
                        </>
                      ) : (
                        'Try clearing your search text, domain dropdown, or Starred filter.'
                      )}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredArticles.map(article => (
                <ArticleTableRow
                  key={article.id}
                  article={article}
                  isSelected={selectedIds.has(article.id)}
                  onToggleSelect={onToggleSelectRow}
                  onToggleStar={onToggleStar}
                  onOpenPreview={onOpenPreview}
                  onDelete={onDeleteArticle}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
