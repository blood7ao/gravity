import React from 'react';
import { ListTodo, Play, RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useI18n } from '@/i18n';
import { MarkdownRenderer } from '@/components/canvas/MarkdownRenderer';
import { Button } from '@/components/ui/Button';

export function PlanReviewer() {
  const { t } = useI18n();
  const { planArtifact, setPlanArtifact, activeProject, permissionMode } = useWorkspaceStore();
  const {
    conversationId,
    setMode,
    currentEffort,
    selectedModel,
    selectedAgent,
    addUserMessage,
    startAssistantTurn,
  } = useSessionStore();

  const handleApprovePlan = async () => {
    setMode('accept-edits');
    const prompt = t.inspector.approvePromptText;
    addUserMessage(prompt);
    startAssistantTurn();

    try {
      const sessionInfo = await invoke<any>('get_current_session_info');
      const needsRestart =
        !sessionInfo?.is_running ||
        sessionInfo?.mode !== 'accept-edits' ||
        (sessionInfo?.model || null) !== (selectedModel || null) ||
        (sessionInfo?.agent || null) !== selectedAgent;
      if (needsRestart && activeProject?.path) {
        await invoke('start_session', {
          projectDir: activeProject.path,
          mode: 'accept-edits',
          effort: currentEffort,
          conversationId: conversationId || null,
          model: selectedModel || null,
          agent: selectedAgent,
          skipPermissions: permissionMode === 'auto-approve',
        });
      }
      await invoke('send_prompt', { content: prompt });
    } catch (e) {
      console.error('Failed to approve plan:', e);
    }
  };

  const handleRefresh = async () => {
    if (!conversationId) return;
    try {
      const content = await invoke<string | null>('read_brain_artifact', {
        conversationId,
        name: 'implementation_plan.md',
      });
      if (content) {
        setPlanArtifact({
          name: 'implementation_plan.md',
          path: '',
          content,
          updated_at: Date.now(),
        });
      }
    } catch (e) {
      console.error('Failed to refresh plan:', e);
    }
  };

  if (!planArtifact) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500">
        <ListTodo className="w-12 h-12 mb-3 text-zinc-300 dark:text-zinc-700 stroke-1" />
        <div className="font-semibold text-zinc-700 dark:text-zinc-400">{t.inspector.noPlan}</div>
        <p className="text-xs text-zinc-500 dark:text-zinc-600 mt-1 max-w-xs leading-relaxed">
          {t.inspector.noPlanDesc}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col justify-between bg-zinc-50/40 dark:bg-zinc-950/40 select-text overflow-hidden relative">
      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 pb-20">
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <ListTodo className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-200">{t.inspector.planTitle}</span>
          </div>
          <button
            onClick={handleRefresh}
            className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 transition"
            title={t.inspector.reloadPlan}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <MarkdownRenderer content={planArtifact.content} />
      </div>

      {/* Floating Sticky Approve CTA Bar */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between shadow-xl dark:shadow-2xl z-10">
        <div className="text-xs text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-900 dark:text-zinc-200">{t.inspector.readyToExecute}</span> {t.inspector.reviewAboveChanges}
        </div>
        <Button
          variant="purple"
          size="md"
          onClick={handleApprovePlan}
          className="gap-2 shadow-lg shadow-purple-500/20 dark:shadow-purple-900/40 text-xs font-semibold"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          {t.inspector.approvePlanBtn}
        </Button>
      </div>
    </div>
  );
}
