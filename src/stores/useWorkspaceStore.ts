import { create } from 'zustand';
import { Project, ModifiedFile, ArtifactInfo, PermissionMode, InspectorTab } from '@/types';

interface WorkspaceState {
  projects: Project[];
  activeProject: Project | null;
  isInspectorOpen: boolean;
  isInspectorFullscreen: boolean;
  inspectorTab: InspectorTab;
  modifiedFiles: ModifiedFile[];
  activeDiffFile: ModifiedFile | null;
  planArtifact: ArtifactInfo | null;
  artifacts: ArtifactInfo[];
  permissionMode: PermissionMode;
  isAddProjectModalOpen: boolean;

  setProjects: (projects: Project[]) => void;
  setActiveProject: (project: Project | null) => void;
  setIsAddProjectModalOpen: (open: boolean) => void;
  toggleInspector: (open?: boolean) => void;
  toggleInspectorFullscreen: (fullscreen?: boolean) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  setModifiedFiles: (files: ModifiedFile[]) => void;
  addModifiedFile: (
    path: string,
    original?: string,
    modified?: string,
    originalExists?: boolean,
    canRevert?: boolean
  ) => void;
  setActiveDiffFile: (file: ModifiedFile | null) => void;
  setPlanArtifact: (plan: ArtifactInfo | null) => void;
  setArtifacts: (artifacts: ArtifactInfo[]) => void;
  setPermissionMode: (mode: PermissionMode) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  projects: [],
  activeProject: null,
  isInspectorOpen: false,
  isInspectorFullscreen: false,
  isAddProjectModalOpen: false,
  inspectorTab: 'plan',
  modifiedFiles: [],
  activeDiffFile: null,
  planArtifact: null,
  artifacts: [],
  permissionMode: 'auto-approve',

  setProjects: (projects) => set({ projects }),
  setActiveProject: (activeProject) => set({ activeProject }),
  setIsAddProjectModalOpen: (isAddProjectModalOpen) => set({ isAddProjectModalOpen }),
  toggleInspector: (open) =>
    set((state) => {
      const willOpen = open !== undefined ? open : !state.isInspectorOpen;
      return {
        isInspectorOpen: willOpen,
        // Reset fullscreen if closing
        isInspectorFullscreen: willOpen ? state.isInspectorFullscreen : false,
      };
    }),
  toggleInspectorFullscreen: (fullscreen) =>
    set((state) => {
      const willFullscreen = fullscreen !== undefined ? fullscreen : !state.isInspectorFullscreen;
      return {
        isInspectorFullscreen: willFullscreen,
        // If turning fullscreen on, also ensure inspector is open
        isInspectorOpen:
          willFullscreen === false ? state.isInspectorOpen : true,
      };
    }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setModifiedFiles: (modifiedFiles) => set({ modifiedFiles }),
  addModifiedFile: (path, original, modified, originalExists, canRevert) =>
    set((state) => {
      const existing = state.modifiedFiles.find((f) => f.path === path);
      if (existing) {
        const updated = {
          ...existing,
          ...(original !== undefined ? { original_content: original } : {}),
          ...(modified !== undefined ? { modified_content: modified } : {}),
          ...(originalExists !== undefined
            ? {
                original_exists: originalExists,
                status: originalExists === false
                  ? ('created' as const)
                  : ('modified' as const),
              }
            : {}),
          ...(canRevert !== undefined ? { can_revert: canRevert } : {}),
        };
        const newFiles = state.modifiedFiles.map((f) =>
          f.path === path ? updated : f
        );
        return {
          modifiedFiles: newFiles,
          // Keep activeDiffFile in sync if it points to the same file
          activeDiffFile:
            state.activeDiffFile?.path === path
              ? updated
              : state.activeDiffFile,
        };
      }
      const newFile: ModifiedFile = {
        path,
        original_content: original ?? '',
        modified_content: modified ?? '',
        status: originalExists === false ? 'created' : 'modified',
        original_exists: originalExists,
        can_revert: canRevert ?? false,
      };
      return {
        modifiedFiles: [...state.modifiedFiles, newFile],
        activeDiffFile: state.activeDiffFile || newFile,
      };
    }),
  setActiveDiffFile: (activeDiffFile) => set({ activeDiffFile }),
  setPlanArtifact: (planArtifact) => set({ planArtifact }),
  setArtifacts: (artifacts) => set({ artifacts }),
  setPermissionMode: (permissionMode) => set({ permissionMode }),
}));
