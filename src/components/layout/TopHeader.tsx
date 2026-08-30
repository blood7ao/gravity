import React, { useState, useRef, useEffect } from 'react';
import {
  Folder,
  SquarePen,
  Share2,
  Code2,
  Terminal,
  Copy,
  Check,
  ChevronDown,
  SidebarClose,
  SidebarOpen,
  Languages,
  Sun,
  Moon,
  ListTodo,
  FileCode2,
} from 'lucide-react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { useI18n } from '@/i18n';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Badge } from '@/components/ui/Badge';

export function TopHeader() {
  const { t, language, toggleLanguage } = useI18n();
  const { resolvedTheme, toggleTheme } = useThemeStore();

  const {
    conversationId,
    messages,
    clearSession,
    isStreaming,
    statusMessage,
  } = useSessionStore();

  const {
    activeProject,
    modifiedFiles,
    planArtifact,
    isInspectorOpen,
    toggleInspector,
    setInspectorTab,
    setIsAddProjectModalOpen,
  } = useWorkspaceStore();

  const [isEditorMenuOpen, setIsEditorMenuOpen] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  const editorMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (editorMenuRef.current && !editorMenuRef.current.contains(e.target as Node)) {
        setIsEditorMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute session title
  const firstUserMsg = messages.find((m) => m.role === 'user')?.content || '';
  const cleanTitle = firstUserMsg
    ? firstUserMsg.replace(/<[^>]+>/g, '').trim().slice(0, 30)
    : activeProject
    ? activeProject.name
    : t.sidebar.untitledSession;

  const handleShare = async () => {
    try {
      const fullText = messages
        .map((m) => `${m.role.toUpperCase()}:\n${m.content}`)
        .join('\n\n---\n\n');
      await navigator.clipboard.writeText(fullText);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
    } catch (e) {
      console.error('Failed to share:', e);
    }
  };

  const handleCopyProjectPath = async () => {
    if (activeProject?.path) {
      try {
        await navigator.clipboard.writeText(activeProject.path);
        setCopiedPath(true);
        setTimeout(() => setCopiedPath(false), 2000);
      } catch (e) {
        console.error('Failed to copy path:', e);
      }
    }
  };

  const handleMouseDown = async (e: React.MouseEvent) => {
    // Only drag when primary left mouse button is pressed and not clicking an interactive element
    if (
      e.button === 0 &&
      !(e.target as HTMLElement).closest('button, input, textarea, select, a, [role="button"], [role="menuitem"]')
    ) {
      try {
        await getCurrentWindow().startDragging();
      } catch (err) {
        console.error('Failed to start dragging:', err);
      }
    }
  };

  const handleDoubleClick = async (e: React.MouseEvent) => {
    if (
      e.button === 0 &&
      !(e.target as HTMLElement).closest('button, input, textarea, select, a, [role="button"], [role="menuitem"]')
    ) {
      try {
        await getCurrentWindow().toggleMaximize();
      } catch (err) {
        console.error('Failed to toggle maximize:', err);
      }
    }
  };

  return (
    <header
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      className="h-11 bg-white/90 dark:bg-[#121215]/90 backdrop-blur-md flex items-center justify-between px-3 z-20 select-none transition-colors"
    >
      {/* Left section: macOS Traffic Lights spacer + Navigation + Session Title */}
      <div data-tauri-drag-region className="flex items-center gap-2">
        {/* macOS traffic light spacer */}
        <div data-tauri-drag-region className="w-16 h-full shrink-0" />

        {/* New Session Button */}
        <button
          onClick={() => clearSession()}
          className="p-1 rounded-md text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          title={t.sidebar.newSession}
        >
          <SquarePen className="w-3.5 h-3.5" />
        </button>

        {/* Session / Project Title Breadcrumb */}
        <div data-tauri-drag-region className="flex items-center gap-1.5 text-xs text-zinc-800 dark:text-zinc-200 font-medium">
          <Folder className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 shrink-0" />
          <button
            onClick={() => setIsAddProjectModalOpen(true)}
            className="hover:underline truncate max-w-[240px] text-left"
            title={activeProject?.path || t.sidebar.addProject}
          >
            {cleanTitle}
          </button>
          {isStreaming ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium shrink-0">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              <span>{language === 'zh' ? '进行中' : 'Running'}</span>
            </span>
          ) : messages.length > 0 && messages[messages.length - 1].status === 'error' ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-medium shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
              <span>{language === 'zh' ? '未完成' : 'Incomplete'}</span>
            </span>
          ) : null}
          <span className="text-zinc-400 dark:text-zinc-600">···</span>
        </div>
      </div>

      {/* Middle flex drag region */}
      <div data-tauri-drag-region className="flex-1 h-full min-w-[24px]" />

      {/* Right section: Share, Editor launcher, Inspector, Language & Theme */}
      <div data-tauri-drag-region className="flex items-center gap-1.5 shrink-0">
        {/* Plan Ready Badge Button */}
        {planArtifact && (
          <button
            onClick={() => {
              setInspectorTab('plan');
              toggleInspector(true);
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition shrink-0 whitespace-nowrap cursor-pointer"
          >
            <ListTodo className="w-3 h-3 text-purple-600 dark:text-purple-400" />
            <span>{t.header.planReady}</span>
          </button>
        )}

        {/* Share Button */}
        <button
          onClick={handleShare}
          title={t.header.share}
          className="flex items-center justify-center w-7 h-7 rounded-md text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition shrink-0 cursor-pointer"
        >
          {copiedShare ? (
            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Share2 className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Editor Launcher Dropdown */}
        <div className="relative shrink-0" ref={editorMenuRef}>
          <button
            onClick={() => setIsEditorMenuOpen(!isEditorMenuOpen)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 transition cursor-pointer"
            title={t.header.openInEditor}
          >
            <Code2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <ChevronDown className="w-3 h-3 text-zinc-400" />
          </button>

          {isEditorMenuOpen && (
            <div className="absolute right-0 top-8 w-48 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl p-1 z-30 space-y-0.5 text-xs">
              <button
                onClick={handleCopyProjectPath}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-left transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Copy className="w-3.5 h-3.5 text-zinc-500" />
                  <span>复制项目路径</span>
                </div>
                {copiedPath && <Check className="w-3 h-3 text-emerald-500" />}
              </button>

              <div className="border-t border-zinc-100 dark:border-zinc-800 my-1" />

              <div className="px-2.5 py-1 text-[10px] text-zinc-400 uppercase font-semibold">
                工作区目录
              </div>
              <div className="px-2.5 py-1 text-[11px] font-mono text-zinc-600 dark:text-zinc-400 truncate">
                {activeProject?.path || '未选择项目'}
              </div>
            </div>
          )}
        </div>

        {/* Diff Review Toggle */}
        {modifiedFiles.length > 0 && (
          <button
            onClick={() => {
              setInspectorTab('diff');
              toggleInspector(true);
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition shrink-0 whitespace-nowrap cursor-pointer"
          >
            <FileCode2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span>{t.header.diffsCount(modifiedFiles.length)}</span>
          </button>
        )}

        {/* Raw CLI Output Toggle */}
        <button
          onClick={() => {
            if (isInspectorOpen && useWorkspaceStore.getState().inspectorTab === 'raw_logs') {
              toggleInspector(false);
            } else {
              setInspectorTab('raw_logs');
              toggleInspector(true);
            }
          }}
          title={t.inspector.viewRawOutput}
          className="flex items-center justify-center w-7 h-7 rounded-md text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
        >
          <Terminal className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
        </button>

        {/* Inspector Panel Toggle */}
        <button
          onClick={() => toggleInspector()}
          title={t.header.toggleInspector}
          className={`flex items-center justify-center w-7 h-7 rounded-md transition cursor-pointer ${
            isInspectorOpen
              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          {isInspectorOpen ? (
            <SidebarClose className="w-3.5 h-3.5" />
          ) : (
            <SidebarOpen className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Theme Toggle Button */}
        <button
          onClick={(e) => toggleTheme(e)}
          title={`${t.header.switchTheme} (${resolvedTheme === 'dark' ? t.common.themeDark : t.common.themeLight})`}
          className="flex items-center justify-center w-7 h-7 rounded-md text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-zinc-600" />
          )}
        </button>

        {/* Language Switch Button */}
        <button
          onClick={toggleLanguage}
          title={t.header.switchLanguage}
          className="flex items-center justify-center w-7 h-7 rounded-md text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-mono text-[11px] font-semibold transition"
        >
          {language === 'zh' ? '中' : 'EN'}
        </button>
      </div>
    </header>
  );
}

