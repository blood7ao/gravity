import { create } from 'zustand';
import { ExecutionMode, ImageAttachment, Message, ModelInfo, ReasoningEffort, ToolCall, RawLogEntry } from '@/types';

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
          created_at: Date.now(),
          status: 'streaming',
        };
        msgs.push(lastMsg);
      }
      lastMsg.thinking = (lastMsg.thinking || '') + delta;
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
          created_at: Date.now(),
          status: 'streaming',
        };
        msgs.push(lastMsg);
      }
      lastMsg.content = (lastMsg.content || '') + delta;
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
          created_at: Date.now(),
          status: 'streaming',
        };
        msgs.push(lastMsg);
      }

      const existingTools = lastMsg.toolCalls ? [...lastMsg.toolCalls] : [];
      const existingIdx = existingTools.findIndex((t) => t.step_index === toolCall.step_index);
      if (existingIdx >= 0) {
        existingTools[existingIdx] = { ...existingTools[existingIdx], ...toolCall };
      } else {
        existingTools.push(toolCall);
      }
      lastMsg.toolCalls = existingTools;

      return { messages: msgs, isStreaming: true };
    }),

  finishTurn: (result?: any) =>
    set((state) => {
      const msgs = [...state.messages];
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        const isError = result?.status === 'ERROR' || Boolean(result?.error);
        lastMsg.status = isError ? 'error' : 'done';
        lastMsg.completed_at = Date.now();
        const duration = Math.max(1, Math.round((lastMsg.completed_at - lastMsg.created_at) / 1000));
        lastMsg.duration_seconds = duration;
        if (result?.error && !lastMsg.content) {
          lastMsg.content = result.error;
        } else if (result?.response && !lastMsg.content) {
          lastMsg.content = result.response;
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
