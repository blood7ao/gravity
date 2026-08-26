import { create } from 'zustand';
import { Project, ModifiedFile, ArtifactInfo, PermissionMode, InspectorTab } from '@/types';

interface WorkspaceState {
  projects: Project[];
  activeProject: Project | null;
  isInspectorOpen: boolean;
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
  setInspectorTab: (tab: InspectorTab) => void;
  setModifiedFiles: (files: ModifiedFile[]) => void;
  addModifiedFile: (path: string, original?: string, modified?: string) => void;
  setActiveDiffFile: (file: ModifiedFile | null) => void;
  setPlanArtifact: (plan: ArtifactInfo | null) => void;
  setArtifacts: (artifacts: ArtifactInfo[]) => void;
  setPermissionMode: (mode: PermissionMode) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  projects: [],
  activeProject: null,
  isInspectorOpen: false,
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
    set((state) => ({
      isInspectorOpen: open !== undefined ? open : !state.isInspectorOpen,
    })),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setModifiedFiles: (modifiedFiles) => set({ modifiedFiles }),
  addModifiedFile: (path, original = '', modified = '') =>
    set((state) => {
      const existing = state.modifiedFiles.find((f) => f.path === path);
      if (existing) {
        return {
          modifiedFiles: state.modifiedFiles.map((f) =>
            f.path === path
              ? { ...f, original_content: original || f.original_content, modified_content: modified || f.modified_content }
              : f
          ),
        };
      }
      const newFile: ModifiedFile = {
        path,
        original_content: original,
        modified_content: modified,
        status: 'modified',
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
