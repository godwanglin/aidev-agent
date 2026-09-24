'use client';

import React, { useState, useEffect } from 'react';
import { Minus, Square, X, PanelLeft, PanelRight } from 'lucide-react';

interface WindowTitleBarProps {
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  onToggleSidebar?: () => void;
  onToggleAuxiliaryPane?: () => void;
  isSidebarCollapsed?: boolean;
  isRightPanelOpen?: boolean;
}

export function isElectronEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as any).electron ||
    (window as any).electronAPI ||
    (window as any).process?.versions?.electron ||
    navigator.userAgent.toLowerCase().includes('electron')
  );
}

export const TopBar: React.FC<WindowTitleBarProps> = ({
  onMinimize,
  onMaximize,
  onClose,
  onToggleSidebar,
  onToggleAuxiliaryPane,
  isSidebarCollapsed,
  isRightPanelOpen,
}) => {
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    setIsElectron(isElectronEnvironment());
  }, []);

  // CustomTitlebar in src/app/layout.tsx is the single global Electron titlebar.
  // Returning null prevents a duplicate WebkitAppRegion: 'drag' bar from overlapping
  // and swallowing mouse clicks on the View / Terminal / Help menus.
  return null;

  const handleMinimize = () => {
    if (onMinimize) onMinimize();
    else (window as any).electronAPI?.minimize?.();
  };

  const handleMaximize = () => {
    if (onMaximize) onMaximize();
    else (window as any).electronAPI?.maximize?.();
  };

  const handleClose = () => {
    if (onClose) onClose();
    else (window as any).electronAPI?.close?.();
  };

  return (
    <div
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      className="hidden md:flex h-7 px-3 items-center justify-between text-[11px] text-[#6e6e6e] bg-[#151515] border-b border-[#191919] select-none shrink-0 font-sans"
    >
      {/* Menu controls */}
      <div
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        className="flex items-center gap-4"
      >
        <span className="text-[#cccccc] font-medium cursor-default">Aidev</span>
        <span className="hover:text-[#cccccc] cursor-pointer transition">File</span>
        <span className="hover:text-[#cccccc] cursor-pointer transition">View</span>
        <span className="hover:text-[#cccccc] cursor-pointer transition">Window</span>
      </div>

      {/* Right controls: Layout Controls + Window Controls */}
      <div
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        className="flex items-center gap-1.5 text-[#6e6e6e]"
      >
        {/* Toggle Primary Sidebar */}
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className={`p-1 transition rounded hover:bg-white/[0.08] cursor-pointer ${
              !isSidebarCollapsed ? 'text-[#cccccc]' : 'text-[#6e6e6e] hover:text-[#cccccc]'
            }`}
            title="Toggle Primary Sidebar (Ctrl+B)"
          >
            <PanelLeft className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Toggle Auxiliary Pane */}
        {onToggleAuxiliaryPane && (
          <button
            type="button"
            onClick={onToggleAuxiliaryPane}
            className={`p-1 transition rounded hover:bg-white/[0.08] cursor-pointer ${
              isRightPanelOpen ? 'text-[#cccccc]' : 'text-[#6e6e6e] hover:text-[#cccccc]'
            }`}
            title="Toggle Auxiliary Pane Ctrl+Shift+B"
          >
            <PanelRight className="w-3.5 h-3.5" />
          </button>
        )}

        {(onToggleSidebar || onToggleAuxiliaryPane) && (
          <div className="w-px h-3.5 bg-[#252525] mx-1" />
        )}

        <button
          type="button"
          onClick={handleMinimize}
          className="p-1 hover:text-[#cccccc] transition cursor-pointer"
          title="Minimize"
        >
          <Minus className="w-2.5 h-2.5" />
        </button>
        <button
          type="button"
          onClick={handleMaximize}
          className="p-1 hover:text-[#cccccc] transition cursor-pointer"
          title="Maximize"
        >
          <Square className="w-2.5 h-2.5" />
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="p-1 hover:text-[#de5555] transition cursor-pointer"
          title="Close (Alt+F4)"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
};
