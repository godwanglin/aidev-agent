'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  CalendarClock,
  X,
  Play,
  StopCircle,
  RotateCcw,
  Trash2,
  Terminal,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  Plus,
  RefreshCw,
  Clock,
  Search,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react';
import type { OverviewTaskItem } from '@/components/workspace/overview-view';
import { formatRelativeTime } from '@/lib/project-utils';

interface ScheduledTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: OverviewTaskItem[];
  onOpenTask?: (task: OverviewTaskItem) => void;
  onStopTask?: (taskId: string) => void;
  onRestartTask?: (task: OverviewTaskItem) => void;
  onDeleteTask?: (taskId: string) => void;
  onClearTasks?: () => void;
  onStopAllTasks?: () => void;
  currentWorkdir?: string;
  sessionId?: string;
  projectId?: string;
  onTaskStarted?: (task: any) => void;
}

export const ScheduledTasksModal: React.FC<ScheduledTasksModalProps> = ({
  isOpen,
  onClose,
  tasks = [],
  onOpenTask,
  onStopTask,
  onRestartTask,
  onDeleteTask,
  onClearTasks,
  onStopAllTasks,
  currentWorkdir = '',
  sessionId = '',
  projectId = '',
  onTaskStarted,
}) => {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskLogs, setTaskLogs] = useState<string>('');
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
  const [newCommand, setNewCommand] = useState<string>('');
  const [isStartingTask, setIsStartingTask] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'all' | 'running' | 'stopped'>('all');
  const [mobileView, setMobileView] = useState<'list' | 'logs'>('list');
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Reset mobile view on open/close
  useEffect(() => {
    if (!isOpen) {
      setMobileView('list');
    }
  }, [isOpen]);

  // Default select first task or keep selected
  useEffect(() => {
    if (tasks.length > 0) {
      if (!selectedTaskId || !tasks.some((t) => t.id === selectedTaskId)) {
        setSelectedTaskId(tasks[0].id);
      }
    } else {
      setSelectedTaskId(null);
      setTaskLogs('');
      setMobileView('list');
    }
  }, [tasks, selectedTaskId]);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) || null;

  // Poll / fetch logs for selected task
  useEffect(() => {
    if (!isOpen || !selectedTask) {
      setTaskLogs('');
      return;
    }

    let isMounted = true;
    const fetchLogs = async () => {
      try {
        setIsLoadingLogs(true);
        const res = await fetch(
          `/api/tasks/logs?id=${encodeURIComponent(selectedTask.id)}&cmd=${encodeURIComponent(
            selectedTask.cmd
          )}`
        );
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setTaskLogs(data.logs || 'No logs recorded yet.');
          }
        }
      } catch (err) {
        if (isMounted) setTaskLogs('Failed to load task logs.');
      } finally {
        if (isMounted) setIsLoadingLogs(false);
      }
    };

    fetchLogs();

    // Auto-poll if task is running
    let timer: NodeJS.Timeout | null = null;
    if (selectedTask.status === 'RUNNING') {
      timer = setInterval(fetchLogs, 3000);
    }

    return () => {
      isMounted = false;
      if (timer) clearInterval(timer);
    };
  }, [isOpen, selectedTask?.id, selectedTask?.status, selectedTask?.cmd]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [taskLogs]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const runningCount = tasks.filter((t) => t.status === 'RUNNING').length;
  const stoppedCount = tasks.filter((t) => t.status !== 'RUNNING').length;

  const filteredTasks = tasks.filter((t) => {
    if (activeTab === 'running' && t.status !== 'RUNNING') return false;
    if (activeTab === 'stopped' && t.status === 'RUNNING') return false;
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      return t.cmd.toLowerCase().includes(q) || t.id.toLowerCase().includes(q);
    }
    return true;
  });

  const handleRunCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommand.trim() || isStartingTask) return;

    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }

    try {
      setIsStartingTask(true);
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: newCommand.trim(),
          workdir: currentWorkdir,
          sessionId: sessionId || undefined,
          projectId: projectId || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setNewCommand('');
        if (data.task) {
          setSelectedTaskId(data.task.id);
          setMobileView('logs');
          if (onTaskStarted) onTaskStarted(data.task);
        }
      }
    } catch (err) {
      console.error('Failed to start background task:', err);
    } finally {
      setIsStartingTask(false);
    }
  };

  const handleCopyLogs = () => {
    if (!taskLogs) return;
    navigator.clipboard.writeText(taskLogs);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-0 sm:p-4 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="w-full h-full sm:h-[620px] sm:max-h-[90vh] max-w-4xl rounded-none sm:rounded-2xl border-0 sm:border border-[#2b2b30] bg-[#141416] shadow-2xl overflow-hidden flex flex-col font-sans pb-[env(safe-area-inset-bottom)] sm:pb-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Header */}
        <div className="px-4 sm:px-5 py-3 sm:py-3.5 border-b border-[#232328] flex items-center justify-between bg-[#17171a] shrink-0">
          {mobileView === 'logs' && selectedTask ? (
            <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
              <button
                type="button"
                onClick={() => setMobileView('list')}
                className="p-1 -ml-1 rounded-lg text-[#9da0a8] hover:text-white hover:bg-[#202024] flex items-center gap-1 text-xs font-medium cursor-pointer shrink-0 transition"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Tasks</span>
              </button>
              <span className="text-[#3b3b42] shrink-0">/</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[13px] font-mono text-[#dededf] truncate">
                  {selectedTask.cmd}
                </span>
                {selectedTask.status === 'RUNNING' && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="p-1.5 rounded-lg bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/20 shrink-0">
                <CalendarClock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-[13.5px] sm:text-[14px] font-semibold text-[#dededf] truncate">
                    Scheduled &amp; Background Tasks
                  </h2>
                  {runningCount > 0 && (
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] sm:text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {runningCount} Running
                    </span>
                  )}
                </div>
                <p className="text-[11px] sm:text-[11.5px] text-[#7e7e85] truncate hidden xs:block">
                  Manage background processes, dev servers, watcher tasks &amp; logs
                </p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#7e7e85] hover:text-[#dededf] hover:bg-[#202024] transition cursor-pointer shrink-0 ml-2"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. Top Bar: Quick Launcher & Global Actions */}
        <div
          className={`px-4 sm:px-5 py-3 sm:py-2.5 border-b border-[#202024] bg-[#121214] flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0 ${
            mobileView === 'logs' ? 'hidden sm:flex' : 'flex'
          }`}
        >
          {/* Quick Launch Form */}
          <form onSubmit={handleRunCommand} className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full min-w-0">
            <div className="relative flex-1 min-w-0">
              <Terminal className="w-3.5 h-3.5 text-[#5e5e65] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={newCommand}
                onChange={(e) => setNewCommand(e.target.value)}
                placeholder="Launch command (e.g. npm run dev, python app.py)..."
                className="w-full pl-8 pr-3 py-2 sm:py-1.5 rounded-lg bg-[#1a1a1e] border border-[#2b2b30] text-[12px] text-[#dededf] placeholder-[#5e5e65] focus:outline-none focus:border-[#38bdf8]/60 transition font-mono"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="submit"
                disabled={!newCommand.trim() || isStartingTask}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 sm:py-1.5 rounded-lg bg-[#38bdf8]/15 hover:bg-[#38bdf8]/25 text-[#38bdf8] border border-[#38bdf8]/30 text-[12px] font-medium transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isStartingTask ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>Run Background</span>
              </button>

              {/* Mobile inline Clear Stopped button */}
              {stoppedCount > 0 && onClearTasks && (
                <button
                  type="button"
                  onClick={onClearTasks}
                  className="sm:hidden flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#1f1f23] hover:bg-[#27272c] text-[#98989e] hover:text-[#dededf] border border-[#2b2b30] text-[12px] transition cursor-pointer shrink-0"
                  title="Clear all completed or stopped tasks"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </form>

          {/* Desktop Global Task Actions */}
          {(runningCount > 0 || (stoppedCount > 0 && onClearTasks)) && (
            <div className="hidden sm:flex items-center gap-2 shrink-0 justify-end">
              {runningCount > 0 && onStopAllTasks && (
                <button
                  type="button"
                  onClick={onStopAllTasks}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 text-[11.5px] font-medium transition cursor-pointer"
                  title="Stop all active background processes"
                >
                  <StopCircle className="w-3.5 h-3.5" />
                  <span>Stop All ({runningCount})</span>
                </button>
              )}
              {stoppedCount > 0 && onClearTasks && (
                <button
                  type="button"
                  onClick={onClearTasks}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1f1f23] hover:bg-[#27272c] text-[#98989e] hover:text-[#dededf] border border-[#2b2b30] text-[11.5px] transition cursor-pointer"
                  title="Clear all completed or stopped tasks"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Stopped</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* 3. Main Content: Split Task List & Log Inspector */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left: Task List */}
          <div
            className={`w-full sm:w-[320px] md:w-[360px] shrink-0 border-r-0 sm:border-r border-[#202024] flex flex-col bg-[#141417] ${
              mobileView === 'logs' ? 'hidden sm:flex' : 'flex'
            }`}
          >
            {/* Filter Tabs & Search */}
            <div className="p-3 border-b border-[#202024] space-y-2 shrink-0">
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#1a1a1e] border border-[#26262a]">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`flex-1 py-1.5 sm:py-1 rounded text-[11.5px] font-medium transition cursor-pointer text-center ${
                    activeTab === 'all'
                      ? 'bg-[#28282e] text-[#dededf] shadow-sm'
                      : 'text-[#7e7e85] hover:text-[#dededf]'
                  }`}
                >
                  All ({tasks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('running')}
                  className={`flex-1 py-1.5 sm:py-1 rounded text-[11.5px] font-medium transition cursor-pointer text-center ${
                    activeTab === 'running'
                      ? 'bg-[#28282e] text-emerald-400 shadow-sm'
                      : 'text-[#7e7e85] hover:text-[#dededf]'
                  }`}
                >
                  Running ({runningCount})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('stopped')}
                  className={`flex-1 py-1.5 sm:py-1 rounded text-[11.5px] font-medium transition cursor-pointer text-center ${
                    activeTab === 'stopped'
                      ? 'bg-[#28282e] text-[#98989e] shadow-sm'
                      : 'text-[#7e7e85] hover:text-[#dededf]'
                  }`}
                >
                  Stopped ({stoppedCount})
                </button>
              </div>

              <div className="relative">
                <Search className="w-3 h-3 text-[#5e5e65] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter tasks by command or id..."
                  className="w-full pl-7 pr-2.5 py-1 rounded bg-[#1a1a1e] border border-[#26262a] text-[11.5px] text-[#dededf] placeholder-[#5e5e65] focus:outline-none focus:border-[#38bdf8]/50"
                />
              </div>
            </div>

            {/* Tasks Scrollable List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {filteredTasks.length === 0 ? (
                <div className="py-12 text-center text-[12px] text-[#5e5e65]">
                  <Terminal className="w-6 h-6 mx-auto mb-2 opacity-30" />
                  <p>No tasks found</p>
                </div>
              ) : (
                filteredTasks.map((t) => {
                  const isSelected = t.id === selectedTaskId;
                  const isRunning = t.status === 'RUNNING';

                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedTaskId(t.id);
                        setMobileView('logs');
                      }}
                      className={`p-3 sm:p-2.5 rounded-xl sm:rounded-lg border transition cursor-pointer group ${
                        isSelected
                          ? 'bg-[#1e1e24] border-[#38bdf8]/40 shadow-sm'
                          : 'bg-[#18181c] border-[#222227] hover:border-[#2f2f36] hover:bg-[#1b1b20]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5 sm:mb-1">
                        <div className="flex items-center gap-1.5">
                          {isRunning ? (
                            <span className="flex items-center gap-1 text-[10.5px] font-mono font-medium text-emerald-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              RUNNING
                            </span>
                          ) : t.status === 'FAILED' ? (
                            <span className="flex items-center gap-1 text-[10.5px] font-mono font-medium text-red-400">
                              <XCircle className="w-3 h-3" /> FAILED
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10.5px] font-mono text-[#7e7e85]">
                              <StopCircle className="w-3 h-3" /> STOPPED
                            </span>
                          )}
                        </div>

                        {t.timestamp && (
                          <span className="text-[10px] text-[#5e5e65] font-mono">
                            {formatRelativeTime(t.timestamp)}
                          </span>
                        )}
                      </div>

                      <div className="text-[12.5px] sm:text-[12px] font-mono text-[#dededf] break-words line-clamp-2 sm:truncate">
                        {t.cmd}
                      </div>

                      {/* Item Quick Controls */}
                      <div className="mt-2.5 sm:mt-2 pt-2 sm:pt-1.5 border-t border-[#26262c] flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-[#6e6e78]">
                            {t.id.slice(0, 10)}
                          </span>
                          <span className="sm:hidden text-[11px] text-[#38bdf8] flex items-center gap-0.5">
                            <span>Logs</span>
                            <ChevronRight className="w-3 h-3" />
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 sm:gap-1">
                          {isRunning && onStopTask ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onStopTask(t.id);
                              }}
                              className="p-1.5 sm:p-1 rounded text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                              title="Stop Task"
                            >
                              <StopCircle className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                            </button>
                          ) : onRestartTask ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRestartTask(t);
                              }}
                              className="p-1.5 sm:p-1 rounded text-emerald-400 hover:bg-emerald-500/10 transition cursor-pointer"
                              title="Restart Task"
                            >
                              <RotateCcw className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                            </button>
                          ) : null}

                          {onDeleteTask && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteTask(t.id);
                              }}
                              className="p-1.5 sm:p-1 rounded text-[#7e7e85] hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                              title="Delete Task"
                            >
                              <Trash2 className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Log Inspector */}
          <div
            className={`flex-1 flex flex-col bg-[#101012] overflow-hidden ${
              mobileView === 'list' ? 'hidden sm:flex' : 'flex'
            }`}
          >
            {selectedTask ? (
              <>
                {/* Log Inspector Header */}
                <div className="px-3.5 sm:px-4 py-2.5 border-b border-[#202024] bg-[#141418] flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2 truncate min-w-0 pr-2">
                    <Terminal className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />
                    <span className="text-[12px] font-mono text-[#dededf] truncate">
                      {selectedTask.cmd}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Copy logs */}
                    {taskLogs && (
                      <button
                        type="button"
                        onClick={handleCopyLogs}
                        className="p-1.5 sm:px-2 sm:py-1 rounded bg-[#202026] hover:bg-[#282830] text-[11.5px] text-[#9898a0] hover:text-[#dededf] border border-[#2b2b32] transition cursor-pointer flex items-center gap-1"
                        title="Copy logs"
                      >
                        {copiedLogs ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span className="hidden sm:inline">{copiedLogs ? 'Copied' : 'Copy'}</span>
                      </button>
                    )}

                    {onOpenTask && (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenTask(selectedTask);
                          onClose();
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#202026] hover:bg-[#282830] text-[11.5px] text-[#dededf] border border-[#2b2b32] transition cursor-pointer"
                        title="Open as Workspace Panel Tab"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span className="hidden sm:inline">Open in Workspace</span>
                      </button>
                    )}

                    {selectedTask.status === 'RUNNING' && onStopTask ? (
                      <button
                        type="button"
                        onClick={() => onStopTask(selectedTask.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 text-[11.5px] font-medium transition cursor-pointer"
                      >
                        <StopCircle className="w-3 h-3" />
                        <span>Stop</span>
                      </button>
                    ) : onRestartTask ? (
                      <button
                        type="button"
                        onClick={() => onRestartTask(selectedTask)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 text-[11.5px] font-medium transition cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Restart</span>
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Log Terminal Window */}
                <div
                  ref={logContainerRef}
                  className="flex-1 p-3.5 sm:p-4 overflow-y-auto font-mono text-[12px] text-[#cccccc] leading-relaxed whitespace-pre-wrap select-text bg-[#0d0d0f]"
                >
                  {isLoadingLogs && !taskLogs ? (
                    <div className="flex items-center gap-2 text-zinc-500 text-xs">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Loading task logs...
                    </div>
                  ) : taskLogs ? (
                    taskLogs
                  ) : (
                    <div className="text-zinc-600 italic">No output recorded for this task.</div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-[#5e5e65] text-[12px] p-6 text-center">
                <CalendarClock className="w-10 h-10 mb-2.5 opacity-20" />
                <p>Select a task to inspect logs or launch a new command</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
