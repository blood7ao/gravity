import { create } from 'zustand';
import { ExecutionMode, ImageAttachment, Message, ModelInfo, ReasoningEffort, ToolCall, RawLogEntry } from '@/types';
import { smartAppendDelta } from '@/lib/utils';

interface SessionState {
  conversationId: string | null;
  messages: Message[];
  isStreaming: boolean;
  currentMode: ExecutionMode;
  currentEffort: ReasoningEffort;
  selectedModel: string;
  availableModels: ModelInfo[];
  selectedAgent: string | null;
  statusMessage: string | null;
  rawLogs: RawLogEntry[];
  rawTranscriptText: string;

  setConversationId: (id: string | null) => void;
  setMode: (mode: ExecutionMode) => void;
  setEffort: (effort: ReasoningEffort) => void;
  setModel: (model: string) => void;
  setAvailableModels: (models: ModelInfo[]) => void;
  setAgent: (agent: string | null) => void;
  setStatusMessage: (msg: string | null) => void;
  addRawLog: (entry: Omit<RawLogEntry, 'id' | 'timestamp'>) => void;
  setRawLogs: (logs: RawLogEntry[]) => void;
  setRawTranscriptText: (text: string) => void;
  setIsStreaming: (isStreaming: boolean) => void;

  addUserMessage: (content: string, imageAttachments?: ImageAttachment[]) => void;
  startAssistantTurn: () => void;
  appendThinkingDelta: (delta: string) => void;
  appendTextDelta: (delta: string) => void;
  handleToolCall: (toolCall: ToolCall) => void;
  finishTurn: (result?: any) => void;
  setMessages: (messages: Message[]) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  conversationId: null,
  messages: [],
  isStreaming: false,
  currentMode: 'plan',
  currentEffort: 'high',
  selectedModel: 'Gemini 3.7 Flash (High)',
  availableModels: [],
  selectedAgent: null,
  statusMessage: null,
  rawLogs: [],
  rawTranscriptText: '',

  setConversationId: (conversationId) => set({ conversationId }),
  setIsStreaming: (isStreaming) => set({ isStreaming }),
  setMode: (currentMode) => set({ currentMode }),
  setEffort: (currentEffort) => set({ currentEffort }),
  setModel: (selectedModel) => set({ selectedModel }),
  setAvailableModels: (availableModels) => set({ availableModels }),
  setAgent: (selectedAgent) => set({ selectedAgent }),
  setStatusMessage: (statusMessage) => set({ statusMessage }),
  addRawLog: (entry) =>
    set((state) => ({
      rawLogs: [
        ...state.rawLogs,
        {
          id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          timestamp: Date.now(),
          ...entry,
        },
      ],
    })),
  setRawLogs: (rawLogs) => set({ rawLogs }),
  setRawTranscriptText: (rawTranscriptText) => set({ rawTranscriptText }),

