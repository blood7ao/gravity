import React, { useState } from 'react';
import {
  FileCode2,
  FolderSearch,
  Terminal,
  Bot,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { ToolCall } from '@/types';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useI18n } from '@/i18n';
import { Badge } from '@/components/ui/Badge';

interface ActionPillGroupProps {
  toolCalls?: ToolCall[];
}

export function ActionPillGroup({ toolCalls }: ActionPillGroupProps) {
  const { t } = useI18n();
  const { addModifiedFile, setInspectorTab, toggleInspector } =
    useWorkspaceStore();

  const [isExploredExpanded, setIsExploredExpanded] = useState(false);

  if (!toolCalls || toolCalls.length === 0) return null;

  // Separate read tools and non-file-edit action tools
  const readToolNames = ['view_file', 'grep_search', 'find_by_name', 'list_dir', 'read_url_content'];
  const editToolNames = ['replace_file_content', 'write_to_file'];
  const readTools = toolCalls.filter((t) => readToolNames.includes(t.tool_name));
  const otherTools = toolCalls.filter(
    (t) => !readToolNames.includes(t.tool_name) && !editToolNames.includes(t.tool_name)
  );

  if (readTools.length === 0 && otherTools.length === 0) return null;

  return (
    <div className="my-2 space-y-1 font-sans">
      {/* 1. Aggregated Read Tools Pill */}
      {readTools.length > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 overflow-hidden shadow-2xs">
          <button
            onClick={() => setIsExploredExpanded(!isExploredExpanded)}
            className="w-full flex items-center justify-between px-3.5 py-2 text-[13px] text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FolderSearch className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {t.canvas.exploredFiles(readTools.length)}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-zinc-500">
              <span>{isExploredExpanded ? t.canvas.collapse : t.canvas.details}</span>
              {isExploredExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </div>
          </button>

          {isExploredExpanded && (
            <div className="px-3.5 py-2.5 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-950/80 space-y-1.5 text-[12px] font-mono">
              {readTools.map((tool, idx) => (
                <div key={idx} className="flex items-center justify-between text-zinc-700 dark:text-zinc-300">
                  <div className="truncate flex-1">
                    <span className="text-zinc-600 dark:text-zinc-400 font-semibold mr-2">{tool.tool_name}:</span>
                    <span className="text-zinc-900 dark:text-zinc-100">
                      {tool.tool_summary ||
                        tool.tool_args?.AbsolutePath ||
                        tool.tool_args?.TargetFile ||
                        tool.tool_args?.Query ||
                        JSON.stringify(tool.tool_args || {})}
                    </span>
                  </div>
                  {tool.duration_seconds && (
                    <span className="text-zinc-500 dark:text-zinc-400 text-[11px] ml-2">
                      {tool.duration_seconds.toFixed(2)}s
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. Commands and Subagents */}
      {otherTools.map((tool, idx) => {
        const isCommand = tool.tool_name === 'run_command';
        const isSubagent = tool.tool_name === 'invoke_subagent';

        let commandStr = tool.tool_args?.CommandLine || tool.tool_summary || 'Command';
        if (typeof commandStr === 'string') {
          commandStr = commandStr.replace(/^"|"$/g, '').trim();
        }

        return (
          <div
            key={idx}
            className="flex items-center justify-between px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 text-[13px] shadow-2xs"
          >
            <div className="flex items-center gap-2 truncate flex-1 mr-2">
              {isCommand && <Terminal className="w-4 h-4 text-zinc-600 dark:text-zinc-400 shrink-0" />}
              {isSubagent && <Bot className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />}

              <span className="font-mono text-zinc-950 dark:text-zinc-50 truncate max-w-md font-medium">
                {isCommand
                  ? t.canvas.ranCommand(commandStr)
                  : `${tool.tool_name}`}
              </span>

              {tool.tool_summary && !isCommand && (
                <span className="text-zinc-500 dark:text-zinc-400 text-xs truncate">
                  - {typeof tool.tool_summary === 'string' ? tool.tool_summary.replace(/^"|"$/g, '') : tool.tool_summary}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {tool.state === 'DONE' && (
                <Badge variant="secondary" className="text-[11px] px-1.5 py-0.5 text-zinc-700 dark:text-zinc-300 font-medium">
                  <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-500" /> {t.common.done}
                </Badge>
              )}
              {tool.state === 'RUNNING' && (
                <Badge variant="warning" className="text-[11px] px-1.5 py-0.5 animate-pulse">
                  <Clock className="w-3 h-3 mr-1" /> {t.common.running}
                </Badge>
              )}
              {tool.state === 'ERROR' && (
                <Badge variant="destructive" className="text-[11px] px-1.5 py-0.5">
                  <AlertCircle className="w-3 h-3 mr-1" /> {t.common.failed}
                </Badge>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
