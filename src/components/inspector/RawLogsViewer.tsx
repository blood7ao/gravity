import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Terminal,
  Copy,
  Check,
  Search,
  ArrowDown,
  Layers,
  FileCode,
  AlertCircle,
  Wrench,
  Sparkles,
  Bot,
  User,
  WrapText,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { formatTimeAgo } from '@/lib/utils';

export function RawLogsViewer() {
  const { t } = useI18n();
  const { rawLogs, rawTranscriptText, isStreaming } = useSessionStore();

  const [viewMode, setViewMode] = useState<'parsed' | 'raw'>('parsed');
  const [filterType, setFilterType] = useState<'all' | 'assistant' | 'tools' | 'stderr'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [wrapText, setWrapText] = useState(true);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [autoScroll, setAutoScroll] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Parse rawTranscriptText into structured items if available
  const parsedTranscriptSteps = useMemo(() => {
    if (!rawTranscriptText) return [];
    const lines = rawTranscriptText.split('\n').map((l) => l.trim()).filter(Boolean);
    const steps: any[] = [];
    for (let i = 0; i < lines.length; i++) {
      try {
        const parsed = JSON.parse(lines[i]);
        steps.push({
          id: `step-${parsed.step_index ?? i}`,
          raw: lines[i],
          parsed,
          timestamp: parsed.created_at ? new Date(parsed.created_at).getTime() : Date.now(),
        });
      } catch {
        steps.push({
          id: `line-${i}`,
          raw: lines[i],
          parsed: { type: 'RAW_TEXT', content: lines[i] },
          timestamp: Date.now(),
        });
      }
    }
    return steps;
  }, [rawTranscriptText]);

  // Combine live stream logs and transcript steps
  const items = useMemo(() => {
    if (parsedTranscriptSteps.length > 0) {
      return parsedTranscriptSteps;
    }
    return rawLogs.map((log) => {
      let parsed: any = null;
      try {
        parsed = JSON.parse(log.raw);
      } catch {}
      return {
        id: log.id,
        raw: log.raw,
        parsed,
        timestamp: log.timestamp,
      };
    });
  }, [parsedTranscriptSteps, rawLogs]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const parsed = item.parsed;
      const type = parsed?.type || parsed?.event || parsed?.step_update?.step_type || 'unknown';

      // Type filter
      if (filterType === 'assistant') {
        const isAssistant =
          type === 'PLANNER_RESPONSE' ||
          type === 'agent_response' ||
          parsed?.step_type === 'agent_response';
        if (!isAssistant) return false;
      } else if (filterType === 'tools') {
        const isTool =
          type === 'tool_call' ||
          parsed?.step_type === 'tool_call' ||
          Boolean(parsed?.tool_calls && parsed.tool_calls.length > 0) ||
          type === 'GENERIC';
        if (!isTool) return false;
      } else if (filterType === 'stderr') {
        const isErr = type === 'stderr' || parsed?.type === 'stderr' || parsed?.status === 'ERROR';
        if (!isErr) return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const rawMatch = item.raw.toLowerCase().includes(q);
        const contentMatch = parsed?.content?.toLowerCase?.()?.includes(q);
        const thinkingMatch = parsed?.thinking?.toLowerCase?.()?.includes(q);
        return rawMatch || contentMatch || thinkingMatch;
      }

      return true;
    });
  }, [items, filterType, searchQuery]);

  // Full raw text representation
  const fullRawText = useMemo(() => {
    if (rawTranscriptText) {
      return rawTranscriptText;
    }
    return rawLogs.map((l) => l.raw).join('\n');
  }, [rawTranscriptText, rawLogs]);

  // Auto-scroll when new items arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [items.length, autoScroll, isStreaming]);

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(fullRawText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy raw text:', e);
    }
  };

  const toggleStepExpand = (id: string) => {
    setExpandedSteps((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 select-text">
      {/* Top Controls Bar */}
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/40 space-y-2.5">
        {/* Row 1: View mode tabs + Copy & Actions */}
        <div className="flex items-center justify-between gap-2">
          {/* Mode Switcher */}
          <div className="flex items-center gap-1 bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-lg text-xs">
            <button
              onClick={() => setViewMode('parsed')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                viewMode === 'parsed'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>结构化步骤</span>
              <span className="text-[10px] px-1 py-0.2 bg-zinc-100 dark:bg-zinc-800 rounded font-mono">
                {items.length}
              </span>
            </button>

            <button
              onClick={() => setViewMode('raw')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                viewMode === 'raw'
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <FileCode className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              <span>原始 JSONL / 纯文本</span>
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {viewMode === 'raw' && (
              <button
                onClick={() => setWrapText(!wrapText)}
                className={`p-1.5 rounded-md text-xs transition border cursor-pointer ${
                  wrapText
                    ? 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-950/40 dark:border-purple-800/60 dark:text-purple-300'
                    : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                }`}
                title="自动换行"
              >
                <WrapText className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`p-1.5 rounded-md text-xs transition border cursor-pointer ${
                autoScroll
                  ? 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-950/40 dark:border-purple-800/60 dark:text-purple-300'
                  : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
              }`}
              title={autoScroll ? '已启用自动滚动' : '已暂停自动滚动'}
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyAll}
              className="h-7 text-xs flex items-center gap-1 font-medium"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-emerald-600 dark:text-emerald-400">已复制</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>复制原始日志</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Row 2: Search + Filter Pills */}
        <div className="flex items-center gap-2">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索原始输出关键字、工具参数、内容…"
              className="w-full pl-8 pr-3 py-1 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:border-purple-500 transition"
            />
          </div>

          {/* Filter Pills (Parsed mode) */}
          {viewMode === 'parsed' && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFilterType('all')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'
                }`}
              >
                全部
              </button>
              <button
                onClick={() => setFilterType('assistant')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  filterType === 'assistant'
                    ? 'bg-purple-600 text-white'
                    : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'
                }`}
              >
                助手
              </button>
              <button
                onClick={() => setFilterType('tools')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  filterType === 'tools'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'
                }`}
              >
                工具
              </button>
              <button
                onClick={() => setFilterType('stderr')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                  filterType === 'stderr'
                    ? 'bg-red-600 text-white'
                    : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200'
                }`}
              >
                错误
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Body Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5 font-mono text-xs">
        {viewMode === 'parsed' ? (
          /* Structured Step Cards View */
          filteredItems.length === 0 ? (
            <div className="text-center py-12 text-zinc-400 dark:text-zinc-600 space-y-1">
              <Terminal className="w-8 h-8 mx-auto opacity-40 mb-2" />
              <div>暂无匹配的原始输出记录</div>
              <div className="text-[11px]">发起对话或切换至历史会话即可在此查看完整原始 CLI 流数据</div>
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const p = item.parsed;
              const stepIndex = p?.step_index ?? idx;
              const type = p?.type || p?.event || (p?.step_update ? p.step_update.step_type : 'RAW');
              const isExpanded = Boolean(expandedSteps[item.id]);

              const isUserInput = type === 'USER_INPUT' || type === 'user';
              const isPlanner = type === 'PLANNER_RESPONSE' || type === 'agent_response';
              const isTool =
                type === 'tool_call' ||
                type === 'GENERIC' ||
                Boolean(p?.tool_calls && p.tool_calls.length > 0);
              const isStderr = type === 'stderr' || p?.type === 'stderr';
              const isResult = type === 'result';

              let badgeColor = 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
              let badgeIcon = Terminal;
              if (isUserInput) {
                badgeColor = 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800';
                badgeIcon = User;
              } else if (isPlanner) {
                badgeColor = 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800';
                badgeIcon = Bot;
              } else if (isTool) {
                badgeColor = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800';
                badgeIcon = Wrench;
              } else if (isStderr) {
                badgeColor = 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-200 dark:border-red-800';
                badgeIcon = AlertCircle;
              } else if (isResult) {
                badgeColor = 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800';
                badgeIcon = Sparkles;
              }

              const BadgeIcon = badgeIcon;

              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-zinc-200/90 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30 overflow-hidden transition-all shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700"
                >
                  {/* Card Header */}
                  <div
                    onClick={() => toggleStepExpand(item.id)}
                    className="flex items-center justify-between px-3 py-2 bg-zinc-100/70 dark:bg-zinc-900/60 border-b border-zinc-200/70 dark:border-zinc-800/70 cursor-pointer hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 transition"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <button className="text-zinc-400 hover:text-zinc-600 cursor-pointer">
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <span className="text-[11px] font-semibold text-zinc-500 font-mono">
                        #{stepIndex}
                      </span>

                      <span className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-semibold tracking-wide ${badgeColor}`}>
                        <BadgeIcon className="w-3 h-3" />
                        <span>{type}</span>
                      </span>

                      {p?.status && (
                        <span className="text-[10px] text-zinc-400 font-mono">
                          [{p.status}]
                        </span>
                      )}

                      {/* Snippet summary */}
                      <span className="text-[11px] text-zinc-600 dark:text-zinc-400 font-sans truncate max-w-[280px]">
                        {p?.tool_name
                          ? `${p.tool_name}`
                          : p?.tool_calls?.[0]?.name
                          ? `tool: ${p.tool_calls[0].name}`
                          : p?.content
                          ? p.content.slice(0, 45).replace(/\n/g, ' ')
                          : p?.thinking
                          ? `thinking: ${p.thinking.slice(0, 35)}...`
                          : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-zinc-400 shrink-0 font-mono">
                      <span>{formatTimeAgo(item.timestamp)}</span>
                    </div>
                  </div>

                  {/* Card Content Summary (Always visible or toggle) */}
                  <div className="p-3 space-y-2">
                    {/* Model Thinking (if present) */}
                    {p?.thinking && (
                      <div className="p-2.5 rounded-lg bg-purple-50/70 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-800/40 text-purple-900 dark:text-purple-200 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap">
                        <div className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1">
                          Thinking / 思考过程:
                        </div>
                        {p.thinking}
                      </div>
                    )}

                    {/* Step Content / Text */}
                    {p?.content && (
                      <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 font-mono text-[12px] leading-relaxed whitespace-pre-wrap overflow-x-auto">
                        <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                          Content / 正文内容:
                        </div>
                        {p.content}
                      </div>
                    )}

                    {/* Tool Calls array */}
                    {p?.tool_calls && Array.isArray(p.tool_calls) && p.tool_calls.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                          Tool Calls ({p.tool_calls.length}):
                        </div>
                        {p.tool_calls.map((tc: any, tcIdx: number) => (
                          <div
                            key={tcIdx}
                            className="p-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 space-y-1"
                          >
                            <div className="font-semibold text-emerald-800 dark:text-emerald-300">
                              {tc.name}
                            </div>
                            <pre className="text-[11px] text-zinc-700 dark:text-zinc-300 overflow-x-auto !bg-transparent !p-0">
                              {typeof tc.args === 'string'
                                ? tc.args
                                : JSON.stringify(tc.args, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Expandable Full Raw JSON */}
                    {isExpanded && (
                      <div className="mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                          <span>Raw JSON Step Payload:</span>
                          <button
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(item.raw);
                              } catch {}
                            }}
                            className="hover:text-zinc-900 dark:hover:text-zinc-100 flex items-center gap-1 cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            <span>复制该步 JSON</span>
                          </button>
                        </div>
                        <pre className="p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 overflow-x-auto text-[11px] text-zinc-700 dark:text-zinc-300">
                          <code>{JSON.stringify(p, null, 2) || item.raw}</code>
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )
        ) : (
          /* Raw JSONL Monospace View */
          <div className="relative rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-950 text-zinc-100 p-3 overflow-x-auto">
            <pre
              className={`font-mono text-[12px] leading-relaxed text-zinc-200 ${
                wrapText ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto'
              }`}
            >
              {fullRawText || '// 暂无原始输出日志'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
