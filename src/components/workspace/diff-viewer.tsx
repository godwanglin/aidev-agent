'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { diffLines } from 'diff';
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-css';
import {
  ChevronRight,
  ChevronUp,
  ChevronDown,
  FileDiff,
  RotateCcw,
  Plus,
  Search,
  MoreVertical,
  Check,
  Copy,
  X,
  MessageSquare,
} from 'lucide-react';
import { AestheticFileIcon } from '@/components/common/aesthetic-file-icon';
import { BottomSheet } from '@/components/ui/bottom-sheet';

export interface MatchItem {
  matchId: string;
  lineId: string;
  chunkId?: string;
}

export interface DiffViewerProps {
  filePath: string;
  originalContent: string;
  currentContent: string;
  snapshotId?: string;
  onRevert?: (snapshotId: string) => void;
  mode?: 'unified' | 'stacked' | 'split';
  showBreadcrumbs?: boolean;
  workdir?: string;
  onOpenReview?: () => void;
  hideWhitespace?: boolean;
  externalSearchQuery?: string;
  externalSearchActive?: boolean;
  externalMatchCase?: boolean;
  externalMatchWholeWord?: boolean;
  externalUseRegex?: boolean;
  activeMatchId?: string;
  onMatchesComputed?: (filePath: string, matches: MatchItem[]) => void;
}

interface UnifiedLine {
  id: string;
  type: 'added' | 'removed' | 'unchanged';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

interface SplitCell {
  type: 'removed' | 'added' | 'unchanged' | 'empty';
  lineNumber?: number;
  content: string;
}

interface SplitRow {
  id: string;
  left: SplitCell;
  right: SplitCell;
  isDiff: boolean;
}

interface ChunkExpansion {
  top: number;
  bottom: number;
  all: boolean;
}


function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'json':
      return 'json';
    case 'py':
      return 'python';
    case 'sql':
      return 'sql';
    case 'prisma':
      return 'typescript';
    case 'sh':
    case 'bash':
      return 'bash';
    case 'css':
    case 'scss':
    case 'less':
      return 'css';
    default:
      return 'typescript';
  }
}

