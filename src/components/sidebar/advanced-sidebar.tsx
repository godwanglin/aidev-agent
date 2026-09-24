'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  History,
  CalendarClock,
  Folder,
  FolderOpen,
  FolderPlus,
  Settings,
  PanelLeft,
  ArrowLeft,
  ArrowRight,
  ListFilter,
  Check,
  X,
  Loader2,
  Download,
} from 'lucide-react';
import type { SessionRecord, ProjectRecord, SubagentRecord } from '@/lib/db';
import type { ActivityItem } from './activity-section';
import type { PlanItem } from './plan-section';
import { SessionMenu } from './session-menu';
import { ProjectMenu } from './project-menu';
import { AidevLogo } from '@/components/common/antigravity-logo';
import { formatRelativeTime } from '@/lib/project-utils';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useTheme } from '@/context/theme-context';

interface AdvancedSidebarProps {
  projects?: ProjectRecord[];
  currentProject?: ProjectRecord | null;
  allSessions?: SessionRecord[];
  currentSessionId?: string;
  splitSessionId?: string;
  activities?: ActivityItem[];
  planTitle?: string;
  planItems?: PlanItem[];
  terminals?: Array<{ id: string; workdir: string }>;
  subagents?: SubagentRecord[];
  isStreaming?: boolean;
  onSelectSession: (session: SessionRecord, project?: ProjectRecord) => void;
  onNewSession: () => void;
  onNewSessionInProject?: (projectId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession?: (sessionId: string, newTitle: string) => void;
  onAutoRenameSession?: (sessionId: string) => void;
  onToggleUnreadSession?: (session: SessionRecord) => void;
  onSplitSession?: (session: SessionRecord, direction: 'right' | 'down') => void;
  onRemoveFromSplit?: (sessionId: string) => void;
  onNavigateHistory?: () => void;
  onToggleTask?: (id: string) => void;
  onOpenTerminal?: (id: string) => void;
  onNewTerminal?: () => void;
  width?: number;
  isResizing?: boolean;
  onOpenSettingsModal?: () => void;
  onOpenProjectSettings?: (project: ProjectRecord) => void;
  onOpenProjectModal?: () => void;
  onOpenScheduledTasks?: () => void;
  onToggleCollapse?: () => void;
}

export const AdvancedSidebar: React.FC<AdvancedSidebarProps> = ({
  projects = [],
  currentProject,
  allSessions = [],
  currentSessionId,
  splitSessionId,
  isStreaming = false,
  width = 240,
  isResizing = false,
  onSelectSession,
  onNewSession,
  onNewSessionInProject,
  onDeleteSession,
  onRenameSession,
  onAutoRenameSession,
  onToggleUnreadSession,
  onSplitSession,
  onRemoveFromSplit,
  onNavigateHistory,
  onOpenSettingsModal,
  onOpenProjectSettings,
  onOpenProjectModal,
  onOpenScheduledTasks,
  onToggleCollapse,
  onOpenTerminal,
  onNewTerminal,
}) => {
  // Set of expanded project IDs (default includes active project)
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    () => new Set(currentProject ? [currentProject.id] : [])
  );

