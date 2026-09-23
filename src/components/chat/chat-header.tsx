'use client';

import React from 'react';
import { PanelRightOpen, Bell, Sparkles, Loader2, PanelLeft, ArrowLeft, ArrowRight, Layers } from 'lucide-react';
import { ProjectSelectorDropdown } from './project-selector-dropdown';
import { AidevLogo } from '../common/antigravity-logo';
import { ContextWindowPopover } from './context-window-popover';
import type { ProjectRecord, SessionRecord } from '@/lib/db';

interface ChatHeaderProps {
  currentProject: ProjectRecord | null;
  currentSession: SessionRecord | null;
  projects?: ProjectRecord[];
  onSelectProject?: (project: ProjectRecord | null) => void;
  onOpenNewProjectModal?: () => void;
  isRightPanelOpen: boolean;
  onToggleRightPanel: () => void;
  onOpenSettingsModal: () => void;
  onAutoRenameSession?: (sessionId: string) => void;
  isRenamingSession?: boolean;
  estimatedTokens?: number;
  modelContextWindow?: number;
  activeModelName?: string;
  onCompactSession?: () => void;
  isCompacting?: boolean;
  compactionsCount?: number;
  latestTokensSaved?: number;
  hideRightControls?: boolean;
  isSplitActive?: boolean;
  onSplitSession?: (session: SessionRecord, direction: 'right' | 'down') => void;
  onRemoveFromSplit?: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
  onToggleUnreadSession?: (session: SessionRecord) => void;
  onStartRename?: (session: SessionRecord) => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onOpenTerminal?: () => void;
  onNewTerminal?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  currentProject,
  currentSession,
  projects = [],
  onSelectProject,
  onOpenNewProjectModal,
  isRightPanelOpen,
  onToggleRightPanel,
  onOpenSettingsModal,
  onAutoRenameSession,
  isRenamingSession = false,
  estimatedTokens,
  modelContextWindow,
  activeModelName,
  onCompactSession,
  isCompacting = false,
  compactionsCount = 0,
  latestTokensSaved = 0,
  hideRightControls = false,
  isSplitActive = false,
  onSplitSession,
  onRemoveFromSplit,
  onDeleteSession,
  onToggleUnreadSession,
  onStartRename,
  isSidebarCollapsed = false,
  onToggleSidebar,
  onOpenTerminal,
  onNewTerminal,
}) => {
  const [isElectron, setIsElectron] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== 'undefined' && Boolean((window as any).electronAPI?.isElectron)) {
      setIsElectron(true);
    }
  }, []);

  return (
    <div className="h-9 sm:h-10 px-2 sm:px-3 flex items-center justify-between bg-[#151515] border-b border-[#191919] select-none shrink-0 font-sans text-xs relative z-30">
      {/* Left: Project / Session Breadcrumb (with collapsed sidebar navigation controls in Image 3) */}
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 pr-2">
        {isSidebarCollapsed && !isElectron && (
          <div className="flex items-center gap-1 sm:gap-1.5 mr-0.5 sm:mr-1 pr-1.5 sm:pr-2 border-r border-[#242424] shrink-0">
            {/* Aidev Logo */}
            <button
              type="button"
              onClick={onToggleSidebar}
              className="p-1 text-white hover:text-[#cccccc] transition cursor-pointer"
              title="Expand sidebar"
            >
              <AidevLogo className="w-4 h-4" />
            </button>
            {/* Sidebar Toggle Icon */}
            <button
              type="button"
              onClick={onToggleSidebar}
              className="p-1 rounded text-[#737373] hover:text-[#cccccc] hover:bg-white/[0.06] transition cursor-pointer"
              title="Expand sidebar"
            >
              <PanelLeft className="w-3.5 h-3.5" />
            </button>
            {/* Navigation Arrows (desktop only) */}
            <div className="hidden sm:flex items-center gap-0.5 text-[#555555]">
              <button
                type="button"
                onClick={() => window.history.back()}
                className="p-1 hover:text-[#cccccc] transition cursor-pointer"
                title="Back"
              >
                <ArrowLeft className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => window.history.forward()}
                className="p-1 hover:text-[#cccccc] transition cursor-pointer"
                title="Forward"
              >
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
        {currentSession ? (
          <>
            {onSelectProject && onOpenNewProjectModal ? (
              <ProjectSelectorDropdown
                projects={projects}
                currentProject={currentProject}
                onSelectProject={onSelectProject}
                onOpenNewProjectModal={onOpenNewProjectModal}
              />
            ) : (
              <span className="text-[#6e6e6e] font-medium truncate">
                {currentProject ? currentProject.name : 'No Project'}
              </span>
            )}
            <span className="text-[#484848] font-mono">/</span>
            <span className="text-[#cccccc] font-medium truncate max-w-[140px] xs:max-w-[180px] sm:max-w-xs md:max-w-sm" title={currentSession.title}>
              {currentSession.title}
            </span>
            {onAutoRenameSession && (
              <button
                type="button"
                onClick={() => onAutoRenameSession(currentSession.id)}
                disabled={isRenamingSession}
                className="hidden sm:inline-flex p-1 text-[#6e6e6e] hover:text-[#e8975f] hover:bg-white/[0.06] rounded transition cursor-pointer shrink-0"
                title="Auto-rename conversation title with AI"
              >
                {isRenamingSession ? (
                  <Loader2 className="w-3 h-3 text-[#e8975f] animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
              </button>
            )}
          </>
        ) : null}
      </div>

      {/* Right: Actions, Install IDE, and Toggle Sidebar */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Context Token Progress Ring (Mobile) / Pill (Desktop) */}
        {currentSession && estimatedTokens !== undefined && estimatedTokens > 0 && (
          <ContextWindowPopover
            estimatedTokens={estimatedTokens}
            modelContextWindow={modelContextWindow}
            activeModelName={activeModelName || currentSession.model_id}
            onCompactSession={onCompactSession}
            isCompacting={isCompacting}
            compactionsCount={compactionsCount}
            latestTokensSaved={latestTokensSaved}
          />
        )}

        {/* Notification Bell (desktop only) */}
        {!isRightPanelOpen && !hideRightControls && (
          <button
            type="button"
            className="hidden sm:inline-flex p-1 text-[#6e6e6e] hover:text-[#cccccc] hover:bg-[#191919] rounded transition cursor-pointer"
            title="Notifications"
          >
            <Bell className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Sidebar Toggle Button */}
        {!isRightPanelOpen && !hideRightControls && (
          <button
            type="button"
            onClick={onToggleRightPanel}
            className="p-1.5 rounded-md text-[#6e6e6e] hover:text-white hover:bg-[#1f1f1f] border border-[#262626] transition cursor-pointer"
            title="Open side panel"
          >
            <PanelRightOpen className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
