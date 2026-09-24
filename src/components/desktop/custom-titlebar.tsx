'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  PanelLeft,
  PanelRight,
  ArrowLeft,
  ArrowRight,
  Minus,
  Square,
  Copy,
  X,
  Sparkles,
  Download,
  CheckCircle2,
  Keyboard,
  ExternalLink,
  BookOpen,
  Terminal,
  Search,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Bug,
  HelpCircle,
  FolderOpen,
  Plus,
  Settings,
  LogOut,
  Code2,
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

type MenuType = 'file' | 'edit' | 'view' | 'terminal' | 'help' | null;

interface ShortcutItem {
  key: string;
  desc: string;
}

const SHORTCUT_CATEGORIES: { category: string; items: ShortcutItem[] }[] = [
  {
    category: 'Navigasi & File',
    items: [
      { key: 'Ctrl + P', desc: 'Buka File Cepat (Quick Open)' },
      { key: 'Ctrl + Shift + F', desc: 'Pencarian Kode di Semua File (Grep)' },
      { key: 'Ctrl + B', desc: 'Buka / Tutup Sidebar Kiri' },
      { key: 'Ctrl + Shift + B', desc: 'Buka / Tutup Panel Workspace Kanan' },
      { key: 'Ctrl + O', desc: 'Buka Folder Project...' },
      { key: 'Ctrl + N', desc: 'Mulai Percakapan / Sesi Baru' },
      { key: 'Alt + ← / →', desc: 'Navigasi Riwayat (Back / Forward)' },
    ],
  },
  {
    category: 'Terminal & Workspace',
    items: [
      { key: 'Ctrl + `', desc: 'Buka / Alihkan ke Tab Terminal' },
      { key: 'Ctrl + Shift + `', desc: 'Buat Tab Terminal Baru' },
      { key: 'F11', desc: 'Layar Penuh (Toggle Fullscreen)' },
    ],
  },
  {
    category: 'Tampilan & Layar',
    items: [
      { key: 'Ctrl + + / =', desc: 'Perbesar Layar (Zoom In)' },
      { key: 'Ctrl + -', desc: 'Perkecil Layar (Zoom Out)' },
      { key: 'Ctrl + 0', desc: 'Reset Ukuran Layar (100%)' },
    ],
  },
  {
    category: 'Chat & AI Coding Agent',
    items: [
      { key: 'Enter', desc: 'Kirim Instruksi ke AI Agent' },
      { key: 'Shift + Enter', desc: 'Baris Baru di Chatbox' },
      { key: '@', desc: 'Mention & Sisipkan File ke Konteks' },
      { key: '/', desc: 'Panggil Slash Command (/plan, /test, dll)' },
      { key: 'Ctrl + ,', desc: 'Buka Pengaturan (Settings)' },
      { key: 'Ctrl + K Ctrl + S', desc: 'Buka Referensi Shortcut Ini' },
    ],
  },
];

