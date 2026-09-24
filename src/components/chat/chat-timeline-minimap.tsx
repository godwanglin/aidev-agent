'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Bookmark } from 'lucide-react';

export interface TimelineTurnItem {
  id: string;
  turnId?: string;
  userPrompt: string;
  assistantPreview: string;
}

interface ChatTimelineMinimapProps {
  turns: TimelineTurnItem[];
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  sessionId?: string;
}

/**
 * Renders inline **bold** and `code` highlights inside the 2-3 line preview snippet.
 */
function renderFormattedSnippet(text: string): React.ReactNode {
  if (!text) return 'Menunggu respons asisten...';

  const cleaned = text
    .replace(/```[\s\S]*?```/g, ' [code] ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  const parts = cleaned.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-[#e4e4e9]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <span key={idx} className="font-mono font-medium text-[#dcdce2]">
          {part.slice(1, -1)}
        </span>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export const ChatTimelineMinimap: React.FC<ChatTimelineMinimapProps> = ({
  turns,
  scrollContainerRef,
  sessionId,
}) => {
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [lastHoveredIndex, setLastHoveredIndex] = useState<number>(0);
  const [mouseY, setMouseY] = useState<number | null>(null);
  const [popoverY, setPopoverY] = useState<number>(0);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  const trackRef = useRef<HTMLDivElement | null>(null);
  const tickRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const storageKey = useMemo(
    () => `aidev_timeline_bookmarks_${sessionId || 'default'}`,
    [sessionId]
  );

  // Load persisted bookmarks for this session
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setBookmarkedIds(new Set(parsed));
          return;
        }
      }
    } catch {}
    setBookmarkedIds(new Set());
  }, [storageKey]);

  const toggleBookmark = useCallback(
    (targetKey: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        if (next.has(targetKey)) {
          next.delete(targetKey);
        } else {
          next.add(targetKey);
        }
        try {
          localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
        } catch {}
        return next;
      });
    },
    [storageKey]
  );

  // Track which turn is currently visible in the chat viewport
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || turns.length === 0) return;

    const updateActiveTurnOnScroll = () => {
      const containerRect = container.getBoundingClientRect();
      const targetLineY = containerRect.top + containerRect.height * 0.32;

      let bestId = turns[turns.length - 1]?.id || null;
      let bestDistance = Infinity;

      for (const turn of turns) {
        const el = container.querySelector(`[data-turn-id="${turn.id}"]`);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= targetLineY && rect.bottom >= containerRect.top + 24) {
          bestId = turn.id;
          bestDistance = 0;
          break;
        }
        const dist = Math.abs(rect.top - targetLineY);
        if (dist < bestDistance) {
          bestDistance = dist;
          bestId = turn.id;
        }
      }

      if (bestId) {
        setActiveTurnId(bestId);
      }
    };

    updateActiveTurnOnScroll();
    container.addEventListener('scroll', updateActiveTurnOnScroll, { passive: true });
    window.addEventListener('resize', updateActiveTurnOnScroll);

    return () => {
      container.removeEventListener('scroll', updateActiveTurnOnScroll);
      window.removeEventListener('resize', updateActiveTurnOnScroll);
    };
  }, [turns, scrollContainerRef]);

  const clearCloseTimer = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimeoutRef.current = setTimeout(() => {
      setHoveredIndex(null);
      setMouseY(null);
    }, 130);
  }, [clearCloseTimer]);

  const updatePopoverPosition = useCallback((index: number) => {
    const tickEl = tickRefs.current[index];
    const trackEl = trackRef.current;
    if (tickEl && trackEl) {
      const trackRect = trackEl.getBoundingClientRect();
      const tickRect = tickEl.getBoundingClientRect();
      const rawCenterY = tickRect.top - trackRect.top + tickRect.height / 2;
      const clampedY = Math.max(-28, Math.min(rawCenterY - 42, trackRect.height - 72));
      setPopoverY(clampedY);
    }
  }, []);

  // Continuous mouse-move wave handler across the existing ticks
  const handleTrackMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      clearCloseTimer();
      const trackEl = trackRef.current;
      if (!trackEl) return;

      const trackRect = trackEl.getBoundingClientRect();
      const relY = e.clientY - trackRect.top;
      setMouseY(relY);

      let closestIdx = 0;
      let minDist = Infinity;
      for (let i = 0; i < turns.length; i++) {
        const btn = tickRefs.current[i];
        if (!btn) continue;
        const r = btn.getBoundingClientRect();
        const centerY = r.top - trackRect.top + r.height / 2;
        const d = Math.abs(relY - centerY);
        if (d < minDist) {
          minDist = d;
          closestIdx = i;
        }
      }

      setHoveredIndex(closestIdx);
      setLastHoveredIndex(closestIdx);
      updatePopoverPosition(closestIdx);
    },
    [clearCloseTimer, turns.length, updatePopoverPosition]
  );

  const handleJumpToTurn = useCallback(
    (item: TimelineTurnItem) => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const targetTurnId = item.turnId || item.id;
      const targetEl = container.querySelector(`[data-turn-id="${targetTurnId}"]`) as HTMLElement | null;
      if (targetEl) {
        setActiveTurnId(targetTurnId);
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [scrollContainerRef]
  );

  if (turns.length === 0) return null;

  const isHovering = hoveredIndex !== null;
  const displayedTurnIndex = hoveredIndex !== null ? hoveredIndex : lastHoveredIndex;
  const displayedTurn = turns[Math.min(displayedTurnIndex, turns.length - 1)] || turns[0];
  const displayedBookmarkKey = displayedTurn ? displayedTurn.turnId || displayedTurn.id : '';
  const isDisplayedBookmarked = displayedBookmarkKey ? bookmarkedIds.has(displayedBookmarkKey) : false;

  return (
    <div
      ref={trackRef}
      onMouseEnter={clearCloseTimer}
      onMouseLeave={scheduleClose}
      className="hidden sm:flex flex-col items-start justify-center absolute left-2.5 top-1/2 -translate-y-1/2 z-30 py-2 pr-3 select-none"
      style={{ maxHeight: 'calc(100% - 120px)' }}
    >
      {/* Strictly N chats = N lines (never adds extra lines on hover or idle!) */}
      <div
        onMouseMove={handleTrackMouseMove}
        className="flex flex-col items-start gap-[6px] overflow-y-auto scrollbar-none py-1"
      >
        {turns.map((turn, idx) => {
          const isThisHovered = hoveredIndex === idx;
          const bKey = turn.turnId || turn.id;
          const isBookmarked = bookmarkedIds.has(bKey);
          const isActive = activeTurnId === bKey;

          // IDLE STATE: All chat lines are clearly visible with flat uniform 10px width
          let tickWidth = 10;
          let waveIntensity = 0;

          // HOVER STATE: Only the existing lines smoothly scale in width into a wave
          if (isHovering) {
            const btn = tickRefs.current[idx];
            const trackEl = trackRef.current;
            if (btn && trackEl && mouseY !== null) {
              const r = btn.getBoundingClientRect();
              const trackRect = trackEl.getBoundingClientRect();
              const centerY = r.top - trackRect.top + r.height / 2;
              const dy = Math.abs(mouseY - centerY);
              waveIntensity = Math.exp(-(dy * dy) / (2 * 22 * 22));
            } else if (hoveredIndex !== null) {
              const idxDist = Math.abs(hoveredIndex - idx);
              waveIntensity =
                idxDist === 0 ? 1 : idxDist === 1 ? 0.6 : idxDist === 2 ? 0.3 : idxDist === 3 ? 0.1 : 0;
            }
            tickWidth = 8 + Math.round(waveIntensity * 16 * 10) / 10; // Smoothly scales 8px -> 24px
          }

          return (
            <button
              key={turn.id}
              ref={(el) => {
                tickRefs.current[idx] = el;
              }}
              type="button"
              onMouseEnter={() => {
                clearCloseTimer();
                setHoveredIndex(idx);
                setLastHoveredIndex(idx);
                updatePopoverPosition(idx);
              }}
              onClick={() => handleJumpToTurn(turn)}
              aria-label={`Jump to chat ${idx + 1}`}
              className="group/tick relative flex items-center py-[3px] pr-3 cursor-pointer focus:outline-none"
            >
              <span
                style={{
                  width: `${tickWidth}px`,
                  transition:
                    'width 220ms cubic-bezier(0.22, 1, 0.36, 1), background-color 180ms ease, box-shadow 200ms ease, height 180ms ease',
                }}
                className={`block rounded-full ${
                  isThisHovered
                    ? isBookmarked
                      ? 'h-[2.5px] bg-[#fbbf24] shadow-[0_0_10px_rgba(251,191,36,0.65)]'
                      : 'h-[2.5px] bg-white shadow-[0_0_10px_rgba(255,255,255,0.6)]'
                    : isBookmarked
                    ? 'h-[2px] bg-[#f59e0b]/90'
                    : isHovering && waveIntensity > 0.45
                    ? 'h-[2px] bg-white/75'
                    : isActive
                    ? 'h-[2px] bg-white/65'
                    : 'h-[2px] bg-white/45'
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* Smooth Gliding Floating Preview Card (Popover) */}
      <div
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleClose}
        onClick={() => displayedTurn && handleJumpToTurn(displayedTurn)}
        style={{
          transform: `translate3d(${isHovering ? '0px' : '-8px'}, ${popoverY}px, 0) scale(${
            isHovering ? 1 : 0.96
          })`,
          opacity: isHovering ? 1 : 0,
          transition:
            'transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 160ms cubic-bezier(0.16, 1, 0.3, 1)',
          pointerEvents: isHovering ? 'auto' : 'none',
        }}
        className="absolute left-8 top-0 w-[300px] sm:w-[335px] rounded-2xl bg-[#1c1c1f]/95 backdrop-blur-xl border border-white/[0.09] shadow-[0_14px_38px_rgba(0,0,0,0.65)] p-3.5 cursor-pointer select-none origin-left"
      >
        {displayedTurn && (
          <div className="flex flex-col gap-1.5">
            {/* Header Row: User Prompt Title + Bookmark Button */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12.5px] font-semibold text-[#f3f3f6] truncate leading-snug">
                {displayedTurn.userPrompt || 'Percakapan'}
              </p>

              <button
                type="button"
                onClick={(e) => toggleBookmark(displayedBookmarkKey, e)}
                title={isDisplayedBookmarked ? 'Hapus bookmark' : 'Tandain pesan ini (Bookmark)'}
                className={`p-1 -mr-1 rounded-md transition-all duration-200 cursor-pointer active:scale-90 shrink-0 ${
                  isDisplayedBookmarked
                    ? 'text-[#fbbf24] hover:bg-amber-500/15'
                    : 'text-[#8e8e98] hover:text-white hover:bg-white/[0.08]'
                }`}
              >
                <Bookmark
                  className="w-3.5 h-3.5 transition-transform duration-200"
                  fill={isDisplayedBookmarked ? 'currentColor' : 'none'}
                  strokeWidth={1.85}
                />
              </button>
            </div>

            {/* Body Row: Assistant Response Snippet (3 lines max) */}
            <p className="text-[12px] leading-[1.48] text-[#94949e] line-clamp-3 break-words font-normal">
              {renderFormattedSnippet(displayedTurn.assistantPreview)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
