import React, { useState } from 'react';
import {
  Brain,
  HardDrive,
  Download,
  FileArchive,
  Database,
  Search,
  Trash2,
  Star,
  ShieldCheck,
} from 'lucide-react';

export default function App(): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState('all');
  const [starredOnly, setStarredOnly] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Top Navigation */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
              <Brain className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">
                Second Brain — Knowledge Manager
              </h1>
              <p className="text-xs text-slate-500">
                Local-first semantic knowledge base, storage budget, and exports
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900"
            >
              <FileArchive className="h-4 w-4 text-slate-500" />
              <span>Export Markdown (.zip)</span>
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900"
            >
              <Database className="h-4 w-4 text-slate-500" />
              <span>Export JSON</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Storage Budget Overview Card */}
        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <HardDrive className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  User-Controlled Storage Quota
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  100% on-device IndexedDB storage. By default, Second Brain is
                  capped at a strict 50 MB budget (~1,000–1,500 articles).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Default Baseline Cap: 50 MB</span>
              </span>
            </div>
          </div>

          {/* Quota Progress Bar */}
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-slate-600">
                Current Usage:{' '}
                <strong className="text-slate-900">0.0 MB</strong> of{' '}
                <strong>50 MB</strong> cap
              </span>
              <span className="text-slate-400">0.0% utilized</span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{ width: '0%' }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
              <span>0 articles indexed</span>
              <span>
                Safety threshold: Warns at 85% • Pauses saves at 100% to request
                expansion
              </span>
            </div>
          </div>
        </section>

        {/* Knowledge Base Articles Table Section */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-xs">
          {/* Table Controls Bar */}
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-3">
              <div className="relative max-w-sm flex-1">
                <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Filter articles by title, domain, or concept..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <select
                value={selectedDomain}
                onChange={e => setSelectedDomain(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 focus:border-indigo-500 focus:bg-white focus:outline-hidden"
              >
                <option value="all">All Domains</option>
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
                  className={`h-3.5 w-3.5 ${starredOnly ? 'fill-amber-400 text-amber-400' : ''}`}
                />
                <span>Starred Only</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-400 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Bulk Cleanup</span>
              </button>
            </div>
          </div>

          {/* Table Layout */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th scope="col" className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      disabled
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
                  <th scope="col" className="w-20 px-4 py-3 font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                        <Download className="h-6 w-6" />
                      </div>
                      <h3 className="mt-3 text-sm font-semibold text-slate-800">
                        No Articles Indexed Yet
                      </h3>
                      <p className="mt-1 max-w-sm text-xs text-slate-500">
                        Your Second Brain is ready. Start browsing articles on
                        the web and click{' '}
                        <strong className="text-slate-700">Remember</strong> or
                        press{' '}
                        <kbd className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                          Alt+S
                        </kbd>{' '}
                        to index content locally.
                      </p>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
