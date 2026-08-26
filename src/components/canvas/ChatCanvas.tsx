import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  AlertCircle,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  Bug,
  Terminal,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '@/stores/useSessionStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useI18n } from '@/i18n';
import { ThinkingBlock } from './ThinkingBlock';
import { ActionPillGroup } from './ActionPillGroup';
import { EditedFilesCard } from './EditedFilesCard';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ProjectDropdown } from './ProjectDropdown';
import { PromptHub } from '@/components/prompt/PromptHub';
import { Badge } from '@/components/ui/Badge';
import { AntigravityLogo } from '@/components/ui/AntigravityLogo';
import { Message } from '@/types';

function AssistantActionBar({
  message,
  onRetry,
}: {
  message: Message;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'like' | 'dislike' | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy response:', e);
    }
  };

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div className="flex items-center gap-2.5 pt-2 text-zinc-500 dark:text-zinc-400 text-xs select-none">
      {/* Copy */}
      <button
        onClick={handleCopy}
        className="p-1.5 rounded-md hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 transition"
        title={t.common.copy}
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>

      {/* Thumbs Up */}
      <button
        onClick={() => setFeedback(feedback === 'like' ? null : 'like')}
        className={`p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition ${
          feedback === 'like'
            ? 'text-purple-600 dark:text-purple-400'
            : 'hover:text-zinc-900 dark:hover:text-zinc-100'
        }`}
        title={t.canvas.like}
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>

      {/* Thumbs Down */}
      <button
        onClick={() => setFeedback(feedback === 'dislike' ? null : 'dislike')}
        className={`p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition ${
          feedback === 'dislike'
            ? 'text-red-500 dark:text-red-400'
            : 'hover:text-zinc-900 dark:hover:text-zinc-100'
        }`}
        title={t.canvas.dislike}
      >
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>

      {/* Retry / Regenerate */}
      {onRetry && (
        <button
          onClick={onRetry}
          className="p-1.5 rounded-md hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 transition cursor-pointer"
          title={t.canvas.retry}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}

      {/* View Raw Logs */}
      <button
        onClick={() => {
          useWorkspaceStore.getState().setInspectorTab('raw_logs');
          useWorkspaceStore.getState().toggleInspector(true);
        }}
        className="p-1.5 rounded-md hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 transition cursor-pointer flex items-center gap-1 text-[11px]"
        title={t.inspector.viewRawOutput}
      >
        <Terminal className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
        <span className="hidden sm:inline text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 font-sans">
          {t.inspector.rawLogsTab}
        </span>
      </button>

      {/* Duration & Timestamp */}
      <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono ml-1 flex items-center gap-1.5">
        {message.duration_seconds && message.duration_seconds > 0 && (
          <>
            <span>{t.canvas.turnElapsed(message.duration_seconds)}</span>
            <span className="text-zinc-300 dark:text-zinc-700">·</span>
          </>
        )}
        <span>{formatTimestamp(message.created_at)}</span>
      </span>
    </div>
  );
}

