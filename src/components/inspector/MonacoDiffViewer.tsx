import React from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { FileCode, Check, RotateCcw } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { invoke } from '@tauri-apps/api/core';

function getMonacoLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'rs':
      return 'rust';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'json':
      return 'json';
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
      return 'css';
    case 'py':
      return 'python';
    case 'md':
      return 'markdown';
    case 'sql':
      return 'sql';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'shell';
    case 'toml':
      return 'ini';
    case 'xml':
    case 'svg':
      return 'xml';
    default:
      return 'plaintext';
  }
}

export function MonacoDiffViewer() {
  const { t } = useI18n();
  const { resolvedTheme } = useThemeStore();
  const { modifiedFiles, activeDiffFile, setActiveDiffFile, setModifiedFiles } =
    useWorkspaceStore();

  const handleSelectFile = (file: typeof activeDiffFile) => {
    setActiveDiffFile(file);
  };

  const handleRevertFile = async () => {
    if (!activeDiffFile) return;
    try {
      if (activeDiffFile.original_content) {
        await invoke('write_file_content', {
          filePath: activeDiffFile.path,
          content: activeDiffFile.original_content,
        });
      }
      // Remove from modified list
      const remaining = modifiedFiles.filter((f) => f.path !== activeDiffFile.path);
      setModifiedFiles(remaining);
      setActiveDiffFile(remaining[0] || null);
    } catch (e) {
      console.error('Failed to revert file:', e);
    }
  };

  const handleAcceptFile = () => {
    if (!activeDiffFile) return;
    const remaining = modifiedFiles.filter((f) => f.path !== activeDiffFile.path);
    setModifiedFiles(remaining);
    setActiveDiffFile(remaining[0] || null);
  };

  if (!activeDiffFile || modifiedFiles.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500">
        <FileCode className="w-12 h-12 mb-3 text-zinc-300 dark:text-zinc-700 stroke-1" />
        <div className="font-semibold text-zinc-700 dark:text-zinc-400">{t.inspector.noDiffs}</div>
        <p className="text-xs text-zinc-500 dark:text-zinc-600 mt-1 max-w-xs leading-relaxed">
          {t.inspector.noDiffsDesc}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#1e1e1e] select-text">
      {/* File Selector Tab Strip */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-xs">
        <div className="flex items-center gap-2 overflow-x-auto max-w-[70%]">
          {modifiedFiles.map((file) => {
            const isSelected = activeDiffFile.path === file.path;
            const name = file.path.split(/[/\\]/).pop();
            return (
              <button
                key={file.path}
                onClick={() => handleSelectFile(file)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition ${
                  isSelected
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 shadow-2xs'
                    : 'text-zinc-600 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <FileCode className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span className="truncate max-w-[120px]">{name}</span>
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRevertFile}
            className="h-7 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 border-red-300 dark:border-red-500/30 gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            {t.inspector.revertBtn}
          </Button>
          <Button
            variant="purple"
            size="sm"
            onClick={handleAcceptFile}
            className="h-7 text-xs gap-1"
          >
            <Check className="w-3 h-3" />
            {t.inspector.acceptBtn}
          </Button>
        </div>
      </div>

      {/* Path Breadcrumb */}
      <div className="px-4 py-1.5 bg-zinc-50 dark:bg-zinc-950/70 border-b border-zinc-200 dark:border-zinc-800/80 text-[11px] font-mono text-zinc-600 dark:text-zinc-400 truncate">
        {activeDiffFile.path}
      </div>

      {/* Monaco Diff Viewer */}
      <div className="flex-1 w-full relative">
        <DiffEditor
          height="100%"
          language={getMonacoLanguage(activeDiffFile.path)}
          original={activeDiffFile.original_content || ''}
          modified={activeDiffFile.modified_content || ''}
          theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
          options={{
            readOnly: true,
            renderSideBySide: true,
            minimap: { enabled: false },
            fontSize: 12,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}
