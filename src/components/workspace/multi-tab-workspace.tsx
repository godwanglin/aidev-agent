'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { WorkspaceHeader, WorkspaceMode } from './workspace-header';
import { FileExplorerSidebar } from './file-explorer/file-explorer-sidebar';
import {
  OverviewView,
  OverviewArtifactItem,
  OverviewUploadItem,
  OverviewTaskItem,
  OverviewSkillItem,
} from './overview-view';
import { ReviewView } from './review-view';
import { GitView } from './git-view';
import { TerminalView } from './terminal-view';
import { FileViewer } from './file-viewer';
import { DiffViewer } from './diff-viewer';
import { TaskOutputViewer } from './task-output-viewer';
import { BrowserPreviewViewer } from './browser-preview-viewer';
import { QuickOpenModal } from '../modals/quick-open-modal';
import type { SubagentRecord } from '@/lib/db';
import type { ChangedFileItem } from '@/components/sidebar/changed-files-section';

export type TabType = 'diff' | 'file' | 'terminal' | 'task' | 'browser';

export interface WorkspaceTab {
  id: string;
  type: TabType;
  title: string;
  filePath?: string;
  originalContent?: string;
  currentContent?: string;
  snapshotId?: string;
  terminalId?: string;
  taskId?: string;
  taskCmd?: string;
  url?: string;
  favicon?: string | null;
  highlightRange?: { startLine?: number; endLine?: number };
}

interface MultiTabWorkspaceProps {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  workdir: string;
  projectName?: string;
  subagents?: SubagentRecord[];
  changedFiles?: ChangedFileItem[];
  terminals?: Array<{ id: string; workdir: string }>;
  workspaceFiles?: string[];
  artifacts?: OverviewArtifactItem[];
  uploads?: OverviewUploadItem[];
  tasks?: OverviewTaskItem[];
  skills?: OverviewSkillItem[];
  isMaximized?: boolean;
  activeMode?: WorkspaceMode;
  currentTurnPrompt?: string;
  onSelectMode?: (mode: WorkspaceMode) => void;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTerminalTab: () => void;
  onOpenTerminal?: (terminalId: string) => void;
  onRevertFile?: (snapshotId: string, filePath: string) => void;
  onSendMessage?: (content: string) => void;
  onOpenFile?: (filePath: string, lineRange?: { startLine?: number; endLine?: number }) => void;
  onOpenFileDiff?: (filePath: string) => void;
  onOpenTask?: (task: OverviewTaskItem) => void;
  onOpenBrowserTab?: (url?: string) => void;
  onBrowserMetadataChange?: (tabId: string, metadata: { title: string; favicon: string | null; url: string }) => void;
  onStopTask?: (taskId: string) => void;
  onRestartTask?: (task: OverviewTaskItem) => void;
  onDeleteTask?: (taskId: string) => void;
  onClearTasks?: () => void;
  onStopAllTasks?: () => void;
  onDeleteTerminal?: (id: string) => Promise<boolean | void> | boolean | void;
  onDeleteAllTerminals?: () => Promise<boolean | void> | boolean | void;
  onToggleMaximize?: () => void;
  onToggleSidebar?: () => void;
}

