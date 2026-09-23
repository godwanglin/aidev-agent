'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Quote, X } from 'lucide-react';

export interface QuoteChipProps {
  snippet: string;
  source?: string;
  onDelete?: () => void;
  interactive?: boolean;
}

export const QuoteChip: React.FC<QuoteChipProps> = ({
  snippet,
  source,
  onDelete,
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

  const cleanSnippet = snippet.trim();
  const truncatedPreview =
    cleanSnippet.length > 32
      ? cleanSnippet.slice(0, 32) + '...'
      : cleanSnippet;

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

    // In ChatInput or bottom dock, spaceBelow is small (< 200px) -> always place above!
    const placeAbove = spaceBelow < 200 || spaceAbove >= spaceBelow;

    // Clamp horizontally so card never overflows screen edges
    const cardWidth = 320;
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

  return (
    <span
      ref={chipRef}
      contentEditable={false}
      data-chip-type="quote"
      data-snippet={cleanSnippet}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative group/chip hover:z-30 inline-flex items-center gap-1.5 mx-0.5 px-2 py-0.5 rounded-md bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/30 hover:border-amber-500/40 text-amber-950 dark:bg-[#1e1e24] dark:hover:bg-[#272730] dark:border-[#363644] dark:hover:border-[#48485c] dark:text-[#dededf] dark:hover:text-white text-[12.5px] font-sans select-none align-baseline cursor-default transition-all shadow-xs"
    >
      <Quote className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400/90 shrink-0 align-middle -mt-0.5" />

      <span className="font-medium tracking-tight text-slate-800 dark:text-[#e0e0e4] truncate max-w-[190px]">
        &ldquo;{truncatedPreview}&rdquo;
      </span>

      <span className="text-[10px] font-mono px-1 rounded bg-amber-100 dark:bg-[#2b2c37] text-amber-800 dark:text-amber-300/80 font-semibold border border-amber-300/60 dark:border-[#3c3e50]">
        Quote
      </span>

      {/* Delete button when inside chat input dock */}
      {interactive && onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute -top-1.5 -right-1.5 z-50 opacity-0 group-hover/chip:opacity-100 w-4 h-4 rounded-full bg-white dark:bg-[#26262f] border border-slate-300 dark:border-[#525264] shadow-md flex items-center justify-center text-slate-600 dark:text-[#dcdce4] hover:text-red-500 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-[#32323e] hover:scale-110 active:scale-95 transition-all cursor-pointer"
        >
          <X className="w-2.5 h-2.5 stroke-[2.5]" />
        </button>
      )}

      {/* Hover Popover Card showing full selected text */}
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
            className="w-80 max-w-[90vw] p-2.5 rounded-xl bg-white/95 dark:bg-[#141418]/95 backdrop-blur-md border border-slate-200 dark:border-[#2d2d38] shadow-2xl pointer-events-auto animate-dropdown text-left font-sans select-none flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-white/[0.06]">
              <div className="flex items-center gap-1.5">
                <Quote className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                <span className="font-semibold text-xs text-slate-800 dark:text-zinc-200">
                  Quoted Selection
                </span>
              </div>
              <div className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#262732] text-[10px] text-slate-600 dark:text-zinc-400 font-mono">
                {cleanSnippet.length} chars
              </div>
            </div>

            {/* Source info if available */}
            {source && (
              <div className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono pt-1">
                Source: {source}
              </div>
            )}

            {/* Full Quoted Text Box */}
            <div className="mt-1.5 p-2 rounded-lg bg-slate-50 dark:bg-[#0b0c0f] text-slate-800 dark:text-zinc-300 font-sans text-[11.5px] leading-relaxed max-h-36 overflow-y-auto border border-slate-200 dark:border-white/[0.06] whitespace-pre-wrap break-words select-text">
              &ldquo;{cleanSnippet}&rdquo;
            </div>

            <div className="mt-1.5 text-[9.5px] text-slate-500 dark:text-zinc-500 font-sans text-right">
              Added to context for AI prompt
            </div>
          </div>,
          document.body
        )}
    </span>
  );
};