  addUserMessage: (content: string, imageAttachments = []) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          role: 'user',
          content,
          imageAttachments,
          created_at: Date.now(),
          status: 'done',
        },
      ],
      isStreaming: true,
    })),

  startAssistantTurn: () =>
    set((state) => {
      const lastMsg = state.messages[state.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.status === 'streaming') {
        return state;
      }
      return {
        isStreaming: true,
        messages: [
          ...state.messages,
          {
            id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            role: 'assistant',
            content: '',
            thinking: '',
            toolCalls: [],
            parts: [],
            created_at: Date.now(),
            status: 'streaming',
          },
        ],
      };
    }),

  appendThinkingDelta: (delta: string) =>
    set((state) => {
      const msgs = [...state.messages];
      let lastMsg = msgs[msgs.length - 1];
      if (!lastMsg || lastMsg.role !== 'assistant') {
        lastMsg = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          role: 'assistant',
          content: '',
          thinking: '',
          toolCalls: [],
          parts: [],
          created_at: Date.now(),
          status: 'streaming',
        };
        msgs.push(lastMsg);
      } else {
        lastMsg = { ...lastMsg, parts: lastMsg.parts ? [...lastMsg.parts] : [] };
        msgs[msgs.length - 1] = lastMsg;
      }
      const lastPart = lastMsg.parts![lastMsg.parts!.length - 1];
      if (lastPart && lastPart.type === 'thinking') {
        const tPart = lastPart as { type: 'thinking'; thinking: string; durationSeconds?: number };
        lastMsg.parts![lastMsg.parts!.length - 1] = {
          ...tPart,
          thinking: smartAppendDelta(tPart.thinking || '', delta)
        };
      } else {
        lastMsg.parts!.push({ type: 'thinking', thinking: delta });
      }
      lastMsg.thinking = smartAppendDelta(lastMsg.thinking || '', delta);
      return { messages: msgs, isStreaming: true };
    }),

  appendTextDelta: (delta: string) =>
    set((state) => {
      const msgs = [...state.messages];
      let lastMsg = msgs[msgs.length - 1];
      if (!lastMsg || lastMsg.role !== 'assistant') {
        lastMsg = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          role: 'assistant',
          content: '',
          thinking: '',
          toolCalls: [],
          parts: [],
          created_at: Date.now(),
          status: 'streaming',
        };
        msgs.push(lastMsg);
      } else {
        lastMsg = { ...lastMsg, parts: lastMsg.parts ? [...lastMsg.parts] : [] };
        msgs[msgs.length - 1] = lastMsg;
      }
      const lastPart = lastMsg.parts![lastMsg.parts!.length - 1];
      if (lastPart && lastPart.type === 'text') {
        const tPart = lastPart as { type: 'text'; content: string };
        lastMsg.parts![lastMsg.parts!.length - 1] = {
          type: 'text',
          content: smartAppendDelta(tPart.content || '', delta)
        };
      } else {
        lastMsg.parts!.push({ type: 'text', content: delta });
      }
      lastMsg.content = smartAppendDelta(lastMsg.content || '', delta);
      return { messages: msgs, isStreaming: true };
    }),

  handleToolCall: (toolCall: ToolCall) =>
    set((state) => {
      const msgs = [...state.messages];
      let lastMsg = msgs[msgs.length - 1];
      if (!lastMsg || lastMsg.role !== 'assistant') {
        lastMsg = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          role: 'assistant',
          content: '',
          thinking: '',
          toolCalls: [],
          parts: [],
          created_at: Date.now(),
          status: 'streaming',
        };
        msgs.push(lastMsg);
      } else {
        lastMsg = { ...lastMsg, parts: lastMsg.parts ? [...lastMsg.parts] : [], toolCalls: lastMsg.toolCalls ? [...lastMsg.toolCalls] : [] };
        msgs[msgs.length - 1] = lastMsg;
      }

      const existingTools = lastMsg.toolCalls;
      const existingIdx = existingTools!.findIndex((t) => t.step_index === toolCall.step_index);
      if (existingIdx >= 0) {
        existingTools![existingIdx] = { ...existingTools![existingIdx], ...toolCall };
      } else {
        existingTools!.push(toolCall);
      }

      const lastPart = lastMsg.parts![lastMsg.parts!.length - 1];
      if (lastPart && lastPart.type === 'tools') {
        const newPart = { ...lastPart, toolCalls: [...(lastPart as any).toolCalls] };
        const existInPart = newPart.toolCalls.findIndex((t: any) => t.step_index === toolCall.step_index);
        if (existInPart >= 0) {
          newPart.toolCalls[existInPart] = { ...newPart.toolCalls[existInPart], ...toolCall };
        } else {
          newPart.toolCalls.push(toolCall);
        }
        lastMsg.parts![lastMsg.parts!.length - 1] = newPart;
      } else {
        lastMsg.parts!.push({ type: 'tools', toolCalls: [toolCall] });
      }

      return { messages: msgs, isStreaming: true };
    }),

  finishTurn: (result?: any) =>
    set((state) => {
      const msgs = [...state.messages];
      let lastMsg = msgs[msgs.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        lastMsg = { ...lastMsg, parts: lastMsg.parts ? [...lastMsg.parts] : [] };
        msgs[msgs.length - 1] = lastMsg;

        const isError = result?.status === 'ERROR' || Boolean(result?.error);
        lastMsg.status = isError ? 'error' : 'done';
        lastMsg.completed_at = Date.now();
        const duration = Math.max(1, Math.round((lastMsg.completed_at - lastMsg.created_at) / 1000));
        lastMsg.duration_seconds = duration;
        if (result?.error) {
          lastMsg.content = result.error;
          lastMsg.parts!.push({ type: 'text', content: String(result.error) });
        } else if (result?.response) {
          lastMsg.content = result.response;
          
          const textPartsWithIndices = lastMsg.parts!
            .map((p, i) => ({ part: p, idx: i }))
            .filter((x) => x.part.type === 'text');
            
          if (textPartsWithIndices.length === 0) {
            lastMsg.parts!.push({ type: 'text', content: result.response });
          } else if (textPartsWithIndices.length === 1) {
            const { idx } = textPartsWithIndices[0];
            lastMsg.parts![idx] = { type: 'text', content: result.response };
          } else {
            // Keep chronological text/tool segments. The final result is
            // usually the complete response, so only apply its suffix to the
            // final text segment instead of rendering the full result twice.
            const precedingText = textPartsWithIndices
              .slice(0, -1)
              .map((x) => (x.part as { type: 'text', content: string }).content)
              .join('');
            if (result.response.startsWith(precedingText)) {
              const { idx } = textPartsWithIndices[textPartsWithIndices.length - 1];
              lastMsg.parts![idx] = { type: 'text', content: result.response.slice(precedingText.length) };
            }
          }
        }
        if (result?.usage) {
          lastMsg.usage = result.usage;
        }
      }
      return { messages: msgs, isStreaming: false };
    }),

  setMessages: (messages) => set({ messages }),

  clearSession: () =>
    set({
      conversationId: null,
      messages: [],
      isStreaming: false,
      statusMessage: null,
      rawLogs: [],
      rawTranscriptText: '',
    }),
}));
