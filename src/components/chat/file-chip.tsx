'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AestheticFileIcon } from '@/components/common/aesthetic-file-icon';

interface FileChipProps {
  filePath: string;
  lineRange?: { startLine?: number; endLine?: number };
  onClick?: () => void;
  onOpenFile?: (filePath: string, lineRange?: { startLine?: number; endLine?: number }) => void;
  interactive?: boolean;
}

export const FileChip: React.FC<FileChipProps> = ({
  filePath,
  lineRange: propLineRange,
  onClick,
  onOpenFile,
  interactive = true,
}) => {
  const [showPopover, setShowPopover] = useState(false);
  const [popoverCoords, setPopoverCoords] = useState<{
    placeAbove: boolean;
    left: number;
    bottom: number;
    top: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);

  const chipRef = useRef<HTMLSpanElement>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  // Clean path (remove leading @ if from mention, and extract #L1-40 if present)
  let cleanPath = filePath.trim();
  if (cleanPath.startsWith('@')) {
    cleanPath = cleanPath.slice(1);
  }

  let extractedLineRange = propLineRange;
  const hashMatch = /#L(\d+)(?:-(\d+))?$/.exec(cleanPath);
  if (hashMatch) {
    cleanPath = cleanPath.replace(/#L(\d+)(?:-(\d+))?$/, '');
    extractedLineRange = {
      startLine: parseInt(hashMatch[1], 10),
      endLine: hashMatch[2] ? parseInt(hashMatch[2], 10) : parseInt(hashMatch[1], 10),
    };
  }

  const fileName = cleanPath.split(/[\\/]/).pop() || cleanPath;
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  // Aesthetic file icon powered by @react-symbols/icons
  const renderBadge = (customClass = 'w-3.5 h-3.5 shrink-0') => {
    return <AestheticFileIcon filePath={cleanPath} className={customClass} />;
  };

  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (!chipRef.current) return;
    const rect = chipRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    const spaceAbove = rect.top;
    const spaceBelow = vh - rect.bottom;

    const placeAbove = spaceBelow < 120 || spaceAbove >= spaceBelow;
    const center = rect.left + rect.width / 2;
    const left = Math.max(120, Math.min(vw - 120, center));

    setPopoverCoords({
      placeAbove,
      left,
      bottom: vh - rect.top + 6,
      top: rect.bottom + 6,
    });
    setShowPopover(true);
  };

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setShowPopover(false);
    }, 150);
  };

  const handleCardMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleCardMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setShowPopover(false);
    }, 150);
  };

  // Close popover when parent container scrolls
  useEffect(() => {
    if (!showPopover) return;
    const handleScroll = () => {
      setShowPopover(false);
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [showPopover]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPopover(false);
    if (!interactive) return;
    if (onClick) {
      onClick();
    } else if (onOpenFile) {
      onOpenFile(cleanPath, extractedLineRange);
    }
  };

  const badgeContent = (
    <>
      {renderBadge()}
      <span className={`font-medium text-[#e0e0e0] transition-colors ${interactive ? 'group-hover:text-white' : ''}`}>
        {fileName}
      </span>
      {extractedLineRange?.startLine && (
        <span className="text-[#768390] group-hover:text-[#8b9bb4] font-mono text-[10.5px] transition-colors">
          #L{extractedLineRange.startLine}
          {extractedLineRange.endLine && extractedLineRange.endLine !== extractedLineRange.startLine
            ? `-${extractedLineRange.endLine}`
            : ''}
        </span>
      )}
    </>
  );

  return (
    <span
      ref={chipRef}
      className="relative inline-block align-baseline mx-0.5"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {interactive ? (
        <button
          type="button"
          onClick={handleClick}
          className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md bg-transparent hover:bg-[#222226] border border-transparent hover:border-[#363640] text-[#cccccc] hover:text-white transition-all duration-150 cursor-pointer select-none text-[12px] font-sans group leading-normal align-middle"
        >
          {badgeContent}
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md bg-transparent hover:bg-[#222226] border border-transparent hover:border-[#363640] text-[#cccccc] hover:text-white transition-all duration-150 select-none text-[12px] font-sans group leading-normal align-middle">
          {badgeContent}
        </span>
      )}

      {/* Hover Popover Card via Portal - Never clipped by parent overflow-hidden */}
      {mounted &&
        showPopover &&
        popoverCoords &&
        createPortal(
          <div
            onMouseEnter={handleCardMouseEnter}
            onMouseLeave={handleCardMouseLeave}
            style={{
              position: 'fixed',
              ...(popoverCoords.placeAbove
                ? { bottom: `${popoverCoords.bottom}px` }
                : { top: `${popoverCoords.top}px` }),
              left: `${popoverCoords.left}px`,
              transform: 'translateX(-50%)',
              zIndex: 999999,
            }}
            className="px-2.5 py-1.5 rounded-lg bg-[#181818] border border-[#2e2e2e] shadow-2xl pointer-events-auto whitespace-nowrap animate-dropdown text-left font-sans"
          >
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#e0e0e0]">
              {renderBadge()}
              <span className="font-semibold">{fileName}</span>
              {extractedLineRange?.startLine && (
                <span className="text-[#58a6ff]">
                  #L{extractedLineRange.startLine}
                  {extractedLineRange.endLine && extractedLineRange.endLine !== extractedLineRange.startLine
                    ? `-${extractedLineRange.endLine}`
                    : ''}
                </span>
              )}
            </div>
            <div className="text-[10px] font-mono text-[#8c8c8c] truncate max-w-xs mt-0.5">
              {cleanPath}
            </div>
            <div className="text-[9.5px] text-[#58a6ff] mt-1 font-sans">
              Click to open in editor tab
            </div>
          </div>,
          document.body
        )}
    </span>
  );
};