  // Inline rename state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Conversation Sorting state
  type ConversationSortOption = 'updated' | 'prompt' | 'alphabetical' | 'created';
  const [conversationSort, setConversationSort] = useState<ConversationSortOption>('updated');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [filterMenuCoords, setFilterMenuCoords] = useState<{ top: number; left: number } | null>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const [mounted, setMounted] = useState(false);
  const isMobile = typeof window !== 'undefined' ? window.innerWidth < 640 : false;
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  const [isElectron, setIsElectron] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ status: string; version?: string } | null>(null);
  const [isHoveringUpdate, setIsHoveringUpdate] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      if (Boolean((window as any).electronAPI?.isElectron)) {
        setIsElectron(true);
      }
      const saved = (localStorage.getItem('aidev_conversation_sort') || localStorage.getItem('aidev_project_sort')) as ConversationSortOption;
      if (saved && ['updated', 'prompt', 'alphabetical', 'created'].includes(saved)) {
        setConversationSort(saved);
      }

      // Auto-updater listener from Electron
      const api = (window as any).electronAPI;
      if (api?.onUpdateStatus) {
        const unsub = api.onUpdateStatus((info: any) => {
          if (
            info &&
            (info.status === 'available' ||
              info.status === 'downloading' ||
              info.status === 'downloaded')
          ) {
            setUpdateInfo(info);
          } else if (info && (info.status === 'not-available' || info.status === 'error')) {
            setUpdateInfo(null);
          }
        });
        return unsub;
      }

      // Allow triggering via custom event for testing/simulation
      const handleCustomUpdate = (e: any) => {
        setUpdateInfo({ status: 'available', version: e.detail?.version || '1.0.1' });
      };
      window.addEventListener('aidev:update-available' as any, handleCustomUpdate);
      return () => window.removeEventListener('aidev:update-available' as any, handleCustomUpdate);
    }
  }, []);

  const handleTriggerUpdate = () => {
    const api = (window as any).electronAPI;
    if (updateInfo?.status === 'downloaded') {
      api?.quitAndInstall?.();
    } else if (api?.downloadUpdate) {
      api.downloadUpdate();
    } else if (api?.openExternal) {
      api.openExternal('https://github.com/aidev-agent/releases');
    } else if (typeof window !== 'undefined') {
      window.open('https://github.com/aidev-agent/releases', '_blank');
    }
  };

  const updateFilterMenuPosition = () => {
    if (!filterButtonRef.current) return;
    const btnRect = filterButtonRef.current.getBoundingClientRect();
    const sidebarRect = sidebarRef.current?.getBoundingClientRect();
    const menuWidth = 192; // w-48
    const menuHeight = 160;

    // Pop out to the right (keluar ke kanan dari sidebar)
    let left = sidebarRect ? sidebarRect.right + 6 : btnRect.right + 6;
    let top = btnRect.top - 2;

    // If would overflow window right edge, pop inwards
    if (left + menuWidth > window.innerWidth - 12) {
      left = Math.max(12, btnRect.left - menuWidth - 6);
    }
    if (top + menuHeight > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - menuHeight - 12);
    }

    setFilterMenuCoords({ top, left });
  };

  const handleToggleFilterMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!showFilterMenu) {
      updateFilterMenuPosition();
      setShowFilterMenu(true);
    } else {
      setShowFilterMenu(false);
    }
  };

  // Close filter menu when clicking outside, scrolling, or resizing
  useEffect(() => {
    if (!showFilterMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        filterMenuRef.current &&
        !filterMenuRef.current.contains(target) &&
        filterButtonRef.current &&
        !filterButtonRef.current.contains(target)
      ) {
        setShowFilterMenu(false);
      }
    };
    const handleClose = () => {
      setShowFilterMenu(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('resize', handleClose);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('resize', handleClose);
    };
  }, [showFilterMenu]);

  // Sort sessions within a project based on active conversationSort
  const sortSessions = React.useCallback(
    (list: SessionRecord[]) => {
      const copy = [...list];
      switch (conversationSort) {
        case 'updated':
        case 'prompt':
          return copy.sort(
            (a, b) =>
              (b.updated_at || b.created_at || 0) - (a.updated_at || a.created_at || 0)
          );
        case 'alphabetical':
          return copy.sort((a, b) =>
            a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
          );
        case 'created':
          return copy.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        default:
          return copy;
      }
    },
    [conversationSort]
  );

  // Compute sorted projects based on active filter
  const sortedProjects = React.useMemo(() => {
    const list = projects.filter(
      (p) =>
        p.id !== 'no_project' &&
        p.name !== 'No Project' &&
        !p.name.startsWith('Default Workspace')
    );
    switch (conversationSort) {
      case 'updated':
        return list.sort(
          (a, b) =>
            (b.last_opened_at || b.created_at || 0) - (a.last_opened_at || a.created_at || 0)
        );
      case 'prompt':
        return list.sort((a, b) => {
          const aTime = Math.max(
            0,
            ...allSessions
              .filter((s) => s.project_id === a.id)
              .map((s) => s.updated_at || s.created_at || 0)
          );
          const bTime = Math.max(
            0,
            ...allSessions
              .filter((s) => s.project_id === b.id)
              .map((s) => s.updated_at || s.created_at || 0)
          );
          const finalA = aTime || a.last_opened_at || a.created_at || 0;
          const finalB = bTime || b.last_opened_at || b.created_at || 0;
          return finalB - finalA;
        });
      case 'alphabetical':
        return list.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        );
      case 'created':
        return list.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      default:
        return list;
    }
  }, [projects, allSessions, conversationSort]);

  // Compute standalone conversations (not attached to any user project or project_id === 'no_project')
  const standaloneSessions = React.useMemo(() => {
    const list = allSessions.filter(
      (s) =>
        !s.project_id ||
        s.project_id === 'no_project' ||
        !projects.some((p) => p.id === s.project_id)
    );
    return sortSessions(list);
  }, [allSessions, projects, sortSessions]);

  // Expand active project whenever it changes
  useEffect(() => {
    if (currentProject) {
      setExpandedProjects((prev) => new Set(prev).add(currentProject.id));
    }
  }, [currentProject?.id]);

  const toggleProjectExpand = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const handleStartRename = (session: SessionRecord) => {
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
  };

  const handleSaveRename = (sessionId: string) => {
    if (editingTitle.trim() && onRenameSession) {
      onRenameSession(sessionId, editingTitle.trim());
    }
    setEditingSessionId(null);
  };

  return (
    <aside
      ref={sidebarRef}
      style={{ width }}
      className={`flex flex-col h-full select-none shrink-0 overflow-hidden font-sans border-r transition-colors duration-150 ${
        isLight
          ? 'bg-[#f4f4f7] border-[#e2e2e7] text-[#1a1a1e]'
          : 'bg-[#0e0e11] border-[#1e1e24] text-[#dededf]'
      }`}
    >
      {/* 1. Top Navigation Bar (Logo is ALWAYS visible above New Conversation) */}
      <div
        className={`h-10 px-3 flex items-center justify-between border-b shrink-0 transition-colors duration-150 ${
          isLight ? 'border-[#e4e4e9]' : 'border-[#1a1a20]'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* Aidev Logo */}
          <div className="shrink-0 flex items-center gap-2">
            <AidevLogo className="w-4 h-4" />
            <span className={`text-[13px] font-semibold tracking-tight ${isLight ? 'text-[#1a1a1e]' : 'text-white'}`}>
              Aidev
            </span>
          </div>

          {/* Toggle Sidebar Button (Web mode only, since titlebar handles it in Electron) */}
          {!isElectron && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className={`p-1 rounded transition cursor-pointer ml-1 ${
                isLight
                  ? 'text-[#6e6e76] hover:text-[#1a1a1e] hover:bg-[#eaecee]'
                  : 'text-[#7e7e85] hover:text-[#dededf] hover:bg-[#1a1a20]'
              }`}
              title="Collapse sidebar"
            >
              <PanelLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Back / Forward Controls (Web mode only) */}
        {!isElectron && (
          <div className={`flex items-center gap-0.5 ${isLight ? 'text-[#8e8e96]' : 'text-[#5e5e65]'}`}>
            <button
              type="button"
              onClick={() => window.history.back()}
              className={`p-1 transition cursor-pointer rounded ${
                isLight ? 'hover:text-[#1a1a1e] hover:bg-[#eaecee]' : 'hover:text-[#dededf] hover:bg-[#1a1a20]'
              }`}
              title="Back"
            >
              <ArrowLeft className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => window.history.forward()}
              className={`p-1 transition cursor-pointer rounded ${
                isLight ? 'hover:text-[#1a1a1e] hover:bg-[#eaecee]' : 'hover:text-[#dededf] hover:bg-[#1a1a20]'
              }`}
              title="Forward"
            >
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* 2. New Conversation Button */}
      <div className="px-3 pt-2.5 pb-2 shrink-0">
        <button
          type="button"
          onClick={onNewSession}
          className={`w-full flex items-center gap-2.5 px-3 h-[36px] rounded-xl text-[13px] font-medium transition shadow-xs cursor-pointer ${
            isLight
              ? 'bg-[#ffffff] hover:bg-[#fafafa] border border-[#d6d6de] text-[#1a1a1e] hover:text-[#000000]'
              : 'bg-[#16161b] hover:bg-[#1e1e24] border border-[#24242e] text-[#dededf] hover:text-[#ffffff]'
          }`}
        >
          <Plus className={`w-4 h-4 ${isLight ? 'text-[#5a5a64]' : 'text-[#8a8a92]'}`} strokeWidth={2.2} />
          <span className="truncate">New Conversation</span>
        </button>
      </div>

      {/* 3. Navigation Links (Conversation History, Scheduled Tasks) */}
      <div className="px-3 py-1 space-y-0.5 text-[13px] shrink-0 font-sans">
        <button
          type="button"
          onClick={onNavigateHistory}
          className={`w-full flex items-center gap-2.5 px-2.5 h-[32px] rounded-lg transition cursor-pointer ${
            isLight
              ? 'text-[#5a5a64] hover:text-[#1a1a1e] hover:bg-[#eaecee]'
              : 'text-[#98989e] hover:text-[#dededf] hover:bg-[#17171d]'
          }`}
        >
          <History className={`w-4 h-4 shrink-0 ${isLight ? 'text-[#6e6e78]' : 'text-[#7e7e85]'}`} />
          <span className="truncate">Conversation History</span>
        </button>
        <button
          type="button"
          onClick={onOpenScheduledTasks}
          className={`w-full flex items-center gap-2.5 px-2.5 h-[32px] rounded-lg transition cursor-pointer ${
            isLight
              ? 'text-[#5a5a64] hover:text-[#1a1a1e] hover:bg-[#eaecee]'
              : 'text-[#98989e] hover:text-[#dededf] hover:bg-[#17171d]'
          }`}
        >
          <CalendarClock className={`w-4 h-4 shrink-0 ${isLight ? 'text-[#6e6e78]' : 'text-[#7e7e85]'}`} />
          <span className="truncate">Scheduled Tasks</span>
        </button>
      </div>

      {/* 4. Projects Section (Generous spacing, folders, conversations) */}
      <div className="flex-1 overflow-y-auto px-2.5 py-1 space-y-3">
        {/* Section Header: Projects with filter and add folder */}
        <div
          className={`mt-2.5 px-1 py-1 flex items-center justify-between text-[12px] font-medium ${
            isLight ? 'text-[#6e6e78]' : 'text-[#7e7e85]'
          }`}
        >
          <span>Projects</span>
          <div className="flex items-center gap-1">
            <button
              ref={filterButtonRef}
              type="button"
              onClick={handleToggleFilterMenu}
              title="Sort conversations"
              className={`p-1 rounded transition cursor-pointer ${
                showFilterMenu
                  ? isLight
                    ? 'bg-[#e2e2ea] text-[#1a1a1e]'
                    : 'bg-[#1f1f26] text-[#dededf]'
                  : isLight
                  ? 'hover:text-[#1a1a1e] hover:bg-[#eaecee]'
                  : 'hover:text-[#dededf] hover:bg-[#1a1a20]'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onOpenProjectModal}
              title="Open / Add Project Directory"
              className={`p-1 rounded transition cursor-pointer ${
                isLight ? 'hover:text-[#1a1a1e] hover:bg-[#eaecee]' : 'hover:text-[#dededf] hover:bg-[#1a1a20]'
              }`}
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Mobile Version: Bottom Sheet with Drag to Close */}
        {mounted && isMobile && (
          <BottomSheet
            isOpen={showFilterMenu}
            onClose={() => setShowFilterMenu(false)}
            title="Sort Conversations"
            zIndex={99999}
            className={
              isLight
                ? 'bg-[#ffffff] border-t border-[#dcdce2] text-[#1a1a1e] p-2'
                : 'bg-[#16161a] border-t border-[#2d2d34] text-[#dededf] p-2'
            }
          >
            <div className="space-y-1 p-1">
              {[
                { key: 'updated' as const, label: 'Last Updated' },
                { key: 'prompt' as const, label: 'Last Prompt' },
                { key: 'alphabetical' as const, label: 'Alphabetical (A-Z)' },
                { key: 'created' as const, label: 'Date Added' },
              ].map((opt) => {
                const isSelected = conversationSort === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setConversationSort(opt.key);
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('aidev_conversation_sort', opt.key);
                      }
                      setShowFilterMenu(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left transition cursor-pointer text-[13.5px] ${
                      isSelected
                        ? isLight
                          ? 'bg-[#e8e8f0] text-[#111114] font-medium'
                          : 'bg-[#24242c] text-[#ffffff] font-medium'
                        : isLight
                        ? 'text-[#5a5a64] hover:bg-[#f0f0f4] hover:text-[#1a1a1e]'
                        : 'text-[#98989e] hover:bg-[#1e1e24] hover:text-[#dededf]'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isSelected && (
                      <Check className={`w-4 h-4 shrink-0 ${isLight ? 'text-[#1a1a1e]' : 'text-[#dededf]'}`} />
                    )}
                  </button>
                );
              })}
            </div>
          </BottomSheet>
        )}

        {/* Desktop Version: Floating Portal Menu */}
        {!isMobile && showFilterMenu && mounted && filterMenuCoords && createPortal(
          <div
            ref={filterMenuRef}
            style={{
              position: 'fixed',
              top: filterMenuCoords.top,
              left: filterMenuCoords.left,
              zIndex: 99999,
            }}
            className={`w-48 rounded-xl border shadow-2xl p-1 animate-dropdown select-none text-[12.5px] font-sans ${
              isLight
                ? 'bg-[#ffffff] border-[#dcdce2] text-[#1a1a1e]'
                : 'bg-[#16161a] border-[#2d2d34] text-[#dededf]'
            }`}
          >
            <div
              className={`px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-b mb-1 ${
                isLight ? 'text-[#8a8a92] border-[#eaecee]' : 'text-[#80808b] border-[#26262d]'
              }`}
            >
              Sort Conversations
            </div>
            {[
              { key: 'updated' as const, label: 'Last Updated' },
              { key: 'prompt' as const, label: 'Last Prompt' },
              { key: 'alphabetical' as const, label: 'Alphabetical (A-Z)' },
              { key: 'created' as const, label: 'Date Added' },
            ].map((opt) => {
              const isSelected = conversationSort === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setConversationSort(opt.key);
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('aidev_conversation_sort', opt.key);
                    }
                    setShowFilterMenu(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition cursor-pointer ${
                    isSelected
                      ? isLight
                        ? 'bg-[#e8e8f0] text-[#111114] font-medium'
                        : 'bg-[#24242c] text-[#ffffff] font-medium'
                      : isLight
                      ? 'text-[#5a5a64] hover:bg-[#f0f0f4] hover:text-[#1a1a1e]'
                      : 'text-[#98989e] hover:bg-[#1e1e24] hover:text-[#dededf]'
                  }`}
                >
                  <span>{opt.label}</span>
                  {isSelected && (
                    <Check className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-[#1a1a1e]' : 'text-[#dededf]'}`} />
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )}

        {/* Project List */}
        <div className="space-y-2.5">
          {sortedProjects.map((proj) => {
            const isExpanded = expandedProjects.has(proj.id);
            const projSessions = sortSessions(allSessions.filter((s) => s.project_id === proj.id));

            return (
              <div key={proj.id} className="space-y-1">
                {/* Project Folder Row */}
                <div
                  onClick={() => {
                    toggleProjectExpand(proj.id);
                    if (currentProject?.id !== proj.id && onNewSessionInProject) {
                      onNewSessionInProject(proj.id);
                    }
                  }}
                  className={`group flex items-center justify-between px-2.5 h-[34px] rounded-lg text-[13.5px] font-medium transition cursor-pointer select-none ${
                    currentProject?.id === proj.id
                      ? isLight
                        ? 'bg-[#eaecee] text-[#000000]'
                        : 'bg-[#18181f] text-[#ffffff]'
                      : isLight
                      ? 'text-[#2c2c34] hover:text-[#000000] hover:bg-[#eaecee]'
                      : 'text-[#c4c4c8] hover:text-[#dededf] hover:bg-[#15151a]'
                  }`}
                  title={proj.workdir_path}
                >
                  <div className="flex items-center gap-2.5 truncate min-w-0 pr-1">
                    {isExpanded ? (
                      <FolderOpen
                        className={`w-4 h-4 shrink-0 ${isLight ? 'text-[#2c2c34]' : 'text-[#c4c4c8]'}`}
                        strokeWidth={1.75}
                      />
                    ) : (
                      <Folder
                        className={`w-4 h-4 shrink-0 ${
                          isLight ? 'text-[#6e6e78] group-hover:text-[#2c2c34]' : 'text-[#7e7e85] group-hover:text-[#a5a5ab]'
                        }`}
                        strokeWidth={1.75}
                      />
                    )}
                    <span className="truncate text-[13.5px] font-medium">
                      {proj.name}
                    </span>
                  </div>

                  {/* Project Row Action Buttons (3-dots & +) */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0"
                  >
                    <ProjectMenu project={proj} onOpenProjectSettings={onOpenProjectSettings} />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onNewSessionInProject) {
                          onNewSessionInProject(proj.id);
                        } else {
                          onNewSession();
                        }
                        setExpandedProjects((prev) => new Set(prev).add(proj.id));
                      }}
                      className={`w-5 h-5 flex items-center justify-center rounded transition cursor-pointer ${
                        isLight
                          ? 'text-[#6e6e78] hover:text-[#1a1a1e] hover:bg-[#dedee5]'
                          : 'text-[#7e7e85] hover:text-[#dededf] hover:bg-[#22222a]'
                      }`}
                      title={`New conversation in ${proj.name}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Child Conversations */}
                {isExpanded && (
                  <div
                    className={`space-y-1 pl-3 ml-2.5 border-l py-0.5 animate-slide-down ${
                      isLight ? 'border-[#dcdcde]' : 'border-[#1e1e24]'
                    }`}
                  >
                    {projSessions.length > 0 ? (
                      projSessions.map((sess) => {
                        const isCurrent = sess.id === currentSessionId;
                        const isSplit = sess.id === splitSessionId;
                        const isDualActive = isCurrent || isSplit;
                        const isUnread = Boolean(sess.is_unread);
                        const isEditing = editingSessionId === sess.id;

                        return (
                          <div
                            key={sess.id}
                            onClick={() => onSelectSession(sess, proj)}
                            className={`group flex items-center justify-between px-2.5 h-[34px] rounded-lg text-[13px] cursor-pointer transition-colors duration-150 ${
                              isDualActive
                                ? isLight
                                  ? 'bg-[#e2e2ea] text-[#111114] font-medium shadow-xs border border-[#d0d0d8]'
                                  : 'bg-[#1c1c22] text-[#dededf] font-medium shadow-xs border border-[#282833]'
                                : isLight
                                ? 'text-[#5a5a64] hover:text-[#111114] hover:bg-[#eaecee]'
                                : 'text-[#98989e] hover:text-[#dededf] hover:bg-[#15151a]'
                            }`}
                            title={sess.title}
                          >
                            {isEditing ? (
                              /* Inline Rename Input */
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1 w-full"
                              >
                                <input
                                  type="text"
                                  value={editingTitle}
                                  onChange={(e) => setEditingTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveRename(sess.id);
                                    if (e.key === 'Escape') setEditingSessionId(null);
                                  }}
                                  autoFocus
                                  className={`flex-1 px-2 py-0.5 rounded text-[13px] border focus:outline-none font-sans ${
                                    isLight
                                      ? 'bg-[#ffffff] text-[#111114] border-[#c8c8d0]'
                                      : 'bg-[#131315] text-[#dededf] border-[#35353c]'
                                  }`}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveRename(sess.id)}
                                  className="p-0.5 text-[#7ee787] hover:text-[#dededf]"
                                  title="Save"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingSessionId(null)}
                                  className={`p-0.5 ${isLight ? 'text-[#6e6e78] hover:text-black' : 'text-[#7e7e85] hover:text-[#dededf]'}`}
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-2 truncate min-w-0 pr-1">
                                  {/* Unread Blue Dot */}
                                  {isUnread && (
                                    <div
                                      className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] shrink-0 animate-pulse"
                                      title="Unread message"
                                    />
                                  )}
                                  <span className="truncate text-[13px]">{sess.title}</span>
                                </div>

                                <div className="flex items-center gap-1 shrink-0 ml-1">
                                  {/* Running spinner only when AI is actively streaming */}
                                  {isDualActive && isStreaming ? (
                                    <span title="Generating...">
                                      <Loader2 className={`w-3.5 h-3.5 animate-spin shrink-0 ${isLight ? 'text-[#1a1a1e]' : 'text-[#dededf]'}`} />
                                    </span>
                                  ) : (
                                    <span className={`hidden sm:inline text-[11px] font-mono group-hover:hidden ${
                                      isLight ? 'text-[#8a8a92]' : 'text-[#6b6b72]'
                                    }`}>
                                      {formatRelativeTime(sess.updated_at || sess.created_at)}
                                    </span>
                                  )}

                                  {/* Session 3-dots Context Menu */}
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex sm:hidden sm:group-hover:inline-flex items-center"
                                  >
                                    <SessionMenu
                                      session={sess}
                                      projectName={proj.name}
                                      isSplitActive={Boolean(splitSessionId)}
                                      onStartRename={handleStartRename}
                                      onAutoRename={(sid) => onAutoRenameSession?.(sid)}
                                      onToggleUnread={(s) => onToggleUnreadSession?.(s)}
                                      onSplitSession={(s, dir) => onSplitSession?.(s, dir)}
                                      onRemoveFromSplit={(sid) => onRemoveFromSplit?.(sid)}
                                      onDeleteSession={(sid) => onDeleteSession(sid)}
                                      onOpenTerminal={() => onOpenTerminal?.('default')}
                                      onNewTerminal={onNewTerminal}
                                    />
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className={`px-2 py-1 text-[12px] italic font-sans select-none ${
                        isLight ? 'text-[#8a8a92]' : 'text-[#6b6b72]'
                      }`}>
                        No conversations yet
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Divider between Projects and Conversations */}
        <hr
          className={`my-2.5 border-0 border-t border-solid ${
            isLight ? 'border-[#e4e4e9]' : 'border-[#22222a]'
          }`}
        />

        {/* Conversations Section (Standalone Chats without Project Workspace) */}
        <div className="space-y-1">
          {/* Section Header: Conversations with + button */}
          <div
            className={`px-1 py-1 flex items-center justify-between text-[12px] font-medium ${
              isLight ? 'text-[#6e6e78]' : 'text-[#7e7e85]'
            }`}
          >
            <span>Conversations</span>
            <button
              type="button"
              onClick={onNewSession}
              className={`w-5 h-5 flex items-center justify-center rounded transition cursor-pointer ${
                isLight
                  ? 'text-[#6e6e78] hover:text-[#1a1a1e] hover:bg-[#dedee5]'
                  : 'text-[#7e7e85] hover:text-[#dededf] hover:bg-[#22222a]'
              }`}
              title="New conversation (no project)"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1">
            {standaloneSessions.length > 0 ? (
              standaloneSessions.map((sess) => {
                const isCurrent = sess.id === currentSessionId;
                const isSplit = sess.id === splitSessionId;
                const isDualActive = isCurrent || isSplit;
                const isUnread = Boolean(sess.is_unread);
                const isEditing = editingSessionId === sess.id;

                return (
                  <div
                    key={sess.id}
                    onClick={() => onSelectSession(sess)}
                    className={`group flex items-center justify-between px-2.5 h-[34px] rounded-lg text-[13px] cursor-pointer transition-colors duration-150 ${
                      isDualActive
                        ? isLight
                          ? 'bg-[#e2e2ea] text-[#111114] font-medium shadow-xs border border-[#d0d0d8]'
                          : 'bg-[#1c1c22] text-[#dededf] font-medium shadow-xs border border-[#282833]'
                        : isLight
                        ? 'text-[#5a5a64] hover:text-[#111114] hover:bg-[#eaecee]'
                        : 'text-[#98989e] hover:text-[#dededf] hover:bg-[#15151a]'
                    }`}
                    title={sess.title}
                  >
                    {isEditing ? (
                      /* Inline Rename Input */
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 w-full"
                      >
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(sess.id);
                            if (e.key === 'Escape') setEditingSessionId(null);
                          }}
                          autoFocus
                          className={`flex-1 px-2 py-0.5 rounded text-[13px] border focus:outline-none font-sans ${
                            isLight
                              ? 'bg-[#ffffff] text-[#111114] border-[#c8c8d0]'
                              : 'bg-[#131315] text-[#dededf] border-[#35353c]'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveRename(sess.id)}
                          className="p-0.5 text-[#7ee787] hover:text-[#dededf]"
                          title="Save"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingSessionId(null)}
                          className={`p-0.5 ${isLight ? 'text-[#6e6e78] hover:text-black' : 'text-[#7e7e85] hover:text-[#dededf]'}`}
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 truncate min-w-0 pr-1">
                          {isUnread && (
                            <div
                              className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] shrink-0 animate-pulse"
                              title="Unread message"
                            />
                          )}
                          <span className="truncate text-[13px]">{sess.title}</span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-1">
                          {isDualActive && isStreaming ? (
                            <span title="Generating...">
                              <Loader2 className={`w-3.5 h-3.5 animate-spin shrink-0 ${isLight ? 'text-[#1a1a1e]' : 'text-[#dededf]'}`} />
                            </span>
                          ) : (
                            <span className={`hidden sm:inline text-[11px] font-mono group-hover:hidden ${
                              isLight ? 'text-[#8a8a92]' : 'text-[#6b6b72]'
                            }`}>
                              {formatRelativeTime(sess.updated_at || sess.created_at)}
                            </span>
                          )}

                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex sm:hidden sm:group-hover:inline-flex items-center"
                          >
                            <SessionMenu
                              session={sess}
                              projectName="Conversations"
                              isSplitActive={Boolean(splitSessionId)}
                              onStartRename={handleStartRename}
                              onAutoRename={(sid) => onAutoRenameSession?.(sid)}
                              onToggleUnread={(s) => onToggleUnreadSession?.(s)}
                              onSplitSession={(s, dir) => onSplitSession?.(s, dir)}
                              onRemoveFromSplit={(sid) => onRemoveFromSplit?.(sid)}
                              onDeleteSession={(sid) => onDeleteSession(sid)}
                              onOpenTerminal={() => onOpenTerminal?.('default')}
                              onNewTerminal={onNewTerminal}
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            ) : (
              <div className={`px-2 py-1 text-[12px] italic font-sans select-none ${
                isLight ? 'text-[#8a8a92]' : 'text-[#6b6b72]'
              }`}>
                No standalone conversations
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Bottom Settings Link & Update Badge (Matching Gambar 1 & Gambar 2) */}
      <div
        className={`p-2.5 border-t shrink-0 transition-colors duration-150 ${
          isLight ? 'border-[#e4e4e9]' : 'border-[#1a1a20]'
        }`}
      >
        <div className="flex items-center justify-between gap-1.5">
          <button
            type="button"
            onClick={onOpenSettingsModal}
            className={`flex-1 flex items-center gap-2.5 px-2.5 h-[34px] rounded-lg text-[13px] transition cursor-pointer font-sans min-w-0 ${
              isLight
                ? 'text-[#5a5a64] hover:text-[#1a1a1e] hover:bg-[#eaecee]'
                : 'text-[#98989e] hover:text-[#dededf] hover:bg-[#17171d]'
            }`}
          >
            <Settings className={`w-4 h-4 shrink-0 ${isLight ? 'text-[#6e6e78]' : 'text-[#7e7e85]'}`} />
            <span className="truncate">Settings</span>
          </button>

          {/* Update Badge: Image 1 = Blue circle with [↓], Image 2 = Expands to "Update" pill on hover */}
          {Boolean(updateInfo) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleTriggerUpdate();
              }}
              onMouseEnter={() => setIsHoveringUpdate(true)}
              onMouseLeave={() => setIsHoveringUpdate(false)}
              className="h-6 rounded-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white flex items-center justify-center transition-all duration-200 ease-out shadow-xs cursor-pointer shrink-0 overflow-hidden"
              style={{
                width: isHoveringUpdate ? '64px' : '24px',
              }}
              title={
                updateInfo?.status === 'downloaded'
                  ? 'Restart and install update'
                  : updateInfo?.version
                  ? `Update available (${updateInfo.version})`
                  : 'Update available'
              }
            >
              {isHoveringUpdate ? (
                <span className="text-[11.5px] font-medium tracking-tight whitespace-nowrap animate-fade-in px-2">
                  {updateInfo?.status === 'downloaded' ? 'Install' : 'Update'}
                </span>
              ) : (
                <Download className="w-3 h-3 stroke-[2.4]" />
              )}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
