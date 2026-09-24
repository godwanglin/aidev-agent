'use client';

import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, Circle, Loader2, ListTodo, ChevronRight } from 'lucide-react';

export interface TodoItemData {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface TodoCardProps {
  todos: TodoItemData[];
  title?: string;
  isStreaming?: boolean;
  defaultOpen?: boolean;
}

export const TodoCard: React.FC<TodoCardProps> = ({
  todos,
  title = 'Task List',
  isStreaming = false,
  defaultOpen,
}) => {
  if (!todos || todos.length === 0) return null;

  const total = todos.length;
  const completed = todos.filter((t) => t.status === 'completed').length;
  const inProgress = todos.filter((t) => t.status === 'in_progress').length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isAllDone = total > 0 && completed === total;

  // Determine initial state:
  // If explicitly specified, use defaultOpen.
  // Otherwise, stay open if streaming or in progress; collapse when all done.
  const [isExpanded, setIsExpanded] = useState(() => {
    if (defaultOpen !== undefined) return defaultOpen;
    return isStreaming || !isAllDone;
  });

  const userToggledRef = useRef(false);
  const prevStreamingRef = useRef(isStreaming);

  // Auto-collapse when streaming finishes and all items are completed (unless user explicitly toggled)
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && isAllDone && !userToggledRef.current) {
      setIsExpanded(false);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, isAllDone]);

  const handleToggle = () => {
    userToggledRef.current = true;
    setIsExpanded((prev) => !prev);
  };

  return (
    <div className="my-1.5 rounded-xl border border-white/[0.08] bg-[#141414] overflow-hidden text-xs shadow-md font-sans select-none transition-all">
      {/* Accordion Toggle Header Bar */}
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-3.5 py-2 bg-[#171717] hover:bg-[#1f1f1f] cursor-pointer transition select-none text-left group"
        title={isExpanded ? 'Sembunyikan Task List' : 'Tampilkan Task List'}
      >
        <div className="flex items-center gap-2">
          <ChevronRight
            className={`w-3.5 h-3.5 text-[#8c8c8c] group-hover:text-white transition-transform duration-200 shrink-0 ${
              isExpanded ? 'rotate-90 text-white' : ''
            }`}
          />
          <ListTodo className="w-3.5 h-3.5 text-[#58a6ff]" strokeWidth={2} />
          <span className="font-medium text-[#e4e4e7] text-[12px]">{title}</span>
          <span className="text-[11px] text-[#8c8c8c]">
            ({completed}/{total})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Progress Pill */}
          <div
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-semibold border ${
              isAllDone
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : inProgress > 0 && isStreaming
                ? 'bg-[#58a6ff]/10 text-[#58a6ff] border-[#58a6ff]/20'
                : 'bg-white/[0.05] text-[#a1a1aa] border-white/[0.06]'
            }`}
          >
            <span>{percent}%</span>
            {isAllDone ? (
              <span className="text-[10px] font-normal uppercase tracking-wider">Done</span>
            ) : inProgress > 0 && isStreaming ? (
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
            ) : null}
          </div>
        </div>
      </button>

      {/* Accordion Body with Smooth Grid Transition */}
      <div className={`accordion-grid ${isExpanded ? 'open' : ''}`}>
        <div className="accordion-inner">
          {/* Progress Bar Line */}
          <div className="w-full h-1 bg-[#222222]">
            <div
              className={`h-full transition-all duration-500 ease-out ${
                isAllDone ? 'bg-emerald-500' : 'bg-gradient-to-r from-[#007acc] to-[#58a6ff]'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>

          {/* Checklist items */}
          <div className="p-3 space-y-2 bg-[#141414] border-t border-white/[0.04]">
            {todos.map((item, index) => {
              const isCompleted = item.status === 'completed';
              const isInProgress = item.status === 'in_progress';

              return (
                <div
                  key={item.id || index}
                  className={`flex items-start gap-2.5 p-1.5 rounded-lg transition ${
                    isInProgress
                      ? 'bg-[#58a6ff]/[0.08] border border-[#58a6ff]/20 text-[#f0f0f0]'
                      : isCompleted
                      ? 'text-[#8c8c8c]'
                      : 'text-[#d4d4d8] hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {isCompleted ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2.2} />
                    ) : isInProgress && isStreaming ? (
                      <Loader2 className="w-3.5 h-3.5 text-[#58a6ff] animate-spin" strokeWidth={2.5} />
                    ) : isInProgress ? (
                      <Circle className="w-3.5 h-3.5 text-amber-400" strokeWidth={2.2} />
                    ) : (
                      <Circle className="w-3.5 h-3.5 text-[#52525b]" strokeWidth={2} />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <span
                      className={`text-[12px] leading-snug break-words ${
                        isCompleted ? 'line-through opacity-75' : isInProgress ? 'font-medium text-white' : ''
                      }`}
                    >
                      {item.title}
                    </span>
                  </div>

                  <div className="shrink-0 text-[10px] font-mono uppercase tracking-wider text-[#71717a]">
                    {isInProgress && isStreaming ? (
                      <span className="text-[#58a6ff] font-semibold">Active</span>
                    ) : isInProgress ? (
                      <span className="text-amber-400 font-semibold">Paused</span>
                    ) : isCompleted ? (
                      <span className="text-emerald-500">Done</span>
                    ) : (
                      <span>Pending</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
