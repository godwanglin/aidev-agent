'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  MoreVertical,
  Pencil,
  Sparkles,
  Bookmark,
  BookmarkCheck,
  Copy,
  Split,
  Trash2,
  ChevronRight,
  Check,
  Columns2,
  Rows2,
  Minimize2,
  Terminal,
  Plus,
} from 'lucide-react';
import type { SessionRecord } from '@/lib/db';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useTheme } from '@/context/theme-context';

interface SessionMenuProps {
  session: SessionRecord;
  projectName?: string;
  isSplitActive?: boolean;
  onStartRename: (session: SessionRecord) => void;
  onAutoRename: (sessionId: string) => void;
  onToggleUnread: (session: SessionRecord) => void;
  onSplitSession: (session: SessionRecord, direction: 'right' | 'down') => void;
  onRemoveFromSplit?: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onOpenTerminal?: () => void;
  onNewTerminal?: () => void;
  align?: 'left' | 'right';
}

export const SessionMenu: React.FC<SessionMenuProps> = ({
  session,
  projectName = '',
  isSplitActive = false,
  onStartRename,
  onAutoRename,
  onToggleUnread,
  onSplitSession,
  onRemoveFromSplit,
  onDeleteSession,
  onOpenTerminal,
  onNewTerminal,
  align = 'right',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<'copy' | 'split' | 'terminal' | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [menuCoords, setMenuCoords] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 640 : false));

  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 192; // 12rem / w-48
    const menuHeight = 220;

    // Default: pop out to the right (keluar ke kanan)
    let left = rect.right + 6;
    let top = rect.top - 2;

    // If opening to the right would overflow screen width, flip to left
    if (left + menuWidth > window.innerWidth - 12) {
      left = Math.max(12, rect.left - menuWidth - 6);
    }

    // If opening downwards would overflow screen height, push upwards
    if (top + menuHeight > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - menuHeight - 12);
    }

    setMenuCoords({ top, left });
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (!isOpen) {
      if (!isMobile) {
        updatePosition();
      }
      setIsOpen(true);
      setActiveSubmenu(null);
    } else {
      setIsOpen(false);
      setActiveSubmenu(null);
    }
  };

  useEffect(() => {
    if (!isOpen || isMobile) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
        setActiveSubmenu(null);
      }
    };

    const handleScrollOrResize = () => {
      setIsOpen(false);
      setActiveSubmenu(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setActiveSubmenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopyFeedback(label);
    setTimeout(() => {
      setCopyFeedback(null);
      setIsOpen(false);
      setActiveSubmenu(null);
    }, 800);
  };

  const isUnread = Boolean(session.is_unread);

  const submenuToLeft = menuCoords
    ? menuCoords.left + 192 + 180 > (typeof window !== 'undefined' ? window.innerWidth : 1000)
    : false;

  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  return (
    <div className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className={`w-5 h-5 flex items-center justify-center rounded transition cursor-pointer ${
          isLight
            ? 'text-[#6e6e76] hover:text-[#111113] hover:bg-[#e4e4eb]'
            : 'text-[#7e7e85] hover:text-[#dededf] hover:bg-[#232326]'
        }`}
        title="More actions"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>

      {/* Mobile Version: Bottom Sheet with Drag to Close */}
      {mounted && isMobile && (
        <BottomSheet
          isOpen={isOpen}
          onClose={() => {
            setIsOpen(false);
            setActiveSubmenu(null);
          }}
          title={session.title || 'Conversation Actions'}
          zIndex={99999}
          className={
            isLight
              ? 'bg-[#ffffff] border-t border-[#e2e2e7] text-[#2a2a30] p-2'
              : 'bg-[#18181b] border-t border-[#2a2a2e] text-[#dededf] p-2'
          }
        >
          <div className="space-y-1 p-1">
            {/* 1. Rename */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onStartRename(session);
              }}
              className={`w-full px-3.5 py-3 rounded-xl flex items-center gap-3 transition cursor-pointer text-left text-[13.5px] ${
                isLight ? 'hover:bg-[#f0f0f4] text-[#2a2a30]' : 'hover:bg-[#232326] text-[#dededf]'
              }`}
            >
              <Pencil className="w-4 h-4 text-[#8a8a92]" />
              <span>Rename</span>
            </button>

            {/* 2. Auto Rename (AI) */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onAutoRename(session.id);
              }}
              className={`w-full px-3.5 py-3 rounded-xl flex items-center gap-3 transition cursor-pointer text-left text-[13.5px] ${
                isLight ? 'hover:bg-[#f0f0f4] text-[#2a2a30]' : 'hover:bg-[#232326] text-[#dededf]'
              }`}
            >
              <Sparkles className="w-4 h-4 text-[#e8975f]" />
              <span>Auto Rename (AI)</span>
            </button>

            {/* 3. Mark Unread / Read */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onToggleUnread(session);
              }}
              className={`w-full px-3.5 py-3 rounded-xl flex items-center gap-3 transition cursor-pointer text-left text-[13.5px] ${
                isLight ? 'hover:bg-[#f0f0f4] text-[#2a2a30]' : 'hover:bg-[#232326] text-[#dededf]'
              }`}
            >
              {isUnread ? (
                <>
                  <BookmarkCheck className="w-4 h-4 text-[#3b82f6]" />
                  <span>Mark as Read</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-4 h-4 text-[#8a8a92]" />
                  <span>Mark Unread</span>
                </>
              )}
            </button>

            <div className={`my-1.5 border-t ${isLight ? 'border-[#e5e5eb]' : 'border-[#26262b]'}`} />

            {/* 4. Terminal Section */}
            <div className={`px-3.5 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wider ${
              isLight ? 'text-[#8a8a92]' : 'text-[#6e6e76]'
            }`}>
              Terminal
            </div>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenTerminal ? onOpenTerminal() : onNewTerminal?.();
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl flex items-center gap-3 transition cursor-pointer text-left text-[13.5px] ${
                isLight ? 'hover:bg-[#f0f0f4] text-[#2a2a30]' : 'hover:bg-[#232326] text-[#dededf]'
              }`}
            >
              <Terminal className="w-4 h-4 text-[#8a8a92]" />
              <span>Open Terminal</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onNewTerminal?.();
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl flex items-center gap-3 transition cursor-pointer text-left text-[13.5px] ${
                isLight ? 'hover:bg-[#f0f0f4] text-[#2a2a30]' : 'hover:bg-[#232326] text-[#dededf]'
              }`}
            >
              <Plus className="w-4 h-4 text-[#8a8a92]" />
              <span>New Terminal</span>
            </button>

            <div className={`my-1.5 border-t ${isLight ? 'border-[#e5e5eb]' : 'border-[#26262b]'}`} />

            {/* 5. Copy Section */}
            <div className={`px-3.5 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wider ${
              isLight ? 'text-[#8a8a92]' : 'text-[#6e6e76]'
            }`}>
              Copy
            </div>
            <button
              type="button"
              onClick={() => handleCopy(session.title, 'name')}
              className={`w-full px-3.5 py-2.5 rounded-xl flex items-center justify-between transition cursor-pointer text-left text-[13.5px] ${
                isLight ? 'hover:bg-[#f0f0f4] text-[#2a2a30]' : 'hover:bg-[#232326] text-[#dededf]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Copy className="w-4 h-4 text-[#8a8a92]" />
                <span>Copy Conversation Name</span>
              </div>
              {copyFeedback === 'name' && <Check className="w-4 h-4 text-[#7ee787]" />}
            </button>
            <button
              type="button"
              onClick={() => handleCopy(session.id, 'id')}
              className={`w-full px-3.5 py-2.5 rounded-xl flex items-center justify-between transition cursor-pointer text-left text-[13.5px] ${
                isLight ? 'hover:bg-[#f0f0f4] text-[#2a2a30]' : 'hover:bg-[#232326] text-[#dededf]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Copy className="w-4 h-4 text-[#8a8a92]" />
                <span>Copy Conversation ID</span>
              </div>
              {copyFeedback === 'id' && <Check className="w-4 h-4 text-[#7ee787]" />}
            </button>
            {projectName && (
              <button
                type="button"
                onClick={() => handleCopy(projectName, 'proj')}
                className={`w-full px-3.5 py-2.5 rounded-xl flex items-center justify-between transition cursor-pointer text-left text-[13.5px] ${
                  isLight ? 'hover:bg-[#f0f0f4] text-[#2a2a30]' : 'hover:bg-[#232326] text-[#dededf]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Copy className="w-4 h-4 text-[#8a8a92]" />
                  <span>Copy Project Name</span>
                </div>
                {copyFeedback === 'proj' && <Check className="w-4 h-4 text-[#7ee787]" />}
              </button>
            )}

            <div className={`my-1.5 border-t ${isLight ? 'border-[#e5e5eb]' : 'border-[#26262b]'}`} />

            {/* 6. Delete */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onDeleteSession(session.id);
              }}
              className="w-full px-3.5 py-3 rounded-xl flex items-center gap-3 text-[#ef4444] hover:bg-red-500/10 transition cursor-pointer text-left text-[13.5px] font-medium"
            >
              <Trash2 className="w-4 h-4 text-[#ef4444]" />
              <span>Delete Conversation</span>
            </button>
          </div>
        </BottomSheet>
      )}

      {/* Desktop Version: Popover Dropdown via createPortal */}
      {mounted &&
        !isMobile &&
        isOpen &&
        menuCoords &&
        createPortal(
          <div
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: `${menuCoords.top}px`,
              left: `${menuCoords.left}px`,
              zIndex: 99999,
            }}
            className={`w-48 rounded-xl shadow-2xl py-1 text-[12.5px] select-none animate-dropdown font-sans ${
              isLight
                ? 'bg-[#ffffff] border border-[#e2e2e7] text-[#2a2a30] shadow-[0_10px_25px_rgba(0,0,0,0.08)]'
                : 'bg-[#18181b] border border-[#2b2b30] text-[#c4c4c8] shadow-2xl'
            }`}
          >
            {/* 1. Rename */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onStartRename(session);
              }}
              className={`w-full px-3 py-1.5 flex items-center gap-2.5 transition cursor-pointer text-left ${
                isLight ? 'hover:bg-[#f2f2f6] hover:text-[#111113]' : 'hover:bg-[#232326] hover:text-[#dededf]'
              }`}
            >
              <Pencil className="w-3.5 h-3.5 text-[#8a8a92]" />
              <span>Rename</span>
            </button>

            {/* 2. Auto Rename (AI) */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onAutoRename(session.id);
              }}
              className={`w-full px-3 py-1.5 flex items-center gap-2.5 transition cursor-pointer text-left ${
                isLight ? 'hover:bg-[#f2f2f6] hover:text-[#111113]' : 'hover:bg-[#232326] hover:text-[#dededf]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#e8975f]" />
              <span>Auto Rename (AI)</span>
            </button>

            {/* 3. Mark Unread / Mark Read */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onToggleUnread(session);
              }}
              className={`w-full px-3 py-1.5 flex items-center gap-2.5 transition cursor-pointer text-left ${
                isLight ? 'hover:bg-[#f2f2f6] hover:text-[#111113]' : 'hover:bg-[#232326] hover:text-[#dededf]'
              }`}
            >
              {isUnread ? (
                <>
                  <BookmarkCheck className="w-3.5 h-3.5 text-[#3b82f6]" />
                  <span>Mark as Read</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-3.5 h-3.5 text-[#8a8a92]" />
                  <span>Mark Unread</span>
                </>
              )}
            </button>

            <div className={`my-1 border-t ${isLight ? 'border-[#e5e5eb]' : 'border-[#26262b]'}`} />

            {/* 4. Terminal Submenu / Direct Action */}
            <div
              className="relative"
              onMouseEnter={() => setActiveSubmenu('terminal')}
              onMouseLeave={() => setActiveSubmenu(null)}
            >
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenTerminal ? onOpenTerminal() : onNewTerminal?.();
                }}
                className={`w-full px-3 py-1.5 flex items-center justify-between transition cursor-pointer text-left ${
                  isLight ? 'hover:bg-[#f2f2f6] hover:text-[#111113]' : 'hover:bg-[#232326] hover:text-[#dededf]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Terminal className="w-3.5 h-3.5 text-[#8a8a92]" />
                  <span>Terminal</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[#6e6e76]" />
              </button>

              {activeSubmenu === 'terminal' && (
                <div
                  className={`absolute ${
                    submenuToLeft ? 'right-full mr-1' : 'left-full ml-1'
                  } top-0 w-44 rounded-xl py-1 z-50 animate-dropdown ${
                    isLight
                      ? 'bg-[#ffffff] border border-[#e2e2e7] shadow-[0_10px_25px_rgba(0,0,0,0.08)]'
                      : 'bg-[#18181b] border border-[#2b2b30] shadow-2xl'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onOpenTerminal ? onOpenTerminal() : onNewTerminal?.();
                    }}
                    className={`w-full px-3 py-1.5 flex items-center gap-2 transition cursor-pointer text-left text-[12px] ${
                      isLight ? 'hover:bg-[#f2f2f6] hover:text-[#111113]' : 'hover:bg-[#232326] hover:text-[#dededf]'
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5 text-[#8a8a92]" />
                    <span>Open Terminal</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onNewTerminal?.();
                    }}
                    className={`w-full px-3 py-1.5 flex items-center gap-2 transition cursor-pointer text-left text-[12px] ${
                      isLight ? 'hover:bg-[#f2f2f6] hover:text-[#111113]' : 'hover:bg-[#232326] hover:text-[#dededf]'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5 text-[#8a8a92]" />
                    <span>New Terminal</span>
                  </button>
                </div>
              )}
            </div>

            {/* 5. Copy Submenu */}
            <div
              className="relative"
              onMouseEnter={() => setActiveSubmenu('copy')}
              onMouseLeave={() => setActiveSubmenu(null)}
            >
              <button
                type="button"
                className={`w-full px-3 py-1.5 flex items-center justify-between transition cursor-pointer text-left ${
                  isLight ? 'hover:bg-[#f2f2f6] hover:text-[#111113]' : 'hover:bg-[#232326] hover:text-[#dededf]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Copy className="w-3.5 h-3.5 text-[#8a8a92]" />
                  <span>Copy</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[#6e6e76]" />
              </button>

              {activeSubmenu === 'copy' && (
                <div
                  className={`absolute ${
                    submenuToLeft ? 'right-full mr-1' : 'left-full ml-1'
                  } top-0 w-44 rounded-xl py-1 z-50 animate-dropdown ${
                    isLight
                      ? 'bg-[#ffffff] border border-[#e2e2e7] shadow-[0_10px_25px_rgba(0,0,0,0.08)]'
                      : 'bg-[#18181b] border border-[#2b2b30] shadow-2xl'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleCopy(session.title, 'name')}
                    className={`w-full px-3 py-1.5 flex items-center justify-between transition cursor-pointer text-left text-[12px] ${
                      isLight ? 'hover:bg-[#f2f2f6] hover:text-[#111113]' : 'hover:bg-[#232326] hover:text-[#dededf]'
                    }`}
                  >
                    <span>Conversation Name</span>
                    {copyFeedback === 'name' && <Check className="w-3 h-3 text-[#7ee787]" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(session.id, 'id')}
                    className={`w-full px-3 py-1.5 flex items-center justify-between transition cursor-pointer text-left text-[12px] ${
                      isLight ? 'hover:bg-[#f2f2f6] hover:text-[#111113]' : 'hover:bg-[#232326] hover:text-[#dededf]'
                    }`}
                  >
                    <span>Conversation ID</span>
                    {copyFeedback === 'id' && <Check className="w-3 h-3 text-[#7ee787]" />}
                  </button>
                  {projectName && (
                    <button
                      type="button"
                      onClick={() => handleCopy(projectName, 'proj')}
                      className={`w-full px-3 py-1.5 flex items-center justify-between transition cursor-pointer text-left text-[12px] ${
                        isLight ? 'hover:bg-[#f2f2f6] hover:text-[#111113]' : 'hover:bg-[#232326] hover:text-[#dededf]'
                      }`}
                    >
                      <span>Project Name</span>
                      {copyFeedback === 'proj' && <Check className="w-3 h-3 text-[#7ee787]" />}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 6. Split Submenu */}
            <div
              className="relative"
              onMouseEnter={() => setActiveSubmenu('split')}
              onMouseLeave={() => setActiveSubmenu(null)}
            >
              <button
                type="button"
                className={`w-full px-3 py-1.5 flex items-center justify-between transition cursor-pointer text-left ${
                  isLight ? 'hover:bg-[#f2f2f6] hover:text-[#111113]' : 'hover:bg-[#232326] hover:text-[#dededf]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Split className="w-3.5 h-3.5 text-[#8a8a92]" />
                  <span>Split</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[#6e6e76]" />
              </button>

              {activeSubmenu === 'split' && (
                <div
                  className={`absolute ${
                    submenuToLeft ? 'right-full mr-1' : 'left-full ml-1'
                  } top-0 w-44 rounded-xl py-1 z-50 animate-dropdown ${
                    isLight
                      ? 'bg-[#ffffff] border border-[#e2e2e7] shadow-[0_10px_25px_rgba(0,0,0,0.08)]'
                      : 'bg-[#18181b] border border-[#2b2b30] shadow-2xl'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onSplitSession(session, 'right');
                    }}
                    className={`w-full px-3 py-1.5 flex items-center gap-2 transition cursor-pointer text-left text-[12px] ${
                      isLight ? 'hover:bg-[#f2f2f6] hover:text-[#111113]' : 'hover:bg-[#232326] hover:text-[#dededf]'
                    }`}
                  >
                    <Columns2 className="w-3.5 h-3.5 text-[#8a8a92]" />
                    <span>Split Right</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onSplitSession(session, 'down');
                    }}
                    className={`w-full px-3 py-1.5 flex items-center gap-2 transition cursor-pointer text-left text-[12px] ${
                      isLight ? 'hover:bg-[#f2f2f6] hover:text-[#111113]' : 'hover:bg-[#232326] hover:text-[#dededf]'
                    }`}
                  >
                    <Rows2 className="w-3.5 h-3.5 text-[#8a8a92]" />
                    <span>Split Down</span>
                  </button>
                  {isSplitActive && onRemoveFromSplit && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        onRemoveFromSplit(session.id);
                      }}
                      className={`w-full px-3 py-1.5 flex items-center gap-2 text-[#e06c75] transition cursor-pointer text-left text-[12px] ${
                        isLight ? 'hover:bg-[#fee2e2]' : 'hover:bg-[#232326]'
                      }`}
                    >
                      <Minimize2 className="w-3.5 h-3.5" />
                      <span>Remove From Split</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className={`my-1 border-t ${isLight ? 'border-[#e5e5eb]' : 'border-[#26262b]'}`} />

            {/* 6. Delete */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onDeleteSession(session.id);
              }}
              className={`w-full px-3 py-1.5 flex items-center gap-2.5 text-[#e06c75] transition cursor-pointer text-left ${
                isLight ? 'hover:bg-[#fee2e2]' : 'hover:bg-[#232326]'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5 text-[#e06c75]" />
              <span>Delete</span>
            </button>
          </div>,
          document.body
        )}
    </div>
  );
};
