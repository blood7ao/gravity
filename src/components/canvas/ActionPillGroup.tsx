import React, { useState } from 'react';
import {
  FileCode2,
  FolderSearch,
  Folder,
  Search,
  Globe,
  Terminal,
  Bot,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';
import { ToolCall } from '@/types';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useI18n } from '@/i18n';
import { Badge } from '@/components/ui/Badge';

interface ActionPillGroupProps {
  toolCalls?: ToolCall[];
}

function formatToolCallItem(tool: ToolCall, language: 'zh' | 'en') {
  const isZh = language === 'zh';
  const name = tool.tool_name;
  const args = tool.tool_args || {};

  if (name === 'view_file') {
    const rawPath = args.AbsolutePath || args.TargetFile || '';
    const basename = rawPath.split('/').pop() || rawPath || 'file';
    const lines =
      args.StartLine && args.EndLine
        ? `#L${args.StartLine}-${args.EndLine}`
        : args.StartLine
        ? `#L${args.StartLine}`
        : '';
    return {
      icon: <FileCode2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />,
      actionText: isZh ? '分析了' : 'Analyzed',
      targetText: `${basename}${lines ? ` ${lines}` : ''}`,
    };
  }

  if (name === 'grep_search') {
    const query = args.Query || tool.tool_summary || '';
    return {
      icon: <Search className="w-3.5 h-3.5 text-purple-500 shrink-0" />,
      actionText: isZh ? '搜索了' : 'Searched',
      targetText: `"${query}"`,
    };
  }

  if (name === 'find_by_name') {
    const pattern = args.Pattern || '';
    return {
      icon: <FolderSearch className="w-3.5 h-3.5 text-amber-500 shrink-0" />,
      actionText: isZh ? '查找了' : 'Looked for',
      targetText: `"${pattern}"`,
    };
  }

  if (name === 'list_dir') {
    const dir = args.DirectoryPath?.split('/').slice(-2).join('/') || args.DirectoryPath || '';
    return {
      icon: <Folder className="w-3.5 h-3.5 text-zinc-500 shrink-0" />,
      actionText: isZh ? '浏览了目录' : 'Listed directory',
      targetText: `"${dir}"`,
    };
  }

  if (name === 'read_url_content') {
    const url = args.Url || '';
    return {
      icon: <Globe className="w-3.5 h-3.5 text-sky-500 shrink-0" />,
      actionText: isZh ? '读取了网页' : 'Fetched URL',
      targetText: `"${url}"`,
    };
  }

  if (name === 'replace_file_content') {
    const rawPath = args.TargetFile || '';
    const basename = rawPath.split('/').pop() || rawPath || 'file';
    return {
      icon: <FileCode2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />,
      actionText: isZh ? '修改了' : 'Modified',
      targetText: basename,
    };
  }

  if (name === 'write_to_file') {
    const rawPath = args.TargetFile || '';
    const basename = rawPath.split('/').pop() || rawPath || 'file';
    return {
      icon: <FileCode2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />,
      actionText: isZh ? '创建了' : 'Created',
      targetText: basename,
    };
  }

  // Fallback
  return {
    icon: <Bot className="w-3.5 h-3.5 text-zinc-500 shrink-0" />,
    actionText: tool.tool_name,
    targetText: tool.tool_summary || JSON.stringify(args),
  };
}

function cleanExecutionOutput(rawOutput?: string): string {
  if (!rawOutput) return '';
  let text = rawOutput.trim();

  // If it's only the raw task launching notice with no actual output, ignore
  if (text.startsWith('Tool is running as a background task') && !text.includes('Output:') && !text.includes('finished with result:')) {
    return '';
  }

  // If it contains "The command exited with code X.\nOutput:\n..." or "Output:\n...", extract the actual terminal output!
  const outputMatch = text.match(/(?:The command exited with code \d+\.\s*Output:|Output:)\s*([\s\S]*)/i);
  if (outputMatch) {
    text = outputMatch[1].trim();
  } else {
    // Strip Created At / Completed At / Task logs headers
    text = text.replace(/^Created At: [^\n]+\nCompleted At: [^\n]+\n\n?/i, '');
    text = text.replace(/^Task: [^\n]+\nStatus: [^\n]+\nLog: [^\n]+\n(?:Log output:\n)?/i, '');
  }

  // Strip ANSI control characters
  text = text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

  return text.trim();
}

