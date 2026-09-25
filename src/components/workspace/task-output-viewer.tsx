'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Menu, Loader2, StopCircle, CheckCircle2, XCircle, Play, Trash2, X } from 'lucide-react';
import type { OverviewTaskItem } from './overview-view';

interface TaskOutputViewerProps {
  taskId: string;
  cmd: string;
  tasks?: OverviewTaskItem[];
  onSelectTask?: (task: OverviewTaskItem) => void;
  onOpenBrowser?: (url: string) => void;
  onStop?: (taskId: string) => void;
  onRestartTask?: (task: OverviewTaskItem) => void;
  onDeleteTask?: (taskId: string) => void;
  onClearTasks?: () => void;
  onStopAllTasks?: () => void;
  onOpenOverview?: () => void;
}

const ANSI_FOREGROUND_MAP: Record<number, string> = {
  30: '#484f58', // black
  31: '#ff7b72', // red
  32: '#3fb950', // green
  33: '#d29922', // yellow
  34: '#58a6ff', // blue
  35: '#bc8cff', // magenta
  36: '#39c5cf', // cyan
  37: '#e6edf3', // white
  90: '#8b949e', // bright black / gray
  91: '#ffa198', // bright red
  92: '#56d364', // bright green
  93: '#e3b341', // bright yellow
  94: '#79c0ff', // bright blue
  95: '#d2a8ff', // bright magenta
  96: '#56e3ed', // bright cyan
  97: '#ffffff', // bright white
};

interface AnsiSpan {
  text: string;
  color?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

function parseAnsiLine(raw: string): AnsiSpan[] {
  // Strip non-SGR escape sequences (e.g. cursor moves, clear screen, OSC title)
  const clean = raw
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;]*[a-zA-K]/g, '')
    .replace(/\r/g, '');

  const regex = /\x1b\[([0-9;]*)m/g;
  const spans: AnsiSpan[] = [];

  let currentColor: string | undefined = undefined;
  let bold = false;
  let dim = false;
  let italic = false;
  let underline = false;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(clean)) !== null) {
    if (match.index > lastIndex) {
      const text = clean.slice(lastIndex, match.index);
      if (text) {
        spans.push({ text, color: currentColor, bold, dim, italic, underline });
      }
    }

    const codeStr = match[1] || '0';
    const codes = codeStr.split(';').map((c) => parseInt(c, 10) || 0);

    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === 0) {
        currentColor = undefined;
        bold = false;
        dim = false;
        italic = false;
        underline = false;
      } else if (c === 1) {
        bold = true;
        dim = false;
      } else if (c === 2) {
        dim = true;
        bold = false;
      } else if (c === 3) {
        italic = true;
      } else if (c === 4) {
        underline = true;
      } else if (c === 22) {
        bold = false;
        dim = false;
      } else if (c === 23) {
        italic = false;
      } else if (c === 24) {
        underline = false;
      } else if (c === 39) {
        currentColor = undefined;
      } else if (ANSI_FOREGROUND_MAP[c]) {
        currentColor = ANSI_FOREGROUND_MAP[c];
      } else if (c === 38 && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
        i += 2;
      } else if (c === 38 && codes[i + 1] === 2 && codes[i + 4] !== undefined) {
        const r = codes[i + 2];
        const g = codes[i + 3];
        const b = codes[i + 4];
        currentColor = `rgb(${r},${g},${b})`;
        i += 4;
      }
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < clean.length) {
    const text = clean.slice(lastIndex);
    if (text) {
      spans.push({ text, color: currentColor, bold, dim, italic, underline });
    }
  }

  return spans.length > 0 ? spans : [{ text: '' }];
}

