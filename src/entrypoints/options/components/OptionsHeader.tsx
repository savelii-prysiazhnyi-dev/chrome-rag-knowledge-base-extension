import React from 'react';
import { Brain, Database, FileArchive } from 'lucide-react';

export interface OptionsHeaderProps {
  articlesCount: number;
  isExporting: boolean;
  onExportMarkdownZip: () => void | Promise<void>;
  onExportJson: () => void | Promise<void>;
}

export function OptionsHeader({
  articlesCount,
  isExporting,
  onExportMarkdownZip,
  onExportJson,
}: OptionsHeaderProps): React.JSX.Element {
  return (
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
            onClick={() => void onExportMarkdownZip()}
            disabled={articlesCount === 0 || isExporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
          >
            <FileArchive className="h-4 w-4 text-indigo-600" />
            <span>Export Markdown (.zip)</span>
          </button>
          <button
            type="button"
            onClick={() => void onExportJson()}
            disabled={articlesCount === 0 || isExporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
          >
            <Database className="h-4 w-4 text-indigo-600" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>
    </header>
  );
}
