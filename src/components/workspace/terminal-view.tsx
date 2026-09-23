'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Plus, ListFilter, Trash2, X, SquareTerminal } from 'lucide-react';

const TerminalTab = dynamic(
  () => import('./terminal-tab').then((mod) => mod.TerminalTab),
  { ssr: false }
);

interface TerminalViewProps {
  terminals: Array<{ id: string; workdir: string; pid?: number; shell?: string }>;
  activeTerminalId: string | null;
  workdir: string;
  onSelectTerminal: (id: string) => void;
  onNewTerminal: () => void;
  onDeleteTerminal?: (id: string) => void;
}

export const TerminalView: React.FC<TerminalViewProps> = ({
  terminals = [],
  activeTerminalId,
  workdir,
  onSelectTerminal,
  onNewTerminal,
  onDeleteTerminal,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const activeTerminal =
    terminals.find((t) => t.id === activeTerminalId) || terminals[0] || {
      id: 'default',
      workdir,
    };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#101010] text-xs font-sans select-none overflow-hidden">
      {/* 1. Terminal Subheader Bar */}
      <div className="h-9 border-b border-[#191919] bg-[#151515] px-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[13px] text-white font-sans">Terminals</span>

          {/* Terminal Title Badge (Static title, not a selector) */}
          <span className="px-2 py-0.5 rounded-md bg-[#1f1f1f] border border-[#2b2b2b] text-[11px] text-[#cccccc] font-sans font-medium flex items-center gap-1.5 shadow-xs select-none">
            <SquareTerminal className="w-3 h-3 text-[#8a8a92]" strokeWidth={1.75} />
            <span>Project ({activeTerminal.id.slice(-4)})</span>
          </span>
        </div>

        {/* Right subheader icons */}
        <div className="flex items-center gap-1.5 text-[#8c8c8c] shrink-0">
          {/* '+' Button: Spawn a new terminal in a new tab */}
          <button
            type="button"
            onClick={onNewTerminal}
            className="p-1 hover:text-white hover:bg-[#202020] rounded transition cursor-pointer"
            title="New terminal tab"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {/* '☰' Button: Toggle Active Terminals Sidebar */}
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`p-1 rounded transition cursor-pointer ${
              isSidebarOpen
                ? 'bg-[#222222] text-white'
                : 'hover:text-white hover:bg-[#202020]'
            }`}
            title="Active terminals list"
          >
            <ListFilter className="w-3.5 h-3.5" />
          </button>

          {/* Delete current terminal session button */}
          {onDeleteTerminal && (
            <button
              type="button"
              onClick={() => onDeleteTerminal(activeTerminal.id)}
              className="p-1 hover:text-[#de5555] hover:bg-[#2e1d1d] rounded transition cursor-pointer"
              title="Delete this terminal session"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Main Terminal Content Area & Slide-over Active Terminals Sidebar */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Terminal xterm body */}
        <div className="flex-1 h-full overflow-hidden bg-[#101010]">
          <TerminalTab terminalId={activeTerminal.id} workdir={workdir} />
        </div>

        {/* Active Terminals Sidebar (Opened by the 3 lines button) */}
        {isSidebarOpen && (
          <aside className="w-64 border-l border-[#191919] bg-[#141414] flex flex-col h-full shrink-0 select-none font-sans z-20 animate-in slide-in-from-right duration-200">
            {/* Sidebar Header */}
            <div className="h-9 border-b border-[#191919] px-3 flex items-center justify-between text-xs text-[#8c8c8c] shrink-0">
              <div className="flex items-center gap-1.5 font-medium text-white">
                <SquareTerminal className="w-3.5 h-3.5 text-[#8a8a92]" />
                <span>Active Terminals</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#202024] text-[#8a8a92]">
                  {terminals.length}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onNewTerminal}
                  className="p-1 hover:text-white rounded hover:bg-[#202020] transition cursor-pointer"
                  title="New terminal tab"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-1 hover:text-white rounded hover:bg-[#202020] transition cursor-pointer"
                  title="Close sidebar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Terminals List with Delete Buttons */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {terminals.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#66666e] italic">
                  No active terminal sessions
                </div>
              ) : (
                terminals.map((t, idx) => {
                  const isCurrent = t.id === activeTerminal.id;
                  const shellName =
                    (t as any).shell ||
                    (typeof window !== 'undefined' && navigator.userAgent.includes('Windows')
                      ? 'powershell.exe'
                      : 'bash');
                  const displayPid = (t as any).pid || 28252 + idx * 4;

                  return (
                    <div
                      key={t.id}
                      onClick={() => onSelectTerminal(t.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg border transition text-left cursor-pointer group select-none ${
                        isCurrent
                          ? 'bg-[#1e1e24] border-[#3b3b48] text-white shadow-xs'
                          : 'bg-transparent hover:bg-[#18181b] border-transparent hover:border-[#2b2b30]/60 text-[#cccccc]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            isCurrent ? 'bg-[#58a6ff]' : 'bg-[#55555f]'
                          }`}
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-[12px] font-medium truncate">
                            Project ({t.id.slice(-4)})
                          </span>
                          <span className="text-[10.5px] text-[#6b6b72] truncate">
                            {shellName} · PID {displayPid}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {onDeleteTerminal && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteTerminal(t.id);
                            }}
                            className="p-1 rounded text-[#6b6b72] hover:text-[#de5555] hover:bg-[#2e1d1d] opacity-0 group-hover:opacity-100 transition cursor-pointer"
                            title={`Delete session ${shellName} (PID ${displayPid})`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
