import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Globe,
  KeyRound,
  Layers,
  LoaderCircle,
  Plus,
  RefreshCw,
  Sparkles,
  Terminal,
  Trash2,
  Zap,
  X,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { AccountWithQuotaInfo } from '@/types';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

type PendingAction =
  | { type: 'switch'; account: AccountWithQuotaInfo }
  | { type: 'remove'; account: AccountWithQuotaInfo }
  | { type: 'refresh'; account: AccountWithQuotaInfo }
  | null;

interface AccountManagerModalProps {
  isOpen: boolean;
  isStreaming: boolean;
  onClose: () => void;
  onAccountSwitched: () => Promise<void> | void;
}

function getQuotaColor(percent?: number) {
  if (percent === undefined || percent === null) return 'bg-zinc-300 dark:bg-zinc-700';
  if (percent >= 50) return 'bg-emerald-500';
  if (percent >= 20) return 'bg-amber-500';
  return 'bg-rose-500';
}

function getQuotaTextColor(percent?: number) {
  if (percent === undefined || percent === null) return 'text-zinc-500 dark:text-zinc-400';
  if (percent >= 50) return 'text-emerald-700 dark:text-emerald-400 font-semibold';
  if (percent >= 20) return 'text-amber-700 dark:text-amber-400 font-semibold';
  return 'text-rose-700 dark:text-rose-400 font-semibold';
}

function formatRelativeReset(isoStr?: string, lang?: string): string | null {
  if (!isoStr) return null;
  try {
    const target = new Date(isoStr).getTime();
    const now = Date.now();
    const diffMs = target - now;
    if (diffMs <= 0) return lang === 'zh' ? '即将恢复' : 'Refreshing soon';

    const diffMins = Math.round(diffMs / (1000 * 60));
    if (diffMins < 60) {
      return lang === 'zh' ? `${diffMins} 分钟后恢复` : `Refreshes in ${diffMins}m`;
    }
    const diffHours = Math.floor(diffMins / 60);
    const remainMins = diffMins % 60;
    if (diffHours < 24) {
      return lang === 'zh'
        ? `${diffHours} 小时 ${remainMins} 分后恢复`
        : `Refreshes in ${diffHours}h ${remainMins}m`;
    }
    const diffDays = Math.floor(diffHours / 24);
    const remainHours = diffHours % 24;
    return lang === 'zh'
      ? `${diffDays} 天 ${remainHours} 小时后恢复`
      : `Refreshes in ${diffDays}d ${remainHours}h`;
  } catch {
    return null;
  }
}

