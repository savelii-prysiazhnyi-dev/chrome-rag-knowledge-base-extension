import React, { useState, useEffect } from 'react';
import {
  Brain,
  Search,
  BookmarkPlus,
  ExternalLink,
  Star,
  HardDrive,
  Download,
  BookOpen,
} from 'lucide-react';
import type { TabStatusResponse } from '../../types/messages';

export default function App(): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'starred'>('all');
  const [activeTabUrl, setActiveTabUrl] = useState<string>('');
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    // Check active tab on load
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query(
        { active: true, currentWindow: true },
        (tabs: chrome.tabs.Tab[]) => {
          const currentTab = tabs[0];
          if (currentTab?.url) {
            setActiveTabUrl(currentTab.url);
            // Query background for tab status
            if (chrome.runtime?.sendMessage) {
              chrome.runtime.sendMessage(
                { type: 'CHECK_TAB_STATUS', payload: { url: currentTab.url } },
                (response: TabStatusResponse | undefined) => {
                  if (response) {
                    setIsSaved(Boolean(response.isSaved));
                  }
                },
              );
            }
          }
        },
      );
    }
  }, []);

  const handleRememberCurrentTab = () => {
    setIsSaving(true);
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'INDEX_CURRENT_TAB' }, () => {
        setTimeout(() => {
          setIsSaving(false);
        }, 600);
      });
    } else {
      setTimeout(() => setIsSaving(false), 600);
    }
  };

  const handleOpenKnowledgeManager = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  };

  return (
    <div className="flex h-screen w-full flex-col bg-slate-50 text-slate-800">
      {/* Top Header */}
      <header className="border-b border-slate-200 bg-white px-4 py-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-slate-900">
                Second Brain
              </h1>
              <p className="text-[11px] text-slate-500">Local RAG Assistant</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleOpenKnowledgeManager}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            title="Open Full-Screen Knowledge Manager"
          >
            <span className="hidden sm:inline">Manager</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Active Tab Status Banner */}
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    isSaved ? 'bg-emerald-500' : 'bg-amber-400'
                  }`}
                />
                <span className="text-xs font-medium text-slate-700">
                  {isSaved ? 'Saved in Second Brain' : 'Not saved yet'}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">
                {activeTabUrl || 'No active web page'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleRememberCurrentTab}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-xs transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
              <span>{isSaving ? 'Saving...' : 'Remember'}</span>
              <kbd className="hidden rounded bg-indigo-700 px-1 py-0.2 text-[9px] font-semibold text-indigo-100 sm:inline">
                Alt+S
              </kbd>
            </button>
          </div>
        </div>
      </header>

      {/* Search & Filter Bar */}
      <div className="border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by concept or keyword..."
            className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-9 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Filter Pills */}
        <div className="mt-2.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter('starred')}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === 'starred'
                ? 'bg-amber-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            <Star className="h-3 w-3" />
            <span>Starred</span>
          </button>
        </div>
      </div>

      {/* Main Content Feed Area (Empty-state placeholder for Phase 1) */}
      <main className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <BookOpen className="h-6 w-6" />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-slate-800">
          Your Second Brain is Empty
        </h3>
        <p className="mt-1.5 max-w-xs text-xs text-slate-500">
          Navigate to an interesting article, documentation, or discussion, and
          click <span className="font-semibold text-indigo-600">Remember</span>{' '}
          or press{' '}
          <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] font-medium text-slate-700">
            Alt+S
          </kbd>{' '}
          to index it locally.
        </p>
      </main>

      {/* Footer Storage Quota Dashboard */}
      <footer className="border-t border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <HardDrive className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-medium">Storage Quota</span>
          </div>
          <span className="text-[11px] text-slate-500">
            0.0 MB / 50 MB limit
          </span>
        </div>

        {/* Storage Bar */}
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all"
            style={{ width: '0%' }}
          />
        </div>

        <div className="mt-2.5 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">0% utilized</span>
          <button
            type="button"
            onClick={handleOpenKnowledgeManager}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
          >
            <Download className="h-3 w-3" />
            <span>Export Data</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
