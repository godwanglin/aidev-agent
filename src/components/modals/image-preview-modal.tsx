'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, RotateCcw, Download, ExternalLink, ImageIcon } from 'lucide-react';

export interface ImagePreviewModalProps {
  isOpen: boolean;
  imageUrl: string;
  title?: string;
  subtitle?: string;
  onClose: () => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  isOpen,
  imageUrl,
  title,
  subtitle,
  onClose,
}) => {
  const [scale, setScale] = useState(1);

  // Reset zoom on open
  useEffect(() => {
    if (isOpen) {
      setScale(1);
    }
  }, [isOpen, imageUrl]);

  // Keyboard shortcut Esc to close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        setScale((s) => Math.min(s + 0.25, 3));
      } else if (e.key === '-' || e.key === '_') {
        setScale((s) => Math.max(s - 0.25, 0.5));
      } else if (e.key === '0') {
        setScale(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale((s) => Math.min(s + 0.25, 3));
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale((s) => Math.max(s - 0.25, 0.5));
  };

  const handleResetZoom = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale(1);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = subtitle || title || 'screenshot.png';
    a.click();
  };

  const handleOpenNewTab = (e: React.MouseEvent) => {
    e.stopPropagation();
    const w = window.open('');
    if (w) {
      w.document.write(`<img src="${imageUrl}" style="max-width:100%; height:auto;" />`);
    }
  };

  if (!isOpen || typeof document === 'undefined' || !imageUrl) return null;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[999999] bg-black/85 backdrop-blur-md flex flex-col select-none animate-fade-in font-sans"
    >
      {/* Top Floating Control Bar */}
      <header
        onClick={(e) => e.stopPropagation()}
        className="h-14 px-6 flex items-center justify-between border-b border-white/[0.08] bg-[#121215]/90 shrink-0 z-10 select-none shadow-lg"
      >
        {/* Left: Title & Tag */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/25 flex items-center justify-center text-blue-400 shrink-0">
            <ImageIcon className="w-4 h-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white truncate font-mono">
                {title || 'Image Preview'}
              </span>
            </div>
            {subtitle && (
              <span className="text-xs text-[#8c8c96] truncate">{subtitle}</span>
            )}
          </div>
        </div>

        {/* Right: Actions & Close Button */}
        <div className="flex items-center gap-1.5">
          {/* Zoom Controls */}
          <div className="flex items-center rounded-lg bg-[#1e1e24] border border-[#2e2e38] p-0.5 mr-2">
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-1.5 rounded text-[#a0a0ab] hover:text-white hover:bg-white/[0.08] transition cursor-pointer"
              title="Zoom out (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs font-mono text-[#dcdce5] min-w-[48px] text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-1.5 rounded text-[#a0a0ab] hover:text-white hover:bg-white/[0.08] transition cursor-pointer"
              title="Zoom in (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="p-1.5 rounded text-[#a0a0ab] hover:text-white hover:bg-white/[0.08] transition cursor-pointer border-l border-white/[0.08] ml-0.5"
              title="Reset Zoom (0)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleDownload}
            className="p-2 rounded-lg text-[#a0a0ab] hover:text-white hover:bg-[#1e1e24] transition cursor-pointer"
            title="Download image"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleOpenNewTab}
            className="p-2 rounded-lg text-[#a0a0ab] hover:text-white hover:bg-[#1e1e24] transition cursor-pointer"
            title="Open in new window"
          >
            <ExternalLink className="w-4 h-4" />
          </button>

          <div className="w-[1px] h-5 bg-white/10 mx-1" />

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[#a0a0ab] hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Image Stage */}
      <main
        onClick={onClose}
        className="flex-1 w-full h-full overflow-auto flex items-center justify-center p-6 relative cursor-zoom-out"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ transform: `scale(${scale})` }}
          className="relative max-w-full max-h-full transition-transform duration-100 ease-out cursor-default rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/10 bg-[#0e0e11]"
        >
          <img
            src={imageUrl}
            alt={title || 'preview'}
            className="max-w-[85vw] max-h-[80vh] object-contain block select-text"
          />
        </div>
      </main>
    </div>,
    document.body
  );
};
