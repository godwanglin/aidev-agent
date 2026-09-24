'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Columns2, Rows2, Bell, PanelRightOpen } from 'lucide-react';
import type { SessionRecord, ProjectRecord } from '@/lib/db';

interface SplitChatContainerProps {
  splitSession: SessionRecord | null;
  splitProject?: ProjectRecord | null;
  splitDirection?: 'right' | 'down';
  primaryPane: React.ReactNode;
  splitPane: React.ReactNode;
  isRightPanelOpen?: boolean;
  onToggleRightPanel?: () => void;
  onCloseSplit: () => void;
  onToggleSplitDirection?: () => void;
}

export const SplitChatContainer: React.FC<SplitChatContainerProps> = ({
  splitSession,
  splitProject,
  splitDirection = 'right',
  primaryPane,
  splitPane,
  isRightPanelOpen = false,
  onToggleRightPanel,
  onCloseSplit,
  onToggleSplitDirection,
}) => {
  const [splitRatio, setSplitRatio] = useState(0.5); // 50% default
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isHorizontal = splitDirection === 'right';

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (e.buttons === 0) {
        setIsDragging(false);
        return;
      }
      if (!isDragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      if (isHorizontal) {
        const offset = e.clientX - rect.left;
        const ratio = Math.max(0.2, Math.min(0.8, offset / rect.width));
        setSplitRatio(ratio);
      } else {
        const offset = e.clientY - rect.top;
        const ratio = Math.max(0.2, Math.min(0.8, offset / rect.height));
        setSplitRatio(ratio);
      }
    },
    [isDragging, isHorizontal]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('blur', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('blur', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // If no split is active, render primary full size
  if (!splitSession) {
    return <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">{primaryPane}</div>;
  }

  return (
    <div
      ref={containerRef}
      className={`flex-1 min-h-0 flex ${
        isHorizontal ? 'flex-row' : 'flex-col'
      } h-full overflow-hidden ${isDragging ? 'select-none' : ''} relative`}
      style={{ cursor: isDragging ? (isHorizontal ? 'col-resize' : 'row-resize') : 'default' }}
    >
      {/* 1. Primary Pane */}
      <div
        style={{
          flex: `${splitRatio} 1 0%`,
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        className="relative"
      >
        {primaryPane}
      </div>

      {/* 2. Draggable Resize Divider */}
      <div
        onMouseDown={handleMouseDown}
        className={`${
          isHorizontal
            ? 'w-[1px] h-full cursor-col-resize'
            : 'h-[1px] w-full cursor-row-resize'
        } ${isDragging ? 'bg-[#007acc]' : 'bg-[#222226] hover:bg-[#007acc]'} transition-colors duration-150 z-10 shrink-0 select-none relative group`}
        title={isHorizontal ? 'Drag to resize split width' : 'Drag to resize split height'}
      >
        <div
          className={`absolute ${
            isHorizontal
              ? 'inset-y-0 -left-2 -right-2 cursor-col-resize z-20'
              : 'inset-x-0 -top-2 -bottom-2 cursor-row-resize z-20'
          } bg-transparent pointer-events-auto`}
        />
      </div>

      {/* 3. Secondary Split Pane */}
      <div
        style={{
          flex: `${1 - splitRatio} 1 0%`,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        className={`bg-[#101010] relative ${
          isHorizontal ? 'border-l border-[#1e1e1e]' : 'border-t border-[#1e1e1e]'
        }`}
      >
        {/* Split Pane Header matching Image 3 */}
        <div className="h-10 px-3.5 bg-[#121212] border-b border-[#1f1f1f] flex items-center justify-between shrink-0 select-none text-xs text-[#8c8c8c]">
          <div className="flex items-center gap-1.5 truncate min-w-0">
            <span className="text-[#6e6e6e]">{splitProject?.name || 'project'}</span>
            <span className="text-[#444444]">/</span>
            <span className="text-[#cccccc] font-medium truncate">{splitSession.title}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {onToggleSplitDirection && (
              <button
                type="button"
                onClick={onToggleSplitDirection}
                className="p-1 rounded text-[#6e6e6e] hover:text-[#cccccc] hover:bg-[#1a1a1a] transition cursor-pointer"
                title={isHorizontal ? 'Switch to Split Down' : 'Switch to Split Right'}
              >
                {isHorizontal ? <Rows2 className="w-3.5 h-3.5" /> : <Columns2 className="w-3.5 h-3.5" />}
              </button>
            )}

            <button
              type="button"
              onClick={onCloseSplit}
              className="p-1 rounded text-[#6e6e6e] hover:text-[#e06c75] hover:bg-[#1a1a1a] transition cursor-pointer"
              title="Close split view"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            {/* In Horizontal Split (Split Right), the secondary pane is at the far right of the screen,
                so render the global Notification Bell & Right Sidebar toggle here! */}
            {isHorizontal && (
              <>
                <div className="h-3.5 w-px bg-[#262626] mx-0.5" />

                {!isRightPanelOpen && (
                  <button
                    type="button"
                    className="p-1 text-[#6e6e6e] hover:text-[#cccccc] hover:bg-[#191919] rounded transition cursor-pointer"
                    title="Notifications"
                  >
                    <Bell className="w-3.5 h-3.5" />
                  </button>
                )}

                {!isRightPanelOpen && onToggleRightPanel && (
                  <button
                    type="button"
                    onClick={onToggleRightPanel}
                    className="p-1.5 rounded-md text-[#6e6e6e] hover:text-white hover:bg-[#1f1f1f] border border-[#262626] transition cursor-pointer"
                    title="Open side panel"
                  >
                    <PanelRightOpen className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Split Chat Content */}
        <div className="flex-1 overflow-hidden flex flex-col">{splitPane}</div>
      </div>

      {/* Global Drag Overlay during resize to ensure smooth mouse tracking across nested panels */}
      {isDragging && (
        <div
          className={`fixed inset-0 z-[9999] ${
            isHorizontal ? 'cursor-col-resize' : 'cursor-row-resize'
          } select-none pointer-events-auto bg-transparent`}
        />
      )}
    </div>
  );
};
