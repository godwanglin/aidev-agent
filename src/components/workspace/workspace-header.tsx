'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  FileDiff,
  GitBranch,
  Terminal,
  Plus,
  Maximize2,
  Minimize2,
  PanelRight,
  FileCode,
  Globe,
  SquareTerminal,
  X,
  Folder,
} from 'lucide-react';
import type { WorkspaceTab } from './multi-tab-workspace';
import { AestheticFileIcon } from '@/components/common/aesthetic-file-icon';
import { BottomSheet } from '@/components/ui/bottom-sheet';

export type WorkspaceMode = 'overview' | 'review' | 'git' | 'terminal' | 'file';

interface WorkspaceHeaderProps {
  activeMode: WorkspaceMode;
  activeFileTabId: string | null;
  fileTabs: WorkspaceTab[];
  isMaximized: boolean;
  isFileExplorerOpen?: boolean;
  onToggleFileExplorer?: () => void;
  onSelectMode: (mode: WorkspaceMode) => void;
  onSelectFileTab: (tabId: string) => void;
  onCloseFileTab: (tabId: string) => void;
  onOpenFileModal: () => void;
  onNewTerminal: () => void;
  onOpenBrowser?: (url?: string) => void;
  onToggleMaximize: () => void;
  onToggleSidebar: () => void;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  activeMode,
  activeFileTabId,
  fileTabs,
  isMaximized,
  isFileExplorerOpen = false,
  onToggleFileExplorer,
  onSelectMode,
  onSelectFileTab,
  onCloseFileTab,
  onOpenFileModal,
  onNewTerminal,
  onOpenBrowser,
  onToggleMaximize,
  onToggleSidebar,
}) => {
  const [showPlusDropdown, setShowPlusDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowPlusDropdown(false);
      }
    };
    if (showPlusDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPlusDropdown]);

  // Smooth scroll active tab into view when selected
  useEffect(() => {
    if (!tabsContainerRef.current || !activeFileTabId) return;
    const activeEl = tabsContainerRef.current.querySelector(`[data-tab-id="${activeFileTabId}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [activeFileTabId]);

  // Horizontal scroll tabs with mouse wheel
  const handleTabsWheel = (e: React.WheelEvent) => {
    if (tabsContainerRef.current && e.deltaY !== 0) {
      tabsContainerRef.current.scrollLeft += e.deltaY;
    }
  };

const TabFavicon: React.FC<{ favicon?: string | null }> = ({ favicon }) => {
  const [error, setError] = useState(false);
  if (!favicon || error) {
    return <Globe className="w-3.5 h-3.5 text-[#58a6ff] shrink-0" strokeWidth={1.5} />;
  }
  return (
    <img
      src={favicon}
      alt=""
      className="w-3.5 h-3.5 object-contain shrink-0 rounded-xs"
      onError={() => setError(true)}
    />
  );
};

  const getFileBadge = (tab: WorkspaceTab) => {
    if (tab.type === 'browser') {
      return <TabFavicon favicon={tab.favicon} />;
    }
    if (tab.type === 'terminal') {
      return <SquareTerminal className="w-3.5 h-3.5 text-[#8a8a92] shrink-0" strokeWidth={1.75} />;
    }
    if (tab.type === 'diff') {
      return <FileDiff className="w-3.5 h-3.5 text-[#58a6ff] shrink-0" strokeWidth={1.5} />;
    }
    const path = tab.filePath || tab.title;
    if (
      path.startsWith('node ') ||
      path.startsWith('npm ') ||
      path.includes('server.mjs') ||
      path.startsWith('task_') ||
      path.includes('python') ||
      path.includes('vite')
    ) {
      return <Terminal className="w-3.5 h-3.5 text-[#8c8c8c] shrink-0" strokeWidth={1.5} />;
    }
    return <AestheticFileIcon filePath={path} className="w-3.5 h-3.5 shrink-0" />;
  };

  return (
    <div className="h-9 sm:h-10 border-b border-[#191919] bg-[#151515] px-1.5 sm:px-2 flex items-center justify-between shrink-0 select-none relative z-30">
      {/* 1. Pinned 3 Main Antigravity View Mode Icons (NEVER shrink) */}
      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 flex-none mr-1 sm:mr-1.5">
        {/* Explorer Toggle / File Tree Button */}
        {onToggleFileExplorer && (
          <button
            type="button"
            onClick={onToggleFileExplorer}
            className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center transition-all ${
              isFileExplorerOpen && activeMode === 'file'
                ? 'bg-[#1f1f1f] text-sky-400 border border-sky-500/30 shadow-sm'
                : 'text-[#6e6e6e] hover:text-[#cccccc] hover:bg-[#1f1f1f]/50'
            }`}
            title="File Explorer (Ctrl+Shift+E)"
          >
            <Folder className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
          </button>
        )}

        {/* Overview Mode Button */}
        <button
          type="button"
          onClick={() => onSelectMode('overview')}
          className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center transition-all ${
            activeMode === 'overview'
              ? 'bg-[#1f1f1f] text-white border border-[#2b2b2b] shadow-sm'
              : 'text-[#6e6e6e] hover:text-[#cccccc] hover:bg-[#1f1f1f]/50'
          }`}
          title="Overview"
        >
          <FileText className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
        </button>

        {/* Review Mode Button */}
        <button
          type="button"
          onClick={() => onSelectMode('review')}
          className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center transition-all ${
            activeMode === 'review'
              ? 'bg-[#1f1f1f] text-white border border-[#2b2b2b] shadow-sm'
              : 'text-[#6e6e6e] hover:text-[#cccccc] hover:bg-[#1f1f1f]/50'
          }`}
          title="Review (Diffs)"
        >
          <FileDiff className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
        </button>

        {/* Git Mode Button */}
        <button
          type="button"
          onClick={() => onSelectMode('git')}
          className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center transition-all ${
            activeMode === 'git'
              ? 'bg-[#1f1f1f] text-white border border-[#2b2b2b] shadow-sm'
              : 'text-[#6e6e6e] hover:text-[#cccccc] hover:bg-[#1f1f1f]/50'
          }`}
          title="Git & Source Control"
        >
          <GitBranch className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
        </button>

        {/* Terminal Mode Button */}
        <button
          type="button"
          onClick={() => onSelectMode('terminal')}
          className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center transition-all ${
            activeMode === 'terminal'
              ? 'bg-[#1f1f1f] text-white border border-[#2b2b2b] shadow-sm'
              : 'text-[#6e6e6e] hover:text-[#cccccc] hover:bg-[#1f1f1f]/50'
          }`}
          title="Terminal"
        >
          <Terminal className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
        </button>

        {/* Divider if file tabs exist */}
        {fileTabs.length > 0 && (
          <div className="h-4 w-[1px] bg-[#222222] mx-1 shrink-0 flex-none" />
        )}
      </div>

      {/* 2. Scrollable File / Task Tabs Container (Takes available flex space, scrolls horizontally) */}
      <div
        ref={tabsContainerRef}
        onWheel={handleTabsWheel}
        className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto scrollbar-none no-scrollbar py-0.5"
      >
        {fileTabs.map((tab) => {
          const isActive = activeMode === 'file' && activeFileTabId === tab.id;
          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              onClick={() => onSelectFileTab(tab.id)}
              className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-sans transition cursor-pointer max-w-[190px] shrink-0 select-none ${
                isActive
                  ? 'bg-[#181818] text-white font-medium border border-[#262626] shadow-sm'
                  : 'text-[#8c8c8c] hover:text-[#cccccc] hover:bg-[#181818]/60 border border-transparent'
              }`}
            >
              {getFileBadge(tab)}
              <span className="truncate text-[11.5px]">{tab.title}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseFileTab(tab.id);
                }}
                className={`p-0.5 rounded transition hover:text-[#de5555] shrink-0 ${
                  isActive ? 'opacity-80 hover:opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                title="Close tab"
              >
                <X className="w-3 h-3" strokeWidth={1.5} />
              </button>
            </div>
          );
        })}
      </div>

      {/* 3. Right Controls: '+' Dropdown, Maximize, Toggle Sidebar (NEVER shrink) */}
      <div className="flex items-center gap-0.5 sm:gap-1 text-[#8c8c8c] shrink-0 flex-none ml-1 sm:ml-2">
        {/* '+' Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setShowPlusDropdown(!showPlusDropdown)}
            className="w-7 h-7 rounded-lg hover:bg-[#202020] text-[#8c8c8c] hover:text-white flex items-center justify-center transition cursor-pointer"
            title="Add tab or open file"
          >
            <Plus className="w-4 h-4" strokeWidth={1.75} />
          </button>

          <BottomSheet
            isOpen={showPlusDropdown}
            onClose={() => setShowPlusDropdown(false)}
            title="Workspace Actions"
            zIndex={1000}
            className="w-full sm:w-48 bg-[#181818] border-t sm:border border-[#262626] sm:top-full sm:right-0 sm:mt-1 p-2 sm:p-1 font-sans text-sm sm:text-xs"
          >
            <button
              type="button"
              onClick={() => {
                setShowPlusDropdown(false);
                onOpenFileModal();
              }}
              className="w-full flex items-center justify-between px-3 sm:px-2.5 py-2.5 sm:py-2 rounded-lg text-[#cccccc] hover:bg-[#222222] hover:text-white transition cursor-pointer text-[13px] sm:text-xs"
            >
              <div className="flex items-center gap-2.5 sm:gap-2">
                <FileCode className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#8c8c8c]" />
                <span>Open file...</span>
              </div>
              <span className="text-[10px] text-[#8c8c8c] font-sans">Ctrl+P</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowPlusDropdown(false);
                onNewTerminal();
              }}
              className="w-full flex items-center gap-2.5 sm:gap-2 px-3 sm:px-2.5 py-2.5 sm:py-2 rounded-lg text-[#cccccc] hover:bg-[#222222] hover:text-white transition cursor-pointer text-[13px] sm:text-xs"
            >
              <Terminal className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#8c8c8c]" />
              <span>New terminal</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowPlusDropdown(false);
                onOpenBrowser?.();
              }}
              className="w-full flex items-center gap-2.5 sm:gap-2 px-3 sm:px-2.5 py-2.5 sm:py-2 rounded-lg text-[#cccccc] hover:bg-[#222222] hover:text-white transition cursor-pointer text-[13px] sm:text-xs"
            >
              <Globe className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#58a6ff]" />
              <span>Browser preview</span>
            </button>
          </BottomSheet>
        </div>

        {/* Maximize / Restore Panel Button (Desktop Only) */}
        <button
          type="button"
          onClick={onToggleMaximize}
          className="hidden sm:flex w-7 h-7 rounded-lg hover:bg-[#202020] text-[#8c8c8c] hover:text-white items-center justify-center transition cursor-pointer"
          title={isMaximized ? 'Restore panel' : 'Maximize panel'}
        >
          {isMaximized ? (
            <Minimize2 className="w-3.5 h-3.5" strokeWidth={1.75} />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.75} />
          )}
        </button>

        {/* Toggle Right Sidebar / Close Panel Button */}
        <button
          type="button"
          onClick={onToggleSidebar}
          className="w-7 h-7 rounded-lg hover:bg-[#202020] text-[#8c8c8c] hover:text-white flex items-center justify-center transition cursor-pointer"
          title="Close panel"
        >
          <X className="w-4 h-4 sm:hidden" strokeWidth={1.75} />
          <PanelRight className="w-3.5 h-3.5 hidden sm:block" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
};
