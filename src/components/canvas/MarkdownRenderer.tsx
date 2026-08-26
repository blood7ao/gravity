import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import mermaid from 'mermaid';
import { Copy, Check } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useThemeStore } from '@/stores/useThemeStore';
import { deduplicateConsecutiveParagraphs, sanitizeMarkdownContent } from '@/lib/utils';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    darkMode: true,
    background: '#0d0e12',
    primaryColor: '#7c3aed',
    primaryTextColor: '#f4f4f5',
    lineColor: '#a1a1aa',
  },
});

interface MarkdownRendererProps {
  content: string;
  className?: string;
  isStreaming?: boolean;
}

function MermaidBlock({ chart, isStreaming }: { chart: string; isStreaming: boolean }) {
  const { resolvedTheme } = useThemeStore();
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // An unfinished fenced block is expected while the model is streaming.
    // Mermaid treats it as invalid syntax and otherwise adds its error SVG to
    // document.body on every delta.
    if (isStreaming) {
      setSvg('');
      setError(null);
      return () => {
        cancelled = true;
      };
    }

    try {
      mermaid.initialize({
        startOnLoad: false,
        suppressErrorRendering: true,
        theme: resolvedTheme === 'dark' ? 'dark' : 'default',
        themeVariables: resolvedTheme === 'dark'
          ? {
              darkMode: true,
              background: '#0d0e12',
              primaryColor: '#7c3aed',
              primaryTextColor: '#f4f4f5',
              lineColor: '#a1a1aa',
            }
          : {
              darkMode: false,
              background: '#f8fafc',
              primaryColor: '#7c3aed',
              primaryTextColor: '#1e293b',
              lineColor: '#64748b',
            },
      });
    } catch (e) {
      console.warn('Failed to re-initialize mermaid theme:', e);
    }

    const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
    // Mermaid defaults to document.body when no container is supplied. Render
    // into a detached node because only the returned SVG is inserted by React.
    const renderTarget = document.createElement('div');
    mermaid
      .render(id, chart, renderTarget)
      .then((res) => {
        if (cancelled) return;
        setSvg(res.svg);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('Mermaid render error:', err);
        setError(String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [chart, isStreaming, resolvedTheme]);

  if (isStreaming) {
    return (
      <div className="my-3 p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-500 dark:text-zinc-400">
        正在生成图表…
      </div>
    );
  }

  if (error) {
    return (
      <pre className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800 rounded-lg overflow-x-auto">
        <code>{chart}</code>
      </pre>
    );
  }

  return (
    <div
      className="my-3 p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-x-auto flex justify-center shadow-2xs"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function InlineCode({ node: _node, children, ...props }: any) {
  return (
    <code
      className="px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700/80 font-mono text-[12.5px] font-medium"
      {...props}
    >
      {children}
    </code>
  );
}

function CodeBlock({ className, children, isStreaming = false }: any) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : '';
  const codeString = String(children).replace(/\n$/, '');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy code:', e);
    }
  };

  if (lang === 'mermaid') {
    return <MermaidBlock chart={codeString} isStreaming={isStreaming} />;
  }

  return (
    <div className="relative my-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/90 dark:bg-[#0c0c0e] overflow-hidden group shadow-2xs">
      {/* Code Header */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-zinc-100 dark:bg-zinc-900/80 border-b border-zinc-200 dark:border-zinc-800/80 text-xs text-zinc-600 dark:text-zinc-400">
        <span className="font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200 uppercase tracking-wide">
          {lang || 'text'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition px-2 py-0.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800"
          title={t.common.copy}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">{t.common.copied}</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>{t.common.copy}</span>
            </>
          )}
        </button>
      </div>

      {/* Code Content */}
      <div className="p-3.5 overflow-x-auto font-mono text-[13px] leading-relaxed text-zinc-900 dark:text-zinc-100">
        <pre className="!bg-transparent !p-0 !m-0 !border-none !text-zinc-900 dark:!text-zinc-100">
          <code>{children}</code>
        </pre>
      </div>
    </div>
  );
}

function PreBlock({ node: _node, children, isStreaming = false, ...props }: any) {
  const codeChild = React.Children.toArray(children).find(
    (child) => React.isValidElement(child) && child.type === InlineCode
  );

  if (React.isValidElement(codeChild)) {
    const codeProps = codeChild.props as { className?: string; children?: React.ReactNode };
    return (
      <CodeBlock className={codeProps.className} isStreaming={isStreaming}>
        {codeProps.children}
      </CodeBlock>
    );
  }

  return <pre {...props}>{children}</pre>;
}

export function MarkdownRenderer({ content, className = '', isStreaming = false }: MarkdownRendererProps) {
  const sanitized = sanitizeMarkdownContent(content || '');
  const displayContent = isStreaming ? sanitized : deduplicateConsecutiveParagraphs(sanitized);

  return (
    <div className={`prose prose-zinc dark:prose-invert max-w-none text-[14px] leading-relaxed text-zinc-900 dark:text-zinc-100 font-sans ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
        components={{
          code: InlineCode,
          pre: (props) => <PreBlock {...props} isStreaming={isStreaming} />,
          p: ({ node, ...props }) => (
            <p className="mb-2 text-zinc-900 dark:text-zinc-100 text-[14px] leading-relaxed" {...props} />
          ),
          ul: ({ node, ...props }) => (
            <ul className="list-disc pl-5 my-2 space-y-1 text-zinc-900 dark:text-zinc-100 text-[14px]" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal pl-5 my-2 space-y-1 text-zinc-900 dark:text-zinc-100 text-[14px]" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="text-zinc-900 dark:text-zinc-100 text-[14px] leading-relaxed" {...props} />
          ),
          strong: ({ node, ...props }) => (
            <strong className="font-semibold text-zinc-950 dark:text-white" {...props} />
          ),
          h1: ({ node, ...props }) => (
            <h1 className="text-lg font-bold text-zinc-950 dark:text-white mt-4 mb-2" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-base font-bold text-zinc-950 dark:text-white mt-3 mb-1.5" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-[14.5px] font-semibold text-zinc-950 dark:text-white mt-2 mb-1" {...props} />
          ),
          a: ({ node, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline underline-offset-2 font-medium"
            />
          ),
          table: ({ node, ...props }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-sm" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th className="bg-zinc-100 dark:bg-zinc-900 px-3 py-2 text-left font-semibold text-zinc-900 dark:text-zinc-100" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="px-3 py-2 text-zinc-900 dark:text-zinc-100 border-t border-zinc-200 dark:border-zinc-800/80" {...props} />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="border-l-2 border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900/50 px-3.5 py-2 my-2.5 rounded-r text-zinc-800 dark:text-zinc-200 italic text-[13.5px]"
              {...props}
            />
          ),
        }}
      >
        {displayContent}
      </ReactMarkdown>
      {isStreaming && (
        <span className="inline-block w-1.5 h-4 bg-zinc-800 dark:bg-zinc-200 ml-1 align-middle animate-pulse rounded-xs" />
      )}
    </div>
  );
}
