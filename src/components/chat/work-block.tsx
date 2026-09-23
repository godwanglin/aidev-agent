'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ActivityGroup, TurnStep, computeSummary } from './activity-group';
import type { MessageRecord } from '@/lib/db';

export interface WorkBlockProps {
  introMessage?: MessageRecord;
  steps: TurnStep[];
  isStreaming?: boolean;
  durationMs?: number;
  onOpenFileDiff?: (filePath: string) => void;
  onOpenFile?: (filePath: string, lineRange?: { startLine?: number; endLine?: number }) => void;
  onOpenBrowser?: (url: string) => void;
  defaultOpen?: boolean;
  verbose?: boolean;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export const WorkBlock = React.memo<WorkBlockProps>(function WorkBlock({
  introMessage,
  steps = [],
  isStreaming = false,
  durationMs,
  onOpenFileDiff,
  onOpenFile,
  onOpenBrowser,
  defaultOpen = false,
  verbose = true,
}) {
  // Open by default while streaming only if verbose is true; collapsed otherwise
  const [isOpen, setIsOpen] = useState((isStreaming && verbose) || defaultOpen);
  const [elapsedSeconds, setElapsedSeconds] = useState(1);
  const prevStreamingRef = useRef(isStreaming);

  // Live timer while streaming
  useEffect(() => {
    if (!isStreaming) return;
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isStreaming]);

  // Auto-collapse when streaming finishes
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      setIsOpen(false);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Check if this block contains only thoughts
  const isOnlyThoughts = steps.length > 0 && steps.every((s) => s.type === 'thought');

  // Compute title
  const activitySummary = computeSummary(steps, isStreaming);
  const durationText = isStreaming
    ? `Working... (${elapsedSeconds}s)`
    : `Worked for ${formatDuration(durationMs || 1000)}`;

  const title = isOnlyThoughts
    ? isStreaming
      ? `Thinking (${elapsedSeconds}s)...`
      : `Thought for ${formatDuration(durationMs || 1000)}`
    : isStreaming
    ? durationText
    : steps.length > 0 && activitySummary !== 'Explored files' && activitySummary !== 'Working...'
    ? `${durationText} · ${activitySummary}`
    : durationText;

  return (
    <div className="my-1.5 select-none font-sans text-[13px] leading-relaxed">
      {/* Work Block Header / Toggle */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-[#8c8c8c] hover:text-[#cccccc] transition cursor-pointer font-normal py-0.5 select-none group"
      >
        <ChevronRight
          className={`w-3.5 h-3.5 text-[#666666] group-hover:text-[#aaaaaa] transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-90 text-[#cccccc]' : ''
          }`}
        />
        <span>{title}</span>
        {isStreaming && (
          <Loader2 className="w-3 h-3 text-[#007acc] animate-spin shrink-0 ml-0.5" />
        )}
      </button>

      {/* Expanded Work Block Body */}
      {isOpen && (
        <div className="mt-1 mb-2 pl-3 ml-1.5 border-l border-[#26262a] space-y-1.5 animate-fade-in">
          {/* 1. Intro Assistant Commentary Message if present */}
          {introMessage && introMessage.content && (
            <div className="text-[#b8b8b8] text-[13px] leading-relaxed py-1 select-text">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p({ children }) {
                    return <p className="mb-1.5 last:mb-0 leading-relaxed text-[#b8b8b8]">{children}</p>;
                  },
                  code({ inline, className, children, ...props }: any) {
                    return (
                      <code
                        className="px-1.5 py-0.5 rounded bg-[#1e1e24] text-[#d4d4d4] font-mono text-[12px] border border-[#2b2b36]"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {introMessage.content}
              </ReactMarkdown>
            </div>
          )}

          {/* 2. Tool Activity Group or Pure Thought Block */}
          {isOnlyThoughts ? (
            <div className="mt-1 mb-2 text-[#9d9d9d] font-sans text-[12.5px] leading-relaxed select-text">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p({ children }) {
                    return <p className="mb-2 last:mb-0 leading-relaxed text-[#9d9d9d]">{children}</p>;
                  },
                  ul({ children }) {
                    return <ul className="list-disc list-outside ml-4 mb-2 space-y-1 text-[#9d9d9d]">{children}</ul>;
                  },
                  ol({ children }) {
                    return <ol className="list-decimal list-outside ml-4 mb-2 space-y-1 text-[#9d9d9d]">{children}</ol>;
                  },
                  li({ children }) {
                    return <li className="leading-relaxed">{children}</li>;
                  },
                  code({ inline, className, children, ...props }: any) {
                    return (
                      <code
                        className="px-1.5 py-0.5 rounded bg-white/[0.05] text-[#d4d4d4] font-mono text-[11.5px] border border-white/[0.08]"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  pre({ children }) {
                    return (
                      <pre className="p-2.5 my-2 rounded-lg bg-white/[0.03] border border-white/[0.06] overflow-x-auto text-[11.5px] font-mono text-[#d4d4d4]">
                        {children}
                      </pre>
                    );
                  },
                  strong({ children }) {
                    return <strong className="font-semibold text-[#cccccc]">{children}</strong>;
                  },
                  em({ children }) {
                    return <em className="italic text-[#a8a8a8]">{children}</em>;
                  },
                }}
              >
                {steps.map((s) => s.reasoning).filter(Boolean).join('\n\n')}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-1.5 h-3 bg-[#cccccc] animate-pulse ml-1 align-middle" />
              )}
            </div>
          ) : (
            steps.length > 0 && (
              <ActivityGroup
                steps={steps}
                isStreaming={isStreaming}
                hideHeader={true}
                onOpenFileDiff={onOpenFileDiff}
                onOpenFile={onOpenFile}
                onOpenBrowser={onOpenBrowser}
                verbose={verbose}
              />
            )
          )}
        </div>
      )}
    </div>
  );
});
