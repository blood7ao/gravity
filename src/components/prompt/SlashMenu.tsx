import React from 'react';
import {
  ListTodo,
  Target,
  Play,
  Shield,
  Gauge,
  Trash2,
} from 'lucide-react';
import { useI18n } from '@/i18n';

export interface SlashCommandItem {
  id: string;
  name: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  action: () => void;
}

interface SlashMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCommand: (command: string) => void;
}

export function SlashMenu({ isOpen, onSelectCommand }: SlashMenuProps) {
  const { t } = useI18n();

  const commands: SlashCommandItem[] = [
    {
      id: 'plan',
      name: '/plan',
      label: t.slashCommands.planLabel,
      description: t.slashCommands.planDesc,
      icon: <ListTodo className="w-4 h-4 text-purple-400" />,
      action: () => onSelectCommand('/plan '),
    },
    {
      id: 'goal',
      name: '/goal',
      label: t.slashCommands.goalLabel,
      description: t.slashCommands.goalDesc,
      icon: <Target className="w-4 h-4 text-amber-400" />,
      action: () => onSelectCommand('/goal '),
    },
    {
      id: 'act',
      name: '/act',
      label: t.slashCommands.actLabel,
      description: t.slashCommands.actDesc,
      icon: <Play className="w-4 h-4 text-emerald-400" />,
      action: () => onSelectCommand('/act '),
    },
    {
      id: 'sandbox',
      name: '/sandbox',
      label: t.slashCommands.sandboxLabel,
      description: t.slashCommands.sandboxDesc,
      icon: <Shield className="w-4 h-4 text-blue-400" />,
      action: () => onSelectCommand('/sandbox '),
    },
    {
      id: 'effort',
      name: '/effort',
      label: t.slashCommands.effortLabel,
      description: t.slashCommands.effortDesc,
      icon: <Gauge className="w-4 h-4 text-cyan-400" />,
      action: () => onSelectCommand('/effort high '),
    },
    {
      id: 'clear',
      name: '/clear',
      label: t.slashCommands.clearLabel,
      description: t.slashCommands.clearDesc,
      icon: <Trash2 className="w-4 h-4 text-red-400" />,
      action: () => onSelectCommand('/clear'),
    },
  ];

  if (!isOpen) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 z-40 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl dark:shadow-2xl overflow-hidden p-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
      <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-zinc-200 dark:border-zinc-800/80 mb-1">
        {t.prompt.slashCommandsTitle}
      </div>
      <div className="max-h-56 overflow-y-auto space-y-0.5">
        {commands.map((cmd) => (
          <div
            key={cmd.id}
            onClick={cmd.action}
            className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-xs transition"
          >
            <div className="p-1 rounded bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
              {cmd.icon}
            </div>
            <div className="flex-1 truncate">
              <div className="font-semibold text-zinc-800 dark:text-zinc-200">{cmd.label}</div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{cmd.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
