'use client';

import React from 'react';
import { CheckSquare, Square, ListOrdered } from 'lucide-react';

export interface PlanItem {
  id: string;
  text: string;
  completed: boolean;
  inProgress?: boolean;
}

interface PlanSectionProps {
  planTitle?: string;
  planItems: PlanItem[];
  onToggleTask?: (id: string) => void;
}

export const PlanSection: React.FC<PlanSectionProps> = ({
  planTitle,
  planItems,
  onToggleTask,
}) => {
  if (planItems.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-slate-500">
        <ListOrdered className="w-5 h-5 mx-auto mb-1.5 opacity-30" strokeWidth={1.5} />
        No active plan
        <div className="mt-1.5 text-[11px] text-slate-400">
          Type <span className="text-slate-300 font-mono">/plan &lt;goal&gt;</span> to generate an implementation plan.
        </div>
      </div>
    );
  }

  const completedCount = planItems.filter((i) => i.completed).length;
  const progressPercent = Math.round((completedCount / planItems.length) * 100);

  return (
    <div className="p-2 space-y-2.5">
      {/* Plan Header */}
      <div className="p-2 rounded-md bg-[#161a24] border border-white/[0.05]">
        <div className="text-[12px] font-medium text-slate-200 mb-1.5 truncate">
          {planTitle || 'Active Plan'}
        </div>
        <div className="w-full bg-white/[0.08] h-1 rounded-full overflow-hidden">
          <div
            className="bg-indigo-500 h-full transition-all duration-200"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
          <span>{progressPercent}% completed</span>
          <span>{completedCount}/{planItems.length}</span>
        </div>
      </div>

      {/* Task Checklist */}
      <div className="space-y-1 overflow-y-auto max-h-[calc(100vh-200px)]">
        {planItems.map((task) => (
          <div
            key={task.id}
            onClick={() => onToggleTask?.(task.id)}
            className={`p-2 rounded-md flex items-start gap-2 text-xs border transition cursor-pointer ${
              task.completed
                ? 'bg-transparent border-transparent text-slate-500 line-through'
                : 'bg-[#161a24] border-white/[0.05] text-slate-300 hover:border-white/[0.1]'
            }`}
          >
            {task.completed ? (
              <CheckSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" strokeWidth={1.75} />
            ) : (
              <Square className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" strokeWidth={1.5} />
            )}
            <span className="leading-tight text-[12px]">{task.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
