'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface TooltipData {
  label: string;
  shortcut?: string;
  targetRect: DOMRect;
  preferredSide?: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * Intelligent parser for tooltips that contain shortcut hints, such as:
 * - "Search (Ctrl+F)" -> label: "Search", shortcut: "Ctrl+F"
 * - "Toggle Auxiliary Pane Ctrl+Shift+B" -> label: "Toggle Auxiliary Pane", shortcut: "Ctrl+Shift+B"
 * - "Close (Esc)" -> label: "Close", shortcut: "Esc"
 * - "Match Case (Alt+C)" -> label: "Match Case", shortcut: "Alt+C"
 * - "Zoom In (+)" -> label: "Zoom In", shortcut: "+"
 */
export function parseTooltipContent(
  text: string,
  explicitShortcut?: string | null
): { label: string; shortcut?: string } {
  if (explicitShortcut && explicitShortcut.trim()) {
    return { label: text.trim(), shortcut: explicitShortcut.trim() };
  }

  const trimmed = text.trim();

  // 1. Parentheses shortcut at end: "Search (Ctrl+F)", "Close (Esc)", "Match Case (Alt+C)", "Zoom In (+)"
  const parenMatch = trimmed.match(/^(.*?)\s*\(([^)]+)\)$/);
  if (parenMatch) {
    const label = parenMatch[1].trim();
    const candidate = parenMatch[2].trim();
    // Verify it looks like a shortcut or single action key
    if (
      /(ctrl|shift|alt|cmd|meta|option|enter|esc|escape|tab|space|backspace|del|delete|\+|\-)/i.test(candidate) ||
      candidate.length <= 4
    ) {
      return { label, shortcut: candidate };
    }
  }

  // 2. Trailing key combination separated by space: "Toggle Auxiliary Pane Ctrl+Shift+B"
  const comboMatch = trimmed.match(
    /^(.*?)\s+((?:(?:Ctrl|Shift|Alt|Meta|Cmd|Option|⌘|⌥|⇧|⌃)\s*[\+\-]\s*)+[A-Za-z0-9\+\-_]+)$/i
  );
  if (comboMatch) {
    return { label: comboMatch[1].trim(), shortcut: comboMatch[2].trim() };
  }

  return { label: trimmed };
}

/**
 * Global Aesthetic Tooltip Provider
 * Replaces native OS/browser tooltips with the sleek dark VS Code / Antigravity UI.
 * Automatically intercepts elements with `title` or `data-tooltip`.
 */