function highlightCode(code: string, lang: string): string {
  if (!code) return '&nbsp;';
  try {
    const grammar =
      (Prism && Prism.languages && Prism.languages[lang]) ||
      (Prism && Prism.languages && Prism.languages.typescript) ||
      (Prism && Prism.languages && Prism.languages.javascript) ||
      (Prism && Prism.languages && Prism.languages.clike);
    if (grammar) {
      const activeLang = Prism && Prism.languages && Prism.languages[lang] ? lang : 'typescript';
      return Prism.highlight(code, grammar, activeLang);
    }
  } catch {
    // fallback below
  }
  return code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  filePath,
  originalContent = '',
  currentContent = '',
  snapshotId,
  onRevert,
  mode = 'stacked',
  showBreadcrumbs = false,
  workdir = 'c:\\dev\\aidev',
  onOpenReview,
  hideWhitespace: externalHideWhitespace,
  externalSearchQuery,
  externalSearchActive,
  externalMatchCase,
  externalMatchWholeWord,
  externalUseRegex,
  activeMatchId,
  onMatchesComputed,
}) => {
  const lang = useMemo(() => getLanguageFromPath(filePath), [filePath]);
  const isSplit = mode === 'split';

  // Normalize line endings to avoid CRLF vs LF mismatches
  const normalizedOriginal = useMemo(
    () => (originalContent || '').replace(/\r\n/g, '\n'),
    [originalContent]
  );
  const normalizedCurrent = useMemo(
    () => (currentContent || '').replace(/\r\n/g, '\n'),
    [currentContent]
  );

  const isNewFile = !normalizedOriginal && Boolean(normalizedCurrent);
  const isDeletedFile = Boolean(normalizedOriginal) && !normalizedCurrent;
  // If the file is brand new or deleted, side-by-side split is meaningless (one side is 100% empty space),
  // which causes the code to be squished completely to the right. Fallback to full-width presentation.
  const effectiveIsSplit = isSplit && !isNewFile && !isDeletedFile;

  // 3-dots menu & local whitespace state
  const [internalHideWhitespace, setInternalHideWhitespace] = useState(false);
  const effectiveHideWhitespace =
    externalHideWhitespace !== undefined ? externalHideWhitespace : internalHideWhitespace;

  const [showMenu, setShowMenu] = useState(false);
  const [copiedContent, setCopiedContent] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const DEFAULT_FONT_SIZE = 12;
  const MIN_FONT_SIZE = 9;
  const MAX_FONT_SIZE = 26;

  const [fontSize, setFontSize] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('aidev_editor_font_size');
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val >= MIN_FONT_SIZE && val <= MAX_FONT_SIZE) {
          return val;
        }
      }
    }
    return DEFAULT_FONT_SIZE;
  });

  const lineHeight = Math.round(fontSize * 1.6);

  const updateFontSize = (newSize: number) => {
    const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(newSize * 2) / 2));
    setFontSize(clamped);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_editor_font_size', String(clamped));
      window.dispatchEvent(new CustomEvent('aidev-editor-zoom', { detail: { fontSize: clamped } }));
    }
  };

  const handleZoomIn = () => updateFontSize(fontSize + 1);
  const handleZoomOut = () => updateFontSize(fontSize - 1);
  const handleResetZoom = () => updateFontSize(DEFAULT_FONT_SIZE);

  // Sync zoom changes across open editors/tabs
  useEffect(() => {
    const handleZoomSync = (e: Event) => {
      const custom = e as CustomEvent<{ fontSize: number }>;
      if (custom.detail?.fontSize && custom.detail.fontSize !== fontSize) {
        setFontSize(custom.detail.fontSize);
      }
    };
    window.addEventListener('aidev-editor-zoom', handleZoomSync);
    return () => window.removeEventListener('aidev-editor-zoom', handleZoomSync);
  }, [fontSize]);

  // Intercept Ctrl + Mouse Wheel on diff container to zoom in/out instead of native Chrome zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault(); // Stop native Chrome page zoom!
        e.stopPropagation();
        if (e.deltaY < 0) {
          // Scroll up: zoom in
          setFontSize((prev) => {
            const next = Math.min(MAX_FONT_SIZE, Math.round((prev + 1) * 2) / 2);
            localStorage.setItem('aidev_editor_font_size', String(next));
            window.dispatchEvent(new CustomEvent('aidev-editor-zoom', { detail: { fontSize: next } }));
            return next;
          });
        } else if (e.deltaY > 0) {
          // Scroll down: zoom out
          setFontSize((prev) => {
            const next = Math.max(MIN_FONT_SIZE, Math.round((prev - 1) * 2) / 2);
            localStorage.setItem('aidev_editor_font_size', String(next));
            window.dispatchEvent(new CustomEvent('aidev-editor-zoom', { detail: { fontSize: next } }));
            return next;
          });
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Intercept Ctrl + '+' / '-' / '0' keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          handleZoomIn();
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          handleZoomOut();
        } else if (e.key === '0') {
          e.preventDefault();
          handleResetZoom();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fontSize]);

  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [matchWholeWord, setMatchWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const effectiveSearchQuery = externalSearchActive && externalSearchQuery !== undefined
    ? externalSearchQuery
    : searchQuery;

  const effectiveMatchCase = externalSearchActive && externalMatchCase !== undefined
    ? externalMatchCase
    : matchCase;

  const effectiveMatchWholeWord = externalSearchActive && externalMatchWholeWord !== undefined
    ? externalMatchWholeWord
    : matchWholeWord;

  const effectiveUseRegex = externalSearchActive && externalUseRegex !== undefined
    ? externalUseRegex
    : useRegex;

  // Context folding state
  const [expansions, setExpansions] = useState<Record<string, ChunkExpansion>>({});

  // Inline diff comments state
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});

  const toggleComment = (id: string) => {
    setOpenComments((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const cancelComment = (id: string) => {
    setOpenComments((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setCommentTexts((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const handleSendComment = (id: string, lineNum: number, snippet: string) => {
    const text = commentTexts[id]?.trim();
    if (!text) return;

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('aidev-insert-context', {
          detail: {
            type: 'code_ref',
            filePath,
            lineNum,
            snippet: snippet.trim(),
            comment: text,
          },
        })
      );
    }

    cancelComment(id);
  };

  // Close 3-dots menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (typeof window !== 'undefined' && window.innerWidth < 640) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  // Keyboard shortcut Ctrl+F / Cmd+F to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && showBreadcrumbs) {
        e.preventDefault();
        setIsSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showBreadcrumbs, isSearchOpen]);

  // Compute Unified Lines
  const unifiedLines = useMemo(() => {
    if (!normalizedOriginal && !normalizedCurrent) return [];
    const parts = diffLines(normalizedOriginal, normalizedCurrent, {
      ignoreWhitespace: effectiveHideWhitespace,
    });
    const lines: UnifiedLine[] = [];
    let oldLine = 1;
    let newLine = 1;

    for (let pIdx = 0; pIdx < parts.length; pIdx++) {
      const part = parts[pIdx];
      const rawLines = part.value.split('\n');
      if (rawLines.length > 1 && rawLines[rawLines.length - 1] === '') {
        rawLines.pop();
      } else if (rawLines.length === 1 && rawLines[0] === '' && pIdx === parts.length - 1) {
        break;
      }

      for (let lIdx = 0; lIdx < rawLines.length; lIdx++) {
        const line = rawLines[lIdx];
        if (part.added) {
          lines.push({
            id: `u_a_${newLine}_${pIdx}_${lIdx}`,
            type: 'added',
            newLineNumber: newLine++,
            content: line,
          });
        } else if (part.removed) {
          lines.push({
            id: `u_r_${oldLine}_${pIdx}_${lIdx}`,
            type: 'removed',
            oldLineNumber: oldLine++,
            content: line,
          });
        } else {
          lines.push({
            id: `u_u_${oldLine}_${newLine}_${pIdx}_${lIdx}`,
            type: 'unchanged',
            oldLineNumber: oldLine++,
            newLineNumber: newLine++,
            content: line,
          });
        }
      }
    }
    return lines;
  }, [normalizedOriginal, normalizedCurrent, effectiveHideWhitespace]);

  // Compute Split Rows
  const splitRows = useMemo(() => {
    if (!normalizedOriginal && !normalizedCurrent) return [];
    const parts = diffLines(normalizedOriginal, normalizedCurrent, {
      ignoreWhitespace: effectiveHideWhitespace,
    });
    const rows: SplitRow[] = [];
    let oldLine = 1;
    let newLine = 1;

    for (let pIdx = 0; pIdx < parts.length; pIdx++) {
      const part = parts[pIdx];
      const rawLines = part.value.split('\n');
      if (rawLines.length > 1 && rawLines[rawLines.length - 1] === '') {
        rawLines.pop();
      } else if (rawLines.length === 1 && rawLines[0] === '' && pIdx === parts.length - 1) {
        break;
      }

      if (!part.added && !part.removed) {
        for (let lIdx = 0; lIdx < rawLines.length; lIdx++) {
          rows.push({
            id: `s_u_${oldLine}_${newLine}`,
            left: { type: 'unchanged', lineNumber: oldLine++, content: rawLines[lIdx] },
            right: { type: 'unchanged', lineNumber: newLine++, content: rawLines[lIdx] },
            isDiff: false,
          });
        }
      } else if (part.removed) {
        const nextPart = parts[pIdx + 1];
        if (nextPart && nextPart.added) {
          const nextRawLines = nextPart.value.split('\n');
          if (nextRawLines.length > 1 && nextRawLines[nextRawLines.length - 1] === '') {
            nextRawLines.pop();
          }

          const maxLen = Math.max(rawLines.length, nextRawLines.length);
          for (let i = 0; i < maxLen; i++) {
            const hasLeft = i < rawLines.length;
            const hasRight = i < nextRawLines.length;

            rows.push({
              id: `s_pair_${oldLine}_${newLine}_${i}`,
              left: hasLeft
                ? { type: 'removed', lineNumber: oldLine++, content: rawLines[i] }
                : { type: 'empty', content: '' },
              right: hasRight
                ? { type: 'added', lineNumber: newLine++, content: nextRawLines[i] }
                : { type: 'empty', content: '' },
              isDiff: true,
            });
          }
          pIdx++;
        } else {
          for (let lIdx = 0; lIdx < rawLines.length; lIdx++) {
            rows.push({
              id: `s_r_${oldLine}_${lIdx}`,
              left: { type: 'removed', lineNumber: oldLine++, content: rawLines[lIdx] },
              right: { type: 'empty', content: '' },
              isDiff: true,
            });
          }
        }
      } else if (part.added) {
        for (let lIdx = 0; lIdx < rawLines.length; lIdx++) {
          rows.push({
            id: `s_a_${newLine}_${lIdx}`,
            left: { type: 'empty', content: '' },
            right: { type: 'added', lineNumber: newLine++, content: rawLines[lIdx] },
            isDiff: true,
          });
        }
      }
    }
    return rows;
  }, [normalizedOriginal, normalizedCurrent, effectiveHideWhitespace]);

  // Compiled Search Regex
  const searchRegex = useMemo(() => {
    if (!effectiveSearchQuery.trim()) return null;
    try {
      let pattern = effectiveSearchQuery;
      if (!effectiveUseRegex) {
        pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      if (effectiveMatchWholeWord) {
        pattern = `\\b${pattern}\\b`;
      }
      return new RegExp(pattern, effectiveMatchCase ? 'g' : 'gi');
    } catch {
      return null;
    }
  }, [effectiveSearchQuery, effectiveMatchCase, effectiveMatchWholeWord, effectiveUseRegex]);

  // Expansion Handlers
  const handleExpandAll = useCallback((chunkId: string) => {
    setExpansions((prev) => ({
      ...prev,
      [chunkId]: { ...(prev[chunkId] || { top: 0, bottom: 0, all: false }), all: true },
    }));
  }, []);

  const handleExpandTop10 = useCallback((chunkId: string) => {
    setExpansions((prev) => {
      const cur = prev[chunkId] || { top: 0, bottom: 0, all: false };
      return { ...prev, [chunkId]: { ...cur, top: cur.top + 10 } };
    });
  }, []);

  const handleExpandBottom10 = useCallback((chunkId: string) => {
    setExpansions((prev) => {
      const cur = prev[chunkId] || { top: 0, bottom: 0, all: false };
      return { ...prev, [chunkId]: { ...cur, bottom: cur.bottom + 10 } };
    });
  }, []);

  // Compute all matches across lines for navigation
  const allMatches = useMemo(() => {
    if (!searchRegex) return [];
    const list: MatchItem[] = [];

    if (!effectiveIsSplit) {
      for (const line of unifiedLines) {
        const regex = new RegExp(searchRegex.source, searchRegex.flags);
        let m: RegExpExecArray | null;
        let idx = 0;
        while ((m = regex.exec(line.content)) !== null) {
          list.push({
            matchId: `${line.id}_m_${idx++}`,
            lineId: line.id,
          });
          if (!regex.global) break;
        }
      }
    } else {
      for (const row of splitRows) {
        const regexL = new RegExp(searchRegex.source, searchRegex.flags);
        let mL: RegExpExecArray | null;
        let idxL = 0;
        while ((mL = regexL.exec(row.left.content)) !== null) {
          list.push({
            matchId: `${row.id}_L_m_${idxL++}`,
            lineId: `${row.id}_L`,
          });
          if (!regexL.global) break;
        }

        const regexR = new RegExp(searchRegex.source, searchRegex.flags);
        let mR: RegExpExecArray | null;
        let idxR = 0;
        while ((mR = regexR.exec(row.right.content)) !== null) {
          list.push({
            matchId: `${row.id}_R_m_${idxR++}`,
            lineId: `${row.id}_R`,
          });
          if (!regexR.global) break;
        }
      }
    }

    return list;
  }, [searchRegex, isSplit, unifiedLines, splitRows]);

  const totalMatches = allMatches.length;
  const activeMatch = allMatches[currentMatchIdx] || null;

  // Report matches to parent (e.g. ReviewView) when external search is active
  useEffect(() => {
    if (externalSearchActive) {
      onMatchesComputed?.(filePath, allMatches);
    }
  }, [filePath, allMatches, externalSearchActive, onMatchesComputed]);

  // Jump to active match (for single edit mode)
  useEffect(() => {
    if (externalSearchActive) return;
    if (!activeMatch) return;
    const el = document.getElementById(activeMatch.matchId) || document.getElementById(activeMatch.lineId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeMatch, currentMatchIdx, externalSearchActive]);

  const handleNextMatch = () => {
    if (totalMatches === 0) return;
    setCurrentMatchIdx((prev) => (prev + 1) % totalMatches);
  };

  const handlePrevMatch = () => {
    if (totalMatches === 0) return;
    setCurrentMatchIdx((prev) => (prev - 1 + totalMatches) % totalMatches);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) handlePrevMatch();
      else handleNextMatch();
    }
    if (e.key === 'Escape') {
      setIsSearchOpen(false);
      setSearchQuery('');
    }
  };

  // Render code text with syntax highlighting and search highlights
  function renderCodeLine(content: string, lineId: string, prefix = '') {
    if (!content) return <span>&nbsp;</span>;
    if (!searchRegex) {
      return <span dangerouslySetInnerHTML={{ __html: highlightCode(content, lang) }} />;
    }

    const regex = new RegExp(searchRegex.source, searchRegex.flags);
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let matchIdx = 0;

    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        const nonMatchText = content.slice(lastIndex, match.index);
        parts.push(
          <span
            key={`nm_${lastIndex}`}
            dangerouslySetInnerHTML={{ __html: highlightCode(nonMatchText, lang) }}
          />
        );
      }

      const matchText = match[0];
      const matchId = `${lineId}_m_${matchIdx++}`;
      const isCurrentActive = externalSearchActive && activeMatchId
        ? activeMatchId === matchId
        : activeMatch?.matchId === matchId;

      parts.push(
        <mark
          key={matchId}
          id={matchId}
          className={`rounded-[2px] px-0.5 font-mono ${
            isCurrentActive
              ? 'bg-[#f59e0b] text-black font-semibold shadow-sm ring-1 ring-amber-300'
              : 'bg-[#f59e0b]/40 text-white'
          }`}
        >
          {matchText}
        </mark>
      );

      lastIndex = match.index + matchText.length;
      if (!regex.global) break;
    }

    if (lastIndex < content.length) {
      const trailingText = content.slice(lastIndex);
      parts.push(
        <span
          key={`trailing_${lastIndex}`}
          dangerouslySetInnerHTML={{ __html: highlightCode(trailingText, lang) }}
        />
      );
    }

    return <>{parts}</>;
  }

  // Render Fold Bar Component
  const renderFoldBar = (chunkId: string, remainingCount: number) => {
    return (
      <div
        key={`fold_${chunkId}`}
        className="relative py-2 flex items-center justify-center my-0.5 select-none group/fold"
      >
        <div className="absolute inset-x-0 h-px bg-[#222222]" />
        <div className="relative z-10 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleExpandAll(chunkId)}
            className="px-2.5 py-0.5 rounded-full bg-[#181818] border border-[#2a2a2a] hover:border-[#3d3d3d] hover:bg-[#202020] text-[11px] text-[#8c8c8c] hover:text-[#cccccc] transition font-sans shadow-sm cursor-pointer"
            title="Click to expand all lines"
          >
            +{remainingCount} more lines
          </button>
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => handleExpandTop10(chunkId)}
              className="px-1 py-0.5 rounded bg-[#181818] border border-[#2a2a2a] hover:border-[#3d3d3d] hover:bg-[#202020] text-[9px] text-[#6e6e6e] hover:text-[#cccccc] transition font-mono leading-none cursor-pointer"
              title="Expand 10 lines from top"
            >
              +10
            </button>
            <button
              type="button"
              onClick={() => handleExpandBottom10(chunkId)}
              className="px-1 py-0.5 rounded bg-[#181818] border border-[#2a2a2a] hover:border-[#3d3d3d] hover:bg-[#202020] text-[9px] text-[#6e6e6e] hover:text-[#cccccc] transition font-mono leading-none cursor-pointer"
              title="Expand 10 lines from bottom"
            >
              +10
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Prepare Unified Render Items with Context Folding
  const unifiedRenderNodes = useMemo(() => {
    const nodes: React.ReactNode[] = [];
    let currentUnchanged: UnifiedLine[] = [];
    let chunkCounter = 0;

    const flushUnchanged = (run: UnifiedLine[]) => {
      if (run.length <= 6) {
        run.forEach((l) => nodes.push(renderUnifiedRow(l)));
        return;
      }
      run.slice(0, 3).forEach((l) => nodes.push(renderUnifiedRow(l)));

      const middle = run.slice(3, run.length - 3);
      const chunkId = `u_chunk_${chunkCounter++}`;
      const exp = expansions[chunkId];

      const containsMatch = searchRegex
        ? middle.some((line) => {
            const re = new RegExp(searchRegex.source, searchRegex.flags);
            return re.test(line.content);
          })
        : false;

      if (exp?.all || containsMatch) {
        middle.forEach((l) => nodes.push(renderUnifiedRow(l)));
      } else {
        const topCount = Math.min(exp?.top || 0, middle.length);
        const bottomCount = Math.min(exp?.bottom || 0, middle.length - topCount);

        if (topCount > 0) {
          middle.slice(0, topCount).forEach((l) => nodes.push(renderUnifiedRow(l)));
        }

        const remaining = middle.length - topCount - bottomCount;
        if (remaining > 0) {
          nodes.push(renderFoldBar(chunkId, remaining));
        }

        if (bottomCount > 0) {
          middle.slice(middle.length - bottomCount).forEach((l) => nodes.push(renderUnifiedRow(l)));
        }
      }

      run.slice(run.length - 3).forEach((l) => nodes.push(renderUnifiedRow(l)));
    };

    for (const l of unifiedLines) {
      if (l.type === 'unchanged') {
        currentUnchanged.push(l);
      } else {
        if (currentUnchanged.length > 0) {
          flushUnchanged(currentUnchanged);
          currentUnchanged = [];
        }
        nodes.push(renderUnifiedRow(l));
      }
    }
    if (currentUnchanged.length > 0) {
      flushUnchanged(currentUnchanged);
    }

    return nodes;
  }, [unifiedLines, expansions, lang, searchRegex, activeMatch, activeMatchId, externalSearchActive, openComments, commentTexts, fontSize, lineHeight]);

  // Render a single Unified Diff Row (Matching Image 1)
  function renderUnifiedRow(l: UnifiedLine) {
    const isAdded = l.type === 'added';
    const isRemoved = l.type === 'removed';
    const isCommentOpen = Boolean(openComments[l.id]);
    const lineNum = l.newLineNumber || l.oldLineNumber || 1;

    const rowBg = isAdded
      ? 'bg-[#132e18]/80 hover:bg-[#16381d]'
      : isRemoved
      ? 'bg-[#3e1616]/80 hover:bg-[#4a1a1a]'
      : 'hover:bg-white/[0.03]';

    return (
      <React.Fragment key={l.id}>
        <div
          id={l.id}
          style={{
            minHeight: `${lineHeight}px`,
            lineHeight: `${lineHeight}px`,
          }}
          className={`flex items-start font-mono select-text transition-colors group/diffrow relative ${rowBg}`}
        >
          {/* Left Gutter: Old Line Number */}
          <div
            style={{ lineHeight: `${lineHeight}px` }}
            className="w-8 shrink-0 text-right pr-2 select-none text-[11.5px] text-[#6e6e6e] font-mono"
          >
            {l.oldLineNumber ?? ''}
          </div>

          {/* Right Gutter: New Line Number */}
          <div
            style={{ lineHeight: `${lineHeight}px` }}
            className="w-8 shrink-0 text-right pr-3 select-none text-[11.5px] text-[#6e6e6e] font-mono"
          >
            {l.newLineNumber ?? ''}
          </div>

          {/* Code Content */}
          <div
            style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
            className="flex-1 min-w-0 pl-1 pr-10 overflow-x-auto whitespace-pre font-mono font-[450] text-[#eceff4] relative subpixel-antialiased"
          >
            {renderCodeLine(l.content, l.id)}
          </div>

          {/* Hover Blue '+' Button - visible on hover or when comment is open */}
          <button
            type="button"
            onClick={() => toggleComment(l.id)}
            className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#007acc] hover:bg-[#0098ff] text-white flex items-center justify-center text-[10px] shadow cursor-pointer transition z-10 ${
              isCommentOpen ? 'opacity-100' : 'opacity-0 group-hover/diffrow:opacity-100'
            }`}
            title={`Comment on line ${lineNum}`}
          >
            <Plus className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
          </button>
        </div>

        {/* Inline Comment Widget */}
        {isCommentOpen && (
          <div className="my-2 mx-6 p-3 rounded-xl bg-[#181818] border border-[#2a2a2a] shadow-2xl space-y-2.5 animate-dropdown select-none">
            {/* Header */}
            <div className="flex items-center justify-between text-xs pb-1.5 border-b border-[#262626]">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#007acc]/20 text-[#58a6ff] font-sans text-[10.5px] font-medium border border-[#007acc]/30">
                  <MessageSquare className="w-3 h-3" />
                  Line {lineNum} ({l.type})
                </span>
                <span className="text-[#8c8c8c] text-[11px] font-mono truncate max-w-[320px]">
                  {l.content.trim() || '(empty line)'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => cancelComment(l.id)}
                className="p-1 rounded text-[#6e6e6e] hover:text-[#cccccc] hover:bg-[#222222] transition cursor-pointer"
                title="Cancel comment"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Comment Textarea */}
            <textarea
              autoFocus
              value={commentTexts[l.id] || ''}
              onChange={(e) =>
                setCommentTexts({ ...commentTexts, [l.id]: e.target.value })
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSendComment(l.id, lineNum, l.content);
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelComment(l.id);
                }
              }}
              placeholder="Ask AI about this diff line or give instructions... (Ctrl+Enter to send)"
              rows={2}
              className="w-full bg-[#121212] border border-[#262626] rounded-lg p-2.5 text-[12px] text-[#cccccc] placeholder-[#666666] focus:outline-none focus:border-[#007acc] resize-none font-sans leading-relaxed select-text"
            />

            {/* Quick suggestion chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] pb-0.5">
              {['Explain this change', 'Refactor this logic', 'Check for regressions', 'Add unit test'].map(
                (chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      const cur = commentTexts[l.id] || '';
                      setCommentTexts({
                        ...commentTexts,
                        [l.id]: cur ? `${cur} ${chip}` : chip,
                      });
                    }}
                    className="px-2 py-0.5 rounded-md bg-[#202020] hover:bg-[#262626] text-[#9d9d9d] hover:text-[#cccccc] border border-[#282828] whitespace-nowrap transition cursor-pointer text-[10.5px]"
                  >
                    {chip}
                  </button>
                )
              )}
            </div>

            {/* Action Buttons: Cancel or Add to Chat */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => cancelComment(l.id)}
                className="px-2.5 py-1 text-xs text-[#8c8c8c] hover:text-[#cccccc] hover:bg-[#222222] rounded-md transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleSendComment(l.id, lineNum, l.content)}
                disabled={!commentTexts[l.id]?.trim()}
                className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition shadow-sm ${
                  commentTexts[l.id]?.trim()
                    ? 'bg-[#007acc] hover:bg-[#0086e6] text-white cursor-pointer active:scale-95'
                    : 'bg-[#222226] text-[#666666] cursor-not-allowed'
                }`}
                title="Add diff snippet and comment as context chip in chat input"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add to Chat</span>
              </button>
            </div>
          </div>
        )}
      </React.Fragment>
    );
  }

  // Prepare Split Render Items with Context Folding (Matching Image 2)
  const splitRenderNodes = useMemo(() => {
    const nodes: React.ReactNode[] = [];
    let currentUnchanged: SplitRow[] = [];
    let chunkCounter = 0;

    const flushUnchanged = (run: SplitRow[]) => {
      if (run.length <= 6) {
        run.forEach((r) => nodes.push(renderSplitRow(r)));
        return;
      }

      run.slice(0, 3).forEach((r) => nodes.push(renderSplitRow(r)));

      const middle = run.slice(3, run.length - 3);
      const chunkId = `s_chunk_${chunkCounter++}`;
      const exp = expansions[chunkId];

      const containsMatch = searchRegex
        ? middle.some((r) => {
            const reL = new RegExp(searchRegex.source, searchRegex.flags);
            const reR = new RegExp(searchRegex.source, searchRegex.flags);
            return reL.test(r.left.content) || reR.test(r.right.content);
          })
        : false;

      if (exp?.all || containsMatch) {
        middle.forEach((r) => nodes.push(renderSplitRow(r)));
      } else {
        const topCount = Math.min(exp?.top || 0, middle.length);
        const bottomCount = Math.min(exp?.bottom || 0, middle.length - topCount);

        if (topCount > 0) {
          middle.slice(0, topCount).forEach((r) => nodes.push(renderSplitRow(r)));
        }

        const remaining = middle.length - topCount - bottomCount;
        if (remaining > 0) {
          nodes.push(
            <div key={`s_fold_${chunkId}`} className="col-span-2">
              {renderFoldBar(chunkId, remaining)}
            </div>
          );
        }

        if (bottomCount > 0) {
          middle.slice(middle.length - bottomCount).forEach((r) => nodes.push(renderSplitRow(r)));
        }
      }

      run.slice(run.length - 3).forEach((r) => nodes.push(renderSplitRow(r)));
    };

    for (const r of splitRows) {
      if (!r.isDiff) {
        currentUnchanged.push(r);
      } else {
        if (currentUnchanged.length > 0) {
          flushUnchanged(currentUnchanged);
          currentUnchanged = [];
        }
        nodes.push(renderSplitRow(r));
      }
    }
    if (currentUnchanged.length > 0) {
      flushUnchanged(currentUnchanged);
    }

    return nodes;
  }, [splitRows, expansions, lang, searchRegex, activeMatch, activeMatchId, externalSearchActive, openComments, commentTexts, fontSize, lineHeight]);

  // Render a single Split Diff Row (Matching Image 2)
  function renderSplitRow(r: SplitRow) {
    const isLeftRemoved = r.left.type === 'removed';
    const isRightAdded = r.right.type === 'added';
    const isCommentOpen = Boolean(openComments[r.id]);
    const lineNum = r.right.lineNumber || r.left.lineNumber || 1;
    const content = r.right.type !== 'empty' ? r.right.content : r.left.content;

    const leftBg = isLeftRemoved
      ? 'bg-[#3e1616]/80'
      : r.left.type === 'empty'
      ? 'bg-[#0f1013]'
      : 'hover:bg-white/[0.03]';

    const rightBg = isRightAdded
      ? 'bg-[#132e18]/80'
      : r.right.type === 'empty'
      ? 'bg-[#0f1013]'
      : 'hover:bg-white/[0.03]';

    return (
      <React.Fragment key={r.id}>
        <div className="contents text-xs font-mono select-text">
          {/* Left Side (Original) */}
          <div
            id={`${r.id}_L`}
            style={{ minHeight: `${lineHeight}px`, lineHeight: `${lineHeight}px` }}
            className={`flex items-start transition-colors border-r border-[#1e1e1e] ${leftBg}`}
          >
            <div
              style={{ lineHeight: `${lineHeight}px` }}
              className="w-8 shrink-0 text-right pr-2 select-none text-[11.5px] text-[#6e6e6e] font-mono"
            >
              {r.left.lineNumber ?? ''}
            </div>
            <div
              style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
              className="flex-1 min-w-0 pl-1 pr-3 overflow-x-auto whitespace-pre font-mono text-[#cccccc] subpixel-antialiased"
            >
              {r.left.type !== 'empty' && renderCodeLine(r.left.content, `${r.id}_L`)}
            </div>
          </div>

          {/* Right Side (Modified) */}
          <div
            id={`${r.id}_R`}
            style={{ minHeight: `${lineHeight}px`, lineHeight: `${lineHeight}px` }}
            className={`flex items-start transition-colors relative group/splitrow ${rightBg}`}
          >
            <div
              style={{ lineHeight: `${lineHeight}px` }}
              className="w-8 shrink-0 text-right pr-2 select-none text-[11.5px] text-[#6e6e6e] font-mono"
            >
              {r.right.lineNumber ?? ''}
            </div>
            <div
              style={{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}px` }}
              className="flex-1 min-w-0 pl-1 pr-10 overflow-x-auto whitespace-pre font-mono text-[#cccccc] subpixel-antialiased"
            >
              {r.right.type !== 'empty' && renderCodeLine(r.right.content, `${r.id}_R`)}
            </div>

            {/* Hover Blue '+' Button on modified side */}
            <button
              type="button"
              onClick={() => toggleComment(r.id)}
              className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#007acc] hover:bg-[#0098ff] text-white flex items-center justify-center text-[10px] shadow cursor-pointer transition z-10 ${
                isCommentOpen ? 'opacity-100' : 'opacity-0 group-hover/splitrow:opacity-100'
              }`}
              title={`Comment on line ${lineNum}`}
            >
              <Plus className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Inline Comment Widget Spanning 2 Columns in Split Grid */}
        {isCommentOpen && (
          <div className="col-span-2 my-2 mx-6 p-3 rounded-xl bg-[#181818] border border-[#2a2a2a] shadow-2xl space-y-2.5 animate-dropdown select-none">
            {/* Header */}
            <div className="flex items-center justify-between text-xs pb-1.5 border-b border-[#262626]">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#007acc]/20 text-[#58a6ff] font-sans text-[10.5px] font-medium border border-[#007acc]/30">
                  <MessageSquare className="w-3 h-3" />
                  Line {lineNum}
                </span>
                <span className="text-[#8c8c8c] text-[11px] font-mono truncate max-w-[320px]">
                  {content.trim() || '(empty line)'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => cancelComment(r.id)}
                className="p-1 rounded text-[#6e6e6e] hover:text-[#cccccc] hover:bg-[#222222] transition cursor-pointer"
                title="Cancel comment"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Comment Textarea */}
            <textarea
              autoFocus
              value={commentTexts[r.id] || ''}
              onChange={(e) =>
                setCommentTexts({ ...commentTexts, [r.id]: e.target.value })
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSendComment(r.id, lineNum, content);
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelComment(r.id);
                }
              }}
              placeholder="Ask AI about this diff change or give instructions... (Ctrl+Enter to send)"
              rows={2}
              className="w-full bg-[#121212] border border-[#262626] rounded-lg p-2.5 text-[12px] text-[#cccccc] placeholder-[#666666] focus:outline-none focus:border-[#007acc] resize-none font-sans leading-relaxed select-text"
            />

            {/* Quick suggestion chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] pb-0.5">
              {['Explain this change', 'Refactor this logic', 'Check for regressions', 'Add unit test'].map(
                (chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      const cur = commentTexts[r.id] || '';
                      setCommentTexts({
                        ...commentTexts,
                        [r.id]: cur ? `${cur} ${chip}` : chip,
                      });
                    }}
                    className="px-2 py-0.5 rounded-md bg-[#202020] hover:bg-[#262626] text-[#9d9d9d] hover:text-[#cccccc] border border-[#282828] whitespace-nowrap transition cursor-pointer text-[10.5px]"
                  >
                    {chip}
                  </button>
                )
              )}
            </div>

            {/* Action Buttons: Cancel or Add to Chat */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => cancelComment(r.id)}
                className="px-2.5 py-1 text-xs text-[#8c8c8c] hover:text-[#cccccc] hover:bg-[#222222] rounded-md transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleSendComment(r.id, lineNum, content)}
                disabled={!commentTexts[r.id]?.trim()}
                className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition shadow-sm ${
                  commentTexts[r.id]?.trim()
                    ? 'bg-[#007acc] hover:bg-[#0086e6] text-white cursor-pointer active:scale-95'
                    : 'bg-[#222226] text-[#666666] cursor-not-allowed'
                }`}
                title="Add diff snippet and comment as context chip in chat input"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add to Chat</span>
              </button>
            </div>
          </div>
        )}
      </React.Fragment>
    );
  }

  // Breadcrumbs Generator (matching Image 1: 'aidev > coding-agent > src > components > [Icon] diff-viewer.tsx (single edit)')
  const { dirSegments, fileName } = useMemo(() => {
    const cleanWorkdir = workdir.replace(/\\/g, '/').split('/').filter(Boolean);
    const cleanFile = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
    const fName = cleanFile[cleanFile.length - 1] || filePath;
    const baseDir = cleanWorkdir.slice(-2);
    const combined = [...baseDir, ...cleanFile.slice(0, -1)];
    return {
      dirSegments: combined.length > 0 ? combined : ['aidev', 'src'],
      fileName: fName,
    };
  }, [workdir, filePath]);

  const diffBreadcrumbsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (diffBreadcrumbsRef.current) {
      diffBreadcrumbsRef.current.scrollLeft = diffBreadcrumbsRef.current.scrollWidth;
    }
  }, [filePath]);

  const handleDiffBreadcrumbsWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (diffBreadcrumbsRef.current && e.deltaY !== 0) {
      diffBreadcrumbsRef.current.scrollLeft += e.deltaY;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#101010] text-xs font-sans select-text overflow-hidden">
      {/* 1. Breadcrumbs Bar (Matching Image 1 & Image 2 in Single Diff tab) */}
      {showBreadcrumbs && (
        <div className="h-8 border-b border-[#1c1c1c] bg-[#141414] px-3 flex items-center justify-between shrink-0 select-none">
          {/* Left: Directory Path > [Icon] fileName (single edit) */}
          <div
            ref={diffBreadcrumbsRef}
            onWheel={handleDiffBreadcrumbsWheel}
            className="flex-1 min-w-0 flex items-center gap-1.5 text-[11.5px] text-[#8c8c8c] overflow-x-auto overflow-y-hidden whitespace-nowrap py-0.5 mr-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden font-sans select-none"
          >
            {dirSegments.map((seg, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <ChevronRight className="w-3 h-3 text-[#555555] shrink-0" />}
                <span className="shrink-0 whitespace-nowrap hover:text-[#cccccc] transition cursor-pointer">{seg}</span>
              </React.Fragment>
            ))}

            {/* Separator and File Name with Aesthetic Icon (User request: Image 2 / Image 1) */}
            <ChevronRight className="w-3 h-3 text-[#555555] shrink-0" />
            <div className="flex items-center gap-1.5 shrink-0 text-white font-medium whitespace-nowrap">
              <AestheticFileIcon filePath={filePath} className="w-3.5 h-3.5 shrink-0" />
              <span>{fileName}</span>
            </div>

            <span className="text-[#666666] text-[11px] ml-1 shrink-0 font-normal whitespace-nowrap">
              (single edit)
            </span>
          </div>

          {/* Right Toolbar: Revert, Search, 3-dots Menu, Review Button */}
          <div className="flex items-center gap-1.5 shrink-0 text-[#8c8c8c]">
            {/* 1-Click Revert Button */}
            {snapshotId && onRevert && (
              <button
                type="button"
                onClick={() => onRevert(snapshotId)}
                className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-white/[0.08] text-amber-400 hover:text-amber-300 transition text-[11px] cursor-pointer"
                title="Restore snapshot"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Revert</span>
              </button>
            )}

            {/* Search Toggle Button */}
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen((prev) => !prev);
                if (!isSearchOpen) {
                  setTimeout(() => searchInputRef.current?.focus(), 50);
                }
              }}
              className={`p-1 rounded hover:bg-white/[0.08] transition cursor-pointer ${
                isSearchOpen ? 'bg-white/[0.1] text-white' : 'text-[#8c8c8c] hover:text-white'
              }`}
              title="Search (Ctrl+F)"
            >
              <Search className="w-3.5 h-3.5" />
            </button>

            {/* 3-Dots Menu Button (Single Edit) */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setShowMenu((prev) => !prev)}
                className="p-1 rounded hover:bg-white/[0.08] text-[#8c8c8c] hover:text-white transition cursor-pointer"
                title="More options"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              <BottomSheet
                isOpen={showMenu}
                onClose={() => setShowMenu(false)}
                title="Diff Options"
                zIndex={1000}
                className="w-full sm:w-52 bg-[#181818] border-t sm:border border-[#282828] sm:top-full sm:right-0 sm:mt-1 p-2 sm:p-1 font-sans text-sm sm:text-xs text-[#cccccc]"
              >
                <div className="p-1 space-y-0.5">
                  {/* Item 1: Hide Whitespace Changes */}
                  <button
                    type="button"
                    onClick={() => {
                      setInternalHideWhitespace((prev) => !prev);
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center justify-between px-3 sm:px-2.5 py-2.5 sm:py-1.5 rounded-lg hover:bg-white/[0.08] text-[#cccccc] hover:text-white transition cursor-pointer text-left"
                  >
                    <span>Hide Whitespace Changes</span>
                    {effectiveHideWhitespace && <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#58a6ff]" />}
                  </button>

                  {/* Item 2: Copy Content */}
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(currentContent);
                      setCopiedContent(true);
                      setTimeout(() => setCopiedContent(false), 2000);
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center justify-between px-3 sm:px-2.5 py-2.5 sm:py-1.5 rounded-lg hover:bg-white/[0.08] text-[#cccccc] hover:text-white transition cursor-pointer text-left"
                  >
                    <span>Copy Content</span>
                    {copiedContent ? (
                      <span className="text-xs sm:text-[10px] text-emerald-400 font-mono">Copied!</span>
                    ) : (
                      <Copy className="w-4 h-4 sm:w-3 sm:h-3 text-[#6e6e6e]" />
                    )}
                  </button>

                  {/* Item 3: Copy Path */}
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(filePath);
                      setCopiedPath(true);
                      setTimeout(() => setCopiedPath(false), 2000);
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center justify-between px-3 sm:px-2.5 py-2.5 sm:py-1.5 rounded-lg hover:bg-white/[0.08] text-[#cccccc] hover:text-white transition cursor-pointer text-left"
                  >
                    <span>Copy Path</span>
                    {copiedPath ? (
                      <span className="text-xs sm:text-[10px] text-emerald-400 font-mono">Copied!</span>
                    ) : (
                      <Copy className="w-4 h-4 sm:w-3 sm:h-3 text-[#6e6e6e]" />
                    )}
                  </button>
                </div>
              </BottomSheet>
            </div>

            {/* Jump to Review View Button */}
            {onOpenReview && (
              <button
                type="button"
                onClick={onOpenReview}
                className="p-1 rounded hover:bg-white/[0.08] text-[#8c8c8c] hover:text-white transition cursor-pointer"
                title="Open Review mode"
              >
                <FileDiff className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. Interactive Search Bar (Matching Image 1: 'Find  Aa  ab  .*  No Results  ^  v  x') */}
      {isSearchOpen && showBreadcrumbs && (
        <div className="h-9 border-b border-[#222222] bg-[#141416] px-3 flex items-center justify-between shrink-0 select-none animate-fadeIn">
          <div className="flex items-center gap-2 max-w-sm w-full">
            <div className="flex-1 flex items-center bg-[#1b1c20] border border-[#2c2d33] focus-within:border-[#007acc] rounded-md px-2 py-0.5 text-xs transition">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Find"
                className="bg-transparent border-none outline-none text-xs text-[#cccccc] placeholder-[#666666] flex-1 min-w-0 font-sans"
              />
              <div className="flex items-center gap-0.5 text-[11px] ml-1 select-none font-sans">
                <button
                  type="button"
                  onClick={() => setMatchCase((prev) => !prev)}
                  className={`px-1 py-0.2 rounded transition cursor-pointer font-sans font-medium text-[10.5px] ${
                    matchCase ? 'bg-[#007acc] text-white' : 'text-[#6e6e6e] hover:text-[#cccccc]'
                  }`}
                  title="Match Case (Alt+C)"
                >
                  Aa
                </button>
                <button
                  type="button"
                  onClick={() => setMatchWholeWord((prev) => !prev)}
                  className={`px-1 py-0.2 rounded transition cursor-pointer font-sans font-medium text-[10.5px] ${
                    matchWholeWord ? 'bg-[#007acc] text-white' : 'text-[#6e6e6e] hover:text-[#cccccc]'
                  }`}
                  title="Match Whole Word (Alt+W)"
                >
                  ab
                </button>
                <button
                  type="button"
                  onClick={() => setUseRegex((prev) => !prev)}
                  className={`px-1 py-0.2 rounded transition cursor-pointer font-sans font-medium text-[10.5px] ${
                    useRegex ? 'bg-[#007acc] text-white' : 'text-[#6e6e6e] hover:text-[#cccccc]'
                  }`}
                  title="Use Regular Expression (Alt+R)"
                >
                  .*
                </button>
              </div>
            </div>

            {/* Results Count */}
            <div className="text-[11px] text-[#8c8c8c] font-sans shrink-0 min-w-[65px] text-center select-none">
              {searchQuery.trim() === ''
                ? ''
                : totalMatches === 0
                ? 'No Results'
                : `${currentMatchIdx + 1} of ${totalMatches}`}
            </div>

            {/* Up / Down Navigation Buttons */}
            <button
              type="button"
              onClick={handlePrevMatch}
              disabled={totalMatches === 0}
              className="p-1 rounded hover:bg-white/[0.08] disabled:opacity-30 text-[#8c8c8c] hover:text-white transition cursor-pointer"
              title="Previous Match (Shift+Enter)"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleNextMatch}
              disabled={totalMatches === 0}
              className="p-1 rounded hover:bg-white/[0.08] disabled:opacity-30 text-[#8c8c8c] hover:text-white transition cursor-pointer"
              title="Next Match (Enter)"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen(false);
                setSearchQuery('');
              }}
              className="p-1 rounded hover:bg-white/[0.08] text-[#8c8c8c] hover:text-white transition cursor-pointer"
              title="Close (Escape)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 3. Main Diff View Body */}
      {!normalizedOriginal && !normalizedCurrent ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#666666]">
          <FileDiff className="w-10 h-10 stroke-[1.2] text-[#444444] mb-2" />
          <p className="text-xs text-[#888888]">No differences found or file is empty.</p>
        </div>
      ) : (
        <div ref={containerRef} className="flex-1 overflow-auto bg-[#101010]">
          {effectiveIsSplit ? (
            /* Split Mode (Side-by-side grid, Matching Image 2) */
            <div className="grid grid-cols-2 min-w-full">
              {splitRenderNodes}
            </div>
          ) : (
            /* Stacked / Unified Mode (Two line number columns, Matching Image 1) */
            <div className="min-w-full divide-y-0">
              {unifiedRenderNodes}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
