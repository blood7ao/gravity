import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '@/stores/useSessionStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { ArtifactInfo } from '@/types';

export function useAgySession() {
  useEffect(() => {
    let unlistenAgyEvent: (() => void) | null = null;
    let unlistenStatus: (() => void) | null = null;
    let unlistenStderr: (() => void) | null = null;
    let unlistenBrain: (() => void) | null = null;
    let lastStderr = '';

    const setupListeners = async () => {
      // 1. Listen for raw agy NDJSON stream events
      unlistenAgyEvent = await listen<string>('agy-event', async (event) => {
        try {
          const payload = JSON.parse(event.payload);
          const sessionStore = useSessionStore.getState();
          const workspaceStore = useWorkspaceStore.getState();

          switch (payload.event) {
            case 'init': {
              if (payload.conversation_id) {
                sessionStore.setConversationId(payload.conversation_id);
              }
              sessionStore.setStatusMessage('Session initialized');
              sessionStore.addRawLog({
                type: 'init',
                raw: event.payload,
                summary: 'Session Initialized',
              });
              break;
            }

            case 'step_update': {
              const step = payload.step_update;
              if (!step) break;

              sessionStore.addRawLog({
                type: 'step_update',
                raw: event.payload,
                step_index: step.step_index,
                summary: step.step_type === 'tool_call'
                  ? `Tool: ${step.tool_name}`
                  : step.step_type === 'agent_response' && step.thinking
                  ? 'Thinking Delta'
                  : 'Text Delta',
              });

              if (step.step_type === 'agent_response') {
                if (step.thinking) {
                  sessionStore.appendThinkingDelta(step.thinking);
                }
                if (step.text_delta) {
                  sessionStore.appendTextDelta(step.text_delta);
                }
              } else if (step.step_type === 'tool_call') {
                sessionStore.handleToolCall({
                  step_index: step.step_index ?? Date.now(),
                  tool_name: step.tool_name ?? 'tool',
                  tool_summary: step.tool_summary,
                  tool_args: step.tool_args,
                  duration_seconds: step.duration_seconds,
                  state: step.state ?? 'DONE',
                });

                // Auto-collect modified files for Monaco Diff viewer
                if (
                  step.tool_name === 'replace_file_content' ||
                  step.tool_name === 'write_to_file'
                ) {
                  const targetFile =
                    step.tool_args?.TargetFile || step.tool_args?.file_path;
                  if (targetFile) {
                    try {
                      const currentContent = await invoke<string>('read_file_content', {
                        filePath: targetFile,
                      });
                      workspaceStore.addModifiedFile(
                        targetFile,
                        step.tool_args?.TargetContent || '',
                        currentContent
                      );
                    } catch (e) {
                      workspaceStore.addModifiedFile(targetFile, '', step.tool_args?.CodeContent || '');
                    }
                  }
                }
              }
              break;
            }

            case 'result': {
              sessionStore.addRawLog({
                type: 'result',
                raw: event.payload,
                summary: `Turn Completed (${payload.result?.status || 'DONE'})`,
              });
              sessionStore.finishTurn(payload.result);
              sessionStore.setStatusMessage('Turn completed');

              const cid = payload.result?.conversation_id || sessionStore.conversationId;
              const activeProj = workspaceStore.activeProject;

              // Persist session record to SQLite
              if (cid && activeProj) {
                const currentMsgs = useSessionStore.getState().messages;
                const firstUserMsg = currentMsgs.find((m) => m.role === 'user')?.content || 'New Session';
                const cleanTitle = firstUserMsg.replace(/<[^>]+>/g, '').trim().slice(0, 40) || 'New Session';

                try {
                  await invoke('save_session', {
                    record: {
                      id: cid,
                      project_path: activeProj.path,
                      title: cleanTitle,
                      created_at: Date.now(),
                      updated_at: Date.now(),
                      mode: sessionStore.currentMode,
                      effort: sessionStore.currentEffort,
                      model: sessionStore.selectedModel || null,
                      agent: sessionStore.selectedAgent,
                    },
                  });
                } catch (e) {
                  console.error('Failed to save session to DB:', e);
                }
              }

              // Refresh artifacts and raw transcript on turn completion
              if (cid) {
                try {
                  const rawText = await invoke<string>('get_raw_transcript_text', {
                    conversationId: cid,
                  });
                  if (rawText) {
                    sessionStore.setRawTranscriptText(rawText);
                  }

                  const items = await invoke<ArtifactInfo[]>('get_brain_artifacts', {
                    conversationId: cid,
                  });
                  workspaceStore.setArtifacts(items);
                  const plan = items.find((a) => a.name === 'implementation_plan.md');
                  if (plan) {
                    workspaceStore.setPlanArtifact(plan);
                    if (sessionStore.currentMode === 'plan') {
                      workspaceStore.setInspectorTab('plan');
                      workspaceStore.toggleInspector(true);
                    }
                  }
                } catch (e) {
                  console.warn('Failed to load artifacts on result:', e);
                }
              }
              break;
            }
          }
        } catch (err) {
          console.error('Error processing agy event:', err, event.payload);
        }
      });

      // 2. Listen for agy stderr
      unlistenStderr = await listen<string>('agy-stderr', (event) => {
        console.warn('[agy stderr]', event.payload);
        if (event.payload && event.payload.trim()) {
          lastStderr = event.payload.trim();
          useSessionStore.getState().addRawLog({
            type: 'stderr',
            raw: event.payload,
            summary: 'STDERR Output',
          });
        }
      });

      // 3. Listen for agy status changes
      unlistenStatus = await listen<string>('agy-status', (event) => {
        const isRunning = event.payload === 'running';
        const sessionStore = useSessionStore.getState();
        sessionStore.setStatusMessage(isRunning ? 'Agent running' : 'Ready');

        if (!isRunning && sessionStore.isStreaming) {
          // If process stopped while state is still streaming, finish turn to unblock UI
          sessionStore.finishTurn({
            status: lastStderr ? 'ERROR' : 'DONE',
            response: lastStderr ? `进程已结束: ${lastStderr}` : '',
          });
        }
      });

      // 4. Listen for BrainWatcher artifact file updates
      unlistenBrain = await listen<{ conversation_id: string; artifact: ArtifactInfo }>(
        'brain-artifact-update',
        (event) => {
          const { artifact } = event.payload;
          const workspaceStore = useWorkspaceStore.getState();
          if (artifact.name === 'implementation_plan.md') {
            workspaceStore.setPlanArtifact(artifact);
            workspaceStore.setInspectorTab('plan');
            workspaceStore.toggleInspector(true);
          }

          // Update artifact list
          const currentArts = workspaceStore.artifacts;
          const existing = currentArts.filter((a) => a.name !== artifact.name);
          workspaceStore.setArtifacts([...existing, artifact]);
        }
      );
    };

    setupListeners();

    return () => {
      if (unlistenAgyEvent) unlistenAgyEvent();
      if (unlistenStderr) unlistenStderr();
      if (unlistenStatus) unlistenStatus();
      if (unlistenBrain) unlistenBrain();
    };
  }, []);
}
