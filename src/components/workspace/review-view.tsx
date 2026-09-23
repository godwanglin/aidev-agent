'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  MoreVertical,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  EyeOff,
  Minus,
  Plus,
  Check,
  X,
  FileDiff,
  Columns,
  AlignJustify,
} from 'lucide-react';
import type { ChangedFileItem } from '@/components/sidebar/changed-files-section';
import { DiffViewer, MatchItem } from './diff-viewer';
import { AestheticFileIcon } from '@/components/common/aesthetic-file-icon';
import { BottomSheet } from '@/components/ui/bottom-sheet';

interface ReviewViewProps {
  changedFiles: ChangedFileItem[];
  currentTurnPrompt?: string;
  onRevertFile?: (snapshotId: string, filePath: string) => void;
  onSendMessage?: (content: string) => void;
}

export const ReviewView: React.FC<ReviewViewProps> = ({
  changedFiles = [],
  currentTurnPrompt = 'Current Turn Changes',
  onRevertFile,
  onSendMessage,
}) => {
  const [showForTurn, setShowForTurn] = useState(true);
  const [diffMode, setDiffMode] = useState<'split' | 'stacked'>('split');
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({
    [changedFiles[0]?.filePath || 'globals.css']: true,
  });

  // 3-dots Menu State & Whitespace Toggle
  const [showMenu, setShowMenu] = useState(false);
  const [hideWhitespace, setHideWhitespace] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Search State (Matching Image 1: Find Aa ab .* No Results ^ v x)
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [matchWholeWord, setMatchWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);
  const [fileMatches, setFileMatches] = useState<Record<string, MatchItem[]>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);

  const toggleExpand = (path: string) => {
    setExpandedFiles((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  // Close 3-dots menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  // Global keyboard shortcut Ctrl+F / Cmd+F to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
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
  }, [isSearchOpen]);

  // Collect matches from child DiffViewers
  const handleMatchesComputed = useCallback((filePath: string, matches: MatchItem[]) => {
    setFileMatches((prev) => {
      const existing = prev[filePath];
      if (
        existing &&
        existing.length === matches.length &&
        existing[0]?.matchId === matches[0]?.matchId &&
        existing[existing.length - 1]?.matchId === matches[matches.length - 1]?.matchId
      ) {
        return prev;
      }
      return { ...prev, [filePath]: matches };
    });
  }, []);

  // Flattened list of all matches across all changed files in review
  const allGlobalMatches = useMemo(() => {
    if (!isSearchOpen || !searchQuery.trim()) return [];
    const list: { filePath: string; matchId: string; lineId: string }[] = [];
    for (const file of changedFiles) {
      const mList = fileMatches[file.filePath] || [];
      for (const m of mList) {
        list.push({ filePath: file.filePath, ...m });
      }
    }
    return list;
  }, [changedFiles, fileMatches, isSearchOpen, searchQuery]);

  const totalMatches = allGlobalMatches.length;

  // Reset active match index on query or options change
  useEffect(() => {
    setCurrentMatchIdx(0);
  }, [searchQuery, matchCase, matchWholeWord, useRegex]);

  // Jump to active match and auto-expand card if collapsed
  const jumpToMatch = (match: { filePath: string; matchId: string; lineId: string }) => {
    setExpandedFiles((prev) => ({
      ...prev,
      [match.filePath]: true,
    }));
    setTimeout(() => {
      const el = document.getElementById(match.matchId) || document.getElementById(match.lineId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);
  };

  const handleNextMatch = () => {
    if (totalMatches === 0) return;
    const nextIdx = (currentMatchIdx + 1) % totalMatches;
    setCurrentMatchIdx(nextIdx);
    jumpToMatch(allGlobalMatches[nextIdx]);
  };

  const handlePrevMatch = () => {
    if (totalMatches === 0) return;
    const prevIdx = (currentMatchIdx - 1 + totalMatches) % totalMatches;
    setCurrentMatchIdx(prevIdx);
    jumpToMatch(allGlobalMatches[prevIdx]);
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

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full bg-[#101010] text-xs font-sans select-none overflow-hidden">
      {/* 1. Review Subheader Bar (matching media_1789831324105.png) */}
      <div className="h-9 border-b border-[#191919] bg-[#151515] px-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0 pr-2">
          <span className="font-semibold text-[13px] text-white font-sans">Review</span>

          {/* For Turn Pill with clear button 'x' */}
          {showForTurn && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#1f1f1f] border border-[#2b2b2b] text-[11px] text-[#cccccc] font-sans max-w-[280px]">
              <span className="text-[#8c8c8c] shrink-0 font-medium">For Turn</span>
              <span className="truncate text-[#cccccc]">{currentTurnPrompt}</span>
              <button
                type="button"
                onClick={() => setShowForTurn(false)}
                className="hover:text-white transition p-0.5 text-[#8c8c8c] cursor-pointer"
                title="Clear filter"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right subheader icons: 3-Dots Menu, Search, & Split/Stacked Mode Switcher */}
        <div className="flex items-center gap-1 text-[#6e6e6e] shrink-0">
          {/* 3-Dots Menu Button (Review Mode: Hide Whitespace Changes, Collapse / Expand All) */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setShowMenu((prev) => !prev)}
              className="p-1 hover:text-[#cccccc] hover:bg-white/[0.08] rounded transition cursor-pointer"
              title="More options"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            <BottomSheet
              isOpen={showMenu}
              onClose={() => setShowMenu(false)}
              title="Review Options"
              zIndex={1000}
              className="w-full sm:w-60 bg-[#181818] border-t sm:border border-[#282828] sm:top-full sm:right-0 sm:mt-1 p-2 sm:p-1 font-sans text-sm sm:text-xs"
            >
              <div className="p-1 space-y-0.5">
                {/* Item 1: Hide Whitespace Changes */}
                <button
                  type="button"
                  onClick={() => {
                    setHideWhitespace((prev) => !prev);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center justify-between px-3 sm:px-2.5 py-2.5 sm:py-1.5 rounded-lg hover:bg-white/[0.08] text-[#cccccc] hover:text-white transition cursor-pointer text-left"
                >
                  <div className="flex items-center gap-2.5 sm:gap-2">
                    {hideWhitespace ? (
                      <EyeOff className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#58a6ff]" />
                    ) : (
                      <Eye className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#8c8c8c]" />
                    )}
                    <span>{hideWhitespace ? 'Show Whitespace Changes' : 'Hide Whitespace Changes'}</span>
                  </div>
                  {hideWhitespace && <Check className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#58a6ff]" />}
                </button>

                {/* Item 2: Collapse All / Expand All (state-aware icon + text) */}
                {(() => {
                  const hasAnyExpanded = changedFiles.some(
                    (f) => expandedFiles[f.filePath] !== false
                  );
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        const nextState: Record<string, boolean> = {};
                        changedFiles.forEach((f) => {
                          nextState[f.filePath] = !hasAnyExpanded;
                        });
                        setExpandedFiles(nextState);
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center justify-between px-3 sm:px-2.5 py-2.5 sm:py-1.5 rounded-lg hover:bg-white/[0.08] text-[#cccccc] hover:text-white transition cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2.5 sm:gap-2">
                        {hasAnyExpanded ? (
                          <ChevronsDownUp className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#8c8c8c]" />
                        ) : (
                          <ChevronsUpDown className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#8c8c8c]" />
                        )}
                        <span>{hasAnyExpanded ? 'Collapse All' : 'Expand All'}</span>
                      </div>
                      <span className="text-[#6e6e6e]">
                        {hasAnyExpanded ? (
                          <Minus className="w-3.5 h-3.5 sm:w-3 sm:h-3 text-[#6e6e6e]" />
                        ) : (
                          <Plus className="w-3.5 h-3.5 sm:w-3 sm:h-3 text-[#6e6e6e]" />
                        )}
                      </span>
                    </button>
                  );
                })()}
              </div>
            </BottomSheet>
          </div>

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
              isSearchOpen ? 'bg-white/[0.1] text-white' : 'text-[#6e6e6e] hover:text-[#cccccc]'
            }`}
            title="Search in diffs (Ctrl+F)"
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          {/* Split / Stacked Diff Toggle */}
          <div className="flex items-center rounded-lg bg-[#1a1a1a] border border-[#2b2b2b] p-0.5 ml-1">
            <button
              type="button"
              onClick={() => setDiffMode('split')}
              className={`p-1 rounded transition cursor-pointer ${
                diffMode === 'split' ? 'bg-[#282828] text-white shadow-sm' : 'text-[#6e6e6e] hover:text-[#cccccc]'
              }`}
              title="Split diff (side-by-side)"
            >
              <Columns className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => setDiffMode('stacked')}
              className={`p-1 rounded transition cursor-pointer ${
                diffMode === 'stacked' ? 'bg-[#282828] text-white shadow-sm' : 'text-[#6e6e6e] hover:text-[#cccccc]'
              }`}
              title="Stacked diff (unified inline)"
            >
              <AlignJustify className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Interactive Search Bar in Review Mode (Matching Image 1: 'Find  Aa  ab  .*  No Results  ^  v  x') */}
      {isSearchOpen && (
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
          </div>

          {/* Close Search Button */}
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
      )}

      {/* 3. Review Diffs Body Area */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 pb-20 space-y-3">
        {changedFiles.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-[#6e6e6e]">
            <FileDiff className="w-8 h-8 opacity-25 mb-2" strokeWidth={1.5} />
            <h4 className="text-xs font-medium text-[#cccccc] mb-1 font-sans">
              No changed files in this review
            </h4>
            <p className="text-[11px] text-[#6e6e6e] max-w-xs font-sans">
              Modified files will appear here with interactive line-by-line diffs and inline review commenting.
            </p>
          </div>
        ) : (
          changedFiles.map((file) => {
            const isExpanded = expandedFiles[file.filePath] ?? true;
            const segments = file.filePath.replace(/\\/g, '/').split('/');
            const fileName = segments.pop() || file.filePath;
            const dirPath = segments.join('/');

            return (
              <div
                key={file.filePath}
                className="rounded-xl bg-[#141414] border border-[#222222] overflow-hidden shadow-sm"
              >
                {/* File Diff Card Header (matching screenshot: "{}" globals.css coding-agent/src/app +56 -1 v) */}
                <div
                  onClick={() => toggleExpand(file.filePath)}
                  className="px-3 py-2 bg-[#181818] border-b border-[#222222] flex items-center justify-between cursor-pointer hover:bg-[#1c1c1c] transition"
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <AestheticFileIcon filePath={file.filePath} className="w-4 h-4 shrink-0" />
                    <span className="font-semibold text-white text-[12px] truncate">{fileName}</span>
                    <span className="text-[#6e6e6e] text-[11px] truncate font-sans">{dirPath}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1 font-mono text-[11.5px]">
                      {file.additions > 0 && (
                        <span className="text-[#7ee787]">+{file.additions}</span>
                      )}
                      {file.deletions > 0 && (
                        <span className="text-[#ff7b72]">-{file.deletions}</span>
                      )}
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-[#6e6e6e]" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[#6e6e6e]" />
                    )}
                  </div>
                </div>

                {/* Diff Viewer Body */}
                {isExpanded && (
                  <div className="bg-[#101010] p-0 border-t border-[#1e1e1e]">
                    <DiffViewer
                      mode={diffMode}
                      filePath={file.filePath}
                      originalContent={file.originalContent || ''}
                      currentContent={file.currentContent || ''}
                      snapshotId={file.latestSnapshotId}
                      onRevert={
                        onRevertFile ? (sid) => onRevertFile(sid, file.filePath) : undefined
                      }
                      showBreadcrumbs={false}
                      hideWhitespace={hideWhitespace}
                      externalSearchQuery={isSearchOpen ? searchQuery : undefined}
                      externalSearchActive={isSearchOpen && searchQuery.trim().length > 0}
                      externalMatchCase={matchCase}
                      externalMatchWholeWord={matchWholeWord}
                      externalUseRegex={useRegex}
                      activeMatchId={allGlobalMatches[currentMatchIdx]?.matchId}
                      onMatchesComputed={handleMatchesComputed}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