export function AccountManagerModal({
  isOpen,
  isStreaming,
  onClose,
  onAccountSwitched,
}: AccountManagerModalProps) {
  const { language } = useI18n();
  const [accounts, setAccounts] = useState<AccountWithQuotaInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [isOAuthWaiting, setIsOAuthWaiting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  // Advanced / Fallback drawers
  const [isManualInputOpen, setIsManualInputOpen] = useState(false);
  const [manualCodeInput, setManualCodeInput] = useState('');
  const [isHandoffGuideOpen, setIsHandoffGuideOpen] = useState(false);

  const loadAccounts = async () => {
    setIsLoading(true);
    try {
      const list = await invoke<AccountWithQuotaInfo[]>('list_accounts_with_quota');
      setAccounts(list);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setMessage(null);
    setError(null);
    setPendingAction(null);
    setIsOAuthWaiting(false);
    setIsManualInputOpen(false);
    setManualCodeInput('');
    setIsHandoffGuideOpen(false);
    void loadAccounts();
  }, [isOpen]);

  // 1. Primary Google OAuth 2.0 Browser Login
  const handleGoogleOAuthLogin = async () => {
    if (isStreaming) {
      setError(
        language === 'zh'
          ? '请先停止正在生成的回复，再登录新账号。'
          : 'Stop generating the response before signing in.'
      );
      return;
    }
    setIsWorking(true);
    setIsOAuthWaiting(true);
    setError(null);
    setMessage(null);

    try {
      const account = await invoke<{ email: string }>('start_google_oauth');
      await loadAccounts();
      await onAccountSwitched();
      setIsOAuthWaiting(false);
      setIsManualInputOpen(false);
      setMessage(
        language === 'zh'
          ? `登录成功！已添加并切换至 ${account.email}。`
          : `Signed in successfully! Switched to ${account.email}.`
      );
    } catch (reason) {
      const errStr = String(reason);
      if (!errStr.includes('cancelled') && !errStr.includes('Cancelled')) {
        setError(errStr);
      }
    } finally {
      setIsWorking(false);
      setIsOAuthWaiting(false);
    }
  };

  const cancelOAuthLogin = async () => {
    try {
      await invoke('cancel_google_oauth');
    } catch {
      // ignore
    } finally {
      setIsOAuthWaiting(false);
      setIsWorking(false);
    }
  };

  // 2. Manual Auth Code / URL Submission Fallback
  const handleManualCodeSubmit = async () => {
    if (!manualCodeInput.trim()) return;
    if (isStreaming) {
      setError(
        language === 'zh'
          ? '请先停止正在生成的回复，再提交授权码。'
          : 'Stop generating the response before submitting the authorization code.'
      );
      return;
    }
    setIsWorking(true);
    setError(null);
    setMessage(null);

    try {
      const account = await invoke<{ email: string }>('submit_manual_auth_code', {
        codeOrUrl: manualCodeInput.trim(),
      });
      await loadAccounts();
      await onAccountSwitched();
      setManualCodeInput('');
      setIsManualInputOpen(false);
      setMessage(
        language === 'zh'
          ? `授权码验证成功！已添加并切换至 ${account.email}。`
          : `Authorization verified! Switched to ${account.email}.`
      );
    } catch (reason) {
      setError(String(reason));
    } finally {
      setIsWorking(false);
    }
  };

  // 3. Official App Handoff Capture
  const captureCurrentAccount = async () => {
    if (isStreaming) {
      setError(
        language === 'zh'
          ? '请先停止正在生成的回复，再保存或切换登录账号。'
          : 'Stop the response that is generating before saving or switching accounts.'
      );
      return;
    }
    setIsWorking(true);
    setError(null);
    setMessage(null);
    try {
      const account = await invoke<{ email: string }>('import_active_account');
      await loadAccounts();
      await onAccountSwitched();
      setIsHandoffGuideOpen(false);
      setMessage(
        language === 'zh'
          ? `已从钥匙串导入 ${account.email}，本地会话已生效。`
          : `${account.email} imported from Keychain and active.`
      );
    } catch (reason) {
      setError(String(reason));
    } finally {
      setIsWorking(false);
    }
  };

  const beginOfficialLoginHandoff = async () => {
    if (isStreaming) {
      setError(
        language === 'zh'
          ? '请先停止正在生成的回复，再登录其他账号。'
          : 'Stop the response that is generating before signing in to another account.'
      );
      return;
    }
    setIsWorking(true);
    setError(null);
    setMessage(null);
    try {
      await invoke('open_official_antigravity_login');
      setIsHandoffGuideOpen(true);
      setMessage(
        language === 'zh'
          ? '已打开 Antigravity 官方应用。请在其中完成登录，随后点击下方保存。'
          : 'Antigravity is open. Finish signing in there, then save it below.'
      );
    } catch (reason) {
      setError(String(reason));
    } finally {
      setIsWorking(false);
    }
  };

  // 4. Confirm Dialog Action (Switch, Remove, Refresh)
  const confirmAction = async () => {
    if (!pendingAction) return;
    setIsWorking(true);
    setError(null);
    setMessage(null);
    try {
      if (pendingAction.type === 'switch') {
        const account = await invoke<{ email: string }>('switch_active_account', {
          accountId: pendingAction.account.id,
        });
        await loadAccounts();
        setPendingAction(null);
        await onAccountSwitched();
        setMessage(
          language === 'zh'
            ? `已切换至 ${account.email}，配额已实时更新。`
            : `Switched to ${account.email}, quota refreshed.`
        );
      } else if (pendingAction.type === 'refresh') {
        const account = await invoke<{ email: string }>('refresh_account_token', {
          accountId: pendingAction.account.id,
        });
        await loadAccounts();
        setPendingAction(null);
        setMessage(
          language === 'zh'
            ? `已成功刷新 ${account.email} 的授权 Token！`
            : `Successfully refreshed authorization token for ${account.email}!`
        );
      } else {
        await invoke('remove_account', { accountId: pendingAction.account.id });
        await loadAccounts();
        setPendingAction(null);
        setMessage(
          language === 'zh'
            ? `已移除 ${pendingAction.account.email} 的已保存凭据。`
            : `Removed the saved credential for ${pendingAction.account.email}.`
        );
      }
    } catch (reason) {
      setError(String(reason));
    } finally {
      setIsWorking(false);
    }
  };

  const copy = {
    title: language === 'zh' ? '多账号额度看板与切换' : 'Multi-Account Quota & Switcher',
    description:
      language === 'zh'
        ? '直观对比各账号实时剩余额度；一键无缝切换并自动重启本地引擎。'
        : 'Compare real-time remaining quota across accounts; switch seamlessly with 1 click.',
    googleLoginBtn: language === 'zh' ? 'Google 浏览器登录新账号' : 'Sign in with Google (New Account)',
    oauthWaitingTitle:
      language === 'zh' ? '已拉起浏览器授权' : 'Waiting for Google Authorization',
    oauthWaitingDesc:
      language === 'zh'
        ? '请在系统浏览器中选择 Google 账号并完成授权。完成之后此窗口将自动同步。'
        : 'Please select your Google account and grant access in the browser. This window will sync automatically.',
    cancelAuth: language === 'zh' ? '取消授权' : 'Cancel Authorization',
    refresh: language === 'zh' ? '刷新全部配额' : 'Refresh All Quotas',
    refreshTokenBtn: language === 'zh' ? '刷新 Token' : 'Refresh Token',
    empty: language === 'zh' ? '尚未添加任何 Google 账号' : 'No Google accounts added yet',
    emptyHint:
      language === 'zh'
        ? '点击上方「Google 浏览器登录新账号」添加你的第一个账号。'
        : 'Click "Sign in with Google" above to add your first account.',
    current: language === 'zh' ? '当前使用中' : 'Active Quota',
    switchBtn: language === 'zh' ? '切换使用此号' : 'Switch to this account',
    switch: language === 'zh' ? '切换' : 'Switch',
    remove: language === 'zh' ? '移除' : 'Remove',
    switching:
      language === 'zh' ? '切换账号会重启本地 CLI 会话' : 'Switching restarts local CLI session',
    switchDescription:
      language === 'zh'
        ? '切换账号后，后续对话将立即使用该账号的独立配额池。'
        : 'Future turns will execute under the switched account quota.',
    refreshingTitle: language === 'zh' ? '刷新授权 Token' : 'Refresh Access Token',
    refreshingDescription:
      language === 'zh'
        ? '将通过 Google OAuth Refresh Token 重新换取最新 Access Token。'
        : 'Uses the Google OAuth refresh token to renew the access token.',
    removeDescription:
      language === 'zh'
        ? '这会从系统钥匙串与本地保险库删除该账号凭据，无法撤销。'
        : 'This permanently removes the saved credential from Keychain.',
    confirm: language === 'zh' ? '确认继续' : 'Confirm',
    manualTitle: language === 'zh' ? '手动输入回调链接 / 授权码' : 'Manual Auth Code / URL Entry',
    manualDesc:
      language === 'zh'
        ? '如果本地 51121 端口被防火墙或网络拦截，请在此粘贴浏览器重定向后的完整地址：'
        : 'If port 51121 callback was blocked, paste the full redirected URL from browser:',
    manualPlaceholder:
      'http://localhost:51121/oauth-callback?code=4/0Abc... 或 4/0Abc...',
    manualSubmitBtn: language === 'zh' ? '验证并导入' : 'Verify & Import',
    handoffTitle: language === 'zh' ? '从已安装的官方 Antigravity 导入' : 'Import from official Antigravity app',
    handoffBtn: language === 'zh' ? '从官方应用导入' : 'Import from Official App',
    saveAfterHandoff: language === 'zh' ? '已在官方应用登录，立即同步' : 'I finished signing in — sync now',
    gemini5hLabel: language === 'zh' ? 'Gemini 5小时额度' : 'Gemini 5h Limit',
    geminiWeeklyLabel: language === 'zh' ? 'Gemini 每周主力额度' : 'Gemini Weekly Limit',
    claude3pLabel: language === 'zh' ? 'Claude / 3P 模型额度' : 'Claude / 3P Models',
    inactiveHint:
      language === 'zh'
        ? '点击「切换」后即可实时调取并使用该账号的配额池'
        : 'Click "Switch" to activate and query this account quota pool in real-time',
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Banner with Global Refresh */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-purple-100 bg-purple-50/70 px-3.5 py-2.5 dark:border-purple-900/40 dark:bg-purple-950/20">
          <div className="flex min-w-0 items-center gap-2.5 text-xs text-purple-900 dark:text-purple-100">
            <Zap className="h-4 w-4 shrink-0 text-purple-600 dark:text-purple-400" />
            <span className="leading-relaxed font-medium">
              {language === 'zh'
                ? '全账号实时用量免切换看板。各账号额度独立监控，一键快速切换。'
                : 'Live multi-account quota dashboard without switching. Compare quotas and switch seamlessly.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void loadAccounts()}
            disabled={isLoading || isWorking}
            className="flex items-center gap-1.5 rounded-lg border border-purple-200 bg-white px-2.5 py-1 text-xs font-medium text-purple-700 shadow-sm transition hover:bg-purple-50 disabled:opacity-50 dark:border-purple-800 dark:bg-purple-900/50 dark:text-purple-200 dark:hover:bg-purple-900/80"
            title={copy.refresh}
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{language === 'zh' ? '刷新配额' : 'Refresh'}</span>
          </button>
        </div>

        {/* Status messages */}
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs leading-relaxed text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
          >
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs leading-relaxed text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
            {message}
          </div>
        )}

        {/* OAuth waiting in progress banner */}
        {isOAuthWaiting && (
          <div className="rounded-xl border border-purple-200 bg-purple-50/90 p-4 shadow-sm dark:border-purple-800/80 dark:bg-purple-950/40">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white shadow-md shadow-purple-600/30">
                <Globe className="h-5 w-5 animate-pulse" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-purple-950 dark:text-purple-100">
                    {copy.oauthWaitingTitle}
                  </p>
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-purple-600 dark:text-purple-300">
                    <LoaderCircle className="h-3 w-3 animate-spin" />
                    Listening 51121
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-purple-800/90 dark:text-purple-200/80">
                  {copy.oauthWaitingDesc}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void cancelOAuthLogin()}
                    className="h-7 text-xs text-purple-700 hover:bg-purple-100 dark:text-purple-300 dark:hover:bg-purple-900/50"
                  >
                    <X className="mr-1.5 h-3 w-3" />
                    {copy.cancelAuth}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setIsManualInputOpen(true)}
                    className="text-[11px] text-purple-600 underline-offset-2 hover:underline dark:text-purple-400"
                  >
                    {language === 'zh' ? '无法自动跳转？手动输入' : 'Manual code entry'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Accounts Quota Cards List */}
        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
          {isLoading && accounts.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-zinc-500">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              {language === 'zh' ? '正在并发拉取所有账号的实时配额与授权状态…' : 'Fetching account quotas in parallel…'}
            </div>
          ) : accounts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center dark:border-zinc-800">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
                <KeyRound className="h-5 w-5" />
              </div>
              <p className="mt-2.5 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {copy.empty}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                {copy.emptyHint}
              </p>
            </div>
          ) : (
            accounts.map((account) => {
              const gemini5hResetHint = formatRelativeReset(account.gemini_5h_reset, language);
              const geminiWeeklyResetHint = formatRelativeReset(account.gemini_weekly_reset, language);
              const claudeWeeklyResetHint = formatRelativeReset(account.claude_weekly_reset, language);

              return (
                <div
                  key={account.id}
                  className={`group rounded-xl border p-4 transition ${
                    account.is_active
                      ? 'border-purple-300 bg-gradient-to-b from-purple-50/80 to-purple-50/30 shadow-sm dark:border-purple-800/80 dark:from-purple-950/40 dark:to-purple-950/10'
                      : 'border-zinc-200/90 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:border-zinc-700'
                  }`}
                >
                  {/* Account Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-inner ${
                          account.is_active
                            ? 'bg-purple-600 text-white shadow-purple-600/30'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                        }`}
                      >
                        {account.email.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            {account.label || account.email}
                          </p>
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            {account.tier_name || 'Standard'}
                          </span>
                        </div>
                        {account.label !== account.email && (
                          <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                            {account.email}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions & Status Badge */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {account.is_active ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100/90 px-2.5 py-1 text-[11px] font-bold text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 shadow-sm">
                          <CheckCircle2 className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                          {copy.current}
                        </span>
                      ) : account.is_valid === false ? (
                        <Button
                          size="sm"
                          variant="purple"
                          onClick={() => void handleGoogleOAuthLogin()}
                          disabled={isWorking}
                          className="h-7 text-xs font-semibold shadow-sm"
                        >
                          <Globe className="mr-1 h-3 w-3" />
                          {language === 'zh' ? '重新登录授权' : 'Re-authenticate'}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="purple"
                          onClick={() => setPendingAction({ type: 'switch', account })}
                          disabled={isWorking}
                          className="h-7 text-xs font-semibold shadow-sm"
                        >
                          <ArrowRightLeft className="mr-1 h-3 w-3" />
                          {copy.switchBtn}
                        </Button>
                      )}

                      {account.is_valid !== false && (
                        <button
                          type="button"
                          onClick={() => setPendingAction({ type: 'refresh', account })}
                          disabled={isWorking}
                          className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-purple-50 hover:text-purple-600 disabled:opacity-50 dark:hover:bg-purple-950/30 dark:hover:text-purple-300"
                          title={copy.refreshTokenBtn}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {!account.is_active && (
                        <button
                          type="button"
                          onClick={() => setPendingAction({ type: 'remove', account })}
                          disabled={isWorking}
                          className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/30 dark:hover:text-red-300"
                          title={copy.remove}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quota Progress Bars Section (Rendered for ALL valid accounts!) */}
                  {account.is_valid === false ? (
                    <div className="mt-3 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                        {language === 'zh'
                          ? '此账号在钥匙串中未找到有效凭证，请点击「重新登录授权」'
                          : 'Credential missing from Keychain. Please re-authenticate.'}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleGoogleOAuthLogin()}
                        disabled={isWorking}
                        className="font-semibold text-purple-700 hover:underline dark:text-purple-400 shrink-0 ml-2"
                      >
                        {language === 'zh' ? '登录授权' : 'Sign in'} →
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`mt-3.5 space-y-2.5 rounded-xl border p-3 ${
                        account.is_active
                          ? 'border-purple-100/80 bg-white/70 dark:border-purple-900/50 dark:bg-zinc-900/60'
                          : 'border-zinc-100 bg-zinc-50/80 dark:border-zinc-800/60 dark:bg-zinc-900/40'
                      }`}
                    >
                      {/* Gemini 5h Limit */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                            <Zap className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                            {copy.gemini5hLabel}
                          </span>
                          <div className="flex items-center gap-2">
                            {gemini5hResetHint && (
                              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                                {gemini5hResetHint}
                              </span>
                            )}
                            <span className={getQuotaTextColor(account.gemini_5h_percent)}>
                              {account.gemini_5h_percent !== undefined
                                ? `${account.gemini_5h_percent}% 剩余`
                                : '查询中…'}
                            </span>
                          </div>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200/70 dark:bg-zinc-800">
                          <div
                            className={`h-full transition-all duration-500 ${getQuotaColor(
                              account.gemini_5h_percent
                            )}`}
                            style={{ width: `${account.gemini_5h_percent ?? 0}%` }}
                          />
                        </div>
                      </div>

                      {/* Gemini Weekly Limit */}
                      <div className="space-y-1 pt-0.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                            <Clock className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                            {copy.geminiWeeklyLabel}
                          </span>
                          <div className="flex items-center gap-2">
                            {geminiWeeklyResetHint && (
                              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                                {geminiWeeklyResetHint}
                              </span>
                            )}
                            <span className={getQuotaTextColor(account.gemini_weekly_percent)}>
                              {account.gemini_weekly_percent !== undefined
                                ? `${account.gemini_weekly_percent}% 剩余`
                                : '查询中…'}
                            </span>
                          </div>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200/70 dark:bg-zinc-800">
                          <div
                            className={`h-full transition-all duration-500 ${getQuotaColor(
                              account.gemini_weekly_percent
                            )}`}
                            style={{ width: `${account.gemini_weekly_percent ?? 0}%` }}
                          />
                        </div>
                      </div>

                      {/* Claude / 3P Limit (if exists) */}
                      {account.claude_weekly_percent !== undefined && (
                        <div className="space-y-1 pt-0.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                              <Sparkles className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                              {copy.claude3pLabel}
                            </span>
                            <div className="flex items-center gap-2">
                              {claudeWeeklyResetHint && (
                                <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                                  {claudeWeeklyResetHint}
                                </span>
                              )}
                              <span className={getQuotaTextColor(account.claude_weekly_percent)}>
                                {`${account.claude_weekly_percent}% 每周`}
                                {account.claude_5h_percent !== undefined
                                  ? ` · ${account.claude_5h_percent}% 5h`
                                  : ''}
                              </span>
                            </div>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200/70 dark:bg-zinc-800">
                            <div
                              className={`h-full transition-all duration-500 ${getQuotaColor(
                                account.claude_weekly_percent
                              )}`}
                              style={{ width: `${account.claude_weekly_percent ?? 0}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Action Confirmation Modal */}
        {pendingAction && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3.5 dark:border-amber-900/60 dark:bg-amber-950/30">
            <div className="flex gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-amber-950 dark:text-amber-100">
                  {pendingAction.type === 'switch'
                    ? copy.switching
                    : pendingAction.type === 'refresh'
                    ? copy.refreshingTitle
                    : copy.remove}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-amber-900/80 dark:text-amber-200/80">
                  {pendingAction.type === 'switch'
                    ? copy.switchDescription
                    : pendingAction.type === 'refresh'
                    ? copy.refreshingDescription
                    : copy.removeDescription}
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPendingAction(null)}
                    disabled={isWorking}
                  >
                    {language === 'zh' ? '取消' : 'Cancel'}
                  </Button>
                  <Button
                    size="sm"
                    variant={pendingAction.type === 'remove' ? 'danger' : 'purple'}
                    onClick={() => void confirmAction()}
                    disabled={isWorking}
                  >
                    {isWorking ? (
                      <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : pendingAction.type === 'switch' ? (
                      <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
                    ) : pendingAction.type === 'refresh' ? (
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    ) : null}
                    {copy.confirm}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Primary Action Button: Google OAuth */}
        <Button
          variant="purple"
          className="w-full h-10 text-sm font-semibold shadow-md shadow-purple-600/20"
          onClick={() => void handleGoogleOAuthLogin()}
          disabled={isWorking || isLoading || isStreaming}
        >
          {isWorking && isOAuthWaiting ? (
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Globe className="mr-2 h-4 w-4" />
          )}
          {copy.googleLoginBtn}
        </Button>

        {/* Collapsible Secondary Actions */}
        <div className="space-y-2 pt-1 border-t border-zinc-100 dark:border-zinc-800/80">
          {/* 1. Manual code entry drawer */}
          <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/40">
            <button
              type="button"
              onClick={() => setIsManualInputOpen(!isManualInputOpen)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              <span className="flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5 text-zinc-500" />
                {copy.manualTitle}
              </span>
              {isManualInputOpen ? (
                <ChevronUp className="h-3.5 w-3.5 text-zinc-400" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
              )}
            </button>
            {isManualInputOpen && (
              <div className="p-3 pt-1 border-t border-zinc-200/60 space-y-2 dark:border-zinc-800/60">
                <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {copy.manualDesc}
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualCodeInput}
                    onChange={(e) => setManualCodeInput(e.target.value)}
                    placeholder={copy.manualPlaceholder}
                    disabled={isWorking}
                    className="flex-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-900 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  <Button
                    size="sm"
                    variant="purple"
                    onClick={() => void handleManualCodeSubmit()}
                    disabled={!manualCodeInput.trim() || isWorking}
                  >
                    {isWorking ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : copy.manualSubmitBtn}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* 2. Official App Handoff drawer */}
          <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/40">
            <button
              type="button"
              onClick={() => setIsHandoffGuideOpen(!isHandoffGuideOpen)}
              className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              <span className="flex items-center gap-1.5">
                <ExternalLink className="h-3.5 w-3.5 text-zinc-500" />
                {copy.handoffTitle}
              </span>
              {isHandoffGuideOpen ? (
                <ChevronUp className="h-3.5 w-3.5 text-zinc-400" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
              )}
            </button>
            {isHandoffGuideOpen && (
              <div className="p-3 pt-1 border-t border-zinc-200/60 space-y-2.5 dark:border-zinc-800/60">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() => void beginOfficialLoginHandoff()}
                    disabled={isWorking}
                  >
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    {language === 'zh' ? '打开官方应用' : 'Launch Antigravity'}
                  </Button>
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={() => void captureCurrentAccount()}
                    disabled={isWorking}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {copy.saveAfterHandoff}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
