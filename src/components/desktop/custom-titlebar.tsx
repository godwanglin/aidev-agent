'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  PanelLeft,
  ArrowLeft,
  ArrowRight,
  Minus,
  Square,
  Copy,
  X,
  Sparkles,
  Download,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { AidevLogo } from '@/components/common/antigravity-logo';

interface UpdateStatus {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  transferredBytes?: number;
  totalBytes?: number;
  error?: string;
}

type MenuType = 'file' | 'edit' | 'view' | 'help' | null;

export function CustomTitlebar() {
  const [isElectron, setIsElectron] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ status: 'idle' });
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [activeMenu, setActiveMenu] = useState<MenuType>(null);
  const [showAboutModal, setShowAboutModal] = useState(false);

  const menuBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.isElectron) {
      setIsElectron(true);
      const api = (window as any).electronAPI;

      api.isMaximized().then((max: boolean) => setIsMaximized(max));

      const unregisterMax = api.onMaximizeChange((max: boolean) => {
        setIsMaximized(max);
      });

      const unregisterUpdate = api.onUpdateStatus((status: any) => {
        setUpdateStatus(status);
        if (status.status === 'available') {
          setShowUpdateModal(true);
        }
      });

      // Global External URL Click Interceptor for Desktop
      const handleGlobalLinkClick = (e: MouseEvent) => {
        const anchor = (e.target as HTMLElement)?.closest('a');
        if (anchor && anchor.href) {
          try {
            const parsed = new URL(anchor.href);
            if (
              (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') &&
              parsed.hostname !== '127.0.0.1' &&
              parsed.hostname !== 'localhost'
            ) {
              e.preventDefault();
              e.stopPropagation();
              api.openExternal(anchor.href);
            }
          } catch {}
        }
      };

      document.addEventListener('click', handleGlobalLinkClick, true);

      return () => {
        unregisterMax?.();
        unregisterUpdate?.();
        document.removeEventListener('click', handleGlobalLinkClick, true);
      };
    }
  }, []);

  // Close desktop dropdown menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };

    if (activeMenu) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [activeMenu]);

  if (!isElectron) {
    return null;
  }

  const api = (window as any).electronAPI;

  const handleToggleSidebar = () => {
    window.dispatchEvent(new CustomEvent('aidev:toggle-sidebar'));
  };

  const handleHistoryBack = () => {
    if (typeof window !== 'undefined') window.history.back();
  };

  const handleHistoryForward = () => {
    if (typeof window !== 'undefined') window.history.forward();
  };

  const dispatchAction = (action: string) => {
    setActiveMenu(null);
    switch (action) {
      case 'new-session':
        window.dispatchEvent(new CustomEvent('aidev:new-session'));
        break;
      case 'open-folder':
        window.dispatchEvent(new CustomEvent('aidev:open-folder'));
        break;
      case 'open-settings':
        window.dispatchEvent(new CustomEvent('aidev:open-settings'));
        break;
      case 'toggle-sidebar':
        window.dispatchEvent(new CustomEvent('aidev:toggle-sidebar'));
        break;
      case 'toggle-auxiliary':
        window.dispatchEvent(new CustomEvent('aidev:toggle-auxiliary'));
        break;
      case 'reload':
        window.location.reload();
        break;
      case 'fullscreen':
        api?.maximize?.();
        break;
      case 'check-updates':
        api?.checkForUpdates?.();
        break;
      case 'about':
        setShowAboutModal(true);
        break;
      case 'exit':
        api?.close?.();
        break;
      default:
        break;
    }
  };

  return (
    <>
      {/* Gambar 2 Titlebar: PanelLeft, Back/Forward, Menus (File, Edit, View, Help), Right: Minimize, Maximize, Close */}
      <header
        className="w-full h-8.5 bg-[#14151b] border-b border-white/[0.06] flex items-center justify-between px-2 select-none z-[99999] shrink-0 text-xs text-[#a1a1aa]"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        {/* Left Section: [PanelLeft] <- -> File Edit View Help */}
        <div
          ref={menuBarRef}
          className="flex items-center gap-1 relative"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {/* 1. Toggle Sidebar Icon (PanelLeft) */}
          <button
            type="button"
            onClick={handleToggleSidebar}
            className="w-7 h-7 flex items-center justify-center rounded-md text-[#9ca3af] hover:text-white hover:bg-white/[0.08] transition cursor-pointer"
            title="Toggle Primary Sidebar (Ctrl+B)"
          >
            <PanelLeft className="w-3.5 h-3.5" />
          </button>

          {/* 2. Navigation History (Back / Forward) */}
          <div className="flex items-center gap-0.5 ml-0.5">
            <button
              type="button"
              onClick={handleHistoryBack}
              className="w-6 h-6 flex items-center justify-center rounded text-[#6b7280] hover:text-white hover:bg-white/[0.06] transition cursor-pointer"
              title="Go Back (Alt+Left)"
            >
              <ArrowLeft className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={handleHistoryForward}
              className="w-6 h-6 flex items-center justify-center rounded text-[#6b7280] hover:text-white hover:bg-white/[0.06] transition cursor-pointer"
              title="Go Forward (Alt+Right)"
            >
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* 3. Menus: File, Edit, View, Help */}
          <div className="flex items-center gap-0.5 ml-2 font-normal text-[12px] text-[#d4d4d8]">
            {/* File Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setActiveMenu(activeMenu === 'file' ? null : 'file')}
                onMouseEnter={() => activeMenu && setActiveMenu('file')}
                className={`px-2 py-1 rounded text-[11.5px] transition cursor-pointer ${
                  activeMenu === 'file' ? 'bg-white/[0.12] text-white' : 'hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                File
              </button>
              {activeMenu === 'file' && (
                <div className="absolute left-0 top-full mt-1 w-52 bg-[#1a1b23] border border-[#2e303d] rounded-lg shadow-2xl py-1 z-[100000] text-xs text-[#d1d5db] animate-in fade-in zoom-in-95 duration-100">
                  <button
                    onClick={() => dispatchAction('new-session')}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                  >
                    <span>New Session</span>
                    <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+N</span>
                  </button>
                  <button
                    onClick={() => dispatchAction('open-folder')}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                  >
                    <span>Open Project Folder...</span>
                    <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+O</span>
                  </button>
                  <div className="h-px bg-white/[0.08] my-1" />
                  <button
                    onClick={() => dispatchAction('open-settings')}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                  >
                    <span>Settings</span>
                    <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+,</span>
                  </button>
                  <div className="h-px bg-white/[0.08] my-1" />
                  <button
                    onClick={() => dispatchAction('exit')}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#ef4444]/20 hover:text-red-400 transition text-left cursor-pointer"
                  >
                    <span>Exit Aidev</span>
                    <span className="text-[10px] text-[#6b7280] font-mono">Alt+F4</span>
                  </button>
                </div>
              )}
            </div>

            {/* Edit Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setActiveMenu(activeMenu === 'edit' ? null : 'edit')}
                onMouseEnter={() => activeMenu && setActiveMenu('edit')}
                className={`px-2 py-1 rounded text-[11.5px] transition cursor-pointer ${
                  activeMenu === 'edit' ? 'bg-white/[0.12] text-white' : 'hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                Edit
              </button>
              {activeMenu === 'edit' && (
                <div className="absolute left-0 top-full mt-1 w-48 bg-[#1a1b23] border border-[#2e303d] rounded-lg shadow-2xl py-1 z-[100000] text-xs text-[#d1d5db] animate-in fade-in zoom-in-95 duration-100">
                  <button
                    onClick={() => { document.execCommand('undo'); setActiveMenu(null); }}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                  >
                    <span>Undo</span>
                    <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+Z</span>
                  </button>
                  <button
                    onClick={() => { document.execCommand('redo'); setActiveMenu(null); }}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                  >
                    <span>Redo</span>
                    <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+Y</span>
                  </button>
                  <div className="h-px bg-white/[0.08] my-1" />
                  <button
                    onClick={() => { document.execCommand('cut'); setActiveMenu(null); }}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                  >
                    <span>Cut</span>
                    <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+X</span>
                  </button>
                  <button
                    onClick={() => { document.execCommand('copy'); setActiveMenu(null); }}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                  >
                    <span>Copy</span>
                    <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+C</span>
                  </button>
                  <button
                    onClick={() => { document.execCommand('paste'); setActiveMenu(null); }}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                  >
                    <span>Paste</span>
                    <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+V</span>
                  </button>
                </div>
              )}
            </div>

            {/* View Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setActiveMenu(activeMenu === 'view' ? null : 'view')}
                onMouseEnter={() => activeMenu && setActiveMenu('view')}
                className={`px-2 py-1 rounded text-[11.5px] transition cursor-pointer ${
                  activeMenu === 'view' ? 'bg-white/[0.12] text-white' : 'hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                View
              </button>
              {activeMenu === 'view' && (
                <div className="absolute left-0 top-full mt-1 w-56 bg-[#1a1b23] border border-[#2e303d] rounded-lg shadow-2xl py-1 z-[100000] text-xs text-[#d1d5db] animate-in fade-in zoom-in-95 duration-100">
                  <button
                    onClick={() => dispatchAction('toggle-sidebar')}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                  >
                    <span>Toggle Primary Sidebar</span>
                    <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+B</span>
                  </button>
                  <button
                    onClick={() => dispatchAction('toggle-auxiliary')}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                  >
                    <span>Toggle Auxiliary Pane</span>
                    <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+Shift+B</span>
                  </button>
                  <div className="h-px bg-white/[0.08] my-1" />
                  <button
                    onClick={() => dispatchAction('reload')}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                  >
                    <span>Reload Window</span>
                    <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+R</span>
                  </button>
                  <button
                    onClick={() => dispatchAction('fullscreen')}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                  >
                    <span>Toggle Maximize</span>
                    <span className="text-[10px] text-[#6b7280] font-mono">F11</span>
                  </button>
                </div>
              )}
            </div>

            {/* Help Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setActiveMenu(activeMenu === 'help' ? null : 'help')}
                onMouseEnter={() => activeMenu && setActiveMenu('help')}
                className={`px-2 py-1 rounded text-[11.5px] transition cursor-pointer ${
                  activeMenu === 'help' ? 'bg-white/[0.12] text-white' : 'hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                Help
              </button>
              {activeMenu === 'help' && (
                <div className="absolute left-0 top-full mt-1 w-52 bg-[#1a1b23] border border-[#2e303d] rounded-lg shadow-2xl py-1 z-[100000] text-xs text-[#d1d5db] animate-in fade-in zoom-in-95 duration-100">
                  <button
                    onClick={() => dispatchAction('check-updates')}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                  >
                    <span>Check for Updates...</span>
                  </button>
                  <div className="h-px bg-white/[0.08] my-1" />
                  <button
                    onClick={() => dispatchAction('about')}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                  >
                    <span>About Aidev Desktop</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center: Draggable region + Optional update chip */}
        <div className="flex-1 h-full flex items-center justify-center px-4">
          {updateStatus.status === 'available' && (
            <button
              onClick={() => setShowUpdateModal(true)}
              style={{ WebkitAppRegion: 'no-drag' } as any}
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#3b82f6]/15 hover:bg-[#3b82f6]/25 border border-[#3b82f6]/30 text-[#60a5fa] text-[11px] font-medium transition cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#60a5fa] animate-pulse" />
              <span>Update v{updateStatus.version || ''} Tersedia</span>
            </button>
          )}

          {updateStatus.status === 'downloading' && (
            <div
              style={{ WebkitAppRegion: 'no-drag' } as any}
              className="flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-[11px] text-[#d4d4d8]"
            >
              <Download className="w-3 h-3 text-[#38bdf8] animate-bounce" />
              <span>Unduh v{updateStatus.version || ''}:</span>
              <div className="w-20 h-1.5 bg-[#27272a] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#38bdf8] to-[#818cf8] transition-all duration-200"
                  style={{ width: `${updateStatus.percent || 0}%` }}
                />
              </div>
              <span className="font-mono text-[10px] text-[#a1a1aa]">{updateStatus.percent || 0}%</span>
            </div>
          )}

          {updateStatus.status === 'downloaded' && (
            <button
              onClick={() => api?.quitAndInstall?.()}
              style={{ WebkitAppRegion: 'no-drag' } as any}
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#22c55e]/20 hover:bg-[#22c55e]/30 border border-[#22c55e]/40 text-[#4ade80] text-[11px] font-semibold transition cursor-pointer animate-pulse"
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>Restart & Pasang Update</span>
            </button>
          )}
        </div>

        {/* Right Section: Window Controls (Minimize, Maximize/Restore, Close) */}
        <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={() => api?.minimize?.()}
            className="w-10 h-7 flex items-center justify-center text-[#8e8e93] hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            title="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => api?.maximize?.()}
            className="w-10 h-7 flex items-center justify-center text-[#8e8e93] hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            title={isMaximized ? 'Restore Down' : 'Maximize'}
          >
            {isMaximized ? <Copy className="w-3 h-3 rotate-180" /> : <Square className="w-3 h-3" />}
          </button>
          <button
            onClick={() => api?.close?.()}
            className="w-10 h-7 flex items-center justify-center text-[#8e8e93] hover:text-white hover:bg-[#e81123] transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* About Modal */}
      {showAboutModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[100000] p-4 animate-fade-in">
          <div className="bg-[#18181b] border border-[#27272a] rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 mx-auto flex items-center justify-center">
              <AidevLogo className="w-12 h-12" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Aidev Desktop</h3>
              <p className="text-xs text-[#a1a1aa] mt-0.5">Autonomous Local AI Coding Agent</p>
              <p className="text-[11px] font-mono text-[#71717a] mt-1">Version 1.0.0 (Production)</p>
            </div>
            <p className="text-xs text-[#d4d4d8] leading-relaxed">
              Ultra-lightweight native coding agent powered by Electron, Next.js, and ConPTY.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowAboutModal(false)}
                className="w-full py-2 rounded-lg text-xs font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] transition shadow-md cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal / Dialog Pembaruan Aplikasi */}
      {showUpdateModal && updateStatus.status === 'available' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[100000] p-4 animate-fade-in">
          <div className="bg-[#18181b] border border-[#27272a] rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#3b82f6]/15 text-[#60a5fa] flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Versi Baru Tersedia!</h3>
                <p className="text-xs text-[#a1a1aa]">Aidev Desktop v{updateStatus.version || ''}</p>
              </div>
            </div>

            <p className="text-xs text-[#d4d4d8] leading-relaxed">
              Pembaruan mencakup peningkatan performa, perbaikan keamanan, dan pembaruan kapabilitas agen coding.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowUpdateModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#a1a1aa] hover:text-white hover:bg-white/[0.06] transition cursor-pointer"
              >
                Nanti Saja
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUpdateModal(false);
                  api?.downloadUpdate?.();
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] transition shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
