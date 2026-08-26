import React, { useEffect, useState } from 'react';
import { FileCode, Folder, Search } from 'lucide-react';
import { useWorkspaceFiles } from '@/hooks/useWorkspaceFiles';
import { useI18n } from '@/i18n';
import { WorkspaceFile } from '@/types';
import { formatBytes } from '@/lib/utils';

interface MentionPickerProps {
  isOpen: boolean;
  filter: string;
  onClose: () => void;
  onSelectFile: (file: WorkspaceFile) => void;
}

export function MentionPicker({
  isOpen,
  filter,
  onSelectFile,
}: MentionPickerProps) {
  const { t } = useI18n();
  const { files, searchFiles } = useWorkspaceFiles();
  const [selectedIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      searchFiles(filter);
    }
  }, [isOpen, filter, searchFiles]);

  const filteredFiles = files.slice(0, 15);

  if (!isOpen || filteredFiles.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 z-40 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl dark:shadow-2xl overflow-hidden p-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
      <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-800/80 mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <Search className="w-3 h-3 text-purple-600 dark:text-purple-400" />
          {t.prompt.workspaceFilesTitle}
        </span>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{t.prompt.insertFileContext}</span>
      </div>

      <div className="max-h-56 overflow-y-auto space-y-0.5 font-mono text-xs">
        {filteredFiles.map((file, idx) => (
          <div
            key={file.absolute_path}
            onClick={() => onSelectFile(file)}
            className={`flex items-center justify-between px-3 py-1.5 rounded-lg cursor-pointer transition ${
              idx === selectedIndex
                ? 'bg-purple-50 text-purple-900 border border-purple-200 dark:bg-purple-600/20 dark:text-purple-200 dark:border-purple-500/30'
                : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300'
            }`}
          >
            <div className="flex items-center gap-2 truncate flex-1 mr-2">
              {file.is_dir ? (
                <Folder className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
              ) : (
                <FileCode className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 shrink-0" />
              )}
              <span className="truncate">{file.relative_path}</span>
            </div>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 shrink-0">
              {formatBytes(file.size)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
