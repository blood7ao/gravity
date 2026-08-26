import React, { useState, useRef, useEffect } from 'react';
import {
  Check,
  ChevronRight,
  Gauge,
  Info,
  ChevronDown,
  RefreshCw,
  User,
  UsersRound,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '@/stores/useSessionStore';
import { useI18n } from '@/i18n';
import { ReasoningEffort } from '@/types';
import { AccountManagerModal } from './AccountManagerModal';

interface UserQuotaBucket {
  bucket_id: string;
  display_name: string;
  description?: string;
  window: string;
  remaining_fraction: number;
  remaining_percent: number;
  reset_time?: string;
}

interface UserQuotaGroup {
  display_name: string;
  description?: string;
  buckets: UserQuotaBucket[];
}

interface UserQuotaInfo {
  account_email?: string;
  tier_name: string;
  groups: UserQuotaGroup[];
  gemini_weekly_percent?: number;
  gemini_weekly_desc?: string;
  gemini_5h_percent?: number;
  gemini_5h_desc?: string;
  claude_weekly_percent?: number;
  claude_5h_percent?: number;
  is_authenticated: boolean;
}

interface ModelOption {
  id: string;
  name: string;
  effort?: ReasoningEffort;
  badge?: string;
  hasSubEfforts?: boolean;
}

const DEFAULT_MODELS: ModelOption[] = [
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    effort: 'high',
    hasSubEfforts: true,
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    effort: 'medium',
    badge: 'Fast',
    hasSubEfforts: true,
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    effort: 'medium',
    badge: 'Fast',
    hasSubEfforts: true,
  },
  {
    id: 'gemini-3.1-pro',
    name: 'Gemini 3.1 Pro',
    effort: 'low',
    hasSubEfforts: true,
  },
  {
    id: 'claude-sonnet-4.6',
    name: 'Claude Sonnet 4.6 (Thinking)',
  },
  {
    id: 'claude-opus-4.6',
    name: 'Claude Opus 4.6 (Thinking)',
  },
  {
    id: 'gpt-oss-120b',
    name: 'GPT-OSS 120B (Medium)',
    effort: 'medium',
  },
];

function CircularProgress({
  percent,
  size = 18,
  strokeWidth = 2.5,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  let color: string;
  if (percent <= 20) {
    color = '#ef4444'; // red-500
  } else if (percent <= 50) {
    color = '#f59e0b'; // amber-500
  } else {
    color = '#10b981'; // emerald-500
  }

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="#e4e4e7"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
            transition: 'stroke-dashoffset 0.7s ease-out',
          }}
        />
      </svg>
    </div>
  );
}

