import React, { useState, useEffect } from 'react';
import {
  ListTodo,
  FileCode2,
  FolderArchive,
  Terminal,
  X,
  FileText,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useI18n } from '@/i18n';
import { PlanReviewer } from './PlanReviewer';
import { MonacoDiffViewer } from './MonacoDiffViewer';
import { RawLogsViewer } from './RawLogsViewer';
import { MarkdownRenderer } from '@/components/canvas/MarkdownRenderer';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

export function InspectorDrawer() {
  const { t } = useI18n();

  const {
    inspectorTab,
    setInspectorTab,
    toggleInspector,
    isInspectorFullscreen,
    toggleInspectorFullscreen,
    modifiedFiles,
    planArtifact,
    artifacts,
  } = useWorkspaceStore();

  const { rawLogs, rawTranscriptText } = useSessionStore();

  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(null);

  // Press ESC to exit fullscreen mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isInspectorFullscreen) {
        toggleInspectorFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isInspectorFullscreen, toggleInspectorFullscreen]);

  const rawCount = rawTranscriptText
    ? rawTranscriptText.split('\n').filter((l) => l.trim()).length
    : rawLogs.length;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800/80">
      {/* Header Tabs */}
      <div
        onDoubleClick={(e) => {
          if (!(e.target as HTMLElement).closest('button, a, input, [role="button"]')) {
            toggleInspectorFullscreen();
          }
        }}
        className="h-10 flex items-center justify-between px-2.5 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/80 dark:bg-zinc-900/50 shrink-0 select-none cursor-default"
      >
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 min-w-0">
          {/* Plan Review Tab */}
          <button
            onClick={() => setInspectorTab('plan')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer shrink-0 whitespace-nowrap ${
              inspectorTab === 'plan'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-zinc-700/60 shadow-2xs'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <ListTodo className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span>{t.inspector.planTab}</span>
            {planArtifact && (
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 dark:bg-purple-400" />
            )}
          </button>

          {/* Diffs Tab */}
          <button
            onClick={() => setInspectorTab('diff')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer shrink-0 whitespace-nowrap ${
              inspectorTab === 'diff'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-zinc-700/60 shadow-2xs'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <FileCode2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{t.inspector.diffsTab}</span>
            {modifiedFiles.length > 0 && (
              <Badge variant="success" className="text-[10px] px-1.5 py-0 h-4">
                {modifiedFiles.length}
              </Badge>
            )}
          </button>

          {/* Artifacts Tab */}
          <button
            onClick={() => setInspectorTab('artifacts')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer shrink-0 whitespace-nowrap ${
              inspectorTab === 'artifacts'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-zinc-700/60 shadow-2xs'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <FolderArchive className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>{t.inspector.artifactsTab}</span>
            {artifacts.length > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                {artifacts.length}
              </Badge>
            )}
          </button>

          {/* Raw CLI Output Tab */}
          <button
            onClick={() => setInspectorTab('raw_logs')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer shrink-0 whitespace-nowrap ${
              inspectorTab === 'raw_logs'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-zinc-700/60 shadow-2xs'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            <span>{t.inspector.rawLogsTab}</span>
            {rawCount > 0 && (
              <span className="text-[10px] px-1.5 py-0 bg-zinc-200/80 dark:bg-zinc-800 rounded font-mono text-zinc-600 dark:text-zinc-400">
                {rawCount}
              </span>
            )}
          </button>
        </div>

        {/* Right action buttons: Fullscreen Toggle & Close Button */}
        <div className="flex items-center gap-0.5 shrink-0 ml-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => toggleInspectorFullscreen()}
            className="h-7 w-7 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 shrink-0 cursor-pointer"
            title={isInspectorFullscreen ? t.inspector.restoreInspector : t.inspector.maximizeInspector}
          >
            {isInspectorFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => toggleInspector(false)}
            className="h-7 w-7 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 shrink-0 cursor-pointer"
            title={t.inspector.closeInspector}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Tab Body */}
      <div className="flex-1 overflow-hidden">
        {inspectorTab === 'plan' && <PlanReviewer />}
        {inspectorTab === 'diff' && <MonacoDiffViewer />}
        {inspectorTab === 'raw_logs' && <RawLogsViewer />}
        {inspectorTab === 'artifacts' && (
          <div className="h-full flex flex-col p-4 space-y-3 overflow-y-auto">
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {t.inspector.artifactsTitle}
            </div>
            <div className="space-y-1.5">
              {artifacts.map((art) => (
                <div
                  key={art.name}
                  onClick={() =>
                    setSelectedArtifact(selectedArtifact === art.name ? null : art.name)
                  }
                  className={`p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                    selectedArtifact === art.name
                      ? 'bg-purple-50 text-purple-900 border-purple-300 dark:bg-purple-950/30 dark:border-purple-500/40 dark:text-purple-200'
                      : 'bg-zinc-50 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800/80 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <FileText className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                    <span>{art.name}</span>
                  </div>
                  {selectedArtifact === art.name && (
                    <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                      <MarkdownRenderer content={art.content} />
                    </div>
                  )}
                </div>
              ))}
              {artifacts.length === 0 && (
                <div className="text-center py-8 text-xs text-zinc-500 dark:text-zinc-600">
                  {t.inspector.noArtifacts}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

