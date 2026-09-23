'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  RotateCw,
  ExternalLink,
  Globe,
  Smartphone,
  Tablet,
  Monitor,
  Loader2,
  Copy,
  Check,
  Code2,
  MoreVertical,
} from 'lucide-react';
import { BrowserWelcomeView } from './browser-welcome-view';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import type { OverviewTaskItem } from './overview-view';

interface BrowserPreviewViewerProps {
  initialUrl: string;
  tasks?: OverviewTaskItem[];
  onUrlChange?: (newUrl: string) => void;
  onMetadataChange?: (metadata: { title: string; favicon: string | null; url: string }) => void;
}

type ViewportMode = 'responsive' | 'tablet' | 'mobile';

export const BrowserPreviewViewer: React.FC<BrowserPreviewViewerProps> = ({
  initialUrl,
  tasks = [],
  onUrlChange,
  onMetadataChange,
}) => {
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [isLoading, setIsLoading] = useState(true);
  const [viewportMode, setViewportMode] = useState<ViewportMode>('responsive');
  const [isProxyMode, setIsProxyMode] = useState<boolean>(false);
  const [isMobileOptionsOpen, setIsMobileOptionsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [pageFavicon, setPageFavicon] = useState<string | null>(null);
  const [pageTitle, setPageTitle] = useState<string>('');
  const [browserJsPolicy, setBrowserJsPolicy] = useState<'Request Review' | 'Always Proceed' | 'Disable'>('Request Review');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const p = localStorage.getItem('aidev_browser_js_policy') as any;
      if (p === 'Request Review' || p === 'Always Proceed' || p === 'Disable') {
        setBrowserJsPolicy(p);
      }
    }
  }, []);

  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const lastInternalUrlRef = useRef(initialUrl);
  const historyStackRef = useRef<string[]>([initialUrl]);
  const historyIndexRef = useRef<number>(0);
  const autoInspectOnLoadRef = useRef<boolean>(false);

  const fetchMetadata = async (urlToFetch: string) => {
    try {
      const res = await fetch(`/api/browser/metadata?url=${encodeURIComponent(urlToFetch)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.title) setPageTitle(data.title);
        if (data.favicon) setPageFavicon(data.favicon);
        onMetadataChange?.({
          title: data.title || '',
          favicon: data.favicon || null,
          url: urlToFetch,
        });
      }
    } catch {}
  };

  // Sync state if initialUrl prop updates from outside
  useEffect(() => {
    if (initialUrl && initialUrl !== lastInternalUrlRef.current) {
      lastInternalUrlRef.current = initialUrl;
      setCurrentUrl(initialUrl);
      setInputUrl(initialUrl);
      setIsLoading(true);
      setIframeKey((prev) => prev + 1);
      historyStackRef.current = [initialUrl];
      historyIndexRef.current = 0;
      setCanGoBack(false);
      setCanGoForward(false);
    }
  }, [initialUrl]);

  useEffect(() => {
    if (currentUrl) {
      fetchMetadata(currentUrl);
    }
  }, [currentUrl, iframeKey]);

  const handleWelcomeNavigate = (target: string) => {
    let formatted = target.trim();
    if (!formatted) return;

    if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
      if (/^\d{2,5}$/.test(formatted)) {
        formatted = `http://localhost:${formatted}`;
      } else if (formatted.startsWith(':')) {
        formatted = `http://localhost${formatted}`;
      } else if (formatted.startsWith('localhost') || formatted.startsWith('127.0.0.1')) {
        formatted = `http://${formatted}`;
      } else {
        formatted = `https://${formatted}`;
      }
    }

    lastInternalUrlRef.current = formatted;
    setCurrentUrl(formatted);
    setInputUrl(formatted);
    setIsLoading(true);
    setIframeKey((prev) => prev + 1);
    onUrlChange?.(formatted);

    historyStackRef.current = [formatted];
    historyIndexRef.current = 0;
    setCanGoBack(false);
    setCanGoForward(false);
  };

  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    let formatted = inputUrl.trim();
    if (!formatted) {
      lastInternalUrlRef.current = '';
      setCurrentUrl('');
      setInputUrl('');
      onUrlChange?.('');
      return;
    }

    if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
      if (/^\d{2,5}$/.test(formatted)) {
        // User typed just a port number, e.g. "3000" or "5173"
        formatted = `http://localhost:${formatted}`;
      } else if (formatted.startsWith(':')) {
        // User typed ":3000"
        formatted = `http://localhost${formatted}`;
      } else if (formatted.startsWith('localhost') || formatted.startsWith('127.0.0.1')) {
        formatted = `http://${formatted}`;
      } else {
        formatted = `https://${formatted}`;
      }
    }

    lastInternalUrlRef.current = formatted;
    setCurrentUrl(formatted);
    setInputUrl(formatted);
    setIsLoading(true);
    setIframeKey((prev) => prev + 1);
    onUrlChange?.(formatted);

    historyStackRef.current = [formatted];
    historyIndexRef.current = 0;
    setCanGoBack(false);
    setCanGoForward(false);
  };

  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number } | null>(null);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'AIDEV_WEBVIEW_CONTEXT_MENU') {
        const iframeRect = iframeRef.current?.getBoundingClientRect();
        const clientX = typeof e.data.clientX === 'number' ? e.data.clientX : 0;
        const clientY = typeof e.data.clientY === 'number' ? e.data.clientY : 0;
        const rawX = (iframeRect?.left || 0) + clientX;
        const rawY = (iframeRect?.top || 0) + clientY;
        const x = Math.max(10, Math.min(rawX, window.innerWidth - 210));
        const y = Math.max(10, Math.min(rawY, window.innerHeight - 160));
        setContextMenu({ visible: true, x, y });
      } else if (e.data.type === 'AIDEV_WEBVIEW_CLICK') {
        setContextMenu(null);
      } else if (e.data.type === 'AIDEV_URL_CHANGED') {
        const newUrl = e.data.url;
        const newTitle = e.data.title;
        const newFavicon = e.data.favicon;

        if (typeof e.data.canGoBack === 'boolean') {
          setCanGoBack(e.data.canGoBack);
        }
        if (typeof e.data.canGoForward === 'boolean') {
          setCanGoForward(e.data.canGoForward);
        }

        if (newUrl) {
          lastInternalUrlRef.current = newUrl;
          setCurrentUrl(newUrl);
          setInputUrl(newUrl);
          onUrlChange?.(newUrl);

          // Update local history stack fallback
          const stack = historyStackRef.current;
          const idx = historyIndexRef.current;
          if (stack[idx] !== newUrl) {
            const nextStack = stack.slice(0, idx + 1);
            nextStack.push(newUrl);
            historyStackRef.current = nextStack;
            historyIndexRef.current = nextStack.length - 1;
            if (typeof e.data.canGoBack !== 'boolean') {
              setCanGoBack(nextStack.length - 1 > 0);
              setCanGoForward(false);
            }
          }
        }

        if (newTitle) {
          setPageTitle(newTitle);
        }
        if (newFavicon) {
          setPageFavicon(newFavicon);
        }

        if (newTitle || newUrl) {
          onMetadataChange?.({
            title: newTitle || pageTitle,
            favicon: newFavicon !== undefined ? newFavicon : pageFavicon,
            url: newUrl || currentUrl,
          });
        }
      }
    };

    const handleWindowClick = () => {
      setContextMenu(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('click', handleWindowClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('click', handleWindowClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleOuterContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.max(10, Math.min(e.clientX, window.innerWidth - 210));
    const y = Math.max(10, Math.min(e.clientY, window.innerHeight - 160));
    setContextMenu({ visible: true, x, y });
  };

  const handleInspect = () => {
    setContextMenu(null);
    if (!isProxyMode) {
      autoInspectOnLoadRef.current = true;
      setIsProxyMode(true);
      setIsLoading(true);
      setIframeKey((prev) => prev + 1);
    } else {
      // Immediately tell iframe to open the panel
      iframeRef.current?.contentWindow?.postMessage({ type: 'AIDEV_INSPECT_OPEN' }, '*');
      setTimeout(() => {
        iframeRef.current?.contentWindow?.postMessage({ type: 'AIDEV_INSPECT_OPEN' }, '*');
      }, 150);
    }
  };

  const handleContextMenuCopy = () => {
    setContextMenu(null);
    handleCopyUrl();
  };

  const handleContextMenuOpenExternal = () => {
    setContextMenu(null);
    handleOpenExternal();
  };

  const handleGoBack = () => {
    if (!canGoBack) return;
    try {
      iframeRef.current?.contentWindow?.history.back();
    } catch {}
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      const targetUrl = historyStackRef.current[historyIndexRef.current];
      if (targetUrl) {
        lastInternalUrlRef.current = targetUrl;
        setCurrentUrl(targetUrl);
        setInputUrl(targetUrl);
        onUrlChange?.(targetUrl);
      }
      setCanGoBack(historyIndexRef.current > 0);
      setCanGoForward(historyIndexRef.current < historyStackRef.current.length - 1);
    }
  };

  const handleGoForward = () => {
    if (!canGoForward) return;
    try {
      iframeRef.current?.contentWindow?.history.forward();
    } catch {}
    if (historyIndexRef.current < historyStackRef.current.length - 1) {
      historyIndexRef.current += 1;
      const targetUrl = historyStackRef.current[historyIndexRef.current];
      if (targetUrl) {
        lastInternalUrlRef.current = targetUrl;
        setCurrentUrl(targetUrl);
        setInputUrl(targetUrl);
        onUrlChange?.(targetUrl);
      }
      setCanGoBack(historyIndexRef.current > 0);
      setCanGoForward(historyIndexRef.current < historyStackRef.current.length - 1);
    }
  };

  const handleReload = () => {
    setIsLoading(true);
    setIframeKey((prev) => prev + 1);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenExternal = () => {
    window.open(currentUrl, '_blank', 'noopener,noreferrer');
  };

  // Get viewport style
  const getViewportStyle = () => {
    if (viewportMode === 'mobile') {
      return { width: '375px', height: '100%', maxWidth: '100%' };
    }
    if (viewportMode === 'tablet') {
      return { width: '768px', height: '100%', maxWidth: '100%' };
    }
    return { width: '100%', height: '100%' };
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#101010] text-[#cccccc] select-none font-sans overflow-hidden">
      {/* 1. Browser Navigation & URL Toolbar */}
      <div
        onContextMenu={handleOuterContextMenu}
        className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 bg-[#141414] border-b border-[#222222] shrink-0 text-xs"
      >
        {/* Navigation Buttons */}
        <div className="flex items-center gap-0.5 text-[#8c8c8c] shrink-0">
          {canGoBack && (
            <button
              type="button"
              onClick={handleGoBack}
              className="w-6 h-6 rounded-md flex items-center justify-center transition hover:bg-[#202020] text-[#cccccc] hover:text-white cursor-pointer"
              title="Go back"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          )}
          {canGoForward && (
            <button
              type="button"
              onClick={handleGoForward}
              className="w-6 h-6 rounded-md flex items-center justify-center transition hover:bg-[#202020] text-[#cccccc] hover:text-white cursor-pointer"
              title="Go forward"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
          {!canGoBack && (
            <button
              type="button"
              disabled
              className="hidden sm:flex w-6 h-6 rounded-md items-center justify-center text-[#444444] cursor-not-allowed opacity-35"
              title="No previous history"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          )}
          {!canGoForward && (
            <button
              type="button"
              disabled
              className="hidden sm:flex w-6 h-6 rounded-md items-center justify-center text-[#444444] cursor-not-allowed opacity-35"
              title="No forward history"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={handleReload}
            className="w-6 h-6 rounded-md hover:bg-[#202020] hover:text-white flex items-center justify-center transition cursor-pointer"
            title="Reload preview"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#58a6ff]' : ''}`} />
          </button>
        </div>

        {/* Address Input Bar */}
        <form onSubmit={handleNavigate} className="flex-1 flex items-center min-w-0 mx-0.5 sm:mx-1">
          <div className="flex-1 flex items-center bg-[#0d0d0d] border border-[#262626] focus-within:border-[#007acc] rounded-lg px-2 sm:px-2.5 py-1 text-xs transition min-w-0 overflow-hidden">
            {pageFavicon ? (
              <img
                src={pageFavicon}
                alt=""
                className="w-3.5 h-3.5 object-contain shrink-0 mr-1.5 rounded-xs"
                onError={() => setPageFavicon(null)}
              />
            ) : (
              <Globe className="w-3 h-3 text-[#58a6ff] shrink-0 mr-1.5 opacity-80" />
            )}
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Enter URL or port (e.g. 5173, localhost:3000)..."
              className="flex-1 bg-transparent border-none outline-none text-[#e6edf3] font-mono text-[11px] sm:text-[11.5px] placeholder-[#555555] min-w-0 truncate"
            />
            {copied ? (
              <Check className="w-3 h-3 text-[#7ee787] shrink-0 ml-1.5" />
            ) : (
              <button
                type="button"
                onClick={handleCopyUrl}
                className="text-[#666666] hover:text-[#cccccc] transition shrink-0 ml-1.5 cursor-pointer"
                title="Copy URL"
              >
                <Copy className="w-3 h-3" />
              </button>
            )}

            <div
              title={`Browser JavaScript Policy: ${browserJsPolicy}`}
              className={`hidden md:inline-flex ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono tracking-tight shrink-0 select-none ${
                browserJsPolicy === 'Disable'
                  ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                  : browserJsPolicy === 'Always Proceed'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-[#222226] text-[#a0a0a0] border border-[#2a2a30]'
              }`}
            >
              {browserJsPolicy === 'Disable' ? 'JS: OFF' : browserJsPolicy === 'Always Proceed' ? 'JS: AUTO' : 'JS: REVIEW'}
            </div>
          </div>
        </form>

        {/* Viewport Presets, Mode Switcher, Inspect & External Tab Button */}
        <div className="flex items-center gap-1 sm:gap-1.5 text-[#8c8c8c] shrink-0">
          <div className="hidden md:flex items-center bg-[#0d0d0d] border border-[#222222] rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setViewportMode('responsive')}
              className={`p-1 rounded-md transition cursor-pointer ${
                viewportMode === 'responsive'
                  ? 'bg-[#222222] text-white shadow-sm'
                  : 'hover:text-white text-[#777777]'
              }`}
              title="Responsive / Full Width"
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewportMode('tablet')}
              className={`p-1 rounded-md transition cursor-pointer ${
                viewportMode === 'tablet'
                  ? 'bg-[#222222] text-white shadow-sm'
                  : 'hover:text-white text-[#777777]'
              }`}
              title="Tablet (768px)"
            >
              <Tablet className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewportMode('mobile')}
              className={`p-1 rounded-md transition cursor-pointer ${
                viewportMode === 'mobile'
                  ? 'bg-[#222222] text-white shadow-sm'
                  : 'hover:text-white text-[#777777]'
              }`}
              title="Mobile (375px)"
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mode Switcher: Desktop full button */}
          <button
            type="button"
            onClick={() => {
              setIsProxyMode(!isProxyMode);
              setIsLoading(true);
              setIframeKey((prev) => prev + 1);
            }}
            className={`hidden sm:flex px-2 py-1 rounded-lg text-[10.5px] font-mono font-medium transition cursor-pointer items-center gap-1.5 ${
              isProxyMode
                ? 'bg-[#8957e5]/20 text-[#d2a8ff] border border-[#8957e5]/40 hover:bg-[#8957e5]/30'
                : 'bg-[#21262d] text-[#8b949e] border border-[#30363d] hover:text-[#c9d1d9] hover:bg-[#30363d]'
            }`}
            title={
              isProxyMode
                ? 'Inspector Proxy Mode active with Eruda & context bridge (Click to switch to Direct Native Mode)'
                : 'Direct Native Mode active with 100% rendering fidelity (Click to switch to Inspector Proxy Mode)'
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isProxyMode ? 'bg-[#d2a8ff] animate-pulse' : 'bg-[#3fb950]'
              }`}
            />
            <span>{isProxyMode ? 'Inspector' : 'Native'}</span>
          </button>

          {/* Mode Switcher: Mobile compact button */}
          <button
            type="button"
            onClick={() => {
              setIsProxyMode(!isProxyMode);
              setIsLoading(true);
              setIframeKey((prev) => prev + 1);
            }}
            className={`sm:hidden p-1.5 rounded-lg border transition cursor-pointer flex items-center justify-center shrink-0 ${
              isProxyMode
                ? 'bg-[#8957e5]/20 text-[#d2a8ff] border-[#8957e5]/40'
                : 'bg-[#181818] text-[#8b949e] border-[#2c2c2c]'
            }`}
            title={isProxyMode ? 'Inspector Mode active (Click for Native)' : 'Native Mode active (Click for Inspector)'}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isProxyMode ? 'bg-[#d2a8ff] animate-pulse' : 'bg-[#3fb950]'
              }`}
            />
          </button>

          {/* Desktop Inspect Button */}
          <button
            type="button"
            onClick={handleInspect}
            className="hidden sm:flex w-7 h-7 rounded-lg hover:bg-[#202020] text-[#8c8c8c] hover:text-[#58a6ff] items-center justify-center transition cursor-pointer"
            title="Inspect Element (Opens in Inspector Mode)"
          >
            <Code2 className="w-3.5 h-3.5" />
          </button>

          {/* External Tab Button */}
          <button
            type="button"
            onClick={handleOpenExternal}
            className="w-7 h-7 rounded-lg hover:bg-[#202020] text-[#8c8c8c] hover:text-white flex items-center justify-center transition cursor-pointer"
            title="Open in new browser tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>

          {/* Mobile More Options Button */}
          <button
            type="button"
            onClick={() => setIsMobileOptionsOpen(true)}
            className="sm:hidden w-7 h-7 rounded-lg hover:bg-[#202020] text-[#8c8c8c] hover:text-white flex items-center justify-center transition cursor-pointer"
            title="Browser preview options"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Main Browser Canvas or Welcome View */}
      {!currentUrl ? (
        <BrowserWelcomeView onNavigate={handleWelcomeNavigate} tasks={tasks} />
      ) : (
        <div
          onContextMenu={handleOuterContextMenu}
          className="flex-1 overflow-hidden relative flex items-center justify-center bg-[#0a0a0a]"
        >
          {/* Loading Spinner Indicator */}
          {isLoading && (
            <div className="absolute top-2 right-3 z-30 flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#181818]/90 border border-[#262626] text-[#8c8c8c] text-[11px] shadow-lg pointer-events-none backdrop-blur-sm animate-fade-in">
              <Loader2 className="w-3 h-3 text-[#007acc] animate-spin" />
              <span>Loading...</span>
            </div>
          )}

          {/* Viewport Frame */}
          <div
            style={getViewportStyle()}
            className={`h-full transition-all duration-200 relative bg-white ${
              viewportMode !== 'responsive'
                ? 'my-auto shadow-2xl border-x border-[#2a2a2a]'
                : ''
            }`}
          >
            <iframe
              key={`${iframeKey}_${isProxyMode ? 'proxy' : 'direct'}`}
              ref={iframeRef}
              src={
                isProxyMode
                  ? `/api/browser/preview?url=${encodeURIComponent(currentUrl)}${
                      autoInspectOnLoadRef.current ? '&inspect=1' : ''
                    }`
                  : currentUrl
              }
              title="aidev Live Browser Preview"
              sandbox={
                browserJsPolicy === 'Disable'
                  ? 'allow-same-origin allow-forms allow-popups allow-modals allow-downloads'
                  : 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads'
              }
              allow="camera; microphone; geolocation; clipboard-read; clipboard-write"
              onLoad={() => {
                setIsLoading(false);
                if (autoInspectOnLoadRef.current) {
                  autoInspectOnLoadRef.current = false;
                  iframeRef.current?.contentWindow?.postMessage({ type: 'AIDEV_INSPECT_OPEN' }, '*');
                  setTimeout(() => {
                    iframeRef.current?.contentWindow?.postMessage({ type: 'AIDEV_INSPECT_OPEN' }, '*');
                  }, 200);
                  setTimeout(() => {
                    iframeRef.current?.contentWindow?.postMessage({ type: 'AIDEV_INSPECT_OPEN' }, '*');
                  }, 600);
                }
                try {
                  const doc = iframeRef.current?.contentDocument;
                  if (doc && doc.title) {
                    setPageTitle(doc.title);
                    onMetadataChange?.({
                      title: doc.title,
                      favicon: pageFavicon,
                      url: currentUrl,
                    });
                  }
                } catch {}
                fetchMetadata(currentUrl);
              }}
              onError={() => setIsLoading(false)}
              className="w-full h-full border-none block bg-white"
            />
          </div>
        </div>
      )}

      {/* 3. Custom Context Menu */}
      {contextMenu && contextMenu.visible && (
        <div
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-[999999] min-w-[180px] bg-[#18181b]/95 backdrop-blur-md border border-[#2e2e34] shadow-[0_8px_30px_rgb(0,0,0,0.7)] rounded-xl p-1 text-[12px] text-[#e4e4e7] select-none animate-in fade-in zoom-in-95 duration-100 font-sans"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleInspect}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-[#27272a] text-[#f4f4f5] hover:text-white transition-colors cursor-pointer text-left group"
          >
            <Code2 className="w-3.5 h-3.5 text-[#58a6ff] group-hover:scale-110 transition-transform shrink-0" strokeWidth={1.8} />
            <span className="flex-1 font-medium">Inspect</span>
          </button>

          <div className="h-[1px] bg-[#27272a] my-1" />

          <button
            type="button"
            onClick={handleContextMenuCopy}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-[#27272a] text-[#a1a1aa] hover:text-white transition-colors cursor-pointer text-left group"
          >
            <Copy className="w-3.5 h-3.5 text-[#71717a] group-hover:text-white group-hover:scale-110 transition-transform shrink-0" strokeWidth={1.8} />
            <span className="flex-1">Copy URL</span>
          </button>

          <button
            type="button"
            onClick={handleContextMenuOpenExternal}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-[#27272a] text-[#a1a1aa] hover:text-white transition-colors cursor-pointer text-left group"
          >
            <ExternalLink className="w-3.5 h-3.5 text-[#71717a] group-hover:text-white group-hover:scale-110 transition-transform shrink-0" strokeWidth={1.8} />
            <span className="flex-1">Open in Browser</span>
          </button>
        </div>
      )}

      {/* 4. Mobile Options BottomSheet */}
      <BottomSheet
        isOpen={isMobileOptionsOpen}
        onClose={() => setIsMobileOptionsOpen(false)}
        title="Browser Preview Settings"
        zIndex={1000}
        className="w-full sm:hidden bg-[#181818] border-t border-[#262626] p-4 font-sans text-xs space-y-4"
      >
        {/* Mode Switcher */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-[#888888] uppercase tracking-wider">
            Rendering Mode
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setIsProxyMode(false);
                setIsLoading(true);
                setIframeKey((prev) => prev + 1);
                setIsMobileOptionsOpen(false);
              }}
              className={`p-2 rounded-xl border flex flex-col gap-1 text-left transition cursor-pointer ${
                !isProxyMode
                  ? 'bg-[#222222] border-[#3fb950]/50 text-white shadow-xs'
                  : 'bg-[#141414] border-[#242424] text-[#888888]'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#3fb950]" />
                <span className="font-semibold text-xs text-white">Direct Native</span>
              </div>
              <span className="text-[10.5px] text-[#777777]">Fastest 100% fidelity</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsProxyMode(true);
                setIsLoading(true);
                setIframeKey((prev) => prev + 1);
                setIsMobileOptionsOpen(false);
              }}
              className={`p-2 rounded-xl border flex flex-col gap-1 text-left transition cursor-pointer ${
                isProxyMode
                  ? 'bg-[#8957e5]/15 border-[#8957e5]/50 text-white shadow-xs'
                  : 'bg-[#141414] border-[#242424] text-[#888888]'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#d2a8ff] animate-pulse" />
                <span className="font-semibold text-xs text-white">Inspector Proxy</span>
              </div>
              <span className="text-[10.5px] text-[#777777]">With Eruda DevTools</span>
            </button>
          </div>
        </div>

        {/* JS Policy Selection */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-[#888888] uppercase tracking-wider">
            JavaScript Policy
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {(['Always Proceed', 'Request Review', 'Disable'] as const).map((policy) => (
              <button
                key={policy}
                type="button"
                onClick={() => {
                  setBrowserJsPolicy(policy);
                  if (typeof window !== 'undefined') {
                    localStorage.setItem('aidev_browser_js_policy', policy);
                  }
                  setIsLoading(true);
                  setIframeKey((prev) => prev + 1);
                }}
                className={`py-2 px-1 text-center rounded-lg text-[11px] border font-medium transition cursor-pointer ${
                  browserJsPolicy === policy
                    ? 'bg-[#222222] text-white border-[#383838]'
                    : 'bg-[#141414] text-[#777777] border-[#222222]'
                }`}
              >
                {policy === 'Always Proceed'
                  ? 'Auto'
                  : policy === 'Request Review'
                  ? 'Review'
                  : 'Disabled'}
              </button>
            ))}
          </div>
        </div>

        {/* Viewport Mode Selection */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-[#888888] uppercase tracking-wider">
            Viewport Simulation
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { id: 'responsive', label: 'Responsive', icon: Monitor },
                { id: 'tablet', label: 'Tablet (768)', icon: Tablet },
                { id: 'mobile', label: 'Mobile (375)', icon: Smartphone },
              ] as const
            ).map((v) => {
              const Icon = v.icon;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setViewportMode(v.id);
                  }}
                  className={`py-2 px-1 flex items-center justify-center gap-1 rounded-lg text-[11px] border font-medium transition cursor-pointer ${
                    viewportMode === v.id
                      ? 'bg-[#222222] text-white border-[#383838]'
                      : 'bg-[#141414] text-[#777777] border-[#222222]'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{v.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions list */}
        <div className="pt-2 border-t border-[#222222] space-y-1">
          <button
            type="button"
            onClick={() => {
              setIsMobileOptionsOpen(false);
              handleInspect();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[#141414] hover:bg-[#202020] text-white transition cursor-pointer text-xs"
          >
            <Code2 className="w-3.5 h-3.5 text-[#58a6ff]" />
            <span>Inspect Elements</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsMobileOptionsOpen(false);
              handleCopyUrl();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[#141414] hover:bg-[#202020] text-white transition cursor-pointer text-xs"
          >
            <Copy className="w-3.5 h-3.5 text-[#8c8c8c]" />
            <span>Copy Page URL</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsMobileOptionsOpen(false);
              handleOpenExternal();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-[#141414] hover:bg-[#202020] text-white transition cursor-pointer text-xs"
          >
            <ExternalLink className="w-3.5 h-3.5 text-[#8c8c8c]" />
            <span>Open in Phone Browser</span>
          </button>
        </div>
      </BottomSheet>
    </div>
  );
};
