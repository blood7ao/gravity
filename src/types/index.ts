export type ExecutionMode = 'plan' | 'accept-edits' | 'goal';
export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface ModelInfo {
  id: string;
  label: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  created_at: number;
  last_opened_at: number;
}

export interface AccountProfile {
  id: string;
  email: string;
  label: string;
  is_active: boolean;
  created_at: number;
  last_used_at: number;
}

export interface AccountWithQuotaInfo {
  id: string;
  email: string;
  label: string;
  is_active: boolean;
  tier_name: string;
  gemini_5h_percent?: number;
  gemini_5h_desc?: string;
  gemini_5h_reset?: string;
  gemini_weekly_percent?: number;
  gemini_weekly_desc?: string;
  gemini_weekly_reset?: string;
  claude_5h_percent?: number;
  claude_weekly_percent?: number;
  claude_weekly_reset?: string;
  last_used_at: number;
  is_valid: boolean;
}

export interface Session {
  id: string;
  project_path: string;
  title: string;
  created_at: number;
  updated_at: number;
  mode: ExecutionMode;
  effort: ReasoningEffort;
  model?: string;
  agent?: string;
  status?: 'running' | 'plan_ready' | 'incomplete' | 'completed';
}

export interface ToolCall {
  step_index: number;
  tool_name: string;
  tool_summary?: string;
  tool_args?: Record<string, any>;
  tool_result?: string;
  duration_seconds?: number;
  state: 'RUNNING' | 'DONE' | 'ERROR';
}

export interface MessageUsage {
  input_tokens?: number;
  output_tokens?: number;
  thinking_tokens?: number;
  total_tokens?: number;
}

export interface ImageAttachment {
  id: string;
  name: string;
  previewUrl: string;
  filePath?: string;
}

export type MessagePart =
  | { type: 'thinking'; thinking: string; durationSeconds?: number }
  | { type: 'tools'; toolCalls: ToolCall[] }
  | { type: 'text'; content: string };

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  toolCalls?: ToolCall[];
  parts?: MessagePart[];
  created_at: number;
  completed_at?: number;
  duration_seconds?: number;
  status: 'streaming' | 'done' | 'error';
  usage?: MessageUsage;
  imageAttachments?: ImageAttachment[];
}

export interface ArtifactInfo {
  name: string;
  path: string;
  content: string;
  updated_at: number;
}

export interface WorkspaceFile {
  relative_path: string;
  absolute_path: string;
  is_dir: boolean;
  size: number;
}

export interface ModifiedFile {
  path: string;
  original_content: string;
  modified_content: string;
  status: 'modified' | 'created' | 'deleted';
  original_exists?: boolean;
  can_revert?: boolean;
}

export interface FileSnapshot {
  exists: boolean;
  content: string | null;
  can_revert: boolean;
}

export type PermissionMode = 'auto-approve' | 'ask-first' | 'sandbox';

export type InspectorTab = 'diff' | 'plan' | 'artifacts' | 'raw_logs';

export interface RawLogEntry {
  id: string;
  timestamp: number;
  type: 'stdout' | 'stderr' | 'transcript' | 'init' | 'step_update' | 'result';
  raw: string;
  step_index?: number;
  summary?: string;
}

export interface ProxyConfig {
  enabled: boolean;
  host: string;
  port: number;
}
