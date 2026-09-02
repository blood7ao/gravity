import React, { useState, useMemo, useRef, useEffect } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { FileCode, Check, RotateCcw, Copy } from 'lucide-react';
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
  const { activeProject, modifiedFiles, activeDiffFile, setActiveDiffFile, setModifiedFiles } =
    useWorkspaceStore();

  const [copiedPath, setCopiedPath] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayPath = useMemo(() => {
    if (!activeDiffFile) return '';
    const projPath = activeProject?.path || '';
    if (projPath && activeDiffFile.path.startsWith(projPath)) {
      const remaining = activeDiffFile.path.slice(projPath.length);
      if (remaining === '' || remaining.startsWith('/') || remaining.startsWith('\\')) {
        return remaining.replace(/^[/\\]/, '');
      }
    }
    return activeDiffFile.path;
  }, [activeDiffFile, activeProject?.path]);

  const handleCopyPath = async () => {
    if (!activeDiffFile) return;
    try {
      await navigator.clipboard.writeText(activeDiffFile.path);
      setCopiedPath(true);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopiedPath(false);
        copyTimeoutRef.current = null;
      }, 2000);
    } catch (e) {
      console.error('Failed to copy path:', e);
    }
  };

  const handleSelectFile = (file: typeof activeDiffFile) => {
    setActiveDiffFile(file);
  };

  const handleRevertFile = async () => {
    if (!activeDiffFile) return;
    if (!activeDiffFile.can_revert) return;
    try {
      if (activeDiffFile.original_exists === false) {
        await invoke('remove_file_content', { filePath: activeDiffFile.path });
      } else {
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
      {/* File Selector Tab Strip & Actions */}
      <div className="h-10 px-2.5 flex items-center justify-between gap-2 bg-zinc-50/90 dark:bg-zinc-900/70 border-b border-zinc-200 dark:border-zinc-800 text-xs shrink-0">
        {/* Scrollable File List */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {modifiedFiles.map((file) => {
            const isSelected = activeDiffFile.path === file.path;
            const name = file.path.split(/[/\\]/).pop();
            return (
              <button
                key={file.path}
                onClick={() => handleSelectFile(file)}
                title={file.path}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200/90 dark:border-zinc-700 shadow-2xs font-medium'
                    : 'text-zinc-600 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-200 border border-transparent'
                }`}
              >
                <FileCode className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="truncate max-w-[130px]">{name}</span>
              </button>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRevertFile}
            disabled={!activeDiffFile.can_revert}
            className="h-7 px-2.5 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-950/30 gap-1.5 shrink-0 whitespace-nowrap"
            title={t.inspector.revertBtn}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.inspector.revertBtn}</span>
          </Button>
          <Button
            variant="purple"
            size="sm"
            onClick={handleAcceptFile}
            className="h-7 px-2.5 text-xs gap-1.5 shrink-0 whitespace-nowrap shadow-2xs"
            title={t.inspector.acceptBtn}
          >
            <Check className="w-3.5 h-3.5" />
            <span>{t.inspector.acceptBtn}</span>
          </Button>
        </div>
      </div>

      {/* Path Breadcrumb */}
      <div className="px-3 py-1 bg-white dark:bg-zinc-950/60 border-b border-zinc-200/80 dark:border-zinc-800/60 flex items-center justify-between gap-2 text-[11px] font-mono text-zinc-500 dark:text-zinc-400 shrink-0">
        <div className="flex items-center gap-1.5 truncate min-w-0" title={activeDiffFile.path}>
          <span className="text-zinc-400 dark:text-zinc-600 font-sans">📁</span>
          <span className="truncate text-zinc-700 dark:text-zinc-300 font-medium">{displayPath}</span>
        </div>
        <button
          onClick={handleCopyPath}
          className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition shrink-0 cursor-pointer"
          title={copiedPath ? '已复制' : '复制完整路径'}
        >
          {copiedPath ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
        </button>
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
            fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            renderOverviewRuler: false,
            overviewRulerBorder: false,
          }}
        />
      </div>
    </div>
  );
}
