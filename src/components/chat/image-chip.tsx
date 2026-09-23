'use client';

import React from 'react';
import { ImageIcon, X } from 'lucide-react';

export interface ImageChipProps {
  imageId?: string;
  label?: string;
  thumbnailUrl?: string;
  onClick?: () => void;
  onDelete?: () => void;
  interactive?: boolean;
}

export const ImageChip: React.FC<ImageChipProps> = ({
  imageId,
  label,
  thumbnailUrl,
  onClick,
  onDelete,
  interactive = true,
}) => {
  const displayText = label || (imageId ? `image:${imageId}` : 'image');

  return (
    <span
      contentEditable={false}
      data-chip-type="image"
      data-image-id={imageId}
      onClick={(e) => {
        if (onClick) {
          e.stopPropagation();
          onClick();
        }
      }}
      style={{ verticalAlign: '-2.5px' }}
      className={`relative group/chip hover:z-30 inline-flex items-center gap-1.5 mx-1 px-2 h-[22px] box-border rounded-[5px] bg-blue-500/12 hover:bg-blue-500/20 border border-blue-500/30 hover:border-blue-500/45 text-blue-300 text-[11.5px] font-mono select-none leading-none transition-all shadow-xs ${
        onClick ? 'cursor-pointer hover:text-blue-200' : 'cursor-default'
      }`}
      title={onClick ? `Click to enlarge ${displayText}` : undefined}
    >
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={displayText}
          className="w-3.5 h-3.5 object-cover rounded-[2px] shrink-0"
        />
      ) : (
        <ImageIcon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
      )}
      <span className="font-medium tracking-tight leading-none truncate max-w-[200px]">{displayText}</span>
      {interactive && onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute -top-1.5 -right-1.5 z-50 opacity-0 group-hover/chip:opacity-100 w-4 h-4 rounded-full bg-[#161c2c] border border-blue-400/50 shadow-[0_2px_8px_rgba(0,0,0,0.95),0_0_2px_rgba(59,130,246,0.35)] flex items-center justify-center text-blue-200 hover:text-red-400 hover:bg-[#22283a] hover:scale-110 active:scale-95 transition-all cursor-pointer"
        >
          <X className="w-2.5 h-2.5 stroke-[2.5]" />
        </button>
      )}
    </span>
  );
};
