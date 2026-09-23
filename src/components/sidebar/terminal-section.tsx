'use client';

import React from 'react';
import { Terminal, Plus, Play } from 'lucide-react';

interface TerminalSectionProps {
  terminals: Array<{ id: string; workdir: string }>;
  onOpenTerminal: (id: string) => void;
  onNewTerminal: () => void;
}

export const TerminalSection: React.FC<TerminalSectionProps> = ({
  terminals,
  onOpenTerminal,
  onNewTerminal,
}) => {
  return (
    <div className="p-2 space-y-2 select-none">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold text-slate-500 uppercase">
          Terminals ({terminals.length})
        </span>
        <button
          onClick={onNewTerminal}
          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition"
        >
          <Plus className="w-3 h-3" strokeWidth={1.75} />
          <span>New</span>
        </button>
      </div>

      {terminals.length === 0 ? (
        <div className="p-4 text-center text-xs text-slate-500">
          <Terminal className="w-5 h-5 mx-auto mb-1.5 opacity-30" strokeWidth={1.5} />
          No terminal sessions running
          <button
            onClick={onNewTerminal}
            className="mt-2.5 block mx-auto px-2.5 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 text-xs transition"
          >
            Launch Terminal
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {terminals.map((t, idx) => (
            <button
              key={t.id}
              onClick={() => onOpenTerminal(t.id)}
              className="w-full p-2 rounded-md bg-[#161a24] border border-white/[0.05] hover:border-white/[0.1] flex items-center justify-between text-xs text-left transition"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Play className="w-3 h-3 text-slate-400 shrink-0" strokeWidth={1.5} />
                <span className="font-mono text-[12px] text-slate-300">Terminal {idx + 1}</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                Active
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