// Component to render parsed ANSI spans and make URLs clickable
const AnsiLineContent: React.FC<{ text: string; onOpenBrowser?: (url: string) => void }> = ({ text, onOpenBrowser }) => {
  const spans = parseAnsiLine(text);

  return (
    <>
      {spans.map((s, idx) => {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const parts = s.text.split(urlRegex);

        return (
          <span
            key={idx}
            style={{
              color: s.color,
              fontWeight: s.bold ? 600 : undefined,
              opacity: s.dim ? 0.65 : undefined,
              textDecoration: s.underline ? 'underline' : undefined,
              fontStyle: s.italic ? 'italic' : undefined,
            }}
          >
            {parts.map((part, pIdx) => {
              if (part.match(/^https?:\/\//)) {
                return (
                  <a
                    key={pIdx}
                    href={part}
                    onClick={(e) => {
                      if (onOpenBrowser) {
                        e.preventDefault();
                        onOpenBrowser(part);
                      }
                    }}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:brightness-125 cursor-pointer font-medium"
                    style={{ color: s.color || '#58a6ff' }}
                    title="Click to open Live Preview in workspace panel"
                  >
                    {part}
                  </a>
                );
              }
              return part;
            })}
          </span>
        );
      })}
    </>
  );
};

export const TaskOutputViewer: React.FC<TaskOutputViewerProps> = ({
  taskId,
  cmd,
  tasks,
  onSelectTask,
  onOpenBrowser,
  onStop,
  onRestartTask,
  onDeleteTask,
  onClearTasks,
  onStopAllTasks,
  onOpenOverview,
}) => {
  const [content, setContent] = useState<string>('');
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Poll real-time log output
  useEffect(() => {
    let isMounted = true;

    const fetchLogs = async () => {
      try {
        const res = await fetch(
          `/api/tasks/logs?id=${encodeURIComponent(taskId)}&cmd=${encodeURIComponent(cmd)}`
        );
        const data = await res.json();
        if (isMounted && data.content !== undefined) {
          setContent(data.content);
          setIsRunning(data.isRunning ?? true);
        }
      } catch (err) {
        console.error('Failed to fetch task logs:', err);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 1500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [taskId, cmd]);

  // Fallback internal tasks state if tasks prop not provided
  const [internalTasks, setInternalTasks] = useState<OverviewTaskItem[]>([]);

  useEffect(() => {
    if (tasks && tasks.length > 0) return;
    fetch('/api/tasks')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.tasks)) {
          setInternalTasks(
            data.tasks.map((t: any) => ({
              id: t.id,
              cmd: t.command,
              status: t.status,
              timestamp: t.created_at,
            }))
          );
        }
      })
      .catch(() => {});
  }, [tasks]);

  const effectiveTasks = tasks && tasks.length > 0 ? tasks : internalTasks;

  const uniqueTasks = useMemo(() => {
    const map = new Map<string, OverviewTaskItem>();
    for (const t of effectiveTasks) {
      const key = t.cmd.trim();
      if (t.status === 'RUNNING') {
        map.set(key, t);
      }
    }
    for (const t of effectiveTasks) {
      const key = t.cmd.trim();
      if (!map.has(key)) {
        map.set(key, t);
      }
    }
    return Array.from(map.values());
  }, [effectiveTasks]);

  const runningTasksCount = uniqueTasks.filter((t) => t.status === 'RUNNING').length;

  // Split content into lines
  const lines = content.split('\n');

  return (
    <div className="flex-1 flex flex-col h-full bg-[#101010] text-[#cccccc] font-sans select-text overflow-hidden">
      {/* 1. Subheader Bar matching media_1789814634563.png */}
      <div className="h-9 border-b border-[#191919] bg-[#151515] px-4 flex items-center justify-between shrink-0 select-none">
        <span className="text-[13px] font-normal text-[#cccccc]">
          Background Task Output
        </span>

        <div className="flex items-center gap-2">
          {isRunning ? (
            <div className="flex items-center gap-1.5 text-[11px] text-[#007acc] font-sans font-medium">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Running</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] text-[#8c8c8c] font-sans">
              <CheckCircle2 className="w-3 h-3 text-[#7ee787]" />
              <span>Inactive</span>
            </div>
          )}

          {onStop && isRunning && (
            <button
              type="button"
              onClick={() => onStop(taskId)}
              className="px-2 py-0.5 rounded text-[11px] bg-[#222222] hover:bg-[#2e1d1d] text-[#8c8c8c] hover:text-[#de5555] transition flex items-center gap-1 cursor-pointer"
              title="Stop background task"
            >
              <StopCircle className="w-3 h-3" />
              <span>Stop</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            className={`p-1.5 rounded transition cursor-pointer flex items-center justify-center ${
              isSidebarOpen
                ? 'bg-[#25252a] text-white shadow-inner'
                : 'text-[#8c8c8c] hover:text-[#cccccc] hover:bg-[#1a1a1d]'
            }`}
            title={isSidebarOpen ? 'Hide background tasks sidebar' : 'Show background tasks sidebar'}
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Main Body: Log Canvas + Optional Background Tasks Sidebar */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: Log Viewer */}
        <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
          {/* Command Line Header matching media_1789814634563.png */}
          <div className="px-4 pt-3 pb-2 select-text font-mono text-[13px] font-semibold text-white shrink-0">
            {cmd}
          </div>

          {/* Realtime Log Canvas with Line Numbers */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-auto px-4 pb-6 font-mono text-[13px] font-normal leading-[22px] select-text antialiased"
          >
            <div className="min-w-fit">
              {lines.map((line, idx) => {
                const lineNum = idx + 1;
                return (
                  <div key={lineNum} className="flex items-start hover:bg-[#151515]/60 -mx-2 px-2 py-0.5 rounded leading-[22px]">
                    {/* Line Number Gutter */}
                    <span className="w-9 shrink-0 text-right pr-3 select-none text-[#555555] text-[11.5px] leading-[22px]">
                      {lineNum}
                    </span>

                    {/* Log Line Content with ANSI Color Parsing & Clickable URLs */}
                    <span className="flex-1 whitespace-pre-wrap break-all text-[#eceff4] leading-[22px]">
                      <AnsiLineContent text={line} onOpenBrowser={onOpenBrowser} />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Background Tasks Sidebar (Smooth Animated Open & Close) */}
        <aside
          style={{
            width: isSidebarOpen ? 260 : 0,
            transition: 'width 260ms cubic-bezier(0.2, 0, 0, 1)',
          }}
          className={`border-l border-[#191919] bg-[#141416] flex flex-col h-full shrink-0 select-none overflow-hidden ${
            !isSidebarOpen ? 'pointer-events-none' : ''
          }`}
        >
          <div
            style={{
              width: 260,
              minWidth: 260,
              transform: !isSidebarOpen ? 'translateX(16px)' : 'translateX(0)',
              opacity: !isSidebarOpen ? 0 : 1,
              transition: 'transform 260ms cubic-bezier(0.2, 0, 0, 1), opacity 200ms ease-out',
            }}
            className="flex-1 flex flex-col h-full will-change-transform overflow-hidden"
          >
            {/* Sidebar Subheader */}
            <div className="h-8 px-3 border-b border-[#1c1c1f] flex items-center justify-between bg-[#161619] shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-semibold text-[#e0e0e0]">Background Tasks</span>
                <span className="text-[10.5px] font-sans font-medium px-1.5 py-0.2 rounded-full bg-[#202024] text-[#8c8c8c]">
                  {uniqueTasks.length}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {runningTasksCount > 0 && onStopAllTasks && (
                  <button
                    type="button"
                    onClick={onStopAllTasks}
                    className="px-1.5 py-0.5 rounded text-[10px] bg-[#2e1d1d] hover:bg-[#3d2020] text-[#de5555] transition flex items-center gap-1 cursor-pointer font-sans"
                    title="Stop all running tasks"
                  >
                    <StopCircle className="w-2.5 h-2.5" />
                    <span>Stop All</span>
                  </button>
                )}
                {runningTasksCount === 0 && uniqueTasks.length > 0 && onClearTasks && (
                  <button
                    type="button"
                    onClick={onClearTasks}
                    className="p-1 rounded hover:bg-[#222226] text-[#777777] hover:text-[#cccccc] transition cursor-pointer"
                    title="Clear stopped tasks"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-1 rounded hover:bg-[#222226] text-[#777777] hover:text-white transition cursor-pointer ml-1"
                  title="Close sidebar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Task Items List */}
            <div className="flex-1 overflow-y-auto p-1.5 space-y-1 font-sans text-[11.5px]">
              {uniqueTasks.length > 0 ? (
                uniqueTasks.map((t) => {
                  const isCurrent = t.id === taskId || t.cmd.trim() === cmd.trim();
                  return (
                    <div
                      key={t.id}
                      onClick={() => onSelectTask?.(t)}
                      className={`group flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg transition cursor-pointer ${
                        isCurrent
                          ? 'bg-[#1e1e24] text-white border border-[#2c2c36]'
                          : 'text-[#a0a0a0] hover:text-white hover:bg-[#1a1a1d]'
                      }`}
                      title={t.cmd}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {t.status === 'RUNNING' ? (
                          <Loader2 className="w-3 h-3 text-[#007acc] animate-spin shrink-0" />
                        ) : (
                          <XCircle className="w-3 h-3 text-[#666666] shrink-0" />
                        )}
                        <span className={`truncate text-xs ${isCurrent ? 'font-medium text-white' : ''}`}>
                          {t.cmd}
                        </span>
                      </div>

                      {/* Hover Buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        {t.status === 'RUNNING' ? (
                          onStop && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onStop(t.id);
                              }}
                              className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded bg-[#2e1d1d] hover:bg-[#3d2020] text-[#de5555] transition cursor-pointer"
                              title="Stop task"
                            >
                              <StopCircle className="w-3 h-3" />
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
                              title="Start task"
                            >
                              <Play className="w-2.5 h-2.5 fill-current" />
                            </button>
                          )
                        )}

                        {onDeleteTask && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteTask(t.id);
                            }}
                            className="hidden group-hover:flex items-center justify-center w-5 h-5 rounded hover:bg-[#262626] text-[#666666] hover:text-[#de5555] transition cursor-pointer"
                            title="Remove task"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-2 py-4 text-center text-xs text-[#666666] italic">
                  No background tasks
                </div>
              )}
            </div>

            {/* Sidebar Footer */}
            {onOpenOverview && (
              <div className="p-2 border-t border-[#1c1c1f] bg-[#161619] shrink-0">
                <button
                  type="button"
                  onClick={onOpenOverview}
                  className="w-full py-1.5 px-2 rounded-md bg-[#1f1f23] hover:bg-[#27272c] text-[11px] text-[#cccccc] hover:text-white transition flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                >
                  <span>View Full Overview</span>
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
