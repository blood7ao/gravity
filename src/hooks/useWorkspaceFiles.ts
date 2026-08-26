import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { WorkspaceFile } from '@/types';

export function useWorkspaceFiles() {
  const activeProject = useWorkspaceStore((s) => s.activeProject);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFiles = useCallback(
    async (query = '') => {
      if (!activeProject?.path) {
        setFiles([]);
        return;
      }
      setLoading(true);
      try {
        const results = await invoke<WorkspaceFile[]>('get_workspace_files', {
          projectDir: activeProject.path,
          query: query || null,
          maxResults: 100,
        });
        setFiles(results);
      } catch (err) {
        console.error('Failed to get workspace files:', err);
      } finally {
        setLoading(false);
      }
    },
    [activeProject?.path]
  );

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  return {
    files,
    loading,
    searchFiles: fetchFiles,
  };
}
