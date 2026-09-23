'use client';

import React, { useState } from 'react';
import { Copy, Check, Loader2 } from 'lucide-react';

interface TerminalExecCardProps {
  command: string;
  workdir?: string;
  output?: string;
  status?: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PENDING_PERMISSION';
  durationMs?: number;
  onOpenBrowser?: (url: string) => void;
}

export const TerminalExecCard: React.FC<TerminalExecCardProps> = ({
  command,
  workdir = 'c:\\dev\\aidev',
  output,
  status = 'COMPLETED',
  onOpenBrowser,
}) => {
  const [copied, setCopied] = useState(false);

  // Extract clean terminal stdout/stderr if output is stored as JSON object
  let cleanOutput = output || '';
  let exitCode: number | null = null;
  let hasStderr = false;

  try {
    if (output && typeof output === 'string') {
      const parsed = JSON.parse(output);
      if (typeof parsed === 'object' && parsed !== null) {
        if ('stdout' in parsed || 'stderr' in parsed) {
          const stdoutText = (parsed.stdout || '').replace(/\r\n/g, '\n');
          const stderrText = (parsed.stderr || '').replace(/\r\n/g, '\n');
          if (stderrText) hasStderr = true;
          cleanOutput = [stdoutText, stderrText].filter(Boolean).join('\n').trim();
          if ('exitCode' in parsed) {
            exitCode = parsed.exitCode;
          }
        } else if ('error' in parsed) {
          cleanOutput = parsed.error;
          hasStderr = true;
        } else if ('message' in parsed) {
          cleanOutput = parsed.message;
        }
      }
    }
  } catch {
    // raw plain text output
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Parse command into executable and arguments
  const cleanCmd = command.trim();
  const firstSpaceIdx = cleanCmd.indexOf(' ');
  const executable = firstSpaceIdx > 0 ? cleanCmd.slice(0, firstSpaceIdx) : cleanCmd;
  const args = firstSpaceIdx > 0 ? cleanCmd.slice(firstSpaceIdx + 1) : '';

  return (
    <div className="my-2.5 rounded-xl bg-[#0a0a0a] border border-[#222222] overflow-hidden shadow-md font-mono text-[12.5px] select-none">
      {/* 1. Terminal Command Header matching Antigravity 1:1 */}
      <div className="bg-[#141414] px-3.5 py-2 flex items-start justify-between border-b border-[#1f1f1f] text-xs">
        <div className="flex flex-wrap items-baseline gap-1.5 font-mono text-[12.5px] leading-relaxed break-all pr-2 select-text">
          {/* Workdir in steel blue-gray */}
          <span className="text-[#485e75] font-normal">{workdir}</span>
          {/* Prompt chevron */}
          <span className="text-[#666666] font-normal">&gt;</span>
          {/* Executable in bright cyan-blue */}
          <span className="text-[#38bdf8] font-medium">{executable}</span>
          {/* Arguments in lime green string color */}
          {args && <span className="text-[#a6e22e] font-normal">{args}</span>}

          {status === 'RUNNING' && (
            <Loader2 className="w-3.5 h-3.5 text-[#007acc] animate-spin ml-1 inline self-center" />
          )}
        </div>

        {/* Copy Button on Right */}
        <button
          type="button"
          onClick={() => handleCopy(cleanOutput || command)}
          className="text-[#666666] hover:text-[#cccccc] transition p-1 shrink-0 ml-1 rounded hover:bg-white/[0.05]"
          title="Copy output"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-[#7ee787]" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* 2. Clean Terminal Output Body */}
      {cleanOutput ? (
        <div
          className={`p-3.5 bg-[#0a0a0a] font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-80 select-text ${
            hasStderr || (exitCode !== null && exitCode !== 0)
              ? 'text-[#ff7b72]'
              : 'text-[#cccccc]'
          }`}
        >
          {(() => {
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const parts = cleanOutput.split(urlRegex);
            return parts.map((part, pIdx) => {
              if (part.match(/^https?:\/\//)) {
                return (
                  <a
                    key={pIdx}
                    href={part}
                    onClick={(e) => {
                      if (onOpenBrowser) {
                        e.preventDefault();
                        onOpenBrowser(part);
                      }
                    }}
                    target="_blank"
                    rel="noreferrer"
                    className="underline text-[#58a6ff] hover:brightness-125 cursor-pointer font-medium"
                    title="Click to open Live Preview in workspace panel"
                  >
                    {part}
                  </a>
                );
              }
              return part;
            });
          })()}
          {exitCode !== null && exitCode !== 0 && (
            <div className="mt-2 text-[11px] text-[#ff7b72]/80">
              Process exited with code {exitCode}
            </div>
          )}
        </div>
      ) : status === 'RUNNING' ? (
        <div className="p-3.5 bg-[#0a0a0a] text-[#8c8c8c] text-xs font-mono flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 text-[#007acc] animate-spin shrink-0" />
          <span>Executing command...</span>
        </div>
      ) : (
        <div className="p-3 bg-[#0a0a0a] text-[#666666] text-xs italic font-mono">
          (Command completed with empty output)
        </div>
      )}
    </div>
  );
};
