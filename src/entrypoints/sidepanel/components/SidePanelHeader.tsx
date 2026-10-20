import React from 'react';
import { Brain, ExternalLink } from 'lucide-react';

export interface SidePanelHeaderProps {
  onOpenKnowledgeManager: () => void;
}

export function SidePanelHeader({
  onOpenKnowledgeManager,
}: SidePanelHeaderProps): React.JSX.Element {
  return (
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
        onClick={onOpenKnowledgeManager}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        title="Open Full-Screen Knowledge Manager"
      >
        <span>Manager</span>
        <ExternalLink className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
