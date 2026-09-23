'use client';

import React from 'react';
import { X } from 'lucide-react';
import { AestheticFileIcon, extractFileName } from '@/components/common/aesthetic-file-icon';

export interface InlineFileChipProps {
  filePath: string;
  onDelete?: () => void;
  onOpenFile?: (filePath: string) => void;
  interactive?: boolean;
}

export const InlineFileChip: React.FC<InlineFileChipProps> = ({
  filePath,
  onDelete,
  onOpenFile,
  interactive = true,
}) => {
  const fileName = extractFileName(filePath);

  return (
    <span
      contentEditable={false}
      data-chip-type="file"
      data-file-path={filePath}
      className="relative group/chip hover:z-30 inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded-md border border-transparent hover:border-[#363640] hover:bg-[#222226] text-[#dededf] hover:text-white text-[13px] font-sans select-none align-baseline cursor-default transition-all"
    >
      <AestheticFileIcon filePath={filePath} className="w-3.5 h-3.5 shrink-0 align-middle -mt-0.5" />
      <span
        onClick={(e) => {
          if (onOpenFile) {
            e.stopPropagation();
            onOpenFile(filePath);
          }
        }}
        className={`font-medium tracking-tight text-[#e0e0e4] truncate max-w-[240px] ${
          onOpenFile ? 'hover:underline cursor-pointer' : ''
        }`}
      >
        {fileName}
      </span>
      {interactive && onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute -top-1.5 -right-1.5 z-50 opacity-0 group-hover/chip:opacity-100 w-4 h-4 rounded-full bg-[#26262f] border border-[#525264] shadow-[0_2px_8px_rgba(0,0,0,0.95),0_0_2px_rgba(255,255,255,0.25)] flex items-center justify-center text-[#dcdce4] hover:text-red-400 hover:bg-[#32323e] hover:scale-110 active:scale-95 transition-all cursor-pointer"
        >
          <X className="w-2.5 h-2.5 stroke-[2.5]" />
        </button>
      )}
    </span>
  );
};
