'use client';

import React from 'react';
import { Zap, Terminal, Search, Play, X, Globe, Layers } from 'lucide-react';

interface SlashChipProps {
  command: string;
  onClick?: () => void;
  onDelete?: () => void;
}

export const SlashChip: React.FC<SlashChipProps> = ({ command, onClick, onDelete }) => {
  const cleanCmd = command.trim();

  const getStyle = () => {
    if (cleanCmd.startsWith('/skill:')) {
      return {
        bg: 'bg-[#1c1c20] hover:bg-[#25252b] border-[#32323a] text-[#d4d4d8]',
        icon: <Terminal className="w-3 h-3 text-[#9ca3af] shrink-0" />,
      };
    }
    if (cleanCmd.startsWith('/compact')) {
      return {
        bg: 'bg-[#2a1d17] hover:bg-[#38261e] border-[#5e3826] text-[#fb923c]',
        icon: <Layers className="w-3 h-3 text-[#fb923c] shrink-0" />,
      };
    }
    if (cleanCmd.startsWith('/browser')) {
      return {
        bg: 'bg-[#142233] hover:bg-[#1a2d44] border-[#1d3c5e] text-[#60a5fa]',
        icon: <Globe className="w-3 h-3 text-[#60a5fa] shrink-0" />,
      };
    }
    if (cleanCmd.startsWith('/plan')) {
      return {
        bg: 'bg-[#231a30] hover:bg-[#2b1f3c] border-[#48286a] text-[#c084fc]',
        icon: <Zap className="w-3 h-3 text-[#c084fc] shrink-0" />,
      };
    }
    if (cleanCmd.startsWith('/test')) {
      return {
        bg: 'bg-[#122838] hover:bg-[#183449] border-[#1e4968] text-[#38bdf8]',
        icon: <Play className="w-3 h-3 text-[#38bdf8] shrink-0" />,
      };
    }
    if (cleanCmd.startsWith('/review')) {
      return {
        bg: 'bg-[#132a24] hover:bg-[#1a3830] border-[#1f5043] text-[#34d399]',
        icon: <Search className="w-3 h-3 text-[#34d399] shrink-0" />,
      };
    }
    return {
      bg: 'bg-[#231a30] hover:bg-[#2b1f3c] border-[#48286a] text-[#c084fc]',
      icon: <Terminal className="w-3 h-3 text-[#c084fc] shrink-0" />,
    };
  };

  const style = getStyle();

  return (
    <span
      onClick={onClick}
      style={{ verticalAlign: '-2.5px' }}
      className={`group/slash relative inline-flex items-center gap-1.5 px-2 h-[22px] box-border mx-0.5 rounded-[6px] border font-mono text-[11.5px] font-medium select-none cursor-default leading-none shadow-sm transition-all ${style.bg}`}
    >
      {style.icon}
      <span className="leading-none">{cleanCmd}</span>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="ml-0.5 opacity-60 group-hover/slash:opacity-100 hover:text-white transition-opacity p-0.5 -mr-1 rounded cursor-pointer"
          title="Remove command"
        >
          <X className="w-2.5 h-2.5 stroke-[2.5]" />
        </button>
      )}
    </span>
  );
};
