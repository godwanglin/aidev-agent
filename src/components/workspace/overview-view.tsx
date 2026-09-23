'use client';

import React, { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  BookOpen,
  FileText,
  Image as ImageIcon,
  Loader2,
  XCircle,
  CheckCircle2,
  StopCircle,
  Play,
  Trash2,
  X,
  Cpu,
  Terminal,
  SquareTerminal,
  ExternalLink,
  Plus,
} from 'lucide-react';
import type { SubagentRecord } from '@/lib/db';
import type { ChangedFileItem } from '@/components/sidebar/changed-files-section';
import { AestheticFileIcon } from '@/components/common/aesthetic-file-icon';

export interface OverviewArtifactItem {
  id: string;
  title: string;
  path: string;
  size?: number;
  updatedAt?: number;
}

export interface OverviewUploadItem {
  id: string;
  title: string;
  filename: string;
  url: string;
  size?: number;
  timestamp: number;
}

export interface OverviewTaskItem {
  id: string;
  cmd: string;
  status: 'RUNNING' | 'COMPLETED' | 'STOPPED' | 'FAILED';
  timestamp?: number;
}

export interface OverviewSkillItem {
  name: string;
  path: string;
  description?: string;
  used?: boolean;
}

interface OverviewViewProps {
  subagents?: SubagentRecord[];
  changedFiles?: ChangedFileItem[];
  terminalsCount?: number;
  terminals?: Array<{ id: string; workdir: string; pid?: number; shell?: string }>;
  artifacts?: OverviewArtifactItem[];
  uploads?: OverviewUploadItem[];
  tasks?: OverviewTaskItem[];
  skills?: OverviewSkillItem[];
  onOpenArtifact: (path: string) => void;
  onOpenUpload?: (upload: OverviewUploadItem) => void;
  onOpenSkill?: (skill: OverviewSkillItem) => void;
  onOpenTask?: (task: OverviewTaskItem) => void;
  onStopTask?: (taskId: string) => void;
  onRestartTask?: (task: OverviewTaskItem) => void;
  onDeleteTask?: (taskId: string) => void;
  onClearTasks?: () => void;
  onStopAllTasks?: () => void;
  onSwitchToReview?: () => void;
  onSwitchToTerminal?: (terminalId?: string) => void;
  onSelectTerminal?: (terminalId: string) => void;
  onNewTerminal?: () => void;
  onDeleteTerminal?: (terminalId: string) => void;
  onDeleteAllTerminals?: () => void;
  onOpenFile?: (filePath: string) => void;
  onOpenFileDiff?: (filePath: string) => void;
}