export function ChatCanvas() {
  const { t, language } = useI18n();
  const {
    messages,
    isStreaming,
    currentMode,
    currentEffort,
    conversationId,
    selectedModel,
    selectedAgent,
    setMode,
    addUserMessage,
    startAssistantTurn,
    finishTurn,
    setStatusMessage,
  } = useSessionStore();

  const { activeProject, permissionMode, setIsAddProjectModalOpen } = useWorkspaceStore();

  const scrollBottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when messages update or stream
  useEffect(() => {
    scrollBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const [isProjectPickerOpen, setIsProjectPickerOpen] = useState(false);

  const quickPrompts = [
    {
      icon: Sparkles,
      iconColor: 'text-purple-600 dark:text-purple-400',
      title: t.canvas.quickPrompts.buildTitle,
      desc: t.canvas.quickPrompts.buildDesc,
      mode: 'accept-edits' as const,
      prompt: t.canvas.quickPrompts.buildPrompt,
    },
    {
      icon: RotateCcw,
      iconColor: 'text-emerald-500 dark:text-emerald-400',
      title: t.canvas.quickPrompts.reviewTitle,
      desc: t.canvas.quickPrompts.reviewDesc,
      mode: 'plan' as const,
      prompt: t.canvas.quickPrompts.reviewPrompt,
    },
    {
      icon: Bug,
      iconColor: 'text-amber-500 dark:text-amber-400',
      title: t.canvas.quickPrompts.fixTitle,
      desc: t.canvas.quickPrompts.fixDesc,
      mode: 'accept-edits' as const,
      prompt: t.canvas.quickPrompts.fixPrompt,
    },
  ];

  const handleQuickPrompt = async (p: (typeof quickPrompts)[0]) => {
    if (!activeProject?.path) {
      setIsAddProjectModalOpen(true);
      return;
    }

    setMode(p.mode);
    addUserMessage(p.prompt);
    startAssistantTurn();

    try {
      const sessionInfo = await invoke<any>('get_current_session_info');
      const needsRestart =
        !sessionInfo?.is_running ||
        sessionInfo?.conversation_id !== (conversationId || null) ||
        sessionInfo?.project_dir !== activeProject.path ||
        sessionInfo?.mode !== p.mode ||
        (sessionInfo?.model || null) !== (selectedModel || null) ||
        (sessionInfo?.agent || null) !== selectedAgent;

      if (needsRestart) {
        await invoke('start_session', {
          projectDir: activeProject.path,
          mode: p.mode,
          effort: currentEffort,
          conversationId: conversationId || null,
          model: selectedModel || null,
          agent: selectedAgent,
          skipPermissions: permissionMode === 'auto-approve',
        });
      }

      await invoke('send_prompt', { content: p.prompt });
    } catch (err: any) {
      console.error('Failed to dispatch quick prompt:', err);
      const errMsg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
      finishTurn({
        status: 'ERROR',
        response: `启动会话失败: ${errMsg}`,
      });
      setStatusMessage('Error');
    }
  };

  const handleRetryLastPrompt = async (lastUserPrompt: string) => {
    if (!activeProject?.path || isStreaming) return;
    addUserMessage(lastUserPrompt);
    startAssistantTurn();

    try {
      const sessionInfo = await invoke<any>('get_current_session_info');
      const needsRestart =
        !sessionInfo?.is_running ||
        sessionInfo?.conversation_id !== (conversationId || null) ||
        sessionInfo?.project_dir !== activeProject.path ||
        sessionInfo?.mode !== currentMode ||
        (sessionInfo?.model || null) !== (selectedModel || null) ||
        (sessionInfo?.agent || null) !== selectedAgent;

      if (needsRestart) {
        await invoke('start_session', {
          projectDir: activeProject.path,
          mode: currentMode,
          effort: currentEffort,
          conversationId: conversationId || null,
          model: selectedModel || null,
          agent: selectedAgent,
          skipPermissions: permissionMode === 'auto-approve',
        });
      }

      await invoke('send_prompt', { content: lastUserPrompt });
    } catch (err: any) {
      console.error('Failed to retry prompt:', err);
      const errMsg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
      finishTurn({
        status: 'ERROR',
        response: `重试失败: ${errMsg}`,
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative bg-white dark:bg-[#121215] transition-colors">
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-5 select-text">
        {messages.length === 0 ? (
          /* Empty / Welcome State matching screenshot */
          <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center space-y-8 my-auto pt-16 pb-8">
            {/* Header Title with interactive Project Selector */}
            <div className="relative text-center">
              <h1 className="text-2xl sm:text-3xl font-medium text-zinc-900 dark:text-zinc-100 tracking-tight flex items-center justify-center flex-wrap gap-x-1.5 gap-y-1">
                <span>{language === 'zh' ? '我们应该在' : 'What should we do in '}</span>
                <span className="relative inline-block">
                  <button
                    type="button"
                    onClick={() => setIsProjectPickerOpen(!isProjectPickerOpen)}
                    className="underline decoration-dotted decoration-zinc-400 dark:decoration-zinc-500 underline-offset-4 hover:decoration-zinc-900 dark:hover:decoration-zinc-100 text-zinc-900 dark:text-zinc-100 hover:text-purple-600 dark:hover:text-purple-400 font-semibold transition cursor-pointer"
                    title={activeProject?.path || t.canvas.selectProject}
                  >
                    {activeProject ? activeProject.name : (language === 'zh' ? '项目' : t.canvas.selectProject)}
                  </button>

                  <ProjectDropdown
                    isOpen={isProjectPickerOpen}
                    onClose={() => setIsProjectPickerOpen(false)}
                    align="left"
                    direction="down"
                    className="top-full mt-2"
                  />
                </span>
                <span>{language === 'zh' ? '中做些什么？' : '?'}</span>
              </h1>
            </div>

            {/* Quick Action Cards */}
            <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-3 text-left pt-1">
              {quickPrompts.map((item, idx) => {
                const IconComponent = item.icon;
                return (
                  <div
                    key={idx}
                    onClick={() => handleQuickPrompt(item)}
                    className="group relative flex flex-col justify-between p-4 rounded-2xl border border-zinc-200/90 dark:border-zinc-800/80 bg-white/60 dark:bg-zinc-900/30 hover:bg-white dark:hover:bg-zinc-900/80 hover:border-zinc-300 dark:hover:border-zinc-700 cursor-pointer transition-all shadow-2xs hover:shadow-xs min-h-[115px]"
                  >
                    <div className="flex items-center justify-between">
                      <IconComponent className={`w-5 h-5 ${item.iconColor}`} />
                    </div>
                    <div className="pt-4">
                      <div className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200 group-hover:text-zinc-950 dark:group-hover:text-white transition leading-snug">
                        {item.title}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Conversation Messages */
          messages.map((msg, index) => {
            const isUser = msg.role === 'user';
            const totalDuration = msg.toolCalls?.reduce((acc, tc) => acc + (tc.duration_seconds || 0), 0) || 0;
            const prevUserMsg = !isUser
              ? messages.slice(0, index).reverse().find((m) => m.role === 'user')?.content
              : undefined;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  isUser ? 'items-end' : 'items-start'
                } max-w-3xl mx-auto w-full`}
              >
                {isUser ? (
                  /* Sleek User Prompt Pill */
                  <div className="bg-[#f0f0f4] dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 text-[14px] px-4 py-2 rounded-2xl max-w-[85%] font-sans leading-relaxed shadow-2xs font-normal border border-zinc-200/50 dark:border-zinc-700/40">
                    {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}
                    {msg.imageAttachments && msg.imageAttachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {msg.imageAttachments.map((image) => (
                          <img
                            key={image.id}
                            src={image.previewUrl}
                            alt={image.name}
                            className="h-28 max-w-52 rounded-lg border border-zinc-300/80 object-cover dark:border-zinc-700/80"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Clean Direct Assistant Turn Container */
                  <div className="w-full space-y-2">
                    {/* Turn Duration & Collapsible Thinking Indicator */}
                    {(msg.thinking || msg.status === 'streaming' || (msg.duration_seconds && msg.duration_seconds > 0)) && (
                      <ThinkingBlock
                        thinking={msg.thinking}
                        isStreaming={msg.status === 'streaming'}
                        durationSeconds={msg.duration_seconds || totalDuration}
                        createdAt={msg.created_at}
                      />
                    )}

                    {/* Aggregated Read/Command Tools */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <ActionPillGroup toolCalls={msg.toolCalls} />
                    )}

                    {/* Error Box */}
                    {msg.status === 'error' && (
                      <div className="p-3 bg-red-50/80 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800/60 text-red-800 dark:text-red-200 text-xs flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                        <div className="font-mono whitespace-pre-wrap break-all leading-relaxed">
                          {msg.content || t.common.failed}
                        </div>
                      </div>
                    )}

                    {/* Clean Markdown Typography (Direct on Canvas) */}
                    {msg.content && msg.status !== 'error' && (
                      <div className="py-0.5">
                        <MarkdownRenderer
                          content={msg.content}
                          isStreaming={msg.status === 'streaming'}
                        />
                      </div>
                    )}

                    {/* Codex-style Edited Files Summary Card */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <EditedFilesCard toolCalls={msg.toolCalls} />
                    )}

                    {/* Action Footer (Copy, Thumbs, Retry, Timestamp) */}
                    {msg.status !== 'streaming' && (
                      <AssistantActionBar
                        message={msg}
                        onRetry={prevUserMsg ? () => handleRetryLastPrompt(prevUserMsg) : undefined}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={scrollBottomRef} />
      </div>

      {/* Floating Bottom Prompt Input */}
      <div className="shrink-0 bg-gradient-to-t from-white via-white/90 dark:from-[#121215] dark:via-[#121215]/90 to-transparent pt-3">
        <PromptHub />
      </div>
    </div>
  );
}
