'use client';

import React, { useState, useMemo } from 'react';
import { Copy, Check, Loader2, ExternalLink } from 'lucide-react';

interface TerminalExecCardProps {
  command: string;
  workdir?: string;
  output?: string;
  status?: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PENDING_PERMISSION' | string;
  durationMs?: number;
  onOpenBrowser?: (url: string) => void;
}

/**
 * Robust ANSI color and escape code parser.
 * Converts ANSI escape sequences into styled React spans matching authentic CLI output.
 */
function renderAnsiText(text: string, onOpenBrowser?: (url: string) => void): React.ReactNode {
  if (!text) return null;

  const ansiRegex = /\x1b\[([0-9;]*)m/g;
  const parts: { text: string; style: React.CSSProperties }[] = [];

  let lastIndex = 0;
  let currentStyle: React.CSSProperties = {};
  let match: RegExpExecArray | null;

  while ((match = ansiRegex.exec(text)) !== null) {
    const chunk = text.slice(lastIndex, match.index);
    if (chunk) {
      parts.push({ text: chunk, style: { ...currentStyle } });
    }
    lastIndex = ansiRegex.lastIndex;

    const codes = match[1] ? match[1].split(';').map((c) => parseInt(c, 10)) : [0];
    for (const code of codes) {
      if (code === 0) {
        currentStyle = {};
      } else if (code === 1) {
        currentStyle.fontWeight = 'bold';
      } else if (code === 2) {
        currentStyle.opacity = 0.7;
      } else if (code === 3) {
        currentStyle.fontStyle = 'italic';
      } else if (code === 4) {
        currentStyle.textDecoration = 'underline';
      } else if (code >= 30 && code <= 37) {
        const colors = [
          '#64748b', // 30: black/gray
          '#f87171', // 31: red
          '#4ade80', // 32: green
          '#facc15', // 33: yellow
          '#60a5fa', // 34: blue
          '#c084fc', // 35: magenta
          '#38bdf8', // 36: cyan
          '#f8fafc', // 37: white
        ];
        currentStyle.color = colors[code - 30];
      } else if (code === 39) {
        delete currentStyle.color;
      } else if (code >= 90 && code <= 97) {
        const brightColors = [
          '#94a3b8', // 90: bright black
          '#fca5a5', // 91: bright red
          '#86efac', // 92: bright green
          '#fde047', // 93: bright yellow
          '#93c5fd', // 94: bright blue
          '#d8b4fe', // 95: bright magenta
          '#7dd3fc', // 96: bright cyan
          '#ffffff', // 97: bright white
        ];
        currentStyle.color = brightColors[code - 90];
      }
    }
  }

  const remaining = text.slice(lastIndex);
  if (remaining) {
    parts.push({ text: remaining, style: { ...currentStyle } });
  }

  const urlRegex = /(https?:\/\/[^\s]+)/g;

  return (
    <>
      {parts.map((item, idx) => {
        const urlMatches = item.text.split(urlRegex);
        return (
          <span key={idx} style={item.style}>
            {urlMatches.map((sub, sIdx) => {
              if (sub.match(/^https?:\/\//)) {
                return (
                  <a
                    key={sIdx}
                    href={sub}
                    onClick={(e) => {
                      if (onOpenBrowser) {
                        e.preventDefault();
                        onOpenBrowser(sub);
                      }
                    }}
                    target="_blank"
                    rel="noreferrer"
                    className="underline text-[#38bdf8] hover:text-[#7dd3fc] cursor-pointer font-medium"
                    title="Buka link"
                  >
                    {sub}
                  </a>
                );
              }
              return sub;
            })}
          </span>
        );
      })}
    </>
  );
}

/**
 * Pure helper to extract clean command string even if raw JSON was passed
 */
function cleanCommandText(raw: string): string {
  if (!raw) return 'cmd';
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.command) return String(parsed.command);
      if (parsed.cmd) return String(parsed.cmd);
    } catch {}
  }
  return trimmed;
}

