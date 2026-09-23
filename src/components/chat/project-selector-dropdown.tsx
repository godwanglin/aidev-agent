'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Folder, FolderPlus, FolderX, ChevronDown, Check } from 'lucide-react';
import type { ProjectRecord } from '@/lib/db';
import { BottomSheet } from '@/components/ui/bottom-sheet';

interface ProjectSelectorDropdownProps {
  projects: ProjectRecord[];
  currentProject: ProjectRecord | null;
  onSelectProject: (project: ProjectRecord | null) => void;
  onOpenNewProjectModal: () => void;
}

export const ProjectSelectorDropdown: React.FC<ProjectSelectorDropdownProps> = ({
  projects,
  currentProject,
  onSelectProject,
  onOpenNewProjectModal,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 640 : false));
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Close when clicking outside on desktop
  useEffect(() => {
    if (!isOpen || isMobile) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, isMobile]);

  const isNoProject = !currentProject || currentProject.id === 'no_project';

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button: [📁 project-name ˅] */}
      <button
        type="button"
        onClick={() => {
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          setIsOpen(!isOpen);
        }}
        className={`flex items-center gap-1.5 text-xs text-[#8c8c8c] hover:text-[#e0e0e0] transition font-normal py-1 px-2 rounded-md hover:bg-white/[0.06] cursor-pointer select-none ${
          isOpen ? 'bg-white/[0.08] text-white' : ''
        }`}
      >
        {isNoProject ? (
          <FolderX className="w-3.5 h-3.5 text-[#737373] shrink-0" />
        ) : (
          <Folder className="w-3.5 h-3.5 text-[#737373] shrink-0" />
        )}
        <span className="truncate max-w-[160px] text-[12.5px]">
          {isNoProject ? 'No Project' : currentProject.name}
        </span>
        <ChevronDown
          className={`w-3 h-3 text-[#666666] shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-white' : ''
          }`}
        />
      </button>

      {/* Desktop Popover Dropdown */}
      {isOpen && !isMobile && (
        <div className="absolute left-0 top-full mt-1.5 w-64 rounded-xl bg-[#181818] border border-[#2a2a2a] shadow-2xl p-1 z-50 animate-dropdown font-sans select-none text-[12.5px]">
          {/* 1. Existing Projects List */}
          <div className="max-h-56 overflow-y-auto space-y-0.5 scrollbar-thin scrollbar-thumb-[#2a2a2a]">
            {projects.map((proj) => {
              const isSelected = currentProject?.id === proj.id;
              return (
                <button
                  key={proj.id}
                  type="button"
                  onClick={() => {
                    onSelectProject(proj);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition cursor-pointer ${
                    isSelected
                      ? 'bg-[#222222] text-[#ffffff] font-medium'
                      : 'text-[#cccccc] hover:bg-[#252525] hover:text-[#ffffff]'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <Folder className="w-3.5 h-3.5 text-[#888888] shrink-0" />
                    <span className="truncate">{proj.name}</span>
                  </div>
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-[#cccccc] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Separator */}
          <div className="border-t border-[#262626] my-1" />

          {/* 2. New Project */}
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onOpenNewProjectModal();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[#cccccc] hover:bg-[#252525] hover:text-[#ffffff] transition cursor-pointer text-left"
          >
            <FolderPlus className="w-3.5 h-3.5 text-[#888888] shrink-0" />
            <span>New Project</span>
          </button>

          {/* Separator */}
          <div className="border-t border-[#262626] my-1" />

          {/* 3. No Project */}
          <button
            type="button"
            onClick={() => {
              onSelectProject(null);
              setIsOpen(false);
            }}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition cursor-pointer text-left ${
              isNoProject
                ? 'bg-[#222222] text-[#ffffff] font-medium'
                : 'text-[#cccccc] hover:bg-[#252525] hover:text-[#ffffff]'
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              <FolderX className="w-3.5 h-3.5 text-[#888888] shrink-0" />
              <span>No Project</span>
            </div>
            {isNoProject && (
              <Check className="w-3.5 h-3.5 text-[#cccccc] shrink-0" />
            )}
          </button>
        </div>
      )}

      {/* Mobile Bottom Sheet */}
      {mounted && isMobile && (
        <BottomSheet
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title="Select Project"
          zIndex={99999}
          className="bg-[#181818] border-t border-[#2a2a2a] p-2 text-white"
        >
          <div className="space-y-1 p-1">
            <div className="max-h-60 overflow-y-auto space-y-1">
              {projects.map((proj) => {
                const isSelected = currentProject?.id === proj.id;
                return (
                  <button
                    key={proj.id}
                    type="button"
                    onClick={() => {
                      onSelectProject(proj);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left transition cursor-pointer text-[13.5px] ${
                      isSelected
                        ? 'bg-[#222222] text-[#ffffff] font-medium'
                        : 'text-[#cccccc] hover:bg-[#252525] hover:text-[#ffffff]'
                    }`}
                  >
                    <div className="flex items-center gap-3 truncate pr-2">
                      <Folder className="w-4 h-4 text-[#888888] shrink-0" />
                      <span className="truncate">{proj.name}</span>
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-[#cccccc] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="border-t border-[#262626] my-1.5" />

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenNewProjectModal();
              }}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-[#cccccc] hover:bg-[#252525] hover:text-[#ffffff] transition cursor-pointer text-left text-[13.5px]"
            >
              <FolderPlus className="w-4 h-4 text-[#888888] shrink-0" />
              <span>New Project</span>
            </button>

            <div className="border-t border-[#262626] my-1.5" />

            <button
              type="button"
              onClick={() => {
                onSelectProject(null);
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl transition cursor-pointer text-left text-[13.5px] ${
                isNoProject
                  ? 'bg-[#222222] text-[#ffffff] font-medium'
                  : 'text-[#cccccc] hover:bg-[#252525] hover:text-[#ffffff]'
              }`}
            >
              <div className="flex items-center gap-3 truncate">
                <FolderX className="w-4 h-4 text-[#888888] shrink-0" />
                <span>No Project</span>
              </div>
              {isNoProject && (
                <Check className="w-4 h-4 text-[#cccccc] shrink-0" />
              )}
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
};
