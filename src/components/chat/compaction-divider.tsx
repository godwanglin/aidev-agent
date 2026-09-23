'use client';

import React, { useState } from 'react';
import { Layers, ChevronDown, ChevronRight, CheckCircle2, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SessionCompactionRecord } from '@/lib/db';

interface CompactionDividerProps {
  compaction: SessionCompactionRecord;
  className?: string;
}

export const CompactionDivider: React.FC<CompactionDividerProps> = ({
  compaction,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!compaction.summary) return;
    navigator.clipboard.writeText(compaction.summary);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const formattedDate = new Date(compaction.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`my-4 select-none ${className}`}>
      {/* Divider Line & Center Pill */}
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[#2a2a2a]" />
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="relative inline-flex items-center gap-2 px-3 py-1 text-xs font-mono text-[#a0a0a0] bg-[#1a1a1a] hover:bg-[#222222] border border-[#333333] hover:border-[#444444] rounded-full transition-all cursor-pointer shadow-sm group"
          title="Click to toggle memory context summary"
        >
          <Layers className="w-3.5 h-3.5 text-[#e8975f] shrink-0" />
          <span className="font-semibold text-[#cccccc]">Context Compacted</span>
          <span className="text-[#555555]">|</span>
          <span className="text-[#4ade80] font-medium">
            Saved ~{compaction.tokens_saved.toLocaleString()} tokens
          </span>
          <span className="text-[#666666] hidden sm:inline">({formattedDate})</span>
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-[#888888] group-hover:text-white transition" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-[#888888] group-hover:text-white transition" />
          )}
        </button>
      </div>

      {/* Expandable Memory Checkpoint Viewer */}
      {isExpanded && (
        <div className="mt-3 p-3.5 bg-[#141414] border border-[#262626] rounded-lg text-xs font-sans text-[#cccccc] shadow-md transition-all animate-fadeIn">
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[#222222]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#4ade80]" />
              <span className="font-medium text-white">Active Memory Checkpoint</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#202020] text-[#999999] border border-[#2a2a2a]">
                {compaction.tokens_before.toLocaleString()} &rarr; {compaction.tokens_after.toLocaleString()} tokens
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono text-[#888888] hover:text-[#cccccc] bg-[#1c1c1c] hover:bg-[#262626] rounded border border-[#2e2e34] transition cursor-pointer"
            >
              {isCopied ? (
                <>
                  <Check className="w-3 h-3 text-[#4ade80]" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy Summary</span>
                </>
              )}
            </button>
          </div>

          <div className="prose prose-invert prose-xs max-w-none text-[#b3b3b3] leading-relaxed overflow-x-auto">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {compaction.summary}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};