export const TerminalExecCard: React.FC<TerminalExecCardProps> = ({
  command: rawCommand,
  workdir = 'C:\\dev\\coding-agent',
  output = '',
  status = 'COMPLETED',
  durationMs: rawDurationMs,
  onOpenBrowser,
}) => {
  const [copied, setCopied] = useState(false);

  // Extract clean command and clean output
  const command = cleanCommandText(rawCommand);

  let cleanStdout = '';
  let cleanStderr = '';
  let exitCode: number | null = null;
  let durationMs: number | undefined = rawDurationMs;

  try {
    if (output && typeof output === 'string') {
      const trimmed = output.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'object' && parsed !== null) {
          if ('stdout' in parsed || 'stderr' in parsed) {
            cleanStdout = (parsed.stdout || '').replace(/\r\n/g, '\n');
            cleanStderr = (parsed.stderr || '').replace(/\r\n/g, '\n');
            if ('exitCode' in parsed && typeof parsed.exitCode === 'number') {
              exitCode = parsed.exitCode;
            }
            if ('durationMs' in parsed && typeof parsed.durationMs === 'number') {
              durationMs = parsed.durationMs;
            }
          } else if ('error' in parsed) {
            cleanStderr = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error, null, 2);
          } else if ('message' in parsed) {
            cleanStdout = typeof parsed.message === 'string' ? parsed.message : JSON.stringify(parsed.message, null, 2);
          }
        }
      }
    }
  } catch {}

  // Fallback to raw output if JSON extraction was not applicable
  if (!cleanStdout && !cleanStderr && output) {
    cleanStdout = output;
  }

  // Final text to copy
  const fullTextToCopy = [cleanStdout, cleanStderr].filter(Boolean).join('\n') || command;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullTextToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Detect dev-server URLs (e.g. Next.js, Vite, Express)
  const detectedUrls = useMemo(() => {
    const urls: string[] = [];
    const regex = /http:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):[0-9]+/g;
    let match;
    const combined = `${cleanStdout}\n${cleanStderr}`;
    while ((match = regex.exec(combined)) !== null) {
      if (!urls.includes(match[0])) urls.push(match[0]);
    }
    return urls;
  }, [cleanStdout, cleanStderr]);

  return (
    <div className="my-2.5 rounded-xl bg-[#000000] border border-[#27272a] overflow-hidden shadow-2xl font-mono text-[12px] select-none">
      {/* 1. Terminal Window Header (Mac/Unix style dots + Workdir + Status) */}
      <div className="bg-[#121214] px-3.5 py-2 flex items-center justify-between border-b border-[#27272a]">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f] inline-block" />
          </div>

          <span className="text-[#a1a1aa] text-[11px] font-mono truncate max-w-[260px] sm:max-w-[420px]" title={workdir}>
            {workdir}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {durationMs !== undefined && (
            <span className="text-[10px] text-[#71717a] font-mono px-1.5 py-0.5 rounded bg-white/[0.05]">
              {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(2)}s`}
            </span>
          )}

          {exitCode !== null && (
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                exitCode === 0
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}
            >
              exit {exitCode}
            </span>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 text-[#a1a1aa] hover:text-white px-2 py-0.5 rounded text-[11px] hover:bg-white/[0.08] transition cursor-pointer"
            title="Copy output"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-[#4ade80]" />
                <span className="text-[#4ade80] text-[10px]">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span className="text-[10px]">Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. Interactive Shell Command Prompt Line (Authentic Terminal Prompt) */}
      <div className="bg-[#09090b] px-3.5 py-2 flex items-baseline gap-2 border-b border-[#1c1c1f] text-xs">
        <span className="text-[#22c55e] font-bold select-none">{workdir}&gt;</span>
        <span className="flex-1 font-mono text-[#f4f4f5] font-semibold break-all select-text leading-relaxed">
          {command}
        </span>
        {status === 'RUNNING' && (
          <div className="flex items-center gap-1 text-[#38bdf8] text-[11px] shrink-0">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="font-mono">running</span>
          </div>
        )}
      </div>

      {/* 3. Dev Server Links */}
      {detectedUrls.length > 0 && (
        <div className="px-3.5 py-1.5 bg-[#121217] border-b border-[#27272a] flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-[#818cf8] font-sans font-medium">Dev Server Ready:</span>
          {detectedUrls.map((url) => (
            <button
              key={url}
              type="button"
              onClick={() => onOpenBrowser?.(url)}
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 text-[11px] font-mono transition cursor-pointer border border-indigo-500/30"
            >
              <span>{url}</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* 4. Terminal Output Body (ANSI Pure Console) */}
      <div className="p-3.5 bg-[#000000] max-h-[380px] overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-800 font-mono text-[12px] leading-relaxed select-text">
        {cleanStdout && (
          <div className="text-[#d4d4d8] whitespace-pre-wrap font-mono">
            {renderAnsiText(cleanStdout, onOpenBrowser)}
          </div>
        )}

        {cleanStderr && (
          <div className={`whitespace-pre-wrap font-mono text-[#f87171] ${cleanStdout ? 'mt-2 pt-2 border-t border-red-950/40' : ''}`}>
            {renderAnsiText(cleanStderr, onOpenBrowser)}
          </div>
        )}

        {!cleanStdout && !cleanStderr && (
          status === 'RUNNING' ? (
            <div className="text-[#71717a] italic flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#38bdf8]" />
              <span>Menunggu output...</span>
            </div>
          ) : (
            <div className="text-[#52525b] italic">
              (Proses selesai tanpa ada output text)
            </div>
          )
        )}
      </div>
    </div>
  );
};
