'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Folder,
  Search,
  RefreshCw,
  X,
} from 'lucide-react';
import type { FileExplorerSidebarProps } from './file-explorer-types';
import { buildFileTree, filterFileTree } from './file-tree-builder';
import { FileTreeItem } from './file-tree-item';

const MIN_WIDTH = 160;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 230;

export const FileExplorerSidebar: React.FC<FileExplorerSidebarProps> = ({
  workdir,
  projectName,
  files,
  activeFilePath,
  changedFiles = [],
  isOpen,
  width,
  onToggleOpen,
  onWidthChange,
  onOpenFile,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);

  // Set of modified file paths for fast O(1) lookup
  const changedPathsSet = useMemo(() => {
    return new Set(
      changedFiles.map((c) => (c.filePath || c.path || '').replace(/\\/g, '/').replace(/^\/+/, ''))
    );
  }, [changedFiles]);

  // Memoized tree build from flat files array
  const fullTree = useMemo(() => {
    return buildFileTree(files, changedPathsSet);
  }, [files, changedPathsSet]);

  // Expand parent folder of activeFilePath on initial load
  useEffect(() => {
    if (!activeFilePath) return;
    const clean = activeFilePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const parts = clean.split('/');
    if (parts.length > 1) {
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        let acc = '';
        for (let i = 0; i < parts.length - 1; i++) {
          acc = acc ? `${acc}/${parts[i]}` : parts[i];
          next.add(acc);
        }
        return next;
      });
    }
  }, [activeFilePath]);

  // Filtered tree & folders to auto-expand during search
  const { filteredNodes, matchingFolderPaths } = useMemo(() => {
    return filterFileTree(fullTree, searchQuery);
  }, [fullTree, searchQuery]);

  // Effective expanded folders (merges user expanded + search matching)
  const effectiveExpanded = useMemo(() => {
    if (!searchQuery.trim()) return expandedFolders;
    const merged = new Set(expandedFolders);
    for (const p of matchingFolderPaths) {
      merged.add(p);
    }
    return merged;
  }, [expandedFolders, matchingFolderPaths, searchQuery]);

  const toggleFolder = useCallback((folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  }, []);


  const handleRefresh = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  // Drag resizer handler
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = moveEvent.clientX - startXRef.current;
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidthRef.current + delta));
      onWidthChange(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Focus search input when toggled open
  useEffect(() => {
    if (showSearch) {
      searchInputRef.current?.focus();
    } else {
      setSearchQuery('');
    }
  }, [showSearch]);

  return (
    <aside
      style={{ width: isOpen ? `${width}px` : '0px' }}
      className={`relative flex flex-col h-full bg-[#111215] select-none shrink-0 z-20 group/sidebar overflow-hidden ${
        isDragging ? '' : 'transition-[width] duration-200 ease-in-out'
      } ${isOpen ? 'border-r border-[#1e2024]' : 'border-r-0 pointer-events-none'}`}
    >
      <div style={{ width: `${width}px` }} className="flex flex-col h-full shrink-0">
        {/* 1. Header Toolbar */}
        <div className="h-8 px-2.5 flex items-center justify-between border-b border-[#1c1d22] bg-[#141519] text-[#cccccc]">
          <div className="flex items-center gap-1.5 min-w-0">
            <Folder className="w-3.5 h-3.5 text-sky-400 shrink-0" strokeWidth={1.75} />
            <span className="text-[11px] font-semibold tracking-wider uppercase text-zinc-300 truncate">
              {projectName || 'Files'}
            </span>
          </div>

          {/* Toolbar Buttons */}
          <div className="flex items-center gap-0.5 shrink-0 text-zinc-400">
            {/* Search Toggle */}
            <button
              type="button"
              onClick={() => setShowSearch((prev) => !prev)}
              className={`w-6 h-6 rounded flex items-center justify-center transition hover:text-white hover:bg-zinc-800 active:scale-95 ${
                showSearch ? 'text-sky-400 bg-zinc-800/80' : ''
              }`}
              title="Filter files"
            >
              <Search className="w-3 h-3" />
            </button>

            {/* Refresh File List */}
            <button
              type="button"
              onClick={handleRefresh}
              className={`w-6 h-6 rounded flex items-center justify-center transition hover:text-white hover:bg-zinc-800 active:scale-95 ${
                isRefreshing ? 'animate-spin text-sky-400' : ''
              }`}
              title="Refresh files"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* 2. Optional Quick Search Input */}
        {showSearch && (
          <div className="p-1.5 border-b border-[#1c1d22] bg-[#121316] animate-in fade-in-50 slide-in-from-top-1 duration-150">
            <div className="relative flex items-center">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setShowSearch(false);
                  }
                }}
                placeholder="Filter by name..."
                className="w-full bg-[#18191e] border border-[#2b2d35] focus:border-sky-500/60 rounded px-2 py-1 text-[11.5px] text-zinc-200 placeholder-zinc-500 outline-none pr-6 font-mono"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1.5 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* 3. Scrollable Tree Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
          {filteredNodes.length > 0 ? (
            filteredNodes.map((node) => (
              <FileTreeItem
                key={node.id}
                node={node}
                level={0}
                expandedFolders={effectiveExpanded}
                activeFilePath={activeFilePath}
                searchQuery={searchQuery}
                onToggleFolder={toggleFolder}
                onOpenFile={onOpenFile}
              />
            ))
          ) : (
            <div className="px-4 py-8 text-center text-xs text-zinc-500">
              {searchQuery ? 'No matching files found' : 'No files in workspace'}
            </div>
          )}
        </div>
      </div>

      {/* 4. Resizer Handle (Right Edge) */}
      {isOpen && (
        <div
          onMouseDown={handleMouseDown}
          onDoubleClick={() => onWidthChange(DEFAULT_WIDTH)}
          className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-sky-500/40 active:bg-sky-500 transition-colors z-30"
          title="Drag to resize, double click to reset"
        />
      )}
    </aside>
  );
};
