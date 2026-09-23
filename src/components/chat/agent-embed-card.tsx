'use client';

import React, { useState, useRef, useMemo } from 'react';
import { RotateCcw, FileCode, Maximize2, Sparkles, Loader2 } from 'lucide-react';
import { useTheme } from '@/context/theme-context';

export interface AgentEmbedCardProps {
  src: string;
  workdir?: string;
  sessionId?: string;
  onOpenFile?: (filePath: string, lineRange?: { startLine?: number; endLine?: number }) => void;
  onOpenBrowser?: (url: string) => void;
}

export const AgentEmbedCard: React.FC<AgentEmbedCardProps> = ({
  src,
  workdir,
  sessionId,
  onOpenFile,
  onOpenBrowser,
}) => {
  const { resolvedTheme } = useTheme();
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Derive human-readable filename
  const filename = useMemo(() => {
    try {
      const clean = decodeURIComponent(src).replace(/^file:\/\/\/?/i, '').replace(/\\/g, '/');
      const parts = clean.split('/');
      return parts[parts.length - 1] || 'widget.html';
    } catch {
      return 'widget.html';
    }
  }, [src]);

  // Clean path for opening in editor
  const editorPath = useMemo(() => {
    return decodeURIComponent(src).replace(/^file:\/\/\/?/i, '');
  }, [src]);

  const embedUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('src', src);
    if (workdir) params.set('workdir', workdir);
    if (sessionId) params.set('sessionId', sessionId);
    params.set('theme', resolvedTheme);
    if (refreshKey > 0) params.set('_r', String(refreshKey));
    return `/api/embed?${params.toString()}`;
  }, [src, workdir, sessionId, resolvedTheme, refreshKey]);

  const handleRefresh = () => {
    setIsLoading(true);
    setRefreshKey((k) => k + 1);
  };

  const handleOpenInSidebarWebView = () => {
    if (onOpenBrowser) {
      onOpenBrowser(embedUrl);
    }
  };

  return (
    <div className="my-3 w-full rounded-xl border border-[#262626] bg-[#141414] overflow-hidden shadow-sm flex flex-col select-none transition-all duration-200">
      {/* Header Bar */}
      <div className="h-9 px-3.5 bg-[#181818] border-b border-[#262626] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0 pr-2">
          <Sparkles className="w-3.5 h-3.5 text-[#a0a0a0] shrink-0" />
          <span className="font-mono text-xs text-white truncate">{filename}</span>
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#222222] border border-[#2c2c2c] text-[#8c8c8c] shrink-0">
            Interactive Embed
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 shrink-0 text-[#8c8c8c]">
          <button
            type="button"
            onClick={handleRefresh}
            className="p-1 rounded hover:bg-white/5 hover:text-white transition cursor-pointer"
            title="Reload preview"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          {onOpenBrowser && (
            <button
              type="button"
              onClick={handleOpenInSidebarWebView}
              className="p-1 rounded hover:bg-white/5 hover:text-white transition cursor-pointer"
              title="Open in Web View (Sidebar)"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onOpenFile && (
            <button
              type="button"
              onClick={() => onOpenFile(editorPath)}
              className="p-1 rounded hover:bg-white/5 hover:text-white transition cursor-pointer"
              title="Open source code in editor"
            >
              <FileCode className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Frame Container */}
      <div className="relative w-full h-[450px] bg-[#121212]">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#141414]/90 z-10">
            <div className="flex items-center gap-2 text-xs text-[#8c8c8c] font-sans">
              <Loader2 className="w-4 h-4 animate-spin text-[#a0a0a0]" />
              <span>Loading interactive widget...</span>
            </div>
          </div>
        )}
        <iframe
          ref={iframeRef}
          key={`embed_${refreshKey}_${resolvedTheme}`}
          src={embedUrl}
          onLoad={() => setIsLoading(false)}
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"
          className="w-full h-full border-none select-text"
          title={`Embed: ${filename}`}
        />
      </div>
    </div>
  );
};
