'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, X } from 'lucide-react';
import { AestheticFileIcon, extractFileName } from '@/components/common/aesthetic-file-icon';

export interface CodeRefChipProps {
  filePath: string;
  lineNum: number;
  snippet?: string;
  comment?: string;
  onDelete?: () => void;
  onOpenFile?: (filePath: string, lineRange?: { startLine?: number; endLine?: number }) => void;
  interactive?: boolean;
}

export const CodeRefChip: React.FC<CodeRefChipProps> = ({
  filePath,
  lineNum,
  snippet,
  comment,
  onDelete,
  onOpenFile,
  interactive = true,
}) => {
  const [showPopover, setShowPopover] = useState(false);
  const [popoverCoords, setPopoverCoords] = useState<{
    placeAbove: boolean;
    left: number;
    bottom: number;
    top: number;
    maxHeight: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);

  const chipRef = useRef<HTMLSpanElement>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const fileName = extractFileName(filePath);

  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (!chipRef.current) return;
    const rect = chipRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    const spaceAbove = rect.top;
    const spaceBelow = vh - rect.bottom;

    // In ChatInput or bottom dock, spaceBelow is small (< 220px) -> always place above!
    const placeAbove = spaceBelow < 220 || spaceAbove >= spaceBelow;

    // Clamp horizontally so card never overflows screen edges
    const cardWidth = 290;
    const halfWidth = cardWidth / 2;
    const center = rect.left + rect.width / 2;
    const left = Math.max(halfWidth + 12, Math.min(vw - halfWidth - 12, center));

    setPopoverCoords({
      placeAbove,
      left,
      bottom: vh - rect.top + 8,
      top: rect.bottom + 8,
      maxHeight: placeAbove ? Math.max(spaceAbove - 24, 120) : Math.max(spaceBelow - 24, 120),
    });
    setShowPopover(true);
  };

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setShowPopover(false);
    }, 150);
  };

  const handleCardMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleCardMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setShowPopover(false);
    }, 150);
  };

  useEffect(() => {
    if (!showPopover) return;
    const handleScroll = () => setShowPopover(false);
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [showPopover]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPopover(false);
    if (onOpenFile) {
      onOpenFile(filePath, { startLine: lineNum, endLine: lineNum });
    }
  };

  return (
    <span
      ref={chipRef}
      contentEditable={false}
      data-chip-type="code_ref"
      data-file-path={filePath}
      data-line-num={lineNum}
      data-snippet={snippet || ''}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative group/chip hover:z-30 inline-flex items-center gap-1.5 mx-0.5 px-2 py-0.5 rounded-md bg-[#1d1e24] hover:bg-[#252630] border border-[#323340] hover:border-[#424456] text-[#dededf] hover:text-white text-[12.5px] font-sans select-none align-baseline cursor-pointer transition-all shadow-xs"
    >
      <AestheticFileIcon filePath={filePath} className="w-3.5 h-3.5 shrink-0 align-middle -mt-0.5" />
      
      <span
        onClick={handleClick}
        className="font-medium tracking-tight text-[#e0e0e4] hover:underline truncate max-w-[200px]"
      >
        {fileName}:{lineNum}
      </span>

      <span className="text-[10px] font-mono px-1 rounded bg-[#2b2c37] text-blue-300 font-semibold border border-[#3c3e50]">
        L{lineNum}
      </span>

      {/* Delete button when inside chat input dock */}
      {interactive && onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute -top-1.5 -right-1.5 z-50 opacity-0 group-hover/chip:opacity-100 w-4 h-4 rounded-full bg-[#26262f] border border-[#525264] shadow-[0_2px_8px_rgba(0,0,0,0.95),0_0_2px_rgba(255,255,255,0.25)] flex items-center justify-center text-[#dcdce4] hover:text-red-400 hover:bg-[#32323e] hover:scale-110 active:scale-95 transition-all cursor-pointer"
        >
          <X className="w-2.5 h-2.5 stroke-[2.5]" />
        </button>
      )}

      {/* Hover Popover Card - 1:1 with Gambar 3 */}
      {mounted &&
        showPopover &&
        popoverCoords &&
        createPortal(
          <div
            onMouseEnter={handleCardMouseEnter}
            onMouseLeave={handleCardMouseLeave}
            style={{
              position: 'fixed',
              ...(popoverCoords.placeAbove
                ? { bottom: `${popoverCoords.bottom}px` }
                : { top: `${popoverCoords.top}px` }),
              left: `${popoverCoords.left}px`,
              transform: 'translateX(-50%)',
              maxHeight: `${popoverCoords.maxHeight}px`,
              zIndex: 999999,
            }}
            className="w-72 max-w-[90vw] p-2.5 rounded-xl bg-[#141418]/95 backdrop-blur-md border border-[#2d2d38] shadow-2xl pointer-events-auto animate-dropdown text-left font-sans select-none flex flex-col"
          >
            {/* Header: File Icon + File Name + Counter Badge (1:1 with Gambar 3) */}
            <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.06]">
              <div className="flex items-center gap-1.5 min-w-0">
                <AestheticFileIcon filePath={filePath} className="w-4 h-4 shrink-0" />
                <span className="font-semibold text-xs text-zinc-200 truncate">
                  {fileName}
                </span>
              </div>
              <div className="w-4 h-4 rounded-full bg-[#262732] border border-white/[0.1] text-[10px] text-zinc-300 font-mono flex items-center justify-center shrink-0">
                1
              </div>
            </div>

            {/* Subheader: Line Badge + Tag (e.g. L252 Agent Edits / Line Snippet) */}
            <div className="flex items-center gap-1.5 pt-1.5 pb-1 text-[10.5px]">
              <span className="text-zinc-400 font-mono font-medium">
                L{lineNum}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 text-[9.5px] font-medium border border-blue-500/20">
                Code Snippet
              </span>
            </div>

            {/* Code Snippet Box (1:1 with Gambar 3) */}
            {snippet && (
              <pre className="mt-1 p-2 rounded-lg bg-[#0b0c0f] text-zinc-300 font-mono text-[11px] overflow-x-auto max-h-28 overflow-y-auto leading-relaxed border border-white/[0.06] whitespace-pre-wrap break-all">
                {snippet}
              </pre>
            )}

            {/* Comment preview if present */}
            {comment && (
              <div className="mt-1.5 pt-1 border-t border-white/[0.06] flex items-center gap-1 text-[11px] text-zinc-400">
                <MessageSquare className="w-3 h-3 text-sky-400 shrink-0" />
                <span className="truncate italic">&quot;{comment}&quot;</span>
              </div>
            )}

            <div className="mt-1.5 text-[9.5px] text-sky-400 font-sans text-right">
              Click chip to open in editor
            </div>
          </div>,
          document.body
        )}
    </span>
  );
};
