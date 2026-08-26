import React, { useState, useEffect } from 'react';
import {
  SquarePen,
  Folder,
  Plus,
  Trash2,
  Settings,
  ShieldCheck,
  FolderOpen,
  Languages,
  Sun,
  Moon,
  Monitor,
  MoreHorizontal,
  History,
  Clock,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useThemeStore, Theme } from '@/stores/useThemeStore';
import { useI18n, Language } from '@/i18n';
import { Project, Session, Message, ArtifactInfo } from '@/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { formatTimeAgo, formatTimeAgoShort, mergeTranscriptText, deduplicateConsecutiveParagraphs, sanitizeMarkdownContent } from '@/lib/utils';

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
  } = useSessionStore();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [expandedProjectSessions, setExpandedProjectSessions] = useState<Record<string, boolean>>({});
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPath, setNewProjectPath] = useState('');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  const toggleExpandSessions = (projId: string) => {
    setExpandedProjectSessions((prev) => ({
      ...prev,
      [projId]: !prev[projId],
    }));
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
  }, []);

  useEffect(() => {
    loadSessions();
  }, [activeProject, conversationId]);

  const handlePickFolder = async () => {
    try {
      const res = await invoke<string | null>('pick_folder');
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
      await loadProjects();
    } catch (err) {
      console.error('Failed to remove project:', err);
    }
  };

  const handleNewSession = () => {
    clearSession();
  };

  const handleSelectSession = async (s: Session, proj?: Project) => {
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
      // Load transcript steps
      const steps = await invoke<any[]>('get_conversation_transcript', {
        conversationId: s.id,
      });

      if (steps && steps.length > 0) {
        const loadedMessages: Message[] = [];
        let currentAssistantMsg: Message | null = null;

        for (const step of steps) {
          if (step.type === 'USER_INPUT') {
            if (currentAssistantMsg) {
              if (currentAssistantMsg.content) {
                currentAssistantMsg.content = deduplicateConsecutiveParagraphs(currentAssistantMsg.content);
              }
              const dur = currentAssistantMsg.completed_at
                ? Math.max(1, Math.round((currentAssistantMsg.completed_at - currentAssistantMsg.created_at) / 1000))
                : undefined;
              currentAssistantMsg.duration_seconds = dur;
              loadedMessages.push(currentAssistantMsg);
              currentAssistantMsg = null;
            }
            let rawContent = step.content || '';
            const match = rawContent.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
            if (match) {
              rawContent = match[1].trim();
            } else {
              // Strip metadata tags if present
              rawContent = rawContent
                .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/g, '')
                .replace(/<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/g, '')
                .trim();
            }

            // Skip raw checkpoint blocks if they accidentally appear as user inputs
            if (rawContent.startsWith('{{ CHECKPOINT') || rawContent.includes('**The earlier parts of this conversation have been truncated')) {
              continue;
            }

            loadedMessages.push({
              id: `user-${step.step_index ?? Date.now()}`,
              role: 'user',
              content: rawContent,
              created_at: step.created_at ? new Date(step.created_at).getTime() : Date.now(),
              status: 'done',
            });
          } else if (step.type === 'PLANNER_RESPONSE') {
            if (!currentAssistantMsg) {
              currentAssistantMsg = {
                id: `assistant-${step.step_index ?? Date.now()}`,
                role: 'assistant',
                content: step.content || '',
                thinking: step.thinking || '',
                toolCalls: [],
                created_at: step.created_at ? new Date(step.created_at).getTime() : Date.now(),
                status: 'done',
              };
            } else {
              if (step.content) {
                currentAssistantMsg.content = mergeTranscriptText(currentAssistantMsg.content || '', step.content);
              }
              if (step.thinking) {
                currentAssistantMsg.thinking = mergeTranscriptText(currentAssistantMsg.thinking || '', step.thinking);
              }
            }

            if (step.created_at) {
              currentAssistantMsg.completed_at = new Date(step.created_at).getTime();
            }

            if (step.tool_calls && Array.isArray(step.tool_calls)) {
              for (const tc of step.tool_calls) {
                let parsedArgs = tc.args;
                if (typeof parsedArgs === 'string') {
                  try {
                    parsedArgs = JSON.parse(parsedArgs);
                  } catch { }
                }

                let summary = parsedArgs?.toolSummary || tc.name || 'tool';
                if (typeof summary === 'string') {
                  summary = summary.replace(/^"|"$/g, '').trim();
                }

                currentAssistantMsg.toolCalls = currentAssistantMsg.toolCalls || [];
                const stepIdx = step.step_index ?? Date.now();
                const toolName = tc.name || 'tool';

                const isDup = currentAssistantMsg.toolCalls.some(
                  (t) => t.step_index === stepIdx && t.tool_name === toolName
                );

                if (!isDup) {
                  currentAssistantMsg.toolCalls.push({
                    step_index: stepIdx,
                    tool_name: toolName,
                    tool_summary: summary,
                    tool_args: parsedArgs,
                    state: 'DONE',
                  });
                }
              }
            }
          }
        }

        if (currentAssistantMsg) {
          if (currentAssistantMsg.content) {
            currentAssistantMsg.content = sanitizeMarkdownContent(
              deduplicateConsecutiveParagraphs(currentAssistantMsg.content)
            );
          }
          const dur = currentAssistantMsg.completed_at
            ? Math.max(1, Math.round((currentAssistantMsg.completed_at - currentAssistantMsg.created_at) / 1000))
            : undefined;
          currentAssistantMsg.duration_seconds = dur;
          loadedMessages.push(currentAssistantMsg);
        }

        setMessages(loadedMessages);
      } else {
        setMessages([]);
      }

      // Load raw transcript text for inspection & debugging
      try {
        const rawText = await invoke<string>('get_raw_transcript_text', {
          conversationId: s.id,
        });
        setRawTranscriptText(rawText || '');
      } catch {
        setRawTranscriptText('');
      }

      // Load artifacts for this session
      const artifacts = await invoke<ArtifactInfo[]>('get_brain_artifacts', {
        conversationId: s.id,
      });
      setArtifacts(artifacts);
      const plan = artifacts.find((a) => a.name === 'implementation_plan.md');
      if (plan) {
        setPlanArtifact(plan);
      } else {
        setPlanArtifact(null);
      }
    } catch (err) {
      console.error('Failed to load session transcript:', err);
    }
  };

  return (
    <aside className="h-full flex flex-col justify-between bg-zinc-50/70 dark:bg-zinc-950/80 border-r border-zinc-200 dark:border-zinc-800/80 text-zinc-700 dark:text-zinc-300 transition-colors select-none">
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
                          {timeStr && (
                            <span className="text-[12px] text-zinc-400 dark:text-zinc-500 font-normal shrink-0 ml-2">
                              {timeStr}
                            </span>
                          )}
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
                        {timeStr && (
                          <span className="text-[12px] text-zinc-400 dark:text-zinc-500 font-normal shrink-0 ml-2">
                            {timeStr}
                          </span>
                        )}
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

      {/* Bottom Section: Permission Guard & Settings */}
      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/80 dark:bg-zinc-950 space-y-2">
        {/* Permission Mode Switcher */}
        <div className="bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800/80 rounded-lg p-2.5 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400 stroke-[2.2]" />
              {t.sidebar.permissions}
            </span>
            <span className="text-[10.5px] uppercase font-mono font-medium text-zinc-500">
              {permissionMode}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1 text-[11px]">
            <button
              onClick={() => setPermissionMode('auto-approve')}
              className={`py-1 rounded-md font-medium transition cursor-pointer ${permissionMode === 'auto-approve'
                ? 'bg-emerald-100 text-emerald-900 font-semibold border border-emerald-300 dark:bg-emerald-600/30 dark:text-emerald-300 dark:border-emerald-500/40'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
            >
              {t.sidebar.permAuto}
            </button>
            <button
              onClick={() => setPermissionMode('ask-first')}
              className={`py-1 rounded-md font-medium transition cursor-pointer ${permissionMode === 'ask-first'
                ? 'bg-amber-100 text-amber-900 font-semibold border border-amber-300 dark:bg-amber-600/30 dark:text-amber-300 dark:border-amber-500/40'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
            >
              {t.sidebar.permConfirm}
            </button>
            <button
              onClick={() => setPermissionMode('sandbox')}
              className={`py-1 rounded-md font-medium transition cursor-pointer ${permissionMode === 'sandbox'
                ? 'bg-blue-100 text-blue-900 font-semibold border border-blue-300 dark:bg-blue-600/30 dark:text-blue-300 dark:border-blue-500/40'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
            >
              {t.sidebar.permSandbox}
            </button>
          </div>
        </div>

        {/* Settings button */}
        <div
          onClick={() => setIsSettingsModalOpen(true)}
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13.5px] font-medium text-zinc-800 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60 cursor-pointer transition select-none"
        >
          <Settings className="w-4 h-4 text-zinc-500 dark:text-zinc-400 stroke-[2]" />
          <span>{language === 'zh' ? '客户端设置与环境' : 'Client Settings & Environment'}</span>
        </div>
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
      >
        <div className="space-y-4 text-xs text-zinc-700 dark:text-zinc-300">
          {/* Theme Selection */}
          <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-zinc-900 dark:text-zinc-200 flex items-center gap-1.5">
                  <Sun className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  {t.modals.themeSettingsLabel}
                </div>
                <div className="text-zinc-500 text-[11px] mt-0.5">
                  {t.modals.themeSettingsDesc}
                </div>
              </div>
              <div className="flex items-center bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
                {([
                  { id: 'light', label: t.common.themeLight, icon: Sun },
                  { id: 'dark', label: t.common.themeDark, icon: Moon },
                  { id: 'system', label: t.common.themeSystem, icon: Monitor },
                ] as const).map((item) => (
                  <button
                    key={item.id}
                    onClick={(e) => setTheme(item.id, e)}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md font-medium transition cursor-pointer ${theme === item.id
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                      }`}
                  >
                    <item.icon className="w-3 h-3" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Language Selection */}
          <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-zinc-900 dark:text-zinc-200 flex items-center gap-1.5">
                  <Languages className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  {t.modals.languageSettingsLabel}
                </div>
                <div className="text-zinc-500 text-[11px] mt-0.5">
                  {t.modals.languageSettingsDesc}
                </div>
              </div>
              <div className="flex items-center bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
                {(['zh', 'en'] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setLanguage(lang)}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition ${language === lang
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                      }`}
                  >
                    {lang === 'zh' ? '简体中文' : 'English'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* CLI Backend Section */}
          <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2">
            <div className="font-medium text-zinc-900 dark:text-zinc-200">{t.modals.cliBackendTitle}</div>
            <div className="text-zinc-600 dark:text-zinc-400 text-[11px]">
              {t.modals.cliEngineLabel}: <span className="font-mono text-purple-600 dark:text-purple-400">agy stream-json (Local Subprocess)</span>
            </div>
            <div className="text-zinc-600 dark:text-zinc-400 text-[11px]">
              {t.modals.platformLabel}: <span className="font-mono text-zinc-800 dark:text-zinc-200">macOS / Windows Hybrid Core</span>
            </div>
            <div className="text-zinc-600 dark:text-zinc-400 text-[11px]">
              {t.modals.nativeStorageLabel}: <span className="font-mono text-zinc-800 dark:text-zinc-200">~/.gemini/antigravity</span>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="default" size="sm" onClick={() => setIsSettingsModalOpen(false)}>
              {t.common.done}
            </Button>
          </div>
        </div>
      </Modal>
    </aside>
  );
}
