import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface TimeAgoTranslations {
  justNow: string;
  minutesAgo: (m: number) => string;
  hoursAgo: (h: number) => string;
  daysAgo: (d: number) => string;
}

export function formatTimeAgo(timestamp: number, t?: TimeAgoTranslations): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t ? t.justNow : 'Just now';
  if (minutes < 60) return t ? t.minutesAgo(minutes) : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t ? t.hoursAgo(hours) : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return t ? t.daysAgo(days) : `${days}d ago`;
}

export function formatTimeAgoShort(timestamp?: number | string): string {
  if (!timestamp) return '';
  const time = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  if (isNaN(time) || time <= 0) return '';
  const diff = Date.now() - time;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Deduplicate consecutive identical paragraphs/blocks within markdown text.
 */
export function deduplicateConsecutiveParagraphs(text: string): string {
  if (!text) return '';
  const paras = text.split(/\n{2,}/);
  const cleaned: string[] = [];
  for (let i = 0; i < paras.length; i++) {
    const trimmed = paras[i].trim();
    if (!trimmed) continue;
    if (cleaned.length > 0 && cleaned[cleaned.length - 1].trim() === trimmed) {
      continue;
    }
    cleaned.push(paras[i]);
  }
  return cleaned.join('\n\n');
}

/**
 * Merges two transcript text chunks (e.g. from consecutive PLANNER_RESPONSE steps)
 * avoiding duplications caused by full snapshot updates, restarting drafts, or suffix/prefix overlaps.
 */
export function mergeTranscriptText(existing: string, incoming: string): string {
  const ex = (existing || '').trim();
  const inc = (incoming || '').trim();

  if (!ex) return inc;
  if (!inc) return ex;

  // 1. Exact match or one is full substring of the other
  if (ex === inc || ex.includes(inc)) {
    return ex;
  }
  if (inc.includes(ex)) {
    return inc;
  }

  // 2. Character-level suffix/prefix overlap (e.g. at least 8 chars)
  const maxCheck = Math.min(ex.length, inc.length);
  for (let len = maxCheck; len >= 8; len--) {
    if (ex.endsWith(inc.slice(0, len))) {
      return deduplicateConsecutiveParagraphs(ex + inc.slice(len));
    }
  }

  // 3. Line-level overlap detection
  const exLines = ex.split('\n').map((l) => l.trim()).filter(Boolean);
  const incLines = inc.split('\n').map((l) => l.trim()).filter(Boolean);

  if (exLines.length >= 2 && incLines.length >= 2) {
    for (let i = 0; i < exLines.length; i++) {
      const remainingExLines = exLines.slice(i);
      const testIncLines = incLines.slice(0, remainingExLines.length);
      if (
        remainingExLines.length > 0 &&
        remainingExLines.every((line, idx) => line === testIncLines[idx])
      ) {
        const rawIncLines = inc.split('\n');
        const nonOverlapInc = rawIncLines.slice(remainingExLines.length).join('\n');
        return deduplicateConsecutiveParagraphs(ex + (nonOverlapInc ? '\n' + nonOverlapInc : ''));
      }
    }
  }

  // 4. Distinct sections - join with clean double newlines
  return deduplicateConsecutiveParagraphs(ex + '\n\n' + inc);
}

/**
 * Sanitizes markdown content to guarantee correct rendering:
 * - Balances unclosed code block fences (``` or ~~~) so trailing content isn't swallowed
 * - Handles <truncated ...> markers inside code fences
 * - Removes stray checkpoint headers
 */
export function sanitizeMarkdownContent(text: string): string {
  if (!text) return '';

  // Remove raw checkpoint headers if present
  let sanitized = text.replace(/\{\{\s*CHECKPOINT\s+\d+\s*\}\}/gi, '').trim();

  const lines = sanitized.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let codeFenceMarker = '```';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for code fence start/end (``` or ~~~)
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1].slice(0, 3);
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeFenceMarker = marker;
      } else if (marker === codeFenceMarker) {
        inCodeBlock = false;
      }
    }

    // Check for <truncated \d+ bytes>
    const truncMatch = trimmed.match(/^<truncated\s+(\d+)\s+bytes>/i);
    if (truncMatch) {
      const bytes = truncMatch[1];
      if (inCodeBlock) {
        result.push(codeFenceMarker);
        inCodeBlock = false;
      }
      result.push(`\n> ⚠️ *[此处已省略 ${bytes} 字节内容]*\n`);
      continue;
    }

    result.push(line);
  }

  // Close any unclosed code block at the end of text
  if (inCodeBlock) {
    result.push(codeFenceMarker);
  }

  return result.join('\n');
}


