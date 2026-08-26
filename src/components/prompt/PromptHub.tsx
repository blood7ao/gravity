import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowUp,
  Square,
  Plus,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  Hand,
  Check,
  Package,
  Mic,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  FileCode,
  ListTodo,
  Play,
  Bot,
  X,
  Sparkles,
  Paperclip,
  Target,
  Lightbulb,
  Radio,
  TrendingUp,
  Palette,
  Music,
  BarChart3,
  Folder,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '@/stores/useSessionStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useI18n } from '@/i18n';
import { SlashMenu } from './SlashMenu';
import { MentionPicker } from './MentionPicker';
import { ModelSelectorMenu } from './ModelSelectorMenu';
import { ProjectDropdown } from '@/components/canvas/ProjectDropdown';
import { ImageAttachment, WorkspaceFile, PermissionMode, ModelInfo } from '@/types';

interface PendingImage {
  id: string;
  file: File;
  previewUrl: string;
}

interface SavedPastedImage {
  filePath: string;
  fileName: string;
}

const MAX_PASTED_IMAGES = 4;
const MAX_PASTED_IMAGE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Unable to read image'));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

export function PromptHub() {
  const { t, language } = useI18n();

  const {
    currentMode,
    setMode,
    currentEffort,
    setEffort,
    isStreaming,
    conversationId,
    selectedModel,
    setModel,
    availableModels,
    setAvailableModels,
    selectedAgent,
    setAgent,
    addUserMessage,
    startAssistantTurn,
    clearSession,
    finishTurn,
    setStatusMessage,
  } = useSessionStore();

  const {
    activeProject,
    permissionMode,
    setPermissionMode,
    setIsAddProjectModalOpen,
  } = useWorkspaceStore();

  const [input, setInput] = useState('');
  const [isSlashMenuOpen, setIsSlashMenuOpen] = useState(false);
  const [isMentionPickerOpen, setIsMentionPickerOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [pastedImages, setPastedImages] = useState<PendingImage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [isPermissionMenuOpen, setIsPermissionMenuOpen] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<string[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const permissionMenuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const agentMenuRef = useRef<HTMLDivElement>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadCapabilities = () => {
      void invoke<ModelInfo[]>('list_models')
        .then((models) => {
          setAvailableModels(models);
          if (models.length > 0) {
            const current = useSessionStore.getState().selectedModel;
            const exists = models.some((m) => m.id === current || m.label === current);
            if (!exists) {
              setModel(models[0].label);
            }
          }
        })
        .catch((error) => console.warn('Failed to list agy models:', error));

      void invoke<string[]>('list_agents')
        .then((agents) => setAvailableAgents(agents))
        .catch((error) => console.warn('Failed to list agy agents:', error));
    };

    loadCapabilities();
    window.addEventListener('agy-account-switched', loadCapabilities);
    return () => window.removeEventListener('agy-account-switched', loadCapabilities);
  }, [setAvailableModels, setModel]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200
      )}px`;
    }
  }, [input]);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setIsPlusMenuOpen(false);
      }
      if (permissionMenuRef.current && !permissionMenuRef.current.contains(e.target as Node)) {
        setIsPermissionMenuOpen(false);
      }
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setIsModelMenuOpen(false);
      }
      if (agentMenuRef.current && !agentMenuRef.current.contains(e.target as Node)) {
        setIsAgentMenuOpen(false);
      }
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setIsProjectDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const updateInput = (val: string) => {
    setInput(val);

    // Slash command trigger
    if (val.startsWith('/') && !val.includes(' ')) {
      setIsSlashMenuOpen(true);
    } else {
      setIsSlashMenuOpen(false);
    }

    // Mention trigger
    const lastAtIndex = val.lastIndexOf('@');
    if (lastAtIndex >= 0 && !val.substring(lastAtIndex).includes(' ')) {
      setIsMentionPickerOpen(true);
      setMentionFilter(val.substring(lastAtIndex + 1));
    } else {
      setIsMentionPickerOpen(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateInput(e.target.value);
  };

  const removePastedImage = (id: string) => {
    setPastedImages((images) => {
      const target = images.find((image) => image.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return images.filter((image) => image.id !== id);
    });
  };

  const handleFiles = (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    setAttachmentError(null);
    const availableSlots = MAX_PASTED_IMAGES - pastedImages.length;
    const acceptedFiles = imageFiles
      .slice(0, Math.max(0, availableSlots))
      .filter((file) => SUPPORTED_IMAGE_TYPES.has(file.type) && file.size <= MAX_PASTED_IMAGE_BYTES);

    if (acceptedFiles.length !== imageFiles.length) {
      setAttachmentError(t.prompt.imagePasteFailed);
    }

    if (acceptedFiles.length > 0) {
      setPastedImages((images) => [
        ...images,
        ...acceptedFiles.map((file) => ({
          id: `image-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          file,
          previewUrl: URL.createObjectURL(file),
        })),
      ]);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(e.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);

    if (imageFiles.length > 0) {
      e.preventDefault();
      handleFiles(imageFiles);
    }

    const pastedText = e.clipboardData.getData('text/plain');
    if (pastedText && imageFiles.length > 0) {
      const textarea = textareaRef.current;
      const start = textarea?.selectionStart ?? input.length;
      const end = textarea?.selectionEnd ?? input.length;
      updateInput(`${input.slice(0, start)}${pastedText}${input.slice(end)}`);
    }
  };

  const handleSelectSlashCommand = (cmd: string) => {
    if (cmd === '/clear') {
      clearSession();
      setInput('');
      setIsSlashMenuOpen(false);
      return;
    }
    if (cmd.startsWith('/plan')) {
      setMode('plan');
    } else if (cmd.startsWith('/act')) {
      setMode('accept-edits');
    } else if (cmd.startsWith('/effort high')) {
      setEffort('high');
    }
    setInput(cmd);
    setIsSlashMenuOpen(false);
    textareaRef.current?.focus();
  };

  const handleSelectMentionFile = (file: WorkspaceFile) => {
    const lastAtIndex = input.lastIndexOf('@');
    if (lastAtIndex >= 0) {
      const newInput = input.substring(0, lastAtIndex) + `@${file.relative_path} `;
      setInput(newInput);
    }
    setIsMentionPickerOpen(false);
    textareaRef.current?.focus();
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if ((!trimmed && pastedImages.length === 0) || isStreaming || isSending) return;

    if (!activeProject?.path) {
      setIsAddProjectModalOpen(true);
      return;
    }

    try {
      setIsSending(true);
      setAttachmentError(null);

      const savedImages = await Promise.all(
        pastedImages.map(async (image) => {
          const dataUrl = await readFileAsDataUrl(image.file);
          return invoke<SavedPastedImage>('save_pasted_image', {
            dataUrl,
            mimeType: image.file.type,
          });
        })
      );
      const userContent = trimmed || t.prompt.imageOnlyPrompt;
      const promptContent = savedImages.length
        ? `${userContent}\n\n${t.prompt.imageAttachmentContext(savedImages.map((image) => image.filePath))}`
        : userContent;
      const imageAttachments: ImageAttachment[] = pastedImages.map((image, index) => ({
        id: image.id,
        name: savedImages[index]?.fileName || image.file.name || t.prompt.pastedImage,
        previewUrl: image.previewUrl,
        filePath: savedImages[index]?.filePath,
      }));

      addUserMessage(userContent, imageAttachments);
      startAssistantTurn();
      setInput('');
      setPastedImages([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }

      const sessionInfo = await invoke<any>('get_current_session_info');
      const needsRestart =
        !sessionInfo?.is_running ||
        sessionInfo?.conversation_id !== (conversationId || null) ||
        sessionInfo?.project_dir !== activeProject.path ||
        sessionInfo?.mode !== currentMode ||
        (sessionInfo?.model || null) !== (selectedModel || null) ||
        (sessionInfo?.agent || null) !== selectedAgent;

      if (needsRestart) {
        await invoke('start_session', {
          projectDir: activeProject.path,
          mode: currentMode,
          effort: currentEffort,
          conversationId: conversationId || null,
          model: selectedModel || null,
          agent: selectedAgent,
          skipPermissions: permissionMode === 'auto-approve',
        });
      }

      await invoke('send_prompt', { content: promptContent });
    } catch (err: any) {
      console.error('Failed to dispatch prompt:', err);
      const errMsg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
      finishTurn({
        status: 'ERROR',
        response: `启动会话失败: ${errMsg}`,
      });
      setStatusMessage('Error');
      setAttachmentError(pastedImages.length > 0 ? t.prompt.imagePasteFailed : null);
    } finally {
      setIsSending(false);
    }
  };

  const handleStop = async () => {
    try {
      await invoke('stop_session');
    } catch (err) {
      console.error('Failed to stop session:', err);
    } finally {
      finishTurn({
        status: 'CANCELLED',
        response: '会话已停止',
      });
      setStatusMessage('Ready');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isSlashMenuOpen || isMentionPickerOpen) {
        return;
      }
      handleSend();
    } else if (e.key === 'Escape') {
      setIsSlashMenuOpen(false);
      setIsMentionPickerOpen(false);
      setIsPlusMenuOpen(false);
      setIsModelMenuOpen(false);
      setIsAgentMenuOpen(false);
      setIsProjectDropdownOpen(false);
    }
  };

  const cyclePermissionMode = () => {
    const modes: PermissionMode[] = ['auto-approve', 'ask-first', 'sandbox'];
    const currentIdx = modes.indexOf(permissionMode);
    const nextMode = modes[(currentIdx + 1) % modes.length];
    setPermissionMode(nextMode);
  };

  const effortDisplayMap: Record<string, string> = {
    low: language === 'zh' ? '低' : 'Low',
    medium: language === 'zh' ? '中' : 'Medium',
    high: language === 'zh' ? '极高' : 'High',
  };

  const permissionLabel =
    permissionMode === 'auto-approve'
      ? t.prompt.fullAccess
      : permissionMode === 'ask-first'
      ? t.prompt.askPermission
      : t.prompt.sandboxAccess;

  return (
    <div className="relative w-full max-w-3xl mx-auto px-4 pb-4 font-sans">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            handleFiles(Array.from(e.target.files));
          }
        }}
      />

      {/* Popups */}
      <SlashMenu
        isOpen={isSlashMenuOpen}
        onClose={() => setIsSlashMenuOpen(false)}
        onSelectCommand={handleSelectSlashCommand}
      />

      <MentionPicker
        isOpen={isMentionPickerOpen}
        filter={mentionFilter}
        onClose={() => setIsMentionPickerOpen(false)}
        onSelectFile={handleSelectMentionFile}
      />

      {/* Gravity rounded prompt box */}
      <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 focus-within:border-zinc-400 dark:focus-within:border-zinc-600 focus-within:shadow-md transition-all p-3.5">
        {/* Project Selector Pill */}
        <div className="relative mb-2 inline-block" ref={projectDropdownRef}>
          <button
            type="button"
            onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#f0f0f4] dark:bg-zinc-800/80 hover:bg-zinc-200/80 dark:hover:bg-zinc-700/80 text-zinc-800 dark:text-zinc-200 text-xs font-medium transition cursor-pointer border border-zinc-200/60 dark:border-zinc-700/60 shadow-2xs group"
            title={activeProject?.path || t.canvas.selectProject}
          >
            <Folder className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition shrink-0" />
            <span className="max-w-[220px] truncate">
              {activeProject ? activeProject.name : (language === 'zh' ? '选择项目' : t.canvas.selectProject)}
            </span>
          </button>

          <ProjectDropdown
            isOpen={isProjectDropdownOpen}
            onClose={() => setIsProjectDropdownOpen(false)}
            align="left"
            direction="up"
          />
        </div>

        {/* Text Area */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInputChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder={
            !activeProject
              ? t.prompt.noProjectPlaceholder
              : currentMode === 'plan'
              ? t.prompt.planPlaceholder
              : currentMode === 'goal'
              ? t.prompt.goalPlaceholder
              : language === 'zh'
              ? '随心输入'
              : t.prompt.typeAnything
          }
          rows={1}
          className="w-full bg-transparent text-[14.5px] text-zinc-950 dark:text-zinc-50 placeholder-zinc-400 dark:placeholder-zinc-500 outline-none resize-none px-1.5 py-1 leading-relaxed max-h-48 font-sans font-normal"
        />

        {/* Attached Images Preview */}
        {pastedImages.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1.5 pt-1.5 pb-1">
            {pastedImages.map((image) => (
              <div
                key={image.id}
                className="relative flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/70 p-1.5 pr-7 shadow-2xs"
              >
                <img
                  src={image.previewUrl}
                  alt={t.prompt.pastedImage}
                  className="h-10 w-10 rounded-lg object-cover bg-zinc-200 dark:bg-zinc-700"
                />
                <span className="max-w-28 truncate text-xs text-zinc-700 dark:text-zinc-200 font-medium">
                  {image.file.name || t.prompt.pastedImage}
                </span>
                <button
                  type="button"
                  onClick={() => removePastedImage(image.id)}
                  disabled={isSending}
                  aria-label={t.prompt.removeImage}
                  title={t.prompt.removeImage}
                  className="absolute right-1 top-1 rounded-full p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 disabled:cursor-not-allowed dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {attachmentError && (
          <p className="px-1.5 pt-1 text-xs text-red-600 dark:text-red-400">{attachmentError}</p>
        )}

        {/* Bottom Action Controls Bar */}
        <div className="flex items-center justify-between pt-2.5 px-1 border-t border-zinc-100 dark:border-zinc-800 mt-1 select-none">
          {/* Left Controls */}
          <div className="flex items-center gap-2 relative">
            {/* Plus Menu Button */}
            <div className="relative" ref={plusMenuRef}>
              <button
                type="button"
                onClick={() => setIsPlusMenuOpen(!isPlusMenuOpen)}
                className="w-6 h-6 rounded-full flex items-center justify-center text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                title="更多操作"
              >
                <Plus className="w-4 h-4" />
              </button>

              {/* Plus Popup Menu - Matches Screenshot */}
              {isPlusMenuOpen && (
                <div className="absolute bottom-8 left-0 w-[300px] md:w-[320px] rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] shadow-2xl p-2.5 z-40 space-y-2 text-xs font-sans select-none animate-in fade-in zoom-in-95 duration-100">
                  {/* Section: 添加 (Add) */}
                  <div>
                    <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 px-2 py-0.5 mb-1">
                      {t.prompt.addMenuTitle}
                    </div>
                    <div className="space-y-0.5">
                      {/* 文件和文件夹 */}
                      <button
                        type="button"
                        onClick={() => {
                          setInput((prev) => prev + '@');
                          setIsMentionPickerOpen(true);
                          setIsPlusMenuOpen(false);
                          textareaRef.current?.focus();
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-left transition font-medium"
                      >
                        <Paperclip className="w-4 h-4 text-zinc-600 dark:text-zinc-400 shrink-0" />
                        <span>{t.prompt.filesAndFolders}</span>
                      </button>

                      {/* 附加 Antigravity */}
                      <button
                        type="button"
                        onClick={() => {
                          fileInputRef.current?.click();
                          setIsPlusMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-left transition font-medium"
                      >
                        <ChevronUp className="w-4 h-4 text-zinc-600 dark:text-zinc-400 shrink-0" />
                        <span>{t.prompt.attachAntigravity}</span>
                      </button>

                      {/* 目标 (Goal Mode) */}
                      <button
                        type="button"
                        onClick={() => {
                          setMode('goal');
                          setIsPlusMenuOpen(false);
                          textareaRef.current?.focus();
                        }}
                        className={`w-full flex items-start gap-2.5 px-2.5 py-1.5 rounded-xl text-left transition ${
                          currentMode === 'goal'
                            ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200'
                            : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                        }`}
                      >
                        <Target className="w-4 h-4 text-zinc-600 dark:text-zinc-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-semibold text-xs text-zinc-950 dark:text-white">
                            {t.prompt.goalOptionTitle}
                          </div>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            {t.prompt.goalOptionDesc}
                          </div>
                        </div>
                      </button>

                      {/* 计划模式 (Plan Mode) */}
                      <button
                        type="button"
                        onClick={() => {
                          setMode(currentMode === 'plan' ? 'accept-edits' : 'plan');
                          setIsPlusMenuOpen(false);
                          textareaRef.current?.focus();
                        }}
                        className={`w-full flex items-start gap-2.5 px-2.5 py-1.5 rounded-xl text-left transition ${
                          currentMode === 'plan'
                            ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-white'
                            : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
                        }`}
                      >
                        <Lightbulb className="w-4 h-4 text-zinc-600 dark:text-zinc-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-semibold text-xs text-zinc-950 dark:text-white">
                            {t.prompt.planOptionTitle}
                          </div>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            {t.prompt.planOptionDesc(currentMode === 'plan')}
                          </div>
                        </div>
                      </button>

                      {/* 录制技能 */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsPlusMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-left transition font-medium"
                      >
                        <Radio className="w-4 h-4 text-zinc-600 dark:text-zinc-400 shrink-0" />
                        <span>{t.prompt.recordSkillTitle}</span>
                      </button>
                    </div>
                  </div>

                  {/* Section: 插件 (Plugins) */}
                  <div className="border-t border-zinc-100 dark:border-zinc-800 pt-1.5">
                    <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 px-2 py-0.5 mb-1">
                      {t.prompt.pluginsTitle}
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <div className="truncate">
                          <span className="font-medium text-zinc-900 dark:text-zinc-100 text-xs">Public Equity Investing</span>
                          <span className="text-[10px] text-zinc-400 ml-1.5">PM research, long/short...</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                        <Palette className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <div className="truncate">
                          <span className="font-medium text-zinc-900 dark:text-zinc-100 text-xs">Canva</span>
                          <span className="text-[10px] text-zinc-400 ml-1.5">Create, review, edit designs</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                        <Music className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        <div className="truncate">
                          <span className="font-medium text-zinc-900 dark:text-zinc-100 text-xs">Apple Music</span>
                          <span className="text-[10px] text-zinc-400 ml-1.5">Build playlists and find music</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                        <BarChart3 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <div className="truncate">
                          <span className="font-medium text-zinc-900 dark:text-zinc-100 text-xs">Data Analytics</span>
                          <span className="text-[10px] text-zinc-400 ml-1.5">Answer business questions</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Permission Mode Popover Trigger & Card */}
            <div className="relative" ref={permissionMenuRef}>
              <button
                type="button"
                onClick={() => setIsPermissionMenuOpen(!isPermissionMenuOpen)}
                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition font-medium ${
                  permissionMode === 'auto-approve'
                    ? 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
                title="点击选择权限模式"
              >
                {permissionMode === 'auto-approve' && <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-500" />}
                {permissionMode === 'ask-first' && <Hand className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />}
                {permissionMode === 'sandbox' && <ShieldCheck className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />}
                <span className="font-semibold text-xs">
                  {permissionMode === 'auto-approve'
                    ? (language === 'zh' ? '完全访问' : 'Full access')
                    : permissionMode === 'ask-first'
                    ? (language === 'zh' ? '请求批准' : 'Ask for approval')
                    : (language === 'zh' ? '帮我批准' : 'Auto-approve')}
                </span>
              </button>

                      {/* Permission popover */}
              {isPermissionMenuOpen && (
                <div className="absolute bottom-9 left-0 w-[350px] md:w-[380px] rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] shadow-2xl p-4 z-40 space-y-2 font-sans select-none animate-in fade-in zoom-in-95 duration-100">
                  {/* Top Header */}
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-[13px] font-semibold text-zinc-600 dark:text-zinc-400">
                      {language === 'zh' ? '应如何批准 Antigravity 操作？' : 'How should Antigravity actions be approved?'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsPermissionMenuOpen(false)}
                      className="text-[13px] text-zinc-600 dark:text-zinc-400 underline underline-offset-2 hover:text-zinc-950 dark:hover:text-zinc-100 cursor-pointer"
                    >
                      {language === 'zh' ? '了解更多' : 'Learn more'}
                    </button>
                  </div>

                  {/* Options List */}
                  <div className="space-y-1 pt-1">
                    {[
                      {
                        mode: 'ask-first' as PermissionMode,
                        title: language === 'zh' ? '请求批准' : 'Ask for approval',
                        desc: language === 'zh' ? '编辑外部文件和使用互联网时始终询问' : 'Always ask when editing files and using internet',
                        icon: Hand,
                      },
                      {
                        mode: 'sandbox' as PermissionMode,
                        title: language === 'zh' ? '帮我批准' : 'Auto-approve safe actions',
                        desc: language === 'zh' ? '仅对检测到的风险操作请求批准' : 'Only ask approval for detected risky actions',
                        icon: ShieldCheck,
                      },
                      {
                        mode: 'auto-approve' as PermissionMode,
                        title: language === 'zh' ? '完全访问权限' : 'Full access',
                        desc: language === 'zh' ? '可不受限制地访问互联网和你电脑上的任何文件' : 'Unrestricted access to internet and any files on your computer',
                        icon: ShieldAlert,
                        isWarning: true,
                      },
                    ].map((opt) => {
                      const isSelected = permissionMode === opt.mode;
                      const IconComponent = opt.icon;
                      return (
                        <div
                          key={opt.mode}
                          onClick={() => {
                            setPermissionMode(opt.mode);
                            setIsPermissionMenuOpen(false);
                          }}
                          className={`group flex items-start gap-3 p-2.5 rounded-xl cursor-pointer transition text-left w-full ${
                            opt.isWarning && isSelected
                              ? 'bg-amber-50/50 dark:bg-amber-950/20'
                              : isSelected
                              ? 'bg-zinc-100/70 dark:bg-zinc-800/50'
                              : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                          }`}
                        >
                          {/* Left Icon */}
                          <div className="mt-0.5 shrink-0">
                            <IconComponent
                              className={`w-5 h-5 ${
                                opt.isWarning
                                  ? 'text-amber-600 dark:text-amber-500'
                                  : 'text-zinc-800 dark:text-zinc-200'
                              }`}
                            />
                          </div>

                          {/* Center Text Info */}
                          <div className="flex-1 pr-2">
                            <div
                              className={`text-sm font-bold ${
                                opt.isWarning
                                  ? 'text-amber-600 dark:text-amber-500'
                                  : 'text-zinc-950 dark:text-white'
                              }`}
                            >
                              {opt.title}
                            </div>
                            <div
                              className={`text-xs mt-0.5 leading-normal ${
                                opt.isWarning
                                  ? 'text-amber-600/90 dark:text-amber-500/90'
                                  : 'text-zinc-500 dark:text-zinc-400'
                              }`}
                            >
                              {opt.desc}
                            </div>
                          </div>

                          {/* Right Checkmark */}
                          {isSelected && (
                            <div className="shrink-0 mt-1">
                              <Check
                                className={`w-4 h-4 stroke-[2.5] ${
                                  opt.isWarning
                                    ? 'text-amber-600 dark:text-amber-500'
                                    : 'text-zinc-900 dark:text-zinc-100'
                                }`}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Mode Selection Pill (e.g. 💡 计划 / 🎯 目标) */}
            {currentMode === 'plan' && (
              <div className="relative group/modepill flex items-center">
                {/* Tooltip on hover */}
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold shadow-lg opacity-0 group-hover/modepill:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-30">
                  {t.prompt.createPlanTooltip}
                </div>
                <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs px-2 py-0.5 rounded-full font-medium shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setMode('accept-edits')}
                    className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-full p-0.5 cursor-pointer"
                    title="退出计划模式"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <span>{t.prompt.planPill}</span>
                </div>
              </div>
            )}

            {currentMode === 'goal' && (
              <div className="relative group/modepill flex items-center">
                {/* Tooltip on hover */}
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold shadow-lg opacity-0 group-hover/modepill:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-30">
                  {t.prompt.goalTooltip}
                </div>
                <div className="flex items-center gap-1 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 text-purple-800 dark:text-purple-300 text-xs px-2 py-0.5 rounded-full font-medium shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setMode('accept-edits')}
                    className="text-purple-400 hover:text-purple-700 dark:hover:text-purple-200 rounded-full p-0.5 cursor-pointer"
                    title="退出目标模式"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <span>{t.prompt.goalPill}</span>
                </div>
              </div>
            )}
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            {/* Agent Selector Dropdown */}
            <div className="relative" ref={agentMenuRef}>
              <button
                type="button"
                onClick={() => setIsAgentMenuOpen(!isAgentMenuOpen)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                title="切换 Agent"
              >
                <Bot className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span className="max-w-24 truncate">{selectedAgent || '默认 Agent'}</span>
                <ChevronDown className="w-3 h-3 text-zinc-500" />
              </button>

              {isAgentMenuOpen && (
                <div className="absolute bottom-8 right-0 w-56 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl p-2 z-30 space-y-1 text-xs">
                  <div className="text-[10px] uppercase font-semibold text-zinc-500 dark:text-zinc-400 px-1 mb-1">
                    Agent
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAgent(null);
                      setIsAgentMenuOpen(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition flex items-center justify-between ${
                      selectedAgent === null
                        ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-white font-medium'
                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    <span>默认 Agent</span>
                    {selectedAgent === null && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                  </button>
                  {availableAgents.map((agent) => (
                    <button
                      key={agent}
                      type="button"
                      onClick={() => {
                        setAgent(agent);
                        setIsAgentMenuOpen(false);
                      }}
                      className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition flex items-center justify-between ${
                        selectedAgent === agent
                          ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-white font-medium'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                      }`}
                    >
                      <span className="truncate">{agent}</span>
                      {selectedAgent === agent && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    </button>
                  ))}
                  {availableAgents.length === 0 && (
                    <p className="px-2 py-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                      未检测到可用 Agent
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Model & Effort Selector with View Usage Quota Popover */}
            <ModelSelectorMenu />

            {/* Mic / Voice Button */}
            <button
              type="button"
              className="w-6 h-6 rounded-full flex items-center justify-center text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
              title="语音输入"
            >
              <Mic className="w-4 h-4" />
            </button>

            {/* Solid Circular Send or Stop Button */}
            {isStreaming ? (
              <button
                type="button"
                onClick={handleStop}
                className="w-7 h-7 rounded-full bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 flex items-center justify-center hover:opacity-85 transition shadow-2xs"
                title={t.prompt.stop}
              >
                <Square className="w-3 h-3 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={(!input.trim() && pastedImages.length === 0) || isSending}
                className="w-7 h-7 rounded-full bg-zinc-950 dark:bg-zinc-100 text-white dark:text-zinc-950 flex items-center justify-center hover:opacity-85 disabled:opacity-30 disabled:cursor-not-allowed transition shadow-2xs"
                title={t.prompt.send}
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