export function ModelSelectorMenu() {
  const { language } = useI18n();
  const {
    selectedModel,
    setModel,
    currentEffort,
    setEffort,
    availableModels,
    isStreaming,
    clearSession,
  } = useSessionStore();

  const [isOpen, setIsOpen] = useState(false);
  const [activeSubMenu, setActiveSubMenu] = useState<'usage' | string | null>(null);
  const [quotaInfo, setQuotaInfo] = useState<UserQuotaInfo | null>(null);
  const [isLoadingQuota, setIsLoadingQuota] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchQuota = async () => {
    setIsLoadingQuota(true);
    try {
      const data = await invoke<UserQuotaInfo>('get_user_quota');
      setQuotaInfo(data);
    } catch (e) {
      console.warn('Failed to load user quota:', e);
    } finally {
      setIsLoadingQuota(false);
    }
  };

  useEffect(() => {
    fetchQuota();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setActiveSubMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Format active model display label
  const displayLabel = selectedModel || 'Gemini 3.7 Flash';
  const displayEffort = currentEffort === 'high' ? 'High' : currentEffort === 'medium' ? 'Medium' : 'Low';

  const handleSelectModel = (model: ModelOption, effortOverride?: ReasoningEffort) => {
    const effort = effortOverride || model.effort || currentEffort;
    setModel(model.name);
    if (effort) {
      setEffort(effort);
    }
    setIsOpen(false);
    setActiveSubMenu(null);
  };

  const handleAccountSwitched = async () => {
    // agy is restarted by the native switch command. A conversation is account-scoped,
    // so preserve history locally but do not resume it under a different identity.
    clearSession();
    setIsOpen(false);
    setActiveSubMenu(null);
    await fetchQuota();
    window.dispatchEvent(new Event('agy-account-switched'));
  };

  // undefined = loading / language server unavailable — never show stale defaults
  const geminiWeekly = quotaInfo?.gemini_weekly_percent;
  const gemini5h = quotaInfo?.gemini_5h_percent;
  const claudeWeekly = quotaInfo?.claude_weekly_percent;
  const claude5h = quotaInfo?.claude_5h_percent;

  return (
    <div className="relative font-sans select-none" ref={menuRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setActiveSubMenu(null);
        }}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
        title={selectedModel}
      >
        <span className="w-2 h-2 rounded-full border border-zinc-500 dark:border-zinc-400 inline-block shrink-0" />
        <span className="truncate max-w-[170px]">
          {displayLabel} <span className="text-zinc-500 dark:text-zinc-400 font-normal">{displayEffort}</span>
        </span>
        <ChevronDown className={`w-3 h-3 text-zinc-500 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Main Model Selector Popover */}
      {isOpen && (
        <div className="absolute bottom-9 right-0 flex items-end gap-2 z-40 animate-in fade-in zoom-in-95 duration-100">
          {/* Main List Container */}
          <div className="w-64 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] shadow-2xl p-2 font-sans">
            {/* Header */}
            <div className="px-2.5 py-1.5 text-xs font-bold text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
              <span>{language === 'zh' ? '模型选择 (Model)' : 'Model'}</span>
              {quotaInfo?.tier_name && (
                <span className="text-[10px] font-normal px-1.5 py-0.2 rounded-full bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 truncate max-w-[120px]">
                  {quotaInfo.tier_name.replace('Gemini Code Assist ', '')}
                </span>
              )}
            </div>

            {/* Model List */}
            <div className="space-y-0.5 mt-0.5">
              {DEFAULT_MODELS.map((m) => {
                const isSelected =
                  selectedModel.toLowerCase().includes(m.name.toLowerCase()) ||
                  selectedModel.toLowerCase().includes(m.id.toLowerCase());

                const effortName = m.effort
                  ? m.effort.charAt(0).toUpperCase() + m.effort.slice(1)
                  : '';

                return (
                  <div
                    key={m.id}
                    onMouseEnter={() => {
                      if (m.hasSubEfforts) {
                        setActiveSubMenu(m.id);
                      } else {
                        setActiveSubMenu(null);
                      }
                    }}
                    onClick={() => handleSelectModel(m)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs cursor-pointer transition ${
                      isSelected
                        ? 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-950 dark:text-white font-medium'
                        : 'text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{m.name}</span>
                      {effortName && (
                        <span className="text-zinc-500 dark:text-zinc-400 font-normal text-[11px] shrink-0">
                          {effortName}
                        </span>
                      )}
                      {m.badge && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium shrink-0">
                          {m.badge}
                          <Info className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>

                    <div className="shrink-0 ml-1.5 flex items-center">
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 text-zinc-900 dark:text-zinc-100 stroke-[2.5]" />
                      ) : m.hasSubEfforts ? (
                        <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Divider */}
            <div className="border-t border-zinc-100 dark:border-zinc-800/80 my-1.5" />

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setActiveSubMenu(null);
                setIsAccountModalOpen(true);
              }}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition"
            >
              <span className="flex items-center gap-2">
                <UsersRound className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                {language === 'zh' ? '管理账号' : 'Manage accounts'}
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
            </button>

            {/* View Usage Bottom Button */}
            <div
              onMouseEnter={() => {
                setActiveSubMenu('usage');
                fetchQuota();
              }}
              onClick={() => {
                setActiveSubMenu(activeSubMenu === 'usage' ? null : 'usage');
                fetchQuota();
              }}
              className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer transition ${
                activeSubMenu === 'usage'
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                  : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Gauge className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                <span>{language === 'zh' ? '查看配额用量' : 'View Usage'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-[11px] font-semibold ${isLoadingQuota || geminiWeekly === undefined ? 'text-zinc-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {geminiWeekly !== undefined ? `${geminiWeekly}%` : '--'}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
              </div>
            </div>
          </div>

          {/* Right Flyout Popover: View Usage Quota */}
          {activeSubMenu === 'usage' && (
            <div className="w-[300px] md:w-[320px] rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] shadow-2xl p-4 space-y-3.5 font-sans text-xs animate-in fade-in zoom-in-95 duration-100">
              {/* Account Header */}
              <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-1.5 truncate">
                  <User className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate text-[11px]">
                    {quotaInfo?.account_email || '已连接 Google 账号'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={fetchQuota}
                  className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                  title="刷新配额"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingQuota ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Section 1: Gemini Models */}
              <div>
                <div className="font-bold text-zinc-500 dark:text-zinc-400 text-xs mb-2">
                  {language === 'zh' ? 'Gemini 模型限额 (Gemini Models)' : 'Gemini Models'}
                </div>

                <div className="space-y-2.5">
                  {/* Weekly Limit Remaining */}
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between font-medium text-zinc-900 dark:text-zinc-100">
                      <span>{language === 'zh' ? '每周剩余配额' : 'Weekly Limit Remaining'}</span>
                      <div className="flex items-center gap-1.5 font-semibold">
                        <span>{geminiWeekly !== undefined ? `${geminiWeekly}%` : '--'}</span>
                        {geminiWeekly !== undefined && <CircularProgress percent={geminiWeekly} />}
                      </div>
                    </div>
                    {quotaInfo?.gemini_weekly_desc && (
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
                        {quotaInfo.gemini_weekly_desc}
                      </div>
                    )}
                  </div>

                  {/* Five Hour Limit Remaining */}
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between font-medium text-zinc-900 dark:text-zinc-100">
                      <span>{language === 'zh' ? '5 小时滚动剩余配额' : 'Five Hour Limit Remaining'}</span>
                      <div className="flex items-center gap-1.5 font-semibold">
                        <span>{gemini5h !== undefined ? `${gemini5h}%` : '--'}</span>
                        {gemini5h !== undefined && <CircularProgress percent={gemini5h} />}
                      </div>
                    </div>
                    {quotaInfo?.gemini_5h_desc && (
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
                        {quotaInfo.gemini_5h_desc}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-zinc-100 dark:border-zinc-800" />

              {/* Section 2: Claude and GPT models */}
              <div>
                <div className="font-bold text-zinc-500 dark:text-zinc-400 text-xs mb-2">
                  {language === 'zh' ? 'Claude 与 GPT 模型限额' : 'Claude and GPT models'}
                </div>

                <div className="space-y-2.5">
                  {/* Weekly Limit Remaining */}
                  <div className="flex items-center justify-between font-medium text-zinc-900 dark:text-zinc-100">
                    <span>{language === 'zh' ? '每周剩余配额' : 'Weekly Limit Remaining'}</span>
                    <div className="flex items-center gap-1.5 font-semibold">
                      <span>{claudeWeekly !== undefined ? `${claudeWeekly}%` : '--'}</span>
                      {claudeWeekly !== undefined && <CircularProgress percent={claudeWeekly} />}
                    </div>
                  </div>

                  {/* Five Hour Limit Remaining */}
                  <div className="flex items-center justify-between font-medium text-zinc-900 dark:text-zinc-100">
                    <span>{language === 'zh' ? '5 小时滚动剩余配额' : 'Five Hour Limit Remaining'}</span>
                    <div className="flex items-center gap-1.5 font-semibold">
                      <span>{claude5h !== undefined ? `${claude5h}%` : '--'}</span>
                      {claude5h !== undefined && <CircularProgress percent={claude5h} />}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Right Flyout Popover: Sub Effort Selector (when hovering model with subEfforts) */}
          {activeSubMenu && activeSubMenu !== 'usage' && (
            <div className="w-44 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] shadow-2xl p-2 space-y-1 font-sans text-xs animate-in fade-in zoom-in-95 duration-100">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                {language === 'zh' ? '思考强度 (Effort)' : 'Reasoning Effort'}
              </div>
              {(['low', 'medium', 'high'] as ReasoningEffort[]).map((eff) => {
                const effLabel = eff === 'high' ? 'High' : eff === 'medium' ? 'Medium' : 'Low';
                const isSelected = currentEffort === eff;
                return (
                  <button
                    key={eff}
                    type="button"
                    onClick={() => {
                      const targetModel = DEFAULT_MODELS.find((m) => m.id === activeSubMenu);
                      if (targetModel) {
                        handleSelectModel(targetModel, eff);
                      }
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-white font-medium'
                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    <span>{effLabel}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-zinc-900 dark:text-zinc-100 stroke-[2.5]" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <AccountManagerModal
        isOpen={isAccountModalOpen}
        isStreaming={isStreaming}
        onClose={() => setIsAccountModalOpen(false)}
        onAccountSwitched={handleAccountSwitched}
      />
    </div>
  );
}