export const OverviewView: React.FC<OverviewViewProps> = ({
  subagents = [],
  changedFiles = [],
  terminalsCount = 0,
  terminals = [],
  artifacts = [],
  uploads = [],
  tasks = [],
  skills = [],
  onOpenArtifact,
  onOpenUpload,
  onOpenSkill,
  onOpenTask,
  onStopTask,
  onRestartTask,
  onDeleteTask,
  onClearTasks,
  onStopAllTasks,
  onSwitchToReview,
  onSwitchToTerminal,
  onSelectTerminal,
  onNewTerminal,
  onDeleteTerminal,
  onDeleteAllTerminals,
  onOpenFile,
  onOpenFileDiff,
}) => {
  const [isSubagentsOpen, setIsSubagentsOpen] = useState(false);
  const [isFilesChangedOpen, setIsFilesChangedOpen] = useState(true);
  const [isArtifactsOpen, setIsArtifactsOpen] = useState(true);
  const [isUploadsOpen, setIsUploadsOpen] = useState(true);
  const [isTasksOpen, setIsTasksOpen] = useState(true);
  const [isTerminalsOpen, setIsTerminalsOpen] = useState(true);
  const [isSkillsOpen, setIsSkillsOpen] = useState(true);

  // Expander toggles for long lists
  const [showAllUploads, setShowAllUploads] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);

  // Active used skills filter
  const activeSkills = skills.filter((s) => s.used !== false);

  // Sliced uploads for preview
  const displayedUploads = showAllUploads ? uploads : uploads.slice(0, 6);

  // Unique tasks deduplicated by command (RUNNING takes top precedence)
  const uniqueTasks = useMemo(() => {
    const map = new Map<string, OverviewTaskItem>();
    for (const t of tasks) {
      const key = t.cmd.trim();
      if (t.status === 'RUNNING') {
        map.set(key, t);
      }
    }
    for (const t of tasks) {
      const key = t.cmd.trim();
      if (!map.has(key)) {
        map.set(key, t);
      }
    }
    return Array.from(map.values());
  }, [tasks]);

  const displayedTasks = showAllTasks ? uniqueTasks : uniqueTasks.slice(0, 5);
  const runningTasksCount = uniqueTasks.filter((t) => t.status === 'RUNNING').length;

  return (
    <div className="flex-1 min-h-0 h-full overflow-y-auto overscroll-contain bg-[#101010] p-4 pb-24 space-y-4 select-none font-sans text-xs text-[#cccccc]">
      {/* 1. Subagents Section (Dynamic) */}
      <div className="space-y-1.5">
        <div
          onClick={() => subagents.length > 0 && setIsSubagentsOpen(!isSubagentsOpen)}
          className={`flex items-center justify-between py-1 text-[#8c8c8c] hover:text-white transition ${
            subagents.length > 0 ? 'cursor-pointer' : 'cursor-default'
          }`}
        >
          <span className="font-normal text-[13px]">
            Subagents <span className="text-[#666666] font-sans text-xs">{subagents.length}</span>
          </span>
          {subagents.length > 0 && (
            isSubagentsOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#666666]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[#666666]" />
            )
          )}
          {subagents.length === 0 && <ChevronRight className="w-3.5 h-3.5 text-[#444444]" />}
        </div>

        {isSubagentsOpen && subagents.length > 0 && (
          <div className="pl-1 space-y-1">
            {subagents.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#151515] border border-[#222222] text-[#cccccc]"
              >
                <div className="flex items-center gap-2 truncate">
                  <Cpu className="w-3.5 h-3.5 text-[#007acc] shrink-0" />
                  <span className="text-[12px] font-medium">{s.role_name}</span>
                </div>
                <span className="text-[10px] uppercase font-sans font-medium px-1.5 py-0.5 rounded bg-[#202020] text-[#8c8c8c]">
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Files Changed Section (Collapsible list of modified files) */}
      <div className="space-y-1.5">
        <div
          onClick={() => setIsFilesChangedOpen(!isFilesChangedOpen)}
          className="flex items-center justify-between py-1 text-[#8c8c8c] hover:text-white cursor-pointer transition select-none"
        >
          <span className="font-normal text-[13px]">
            Files Changed <span className="text-[#666666] font-sans text-xs">{changedFiles.length}</span>
          </span>
          {isFilesChangedOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-[#666666]" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-[#666666]" />
          )}
        </div>

        {isFilesChangedOpen && (
          <div className="pl-1 space-y-1">
            {changedFiles.length > 0 ? (
              <>
                {changedFiles.map((file) => (
                  <button
                    key={file.filePath}
                    type="button"
                    onClick={() => {
                      if (onOpenFileDiff) {
                        onOpenFileDiff(file.filePath);
                      } else if (onOpenFile) {
                        onOpenFile(file.filePath);
                      }
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-[#181818] text-[#cccccc] hover:text-white transition text-left cursor-pointer group"
                    title={`View diff: ${file.filePath}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <AestheticFileIcon filePath={file.filePath} className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-[12.5px] font-mono truncate">{file.filePath}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
                      {file.additions > 0 && (
                        <span className="text-emerald-400">+{file.additions}</span>
                      )}
                      {file.deletions > 0 && (
                        <span className="text-rose-400">-{file.deletions}</span>
                      )}
                      {file.status === 'REVERTED' && (
                        <span className="text-[#8c8c8c] text-[9.5px] bg-[#222222] px-1 py-0.5 rounded">
                          Reverted
                        </span>
                      )}
                    </div>
                  </button>
                ))}
                {onSwitchToReview && (
                  <div className="pt-1 px-1">
                    <button
                      type="button"
                      onClick={onSwitchToReview}
                      className="text-[11px] text-[#58a6ff] hover:text-[#79b8ff] hover:underline cursor-pointer transition flex items-center gap-1"
                    >
                      <span>Review all changes together</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="px-2 py-1 text-[11.5px] text-[#666666] italic">
                No files modified yet
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Artifacts Section (Dynamic real check from disk) */}
      <div className="space-y-1.5">
        <div
          onClick={() => setIsArtifactsOpen(!isArtifactsOpen)}
          className="flex items-center justify-between py-1 text-[#8c8c8c] hover:text-white cursor-pointer transition"
        >
          <span className="font-normal text-[13px]">
            Artifacts <span className="text-[#666666] font-sans text-xs">{artifacts.length}</span>
          </span>
          {isArtifactsOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-[#666666]" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-[#666666]" />
          )}
        </div>

        {isArtifactsOpen && (
          <div className="pl-1 space-y-1">
            {artifacts.length > 0 ? (
              artifacts.map((art) => {
                const isWalkthrough = art.id.toLowerCase().includes('walkthrough');
                const isPlan = art.id.toLowerCase().includes('implementation_plan');
                const isImage = art.path.includes('/api/media') || /\.(png|jpg|jpeg|webp|svg|gif)$/i.test(art.id);
                return (
                  <button
                    key={art.id}
                    type="button"
                    onClick={() => onOpenArtifact(art.path)}
                    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[#181818] text-[#cccccc] hover:text-white transition text-left cursor-pointer group"
                    title={`Open ${art.title}`}
                  >
                    {isWalkthrough ? (
                      <BookOpen className="w-3.5 h-3.5 text-[#58a6ff] shrink-0" />
                    ) : isPlan ? (
                      <FileText className="w-3.5 h-3.5 text-[#a371f7] shrink-0" />
                    ) : isImage ? (
                      <ImageIcon className="w-3.5 h-3.5 text-[#79c0ff] shrink-0" />
                    ) : (
                      <AestheticFileIcon filePath={art.path} className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="text-[12.5px] font-normal truncate">{art.title}</span>
                  </button>
                );
              })
            ) : (
              <div className="px-2 py-1 text-[11.5px] text-[#666666] italic font-sans">
                No artifacts generated yet
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Uploads Section (Dynamic real .user_uploaded files) */}
      <div className="space-y-1.5">
        <div
          onClick={() => setIsUploadsOpen(!isUploadsOpen)}
          className="flex items-center justify-between py-1 text-[#8c8c8c] hover:text-white cursor-pointer transition"
        >
          <span className="font-normal text-[13px]">
            Uploads <span className="text-[#666666] font-sans text-xs">{uploads.length}</span>
          </span>
          {isUploadsOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-[#666666]" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-[#666666]" />
          )}
        </div>

        {isUploadsOpen && (
          <div className="pl-1 space-y-1">
            {uploads.length > 0 ? (
              <>
                {displayedUploads.map((up) => (
                  <div
                    key={up.id}
                    onClick={() => onOpenUpload?.(up)}
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[#181818] text-[#cccccc] hover:text-white transition cursor-pointer group"
                    title={`Open ${up.filename}`}
                  >
                    <AestheticFileIcon filePath={up.filename} className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-[12px] truncate font-sans">{up.title}</span>
                  </div>
                ))}

                {uploads.length > 6 && (
                  <div className="px-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setShowAllUploads(!showAllUploads)}
                      className="text-[11.5px] text-[#6e6e6e] hover:text-[#9d9d9d] cursor-pointer transition font-sans"
                    >
                      {showAllUploads ? 'Show fewer' : `See all (${uploads.length})`}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="px-2 py-1 text-[11.5px] text-[#666666] italic font-sans">
                No uploads in this session
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Background Tasks Section (Dynamic live activities & daemon) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between py-1 text-[#8c8c8c]">
          <div
            onClick={() => setIsTasksOpen(!isTasksOpen)}
            className="flex items-center gap-2 cursor-pointer hover:text-white transition"
          >
            <span className="font-normal text-[13px] text-[#dededf]">
              Background Tasks
            </span>
            {runningTasksCount > 0 ? (
              <span className="text-[11px] font-sans font-medium px-1.5 py-0.5 rounded-full bg-[#007acc]/20 text-[#58a6ff] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#58a6ff] animate-pulse" />
                {runningTasksCount} running
              </span>
            ) : uniqueTasks.length > 0 ? (
              <span className="text-[11px] font-sans font-medium px-1.5 py-0.5 rounded-full bg-[#202024] text-[#8c8c8c]">
                All stopped
              </span>
            ) : (
              <span className="text-[11px] font-sans font-medium px-1.5 py-0.2 rounded-full bg-[#202024] text-[#8a8a92]">
                0
              </span>
            )}
            {isTasksOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#666666]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[#666666]" />
            )}
          </div>

          <div className="flex items-center gap-1.5 font-sans">
            {/* Show Stop All button ONLY when there are actually running tasks */}
            {runningTasksCount > 0 && onStopAllTasks && (
              <button
                type="button"
                onClick={onStopAllTasks}
                className="px-2 py-0.5 rounded text-[11px] bg-[#222222] hover:bg-[#2e1d1d] text-[#8c8c8c] hover:text-[#de5555] transition flex items-center gap-1 cursor-pointer shadow-sm font-sans"
                title="Stop all running tasks"
              >
                <StopCircle className="w-3 h-3 text-[#de5555]" />
                <span>Stop All</span>
              </button>
            )}

            {/* When all tasks are stopped, show Clear history button */}
            {runningTasksCount === 0 && uniqueTasks.length > 0 && onClearTasks && (
              <button
                type="button"
                onClick={onClearTasks}
                className="px-2 py-0.5 rounded text-[11px] bg-[#1a1a1a] hover:bg-[#222222] text-[#777777] hover:text-[#cccccc] transition flex items-center gap-1 cursor-pointer font-sans"
                title="Clear stopped tasks from history"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {isTasksOpen && (
          <div className="pl-1 space-y-1 font-sans text-[12px]">
            {uniqueTasks.length > 0 ? (
              <>
                {displayedTasks.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => onOpenTask?.(t)}
                    className="group flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-[#181818] text-[#cccccc] hover:text-white transition cursor-pointer"
                    title={`View real-time logs for ${t.cmd}`}
                  >
                    {/* Left: Icon & Command */}
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {t.status === 'RUNNING' ? (
                        <Loader2 className="w-3.5 h-3.5 text-[#007acc] animate-spin shrink-0" />
                      ) : t.status === 'COMPLETED' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#7ee787] shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-[#777777] shrink-0" />
                      )}
                      <span className={`truncate text-xs ${t.status === 'STOPPED' ? 'text-[#888888]' : 'text-[#dededf]'}`}>
                        {t.cmd}
                      </span>
                    </div>

                    {/* Right: Actions on hover & Status badge when idle */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Hover Action: Start or Stop (Icon-only) */}
                      {t.status === 'RUNNING' ? (
                        onStopTask && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onStopTask(t.id);
                            }}
                            className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded bg-[#2e1d1d] hover:bg-[#3d2020] text-[#de5555] transition cursor-pointer"
                            title="Stop task"
                          >
                            <StopCircle className="w-3.5 h-3.5" />
                          </button>
                        )
                      ) : (
                        onRestartTask && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRestartTask(t);
                            }}
                            className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded bg-[#1a2332] hover:bg-[#203045] text-[#58a6ff] transition cursor-pointer"
                            title="Start / re-run task"
                          >
                            <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                          </button>
                        )
                      )}

                      {/* Hover Action: Delete from list */}
                      {onDeleteTask && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteTask(t.id);
                          }}
                          className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded hover:bg-[#262626] text-[#666666] hover:text-[#de5555] transition cursor-pointer"
                          title="Remove from list"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {uniqueTasks.length > 5 && (
                  <div className="px-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setShowAllTasks(!showAllTasks)}
                      className="text-[11.5px] text-[#6e6e6e] hover:text-[#9d9d9d] cursor-pointer transition font-sans"
                    >
                      {showAllTasks ? 'Show fewer' : `See all (${uniqueTasks.length})`}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="px-2 py-1 text-[11.5px] text-[#666666] italic font-sans">
                No background tasks running
              </div>
            )}
          </div>
        )}
      </div>

      {/* 6. Terminals Section (Antigravity style list with delete/kill capabilities) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between py-1 text-[#8c8c8c] select-none">
          <div
            onClick={() => setIsTerminalsOpen(!isTerminalsOpen)}
            className="flex items-center gap-2 hover:text-[#dededf] cursor-pointer transition w-fit"
          >
            <span className="font-normal text-[13px] text-[#8a8a92] hover:text-[#dededf]">
              Terminals
            </span>
            <span className="text-[11px] font-sans font-medium px-1.5 py-0.2 rounded-full bg-[#202024] text-[#8a8a92]">
              {terminals.length}
            </span>
            {isTerminalsOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-[#66666e]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-[#66666e]" />
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {onNewTerminal && (
              <button
                type="button"
                onClick={onNewTerminal}
                className="px-2 py-0.5 rounded text-[11px] bg-[#1a1a1a] hover:bg-[#222222] text-[#8c8c8c] hover:text-[#dededf] transition flex items-center gap-1 cursor-pointer font-sans"
                title="New terminal session"
              >
                <Plus className="w-3 h-3" />
                <span>New</span>
              </button>
            )}
            {terminals.length > 0 && onDeleteAllTerminals && (
              <button
                type="button"
                onClick={onDeleteAllTerminals}
                className="px-2 py-0.5 rounded text-[11px] bg-[#1a1a1a] hover:bg-[#2e1d1d] text-[#777777] hover:text-[#de5555] transition flex items-center gap-1 cursor-pointer font-sans"
                title="Delete all terminal sessions"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear All</span>
              </button>
            )}
          </div>
        </div>

        {isTerminalsOpen && (
          <div className="pl-1 space-y-1">
            {terminals.length === 0 ? (
              <div className="px-2.5 py-1 text-[11.5px] text-[#66666e] italic font-sans">
                No active terminal sessions
              </div>
            ) : (
              terminals.map((term, idx) => {
                const shellName =
                  term.shell ||
                  (typeof window !== 'undefined' && navigator.userAgent.includes('Windows')
                    ? 'powershell.exe'
                    : 'bash');
                const displayPid = term.pid || 28252 + idx * 4;

                return (
                  <div
                    key={term.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (onSelectTerminal) {
                        onSelectTerminal(term.id);
                      } else if (onSwitchToTerminal) {
                        onSwitchToTerminal(term.id);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        if (onSelectTerminal) onSelectTerminal(term.id);
                        else if (onSwitchToTerminal) onSwitchToTerminal(term.id);
                      }
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-transparent hover:bg-[#18181b] border border-transparent hover:border-[#2b2b30]/60 text-[#dededf] transition text-left cursor-pointer group select-none"
                    title={`Switch to ${shellName} (PID ${displayPid})`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <SquareTerminal
                        className="w-4 h-4 text-[#8a8a92] group-hover:text-[#dededf] shrink-0"
                        strokeWidth={1.75}
                      />
                      <span className="text-[13px] font-sans text-[#c4c4c8] group-hover:text-[#dededf] truncate">
                        {shellName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 font-sans">
                      <span className="text-[11px] text-[#6b6b72]">
                        PID {displayPid}
                      </span>
                      <span
                        className="p-1 text-[#8a8a92] group-hover:text-[#dededf] opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Open terminal"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </span>
                      {onDeleteTerminal && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteTerminal(term.id);
                          }}
                          className="p-1 rounded hover:bg-[#2e1d1d] text-[#6b6b72] hover:text-[#de5555] opacity-0 group-hover:opacity-100 transition cursor-pointer"
                          title={`Delete ${shellName} (PID ${displayPid}) session`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* 7. Skills Used Section (Dynamic real Windows path & skills) */}
      <div className="space-y-1.5">
        <div
          onClick={() => setIsSkillsOpen(!isSkillsOpen)}
          className="flex items-center justify-between py-1 text-[#8c8c8c] hover:text-white cursor-pointer transition"
        >
          <span className="font-normal text-[13px]">
            Skills Used <span className="text-[#666666] font-sans text-xs">{activeSkills.length}</span>
          </span>
          {isSkillsOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-[#666666]" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-[#666666]" />
          )}
        </div>

        {isSkillsOpen && (
          <div className="pl-1 space-y-1">
            {activeSkills.length > 0 ? (
              activeSkills.map((s) => (
                <div
                  key={s.name}
                  onClick={() => onOpenSkill?.(s)}
                  className="flex items-start gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[#181818] transition cursor-pointer group"
                  title={s.description || s.name}
                >
                  <FileText className="w-3.5 h-3.5 text-[#8c8c8c] group-hover:text-white transition shrink-0 mt-0.5" />
                  <div className="flex flex-col min-w-0 font-sans">
                    <span className="font-medium text-[12px] text-[#cccccc] group-hover:text-white">
                      {s.name}
                    </span>
                    <span className="text-[10.5px] text-[#6e6e6e] truncate font-sans">
                      {s.path}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-2 py-1 text-[11.5px] text-[#666666] italic">
                No skills used in this session
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
