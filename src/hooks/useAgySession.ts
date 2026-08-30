import { useEffect } from 'react';
import { listen, type Event } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '@/stores/useSessionStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { ArtifactInfo, FileSnapshot } from '@/types';
import { parseTranscriptStepsToMessages } from '@/lib/utils';

export function useAgySession() {
  useEffect(() => {
    // `disposed` guards the async race between Tauri `listen()` IPC promises
    // and React unmount (React Strict Mode / fast navigation). If the effect
    // is disposed before a `listen()` promise resolves, the listener must be
    // detached the moment it attaches; otherwise it is permanently bound to
    // the global Tauri event bus and its unlisten function is never called,
    // leaking memory and double-processing NDJSON messages / tool calls.
    let disposed = false;
    const unlistens: (() => void)[] = [];
    let lastStderr = '';

    // Register a Tauri event listener. When the `listen()` IPC promise
    // resolves, either the effect is still alive (store the unlisten fn for
    // the cleanup) or it has already unmounted (detach immediately).
    const register = <T>(eventName: string, handler: (event: Event<T>) => void) => {
      listen<T>(eventName, handler)
        .then((unlisten) => {
          if (disposed) {
            unlisten();
          } else {
            unlistens.push(unlisten);
          }
        })
        .catch((err) => {
          console.error(`[useAgySession] failed to listen for "${eventName}":`, err);
        });
    };

    const trackEditedFile = async (targetFile: string) => {
      const [snapshot, currentContent] = await Promise.all([
        invoke<FileSnapshot | null>('get_file_snapshot', { filePath: targetFile }).catch(() => null),
        invoke<string>('read_file_content', { filePath: targetFile }).catch(() => ''),
      ]);
      if (disposed) return;

      let originalContent = snapshot?.content ?? '';
      if (!snapshot || snapshot.content === null) {
        // HEAD is display-only fallback. It is explicitly marked non-revertible
        // because it may not match the working tree before this turn.
        originalContent = await invoke<string>('git_show_file', { filePath: targetFile }).catch(() => '');
        if (disposed) return;
      }

      useWorkspaceStore.getState().addModifiedFile(
        targetFile,
        originalContent,
        currentContent,
        snapshot?.exists,
        snapshot?.can_revert ?? false
      );
    };

    // 1. Listen for raw agy NDJSON stream events
    register<string>('agy-event', async (event) => {
      if (disposed) return;
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
                tool_result: step.tool_result || step.result || step.output,
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
                    await trackEditedFile(targetFile);
                  } catch (e) {
                    if (disposed) return;
                    workspaceStore.addModifiedFile(targetFile, undefined, step.tool_args?.CodeContent || '', undefined, false);
                  }
                }
              }
            }
            break;
          }

          case 'result': {
            // A result belongs to the just-finished turn. Do not let its
            // stderr poison the next process-stop decision.
            lastStderr = '';
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
            if (disposed) return;

            // Refresh artifacts and raw transcript on turn completion
            if (cid) {
              try {
                const rawText = await invoke<string>('get_raw_transcript_text', {
                  conversationId: cid,
                });
                if (disposed) return;
                if (rawText) {
                  sessionStore.setRawTranscriptText(rawText);
                }

                const items = await invoke<ArtifactInfo[]>('get_brain_artifacts', {
                  conversationId: cid,
                });
                if (disposed) return;
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
    register<string>('agy-stderr', (event) => {
      if (disposed) return;
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
    register<string>('agy-status', (event) => {
      if (disposed) return;
      const isRunning = event.payload === 'running';
      const sessionStore = useSessionStore.getState();
      if (isRunning) {
        lastStderr = '';
      }
      sessionStore.setStatusMessage(isRunning ? 'Agent running' : 'Ready');

      if (!isRunning && sessionStore.isStreaming) {
        // If process stopped while state is still streaming, check if response was generated
        const msgs = sessionStore.messages;
        const lastMsg = msgs[msgs.length - 1];
        const hasText = Boolean(lastMsg && lastMsg.content && lastMsg.content.trim());
        const isInterrupted = !hasText || Boolean(lastStderr);

        sessionStore.finishTurn({
          status: isInterrupted ? 'ERROR' : 'DONE',
          response: lastStderr
            ? `进程已结束: ${lastStderr}`
            : !hasText
            ? '任务执行中断（检测到超时或进程退出）'
            : '',
        });
      }
    });

    // 4. Listen for BrainWatcher artifact file updates
    register<{ conversation_id: string; artifact: ArtifactInfo }>(
      'brain-artifact-update',
      (event) => {
        if (disposed) return;
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

    // 5. Live stream external CLI/IDE transcript updates
    register<{ conversation_id: string; steps: any[]; is_active: boolean }>(
      'brain-transcript-update',
      async (event) => {
        if (disposed) return;
        const { conversation_id, steps, is_active } = event.payload;
        const sessionStore = useSessionStore.getState();

        if (sessionStore.conversationId === conversation_id) {
          const parsedMessages = parseTranscriptStepsToMessages(steps, is_active);
          if (parsedMessages.length > 0) {
            sessionStore.setMessages(parsedMessages);
          }

          if (is_active) {
            sessionStore.setIsStreaming(true);
            sessionStore.setStatusMessage('Agent running (CLI)');
          } else if (sessionStore.isStreaming) {
            sessionStore.finishTurn();
            sessionStore.setStatusMessage('Ready');
          }

          try {
            const rawText = await invoke<string>('get_raw_transcript_text', {
              conversationId: conversation_id,
            });
            if (disposed) return;
            if (rawText) {
              sessionStore.setRawTranscriptText(rawText);
            }
          } catch {}
        }
      }
    );

    // 6. Live monitor session presence / lock changes
    register<{ conversation_id: string; is_active: boolean }>(
      'session-presence-update',
      (event) => {
        if (disposed) return;
        const { conversation_id, is_active } = event.payload;
        const sessionStore = useSessionStore.getState();

        if (sessionStore.conversationId === conversation_id) {
          if (is_active) {
            sessionStore.setIsStreaming(true);
            sessionStore.setStatusMessage('Agent running (CLI)');
          } else if (sessionStore.isStreaming) {
            sessionStore.finishTurn();
            sessionStore.setStatusMessage('Ready');
          }
        }
      }
    );

    return () => {
      disposed = true;
      // Synchronously detach every listener whose IPC registration has
      // already resolved; any listener resolving after this point is
      // detached immediately inside `register`.
      unlistens.forEach((fn) => {
        try {
          fn();
        } catch (err) {
          console.error('[useAgySession] failed to unlisten:', err);
        }
      });
    };
  }, []);
}
