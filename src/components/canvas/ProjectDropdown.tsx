import React, { useState, useRef, useEffect } from 'react';
import { Search, Folder, Check, Plus, X } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useI18n } from '@/i18n';
import { Project } from '@/types';

interface ProjectDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  align?: 'left' | 'right' | 'center';
  direction?: 'down' | 'up';
}

export function ProjectDropdown({
  isOpen,
  onClose,
  className = '',
  align = 'left',
  direction = 'down',
}: ProjectDropdownProps) {
  const { t, language } = useI18n();
  const {
    projects,
    activeProject,
    setActiveProject,
    setIsAddProjectModalOpen,
  } = useWorkspaceStore();

  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Handle outside click & escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectProject = (project: Project) => {
    setActiveProject(project);
    onClose();
  };

  const handleNewProject = () => {
    setIsAddProjectModalOpen(true);
    onClose();
  };

  const handleWorkWithoutProject = () => {
    setActiveProject(null);
    onClose();
  };

  const alignClass =
    align === 'right'
      ? 'right-0'
      : align === 'center'
      ? 'left-1/2 -translate-x-1/2'
      : 'left-0';

  const positionClass =
    direction === 'up'
      ? 'bottom-full mb-2'
      : 'top-full mt-2';

  return (
    <div
      ref={dropdownRef}
      className={`absolute z-50 w-72 md:w-80 rounded-2xl border border-zinc-200/90 dark:border-zinc-800/90 bg-white dark:bg-[#18181b] shadow-2xl p-2 text-xs font-sans select-none animate-in fade-in zoom-in-95 duration-100 ${alignClass} ${positionClass} ${className}`}
    >
      {/* Search Input Box */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 mb-1.5 focus-within:border-purple-500/50 transition">
        <Search className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 shrink-0" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t.canvas.searchProjects}
          className="w-full bg-transparent text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 p-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Projects List */}
      <div className="max-h-56 overflow-y-auto space-y-0.5 py-0.5">
        {filteredProjects.length > 0 ? (
          filteredProjects.map((project) => {
            const isSelected = activeProject?.id === project.id || activeProject?.path === project.path;
            return (
              <div
                key={project.id}
                onClick={() => handleSelectProject(project)}
                className={`group flex items-center justify-between px-2.5 py-2 rounded-xl cursor-pointer transition ${
                  isSelected
                    ? 'bg-zinc-100/90 dark:bg-zinc-800/90 font-medium'
                    : 'hover:bg-zinc-100/60 dark:hover:bg-zinc-800/50'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                  <Folder
                    className={`w-4 h-4 shrink-0 ${
                      isSelected
                        ? 'text-purple-600 dark:text-purple-400'
                        : 'text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-800 dark:group-hover:text-zinc-200'
                    }`}
                  />
                  <span
                    className="text-xs text-zinc-800 dark:text-zinc-200 truncate"
                    title={project.path}
                  >
                    {project.name}
                  </span>
                </div>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-zinc-900 dark:text-zinc-100 shrink-0 font-bold" />
                )}
              </div>
            );
          })
        ) : (
          <div className="px-3 py-3 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
            {t.canvas.noProjectsFound}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-zinc-100 dark:border-zinc-800 my-1" />

      {/* Action Options */}
      <div className="space-y-0.5 pt-0.5">
        {/* + 新建项目 */}
        <button
          type="button"
          onClick={handleNewProject}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/70 hover:text-zinc-950 dark:hover:text-white transition font-medium text-xs cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" />
          <span>{language === 'zh' ? '新建项目' : t.sidebar.addProject}</span>
        </button>

        {/* × 不在项目中工作 */}
        <button
          type="button"
          onClick={handleWorkWithoutProject}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/70 hover:text-zinc-950 dark:hover:text-white transition font-medium text-xs cursor-pointer"
        >
          <X className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" />
          <span>{t.canvas.workWithoutProject}</span>
        </button>
      </div>
    </div>
  );
}
