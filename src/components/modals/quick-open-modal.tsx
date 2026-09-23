'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  BookOpen,
  Image as ImageIcon,
  X,
  Code,
  Loader2,
  FileCode2,
  FileText,
} from 'lucide-react';
import { AestheticFileIcon } from '@/components/common/aesthetic-file-icon';
import type { OverviewArtifactItem, OverviewUploadItem } from '../workspace/overview-view';
import type { GrepMatch } from '@/lib/tools/grep';

export interface QuickOpenItem {
  id: string;
  title: string;
  path: string;
  type: 'artifact' | 'image' | 'changed' | 'file';
  desc: string;
  size?: number;
}

interface QuickOpenModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceFiles: string[];
  changedFiles?: Array<{ filePath: string }>;
  artifacts?: OverviewArtifactItem[];
  uploads?: OverviewUploadItem[];
  onSelectFile: (filePath: string, lineRange?: { startLine?: number; endLine?: number }) => void;
  workdir?: string;
  initialMode?: 'files' | 'grep';
}

export const QuickOpenModal: React.FC<QuickOpenModalProps> = ({
  isOpen,
  onClose,
  workspaceFiles = [],
  changedFiles = [],
  artifacts = [],
  uploads = [],
  onSelectFile,
  workdir = '',
  initialMode = 'files',
}) => {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'files' | 'grep'>(initialMode);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Grep mode states
  const [grepQuery, setGrepQuery] = useState('');
  const [grepResults, setGrepResults] = useState<GrepMatch[]>([]);
  const [isGrepping, setIsGrepping] = useState(false);
  const [grepCaseSensitive, setGrepCaseSensitive] = useState(false);
  const [grepIsRegex, setGrepIsRegex] = useState(false);
  const [grepSummary, setGrepSummary] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const grepInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialMode);
      setQuery('');
      setGrepQuery('');
      setGrepResults([]);
      setGrepSummary(null);
      setSelectedIndex(0);
      setTimeout(() => {
        if (initialMode === 'grep') {
          grepInputRef.current?.focus();
        } else {
          inputRef.current?.focus();
        }
      }, 60);
    }
  }, [isOpen, initialMode]);

  // Build combined real items list (strictly isolated to current workspace and session)
  const allItems = useMemo<QuickOpenItem[]>(() => {
    const list: QuickOpenItem[] = [];
    const seenPaths = new Set<string>();

    // 1. Artifacts from current session / workspace
    if (artifacts && artifacts.length > 0) {
      for (const a of artifacts) {
        if (!seenPaths.has(a.path)) {
          seenPaths.add(a.path);
          list.push({
            id: `artifact_${a.id || a.path}`,
            title: a.title || a.path,
            path: a.path,
            type: 'artifact',
            desc: a.path.endsWith('.md') ? 'Artifact document' : a.path,
            size: a.size,
          });
        }
      }
    }

    // 2. Uploads & Media from current session
    if (uploads && uploads.length > 0) {
      for (const u of uploads) {
        const itemKey = u.url || u.filename;
        if (!seenPaths.has(itemKey)) {
          seenPaths.add(itemKey);
          const sizeStr = u.size ? `${(u.size / 1024).toFixed(1)} KB` : 'Image asset';
          list.push({
            id: `upload_${u.id || u.filename}`,
            title: u.title || u.filename,
            path: u.url,
            type: 'image',
            desc: `${u.filename} • ${sizeStr}`,
            size: u.size,
          });
        }
      }
    }

    // 3. Changed / Modified Files in current session
    if (changedFiles && changedFiles.length > 0) {
      for (const c of changedFiles) {
        if (!seenPaths.has(c.filePath)) {
          seenPaths.add(c.filePath);
          const filename = c.filePath.split(/[\\/]/).pop() || c.filePath;
          list.push({
            id: `changed_${c.filePath}`,
            title: filename,
            path: c.filePath,
            type: 'changed',
            desc: c.filePath,
          });
        }
      }
    }

    // 4. Real Workspace Files (from active project directory)
    if (workspaceFiles && workspaceFiles.length > 0) {
      for (const f of workspaceFiles) {
        if (!seenPaths.has(f)) {
          seenPaths.add(f);
          const filename = f.split(/[\\/]/).pop() || f;
          const isImg = /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(f);
          list.push({
            id: `ws_${f}`,
            title: filename,
            path: f,
            type: isImg ? 'image' : 'file',
            desc: f,
          });
        }
      }
    }

    return list;
  }, [artifacts, uploads, changedFiles, workspaceFiles]);

  // Filtered items based on search query
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return allItems.slice(0, 50);
    }
    return allItems
      .filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.desc.toLowerCase().includes(q) ||
          item.path.toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [allItems, query]);

  // Grep API search effect with debounce
  useEffect(() => {
    if (activeTab !== 'grep' || !grepQuery.trim() || !workdir) {
      if (!grepQuery.trim()) {
        setGrepResults([]);
        setGrepSummary(null);
      }
      return;
    }

    setIsGrepping(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/grep', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: grepQuery,
            workdir,
            isRegex: grepIsRegex,
            caseSensitive: grepCaseSensitive,
            maxResults: 60,
          }),
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.matches)) {
          setGrepResults(data.matches);
          setGrepSummary(data.summary || null);
          setSelectedIndex(0);
        } else {
          setGrepResults([]);
          setGrepSummary(data.error ? `Error: ${data.error}` : null);
        }
      } catch (err: any) {
        setGrepResults([]);
        setGrepSummary(`Failed to grep: ${err.message}`);
      } finally {
        setIsGrepping(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [grepQuery, grepIsRegex, grepCaseSensitive, workdir, activeTab]);

  // Keyboard navigation for Files list
  const handleKeyDownFiles = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredItems[selectedIndex];
      if (selected) {
        onSelectFile(selected.path);
        onClose();
      }
    }
  };

  // Keyboard navigation for Grep list
  const handleKeyDownGrep = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, grepResults.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + grepResults.length) % Math.max(1, grepResults.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = grepResults[selectedIndex];
      if (selected) {
        onSelectFile(selected.file || selected.Filename, {
          startLine: selected.lineNumber || selected.LineNumber,
          endLine: selected.lineNumber || selected.LineNumber,
        });
        onClose();
      }
    }
  };

  // Auto scroll into view for active keyboard selection
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const getFileBadge = (path: string, type: string) => {
    if (type === 'artifact') {
      return (
        <span className="px-1.5 py-0.5 rounded bg-[#58a6ff]/15 text-[#58a6ff] text-[10px] font-sans font-medium border border-[#58a6ff]/25">
          Artifact
        </span>
      );
    }
    if (type === 'image') {
      return (
        <span className="px-1.5 py-0.5 rounded bg-[#a855f7]/15 text-[#c084fc] text-[10px] font-sans font-medium border border-[#a855f7]/25">
          Image
        </span>
      );
    }
    if (type === 'changed') {
      return (
        <span className="px-1.5 py-0.5 rounded bg-[#7ee787]/15 text-[#7ee787] text-[10px] font-sans font-medium border border-[#7ee787]/25">
          Modified
        </span>
      );
    }
    const ext = path.split('.').pop()?.toUpperCase() || 'FILE';
    return (
      <span className="px-1.5 py-0.5 rounded bg-[#252525] text-[#8c8c8c] text-[10px] font-mono">
        {ext}
      </span>
    );
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[999999] flex items-start justify-center pt-8 sm:pt-12 bg-black/60 backdrop-blur-[2px] animate-fade-in font-sans"
      onClick={onClose}
    >
      <div
        className="w-[660px] max-w-[94vw] rounded-2xl bg-[#18181a] border border-[#2e2e32] shadow-[0_20px_60px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col max-h-[540px] animate-dropdown"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Mode Switcher (Files vs Grep Code) */}
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 bg-[#141416] border-b border-[#242428]">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setActiveTab('files');
                setSelectedIndex(0);
                setTimeout(() => inputRef.current?.focus(), 40);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'files'
                  ? 'bg-[#26262c] text-white shadow-sm'
                  : 'text-[#88888e] hover:text-[#cccccc] hover:bg-[#1e1e22]'
              }`}
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span>Files</span>
              <span className="text-[10px] font-mono text-[#66666e] ml-1">Ctrl+P</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('grep');
                setSelectedIndex(0);
                setTimeout(() => grepInputRef.current?.focus(), 40);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer ${
                activeTab === 'grep'
                  ? 'bg-[#26262c] text-[#e8975f] shadow-sm'
                  : 'text-[#88888e] hover:text-[#cccccc] hover:bg-[#1e1e22]'
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>Grep Code</span>
              <span className="text-[10px] font-mono text-[#66666e] ml-1">Ctrl+Shift+F</span>
            </button>
          </div>

          <span className="text-[11px] font-sans text-[#777777] px-1.5 py-0.5 rounded bg-[#202024] border border-[#2a2a30]">
            ESC to close
          </span>
        </div>

        {/* 1. Files Search Mode Input */}
        {activeTab === 'files' && (
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#26262b] bg-[#141416]">
            <Search className="w-4 h-4 text-[#8c8c8c] shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDownFiles}
              placeholder="Search files, artifacts, images in active workspace..."
              className="flex-1 bg-transparent text-[13.5px] text-[#cccccc] placeholder-[#666666] focus:outline-none font-sans"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="p-0.5 rounded text-[#6e6e6e] hover:text-[#cccccc] transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* 2. Grep Code Search Mode Input & Options */}
        {activeTab === 'grep' && (
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#26262b] bg-[#141416]">
            <Code className="w-4 h-4 text-[#e8975f] shrink-0" />
            <input
              ref={grepInputRef}
              type="text"
              value={grepQuery}
              onChange={(e) => {
                setGrepQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDownGrep}
              placeholder="Grep code across workspace (text or regex pattern)..."
              className="flex-1 bg-transparent text-[13.5px] text-[#cccccc] placeholder-[#666666] focus:outline-none font-sans"
            />

            {/* Toggle Regex Button */}
            <button
              type="button"
              onClick={() => setGrepIsRegex(!grepIsRegex)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium transition cursor-pointer border ${
                grepIsRegex
                  ? 'bg-[#e8975f]/20 text-[#e8975f] border-[#e8975f]/40'
                  : 'bg-[#202024] text-[#777777] border-[#2a2a30] hover:text-[#cccccc]'
              }`}
              title="Use Regular Expression (.*)"
            >
              .*
            </button>

            {/* Toggle Case Sensitive Button */}
            <button
              type="button"
              onClick={() => setGrepCaseSensitive(!grepCaseSensitive)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium transition cursor-pointer border ${
                grepCaseSensitive
                  ? 'bg-[#58a6ff]/20 text-[#58a6ff] border-[#58a6ff]/40'
                  : 'bg-[#202024] text-[#777777] border-[#2a2a30] hover:text-[#cccccc]'
              }`}
              title="Match Case (Aa)"
            >
              Aa
            </button>

            {isGrepping && <Loader2 className="w-3.5 h-3.5 text-[#e8975f] animate-spin shrink-0" />}

            {grepQuery && (
              <button
                type="button"
                onClick={() => setGrepQuery('')}
                className="p-0.5 rounded text-[#6e6e6e] hover:text-[#cccccc] transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Results List: Files Mode */}
        {activeTab === 'files' && (
          <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {filteredItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#6e6e6e] font-sans">
                No files or artifacts matching &quot;{query}&quot;
              </div>
            ) : (
              filteredItems.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      onSelectFile(item.path);
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors duration-100 ${
                      isSelected
                        ? 'bg-[#222226] text-white shadow-sm'
                        : 'text-[#a0a0a0] hover:bg-[#1e1e22] hover:text-[#cccccc]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      {item.type === 'artifact' ? (
                        <BookOpen className="w-4 h-4 text-[#58a6ff] shrink-0" />
                      ) : item.type === 'image' ? (
                        <ImageIcon className="w-4 h-4 text-[#c084fc] shrink-0" />
                      ) : (
                        <AestheticFileIcon filePath={item.path} className="w-4 h-4 shrink-0" />
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium text-[12.5px] truncate text-[#cccccc] font-sans">
                          {item.title}
                        </span>
                        <span className="text-[10.5px] text-[#6e6e6e] font-sans truncate">
                          {item.desc}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0">{getFileBadge(item.path, item.type)}</div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Results List: Grep Code Mode */}
        {activeTab === 'grep' && (
          <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1">
            {!grepQuery.trim() ? (
              <div className="py-10 text-center text-xs text-[#777777] font-sans space-y-1">
                <Code className="w-6 h-6 text-[#444444] mx-auto mb-1.5" />
                <p>Type keywords, function names, or regex to grep across all workspace files.</p>
                <p className="text-[11px] text-[#555555]">Examples: `export const`, `handleToggle`, `interface`</p>
              </div>
            ) : grepResults.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#6e6e6e] font-sans">
                {isGrepping ? 'Searching codebase...' : `No grep matches found for "${grepQuery}"`}
              </div>
            ) : (
              grepResults.map((match, idx) => {
                const isSelected = idx === selectedIndex;
                const file = match.file || match.Filename;
                const lineNum = match.lineNumber || match.LineNumber;
                const snippet = match.lineContent || match.LineContent;

                return (
                  <div
                    key={`${file}_${lineNum}_${idx}`}
                    onClick={() => {
                      onSelectFile(file, { startLine: lineNum, endLine: lineNum });
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`p-2 rounded-xl text-xs cursor-pointer transition-colors duration-100 border ${
                      isSelected
                        ? 'bg-[#222226] border-[#36363e] text-white shadow-sm'
                        : 'bg-[#161618] border-[#222226] text-[#a0a0a0] hover:bg-[#1a1a1e] hover:border-[#2e2e34]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <AestheticFileIcon filePath={file} className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-mono text-[11.5px] text-[#58a6ff] truncate">
                          {file}
                        </span>
                        <span className="font-mono text-[11px] text-[#e8975f] font-semibold shrink-0">
                          #L{lineNum}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#66666e] shrink-0">Click to jump</span>
                    </div>

                    <div className="px-2 py-1 rounded-md bg-[#101012] border border-[#1d1d20] font-mono text-[11.5px] text-[#cccccc] truncate">
                      {snippet}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Footer info bar */}
        <div className="px-4 py-2 border-t border-[#26262b] bg-[#131315] text-[11px] text-[#888888] flex items-center justify-between font-sans">
          <span>
            {activeTab === 'files'
              ? query
                ? `${filteredItems.length} matching "${query}"`
                : `${allItems.length} files and artifacts available`
              : grepSummary || (isGrepping ? 'Searching...' : `${grepResults.length} matches found`)}
          </span>
          <span className="text-[#666666]">Press Enter to open</span>
        </div>
      </div>
    </div>,
    document.body
  );
};