export function ActionPillGroup({ toolCalls }: ActionPillGroupProps) {
  const { t, language } = useI18n();
  const [isExploredExpanded, setIsExploredExpanded] = useState(false);
  const [expandedToolIndices, setExpandedToolIndices] = useState<Record<number, boolean>>({});
  const [copiedToolIdx, setCopiedToolIdx] = useState<number | null>(null);

  if (!toolCalls || toolCalls.length === 0) return null;

  const toggleToolExpanded = (idx: number) => {
    setExpandedToolIndices((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const handleCopyOutput = (idx: number, content: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(content);
    setCopiedToolIdx(idx);
    setTimeout(() => setCopiedToolIdx(prev => prev === idx ? null : prev), 1800);
  };

  // Separate read tools and non-file-edit action tools
  const readToolNames = ['view_file', 'grep_search', 'find_by_name', 'list_dir', 'read_url_content'];
  const editToolNames = ['replace_file_content', 'write_to_file'];
  const readTools = toolCalls.filter((t) => readToolNames.includes(t.tool_name));
  const otherTools = toolCalls.filter(
    (t) => !readToolNames.includes(t.tool_name) && !editToolNames.includes(t.tool_name)
  );

  if (readTools.length === 0 && otherTools.length === 0) return null;

  return (
    <div className="my-2 space-y-1.5 font-sans">
      {/* 1. Aggregated Read Tools Pill */}
      {readTools.length > 0 && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 overflow-hidden shadow-2xs">
          <button
            onClick={() => setIsExploredExpanded(!isExploredExpanded)}
            className="w-full flex items-center justify-between px-3.5 py-2 text-[13px] text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer"
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
            <div className="px-3.5 py-2 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-950/80 space-y-1 text-[12.5px]">
              {readTools.map((tool, idx) => {
                const item = formatToolCallItem(tool, language);
                return (
                  <div key={idx} className="flex items-center justify-between text-zinc-700 dark:text-zinc-300 py-0.5">
                    <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                      {item.icon}
                      <span className="text-zinc-500 dark:text-zinc-400 font-normal shrink-0">
                        {item.actionText}
                      </span>
                      <span className="font-mono text-zinc-900 dark:text-zinc-100 font-medium truncate">
                        {item.targetText}
                      </span>
                    </div>
                    {tool.duration_seconds && (
                      <span className="text-zinc-400 dark:text-zinc-500 text-[11px] font-mono ml-2 shrink-0">
                        {tool.duration_seconds.toFixed(1)}s
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. Commands, Tasks and Subagents with Output Expansion */}
      {otherTools.map((tool, idx) => {
        const isCommand = tool.tool_name === 'run_command';
        const isSubagent = tool.tool_name === 'invoke_subagent';
        const isExpanded = Boolean(expandedToolIndices[idx]);

        let commandStr = tool.tool_args?.CommandLine || tool.tool_summary || 'Command';
        if (typeof commandStr === 'string') {
          commandStr = commandStr.replace(/^"|"$/g, '').trim();
        }

        const cleanOutput = cleanExecutionOutput(tool.tool_result);
        const hasDetails = Boolean(cleanOutput || tool.tool_args);

        return (
          <div
            key={idx}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 overflow-hidden shadow-2xs transition-all"
          >
            <button
              type="button"
              onClick={() => {
                if (hasDetails) toggleToolExpanded(idx);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2 text-[13px] transition-colors text-left ${
                hasDetails ? 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40' : ''
              }`}
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

                {hasDetails && (
                  <span className="text-zinc-400 dark:text-zinc-500 ml-1">
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                  </span>
                )}
              </div>
            </button>

            {/* Expanded Terminal / Output View */}
            {isExpanded && (
              <div className="border-t border-zinc-200 dark:border-zinc-800 bg-[#0d0d11] text-zinc-200 text-xs font-mono select-text">
                {/* Header Bar */}
                <div className="flex items-center justify-between px-3.5 py-1.5 border-b border-zinc-800/80 bg-zinc-900/90 text-[11px] text-zinc-400 font-mono">
                  <span className="truncate pr-2 text-zinc-400">
                    {tool.tool_args?.Cwd ? `$ ${tool.tool_args.Cwd}` : isCommand ? '$ Terminal' : 'Tool Result'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleCopyOutput(idx, cleanOutput || JSON.stringify(tool.tool_args, null, 2), e)}
                    className="flex items-center gap-1 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer shrink-0 ml-2"
                    title="复制输出"
                  >
                    {copiedToolIdx === idx ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">已复制</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>复制</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Output Terminal Stream */}
                <div className="p-3.5 max-h-80 overflow-y-auto font-mono text-[12px] leading-relaxed select-text text-zinc-300">
                  {cleanOutput ? (
                    <pre className="!bg-transparent !p-0 !m-0 !border-none !text-zinc-300 whitespace-pre-wrap break-all font-mono">
                      {cleanOutput}
                    </pre>
                  ) : isCommand ? (
                    <div className="text-zinc-500 italic py-1">
                      {language === 'zh' ? '(命令已执行完成，无控制台输出)' : '(Command executed with no console output)'}
                    </div>
                  ) : (
                    <pre className="!bg-transparent !p-0 !m-0 !border-none !text-zinc-400 whitespace-pre-wrap break-all font-mono">
                      {JSON.stringify(tool.tool_args, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
