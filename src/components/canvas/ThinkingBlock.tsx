import React, { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useI18n } from '@/i18n';

interface ThinkingBlockProps {
  thinking?: string;
  isStreaming?: boolean;
  durationSeconds?: number;
  createdAt?: number;
}

export function ThinkingBlock({
  thinking,
  isStreaming,
  durationSeconds,
  createdAt,
}: ThinkingBlockProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [liveElapsed, setLiveElapsed] = useState<number>(() => {
    if (durationSeconds && durationSeconds > 0) return durationSeconds;
    if (createdAt) return Math.max(1, Math.round((Date.now() - createdAt) / 1000));
    return 1;
  });

  useEffect(() => {
    if (!isStreaming) {
      if (durationSeconds && durationSeconds > 0) {
        setLiveElapsed(durationSeconds);
      }
      return;
    }

    // Anchor the live timer to the thinking block's creation time so that a
    // remount mid-stream (refresh, view switch, parent unmount/remount) keeps
    // counting from the block's actual creation instead of restarting at 1s.
    const start = createdAt || Date.now();
    const interval = setInterval(() => {
      setLiveElapsed(Math.max(1, Math.round((Date.now() - start) / 1000)));
    }, 1000);

    return () => clearInterval(interval);
  }, [isStreaming, durationSeconds, createdAt]);

  const hasThinking = Boolean(thinking && thinking.trim().length > 0);

  // When streaming is over and no backend duration was reported, fall back
  // to the last measured elapsed value instead of the generic title.
  const finalDuration = durationSeconds || liveElapsed;

  // Format label
  const durationLabel = isStreaming
    ? t.canvas.thinkingActive(liveElapsed)
    : finalDuration && finalDuration > 0
    ? t.canvas.thinkingElapsed(finalDuration)
    : t.canvas.thinkingTitle;

  return (
    <div className="my-1.5 font-sans select-none">
      {/* Sleek One-line Trigger Bar */}
      <button
        onClick={() => {
          if (hasThinking) setIsOpen(!isOpen);
        }}
        className={`group inline-flex items-center gap-1.5 text-[13px] transition-colors py-0.5 ${
          hasThinking
            ? 'cursor-pointer text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
            : 'cursor-default text-zinc-500 dark:text-zinc-400'
        }`}
      >
        <span className="font-medium tracking-tight">
          {durationLabel}
        </span>
        {isStreaming && (
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 dark:bg-zinc-400 animate-ping inline-block" />
        )}
        {hasThinking && (
          <ChevronRight
            className={`w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-800 dark:text-zinc-400 dark:group-hover:text-zinc-200 transition-transform duration-200 ${
              isOpen ? 'rotate-90' : ''
            }`}
          />
        )}
      </button>

      {/* Collapsible Thinking Content */}
      {isOpen && hasThinking && (
        <div className="mt-2 mb-3 pl-3.5 pr-2 py-2.5 border-l-2 border-zinc-300 dark:border-zinc-700 text-[13px] text-zinc-800 dark:text-zinc-200 font-mono leading-relaxed overflow-x-auto select-text prose prose-zinc dark:prose-invert prose-sm max-w-none bg-zinc-50 dark:bg-zinc-900/50 rounded-r-lg">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {thinking || ''}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}


