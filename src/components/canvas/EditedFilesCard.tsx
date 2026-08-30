import React from 'react';
import { FileCode, RotateCcw } from 'lucide-react';
import { FileSnapshot, ToolCall } from '@/types';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useI18n } from '@/i18n';
import { invoke } from '@tauri-apps/api/core';

interface FileDiffSummary {
  filePath: string;
  displayPath: string;
  additions: number;
  deletions: number;
}

interface EditedFilesCardProps {
  toolCalls?: ToolCall[];
}

export function EditedFilesCard({ toolCalls }: EditedFilesCardProps) {
  const { t } = useI18n();
  const {
    activeProject,
    modifiedFiles,
    addModifiedFile,
    setModifiedFiles,
    setActiveDiffFile,
    setInspectorTab,
    toggleInspector,
  } = useWorkspaceStore();

  if (!toolCalls || toolCalls.length === 0) return null;

  // Extract all file edit tools
  const editTools = toolCalls.filter(
    (tc) =>
      tc.tool_name === 'replace_file_content' ||
      tc.tool_name === 'write_to_file'
  );

  if (editTools.length === 0) return null;

  // Aggregate files with addition and deletion counts
  const fileMap = new Map<string, { additions: number; deletions: number }>();

  for (const tc of editTools) {
    let rawPath = tc.tool_args?.TargetFile || tc.tool_args?.file_path || '';
    if (typeof rawPath !== 'string') {
      rawPath = typeof rawPath === 'object' ? JSON.stringify(rawPath) : String(rawPath);
    }
    rawPath = rawPath.replace(/^"|"$/g, '').trim();
    if (!rawPath) continue;

    let adds = 0;
    let dels = 0;

    if (tc.tool_name === 'replace_file_content') {
      let rep = tc.tool_args?.ReplacementContent || '';
      let tar = tc.tool_args?.TargetContent || '';

      if (typeof rep !== 'string') rep = typeof rep === 'object' ? JSON.stringify(rep) : String(rep);
      if (typeof tar !== 'string') tar = typeof tar === 'object' ? JSON.stringify(tar) : String(tar);

      adds = rep ? rep.split('\n').length : 0;
      dels = tar ? tar.split('\n').length : 0;
    } else if (tc.tool_name === 'write_to_file') {
      let code = tc.tool_args?.CodeContent || '';

      if (typeof code !== 'string') code = typeof code === 'object' ? JSON.stringify(code) : String(code);

      adds = code ? code.split('\n').length : 0;
      dels = 0;
    }

    const existing = fileMap.get(rawPath) || { additions: 0, deletions: 0 };
    fileMap.set(rawPath, {
      additions: existing.additions + adds,
      deletions: existing.deletions + dels,
    });
  }

  if (fileMap.size === 0) return null;

  const projectRoot = activeProject?.path || '';
  const fileList: FileDiffSummary[] = Array.from(fileMap.entries()).map(
    ([fullPath, counts]) => {
      let rel = fullPath;
      if (projectRoot && fullPath.startsWith(projectRoot)) {
        rel = fullPath.substring(projectRoot.length).replace(/^[/\\]/, '');
      }
      return {
        filePath: fullPath,
        displayPath: rel || fullPath,
        additions: counts.additions,
        deletions: counts.deletions,
      };
    }
  );

  const totalAdditions = fileList.reduce((acc, f) => acc + f.additions, 0);
  const totalDeletions = fileList.reduce((acc, f) => acc + f.deletions, 0);

  const loadAndOpenDiff = async (filePath: string) => {
    try {
      const tracked = useWorkspaceStore.getState().modifiedFiles.find((file) => file.path === filePath);
      if (tracked) {
        setActiveDiffFile(tracked);
      } else {
        const [snapshot, modified] = await Promise.all([
          invoke<FileSnapshot | null>('get_file_snapshot', { filePath }).catch(() => null),
          invoke<string>('read_file_content', { filePath }).catch(() => ''),
        ]);
        const original = snapshot?.content ?? (await invoke<string>('git_show_file', { filePath }).catch(() => ''));
        addModifiedFile(filePath, original, modified, snapshot?.exists, snapshot?.can_revert ?? false);
        const added = useWorkspaceStore.getState().modifiedFiles.find((file) => file.path === filePath);
        setActiveDiffFile(added || null);
      }
    } catch {
      addModifiedFile(filePath, undefined, undefined, undefined, false);
    }
    setInspectorTab('diff');
    toggleInspector(true);
  };

  const handleOpenFileDiff = (filePath: string) => {
    loadAndOpenDiff(filePath);
  };

  const handleReviewAll = async () => {
    // Load all files in parallel
    await Promise.all(
      fileList.map(async (item) => {
        try {
          const tracked = useWorkspaceStore.getState().modifiedFiles.find((file) => file.path === item.filePath);
          if (tracked) return;
          const [snapshot, modified] = await Promise.all([
            invoke<FileSnapshot | null>('get_file_snapshot', { filePath: item.filePath }).catch(() => null),
            invoke<string>('read_file_content', { filePath: item.filePath }).catch(() => ''),
          ]);
          const original = snapshot?.content ?? (await invoke<string>('git_show_file', { filePath: item.filePath }).catch(() => ''));
          addModifiedFile(item.filePath, original, modified, snapshot?.exists, snapshot?.can_revert ?? false);
        } catch {
          addModifiedFile(item.filePath, undefined, undefined, undefined, false);
        }
      })
    );
    setInspectorTab('diff');
    toggleInspector(true);
  };

  const handleUndo = async () => {
    const trackedFiles = useWorkspaceStore.getState().modifiedFiles;
    const revertedPaths: string[] = [];
    for (const item of fileList) {
      const tracked = trackedFiles.find((file) => file.path === item.filePath);
      if (!tracked?.can_revert) continue;
      try {
        if (tracked.original_exists === false) {
          await invoke('remove_file_content', { filePath: item.filePath });
        } else {
          await invoke('write_file_content', {
            filePath: item.filePath,
            content: tracked.original_content,
          });
        }
        revertedPaths.push(item.filePath);
      } catch (e) {
        console.error('Failed to revert file:', item.filePath, e);
      }
    }
    const remaining = useWorkspaceStore
      .getState()
      .modifiedFiles.filter((file) => !revertedPaths.includes(file.path));
    setModifiedFiles(remaining);
    setActiveDiffFile(remaining[0] || null);
  };

  const canUndo = fileList.every((item) =>
    modifiedFiles.some((file) => file.path === item.filePath && file.can_revert)
  );

  return (
    <div className="my-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 p-3.5 shadow-2xs font-sans">
      {/* Top Header Row */}
      <div className="flex items-center justify-between pb-2.5 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          {/* File Icon Badge */}
          <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700 flex items-center justify-center text-zinc-700 dark:text-zinc-200">
            <FileCode className="w-4 h-4" />
          </div>

          <div>
            <div className="text-sm font-semibold text-zinc-950 dark:text-white">
              {t.canvas.editedFiles(fileList.length)}
            </div>
            <div className="text-[12px] font-mono font-semibold flex items-center gap-1.5 mt-0.5">
              {totalAdditions > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  +{totalAdditions}
                </span>
              )}
              {totalDeletions > 0 && (
                <span className="text-red-500 dark:text-red-400">
                  -{totalDeletions}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition disabled:cursor-not-allowed disabled:opacity-40"
            title={t.canvas.undo}
          >
            <span>{t.canvas.undo}</span>
            <RotateCcw className="w-3 h-3" />
          </button>

          <button
            onClick={handleReviewAll}
            className="px-3 py-1 rounded-md text-xs font-medium text-zinc-900 dark:text-zinc-100 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 transition shadow-2xs"
          >
            {t.canvas.review}
          </button>
        </div>
      </div>

      {/* File List Items */}
      <div className="pt-2 space-y-0.5">
        {fileList.map((item, idx) => (
          <div
            key={idx}
            onClick={() => handleOpenFileDiff(item.filePath)}
            className="flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60 cursor-pointer group transition"
          >
            <span className="font-mono text-[13px] text-zinc-800 dark:text-zinc-200 group-hover:text-zinc-950 dark:group-hover:text-white truncate flex-1 mr-3 font-normal">
              {item.displayPath}
            </span>

            <div className="font-mono text-[12px] font-semibold shrink-0 flex items-center gap-1.5">
              {item.additions > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  +{item.additions}
                </span>
              )}
              {item.deletions > 0 && (
                <span className="text-red-500 dark:text-red-400">
                  -{item.deletions}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