export const AestheticTooltipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number }>({ x: -9999, y: -9999 });

  const tooltipElRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warmTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isWarmRef = useRef<boolean>(false);
  const currentTargetRef = useRef<HTMLElement | null>(null);

  const hideTooltip = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setIsVisible(false);
    currentTargetRef.current = null;

    // Keep warm state for 400ms so moving between adjacent icons shows tooltip instantly
    if (warmTimerRef.current) clearTimeout(warmTimerRef.current);
    warmTimerRef.current = setTimeout(() => {
      isWarmRef.current = false;
    }, 400);
  }, []);

  useEffect(() => {
    // Intercept mouseover at document level
    const handleMouseOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest?.('[title], [data-tooltip]') as HTMLElement | null;

      if (!el) {
        if (currentTargetRef.current && !currentTargetRef.current.contains(e.target as Node)) {
          hideTooltip();
        }
        return;
      }

      // If still inside the currently active target, do nothing
      if (currentTargetRef.current === el) return;

      // Extract raw title or data-tooltip
      const rawTitle = el.getAttribute('title');
      const dataTooltip = el.getAttribute('data-tooltip');
      const content = dataTooltip || rawTitle;

      if (!content || !content.trim()) {
        hideTooltip();
        return;
      }

      // Suppress browser native tooltip by converting `title` to `data-tooltip`
      if (rawTitle) {
        el.setAttribute('data-tooltip', rawTitle);
        // Retain accessibility
        if (!el.getAttribute('aria-label')) {
          el.setAttribute('aria-label', rawTitle);
        }
        el.removeAttribute('title');
      }

      currentTargetRef.current = el;

      const explicitShortcut = el.getAttribute('data-shortcut') || el.getAttribute('data-tooltip-shortcut');
      const { label, shortcut } = parseTooltipContent(content, explicitShortcut);
      const preferredSide = (el.getAttribute('data-tooltip-side') as 'top' | 'bottom' | 'left' | 'right') || 'bottom';

      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }

      const show = () => {
        if (!currentTargetRef.current || currentTargetRef.current !== el) return;
        const rect = el.getBoundingClientRect();
        setCoords({ x: -9999, y: -9999 });
        setTooltip({
          label,
          shortcut,
          targetRect: rect,
          preferredSide,
        });
        setIsVisible(true);
        isWarmRef.current = true;
      };

      // If already warm (user recently hovered a tooltip), open instantly; otherwise small responsive delay
      if (isWarmRef.current) {
        show();
      } else {
        hoverTimerRef.current = setTimeout(show, 260);
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      if (!currentTargetRef.current) return;
      const related = e.relatedTarget as HTMLElement | null;
      if (related && currentTargetRef.current.contains(related)) {
        return;
      }
      hideTooltip();
    };

    const handleDismiss = () => {
      hideTooltip();
    };

    document.addEventListener('mouseover', handleMouseOver, { passive: true });
    document.addEventListener('mouseout', handleMouseOut, { passive: true });
    document.addEventListener('mousedown', handleDismiss, { passive: true });
    window.addEventListener('scroll', handleDismiss, { passive: true, capture: true });
    window.addEventListener('blur', handleDismiss);

    return () => {
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      document.removeEventListener('mousedown', handleDismiss);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('blur', handleDismiss);
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (warmTimerRef.current) clearTimeout(warmTimerRef.current);
    };
  }, [hideTooltip]);

  // Compute tooltip position with collision detection
  useEffect(() => {
    if (!isVisible || !tooltip || !tooltipElRef.current) return;

    const el = tooltipElRef.current;
    const { width, height } = el.getBoundingClientRect();
    const { targetRect, preferredSide } = tooltip;
    const padding = 6;
    const viewportMargin = 8;

    let x = 0;
    let y = 0;

    if (preferredSide === 'top') {
      x = targetRect.left + targetRect.width / 2 - width / 2;
      y = targetRect.top - height - padding;
      if (y < viewportMargin) {
        // Flip to bottom
        y = targetRect.bottom + padding;
      }
    } else if (preferredSide === 'left') {
      x = targetRect.left - width - padding;
      y = targetRect.top + targetRect.height / 2 - height / 2;
      if (x < viewportMargin) {
        // Flip to right
        x = targetRect.right + padding;
      }
    } else if (preferredSide === 'right') {
      x = targetRect.right + padding;
      y = targetRect.top + targetRect.height / 2 - height / 2;
      if (x + width > window.innerWidth - viewportMargin) {
        // Flip to left
        x = targetRect.left - width - padding;
      }
    } else {
      // Default: 'bottom'
      x = targetRect.left + targetRect.width / 2 - width / 2;
      y = targetRect.bottom + padding;
      if (y + height > window.innerHeight - viewportMargin) {
        // Flip to top
        y = targetRect.top - height - padding;
      }
    }

    // Clamp horizontally within viewport
    x = Math.max(viewportMargin, Math.min(window.innerWidth - width - viewportMargin, x));
    // Clamp vertically within viewport
    y = Math.max(viewportMargin, Math.min(window.innerHeight - height - viewportMargin, y));

    setCoords({ x: Math.round(x), y: Math.round(y) });
  }, [isVisible, tooltip]);

  const isReady = isVisible && coords.x > -1000;

  return (
    <>
      {children}

      {/* Floating VS Code / Antigravity Aesthetic Tooltip */}
      {tooltip && (
        <div
          ref={tooltipElRef}
          style={{
            position: 'fixed',
            left: `${coords.x}px`,
            top: `${coords.y}px`,
            zIndex: 99999999,
          }}
          className={`aesthetic-tooltip pointer-events-none select-none transition-opacity duration-100 ease-out ${
            isReady ? 'opacity-100' : 'opacity-0'
          } flex items-center gap-2.5 px-2 py-0.5 rounded-[5px] bg-[#1f1f1f] border border-[#383838] shadow-lg shadow-black/50 text-[11.5px] font-sans leading-none whitespace-nowrap`}
        >
          <span className="text-[#cccccc] font-normal tracking-tight">{tooltip.label}</span>
          {tooltip.shortcut && (
            <span className="text-[#858585] text-[11px] font-normal tracking-wide font-sans">
              {tooltip.shortcut}
            </span>
          )}
        </div>
      )}
    </>
  );
};

/**
 * Reusable wrapper component for explicit tooltips
 */
export const Tooltip: React.FC<{
  content: string;
  shortcut?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactElement;
}> = ({ content, shortcut, side = 'bottom', children }) => {
  return React.cloneElement(children, {
    'data-tooltip': content,
    'data-shortcut': shortcut,
    'data-tooltip-side': side,
  } as React.HTMLAttributes<HTMLElement>);
};
