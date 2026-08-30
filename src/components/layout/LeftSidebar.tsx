import React, { useState, useEffect, useRef } from 'react';
import {
  SquarePen,
  Folder,
  Plus,
  Trash2,
  Settings,
  ShieldCheck,
  ShieldAlert,
  Hand,
  FolderOpen,
  Languages,
  Sun,
  Moon,
  Monitor,
  MoreHorizontal,
  History,
  Clock,
  Globe,
  Check,
  RotateCw,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useThemeStore, Theme } from '@/stores/useThemeStore';
import { useProxyStore } from '@/stores/useProxyStore';
import { useI18n, Language } from '@/i18n';
import { Project, Session, Message, ToolCall, MessagePart, ArtifactInfo } from '@/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import {
  formatTimeAgo,
  formatTimeAgoShort,
  mergeTranscriptText,
  deduplicateConsecutiveParagraphs,
  sanitizeMarkdownContent,
  parseTranscriptStepsToMessages,
} from '@/lib/utils';

export function LeftSidebar() {
  const { t, language, setLanguage } = useI18n();
  const { theme, setTheme } = useThemeStore();

  const {
    projects,
    setProjects,
    activeProject,
    setActiveProject,
    isAddProjectModalOpen,
    setIsAddProjectModalOpen,
    permissionMode,
    setPermissionMode,
    setArtifacts,
    setPlanArtifact,
  } = useWorkspaceStore();

  const {
    conversationId,
    setConversationId,
    clearSession,
    setMode,
    setEffort,
    setModel,
    setAgent,
    setMessages,
    setRawTranscriptText,
    isStreaming,
    setIsStreaming,
    setStatusMessage,
  } = useSessionStore();

  const {
    enabled: proxyEnabled,
    host: proxyHost,
    port: proxyPort,
    isReachable: proxyIsReachable,
    isTesting: proxyIsTesting,
    saveConfig: saveProxyConfig,
    testConnection: testProxyConnection,
    toggleEnabled: toggleProxyEnabled,
  } = useProxyStore();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionIds, setActiveSessionIds] = useState<Set<string>>(new Set());
  const [expandedProjectSessions, setExpandedProjectSessions] = useState<Record<string, boolean>>({});
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPath, setNewProjectPath] = useState('');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [inputHost, setInputHost] = useState(proxyHost);
  const [inputPort, setInputPort] = useState(proxyPort.toString());
  const [proxySavedMessage, setProxySavedMessage] = useState(false);

  const refreshActiveSessions = async () => {
    try {
      const list = await invoke<string[]>('list_active_sessions');
      setActiveSessionIds(new Set(list || []));
    } catch (e) {
      console.warn('Failed to list active sessions:', e);
    }
  };

  useEffect(() => {
    setInputHost(proxyHost);
    setInputPort(proxyPort.toString());
  }, [proxyHost, proxyPort, isSettingsModalOpen]);


  const toggleExpandSessions = (projId: string) => {
    setExpandedProjectSessions((prev) => ({
      ...prev,
      [projId]: !prev[projId],
    }));
  };

  const handleSaveProxy = async () => {
    try {
      await saveProxyConfig({
        enabled: proxyEnabled,
        host: inputHost,
        port: parseInt(inputPort, 10) || 7890,
      });
      setProxySavedMessage(true);
      setTimeout(() => setProxySavedMessage(false), 2000);
    } catch (e) {
      console.error('Failed to save proxy:', e);
    }
  };

  const handleTestProxy = async () => {
    await testProxyConnection(inputHost, parseInt(inputPort, 10) || 7890);
  };

  const handleToggleProxy = async () => {
    await toggleProxyEnabled();
  };

  // Load projects from database
  const loadProjects = async () => {
    try {
      const list = await invoke<Project[]>('list_projects');
      setProjects(list);
      if (!activeProject && list.length > 0) {
        setActiveProject(list[0]);
      }
    } catch (e) {
      console.error('Failed to list projects:', e);
    }
  };


  // Load all sessions from database
  const loadSessions = async () => {
    try {
      const list = await invoke<Session[]>('list_sessions');
      setSessions(list);
    } catch (e) {
      console.error('Failed to list sessions:', e);
    }
  };

  useEffect(() => {
    loadProjects();
    refreshActiveSessions();

    const interval = setInterval(() => {
      refreshActiveSessions();
    }, 3000);

    const unlistenPresencePromise = listen<{ conversation_id: string; is_active: boolean }>(
      'session-presence-update',
      (event) => {
        const { conversation_id, is_active } = event.payload;
        setActiveSessionIds((prev) => {
          const next = new Set(prev);
          if (is_active) {
            next.add(conversation_id);
          } else {
            next.delete(conversation_id);
          }
          return next;
        });
        loadSessions();
      }
    );

    const unlistenTranscriptPromise = listen<{ conversation_id: string; steps: any[]; is_active: boolean }>(
      'brain-transcript-update',
      (event) => {
        const { conversation_id, is_active } = event.payload;
        setActiveSessionIds((prev) => {
          const next = new Set(prev);
          if (is_active) {
            next.add(conversation_id);
          } else {
            next.delete(conversation_id);
          }
          return next;
        });
      }
    );

    return () => {
      clearInterval(interval);
      unlistenPresencePromise.then((unlisten) => unlisten());
      unlistenTranscriptPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    loadSessions();
  }, [activeProject, conversationId]);

  const handlePickFolder = async () => {
    try {
      const res = await invoke<string | null>('pick_folder');
      if (res === null) return;
      if (res && typeof res === 'string') {
        setNewProjectPath(res);
        const folderName = res.split(/[/\\]/).filter(Boolean).pop() || 'Project';
        setNewProjectName(folderName);
        return;
      }
    } catch (rustErr) {
      console.warn('Rust pick_folder failed, trying plugin dialog:', rustErr);
    }

    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: t.modals.selectProjectDialogTitle,
      });
      if (selected && typeof selected === 'string') {
        setNewProjectPath(selected);
        const folderName = selected.split(/[/\\]/).filter(Boolean).pop() || 'Project';
        setNewProjectName(folderName);
      }
    } catch (e) {
      console.warn('Dialog plugin not supported or cancelled:', e);
    }
  };

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectPath.trim()) return;

    const name = newProjectName.trim() || newProjectPath.split(/[/\\]/).filter(Boolean).pop() || 'Project';
    try {
      const created = await invoke<Project>('add_project', {
        name,
        path: newProjectPath.trim(),
      });
      await loadProjects();
      setActiveProject(created);
      setIsAddProjectModalOpen(false);
      setNewProjectName('');
      setNewProjectPath('');
    } catch (err) {
      console.error('Failed to add project:', err);
    }
  };

  const handleRemoveProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke('remove_project', { id });

      let nextProjects = projects.filter((p) => p.id !== id);
      setProjects(nextProjects);

      if (activeProject?.id === id) {
        setActiveProject(nextProjects.length > 0 ? nextProjects[0] : null);
      }

      await loadProjects();
    } catch (err) {
      console.error('Failed to remove project:', err);
    }
  };

  const handleNewSession = () => {
    clearSession();
  };

  const latestSelectedSessionRef = useRef<string | null>(null);

  const handleSelectSession = async (s: Session, proj?: Project) => {
    latestSelectedSessionRef.current = s.id;
    setConversationId(s.id);
    if (s.mode) setMode(s.mode);
    if (s.effort) setEffort(s.effort);
    if (s.model) setModel(s.model);
    setAgent(s.agent || null);

    if (proj) {
      setActiveProject(proj);
    } else if (s.project_path) {
      const matchProj = projects.find((p) => p.path === s.project_path);
      if (matchProj) {
        setActiveProject(matchProj);
      }
    }

    try {
      // Determine if session is actively running in CLI / background
      const isAct =
        activeSessionIds.has(s.id) ||
        (await invoke<boolean>('is_session_active', { conversationId: s.id }).catch(() => false));

      setIsStreaming(isAct);
      if (isAct) {
        setStatusMessage('Agent running (CLI)');
      } else {
        setStatusMessage(null);
      }

      // Load transcript steps
      const steps = await invoke<any[]>('get_conversation_transcript', {
        conversationId: s.id,
      });

      if (latestSelectedSessionRef.current !== s.id) return;

      if (steps && steps.length > 0) {
        const loadedMessages = parseTranscriptStepsToMessages(steps, isAct);
        setMessages(loadedMessages);
      } else {
        setMessages([]);
      }

      // Load raw transcript text for inspection & debugging
      try {
        const rawText = await invoke<string>('get_raw_transcript_text', {
          conversationId: s.id,
        });
        if (latestSelectedSessionRef.current === s.id) {
          setRawTranscriptText(rawText || '');
        }
      } catch {
        if (latestSelectedSessionRef.current === s.id) {
          setRawTranscriptText('');
        }
      }

      // Load artifacts for this session
      try {
        const artifacts = await invoke<ArtifactInfo[]>('get_brain_artifacts', {
          conversationId: s.id,
        });
        if (latestSelectedSessionRef.current === s.id) {
          setArtifacts(artifacts);
          const plan = artifacts.find((a) => a.name === 'implementation_plan.md');
          if (plan) {
            setPlanArtifact(plan);
          } else {
            setPlanArtifact(null);
          }
        }
      } catch {
        if (latestSelectedSessionRef.current === s.id) {
          setArtifacts([]);
          setPlanArtifact(null);
        }
      }
    } catch (err) {
      console.error('Failed to load session transcript:', err);
      setMessages([]);
    }
  };

  return (
    <aside className="h-full flex flex-col justify-between bg-zinc-50/70 dark:bg-zinc-950/80 text-zinc-700 dark:text-zinc-300 transition-colors select-none">
      {/* Top Section: New Chat & Project Folders with Clean Sessions */}
      <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-2">
        {/* Top Actions: New Conversation, Conversation History, Scheduled Tasks */}
        <div className="space-y-0.5">
          <div
            onClick={handleNewSession}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[14px] font-medium text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 cursor-pointer transition select-none group"
          >
            <Plus className="w-4 h-4 text-zinc-700 dark:text-zinc-300 stroke-[1.8]" />
            <span>{language === 'zh' ? '新对话' : 'New Conversation'}</span>
          </div>

          <div
            onClick={() => { }}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13.5px] font-normal text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/50 cursor-pointer transition select-none"
          >
            <History className="w-4 h-4 text-zinc-400 dark:text-zinc-500 stroke-[1.6]" />
            <span>{language === 'zh' ? '对话历史' : 'Conversation History'}</span>
          </div>

          <div
            onClick={() => { }}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13.5px] font-normal text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/50 cursor-pointer transition select-none"
          >
            <Clock className="w-4 h-4 text-zinc-400 dark:text-zinc-500 stroke-[1.6]" />
            <span>{language === 'zh' ? '定时任务' : 'Scheduled Tasks'}</span>
          </div>
        </div>

        {/* Project Section Header */}
        <div className="pt-2">
          <div className="flex items-center justify-between px-2 pb-1 select-none text-[12px] font-medium text-zinc-400 dark:text-zinc-500">
            <span>{language === 'zh' ? '项目' : 'Projects'}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsAddProjectModalOpen(true)}
                className="p-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition cursor-pointer"
                title={t.sidebar.addProject}
              >
                <Plus className="w-3.5 h-3.5 stroke-[1.8]" />
              </button>
            </div>
          </div>

          {/* Project Groups List */}
          {projects.map((proj) => {
            const projSessions = sessions.filter((s) => s.project_path === proj.path);
            const isCurrentActive = activeProject?.id === proj.id;
            const isExpanded = Boolean(expandedProjectSessions[proj.id]);
            const visibleSessions = isExpanded ? projSessions : projSessions.slice(0, 6);
            const hasMore = projSessions.length > 6;

            return (
              <div key={proj.id} className="mb-2">
                {/* Project Folder Row */}
                <div
                  onClick={() => setActiveProject(proj)}
                  className="group flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                >
                  <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                    <Folder
                      className="w-4 h-4 shrink-0 text-zinc-400 dark:text-zinc-500 stroke-[1.6]"
                    />
                    <span className="text-[14px] truncate font-medium text-zinc-800 dark:text-zinc-200">
                      {proj.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0 ml-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveProject(proj);
                        clearSession();
                      }}
                      className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-950 dark:hover:text-white transition"
                      title={language === 'zh' ? '在此项目新建会话' : 'New chat in project'}
                    >
                      <SquarePen className="w-3.5 h-3.5 stroke-[1.6]" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleRemoveProject(proj.id, e)}
                      className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-red-500 transition"
                      title={t.sidebar.removeProject}
                    >
                      <Trash2 className="w-3.5 h-3.5 stroke-[1.6]" />
                    </button>
                  </div>
                </div>

                {/* Sessions list */}
                {projSessions.length > 0 && (
                  <div className="space-y-0.5 mt-0.5">
                    {visibleSessions.map((s) => {
                      const isActiveSession = conversationId === s.id;
                      const isRunningNow = activeSessionIds.has(s.id) || (conversationId === s.id && isStreaming);
                      const status = isRunningNow ? 'running' : s.status || 'completed';
                      const timeStr = formatTimeAgoShort(s.updated_at || s.created_at);
                      return (
                        <div
                          key={s.id}
                          onClick={() => handleSelectSession(s, proj)}
                          title={s.title || t.sidebar.untitledSession}
                          className={`flex items-center justify-between pl-8 pr-2 py-1.5 rounded-lg text-[14px] font-medium cursor-pointer transition ${isActiveSession
                            ? 'bg-zinc-200/70 dark:bg-zinc-800/80 text-zinc-950 dark:text-white'
                            : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
                            }`}
                        >
                          <span className="truncate flex-1 min-w-0">{s.title || t.sidebar.untitledSession}</span>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {status === 'running' ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium shrink-0">
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                                </span>
                                <span>{t.sidebar.statusRunning}</span>
                              </span>
                            ) : status === 'plan_ready' ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-[10px] font-medium shrink-0">
                                <span>{t.sidebar.statusPlanReady}</span>
                              </span>
                            ) : status === 'incomplete' ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-medium shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                                <span>{t.sidebar.statusIncomplete}</span>
                              </span>
                            ) : (
                              timeStr && (
                                <span className="text-[12px] text-zinc-400 dark:text-zinc-500 font-normal">
                                  {timeStr}
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {hasMore && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpandSessions(proj.id);
                        }}
                        className="text-[12.5px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 pl-8 pr-2 py-1 transition cursor-pointer w-full text-left font-normal"
                      >
                        {isExpanded
                          ? (language === 'zh' ? '收起' : 'Show less')
                          : (language === 'zh' ? `展开全部 (${projSessions.length})` : `See all (${projSessions.length})`)}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Unassigned / Other Sessions */}
          {(() => {
            const unassigned = sessions.filter(
              (s) => !s.project_path || !projects.some((p) => p.path === s.project_path)
            );
            if (unassigned.length === 0) return null;
            const isExpanded = Boolean(expandedProjectSessions._unassigned);
            const visibleSessions = isExpanded ? unassigned : unassigned.slice(0, 6);
            const hasMore = unassigned.length > 6;

            return (
              <div className="mb-2">
                <div className="flex items-center gap-2 px-2 py-1.5 text-zinc-700 dark:text-zinc-300 text-[14px] font-medium">
                  <Folder className="w-4 h-4 text-zinc-400 dark:text-zinc-500 stroke-[1.6]" />
                  <span>{language === 'zh' ? '未归类项目' : 'Other Projects'}</span>
                </div>

                <div className="space-y-0.5 mt-0.5">
                  {visibleSessions.map((s) => {
                    const isActiveSession = conversationId === s.id;
                    const isRunningNow = activeSessionIds.has(s.id) || (conversationId === s.id && isStreaming);
                    const status = isRunningNow ? 'running' : s.status || 'completed';
                    const timeStr = formatTimeAgoShort(s.updated_at || s.created_at);
                    return (
                      <div
                        key={s.id}
                        onClick={() => handleSelectSession(s)}
                        title={s.title || t.sidebar.untitledSession}
                        className={`flex items-center justify-between pl-8 pr-2 py-1.5 rounded-lg text-[14px] font-medium cursor-pointer transition ${isActiveSession
                          ? 'bg-zinc-200/70 dark:bg-zinc-800/80 text-zinc-950 dark:text-white'
                          : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
                          }`}
                      >
                        <span className="truncate flex-1 min-w-0">{s.title || t.sidebar.untitledSession}</span>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {status === 'running' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium shrink-0">
                              <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                              </span>
                              <span>{t.sidebar.statusRunning}</span>
                            </span>
                          ) : status === 'plan_ready' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-[10px] font-medium shrink-0">
                              <span>{t.sidebar.statusPlanReady}</span>
                            </span>
                          ) : status === 'incomplete' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-medium shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                              <span>{t.sidebar.statusIncomplete}</span>
                            </span>
                          ) : (
                            timeStr && (
                              <span className="text-[12px] text-zinc-400 dark:text-zinc-500 font-normal">
                                {timeStr}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {hasMore && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpandSessions('_unassigned');
                      }}
                      className="text-[12.5px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 pl-8 pr-2 py-1 transition cursor-pointer w-full text-left font-normal"
                    >
                      {isExpanded ? (language === 'zh' ? '收起' : 'Show less') : (language === 'zh' ? '展开显示' : 'Show more')}
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Bottom Section: Settings */}
      <div className="p-3 border-t border-zinc-200/70 dark:border-zinc-800/70">
        <button
          type="button"
          onClick={() => setIsSettingsModalOpen(true)}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[14px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60 cursor-pointer transition select-none"
        >
          <Settings className="w-4 h-4 text-zinc-600 dark:text-zinc-400 stroke-[1.8]" />
          <span>{t.sidebar.clientSettings}</span>
        </button>
      </div>

      {/* Add Project Modal */}
      <Modal
        isOpen={isAddProjectModalOpen}
        onClose={() => setIsAddProjectModalOpen(false)}
        title={t.modals.addProjectTitle}
        description={t.modals.addProjectDesc}
      >
        <form onSubmit={handleAddProject} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              {t.modals.projectPathLabel}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newProjectPath}
                onChange={(e) => setNewProjectPath(e.target.value)}
                placeholder={t.modals.projectPathPlaceholder}
                required
                className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 outline-none focus:border-purple-500/50"
              />
              <Button type="button" variant="outline" size="sm" onClick={handlePickFolder}>
                <FolderOpen className="w-3.5 h-3.5 mr-1" /> {t.common.browse}
              </Button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              {t.modals.projectNameLabel}
            </label>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder={t.modals.projectNamePlaceholder}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 outline-none focus:border-purple-500/50"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsAddProjectModalOpen(false)}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="purple" size="sm">
              {t.modals.addWorkspaceBtn}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Settings Modal */}
      <Modal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        title={t.modals.settingsTitle}
        description={t.modals.settingsDesc}
        className="max-w-2xl w-full"
      >
        <div className="space-y-6 text-sm text-zinc-700 dark:text-zinc-300">
          {/* Appearance & Language Group */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-1">{t.common.general || 'General'}</h4>
            <div className="bg-white dark:bg-zinc-950/50 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl overflow-hidden shadow-sm">
              {/* Theme Row */}
              <div className="flex items-center justify-between p-3.5 border-b border-zinc-200/80 dark:border-zinc-800/80">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-lg">
                    <Sun className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-medium text-[13px] text-zinc-900 dark:text-zinc-100">{t.modals.themeSettingsLabel}</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">{t.modals.themeSettingsDesc}</div>
                  </div>
                </div>
                <div className="flex bg-zinc-100 dark:bg-zinc-900/80 p-0.5 rounded-lg border border-zinc-200/50 dark:border-zinc-800/50">
                  {([
                    { id: 'light', label: t.common.themeLight, icon: Sun },
                    { id: 'dark', label: t.common.themeDark, icon: Moon },
                    { id: 'system', label: t.common.themeSystem, icon: Monitor },
                  ] as const).map((item) => (
                    <button
                      key={item.id}
                      onClick={(e) => setTheme(item.id, e)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium transition-all ${
                        theme === item.id
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs ring-1 ring-zinc-200/50 dark:ring-zinc-700/50'
                          : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                      }`}
                    >
                      <item.icon className="w-3.5 h-3.5" />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Language Row */}
              <div className="flex items-center justify-between p-3.5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg">
                    <Languages className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-medium text-[13px] text-zinc-900 dark:text-zinc-100">{t.modals.languageSettingsLabel}</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">{t.modals.languageSettingsDesc}</div>
                  </div>
                </div>
                <div className="flex bg-zinc-100 dark:bg-zinc-900/80 p-0.5 rounded-lg border border-zinc-200/50 dark:border-zinc-800/50">
                  {(['zh', 'en'] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setLanguage(lang)}
                      className={`px-4 py-1.5 text-xs rounded-md font-medium transition-all ${
                        language === lang
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs ring-1 ring-zinc-200/50 dark:ring-zinc-700/50'
                          : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                      }`}
                    >
                      {lang === 'zh' ? '简体中文' : 'English'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Permission Policy Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h4 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{t.sidebar.permissions || 'Permissions'}</h4>
              <span className="text-[10px] uppercase font-mono font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                {permissionMode}
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                {
                  id: 'auto-approve' as const,
                  title: t.modals.permAutoTitle,
                  desc: t.modals.permAutoDesc,
                  icon: ShieldAlert,
                  activeClass: 'border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 ring-1 ring-emerald-500/20',
                  iconColor: 'text-emerald-600 dark:text-emerald-400',
                },
                {
                  id: 'ask-first' as const,
                  title: t.modals.permConfirmTitle,
                  desc: t.modals.permConfirmDesc,
                  icon: Hand,
                  activeClass: 'border-amber-500/50 bg-amber-50/50 dark:bg-amber-500/10 text-amber-950 dark:text-amber-200 ring-1 ring-amber-500/20',
                  iconColor: 'text-amber-600 dark:text-amber-400',
                },
                {
                  id: 'sandbox' as const,
                  title: t.modals.permSandboxTitle,
                  desc: t.modals.permSandboxDesc,
                  icon: ShieldCheck,
                  activeClass: 'border-blue-500/50 bg-blue-50/50 dark:bg-blue-500/10 text-blue-950 dark:text-blue-200 ring-1 ring-blue-500/20',
                  iconColor: 'text-blue-600 dark:text-blue-400',
                },
              ].map((item) => {
                const isSelected = permissionMode === item.id;
                const IconComponent = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPermissionMode(item.id)}
                    className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all duration-200 ${
                      isSelected
                        ? item.activeClass
                        : 'border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-950/50 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-medium text-[13px] mb-1.5">
                      <IconComponent className={`w-4 h-4 shrink-0 ${isSelected ? item.iconColor : 'text-zinc-400 dark:text-zinc-500'}`} />
                      <span className={isSelected ? 'font-semibold' : 'font-medium'}>{item.title}</span>
                    </div>
                    <span className={`text-[11px] leading-relaxed ${isSelected ? '' : 'text-zinc-500 dark:text-zinc-400'}`}>
                      {item.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Network Proxy Routing Section */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider px-1">{t.common.network || 'Network'}</h4>
            <div className="bg-white dark:bg-zinc-950/50 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl overflow-hidden shadow-sm transition-all">
              <div className="flex items-center justify-between p-3.5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-medium text-[13px] text-zinc-900 dark:text-zinc-100">{t.modals.proxySettingsTitle}</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">{t.modals.proxySettingsDesc}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleToggleProxy()}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    proxyEnabled ? 'bg-purple-600' : 'bg-zinc-300 dark:bg-zinc-700'
                  }`}
                  role="switch"
                  aria-checked={proxyEnabled}
                  title={t.modals.proxyEnableLabel}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                      proxyEnabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {proxyEnabled && (
                <div className="p-4 bg-zinc-50/50 dark:bg-zinc-900/20 border-t border-zinc-200/80 dark:border-zinc-800/80 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                        {t.modals.proxyHostLabel}
                      </label>
                      <input
                        type="text"
                        value={inputHost}
                        onChange={(e) => setInputHost(e.target.value)}
                        placeholder="127.0.0.1"
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-900 dark:text-zinc-100 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                        {t.modals.proxyPortLabel}
                      </label>
                      <input
                        type="number"
                        value={inputPort}
                        onChange={(e) => setInputPort(e.target.value)}
                        placeholder="7890"
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-900 dark:text-zinc-100 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all shadow-sm"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    {/* Reachability Status Indicator */}
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          proxyIsReachable === true
                            ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                            : proxyIsReachable === false
                            ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                            : 'bg-zinc-300 dark:bg-zinc-600'
                        }`}
                      />
                      <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                        {proxyIsReachable === true
                          ? t.modals.proxyReachable(inputHost || '127.0.0.1', parseInt(inputPort, 10) || 7890)
                          : proxyIsReachable === false
                          ? t.modals.proxyUnreachable(inputHost || '127.0.0.1', parseInt(inputPort, 10) || 7890)
                          : (language === 'zh' ? '尚未测试连通性' : 'Not verified yet')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleTestProxy()}
                        disabled={proxyIsTesting}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition disabled:opacity-50 shadow-sm"
                      >
                        <RotateCw className={`w-3 h-3 ${proxyIsTesting ? 'animate-spin' : ''}`} />
                        <span>{proxyIsTesting ? t.modals.proxyTesting : t.modals.proxyTestBtn}</span>
                      </button>

                      <Button
                        type="button"
                        variant="purple"
                        size="sm"
                        onClick={() => void handleSaveProxy()}
                        className="h-[26px] text-[11px] px-3 rounded-lg"
                      >
                        {proxySavedMessage ? (
                          <>
                            <Check className="w-3.5 h-3.5 mr-1" />
                            {t.common.saved || '已保存'}
                          </>
                        ) : (
                          t.common.save
                        )}
                      </Button>
                    </div>
                  </div>

                  <p className="text-[10.5px] text-zinc-400 dark:text-zinc-500 leading-relaxed pt-1">
                    {t.modals.proxyHelpNote}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* CLI Backend & Footer */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-col gap-1.5 text-[10.5px] text-zinc-500">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-zinc-600 dark:text-zinc-400">{t.modals.cliBackendTitle}:</span>
                <span className="font-mono text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 px-1.5 py-0.5 rounded">agy stream-json</span>
                <span className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">Hybrid Core</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-zinc-600 dark:text-zinc-400">{t.modals.nativeStorageLabel}:</span>
                <span className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">~/.gemini/antigravity</span>
              </div>
            </div>

            <Button variant="default" size="sm" className="rounded-lg px-5 h-8 shrink-0" onClick={() => setIsSettingsModalOpen(false)}>
              {t.common.done}
            </Button>
          </div>
        </div>
      </Modal>
    </aside>
  );
}
