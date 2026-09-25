'use client';

import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Copy, Check } from 'lucide-react';
import type { FileTreeItemProps } from './file-explorer-types';
import { AestheticFileIcon } from '@/components/common/aesthetic-file-icon';
import { AestheticFolderIcon } from '@/components/common/aesthetic-folder-icon';

export const FileTreeItem: React.FC<FileTreeItemProps> = ({
  node,
  level,
  expandedFolders,
  activeFilePath,
  searchQuery,
  onToggleFolder,
  onOpenFile,
}) => {
  const [copied, setCopied] = useState(false);
  const isDirectory = node.type === 'directory';
  const isExpanded = isDirectory && expandedFolders.has(node.path);

  // Normalize paths for active selection comparison
  const normalizedActive = (activeFilePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const normalizedPath = node.path.replace(/\\/g, '/').replace(/^\/+/, '');
  const isActive = !isDirectory && normalizedActive === normalizedPath;

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(node.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDirectory) {
      onToggleFolder(node.path);
    } else {
      onOpenFile(node.path);
    }
  };

  // Highlight search text matches
  const renderHighlightedName = (name: string, query?: string) => {
    if (!query) return name;
    const lowerName = name.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const matchIndex = lowerName.indexOf(lowerQuery);

    if (matchIndex === -1) return name;

    const before = name.slice(0, matchIndex);
    const match = name.slice(matchIndex, matchIndex + query.length);
    const after = name.slice(matchIndex + query.length);

    return (
      <>
        {before}
        <span class-name="bg-amber-400/25 text-amber-200 font-semibold px-0.5 rounded-sm">
          {match}
        </span>
        {after}
      </>
    );
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick(e as any);
          }
        }}
        style={{ paddingLeft: `${Math.max(6, level * 14 + 6)}px` }}
        className={`group/row flex items-center h-[26px] pr-2 text-[12.5px] cursor-pointer select-none transition-colors border-l-2 outline-none ${
          isActive
            ? 'bg-[#182234] text-sky-300 font-medium border-sky-500'
            : 'text-[#cccccc] hover:bg-[#1a1b20] hover:text-white border-transparent'
        }`}
        title={node.path}
      >
        {/* Chevron Icon for Folders with smooth 90deg rotation animation */}
        <div className="w-4 h-4 shrink-0 flex items-center justify-center mr-0.5 text-zinc-500 group-hover/row:text-zinc-300">
          {isDirectory ? (
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform duration-200 ease-out transform ${
                isExpanded ? 'rotate-90 text-zinc-200' : 'rotate-0 text-zinc-500'
              }`}
            />
          ) : (
            <span className="w-3.5" />
          )}
        </div>

        {/* Folder or File Icon */}
        <div className="mr-1.5 shrink-0 flex items-center justify-center transition-transform duration-150 group-hover/row:scale-105">
          {isDirectory ? (
            <AestheticFolderIcon folderName={node.name} isOpen={isExpanded} className="w-4 h-4" />
          ) : (
            <AestheticFileIcon filePath={node.path} className="w-4 h-4" />
          )}
        </div>

        {/* Node Name */}
        <span className="truncate flex-1 font-sans text-[12px] tracking-tight">
          {renderHighlightedName(node.name, searchQuery)}
        </span>

        {/* Indicators & Hover Actions */}
        <div className="flex items-center gap-1 shrink-0 ml-1">
          {/* Modified badge indicator */}
          {node.isModified && (
            <span
              className="text-[10px] font-mono text-amber-400 font-bold px-1 rounded bg-amber-500/10"
              title="Modified in working directory"
            >
              M
            </span>
          )}

          {/* Quick Copy Relative Path Button */}
          <button
            type="button"
            onClick={handleCopyPath}
            className="w-5 h-5 rounded hover:bg-zinc-700/60 text-zinc-500 hover:text-zinc-200 opacity-0 group-hover/row:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
            title="Copy relative path"
          >
            {copied ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>

      {/* Recursive Children (Animated fade-in when expanded) */}
      {isDirectory && isExpanded && node.children && (
        <div className="animate-in fade-in-50 duration-150">
          {node.children.map((child) => (
            <FileTreeItem
              key={child.id}
              node={child}
              level={level + 1}
              expandedFolders={expandedFolders}
              activeFilePath={activeFilePath}
              searchQuery={searchQuery}
              onToggleFolder={onToggleFolder}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      )}
    </div>
  );
};
