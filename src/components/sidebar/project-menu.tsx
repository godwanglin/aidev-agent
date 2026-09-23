'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Copy, Settings, Check } from 'lucide-react';
import type { ProjectRecord } from '@/lib/db';
import { useConfirm } from '@/context/confirm-context';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useTheme } from '@/context/theme-context';

interface ProjectMenuProps {
  project: ProjectRecord;
  onOpenProjectSettings?: (project: ProjectRecord) => void;
}

export const ProjectMenu: React.FC<ProjectMenuProps> = ({
  project,
  onOpenProjectSettings,
}) => {
  const { confirm } = useConfirm();
  const [isOpen, setIsOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [menuCoords, setMenuCoords] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 176; // w-44
    const menuHeight = 140;

    // Default: pop out to the right (keluar ke kanan)
    let left = rect.right + 6;
    let top = rect.top - 2;

    if (left + menuWidth > window.innerWidth - 12) {
      left = Math.max(12, rect.left - menuWidth - 6);
    }

    if (top + menuHeight > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - menuHeight - 12);
    }

    setMenuCoords({ top, left });
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen) {
      updatePosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
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
      }
    };

    const handleScrollOrResize = () => {
      setIsOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
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
    }, 800);
  };

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
            : 'text-[#6e6e6e] hover:text-[#cccccc] hover:bg-[#252525]'
        }`}
        title="Project actions"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>

      {mounted && isMobile && (
        <BottomSheet
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title={project.name}
          zIndex={9999}
          className={
            isLight
              ? 'bg-[#ffffff] border-t border-[#e2e2e7] text-[13.5px] text-[#2a2a30] p-2'
              : 'bg-[#18181a] border-t border-[#2a2a2e] text-[13.5px] text-[#c2c2c6] p-2'
          }
        >
          {/* Copy Project Name */}
          <button
            type="button"
            onClick={() => handleCopy(project.name, 'name')}
            className={`w-full flex items-center justify-between transition cursor-pointer text-left px-3.5 py-3 text-[13.5px] ${
              isLight
                ? 'hover:bg-[#f0f0f4] hover:text-[#111113] text-[#2a2a30]'
                : 'hover:bg-[#222226] hover:text-[#dededf] text-[#c2c2c6]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Copy className="w-4 h-4 text-[#8a8a92]" />
              <span>Copy Project Name</span>
            </div>
            {copyFeedback === 'name' && <Check className="w-3.5 h-3.5 text-[#7ee787]" />}
          </button>

          {/* Copy Project Path */}
          <button
            type="button"
            onClick={() => handleCopy(project.workdir_path, 'path')}
            className={`w-full flex items-center justify-between transition cursor-pointer text-left px-3.5 py-3 text-[13.5px] ${
              isLight
                ? 'hover:bg-[#f0f0f4] hover:text-[#111113] text-[#2a2a30]'
                : 'hover:bg-[#222226] hover:text-[#dededf] text-[#c2c2c6]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Copy className="w-4 h-4 text-[#8a8a92]" />
              <span>Copy Project Path</span>
            </div>
            {copyFeedback === 'path' && <Check className="w-3.5 h-3.5 text-[#7ee787]" />}
          </button>

          <div className={`my-1 border-t ${isLight ? 'border-[#e5e5eb]' : 'border-[#26262a]'}`} />

          {/* Project Settings */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              if (onOpenProjectSettings) {
                onOpenProjectSettings(project);
              } else {
                confirm({
                  title: 'Project Information',
                  message: `Directory Path: ${project.workdir_path}`,
                  confirmText: 'OK',
                  cancelText: 'Close',
                  variant: 'info',
                });
              }
            }}
            className={`w-full flex items-center gap-2.5 transition cursor-pointer text-left px-3.5 py-3 text-[13.5px] ${
              isLight
                ? 'hover:bg-[#f0f0f4] hover:text-[#111113] text-[#2a2a30]'
                : 'hover:bg-[#222226] hover:text-[#dededf] text-[#c2c2c6]'
            }`}
          >
            <Settings className="w-4 h-4 text-[#8a8a92]" />
            <span>Project Settings</span>
          </button>
        </BottomSheet>
      )}

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
              top: `${menuCoords?.top ?? 0}px`,
              left: `${menuCoords?.left ?? 0}px`,
              zIndex: 9000,
            }}
            className={`w-44 rounded-xl shadow-2xl py-1 text-[12.5px] select-none animate-dropdown font-sans ${
              isLight
                ? 'bg-[#ffffff] border border-[#e2e2e7] text-[#2a2a30] shadow-[0_10px_25px_rgba(0,0,0,0.08)]'
                : 'bg-[#18181a] border border-[#2a2a2e] text-[#c2c2c6] shadow-2xl'
            }`}
          >
            {/* Copy Project Name */}
            <button
              type="button"
              onClick={() => handleCopy(project.name, 'name')}
              className={`w-full flex items-center justify-between transition cursor-pointer text-left px-3 py-1.5 text-[12.5px] ${
                isLight
                  ? 'hover:bg-[#f2f2f6] hover:text-[#111113] text-[#2a2a30]'
                  : 'hover:bg-[#222226] hover:text-[#dededf] text-[#c2c2c6]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Copy className="w-3.5 h-3.5 text-[#8a8a92]" />
                <span>Copy Project Name</span>
              </div>
              {copyFeedback === 'name' && <Check className="w-3.5 h-3.5 text-[#7ee787]" />}
            </button>

            {/* Copy Project Path */}
            <button
              type="button"
              onClick={() => handleCopy(project.workdir_path, 'path')}
              className={`w-full flex items-center justify-between transition cursor-pointer text-left px-3 py-1.5 text-[12.5px] ${
                isLight
                  ? 'hover:bg-[#f2f2f6] hover:text-[#111113] text-[#2a2a30]'
                : 'hover:bg-[#222226] hover:text-[#dededf] text-[#c2c2c6]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Copy className="w-3.5 h-3.5 text-[#8a8a92]" />
                <span>Copy Project Path</span>
              </div>
              {copyFeedback === 'path' && <Check className="w-3.5 h-3.5 text-[#7ee787]" />}
            </button>

            <div className={`my-1 border-t ${isLight ? 'border-[#e5e5eb]' : 'border-[#26262a]'}`} />

            {/* Project Settings */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                if (onOpenProjectSettings) {
                  onOpenProjectSettings(project);
                } else {
                  confirm({
                    title: 'Project Information',
                    message: `Directory Path: ${project.workdir_path}`,
                    confirmText: 'OK',
                    cancelText: 'Close',
                    variant: 'info',
                  });
                }
              }}
              className={`w-full flex items-center gap-2.5 transition cursor-pointer text-left px-3 py-1.5 text-[12.5px] ${
                isLight
                  ? 'hover:bg-[#f2f2f6] hover:text-[#111113] text-[#2a2a30]'
                  : 'hover:bg-[#222226] hover:text-[#dededf] text-[#c2c2c6]'
              }`}
            >
              <Settings className="w-3.5 h-3.5 text-[#8a8a92]" />
              <span>Project Settings</span>
            </button>
          </div>,
          document.body
        )}
    </div>
  );
};
