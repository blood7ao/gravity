import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface TimeAgoTranslations {
  justNow: string;
  minutesAgo: (m: number) => string;
  hoursAgo: (h: number) => string;
  daysAgo: (d: number) => string;
}

export function formatTimeAgo(timestamp: number, t?: TimeAgoTranslations): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t ? t.justNow : 'Just now';
  if (minutes < 60) return t ? t.minutesAgo(minutes) : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t ? t.hoursAgo(hours) : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return t ? t.daysAgo(days) : `${days}d ago`;
}

export function formatTimeAgoShort(timestamp?: number | string): string {
  if (!timestamp) return '';
  const time = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  if (isNaN(time) || time <= 0) return '';
  const diff = Date.now() - time;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Deduplicate consecutive identical paragraphs/blocks within markdown text.
 */
export function deduplicateConsecutiveParagraphs(text: string): string {
  if (!text) return '';
  const paras = text.split(/\n{2,}/);
  const cleaned: string[] = [];
  for (let i = 0; i < paras.length; i++) {
    const trimmed = paras[i].trim();
    if (!trimmed) continue;
    if (cleaned.length > 0 && cleaned[cleaned.length - 1].trim() === trimmed) {
      continue;
    }
    cleaned.push(paras[i]);
  }
  return cleaned.join('\n\n');
}

/**
 * Appends a protocol-level delta while accepting cumulative snapshots.
 * A suffix/prefix overlap is not enough evidence to remove characters: it
 * can be a legitimate boundary (for example, "a" followed by "a").
 */
export function smartAppendDelta(existing: string, incoming: string): string {
  if (!existing) return incoming || '';
  if (!incoming) return existing;

  // Cumulative snapshot: incoming is a longer version of the current text.
  if (incoming.length > existing.length && incoming.startsWith(existing)) {
    return incoming;
  }

  // Exact match: duplicate observation.
  if (existing === incoming) {
    return existing;
  }

  // text_delta is incremental by contract; preserve all characters.
  return existing + incoming;
}

/**
 * Merges two transcript text chunks (e.g. from consecutive PLANNER_RESPONSE steps)
 * avoiding duplications caused by full snapshot updates, restarting drafts, or suffix/prefix overlaps.
 */
export function mergeTranscriptText(existing: string, incoming: string): string {
  const ex = (existing || '').trim();
  const inc = (incoming || '').trim();

  if (!ex) return inc;
  if (!inc) return ex;

  // 1. Exact match or one is full substring of the other
  if (ex === inc || ex.includes(inc)) {
    return ex;
  }
  if (inc.includes(ex)) {
    return inc;
  }

  // 2. Character-level suffix/prefix overlap (from max down to 8)
  const maxCheck = Math.min(ex.length, inc.length);
  for (let len = maxCheck; len >= 8; len--) {
    if (ex.endsWith(inc.slice(0, len))) {
      return deduplicateConsecutiveParagraphs(ex + inc.slice(len));
    }
  }

  // 3. Line-level overlap detection
  const exLines = ex.split('\n').map((l) => l.trim()).filter(Boolean);
  const incLines = inc.split('\n').map((l) => l.trim()).filter(Boolean);

  if (exLines.length >= 2 && incLines.length >= 2) {
    for (let i = 0; i < exLines.length; i++) {
      const remainingExLines = exLines.slice(i);
      const testIncLines = incLines.slice(0, remainingExLines.length);
      if (
        remainingExLines.length > 0 &&
        remainingExLines.every((line, idx) => line === testIncLines[idx])
      ) {
        const rawIncLines = inc.split('\n');
        let rawSliceIndex = 0;
        let matchedCount = 0;
        for (let j = 0; j < rawIncLines.length; j++) {
          if (rawIncLines[j].trim() !== '') {
            matchedCount++;
          }
          if (matchedCount === remainingExLines.length) {
            rawSliceIndex = j + 1;
            break;
          }
        }
        const nonOverlapInc = rawIncLines.slice(rawSliceIndex).join('\n');
        return deduplicateConsecutiveParagraphs(ex + (nonOverlapInc ? '\n' + nonOverlapInc : ''));
      }
    }
  }

  // 4. Distinct sections - join with clean double newlines
  return deduplicateConsecutiveParagraphs(ex + '\n\n' + inc);
}

/**
 * Sanitizes markdown content to guarantee correct rendering:
 * - Balances unclosed code block fences (``` or ~~~) so trailing content isn't swallowed
 * - Handles <truncated ...> markers inside code fences
 * - Removes stray checkpoint headers
 */
export function sanitizeMarkdownContent(text: string): string {
  if (!text) return '';

  // Remove raw checkpoint headers if present
  let sanitized = text.replace(/\{\{\s*CHECKPOINT\s+\d+\s*\}\}/gi, '').trim();

  const lines = sanitized.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let codeFenceMarker = '```';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for code fence start/end (``` or ~~~)
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1].slice(0, 3);
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeFenceMarker = marker;
      } else if (marker === codeFenceMarker) {
        inCodeBlock = false;
      }
    }

    // Check for <truncated \d+ bytes>
    const truncMatch = trimmed.match(/^<truncated\s+(\d+)\s+bytes>/i);
    if (truncMatch) {
      const bytes = truncMatch[1];
      if (inCodeBlock) {
        result.push(codeFenceMarker);
        inCodeBlock = false;
      }
      result.push(`\n> ⚠️ *[此处已省略 ${bytes} 字节内容]*\n`);
      continue;
    }

    result.push(line);
  }

  // Close any unclosed code block at the end of text
  if (inCodeBlock) {
    result.push(codeFenceMarker);
  }

  return result.join('\n');
}

/**
 * Parses raw transcript step objects (from transcript.jsonl / transcript_full.jsonl)
 * into typed Message objects with proper chronological parts, tools, thinking, and streaming status.
 */
export function parseTranscriptStepsToMessages(
  steps: any[],
  isSessionActive: boolean = false
): import('@/types').Message[] {
  if (!steps || !Array.isArray(steps) || steps.length === 0) {
    return [];
  }

  type Message = import('@/types').Message;
  type ToolCall = import('@/types').ToolCall;

  const loadedMessages: Message[] = [];
  let currentAssistantMsg: Message | null = null;

  // Pre-scan all task results from SYSTEM_MESSAGE and GENERIC steps
  const taskResultsMap: Record<string, string> = {};
  for (const st of steps) {
    const content = st.content || '';
    if (st.type === 'SYSTEM_MESSAGE' || st.type === 'GENERIC') {
      const taskMatch = content.match(
        /Task(?:\s*id)?\s*[:"']?\s*([a-zA-Z0-9_\-\/]+)["']?\s*(?:finished with result:|Status:\s*DONE)[\s\S]*?(?:Output:\s*([\s\S]+)|Log output:\s*([\s\S]+))/i
      );
      if (taskMatch) {
        const fullTaskId = taskMatch[1];
        const shortId = fullTaskId.split('/').pop() || fullTaskId;
        const outputText = (taskMatch[2] || taskMatch[3] || content).trim();
        taskResultsMap[fullTaskId] = outputText;
        taskResultsMap[shortId] = outputText;
      }

      const sysMatch = content.match(
        /Task id\s*["']([^"']+)["']\s*finished with result:\s*([\s\S]+)/i
      );
      if (sysMatch) {
        const fullTaskId = sysMatch[1];
        const shortId = fullTaskId.split('/').pop() || fullTaskId;
        const outputText = sysMatch[2].trim();
        taskResultsMap[fullTaskId] = outputText;
        taskResultsMap[shortId] = outputText;
      }
    }
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const nextStep = steps[i + 1];
    let stepDuration: number | undefined = undefined;
    if (step.created_at && nextStep?.created_at) {
      const diff = Math.round(
        (new Date(nextStep.created_at).getTime() - new Date(step.created_at).getTime()) / 1000
      );
      if (diff > 0 && diff < 300) {
        stepDuration = diff;
      }
    }

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
        rawContent = rawContent
          .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/g, '')
          .replace(/<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/g, '')
          .trim();
      }

      if (
        rawContent.startsWith('{{ CHECKPOINT') ||
        rawContent.includes('**The earlier parts of this conversation have been truncated')
      ) {
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
          content: '',
          thinking: step.thinking || '',
          toolCalls: [],
          parts: [],
          created_at: step.created_at ? new Date(step.created_at).getTime() : Date.now(),
          status: 'done',
        };
      }

      if (step.thinking && step.thinking.trim()) {
        const cleanThinking = step.thinking.trim();
        currentAssistantMsg.thinking = mergeTranscriptText(currentAssistantMsg.thinking || '', cleanThinking);
        currentAssistantMsg.parts = currentAssistantMsg.parts || [];
        const lastPart = currentAssistantMsg.parts[currentAssistantMsg.parts.length - 1];
        if (lastPart && lastPart.type === 'thinking') {
          lastPart.thinking = mergeTranscriptText(lastPart.thinking, cleanThinking);
          if (stepDuration) {
            lastPart.durationSeconds = (lastPart.durationSeconds || 0) + stepDuration;
          }
        } else {
          currentAssistantMsg.parts.push({
            type: 'thinking',
            thinking: cleanThinking,
            durationSeconds: stepDuration,
          });
        }
      }

      if (step.created_at) {
        currentAssistantMsg.completed_at = new Date(step.created_at).getTime();
      }

      if (step.content && step.content.trim()) {
        const cleanContent = sanitizeMarkdownContent(step.content.trim());
        if (cleanContent) {
          currentAssistantMsg.content = mergeTranscriptText(currentAssistantMsg.content || '', cleanContent);
          currentAssistantMsg.parts = currentAssistantMsg.parts || [];
          const lastPart = currentAssistantMsg.parts[currentAssistantMsg.parts.length - 1];
          if (lastPart && lastPart.type === 'text') {
            lastPart.content = mergeTranscriptText(lastPart.content, cleanContent);
          } else {
            currentAssistantMsg.parts.push({
              type: 'text',
              content: cleanContent,
            });
          }
        }
      }

      const stepToolCalls: ToolCall[] = [];
      let nextGenericResult: string | undefined = undefined;
      if (nextStep && nextStep.type === 'GENERIC' && nextStep.content) {
        nextGenericResult = nextStep.content;
        const taskLaunchMatch = nextStep.content.match(/task\s*id\s*[:"']?\s*([a-zA-Z0-9_\-\/]+)/i);
        if (taskLaunchMatch) {
          const taskId = taskLaunchMatch[1];
          const shortId = taskId.split('/').pop() || taskId;
          if (taskResultsMap[taskId]) {
            nextGenericResult = taskResultsMap[taskId];
          } else if (taskResultsMap[shortId]) {
            nextGenericResult = taskResultsMap[shortId];
          }
        }
      }

      if (step.tool_calls && Array.isArray(step.tool_calls)) {
        for (const tc of step.tool_calls) {
          let parsedArgs = tc.args;
          if (typeof parsedArgs === 'string') {
            try {
              parsedArgs = JSON.parse(parsedArgs);
            } catch {}
          }

          let summary = parsedArgs?.toolSummary || tc.name || 'tool';
          if (typeof summary === 'string') {
            summary = summary.replace(/^"|"$/g, '').trim();
          }

          const stepIdx = step.step_index ?? Date.now();
          const toolName = tc.name || 'tool';

          let resolvedResult = nextGenericResult;
          if (toolName === 'run_command' || toolName === 'manage_task') {
            const targetTaskId = parsedArgs?.TaskId || '';
            if (targetTaskId && taskResultsMap[targetTaskId]) {
              resolvedResult = taskResultsMap[targetTaskId];
            } else {
              const shortTid = targetTaskId.split('/').pop() || '';
              if (shortTid && taskResultsMap[shortTid]) {
                resolvedResult = taskResultsMap[shortTid];
              }
            }

            if (!resolvedResult || resolvedResult.includes('Tool is running as a background task')) {
              for (let j = i + 1; j < Math.min(steps.length, i + 8); j++) {
                const futureStep = steps[j];
                if (futureStep.type === 'USER_INPUT') break;
                if (futureStep.content) {
                  const launchMatch = futureStep.content.match(/task\s*id\s*[:"']?\s*([a-zA-Z0-9_\-\/]+)/i);
                  if (launchMatch) {
                    const tId = launchMatch[1];
                    const sId = tId.split('/').pop() || tId;
                    if (taskResultsMap[tId]) {
                      resolvedResult = taskResultsMap[tId];
                      break;
                    }
                    if (taskResultsMap[sId]) {
                      resolvedResult = taskResultsMap[sId];
                      break;
                    }
                  }
                  if (
                    futureStep.content.includes('Output:\n') ||
                    futureStep.content.includes('The command exited with code')
                  ) {
                    resolvedResult = futureStep.content;
                    break;
                  }
                }
              }
            }
          }

          const isDup = currentAssistantMsg.toolCalls?.some(
            (t) => t.step_index === stepIdx && t.tool_name === toolName
          );

          if (!isDup) {
            const tcItem: ToolCall = {
              step_index: stepIdx,
              tool_name: toolName,
              tool_summary: summary,
              tool_args: parsedArgs,
              tool_result: resolvedResult,
              state: 'DONE',
            };
            currentAssistantMsg.toolCalls = currentAssistantMsg.toolCalls || [];
            currentAssistantMsg.toolCalls.push(tcItem);
            stepToolCalls.push(tcItem);
          }
        }
      }

      if (stepToolCalls.length > 0) {
        currentAssistantMsg.parts = currentAssistantMsg.parts || [];
        const lastPart = currentAssistantMsg.parts[currentAssistantMsg.parts.length - 1];
        if (lastPart && lastPart.type === 'tools') {
          lastPart.toolCalls.push(...stepToolCalls);
        } else {
          currentAssistantMsg.parts.push({
            type: 'tools',
            toolCalls: stepToolCalls,
          });
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

    if (isSessionActive) {
      currentAssistantMsg.status = 'streaming';
    } else {
      const hasTools = (currentAssistantMsg.toolCalls?.length || 0) > 0;
      const hasContent = Boolean(currentAssistantMsg.content && currentAssistantMsg.content.trim());
      if (hasTools && !hasContent) {
        currentAssistantMsg.status = 'error';
      }
    }

    loadedMessages.push(currentAssistantMsg);
  }

  return loadedMessages;
}