export const MultiTabWorkspace: React.FC<MultiTabWorkspaceProps> = ({
  tabs,
  activeTabId,
  workdir,
  projectName,
  subagents = [],
  changedFiles = [],
  terminals = [],
  workspaceFiles = [],
  artifacts = [],
  uploads = [],
  tasks = [],
  skills = [],
  isMaximized = false,
  activeMode: activeModeProp,
  currentTurnPrompt,
  onSelectMode: onSelectModeProp,
  onSelectTab,
  onCloseTab,
  onNewTerminalTab,
  onOpenTerminal,
  onRevertFile,
  onSendMessage,
  onOpenFile,
  onOpenFileDiff,
  onOpenTask,
  onOpenBrowserTab,
  onBrowserMetadataChange,
  onStopTask,
  onRestartTask,
  onDeleteTask,
  onClearTasks,
  onStopAllTasks,
  onDeleteTerminal,
  onDeleteAllTerminals,
  onToggleMaximize,
  onToggleSidebar,
}) => {
  const [internalMode, setInternalMode] = useState<WorkspaceMode>('file');
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null);
  const [isQuickOpenOpen, setIsQuickOpenOpen] = useState(false);
  const [quickOpenMode, setQuickOpenMode] = useState<'files' | 'grep'>('files');

  // File Explorer persistent state
  const [isFileExplorerOpen, setIsFileExplorerOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('aidev:file-explorer-open');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });
  const [fileExplorerWidth, setFileExplorerWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('aidev:file-explorer-width');
      const parsed = saved ? parseInt(saved, 10) : 230;
      return !isNaN(parsed) && parsed >= 160 && parsed <= 480 ? parsed : 230;
    }
    return 230;
  });
  const [fetchedFiles, setFetchedFiles] = useState<string[]>([]);

  const effectiveMode = activeModeProp !== undefined ? activeModeProp : internalMode;

  // Toggle file explorer open / closed with persistence
  const toggleFileExplorer = useCallback(() => {
    setIsFileExplorerOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('aidev:file-explorer-open', String(next));
      } catch {}
      return next;
    });
    if (effectiveMode !== 'file') {
      if (onSelectModeProp) {
        onSelectModeProp('file');
      } else {
        setInternalMode('file');
      }
    }
  }, [effectiveMode, onSelectModeProp]);

  // Global Ctrl+P / Cmd+P listener for Quick Open palette (files),
  // Ctrl+Shift+F for Grep Code palette, and Ctrl+Shift+E for File Explorer
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        setQuickOpenMode('grep');
        setIsQuickOpenOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
        e.preventDefault();
        toggleFileExplorer();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setQuickOpenMode('files');
        setIsQuickOpenOpen(true);
      }
    };
    const handleOpenQuickOpen = () => {
      setQuickOpenMode('files');
      setIsQuickOpenOpen(true);
    };

    const handleOpenQuickGrep = () => {
      setQuickOpenMode('grep');
      setIsQuickOpenOpen(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('aidev:open-quick-open', handleOpenQuickOpen);
    window.addEventListener('aidev:open-grep', handleOpenQuickGrep);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('aidev:open-quick-open', handleOpenQuickOpen);
      window.removeEventListener('aidev:open-grep', handleOpenQuickGrep);
    };
  }, [toggleFileExplorer]);

  // Refresh files list from /api/files/list
  const handleRefreshFiles = useCallback(async () => {
    if (!workdir) return;
    try {
      const res = await fetch(`/api/files/list?workdir=${encodeURIComponent(workdir)}`);
      const data = await res.json();
      if (Array.isArray(data.files)) {
        setFetchedFiles(data.files);
      }
    } catch {}
  }, [workdir]);

  // Load files if workspaceFiles prop is empty on mount
  useEffect(() => {
    if ((!workspaceFiles || workspaceFiles.length === 0) && workdir) {
      handleRefreshFiles();
    }
  }, [workspaceFiles, workdir, handleRefreshFiles]);

  const effectiveFilesList = workspaceFiles && workspaceFiles.length > 0 ? workspaceFiles : fetchedFiles;

  // Filter file, task, browser, and terminal tabs
  const fileTabs = tabs.filter((t) => t.type === 'file' || t.type === 'diff' || t.type === 'task' || t.type === 'browser' || t.type === 'terminal');
  const activeFileTab = fileTabs.find((t) => t.id === activeTabId) || fileTabs[0] || null;

  // Keep selectedTerminalId synced when user switches between terminal tabs in the header bar
  React.useEffect(() => {
    if (activeFileTab?.type === 'terminal' && activeFileTab.terminalId) {
      setSelectedTerminalId(activeFileTab.terminalId);
    }
  }, [activeFileTab?.id, activeFileTab?.terminalId]);

  const handleActivateTerminalSession = (id: string) => {
    setSelectedTerminalId(id);
    const matchingTab = fileTabs.find((t) => t.type === 'terminal' && t.terminalId === id);
    if (matchingTab) {
      onSelectTab(matchingTab.id);
      handleSelectMode('file');
    } else if (onOpenTerminal) {
      onOpenTerminal(id);
    } else {
      handleSelectMode('terminal');
    }
  };

  // Handle switching view mode
  const handleSelectMode = (mode: WorkspaceMode) => {
    if (onSelectModeProp) {
      onSelectModeProp(mode);
    } else {
      setInternalMode(mode);
    }
  };

  const handleSelectFileTab = (tabId: string) => {
    onSelectTab(tabId);
    handleSelectMode('file');
  };

  const handleOpenArtifactOrFile = (path: string, lineRange?: { startLine?: number; endLine?: number }) => {
    if (onOpenFile) {
      onOpenFile(path, lineRange);
      handleSelectMode('file');
    }
  };

  const handleOpenUpload = (up: OverviewUploadItem) => {
    if (onOpenFile) {
      onOpenFile(up.url);
      handleSelectMode('file');
    }
  };

  const handleOpenSkill = (skill: OverviewSkillItem) => {
    if (onOpenFile) {
      onOpenFile(`${skill.path}/SKILL.md`);
      handleSelectMode('file');
    }
  };

  const handleOpenTask = (task: OverviewTaskItem) => {
    if (onOpenTask) {
      onOpenTask(task);
      handleSelectMode('file');
    }
  };

  const handleDeleteTerminal = async (id: string) => {
    if (onDeleteTerminal) {
      const confirmed = await onDeleteTerminal(id);
      if (confirmed === false) return;
    }
    if (selectedTerminalId === id) {
      const remaining = terminals.filter((t) => t.id !== id);
      if (remaining.length > 0) {
        setSelectedTerminalId(remaining[0].id);
      } else {
        setSelectedTerminalId(null);
        handleSelectMode('overview');
      }
    }
  };

  const handleDeleteAllTerminals = async () => {
    if (onDeleteAllTerminals) {
      const confirmed = await onDeleteAllTerminals();
      if (confirmed === false) return;
    }
    setSelectedTerminalId(null);
    if (effectiveMode === 'terminal') {
      handleSelectMode('overview');
    }
  };

  return (
    <section className="flex-1 min-h-0 flex flex-col h-full bg-[#101010] overflow-hidden">
      {/* 1. Antigravity Sidebar Header Bar (Overview, Review, Terminal, Tabs, + Dropdown, Toggle) */}
      <WorkspaceHeader
        activeMode={effectiveMode}
        activeFileTabId={activeFileTab?.id || null}
        fileTabs={fileTabs}
        isMaximized={isMaximized}
        isFileExplorerOpen={isFileExplorerOpen}
        onToggleFileExplorer={toggleFileExplorer}
        onSelectMode={handleSelectMode}
        onSelectFileTab={handleSelectFileTab}
        onCloseFileTab={onCloseTab}
        onOpenFileModal={() => setIsQuickOpenOpen(true)}
        onNewTerminal={onNewTerminalTab}
        onOpenBrowser={onOpenBrowserTab}
        onToggleMaximize={() => onToggleMaximize?.()}
        onToggleSidebar={() => onToggleSidebar?.()}
      />

      {/* 2. Main View Body */}
      <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden bg-[#101010]">
        {effectiveMode === 'overview' && (
          <OverviewView
            subagents={subagents}
            changedFiles={changedFiles}
            terminalsCount={terminals.length}
            terminals={terminals}
            artifacts={artifacts}
            uploads={uploads}
            tasks={tasks}
            skills={skills}
            onOpenArtifact={handleOpenArtifactOrFile}
            onOpenUpload={handleOpenUpload}
            onOpenSkill={handleOpenSkill}
            onOpenTask={handleOpenTask}
            onStopTask={onStopTask}
            onRestartTask={onRestartTask}
            onDeleteTask={onDeleteTask}
            onClearTasks={onClearTasks}
            onStopAllTasks={onStopAllTasks}
            onDeleteTerminal={handleDeleteTerminal}
            onDeleteAllTerminals={handleDeleteAllTerminals}
            onSwitchToReview={() => handleSelectMode('review')}
            onSwitchToTerminal={(termId) => {
              if (termId) {
                handleActivateTerminalSession(termId);
              } else {
                handleSelectMode('terminal');
              }
            }}
            onSelectTerminal={(termId) => {
              handleActivateTerminalSession(termId);
            }}
            onNewTerminal={onNewTerminalTab}
            onOpenFile={handleOpenArtifactOrFile}
            onOpenFileDiff={onOpenFileDiff}
          />
        )}

        {effectiveMode === 'review' && (
          <ReviewView
            changedFiles={changedFiles}
            currentTurnPrompt={currentTurnPrompt}
            onRevertFile={onRevertFile}
            onSendMessage={onSendMessage}
          />
        )}

        {effectiveMode === 'git' && (
          <GitView
            workdir={workdir}
            projectName={projectName}
            onOpenTerminal={() => {
              handleSelectMode('terminal');
            }}
          />
        )}

        {effectiveMode === 'terminal' && (
          <TerminalView
            terminals={terminals.length > 0 ? terminals : [{ id: 'default', workdir }]}
            activeTerminalId={selectedTerminalId || (terminals[0]?.id ?? 'default')}
            workdir={workdir}
            onSelectTerminal={handleActivateTerminalSession}
            onNewTerminal={onNewTerminalTab}
            onDeleteTerminal={handleDeleteTerminal}
          />
        )}

        {effectiveMode === 'file' && (
          <div className="flex-1 min-h-0 flex h-full overflow-hidden bg-[#101010]">
            {/* File Explorer Sidebar (Collapsible & Resizable) */}
            <FileExplorerSidebar
              workdir={workdir}
              projectName={projectName}
              files={effectiveFilesList}
              activeFilePath={activeFileTab?.filePath}
              changedFiles={changedFiles}
              isOpen={isFileExplorerOpen}
              width={fileExplorerWidth}
              onToggleOpen={() => {
                setIsFileExplorerOpen(false);
                try {
                  localStorage.setItem('aidev:file-explorer-open', 'false');
                } catch {}
              }}
              onWidthChange={(newWidth) => {
                setFileExplorerWidth(newWidth);
                try {
                  localStorage.setItem('aidev:file-explorer-width', String(newWidth));
                } catch {}
              }}
              onOpenFile={(path) => handleOpenArtifactOrFile(path)}
              onRefresh={handleRefreshFiles}
            />

            {/* Right Pane: Active File Editor / Viewer */}
            <div className="flex-1 min-w-0 min-h-0 flex flex-col h-full overflow-hidden bg-[#101010]">
              {activeFileTab ? (
                activeFileTab.type === 'terminal' ? (
                  <TerminalView
                    terminals={terminals.length > 0 ? terminals : [{ id: activeFileTab.terminalId || 'default', workdir }]}
                    activeTerminalId={selectedTerminalId || activeFileTab.terminalId || (terminals[0]?.id ?? 'default')}
                    workdir={workdir}
                    onSelectTerminal={handleActivateTerminalSession}
                    onNewTerminal={onNewTerminalTab}
                    onDeleteTerminal={handleDeleteTerminal}
                  />
                ) : activeFileTab.type === 'browser' ? (
                  <BrowserPreviewViewer
                    initialUrl={activeFileTab.url || ''}
                    tasks={tasks}
                    onUrlChange={(newUrl) => {
                      activeFileTab.url = newUrl;
                      onBrowserMetadataChange?.(activeFileTab.id, {
                        title: activeFileTab.title,
                        favicon: activeFileTab.favicon || null,
                        url: newUrl,
                      });
                    }}
                    onMetadataChange={(meta) => {
                      onBrowserMetadataChange?.(activeFileTab.id, meta);
                    }}
                  />
                ) : activeFileTab.type === 'task' ? (
                  <TaskOutputViewer
                    taskId={activeFileTab.taskId || activeFileTab.id}
                    cmd={activeFileTab.taskCmd || activeFileTab.title}
                    tasks={tasks}
                    onSelectTask={onOpenTask}
                    onOpenBrowser={onOpenBrowserTab}
                    onStop={onStopTask || onStopAllTasks}
                    onRestartTask={onRestartTask}
                    onDeleteTask={onDeleteTask}
                    onClearTasks={onClearTasks}
                    onStopAllTasks={onStopAllTasks}
                    onOpenOverview={() => handleSelectMode('overview')}
                  />
                ) : activeFileTab.type === 'diff' ? (
                  <DiffViewer
                    mode="stacked"
                    filePath={activeFileTab.filePath || 'Unknown'}
                    originalContent={activeFileTab.originalContent || ''}
                    currentContent={activeFileTab.currentContent || ''}
                    snapshotId={activeFileTab.snapshotId}
                    onRevert={
                      onRevertFile && activeFileTab.snapshotId && activeFileTab.filePath
                        ? (sid) => onRevertFile(sid, activeFileTab.filePath!)
                        : undefined
                    }
                    showBreadcrumbs={true}
                    workdir={workdir}
                    onOpenReview={() => handleSelectMode('review')}
                  />
                ) : (
                  <FileViewer
                    filePath={activeFileTab.filePath || 'Unknown'}
                    content={activeFileTab.currentContent || ''}
                    highlightRange={activeFileTab.highlightRange}
                    onSendMessage={onSendMessage}
                    onOpenFile={onOpenFile}
                  />
                )
              ) : (
                <OverviewView
                  subagents={subagents}
                  changedFiles={changedFiles}
                  terminalsCount={terminals.length}
                  terminals={terminals}
                  artifacts={artifacts}
                  uploads={uploads}
                  tasks={tasks}
                  skills={skills}
                  onOpenArtifact={handleOpenArtifactOrFile}
                  onOpenUpload={handleOpenUpload}
                  onOpenSkill={handleOpenSkill}
                  onOpenTask={handleOpenTask}
                  onStopTask={onStopTask}
                  onRestartTask={onRestartTask}
                  onDeleteTask={onDeleteTask}
                  onClearTasks={onClearTasks}
                  onStopAllTasks={onStopAllTasks}
                  onDeleteTerminal={handleDeleteTerminal}
                  onDeleteAllTerminals={handleDeleteAllTerminals}
                  onSwitchToReview={() => handleSelectMode('review')}
                  onSwitchToTerminal={(termId) => {
                    if (termId) {
                      handleActivateTerminalSession(termId);
                    } else {
                      handleSelectMode('terminal');
                    }
                  }}
                  onSelectTerminal={(termId) => {
                    handleActivateTerminalSession(termId);
                  }}
                  onNewTerminal={onNewTerminalTab}
                  onOpenFile={handleOpenArtifactOrFile}
                  onOpenFileDiff={onOpenFileDiff}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. Quick-Open File & Grep Modal (Triggered by '+' -> Open file... or Ctrl+P / Ctrl+Shift+F) */}
      <QuickOpenModal
        isOpen={isQuickOpenOpen}
        onClose={() => setIsQuickOpenOpen(false)}
        workspaceFiles={workspaceFiles}
        changedFiles={changedFiles}
        artifacts={artifacts}
        uploads={uploads}
        onSelectFile={handleOpenArtifactOrFile}
        workdir={workdir}
        initialMode={quickOpenMode}
      />
    </section>
  );
};