export function CustomTitlebar() {
  const [isElectron, setIsElectron] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ status: 'idle' });
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [activeMenu, setActiveMenu] = useState<MenuType>(null);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [shortcutSearch, setShortcutSearch] = useState('');

  const menuBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((d) => {
        setIsLoggedIn(Boolean(d?.settings?.apiKey && d.settings.apiKey.trim().length > 0));
      })
      .catch(() => {});

    const handleConfigUpdated = (e: any) => {
      const key = e?.detail?.apiKey;
      setIsLoggedIn(Boolean(key && String(key).trim().length > 0));
      setActiveMenu(null);
    };

    window.addEventListener('aidev:config-updated', handleConfigUpdated);
    return () => window.removeEventListener('aidev:config-updated', handleConfigUpdated);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.isElectron) {
      setIsElectron(true);
      const api = (window as any).electronAPI;

      api.isMaximized().then((max: boolean) => setIsMaximized(max));

      const unregisterMax = api.onMaximizeChange((max: boolean) => {
        setIsMaximized(max);
      });

      const unregisterUpdate = api.onUpdateStatus((info: any) => {
        setUpdateStatus((prev) => ({
          ...info,
          version: info.version || prev.version,
        }));
        if (info.status === 'downloaded') {
          setShowUpdateModal(true);
        }
      });

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

  // Global Keyboard Shortcuts (F11, Ctrl+`, Ctrl+K Ctrl+S)
  useEffect(() => {
    const api = (window as any).electronAPI;
    let ctrlKPressed = false;
    let ctrlKTimeout: any;

    const handleKeyDown = (e: KeyboardEvent) => {

      // F11 -> Toggle Fullscreen
      if (e.key === 'F11') {
        e.preventDefault();
        if (api?.toggleFullScreen) {
          api.toggleFullScreen();
        } else {
          api?.maximize?.();
        }
        return;
      }

      // Ctrl+` -> Toggle Terminal
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        if (e.shiftKey) {
          window.dispatchEvent(new CustomEvent('aidev:new-terminal'));
        } else {
          window.dispatchEvent(new CustomEvent('aidev:toggle-terminal'));
        }
        return;
      }

      // Chord Ctrl+K Ctrl+S -> Keyboard Shortcuts
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        ctrlKPressed = true;
        clearTimeout(ctrlKTimeout);
        ctrlKTimeout = setTimeout(() => {
          ctrlKPressed = false;
        }, 1200);
      } else if (ctrlKPressed && (e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        ctrlKPressed = false;
        clearTimeout(ctrlKTimeout);
        setShowShortcutsModal(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(ctrlKTimeout);
    };
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
      case 'exit':
        api?.close?.();
        break;

      case 'undo':
        document.execCommand('undo');
        break;
      case 'redo':
        document.execCommand('redo');
        break;
      case 'cut':
        document.execCommand('cut');
        break;
      case 'copy':
        document.execCommand('copy');
        break;
      case 'paste':
        document.execCommand('paste');
        break;
      case 'select-all':
        document.execCommand('selectAll');
        break;

      case 'quick-open':
      case 'command-palette':
        window.dispatchEvent(new CustomEvent('aidev:open-quick-open'));
        break;
      case 'grep-search':
        window.dispatchEvent(new CustomEvent('aidev:open-grep'));
        break;
      case 'toggle-sidebar':
        window.dispatchEvent(new CustomEvent('aidev:toggle-sidebar'));
        break;
      case 'toggle-auxiliary':
        window.dispatchEvent(new CustomEvent('aidev:toggle-auxiliary'));
        break;
      case 'toggle-terminal':
        window.dispatchEvent(new CustomEvent('aidev:toggle-terminal'));
        break;
      case 'new-terminal':
        window.dispatchEvent(new CustomEvent('aidev:new-terminal'));
        break;

      case 'zoom-in':
        api?.zoomIn?.();
        break;
      case 'zoom-out':
        api?.zoomOut?.();
        break;
      case 'reset-zoom':
        api?.resetZoom?.();
        break;
      case 'toggle-fullscreen':
        if (api?.toggleFullScreen) {
          api.toggleFullScreen();
        } else {
          api?.maximize?.();
        }
        break;

      case 'docs':
        api?.openExternal?.('https://github.com/godwanglin/aidev-agent#readme');
        break;
      case 'report-issue':
        api?.openExternal?.('https://github.com/godwanglin/aidev-agent/issues');
        break;
      case 'shortcuts':
        setShowShortcutsModal(true);
        break;
      case 'check-updates':
        setUpdateStatus({ status: 'checking' });
        setShowAboutModal(true);
        api?.checkForUpdates?.();
        setTimeout(() => {
          setUpdateStatus((prev) => (prev.status === 'checking' ? { status: 'not-available' } : prev));
        }, 1200);
        break;
      case 'about':
        setShowAboutModal(true);
        break;
      default:
        break;
    }
  };

  const filteredShortcuts = SHORTCUT_CATEGORIES.map((cat) => ({
    ...cat,
    items: cat.items.filter(
      (item) =>
        item.desc.toLowerCase().includes(shortcutSearch.toLowerCase()) ||
        item.key.toLowerCase().includes(shortcutSearch.toLowerCase())
    ),
  })).filter((cat) => cat.items.length > 0);

  return (
    <>
      <header
        className="w-full h-9 bg-[#14151b] border-b border-white/[0.06] flex items-center justify-between px-2 select-none z-[99999] shrink-0 text-xs text-[#a1a1aa]"
      >
        {/* Left Section: [PanelLeft] <- -> File Edit View Terminal Help */}
        <div
          ref={menuBarRef}
          className="flex items-center gap-1 relative h-full"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {isLoggedIn && (
            <>
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
            </>
          )}

          {/* 3. Menus: File, Edit, View, Terminal (when logged in) + Help (always visible) */}
          <div
            className={`flex items-center gap-0.5 ${isLoggedIn ? 'ml-2' : 'ml-1'} font-normal text-[12px] text-[#d4d4d8]`}
            style={{ WebkitAppRegion: 'no-drag' } as any}
          >
            {isLoggedIn && (
              <>
                {/* File Menu */}
                <div className="relative" style={{ WebkitAppRegion: 'no-drag' } as any}>
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
                    <div
                      style={{ WebkitAppRegion: 'no-drag' } as any}
                      className="absolute left-0 top-full mt-1 w-56 bg-[#1a1b23] border border-[#2e303d] rounded-lg shadow-2xl py-1 z-[100000] text-xs text-[#d1d5db] animate-in fade-in zoom-in-95 duration-100"
                    >
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
                <div className="relative" style={{ WebkitAppRegion: 'no-drag' } as any}>
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
                    <div
                      style={{ WebkitAppRegion: 'no-drag' } as any}
                      className="absolute left-0 top-full mt-1 w-48 bg-[#1a1b23] border border-[#2e303d] rounded-lg shadow-2xl py-1 z-[100000] text-xs text-[#d1d5db] animate-in fade-in zoom-in-95 duration-100"
                    >
                      <button
                        onClick={() => dispatchAction('undo')}
                        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                      >
                        <span>Undo</span>
                        <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+Z</span>
                      </button>
                      <button
                        onClick={() => dispatchAction('redo')}
                        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                      >
                        <span>Redo</span>
                        <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+Y</span>
                      </button>
                      <div className="h-px bg-white/[0.08] my-1" />
                      <button
                        onClick={() => dispatchAction('cut')}
                        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                      >
                        <span>Cut</span>
                        <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+X</span>
                      </button>
                      <button
                        onClick={() => dispatchAction('copy')}
                        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                      >
                        <span>Copy</span>
                        <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+C</span>
                      </button>
                      <button
                        onClick={() => dispatchAction('paste')}
                        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                      >
                        <span>Paste</span>
                        <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+V</span>
                      </button>
                      <div className="h-px bg-white/[0.08] my-1" />
                      <button
                        onClick={() => dispatchAction('select-all')}
                        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                      >
                        <span>Select All</span>
                        <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+A</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* View Menu */}
                <div className="relative" style={{ WebkitAppRegion: 'no-drag' } as any}>
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
                    <div
                      style={{ WebkitAppRegion: 'no-drag' } as any}
                      className="absolute left-0 top-full mt-1 w-64 bg-[#1a1b23] border border-[#2e303d] rounded-lg shadow-2xl py-1 z-[100000] text-xs text-[#d1d5db] animate-in fade-in zoom-in-95 duration-100"
                    >
                      <button
                        onClick={() => dispatchAction('command-palette')}
                        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <Code2 className="w-3.5 h-3.5 text-[#58a6ff]" />
                          <span>Command Palette...</span>
                        </span>
                        <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+Shift+P</span>
                      </button>
                      <button
                        onClick={() => dispatchAction('quick-open')}
                        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <Search className="w-3.5 h-3.5 text-[#58a6ff]" />
                          <span>Quick Open File...</span>
                        </span>
                        <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+P</span>
                      </button>
                      <button
                        onClick={() => dispatchAction('grep-search')}
                        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <Search className="w-3.5 h-3.5 text-[#a855f7]" />
                          <span>Search across Files...</span>
                        </span>
                        <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+Shift+F</span>
                      </button>
                      <div className="h-px bg-white/[0.08] my-1" />
                      <button
                        onClick={() => dispatchAction('toggle-sidebar')}
                        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <PanelLeft className="w-3.5 h-3.5 text-[#9ca3af]" />
                          <span>Toggle Primary Sidebar</span>
                        </span>
                        <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+B</span>
                      </button>
                      <button
                        onClick={() => dispatchAction('toggle-auxiliary')}
                        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <PanelRight className="w-3.5 h-3.5 text-[#9ca3af]" />
                          <span>Toggle Workspace Panel</span>
                        </span>
                        <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+Shift+B</span>
                      </button>
                      <button
                        onClick={() => dispatchAction('toggle-terminal')}
                        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <Terminal className="w-3.5 h-3.5 text-[#10b981]" />
                          <span>Toggle Terminal</span>
                        </span>
                        <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+`</span>
                      </button>
                      <div className="h-px bg-white/[0.08] my-1" />
                      <button
                        onClick={() => dispatchAction('zoom-in')}
                        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <ZoomIn className="w-3.5 h-3.5 text-[#9ca3af]" />
                          <span>Zoom In</span>
                        </span>
                        <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+=</span>
                      </button>
                      <button
                        onClick={() => dispatchAction('zoom-out')}
                        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <ZoomOut className="w-3.5 h-3.5 text-[#9ca3af]" />
                          <span>Zoom Out</span>
                        </span>
                        <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+-</span>
                      </button>
                      <button
                        onClick={() => dispatchAction('reset-zoom')}
                        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <RotateCcw className="w-3.5 h-3.5 text-[#9ca3af]" />
                          <span>Reset Zoom</span>
                        </span>
                        <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+0</span>
                      </button>
                      <div className="h-px bg-white/[0.08] my-1" />
                      <button
                        onClick={() => dispatchAction('toggle-fullscreen')}
                        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <Maximize2 className="w-3.5 h-3.5 text-[#9ca3af]" />
                          <span>Toggle Fullscreen</span>
                        </span>
                        <span className="text-[10px] text-[#6b7280] font-mono">F11</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Terminal Menu */}
                <div className="relative" style={{ WebkitAppRegion: 'no-drag' } as any}>
                  <button
                    type="button"
                    onClick={() => setActiveMenu(activeMenu === 'terminal' ? null : 'terminal')}
                    onMouseEnter={() => activeMenu && setActiveMenu('terminal')}
                    className={`px-2 py-1 rounded text-[11.5px] transition cursor-pointer ${
                      activeMenu === 'terminal' ? 'bg-white/[0.12] text-white' : 'hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    Terminal
                  </button>
                  {activeMenu === 'terminal' && (
                    <div
                      style={{ WebkitAppRegion: 'no-drag' } as any}
                      className="absolute left-0 top-full mt-1 w-56 bg-[#1a1b23] border border-[#2e303d] rounded-lg shadow-2xl py-1 z-[100000] text-xs text-[#d1d5db] animate-in fade-in zoom-in-95 duration-100"
                    >
                      <button
                        onClick={() => dispatchAction('new-terminal')}
                        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <Terminal className="w-3.5 h-3.5 text-[#10b981]" />
                          <span>New Terminal</span>
                        </span>
                        <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+Shift+`</span>
                      </button>
                      <button
                        onClick={() => dispatchAction('toggle-terminal')}
                        className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                      >
                        <span>Toggle Terminal Panel</span>
                        <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+`</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Help Menu */}
            <div className="relative" style={{ WebkitAppRegion: 'no-drag' } as any}>
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
                <div
                  style={{ WebkitAppRegion: 'no-drag' } as any}
                  className="absolute left-0 top-full mt-1 w-64 bg-[#1a1b23] border border-[#2e303d] rounded-lg shadow-2xl py-1 z-[100000] text-xs text-[#d1d5db] animate-in fade-in zoom-in-95 duration-100"
                >
                  <button
                    onClick={() => dispatchAction('docs')}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <BookOpen className="w-3.5 h-3.5 text-[#38bdf8]" />
                      <span>Documentation & Guide</span>
                    </span>
                    <ExternalLink className="w-3 h-3 text-[#6b7280]" />
                  </button>
                  <button
                    onClick={() => dispatchAction('shortcuts')}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Keyboard className="w-3.5 h-3.5 text-[#f59e0b]" />
                      <span>Keyboard Shortcuts</span>
                    </span>
                    <span className="text-[10px] text-[#6b7280] font-mono">Ctrl+K Ctrl+S</span>
                  </button>
                  <div className="h-px bg-white/[0.08] my-1" />
                  <button
                    onClick={() => dispatchAction('report-issue')}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Bug className="w-3.5 h-3.5 text-[#ef4444]" />
                      <span>Report an Issue...</span>
                    </span>
                    <ExternalLink className="w-3 h-3 text-[#6b7280]" />
                  </button>
                  <div className="h-px bg-white/[0.08] my-1" />
                  <button
                    onClick={() => dispatchAction('check-updates')}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                  >
                    <span>Check for Updates...</span>
                  </button>
                  <button
                    onClick={() => dispatchAction('about')}
                    className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#3b82f6]/20 hover:text-white transition text-left cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <HelpCircle className="w-3.5 h-3.5 text-[#a1a1aa]" />
                      <span>About Aidev Desktop</span>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center: Draggable region + Optional update chip */}
        <div
          className="flex-1 h-full flex items-center justify-center px-4"
          style={{ WebkitAppRegion: 'drag' } as any}
        >
          {updateStatus.status === 'available' && (
            <button
              onClick={() => setShowUpdateModal(true)}
              style={{ WebkitAppRegion: 'no-drag' } as any}
              className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#3b82f6]/15 hover:bg-[#3b82f6]/25 border border-[#3b82f6]/30 text-[#60a5fa] text-[11px] font-medium transition cursor-pointer"
            >
              <Sparkles className="w-3 h-3 animate-pulse" />
              <span>Pembaruan v{updateStatus.version || ''} Tersedia</span>
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

        {/* Right Section: Workspace Panel Toggle (when logged in) + Window Controls (Minimize, Maximize/Restore, Close) */}
        <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: 'no-drag' } as any}>
          {isLoggedIn && (
            <button
              type="button"
              onClick={() => dispatchAction('toggle-auxiliary')}
              className="w-7 h-7 flex items-center justify-center rounded-md text-[#9ca3af] hover:text-white hover:bg-white/[0.08] transition cursor-pointer mr-1"
              title="Toggle Workspace Panel (Ctrl+Shift+B)"
            >
              <PanelRight className="w-3.5 h-3.5" />
            </button>
          )}
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

      {/* Keyboard Shortcuts Reference Modal */}
      {showShortcutsModal && (
        <div
          style={{ WebkitAppRegion: 'no-drag' } as any}
          className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[100000] p-4 animate-fade-in"
          onClick={() => setShowShortcutsModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#18181c] border border-[#27272e] rounded-2xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden font-sans select-none"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] bg-[#1d1d23]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#3b82f6]/15 flex items-center justify-center text-[#60a5fa]">
                  <Keyboard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Keyboard Shortcuts</h3>
                  <p className="text-[11px] text-[#9ca3af]">Daftar tombol pintas untuk mempercepat alur kerja</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShortcutsModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-[#9ca3af] hover:text-white hover:bg-white/[0.08] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-3 border-b border-white/[0.06] bg-[#141418]">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#6b7280] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari pintasan keyboard..."
                  value={shortcutSearch}
                  onChange={(e) => setShortcutSearch(e.target.value)}
                  className="w-full bg-[#1e1e24] border border-[#2f313d] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-[#6b7280] focus:outline-none focus:border-[#3b82f6]"
                />
              </div>
            </div>

            {/* Shortcuts Content List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 select-text">
              {filteredShortcuts.map((category) => (
                <div key={category.category} className="space-y-2">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[#71717a]">
                    {category.category}
                  </h4>
                  <div className="space-y-1 bg-[#141418] rounded-xl border border-white/[0.04] p-1.5">
                    {category.items.map((sc) => (
                      <div
                        key={sc.key}
                        className="flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-white/[0.03] transition text-xs"
                      >
                        <span className="text-[#d1d5db]">{sc.desc}</span>
                        <kbd className="px-2 py-0.5 rounded bg-white/[0.08] border border-white/10 font-mono text-[10.5px] text-[#93c5fd]">
                          {sc.key}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {filteredShortcuts.length === 0 && (
                <div className="py-8 text-center text-xs text-[#71717a]">
                  Tidak ada pintasan yang cocok dengan pencarian "{shortcutSearch}"
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-white/[0.06] bg-[#18181c] flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowShortcutsModal(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] transition shadow-md cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* About Modal */}
      {showAboutModal && (
        <div
          style={{ WebkitAppRegion: 'no-drag' } as any}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[100000] p-4 animate-fade-in"
          onClick={() => setShowAboutModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#18181b] border border-[#27272a] rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4 font-sans select-none"
          >
            <div className="w-12 h-12 mx-auto flex items-center justify-center">
              <AidevLogo className="w-12 h-12" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Aidev Desktop</h3>
              <p className="text-xs text-[#a1a1aa] mt-0.5">Autonomous Local AI Coding Agent</p>
              <p className="text-[11px] font-mono text-[#71717a] mt-1">Version 1.0.7</p>
            </div>
            {updateStatus.status === 'checking' && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.05] border border-white/10 text-[11px] text-[#a1a1aa]">
                <Sparkles className="w-3 h-3 text-[#60a5fa] animate-spin" />
                <span>Memeriksa pembaruan...</span>
              </div>
            )}
            {updateStatus.status === 'not-available' && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/25 text-[11px] text-[#4ade80]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Sudah menggunakan versi terbaru (v1.0.7)</span>
              </div>
            )}
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

      {/* Modal / Dialog Pembaruan Aplikasi (Muncul saat sudah 100% terunduh di background) */}
      {showUpdateModal && updateStatus.status === 'downloaded' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[100000] p-4 animate-fade-in">
          <div className="bg-[#18181b] border border-[#27272a] rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 font-sans select-none">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#22c55e]/15 text-[#4ade80] flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Pembaruan Siap Dipasang!</h3>
                <p className="text-xs text-[#a1a1aa]">Aidev Desktop v{updateStatus.version || ''}</p>
              </div>
            </div>

            <p className="text-xs text-[#d4d4d8] leading-relaxed">
              Versi terbaru sudah selesai diunduh di latar belakang. Klik <strong>Restart &amp; Update</strong> untuk langsung memperbarui aplikasi secara otomatis tanpa wizard instalasi.
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
                  api?.quitAndInstall?.();
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#16a34a] hover:bg-[#15803d] transition shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restart &amp; Update</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
