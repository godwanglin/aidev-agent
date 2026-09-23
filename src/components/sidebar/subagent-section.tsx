'use client';

import React from 'react';
import { Users, Bot, Check, Clock } from 'lucide-react';
import type { SubagentRecord } from '@/lib/db';

interface SubagentSectionProps {
  subagents: SubagentRecord[];
}

export const SubagentSection: React.FC<SubagentSectionProps> = ({ subagents }) => {
  if (subagents.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-slate-500 select-none">
        <Users className="w-5 h-5 mx-auto mb-1.5 opacity-30" strokeWidth={1.5} />
        No background sub-agents
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1.5 overflow-y-auto max-h-full select-none">
      {subagents.map((sub) => (
        <div
          key={sub.id}
          className="p-2 rounded-md bg-[#161a24] border border-white/[0.05] text-xs space-y-1"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-medium text-slate-200">
              <Bot className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.5} />
              <span className="capitalize text-[12px]">{sub.role_name}</span>
            </div>
            {sub.status === 'COMPLETED' ? (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                <Check className="w-3 h-3" strokeWidth={2} /> Done
              </span>
            ) : sub.status === 'RUNNING' ? (
              <span className="flex items-center gap-1 text-[10px] text-blue-400 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" /> Running
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] text-slate-500 font-mono">
                <Clock className="w-3 h-3" strokeWidth={1.5} /> Pending
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 line-clamp-2">
            {sub.task_description}
          </p>
        </div>
      ))}
    </div>
  );
};
