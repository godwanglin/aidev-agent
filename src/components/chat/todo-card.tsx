'use client';

import React, { useState } from 'react';
import { CheckCircle2, Circle, Loader2, ListTodo, ChevronDown, ChevronUp } from 'lucide-react';

export interface TodoItemData {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface TodoCardProps {
  todos: TodoItemData[];
  title?: string;
}

export const TodoCard: React.FC<TodoCardProps> = ({ todos, title = 'Task Progress' }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!todos || todos.length === 0) return null;

  const total = todos.length;
  const completed = todos.filter((t) => t.status === 'completed').length;
  const inProgress = todos.filter((t) => t.status === 'in_progress').length;
  const percent = Math.round((completed / total) * 100);

  return (
    <div className="my-2.5 rounded-xl border border-white/[0.08] bg-[#141414] overflow-hidden text-xs shadow-md font-sans select-none transition-all">
      {/* Header Bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-3.5 py-2.5 bg-[#181818] hover:bg-[#1f1f1f] cursor-pointer transition border-b border-white/[0.04]"
      >
        <div className="flex items-center gap-2">
          <ListTodo className="w-3.5 h-3.5 text-[#58a6ff]" strokeWidth={2} />
          <span className="font-medium text-[#e4e4e7] text-[12px]">{title}</span>
          <span className="text-[11px] text-[#8c8c8c]">
            ({completed}/{total})
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Progress Pill */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.06] text-[10.5px]">
            <span
              className={`font-semibold ${
                completed === total ? 'text-emerald-400' : inProgress > 0 ? 'text-[#58a6ff]' : 'text-[#a1a1aa]'
              }`}
            >
              {percent}%
            </span>
          </div>

          <button type="button" className="text-[#8c8c8c] hover:text-white transition">
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Progress Bar Line */}
      <div className="w-full h-1 bg-[#222222]">
        <div
          className={`h-full transition-all duration-500 ease-out ${
            completed === total ? 'bg-emerald-500' : 'bg-gradient-to-r from-[#007acc] to-[#58a6ff]'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Checklist items */}
      {isExpanded && (
        <div className="p-3 space-y-2 bg-[#141414]">
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
                  ) : isInProgress ? (
                    <Loader2 className="w-3.5 h-3.5 text-[#58a6ff] animate-spin" strokeWidth={2.5} />
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
                  {isInProgress ? (
                    <span className="text-[#58a6ff] font-semibold">Active</span>
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
      )}
    </div>
  );
};
