'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Quote } from 'lucide-react';

export const SelectionQuoteButton: React.FC = () => {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleQuote = (textToQuote?: string) => {
    const text = textToQuote || selectedText;
    if (!text || !text.trim()) return;

    window.dispatchEvent(
      new CustomEvent('aidev-insert-context', {
        detail: {
          type: 'quote',
          snippet: text.trim(),
        },
      })
    );

    // Clear selection and button
    try {
      window.getSelection()?.removeAllRanges();
    } catch {}
    setCoords(null);
    setSelectedText('');
  };

  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        setCoords(null);
        setSelectedText('');
        return;
      }

      const text = sel.toString().trim();
      if (!text || text.length < 2) {
        setCoords(null);
        setSelectedText('');
        return;
      }

      // Check if selection is inside an input, textarea, or contenteditable editor
      const anchorNode = sel.anchorNode;
      const parentEl = anchorNode?.nodeType === Node.ELEMENT_NODE
        ? (anchorNode as HTMLElement)
        : anchorNode?.parentElement;

      if (
        parentEl?.closest('input') ||
        parentEl?.closest('textarea') ||
        parentEl?.closest('[contenteditable="true"]')
      ) {
        setCoords(null);
        setSelectedText('');
        return;
      }

      try {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          setCoords(null);
          return;
        }

        // Position directly at bottom right of selection, or just below
        const top = rect.bottom + 6;
        const left = Math.min(Math.max(rect.right - 40, 60), window.innerWidth - 120);

        setCoords({ top, left });
        setSelectedText(text);
      } catch {
        setCoords(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) {
        const sel = window.getSelection();
        const text = sel?.toString().trim();
        if (text && text.length >= 2) {
          // Check not in active input/textarea
          const active = document.activeElement;
          const isTyping =
            active &&
            (active.tagName === 'INPUT' ||
              active.tagName === 'TEXTAREA' ||
              active.getAttribute('contenteditable') === 'true');

          if (!isTyping) {
            e.preventDefault();
            handleQuote(text);
          }
        }
      }
    };

    const handleScroll = () => {
      setCoords(null);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mouseup', handleSelectionChange);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mouseup', handleSelectionChange);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [selectedText]);

  if (!mounted || !coords || !selectedText) return null;

  return createPortal(
    <button
      ref={buttonRef}
      type="button"
      onMouseDown={(e) => {
        // Prevent clearing selection before onClick fires
        e.preventDefault();
      }}
      onClick={() => handleQuote()}
      style={{
        position: 'fixed',
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        zIndex: 999999,
      }}
      className="selection-quote-btn flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/95 hover:bg-slate-50 dark:bg-[#18181c]/95 dark:hover:bg-[#23232b] text-slate-800 hover:text-slate-950 dark:text-zinc-200 dark:hover:text-white border border-slate-200 hover:border-slate-300 dark:border-[#363644] dark:hover:border-[#4d4d62] shadow-md shadow-slate-400/20 dark:shadow-xl dark:shadow-black/50 backdrop-blur-md cursor-pointer animate-fade-in transition-all text-xs font-sans select-none active:scale-95"
      title="Insert this quote into chat input (Ctrl+L)"
    >
      <Quote className="w-3.5 h-3.5 text-amber-500 shrink-0" />
      <span className="font-medium text-[11.5px]">Quote</span>
      <kbd className="ml-0.5 text-[9.5px] font-mono px-1 py-0.2 rounded bg-slate-100 dark:bg-black/40 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-white/[0.08]">
        Ctrl+L
      </kbd>
    </button>,
    document.body
  );
};
